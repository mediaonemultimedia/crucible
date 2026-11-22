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

import { buildTrack, locate, lateral, along, groundAt, rightX, rightZ, TRACKS } from './track.js';
import { RACERS, stats } from './roster.js';
import { makeRng } from '../sim/rng.js';

export const DT = 1 / 60;
export const GRAV = 46;
export const COUNT_TICKS = 220;       // 3, 2, 1, GO
export const ITEMS = ['slick', 'missile', 'espresso', 'cuffs', 'case', 'alarm'];
export const ITEM_NAMES = { slick: 'Feather Slick', missile: 'Pillow Missile', espresso: 'Espresso Shot', cuffs: 'Fuzzy Handcuffs', case: 'Pillowcase', alarm: 'Alarm Clock' };
export const TIER_AT = [0, 1.0, 2.0, 3.0];          // drift charge (s) for each spark tier
export const TIER_BOOST = [0, 0.6, 1.0, 1.45];      // the boost each tier gives on release (s)
export const ROULETTE = 84;                          // ticks the item slot spins
const ODDS = [
  // slick missile espresso cuffs case alarm, by place 1…8
  [52, 33, 10, 0, 5, 0],
  [30, 34, 16, 0, 20, 0],
  [16, 30, 20, 14, 18, 2],
  [12, 27, 24, 17, 17, 3],
  [8, 22, 28, 20, 17, 5],
  [6, 18, 30, 21, 17, 8],
  [4, 15, 32, 21, 16, 12],
  [3, 12, 34, 20, 16, 15],
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
      for (const u of [-0.62, -0.21, 0.21, 0.62]) {
        const d = u * T.w[k];
        this.boxes.push({ k, x: T.x[k] + rightX(T, k) * d, y: T.y[k] + 2.2, z: T.z[k] + rightZ(T, k) * d, dead: 0 });
      }
    }
    this.shots = [];        // flying things: missiles, pillowcases, handcuffs, alarm clocks
    this.hazards = [];      // feather slicks on the ground
    this.finished = 0;
    this.finishOrder = [];
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
    if (this.phase === 'done') { for (const K of this.karts) this._kartTick(K, inputs[K.i] || noInput()); this._bumps(); return; }
    for (const B of this.boxes) if (B.dead > 0) B.dead--;
    for (const K of this.karts) this._kartTick(K, inputs[K.i] || noInput());
    this._bumps();
    this._cuffs();
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
    for (const t of ['boostT', 'padT', 'spinT', 'invT', 'jitterT', 'caseT', 'wobT', 'cuffT', 'tauntT', 'trickT', 'bounceT', 'land']) if (K[t] > 0) K[t] = Math.max(0, K[t] - DT);
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
    if (K.spinT > 0) steer = 0;
    K.steer = steer;
    const gas = live && I.gas && K.spinT <= 0, brake = live && I.brake && K.spinT <= 0;

    // forward and sideways parts of the velocity
    const fx = Math.sin(K.yaw), fz = Math.cos(K.yaw), rx = -fz, rz = fx;
    let fwd = K.vx * fx + K.vz * fz, lat = K.vx * rx + K.vz * rz;

    // the surface: fluff beyond the guide lines, cereal and fluff patches on the line
    let surf = 'track';
    if (!K.air) {
      if (Math.abs(K.d) > T.w[K.k] + 0.6) surf = 'fluff';
      for (const P of T.def.patches) if ((K.x - P.x) ** 2 + (K.z - P.z) ** 2 < P.r * P.r) surf = P.kind;
    }
    K.surf = surf;
    let top = S.top * (K.topMul || 1);
    if (surf === 'fluff') top *= 0.58;
    else if (surf === 'cereal') top *= 0.64;
    if (K.cuff >= 0) top *= 0.86;
    if (K.caseT > 0) top *= 0.9;
    let accel = S.accel;
    if (K.boostT > 0) { top = Math.max(top, S.top * 1.4); accel = 44; }
    if (K.spinT > 0) { top = 0; }

    if (!K.air) {
      if (gas) {
        if (fwd < top) fwd += accel * DT * (fwd < top * 0.5 ? 1.25 : 1 - 0.6 * (fwd / top) ** 2) + (K.boostT > 0 ? 0 : 0);
        else fwd = Math.max(top, fwd - 30 * DT);
      } else if (brake) {
        fwd -= (fwd > 0 ? 34 : 14) * DT;
        if (fwd < -9) fwd = -9;
      } else {
        fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), 7 * DT);
      }
      if (fwd > top && !gas) fwd = Math.max(top, fwd - 30 * DT);
      if (K.spinT > 0) fwd *= 0.95;
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
    const grip = K.air ? 1.5 : K.drift ? 4.5 : surf === 'fluff' ? 7 : 13;
    lat *= Math.exp(-grip * DT);
    const nfx = Math.sin(K.yaw), nfz = Math.cos(K.yaw), nrx = -nfz, nrz = nfx;
    K.vx = nfx * fwd + nrx * lat; K.vz = nfz * fwd + nrz * lat;
    K.fwd = fwd;

    // ── move ──
    const y0 = K.y;
    K.x += K.vx * DT; K.z += K.vz * DT;
    const kPrev = K.k;
    K.k = locate(T, K.x, K.z, K.k, 20);
    let d = lateral(T, K.k, K.x, K.z);
    const a = along(T, K.k, K.x, K.z);

    // the edge: a wall (pushed back along the track, nose nudged round), or a drop
    const lim = T.w[K.k] + T.m[K.k];
    if (Math.abs(d) > lim && !T.drop[K.k]) {
      const over = Math.abs(d) - lim, s = Math.sign(d);
      const Rx = rightX(T, K.k), Rz = rightZ(T, K.k);
      K.x -= Rx * over * s; K.z -= Rz * over * s;
      const vOut = (K.vx * Rx + K.vz * Rz) * s;
      if (vOut > 0) { K.vx -= Rx * s * vOut * 1.35; K.vz -= Rz * s * vOut * 1.35; }
      const sp2 = Math.hypot(K.vx, K.vz);
      if (sp2 > 0.1) { K.vx *= 0.985; K.vz *= 0.985; }
      // turn the nose back along the track: nobody sticks to a wall
      const th = Math.atan2(T.tx[K.k], T.tz[K.k]);
      const df = Math.atan2(Math.sin(th - K.yaw), Math.cos(th - K.yaw));
      if (Math.abs(df) < 1.6) K.yaw += df * 0.08;
      K.wallT = 0.2;
      if (vOut > 6) this.emit({ k: 'wall', i: K.i, p: Math.min(1, vOut / 20) });
      d = s * lim;
    } else if (K.wallT > 0) K.wallT -= DT;

    // posts: rolled socks, dust bunnies
    for (const P of T.def.posts) {
      const dx = K.x - P.x, dz = K.z - P.z, r = P.r + KART_R * 0.8, dd = dx * dx + dz * dz;
      if (dd < r * r && K.y < 6) {
        const l = Math.sqrt(dd) || 1, nx = dx / l, nz = dz / l;
        K.x = P.x + nx * r; K.z = P.z + nz * r;
        const vn = K.vx * nx + K.vz * nz;
        if (vn < 0) { K.vx -= nx * vn * 1.5; K.vz -= nz * vn * 1.5; if (vn < -6) this.emit({ k: 'post', i: K.i, kind: P.kind }); }
      }
    }
    K.d = d;

    // ── height: on the ground, off a ramp, in the air, off the edge ──
    const g = groundAt(T, K.k, d, a);
    if (!K.air) {
      // crossing a launch point (a ramp's lip, the pillow pile's bounce)
      let launch = 0;
      const dk = ((K.k - kPrev + N + N / 2) % N) - N / 2;
      if (dk > 0) for (let q = 1; q <= dk; q++) launch = Math.max(launch, T.launch[(kPrev + q) % N]);
      if (dk > 0 && launch && fwd > 6) {
        K.air = 1; K.airT = 0; K.vy = launch * Math.min(1, 0.55 + fwd / 50) + Math.max(0, K.slopeVy) * 0.5; K.trick = 0;
        this.emit({ k: 'launch', i: K.i, big: launch > 10 });
      } else if (g === -Infinity) {
        K.air = 1; K.airT = 0; K.vy = Math.max(0, K.slopeVy) * 0.6; K.trick = 0;
      } else if (g < y0 - Math.max(0.35, Math.abs(fwd) * DT * 0.75)) {
        // the ground falls away faster than it can follow: off the lip
        K.air = 1; K.airT = 0; K.vy = Math.min(4, K.slopeVy); K.trick = 0;
      } else {
        K.slopeVy = (g - y0) / DT;
        K.y = g;
        if (Math.abs(d) < T.w[K.k] + T.m[K.k] * 0.5) K.lastGood = K.k;
      }
      if (T.pad[K.k] && K.padT <= 0 && Math.abs(d) < T.w[K.k]) { K.boostT = Math.max(K.boostT, 1.05); K.padT = 0.5; this.emit({ k: 'pad', i: K.i }); }
    }
    if (K.air) {
      K.airT += DT;
      K.vy -= GRAV * DT;
      K.y += K.vy * DT;
      if (T.ceil[K.k] && K.y > T.ceil[K.k] - 3.4) { K.y = T.ceil[K.k] - 3.4; K.vy = Math.min(0, K.vy); }
      // TAUNT in the air: the trick
      if (pressed('taunt') && !K.trick && K.spinT <= 0) { K.trick = 1; K.trickT = 0.75; this.emit({ k: 'trick', i: K.i }); }
      if (g !== -Infinity && K.y <= g) {
        const hard = -K.vy;
        K.y = g; K.vy = 0; K.air = 0; K.slopeVy = 0; K.land = 0.35;
        if (K.trick) { K.boostT = Math.max(K.boostT, 1.15); this.emit({ k: 'trickBoost', i: K.i }); }
        this.emit({ k: 'land', i: K.i, hard: Math.min(1, hard / 30), trick: K.trick });
        K.trick = 0;
      } else if ((g === -Infinity && (K.airT > 1.2 || K.y < T.y[K.lastGood] - 9)) || K.y < -12) {
        // over the edge: the sock comes down for you
        K.fish = { t: 0, dur: 2.2, k: K.lastGood, x: K.x, y: K.y, z: K.z };
        K.air = 0; K.drift = 0; K.charge = 0; K.tier = 0; K.boostT = 0;
        this.emit({ k: 'fall', i: K.i });
      }
    }

    // TAUNT on the ground: the trash talk (and the lowrider's hydraulics)
    if (pressed('taunt') && !K.air && K.tauntT <= 0) { K.tauntT = 2.2; K.bounceT = 1.1; this.emit({ k: 'taunt', i: K.i }); }

    // ── progress round the lap ──
    if (live) {
      const dk = ((K.k - kPrev + N + N / 2) % N) - N / 2;
      if (Math.abs(dk) < 40) K.kc += dk;
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
      if (this.phase === 'race' && Math.abs(fwd) < 2.5 && I.gas && K.spinT <= 0) { K.stuckT += DT; if (K.stuckT > 4) { K.stuckT = 0; K.fish = { t: 0, dur: 1.6, k: K.lastGood, x: K.x, y: K.y, z: K.z }; this.emit({ k: 'fall', i: K.i }); } }
      else K.stuckT = 0;
    }

    // ── items: the boxes, and using what you hold ──
    if (this.phase === 'race') {
      for (const B of this.boxes) {
        if (B.dead) continue;
        if ((B.x - K.x) ** 2 + (B.z - K.z) ** 2 < 2.7 * 2.7 && Math.abs(B.y - 1.6 - K.y) < 3.2) {
          B.dead = 200;
          this.emit({ k: 'box', i: K.i, b: this.boxes.indexOf(B) });
          if (!K.item) { K.item = this._roll(K); K.roulette = ROULETTE; }
        }
      }
      if (pressed('item') && K.item && !K.roulette && K.spinT <= 0) this._use(K, I);
    }
  }

  _roll(K) {
    let w = ODDS[Math.min(7, K.place - 1)].slice();
    // only one alarm clock out at once; handcuffs need two racers ahead
    if (this.shots.some((s) => s.kind === 'alarm')) w[5] = 0;
    if (K.place < 3) w[3] = 0;
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
    }
  }

  /* a kart takes a hit: spin out, lose speed, a burst of feathers */
  hit(K, kind, from = -1) {
    if (K.invT > 0 || K.fish || K.fin) return false;
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
        S.k = locate(T, S.x, S.z, S.k, 20);
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
            if (S.kind === 'missile') { if (this.hit(K, 'missile', S.owner) || K.invT > 0) S.dead = 1; }
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
          if (!A.fin && !B.fin && !A.fish && !B.fish) {
            A.cuff = B.i; B.cuff = A.i; A.cuffT = B.cuffT = 4;
            this.emit({ k: 'cuffs', a: A.i, b: B.i, from: S.owner });
          }
        }
      } else if (S.kind === 'alarm') {
        // it runs the track's centreline to the leader and rings
        const lead = this.karts[this.order[0]];
        S.kc += 95 * DT;
        const kk = ((Math.floor(S.kc) % N) + N) % N;
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
      if (S.age > S.life && !S.dead) { S.dead = 1; this.emit({ k: 'fizzle', id: S.id, x: S.x, y: S.y, z: S.z }); }
    }
    this.shots = this.shots.filter((s) => !s.dead);
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
      const ma = A.S.mass, mb = B.S.mass, wa = mb / (ma + mb), wb = ma / (ma + mb);
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

  /* the fuzzy handcuffs: a short soft chain between two karts */
  _cuffs() {
    for (const A of this.karts) {
      if (A.cuff < 0 || A.cuff < A.i) continue;
      const B = this.karts[A.cuff];
      if (A.fish || B.fish) continue;
      const dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 0.01, rest = 5.2;
      if (l > rest) {
        const nx = dx / l, nz = dz / l, f = (l - rest) * 6 * DT, ma = A.S.mass, mb = B.S.mass;
        A.vx += nx * f * mb / (ma + mb) * 2; A.vz += nz * f * mb / (ma + mb) * 2;
        B.vx -= nx * f * ma / (ma + mb) * 2; B.vz -= nz * f * ma / (ma + mb) * 2;
        if (l > rest * 2.4) { const c = (l - rest * 2.4) / 2; A.x += nx * c; A.z += nz * c; B.x -= nx * c; B.z -= nz * c; }
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
