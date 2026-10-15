/* The stage: renderer (WebGPU, WebGL 2 fallback — exactly Grommet's
   makeRenderer), camera, the felt mat and studio paper, contact shadows,
   and the cosmetic effects — hit sparks, tufts of stuffing, screen shake,
   the projectiles (tennis balls, felt rings), and a Fluffatality's burst.
   All of it reads the sim and the plush; none of it feeds back.          */

import * as THREE from 'three/webgpu';
import { Fn, uniform, texture, vec2, vec3, vec4, float, positionWorld, normalWorld, normalize, mix, smoothstep, length, mx_noise_float, abs, fract, step } from 'three/tsl';
import { makeTennisBall } from '../../shared/grommet/props.js';
import { TENNIS_R } from '../../shared/grommet/athletes/leopard.game.js';
import { shade } from '../../shared/grommet/props.js';
import { RING_COLORS } from '../../shared/grommet/giraffeprops.js';
import { KEY } from '../../shared/grommet/fur.js';

export const U = 1000;   // sim units per world unit

/* WebGPU when the adapter answers; WebGL 2 when it doesn't (Grommet's) */
export async function makeRenderer(canvas) {
  if (navigator.gpu && !/[?&]webgl\b/.test(location.search)) {
    const r = new THREE.WebGPURenderer({ canvas, antialias: true });
    const ok = await Promise.race([
      r.init().then(() => true, () => false),
      new Promise((res) => setTimeout(() => res(false), 2500)),
    ]);
    if (ok && r.backend.isWebGPUBackend) return { renderer: r, canvas };
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh);
    canvas = fresh;
  }
  const r = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
  await r.init();
  return { renderer: r, canvas };
}

const SX = 18, SZ = 9;   // the shadow canvas covers x ∈ [−SX, SX], z ∈ [−SZ, SZ]

export class Stage {
  constructor() {
    const scene = (this.scene = new THREE.Scene());
    this.bg = new THREE.Color().setRGB(0.83, 0.8, 0.765, THREE.LinearSRGBColorSpace);
    scene.background = this.bg;
    this.camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.1, 200);
    this.cam = { x: 0, y: 2.4, d: 17, shake: 0, t: 0 };

    // contact shadows, painted per frame
    const c = (this.shadowCanvas = document.createElement('canvas'));
    c.width = 1024; c.height = 512;
    this.sctx = c.getContext('2d');
    this.shadowTex = new THREE.CanvasTexture(c);
    this.shadowTex.colorSpace = THREE.NoColorSpace;

    // the mat: a felt rectangle with a stitched border on studio paper
    const m = (this.matCanvas = document.createElement('canvas'));
    m.width = 2048; m.height = 512;
    this._paintMat();
    this.matTex = new THREE.CanvasTexture(m);
    this.matTex.colorSpace = THREE.SRGBColorSpace;
    this.matTex.anisotropy = 8;

