/* Re-posing the sewn shape — the attention and moves of an athlete, copied
   from Flock's toys.js (the Pose class and its springs, unchanged).

   Nothing an athlete does is keyframed: a move re-poses the rest shape the
   stuffing and shape memory pull toward (a head turned to the ball, an arm
   wound back, arms thrown up for a dive), and the soft body gets there on
   its own, lagging and wobbling like plush. A critically damped spring
   eases each pose angle in and out.                                       */

import { invert3 } from './math.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* rotation vector (axis × angle) → 3×3, row-major like the soft body's */
export function rodrigues(ax, ay, az, out) {
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
export const spring = () => ({ x: 0, v: 0 });
export function ease(s, target, k, dt) {
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

