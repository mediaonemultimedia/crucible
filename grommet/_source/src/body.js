/* The visible plush: ellipsoid (or torus) grids skinned to the soft body's
   clouds, plus capped tubes swept along its chains, rebuilt from the soft body
   every frame on the CPU. The octopus is one head grid and eight tubes; the
   others are a torso, a head, a muzzle, haunches, a mane… and their ears,
   legs, tails and necks.

   Per vertex we also hand the fur shader its own tangent frame (tu around,
   tv along the nap), a fur-lag offset (fibres trail behind the surface's
   acceleration on a damped spring), a press value (pile flattened under a
   hand or finger), an underside mask, metric pattern coordinates, and the
   part's look: accent colour weight and pile multiplier (the lion's mane is
   2.2× the body's pile).

   Grommet: the same class draws the clothes. A cloth Body (`cloth: true`)
   is built from rig.cloth's parts — partial ellipsoid bands (vr) and
   partial tubes (s0…s1, radius × rs) — and instead of a press value it
   hands the cotton shader each vertex's compression, which it turns into
   creases. look.z carries how freely the cloth sways, look.w its style.     */

import * as THREE from 'three/webgpu';

export class Body {
  constructor(rig, soft, { cloth = false } = {}) {
    this.rig = cloth ? { ...rig, parts: rig.cloth.parts, regions: rig.cloth.regions } : rig;
    rig = this.rig;
    this.soft = soft;
    this.cloth = cloth;
    this.parts = rig.parts.map((p) => ({ ...p }));

    // vertex ranges, in rig order: grids first, then tubes
    let n = 0;
    for (const P of this.parts) {
      P.o = n;
      if (P.kind === 'grid') { P.count = (P.U + 1) * (P.V + 1); }
      else { P.ch = rig.arms[P.chain]; P.rings = P.AS + P.CAP; P.count = P.rings * (P.AA + 1); }
      n += P.count;
    }
    this.count = n;
    // Phase 1 names: the octopus's head grid and its arm tubes
    this.headCount = this.parts[0].count;

    this.pos = new Float32Array(n * 3);
    this.nrm = new Float32Array(n * 3);
    this.tu = new Float32Array(n * 3);
    this.tv = new Float32Array(n * 3);
    this.lag = new Float32Array(n * 3);
    this.lagV = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.prev2 = new Float32Array(n * 3);
    this.press = new Float32Array(n);
    const uv = new Float32Array(n * 2);
    const fp = new Float32Array(n * 2);
    const under = new Float32Array(n);
    const look = new Float32Array(n * 4);
    this.uv = uv;
    this.part = new Int32Array(n);      // nearest physics point, for picking

    const regions = rig.regions;
    for (const P of this.parts) {
      P.reg = regions[P.region];
      if (P.kind === 'grid') this._buildGrid(P, uv, fp, under, look);
      else this._buildTube(P, uv, fp, under, look);
    }

    const idx = [];
    const quad = (a, b, c, d) => idx.push(a, c, b, b, c, d);
    for (const P of this.parts) {
      if (P.kind === 'grid') {
        const W = P.U + 1;
        for (let j = 0; j < P.V; j++)
          for (let i = 0; i < P.U; i++) {
            const a = P.o + j * W + i;
            quad(a, a + 1, a + W, a + W + 1);
          }
      } else {
        const W = P.AA + 1;
        for (let j = 0; j < P.rings - 1; j++)
          for (let i = 0; i < P.AA; i++) {
            const a = P.o + j * W + i;
            // tube rings run the other way round from the head grid: flip winding
            quad(a, a + W, a + 1, a + W + 1);
          }
      }
    }

    // WebGPU caps a pipeline at 8 vertex buffers, so the per-vertex extras
    // travel packed: tu + press, tv + underside mask, uv + pattern coords,
    // and the static look (accent, pile multiplier). Seven buffers in all.
    // InstancedBufferGeometry (not InstancedMesh) so shells cost no matrix buffer.
    const g = (this.geometry = new THREE.InstancedBufferGeometry());
    g.instanceCount = 1;
    const attr = (name, arr, size, dynamic) => {
      const a = new THREE.BufferAttribute(arr, size);
      if (dynamic) a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      return a;
    };
    this.tuP = new Float32Array(n * 4);
    this.tvU = new Float32Array(n * 4);
    const uvfp = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      this.tvU[i * 4 + 3] = under[i];
      uvfp[i * 4] = uv[i * 2]; uvfp[i * 4 + 1] = uv[i * 2 + 1];
      uvfp[i * 4 + 2] = fp[i * 2]; uvfp[i * 4 + 3] = fp[i * 2 + 1];
    }
    this.aPos = attr('position', this.pos, 3, true);
    this.aNrm = attr('normal', this.nrm, 3, true);
    this.aTuP = attr('tuP', this.tuP, 4, true);
    this.aTvU = attr('tvU', this.tvU, 4, true);
    this.aLag = attr('lag', this.lag, 3, true);
    attr('uvfp', uvfp, 4);
    attr('look', look, 4);
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 8);

    this.pressPoints = [];   // [{x,y,z,r,amt}] set by tools each frame
    this.update(0);
    this.prev.set(this.pos); this.prev2.set(this.pos);
    if (cloth) this._restEdges();
  }

  dispose() { this.geometry.dispose(); }

  /* rest position of grid vertex (u, v), and its local unit direction */
  _gridRest(P, u, v) {
    if (P.torus) {
      const al = (u - 0.5) * 2 * Math.PI;              // around the face, u = ½ at the bottom
      const be = Math.PI - v * 2 * Math.PI;            // v = 0 inner edge, ¼ front, ½ outer, ¾ back
      const { R, r } = P.torus;
      const rr = R + r * Math.cos(be);
      const l = [rr * Math.sin(al), -rr * Math.cos(al), r * Math.sin(be)];
      // a torus may be turned (a collar lies round the neck, not facing us)
      const B = P.B, w = B ? [B[0][0] * l[0] + B[1][0] * l[1] + B[2][0] * l[2], B[0][1] * l[0] + B[1][1] * l[1] + B[2][1] * l[2], B[0][2] * l[0] + B[1][2] * l[1] + B[2][2] * l[2]] : l;
      return { p: [P.c[0] + w[0], P.c[1] + w[1], P.c[2] + w[2]], l: [l[0] / (R + r), l[1] / (R + r), l[2] / (R + r)], phi: be, sp: rr / (R + r) };
    }
    const phi = v * Math.PI, th = (u - 0.5) * 2 * Math.PI;   // u = ½ faces the camera
    const sp = Math.sin(phi);
    const bulge = P.bulge ? P.bulge(phi) : 1;
    if (!P.B) {
      const p = [
        P.c[0] + P.r[0] * sp * Math.sin(th) * bulge,
        P.c[1] + P.r[1] * Math.cos(phi),
        P.c[2] + P.r[2] * sp * Math.cos(th) * bulge,
      ];
      return { p, l: [sp * Math.sin(th), Math.cos(phi), sp * Math.cos(th)], phi, sp };
    }
    const lx = P.r[0] * sp * Math.sin(th) * bulge, ly = P.r[1] * Math.cos(phi), lz = P.r[2] * sp * Math.cos(th) * bulge;
    const B = P.B;
    const p = [
      P.c[0] + B[0][0] * lx + B[1][0] * ly + B[2][0] * lz,
      P.c[1] + B[0][1] * lx + B[1][1] * ly + B[2][1] * lz,
      P.c[2] + B[0][2] * lx + B[1][2] * ly + B[2][2] * lz,
    ];
    return { p, l: [sp * Math.sin(th), Math.cos(phi), sp * Math.cos(th)], phi, sp };
  }

  /* grid vertices skin to their four nearest particles of their cloud */
  _buildGrid(P, uv, fp, under, look) {
    const { rest } = this.rig;
    const cloud = this.rig.clouds[P.cloud].ix;
    const K = 4;
    const nv = P.count;
    P.hRest = new Float32Array(nv * 3);
    P.hIdx = new Int32Array(nv * K);
    P.hW = new Float32Array(nv * K);
    const R = P.reg;
    const rx = P.torus ? P.torus.R + P.torus.r : P.r[0];
    const ry = P.torus ? P.torus.r : P.r[1];
    for (let j = 0; j <= P.V; j++) {
      const v = P.vr ? P.vr[0] + (P.vr[1] - P.vr[0]) * j / P.V : j / P.V;
      for (let i = 0; i <= P.U; i++) {
        const u = i / P.U;
        const k = j * (P.U + 1) + i;
        const vi = P.o + k;
        const { p, l, phi, sp } = this._gridRest(P, u, v);
        P.hRest.set(p, k * 3);
        uv[vi * 2] = R.x0 + u * (R.x1 - R.x0); uv[vi * 2 + 1] = R.y0 + (j / P.V) * (R.y1 - R.y0);
        fp[vi * 2] = (u - 0.5) * 2 * Math.PI * rx * sp;
        fp[vi * 2 + 1] = phi * ry;
        under[vi] = P.under(u, v, l);
        look[vi * 4] = P.accent(u, v, l);
        look[vi * 4 + 1] = P.pile(u, v, l);
        if (P.sway) { look[vi * 4 + 2] = P.sway(u, v, l); look[vi * 4 + 3] = P.style; }
        const best = [];
        for (const h of cloud) {
          const d = Math.hypot(rest[h * 3] - p[0], rest[h * 3 + 1] - p[1], rest[h * 3 + 2] - p[2]);
          best.push([d, h]);
        }
        best.sort((a, b) => a[0] - b[0]);
        let ws = 0;
        for (let q = 0; q < K; q++) { const w = 1 / (best[q][0] * best[q][0] + 1e-3); P.hW[k * K + q] = w; P.hIdx[k * K + q] = best[q][1]; ws += w; }
        for (let q = 0; q < K; q++) P.hW[k * K + q] /= ws;
        this.part[vi] = best[0][1];
      }
    }
  }

  _buildTube(P, uv, fp, under, look) {
    const ch = P.ch, AS = P.AS, CAP = P.CAP, AA = P.AA;
    const N = ch.idx.length;
    P.ringS = new Float32Array(P.rings);
    const s0 = P.s0 ?? 0, s1 = P.s1 ?? 1;
    for (let j = 0; j < P.rings; j++) P.ringS[j] = j < AS ? s0 + (s1 - s0) * j / (AS - 1) : s1;
    P.rad = (s) => ch.radius(s) * (P.rs ?? 1) + (P.rAdd ?? 0);
    const R = P.reg;
    for (let j = 0; j < P.rings; j++) {
      const s = P.ringS[j];
      const capT = j < AS ? 0 : (j - AS + 1) / CAP;
      const r = P.rad(s);
      const sv = (s - s0) / ((s1 - s0) || 1);
      for (let i = 0; i <= AA; i++) {
        const vi = P.o + j * (AA + 1) + i;
        const a = i / AA;
        uv[vi * 2] = R.x0 + a * (R.x1 - R.x0);
        uv[vi * 2 + 1] = R.y0 + (R.y1 - R.y0) * Math.min(1, sv * 0.985 + capT * 0.015);
        fp[vi * 2] = (a - 0.5) * 2 * Math.PI * r;
        fp[vi * 2 + 1] = s * ch.len + capT * r;
        // angle 0 faces the chain's reference direction (the floor, for an arm)
        const c = Math.cos(a * 2 * Math.PI);
        under[vi] = ch.under(s, c);
        look[vi * 4] = ch.accent(s, c);
        look[vi * 4 + 1] = ch.pile(s, c);
        if (P.sway) { look[vi * 4] = P.accent(s, c); look[vi * 4 + 2] = P.sway(s, c); look[vi * 4 + 3] = P.style; }
        const jj = Math.min(N - 1, Math.round(s * (N - 1)));
        this.part[vi] = ch.idx[Math.max(1, jj)];
      }
    }
  }

  update(dt) {
    for (const P of this.parts) {
      if (P.kind === 'grid') this._grid(P);
      else this._tube(P);
    }
    this._lagAndPress(dt);
    if (this.cloth) this._strain();
    const { tu, tv, tuP, tvU, press } = this;
    for (let i = 0, n = this.count; i < n; i++) {
      tuP[i * 4] = tu[i * 3]; tuP[i * 4 + 1] = tu[i * 3 + 1]; tuP[i * 4 + 2] = tu[i * 3 + 2]; tuP[i * 4 + 3] = press[i];
      tvU[i * 4] = tv[i * 3]; tvU[i * 4 + 1] = tv[i * 3 + 1]; tvU[i * 4 + 2] = tv[i * 3 + 2];
    }
    this.aPos.needsUpdate = this.aNrm.needsUpdate = this.aTuP.needsUpdate = this.aTvU.needsUpdate = true;
    this.aLag.needsUpdate = true;
  }

  _grid(P) {
    const x = this.soft.x, R = this.soft.cloudR[P.cloud], rest = this.rig.rest;
    const { pos } = this;
    const { hRest, hIdx, hW, o } = P;
    // a cloud re-posed by a toy (a head turned to look) carries each point's
    // own turn: the skin offsets turn with the points they hang from
    const M = this.soft.poseRot;
    if (M && this.soft.posedCloud === P.cloud) return this._gridPosed(P, M);
    for (let k = 0; k < P.count; k++) {
      let px = 0, py = 0, pz = 0;
      const rx = hRest[k * 3], ry = hRest[k * 3 + 1], rz = hRest[k * 3 + 2];
      for (let q = 0; q < 4; q++) {
        const i = hIdx[k * 4 + q], w = hW[k * 4 + q];
        const ox = rx - rest[i * 3], oy = ry - rest[i * 3 + 1], oz = rz - rest[i * 3 + 2];
        px += w * (x[i * 3] + R[0] * ox + R[1] * oy + R[2] * oz);
        py += w * (x[i * 3 + 1] + R[3] * ox + R[4] * oy + R[5] * oz);
        pz += w * (x[i * 3 + 2] + R[6] * ox + R[7] * oy + R[8] * oz);
      }
      const v = o + k;
      pos[v * 3] = px; pos[v * 3 + 1] = py; pos[v * 3 + 2] = pz;
    }
    this._gridFrame(P);
  }

  _gridPosed(P, M) {
    const x = this.soft.x, R = this.soft.cloudR[P.cloud], rest = this.rig.rest;
    const { pos } = this;
    const { hRest, hIdx, hW, o } = P;
    for (let k = 0; k < P.count; k++) {
      let px = 0, py = 0, pz = 0;
      const rx = hRest[k * 3], ry = hRest[k * 3 + 1], rz = hRest[k * 3 + 2];
      for (let q = 0; q < 4; q++) {
        const i = hIdx[k * 4 + q], w = hW[k * 4 + q], m = i * 9;
        const ax = rx - rest[i * 3], ay = ry - rest[i * 3 + 1], az = rz - rest[i * 3 + 2];
        const ox = M[m] * ax + M[m + 1] * ay + M[m + 2] * az;
        const oy = M[m + 3] * ax + M[m + 4] * ay + M[m + 5] * az;
        const oz = M[m + 6] * ax + M[m + 7] * ay + M[m + 8] * az;
        px += w * (x[i * 3] + R[0] * ox + R[1] * oy + R[2] * oz);
        py += w * (x[i * 3 + 1] + R[3] * ox + R[4] * oy + R[5] * oz);
        pz += w * (x[i * 3 + 2] + R[6] * ox + R[7] * oy + R[8] * oz);
      }
      const v = o + k;
      pos[v * 3] = px; pos[v * 3 + 1] = py; pos[v * 3 + 2] = pz;
    }
    this._gridFrame(P);
  }

  _gridFrame(P) {
    const R = this.soft.cloudR[P.cloud];
    const { pos } = this;
    const o = P.o;
    // frame from grid differences
    const HU = P.U, HV = P.V, W = HU + 1;
    const c = this._partCenter(P);
    const wrapV = !!P.torus;
    for (let j = 0; j <= HV; j++)
      for (let i = 0; i <= HU; i++) {
        const v = o + j * W + i;
        const il = o + j * W + (i === 0 ? HU - 1 : i - 1), ir = o + j * W + (i === HU ? 1 : i + 1);
        const jd = o + (wrapV ? (j === 0 ? HV - 1 : j - 1) : Math.max(0, j - 1)) * W + i;
        const ju = o + (wrapV ? (j === HV ? 1 : j + 1) : Math.min(HV, j + 1)) * W + i;
        let ux = pos[ir * 3] - pos[il * 3], uy = pos[ir * 3 + 1] - pos[il * 3 + 1], uz = pos[ir * 3 + 2] - pos[il * 3 + 2];
        let vx = pos[ju * 3] - pos[jd * 3], vy = pos[ju * 3 + 1] - pos[jd * 3 + 1], vz = pos[ju * 3 + 2] - pos[jd * 3 + 2];
        let nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux;
        let nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-6 || (!wrapV && !P.vr && (j === 0 || j === HV))) {
          nx = pos[v * 3] - c[0]; ny = pos[v * 3 + 1] - c[1]; nz = pos[v * 3 + 2] - c[2];
          nl = Math.hypot(nx, ny, nz) || 1;
        }
        nx /= nl; ny /= nl; nz /= nl;
        // at the poles the u direction vanishes; borrow the cloud's own x axis
        if (Math.hypot(ux, uy, uz) < 1e-5) { ux = R[0]; uy = R[3]; uz = R[6]; }
        ortho(this.nrm, this.tu, this.tv, v, nx, ny, nz, ux, uy, uz, vx, vy, vz);
      }
  }

  /* where a grid's centre is now: the octopus head uses its cloud's centre
     (as in Phase 1); other parts carry their rest centre along             */
  _partCenter(P) {
    const k = P.cloud;
    if (P.o === 0 && this.rig.name === 'octopus') return this.soft.cloudC[k];
    const g = this.soft.clouds[k], R = this.soft.cloudR[k];
    const qx = P.c[0] - g.c0[0], qy = P.c[1] - g.c0[1], qz = P.c[2] - g.c0[2];
    const out = this._pc || (this._pc = new Float64Array(3));
    out[0] = g.c[0] + R[0] * qx + R[1] * qy + R[2] * qz;
    out[1] = g.c[1] + R[3] * qx + R[4] * qy + R[5] * qz;
    out[2] = g.c[2] + R[6] * qx + R[7] * qy + R[8] * qz;
    return out;
  }

  _tube(P) {
    const x = this.soft.x;
    const ch = P.ch;
    const R = this.soft.cloudR[ch.cloud];
    const N = ch.idx.length;
    const pts = P.pts || (P.pts = new Float64Array(N * 3));
    const restLen = ch.seg;
    const AS = P.AS, CAP = P.CAP, AA = P.AA, o = P.o;
    const flat = ch.flat;
    for (let j = 0; j < N; j++) for (let d = 0; d < 3; d++) pts[j * 3 + d] = x[ch.idx[j] * 3 + d];
    // reference direction for the tube's frame (and its underside): the
    // chain's `ref` in its cloud's frame — the head's local −y for an arm
    const f = ch.ref;
    let dnx = R[0] * f[0] + R[1] * f[1] + R[2] * f[2], dny = R[3] * f[0] + R[4] * f[1] + R[5] * f[2], dnz = R[6] * f[0] + R[7] * f[1] + R[8] * f[2];
    let px = 0, py = 0, pz = 0, tx = 0, ty = 0, tz = 0, nx = 0, ny = 0, nz = 0;
    let tipX = 0, tipY = 0, tipZ = 0, tipR = 0;
    for (let j = 0; j < P.rings; j++) {
      const s = P.ringS[j];
      let r = P.rad(s);
      if (j < AS) {
        const fr = s * (N - 1);
        const seg = Math.min(N - 2, Math.floor(fr));
        const t = fr - seg;
        catmull(pts, seg, t, N, _p, _t);
        px = _p[0]; py = _p[1]; pz = _p[2];
        let tl = Math.hypot(_t[0], _t[1], _t[2]) || 1;
        // a stretched arm thins, like a pulled plush limb
        const stretch = tl / restLen;
        r *= 1 / Math.sqrt(Math.max(0.7, Math.min(1.8, stretch)));
        tx = _t[0] / tl; ty = _t[1] / tl; tz = _t[2] / tl;
        if (j === 0) {
          // initial normal: the reference direction, made perpendicular to the tangent
          const d = dnx * tx + dny * ty + dnz * tz;
          nx = dnx - tx * d; ny = dny - ty * d; nz = dnz - tz * d;
        } else {
          // parallel transport: remove the tangent component, renormalise
          const d = nx * tx + ny * ty + nz * tz;
          nx -= tx * d; ny -= ty * d; nz -= tz * d;
        }
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        tipX = px; tipY = py; tipZ = pz; tipR = r;
      } else {
        const c = (j - AS + 1) / CAP;
        px = tipX + tx * tipR * c; py = tipY + ty * tipR * c; pz = tipZ + tz * tipR * c;
        r = tipR * Math.sqrt(Math.max(0, 1 - c * c));
      }
      const bx = ty * nz - tz * ny, by = tz * nx - tx * nz, bz = tx * ny - ty * nx;
      for (let i = 0; i <= AA; i++) {
        const a = (i / AA) * 2 * Math.PI;
        const ca = Math.cos(a), sa = Math.sin(a);
        // a flattened tube (an ear) is squashed along its reference axis
        let ox = nx * ca * flat + bx * sa, oy = ny * ca * flat + by * sa, oz = nz * ca * flat + bz * sa;
        const v = o + j * (AA + 1) + i;
        this.pos[v * 3] = px + ox * r; this.pos[v * 3 + 1] = py + oy * r; this.pos[v * 3 + 2] = pz + oz * r;
        let mx = flat === 1 ? ox : nx * ca / flat + bx * sa, my = flat === 1 ? oy : ny * ca / flat + by * sa, mz = flat === 1 ? oz : nz * ca / flat + bz * sa;
        if (j >= AS) {
          const c = (j - AS + 1) / CAP;
          mx = mx * (1 - c) + tx * c; my = my * (1 - c) + ty * c; mz = mz * (1 - c) + tz * c;
        }
        const ml = Math.hypot(mx, my, mz) || 1;
        // around direction: tangent of the ring
        const ux = -nx * sa * flat + bx * ca, uy = -ny * sa * flat + by * ca, uz = -nz * sa * flat + bz * ca;
        ortho(this.nrm, this.tu, this.tv, v, mx / ml, my / ml, mz / ml, ux, uy, uz, tx, ty, tz);
      }
    }
  }

  /* cloth: each vertex's rest distance to its neighbours around and along */
  _restEdges() {
    const n = this.count, pos = this.pos;
    this.e0 = new Float32Array(n * 2);
    this._edges((v, a, b, k) => {
      this.e0[v * 2 + k] = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]) || 1e-6;
    });
  }

  /* visit each vertex's two neighbour pairs: k = 0 around, k = 1 along */
  _edges(fn) {
    for (const P of this.parts) {
      const W = (P.kind === 'grid' ? P.U : P.AA) + 1, H = P.kind === 'grid' ? P.V + 1 : P.rings;
      for (let j = 0; j < H; j++)
        for (let i = 0; i < W; i++) {
          const v = P.o + j * W + i;
          fn(v, P.o + j * W + Math.max(0, i - 1), P.o + j * W + Math.min(W - 1, i + 1), 0);
          fn(v, P.o + Math.max(0, j - 1) * W + i, P.o + Math.min(H - 1, j + 1) * W + i, 1);
        }
    }
  }

  /* cloth compression (0 at rest, up to 1 bunched): the shader's creases */
  _strain() {
    const pos = this.pos, e0 = this.e0, press = this.press;
    if (!e0) return;
    press.fill(0);
    this._edges((v, a, b, k) => {
      const d = Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);
      const c = Math.min(1, Math.max(0, (1 - d / e0[v * 2 + k]) * 3));
      if (c > press[v]) press[v] = c;
    });
  }

  _lagAndPress(dt) {
    const n = this.count;
    const { pos, prev, prev2, lag, lagV, press } = this;
    if (dt > 0) {
      const id2 = 1 / (dt * dt);
      const k = 110, c = 9;
      const m = 0.0042;
      for (let i = 0; i < n * 3; i++) {
        const acc = (pos[i] - 2 * prev[i] + prev2[i]) * id2;
        // gravity is part of what fibres feel, but it's handled in the shader
        lagV[i] += (-k * lag[i] - c * lagV[i] - acc * m * k) * dt;
        lag[i] += lagV[i] * dt;
        if (lag[i] > 0.9) { lag[i] = 0.9; lagV[i] = 0; } else if (lag[i] < -0.9) { lag[i] = -0.9; lagV[i] = 0; }
      }
      prev2.set(prev); prev.set(pos);
    }
    const pp = this.pressPoints;
    const fall = Math.min(1, dt * 2.2);
    for (let v = 0; v < n; v++) {
      let target = 0;
      for (const q of pp) {
        const dx = pos[v * 3] - q.x, dy = pos[v * 3 + 1] - q.y, dz = pos[v * 3 + 2] - q.z;
        const d2 = (dx * dx + dy * dy + dz * dz) / (q.r * q.r);
        if (d2 < 1) target = Math.max(target, q.amt * (1 - d2) * (1 - d2));
      }
      press[v] = target > press[v] ? press[v] + (target - press[v]) * Math.min(1, dt * 14) : press[v] - (press[v] - target) * fall;
    }
  }

  /* world position + normal of a grid surface point by uv (for eyes) */
  surfacePoint(part, u, v, outP, outN) {
    const P = typeof part === 'number' ? this.parts[part] : this.parts.find((q) => q.name === part);
    const i = Math.round(u * P.U), j = Math.round(v * P.V);
    const vi = P.o + j * (P.U + 1) + i;
    outP.set(this.pos[vi * 3], this.pos[vi * 3 + 1], this.pos[vi * 3 + 2]);
    outN.set(this.nrm[vi * 3], this.nrm[vi * 3 + 1], this.nrm[vi * 3 + 2]);
    return vi;
  }

  headPoint(u, v, outP, outN) { return this.surfacePoint(0, u, v, outP, outN); }

  /* which part a groom-atlas uv lies in */
  partAt(u, v) {
    for (const P of this.parts) {
      const R = P.reg;
      if (u >= R.x0 && u < R.x1 && v >= R.y0 && v < R.y1) return P;
    }
    return this.parts[0];
  }

  /* comb brush radii in texels at an atlas uv, so a stroke is the same size
     in the world whichever part (and wherever on it) it lands             */
  brushTexels(u, v, brush, S) {
    const P = this.partAt(u, v);
    const R = P.reg;
    const W = (R.x1 - R.x0) * S, H = (R.y1 - R.y0) * S;
    const lv = (v - R.y0) / (R.y1 - R.y0);
    if (P.kind === 'grid') {
      if (P.torus) {
        const { R: Rm, r } = P.torus;
        const be = Math.PI - lv * 2 * Math.PI;
        return [brush / (2 * Math.PI * Math.max(0.3, Rm + r * Math.cos(be))) * W, brush / (2 * Math.PI * r) * H];
      }
      const phi = lv * Math.PI;
      return [(brush / (2 * Math.PI * Math.max(P.r[0], P.r[2]) * Math.max(0.25, Math.sin(phi)))) * W, (brush / (Math.PI * P.r[1])) * H];
    }
    const r = P.ch.radius(Math.min(1, lv));
    return [Math.min(W / 2, (brush / (2 * Math.PI * r)) * W), (brush / P.ch.len) * H];
  }
}

