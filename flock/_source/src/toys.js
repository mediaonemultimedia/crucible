/* Toys for the fox, the lion and the llama — and the attention they draw.

   Nothing here is keyframed. Each animal's behaviour is three layers of
   gentle input into the same soft body everything else drives:

   1. Attention. When a toy is near, the head turns to look at it, the ears
      turn after it and the tail livens up; when it goes, all of it relaxes.
      The turn is a *pose*: the toy's sewn shape is re-posed a little (the
      head's points rotated about the neck in the shape the stuffing pulls
      toward, the ears' shape memory turned with it), so the stuffing — not
      a script — carries the head round, and it still wobbles, squishes and
      lags like plush. A spring eases every pose angle in and out.
   2. A signature move, a small state machine like the octopus's grasp:
      watch → move → cooldown. The fox pounces on a feather on a string,
      the lion bats a ball of yarn back to you, the llama nibbles a carrot
      on a stick. Each move is more of the same: a pose (a crouch, a paw
      raised, a neck stretched), a force (the neck reaching), an impulse
      (the hop, the swipe).
   3. A line in the hint area saying what to do, and what the animal's up to.

   The toys' own physics (a feather on a short rope, a rolling ball that
   collides with the plush, a carrot held on a stick) lives here too. This
   file draws nothing; toymesh.js dresses it.                              */

import { smooth } from './rigs.js';
import { invert3, quatToMat } from './math.js';

const TAU = Math.PI * 2;

export const TOYS = {
  fox: { kind: 'feather', label: 'Feather' },
  lion: { kind: 'yarn', label: 'Yarn' },
  llama: { kind: 'carrot', label: 'Carrot' },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* rotation vector (axis × angle) → 3×3, row-major like the soft body's */
function rodrigues(ax, ay, az, out) {
  const th = Math.hypot(ax, ay, az);
  if (th < 1e-12) { out.fill(0); out[0] = out[4] = out[8] = 1; return out; }
  const kx = ax / th, ky = ay / th, kz = az / th;
  const c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  out[0] = c + kx * kx * C; out[1] = kx * ky * C - kz * s; out[2] = kx * kz * C + ky * s;
  out[3] = ky * kx * C + kz * s; out[4] = c + ky * ky * C; out[5] = ky * kz * C - kx * s;
  out[6] = kz * kx * C - ky * s; out[7] = kz * ky * C + kx * s; out[8] = c + kz * kz * C;
  return out;
}

/* a critically damped spring for one pose angle */
const spring = () => ({ x: 0, v: 0 });
function ease(s, target, k, dt) {
  const c = 2 * Math.sqrt(k);
  s.v += (k * (target - s.x) - c * s.v) * dt;
  s.x += s.v * dt;
}

/* ── the pose ─────────────────────────────────────────────────────────────

   A re-posed rest shape for the soft body. Bones rotate sets of points
   about a pivot, each point by its own weight of the bone's rotation, in
   order. The result goes to SoftBody as `pose` (what shape memory pulls
   toward) and `poseRot` (each point's rotation, for skinning the mesh);
   for a toy whose head is part of its torso's cloud, the cloud's own shape
   (its rest offsets q, centroid and Aqq) follows the pose too.

   Nothing is installed until a toy comes out, and release() puts every
   array back exactly as it was: no toy, no change, to the bit.            */

export class Pose {
  constructor(soft, posed = -1) {
    this.soft = soft;
    this.posed = posed;
    this.active = false;
    this._R = new Float64Array(9);
    this._T = new Float64Array(9);
  }

  _install() {
    const s = this.soft, n = s.n;
    s.pose = Float64Array.from(s.rig.rest);
    s.poseRot = new Float64Array(n * 9);
    for (let i = 0; i < n; i++) s.poseRot[i * 9] = s.poseRot[i * 9 + 4] = s.poseRot[i * 9 + 8] = 1;
    this.touched = new Uint8Array(n);
    if (this.posed >= 0) {
      const g = s.clouds[this.posed];
      this._save = { q: Float64Array.from(g.q), c0: [...g.c0], Aqq: Float64Array.from(g.AqqInv) };
      s.posedCloud = this.posed;
    }
    this.active = true;
  }

  release() {
    if (!this.active) return;
    const s = this.soft;
    if (this._save) {
      const g = s.clouds[this.posed];
      g.q.set(this._save.q);
      for (let d = 0; d < 3; d++) g.c0[d] = this._save.c0[d];
      g.AqqInv.set(this._save.Aqq);
      this._save = null;
    }
    s.pose = null;
    s.poseRot = null;
    s.posedCloud = -1;
    this.active = false;
  }

  /* bones: [{ix, w?, rv: [x, y, z], pivot?: [3] (rest coords), pivotIx?}] */
  apply(bones) {
    if (!this.active) this._install();
    const s = this.soft, P = s.pose, M = s.poseRot, rest = s.rig.rest, mark = this.touched;
    for (let i = 0; i < s.n; i++) {
      if (!mark[i]) continue;
      mark[i] = 0;
      P[i * 3] = rest[i * 3]; P[i * 3 + 1] = rest[i * 3 + 1]; P[i * 3 + 2] = rest[i * 3 + 2];
      M.fill(0, i * 9, i * 9 + 9); M[i * 9] = M[i * 9 + 4] = M[i * 9 + 8] = 1;
    }
    const R = this._R, T = this._T;
    for (const b of bones) {
      const [ax, ay, az] = b.rv;
      if (Math.hypot(ax, ay, az) < 1e-7) continue;
      const pv = b.pivotIx >= 0 ? [P[b.pivotIx * 3], P[b.pivotIx * 3 + 1], P[b.pivotIx * 3 + 2]] : b.pivot;
      let lastW = -1;
      for (let k = 0; k < b.ix.length; k++) {
        const i = b.ix[k], w = b.w ? b.w[k] : 1;
        if (w <= 0) continue;
        if (w !== lastW) { rodrigues(ax * w, ay * w, az * w, R); lastW = w; }
        const dx = P[i * 3] - pv[0], dy = P[i * 3 + 1] - pv[1], dz = P[i * 3 + 2] - pv[2];
        P[i * 3] = pv[0] + R[0] * dx + R[1] * dy + R[2] * dz;
        P[i * 3 + 1] = pv[1] + R[3] * dx + R[4] * dy + R[5] * dz;
        P[i * 3 + 2] = pv[2] + R[6] * dx + R[7] * dy + R[8] * dz;
        const m = i * 9;
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 3; c++) T[r * 3 + c] = R[r * 3] * M[m + c] + R[r * 3 + 1] * M[m + 3 + c] + R[r * 3 + 2] * M[m + 6 + c];
        M.set(T, m);
        mark[i] = 1;
      }
    }
    if (this.posed >= 0) this._reshape();
  }

  /* the posed cloud's shape-matching rest offsets follow the pose */
  _reshape() {
    const s = this.soft, g = s.clouds[this.posed], P = s.pose, ix = g.ix, m = ix.length, q = g.q;
    let cx = 0, cy = 0, cz = 0;
    for (const i of ix) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; }
    cx /= m; cy /= m; cz /= m;
    const A = this._T.fill(0);
    for (let j = 0; j < m; j++) {
      const i = ix[j];
      const qx = P[i * 3] - cx, qy = P[i * 3 + 1] - cy, qz = P[i * 3 + 2] - cz;
      q[j * 3] = qx; q[j * 3 + 1] = qy; q[j * 3 + 2] = qz;
      A[0] += qx * qx; A[1] += qx * qy; A[2] += qx * qz;
      A[3] += qy * qx; A[4] += qy * qy; A[5] += qy * qz;
      A[6] += qz * qx; A[7] += qz * qy; A[8] += qz * qz;
    }
    invert3(A, g.AqqInv);
    g.c0[0] = cx; g.c0[1] = cy; g.c0[2] = cz;
  }
}

