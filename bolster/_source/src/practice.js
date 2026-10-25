/* Practice: a fighter against a practice dummy, locally only.

   The match is an ordinary sim match (createMatch / stepInPlace) — the
   moves, boxes and frame data are the real ones — with a few things done to
   its state between ticks, here, never inside the sim: the intro skipped,
   the clock held, STUFFING refilled (and never let low enough to be K.O.'d),
   the meter held full if asked. The dummy is player 2, driven like a CPU:
   a mask per tick from its settings (stand, crouch, jump, block, block low,
   a random guard), its dice its own seeded PRNG.

   Nothing here touches the network, the app's match seed or any other
   match: online, the lobby's practice runs while the host waits for a
   friend (and while a guest connects) and is thrown away when they meet.
   Also here: the combo readout (hits, damage, AMPLIFIED!) and the input
   history the input display draws.                                      */

import { createMatch, stepInPlace, ROUND_TICKS } from './sim/sim.js';
import { FIGHTERS, MAX_METER } from './fighters/index.js';
import { UP, DOWN, BLOCK } from './sim/input.js';
import { makeRng } from './sim/rng.js';

export const DUMMY_MODES = [
  { id: 'stand', key: '1', label: 'Stand' },
  { id: 'crouch', key: '2', label: 'Crouch' },
  { id: 'jump', key: '3', label: 'Jump' },
  { id: 'block', key: '4', label: 'Block (E)' },
  { id: 'blocklow', key: '5', label: 'Block low' },
  { id: 'random', key: '6', label: 'Random block' },
];

/* the dummy's STUFFING never drops below this (bigger than any one hit,
   amplified and counter-hit), so practice never ends in a K.O. */
export const FLOOR = 450;
/* idle this long after a combo and the dummy's refilled */
export const REFILL_AFTER = 45;

export const defaultSettings = () => ({ mode: 'stand', refill: true, meter: false });

export class Dummy {
  constructor(side = 1, seed = 1) {
    this.side = side;
    this.rng = makeRng(seed * 40503 + 7);
    this.guard = BLOCK;
    this.lastAtk = -1;
  }

  /* this tick's mask for the dummy */
  input(st, S) {
    const me = st.f[this.side], o = st.f[1 - this.side];
    switch (S.mode) {
      case 'crouch': return DOWN;
      case 'jump': return UP;
      case 'block': return BLOCK;
      case 'blocklow': return BLOCK | DOWN;
      case 'random': {
        // a fresh guess each time they start something (or now and then):
        // stand, crouch — or, one time in four, no guard at all
        const start = o.act === 'attack' && o.t <= 1 ? st.tick - o.t : -1;
        if ((start >= 0 && start !== this.lastAtk) || st.tick % 90 === 0) {
          if (start >= 0) this.lastAtk = start;
          const r = this.rng.int(4);
          this.guard = r === 0 ? 0 : r === 1 ? BLOCK | DOWN : BLOCK;
        }
        // (never crouched under someone in the air: that's a free overhead)
        return me.act === 'blockstun' ? this.guard || BLOCK : this.guard & (o.air ? ~DOWN : ~0);
      }
      default: return 0;
    }
  }
}

/* a practice match: straight into the fight, the clock off */
export function practiceMatch({ p1, p2, seed = 1 }) {
  const st = createMatch({ p1, p2, seed });
  st.phase = 'fight'; st.pt = 0; st.ev = [];
  return st;
}

/* between ticks: hold the clock, keep both standing, refill, the meter */
export function practiceAfter(st, S, mem) {
  st.timer = ROUND_TICKS;
  const d = st.f[1], p = st.f[0];
  const busy = (f) => f.act === 'hitstun' || f.act === 'blockstun' || f.act === 'down' || f.act === 'getup' || f.act === 'grabbed' || f.air;
  mem.calm = busy(d) ? 0 : (mem.calm || 0) + 1;
  const max = FIGHTERS[d.id].health;
  if (S.refill && mem.calm >= REFILL_AFTER && d.hp < max) d.hp = max;
  if (d.hp < FLOOR) d.hp = FLOOR;
  p.hp = FIGHTERS[p.id].health;
  if (S.meter && !(p.act === 'attack' && FIGHTERS[p.id].moves[p.mv].kind === 'special')) p.meter = MAX_METER;
}

/* the combo readout: the current (or last) combo by player `k` */
export class ComboMeter {
  constructor(k = 0) { this.k = k; this.cur = null; this.last = null; this.best = 0; }
  event(e) {
    if (e.k !== 'hit' || e.p !== this.k) return;
    if (e.n === 1 || !this.cur) this.cur = { hits: 0, dmg: 0, amp: 0, ctr: 0 };
    const c = this.cur;
    c.hits = e.n; c.dmg += e.dmg; if (e.amp) c.amp = 1; if (e.ctr) c.ctr = 1;
    this.last = c;
    this.best = Math.max(this.best, c.dmg);
  }
}

/* the input display: masks run-length coded, newest first */
export class InputLog {
  constructor(n = 14) { this.n = n; this.rows = []; }
  push(m) {
    const r = this.rows[0];
    if (r && r.m === m) { r.t++; return; }
    this.rows.unshift({ m, t: 1 });
    if (this.rows.length > this.n) this.rows.pop();
  }
}

/* step a practice match n ticks with player 1's inputs from `p1` (tests) */
export function runPractice(st, S, p1, n, dummy = new Dummy(1, 1), onEv = null) {
  const mem = {};
  for (let i = 0; i < n; i++) {
    stepInPlace(st, p1(i, st), dummy.input(st, S));
    if (onEv) for (const e of st.ev) onEv(e);
    practiceAfter(st, S, mem);
  }
  return st;
}
