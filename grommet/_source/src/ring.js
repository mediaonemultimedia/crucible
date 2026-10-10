/* A felt ring for ring toss: a rigid torus with its own little integrator,
   run every soft-body substep like the ball.

   Position, velocity, orientation (a quaternion; the ring's axis is its
   local z) and spin. Contacts are impulses at the contact point, so a ring
   that lands on its edge tips over, a spun one wobbles down flat, a rolled
   one rolls: the floor (sixteen points round its centreline), the plush
   (the exact distance from each stuffing point to the ring's centreline
   circle) and other rings (points round one against the other's circle).
   Felt is dead: little bounce, a lot of grip.                             */

export const RING = { R: 0.46, r: 0.07, mass: 0.35 };
export const RING_G = 16;
const K = 16;

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/* the quaternion turning +z onto unit vector n */
export function quatFromZ(n) {
  const d = n[2];
  if (d < -0.999999) return [1, 0, 0, 0];
  const ax = [-n[1], n[0], 0];
  const q = [ax[0], ax[1], ax[2], 1 + d];
  const l = Math.hypot(...q);
  return q.map((c) => c / l);
}

export class Ring {
  constructor({ x, v = [0, 0, 0], axis = [0, 1, 0], spin = 0, hue = 0 }) {
    this.R = RING.R; this.r = RING.r; this.m = RING.mass;
    this.Ia = this.m * (this.R * this.R + 0.75 * this.r * this.r);
    this.Id = this.m * (0.5 * this.R * this.R + 0.625 * this.r * this.r);
    this.x = [...x]; this.p = [...x]; this.v = [...v];
    const al = Math.hypot(...axis);
    const n = axis.map((c) => c / al);
    this.q = quatFromZ(n);
    this.w = n.map((c) => c * spin);
    this.M = new Float64Array(9);
    this._mat();
    this.hue = hue;
    this.state = 'free';
    this.sleep = 0;
    this.t = 0;
    this.floor = false;
  }

  /* rotation matrix (row-major: world = M · local) */
  _mat() {
    const [x, y, z, w] = this.q, M = this.M;
    M[0] = 1 - 2 * (y * y + z * z); M[1] = 2 * (x * y - z * w); M[2] = 2 * (x * z + y * w);
    M[3] = 2 * (x * y + z * w); M[4] = 1 - 2 * (x * x + z * z); M[5] = 2 * (y * z - x * w);
    M[6] = 2 * (x * z - y * w); M[7] = 2 * (y * z + x * w); M[8] = 1 - 2 * (x * x + y * y);
  }

  axis() { const M = this.M; return [M[2], M[5], M[8]]; }
  toWorld(l) { const M = this.M; return [M[0] * l[0] + M[1] * l[1] + M[2] * l[2], M[3] * l[0] + M[4] * l[1] + M[5] * l[2], M[6] * l[0] + M[7] * l[1] + M[8] * l[2]]; }
  toLocal(w) { const M = this.M; return [M[0] * w[0] + M[3] * w[1] + M[6] * w[2], M[1] * w[0] + M[4] * w[1] + M[7] * w[2], M[2] * w[0] + M[5] * w[1] + M[8] * w[2]]; }

  /* the world inverse inertia applied to a vector */
  invI(a) {
    const l = this.toLocal(a);
    return this.toWorld([l[0] / this.Id, l[1] / this.Id, l[2] / this.Ia]);
  }

  setAxis(n, spinAngle = 0) {
    const q0 = quatFromZ(n);
    // then turned about its own axis by spinAngle (for drawing a spin)
    const s = Math.sin(spinAngle / 2), c = Math.cos(spinAngle / 2);
    const r = [n[0] * s, n[1] * s, n[2] * s, c];
    this.q = [
      r[3] * q0[0] + r[0] * q0[3] + r[1] * q0[2] - r[2] * q0[1],
      r[3] * q0[1] - r[0] * q0[2] + r[1] * q0[3] + r[2] * q0[0],
      r[3] * q0[2] + r[0] * q0[1] - r[1] * q0[0] + r[2] * q0[3],
      r[3] * q0[3] - r[0] * q0[0] - r[1] * q0[1] - r[2] * q0[2],
    ];
    this._mat();
  }

