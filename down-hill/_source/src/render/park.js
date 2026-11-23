/* Sprinkler Park: the back garden at golden hour, at plush scale, built
   round the track's spline (race/track.js PARK) like The Landing.

   Light: a low warm sun out of the west (the one shadow-casting light, its
   map drawn once: long shadows across the lawn), a blue sky fill, the
   patio's string lights coming on, the pool's caustic shimmer. The sky is
   a painted dome with the sun's glow on the horizon. The sprinklers spray
   when the sim says they're on; the pool splashes; the chalk lines mark
   the road over the mown stripes.

   World units: the track's. The garden is x −420…330, z −260…290.       */

import * as THREE from 'three/webgpu';
import { World } from './world.js';
import { buildReadable } from './readable.js';
import { rbox, mat, mesh, canvasTex, srand } from './geo.js';
import { rightX, rightZ, sprinklerOn } from '../race/track.js';

const TAU = Math.PI * 2;
export const YARD = { x0: -420, x1: 330, z0: -260, z1: 290 };

function grassTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const r = srand(3);
    g.fillStyle = '#5f8f34'; g.fillRect(0, 0, w, h);
    // mown stripes
    for (let x = 0; x < w; x += 64) { g.fillStyle = (x / 64) % 2 ? 'rgba(255,255,200,.06)' : 'rgba(0,30,0,.06)'; g.fillRect(x, 0, 64, h); }
    for (let i = 0; i < 16000; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? `rgba(40,80,20,${0.25 + r() * 0.3})` : v < 0.85 ? `rgba(140,190,70,${0.2 + r() * 0.3})` : `rgba(220,220,120,${0.15 + r() * 0.2})`;
      const x = r() * w, y = r() * h;
      g.fillRect(x, y, 1, 2 + r() * 3);
    }
    // a few clover patches and daisies
    for (let i = 0; i < 18; i++) { const x = r() * w, y = r() * h; g.fillStyle = '#fffbea'; g.beginPath(); g.arc(x, y, 2, 0, TAU); g.fill(); g.fillStyle = '#ffd84a'; g.fillRect(x - 0.6, y - 0.6, 1.2, 1.2); }
  }, { repeat: [24, 24] });
}
function paverTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = srand(9);
    g.fillStyle = '#8e8a7e'; g.fillRect(0, 0, w, h);
    const s = 64;
    for (let y = 0; y < h; y += s) for (let x = 0; x < w; x += s) {
      const v = 170 + r() * 30;
      g.fillStyle = `rgb(${v},${v - 12},${v - 30})`; g.fillRect(x + 3, y + 3, s - 6, s - 6);
      for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(80,70,60,${r() * 0.2})`; g.fillRect(x + r() * s, y + r() * s, 2, 2); }
    }
  }, { repeat: [6, 6] });
}
function barkTex() {
  return canvasTex(128, 256, (g, w, h) => {
    const r = srand(4);
    g.fillStyle = '#5a3e28'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = r() < 0.5 ? 'rgba(30,20,12,.5)' : 'rgba(120,90,60,.35)'; const x = r() * w; g.fillRect(x, 0, 2 + r() * 4, h); }
    for (let i = 0; i < 40; i++) { g.fillStyle = 'rgba(20,14,8,.4)'; g.fillRect(r() * w, r() * h, 6 + r() * 10, 2); }
  }, { repeat: [3, 2] });
}
function skyTex() {
  return canvasTex(64, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#3b5fa8'); gr.addColorStop(0.35, '#7d9fd6'); gr.addColorStop(0.55, '#f2b77c'); gr.addColorStop(0.62, '#ff9a5a'); gr.addColorStop(0.7, '#d9784e'); gr.addColorStop(1, '#5a4a3a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function waterTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5fc8e8'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 3;
    const r = srand(2);
    for (let i = 0; i < 22; i++) { g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.bezierCurveTo(x + 20, y - 10, x + 30, y + 14, x + 52, y + 2); g.stroke(); }
  }, { repeat: [3, 3] });
}
function planksTexP() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = srand(6);
    for (let y = 0; y < h; y += 32) { const v = 0.4 + r() * 0.15; g.fillStyle = `hsl(28,45%,${v * 60}%)`; g.fillRect(0, y, w, 30); g.fillStyle = '#2a1a0e'; g.fillRect(0, y + 30, w, 2); for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(40,24,10,.25)'; g.fillRect(0, y + r() * 30, w, 1); } }
  }, { repeat: [1, 8] });
}

export class ParkWorld extends World {
  build() {
    this.noDash = new Set(['hose']);
    this.runnerTags = new Set(['lawn', 'pool']);
    this.runnerColor = '#9cc46a';
    this.dashLift = () => 0;
    this._lightsP();
    this._yard();
    this._house();
    this._tree();
    this._pool();
    this._hose();
    this._sprinklers();
    this._garden();
    this._guides();
    this.readable = buildReadable(this, { arrowTags: new Set(['hose', 'patio', 'pool', 'ramp']), railCols: ['#e8552e', '#fff4e0'] });
    // the chalk lines read white on grass
  }

  get info() {
    return {
      podium: [[-40, 6, 20], [-48, 4, 18], [-32, 3, 18]], podLook: [-40, 7.2, 19], podCam: { c: [-40, 20], r: 17, y: 10, a: 0.4 },
      turn: [-40, 0.2, 20], title: { c: [-60, 10], r: 420, y: 420, look: [-60, 0, 10] }, bounds: [YARD.x0 + 6, YARD.x1 - 6, YARD.z0 + 6, YARD.z1 - 6],
    };
  }
  camFix() {}
  darkAt() { return 0; }

  _lightsP() {
    const S = (this.lightsG = new THREE.Group());
    this.scene.add(S);
    this.hemi = new THREE.HemisphereLight('#a8c4ff', '#4f6a2c', 1.3);
    S.add(this.hemi);
    // the low golden sun from the west: long shadows across the lawn
    const sun = (this.moon = new THREE.DirectionalLight('#ffbf7a', 2.9));
    sun.position.set(-620, 260, 120); sun.target.position.set(-40, 0, 0);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera; c.left = -420; c.right = 420; c.top = 340; c.bottom = -340; c.near = 50; c.far = 1600;
    sun.shadow.bias = -0.0009; sun.shadow.normalBias = 0.8; sun.shadow.autoUpdate = false;
    S.add(sun, sun.target);
    // the patio's string lights (warm), the pool's blue bounce
    this.patio = new THREE.PointLight('#ffcf8a', 2200, 220, 1.6);
    this.patio.position.set(230, 50, 0);
    S.add(this.patio);
    this.poolLight = new THREE.PointLight('#7fe0ff', 900, 90, 1.6);
    this.poolLight.position.set(180, 10, -87);
    S.add(this.poolLight);
  }

  _yard() {
    const Y = YARD, root = this.root;
    // the sky dome and the sun on the horizon
    const sky = skyTex();
    sky.mapping = THREE.EquirectangularReflectionMapping;
    this.scene.background = sky;
    this.glow('#fff0b0', 200, -860, 150, 80, 0.95);
    this.glow('#ff9a4a', 560, -860, 130, 80, 0.5);
    // the lawn, far past the fence
    const grass = new THREE.MeshStandardMaterial({ map: grassTex(), roughness: 0.95, color: '#d8e8b0' });
    const g = mesh(new THREE.PlaneGeometry(2600, 2600), grass, -40, 0, 0, root); g.rotation.x = -Math.PI / 2;
    // the fence: weathered pickets all round
    const wood = mat('#d9c9a8', { roughness: 0.85 });
    const rail = mat('#bfa982', { roughness: 0.85 });
    const fence = (x0, z0, x1, z1) => {
      const L = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(L / 7), ry = Math.atan2(x1 - x0, z1 - z0);
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(5, 46, 1.6), wood, n);
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0));
      for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; M.compose(new THREE.Vector3(x0 + (x1 - x0) * t, 23, z0 + (z1 - z0) * t), Q, new THREE.Vector3(1, 1 + ((i * 37) % 7) * 0.01, 1)); im.setMatrixAt(i, M); }
      im.userData.noShadow = true; root.add(im);
      for (const y of [12, 36]) { const r2 = mesh(new THREE.BoxGeometry(2.4, 3, L), rail, (x0 + x1) / 2, y, (z0 + z1) / 2, root); r2.rotation.y = ry; }
    };
    fence(Y.x0, Y.z0, Y.x0, Y.z1); fence(Y.x0, Y.z1, Y.x1, Y.z1); fence(Y.x0, Y.z0, Y.x1, Y.z0);
    // the neighbours' trees over the fence (soft green blobs against the sky)
    const r = srand(17);
    const leaf = [mat('#3f6a2a', { roughness: 0.9 }), mat('#4f7f30', { roughness: 0.9 }), mat('#2f5a24', { roughness: 0.9 })];
    for (let i = 0; i < 26; i++) {
      const side = i % 3, t = r();
      const x = side === 0 ? Y.x0 - 40 - r() * 60 : Y.x0 + (Y.x1 - Y.x0) * t, z = side === 0 ? Y.z0 + (Y.z1 - Y.z0) * t : side === 1 ? Y.z1 + 40 + r() * 60 : Y.z0 - 40 - r() * 60;
      const s = 40 + r() * 50;
      mesh(new THREE.CylinderGeometry(4, 6, s, 8), mat('#5a3e28'), x, s / 2, z, root);
      for (let k = 0; k < 3; k++) mesh(new THREE.IcosahedronGeometry(s * (0.5 + r() * 0.3), 1), leaf[k % 3], x + (r() - 0.5) * s * 0.6, s + (r() - 0.2) * s * 0.4, z + (r() - 0.5) * s * 0.6, root);
    }
  }

  /* the back of the house: the patio door, the steps, the pavers, string lights */
  _house() {
    const root = this.root, Y = YARD;
    const siding = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#e9e2d0'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 16) { g.fillStyle = 'rgba(120,100,70,.25)'; g.fillRect(0, y, w, 2); } }, { repeat: [20, 8] }), roughness: 0.8 });
    const wall = mesh(new THREE.PlaneGeometry(Y.z1 - Y.z0, 200), siding, Y.x1, 100, (Y.z0 + Y.z1) / 2, root); wall.rotation.y = -Math.PI / 2;
    // the patio door, glowing warm
    const door = mesh(new THREE.PlaneGeometry(70, 80), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }), Y.x1 - 0.5, 40, 10, root); door.rotation.y = -Math.PI / 2;
    for (const z of [-25, 10, 45]) mesh(new THREE.BoxGeometry(2, 82, 3), mat('#f4f1ea'), Y.x1 - 1.5, 41, z, root);
    mesh(new THREE.BoxGeometry(2, 4, 74), mat('#f4f1ea'), Y.x1 - 1.5, 81, 10, root);
    this.glow('#ffcf8a', 160, Y.x1 - 10, 40, 10, 0.4);
    // a window either side
    for (const z of [-140, 160]) { const w2 = mesh(new THREE.PlaneGeometry(50, 40), new THREE.MeshBasicMaterial({ color: '#ffe2b0' }), Y.x1 - 0.5, 110, z, root); w2.rotation.y = -Math.PI / 2; }
    // the patio pavers round the patio section
    const T = this.T, pav = new THREE.MeshStandardMaterial({ map: paverTex(), roughness: 0.75 });
    const ks = []; for (let k = 0; k < T.N; k++) if (this.tagAt(k) === 'patio') ks.push(k);
    if (ks.length) {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (const k of ks) { x0 = Math.min(x0, T.x[k]); x1 = Math.max(x1, T.x[k]); z0 = Math.min(z0, T.z[k]); z1 = Math.max(z1, T.z[k]); }
      x0 -= 30; x1 = Y.x1; z0 -= 40; z1 += 40;
      const p = mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), pav, (x0 + x1) / 2, 0.08, (z0 + z1) / 2, root); p.rotation.x = -Math.PI / 2;
      // a table with a sun umbrella, two chairs, a grill
      const tx = x1 - 45, tz = z1 - 30;
      mesh(new THREE.CylinderGeometry(16, 16, 1.6, 28), mat('#f4f1ea', { roughness: 0.4 }), tx, 28, tz, root);
      mesh(new THREE.CylinderGeometry(1, 1, 28, 8), mat('#555'), tx, 14, tz, root);
      mesh(new THREE.CylinderGeometry(1, 1, 70, 8), mat('#d9d4c4'), tx, 35, tz, root);
      const um = mesh(new THREE.ConeGeometry(42, 14, 12), mat('#ff6a5a', { roughness: 0.7, side: THREE.DoubleSide }), tx, 72, tz, root); um.userData.cast = true;
      for (const s of [-1, 1]) { const ch = mesh(rbox(14, 2, 14, 0.6), mat('#3ab795', { roughness: 0.5 }), tx + s * 24, 16, tz, root); ch.userData.cast = true; mesh(rbox(14, 16, 2, 0.6), mat('#3ab795', { roughness: 0.5 }), tx + s * 24, 24, tz + 7, root); }
      const grill = mesh(new THREE.SphereGeometry(10, 16, 10, 0, TAU, 0, Math.PI / 2), mat('#202024', { roughness: 0.4, metalness: 0.5 }), x1 - 30, 26, z0 + 26, root); grill.rotation.x = Math.PI; grill.userData.cast = true;
      for (const a of [0, 2.1, 4.2]) mesh(new THREE.CylinderGeometry(0.7, 0.7, 26, 6), mat('#202024'), x1 - 30 + Math.cos(a) * 7, 13, z0 + 26 + Math.sin(a) * 7, root);
    }
    // string lights from the house out over the patio
    const bulbs = [];
    for (const [z0, z1] of [[-90, -10], [30, 110]]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(Y.x1 - 2, 96, z0), new THREE.Vector3(Y.x1 - 70, 70, (z0 + z1) / 2), new THREE.Vector3(Y.x1 - 2, 96, z1)]);
      mesh(new THREE.TubeGeometry(curve, 30, 0.25, 5), mat('#222'), 0, 0, 0, root);
      for (let i = 1; i < 12; i++) { const p = curve.getPoint(i / 12); bulbs.push(mesh(new THREE.SphereGeometry(1.3, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffe0a0' }), p.x, p.y - 1.5, p.z, root)); this.glow('#ffc87a', 9, p.x, p.y - 1.5, p.z, 0.7); }
    }
    this.fairy = bulbs.map((b) => ({ material: b.material }));
  }

  /* the old oak and its treehouse; the deck is the track's (planks over
     the deck samples), the hut sits up the trunk behind it */
  _tree() {
    const T = this.T, N = T.N, root = this.root;
    const dk = []; for (let k = 0; k < N; k++) if (this.tagAt(k) === 'deck') dk.push(k);
    const rk = []; for (let k = 0; k < N; k++) if (this.tagAt(k) === 'ramp') rk.push(k);
    const planks = new THREE.MeshStandardMaterial({ map: planksTexP(), roughness: 0.75 });
    if (rk.length) this.ribbon([rk[0] - 2, ...rk, ...dk, dk[dk.length - 1] + 2].map((k) => (k + N) % N), planks, 1.8, true);
    // the support posts under the ramp and the deck
    const post = mat('#6a4a2e', { roughness: 0.85 });
    for (const k of [...rk, ...dk].filter((_, i) => i % 10 === 0)) for (const s of [-1, 1]) {
      const w = T.w[k] + T.m[k] - 0.8, x = T.x[k] + rightX(T, k) * w * s, z = T.z[k] + rightZ(T, k) * w * s, y = T.y[k] - 1.8;
      if (y < 1) continue;
      const p = mesh(new THREE.BoxGeometry(1.6, y, 1.6), post, x, y / 2, z, root); p.userData.cast = true;
    }
    if (!dk.length) return;
    // the trunk: just outside the deck's inner edge at its middle
    const km = dk[Math.floor(dk.length / 2)], side = T.curv[km] > 0 ? -1 : 1;
    const off = (T.w[km] + T.m[km] + 24) * side;
    const tx = T.x[km] + rightX(T, km) * off, tz = T.z[km] + rightZ(T, km) * off;
    const bark = new THREE.MeshStandardMaterial({ map: barkTex(), roughness: 0.95 });
    const trunk = mesh(new THREE.CylinderGeometry(11, 16, 150, 18), bark, tx, 75, tz, root); trunk.userData.cast = true;
    for (let i = 0; i < 5; i++) { const a = i * 1.3; const br = mesh(new THREE.CylinderGeometry(3, 6, 70, 8), bark, tx + Math.cos(a) * 26, 128 + i * 6, tz + Math.sin(a) * 26, root); br.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9); br.userData.cast = true; }
    const leaf = [mat('#4f7f30', { roughness: 0.9 }), mat('#5f8f38', { roughness: 0.9 }), mat('#3f6a2a', { roughness: 0.9 })];
    const r = srand(31);
    for (let i = 0; i < 12; i++) { const a = r() * TAU, d = r() * 60; const s = mesh(new THREE.IcosahedronGeometry(30 + r() * 22, 1), leaf[i % 3], tx + Math.cos(a) * d, 160 + r() * 50, tz + Math.sin(a) * d, root); s.userData.cast = true; }
    // the hut up the trunk, the rope ladder, a little flag
    const hy = T.y[km] + 34;
    const hut = new THREE.Group(); hut.position.set(tx, hy, tz); hut.rotation.y = Math.atan2(T.tx[km], T.tz[km]);
    mesh(new THREE.BoxGeometry(34, 2, 30), mat('#7a5a3c'), 0, 0, 0, hut);
    const wall = new THREE.MeshStandardMaterial({ map: planksTexP(), roughness: 0.8 });
    for (const [x, z, w, d] of [[0, -14, 34, 2], [0, 14, 34, 2], [-16, 0, 2, 30], [16, 0, 2, 30]]) mesh(new THREE.BoxGeometry(w, 22, d), wall, x, 12, z, hut);
    const roof = mesh(new THREE.ConeGeometry(28, 16, 4), mat('#b5442e', { roughness: 0.7 }), 0, 31, 0, hut); roof.rotation.y = Math.PI / 4;
    mesh(new THREE.PlaneGeometry(10, 12), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }), 0, 12, 15.2, hut);
    mesh(new THREE.CylinderGeometry(0.4, 0.4, 20, 6), mat('#ddd'), 12, 46, 0, hut);
    mesh(new THREE.PlaneGeometry(9, 6), mat('#ff3b6b', { side: THREE.DoubleSide }), 16.5, 52, 0, hut);
    hut.traverse((o) => { if (o.isMesh) o.userData.cast = true; });
    root.add(hut);
    // a tyre swing from a branch, over the lawn
    const sx = tx + Math.cos(2.6) * 40, sz = tz + Math.sin(2.6) * 40;
    mesh(new THREE.CylinderGeometry(0.4, 0.4, 70, 6), mat('#cdb88a'), sx, 85, sz, root);
    const tyre = mesh(new THREE.TorusGeometry(7, 2.6, 10, 20), mat('#1c1c1e', { roughness: 0.8 }), sx, 48, sz, root); tyre.userData.cast = true;
  }

  /* the kiddie pool: an inflatable ring (gaps where the road runs through
     it), water with a shimmer */
  _pool() {
    const T = this.T, root = this.root;
    const P = T.def.patches.find((p) => p.kind === 'pool');
    if (!P) return;
    const R = P.r + 2;
    this.waterTex = waterTex();
    const water = mesh(new THREE.CircleGeometry(R, 40), new THREE.MeshStandardMaterial({ map: this.waterTex, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85, color: '#bfeeff' }), P.x, 0.35, P.z, root);
    water.rotation.x = -Math.PI / 2; water.userData.noShadow = true; water.userData.keep = true;
    mesh(new THREE.CircleGeometry(R, 40), mat('#2f8fd8', { roughness: 0.6 }), P.x, 0.12, P.z, root).rotation.x = -Math.PI / 2;
    const cols = ['#ff6a8a', '#ffd84a', '#3ab7ff'];
    const segs = 36;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * TAU, x = P.x + Math.cos(a) * R, z = P.z + Math.sin(a) * R;
      // leave the ring open where the road crosses it
      let near = 1e9;
      for (let k = 0; k < T.N; k += 2) near = Math.min(near, Math.hypot(T.x[k] - x, T.z[k] - z) - T.w[k]);
      if (near < 1.5) continue;
      for (const [h, s] of [[1.6, 1.6], [4.4, 1.5]]) { const t = mesh(new THREE.SphereGeometry(s, 10, 8), mat(cols[(i + (h > 2 ? 1 : 0)) % 3], { roughness: 0.3 }), x, h, z, root); t.scale.set(1, 1, 2.2); t.rotation.y = -a; }
    }
    // a rubber duck
    const duck = new THREE.Group(); duck.position.set(P.x + R * 0.5, 0.8, P.z - R * 0.3);
    mesh(new THREE.SphereGeometry(2.4, 14, 10), mat('#ffd84a', { roughness: 0.3 }), 0, 1.4, 0, duck).scale.set(1.3, 0.9, 1);
    mesh(new THREE.SphereGeometry(1.5, 12, 10), mat('#ffd84a', { roughness: 0.3 }), 1.6, 3.2, 0, duck);
    mesh(new THREE.ConeGeometry(0.6, 1.4, 8), mat('#ff8c2a'), 3.2, 3.1, 0, duck).rotation.z = -Math.PI / 2;
    duck.userData.keep = true; root.add(duck); this.duck = duck;
  }

  /* the garden hose across the road: the jump (a fat green coil + the reel) */
  _hose() {
    const T = this.T, root = this.root, N = T.N;
    let k0 = -1;
    for (let k = 0; k < N; k++) if (T.launch[k] && this.tagAt(k) === 'hose') { k0 = k; break; }
    if (k0 < 0) return;
    const rx = rightX(T, k0), rz = rightZ(T, k0), w = T.w[k0] + T.m[k0] + 14;
    const pts = [];
    for (let i = -8; i <= 8; i++) { const d = (i / 8) * w; pts.push(new THREE.Vector3(T.x[k0] + rx * d + T.tx[k0] * Math.sin(i * 0.9) * 2, 1.6, T.z[k0] + rz * d + T.tz[k0] * Math.sin(i * 0.9) * 2)); }
    // off to the reel by the fence
    pts.push(new THREE.Vector3(pts[pts.length - 1].x + rx * 30, 1.6, pts[pts.length - 1].z + rz * 30 + 20));
    const hose = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 1.6, 10), mat('#2f9a3a', { roughness: 0.45 }), 0, 0, 0, root); hose.userData.cast = true;
    // a ramp-y bump of turf where it crosses, so the jump reads
    const bump = mesh(new THREE.SphereGeometry(1, 24, 10, 0, TAU, 0, Math.PI / 2), mat('#6f9a3c', { roughness: 0.95 }), T.x[k0] - T.tx[k0] * 3, 0, T.z[k0] - T.tz[k0] * 3, root);
    bump.scale.set(T.w[k0] + 2, 2.2, 6); bump.rotation.y = Math.atan2(T.tx[k0], T.tz[k0]);
    const reel = pts[pts.length - 1];
    const rl = new THREE.Group(); rl.position.copy(reel);
    mesh(new THREE.CylinderGeometry(8, 8, 6, 20), mat('#2f9a3a', { roughness: 0.5 }), 0, 9, 0, rl).rotation.x = Math.PI / 2;
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(10, 10, 0.8, 20), mat('#f2c14e', { roughness: 0.5 }), 0, 9, s * 3.4, rl).rotation.x = Math.PI / 2;
    root.add(rl);
  }

  /* the sprinklers: a brass head on a spike; when on, a fan of arcing jets
     (translucent tubes) and a mist glow; a darker wet circle round each */
  _sprinklers() {
    const root = this.root;
    this.sprays = (this.T.def.sprinklers || []).map((S, i) => {
      const g = new THREE.Group(); g.position.set(S.x, 0, S.z);
      mesh(new THREE.CylinderGeometry(1.6, 2.4, 2.4, 12), mat('#b8862f', { roughness: 0.3, metalness: 0.7 }), 0, 1.2, 0, g);
      const head = mesh(new THREE.CylinderGeometry(0.8, 0.8, 3, 8), mat('#d9a84a', { roughness: 0.3, metalness: 0.7 }), 0, 3.6, 0, g);
      const wet = mesh(new THREE.CircleGeometry(S.reach * 0.95, 36), mat('#3f6a2a', { roughness: 0.2, transparent: true, opacity: 0.35 }), 0, 0.06, 0, g); wet.rotation.x = -Math.PI / 2; wet.userData.noShadow = true;
      const jets = new THREE.Group(); jets.position.y = 4.5;
      const jm = new THREE.MeshBasicMaterial({ color: '#dff6ff', transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
      for (let j = 0; j < 9; j++) {
        const a = (j / 9) * TAU, pts = [];
        for (let t = 0; t <= 1.0001; t += 0.1) pts.push(new THREE.Vector3(Math.cos(a) * S.reach * t, 16 * t * (1 - t) * 2.2, Math.sin(a) * S.reach * t));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.45, 5), jm);
        tube.userData.noShadow = true; jets.add(tube);
      }
      g.add(jets);
      g.userData.keep = true; root.add(g);
      const mist = this.glow('#e8faff', S.reach * 2.2, S.x, 6, S.z, 0);
      return { g, head, jets, jm, mist, S, i };
    });
  }

  _garden() {
    const root = this.root, T = this.T, r = srand(41);
    // the flowerbeds (the mulch patches): bark chips and flowers
    for (const P of T.def.patches) {
      if (P.kind !== 'mulch') continue;
      const m = mesh(new THREE.CircleGeometry(P.r + 1, 24), mat('#5a3a22', { roughness: 1 }), P.x, 0.1, P.z, root); m.rotation.x = -Math.PI / 2;
      for (let i = 0; i < 10; i++) {
        const a = r() * TAU, d = r() * P.r, x = P.x + Math.cos(a) * d, z = P.z + Math.sin(a) * d;
        mesh(new THREE.CylinderGeometry(0.2, 0.2, 4, 4), mat('#3f7a2a'), x, 2, z, root);
        mesh(new THREE.SphereGeometry(1.1, 8, 6), mat(['#ff6a8a', '#ffd84a', '#9b5cff', '#ffffff'][i % 4], { roughness: 0.6 }), x, 4.2, z, root);
      }
    }
    // the lawn ornaments (the posts): a gnome and a flamingo, both ours
    for (const P of T.def.posts) {
      const g = new THREE.Group(); g.position.set(P.x, 0, P.z);
      if (P.kind === 'gnome') {
        mesh(new THREE.CylinderGeometry(1.4, 1.8, 3.6, 12), mat('#3a6ad8', { roughness: 0.5 }), 0, 1.8, 0, g);
        mesh(new THREE.SphereGeometry(1.2, 12, 10), mat('#f2c7a0'), 0, 4.2, 0, g);
        mesh(new THREE.ConeGeometry(1.1, 1.6, 12), mat('#f4f1ea'), 0, 3.3, 0.6, g).rotation.x = Math.PI;
        mesh(new THREE.ConeGeometry(1.3, 3.2, 12), mat('#e8344a', { roughness: 0.5 }), 0, 6.4, 0, g);
      } else {
        mesh(new THREE.CylinderGeometry(0.15, 0.15, 6, 4), mat('#333'), 0, 3, 0, g);
        mesh(new THREE.SphereGeometry(1.8, 12, 10), mat('#ff7aa8', { roughness: 0.45 }), 0, 6.6, 0, g).scale.set(1.5, 0.9, 0.9);
        const neck = mesh(new THREE.TorusGeometry(1.6, 0.35, 8, 14, Math.PI), mat('#ff7aa8', { roughness: 0.45 }), 1.6, 8.2, 0, g); neck.rotation.z = Math.PI / 2;
        mesh(new THREE.SphereGeometry(0.7, 10, 8), mat('#ff7aa8', { roughness: 0.45 }), 1.6, 9.8, 0, g);
      }
      g.traverse((o) => { if (o.isMesh) o.userData.cast = true; });
      root.add(g);
    }
    // a wheelbarrow, a watering can, a football left out, a bike against the fence
    mesh(rbox(16, 8, 10, 1.4), mat('#c8202a', { roughness: 0.5 }), -250, 9, 140, root).userData.cast = true;
    mesh(new THREE.TorusGeometry(3, 1, 8, 14), mat('#222'), -258, 3, 140, root).rotation.y = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(4, 4.4, 9, 14), mat('#3ab795', { roughness: 0.4, metalness: 0.3 }), 120, 4.5, 150, root).userData.cast = true;
    const ball = mesh(new THREE.SphereGeometry(4.5, 16, 12), new THREE.MeshStandardMaterial({ map: canvasTex(64, 32, (g2, W, H) => { g2.fillStyle = '#f4f1ea'; g2.fillRect(0, 0, W, H); g2.fillStyle = '#222'; for (let i = 0; i < 6; i++) { g2.beginPath(); g2.arc((i * 13) % W, (i * 7) % H, 4, 0, TAU); g2.fill(); } }), roughness: 0.5 }), -110, 4.5, -120, root); ball.userData.cast = true;
    // dandelion puffs dotted about the lawn (sprites)
    for (let i = 0; i < 30; i++) this.glow('#ffffff', 3, -300 + r() * 560, 2.4, -220 + r() * 460, 0.35);
  }

  tagAt(k) { return this.T.def.points[this.T.sec[k]].tag; }
  ribbon(ks, material, thick, rails = false) {
    const T = this.T, pos = [], uv = [], idx = [];
    let v = 0;
    ks.forEach((k, i) => {
      const w = T.w[k] + T.m[k], rx = rightX(T, k), rz = rightZ(T, k), y = T.y[k];
      for (const [s, dy] of [[-1, 0], [1, 0], [-1, -thick], [1, -thick]]) pos.push(T.x[k] + rx * w * s, y + dy, T.z[k] + rz * w * s);
      uv.push(0, v / 20, 1, v / 20, 0, v / 20, 1, v / 20); v += T.step;
      if (i) { const a = (i - 1) * 4, b = i * 4; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2, a, a + 2, b, a + 2, b + 2, b, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = mesh(g, material, 0, 0, 0, this.root); m.userData.cast = true;
    void rails;
    return m;
  }

  _spray(sp, on, t) {
    sp.jets.visible = on;
    sp.jm.opacity = on ? 0.45 + Math.sin(t * 40 + sp.i) * 0.1 : 0;
    sp.jets.rotation.y = t * 1.3 + sp.i;
    sp.mist.material.opacity = on ? 0.18 : 0;
    sp.head.rotation.y = t * 6;
  }
  update(dt, t) {
    super.update(dt, t);
    if (this.waterTex) { this.waterTex.offset.x = Math.sin(t * 0.6) * 0.05; this.waterTex.offset.y = t * 0.02; }
    if (this.duck) { this.duck.position.y = 0.8 + Math.sin(t * 2) * 0.15; this.duck.rotation.y = Math.sin(t * 0.4) * 0.8; }
    if (!this.raceOn) for (const sp of this.sprays) this._spray(sp, sprinklerOn(sp.S, Math.floor(t * 60)), t);
    this.tNow = t;
  }
  race(R) { this.raceOn = true; for (const sp of this.sprays) this._spray(sp, R.sprinklers[sp.i].on, this.tNow || 0); }
  reset() { this.raceOn = false; }
  onEvent(e, app, near, g) {
    const R = app.race, A = app.audio;
    if (e.k === 'splash') { const K = R.karts[e.i]; app.fx.burst(K.x, 0.8, K.z, ['#bfeeff', '#ffffff', '#7fd8ff'], e.big ? 22 : 12, e.big ? 7 : 5); if (near) A.play('feather-burst', { gain: g(0.5), rate: 1.6 }); }
    else if (e.k === 'soak') {
      const K = R.karts[e.i], S = R.sprinklers[e.s];
      app.fx.burst(K.x, 2.5, K.z, ['#dff6ff', '#ffffff'], 10, 6);
      if (near) A.play('whoosh-light', { gain: g(0.7), rate: 1.4 });
      const H = app.hvOf(e.i);
      if (H) { app.toast(H, 'SOAKED!', '#7fd8ff'); H.cam.shake = Math.max(H.cam.shake, 0.3); app.buzz(e.i, 'splash'); }
      void S;
    } else if (e.k === 'spray') { /* the jets come on: drawn by race() */ }
  }
}
