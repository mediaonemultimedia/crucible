/* Which sound a sim event makes — pure, so the tests can check it without
   an AudioContext. Presentation only: it reads events and the state after
   the tick and returns cues; it never writes to either.

   A cue: { id, gain, rate, pan, delay } (gain/rate around 1; pan -1..1;
   delay in seconds). The engine (audio/engine.js) turns ids into voices.

   Rollback: online, a predicted tick can be simulated again after the other
   player's input arrives. The session (net/rollback.js) already hands each
   event over once per (tick, kind, player, ordinal), as the visual pops get
   them; `SoundGate` keeps the same key for sounds and also drops a repeat of
   the same kind for the same player a tick or two away (a re-simulation that
   moved the event by a tick), so a corrected hit never plays twice.
   Attack swings have no event of their own: `Swings` reads them from the
   state (a fighter whose move started this tick or the last few), keyed by
   the move's first tick, rate-limited per fighter. Online it reads the
   session's snapshots of the last few ticks too (read only), so the other
   player's attack, which this side learns of a few ticks late, still gets
   its whoosh — once.                                                       */

import { FIGHTERS } from '../fighters/index.js';

export const SFX_IDS = ['hit-light', 'hit-heavy', 'block', 'whoosh', 'grab', 'knockdown', 'jump', 'land', 'feather-burst', 'crowd-ooh', 'ui-tick', 'ui-confirm'];

const STAGE_HALF = 6500;              // sim units, roughly wall to wall / 2
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const panAt = (x) => (Number.isFinite(x) ? clamp(x / STAGE_HALF, -1, 1) * 0.45 : 0);

/* a small variation per play (pitch ±6 %, gain ±10 %) so repeats don't sound
   robotic; rnd: () => [0, 1) (Math.random in the game, seeded in tests) */
const vary = (rnd, rate, gain, r = 0.06, g = 0.1) => ({ rate: rate * (1 + (rnd() * 2 - 1) * r), gain: gain * (1 + (rnd() * 2 - 1) * g) });

/* a hit is heavy if it's big, knocks down, is amplified, or is a special /
   signature (fight.js draws the same ones with the big spark) */
export function heavyHit(e) {
  return e.dmg >= 70 || !!e.kd || !!e.amp || !!e.sp || e.kind === 'special' || e.kind === 'signature' || e.kind === 'throw';
}

export function soundsFor(e, st, rnd = Math.random) {
  const at = (p) => (st && st.f && st.f[p] ? st.f[p].x : 0);
  const out = [];
  const cue = (id, o = {}) => out.push({ id, gain: 1, rate: 1, pan: 0, delay: 0, ...o });
  switch (e.k) {
    case 'hit': {
      const heavy = heavyHit(e), pan = panAt(e.x);
      const v = vary(rnd, heavy ? 1 : 1.04, heavy ? 1 : 0.85);
      // a counter-hit: a touch louder and lower
      if (e.ctr) { v.gain *= 1.2; v.rate *= 0.92; }
      if (e.amp) { v.gain *= 1.15; v.rate *= 0.95; }
      cue(heavy ? 'hit-heavy' : 'hit-light', { ...v, pan });
      // a throw's slam into the mat
      if (e.thr) cue('knockdown', { ...vary(rnd, 1, 0.95), pan, delay: 0.02 });
      break;
    }
    case 'block': cue('block', { ...vary(rnd, e.dmg >= 70 ? 0.9 : 1.05, e.dmg >= 70 ? 1 : 0.8), pan: panAt(e.x) }); break;
    case 'clash': cue('block', { ...vary(rnd, 1.2, 0.8), pan: panAt(e.x) }); break;
    case 'tech': cue('block', { ...vary(rnd, 1.3, 0.9), pan: panAt(e.x) }); break;
    case 'grab': cue('grab', { ...vary(rnd, 1, 1, 0.04), pan: panAt(at(e.p)) }); break;
    case 'throw': cue('whoosh', { ...vary(rnd, 1.15, 0.55), pan: panAt(at(e.p)) }); break;   // a shot leaves the hand
    case 'jump': cue('jump', { ...vary(rnd, 1, 0.7, 0.05), pan: panAt(at(e.p)) }); break;
    case 'land':
      if (e.hard) cue('knockdown', { ...vary(rnd, 1, 0.9), pan: panAt(at(e.p)) });
      else cue('land', { ...vary(rnd, 1, 0.6, 0.06), pan: panAt(at(e.p)) });
      break;
    case 'slam': cue('knockdown', { ...vary(rnd, 0.92, 1.1), pan: panAt(e.x) }); break;
    case 'kobounce': cue('knockdown', { ...vary(rnd, 0.95, 1), pan: panAt(e.x) }); break;
    case 'dash': cue('whoosh', { ...vary(rnd, 1.35, 0.3), pan: panAt(at(e.p)) }); break;
    case 'koflash':
      // the K.O. hit: the hardest thump, the stuffing bursting out, the crowd
      cue('hit-heavy', { gain: 1.25, rate: 0.86, pan: panAt(e.x) });
      cue('feather-burst', { gain: e.final ? 1.1 : 0.95, rate: 1, pan: panAt(e.x), delay: 0.03 });
      cue('crowd-ooh', { gain: e.final ? 1 : 0.8, rate: 1, delay: 0.18 });
      break;
    case 'koapex':
      // a Fluffatality: he bursts at the top of the arc
      if (st && st.fluff && st.f[e.p] && st.f[e.p].act === 'ko') cue('feather-burst', { gain: 1.1, rate: 0.9, pan: panAt(e.x) });
      break;
    default: break;
  }
  return out;
}

