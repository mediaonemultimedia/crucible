/* The computer opponent. It plays through the same door a person does: each
   tick it reads the sim's state and returns the same input bitmask the
   keyboard would — no peeking at what the other side pressed, no acting on
   the present. What it sees of the opponent is `delay` ticks old (its
   reaction time); only its own fighter is read live, as a player knows his
   own hands.

   Difficulty is reaction delay, how often it blocks (and guesses high/low
   right), how often it anti-airs and punishes, and how readily it spends
   the special — and how much it zones: a shooter waits a per-difficulty
   cooldown between throws (and never throws with its last one still on
   screen), Easy and Normal throw rarely and walk and dash in instead,
   Hard keeps you out but still one shot at a time. Against a shooter it
   closes in: jumps the shot, dashes in on the thrower's recovery. Its
   dice are its own seeded PRNG, so a CPU-vs-CPU match is reproducible end
   to end.

   Combat pass: it blocks with E (BLOCK) like a player — Easy rarely, Hard
   well, guessing low/high from what's coming — and punishes an unsafe
   move it blocked (a light, or a throw up close), throws a blocker, techs
   throws (per-difficulty chance and reaction), and chains light → light →
   heavy when its light makes contact (Hard confirms the hit first).     */

import { FIGHTERS, MAX_METER, reachOf, isShot, frameData } from '../fighters/index.js';
import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK } from '../sim/input.js';
import { makeRng } from '../sim/rng.js';
import { TAP } from '../sim/sim.js';

/* shotCd: ticks between its own throws; shotP: the chance it throws when
   it could; zone: how often a shooter hangs back at range rather than
   coming in; approach: how often it walks/dashes in from far off; leap:
   how often it jumps a shot coming at it; dash: how often an approach is
   a dash; combo: how often it chains on contact (`confirm`: only on a hit);
   tech / techT: chance and reaction (ticks) to escape a throw; throwP:
   how often it throws someone guarding up close; bpunish: how often it
   hits back after blocking an unsafe move */
export const LEVELS = {
  easy:   { combo: 0.12, confirm: 0, tech: 0.1, techT: 9, throwP: 0.05, bpunish: 0.1, dive: 0.05, delay: 24, think: 12, block: 0.12, guess: 0.5, aa: 0.08, punish: 0.05, special: 0.25, aggro: 0.3, jump: 0.04, whiffy: 0.45, shotCd: 320, shotP: 0.15, zone: 0.25, approach: 0.5, leap: 0.15, dash: 0.25 },
  normal: { combo: 0.6, confirm: 0, tech: 0.4, techT: 6, throwP: 0.25, bpunish: 0.6, dive: 0.1, delay: 14, think: 6,  block: 0.5,  guess: 0.75, aa: 0.4, punish: 0.35, special: 0.6, aggro: 0.5, jump: 0.06, whiffy: 0.2, shotCd: 180, shotP: 0.3, zone: 0.4, approach: 0.7, leap: 0.4, dash: 0.45 },
  hard:   { combo: 0.9, confirm: 1, tech: 0.75, techT: 3, throwP: 0.4, bpunish: 0.9, dive: 0.3, delay: 7,  think: 3,  block: 0.88, guess: 0.95, aa: 0.8, punish: 0.85, special: 0.95, aggro: 0.6, jump: 0.05, whiffy: 0.04, shotCd: 140, shotP: 0.4, zone: 0.6, approach: 0.8, leap: 0.75, dash: 0.6, space: 0.7 },
};

const reach = (m) => reachOf(m);
/* a move that leaves its user open when blocked (a light, 4 ticks, gets in) */
const unsafe = (m) => m && !m.air && m.hits.length && !m.hits[0].auto && m.hits[m.hits.length - 1].blockstun - frameData(m).recovery <= -6;
const lastActive = (m) => (m.hits.length ? m.hits[m.hits.length - 1].to : m.spawn.length ? m.spawn[m.spawn.length - 1].at : 0);

