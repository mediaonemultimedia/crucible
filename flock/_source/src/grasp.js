/* Arms that reach for the stick and coil around it.

   Per arm: idle → reach (distal points steer toward the wood) → grip (the tip
   touched; points are recruited one by one from the tip toward the root and
   held on a helix around the stick, so the tip keeps winding forward as more
   of the arm wraps) → cool (let go; won't reach again for a moment).

   Grip targets live in stick-local coordinates (distance along the axis,
   angle around it), so lifting or swinging the stick carries the octopus.
   An arm lets go when the wood is pulled away faster than its grip can hold. */

const MAX_COIL = 8;
const RECRUIT = 0.075;   // seconds per newly-wrapped point

export class Grasp {
  constructor(body) {
    this.body = body;
    this.params = { grip: 0.6, reach: 1.25 };
    this.arms = body.rig.arms.map(() => ({ state: 'idle', coil: 0, t0: 0, th0: 0, sign: 1, timer: 0, strain: 0, ramp: new Float64Array(MAX_COIL) }));
    this.frame = { u: [1, 0, 0], e1: [0, 0, 1], e2: [0, 1, 0], L: 1 };
    body.hooks.push((h) => this._apply(h));
    // rest path length from the head centre to each arm point (the tethers)
    this.tlen = new Map();
    const T = body._tethers;
    for (let k = 0; k < T.i.length; k++) this.tlen.set(T.i[k], T.len[k]);
  }

  armState(k) { return this.arms[k].state; }
  holdingCount() { return this.arms.filter((a) => a.state === 'grip').length; }

  releaseAll() { for (const a of this.arms) if (a.state !== 'idle') this._let(a, 0.6); }

  _let(a, cool) { a.state = 'cool'; a.timer = cool; a.coil = 0; a.strain = 0; }

  _updateFrame() {
    const { a, b } = this.body.stick;
    const f = this.frame;
    let ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const L = Math.hypot(ux, uy, uz) || 1;
    ux /= L; uy /= L; uz /= L;
    // e1 ⟂ u, as horizontal as possible
    let ex = uz, ey = 0, ez = -ux;
    let el = Math.hypot(ex, ey, ez);
    if (el < 0.2) { ex = 0; ey = -uz; ez = uy; el = Math.hypot(ex, ey, ez); }
    ex /= el; ey /= el; ez /= el;
    f.u = [ux, uy, uz]; f.e1 = [ex, ey, ez];
    f.e2 = [uy * ez - uz * ey, uz * ex - ux * ez, ux * ey - uy * ex];
    f.L = L;
  }

  /* stick-local (axial t, angle th, radius rad) → world, into out */
  _toWorld(t, th, rad, out) {
    const { a } = this.body.stick, { u, e1, e2 } = this.frame;
    const c = Math.cos(th), s = Math.sin(th);
    for (let d = 0; d < 3; d++) out[d] = a[d] + u[d] * t + (e1[d] * c + e2[d] * s) * rad;
    return out;
  }

  _toLocal(px, py, pz) {
    const { a } = this.body.stick, { u, e1, e2 } = this.frame;
    const dx = px - a[0], dy = py - a[1], dz = pz - a[2];
    const t = dx * u[0] + dy * u[1] + dz * u[2];
    const x1 = dx * e1[0] + dy * e1[1] + dz * e1[2];
    const x2 = dx * e2[0] + dy * e2[1] + dz * e2[2];
    return { t, th: Math.atan2(x2, x1), rad: Math.hypot(x1, x2) };
  }