/* once per (tick, kind, player, ordinal), and never the same kind for the
   same player within `near` ticks of one already played (online: a
   re-simulation that shifted the event) */
export class SoundGate {
  constructor({ near = 0, keep = 240 } = {}) {
    this.near = near;
    this.keep = keep;
    this.exact = new Set();
    this.last = new Map();       // `${k}:${p}` → ticks played (recent)
  }

  admit(e, tick) {
    const base = `${e.k}:${e.p ?? ''}`;
    let n = 0, key;
    do key = `${tick}:${base}:${n++}`; while (this._batch?.has(key));
    (this._batch || (this._batch = new Set())).add(key);
    if (this.exact.has(key)) return false;
    if (this.near > 0) {
      const ts = this.last.get(base);
      if (ts && ts.some((t) => t !== tick && Math.abs(t - tick) <= this.near)) return false;
    }
    this.exact.add(key);
    const ts = this.last.get(base) || [];
    ts.push(tick);
    while (ts.length > 8) ts.shift();
    this.last.set(base, ts);
    this._prune(tick);
    return true;
  }

  /* call between batches (a new frame's events): the ordinal restarts */
  flush() { this._batch = null; }

  _prune(tick) {
    if (this.exact.size < 512) return;
    for (const k of this.exact) if (+k.slice(0, k.indexOf(':')) < tick - this.keep) this.exact.delete(k);
  }
}

/* attack swings, read from the state after each tick: a fighter in a move
   that began within the last few ticks gets one whoosh for it (keyed by the
   move and its first tick, so a re-simulated or re-read tick never plays it
   again); light quieter and brighter than heavy, specials lowest; at most
   one per fighter every `gap` ticks (a flurry isn't a whoosh per frame) */
const NO_SWING = new Set(['throw', 'throwHold', 'specialHold']);
export class Swings {
  constructor({ gap = 7, window = 3 } = {}) { this.gap = gap; this.window = window; this.done = new Set(); this.starts = [[], []]; }

  read(st, rnd = Math.random) {
    const out = [];
    for (let k = 0; k < 2; k++) {
      const f = st.f[k];
      if (f.act !== 'attack' || !f.mv || NO_SWING.has(f.mv) || f.t > this.window) continue;
      const start = st.tick - f.t, key = `${k}:${start}:${f.mv}`;
      if (this.done.has(key)) continue;
      this.done.add(key);
      // (online, a start can come to light late, after newer ones: compare to all recent)
      if (this.starts[k].some((s) => Math.abs(start - s) < this.gap)) continue;
      this.starts[k].push(start);
      if (this.starts[k].length > 6) this.starts[k].shift();
      const m = FIGHTERS[f.id]?.moves?.[f.mv];
      const kind = m?.kind || 'normal', lite = !!m?.lite;
      const big = kind === 'special' || kind === 'signature';
      const v = vary(rnd, big ? 0.8 : lite ? 1.18 : 0.92, big ? 1 : lite ? 0.42 : 0.75, 0.07, 0.12);
      out.push({ id: 'whoosh', gain: v.gain, rate: v.rate, pan: panAt(f.x), delay: 0, p: k, start, mv: f.mv });
    }
    if (this.done.size > 400) this.done = new Set([...this.done].slice(-100));
    return out;
  }
}