    const mat = new THREE.MeshBasicNodeMaterial();
    const stex = this.shadowTex, mtex = this.matTex;
    mat.colorNode = Fn(() => {
      const xz = vec2(positionWorld.x, positionWorld.z);
      const suv = vec2(xz.x.div(SX * 2).add(0.5), xz.y.div(SZ * 2).add(0.5));
      const sh = texture(stex, vec2(suv.x, float(1).sub(suv.y))).a;
      const r = length(xz.mul(vec2(0.55, 1)).sub(vec2(0, 0.5)));
      const paper = mix(vec3(0.925, 0.9, 0.865), vec3(0.83, 0.8, 0.765), smoothstep(3, 13, r)).toVar();
      const muv = vec2(xz.x.div(32).add(0.5), xz.y.div(8).add(0.5));
      const inMat = step(0, muv.x).mul(step(muv.x, 1)).mul(step(0, muv.y)).mul(step(muv.y, 1));
      const felt = texture(mtex, vec2(muv.x, float(1).sub(muv.y)));
      paper.assign(mix(paper, felt.rgb, felt.a.mul(inMat).mul(smoothstep(15, 8, r))));
      const grain = mx_noise_float(vec3(xz.mul(9), 0)).mul(0.012);
      return vec4(paper.add(grain).mul(float(1).sub(sh.mul(0.6))), 1);
    })();
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 60).rotateX(-Math.PI / 2), mat);
    scene.add(this.floor);

    // the cyclorama: the paper curves up behind them, so there's no horizon
    const wall = new THREE.MeshBasicNodeMaterial();
    const bgc = this.bg;
    wall.colorNode = Fn(() => {
      const y = positionWorld.y;
      const base = mix(vec3(0.83, 0.8, 0.765), vec3(0.88, 0.85, 0.81), smoothstep(0, 9, y));
      return vec4(base.add(mx_noise_float(vec3(positionWorld.x.mul(3), y.mul(3), 0)).mul(0.008)), 1);
    })();
    this.wall = new THREE.Mesh(new THREE.PlaneGeometry(140, 40), wall);
    this.wall.position.set(0, 20, -14);
    scene.add(this.wall);

    this._initSparks();
    this._initFluff();
    this.balls = new Map();
    this.rings = new Map();
    this.ballPool = [];
    this.ringPool = [];
    this.ringGeo = new THREE.TorusGeometry(0.42, 0.12, 14, 32);
  }

  _paintMat() {
    const g = this.matCanvas.getContext('2d'), W = 2048, H = 512;
    g.clearRect(0, 0, W, H);
    // felt: a warm blue-grey, the fibres a faint noise of strokes
    const x0 = W * (0.5 - 10.4 / 32), x1 = W * (0.5 + 10.4 / 32), y0 = H * (0.5 - 3.2 / 8), y1 = H * (0.5 + 3.2 / 8);
    g.fillStyle = '#5f7f95';
    roundRect(g, x0, y0, x1 - x0, y1 - y0, 40); g.fill();
    let s = 7;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9000; i++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0), a = rnd() * Math.PI;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); g.stroke();
    }
    // a contrasting border band and a running stitch round it
    g.strokeStyle = '#e9c46a'; g.lineWidth = 16;
    roundRect(g, x0 + 22, y0 + 22, x1 - x0 - 44, y1 - y0 - 44, 26); g.stroke();
    g.setLineDash([18, 14]); g.strokeStyle = '#f7f1e3'; g.lineWidth = 4;
    roundRect(g, x0 + 44, y0 + 44, x1 - x0 - 88, y1 - y0 - 88, 18); g.stroke();
    g.setLineDash([]);
    // the centre mark: a little stitched star
    g.strokeStyle = 'rgba(247,241,227,0.8)'; g.lineWidth = 4; g.setLineDash([10, 8]);
    g.beginPath(); g.arc(W / 2, H / 2, 46, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  }

  /* ── camera: frames both fighters, a little shake on a big hit ─────────── */
  frame(xa, xb, dt, aspect) {
    const mid = (xa + xb) / 2, sep = Math.abs(xa - xb);
    const narrow = aspect < 1.2;
    const want = Math.max(narrow ? 22 : 15.5, Math.min(narrow ? 36 : 25, 12 + sep * (narrow ? 1.6 : 1.05)));
    const k = Math.min(1, dt * 3.2);
    this.cam.x += (mid - this.cam.x) * k;
    this.cam.d += (want - this.cam.d) * k;
    this.cam.t += dt;
    this.cam.shake = Math.max(0, this.cam.shake - dt * 2.4);
    const sh = this.cam.shake * this.cam.shake;
    const jx = Math.sin(this.cam.t * 71) * 0.18 * sh, jy = Math.cos(this.cam.t * 59) * 0.14 * sh;
    const C = this.camera;
    C.aspect = aspect;
    C.fov = narrow ? 34 : 26;
    C.position.set(this.cam.x + jx, 3.6 + jy, this.cam.d);
    C.lookAt(this.cam.x + jx * 0.5, 1.85 + jy * 0.5, 0);
    C.updateProjectionMatrix();
  }

  shake(a) { this.cam.shake = Math.min(1.2, this.cam.shake + a); }

  /* ── contact shadows from the plush's points (in world space) ──────────── */
  paintShadows(plushes, extra = []) {
    const g = this.sctx, W = this.shadowCanvas.width, H = this.shadowCanvas.height;
    g.clearRect(0, 0, W, H);
    const px = (x) => ((x / (SX * 2)) + 0.5) * W, pz = (z) => ((z / (SZ * 2)) + 0.5) * H;
    const sc = W / (SX * 2);
    const blob = (x, y, z, r, a) => {
      const sx = x - (KEY.x / KEY.y) * y * 0.45, sz = z - (KEY.z / KEY.y) * y * 0.45;
      const X = px(sx), Z = pz(sz), R = (r * 1.25 + Math.max(0, y) * 0.55) * sc;
      if (!Number.isFinite(X + Z + R) || R <= 0) return;
      const gr = g.createRadialGradient(X, Z, 0, X, Z, R);
      gr.addColorStop(0, `rgba(0,0,0,${a * Math.exp(-y * 0.9)})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(X - R, Z - R, R * 2, R * 2);
    };
    const v = new THREE.Vector3();
    for (const p of plushes) {
      if (!p.group.visible) continue;
      const s = p.soft, M = p.group.matrixWorld;
      v.set(...s.headC).applyMatrix4(M);
      blob(v.x, Math.max(0, v.y * 0.6 - 0.3), v.z, 1.35, 0.3);
      for (let i = 0; i < s.n; i += 2) {
        v.set(s.x[i * 3], s.x[i * 3 + 1], s.x[i * 3 + 2]).applyMatrix4(M);
        blob(v.x, v.y, v.z, s.r[i], 0.09);
      }
    }
    for (const [x, y, z, r] of extra) blob(x, y, z, r, 0.16);
    this.shadowTex.needsUpdate = true;
  }

  /* ── hit sparks: a comic burst and a few tufts of stuffing ────────────── */
  _initSparks() {
    const mk = (draw) => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      draw(c.getContext('2d'));
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const burst = (g, fill, edge, spikes) => {
      g.translate(128, 128);
      g.beginPath();
      for (let k = 0; k < spikes * 2; k++) {
        const a = (k / (spikes * 2)) * Math.PI * 2, r = k % 2 ? 46 + (k % 4) * 6 : 118 - (k % 3) * 14;
        k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fillStyle = fill; g.fill();
      g.lineWidth = 9; g.strokeStyle = edge; g.stroke();
      g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fillStyle = '#fffdf3'; g.fill();
    };
    this.texHit = mk((g) => burst(g, '#ffd23f', '#2b1d14', 9));
    this.texBig = mk((g) => burst(g, '#ff7b3a', '#2b1d14', 12));
    this.texBlock = mk((g) => {
      g.translate(128, 128);
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, 0, 50 + k * 26, -1.1, 1.1); g.lineWidth = 14 - k * 3; g.strokeStyle = '#bfe3ff'; g.stroke(); g.lineWidth = 4; g.strokeStyle = '#1e3346'; g.stroke(); }
    });
    this.sparks = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
      m.map = this.texHit;
      const mesh = new THREE.Mesh(geo, m);
      mesh.renderOrder = 20;
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({ mesh, t: 1, life: 0.2, size: 1 });
    }
    this._sp = 0;
  }

  spark(x, y, kind, size = 1, dir = 1) {
    const s = this.sparks[this._sp++ % this.sparks.length];
    s.mesh.material.map = kind === 'block' ? this.texBlock : kind === 'big' ? this.texBig : this.texHit;
    s.mesh.material.needsUpdate = true;
    s.mesh.position.set(x, y, 1.2);
    s.mesh.rotation.z = kind === 'block' ? (dir > 0 ? Math.PI : 0) : Math.random() * Math.PI;
    s.t = 0; s.life = kind === 'big' ? 0.3 : 0.2; s.size = size;
    s.mesh.visible = true;
  }

  /* ── stuffing: tufts on hits, a cloud for a Fluffatality ──────────────── */
  _initFluff() {
    const N = (this.fluffN = 360);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.colorNode = Fn(() => {
      const N = normalize(normalWorld);
      const n = mx_noise_float(positionWorld.mul(14)).mul(0.08);
      return vec4(shade(vec3(0.97, 0.95, 0.9).sub(n), N, { spec: 0.02, wrap: 0.8 }), 1);
    })();
    this.fluff = new THREE.InstancedMesh(geo, mat, N);
    this.fluff.frustumCulled = false;
    this.fluff.count = 0;
    this.scene.add(this.fluff);
    this.fp = [];
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._v = new THREE.Vector3();
  }

  tufts(x, y, n = 6, power = 1, dir = 1) {
    for (let i = 0; i < n; i++) {
      if (this.fp.length >= this.fluffN) this.fp.shift();
      this.fp.push({
        p: [x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, 0.6 + Math.random() * 0.4],
        v: [dir * (1 + Math.random() * 3) * power, (1 + Math.random() * 4) * power, (Math.random() - 0.3) * 3 * power],
        r: 0.05 + Math.random() * 0.08, life: 1.2 + Math.random() * 1.2, t: 0, spin: Math.random() * 6, drag: 1.6 + Math.random(),
      });
    }
  }

  burst(plush) {
    // every few points of the plush lets go a puff of stuffing
    const s = plush.soft, M = plush.group.matrixWorld, v = this._v;
    for (let i = 0; i < s.n; i += 1) {
      v.set(s.x[i * 3], s.x[i * 3 + 1], s.x[i * 3 + 2]).applyMatrix4(M);
      if (this.fp.length >= this.fluffN) this.fp.shift();
      const a = Math.random() * Math.PI * 2;
      this.fp.push({
        p: [v.x, v.y, v.z],
        v: [Math.cos(a) * (2 + Math.random() * 5), 3 + Math.random() * 7, Math.sin(a) * (1 + Math.random() * 3)],
        r: 0.09 + Math.random() * 0.16, life: 3 + Math.random() * 2.5, t: 0, spin: Math.random() * 4, drag: 0.9 + Math.random() * 0.8,
      });
    }
  }

  /* ── projectiles ───────────────────────────────────────────────────────── */
  projectiles(list, alpha, prev) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      const q = prev?.get(p.id);
      const x = (q ? q.x + (p.x - q.x) * alpha : p.x) / U, y = (q ? q.y + (p.y - q.y) * alpha : p.y) / U;
      if (p.kind === 'ball') {
        let m = this.balls.get(p.id);
        if (!m) { m = this.ballPool.pop() || makeTennisBall(TENNIS_R * 2.2); this.scene.add(m); this.balls.set(p.id, m); }
        m.visible = true;
        m.position.set(x, y, 0.2);
        m.rotation.z -= 0.35 * Math.sign(p.vx); m.rotation.x += 0.2;
      } else {
        let m = this.rings.get(p.id);
        if (!m) {
          const mat = new THREE.MeshBasicNodeMaterial();
          const col = new THREE.Color(RING_COLORS[p.id % RING_COLORS.length]);
          mat.colorNode = Fn(() => vec4(shade(vec3(col.r, col.g, col.b), normalize(normalWorld), { spec: 0.06, wrap: 0.6 }), 1))();
          m = this.ringPool.pop() || new THREE.Mesh(this.ringGeo, mat);
          this.scene.add(m); this.rings.set(p.id, m);
        }
        m.visible = true;
        m.position.set(x, y, 0.3);
        m.rotation.set(Math.PI / 2 - 0.5, p.t * 0.25, 0);
      }
    }
    for (const [id, m] of this.balls) if (!seen.has(id)) { m.visible = false; this.balls.delete(id); this.ballPool.push(m); }
    for (const [id, m] of this.rings) if (!seen.has(id)) { m.visible = false; this.rings.delete(id); this.ringPool.push(m); }
    return [...this.balls.values(), ...this.rings.values()].map((m) => [m.position.x, m.position.y, m.position.z, 0.3]);
  }

  /* per render frame: sparks and fluff */
  update(dt) {
    const C = this.camera;
    for (const s of this.sparks) {
      if (!s.mesh.visible) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) { s.mesh.visible = false; continue; }
      const sc = s.size * (0.7 + 1.1 * Math.min(1, k * 4)) * (1 - 0.3 * k);
      s.mesh.scale.set(sc, sc, 1);
      s.mesh.quaternion.copy(C.quaternion);
      s.mesh.rotateZ(s.mesh.userData.r || (s.mesh.userData.r = Math.random() * 3));
      s.mesh.material.opacity = 1 - k * k;
    }
    const keep = [];
    let n = 0;
    for (const f of this.fp) {
      f.t += dt;
      if (f.t > f.life) continue;
      const d = Math.exp(-f.drag * dt);
      f.v[0] *= d; f.v[2] *= d; f.v[1] = f.v[1] * d - 6 * dt;
      for (let k = 0; k < 3; k++) f.p[k] += f.v[k] * dt;
      if (f.p[1] < f.r * 0.6) { f.p[1] = f.r * 0.6; f.v[1] = 0; f.v[0] *= 0.8; f.v[2] *= 0.8; }
      const fade = Math.min(1, (f.life - f.t) * 3);
      this._e.set(f.spin * f.t, f.spin * 0.7 * f.t, 0);
      this._q.setFromEuler(this._e);
      this._s.set(f.r * fade, f.r * 0.8 * fade, f.r * fade);
      this._m4.compose(this._v.set(...f.p), this._q, this._s);
      this.fluff.setMatrixAt(n++, this._m4);
      keep.push(f);
    }
    this.fp = keep;
    this.fluff.count = n;
    this.fluff.instanceMatrix.needsUpdate = true;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
