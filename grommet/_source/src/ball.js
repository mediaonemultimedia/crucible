/* A thrown ball: a rigid sphere with its own little integrator, run every
   soft-body substep (so a fast ball can't tunnel through a 0.07-unit
   stuffing point between steps).

   It falls, bounces on the floor with some restitution and rolling
   friction, spins (felt has grip, so a struck ball carries spin; a little
   Magnus lift bends its flight), and collides with the plush both ways, by
   mass: the ball moves the stuffing, the stuffing moves the ball. Every
   contact with the plush is reported, so a game can tell a header from a
   save from a bonk.                                                       */

export const BALL_G = 24;

export class Ball {
  constructor({ r, mass, restitution = 0.55, roll = 1.2, x, v, g = BALL_G }) {
    this.r = r;
    this.g = g;
    this.mass = mass;
    this.e = restitution;
    this.roll = roll;
    this.x = [...x];
    this.v = [...v];
    this.p = [...x];
    this.w = [0, 0, 0];          // spin, rad/s (world axis × rate)
    this.q = [0, 0, 0, 1];       // orientation, for drawing
    this.t = 0;
    this.touch = null;           // last plush contact this substep: {i, speed, n:[3]}
    this.floorHits = 0;
  }

  speed() { return Math.hypot(this.v[0], this.v[1], this.v[2]); }

  /* predict where the ball is after `t` seconds of free flight (no floor) */
  at(t, out = [0, 0, 0]) {
    out[0] = this.x[0] + this.v[0] * t;
    out[1] = this.x[1] + this.v[1] * t - 0.5 * this.g * t * t;
    out[2] = this.x[2] + this.v[2] * t;
    return out;
  }

  /* when the ball's centre reaches z = zp in free flight (Infinity if never) */
  timeToZ(zp) {
    const vz = this.v[2];
    if (Math.abs(vz) < 1e-6) return Infinity;
    const t = (zp - this.x[2]) / vz;
    return t >= 0 ? t : Infinity;
  }

  /* one substep of flight; collisions come after (see collideSoft) */
  integrate(h) {
    const { x, v, p, w } = this;
    p[0] = x[0]; p[1] = x[1]; p[2] = x[2];
    v[1] -= this.g * h;
    // Magnus: spin × velocity, small — topspin dips, slice floats
    const km = 0.012;
    v[0] += km * (w[1] * v[2] - w[2] * v[1]) * h;
    v[1] += km * (w[2] * v[0] - w[0] * v[2]) * h;
    v[2] += km * (w[0] * v[1] - w[1] * v[0]) * h;
    x[0] += v[0] * h; x[1] += v[1] * h; x[2] += v[2] * h;
    this.t += h;
    this.touch = null;
  }

  /* two-way collision with the soft body's points; returns the strongest
     contact (relative closing speed, point index, normal) or null        */
  collideSoft(soft, share = this.mass / (this.mass + 1)) {
    const { x: X, r: R, n, p: P } = soft;
    const b = this.x, br = this.r;
    let best = null;
    for (let i = 0; i < n; i++) {
      const dx = X[i * 3] - b[0], dy = X[i * 3 + 1] - b[1], dz = X[i * 3 + 2] - b[2];
      const m = br + R[i] * 0.9;
      if (dx > m || dx < -m || dy > m || dy < -m || dz > m || dz < -m) continue;
      const d = Math.hypot(dx, dy, dz);
      if (d >= m || d < 1e-9) continue;
      const nx = dx / d, ny = dy / d, nz = dz / d, pen = m - d;
      // how fast they were closing, before this push
      const close = (this.v[0] - (X[i * 3] - P[i * 3]) / this._h) * nx + (this.v[1] - (X[i * 3 + 1] - P[i * 3 + 1]) / this._h) * ny + (this.v[2] - (X[i * 3 + 2] - P[i * 3 + 2]) / this._h) * nz;
      X[i * 3] += nx * pen * share; X[i * 3 + 1] += ny * pen * share; X[i * 3 + 2] += nz * pen * share;
      b[0] -= nx * pen * (1 - share); b[1] -= ny * pen * (1 - share); b[2] -= nz * pen * (1 - share);
      if (!best || close > best.speed) best = { i, speed: close, n: [nx, ny, nz], at: [b[0] + nx * br, b[1] + ny * br, b[2] + nz * br] };
    }
    if (best) this.touch = best;
    return best;
  }