/* ── play ─────────────────────────────────────────────────────────────────── */

const STUB = 0.18, CARROT = 0.9, BITE = 0.18;
const BALL_R = 0.3, BALL_M = 4;
const ROPE = 6, ROPE_LEN = 1.55;
const HOP = 5.4;   // the fox's take-off speed, straight up

export class Play {
  constructor(soft) {
    this.soft = soft;
    this.rig = soft.rig;
    this.cfg = soft.rig.toy;
    this.name = this.rig.name;
    this.kind = TOYS[this.name].kind;
    this.pose = new Pose(soft, this.cfg.posed);
    this.toy = null;
    this.att = 0;
    this.yaw = spring(); this.pitch = spring(); this.roll = spring();
    this.earTurn = spring(); this.perk = spring();
    this.crouch = spring(); this.reach = spring(); this.paw = spring(); this.swing = spring();
    this.bob = 0;
    this.state = 'idle';
    this.t = 0;
    this.hold = 0;
    this.count = 0;
    this.time = 0;
    this.events = [];
    this.gaze = null;
    this._lastYaw = 0;
    this._setup();
    soft.hooks.push((h) => this._apply(h));
  }

  _setup() {
    const { cfg, rig } = this, rest = rig.rest;
    // the body's rest centroid (cloud 0), fixed: the frame toys are seen in
    const ix0 = rig.clouds[0].ix;
    this.c0 = [0, 0, 0];
    for (const i of ix0) for (let d = 0; d < 3; d++) this.c0[d] += rest[i * 3 + d] / ix0.length;
    this.headMask = new Uint8Array(rig.n);
    for (const i of cfg.core) this.headMask[i] = 1;
    if (this.name === 'fox') {
      // the crouch leans everything above the hips forward, more the higher it is
      const tail = new Set(cfg.tailIx);
      const ix = [], w = [];
      for (let i = 0; i < rig.n; i++) {
        if (tail.has(i)) continue;
        const wy = smooth(0.3, 2.0, rest[i * 3 + 1]);
        if (wy > 0) { ix.push(i); w.push(wy); }
      }
      this.crouchBone = { ix: Int32Array.from(ix), w: Float64Array.from(w) };
    }
    if (this.name === 'lion') {
      this.pawBones = cfg.legs.map((k) => {
        const ch = rig.arms[k], N = ch.idx.length;
        return { ix: ch.idx, w: Float64Array.from(ch.idx, (_, j) => j / (N - 1)), pivotIx: ch.idx[0] };
      });
    }
    if (this.name === 'llama') {
      const neck = rig.arms[cfg.neck], N = neck.idx.length;
      const ix = [], w = [];
      for (let j = 1; j < N; j++) { ix.push(neck.idx[j]); w.push(Math.min(1, j / (N - 2))); }
      for (const i of cfg.head) if (!ix.includes(i)) { ix.push(i); w.push(1); }
      this.neckTop = neck.idx[N - 1];
      this.reachBone = { ix: Int32Array.from(ix), w: Float64Array.from(w), pivot: [rest[neck.idx[0] * 3], rest[neck.idx[0] * 3 + 1], rest[neck.idx[0] * 3 + 2]] };
    }
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

  /* a rest-frame point of cloud k, where it is now */
  worldOf(p, k = 0) {
    const g = this.soft.clouds[k], R = this.soft.cloudR[k], c = this.soft.cloudC[k];
    const c0 = k === 0 ? this.c0 : g.c0;
    const qx = p[0] - c0[0], qy = p[1] - c0[1], qz = p[2] - c0[2];
    return [c[0] + R[0] * qx + R[1] * qy + R[2] * qz, c[1] + R[3] * qx + R[4] * qy + R[5] * qz, c[2] + R[6] * qx + R[7] * qy + R[8] * qz];
  }

  /* where the head is actually facing: the best-fit rotation of the head's
     own points against their rest shape, applied to rest-forward (+z)     */
  headForward() {
    const g = this._hg || (this._hg = this.soft._group(this.cfg.core));
    for (let k = 0; k < 6; k++) this.soft._match(g, 0);
    const R = quatToMat(g.q4, new Float64Array(9));
    return [R[2], R[5], R[8]];
  }

  mouth() { return this.worldOf(this.cfg.mouth, 1); }
  chest() { return this.worldOf(this.cfg.chest, 0); }

  /* the point the animal is interested in */
  target() {
    const t = this.toy;
    if (!t) return null;
    if (t.kind === 'feather') return t.feather();
    if (t.kind === 'yarn') return t.x;
    return t.tip();
  }

  /* ── the toy in hand ──────────────────────────────────────────────────── */

  /* lay the toy out at a floor point; toCam is the horizontal unit vector
     from there toward the camera                                         */
  place(at, toCam) {
    const hc = this.headCentre();
    const kind = this.kind;
    if (kind === 'feather') {
      const top = [at[0], 2.35, at[2]];
      const pts = new Float64Array((ROPE + 1) * 3);
      for (let k = 0; k <= ROPE; k++) { pts[k * 3] = top[0]; pts[k * 3 + 1] = top[1] - ROPE_LEN * k / ROPE; pts[k * 3 + 2] = top[2]; }
      const hd = [toCam[0] * 1.05, 0.55, toCam[2] * 1.05];
      this.toy = {
        kind, top, pts, prev: Float64Array.from(pts), pinned: null, held: false, speed: 0, wand: hd,
        feather() { const n = ROPE * 3; return [this.pts[n], this.pts[n + 1], this.pts[n + 2]]; },
        handle() { return [this.top[0] + this.wand[0], this.top[1] + this.wand[1], this.top[2] + this.wand[2]]; },
      };
    } else if (kind === 'yarn') {
      this.toy = { kind, x: [at[0], BALL_R + 0.5, at[2]], v: [0, 0, 0], p: [0, 0, 0], r: BALL_R, held: false, q: [0, 0, 0, 1], vel: [0, 0, 0], last: null };
    } else {
      const tip = [at[0], 2.9, at[2]];
      let dx = tip[0] - hc[0], dz = tip[2] - hc[2];
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl; dz /= dl;
      const dir = [dx * 0.95, 0.3, dz * 0.95];
      const dn = Math.hypot(...dir);
      this.toy = {
        kind, len: CARROT, held: false, dir: dir.map((v) => v / dn),
        base: [tip[0] + dir[0] / dn * CARROT, tip[1] + dir[1] / dn * CARROT, tip[2] + dir[2] / dn * CARROT],
        tip() { return [this.base[0] - this.dir[0] * this.len, this.base[1] - this.dir[1] * this.len, this.base[2] - this.dir[2] * this.len]; },
        handle() { return [this.base[0] + this.dir[0] * 1.15, this.base[1] + this.dir[1] * 1.15, this.base[2] + this.dir[2] * 1.15]; },
      };
    }
    this.state = 'watch'; this.t = 0; this.hold = 0;
  }

  remove() {
    this.toy = null;
    this.drag = null;
    if (this.state !== 'idle' && this.state !== 'leap') { this.state = 'idle'; this.t = 0; }
  }

  /* segments to hit-test a pointer ray against: [{a, b, r}] */
  segments() {
    const t = this.toy;
    if (!t) return [];
    if (t.kind === 'feather') {
      const s = [{ a: t.handle(), b: t.top, r: 0.1 }];
      for (let k = 0; k < ROPE; k++) s.push({ a: [t.pts[k * 3], t.pts[k * 3 + 1], t.pts[k * 3 + 2]], b: [t.pts[k * 3 + 3], t.pts[k * 3 + 4], t.pts[k * 3 + 5]], r: 0.07 });
      const f = t.feather();
      s.push({ a: f, b: f, r: 0.32 });
      return s;
    }
    if (t.kind === 'yarn') return [{ a: t.x, b: t.x, r: t.r * 1.2 }];
    return [{ a: t.handle(), b: t.base, r: 0.09 }, { a: t.base, b: t.tip(), r: 0.18 }];
  }

  _anchor() {
    const t = this.toy;
    return t.kind === 'feather' ? t.top : t.kind === 'yarn' ? t.x : t.base;
  }

  dragStart(p) {
    if (!this.toy) return;
    const a = this._anchor();
    this.drag = { off: [a[0] - p[0], a[1] - p[1], a[2] - p[2]] };
    this.toy.held = true;
    if (this.toy.kind === 'yarn') { this.toy.vel = [0, 0, 0]; this.toy.last = null; }
  }

  dragTo(p) {
    const t = this.toy;
    if (!t || !this.drag) return;
    const a = this._anchor(), o = this.drag.off;
    a[0] = p[0] + o[0]; a[1] = p[1] + o[1]; a[2] = p[2] + o[2];
    const low = t.kind === 'feather' ? 0.45 : t.kind === 'yarn' ? t.r : 0.35;
    if (a[1] < low) a[1] = low;
    if (a[1] > 6) a[1] = 6;
  }

  dragEnd() {
    const t = this.toy;
    this.drag = null;
    if (!t) return;
    t.held = false;
    if (t.kind === 'yarn') {
      // a flick: the ball leaves at the hand's speed
      const v = t.vel, s = Math.hypot(...v), cap = 13;
      t.v = s > cap ? v.map((c) => c * cap / s) : [...v];
    }
  }

  reset() {
    this.state = this.toy ? 'watch' : 'idle';
    this.t = 0; this.hold = 0; this.att = 0; this.bob = 0;
    for (const s of [this.yaw, this.pitch, this.roll, this.earTurn, this.perk, this.crouch, this.reach, this.paw, this.swing, ...(this._rv || [])]) s.x = s.v = 0;
    this._reachRv = null;
    this.pose.release();
    const t = this.toy;
    if (t?.kind === 'yarn') { t.v = [0, 0, 0]; t.x[1] = Math.max(t.x[1], t.r); }
    if (t?.kind === 'feather') { t.pinned = null; this._hang(t); }
    if (t?.kind === 'carrot') t.len = Math.max(t.len, STUB);
  }

  _hang(t) {
    for (let k = 0; k <= ROPE; k++) { t.pts[k * 3] = t.top[0]; t.pts[k * 3 + 1] = Math.max(0.05, t.top[1] - ROPE_LEN * k / ROPE); t.pts[k * 3 + 2] = t.top[2]; }
    t.prev.set(t.pts);
  }

  /* ── every fixed step ─────────────────────────────────────────────────── */

  update(dt) {
    this.time += dt;
    this.t += dt;
    const toy = this.toy;
    if (toy) this._toyStep(dt);
    const T = this.target();
    const hc = this.headCentre();
    let aT = 0, yawT = 0, pitchT = 0;
    const lim = this.name === 'llama' ? 0.9 : 0.75;
    if (T) {
      const d = Math.hypot(T[0] - hc[0], T[1] - hc[1], T[2] - hc[2]);
      aT = smooth(6.5, 3.5, d);
      const l = this.toLocal([T[0] - hc[0], T[1] - hc[1], T[2] - hc[2]]);
      let yaw = Math.atan2(l[0], l[2]);
      // straight behind: keep looking over the same shoulder, don't flip
      if (Math.abs(yaw) > lim + 0.8 && Math.sign(yaw) !== Math.sign(this._lastYaw) && this._lastYaw) yaw = Math.sign(this._lastYaw) * Math.PI;
      this._lastYaw = yaw;
      yawT = clamp(yaw, -lim, lim);
      pitchT = clamp(Math.atan2(l[1], Math.hypot(l[0], l[2])), -0.55, 0.4);
      if (this.name === 'llama') pitchT = clamp(pitchT, -0.35, 0.3);
      this._look = [yawT, pitchT];
    } else if (this._look) {
      // taken away: the gaze lingers where it was as the interest fades
      [yawT, pitchT] = this._look;
    }
    this.att += clamp(aT - this.att, -dt * 0.7, dt * 1.4);
    const a = this.att;
    ease(this.yaw, yawT * a, 28, dt);
    ease(this.pitch, pitchT * a, 28, dt);
    ease(this.earTurn, yawT * a, 70, dt);
    this.gaze = T && a > 0.02 ? { at: T, amount: a } : null;

    this._signature(dt, T);
    this._applyPose();
  }

  _applyPose() {
    const { cfg } = this;
    const quiet = !this.toy && this.att < 1e-3 && this.state !== 'leap' &&
      [this.yaw, this.pitch, this.roll, this.earTurn, this.perk, this.crouch, this.reach, this.paw, this.swing]
        .concat(this._rv || []).every((s) => Math.abs(s.x) < 2e-4 && Math.abs(s.v) < 2e-3) && Math.abs(this.bob) < 1e-4;
    if (quiet) {
      // all settled: put the sewn shape back exactly as it was
      if (this.pose.active) {
        for (const s of [this.yaw, this.pitch, this.roll, this.earTurn, this.perk, this.crouch, this.reach, this.paw, this.swing, ...(this._rv || [])]) s.x = s.v = 0;
        this._reachRv = null;
        this.pose.release();
      }
      this.state = 'idle';
      return;
    }
    const yaw = this.yaw.x, pitch = this.pitch.x + this.bob, roll = this.roll.x;
    const bones = [];
    if (this.name === 'llama') {
      // the neck bends toward the carrot, carrying the head; then the head
      // turns on the top of the neck — back level against most of the
      // neck's bend, so it still faces the carrot — and looks
      const rr = this._reachRv || [0, 0, 0];
      bones.push({ ...this.reachBone, rv: rr });
      bones.push({ ix: cfg.head, rv: [-pitch - rr[0] * 0.85, yaw - rr[1] * 0.85, roll - rr[2] * 0.85], pivotIx: this.neckTop });
      for (const e of cfg.ears) bones.push({ ix: e.ix, rv: [this.perk.x * 0.5, 0, 0], pivot: e.pivot });
    } else {
      bones.push({ ix: cfg.head, rv: [-pitch, yaw, roll], pivot: cfg.pivot });
      cfg.ears.forEach((e) => bones.push({ ix: e.ix, rv: [this.perk.x * 0.3, this.earTurn.x * 0.55, 0], pivotIx: e.root }));
      if (this.pawBones) this.pawBones.forEach((b, k) => {
        const on = this.swipeLeg === k ? 1 : 0;
        bones.push({ ...b, rv: [-this.paw.x * on, 0, this.swing.x * on] });
      });
      if (this.crouchBone) bones.push({ ...this.crouchBone, rv: [this.crouch.x, 0, 0], pivot: cfg.hip });
    }
    this.pose.apply(bones);
  }

  /* ── signature moves ──────────────────────────────────────────────────── */

  _signature(dt, T) {
    if (this.name === 'fox') this._fox(dt, T);
    else if (this.name === 'lion') this._lion(dt, T);
    else this._llama(dt, T);
  }

  _go(state) { this.state = state; this.t = 0; }

  /* the fox: watches the feather; held still near the floor in front of it
     for a second, it crouches, hops forward and lands on it               */
  _fox(dt, F) {
    const toy = this.toy;
    let crouchT = 0;
    const g = this.soft.params.gravity;
    if (this.state === 'watch' || this.state === 'idle') {
      if (toy && F) {
        const c = this.soft.cloudC[0];
        const l = this.toLocal([F[0] - c[0], F[1] - c[1], F[2] - c[2]]);
        const dh = Math.hypot(l[0], l[2]);
        const zone = l[2] > 0.8 && Math.abs(l[0]) < 0.75 * l[2] + 0.3 && dh > 1.2 && dh < 3.0 && F[1] < 0.75;
        const still = toy.speed < 0.7 && !toy.pinned;
        if (zone && still && this.att > 0.5) this.hold += dt;
        else this.hold = Math.max(0, this.hold - dt * 2);
        // the ready wiggle: a little crouch as it fixes on the feather
        crouchT = zone ? 0.12 * smooth(0, 1, this.hold) : 0;
        if (this.hold > 1) { this.hold = 0; this._go('crouch'); }
      } else this.hold = 0;
    }
    if (this.state === 'crouch') {
      crouchT = 0.26;
      if (!toy) this._go('cool');
      else if (this.t > 0.5) {
        const f = toy.feather(), ch = this.chest();
        let dx = f[0] - ch[0], dz = f[2] - ch[2];
        const D = Math.hypot(dx, dz) || 1;
        dx /= D; dz /= D;
        const vy = HOP, flight = 2 * vy / g;
        const vx = clamp(D - 0.05, 0.2, 1.9) / flight;
        this.soft.impulse(() => [dx * vx, vy, dz * vx]);
        this.count++;
        this._go('leap');
      }
    }
    if (this.state === 'leap') {
      crouchT = -0.12;
      // down again: the first touch after the top of the hop
      let touch = false;
      if (this.t > HOP / g) for (const i of this.rig.clouds[0].ix) if (this.soft.contact[i]) { touch = true; break; }
      if (touch || this.t > 2 * HOP / g + 0.15) {
        // landed: the paws dig in (most of the run-on goes into the floor)
        // and forepaws and chest come down on the feather
        const v = this.soft.v, n = this.soft.n;
        let mx = 0, mz = 0;
        for (let i = 0; i < n; i++) { mx += v[i * 3]; mz += v[i * 3 + 2]; }
        mx /= n; mz /= n;
        this.soft.impulse(() => [-mx * 0.75, 0, -mz * 0.75]);
        if (toy) {
          const f = toy.feather(), ch = this.chest();
          if (Math.hypot(f[0] - ch[0], f[2] - ch[2]) < 1.2) toy.pinned = [f[0], Math.max(0.05, Math.min(f[1], 0.12)), f[2]];
        }
        this._go('land');
      }
    }
    if (this.state === 'land') {
      crouchT = 0.16;
      if (this.t > 1.0) { if (toy) toy.pinned = null; this._go('cool'); }
    }
    if (this.state === 'cool' && this.t > 1.4) this._go(toy ? 'watch' : 'idle');
    ease(this.crouch, crouchT, this.state === 'leap' ? 120 : 45, dt);
    ease(this.perk, this.att * (this.state === 'crouch' ? 1 : 0.5), 50, dt);
  }

  /* the lion: follows the ball; when it rolls within reach of a front paw,
     raises the paw and bats it back                                       */
  _lion(dt, B) {
    const toy = this.toy;
    let raise = 0, swing = 0;
    if ((this.state === 'watch' || this.state === 'idle') && toy && !toy.held) {
      const sp = Math.hypot(toy.v[0], toy.v[2]);
      const c = this.soft.cloudC[0];
      const l = this.toLocal([B[0] - c[0], B[1] - c[1], B[2] - c[2]]);
      if (B[1] < 1.0 && sp < 7 && l[2] > 0.15) {
        const x = this.soft.x;
        let best = 1e9, leg = -1;
        this.cfg.legs.forEach((k, s) => {
          const ch = this.rig.arms[k], i = ch.idx[ch.idx.length - 1];
          const d = Math.hypot(x[i * 3] - B[0], x[i * 3 + 2] - B[2]);
          if (d < best) { best = d; leg = s; }
        });
        if (best < 0.95) { this.swipeLeg = leg; this.hit = false; this._go('swipe'); }
      }
    }
    if (this.state === 'swipe') {
      const t = this.t;
      raise = t < 0.12 ? 0.85 : t < 0.3 ? 0.55 : 0;
      const leg = this.rig.arms[this.cfg.legs[this.swipeLeg]];
      const side = Math.sign(this.rig.rest[leg.idx[0] * 3]) || 1;
      swing = t > 0.1 && t < 0.3 ? -side * 0.35 : 0;
      if (toy && !this.hit && t > 0.13) {
        const i = leg.idx[leg.idx.length - 1], x = this.soft.x;
        const paw = [x[i * 3], x[i * 3 + 1], x[i * 3 + 2]];
        if (Math.hypot(paw[0] - toy.x[0], paw[2] - toy.x[2]) < 1.25 && !toy.held) {
          // away from the lion, mostly the way it faces: back to you
          const c = this.soft.cloudC[0], R = this.soft.cloudR[0];
          let ax = toy.x[0] - c[0], az = toy.x[2] - c[2];
          const al = Math.hypot(ax, az) || 1;
          ax = ax / al + R[2] * 1.2; az = az / al + R[8] * 1.2;
          const n = Math.hypot(ax, az) || 1;
          toy.v = [ax / n * 5.8, 2.4, az / n * 5.8];
          // and the paw follows through
          for (const j of leg.idx.slice(-3)) { this.soft.v[j * 3] += ax / n * 3; this.soft.v[j * 3 + 2] += az / n * 3; }
          this.hit = true;
          this.count++;
        }
      }
      if (t > 0.55) this._go('cool');
    }
    if (this.state === 'cool' && this.t > 0.6) this._go(toy ? 'watch' : 'idle');
    ease(this.paw, raise, 260, dt);
    ease(this.swing, swing, 260, dt);
    ease(this.perk, this.att * 0.6, 50, dt);
  }

  /* the llama: stretches its neck for the carrot; held within reach, it
     nibbles — a few quick bobs, a bite gone each time — then rests       */
  _llama(dt, C) {
    const toy = this.toy;
    let reachT = 0;
    this.bob = 0;
    const neck = this.rig.arms[this.cfg.neck];
    const x = this.soft.x, r0 = neck.idx[0];
    if (toy && C) {
      const root = [x[r0 * 3], x[r0 * 3 + 1], x[r0 * 3 + 2]];
      const d = Math.hypot(C[0] - root[0], C[1] - root[1], C[2] - root[2]);
      const c = this.soft.cloudC[0];
      const l = this.toLocal([C[0] - c[0], C[1] - c[1], C[2] - c[2]]);
      reachT = smooth(3.7, 2.4, d) * (l[2] > -0.6 ? 1 : 0);
      if (toy.len <= STUB + 1e-6) reachT *= 0.35;
      // the neck's bend toward the carrot, in the body's rest frame
      const R = this.soft.cloudR[0], cc = this.soft.cloudC[0];
      const w = [C[0] - cc[0], C[1] - cc[1], C[2] - cc[2]];
      const tl = [this.c0[0] + R[0] * w[0] + R[3] * w[1] + R[6] * w[2], this.c0[1] + R[1] * w[0] + R[4] * w[1] + R[7] * w[2], this.c0[2] + R[2] * w[0] + R[5] * w[1] + R[8] * w[2]];
      const rp = this.reachBone.pivot, m = this.cfg.mouth;
      const v0 = [m[0] - rp[0], m[1] - rp[1], m[2] - rp[2]], v1 = [tl[0] - rp[0], tl[1] - rp[1], tl[2] - rp[2]];
      const ax = [v0[1] * v1[2] - v0[2] * v1[1], v0[2] * v1[0] - v0[0] * v1[2], v0[0] * v1[1] - v0[1] * v1[0]];
      const s = Math.hypot(...ax), co = v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2];
      const ang = Math.min(0.6, Math.atan2(s, co));
      this._reachDir = s > 1e-6 ? ax.map((q) => q / s * ang) : [0, 0, 0];
    }
    ease(this.reach, reachT, 14, dt);
    // the bend itself eases too: a carrot whisked across to the other side
    // swings the neck round, it doesn't snap it there
    const rd = this._reachDir || [0, 0, 0];
    const rv = this._rv || (this._rv = [spring(), spring(), spring()]);
    rv.forEach((s, d) => ease(s, rd[d] * reachT, 14, dt));
    this._reachRv = rv.map((s) => s.x);
    const m = this.mouth();
    const dm = C ? Math.hypot(m[0] - C[0], m[1] - C[1], m[2] - C[2]) : 1e9;
    this.mouthGap = dm;
    if (this.state === 'watch' || this.state === 'idle') {
      if (toy && toy.len > STUB + 1e-6 && dm < 0.45) this.hold += dt;
      else this.hold = Math.max(0, this.hold - dt * 2);
      if (this.hold > 0.7) { this.hold = 0; this.bites = 0; this._go('nibble'); }
    }
    if (this.state === 'nibble') {
      const ph = this.t / 0.36;
      this.bob = 0.13 * Math.sin(TAU * ph) * smooth(0, 0.15, this.t);
      const done = Math.floor(ph + 0.25);
      if (toy && done > this.bites) {
        this.bites = done;
        toy.len = Math.max(STUB, toy.len - BITE);
        this.count++;
      }
      if (!toy || dm > 0.95 || this.bites >= 4 || toy.len <= STUB + 1e-6) { if (ph % 1 > 0.9 || !toy || dm > 0.95) this._go('cool'); }
    }
    if (this.state === 'cool' && this.t > 1.3) this._go(toy ? 'watch' : 'idle');
    ease(this.perk, this.att * (0.6 + 0.4 * this.reach.x), 45, dt);
    // a curious tilt of the head toward the side the carrot is on
    ease(this.roll, 0.2 * this.att * Math.tanh(this.yaw.x * 4), 30, dt);
  }

