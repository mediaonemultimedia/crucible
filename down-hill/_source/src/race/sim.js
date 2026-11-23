/* The race: eight karts on a track, items, hazards, laps and places, one
   fixed 60 Hz tick at a time. Deterministic from its seed and the inputs
   (one seeded PRNG, no clock), so ?seed=N races replay and the tests can
   run whole races in node. It never reads the renderer: it emits events
   (race.events) that the renderer and the audio turn into feathers, sparks,
   grunts and bubbles.

   Handling is arcade: the kart goes where its nose points (grip bleeds the
   sideways slip away), a drift is a locked slide whose angle the renderer
   draws, charged by holding it (and faster by small counter-steer wiggles)
   through three spark tiers — white feathers, gold, mint — and released
   into a boost.                                                          */

import { buildTrack, locate, lateral, along, groundAt, rightX, rightZ, TRACKS, podPos, sprinklerOn } from './track.js';
import { RACERS, stats } from './roster.js';
import { makeRng } from '../sim/rng.js';

export const DT = 1 / 60;
export const GRAV = 46;
export const COUNT_TICKS = 220;       // 3, 2, 1, GO
export const ITEMS = ['slick', 'missile', 'espresso', 'cuffs', 'case', 'alarm', 'sugar', 'plane', 'wash', 'spring'];
export const ITEM_NAMES = {
  slick: 'Feather Slick', missile: 'Pillow Missile', espresso: 'Espresso Shot', cuffs: 'Fuzzy Handcuffs', case: 'Pillowcase', alarm: 'Alarm Clock',
  sugar: 'Sugar Rush', plane: 'Paper Plane', wash: 'Hot Wash', spring: 'Spring Cushion',
};
/* the 3-to-5-word tip the HUD shows with the name when you get one */
export const ITEM_TIPS = {
  slick: 'drop it, they spin', missile: 'throw it, bonk someone', espresso: 'big boost, shaky hands', cuffs: 'chains the two ahead',
  case: 'blinds whoever is ahead', alarm: "wakes up whoever's in 1st", sugar: 'unstoppable candy speed', plane: "homes in on whoever's ahead",
  wash: 'shrinks everyone else', spring: 'lock on, launch them out',
};
export const TIER_AT = [0, 1.0, 2.0, 3.0];          // drift charge (s) for each spark tier
export const TIER_BOOST = [0, 0.7, 1.15, 1.65];     // the boost each tier gives on release (s)
export const BOOST_TOP = 1.62;                      // a boost's peak, × the kart's top speed
export const ROULETTE = 84;                          // ticks the item slot spins
export const BOX_RESPAWN = 24;                       // ticks a grabbed box is gone (0.4 s: the pack behind still gets one)
export const BOX_LANES = [-0.72, -0.36, 0, 0.36, 0.72];   // a row's boxes across the road (× half-width)
export const SUGAR_T = 6, WASH_T = 5, EJECT_T = 1.5, LOCK_RANGE = 60;
const ODDS = [
  // slick missile espresso cuffs case alarm sugar plane wash spring, by place 1…8
  // (the leader gets mostly defensive ones; the strong ones go to the back)
  [50, 34, 9, 0, 7, 0, 0, 0, 0, 0],
  [26, 26, 12, 0, 12, 0, 0, 14, 0, 10],
  [14, 20, 14, 10, 12, 1, 0, 15, 3, 11],
  [9, 15, 16, 12, 11, 3, 0, 14, 7, 13],
  [6, 11, 16, 12, 10, 5, 5, 12, 10, 13],
  [4, 8, 16, 11, 9, 8, 9, 10, 12, 13],
  [3, 6, 15, 10, 8, 11, 13, 8, 13, 13],
  [2, 4, 14, 9, 7, 13, 17, 7, 14, 13],
];

export const KART_R = 1.55;           // kart radius for bumps

/* the inputs a kart reads each tick (keyboard, pad or CPU) */
export const noInput = () => ({ steer: 0, gas: false, brake: false, drift: false, item: false, taunt: false, back: false });

export class Race {
  constructor({ track = 'landing', racers, seed = 1, laps = null, humans = [0] } = {}) {
    this.T = buildTrack(TRACKS[track] || TRACKS.landing);
    const T = this.T;
    this.laps = laps || T.def.laps;
    this.rng = makeRng(seed >>> 0 || 1);
    this.tick = 0;
    this.phase = 'count';
    this.events = [];
    this.humans = humans;
    this.startK = this._nearest(T.def.start || [-10, 16, -14]);
    this.karts = racers.map((r, i) => this._kart(r, i));
    this.order = this.karts.map((_, i) => i);
    this.boxes = [];
    for (const f of T.def.boxes) {
      const k = (this.startK + Math.round(f * T.N)) % T.N;
      for (const u of BOX_LANES) {
        const d = u * T.w[k];
        this.boxes.push({ k, x: T.x[k] + rightX(T, k) * d, y: T.y[k] + 2.2, z: T.z[k] + rightZ(T, k) * d, dead: 0 });
      }
    }
    this.shots = [];        // flying things: missiles, pillowcases, handcuffs, alarm clocks
    this.hazards = [];      // feather slicks on the ground
    this.finished = 0;
    this.finishOrder = [];
    // the track's own moving things: detergent pods, sock piles, sprinklers
    this.pods = T.pods.map((P) => ({ ...P, ...podPos(T, P, 0) }));
    this.piles = (T.def.piles || []).map((P) => ({ ...P, kicked: 0 }));
    this.sprinklers = (T.def.sprinklers || []).map((S) => ({ ...S, on: false }));
    this._place();
  }

  _nearest([x, y, z]) {
    const T = this.T;
    let best = 0, bd = 1e18;
    for (let k = 0; k < T.N; k++) { const d = (T.x[k] - x) ** 2 + (T.z[k] - z) ** 2 + (T.y[k] - y) ** 2 * 4; if (d < bd) { bd = d; best = k; } }
    return best;
  }

  _kart(r, i) {
    const T = this.T, N = T.N;
    // the grid: two columns, staggered rows, behind the line (the player at the back of the pack, as is tradition)
    const row = Math.floor(i / 2), col = i % 2;
    const k = (this.startK - 5 - row * 6 - col * 3 + N) % N;
    const d = (col ? 1 : -1) * 4.2;
    const S = stats(r.id);
    return {
      i, id: r.id, alt: !!r.alt, cpu: r.cpu || null, S,
      x: T.x[k] + rightX(T, k) * d, y: T.y[k], z: T.z[k] + rightZ(T, k) * d,
      yaw: Math.atan2(T.tx[k], T.tz[k]), vx: 0, vz: 0, vy: 0, fwd: 0, slopeVy: 0,
      k, d, kc: -(this.startK - k + N) % N, lap: 0, place: i + 1, fin: 0, finT: 0,
      air: 0, airT: 0, trick: 0, trickT: 0, land: 0,
      drift: 0, charge: 0, tier: 0, wig: 0, lastSteer: 0, hop: 0, driftT: 0,
      boostT: 0, padT: 0, spinT: 0, spinDir: 1, invT: 0,
      jitterT: 0, caseT: 0, wobT: 0, cuff: -1, cuffT: 0,
      sugarT: 0, shrinkT: 0, flatT: 0, flatCd: 0, ejectT: 0, lock: -1, held: 0, ramp: 0,
      item: null, roulette: 0, tauntT: 0, bounceT: 0,
      fish: null, lastGood: k, stuckT: 0, wallT: 0, offT: 0, surf: 'track',
      steer: 0, inp: noInput(), prevInp: noInput(),
    };
  }

