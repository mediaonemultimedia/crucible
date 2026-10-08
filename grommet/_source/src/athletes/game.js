/* What every athlete shares: attention, balance, footwork, the ball in play.

   An athlete is a game on top of the soft body, the way Flock's toys were.
   Per fixed step (`update`) it decides — where the ball will be, which
   stroke, when to move — and re-poses the sewn shape (pose.js); per
   substep (`_apply`, a soft-body hook) it pushes: balance, a shuffle across
   the floor, the ball's own flight and collisions, anything the sport adds.

   Attention is Flock's: the head turns to look (a pose of the head's points
   about the neck, eased by springs), the ears follow, the bead eyes roll
   toward the target (`gaze`, read by the page).

   Subclasses fill in: `_think(dt)` (the sport, per fixed step), `_bones()`
   (extra pose bones), `_push(h)` (extra forces per substep), `launch()`,
   `readout()`, `status()`.                                                */

import { Pose, spring, ease, clamp, TAU } from '../pose.js';
import { smooth } from '../rigbuilder.js';
import { balance } from '../balance.js';

export class Athlete {
  constructor(soft) {
    this.soft = soft;
    this.rig = soft.rig;
    this.cfg = soft.rig.toy;
    this.name = this.rig.name;
    this.pose = new Pose(soft, this.cfg.posed);
    this.yaw = spring(); this.pitch = spring(); this.earTurn = spring(); this.perk = spring();
    this.att = 0;
    this.time = 0;
    this.t = 0;                 // time in the current state
    this.state = 'ready';
    this.ball = null;
    this.events = [];           // {kind, …} for the page: dents, sounds-that-aren't, flashes
    this.gaze = null;
    this.balanceK = 0.006;      // per substep (see balance.js)
    this.lean = null;
    this.face = 0;              // keeps squaring up to the play (+z)
    this.drive = null;          // footwork target {x, z, speed}
    this.stepPhase = 0;
    this.daze = 0;              // 0…1, wobbly after a knock
    this.auto = false;
    this._lastYaw = 0;
    const rest = this.rig.rest, ix0 = this.rig.clouds[0].ix;
    this.c0 = [0, 0, 0];
    for (const i of ix0) for (let d = 0; d < 3; d++) this.c0[d] += rest[i * 3 + d] / ix0.length;
    this.home = [this.c0[0], this.c0[2]];
    this.standY = null;         // set while getting up (see balance.js)
    // the feet: the leg chains' points and whatever cloud points lie low
    this.feet = [[], []];
    for (const i of ix0) if (rest[i * 3 + 1] < 0.36) this.feet[rest[i * 3] < 0 ? 0 : 1].push(i);
    this.feet = this.feet.map((f) => Int32Array.from(f));
    soft.hooks.push((h) => this._apply(h));
  }

  /* ── where things are ─────────────────────────────────────────────────── */

  headCentre(out = [0, 0, 0]) {
    const x = this.soft.x, ix = this.cfg.core;
    out[0] = out[1] = out[2] = 0;
    for (const i of ix) { out[0] += x[i * 3]; out[1] += x[i * 3 + 1]; out[2] += x[i * 3 + 2]; }
    out[0] /= ix.length; out[1] /= ix.length; out[2] /= ix.length;
    return out;
  }