  /* ── the toys' own physics, per fixed step ───────────────────────────── */

  _toyStep(dt) {
    const t = this.toy;
    if (t.kind === 'feather') this._feather(t, dt);
    else if (t.kind === 'yarn') {
      if (t.held) {
        // velocity of the hand, for the flick
        if (t.last) for (let d = 0; d < 3; d++) t.vel[d] += ((t.x[d] - t.last[d]) / dt - t.vel[d]) * 0.35;
        t.last = [...t.x];
        t.v = [0, 0, 0];
      }
      // roll: spin about the horizontal axis across the motion
      const sp = Math.hypot(t.v[0], t.v[2]);
      if (sp > 1e-4 && t.x[1] < t.r + 0.02) {
        const ax = t.v[2] / sp, az = -t.v[0] / sp, a = sp / t.r * dt;
        const s = Math.sin(a / 2), q = [ax * s, 0, az * s, Math.cos(a / 2)], p = t.q;
        t.q = [
          q[3] * p[0] + q[0] * p[3] + q[1] * p[2] - q[2] * p[1],
          q[3] * p[1] - q[0] * p[2] + q[1] * p[3] + q[2] * p[0],
          q[3] * p[2] + q[0] * p[1] - q[1] * p[0] + q[2] * p[3],
          q[3] * p[3] - q[0] * p[0] - q[1] * p[1] - q[2] * p[2],
        ];
        const ql = Math.hypot(...t.q);
        t.q = t.q.map((v) => v / ql);
      }
      if (![...t.x, ...t.v].every(Number.isFinite)) { t.x = [this.soft.cloudC[0][0], 2, this.soft.cloudC[0][2] + 2]; t.v = [0, 0, 0]; }
    } else {
      // the carrot keeps pointing its tip at the llama's mouth
      const m = this.mouth(), tip = t.tip();
      let dx = t.base[0] - m[0], dz = t.base[2] - m[2];
      const dl = Math.hypot(dx, dz);
      if (dl > 0.3) {
        dx /= dl; dz /= dl;
        const want = [dx * 0.95, 0.3, dz * 0.95], wn = Math.hypot(...want);
        const k = Math.min(1, dt * 3);
        for (let d = 0; d < 3; d++) t.dir[d] += (want[d] / wn - t.dir[d]) * k;
        const n = Math.hypot(...t.dir);
        for (let d = 0; d < 3; d++) t.dir[d] /= n;
      }
      void tip;
    }
  }

