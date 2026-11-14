/* The computer, in 3D. It reads the sim's state (never writes it) and
   emits the same 10-bit mask a keyboard does, from its own seeded PRNG, so a
   CPU match replays exactly.

   Three levels: how late it reacts, how often it blocks or sidesteps what
   it sees coming, how pushy it is, how well it minds the edge.
   - Far: walk or dash in; a shot now and then (the throwers).
   - Close: lights (strings), heavies, lows, throws on a blocker, the spin on
     someone who sidesteps a lot, the special on a full meter.
   - Defence: a linear attack seen in time is sidestepped (or blocked); a
     low is crouch-blocked; a circular one blocked.
   - The ring: back to the edge, it circles off it; the other one's back to
     the edge, it goes for the heavy (a ring-out).                        */

import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK, JUMP, CROUCH } from '../sim/input.js';
import { FIGHTERS, MAX_METER, reachOf, frameData, isShot } from '../fighters/index.js';
import { roomAlong, isqrt, unit } from '../sim/sim.js';
import { makeRng } from '../sim/rng.js';

const LV = {
  easy: { react: 24, block: 22, side: 10, aggr: 30, think: 18, throwP: 8, edge: 30, sweep: 20, special: 30 },
  normal: { react: 14, block: 48, side: 30, aggr: 55, think: 11, throwP: 25, edge: 70, sweep: 50, special: 70 },
  hard: { react: 8, block: 70, side: 55, aggr: 72, think: 6, throwP: 45, edge: 95, sweep: 85, special: 95 },
};

export class CPU {
  constructor(k, level = 'normal', seed = 1) {
    this.k = k; this.level = level; this.L = LV[level] || LV.normal;
    this.rng = makeRng(seed * 2654435761);
    this.plan = [];
    this.wait = 0;
    this.seen = -1;           // the attack (tick it started) already answered
    this.sideSeen = 0;        // how often the other one sidesteps
    this.lastO = '';
  }

  chance(pc) { return this.rng.int(100) < pc; }