  /* a world vector in the body's own frame (cloud 0) */
  toLocal(v) {
    const R = this.soft.cloudR[0];
    return [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
  }

  /* a rest-frame point of the body, where it is now */
  worldOf(p) {
    const R = this.soft.cloudR[0], c = this.soft.cloudC[0], c0 = this.c0;
    const qx = p[0] - c0[0], qy = p[1] - c0[1], qz = p[2] - c0[2];
    return [c[0] + R[0] * qx + R[1] * qy + R[2] * qz, c[1] + R[3] * qx + R[4] * qy + R[5] * qz, c[2] + R[6] * qx + R[7] * qy + R[8] * qz];
  }

  /* the rest-frame position of a point and of the cloud's centre, now */
  centre() { return this.soft.cloudC[0]; }

  /* ── every fixed step ─────────────────────────────────────────────────── */

  update(dt) {
    this.time += dt;
    this.t += dt;
    this._think(dt);
    // attention: anything the sport wants looked at
    const T = this.lookAt;
    const hc = this.headCentre();
    let aT = 0, yawT = 0, pitchT = 0;
    if (T) {
      aT = 1;
      const l = this.toLocal([T[0] - hc[0], T[1] - hc[1], T[2] - hc[2]]);
      let yaw = Math.atan2(l[0], l[2]);
      if (Math.abs(yaw) > 1.6 && Math.sign(yaw) !== Math.sign(this._lastYaw) && this._lastYaw) yaw = Math.sign(this._lastYaw) * Math.PI;
      this._lastYaw = yaw;
      yawT = clamp(yaw, -0.85, 0.85);
      pitchT = clamp(Math.atan2(l[1], Math.hypot(l[0], l[2])), -0.5, 0.45);
      this._look = [yawT, pitchT];
    } else if (this._look) [yawT, pitchT] = this._look;
    this.att += clamp(aT - this.att, -dt * 0.8, dt * 4);
    const a = this.att;
    ease(this.yaw, yawT * a, 90, dt);
    ease(this.pitch, pitchT * a, 90, dt);
    ease(this.earTurn, yawT * a, 120, dt);
    ease(this.perk, a, 60, dt);
    this.gaze = T && a > 0.02 ? { at: T, amount: a } : null;
    this._applyPose();
  }

  _applyPose() {
    const { cfg } = this;
    const extra = this._bones();
    const head = { ix: cfg.head, rv: [-this.pitch.x, this.yaw.x, 0], pivotIx: this._neckIx() };
    const ears = cfg.ears.map((e) => ({ ix: e.ix, rv: [this.perk.x * 0.25, this.earTurn.x * 0.3, 0], pivotIx: e.root }));
    const quiet = !extra.length && Math.abs(this.yaw.x) + Math.abs(this.pitch.x) + Math.abs(this.perk.x) < 1e-4 &&
      Math.abs(this.yaw.v) + Math.abs(this.pitch.v) < 1e-3;
    if (quiet) { if (this.pose.active) this.pose.release(); return; }
    this.pose.apply([...extra.filter((b) => b.first), head, ...ears, ...extra.filter((b) => !b.first)]);
  }

  /* the neck pivot: the rest point nearest it, so it moves with a turn */
  _neckIx() {
    if (this._nk !== undefined) return this._nk;
    const rest = this.rig.rest, p = this.cfg.pivot;
    let best = 0, bd = 1e9;
    for (const i of this.rig.clouds[0].ix) {
      const d = Math.hypot(rest[i * 3] - p[0], rest[i * 3 + 1] - p[1], rest[i * 3 + 2] - p[2]);
      if (d < bd) { bd = d; best = i; }
    }
    return (this._nk = best);
  }

  /* ── every substep ────────────────────────────────────────────────────── */

  _apply(h) {
    const soft = this.soft, hh = h * h;
    // a dazed athlete stands less steadily and sways
    balance(soft, this.balanceK * (1 - 0.7 * this.daze), this.lean, this.face, this.standY);
    if (this.daze > 0) this._wobble(hh);
    this._footwork(h);
    this._tail(hh);
    this._push(h);
    if (this.ball && !this.ball.dead) this._ballStep(h);
  }

  /* footwork: little shuffling steps toward `drive`. A velocity servo on
     the body's mean horizontal velocity — a position shift every substep
     would be a force, and PBD turns it into runaway speed — eased in and
     out, capped. The feet take turns lifting (a force against gravity), so
     it reads as stepping, not sliding                                     */
  _footwork(h) {
    const s = this.soft, x = s.x, v = s.v, c = s.cloudC[0], ix = this.rig.clouds[0].ix;
    const D = this.drive;
    // no target, no servo: whatever else is moving him (a dive, a hand, a
    // knock) has the body to itself
    if (!D) { s.params.mu = 0.55; this._moving = false; return; }
    const want = D ? [D.x - c[0], D.z - c[2]] : [0, 0];
    const dist = Math.hypot(want[0], want[1]);
    const vmax = D ? D.speed ?? 3 : 0;
    // arrive: slow down over the last stretch
    const vs = dist > 0.02 ? Math.min(vmax, dist * 6) / dist : 0;
    const tv = [want[0] * vs, want[1] * vs];
    let mx = 0, mz = 0;
    for (const i of ix) { mx += v[i * 3]; mz += v[i * 3 + 2]; }
    mx /= ix.length; mz /= ix.length;
    const k = Math.min(1, 30 * h);
    const dx = (tv[0] - mx) * k * h, dz = (tv[1] - mz) * k * h;
    for (const i of ix) { x[i * 3] += dx; x[i * 3 + 2] += dz; }
    const sp = Math.hypot(tv[0], tv[1]);
    this._moving = sp > 0.05 || Math.hypot(mx, mz) > 0.05;
    // feet slide while it shuffles; planted again when it stops
    s.params.mu = sp > 0.05 ? 0.05 : 0.55;
    if (sp < 0.05) return;
    // stepping: one foot up, then the other, faster when hurrying
    this.stepPhase += h * (2.4 + sp * 1.5);
    const ph = this.stepPhase * TAU, hh = h * h;
    const lift = Math.min(1, sp / 1.5) * s.params.gravity * 1.6;
    for (let f = 0; f < 2; f++) {
      const up = Math.max(0, Math.sin(ph + f * Math.PI)) * lift;
      if (up <= 0) continue;
      for (const i of this.feet[f]) x[i * 3 + 1] += up * hh;
    }
  }

  /* the wobble of a knock: the head circles, slowing as it clears */
  _wobble(hh) {
    const x = this.soft.x, a = this.daze;
    const w = TAU * 1.3;
    const fx = Math.cos(w * this.time) * 200 * a * a, fz = Math.sin(w * this.time) * 140 * a * a;
    for (const i of this.cfg.head) { x[i * 3] += fx * hh; x[i * 3 + 2] += fz * hh; }
  }

  /* the tail livens up while there's a ball about */
  _tail(hh) {
    if (this.cfg.tail < 0 || this.att < 1e-3) return;
    const ch = this.rig.arms[this.cfg.tail], x = this.soft.x;
    this._phase = (this._phase || 0) + 1.6 * Math.sqrt(hh);
    const f = this.att * 220 * Math.sin(TAU * this._phase);
    const idx = ch.idx, N = idx.length;
    for (let j = 2; j < N; j++) {
      const i = idx[j], ip = idx[j - 1];
      const tx = x[i * 3] - x[ip * 3], tz = x[i * 3 + 2] - x[ip * 3 + 2];
      const tl = Math.hypot(tx, tz) || 1;
      const w = Math.pow(j / (N - 1), 1.4);
      x[i * 3] += (-tz / tl) * f * w * hh;
      x[i * 3 + 2] += (tx / tl) * f * w * hh;
    }
  }

  /* subclasses */
  _think() {}
  _bones() { return []; }
  _push() {}
  _ballStep(h) { this.ball.step(h, this.soft); }

  _go(state) { this.state = state; this.t = 0; }

  reset() {
    this.ball = null;
    this.drive = null;
    this._fv = [0, 0];
    this.daze = 0;
    this.lookAt = null;
    this._look = null;
    this.att = 0;
    for (const s of this._springs()) { s.x = 0; s.v = 0; }
    this.pose.release();
    this._go('ready');
  }

  _springs() { return [this.yaw, this.pitch, this.earTurn, this.perk]; }

  /* bones for an arm pointing along a direction (rest frame): the chain is
     turned about its shoulder from its sewn direction to `dir`            */
  armBone(k, dir, pre = null) {
    const ch = this.rig.arms[k], rest = this.rig.rest, idx = ch.idx, N = idx.length;
    const r0 = idx[0], r1 = idx[N - 1];
    let a = [rest[r1 * 3] - rest[r0 * 3], rest[r1 * 3 + 1] - rest[r0 * 3 + 1], rest[r1 * 3 + 2] - rest[r0 * 3 + 2]];
    if (pre) a = pre(a);
    const al = Math.hypot(...a);
    a = a.map((v) => v / al);
    const dl = Math.hypot(...dir) || 1;
    const b = dir.map((v) => v / dl);
    let ax = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const s = Math.hypot(...ax), c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const ang = Math.atan2(s, c);
    ax = s > 1e-7 ? ax.map((v) => v / s * ang) : [0, 0, 0];
    return { ix: idx.subarray(1), rv: ax, pivotIx: r0 };
  }
}

export { smooth, clamp, spring, ease, TAU };