const _p = new Float64Array(3), _t = new Float64Array(3);

function catmull(P, seg, t, N, out, tan) {
  const i0 = Math.max(0, seg - 1), i1 = seg, i2 = seg + 1, i3 = Math.min(N - 1, seg + 2);
  const t2 = t * t, t3 = t2 * t;
  for (let d = 0; d < 3; d++) {
    const p0 = P[i0 * 3 + d], p1 = P[i1 * 3 + d], p2 = P[i2 * 3 + d], p3 = P[i3 * 3 + d];
    out[d] = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    tan[d] = 0.5 * ((-p0 + p2) + 2 * (2 * p0 - 5 * p1 + 4 * p2 - p3) * t + 3 * (-p0 + 3 * p1 - 3 * p2 + p3) * t2);
  }
}

/* write n, and tu/tv made orthonormal against n */
function ortho(N, TU, TV, v, nx, ny, nz, ux, uy, uz, vx, vy, vz) {
  N[v * 3] = nx; N[v * 3 + 1] = ny; N[v * 3 + 2] = nz;
  let d = ux * nx + uy * ny + uz * nz;
  ux -= nx * d; uy -= ny * d; uz -= nz * d;
  let l = Math.hypot(ux, uy, uz) || 1;
  ux /= l; uy /= l; uz /= l;
  TU[v * 3] = ux; TU[v * 3 + 1] = uy; TU[v * 3 + 2] = uz;
  d = vx * nx + vy * ny + vz * nz;
  vx -= nx * d; vy -= ny * d; vz -= nz * d;
  d = vx * ux + vy * uy + vz * uz;
  vx -= ux * d; vy -= uy * d; vz -= uz * d;
  l = Math.hypot(vx, vy, vz) || 1;
  TV[v * 3] = vx / l; TV[v * 3 + 1] = vy / l; TV[v * 3 + 2] = vz / l;
}