  /* a feather on a short rope: verlet, light and draggy, pushed off the
     plush and the floor; pinned while a fox is lying on it               */
  _feather(t, dt) {
    const sub = 4, h = dt / sub, P = t.pts, Q = t.prev;
    const x = this.soft.x, r = this.soft.r, n = this.soft.n;
    const seg = ROPE_LEN / ROPE;
    const f0 = t.feather();
    for (let s = 0; s < sub; s++) {
      for (let k = 1; k <= ROPE; k++) {
        const drag = Math.exp(-(k === ROPE ? 3.2 : 1.4) * h);
        const grav = k === ROPE ? 14 : 22;
        for (let d = 0; d < 3; d++) {
          const v = (P[k * 3 + d] - Q[k * 3 + d]) * drag;
          Q[k * 3 + d] = P[k * 3 + d];
          P[k * 3 + d] += v - (d === 1 ? grav * h * h : 0);
        }
      }
      P[0] = t.top[0]; P[1] = t.top[1]; P[2] = t.top[2];
      if (t.pinned) { const e = ROPE * 3; P[e] = t.pinned[0]; P[e + 1] = t.pinned[1]; P[e + 2] = t.pinned[2]; }
      for (let it = 0; it < 6; it++) {
        for (let k = 0; k < ROPE; k++) {
          const a = k * 3, b = a + 3;
          const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
          const d = Math.hypot(dx, dy, dz) || 1e-9;
          // a rope: it holds its length but doesn't push back when slack
          if (d <= seg) continue;
          const e = (d - seg) / d;
          const wa = k === 0 ? 0 : 0.5, wb = (k + 1 === ROPE && t.pinned) ? 0 : 0.5;
          const ws = wa + wb || 1;
          P[a] += dx * e * wa / ws; P[a + 1] += dy * e * wa / ws; P[a + 2] += dz * e * wa / ws;
          P[b] -= dx * e * wb / ws; P[b + 1] -= dy * e * wb / ws; P[b + 2] -= dz * e * wb / ws;
        }
      }
      // off the plush (one way: a feather doesn't shove a toy about) and the floor
      for (let k = 2; k <= ROPE; k++) {
        if (k === ROPE && t.pinned) continue;
        const rk = k === ROPE ? 0.12 : 0.03;
        for (let i = 0; i < n; i++) {
          const dx = P[k * 3] - x[i * 3], dy = P[k * 3 + 1] - x[i * 3 + 1], dz = P[k * 3 + 2] - x[i * 3 + 2];
          const m = r[i] + rk;
          if (dx > m || dx < -m || dy > m || dy < -m || dz > m || dz < -m) continue;
          const d = Math.hypot(dx, dy, dz);
          if (d < m && d > 1e-9) { const f = (m - d) / d; P[k * 3] += dx * f; P[k * 3 + 1] += dy * f; P[k * 3 + 2] += dz * f; }
        }
        const fl = k === ROPE ? 0.06 : 0.02;
        if (P[k * 3 + 1] < fl) {
          P[k * 3 + 1] = fl;
          // dragged along the floor, it catches a little
          Q[k * 3] += (P[k * 3] - Q[k * 3]) * 0.3; Q[k * 3 + 2] += (P[k * 3 + 2] - Q[k * 3 + 2]) * 0.3;
        }
      }
    }
    const f1 = t.feather();
    t.speed += (Math.hypot(f1[0] - f0[0], f1[1] - f0[1], f1[2] - f0[2]) / dt - t.speed) * 0.25;
    if (!P.every(Number.isFinite)) { t.pinned = null; this._hang(t); }
  }