  update(dt) {
    const body = this.body;
    if (!body.stick) {
      for (const a of this.arms) if (a.state === 'grip' || a.state === 'reach') this._let(a, 0.3);
    } else this._updateFrame();

    // how hard the body is being accelerated: a yank beyond what the suckers
    // can hold tears every gripping arm off at once
    const c = body.headC;
    if (dt > 0 && this._pc) {
      const v = [(c[0] - this._pc[0]) / dt, (c[1] - this._pc[1]) / dt, (c[2] - this._pc[2]) / dt];
      if (this._pv) {
        const a = Math.hypot(v[0] - this._pv[0], v[1] - this._pv[1], v[2] - this._pv[2]) / dt;
        this.acc = (this.acc || 0) * 0.6 + a * 0.4;
      }
      this._pv = v;
    }
    this._pc = [c[0], c[1], c[2]];
    if (this.acc > 45 + 300 * this.params.grip)
      for (const A of this.arms) if (A.state === 'grip' && A.timer > 0.4) this._let(A, 1.4);

    const held = new Set();
    for (const g of body.grabs.values()) if (body.rig.armOf[g.i] >= 0) held.add(body.rig.armOf[g.i]);

    const { x, r } = body;
    const P = this.params;
    this.arms.forEach((A, k) => {
      const idx = body.rig.arms[k].idx;
      const N = idx.length;
      if (A.state === 'cool') { A.timer -= dt; if (A.timer <= 0) A.state = 'idle'; return; }
      if (!body.stick) return;
      if (held.has(k)) { if (A.state !== 'idle') this._let(A, 0.8); return; }
      const sr = body.stick.r;

      if (A.state === 'idle') {
        let best = 1e9;
        for (let j = 5; j < N; j++) {
          const i = idx[j];
          const l = this._toLocal(x[i * 3], x[i * 3 + 1], x[i * 3 + 2]);
          if (l.t < -0.1 || l.t > this.frame.L + 0.1) continue;
          best = Math.min(best, l.rad - sr - r[i]);
        }
        if (best < P.reach) { A.state = 'reach'; A.timer = 0; }
        return;
      }

      if (A.state === 'reach') {
        A.timer += dt;
        const tip = idx[N - 1], prev = idx[N - 2];
        const l = this._toLocal(x[tip * 3], x[tip * 3 + 1], x[tip * 3 + 2]);
        if (l.rad < sr + r[tip] + 0.07 && l.t > 0 && l.t < this.frame.L) {
          // capture: wind in the direction the tip is already travelling
          const fx = x[tip * 3] - x[prev * 3], fy = x[tip * 3 + 1] - x[prev * 3 + 1], fz = x[tip * 3 + 2] - x[prev * 3 + 2];
          const { e1, e2 } = this.frame;
          const c = Math.cos(l.th), s = Math.sin(l.th);
          // tangent of increasing angle: -sin·e1 + cos·e2
          const tx = -s * e1[0] + c * e2[0], ty = -s * e1[1] + c * e2[1], tz = -s * e1[2] + c * e2[2];
          A.sign = fx * tx + fy * ty + fz * tz >= 0 ? 1 : -1;
          A.t0 = l.t; A.th0 = l.th; A.coil = 1; A.timer = 0; A.strain = 0;
          A.ramp.fill(0);
          A.state = 'grip';
        } else if (A.timer > 3.5) this._let(A, 1.5);
        return;
      }

      if (A.state === 'grip') {
        A.timer += dt;
        const want = Math.min(MAX_COIL, 1 + Math.floor(A.timer / RECRUIT));
        A.coil = want;
        for (let c = 0; c < A.coil; c++) A.ramp[c] = Math.min(1, A.ramp[c] + dt / 0.18);
        // overload: the arm between body and coil is being drawn out further
        // than this grip can bear (straight-line distance over rest path length)
        const base = idx[N - A.coil];
        const c = body.rig.center;
        const dist = Math.hypot(x[base * 3] - x[c * 3], x[base * 3 + 1] - x[c * 3 + 1], x[base * 3 + 2] - x[c * 3 + 2]);
        const stretch = dist / (this.tlen.get(base) || 1);
        A.stretch = stretch;
        const limit = 1.24 + 0.2 * P.grip;
        if (A.timer > 0.4 && (stretch > limit || A.strain > 0.25 + 0.5 * P.grip)) {
          A.over = (A.over || 0) + dt;
          if (A.over > 0.06) this._let(A, 1.4);
        } else A.over = 0;
      }
    });
  }

  _apply(h) {
    const body = this.body;
    if (!body.stick) return;
    const { x, r } = body;
    const sr = body.stick.r;
    const P = this.params;
    const out = [0, 0, 0];
    this.arms.forEach((A, k) => {
      const idx = body.rig.arms[k].idx;
      const N = idx.length;
      if (A.state === 'reach') {
        for (let j = N - 4; j < N; j++) {
          const i = idx[j];
          const l = this._toLocal(x[i * 3], x[i * 3 + 1], x[i * 3 + 2]);
          const t = Math.min(this.frame.L, Math.max(0, l.t));
          this._toWorld(t, l.th, sr + r[i], out);
          const kk = 0.012 * (j - N + 5);
          for (let d = 0; d < 3; d++) x[i * 3 + d] += (out[d] - x[i * 3 + d]) * kk;
        }
      } else if (A.state === 'grip') {
        let strain = 0;
        const pitch = 0.42;  // axial advance per full turn, keeps the coil from overlapping itself
        let th = A.th0, ax = A.t0;
        // walk from the most recently recruited point (at the contact spot)
        // toward the tip, so the tip is the one that winds furthest around
        for (let c = A.coil - 1; c >= 0; c--) {
          const j = N - 1 - c;
          const i = idx[j];
          const rad = sr + r[i] * 0.9;
          if (c < A.coil - 1) {
            const dth = body.rig.seg / rad * 0.92;
            th += A.sign * dth;
            ax += (dth / (2 * Math.PI)) * pitch * (k % 2 ? 1 : -1);
          }
          const t = Math.min(this.frame.L - 0.05, Math.max(0.05, ax));
          this._toWorld(t, th, rad, out);
          const kk = 0.3 * A.ramp[c] * (0.35 + 0.65 * P.grip);
          const dx = out[0] - x[i * 3], dy = out[1] - x[i * 3 + 1], dz = out[2] - x[i * 3 + 2];
          strain = Math.max(strain, Math.hypot(dx, dy, dz) * A.ramp[c]);
          x[i * 3] += dx * kk; x[i * 3 + 1] += dy * kk; x[i * 3 + 2] += dz * kk;
        }
        A.strain = strain;
      }
    });
  }
}

