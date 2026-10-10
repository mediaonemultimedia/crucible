/* Position-based soft body for the plush toys.

   Small-steps PBD (Macklin et al. 2019): many substeps, one pass of every
   constraint per substep. The head (or torso) is a shape-matched cloud
   (stuffing sets how hard it pulls back to shape); each arm, ear, tail or
   neck is a chain of three-point shape-matched windows (bending + rest curl)
   plus stretch links. A second cloud — the llama's head on its neck — shares
   points with the chain it sits on and keeps a gentle memory of its pose
   relative to the body. Everything else — grabs, the finger, the stick, the
   floor — is a projection on top.                                          */

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
    // cloud membership as bits: a shared point belongs to two clouds
    this.cloudMask = new Uint8Array(n);
    rig.clouds.forEach((c, k) => { for (const i of c.ix) this.cloudMask[i] |= 1 << k; });

    this.params = { stuffing: 0.42, damping: 0.45, gravity: 38, mu: 0.55 };
    this.grabs = new Map();                        // id → {i, t:[x,y,z], k}
    this.spheres = [];                             // finger / squish colliders
    this.planes = [];                              // {y, k} pressing down from above
    this.stick = null;                             // {a:[3], b:[3], r}
    this.hooks = [];                               // fn(h) run every substep
    this.pose = null;                              // re-posed rest shape, while a toy is in play
    this.poseRot = null;                           // …and each point's rotation into it (3×3 rows)
    this.posedCloud = -1;                          // the cloud whose shape follows the pose
    this.contact = new Uint8Array(n);              // touching floor this step

    this.head = this._group(rig.head);
    this.windows = rig.windows.map((ix) => this._group(ix));
    this.headC = new Float64Array(3);
    this.headR = new Float64Array(9).fill(0);
    this.headR[0] = this.headR[4] = this.headR[8] = 1;
    // clouds[0] is the head; any further clouds (a head on a torso) follow
    this.clouds = [this.head, ...rig.clouds.slice(1).map((c) => this._group(c.ix))];
    this.cloudC = [this.headC, ...this.clouds.slice(1).map(() => new Float64Array(3))];
    this.cloudR = [this.headR, ...this.clouds.slice(1).map(() => Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1))];

    // a rig of several separate toys (two pandas in one ring): which toy
    // each point belongs to. Their contacts with each other go through a
    // broadphase (_collideBodies) instead of the all-pairs list
    this.bodyOf = null;
    if (rig.bodies) {
      this.bodyOf = new Int8Array(n);
      rig.bodies.forEach((B, k) => { for (const i of B.ix) this.bodyOf[i] = k; });
    }
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
    const { armOf, armJ, arms, rest, restSkip } = this.rig;
    const M = this.cloudMask, r = this.r;
    const a = [], b = [];
    for (let i = 0; i < this.n; i++)
      for (let j = i + 1; j < this.n; j++) {
        if (M[i] & M[j]) continue;
        if (this.bodyOf && this.bodyOf[i] !== this.bodyOf[j]) continue;
        if (armOf[i] >= 0 && armOf[i] === armOf[j] && Math.abs(armJ[i] - armJ[j]) < 3) continue;
        // an arm's first two points live inside the head by design
        if ((M[i] && armJ[j] >= 0 && armJ[j] < arms[armOf[j]].skip) || (M[j] && armJ[i] >= 0 && armJ[i] < arms[armOf[i]].skip)) continue;
        // and anything sewn overlapping (an ear root in a head, a head on a
        // torso) was meant to: never push it apart
        if (restSkip && Math.hypot(rest[i * 3] - rest[j * 3], rest[i * 3 + 1] - rest[j * 3 + 1], rest[i * 3 + 2] - rest[j * 3 + 2]) < (r[i] + r[j]) * 1.08) continue;
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
    let T = this.rig.tethers;
    if (!T) {
      const L = [];
      const d = (a, b) => Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2]);
      for (const arm of arms) {
        let arc = d(center, arm.idx[0]);
        for (let j = 1; j < arm.idx.length; j++) {
          arc += d(arm.idx[j - 1], arm.idx[j]);
          if (j >= 2) L.push([arm.idx[j], arc, arm.stretch, arm.from, arm.cloud]);
        }
      }
      T = {
        i: Int32Array.from(L.map((t) => t[0])), len: Float64Array.from(L.map((t) => t[1])),
        stretch: Float64Array.from(L.map((t) => t[2])), from: Int32Array.from(L.map((t) => t[3])),
        cloud: Int32Array.from(L.map((t) => t[4])),
      };
    }
    // the limit is fixed: precompute it once (same product the loop took)
    const lim = new Float64Array(T.i.length);
    for (let k = 0; k < lim.length; k++) lim[k] = T.len[k] * T.stretch[k];
    return { ...T, lim };
  }

  _tether() {
    const { x } = this;
    const { i: I, lim, from, cloud } = this._tethers;
    // each cloud is hauled by its single worst violation, not their sum —
    // summing a whole stretched arm's worth overshoots and diverges
    const nc = this.rig.clouds.length;
    const H = this._haul || (this._haul = [...this.rig.clouds.map(() => new Float64Array(4)), new Float64Array(4)]);
    for (const h of H) h.fill(0);
    // a toy of several clouds is hauled whole by its appendages: pulling a
    // fox's ear moves the fox, not a head that then has to be wrestled
    // back onto its body. (A head's own tether to the torso hauls the torso.)
    const whole = this.rig.haulAll, M = this.cloudMask;
    // the octopus splits a violation 35 : 65 between the arm point and the
    // body (tuned in Phase 1). The others split it by mass, which conserves
    // momentum: a light ear can't fling a heavy torso up past the hand.
    const pw = whole ? this._pointShare || (this._pointShare = 1 - 1 / (this._allCloudPoints().length + 1)) : 0.35;
    const bw = whole ? 1 - pw : 0.65;
    for (let k = 0; k < I.length; k++) {
      const i = I[k], c = from[k];
      const dx = x[i * 3] - x[c * 3], dy = x[i * 3 + 1] - x[c * 3 + 1], dz = x[i * 3 + 2] - x[c * 3 + 2];
      const d = Math.hypot(dx, dy, dz), L = lim[k];
      if (d <= L) continue;
      const e = (d - L) / d;
      // the arm point gives a little; the body as a whole is hauled the rest
      x[i * 3] -= dx * e * pw; x[i * 3 + 1] -= dy * e * pw; x[i * 3 + 2] -= dz * e * pw;
      const h = H[whole && !M[i] ? nc : cloud[k]];
      if (e * d > h[3]) { h[3] = e * d; h[0] = dx * e * bw; h[1] = dy * e * bw; h[2] = dz * e * bw; }
    }
    for (let k = 0; k < H.length; k++) {
      const [sx, sy, sz] = H[k];
      if (sx || sy || sz) {
        const ix = k === nc ? (this._all || (this._all = this._allCloudPoints())) : this.rig.clouds[k].ix;
        for (const i of ix) { x[i * 3] += sx; x[i * 3 + 1] += sy; x[i * 3 + 2] += sz; }
      }
    }
  }

  /* shape memory: a stuffed arm drifts back toward its sewn pose relative to
     the head — tips curling up again — however it was left lying           */
  _memory(alpha) {
    const { x } = this;
    // a toy in play may re-pose the sewn shape (a head turned to look): the
    // memory then pulls toward that pose instead (see toys.js)
    const rest = this.pose || this.rig.rest;
    let gk = -1, g, R, c, c0;
    for (const arm of this.rig.arms) {
      if (arm.inCloud) continue;
      if (arm.cloud !== gk) { gk = arm.cloud; g = this.clouds[gk]; R = quatToMat(g.q4, _R); c = g.c; c0 = g.c0; }
      const idx = arm.idx;
      const react = this.rig.react;
      let sx = 0, sy = 0, sz = 0;
      for (let j = 2; j < idx.length; j++) {
        const i = idx[j];
        if (this.w[i] === 0) continue;
        // where the floor holds a point, the floor has the say: a push it
        // would cancel can't be paid back to the body
        if (react && this.contact[i]) continue;
        const qx = rest[i * 3] - c0[0], qy = rest[i * 3 + 1] - c0[1], qz = rest[i * 3 + 2] - c0[2];
        const a = alpha * (0.4 + 0.6 * j / idx.length) * arm.mem;
        const dx = (c[0] + R[0] * qx + R[1] * qy + R[2] * qz - x[i * 3]) * a;
        const dy = (c[1] + R[3] * qx + R[4] * qy + R[5] * qz - x[i * 3 + 1]) * a;
        const dz = (c[2] + R[6] * qx + R[7] * qy + R[8] * qz - x[i * 3 + 2]) * a;
        x[i * 3] += dx; x[i * 3 + 1] += dy; x[i * 3 + 2] += dz;
        sx += dx; sy += dy; sz += dz;
      }
      // a lone tail pulled back to pose must push the body the other way,
      // or it walks the toy across the floor (eight symmetric arms cancel)
      if (react) this._shift(this.rig.clouds[gk].ix, -sx, -sy, -sz);
    }
    // a head remembers how it sat on its torso
    for (let k = 1; k < this.clouds.length; k++) {
      const spec = this.rig.clouds[k];
      if (spec.parent < 0) continue;
      const p = this.clouds[spec.parent];
      const Rp = quatToMat(p.q4, _R), cp = p.c, c0p = p.c0;
      const a = alpha * spec.mem;
      let sx = 0, sy = 0, sz = 0;
      const pm = 1 << spec.parent;
      for (const i of spec.ix) {
        if (this.w[i] === 0) continue;
        // points it shares with the torso are the torso's: moving them would
        // move the very frame this memory is measured in, and feed back
        if (this.cloudMask[i] & pm) continue;
        if (this.rig.react && this.contact[i]) continue;
        const qx = rest[i * 3] - c0p[0], qy = rest[i * 3 + 1] - c0p[1], qz = rest[i * 3 + 2] - c0p[2];
        const dx = (cp[0] + Rp[0] * qx + Rp[1] * qy + Rp[2] * qz - x[i * 3]) * a;
        const dy = (cp[1] + Rp[3] * qx + Rp[4] * qy + Rp[5] * qz - x[i * 3 + 1]) * a;
        const dz = (cp[2] + Rp[6] * qx + Rp[7] * qy + Rp[8] * qz - x[i * 3 + 2]) * a;
        x[i * 3] += dx; x[i * 3 + 1] += dy; x[i * 3 + 2] += dz;
        sx += dx; sy += dy; sz += dz;
      }
      if (this.rig.react) this._shift(this.rig.clouds[spec.parent].ix, -sx, -sy, -sz);
    }
  }

  _allCloudPoints() {
    const out = [];
    for (let i = 0; i < this.n; i++) if (this.cloudMask[i]) out.push(i);
    return Int32Array.from(out);
  }

  /* spread a total displacement evenly over a set of points */
  _shift(ix, sx, sy, sz) {
    const m = ix.length;
    if (!m || !(sx || sy || sz)) return;
    sx /= m; sy /= m; sz /= m;
    const x = this.x;
    for (const i of ix) { if (this.w[i] === 0) continue; x[i * 3] += sx; x[i * 3 + 1] += sy; x[i * 3 + 2] += sz; }
  }

  reset() {
    this.x.set(this.rig.rest);
    this.p.set(this.rig.rest);
    this.v.fill(0);
    this.grabs.clear();
    for (const g of this.clouds) g.q4 = [0, 0, 0, 1];
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
    for (let k = 0; k < this.clouds.length; k++) {
      quatToMat(this.clouds[k].q4, this.cloudR[k]);
      this.cloudC[k].set(this.clouds[k].c);
    }
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
    const cloudK = 0.012 + 0.16 * st * st + 0.02 * st;
    this._match(this.head, this.rig.clouds[0].k === 1 ? cloudK : Math.min(0.9, cloudK * this.rig.clouds[0].k + this.rig.clouds[0].k0));
    for (let k = 1; k < this.clouds.length; k++) this._match(this.clouds[k], Math.min(0.9, cloudK * this.rig.clouds[k].k + this.rig.clouds[k].k0));
    const bend = 0.08 + 0.26 * st;
    const W = this.windows, WK = this.rig.windowK;
    for (let k = 0; k < W.length; k++) this._match(W[k], Math.min(0.9, bend * WK[k]), true);
    this._memory(0.0015 + 0.006 * st);

    const { linkA, linkB, linkLen, linkK } = this.rig;
    for (let l = 0; l < linkA.length; l++) {
      const stretchK = linkK[l];
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
    if (this.bodyOf) this._collideBodies();

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

    // floor with Coulomb-ish friction applied to the tangential step (an
    // athlete shuffling across the court lowers it: plush feet slide)
    for (let i = 0; i < n; i++) {
      const ri = r[i];
      if (x[i * 3 + 1] < ri) {
        x[i * 3 + 1] = ri;
        const mu = P.mu;
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
    if (this.bodyOf) return this._finishBodies(h);
    const VMAX = 60;
    for (let i = 0; i < n; i++) {
      const sp = Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
      if (sp > VMAX) { const f = VMAX / sp; v[i * 3] *= f; v[i * 3 + 1] *= f; v[i * 3 + 2] *= f; }
    }
    if (this.rig.restV) {
      // static friction, at the velocity level: a point on the floor creeping
      // slower than this stops. Kinetic friction alone lets a toy whose
      // stuffing can't quite reach its pose (an ear pressed into the floor
      // when it lands on its side) walk itself along forever. (Snapping
      // positions instead rocks the four-legged llama like an uneven table.)
      const vs = this.rig.restV;
      for (let i = 0; i < n; i++) if (this.contact[i] && Math.hypot(v[i * 3], v[i * 3 + 2]) < vs) { v[i * 3] = 0; v[i * 3 + 2] = 0; }
    }
    const kd = Math.exp(-(0.4 + 14 * P.damping * P.damping) * h);
    const ka = Math.exp(-0.25 * h);
    for (let i = 0; i < n; i++) {
      v[i * 3] = (mx + (v[i * 3] - mx) * kd) * ka;
      v[i * 3 + 1] = (my + (v[i * 3 + 1] - my) * kd) * ka;
      v[i * 3 + 2] = (mz + (v[i * 3 + 2] - mz) * kd) * ka;
    }
  }

  /* several toys: velocities capped and damped about each toy's own mean
     (one plush's charge isn't the other's jiggle) */
  _finishBodies(h) {
    const { v, n } = this, P = this.params;
    const VMAX = 60;
    for (let i = 0; i < n; i++) {
      const sp = Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]);
      if (sp > VMAX) { const f = VMAX / sp; v[i * 3] *= f; v[i * 3 + 1] *= f; v[i * 3 + 2] *= f; }
    }
    if (this.rig.restV) {
      const vs = this.rig.restV;
      for (let i = 0; i < n; i++) if (this.contact[i] && Math.hypot(v[i * 3], v[i * 3 + 2]) < vs) { v[i * 3] = 0; v[i * 3 + 2] = 0; }
    }
    const kd = Math.exp(-(0.4 + 14 * P.damping * P.damping) * h);
    const ka = Math.exp(-0.25 * h);
    for (const B of this.rig.bodies) {
      let mx = 0, my = 0, mz = 0;
      const ix = B.ix;
      for (const i of ix) { mx += v[i * 3]; my += v[i * 3 + 1]; mz += v[i * 3 + 2]; }
      mx /= ix.length; my /= ix.length; mz /= ix.length;
      for (const i of ix) {
        v[i * 3] = (mx + (v[i * 3] - mx) * kd) * ka;
        v[i * 3 + 1] = (my + (v[i * 3 + 1] - my) * kd) * ka;
        v[i * 3 + 2] = (mz + (v[i * 3 + 2] - mz) * kd) * ka;
      }
    }
  }

  /* contact between toys: only where their boxes overlap, each point of
     one against the other's points inside that overlap. Equal masses: the
     push is shared, so a charge shoves and a brace holds               */
  _collideBodies() {
    const { x, r } = this, B = this.rig.bodies;
    const box = this._boxes || (this._boxes = B.map(() => new Float64Array(6)));
    const pad = 0.32;
    for (let k = 0; k < B.length; k++) {
      const b = box[k];
      b[0] = b[1] = b[2] = Infinity; b[3] = b[4] = b[5] = -Infinity;
      for (const i of B[k].ix) for (let d = 0; d < 3; d++) {
        const v = x[i * 3 + d];
        if (v < b[d]) b[d] = v;
        if (v > b[d + 3]) b[d + 3] = v;
      }
    }
    const L = this._near || (this._near = B.map((Q) => new Int32Array(Q.ix.length)));
    let touching = 0;
    for (let a = 0; a < B.length; a++)
      for (let c = a + 1; c < B.length; c++) {
        const A = box[a], C = box[c];
        // the overlap of the two boxes (padded by the largest radius)
        const lo = [Math.max(A[0], C[0]) - pad, Math.max(A[1], C[1]) - pad, Math.max(A[2], C[2]) - pad];
        const hi = [Math.min(A[3], C[3]) + pad, Math.min(A[4], C[4]) + pad, Math.min(A[5], C[5]) + pad];
        if (lo[0] > hi[0] || lo[1] > hi[1] || lo[2] > hi[2]) continue;
        let na = 0, nc = 0;
        const inside = (i) => x[i * 3] >= lo[0] && x[i * 3] <= hi[0] && x[i * 3 + 1] >= lo[1] && x[i * 3 + 1] <= hi[1] && x[i * 3 + 2] >= lo[2] && x[i * 3 + 2] <= hi[2];
        for (const i of B[a].ix) if (inside(i)) L[a][na++] = i;
        for (const i of B[c].ix) if (inside(i)) L[c][nc++] = i;
        for (let p = 0; p < na; p++) {
          const i = L[a][p];
          for (let q = 0; q < nc; q++) {
            const j = L[c][q];
            const dx = x[j * 3] - x[i * 3], m = r[i] + r[j];
            if (dx > m || dx < -m) continue;
            const dy = x[j * 3 + 1] - x[i * 3 + 1];
            if (dy > m || dy < -m) continue;
            const dz = x[j * 3 + 2] - x[i * 3 + 2];
            if (dz > m || dz < -m) continue;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 >= m * m || d2 < 1e-12) continue;
            const d = Math.sqrt(d2), f = (m - d) / d * 0.5;
            x[i * 3] -= dx * f; x[i * 3 + 1] -= dy * f; x[i * 3 + 2] -= dz * f;
            x[j * 3] += dx * f; x[j * 3 + 1] += dy * f; x[j * 3 + 2] += dz * f;
            touching++;
          }
        }
      }
    this.touching = touching;          // how many point pairs are in contact
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
