/* Rollback netcode (GGPO-style) for one side of an online match.

   Both peers run the same deterministic sim (src/sim/) at 60 ticks/s. Each
   tick the local player's mask is scheduled DELAY ticks ahead and sent; the
   remote player's mask for a tick we haven't heard yet is predicted as
   "same as their last one". When the real one arrives and it differs, the
   snapshot from that tick is restored and the sim re-run to the present.

   Nothing here knows about the network: `send(msg)` goes out, `receive(msg)`
   comes in (plain JSON-able objects). The input channel may drop, repeat or
   reorder packets — every packet carries all the inputs the other side
   hasn't acknowledged yet.

   Sim events come out of `advance()` exactly once per real occurrence:
   cosmetic ones (hits, dashes, …) as soon as a tick is simulated (keyed by
   tick, so a resimulation doesn't fire them again); the ones that change
   the flow (banners, round, K.O., time, end) only when their tick is
   confirmed — both inputs known — so a misprediction can't announce a K.O.
   that didn't happen.                                                     */

import { clone, stepInPlace, hash } from '../sim/sim.js';

export const DELAY = 2;            // local input delay, ticks
export const MAX_PREDICT = 8;      // stall rather than predict further than this
export const RING = 16;            // snapshots kept (≥ MAX_PREDICT + DELAY)
export const HASH_EVERY = 60;      // state hash exchange interval, ticks
const MAX_SEND = 32;               // inputs per packet, at most
const FLOW = new Set(['banner', 'round', 'ko', 'time', 'end']);

export class Rollback {
  /* st: the match state at tick 0 (identical on both peers); local: 0 or 1 */
  constructor(st, { local, send, delay = DELAY, onDesync = () => {} }) {
    this.st = st;
    this.local = local;
    this.send = send;
    this.delay = delay;
    this.onDesync = onDesync;
    this.frame = 0;                 // the next tick to simulate
    this.inp = [[], []];            // confirmed masks per side, by tick
    this.used = [];                 // the remote mask each simulated tick used
    this.snap = new Array(RING);    // snap[t % RING] = state at the start of tick t
    this.evLog = new Map();         // tick → events from its latest simulation
    this.fired = new Map();         // tick → keys of cosmetic events already fired
    this.flowDone = 0;              // flow events fired for ticks < this
    for (let t = 0; t < delay; t++) { this.inp[0][t] = 0; this.inp[1][t] = 0; }
    this.remoteN = delay;           // remote masks known, contiguous from 0
    this.remoteAck = delay;         // how many of OUR masks the remote has
    this.remoteFrame = 0;           // the remote's latest reported tick
    this.remoteAdv = 0;             // its frame advantage, as it reported it
    this.lastRemote = 0;
    this.rollbackFrom = Infinity;
    this.pending = 0;               // a mask sampled on a tick that waited
    this.hashed = 0;                // checkpoints hashed up to here
    this.hashes = new Map();        // tick → our hash
    this.theirHashes = new Map();   // tick → their hash
    this.desync = null;
    this.stats = { rollbacks: 0, maxRollback: 0, resimTicks: 0, stalls: 0, waits: 0 };
  }

  get remote() { return 1 - this.local; }
  get confirmed() { return Math.min(this.remoteN, this.frame); }

  /* the remote mask for tick t: the real one if known, else the last one */
  _remoteAt(t) {
    const r = this.inp[this.remote][t];
    return r !== undefined ? r : this.lastRemote;
  }

  receive(msg) {
    if (msg.t === 'in') {
      const R = this.remote;
      for (let j = 0; j < msg.i.length; j++) {
        const t = msg.s + j;
        if (this.inp[R][t] !== undefined) continue;
        this.inp[R][t] = msg.i[j];
        if (t < this.frame && this.used[t] !== msg.i[j]) this.rollbackFrom = Math.min(this.rollbackFrom, t);
      }
      while (this.inp[R][this.remoteN] !== undefined) this.remoteN++;
      this.lastRemote = this.inp[R][this.remoteN - 1];
      if (msg.a > this.remoteAck) this.remoteAck = msg.a;
      if (msg.f > this.remoteFrame) { this.remoteFrame = msg.f; this.remoteAdv = msg.adv; }
      // their latest checkpoint hash rides on every packet (so a lost one doesn't matter)
      if (msg.h && !this.theirHashes.has(msg.h[0])) { this.theirHashes.set(msg.h[0], msg.h[1]); this._checkHash(msg.h[0]); }
    }
  }

  /* our lead over the remote, in ticks (positive: we're ahead) */
  get advantage() { return this.frame - this.remoteFrame; }

  /* Should this tick wait? Hard stall when the prediction window is full;
     a soft one now and then when we're consistently ahead of the remote
     (time sync: both sides drift towards the same tick). */
  shouldWait() {
    if (this.frame - this.remoteN >= MAX_PREDICT) { this.stats.stalls++; return true; }
    const lead = (this.advantage - this.remoteAdv) / 2;
    if (lead >= 1 && this.frame % 8 === 0 && this.waitedAt !== this.frame) { this.waitedAt = this.frame; this.stats.waits++; return true; }
    return false;
  }