  /* ── every substep: forces on the plush ───────────────────────────────── */

  _apply(h) {
    if (!this.toy && this.att < 1e-4 && !this.pose.active) return;
    const hh = h * h;
    const toy = this.toy;
    // the tail livens up while something has its attention
    const a = this.att;
    if (a > 1e-3) {
      let amp = 0, freq = 1;
      if (this.name === 'fox') {
        const F = this.target();
        const ch = this.chest();
        const near = F ? smooth(3.8, 1.2, Math.hypot(F[0] - ch[0], F[2] - ch[2])) : 0;
        amp = 160 + 420 * near + (this.state === 'crouch' ? 350 : 0);
        freq = 0.55 + 1.7 * near + (this.state === 'crouch' ? 1.6 : 0);
      } else if (this.name === 'lion') { amp = 260; freq = 1.3; } else { amp = 240; freq = 2.4; }
      this._phase = (this._phase || 0) + freq * h;
      sweep(this.soft, this.rig.arms[this.cfg.tail], a * amp * Math.sin(TAU * this._phase), hh);
    }
    this._plant(h);
    if (toy?.kind === 'yarn' && !toy.held) this._ball(toy, h);
    else if (toy?.kind === 'yarn') this._ballPush(toy);
    if (this.name === 'llama' && toy && this.reach.x > 0.02) this._reachForce(hh);
  }