/* how far this fighter's special reaches (projectiles and Sky Neck: anywhere) */
function specialRange(id) {
  const m = FIGHTERS[id].moves.special;
  if (m.spawn.length || m.track) return 99999;
  if (m.grab) return m.grab.range - 200;
  const travel = m.motion.reduce((s, mo) => s + (mo.vx || 0) * (mo.to - mo.from + 1), 0);
  return reach(m) + Math.min(travel, 2400);
}

export class CPU {
  constructor(side, level = 'normal', seed = 1) {
    this.side = side;
    this.L = LEVELS[level] || LEVELS.normal;
    this.level = level;
    this.rng = makeRng(seed * 2654435761 + side * 97 + 13);
    this.seen = [];          // what it has seen of the opponent, oldest first
    this.plan = 0;           // directions it's holding
    this.next = 0;           // tick of its next decision
    this.btn = 0;            // a button to press next tick
    this.last = 0;
    this.blockFor = -1;      // the opponent move it decided to block (or not)
    this.blockAs = 0;
    this.lastShot = -9999;   // tick of its last throw
    this.queue = [];         // a sequence of masks to play out (a dash's double-tap)
    this.leapFor = null;     // the shot it decided to jump (or not)
  }

  chance(p) { return this.rng.int(10000) < p * 10000; }

  _observe(st) {
    const o = st.f[1 - this.side];
    this.seen.push({
      x: o.x, y: o.y, act: o.act, mv: o.mv, t: o.t, air: o.air, vx: o.vx, id: o.id,
      proj: st.proj.filter((p) => p.o !== this.side).map((p) => ({ x: p.x, vx: p.vx, y: p.y, id: p.id })),
    });
    if (this.seen.length > this.L.delay + 1) this.seen.shift();
    return this.seen[0];
  }

