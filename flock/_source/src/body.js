/* The visible octopus: a parametric head grid plus eight capped tubes, rebuilt
   from the soft body every frame on the CPU.

   Per vertex we also hand the fur shader its own tangent frame (tu around,
   tv along the nap), a fur-lag offset (fibres trail behind the surface's
   acceleration on a damped spring), a press value (pile flattened under a
   hand or finger), an underside mask and metric pattern coordinates.        */

import * as THREE from 'three/webgpu';
import { HEAD, ARM_N, ARM_LEN, armRadius } from './rig.js';

const HU = 72, HV = 46;          // head grid
const AS = 54, AA = 22, CAP = 6; // arm rings along, verts around, cap rings

export class Body {
  constructor(rig, soft) {
    this.rig = rig;
    this.soft = soft;
    const arms = rig.arms.length;
    this.headCount = (HU + 1) * (HV + 1);
    this.armRings = AS + CAP;
    this.armCount = this.armRings * (AA + 1);
    const n = (this.count = this.headCount + arms * this.armCount);

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
    this.uv = uv;
    this.part = new Int32Array(n);      // nearest physics point, for picking

    this._buildHeadSkin(uv, fp);
    this._buildArmParams(uv, fp, under);

    const idx = [];
    const quad = (a, b, c, d) => idx.push(a, c, b, b, c, d);
    for (let j = 0; j < HV; j++)
      for (let i = 0; i < HU; i++) {
        const a = j * (HU + 1) + i;
        quad(a, a + 1, a + HU + 1, a + HU + 2);
      }
    for (let k = 0; k < arms; k++) {
      const o = this.headCount + k * this.armCount;
      for (let j = 0; j < this.armRings - 1; j++)
        for (let i = 0; i < AA; i++) {
          const a = o + j * (AA + 1) + i;
          // tube rings run the other way round from the head grid: flip winding
          quad(a, a + AA + 1, a + 1, a + AA + 2);
        }
    }

    // WebGPU caps a pipeline at 8 vertex buffers, so the per-vertex extras
    // travel packed: tu + press, tv + underside mask, uv + pattern coords.
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
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 8);