  input(st) {
    const k = this.k, f = st.f[k], o = st.f[1 - k], L = this.L;
    if (st.phase !== 'fight') { this.plan = []; return 0; }
    const fwdBit = k === 0 ? RIGHT : LEFT, backBit = k === 0 ? LEFT : RIGHT;
    if (o.act !== this.lastO && (o.act === 'side')) this.sideSeen = Math.min(10, this.sideSeen + 1);
    this.lastO = o.act;
    // a plan under way: its next input
    if (this.plan.length) {
      const p = this.plan[0];
      if (--p.n <= 0) this.plan.shift();
      return p.m;
    }
    const busy = !(f.act === 'idle' || f.act === 'walkF' || f.act === 'walkB' || f.act === 'crouch' || f.act === 'guard' || f.act === 'circle' || f.act === 'blockstun' || f.act === 'side');
    const d = isqrt((o.x - f.x) ** 2 + (o.z - f.z) ** 2);
    const D = FIGHTERS[f.id], M = D.moves;

    // ── defence: an attack coming, seen `react` ticks in ───────────────────
    if (o.act === 'attack' && o.t >= L.react && st.tick - o.t !== this.seen && !busy) {
      const m = FIGHTERS[o.id].moves[o.mv];
      const start = frameData(m).startup;
      const reach = reachOf(m) + 900;
      if ((d < reach || m.spawn.length) && o.t < start + 3) {
        this.seen = st.tick - o.t;
        const low = m.low || m.hits.some((h) => h.level === 'low');
        const lin = !m.circ && m.kind !== 'throw';
        if (lin && start - o.t >= 6 && this.chance(L.side)) return this._do([[UP * 0 + (this.chance(50) ? UP : DOWN), 1], [0, 12]]);
        if (this.chance(L.block)) return this._do([[BLOCK | (low ? CROUCH : 0), Math.max(8, start - o.t + 10)]]);
      }
    }
    // a shot in flight toward us: sidestep it or block
    const shot = st.proj.find((p) => p.o !== k && isqrt((p.x - f.x) ** 2 + (p.z - f.z) ** 2) < 3500);
    if (shot && !busy && this.seen !== -shot.id - 2) {
      this.seen = -shot.id - 2;
      if (this.chance(L.side + 10)) return this._do([[this.chance(50) ? UP : DOWN, 1], [0, 10]]);
      if (this.chance(L.block)) return this._do([[BLOCK | (shot.level === 'low' ? CROUCH : 0), 22]]);
    }
    // just blocked something: punish with a light or a throw
    if (f.act === 'blockstun' && f.stun <= 1 && d < 2400) {
      return this._do(this.chance(L.throwP) ? [[LIGHT | HEAVY, 1], [0, 4]] : [[LIGHT, 1], [0, 4]]);
    }
    if (busy) {
      // on the floor: maybe hold block for the get-up
      return f.act === 'getup' && this.chance(L.block) ? BLOCK : 0;
    }
    if (this.wait > 0) { this.wait--; return f.act === 'guard' ? BLOCK : 0; }
    this.wait = L.think + this.rng.int(L.think + 1);

    // ── the ring ──────────────────────────────────────────────────────────
    const [ux, uz] = unit(o.x - f.x, o.z - f.z, f.fx, f.fz);
    const myRoom = roomAlong(f.x, f.z, -ux, -uz), oRoom = roomAlong(o.x, o.z, ux, uz);
    if (myRoom < 2200 && this.chance(L.edge)) {
      // off the edge: a sidestep then circle, or a dash in past them
      const s = this.chance(50) ? UP : DOWN;
      return this._do([[s, 1], [0, 1], [s, 30]]);
    }
    const lReach = reachOf(M.light), hReach = reachOf(M.heavy), sReach = reachOf(M.sweep);
    // ── the special: full meter, in range ────────────────────────────────
    if (f.meter >= MAX_METER && this.chance(L.special) && (d < hReach + 800 || M.special.spawn.length || M.special.grab)) {
      return this._do([[SPECIAL, 1], [0, 6]]);
    }
    // ── far: in, or shoot ─────────────────────────────────────────────────
    if (d > hReach + 300) {
      if (isShot(M.signature) && d > 4200 && this.chance(35)) return this._do([[HEAVY | CROUCH, 1], [0, 20]]);
      if (d > 4500 && this.chance(35)) return this._do([[fwdBit, 2], [0, 2], [fwdBit, 2], [0, 10]]);
      if (this.chance(12)) return this._do([[this.chance(50) ? UP : DOWN, 1], [0, 8]]);
      this.wait = 0;
      return this._do([[fwdBit, 8 + this.rng.int(12)]]);
    }
    // ── close ─────────────────────────────────────────────────────────────
    if (!this.chance(L.aggr)) {
      // patience: block a moment, back off, or circle
      const r = this.rng.int(3);
      if (r === 0) return this._do([[BLOCK, 14]]);
      if (r === 1 && myRoom > 3000) return this._do([[backBit, 10]]);
      return this._do([[this.chance(50) ? UP : DOWN, 1], [0, 6]]);
    }
    // the other one's back to the edge: the ring-out heavy
    if (oRoom < 1600 && d < hReach && this.chance(L.edge)) return this._do([[HEAVY, 1], [0, 30]]);
    // a sidestepper: the spin
    if ((o.act === 'side' || o.act === 'circle' || this.sideSeen > 2) && d < sReach + 200 && this.chance(L.sweep)) {
      this.sideSeen = Math.max(0, this.sideSeen - 3);
      return this._do([[HEAVY | backBit, 1], [0, 40]]);
    }
    // a blocker: throw
    if ((o.act === 'guard' || o.blk) && d < 2300 && this.chance(L.throwP + 25)) return this._do([[LIGHT | HEAVY, 1], [0, 30]]);
    if (d > lReach + 100) {
      if (this.chance(40)) return this._do([[HEAVY, 1], [0, 30]]);
      return this._do([[fwdBit, 6]]);
    }
    const r = this.rng.int(100);
    if (r < 35) return this._do([[LIGHT, 1], [0, 7], [LIGHT, 1], [0, 7], ...(this.chance(50) ? [[HEAVY, 1], [0, 30]] : [])]);
    if (r < 50) return this._do([[LIGHT | CROUCH, 1], [CROUCH, 10]]);
    if (r < 65) return this._do([[HEAVY | CROUCH, 1], [0, 30]]);
    if (r < 80) return this._do([[HEAVY, 1], [0, 30]]);
    if (r < 90) return this._do([[LIGHT | HEAVY, 1], [0, 30]]);
    return this._do([[JUMP | fwdBit, 4], [0, 4], [HEAVY, 1], [0, 30]]);
  }

  /* start a plan: [[mask, ticks], …]; returns its first input */
  _do(steps) {
    this.plan = steps.map(([m, n]) => ({ m, n }));
    const p = this.plan[0];
    if (--p.n <= 0) this.plan.shift();
    return p.m;
  }
}