  emit(e) { this.events.push(e); }

  /* one tick: inputs[i] for every kart (CPUs fill their own before this) */
  step(inputs) {
    this.tick++;
    if (this.phase === 'count') {
      const left = COUNT_TICKS - this.tick;
      if (left % 60 === 0 && left > 0) this.emit({ k: 'count', n: left / 60 });
      if (left <= 0) { this.phase = 'race'; this.emit({ k: 'go' }); this.goTick = this.tick; }
      // revving on the grid: the drift and gas held at GO give a little jump start
      for (const K of this.karts) { const I = inputs[K.i] || noInput(); K.rev = I.gas ? Math.min(1, (K.rev || 0) + DT * 1.2) : 0; K.inp = I; }
      if (this.phase !== 'race') return;
      for (const K of this.karts) if (K.rev > 0.35 && K.rev < 0.95) { K.boostT = 0.8; this.emit({ k: 'boost', i: K.i, tier: 0, start: 1 }); }
    }
    if (this.phase === 'done') { for (const K of this.karts) this._kartTick(K, inputs[K.i] || noInput()); this._bumps(); this._settleContacts(); return; }
    for (const B of this.boxes) if (B.dead > 0) B.dead--;
    this._world();
    for (const K of this.karts) this._kartTick(K, inputs[K.i] || noInput());
    this._bumps();
    this._cuffs();
    this._settleContacts();
    this._shots();
    this._hazards();
    this._place();
    // the race ends when every human is home and either everyone is or the stragglers have had 12 s
    const humansIn = this.humans.every((h) => this.karts[h]?.fin);
    if (this.finished === this.karts.length || (humansIn && this.humans.length && this.lastHumanTick && this.tick - this.lastHumanTick > 60 * 12)) this._end();
  }

  _end() {
    // the stragglers take the places in their running order
    for (const i of this.order) { const K = this.karts[i]; if (!K.fin) { K.fin = 1; K.finT = this.tick; this.finishOrder.push(i); K.place = this.finishOrder.length; } }
    this.phase = 'done';
    this.emit({ k: 'done' });
  }

  _kartTick(K, I) {
    const T = this.T, N = T.N, S = K.S;
    K.prevInp = K.inp; K.inp = I;
    const pressed = (b) => I[b] && !K.prevInp[b];
    for (const t of ['boostT', 'padT', 'spinT', 'invT', 'jitterT', 'caseT', 'wobT', 'cuffT', 'tauntT', 'trickT', 'bounceT', 'land', 'sugarT', 'shrinkT', 'flatT', 'flatCd']) if (K[t] > 0) K[t] = Math.max(0, K[t] - DT);
    if (K.ejectT > 0) { K.ejectT = Math.max(0, K.ejectT - DT); if (!K.ejectT) { K.invT = Math.max(K.invT, 0.8); this.emit({ k: 'ejectLand', i: K.i }); } }
    if (K.cuffT <= 0 && K.cuff >= 0) K.cuff = -1;

    // fished back up by the sock on a string
    if (K.fish) {
      const F = K.fish;
      F.t += DT;
      if (F.t >= F.dur) {
        const k = F.k;
        K.x = T.x[k]; K.z = T.z[k]; K.y = T.y[k] + 0.2; K.k = k; K.d = 0;
        K.yaw = Math.atan2(T.tx[k], T.tz[k]); K.vx = K.vz = K.vy = K.fwd = 0;
        K.air = 0; K.fish = null; K.invT = 1.2; K.drift = 0; K.charge = 0; K.tier = 0;
        this.emit({ k: 'fished', i: K.i });
      }
      return;
    }

    if (K.item && K.roulette > 0) { K.roulette--; if (!K.roulette) this.emit({ k: 'gotItem', i: K.i, item: K.item }); }

    const live = this.phase === 'race' || this.phase === 'done';
    let steer = Math.max(-1, Math.min(1, I.steer || 0));
    // a pillowcase over the head, an alarm's wobble, the espresso jitters
    if (K.caseT > 0) steer = Math.max(-1, Math.min(1, steer * 0.7 + Math.sin(this.tick * 0.16 + K.i) * 0.75));
    if (K.wobT > 0) steer = Math.max(-1, Math.min(1, steer + Math.sin(this.tick * 0.23 + K.i * 2) * 0.5));
    if (K.jitterT > 0) steer = Math.max(-1, Math.min(1, steer + ((this.rng.int(1000) / 1000) - 0.5) * 0.55));
    if (K.spinT > 0 || K.ejectT > 0) steer = 0;
    K.steer = steer;
    const gas = live && I.gas && K.spinT <= 0 && K.ejectT <= 0, brake = live && I.brake && K.spinT <= 0 && K.ejectT <= 0;

    // forward and sideways parts of the velocity
    const fx = Math.sin(K.yaw), fz = Math.cos(K.yaw), rx = -fz, rz = fx;
    let fwd = K.vx * fx + K.vz * fz, lat = K.vx * rx + K.vz * rz;

    // the surface: fluff beyond the guide lines, cereal and fluff patches on the line
    let surf = 'track';
    if (!K.air) {
      if (Math.abs(K.d) > T.w[K.k] + 0.6) surf = 'fluff';
      for (const P of T.def.patches) if ((K.x - P.x) ** 2 + (K.z - P.z) ** 2 < P.r * P.r) surf = P.kind;
    }
    if (K.cut || K.sugarT > 0) surf = 'track';      // a sugar rush ignores the fluff
    if (surf === 'pool' && K.surf !== 'pool' && !K.air) this.emit({ k: 'splash', i: K.i, x: K.x, y: K.y, z: K.z, big: Math.abs(K.fwd) > 14 });
    K.surf = surf;
    let top = S.top * (K.topMul || 1);
    if (surf === 'fluff' || surf === 'mulch') top *= 0.58;
    else if (surf === 'cereal') top *= 0.64;
    else if (surf === 'pool') top *= 0.66;
    if (K.cuff >= 0) top *= 0.86;
    if (K.caseT > 0) top *= 0.9;
    if (K.shrinkT > 0) top *= 0.84;                  // shrunk in the wash: little wheels
    if (K.flatT > 0) top *= 0.45;                    // squashed flat
    let accel = S.accel;
    if (K.sugarT > 0) { top = Math.max(top, S.top * 1.2); accel = Math.max(accel, 24); }
    if (K.boostT > 0) { top = Math.max(top, S.top * BOOST_TOP); accel = 54; }
    if (K.spinT > 0 || K.ejectT > 0) { top = 0; }

    if (!K.air) {
      if (gas) {
        if (fwd < top) fwd += accel * DT * (fwd < top * 0.5 ? 1.25 : 1 - 0.6 * (fwd / top) ** 2);
        else fwd = Math.max(top, fwd - (K.spinT > 0 || K.ejectT > 0 ? 30 : 17) * DT);   // a boost's tail bleeds off gently
      } else if (brake) {
        fwd -= (fwd > 0 ? 34 : 14) * DT;
        if (fwd < -9) fwd = -9;
      } else {
        fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 7 * DT);
      }
      if (fwd > top && !gas) fwd = Math.max(top, fwd - 30 * DT);
      if (K.spinT > 0) fwd *= 0.95;
      if (K.ejectT > 0) fwd *= 0.965;              // nobody at the wheel: it rolls to a stop
    }

