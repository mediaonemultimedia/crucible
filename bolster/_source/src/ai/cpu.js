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
   to end.                                                                 */

import { FIGHTERS, MAX_METER, reachOf, isShot } from '../fighters/index.js';
import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL } from '../sim/input.js';
import { makeRng } from '../sim/rng.js';

/* shotCd: ticks between its own throws; shotP: the chance it throws when
   it could; zone: how often a shooter hangs back at range rather than
   coming in; approach: how often it walks/dashes in from far off; leap:
   how often it jumps a shot coming at it; dash: how often an approach is
   a dash */
export const LEVELS = {
  easy:   { delay: 24, think: 12, block: 0.12, guess: 0.5, aa: 0.08, punish: 0.05, special: 0.25, aggro: 0.3, jump: 0.04, whiffy: 0.45, shotCd: 320, shotP: 0.15, zone: 0.25, approach: 0.5, leap: 0.15, dash: 0.25 },
  normal: { delay: 14, think: 6,  block: 0.5,  guess: 0.75, aa: 0.4, punish: 0.35, special: 0.6, aggro: 0.5, jump: 0.06, whiffy: 0.2, shotCd: 180, shotP: 0.3, zone: 0.4, approach: 0.7, leap: 0.4, dash: 0.45 },
  hard:   { delay: 7,  think: 3,  block: 0.88, guess: 0.95, aa: 0.8, punish: 0.85, special: 0.95, aggro: 0.6, jump: 0.05, whiffy: 0.04, shotCd: 80, shotP: 0.55, zone: 0.75, approach: 0.8, leap: 0.6, dash: 0.6 },
};

const reach = (m) => reachOf(m);
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
    const o = this._observe(st);
    const me = st.f[this.side];
    if (st.phase !== 'fight') { this.last = 0; return 0; }
    const D = FIGHTERS[me.id];
    const fwd = me.face > 0 ? RIGHT : LEFT, back = me.face > 0 ? LEFT : RIGHT;
    const dist = Math.abs(o.x - me.x);
    const free = (me.act === 'idle' || me.act === 'walkF' || me.act === 'walkB' || me.act === 'crouch' || me.act === 'blockstun') && !me.air;

    // ── threats: an attack within reach, a shot on its way ─────────────────
    let threat = null;
    if (o.act === 'attack') {
      const m = FIGHTERS[o.id].moves[o.mv];
      const r = m.track ? 99999 : reach(m) + 700 + (m.motion.length ? 1800 : 0);
      if (dist < r && o.t <= lastActive(m)) threat = { key: `${o.mv}:${o.x}`, low: !!m.low, high: !!m.air || (m.hits[0] && m.hits[0].level === 'high'), grab: !!m.grab };
    }
    let leap = false;
    for (const p of o.proj) {
      // where the shot is now: what it saw, carried on by its reaction time
      const px = p.x + p.vx * this.L.delay;
      const toward = (px - me.x) * p.vx < 0, d = Math.abs(px - me.x);
      if (!toward) continue;
      // in the window for a jump over it? decide once per shot
      if (d > 1500 && d < 3300 && free) {
        if (this.leapFor !== p.id) { this.leapFor = p.id; this.leapGo = this.chance(this.L.leap); }
        if (this.leapGo) leap = true;
      }
      if (d < 3000) threat = threat || { key: `p${p.id}`, low: false, high: false, proj: true };
    }
    if (this.queue.length) return this._emit(this.queue.shift());
    if (leap) { this.queue = []; this.btn = 0; return this._emit(UP | fwd); }

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
      else if (this.blockAs & 1) out = back | (this.blockAs & 2 ? DOWN : 0);
      if (out) return this._emit(out);
    }
    if (me.act === 'blockstun') return this._emit(back | (me.down ? DOWN : 0));

    if (this.btn || st.tick < this.next) return this._emit(this.plan);
    this.next = st.tick + this.L.think + this.rng.int(this.L.think + 1);

    // ── choices ────────────────────────────────────────────────────────────
    const M = D.moves;
    const rl = reach(M.light), rh = reach(M.heavy), rs = reach(M.signature) || 0;
    const shooter = isShot(M.signature);
    const canShoot = shooter && !st.proj.some((p) => p.o === this.side) && st.tick - this.lastShot >= this.L.shotCd;
    const oppM = o.act === 'attack' ? FIGHTERS[o.id].moves[o.mv] : null;
    // they threw and are still winding down from it
    const theyThrew = oppM && oppM.spawn.length && o.t > oppM.spawn[0].at;
    let press = 0, hold = 0, dash = false;

    if (!free && me.act === 'jump' && dist < 2600 && !me.aired && this.chance(0.5)) press = this.chance(0.5) ? HEAVY : LIGHT;
    else if (free) {
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
      } else if (dist <= rl + 150 && this.chance(this.L.aggro + 0.2)) {
        const r = this.rng.int(100);
        if (r < 40) press = LIGHT;
        else if (r < 62) { hold = DOWN; press = LIGHT; }
        else if (r < 85) press = HEAVY;
        else if (!shooter) { hold = DOWN; press = HEAVY; } else press = LIGHT;
      } else if (dist <= rh + 100 && this.chance(this.L.aggro)) {
        press = this.chance(0.7) ? HEAVY : LIGHT;
      } else if (canShoot && dist > 3500 && this.chance(this.L.shotP)) {
        hold = DOWN; press = HEAVY;
        this.lastShot = st.tick;
      } else if (!shooter && rs > 2400 && dist < rs && dist > rh && this.chance(0.4)) {
        hold = DOWN; press = HEAVY;                          // the long sweep
      } else if (me.id === 'sumaura' && dist > 2200 && dist < 5000 && this.chance(0.25)) {
        hold = DOWN; press = HEAVY;                          // the headbutt
      } else if (dist > 4000 && this.chance(this.L.jump)) {
        hold = UP | fwd;
      } else if (this.chance(this.L.whiffy * 0.3)) {
        press = this.chance(0.5) ? LIGHT : HEAVY;          // swinging at air
      } else if (dist < reach(FIGHTERS[o.id].moves.light) + 700 && this.chance(this.L.block * 0.7)) {
        // inside their poke range: guard (a guess at high or low)
        hold = back | (this.chance(0.35) ? DOWN : 0);
      } else {
        // footsies: drift toward the range its pokes like (a shooter
        // sometimes hangs back to zone; everyone comes in from far off)
        if (this.want === undefined || this.chance(0.08)) this.want = shooter && this.chance(this.L.zone) ? 4500 : rl * 0.9;
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
      return this._emit(this.queue.shift());
    }
    this.plan = hold & ~UP;
    this.btn = press;
    return this._emit(hold);
  }

  /* buttons are presses: release, then press on the next tick */
  _emit(dirs) {
    let m = dirs;
    if (this.btn) {
      if (this.last & this.btn) { /* still held from last time: release first */ }
      else { m |= this.btn; this.btn = 0; }
    }
    this.last = m;
    return m;
  }
}
