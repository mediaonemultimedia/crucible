/* Position-based soft body for the octopus.

   Small-steps PBD (Macklin et al. 2019): many substeps, one pass of every
   constraint per substep. The head is one shape-matched cloud (stuffing sets
   how hard it pulls back to shape); each arm is a chain of three-point
   shape-matched windows (bending + rest curl) plus stretch links. Everything
   else — grabs, the finger, the stick, the floor — is a projection on top.   */

import { extractRotation, quatToMat, invert3, det3, mulMat3, segParam } from './math.js';

// Every substep is exactly H long. The per-substep stiffness fractions below
// are tuned for that H; feeding the solver uneven step lengths turns the same
// positional correction into a different velocity each frame and pumps energy
// in (measured: peak rest energy 0.0002 at a steady 1/60 s, 156 at ±30%).
const H = 1 / 600;
export const FIXED = 1 / 120;

export class SoftBody {
  constructor(rig) {
    this.rig = rig;
    const n = (this.n = rig.n);
    this.x = Float64Array.from(rig.rest);
    this.p = Float64Array.from(rig.rest);
    this.v = new Float64Array(3 * n);
    this.r = rig.radius;
    this.w = new Float64Array(n).fill(1);         // inverse mass
    this.inHead = new Uint8Array(n);
    for (const i of rig.head) this.inHead[i] = 1;

    this.params = { stuffing: 0.42, damping: 0.45, gravity: 38 };
    this.grabs = new Map();                        // id → {i, t:[x,y,z], k}
    this.spheres = [];                             // finger / squish colliders
    this.planes = [];                              // {y, k} pressing down from above
    this.stick = null;                             // {a:[3], b:[3], r}
    this.hooks = [];                               // fn(h) run every substep
    this.contact = new Uint8Array(n);              // touching floor this step

    this.head = this._group(rig.head);
    this.windows = rig.windows.map((ix) => this._group(ix));
    this.headC = new Float64Array(3);
    this.headR = new Float64Array(9).fill(0);
    this.headR[0] = this.headR[4] = this.headR[8] = 1;

    this._pairs = this._collisionPairs();
    this._tethers = this._buildTethers();
    this.time = 0;
  }