  /* a capsule (a goal post): bounce off it */
  collideCapsule(a, c, cr, e = 0.6) {
    const b = this.x;
    const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
    const l2 = dx * dx + dy * dy + dz * dz;
    let t = ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy + (b[2] - a[2]) * dz) / l2;
    t = Math.max(0, Math.min(1, t));
    const qx = b[0] - (a[0] + dx * t), qy = b[1] - (a[1] + dy * t), qz = b[2] - (a[2] + dz * t);
    const d = Math.hypot(qx, qy, qz), m = this.r + cr;
    if (d >= m || d < 1e-9) return false;
    const nx = qx / d, ny = qy / d, nz = qz / d;
    b[0] += nx * (m - d); b[1] += ny * (m - d); b[2] += nz * (m - d);
    const vn = this.v[0] * nx + this.v[1] * ny + this.v[2] * nz;
    if (vn < 0) { this.v[0] -= (1 + e) * vn * nx; this.v[1] -= (1 + e) * vn * ny; this.v[2] -= (1 + e) * vn * nz; }
    this._postHit = true;
    return true;
  }

  /* after the pushes: velocity from the position change, then the floor */
  finish(h) {
    const { x, v, p, w } = this;
    const ih = 1 / h;
    // the plush's push becomes velocity (soaked up a little: stuffing is soft)
    if (this.touch) {
      const kx = (x[0] - p[0]) * ih, ky = (x[1] - p[1]) * ih, kz = (x[2] - p[2]) * ih;
      v[0] = kx; v[1] = ky; v[2] = kz;
    }
    if (x[1] < this.r) {
      const vin = v[1];
      x[1] = this.r;
      if (vin < -1.5) { v[1] = -vin * this.e; this.floorHits++; } else v[1] = Math.max(0, v[1]);
      // felt on the floor: spin and slide trade until it rolls, then slows
      const k = Math.exp(-this.roll * h);
      v[0] *= k; v[2] *= k;
      w[0] += (v[2] / this.r - w[0]) * Math.min(1, 20 * h);
      w[2] += (-v[0] / this.r - w[2]) * Math.min(1, 20 * h);
      w[1] *= Math.exp(-3 * h);
      if (Math.hypot(v[0], v[2]) < 0.05 && Math.abs(v[1]) < 0.5) { v[0] = 0; v[2] = 0; }
    }
    const sp = Math.hypot(v[0], v[1], v[2]);
    if (sp > 45) for (let d = 0; d < 3; d++) v[d] *= 45 / sp;
    w.forEach((c, d) => { w[d] = c * Math.exp(-0.3 * h); });
    // turn the drawing quaternion by the spin
    const a = Math.hypot(w[0], w[1], w[2]) * h;
    if (a > 1e-7) {
      const s = Math.sin(a / 2) / (a / h), qq = [w[0] * s, w[1] * s, w[2] * s, Math.cos(a / 2)], o = this.q;
      this.q = [
        qq[3] * o[0] + qq[0] * o[3] + qq[1] * o[2] - qq[2] * o[1],
        qq[3] * o[1] - qq[0] * o[2] + qq[1] * o[3] + qq[2] * o[0],
        qq[3] * o[2] + qq[0] * o[1] - qq[1] * o[0] + qq[2] * o[3],
        qq[3] * o[3] - qq[0] * o[0] - qq[1] * o[1] - qq[2] * o[2],
      ];
      const ql = Math.hypot(...this.q);
      this.q = this.q.map((c) => c / ql);
    }
    if (![...x, ...v].every(Number.isFinite)) { this.dead = true; }
  }

  /* one whole substep against a soft body (and anything else via `extra`) */
  step(h, soft, extra) {
    this._h = h;
    this.integrate(h);
    if (soft) this.collideSoft(soft);
    extra?.(this, h);
    this.finish(h);
  }
}