    // steering: a touch tighter at low speed, a touch looser flat out
    const sp = Math.abs(fwd);
    let rate = 2.25 * Math.min(1, sp / 7) * (1 - 0.22 * Math.min(1, sp / S.top)) * S.grip;
    if (fwd < -0.5) rate = -rate * 0.8;
    let yawRate = -steer * rate;

    // ── the drift ──
    const driftHeld = live && I.drift && K.spinT <= 0;
    if (!K.drift && driftHeld && (pressed('drift') || K.driftArm) && Math.abs(steer) > 0.25 && fwd > 11 && !K.air) {
      K.drift = Math.sign(steer); K.charge = 0; K.tier = 0; K.hop = 0.18; K.driftT = 0; K.lastSteer = steer; K.wig = 0;
      this.emit({ k: 'drift', i: K.i });
    }
    // (holding DRIFT before the turn arms it: the slide starts as you steer)
    K.driftArm = driftHeld && !K.drift;
    if (K.drift) {
      const into = steer * K.drift;            // +1 into the slide, −1 counter-steering out of it
      yawRate = -K.drift * (1.55 + 0.85 * into) * S.grip * Math.min(1, sp / 12);
      K.driftT += DT;
      // a counter-steer wiggle: the stick crossing back the other way and back again
      const sgn = Math.sign(steer - K.drift * 0.2);
      if (sgn !== Math.sign(K.lastSteer - K.drift * 0.2) && Math.abs(steer - K.lastSteer) > 0.6) { K.wig = 0.22; }
      K.lastSteer = steer;
      let gain = DT * (0.85 + 0.35 * Math.max(0, into));
      if (K.wig > 0) { gain += DT * 1.6; K.wig -= DT; }
      if (!K.air) K.charge += gain;
      const tier = K.charge >= TIER_AT[3] ? 3 : K.charge >= TIER_AT[2] ? 2 : K.charge >= TIER_AT[1] ? 1 : 0;
      if (tier !== K.tier) { K.tier = tier; this.emit({ k: 'tier', i: K.i, tier }); }
      lat += K.drift * 5.5 * DT * Math.min(1, sp / 20);    // the slide's outward drift
      if (!driftHeld || sp < 8 || K.spinT > 0) {
        if (K.tier > 0 && K.spinT <= 0) { K.boostT = Math.max(K.boostT, TIER_BOOST[K.tier]); this.emit({ k: 'boost', i: K.i, tier: K.tier }); if (K.id === 'johnny') this.emit({ k: 'balls', i: K.i }); }
        K.drift = 0; K.charge = 0; K.tier = 0;
      }
    }
    if (K.spinT > 0) yawRate = K.spinDir * 11 * Math.min(1, K.spinT * 1.4);
    if (K.air) yawRate *= 0.55;
    K.yaw += yawRate * DT;
    if (K.hop > 0) K.hop = Math.max(0, K.hop - DT);

    // grip: the sideways slip bleeds away (less in a drift, less in the air, less on fluff)
    const grip = K.air ? 1.5 : K.drift ? 4.5 : surf === 'suds' ? 3.2 : surf === 'fluff' || surf === 'mulch' || surf === 'pool' ? 7 : 13;
    lat *= Math.exp(-grip * DT);
    const nfx = Math.sin(K.yaw), nfz = Math.cos(K.yaw), nrx = -nfz, nrz = nfx;
    K.vx = nfx * fwd + nrx * lat; K.vz = nfz * fwd + nrz * lat;
    K.fwd = fwd;

    // ── move ──
    const y0 = K.y;
    K.x += K.vx * DT; K.z += K.vz * DT;
    // a conveyor carries you along
    if (!K.air && T.belt[K.k]) { K.x += T.tx[K.k] * T.belt[K.k] * DT; K.z += T.tz[K.k] * T.belt[K.k] * DT; }
    const kPrev = K.k;
    const inCut = this._cut(K);
    if (!inCut) K.k = locate(T, K.x, K.z, K.k, 20, K.y);
    let d = lateral(T, K.k, K.x, K.z);
    const a = along(T, K.k, K.x, K.z);

    // the edge: a wall or a rail (solid: it scrapes you and slows you, it never
    // bounces you off; the nose is nudged back along the track so nobody
    // sticks), or a drop (only where nothing is drawn: you fall)
    const lim = T.w[K.k] + T.m[K.k];
    if (inCut) { d = 0; }
    else if (Math.abs(d) > lim && !T.drop[K.k]) {
      const over = Math.abs(d) - lim, s = Math.sign(d);
      const Rx = rightX(T, K.k), Rz = rightZ(T, K.k);
      K.x -= Rx * over * s; K.z -= Rz * over * s;
      const vOut = (K.vx * Rx + K.vz * Rz) * s;
      // the outward part of the velocity is gone (no rebound) …
      if (vOut > 0) { K.vx -= Rx * s * vOut; K.vz -= Rz * s * vOut; }
      // … the impact costs speed, and grinding along it keeps costing a little
      const sp2 = Math.hypot(K.vx, K.vz);
      if (sp2 > 0.1) { const f = 0.993 * (1 - Math.min(0.2, Math.max(0, vOut) * 0.008)); K.vx *= f; K.vz *= f; }
      // turn the nose back along the track (the rest of the speed carries on
      // along the rail): nobody sticks to a wall
      const th = Math.atan2(T.tx[K.k], T.tz[K.k]);
      const df = Math.atan2(Math.sin(th - K.yaw), Math.cos(th - K.yaw));
      if (Math.abs(df) < 1.6) K.yaw += df * 0.16;
      K.wallT = 0.2;
      if (vOut > 6) this.emit({ k: 'wall', i: K.i, p: Math.min(1, vOut / 20), rail: T.rail[K.k] });
      // the scrape: sparks and a grind while you're against it at speed
      if (sp2 > 7 && (K.scrapeT = (K.scrapeT || 0) - 1) <= 0) {
        K.scrapeT = 5;
        this.emit({ k: 'scrape', i: K.i, x: K.x + Rx * s * KART_R, y: K.y + 0.6, z: K.z + Rz * s * KART_R, p: Math.min(1, sp2 / 40), rail: T.rail[K.k] });
      }
      d = s * lim;
    } else if (K.wallT > 0) K.wallT -= DT;