  speed() { return Math.hypot(...this.v); }
  energy() { const l = this.toLocal(this.w); return 0.5 * this.m * dot(this.v, this.v) + 0.5 * (this.Id * (l[0] * l[0] + l[1] * l[1]) + this.Ia * l[2] * l[2]); }

  /* a point on the centreline, k of K round */
  centre(k, n = K) {
    const a = (k / n) * Math.PI * 2;
    const o = this.toWorld([Math.cos(a) * this.R, Math.sin(a) * this.R, 0]);
    return [this.x[0] + o[0], this.x[1] + o[1], this.x[2] + o[2]];
  }

  /* nearest centreline point to p: {d, n (unit, centreline → p), c} or null */
  nearest(p) {
    const l = this.toLocal([p[0] - this.x[0], p[1] - this.x[1], p[2] - this.x[2]]);
    const rho = Math.hypot(l[0], l[1]);
    if (rho < 1e-9) return null;
    const cl = [this.R * l[0] / rho, this.R * l[1] / rho, 0];
    const df = [l[0] - cl[0], l[1] - cl[1], l[2]];
    const d = Math.hypot(...df);
    if (d < 1e-9) return null;
    const n = this.toWorld(df.map((c) => c / d)), cw = this.toWorld(cl);
    return { d, n, c: [this.x[0] + cw[0], this.x[1] + cw[1], this.x[2] + cw[2]], rho, z: l[2] };
  }

  impulse(rA, J) {
    const m = this.m;
    this.v[0] += J[0] / m; this.v[1] += J[1] / m; this.v[2] += J[2] / m;
    const dw = this.invI(cross(rA, J));
    this.w[0] += dw[0]; this.w[1] += dw[1]; this.w[2] += dw[2];
  }

  velAt(rA) { const c = cross(this.w, rA); return [this.v[0] + c[0], this.v[1] + c[1], this.v[2] + c[2]]; }

  /* the effective inverse mass at rA along a unit direction */
  kAt(rA, N) { return 1 / this.m + dot(N, cross(this.invI(cross(rA, N)), rA)); }

  integrate(h, g = RING_G) {
    const { x, v, p, w } = this;
    p[0] = x[0]; p[1] = x[1]; p[2] = x[2];
    if (this.sleep > 40) return;
    v[1] -= g * h;
    x[0] += v[0] * h; x[1] += v[1] * h; x[2] += v[2] * h;
    // a little air drag on the spin
    const kd = Math.exp(-0.15 * h);
    w[0] *= kd; w[1] *= kd; w[2] *= kd;
    const q = this.q;
    const dq = [
      0.5 * h * (w[0] * q[3] + w[1] * q[2] - w[2] * q[1]),
      0.5 * h * (-w[0] * q[2] + w[1] * q[3] + w[2] * q[0]),
      0.5 * h * (w[0] * q[1] - w[1] * q[0] + w[2] * q[3]),
      0.5 * h * (-w[0] * q[0] - w[1] * q[1] - w[2] * q[2]),
    ];
    for (let d = 0; d < 4; d++) q[d] += dq[d];
    const ql = Math.hypot(...q);
    for (let d = 0; d < 4; d++) q[d] /= ql;
    this._mat();
    this.t += h;
  }

  /* a contact at world point P, unit normal N pushing the ring, against a
     surface moving at vO: restitution e, friction mu. Returns closing speed */
  contact(P, N, vO, e, mu) {
    const rA = [P[0] - this.x[0], P[1] - this.x[1], P[2] - this.x[2]];
    const vc = this.velAt(rA);
    const vr = [vc[0] - vO[0], vc[1] - vO[1], vc[2] - vO[2]];
    const vn = dot(vr, N);
    if (vn >= 0) return 0;
    const j = -(1 + (vn < -1.2 ? e : 0)) * vn / this.kAt(rA, N);
    this.impulse(rA, [N[0] * j, N[1] * j, N[2] * j]);
    const vc2 = this.velAt(rA);
    const vr2 = [vc2[0] - vO[0], vc2[1] - vO[1], vc2[2] - vO[2]];
    const vn2 = dot(vr2, N);
    const vt = [vr2[0] - N[0] * vn2, vr2[1] - N[1] * vn2, vr2[2] - N[2] * vn2];
    const st = Math.hypot(...vt);
    if (st > 1e-7) {
      const T = vt.map((c) => c / st);
      const jt = Math.min(st / this.kAt(rA, T), mu * j);
      this.impulse(rA, [-T[0] * jt, -T[1] * jt, -T[2] * jt]);
    }
    return -vn;
  }