  /* feet planted. Reaching, batting and nibbling are all the animal's own
     muscles: they mustn't walk it across the floor. The solver's floor
     friction only slows a sliding point, so while a toy is in play and the
     toy sits on the floor untouched, its body is eased back to where it
     sat down (gently: a creep, never a tug). A hand, a pounce, a big shove
     or a fall simply sets a new place to sit.                             */
  _plant(h) {
    const s = this.soft, c = s.cloudC[0];
    let touching = 0;
    for (const i of this.rig.clouds[0].ix) touching += s.contact[i];
    const free = !s.grabs.size && touching >= 3 && !['crouch', 'leap', 'land'].includes(this.state);
    if (!free || !this._home) { this._home = free ? [c[0], c[2]] : null; return; }
    const dx = c[0] - this._home[0], dz = c[2] - this._home[1];
    const d = Math.hypot(dx, dz);
    if (d > 0.5) { this._home = [c[0], c[2]]; return; }
    const k = Math.min(1, 0.6 * h) ;
    const x = s.x;
    for (let i = 0; i < s.n; i++) { x[i * 3] -= dx * k; x[i * 3 + 2] -= dz * k; }
  }

  /* the llama's neck reaching: the head's points pulled toward the carrot,
     the body pushed back the same amount, so it doesn't drag itself over */
  _reachForce(hh) {
    const C = this.toy.tip(), m = this.mouth();
    let fx = C[0] - m[0], fy = C[1] - m[1], fz = C[2] - m[2];
    const d = Math.hypot(fx, fy, fz);
    if (d > 1) { fx /= d; fy /= d; fz /= d; }
    const k = 26 * this.reach.x * hh;
    const x = this.soft.x, ix = this.cfg.core;
    for (const i of ix) { x[i * 3] += fx * k; x[i * 3 + 1] += fy * k; x[i * 3 + 2] += fz * k; }
    this.soft._shift(this.rig.clouds[0].ix, -fx * k * ix.length, -fy * k * ix.length, -fz * k * ix.length);
  }

