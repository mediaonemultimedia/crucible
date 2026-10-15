/* The computer opponent. It plays through the same door a person does: each
   tick it reads the sim's state and returns the same input bitmask the
   keyboard would — no peeking at what the other side pressed, no acting on
   the present. What it sees of the opponent is `delay` ticks old (its
   reaction time); only its own fighter is read live, as a player knows his
   own hands.

   Difficulty is reaction delay, how often it blocks (and guesses high/low
   right), how often it anti-airs and punishes, and how readily it spends
   the special. Its dice are its own seeded PRNG, so a CPU-vs-CPU match is
   reproducible end to end.                                               */

import { FIGHTERS, MAX_METER } from '../fighters/index.js';
import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL } from '../sim/input.js';
import { makeRng } from '../sim/rng.js';

export const LEVELS = {
  easy:   { delay: 24, think: 12, block: 0.12, guess: 0.5, aa: 0.08, punish: 0.05, special: 0.25, aggro: 0.3, jump: 0.04, whiffy: 0.45 },
  normal: { delay: 14, think: 6,  block: 0.5,  guess: 0.75, aa: 0.4, punish: 0.35, special: 0.6, aggro: 0.5, jump: 0.06, whiffy: 0.2 },
  hard:   { delay: 7,  think: 3,  block: 0.88, guess: 0.95, aa: 0.8, punish: 0.85, special: 0.95, aggro: 0.6, jump: 0.05, whiffy: 0.04 },
};

const reach = (m) => m.hits.reduce((r, h) => (h.box && !h.box.abs ? Math.max(r, h.box.x + h.box.w) : r), 0);
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
  }

  chance(p) { return this.rng.int(10000) < p * 10000; }

  _observe(st) {
    const o = st.f[1 - this.side];
    this.seen.push({
      x: o.x, y: o.y, act: o.act, mv: o.mv, t: o.t, air: o.air, vx: o.vx, id: o.id,
      proj: st.proj.filter((p) => p.o !== this.side).map((p) => ({ x: p.x, vx: p.vx, y: p.y })),
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
    for (const p of o.proj) {
      const toward = (p.x - me.x) * p.vx < 0, d = Math.abs(p.x - me.x);
      if (toward && d < 3200) threat = threat || { key: `p${p.x >> 8}`, low: false, high: false, proj: true };
    }

    let out = 0;
    if (threat && free) {
      if (this.blockFor !== threat.key) {
        this.blockFor = threat.key;
        const ok = this.chance(this.L.block);
        const right = this.chance(this.L.guess);
        this.blockAs = !ok ? 0 : 1 | ((threat.low ? right : !right && !threat.high) ? 2 : 0);
        if (threat.grab && ok) this.blockAs = 4;           // a grab: jump out
        if (threat.proj && ok && this.chance(0.3)) this.blockAs = 8;   // jump the shot
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
    const shooter = M.signature.spawn.length > 0;
    let press = 0, hold = 0;

    if (!free && me.act === 'jump' && dist < 2600 && !me.aired && this.chance(0.5)) press = this.chance(0.5) ? HEAVY : LIGHT;
    else if (free) {
      // a full meter: spend it when it'll reach
      if (me.meter >= MAX_METER && dist <= specialRange(me.id) && this.chance(this.L.special)) press = SPECIAL;
      // anti-air: they're jumping in
      else if (o.air && dist < 3200 && this.chance(this.L.aa)) {
        if (me.id === 'kevalanche') { hold = DOWN; press = HEAVY; } else press = HEAVY;
      }
      // punish: they whiffed something slow, close by
      else if (o.act === 'attack' && dist < rh + 500 && o.t > lastActive(FIGHTERS[o.id].moves[o.mv]) && this.chance(this.L.punish)) {
        if (rs && dist < rs) { hold = DOWN; press = HEAVY; } else press = HEAVY;
      } else if (dist <= rl + 150 && this.chance(this.L.aggro + 0.2)) {
        const r = this.rng.int(100);
        if (r < 40) press = LIGHT;
        else if (r < 62) { hold = DOWN; press = LIGHT; }
        else if (r < 85) press = HEAVY;
        else if (!shooter) { hold = DOWN; press = HEAVY; } else press = LIGHT;
      } else if (dist <= rh + 100 && this.chance(this.L.aggro)) {
        press = this.chance(0.7) ? HEAVY : LIGHT;
      } else if (shooter && dist > 3500 && this.chance(0.35 + this.L.aggro * 0.3)) {
        hold = DOWN; press = HEAVY;
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
        // footsies: drift toward the range its pokes like
        const want = shooter && me.meter < MAX_METER ? 4500 : rl * 0.9;
        if (dist > want + 400) hold = fwd;
        else if (dist < want - 900 && this.chance(0.5)) hold = back;
        else hold = this.chance(0.3) ? back : 0;
      }
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