  _group(ix) {
    const rest = this.rig.rest;
    const m = ix.length;
    const c0 = [0, 0, 0];
    for (const i of ix) for (let d = 0; d < 3; d++) c0[d] += rest[i * 3 + d] / m;
    const q = new Float64Array(3 * m);
    const Aqq = new Float64Array(9);
    ix.forEach((i, j) => {
      for (let d = 0; d < 3; d++) q[j * 3 + d] = rest[i * 3 + d] - c0[d];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) Aqq[r * 3 + c] += q[j * 3 + r] * q[j * 3 + c];
    });
    return { ix, q, c0, AqqInv: invert3(Aqq, new Float64Array(9)), q4: [0, 0, 0, 1], A: new Float64Array(9), c: new Float64Array(3) };
  }

  _collisionPairs() {
    const { armOf, armJ } = this.rig;
    const a = [], b = [];
    for (let i = 0; i < this.n; i++)
      for (let j = i + 1; j < this.n; j++) {
        if (this.inHead[i] && this.inHead[j]) continue;
        if (armOf[i] >= 0 && armOf[i] === armOf[j] && Math.abs(armJ[i] - armJ[j]) < 3) continue;
        // an arm's first two points live inside the head by design
        if ((this.inHead[i] && armJ[j] >= 0 && armJ[j] < 3) || (this.inHead[j] && armJ[i] >= 0 && armJ[i] < 3)) continue;
        a.push(i); b.push(j);
      }
    return { a: Int32Array.from(a), b: Int32Array.from(b) };
  }

  /* long-range attachments (Kim, Chentanez, Müller 2012): each arm point may
     get no further from the head centre than its rest path length allows.
     Without these a gravity-loaded chain solved one pass per substep stretches
     like chewing gum, and an arm holding the stick could never lift the body. */
  _buildTethers() {
    const { rest, arms, center } = this.rig;
    const T = [];
    const d = (a, b) => Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]);
    for (const arm of arms) {
      let arc = d(center, arm.idx[0]);
      for (let j = 1; j < arm.idx.length; j++) {
        arc += d(arm.idx[j - 1], arm.idx[j]);
        if (j >= 2) T.push([arm.idx[j], arc]);
      }
    }
    return { i: Int32Array.from(T.map((t) => t[0])), len: Float64Array.from(T.map((t) => t[1])) };
  }

  _tether() {
    const { x } = this;
    const c = this.rig.center;
    const head = this.rig.head;
    const maxStretch = 1.32;
    const { i: I, len } = this._tethers;
    // the body is hauled by the single worst violation, not their sum —
    // summing a whole stretched arm's worth overshoots and diverges
    let sx = 0, sy = 0, sz = 0, worst = 0;
    for (let k = 0; k < I.length; k++) {
      const i = I[k];
      const dx = x[i * 3] - x[c * 3], dy = x[i * 3 + 1] - x[c * 3 + 1], dz = x[i * 3 + 2] - x[c * 3 + 2];
      const d = Math.hypot(dx, dy, dz), L = len[k] * maxStretch;
      if (d <= L) continue;
      const e = (d - L) / d;
      // the arm point gives a little; the body as a whole is hauled the rest
      x[i * 3] -= dx * e * 0.35; x[i * 3 + 1] -= dy * e * 0.35; x[i * 3 + 2] -= dz * e * 0.35;
      if (e * d > worst) { worst = e * d; sx = dx * e * 0.65; sy = dy * e * 0.65; sz = dz * e * 0.65; }
    }
    if (sx || sy || sz) {
      for (const i of head) { x[i * 3] += sx; x[i * 3 + 1] += sy; x[i * 3 + 2] += sz; }
    }
  }

  /* shape memory: a stuffed arm drifts back toward its sewn pose relative to
     the head — tips curling up again — however it was left lying           */
  _memory(alpha) {
    const { x } = this;
    const g = this.head, R = quatToMat(g.q4, _R), c = g.c, c0 = g.c0, rest = this.rig.rest;
    for (const arm of this.rig.arms) {
      const idx = arm.idx;
      for (let j = 2; j < idx.length; j++) {
        const i = idx[j];
        if (this.w[i] === 0) continue;
        const qx = rest[i * 3] - c0[0], qy = rest[i * 3 + 1] - c0[1], qz = rest[i * 3 + 2] - c0[2];
        const a = alpha * (0.4 + 0.6 * j / idx.length);
        x[i * 3] += (c[0] + R[0] * qx + R[1] * qy + R[2] * qz - x[i * 3]) * a;
        x[i * 3 + 1] += (c[1] + R[3] * qx + R[4] * qy + R[5] * qz - x[i * 3 + 1]) * a;
        x[i * 3 + 2] += (c[2] + R[6] * qx + R[7] * qy + R[8] * qz - x[i * 3 + 2]) * a;
      }
    }
  }

  reset() {
    this.x.set(this.rig.rest);
    this.p.set(this.rig.rest);
    this.v.fill(0);
    this.grabs.clear();
    this.head.q4 = [0, 0, 0, 1];
    for (const w of this.windows) w.q4 = [0, 0, 0, 1];
  }

  grab(id, i, t, k = 0.35) { this.grabs.set(id, { i, t: [...t], k }); }
  moveGrab(id, t) { const g = this.grabs.get(id); if (g) g.t = [...t]; }
  release(id) { this.grabs.delete(id); }

  /* shape-match one group: returns rotation quaternion in g.q4 */
  _match(g, alpha, stretchy = false) {
    const x = this.x, { ix, q, A, c } = g;
    const m = ix.length;
    c[0] = c[1] = c[2] = 0;
    for (const i of ix) { c[0] += x[i * 3]; c[1] += x[i * 3 + 1]; c[2] += x[i * 3 + 2]; }
    c[0] /= m; c[1] /= m; c[2] /= m;
    A.fill(0);
    let pp = 0, qq = 0;
    for (let j = 0; j < m; j++) {
      const i = ix[j];
      const px = x[i * 3] - c[0], py = x[i * 3 + 1] - c[1], pz = x[i * 3 + 2] - c[2];
      const qx = q[j * 3], qy = q[j * 3 + 1], qz = q[j * 3 + 2];
      pp += px * px + py * py + pz * pz; qq += qx * qx + qy * qy + qz * qz;
      A[0] += px * qx; A[1] += px * qy; A[2] += px * qz;
      A[3] += py * qx; A[4] += py * qy; A[5] += py * qz;
      A[6] += pz * qx; A[7] += pz * qy; A[8] += pz * qz;
    }
    extractRotation(A, g.q4, 3);
    if (alpha <= 0) return;
    const R = quatToMat(g.q4, _R);
    // arm windows keep their *shape* but may grow: stretch is the links' job
    const sc = stretchy ? Math.min(1.35, Math.max(1, Math.sqrt(pp / qq))) : 1;
    for (let j = 0; j < m; j++) {
      const i = ix[j];
      if (this.w[i] === 0) continue;
      const qx = q[j * 3] * sc, qy = q[j * 3 + 1] * sc, qz = q[j * 3 + 2] * sc;
      const gx = c[0] + R[0] * qx + R[1] * qy + R[2] * qz;
      const gy = c[1] + R[3] * qx + R[4] * qy + R[5] * qz;
      const gz = c[2] + R[6] * qx + R[7] * qy + R[8] * qz;
      x[i * 3] += (gx - x[i * 3]) * alpha;
      x[i * 3 + 1] += (gy - x[i * 3 + 1]) * alpha;
      x[i * 3 + 2] += (gz - x[i * 3 + 2]) * alpha;
    }
  }

  /* real frame time in, whole fixed steps out: browsers never deliver even
     frames, so the simulation keeps its own clock                          */
  advance(dt, before, after) {
    this._acc = Math.min((this._acc || 0) + Math.max(0, dt), FIXED * 6);
    let steps = 0;
    while (this._acc >= FIXED - 1e-9) {
      this._acc -= FIXED;
      before?.(FIXED);
      this.step(FIXED);
      after?.(FIXED);
      steps++;
    }
    return steps;
  }

  step(dt) {
    dt = Math.min(dt, 1 / 30);
    if (dt <= 0) return;
    const sub = Math.max(1, Math.round(dt / H));
    const h = dt / sub;
    for (let s = 0; s < sub; s++) this._substep(h);
    // last line of defence: never let a bad frame poison the piece
    let sum = this.head.q4[3];
    for (let i = 0; i < this.n * 3; i++) sum += this.x[i];
    if (!Number.isFinite(sum)) {
      const stick = this.stick;
      this.reset();
      this.stick = stick;
      this.nanResets = (this.nanResets || 0) + 1;
    }
    this.time += dt;
    quatToMat(this.head.q4, this.headR);
    this.headC.set(this.head.c);
  }

  _substep(h) {
    const { x, p, v, n, r } = this;
    const P = this.params;
    for (let i = 0; i < n * 3; i++) p[i] = x[i];
    for (let i = 0; i < n; i++) {
      v[i * 3 + 1] -= P.gravity * h;
      x[i * 3] += v[i * 3] * h;
      x[i * 3 + 1] += v[i * 3 + 1] * h;
      x[i * 3 + 2] += v[i * 3 + 2] * h;
    }

    // stuffing: loose (0) lets the head slump and dent, packed (1) holds shape
    const st = P.stuffing;
    this._match(this.head, 0.012 + 0.16 * st * st + 0.02 * st);
    const bend = 0.08 + 0.26 * st;
    for (const w of this.windows) this._match(w, bend, true);
    this._memory(0.0015 + 0.006 * st);

    const { linkA, linkB, linkLen } = this.rig;
    const stretchK = 0.1;
    for (let l = 0; l < linkA.length; l++) {
      const a = linkA[l], b = linkB[l];
      const dx = x[b * 3] - x[a * 3], dy = x[b * 3 + 1] - x[a * 3 + 1], dz = x[b * 3 + 2] - x[a * 3 + 2];
      const d = Math.hypot(dx, dy, dz) || 1e-9;
      const wa = this.w[a], wb = this.w[b], ws = wa + wb;
      if (ws === 0) continue;
      const corr = (d - linkLen[l]) / d * stretchK / ws;
      x[a * 3] += dx * corr * wa; x[a * 3 + 1] += dy * corr * wa; x[a * 3 + 2] += dz * corr * wa;
      x[b * 3] -= dx * corr * wb; x[b * 3 + 1] -= dy * corr * wb; x[b * 3 + 2] -= dz * corr * wb;
    }

    // a hand can only move so fast: cap each grab's pull per substep, so a
    // pointer that jumps across the screen drags rather than teleports
    const maxPull = 32 * h;
    for (const g of this.grabs.values()) {
      const i = g.i;
      let dx = (g.t[0] - x[i * 3]) * g.k, dy = (g.t[1] - x[i * 3 + 1]) * g.k, dz = (g.t[2] - x[i * 3 + 2]) * g.k;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxPull) { const f = maxPull / d; dx *= f; dy *= f; dz *= f; }
      x[i * 3] += dx; x[i * 3 + 1] += dy; x[i * 3 + 2] += dz;
    }

    for (const fn of this.hooks) fn(h);
    this._tether();

    this._collide();

    for (const sp of this.spheres) {
      for (let i = 0; i < n; i++) {
        const dx = x[i * 3] - sp.x, dy = x[i * 3 + 1] - sp.y, dz = x[i * 3 + 2] - sp.z;
        const d = Math.hypot(dx, dy, dz), m = sp.r + r[i] * 0.6;
        if (d < m && d > 1e-9) {
          const f = (m - d) / d;
          x[i * 3] += dx * f; x[i * 3 + 1] += dy * f; x[i * 3 + 2] += dz * f;
        }
      }
    }
    for (const pl of this.planes) {
      for (let i = 0; i < n; i++) {
        const top = pl.y - r[i];
        if (x[i * 3 + 1] > top) x[i * 3 + 1] = top;
      }
    }

    if (this.stick) this._stickCollide();

    // floor with Coulomb-ish friction applied to the tangential step
    for (let i = 0; i < n; i++) {
      const ri = r[i];
      if (x[i * 3 + 1] < ri) {
        x[i * 3 + 1] = ri;
        const mu = 0.55;
        x[i * 3] = p[i * 3] + (x[i * 3] - p[i * 3]) * (1 - mu);
        x[i * 3 + 2] = p[i * 3 + 2] + (x[i * 3 + 2] - p[i * 3 + 2]) * (1 - mu);
        this.contact[i] = 1;
      } else this.contact[i] = 0;
    }

    // velocities, then internal damping: bleed off motion *relative to the
    // body's mean*, so jiggle dies down but a toss still flies
    let mx = 0, my = 0, mz = 0;
    const ih = 1 / h;
    for (let i = 0; i < n; i++) {
      v[i * 3] = (x[i * 3] - p[i * 3]) * ih;
      v[i * 3 + 1] = (x[i * 3 + 1] - p[i * 3 + 1]) * ih;
      v[i * 3 + 2] = (x[i * 3 + 2] - p[i * 3 + 2]) * ih;
      mx += v[i * 3]; my += v[i * 3 + 1]; mz += v[i * 3 + 2];
    }
    mx /= n; my /= n; mz /= n;
    const VMAX = 60;
    for (let i = 0; i < n; i++) {
      const sp = Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
      if (sp > VMAX) { const f = VMAX / sp; v[i * 3] *= f; v[i * 3 + 1] *= f; v[i * 3 + 2] *= f; }
    }
    const kd = Math.exp(-(0.4 + 14 * P.damping * P.damping) * h);
    const ka = Math.exp(-0.25 * h);
    for (let i = 0; i < n; i++) {
      v[i * 3] = (mx + (v[i * 3] - mx) * kd) * ka;
      v[i * 3 + 1] = (my + (v[i * 3 + 1] - my) * kd) * ka;
      v[i * 3 + 2] = (mz + (v[i * 3 + 2] - mz) * kd) * ka;
    }
  }

  _collide() {
    const { x, r, w } = this;
    const { a: A, b: B } = this._pairs;
    for (let k = 0; k < A.length; k++) {
      const i = A[k], j = B[k];
      const dx = x[j * 3] - x[i * 3];
      const m = r[i] + r[j];
      if (dx > m || dx < -m) continue;
      const dy = x[j * 3 + 1] - x[i * 3 + 1];
      if (dy > m || dy < -m) continue;
      const dz = x[j * 3 + 2] - x[i * 3 + 2];
      if (dz > m || dz < -m) continue;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= m * m || d2 < 1e-12) continue;
      const d = Math.sqrt(d2);
      const ws = w[i] + w[j];
      if (ws === 0) continue;
      const f = (m - d) / d * 0.5 / ws;
      x[i * 3] -= dx * f * w[i]; x[i * 3 + 1] -= dy * f * w[i]; x[i * 3 + 2] -= dz * f * w[i];
      x[j * 3] += dx * f * w[j]; x[j * 3 + 1] += dy * f * w[j]; x[j * 3 + 2] += dz * f * w[j];
    }
  }

  _stickCollide() {
    const { x, p, r, n } = this;
    const { a, b, r: sr } = this.stick;
    for (let i = 0; i < n; i++) {
      const px = x[i * 3], py = x[i * 3 + 1], pz = x[i * 3 + 2];
      const t = segParam(a[0], a[1], a[2], b[0], b[1], b[2], px, py, pz);
      const cx = a[0] + (b[0] - a[0]) * t, cy = a[1] + (b[1] - a[1]) * t, cz = a[2] + (b[2] - a[2]) * t;
      const dx = px - cx, dy = py - cy, dz = pz - cz;
      const d = Math.hypot(dx, dy, dz), m = sr + r[i];
      if (d < m && d > 1e-9) {
        const f = (m - d) / d;
        x[i * 3] += dx * f; x[i * 3 + 1] += dy * f; x[i * 3 + 2] += dz * f;
        // a little grip-friction against the wood
        const mu = 0.25;
        for (let k = 0; k < 3; k++) x[i * 3 + k] = x[i * 3 + k] - (x[i * 3 + k] - p[i * 3 + k]) * mu * 0.3;
      }
    }
  }

  /* ── readouts ─────────────────────────────────────────────────────────── */

  kinetic() {
    let e = 0;
    for (let i = 0; i < this.n * 3; i++) e += this.v[i] * this.v[i];
    return 0.5 * e;
  }

  volumeRatio() {
    const g = this.head;
    const L = mulMat3(g.A, g.AqqInv, _L);
    return Math.abs(det3(L));
  }

  /* nudges for the action buttons ─────────────────────────────────────────── */
  impulse(fn) {
    for (let i = 0; i < this.n; i++) {
      const dv = fn(i, this.x[i * 3], this.x[i * 3 + 1], this.x[i * 3 + 2]);
      if (!dv) continue;
      this.v[i * 3] += dv[0]; this.v[i * 3 + 1] += dv[1]; this.v[i * 3 + 2] += dv[2];
    }
  }
}

const _R = new Float64Array(9);
const _L = new Float64Array(9);