  input(st) {
    this.now = st.tick;
    const o = this._observe(st);
    const me = st.f[this.side];
    if (st.phase !== 'fight') { this.last = 0; return 0; }
    const D = FIGHTERS[me.id];
    const fwd = me.face > 0 ? RIGHT : LEFT, back = me.face > 0 ? LEFT : RIGHT;
    const dist = Math.abs(o.x - me.x);
    const free = (me.act === 'idle' || me.act === 'walkF' || me.act === 'walkB' || me.act === 'crouch' || me.act === 'guard' || me.act === 'blockstun') && !me.air;
    const live = st.f[1 - this.side];   // only what a player feels: being grabbed, what he just blocked, his own hit landing

    // thrown: O+P to escape, if it reacts in time
    if (me.act === 'grabbed' && live.mv === 'throwHold') {
      const key = st.tick - me.t;
      if (this.techFor !== key) { this.techFor = key; this.techGo = this.chance(this.L.tech); }
      if (this.techGo && me.t >= this.L.techT && me.t <= 11) { this.btn = LIGHT | HEAVY; return this._emit(0, true); }
      return this._emit(0, true);
    }
    // its own move made contact: chain (light → light → heavy)
    if (me.act === 'attack' && me.hm) {
      const mm = D.moves[me.mv], la = lastActive(mm);
      if (mm.cancel && me.t > la && me.t <= la + 7) {
        const key = `${st.tick - me.t}`;
        if (this.comboFor !== key) {
          this.comboFor = key;
          this.comboGo = this.chance(this.L.combo) && (!this.L.confirm || live.act === 'hitstun');
        }
        if (this.comboGo && !this.btn) {
          if (mm.cancel === 1 && me.ch === 0 && !me.lk && this.chance(0.75)) this.btn = LIGHT;
          else if (mm.cancel === 1) this.btn = HEAVY;
          else if (me.meter >= MAX_METER && this.chance(this.L.special)) this.btn = SPECIAL;
          this.comboGo = mm.cancel === 1;
          if (this.btn) return this._emit(0, true);
        }
      }
    }
    // what it's blocking right now (it saw the move coming)
    if (me.act === 'blockstun' && me.t <= 1) this.blocked = live.act === 'attack' ? FIGHTERS[live.id].moves[live.mv] : null;

    // ── threats: an attack within reach, a shot on its way ─────────────────
    let threat = null;
    if (o.act === 'attack') {
      const m = FIGHTERS[o.id].moves[o.mv];
      const r = m.track ? 99999 : reach(m) + 700 + (m.motion.length ? 1800 : 0);
      if (dist < r && o.t <= lastActive(m)) threat = { key: `${o.mv}:${o.x}`, low: !!m.low, high: !!m.air || (m.hits[0] && m.hits[0].level === 'high'), grab: !!m.grab };
    }
    let leap = false;
    // a throw it can see coming: where that shot will be now, as if it
    // were already out (so it can jump on the wind-up, as a player would)
    const shots = [...o.proj];
    if (o.act === 'attack') {
      const om = FIGHTERS[o.id].moves[o.mv];
      for (const sp of om.spawn) {
        const tau = o.t + this.L.delay - sp.at;
        if (tau >= 0 || tau < -20) continue;
        const dir = Math.sign(me.x - o.x) || 1;
        shots.push({ x: o.x + dir * (sp.proj.dx + sp.proj.vx * tau), y: sp.proj.y, vx: dir * sp.proj.vx, id: `w${o.mv}${sp.at}:${o.x >> 6}`, coming: 1 });
        break;
      }
    }
    for (const p of shots) {
      // where the shot is now: what it saw, carried on by its reaction time
      const px = p.coming ? p.x : p.x + p.vx * this.L.delay;
      const toward = (px - me.x) * p.vx < 0, d = Math.abs(px - me.x);
      if (!toward) continue;
      // in the window for a jump over it? decide once per shot
      if (free && this._leapWindow(D, p, d)) {
        if (this.leapFor !== p.id) { this.leapFor = p.id; this.leapGo = this.chance(this.L.leap); }
        if (this.leapGo) leap = true;
      }
      if (d < 3000 && !p.coming) threat = threat || { key: `p${p.id}`, low: false, high: false, proj: true };
    }
    if (this.queue.length) return this._emit(this.queue.shift(), true);
    if (leap) { this.queue = []; this.btn = 0; return this._emit(UP | fwd, true); }

    let out = 0;
    if (threat && free) {
      if (this.blockFor !== threat.key) {
        this.blockFor = threat.key;
        const ok = this.chance(this.L.block);
        const right = this.chance(this.L.guess);
        this.blockAs = !ok ? 0 : 1 | ((threat.low ? right : !right && !threat.high) ? 2 : 0);
        if (threat.grab && ok) this.blockAs = 4;           // a grab: jump out
        if (threat.proj && ok && this.chance(0.15)) this.blockAs = 8;   // jump the shot (late)
      }
      if (this.blockAs & 4) out = UP | back;
      else if (this.blockAs & 8) out = UP | fwd;
      else if (this.blockAs & 1) out = BLOCK | (this.blockAs & 2 ? DOWN : 0);
      if (out && !(me.act === 'blockstun' && me.stun <= 3 && this.punishing)) return this._emit(out, true);
    }
    if (me.act === 'blockstun') {
      // blocked something unsafe: hit back as soon as the blockstun ends
      // (a light; a throw now and then when it's right on top of them)
      if (me.t <= 1) this.punishing = unsafe(this.blocked) && this.chance(this.L.bpunish);
      if (this.punishing && me.stun <= 3) {
        this.punishing = false;
        const close = Math.abs(live.x - me.x) <= ((D.push.w + FIGHTERS[live.id].push.w) >> 1) + 400;
        this.btn = close && this.chance(0.3) ? LIGHT | HEAVY : LIGHT;
        return this._emit(0, true);
      }
      return this._emit(BLOCK | (me.down ? DOWN : 0), true);
    }

    if (this.btn || st.tick < this.next) return this._emit(this.plan);
    this.next = st.tick + this.L.think + this.rng.int(this.L.think + 1);

    // ── choices ────────────────────────────────────────────────────────────
    const M = D.moves;
    const rl = reach(M.light), rh = reach(M.heavy), rs = reach(M.signature) || 0;
    // how far in front of each of them their hurt box reaches
    const myFront = D.hurt.stand.x + D.hurt.stand.w, oFront = FIGHTERS[o.id].hurt.stand.x + FIGHTERS[o.id].hurt.stand.w;
    // Hard knows its jab's true range (to the front of the other one's body)
    const poke = this.L.space ? rl + oFront - 150 : rl + 150;
    const lunge = this.L.space ? rh + oFront - 250 : rh + 100;
    const shooter = isShot(M.signature);
    const canShoot = shooter && !st.proj.some((p) => p.o === this.side) && st.tick - this.lastShot >= this.L.shotCd;
    const oppM = o.act === 'attack' ? FIGHTERS[o.id].moves[o.mv] : null;
    // they threw and are still winding down from it
    const theyThrew = oppM && oppM.spawn.length && o.t > oppM.spawn[0].at;
    let press = 0, hold = 0, dash = false;

    // in the air over them: now and then the dive slam (an overhead), else a jump-in
    if (!free && me.act === 'jump' && dist < 1800 && !me.aired && me.vy < 120 && this.chance(this.L.dive)) { press = HEAVY; hold = DOWN; }
    else if (!free && me.act === 'jump' && dist < 2600 && !me.aired && this.chance(0.5)) press = this.chance(0.5) ? HEAVY : LIGHT;
    else if (free) {
      const throwR = ((D.push.w + FIGHTERS[o.id].push.w) >> 1) + 400;
      // a full meter: spend it when it'll reach
      if (me.meter >= MAX_METER && dist <= specialRange(me.id) && this.chance(this.L.special)) press = SPECIAL;
      // anti-air: they're jumping in
      else if (o.air && dist < 3200 && this.chance(this.L.aa)) {
        if (me.id === 'kevalanche') { hold = DOWN; press = HEAVY; } else press = HEAVY;
      }
      // punish: they whiffed something slow, close by
      else if (o.act === 'attack' && !theyThrew && dist < rh + 500 && o.t > lastActive(oppM) && this.chance(this.L.punish)) {
        // what's left of their recovery (what it saw, plus its reaction
        // time): the heavy if its wind-up fits, else the jab, else guard
        const left = oppM.total - o.t - this.L.delay;
        const hs = M.heavy.hits[0].from, ls = M.light.hits[0].from;
        if (left > hs + 1 && dist < rh) press = HEAVY;
        else if (left > ls + 1 && dist < rl + 300) press = LIGHT;
        else if (rs && dist < rs && !shooter && left > M.signature.hits[0].from) { hold = DOWN; press = HEAVY; }
        else hold = back;
      }
      // they threw from range: in on the recovery
      else if (theyThrew && dist > rh && this.chance(this.L.punish + 0.3)) {
        if (dist < rh + 1400) press = HEAVY; else if (this.chance(this.L.dash)) dash = true; else hold = fwd;
      } else if (dist < reach(FIGHTERS[o.id].moves.heavy) + 300 && !o.air && o.act !== 'hitstun' && o.act !== 'down' && this.chance(this.L.block * 0.6)) {
        // they're coming in (or swinging) within their heavy's reach: guard
        // on the guess (nobody reacts to a jab), mostly standing
        hold = BLOCK | (this.chance(0.25) ? DOWN : 0);
      } else if (dist <= throwR && !o.air && (o.act === 'guard' || o.act === 'idle' || o.act === 'crouch') && this.chance(this.L.throwP)) {
        press = LIGHT | HEAVY;                               // they're turtling: throw them
      } else if (dist <= poke && this.chance(this.L.aggro + 0.2)) {
        const r = this.rng.int(100);
        if (r < 40) press = LIGHT;
        else if (r < 62) { hold = DOWN; press = LIGHT; }
        else if (r < 85) press = HEAVY;
        else if (!shooter) { hold = DOWN; press = HEAVY; } else press = LIGHT;
      } else if (dist <= lunge && this.chance(this.L.aggro)) {
        press = this.chance(0.7) ? HEAVY : LIGHT;
      } else if (canShoot && dist > 3500 && this.chance(this.L.shotP)) {
        hold = DOWN; press = HEAVY;
        this.lastShot = st.tick;
      } else if (!shooter && rs > 2400 && dist < rs && dist > rh && this.chance(0.4)) {
        hold = DOWN; press = HEAVY;                          // the long sweep
      } else if (me.id === 'sumaura' && dist > 2200 && dist < 5000 && this.chance(0.12)) {
        hold = DOWN; press = HEAVY;                          // the headbutt
      } else if (dist > 4000 && this.chance(this.L.jump)) {
        hold = UP | fwd;
      } else if (this.chance(this.L.whiffy * 0.3)) {
        press = this.chance(0.5) ? LIGHT : HEAVY;          // swinging at air
      } else if (dist < reach(FIGHTERS[o.id].moves.light) + 700 && this.chance(this.L.block * 0.7)) {
        // inside their poke range: guard (a guess at high or low)
        hold = BLOCK | (this.chance(0.35) ? DOWN : 0);
      } else {
        // footsies: drift toward the range its pokes like (a shooter
        // sometimes hangs back to zone; everyone comes in from far off)
        // (Hard spaces itself just outside the other one's jab, then whiffs
        // its heavy's reach in from there)
        if (this.want === undefined || this.chance(0.08)) {
          this.want = shooter && this.chance(this.L.zone) ? 4500 : rl * 0.9;
          if (this.L.space && this.chance(this.L.space)) this.want = Math.max(this.want, reach(FIGHTERS[o.id].moves.light) + myFront + 200);
        }
        const want = this.want;
        if (dist > want + 400) {
          if (dist > want + 2200 && this.chance(this.L.approach * this.L.dash)) dash = true;
          else hold = this.chance(this.L.approach) ? fwd : 0;
        } else if (dist < want - 900 && this.chance(0.5)) hold = back;
        else hold = this.chance(0.3) ? back : 0;
      }
    }
    if (dash) {
      // double-tap forward: press, let go, press, and keep holding
      this.queue = [0, fwd, 0, fwd, fwd];
      this.btn = 0;
      this.plan = fwd;
      this.next = st.tick + 6;
      return this._emit(this.queue.shift(), true);
    }
    this.plan = hold & ~UP;
    this.btn = press;
    return this._emit(hold);
  }

