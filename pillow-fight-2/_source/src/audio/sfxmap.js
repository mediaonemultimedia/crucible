/* Sim events → sounds (presentation only).

   The fight hands every sim event to `SfxRouter.route(e, tick)` after the
   tick has run (never inside the sim), and the state to `whooshes(st)`.
   Nothing here writes to the state or the event: it only reads them.

   Rollback-safe: online, a tick can be simulated more than once (predicted,
   then rolled back and resimulated). The session already hands each
   cosmetic event out once per tick (net/rollback.js), but a resimulation can
   move a hit a tick or two. So a sound is keyed by (tick, kind, player,
   ordinal) — never fired twice — and the same kind for the same player
   inside NEAR ticks of one already fired is the same sound, moved: dropped. */

import { FIGHTERS } from '../fighters/index.js';

export const NEAR = 2;               // ticks: a resimulated event moved this far is the same one
export const WHOOSH_GAP = 7;         // ticks between two swings' whooshes, per player (a flurry isn't a whoosh per frame)
const KEEP = 240;                    // ticks of history kept for the dedupe

/* the moves that swing big (a heavy whoosh); the rest of the attacks are light */
const HEAVY_MOVES = new Set(['heavy', 'airHeavy', 'signature', 'special', 'dive']);
const NO_WHOOSH = new Set(['throw', 'throwHold', 'specialHold']);

/* a pseudo-random spread from the event itself (not Math.random: the same
   event always sounds the same, which keeps captures and tests repeatable) */