  /* held in the hand, the ball still shoves the plush aside */
  _ballPush(b) {
    const { x, r, n } = this.soft;
    for (let i = 0; i < n; i++) {
      const dx = x[i * 3] - b.x[0], dy = x[i * 3 + 1] - b.x[1], dz = x[i * 3 + 2] - b.x[2];
      const m = b.r + r[i] * 0.85;
      if (dx > m || dx < -m || dy > m || dy < -m || dz > m || dz < -m) continue;
      const d = Math.hypot(dx, dy, dz);
      if (d < m && d > 1e-9) { const f = (m - d) / d * 0.15; x[i * 3] += dx * f; x[i * 3 + 1] += dy * f; x[i * 3 + 2] += dz * f; }
    }
  }

  /* a ball of yarn: falls, rolls with rolling friction, bounces a little,
     and collides with the plush both ways (by mass)                       */
  _ball(b, h) {
    const { x, r, n } = this.soft;
    const g = this.soft.params.gravity;
    const p = b.p;
    p[0] = b.x[0]; p[1] = b.x[1]; p[2] = b.x[2];
    const vy0 = b.v[1];
    b.v[1] -= g * h;
    for (let d = 0; d < 3; d++) b.x[d] += b.v[d] * h;
    const share = BALL_M / (BALL_M + 1);
    this._dentT = (this._dentT || 0) - h;
    for (let i = 0; i < n; i++) {
      const dx = x[i * 3] - b.x[0], dy = x[i * 3 + 1] - b.x[1], dz = x[i * 3 + 2] - b.x[2];
      const m = b.r + r[i] * 0.85;
      if (dx > m || dx < -m || dy > m || dy < -m || dz > m || dz < -m) continue;
      const d = Math.hypot(dx, dy, dz);
      if (d >= m || d < 1e-9) continue;
      const pen = m - d, nx = dx / d, ny = dy / d, nz = dz / d;
      x[i * 3] += nx * pen * share; x[i * 3 + 1] += ny * pen * share; x[i * 3 + 2] += nz * pen * share;
      b.x[0] -= nx * pen * (1 - share); b.x[1] -= ny * pen * (1 - share); b.x[2] -= nz * pen * (1 - share);
      // dropped onto the head (the lion's mane), it dents the fur
      if (this.headMask[i] && vy0 < -2 && this._dentT <= 0) {
        this.events.push({ kind: 'dent', at: [b.x[0] + nx * b.r, b.x[1] + ny * b.r, b.x[2] + nz * b.r], strength: Math.min(1, -vy0 / 7) });
        this._dentT = 0.3;
      }
    }
    let floor = false;
    if (b.x[1] < b.r) { b.x[1] = b.r; floor = true; }
    // a playpen: past this it rolls back toward the animal
    const c = this.soft.cloudC[0];
    const ox = b.x[0] - c[0], oz = b.x[2] - c[2], od = Math.hypot(ox, oz), wall = 7;
    if (od > wall) { b.x[0] = c[0] + ox / od * wall; b.x[2] = c[2] + oz / od * wall; }
    const ih = 1 / h;
    const vyIn = b.v[1];
    for (let d = 0; d < 3; d++) b.v[d] = (b.x[d] - p[d]) * ih;
    if (floor) {
      if (vyIn < -2.5) b.v[1] = -vyIn * 0.35;
      const k = Math.exp(-1.5 * h);
      b.v[0] *= k; b.v[2] *= k;
      if (Math.hypot(b.v[0], b.v[2]) < 0.04) { b.v[0] = 0; b.v[2] = 0; }
    }
    if (od > wall) {
      const vn = (b.v[0] * ox + b.v[2] * oz) / od;
      if (vn > 0) { b.v[0] -= 1.6 * vn * ox / od; b.v[2] -= 1.6 * vn * oz / od; }
    }
    const sp = Math.hypot(...b.v);
    if (sp > 20) for (let d = 0; d < 3; d++) b.v[d] *= 20 / sp;
  }

