/* Laundry Day: the basement laundry room at plush scale, built round the
   track's spline (race/track.js LAUNDRY) like The Landing.

   Light: a bare bulb hanging over the infield (warm, the key), a buzzing
   fluorescent tube over the machines (cool), daylight down through the
   high window well (the one shadow-casting light, its map drawn once),
   and a blue-grey fill. The conveyor's towels move (a scrolling belt),
   the detergent pods roll where the sim says, the sock piles burst when
   kicked, the dryer drum turns.

   World units: the track's. The room is x −300…285, z −195…165.          */

import * as THREE from 'three/webgpu';
import { World } from './world.js';
import { rbox, mat, mesh, canvasTex, srand } from './geo.js';
import { rightX, rightZ, podPos } from '../race/track.js';

const TAU = Math.PI * 2;
export const ROOM = { x0: -300, x1: 285, z0: -195, z1: 190, h: 150 };

function concreteTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const r = srand(11);
    g.fillStyle = '#7d7b78'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 100 + r() * 50; g.fillStyle = `rgba(${v},${v - 2},${v - 6},${0.12 + r() * 0.12})`; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    // old stains and a few hairline cracks
    for (let i = 0; i < 7; i++) { const x = r() * w, y = r() * h, rr = 20 + r() * 60; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(60,55,50,.22)'); gr.addColorStop(1, 'rgba(60,55,50,0)'); g.fillStyle = gr; g.fillRect(x - rr, y - rr, rr * 2, rr * 2); }
    g.strokeStyle = 'rgba(40,38,36,.35)'; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) { let x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    // the expansion joints
    g.fillStyle = 'rgba(30,28,26,.5)'; g.fillRect(0, 0, w, 2); g.fillRect(0, 0, 2, h);
  }, { repeat: [10, 7] });
}
function blockTex() {
  return canvasTex(512, 256, (g, w, h) => {
    const r = srand(5);
    g.fillStyle = '#b9b2a4'; g.fillRect(0, 0, w, h);
    const bw = 128, bh = 64;
    for (let y = 0; y < h; y += bh) for (let x = (y / bh) % 2 ? -bw / 2 : 0; x < w; x += bw) {
      const v = 172 + r() * 18;
      g.fillStyle = `rgb(${v},${v - 6},${v - 18})`; g.fillRect(x + 3, y + 3, bw - 6, bh - 6);
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(90,85,75,${r() * 0.15})`; g.fillRect(x + r() * bw, y + r() * bh, 2, 2); }
    }
  }, { repeat: [10, 3] });
}
/* the conveyor: folded towels lying flat, end to end, in stripes */
function beltTex() {
  return canvasTex(256, 512, (g, w, h) => {
    const cols = ['#e86a6a', '#f2d27a', '#7fc8e8', '#a8e0a0', '#f4f1ea', '#c9a4e8', '#f59ac0', '#7fd8c8'];
    const n = 8, th = h / n;
    for (let i = 0; i < n; i++) {
      const y = i * th;
      g.fillStyle = '#2a2a2e'; g.fillRect(0, y, w, th);
      g.fillStyle = cols[i % cols.length]; g.fillRect(10, y + 4, w - 20, th - 8);
      // the fold and the terry texture
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(10, y + th / 2 - 2, w - 20, 4);
      g.fillStyle = 'rgba(255,255,255,.18)';
      for (let k = 0; k < 220; k++) g.fillRect(12 + Math.random() * (w - 24), y + 6 + Math.random() * (th - 12), 2, 2);
      // a woven border stripe
      g.fillStyle = 'rgba(255,255,255,.45)'; g.fillRect(10, y + 10, w - 20, 3); g.fillRect(10, y + th - 13, w - 20, 3);
    }
  }, { repeat: [1, 6] });
}
function perfTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#c9ccd2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4a4e56';
    for (let y = 8; y < h; y += 16) for (let x = (y / 16) % 2 ? 16 : 8; x < w; x += 16) { g.beginPath(); g.arc(x, y, 3.2, 0, TAU); g.fill(); }
  }, { repeat: [10, 4] });
}
function podTex(a, b) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = a; g.fillRect(0, 0, w, h);
    g.fillStyle = b; g.beginPath(); g.moveTo(0, h * 0.5);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, h * 0.5 + Math.sin(x / w * TAU * 2) * 18);
    g.lineTo(w, h); g.lineTo(0, h); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.moveTo(0, h * 0.3);
    for (let x = 0; x <= w; x += 4) g.lineTo(x, h * 0.3 + Math.sin(x / w * TAU * 2 + 1) * 10);
    g.lineTo(w, h * 0.42); for (let x = w; x >= 0; x -= 4) g.lineTo(x, h * 0.42 + Math.sin(x / w * TAU * 2 + 1) * 10); g.fill();
  });
}

const SOCKS = ['#e84a5f', '#2f6bd8', '#f2c14e', '#3ab795', '#f4f1ea', '#9b5cff', '#ff8c42', '#2b2933'];

export class LaundryWorld extends World {
  build() {
    this.noDash = new Set(['belt', 'ramp']);
    this.runnerTags = new Set(['floor', 'bulge', 'pods', 'socks', 'suds']);
    this.runnerColor = '#7a5a8e';
    this.dashLift = () => 0;
    this.scene.background = new THREE.Color('#14121c');
    this._lightsL();
    this._roomL();
    this._conveyor();
    this._machines();
    this._dryer();
    this._clutter();
    this._guides();
    this._movers();
  }

  get info() {
    return {
      podium: [[-120, 6, 30], [-128, 4, 28], [-112, 3, 28]], podLook: [-120, 7.2, 29], podCam: { c: [-120, 30], r: 17, y: 10 },
      turn: [-120, 0.2, 30], title: { c: [-10, -15], r: 150, y: 128, look: [-10, 0, -30] }, bounds: [ROOM.x0 + 5, ROOM.x1 - 5, ROOM.z0 + 5, ROOM.z1 - 5],
    };
  }
  /* in the shortcut's gap the camera stays in the gap (and low in the drum) */
  camFix(want, pose) {
    const C = this.T.cut;
    if (!C) return;
    const s = (pose.x - C.ax) * C.ux + (pose.z - C.az) * C.uz, l = -(pose.x - C.ax) * C.uz + (pose.z - C.az) * C.ux;
    if (s > C.m0 - 10 && s < C.m1 + 10 && Math.abs(l) < C.w + 1.5) {
      const ws = (want.x - C.ax) * C.ux + (want.z - C.az) * C.uz;
      want.x = C.ax + C.ux * ws; want.z = C.az + C.uz * ws;
      const inDrum = ws > C.d0 - 4 && ws < C.d1 + 4;
      want.y = Math.min(want.y, inDrum ? 4.6 : 12);
    }
  }
  darkAt(pose) {
    const C = this.T.cut;
    if (!C) return 0;
    const s = (pose.x - C.ax) * C.ux + (pose.z - C.az) * C.uz, l = -(pose.x - C.ax) * C.uz + (pose.z - C.az) * C.ux;
    return s > C.d0 && s < C.d1 && Math.abs(l) < C.w + 1 ? 0.55 : 0;
  }

  _lightsL() {
    const S = (this.lightsG = new THREE.Group());
    this.scene.add(S);
    this.hemi = new THREE.HemisphereLight('#a8b0d0', '#5a4636', 1.5);
    S.add(this.hemi);
    // daylight down the window well: the one shadow-casting light
    const sun = (this.moon = new THREE.DirectionalLight('#dfe8ff', 1.7));
    sun.position.set(-260, 360, 320); sun.target.position.set(-20, 0, -20);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera; c.left = -330; c.right = 330; c.top = 260; c.bottom = -260; c.near = 50; c.far = 1200;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.6; sun.shadow.autoUpdate = false;
    S.add(sun, sun.target);
    // the bare bulb over the infield
    this.bulb = new THREE.PointLight('#ffb36a', 7000, 420, 1.4);
    this.bulb.position.set(-20, 110, 0);
    S.add(this.bulb);
    // the fluorescent tube over the machines (cool, flickers now and then)
    this.tube = new THREE.PointLight('#cfe6ff', 2600, 240, 1.6);
    this.tube.position.set(0, 96, -130);
    S.add(this.tube);
    // a warm lamp by the folding table
    this.lamp = new THREE.PointLight('#ffd29a', 1800, 200, 1.7);
    this.lamp.position.set(40, 60, 150);
    S.add(this.lamp);
    // the water heater's pilot glow
    this.pilot = new THREE.PointLight('#5aa8ff', 500, 60, 1.8);
    this.pilot.position.set(250, 8, 10);
    S.add(this.pilot);
  }

  _roomL() {
    const R = ROOM, root = this.root;
    const floor = new THREE.MeshStandardMaterial({ map: concreteTex(), roughness: 0.78, color: '#ece4d6' });
    const f = mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), floor, (R.x0 + R.x1) / 2, 0, (R.z0 + R.z1) / 2, root);
    f.rotation.x = -Math.PI / 2;
    // a floor drain by the water heater
    const drain = mesh(new THREE.CircleGeometry(5, 24), mat('#2b2a2a', { roughness: 0.4, metalness: 0.6 }), 232, 0.05, -40, root); drain.rotation.x = -Math.PI / 2;
    // cinder-block walls, a painted band, a skirting of pipes
    const wall = new THREE.MeshStandardMaterial({ map: blockTex(), roughness: 0.9 });
    const band = mat('#5f7f8f', { roughness: 0.8 });
    const walls = [[(R.x0 + R.x1) / 2, R.z0, R.x1 - R.x0, 0], [(R.x0 + R.x1) / 2, R.z1, R.x1 - R.x0, Math.PI], [R.x0, (R.z0 + R.z1) / 2, R.z1 - R.z0, Math.PI / 2], [R.x1, (R.z0 + R.z1) / 2, R.z1 - R.z0, -Math.PI / 2]];
    for (const [x, z, w, ry] of walls) {
      const m = mesh(new THREE.PlaneGeometry(w, R.h), wall, x, R.h / 2, z, root); m.rotation.y = ry;
      const b = mesh(new THREE.PlaneGeometry(w, 14), band, x + Math.sin(ry) * 0.3, 7, z + Math.cos(ry) * 0.3, root); b.rotation.y = ry;
    }
    // the joists overhead
    const wood = mat('#7a5a3c', { roughness: 0.8 });
    for (let x = R.x0 + 20; x < R.x1; x += 42) mesh(new THREE.BoxGeometry(6, 14, R.z1 - R.z0), wood, x, R.h - 7, (R.z0 + R.z1) / 2, root);
    const ceil = mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), mat('#4a3e34', { roughness: 0.95 }), (R.x0 + R.x1) / 2, R.h, (R.z0 + R.z1) / 2, root); ceil.rotation.x = Math.PI / 2;
    // the window well (north wall, high): a bright pane and a dusty shaft
    const win = mesh(new THREE.PlaneGeometry(90, 34), new THREE.MeshBasicMaterial({ color: '#dfeeff' }), -150, 118, R.z1 - 0.5, root); win.rotation.y = Math.PI;
    mesh(new THREE.BoxGeometry(96, 4, 6), mat('#e8e2d4'), -150, 99, R.z1 - 3, root);
    mesh(new THREE.BoxGeometry(3, 34, 3), mat('#e8e2d4'), -150, 118, R.z1 - 1.5, root);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(30, 70, 200, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#dfe8ff', transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    shaft.position.set(-170, 60, 110); shaft.rotation.set(0.5, 0, 0.35); shaft.userData.noShadow = true; root.add(shaft);
    this.glow('#dfeeff', 120, -150, 118, R.z1 - 4, 0.45);
    // the bare bulb: a cord, a socket, the glowing glass
    mesh(new THREE.CylinderGeometry(0.3, 0.3, R.h - 116, 6), mat('#222'), -20, (R.h + 116) / 2, 0, root);
    mesh(new THREE.CylinderGeometry(1.6, 1.6, 4, 12), mat('#3a3a3a', { metalness: 0.5 }), -20, 116, 0, root);
    mesh(new THREE.SphereGeometry(3.2, 16, 12), new THREE.MeshBasicMaterial({ color: '#fff3c8' }), -20, 111, 0, root);
    this.bulbGlow = this.glow('#ffc87a', 70, -20, 111, 0, 0.9);
    // the fluorescent tube
    mesh(new THREE.BoxGeometry(120, 3, 8), mat('#dcdcd6'), 0, 99, -130, root);
    this.tubeMesh = mesh(new THREE.BoxGeometry(112, 1.6, 3), new THREE.MeshBasicMaterial({ color: '#f2f8ff' }), 0, 97, -130, root);
    this.tubeGlow = this.glow('#cfe6ff', 90, 0, 96, -130, 0.5);
    // pipes along the east wall to the water heater, and the heater
    const copper = mat('#b8733f', { roughness: 0.35, metalness: 0.7 });
    for (const [y, z0, z1] of [[60, -180, 150], [66, -180, 150]]) { const p = mesh(new THREE.CylinderGeometry(1.4, 1.4, z1 - z0, 10), copper, R.x1 - 6, y, (z0 + z1) / 2, root); p.rotation.x = Math.PI / 2; }
    const heater = mesh(new THREE.CylinderGeometry(22, 22, 92, 28), mat('#d9d7cf', { roughness: 0.4, metalness: 0.2 }), 255, 46, 10, root); heater.userData.cast = true;
    mesh(new THREE.CylinderGeometry(22.5, 22.5, 3, 28), mat('#a6a39b', { metalness: 0.4 }), 255, 92, 10, root);
    mesh(new THREE.CylinderGeometry(4, 4, 60, 12), mat('#9a9a9a', { metalness: 0.6 }), 255, 122, 10, root);
    mesh(new THREE.BoxGeometry(2, 8, 10), mat('#2b2b2b'), 232.5, 12, 10, root);
    this.glow('#5aa8ff', 18, 232, 8, 10, 0.8);
  }

  /* the folding table and its conveyor of folded towels */
  _conveyor() {
    const T = this.T, N = T.N, root = this.root;
    const ks = []; for (let k = 0; k < N; k++) if (this.tagAt(k) === 'belt') ks.push(k);
    if (!ks.length) return;
    // the belt surface: a ribbon over the belt samples, its texture scrolling with the belt
    this.beltTex = beltTex();
    const beltMat = new THREE.MeshStandardMaterial({ map: this.beltTex, roughness: 0.95, side: THREE.DoubleSide });
    const pos = [], uv = [], idx = [];
    let v = 0;
    ks.forEach((k, i) => {
      const w = T.w[k] + T.m[k], rx = rightX(T, k), rz = rightZ(T, k);
      pos.push(T.x[k] - rx * w, T.y[k] + 0.05, T.z[k] - rz * w, T.x[k] + rx * w, T.y[k] + 0.05, T.z[k] + rz * w);
      uv.push(0, v / 40, 1, v / 40); v += T.step;
      if (i) { const a = (i - 1) * 2, b = i * 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const belt = mesh(g, beltMat, 0, 0, 0, root); belt.userData.keep = true; belt.userData.noShadow = true;
    this.beltMesh = belt;
    // the table under it: a long top, rollers at the ends, legs
    const k0 = ks[0], k1 = ks[ks.length - 1];
    const x0 = T.x[k0], x1 = T.x[k1], z = (T.z[k0] + T.z[k1]) / 2, y = T.y[k0], w = (T.w[k0] + T.m[k0]) * 2 + 2;
    const steel = mat('#8f969e', { roughness: 0.35, metalness: 0.75 });
    const top = mesh(rbox(x1 - x0 + 8, 2.4, w, 0.6), mat('#3c3f44', { roughness: 0.6 }), (x0 + x1) / 2, y - 1.3, z, root); top.userData.cast = true;
    for (const xx of [x0 - 3, x1 + 3]) { const r = mesh(new THREE.CylinderGeometry(1.6, 1.6, w, 16), steel, xx, y - 0.6, z, root); r.rotation.x = Math.PI / 2; }
    for (let x = x0; x <= x1 + 1; x += 26) for (const s of [-1, 1]) { const l = mesh(new THREE.BoxGeometry(1.6, y - 2, 1.6), steel, x, (y - 2) / 2, z + s * (w / 2 - 1.5), root); l.userData.cast = true; }
    // a side rail with stacks of folded towels waiting (decor, low)
    const r = srand(8), cols = ['#e86a6a', '#f2d27a', '#7fc8e8', '#a8e0a0', '#f4f1ea', '#c9a4e8'];
    for (let x = x0 + 6; x < x1; x += 15) for (const s of [-1, 1]) {
      if (r() < 0.35) continue;
      let h = y + 1.2;
      const n = 1 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) { const t = mesh(rbox(9, 1.6, 6, 0.6), mat(cols[Math.floor(r() * cols.length)], { roughness: 0.95 }), x + (r() - 0.5) * 2, h + 0.8, z + s * (w / 2 + 4.5), root); t.rotation.y = (r() - 0.5) * 0.2; h += 1.6; }
    }
    // the cardboard ramp up to it (a flattened detergent box)
    const rk = []; for (let k = 0; k < N; k++) if (this.tagAt(k) === 'ramp') rk.push(k);
    if (rk.length) {
      const card = new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g2, W, H) => { g2.fillStyle = '#c9a26a'; g2.fillRect(0, 0, W, H); g2.fillStyle = '#ff6a2a'; g2.fillRect(0, H * 0.25, W, H * 0.3); g2.fillStyle = '#fff'; g2.font = 'bold 44px sans-serif'; g2.fillText('SUDZ', 60, H * 0.47); g2.fillStyle = '#2f6bd8'; g2.beginPath(); g2.arc(W * 0.8, H * 0.75, 26, 0, TAU); g2.fill(); }), roughness: 0.85 });
      const ext = [rk[0] - 2, ...rk, rk[rk.length - 1] + 2].map((k) => (k + N) % N);
      this.ribbon(ext, card, 1.4);
    }
  }

  /* the bank of washers and dryers: along the north wall behind the table,
     and the island the bulge goes round (the shortcut's gap through it) */
  _machines() {
    const root = this.root, C = this.T.cut;
    const white = mat('#eeeee8', { roughness: 0.35, metalness: 0.05 });
    const grey = mat('#c8c9c6', { roughness: 0.4 });
    const glass = mat('#2a3550', { roughness: 0.1, metalness: 0.3, emissive: '#101828', emissiveIntensity: 0.6 });
    const chrome = mat('#cfd3d8', { roughness: 0.2, metalness: 0.9 });
    const knob = mat('#3a3a40', { roughness: 0.5 });
    // vintage pastels: cream, mint, avocado, powder blue, butter
    const shells = [white, mat('#bfe8d4', { roughness: 0.35 }), mat('#c8cf8a', { roughness: 0.35 }), mat('#b8d4ee', { roughness: 0.35 }), mat('#f2e2a4', { roughness: 0.35 })];
    let nM = 0;
    const machine = (x, z, ry, front = true, kind = 0) => {
      const g = new THREE.Group();
      const body = mesh(rbox(28, 38, 30, 2.2), shells[nM++ % shells.length], 0, 19, 0, g); body.userData.cast = true;
      mesh(rbox(28.2, 6, 4, 1), grey, 0, 35, -13.5, g);
      if (front) {
        const ring = mesh(new THREE.TorusGeometry(8.4, 1.4, 10, 28), chrome, 0, 17, 15.2, g); void ring;
        mesh(new THREE.CircleGeometry(7.4, 28), kind ? glass : mat('#384a6a', { roughness: 0.1, metalness: 0.3 }), 0, 17, 15.3, g);
        for (let i = 0; i < 3; i++) { const k = mesh(new THREE.CylinderGeometry(1.2, 1.2, 1, 12), knob, -8 + i * 6, 34.5, 13.5, g); k.rotation.x = Math.PI / 2; }
        mesh(new THREE.BoxGeometry(6, 2.4, 0.5), mat('#1e2a24', { emissive: '#3fdc7a', emissiveIntensity: 0.7 }), 8, 34.5, 13.6, g);
      }
      g.position.set(x, 0, z); g.rotation.y = ry;
      root.add(g);
      return g;
    };
    // along the north wall, behind the folding table
    for (let x = -60; x <= 200; x += 30) machine(x, ROOM.z1 - 17, Math.PI, true, (x / 30) % 2);
    // the island: two rows facing out, with the gap (the shortcut) between them
    if (C) {
      const N2 = new THREE.Vector3(-C.uz, 0, C.ux);       // the corridor's left
      const span = C.m1 - C.m0;
      for (let s = C.m0 + 4; s < C.m1 - 4; s += 29.5) {
        const inDrum = s > C.d0 - 16 && s < C.d1 + 16;
        for (const side of [-1, 1]) {
          if (inDrum && side === 1) continue;
          const off = (C.w + 15.5) * side, x = C.ax + C.ux * (s + 14) + N2.x * off, z = C.az + C.uz * (s + 14) + N2.z * off;
          if (inDrum) continue;
          machine(x, z, Math.atan2(N2.x * side, N2.z * side), true, (s | 0) % 2);
        }
      }
      void span;
      // the gap's floor: worn linoleum, the drum's cradle
      const lino = mat('#6a8f7a', { roughness: 0.6 });
      const L = C.m1 - C.m0 + 20, cx = C.ax + C.ux * (C.m0 + C.m1) / 2, cz = C.az + C.uz * (C.m0 + C.m1) / 2;
      const gf = mesh(new THREE.PlaneGeometry(C.w * 2 + 1, L), lino, cx, 0.06, cz, root); gf.rotation.set(-Math.PI / 2, 0, Math.atan2(C.ux, C.uz), 'YXZ');
      gf.rotation.order = 'YXZ'; gf.rotation.y = Math.atan2(C.ux, C.uz); gf.rotation.x = -Math.PI / 2;
      // walls of stacked boxes on the outer side, where the machines leave holes
      const box = mat('#b28a56', { roughness: 0.9 });
      for (let s = C.m0; s < C.m1; s += 12) {
        const inDrum = s > C.d0 - 6 && s < C.d1 + 6;
        if (inDrum) continue;
        for (const side of [-1, 1]) {
          const off = (C.w + 1.6) * side, x = C.ax + C.ux * (s + 6) + N2.x * off, z = C.az + C.uz * (s + 6) + N2.z * off;
          const b = mesh(rbox(12, 7 + ((s | 0) % 3) * 2, 2.6, 0.3), box, x, 3.5 + ((s | 0) % 3), z, root); b.rotation.y = Math.atan2(C.ux, C.uz) + Math.PI / 2;
        }
      }
    }
  }

  /* the dryer drum, out of its cabinet, lying along the gap: perforated
     steel, three paddles inside, turning slowly; a glowing "DRY" sign */
  _dryer() {
    const C = this.T.cut;
    if (!C) return;
    const len = C.d1 - C.d0, R = C.w + 1.6;
    const cx = C.ax + C.ux * (C.d0 + C.d1) / 2, cz = C.az + C.uz * (C.d0 + C.d1) / 2;
    const g = new THREE.Group();
    g.position.set(cx, R - 0.6, cz);
    g.rotation.y = Math.atan2(C.ux, C.uz);
    const steel = new THREE.MeshStandardMaterial({ map: perfTex(), roughness: 0.35, metalness: 0.75, side: THREE.DoubleSide });
    const spin = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(R, R, len, 40, 1, true), steel);
    drum.rotation.x = Math.PI / 2; spin.add(drum);
    for (let i = 0; i < 3; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, len - 2), mat('#9aa0a8', { metalness: 0.7, roughness: 0.3 })); const a = (i / 3) * TAU; p.position.set(Math.cos(a) * (R - 0.6), Math.sin(a) * (R - 0.6), 0); p.rotation.z = a; spin.add(p); }
    for (const e of [-1, 1]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.9, 10, 40), mat('#e8e8e2', { roughness: 0.3, metalness: 0.4 })); rim.position.z = (e * len) / 2; spin.add(rim); }
    g.add(spin);
    // the cradle and a sign
    for (const e of [-0.3, 0.3]) { const c = mesh(new THREE.BoxGeometry(R * 2 + 4, 1.4, 3), mat('#5a5e66', { metalness: 0.6 }), 0, -R + 0.2, e * len, g); void c; }
    this.add(g);
    g.userData.keep = true;
    this.drumSpin = spin;
    const sign = mesh(new THREE.PlaneGeometry(14, 5), new THREE.MeshBasicMaterial({ map: canvasTex(256, 96, (q, W, H) => { q.fillStyle = '#16121e'; q.fillRect(0, 0, W, H); q.strokeStyle = '#ff3b6b'; q.lineWidth = 8; q.strokeRect(6, 6, W - 12, H - 12); q.fillStyle = '#ffd84a'; q.font = 'bold 54px sans-serif'; q.fillText('TUMBLE', 26, 68); }) }), C.ax + C.ux * (C.d0 - 3), R * 2 + 3, C.az + C.uz * (C.d0 - 3), this.root);
    sign.rotation.y = Math.atan2(C.ux, C.uz) + Math.PI;
    this.glow('#ff3b6b', 26, C.ax + C.ux * (C.d0 - 3), R * 2 + 3, C.az + C.uz * (C.d0 - 3), 0.35);
  }

  _clutter() {
    const root = this.root, r = srand(21), T = this.T;
    // detergent jugs (the posts)
    for (const P of T.def.posts) {
      if (P.kind !== 'bottle') continue;
      const jug = mesh(rbox(P.r * 2, 7, P.r * 2.2, 1), mat('#2f6bd8', { roughness: 0.35 }), P.x, 3.5, P.z, root); jug.userData.cast = true;
      mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 10), mat('#f2c14e'), P.x, 7.8, P.z, root);
      mesh(new THREE.PlaneGeometry(P.r * 1.6, 3), mat('#ffffff', { emissive: '#ffffff', emissiveIntensity: 0.1 }), P.x, 4, P.z + P.r * 1.11, root);
    }
    // laundry baskets in the infield, a drying rack, a stray sock or two
    const basket = mat('#e8e0f0', { roughness: 0.6 });
    for (const [x, z, c] of [[-60, 10, '#7fd8c8'], [40, -10, '#f59ac0'], [-180, -100, '#f2d27a']]) {
      const b = mesh(new THREE.CylinderGeometry(13, 11, 12, 20, 1, true), mat(c, { roughness: 0.6, side: THREE.DoubleSide }), x, 6, z, root); b.userData.cast = true;
      mesh(new THREE.CylinderGeometry(11, 11, 0.6, 20), basket, x, 0.3, z, root);
      for (let i = 0; i < 6; i++) { const t = mesh(rbox(9, 2, 6, 0.8), mat(SOCKS[Math.floor(r() * SOCKS.length)], { roughness: 0.95 }), x + (r() - 0.5) * 10, 8 + i * 0.9, z + (r() - 0.5) * 10, root); t.rotation.set((r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6); }
    }
    // the clothesline over the infield with socks and a shirt pegged on
    const line = new THREE.CatmullRomCurve3([new THREE.Vector3(-250, 100, -60), new THREE.Vector3(-20, 84, -40), new THREE.Vector3(230, 100, -20)]);
    mesh(new THREE.TubeGeometry(line, 40, 0.35, 6), mat('#e8e2d4'), 0, 0, 0, root);
    for (let i = 1; i < 14; i++) {
      const p = line.getPoint(i / 14), c = SOCKS[i % SOCKS.length];
      const s = mesh(rbox(3, 12, 1.2, 0.8), mat(c, { roughness: 0.95 }), p.x, p.y - 6, p.z, root);
      mesh(rbox(5, 3, 1.2, 0.8), mat(c, { roughness: 0.95 }), p.x + 1.4, p.y - 11.5, p.z, root);
      s.rotation.z = (r() - 0.5) * 0.2;
      mesh(new THREE.BoxGeometry(0.8, 3, 1.6), mat('#c9a26a'), p.x, p.y, p.z, root);
    }
    // a shelf of supplies on the west wall
    mesh(new THREE.BoxGeometry(4, 2, 80), mat('#7a5a3c'), ROOM.x0 + 4, 70, -20, root);
    for (let i = 0; i < 6; i++) { const b = mesh(rbox(5, 10 + r() * 6, 7, 0.8), mat(['#ff6a2a', '#2f6bd8', '#3ab795', '#f2c14e'][i % 4], { roughness: 0.5 }), ROOM.x0 + 5, 76 + r() * 2, -50 + i * 12, root); b.userData.cast = true; }
    // the suds by the drain: foam blobs (cosmetic)
    const foam = mat('#f4f8ff', { roughness: 0.9 });
    for (const P of T.def.patches) {
      if (P.kind !== 'suds') continue;
      for (let i = 0; i < 16; i++) { const a = r() * TAU, d = r() * P.r; const s = mesh(new THREE.SphereGeometry(0.6 + r() * 1.3, 10, 8), foam, P.x + Math.cos(a) * d, 0.2, P.z + Math.sin(a) * d, root); s.scale.y = 0.5; }
      const wet = mesh(new THREE.CircleGeometry(P.r + 1, 28), mat('#5b6670', { roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.6 }), P.x, 0.04, P.z, root); wet.rotation.x = -Math.PI / 2; wet.userData.noShadow = true;
    }
    // the fluff patch: a lint drift
    for (const P of T.def.patches) {
      if (P.kind !== 'fluff') continue;
      for (let i = 0; i < 10; i++) { const a = r() * TAU, d = r() * P.r; const s = mesh(new THREE.SphereGeometry(1.2 + r() * 1.4, 10, 8), mat('#b8b4c8', { roughness: 1 }), P.x + Math.cos(a) * d, 0.3, P.z + Math.sin(a) * d, root); s.scale.y = 0.45; }
    }
    // the sock piles
    this.pileMeshes = [];
    (T.def.piles || []).forEach((P) => {
      const g = new THREE.Group(); g.position.set(P.x, 0, P.z);
      for (let i = 0; i < 9; i++) { const s = mesh(new THREE.CapsuleGeometry(0.7, 3.2, 4, 8), mat(SOCKS[Math.floor(r() * SOCKS.length)], { roughness: 0.95 }), (r() - 0.5) * P.r * 1.2, 0.7 + (i % 3) * 0.7, (r() - 0.5) * P.r * 1.2, g); s.rotation.set(Math.PI / 2 + (r() - 0.5), r() * 3, (r() - 0.5)); }
      g.userData.keep = true;
      this.add(g);
      this.pileMeshes.push(g);
    });
  }

  /* the detergent pods: three squishy capsules, rolled by the sim */
  _movers() {
    const T = this.T;
    this.podMeshes = T.pods.map((P, i) => {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.SphereGeometry(P.r, 20, 14), new THREE.MeshStandardMaterial({ map: podTex(['#2f6bd8', '#3ab795', '#9b5cff'][i % 3], ['#7fd8ff', '#f2f27a', '#ff8cc6'][i % 3]), roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.94 }));
      m.scale.set(1.15, 0.85, 1); m.castShadow = true;
      g.add(m); g.userData.keep = true; g.userData.ball = m;
      const p = podPos(T, P, 0); g.position.set(p.x, P.r * 0.85, p.z);
      this.add(g);
      return g;
    });
  }

  tagAt(k) { return this.T.def.points[this.T.sec[k]].tag; }
  ribbon(ks, material, thick) {
    const T = this.T, pos = [], idx = [];
    ks.forEach((k, i) => {
      const w = T.w[k] + T.m[k], rx = rightX(T, k), rz = rightZ(T, k), y = T.y[k];
      for (const [s, dy] of [[-1, 0], [1, 0], [-1, -thick], [1, -thick]]) pos.push(T.x[k] + rx * w * s, y + dy, T.z[k] + rz * w * s);
      if (i) { const a = (i - 1) * 4, b = i * 4; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2, a, a + 2, b, a + 2, b + 2, b, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = mesh(g, material, 0, 0, 0, this.root); m.userData.cast = true;
    return m;
  }

  update(dt, t) {
    super.update(dt, t);
    // the belt runs, the drum turns, the tube flickers now and then
    if (this.beltTex) this.beltTex.offset.y = -((t * 9) / 40) % 1;
    if (this.drumSpin) this.drumSpin.rotation.z = t * 0.9;
    const fl = Math.sin(t * 0.7) > 0.985 ? (Math.random() < 0.5 ? 0.2 : 1) : 1;
    if (this.tube) this.tube.intensity = 2600 * fl;
    if (this.tubeGlow) this.tubeGlow.material.opacity = 0.5 * fl;
    if (this.bulbGlow) this.bulbGlow.material.opacity = 0.85 + Math.sin(t * 13) * 0.03;
    if (!this.raceOn) for (let i = 0; i < this.podMeshes.length; i++) { const P = this.T.pods[i], p = podPos(this.T, P, t * 60); this._pod(i, p); }
  }
  _pod(i, p) {
    const g = this.podMeshes[i], P = this.T.pods[i];
    const dx = p.x - g.position.x, dz = p.z - g.position.z, d = Math.hypot(dx, dz);
    g.position.set(p.x, p.y + P.r * 0.85, p.z);
    if (d > 0.001) { g.rotation.y = Math.atan2(dx, dz); g.userData.ball.rotation.x += d / P.r; }
  }
  /* each frame of a race: the pods where the sim has them */
  race(R) {
    this.raceOn = true;
    R.pods.forEach((p, i) => this._pod(i, p));
    for (let i = 0; i < R.piles.length; i++) { const g = this.pileMeshes[i]; if (g) { const k = R.piles[i].kicked / 30; g.scale.set(1 + k * 0.3, Math.max(0.35, 1 - k * 0.8), 1 + k * 0.3); } }
  }
  reset() { this.raceOn = false; }
  onEvent(e, app, near, g) {
    const R = app.race, K = e.i != null ? R.karts[e.i] : null, A = app.audio;
    if (e.k === 'pile') { app.fx.burst(e.x, 1.5, e.z, SOCKS, 14, 6); if (near) A.play('feather-burst', { gain: g(0.6), rate: 0.7 }); }
    else if (e.k === 'drum') { if (near) A.play('whoosh-light', { gain: g(0.8), rate: 0.6 }); app.rviews[e.i].drumIn = true; const H = app.hvOf(e.i); if (H) app.toast(H, 'TUMBLE DRY!', '#ffd84a'); }
    else if (e.k === 'drumOut') { if (near) A.play('dh-boost', { gain: g(0.9) }); app.fx.sparks(K.x, K.y + 1, K.z, '#ffd84a', 14, 7, 1, 0.5); }
  }
}