  /* the floor: points round the centreline below r; dead felt, grippy */
  floorStep() {
    let pen = 0;
    this.floor = false;
    const cs = [];
    for (let k = 0; k < K; k++) {
      const c = this.centre(k);
      if (c[1] < this.r) { cs.push(c); pen = Math.max(pen, this.r - c[1]); }
    }
    if (!cs.length) return;
    this.floor = true;
    for (let it = 0; it < 2; it++)
      for (const c of cs) this.contact([c[0], c[1] - this.r, c[2]], [0, 1, 0], [0, 0, 0], 0.3, 0.6);
    this.x[1] += pen;
    // rolling resistance: felt on a mat
    const kr = Math.exp(-2.5 * this._h);
    this.w[0] *= kr; this.w[1] *= Math.exp(-6 * this._h); this.w[2] *= kr;
  }

  /* after the pushes: settle to sleep once at rest on the floor */
  finish(h) {
    const sp = Math.hypot(...this.v), ws = Math.hypot(...this.w);
    if (sp > 30) for (let d = 0; d < 3; d++) this.v[d] *= 30 / sp;
    if (ws > 40) for (let d = 0; d < 3; d++) this.w[d] *= 40 / ws;
    // (only lying down: a ring rolled slow on its edge is about to topple)
    if (this.floor && sp < 0.12 && ws < 0.5 && Math.abs(this.M[8]) > 0.9) this.sleep++;
    else this.sleep = 0;
    if (this.sleep > 40) { this.v = [0, 0, 0]; this.w = [0, 0, 0]; }
    if (![...this.x, ...this.v, ...this.w, ...this.q].every(Number.isFinite)) this.dead = true;
    void h;
  }

  wake() { if (this.sleep > 40) this.sleep = 0; }
}

/* two rings touching: points round each against the other's circle */
export function ringPair(A, B, movableB = true) {
  const d0 = Math.hypot(A.x[0] - B.x[0], A.x[1] - B.x[1], A.x[2] - B.x[2]);
  if (d0 > 2 * (A.R + A.r)) return false;
  let hit = false;
  const mov = (R) => (R === A || movableB ? 1 : 0);
  for (const [P, Q] of [[A, B], [B, A]]) {
    const wP = mov(P), wQ = mov(Q);
    for (let k = 0; k < K; k++) {
      const c = P.centre(k);
      const nb = Q.nearest(c);
      if (!nb || nb.d >= P.r + Q.r) continue;
      hit = true;
      const pen = P.r + Q.r - nb.d, N = nb.n;   // from Q toward P
      const ws = wP + wQ;
      for (let d = 0; d < 3; d++) { P.x[d] += N[d] * pen * wP / ws; Q.x[d] -= N[d] * pen * wQ / ws; }
      // relative velocity at the contact, impulses equal and opposite
      const pc = [c[0] - N[0] * P.r, c[1] - N[1] * P.r, c[2] - N[2] * P.r];
      const rP = [pc[0] - P.x[0], pc[1] - P.x[1], pc[2] - P.x[2]], rQ = [pc[0] - Q.x[0], pc[1] - Q.x[1], pc[2] - Q.x[2]];
      const vP = P.velAt(rP), vQ = Q.velAt(rQ);
      const vn = (vP[0] - vQ[0]) * N[0] + (vP[1] - vQ[1]) * N[1] + (vP[2] - vQ[2]) * N[2];
      if (vn >= 0) continue;
      const kP = wP ? P.kAt(rP, N) : 0, kQ = wQ ? Q.kAt(rQ, N) : 0;
      const j = -1.2 * vn / (kP + kQ);
      if (wP) P.impulse(rP, N.map((c) => c * j));
      if (wQ) Q.impulse(rQ, N.map((c) => -c * j));
      if (wP) P.wake();
      if (wQ) Q.wake();
    }
  }
  return hit;
}