  /* what to show in the hint line */
  status() {
    const t = this.toy;
    if (this.name === 'fox') {
      if (!t) return '';
      const s = { idle: 'watching', watch: this.hold > 0.2 ? 'fixed on it…' : 'watching', crouch: 'crouching…', leap: 'pounce!', land: 'got it', cool: 'got it' }[this.state] || '';
      return `${s} · pounces ${this.count}`;
    }
    if (this.name === 'lion') {
      if (!t) return '';
      return `${this.state === 'swipe' ? 'swipe!' : 'watching the ball'} · bats ${this.count}`;
    }
    if (!t) return '';
    const bites = Math.round((t.len - STUB) / BITE);
    const s = this.state === 'nibble' ? 'nibbling…' : t.len <= STUB + 1e-6 ? 'all gone — take it away and offer a fresh one' : this.reach.x > 0.3 ? 'reaching' : 'interested';
    return `${s} · ${bites} bite${bites === 1 ? '' : 's'} left`;
  }
}

/* sweep a chain sideways in the floor plane, each point across its own run
   of the chain, the tip most (a tail lying on the floor)                   */
function sweep(soft, ch, f, hh) {
  const { x } = soft;
  const idx = ch.idx, N = idx.length;
  for (let j = 2; j < N; j++) {
    const i = idx[j], ip = idx[j - 1];
    const tx = x[i * 3] - x[ip * 3], tz = x[i * 3 + 2] - x[ip * 3 + 2];
    const tl = Math.hypot(tx, tz) || 1;
    const w = Math.pow(j / (N - 1), 1.4);
    x[i * 3] += (-tz / tl) * f * w * hh;
    x[i * 3 + 1] += Math.abs(f) * 0.15 * w * w * hh;
    x[i * 3 + 2] += (tx / tl) * f * w * hh;
  }
}