  /* One real tick. `mask` is the local player's input sampled now; it is
     scheduled for tick frame + delay. Returns the events to show, or null
     when this tick waited (nothing advanced). */
  advance(mask) {
    const L = this.local, out = [];
    this._rollback(out);
    if (this.shouldWait()) { this.pending |= mask; this._sendInputs(); this._flow(out); return out.length ? out : null; }
    const t = this.frame + this.delay;
    if (this.inp[L][t] === undefined) this.inp[L][t] = (mask | this.pending) | 0;
    this.pending = 0;
    this._sim(this.frame, out);
    this.frame++;
    this._sendInputs();
    this._flow(out);
    this._hashes();
    return out;
  }

  /* apply what has arrived and keep sending, without advancing (paused,
     or waiting at the end of a match) */
  idle() {
    const out = [];
    this._rollback(out);
    this._sendInputs();
    this._flow(out);
    this._hashes();
    return out;
  }

  /* simulate tick t from the current state (which is the state at its start) */
  _sim(t, out) {
    this.snap[t % RING] = clone(this.st);
    const L = this.local, a = this.inp[L][t] | 0, b = this._remoteAt(t);
    this.used[t] = b;
    const in1 = L === 0 ? a : b, in2 = L === 0 ? b : a;
    stepInPlace(this.st, in1, in2);
    const ev = this.st.ev.slice();
    this.evLog.set(t, ev);
    let fired = this.fired.get(t);
    if (!fired) this.fired.set(t, (fired = new Set()));
    const seen = {};
    for (const e of ev) {
      if (FLOW.has(e.k)) continue;
      let key = `${e.k}:${e.p ?? ''}`;
      seen[key] = (seen[key] || 0) + 1;
      key += `:${seen[key]}`;
      if (fired.has(key)) continue;
      fired.add(key);
      out.push(e);
    }
  }

  _rollback(out) {
    const from = this.rollbackFrom;
    this.rollbackFrom = Infinity;
    if (from >= this.frame) return;
    if (this.frame - from > RING) throw new Error(`rollback of ${this.frame - from} ticks is past the snapshot ring`);
    this.st = clone(this.snap[from % RING]);
    const n = this.frame - from;
    this.stats.rollbacks++;
    this.stats.resimTicks += n;
    if (n > this.stats.maxRollback) this.stats.maxRollback = n;
    for (let t = from; t < this.frame; t++) this._sim(t, out);
  }

  /* flow events fire once their tick is confirmed (and final) */
  _flow(out) {
    const c = this.confirmed;
    for (; this.flowDone < c; this.flowDone++) {
      const t = this.flowDone;
      for (const e of this.evLog.get(t) || []) if (FLOW.has(e.k)) out.push(e);
      // forget what's final
      this.evLog.delete(t); this.fired.delete(t);
      if (t > RING * 2) { delete this.used[t - RING * 2]; }
    }
  }

  _sendInputs() {
    const L = this.local, top = this.frame + this.delay;   // our masks run to top-1 (or top)
    let s = Math.max(this.remoteAck, top - MAX_SEND);
    const i = [];
    for (let t = s; this.inp[L][t] !== undefined && i.length < MAX_SEND; t++) i.push(this.inp[L][t]);
    const msg = { t: 'in', s, i, a: this.remoteN, f: this.frame, adv: this.advantage };
    if (this.lastHash) msg.h = this.lastHash;
    this.send(msg);
  }

  /* every HASH_EVERY ticks, once a checkpoint's state is final, hash it */
  _hashes() {
    const c = this.confirmed;
    for (let t = this.hashed + HASH_EVERY; t <= c && t < this.frame; t += HASH_EVERY) {
      this.hashed = t;
      const s = this.stateAt(t);
      if (!s) continue;              // out of the ring (can't happen while stalls hold)
      const h = hash(s);
      this.hashes.set(t, h);
      this.lastHash = [t, h];
      this._checkHash(t);
    }
  }

  _checkHash(t) {
    if (!this.hashes.has(t) || !this.theirHashes.has(t)) return;
    const ok = this.hashes.get(t) === this.theirHashes.get(t);
    this.stats.checked = (this.stats.checked || 0) + 1;
    if (!ok && !this.desync) {
      this.desync = { tick: t, ours: this.hashes.get(t), theirs: this.theirHashes.get(t) };
      this.onDesync(this.desync, this.snap[t % RING]);
    }
    this.hashes.delete(t); this.theirHashes.set(t, null);   // compared: keep only the marker
    if (ok) this.theirHashes.delete(t - HASH_EVERY * 8);
  }

  /* the state at a checkpoint, if still in the ring (desync dumps) */
  stateAt(t) { const s = this.snap[t % RING]; return s && s.tick === t ? s : null; }
}