    // posts: rolled socks, dust bunnies
    for (const P of T.def.posts) {
      const dx = K.x - P.x, dz = K.z - P.z, r = P.r + KART_R * 0.8, dd = dx * dx + dz * dz;
      if (dd < r * r && K.y < 6) {
        const l = Math.sqrt(dd);
        const nx = l ? dx / l : rightX(T, K.k), nz = l ? dz / l : rightZ(T, K.k);
        K.x = P.x + nx * r; K.z = P.z + nz * r;
        K.contactMoved = true;
        const vn = K.vx * nx + K.vz * nz;
        if (vn < 0) { K.vx -= nx * vn * 1.5; K.vz -= nz * vn * 1.5; if (vn < -6) this.emit({ k: 'post', i: K.i, kind: P.kind }); }
      }
    }
    if (!K.air) this._trackThings(K);
    K.d = d;

    // ── height: on the ground, off a ramp, in the air, off the edge ──
    const g = groundAt(T, K.k, d, a);
    if (!K.air) {
      // crossing a launch point (a ramp's lip, the pillow pile's bounce)
      let launch = 0;
      const dk = ((K.k - kPrev + N + N / 2) % N) - N / 2;
      if (dk > 0) for (let q = 1; q <= dk; q++) launch = Math.max(launch, T.launch[(kPrev + q) % N]);
      if (dk > 0 && launch && fwd > 6) {
        K.air = 1; K.airT = 0; K.vy = launch * Math.min(1, 0.55 + fwd / 50) + Math.max(0, K.slopeVy) * 0.5; K.trick = 0; K.ramp = 1;
        this.emit({ k: 'launch', i: K.i, big: launch > 10 });
      } else if (g === -Infinity) {
        K.air = 1; K.airT = 0; K.vy = Math.max(0, K.slopeVy) * 0.6; K.trick = 0;
      } else if (g < y0 - Math.max(0.35, Math.abs(fwd) * DT * 0.75)) {
        // the ground falls away faster than it can follow: off the lip
        K.air = 1; K.airT = 0; K.vy = Math.min(4, K.slopeVy); K.trick = 0;
      } else {
        K.slopeVy = (g - y0) / DT;
        K.y = g;
        if (Math.abs(d) < T.w[K.k] + T.m[K.k] * 0.5 && !K.cut) K.lastGood = K.k;
      }
      if (T.pad[K.k] && K.padT <= 0 && Math.abs(d) < T.w[K.k]) { K.boostT = Math.max(K.boostT, 1.2); K.padT = 0.5; this.emit({ k: 'pad', i: K.i }); }
    }
    if (K.air) {
      K.airT += DT;
      K.vy -= GRAV * DT;
      K.y += K.vy * DT;
      // the under-bed slats: only for a kart that is actually under them
      if (T.ceil[K.k] && K.y > T.ceil[K.k] - 3.4 && K.y < T.ceil[K.k] + 1) { K.y = T.ceil[K.k] - 3.4; K.vy = Math.min(0, K.vy); }
      // TAUNT in the air: the trick
      if (pressed('taunt') && !K.trick && K.spinT <= 0 && K.ejectT <= 0) { K.trick = 1; K.trickT = 0.75; this.emit({ k: 'trick', i: K.i }); }
      if (g !== -Infinity && K.y <= g) {
        const hard = -K.vy;
        K.y = g; K.vy = 0; K.air = 0; K.slopeVy = 0; K.land = 0.35; K.ramp = 0;
        if (K.trick) { K.boostT = Math.max(K.boostT, 1.3); this.emit({ k: 'trickBoost', i: K.i }); }
        this.emit({ k: 'land', i: K.i, hard: Math.min(1, hard / 30), trick: K.trick });
        K.trick = 0;
      } else if ((g === -Infinity && (K.airT > 1.2 || K.y < T.y[K.lastGood] - 9)) || K.y < -12) {
        // over the edge: the sock comes down for you
        K.fish = { t: 0, dur: 2.2, k: K.lastGood, x: K.x, y: K.y, z: K.z };
        K.air = 0; K.drift = 0; K.charge = 0; K.tier = 0; K.boostT = 0;
        this.emit({ k: 'fall', i: K.i, why: 'edge' });
      }
    }
    // the safety net: a kart is never below the road it is on. (The layer-
    // aware locate should make this unreachable; if anything ever puts a
    // kart under its road, it is put back on top, not fished out by the sock.)
    if (!K.fish) {
      const gS = groundAt(T, K.k, K.d, a);
      if (gS !== -Infinity && K.y < gS - 0.5) {
        K.y = gS; K.vy = Math.max(0, K.vy); K.air = 0; K.slopeVy = 0;
        this.netCount = (this.netCount || 0) + 1;
      }
    }

    // TAUNT on the ground: the trash talk (and the lowrider's hydraulics)
    if (pressed('taunt') && !K.air && K.tauntT <= 0) { K.tauntT = 2.2; K.bounceT = 1.1; this.emit({ k: 'taunt', i: K.i }); }

    // ── progress round the lap ──
    if (live) {
      const dk = ((K.k - kPrev + N + N / 2) % N) - N / 2;
      if (Math.abs(dk) < 40 || (K.cut && Math.abs(dk) < 120)) K.kc += dk;
      const lap = Math.floor(K.kc / N);
      if (lap > K.lap && !K.fin) {
        K.lap = lap;
        if (lap >= this.laps) {
          K.fin = 1; K.finT = this.tick; this.finished++; this.finishOrder.push(K.i); K.place = this.finishOrder.length;
          this.emit({ k: 'finish', i: K.i, place: K.place });
          if (this.humans.includes(K.i)) this.lastHumanTick = this.tick;
        } else this.emit({ k: 'lap', i: K.i, lap: lap + 1 });
      }
      // stuck (CPU or not): a long crawl into something gets fished back
      if (this.phase === 'race' && Math.abs(fwd) < 2.5 && I.gas && K.spinT <= 0) { K.stuckT += DT; if (K.stuckT > 4) { K.stuckT = 0; K.fish = { t: 0, dur: 1.6, k: K.lastGood, x: K.x, y: K.y, z: K.z }; this.emit({ k: 'fall', i: K.i, why: 'stuck' }); } }
      else K.stuckT = 0;
    }