function spread(tick, salt) {
  let h = (tick * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return ((h >>> 0) % 1000) / 1000 * 2 - 1;      // -1 … 1
}

/* the variation on a hit: pitch ±6 %, gain ±1.5 dB */
const vary = (tick, salt, pitch = 0.06, gain = 0.16) => ({
  rate: 1 + pitch * spread(tick, salt),
  gain: 1 + gain * spread(tick, salt + 7),
});

export function isHeavyHit(e) {
  return e.kind !== 'normal' || e.sp || e.amp || e.kd || e.dmg >= 62;
}

/* an event's place among the same kind and player in its tick's list (1, 2, …) */
export function ordinal(list, e) {
  let n = 0;
  for (const x of list) { if (x.k === e.k && x.p === e.p) n++; if (x === e) return n; }
  return 1;
}

/* online: the tick an event came from and its ordinal there, read from the
   rollback session (never written). Its log first; an event whose tick was
   confirmed (and let go of) in the same advance is found in the snapshot
   ring by content — the state at the start of tick T carries tick T's
   events (`since`: the session's flowDone before the advance). Not found
   (a flow event): now. */
export function sessionTickOf(S, e, since = 0) {
  for (const [t, list] of S.evLog) if (list.includes(e)) return [t + 1, ordinal(list, e)];
  const key = JSON.stringify(e);
  for (let T = Math.max(1, since); T <= S.flowDone; T++) {
    const s = T === S.frame ? S.st : S.stateAt(T);
    if (!s) continue;
    const i = s.ev.findIndex((x) => JSON.stringify(x) === key);
    if (i >= 0) return [T, ordinal(s.ev, s.ev[i])];
  }
  return [S.st.tick, 1];
}

/* one event → the sounds it makes: [{ id, gain, rate, delay }] */
export function soundsFor(e, tick = 0) {
  const p = e.p ?? 0;
  switch (e.k) {
    case 'hit': {
      const heavy = isHeavyHit(e), v = vary(tick, p + 1);
      let gain = v.gain, rate = v.rate;
      // a counter-hit: a touch louder and lower
      if (e.ctr) { gain *= 1.25; rate *= 0.92; }
      if (e.amp) gain *= 1.15;
      const out = [{ id: heavy ? 'hit-heavy' : 'hit-light', gain, rate, delay: 0 }];
      if (heavy) out.push({ id: 'thump', gain: gain * (e.amp ? 1.2 : 1), rate, delay: 0 });
      return out;
    }
    case 'block': return [{ id: 'block', ...vary(tick, p + 3, 0.05, 0.12), delay: 0 }];
    case 'clash': return [{ id: 'hit-light', ...vary(tick, 9), delay: 0 }];
    case 'tech': return [{ id: 'block', gain: 1.1, rate: 1.12, delay: 0 }];
    case 'grab': return [{ id: 'grab', gain: 1, rate: e.throw ? 1 : 0.9, delay: 0 }];
    case 'throw': return [{ id: 'whoosh-light', gain: 0.8, rate: 1.1, delay: 0 }];     // a shot leaves the hand
    case 'jump': return [{ id: 'jump', ...vary(tick, p + 5, 0.05, 0.1), delay: 0 }];
    case 'land': return e.hard
      ? [{ id: 'knockdown', ...vary(tick, p + 11, 0.05, 0.1), delay: 0 }]
      : [{ id: 'land', ...vary(tick, p + 13, 0.05, 0.1), delay: 0 }];
    case 'slam': return [{ id: 'knockdown', gain: 1.15, rate: 0.94, delay: 0 }, { id: 'thump', gain: 0.9, rate: 0.9, delay: 0 }];
    case 'kobounce': return [{ id: 'knockdown', gain: 1.2, rate: 0.9, delay: 0 }];
    // the K.O. hit: the big hit and the stuffing bursting out; the crowd
    // comes on the K.O. itself (a flow event: confirmed online)
    case 'koflash': return [{ id: 'hit-heavy', gain: 1.3, rate: 0.88, delay: 0 }, { id: 'thump', gain: 1.3, rate: 0.85, delay: 0 }, { id: 'feather-burst', gain: e.final ? 1.15 : 1, rate: 1, delay: 0.02 }];
    // PF2: off the bed — the crowd's gasp, a whoosh as he goes over, the thud on the carpet comes with the bounce
    case 'ringout': return [{ id: 'whoosh-heavy', gain: 1.2, rate: 0.8, delay: 0 }, { id: 'crowd-ooh', gain: 1.1, rate: 1.05, delay: 0.05 }];
    case 'side': return [{ id: 'whoosh-light', gain: 0.45, rate: 1.3, delay: 0 }];
    case 'ko': return [{ id: 'crowd-ooh', gain: e.final ? 1.1 : 0.95, rate: 1, delay: 0.12 }];
    default: return [];
  }
}

/* which attacks just started this tick, read off the state: [{ p, heavy, key }] */
export function swingsIn(st) {
  const out = [];
  for (let p = 0; p < 2; p++) {
    const f = st.f[p];
    if (f.act !== 'attack' || !f.mv || NO_WHOOSH.has(f.mv) || f.t > 2) continue;
    const m = FIGHTERS[f.id]?.moves[f.mv];
    if (!m || m.kind === 'throw') continue;
    out.push({ p, heavy: HEAVY_MOVES.has(f.mv), mv: f.mv, start: st.tick - f.t });
  }
  return out;
}

export class SfxRouter {
  constructor() {
    this.fired = new Map();       // `${tick}:${k}:${p}:${n}` → tick
    this.last = new Map();        // `${k}:${p}` → ticks fired at (recent)
    this.swing = [null, null];    // per player: { mv, start, at }
    this.top = 0;
  }

  _near(kp, tick) {
    const L = this.last.get(kp);
    return L ? L.some((t) => Math.abs(t - tick) <= NEAR) : false;
  }

  _mark(kp, tick) {
    const L = this.last.get(kp) || [];
    L.push(tick);
    while (L.length > 6) L.shift();
    this.last.set(kp, L);
  }

  /* the events of one tick (in order) → the sounds to play now */
  routeTick(events, tick) {
    const seen = {}, out = [];
    for (const e of events) {
      const kp = `${e.k}:${e.p ?? ''}`;
      seen[kp] = (seen[kp] || 0) + 1;
      out.push(...this._route(e, tick, kp, seen[kp]));
    }
    return out;
  }

  /* one event of tick `tick` (n: its ordinal among the same kind and player that tick) */
  route(e, tick, n = 1) { return this._route(e, tick, `${e.k}:${e.p ?? ''}`, n); }

  _route(e, tick, kp, n) {
    const key = `${tick}:${kp}:${n}`;
    if (this.fired.has(key)) return [];
    const s = soundsFor(e, tick);
    if (!s.length) return [];
    // the same sound moved a tick or two by a resimulation (the first of a tick only:
    // a second hit on the same tick is a real one)
    if (n === 1 && this._near(kp, tick)) { this.fired.set(key, tick); return []; }
    this.fired.set(key, tick);
    this._mark(kp, tick);
    this._prune(tick);
    return s;
  }

  /* attack startups → whooshes (light quieter than heavy; one per swing; rate-limited) */
  whooshes(st) {
    const out = [];
    for (const s of swingsIn(st)) {
      const w = this.swing[s.p];
      // the same swing (seen again a tick later, or resimulated a tick off)
      if (w && w.mv === s.mv && Math.abs(w.start - s.start) <= NEAR) continue;
      if (w && s.start - w.start < WHOOSH_GAP && s.start >= w.start) { this.swing[s.p] = { ...s }; continue; }
      this.swing[s.p] = { ...s };
      const v = vary(s.start, s.p + 21, 0.07, 0.12);
      out.push({ id: s.heavy ? 'whoosh-heavy' : 'whoosh-light', gain: v.gain * (s.heavy ? 1 : 0.6), rate: v.rate, delay: 0 });
    }
    return out;
  }

  _prune(tick) {
    if (tick < this.top + 60) return;
    this.top = tick;
    for (const [k, t] of this.fired) if (t < tick - KEEP) this.fired.delete(k);
  }

  /* a new match (ticks start again from 0) */
  reset() { this.fired.clear(); this.last.clear(); this.swing = [null, null]; this.top = 0; }
}