    this.pressPoints = [];   // [{x,y,z,r,amt}] set by tools each frame
    this.update(0);
    this.prev.set(this.pos); this.prev2.set(this.pos);
  }

  /* head vertices skin to their four nearest head particles */
  _buildHeadSkin(uv, fp) {
    const { rest, head } = this.rig;
    const K = 4;
    this.hRest = new Float32Array(this.headCount * 3);
    this.hIdx = new Int32Array(this.headCount * K);
    this.hW = new Float32Array(this.headCount * K);
    for (let j = 0; j <= HV; j++) {
      const v = j / HV, phi = v * Math.PI;
      for (let i = 0; i <= HU; i++) {
        const u = i / HU, th = (u - 0.5) * 2 * Math.PI;   // u = ½ faces the camera
        const vi = j * (HU + 1) + i;
        const sp = Math.sin(phi);
        // a plush head is a little pear-shaped: fuller at the cheeks than the crown
        const bulge = 1 + 0.05 * Math.sin(phi * 1.4);
        const p = [
          HEAD.cx + HEAD.rx * sp * Math.sin(th) * bulge,
          HEAD.cy + HEAD.ry * Math.cos(phi),
          HEAD.cz + HEAD.rz * sp * Math.cos(th) * bulge,
        ];
        this.hRest.set(p, vi * 3);
        uv[vi * 2] = u; uv[vi * 2 + 1] = v * 0.5;
        fp[vi * 2] = (u - 0.5) * 2 * Math.PI * HEAD.rx * sp;
        fp[vi * 2 + 1] = phi * HEAD.ry;
        const best = [];
        for (const h of head) {
          const d = Math.hypot(rest[h * 3] - p[0], rest[h * 3 + 1] - p[1], rest[h * 3 + 2] - p[2]);
          best.push([d, h]);
        }
        best.sort((a, b) => a[0] - b[0]);
        let ws = 0;
        for (let k = 0; k < K; k++) { const w = 1 / (best[k][0] * best[k][0] + 1e-3); this.hW[vi * K + k] = w; this.hIdx[vi * K + k] = best[k][1]; ws += w; }
        for (let k = 0; k < K; k++) this.hW[vi * K + k] /= ws;
        this.part[vi] = best[0][1];
      }
    }
  }

  _buildArmParams(uv, fp, under) {
    const arms = this.rig.arms.length;
    this.ringS = new Float32Array(this.armRings);
    for (let j = 0; j < this.armRings; j++) this.ringS[j] = j < AS ? j / (AS - 1) : 1;
    for (let k = 0; k < arms; k++) {
      const o = this.headCount + k * this.armCount;
      for (let j = 0; j < this.armRings; j++) {
        const s = this.ringS[j];
        const capT = j < AS ? 0 : (j - AS + 1) / CAP;
        const r = armRadius(s);
        for (let i = 0; i <= AA; i++) {
          const vi = o + j * (AA + 1) + i;
          const a = i / AA;
          uv[vi * 2] = (k + a) / 8;
          uv[vi * 2 + 1] = 0.5 + 0.5 * Math.min(1, s * 0.985 + capT * 0.015);
          fp[vi * 2] = (a - 0.5) * 2 * Math.PI * r;
          fp[vi * 2 + 1] = s * ARM_LEN + capT * r;
          // cream underside: angle 0 faces the floor
          const c = Math.cos(a * 2 * Math.PI);
          under[vi] = smooth(0.15, 0.6, c) * smooth(0.0, 0.08, s);
          const jj = Math.min(ARM_N - 1, Math.round(s * (ARM_N - 1)));
          this.part[vi] = this.rig.arms[k].idx[Math.max(1, jj)];
        }
      }
    }
  }

  update(dt) {
    this._head();
    this._arms();
    this._lagAndPress(dt);
    const { tu, tv, tuP, tvU, press } = this;
    for (let i = 0, n = this.count; i < n; i++) {
      tuP[i * 4] = tu[i * 3]; tuP[i * 4 + 1] = tu[i * 3 + 1]; tuP[i * 4 + 2] = tu[i * 3 + 2]; tuP[i * 4 + 3] = press[i];
      tvU[i * 4] = tv[i * 3]; tvU[i * 4 + 1] = tv[i * 3 + 1]; tvU[i * 4 + 2] = tv[i * 3 + 2];
    }
    this.aPos.needsUpdate = this.aNrm.needsUpdate = this.aTuP.needsUpdate = this.aTvU.needsUpdate = true;
    this.aLag.needsUpdate = true;
  }

  _head() {
    const x = this.soft.x, R = this.soft.headR, rest = this.rig.rest;
    const { pos, hRest, hIdx, hW } = this;
    for (let v = 0; v < this.headCount; v++) {
      let px = 0, py = 0, pz = 0;
      const rx = hRest[v * 3], ry = hRest[v * 3 + 1], rz = hRest[v * 3 + 2];
      for (let k = 0; k < 4; k++) {
        const i = hIdx[v * 4 + k], w = hW[v * 4 + k];
        const ox = rx - rest[i * 3], oy = ry - rest[i * 3 + 1], oz = rz - rest[i * 3 + 2];
        px += w * (x[i * 3] + R[0] * ox + R[1] * oy + R[2] * oz);
        py += w * (x[i * 3 + 1] + R[3] * ox + R[4] * oy + R[5] * oz);
        pz += w * (x[i * 3 + 2] + R[6] * ox + R[7] * oy + R[8] * oz);
      }
      pos[v * 3] = px; pos[v * 3 + 1] = py; pos[v * 3 + 2] = pz;
    }
    // frame from grid differences
    const W = HU + 1;
    const c = this.soft.headC;
    for (let j = 0; j <= HV; j++)
      for (let i = 0; i <= HU; i++) {
        const v = j * W + i;
        const il = j * W + (i === 0 ? HU - 1 : i - 1), ir = j * W + (i === HU ? 1 : i + 1);
        const jd = Math.max(0, j - 1) * W + i, ju = Math.min(HV, j + 1) * W + i;
        let ux = pos[ir * 3] - pos[il * 3], uy = pos[ir * 3 + 1] - pos[il * 3 + 1], uz = pos[ir * 3 + 2] - pos[il * 3 + 2];
        let vx = pos[ju * 3] - pos[jd * 3], vy = pos[ju * 3 + 1] - pos[jd * 3 + 1], vz = pos[ju * 3 + 2] - pos[jd * 3 + 2];
        let nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux;
        let nl = Math.hypot(nx, ny, nz);
        if (nl < 1e-6 || j === 0 || j === HV) {
          nx = pos[v * 3] - c[0]; ny = pos[v * 3 + 1] - c[1]; nz = pos[v * 3 + 2] - c[2];
          nl = Math.hypot(nx, ny, nz) || 1;
        }
        nx /= nl; ny /= nl; nz /= nl;
        // at the poles the u direction vanishes; borrow the head's own x axis
        if (Math.hypot(ux, uy, uz) < 1e-5) { const R = this.soft.headR; ux = R[0]; uy = R[3]; uz = R[6]; }
        ortho(this.nrm, this.tu, this.tv, v, nx, ny, nz, ux, uy, uz, vx, vy, vz);
      }
  }

  _arms() {
    const x = this.soft.x;
    const R = this.soft.headR;
    const N = ARM_N;
    const pts = new Float64Array(N * 3);
    const restLen = this.rig.seg;
    for (const arm of this.rig.arms) {
      const o = this.headCount + arm.k * this.armCount;
      for (let j = 0; j < N; j++) for (let d = 0; d < 3; d++) pts[j * 3 + d] = x[arm.idx[j] * 3 + d];
      // reference "down" for the underside: the head's local −y
      let dnx = -R[1], dny = -R[4], dnz = -R[7];
      let px = 0, py = 0, pz = 0, tx = 0, ty = 0, tz = 0, nx = 0, ny = 0, nz = 0;
      let tipX = 0, tipY = 0, tipZ = 0, tipR = 0;
      for (let j = 0; j < this.armRings; j++) {
        const s = this.ringS[j];
        let r = armRadius(s);
        if (j < AS) {
          const f = s * (N - 1);
          const seg = Math.min(N - 2, Math.floor(f));
          const t = f - seg;
          catmull(pts, seg, t, N, _p, _t);
          px = _p[0]; py = _p[1]; pz = _p[2];
          let tl = Math.hypot(_t[0], _t[1], _t[2]) || 1;
          // a stretched arm thins, like a pulled plush limb
          const stretch = tl / restLen;
          r *= 1 / Math.sqrt(Math.max(0.7, Math.min(1.8, stretch)));
          tx = _t[0] / tl; ty = _t[1] / tl; tz = _t[2] / tl;
          if (j === 0) {
            // initial normal: head-down, made perpendicular to the tangent
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
          let ox = nx * ca + bx * sa, oy = ny * ca + by * sa, oz = nz * ca + bz * sa;
          const v = o + j * (AA + 1) + i;
          this.pos[v * 3] = px + ox * r; this.pos[v * 3 + 1] = py + oy * r; this.pos[v * 3 + 2] = pz + oz * r;
          let mx = ox, my = oy, mz = oz;
          if (j >= AS) {
            const c = (j - AS + 1) / CAP;
            mx = ox * (1 - c) + tx * c; my = oy * (1 - c) + ty * c; mz = oz * (1 - c) + tz * c;
          }
          const ml = Math.hypot(mx, my, mz) || 1;
          // around direction: tangent of the ring
          const ux = -nx * sa + bx * ca, uy = -ny * sa + by * ca, uz = -nz * sa + bz * ca;
          ortho(this.nrm, this.tu, this.tv, v, mx / ml, my / ml, mz / ml, ux, uy, uz, tx, ty, tz);
        }
      }
    }
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

  /* world position + normal of a head surface point by uv (for eyes) */
  headPoint(u, v, outP, outN) {
    const i = Math.round(u * HU), j = Math.round(v * HV);
    const vi = j * (HU + 1) + i;
    outP.set(this.pos[vi * 3], this.pos[vi * 3 + 1], this.pos[vi * 3 + 2]);
    outN.set(this.nrm[vi * 3], this.nrm[vi * 3 + 1], this.nrm[vi * 3 + 2]);
    return vi;
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

function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