  /* would a forward jump started now clear this shot? (its own jump:
     when its air hurt box is above the shot, and how fast they close) */
  _leapWindow(D, p, d) {
    const need = p.y + 260 - D.hurt.air.y, v = D.jumpV, g = D.grav;
    const disc = v * v - 2 * g * need;
    if (disc <= 0) return false;
    const t1 = (v - Math.sqrt(disc)) / g, t2 = (v + Math.sqrt(disc)) / g;
    const rel = Math.abs(p.vx) + D.jumpX, half = D.hurt.air.w / 2 + 320;
    return d > t1 * rel + half + 150 && d < t2 * rel - half - 400;
  }

  /* buttons are presses: release, then press on the next tick. Its walks
     aren't taps: unless it means to dash, a direction it pressed stays held
     a little past a tap's length (so a stop-start never reads as a dash) */
  _emit(dirs, dashing = false) {
    let m = dirs;
    this.pressT = this.pressT || { [LEFT]: -99, [RIGHT]: -99 };
    for (const d of [LEFT, RIGHT]) {
      const other = d === LEFT ? RIGHT : LEFT;
      if (m & d) { if (!(this.last & d)) this.pressT[d] = this.now; }
      else if (!dashing && this.last & d && !(m & other) && this.now - this.pressT[d] <= TAP + 1) m |= d;
    }
    if (this.btn) {
      if (this.last & this.btn) { /* still held from last time: release first */ }
      else { m |= this.btn; this.btn = 0; }
    }
    this.last = m;
    return m;
  }
}