    // ── items: the boxes, and using what you hold ──
    if (this.phase === 'race') {
      // (stage 5: a grabbed box pops and grows back, but a box is never "used
      // up" for the karts behind: everyone driving through a row gets one —
      // Kevin, at the back of the pack, used to find the rows already empty)
      for (const B of this.boxes) {
        if (this.tick - (K.boxTick ?? -99) < 40) break;
        if ((B.x - K.x) ** 2 + (B.z - K.z) ** 2 < 3.3 * 3.3 && Math.abs(B.y - 1.6 - K.y) < 3.6) {
          B.dead = BOX_RESPAWN; K.boxTick = this.tick;
          this.emit({ k: 'box', i: K.i, b: this.boxes.indexOf(B) });
          if (!K.item) { K.item = this._roll(K); K.roulette = ROULETTE; }
        }
      }
      // the spring cushion's lock: the racer just ahead, in range along the track
      K.lock = K.item === 'spring' && !K.roulette ? this._ahead(K, LOCK_RANGE) : -1;
      // an item held behind you (LOOK BACK with a missile or a slick): it dangles there, a shield
      K.held = K.item && !K.roulette && I.back && (K.item === 'missile' || K.item === 'slick') ? 1 : 0;
      if (pressed('item') && K.item && !K.roulette && K.spinT <= 0 && K.ejectT <= 0 && (K.item !== 'spring' || K.lock >= 0)) this._use(K, I);
    }
  }

  /* the shortcut (Laundry Day's dryer): inside its corridor the road's own
     walls don't apply, the corridor's do (in its walled middle), and the
     kart's place on the lap runs from the mouth's sample to the exit's.
     You can only get in from the road (its ends overlap it). The drum
     tumbles you round once and spits you out with a kick. */
  _cut(K) {
    const C = this.T.cut;
    if (!C || K.air && !K.cut) { if (K.cut) K.cut = 0; return false; }
    const T = this.T, N = T.N;
    const rx = K.x - C.ax, rz = K.z - C.az;
    const s = rx * C.ux + rz * C.uz, l = -rx * C.uz + rz * C.ux;
    // the mouth and the exit are funnels (on the road anyway): wide, narrowing to the gap
    const half = C.w + 0.4 + Math.max(0, Math.min(10, Math.max((C.m0 - s) * 0.3, (s - C.m1) * 0.3)));
    const inside = s > -3 && s < C.len + 3 && Math.abs(l) < half;
    if (!K.cut) {
      // in from the road only: the mouth or the exit, where the corridor overlaps it
      if (!inside || (s > C.m0 && s < C.m1)) return false;
      const k = locate(T, K.x, K.z, K.k, 20);
      if (Math.abs(lateral(T, k, K.x, K.z)) > T.w[k] + T.m[k] + 0.5) return false;
      // only heading through it
      const head = Math.sin(K.yaw) * C.ux + Math.cos(K.yaw) * C.uz;
      if (s > C.len / 2 || head < 0.3) return false;
      K.cut = 1;
    }
    if (s > C.len + 3 || s < -3 || (Math.abs(l) > half && (s < C.m0 || s > C.m1))) {
      K.cut = 0; K.drum = 0;
      K.k = locate(T, K.x, K.z, s > C.len / 2 ? C.kB : C.kA, 30);
      return false;
    }
    // the walled middle: the gap between the machines
    if (s > C.m0 - 2 && s < C.m1 + 2 && Math.abs(l) > C.w) {
      const sg = Math.sign(l), over = Math.abs(l) - C.w, nx = -C.uz * sg, nz = C.ux * sg;
      K.x -= nx * over; K.z -= nz * over;
      const vOut = K.vx * nx + K.vz * nz;
      if (vOut > 0) { K.vx -= nx * vOut * 1.35; K.vz -= nz * vOut * 1.35; if (vOut > 6) this.emit({ k: 'wall', i: K.i, p: Math.min(1, vOut / 20) }); }
      const th = Math.atan2(C.ux, C.uz), df = Math.atan2(Math.sin(th - K.yaw), Math.cos(th - K.yaw));
      if (Math.abs(df) < 1.6) K.yaw += df * 0.08;
    }
    const f = Math.max(0, Math.min(1, s / C.len));
    K.k = (C.kA + Math.round(f * ((C.kB - C.kA + N) % N))) % N;
    // the drum
    const inDrum = s > C.d0 && s < C.d1 ? (s - C.d0) / (C.d1 - C.d0) : 0;
    if (inDrum && !K.drum) this.emit({ k: 'drum', i: K.i });
    if (!inDrum && K.drum > 0.5 && s >= C.d1) { K.boostT = Math.max(K.boostT, 1.0); this.emit({ k: 'drumOut', i: K.i }); }
    K.drum = inDrum;
    return true;
  }

  /* the track's moving things, once a tick: the pods roll, sprinklers pulse */
  _world() {
    const T = this.T;
    for (const P of this.pods) Object.assign(P, podPos(T, P, this.tick));
    for (const S of this.sprinklers) { const on = sprinklerOn(S, this.tick); if (on && !S.on) this.emit({ k: 'spray', s: this.sprinklers.indexOf(S) }); S.on = on; }
    for (const P of this.piles) if (P.kicked > 0) P.kicked--;
    // a pod runs into you: a little spin
    for (const P of this.pods) for (const K of this.karts) {
      if (K.air || K.fish || K.cut) continue;
      const r = P.r + KART_R;
      if ((K.x - P.x) ** 2 + (K.z - P.z) ** 2 < r * r && this.hit(K, 'pod')) { K.spinT = 0.85; K.invT = 1.5; }
    }
  }

  /* sock piles and sprinkler jets on a grounded kart */
  _trackThings(K) {
    for (let j = 0; j < this.piles.length; j++) {
      const P = this.piles[j], r = P.r + KART_R * 0.6;
      if ((K.x - P.x) ** 2 + (K.z - P.z) ** 2 < r * r) {
        if (!K.pile || K.pile.j !== j || this.tick - K.pile.t > 40) {
          K.vx *= 0.8; K.vz *= 0.8;
          if (P.kicked <= 0) { P.kicked = 30; this.emit({ k: 'pile', i: K.i, p: j, x: P.x, z: P.z }); }
        }
        K.pile = { j, t: this.tick };
      }
    }
    for (let j = 0; j < this.sprinklers.length; j++) {
      const S = this.sprinklers[j];
      if (!S.on) continue;
      const dx = K.x - S.x, dz = K.z - S.z, dd = Math.hypot(dx, dz);
      if (dd > S.reach || dd < 0.1) continue;
      const nx = dx / dd, nz = dz / dd, f = 1 - dd / S.reach;
      const cyc = Math.floor((this.tick + S.phase) / S.period);
      if (K.soak !== j * 100000 + cyc && K.invT <= 0) {
        // the jet's first slap: knocked sideways
        K.soak = j * 100000 + cyc;
        K.vx += nx * (6 + 7 * f); K.vz += nz * (6 + 7 * f);
        K.wobT = Math.max(K.wobT, 0.6);
        this.emit({ k: 'soak', i: K.i, s: j });
      }
      K.vx += nx * 14 * f * DT; K.vz += nz * 14 * f * DT;
    }
  }

  _roll(K) {
    let w = ODDS[Math.min(7, K.place - 1)].slice();
    // only one alarm clock out at once; handcuffs need two racers ahead
    if (this.shots.some((s) => s.kind === 'alarm')) w[5] = 0;
    if (K.place < 3) w[3] = 0;
    if (K.place < 2) { w[7] = 0; w[9] = 0; }
    // one hot wash at a time
    if (this.karts.some((O) => O.shrinkT > 0) || this.shots.some((s) => s.kind === 'wash')) w[8] = 0;
    const tot = w.reduce((a, b) => a + b, 0);
    let r = this.rng.int(tot);
    for (let j = 0; j < w.length; j++) { if (r < w[j]) return ITEMS[j]; r -= w[j]; }
    return 'missile';
  }

  /* ── using an item ── */
  _use(K, I) {
    const T = this.T, it = K.item;
    K.item = null;
    const fx = Math.sin(K.yaw), fz = Math.cos(K.yaw);
    this.emit({ k: 'use', i: K.i, item: it });
    if (it === 'slick') {
      const back = I.back ? -1 : 1;
      const x = K.x - fx * 3.6 * back, z = K.z - fz * 3.6 * back;
      const k = locate(T, x, z, K.k, 10);
      this.hazards.push({ kind: 'slick', x, z, y: T.y[k], k, r: 2.3, life: 60 * 40, owner: K.i, age: 0, id: this._id = (this._id || 0) + 1 });
    } else if (it === 'missile') {
      const dir = I.back ? -1 : 1, sp = 54;
      this.shots.push({ kind: 'missile', x: K.x + fx * 3 * dir, y: K.y + 1.2, z: K.z + fz * 3 * dir, vx: fx * sp * dir + K.vx * 0.3, vz: fz * sp * dir + K.vz * 0.3, k: K.k, owner: K.i, age: 0, life: 60 * 5, bounces: 0, id: this._id = (this._id || 0) + 1 });
    } else if (it === 'espresso') {
      K.boostT = Math.max(K.boostT, 2.6); K.jitterT = 2.6;
      this.emit({ k: 'boost', i: K.i, tier: 0, espresso: 1 });
    } else if (it === 'cuffs') {
      const ahead = this.order.filter((j) => this.karts[j].place < K.place && !this.karts[j].fin).sort((a, b) => this.karts[b].place - this.karts[a].place).slice(0, 2);
      if (ahead.length === 2) this.shots.push({ kind: 'cuffs', a: ahead[0], b: ahead[1], owner: K.i, age: 0, life: 42, x: K.x, y: K.y + 2, z: K.z, id: this._id = (this._id || 0) + 1 });
    } else if (it === 'case') {
      const sp = 46;
      // aim at the nearest kart ahead inside a cone
      let tgt = -1, best = 70;
      for (const O of this.karts) {
        if (O === K) continue;
        const dx = O.x - K.x, dz = O.z - K.z, dist = Math.hypot(dx, dz);
        if (dist < best && (dx * fx + dz * fz) / (dist || 1) > 0.6) { best = dist; tgt = O.i; }
      }
      this.shots.push({ kind: 'case', x: K.x + fx * 3, y: K.y + 1.5, z: K.z + fz * 3, vx: fx * sp, vz: fz * sp, k: K.k, owner: K.i, tgt, age: 0, life: 60 * 4, bounces: 0, id: this._id = (this._id || 0) + 1 });
    } else if (it === 'alarm') {
      this.shots.push({ kind: 'alarm', kc: K.kc + 4, x: K.x, y: K.y + 3, z: K.z, owner: K.i, age: 0, life: 60 * 14, id: this._id = (this._id || 0) + 1, d: 0 });
    } else if (it === 'sugar') {
      K.sugarT = SUGAR_T; K.boostT = Math.max(K.boostT, 0.6);
      this.emit({ k: 'sugar', i: K.i });
    } else if (it === 'plane') {
      const tgt = this._ahead(K, 1e9);
      this.shots.push({ kind: 'plane', kc: K.kc + 3, d: K.d, x: K.x, y: K.y + 2, z: K.z, owner: K.i, tgt, age: 0, life: 60 * 9, id: this._id = (this._id || 0) + 1 });
    } else if (it === 'wash') {
      // a puff of steam from the leader's direction: everyone else shrinks in the wash
      this.shots.push({ kind: 'wash', owner: K.i, age: 0, life: 36, x: K.x, y: K.y + 3, z: K.z, id: this._id = (this._id || 0) + 1 });
    } else if (it === 'spring') {
      const O = this.karts[K.lock];
      if (O && !O.fin && !O.fish && O.sugarT <= 0 && O.ejectT <= 0) {
        O.ejectT = EJECT_T; O.drift = 0; O.charge = 0; O.tier = 0; O.boostT = 0; O.invT = Math.max(O.invT, EJECT_T);
        this.emit({ k: 'eject', i: O.i, from: K.i });
      } else this.emit({ k: 'fizzle', id: 0, x: K.x, y: K.y + 2, z: K.z });
      K.lock = -1;
    }
  }

  /* the racer just ahead of K (by place), if they're within `range` units along the track */
  _ahead(K, range) {
    if (K.place < 2) return -1;
    const O = this.karts[this.order[K.place - 2]];
    if (!O || O.fin || O.fish) return -1;
    const gap = O.kc - K.kc;
    return gap >= 0 && gap <= range ? O.i : -1;
  }
  /* K is holding a missile or a slick behind them: it blocks one thing from behind */
  _shield(K, x, z) {
    if (!K.held) return false;
    const fx = Math.sin(K.yaw), fz = Math.cos(K.yaw);
    if ((x - K.x) * fx + (z - K.z) * fz > 0.5) return false;
    K.item = null; K.held = 0;
    this.emit({ k: 'block', i: K.i, x: K.x - fx * 2.5, y: K.y + 1.4, z: K.z - fz * 2.5 });
    return true;
  }

  /* a kart takes a hit: spin out, lose speed, a burst of feathers */
  hit(K, kind, from = -1) {
    if (K.invT > 0 || K.fish || K.fin || K.sugarT > 0 || K.ejectT > 0) return false;
    const big = kind === 'alarm' || kind === 'missile';
    K.spinT = kind === 'alarm' ? 1.6 : kind === 'slick' ? 1.1 : 1.2;
    K.spinDir = this.rng.int(2) ? 1 : -1;
    K.invT = K.spinT + 0.8;
    K.drift = 0; K.charge = 0; K.tier = 0; K.boostT = 0;
    K.vx *= big ? 0.3 : 0.45; K.vz *= big ? 0.3 : 0.45;
    if (big && !K.air) { K.air = 1; K.airT = 0; K.vy = kind === 'alarm' ? 11 : 7; K.trick = 0; }
    this.emit({ k: 'hit', i: K.i, kind, from });
    return true;
  }

  _shots() {
    const T = this.T, N = T.N;
    for (const S of this.shots) {
      S.age++;
      if (S.kind === 'missile' || S.kind === 'case') {
        if (S.kind === 'case' && S.tgt >= 0) {
          const O = this.karts[S.tgt];
          const dx = O.x - S.x, dz = O.z - S.z, l = Math.hypot(dx, dz) || 1, sp = Math.hypot(S.vx, S.vz);
          S.vx += (dx / l * sp - S.vx) * 0.07; S.vz += (dz / l * sp - S.vz) * 0.07;
        }
        S.x += S.vx * DT; S.z += S.vz * DT;
        S.k = locate(T, S.x, S.z, S.k, 20, S.y);
        const d = lateral(T, S.k, S.x, S.z), lim = T.w[S.k] + T.m[S.k];
        const gy = T.y[S.k] + 1.2;
        S.y += (gy - S.y) * 0.25;
        if (Math.abs(d) > lim) {
          if (T.drop[S.k]) { S.dead = 1; this.emit({ k: 'fizzle', id: S.id, x: S.x, y: S.y, z: S.z }); continue; }
          // bounce off the wall
          const Rx = rightX(T, S.k), Rz = rightZ(T, S.k), s = Math.sign(d);
          S.x -= Rx * (Math.abs(d) - lim) * s; S.z -= Rz * (Math.abs(d) - lim) * s;
          const vn = (S.vx * Rx + S.vz * Rz) * s;
          if (vn > 0) { S.vx -= 2 * Rx * s * vn; S.vz -= 2 * Rz * s * vn; }
          S.bounces++;
          this.emit({ k: 'bounce', id: S.id, x: S.x, y: S.y, z: S.z });
        }
        for (const P of T.def.posts) {
          const dx = S.x - P.x, dz = S.z - P.z, r = P.r + 0.8;
          if (dx * dx + dz * dz < r * r) { const l = Math.hypot(dx, dz) || 1, nx = dx / l, nz = dz / l, vn = S.vx * nx + S.vz * nz; if (vn < 0) { S.vx -= 2 * nx * vn; S.vz -= 2 * nz * vn; } S.x = P.x + nx * r; S.z = P.z + nz * r; }
        }
        for (const K of this.karts) {
          if ((K.i === S.owner && S.age < 30) || K.fish) continue;
          if ((K.x - S.x) ** 2 + (K.z - S.z) ** 2 < 2.5 * 2.5 && Math.abs(K.y + 1 - S.y) < 3.2) {
            if (S.kind === 'missile') { if (this._shield(K, S.x, S.z) || this.hit(K, 'missile', S.owner) || K.invT > 0 || K.sugarT > 0) S.dead = 1; }
            else if (K.sugarT > 0) S.dead = 1;
            else if (K.invT <= 0 && !K.fin) { K.caseT = 2.5; K.invT = 0.6; this.emit({ k: 'case', i: K.i, from: S.owner }); S.dead = 1; }
            if (S.dead) { this.emit({ k: 'pop', id: S.id, kind: S.kind, x: S.x, y: S.y, z: S.z, i: K.i }); break; }
          }
        }
        // a missile and a slick cancel each other out
        if (!S.dead) for (const H of this.hazards) if (!H.dead && (H.x - S.x) ** 2 + (H.z - S.z) ** 2 < 3.5 * 3.5) { H.dead = 1; S.dead = 1; this.emit({ k: 'pop', id: S.id, kind: S.kind, x: S.x, y: S.y, z: S.z }); break; }
      } else if (S.kind === 'cuffs') {
        const A = this.karts[S.a], B = this.karts[S.b];
        const t = S.age / S.life, mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, my = (A.y + B.y) / 2 + 2;
        S.x += (mx - S.x) * Math.min(1, t * 0.4 + 0.08); S.z += (mz - S.z) * Math.min(1, t * 0.4 + 0.08); S.y += (my + 3 * Math.sin(t * Math.PI) - S.y) * 0.3;
        if (S.age >= S.life) {
          S.dead = 1;
          if (!A.fin && !B.fin && !A.fish && !B.fish && A.sugarT <= 0 && B.sugarT <= 0) {
            A.cuff = B.i; B.cuff = A.i; A.cuffT = B.cuffT = 4;
            this.emit({ k: 'cuffs', a: A.i, b: B.i, from: S.owner });
          }
        }
      } else if (S.kind === 'alarm') {
        // it runs the track's centreline to the leader and rings
        const lead = this.karts[this.order[0]];
        S.kc += 95 * DT;
        const kk = (((Math.floor(S.kc) + this.startK) % N) + N) % N;   // (kc counts from the start line)
        S.d += (lead.d - S.d) * 0.06;
        S.x = T.x[kk] + rightX(T, kk) * S.d; S.z = T.z[kk] + rightZ(T, kk) * S.d; S.y = T.y[kk] + 3.5 + Math.sin(S.age * 0.3) * 0.6;
        S.k = kk;
        if (S.kc >= lead.kc - 1 || S.age > S.life) {
          S.dead = 1;
          S.x = lead.x; S.z = lead.z; S.y = lead.y + 3;
          this.emit({ k: 'alarm', i: lead.i, from: S.owner, x: lead.x, y: lead.y, z: lead.z });
          this.hit(lead, 'alarm', S.owner);
          for (const O of this.karts) if (O !== lead && (O.x - lead.x) ** 2 + (O.z - lead.z) ** 2 < 13 * 13 && !O.fin) { O.wobT = 1.3; O.vx *= 0.7; O.vz *= 0.7; this.emit({ k: 'wobble', i: O.i }); }
        }
      }
      else if (S.kind === 'plane') this._plane(S);
      else if (S.kind === 'wash') {
        if (S.age >= S.life) {
          S.dead = 1;
          const lead = this.karts[this.order[0]];
          const hit = [];
          for (const O of this.karts) if (O.i !== S.owner && !O.fin && !O.fish && O.sugarT <= 0) { O.shrinkT = WASH_T; O.drift = 0; O.charge = 0; O.tier = 0; hit.push(O.i); }
          this.emit({ k: 'wash', from: S.owner, hit, x: lead.x, y: lead.y, z: lead.z });
        }
      }
      if (S.age > S.life && !S.dead) { S.dead = 1; this.emit({ k: 'fizzle', id: S.id, x: S.x, y: S.y, z: S.z }); }
    }
    this.shots = this.shots.filter((s) => !s.dead);
  }

  /* the paper plane: it flies the track (never through a wall) a little
     faster than anyone drives, swings across to its target and bonks them.
     A missile or slick held behind blocks it; a slick on its path takes it out. */
  _plane(S) {
    const T = this.T, N = T.N;
    const O = this.karts[S.tgt];
    if (!O || O.fin || O.fish) { S.dead = 1; this.emit({ k: 'fizzle', id: S.id, x: S.x, y: S.y, z: S.z }); return; }
    const gap = O.kc - S.kc;
    S.kc += Math.max(30, Math.min(66, 30 + gap * 2.2)) * DT;
    const kk = (((Math.floor(S.kc) + this.startK) % N) + N) % N;   // (kc counts from the start line)
    const near = gap < 30 ? 1 - Math.max(0, gap) / 30 : 0;
    S.d += (O.d - S.d) * (0.04 + near * 0.2);
    const lim = T.w[kk] + T.m[kk] - 1;
    S.d = Math.max(-lim, Math.min(lim, S.d));
    S.x = T.x[kk] + rightX(T, kk) * S.d; S.z = T.z[kk] + rightZ(T, kk) * S.d;
    S.y = T.y[kk] + 2.4 + Math.sin(S.age * 0.12) * 0.5 + (O.air ? Math.max(0, O.y - T.y[kk]) * near : 0);
    S.k = kk;
    for (const H of this.hazards) if (!H.dead && (H.x - S.x) ** 2 + (H.z - S.z) ** 2 < 3.5 * 3.5) { H.dead = 1; S.dead = 1; this.emit({ k: 'pop', id: S.id, kind: 'plane', x: S.x, y: S.y, z: S.z }); return; }
    if ((O.x - S.x) ** 2 + (O.z - S.z) ** 2 < 2.8 * 2.8 && Math.abs(O.y + 1 - S.y) < 3.6) {
      S.dead = 1;
      if (!this._shield(O, S.x, S.z)) this.hit(O, 'plane', S.owner);
      this.emit({ k: 'pop', id: S.id, kind: 'plane', x: S.x, y: S.y, z: S.z, i: O.i });
    }
  }

  _hazards() {
    for (const H of this.hazards) {
      H.age++;
      if (--H.life <= 0) H.dead = 1;
      for (const K of this.karts) {
        if (H.dead || K.air || K.fish) continue;
        if (K.i === H.owner && H.age < 40) continue;
        if ((K.x - H.x) ** 2 + (K.z - H.z) ** 2 < (H.r + 1.2) ** 2) { if (this.hit(K, 'slick', H.owner)) { H.dead = 1; this.emit({ k: 'pop', id: H.id, kind: 'slick', x: H.x, y: H.y, z: H.z, i: K.i }); } }
      }
    }
    this.hazards = this.hazards.filter((h) => !h.dead);
  }

  /* bump-and-grind: karts push each other apart, the heavier shoving harder */
  _bumps() {
    const KS = this.karts;
    for (let a = 0; a < KS.length; a++) for (let b = a + 1; b < KS.length; b++) {
      const A = KS[a], B = KS[b];
      if (A.fish || B.fish) continue;
      const dx = B.x - A.x, dz = B.z - A.z, dy = B.y - A.y, r = KART_R * 2;
      const dd = dx * dx + dz * dz;
      if (dd >= r * r || Math.abs(dy) > 2.6) continue;
      const l = Math.sqrt(dd) || 0.01, nx = dx / l, nz = dz / l, over = r - l;
      // sugar rush: whoever you bump spins out; full-size karts squash the shrunk flat
      if (A.sugarT > 0 && B.sugarT <= 0) this.hit(B, 'sugar', A.i);
      else if (B.sugarT > 0 && A.sugarT <= 0) this.hit(A, 'sugar', B.i);
      for (const [P, Q] of [[A, B], [B, A]]) if (P.shrinkT > 0 && Q.shrinkT <= 0 && !P.air && !P.flatCd && P.invT <= 0) { P.flatT = 1.0; P.flatCd = 2.2; P.drift = 0; this.emit({ k: 'flat', i: P.i, by: Q.i }); }
      const ma = A.S.mass * (A.shrinkT > 0 ? 0.5 : 1), mb = B.S.mass * (B.shrinkT > 0 ? 0.5 : 1), wa = mb / (ma + mb), wb = ma / (ma + mb);
      A.contactMoved = B.contactMoved = true;
      A.x -= nx * over * wa; A.z -= nz * over * wa; B.x += nx * over * wb; B.z += nz * over * wb;
      const vrel = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
      if (vrel < 0) {
        const j = -(1.35) * vrel / (1 / ma + 1 / mb);
        const shove = 2.2;
        A.vx -= (j / ma + shove * wa) * nx; A.vz -= (j / ma + shove * wa) * nz;
        B.vx += (j / mb + shove * wb) * nx; B.vz += (j / mb + shove * wb) * nz;
        if (-vrel > 3 && (this.tick - (A.bumpTick || 0) > 12)) { A.bumpTick = B.bumpTick = this.tick; this.emit({ k: 'bump', i: a, j: b, p: Math.min(1, -vrel / 18), x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2 }); }
      }
    }
  }

  // Contacts can move a kart after its driving tick has resolved the road.
  _settleContacts() {
    const T = this.T;
    for (const K of this.karts) {
      if (!K.contactMoved) continue;
      K.contactMoved = false;
      if (K.fish || K.cut) continue;
      const k = K.k;
      const d = lateral(T, k, K.x, K.z);
      const a = along(T, k, K.x, K.z);
      const lim = T.w[k] + T.m[k] - (T.rail[k] ? KART_R : 0);
      K.d = d;
      if (!T.drop[k] && Math.abs(d) > lim) {
        const side = Math.sign(d);
        const nx = rightX(T, k) * side, nz = rightZ(T, k) * side;
        const overlap = Math.abs(d) - lim;
        K.x -= nx * overlap; K.z -= nz * overlap;
        const outward = K.vx * nx + K.vz * nz;
        if (outward > 0) { K.vx -= outward * nx; K.vz -= outward * nz; }
        K.d = side * lim;
      }
      const floor = groundAt(T, k, K.d, a);
      if (K.y < floor && !K.air) K.y = floor;
    }
  }

  /* the fuzzy handcuffs: a short soft chain between two karts */
  _cuffs() {
    for (const A of this.karts) {
      if (A.cuff < 0 || A.cuff < A.i) continue;
      const B = this.karts[A.cuff];
      const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 0.01, rest = 5.2;
      // the chain snaps if one of them is fished out, launched from the seat, or far away
      // (it used to yank the other one across the room)
      if (A.fish || B.fish || A.ejectT > 0 || B.ejectT > 0 || l > rest * 4 || Math.abs(B.y - A.y) > 8) { A.cuff = B.cuff = -1; A.cuffT = B.cuffT = 0; this.emit({ k: 'unCuff', a: A.i, b: B.i }); continue; }
      if (l > rest) {
        const nx = dx / l, nz = dz / l, f = (l - rest) * 6 * DT, ma = A.S.mass, mb = B.S.mass;
        A.vx += nx * f * mb / (ma + mb) * 2; A.vz += nz * f * mb / (ma + mb) * 2;
        B.vx -= nx * f * ma / (ma + mb) * 2; B.vz -= nz * f * ma / (ma + mb) * 2;
        if (l > rest * 2.4) {
          const c = Math.min(0.6, (l - rest * 2.4) / 2);
          A.contactMoved = B.contactMoved = true;
          A.x += nx * c; A.z += nz * c; B.x -= nx * c; B.z -= nz * c;
        }
      }
    }
  }

  _place() {
    const KS = this.karts;
    const fin = this.finishOrder;
    const rest = this.order.filter((i) => !KS[i].fin).sort((a, b) => KS[b].kc - KS[a].kc || a - b);
    this.order = [...fin, ...rest];
    this.order.forEach((i, p) => { KS[i].place = p + 1; });
  }

  /* lap shown on the HUD (1…laps) */
  lapOf(K) { return Math.max(1, Math.min(this.laps, Math.floor(K.kc / this.T.N) + 1)); }
  /* 0…1 through the race */
  progress(K) { return Math.max(0, Math.min(1, K.kc / (this.T.N * this.laps))); }
  raceTime() { return this.goTick ? (this.tick - this.goTick) * DT : 0; }
  timeOf(K) { return K.fin ? (K.finT - (this.goTick || 0)) * DT : this.raceTime(); }
}
