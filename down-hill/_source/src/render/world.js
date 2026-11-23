/* The Landing: a kid's bedroom and the upstairs landing at night, at plush
   scale, built around the track's spline (race/track.js) so every ramp,
   rail and drawer is exactly where the karts drive.

   Light: moonlight through the west window (cool, the one shadow-casting
   light, its map drawn once — the furniture never moves), the bedside
   lamp's warm pool, a night-light's glow by the skirting, the landing's
   sconce, and a deep blue hemisphere fill. Glows are additive sprites;
   the moonbeam is a soft additive shaft. Under the bed, the camera's
   exposure drops (render/camera.js): it's dark down there.

   World units: the track's (a plush racer stands ~2.5 tall). The bedroom
   is x −144…126, z −112…112; the landing x 126…414.                    */

import * as THREE from 'three/webgpu';
import { rbox, pillowGeo, mat, glowMat, mesh, canvasTex, srand, mergeStatic } from './geo.js';
import { addProps } from './props.js';
import { along, groundAt, lateral, locate, rightX, rightZ } from '../race/track.js';
import { buildReadable } from './readable.js';
import { dressLanding } from './landing-lookdev.js';

const TAU = Math.PI * 2;
const landingLookdev = typeof LOOKDEV_RACE !== 'undefined' && LOOKDEV_RACE;
export const BED = { x0: -66, x1: 34, z0: -112, z1: 14, top: 20, under: 10.75 };
export const ROOM = { x0: -144, x1: 126, z0: -112, z1: 112, h: 130 };
export const HALL = { x0: 126, x1: 414, z0: -112, z1: 112 };
export const STAIRS = { x0: 205, x1: 340, z0: -4, z1: 86 };   // the stairwell opening on the landing

export function keepCameraAboveRoad(T, want, hint) {
  const k = locate(T, want.x, want.z, hint, 40);
  const tag = T.def.points[T.sec[k]].tag;
  const d = lateral(T, k, want.x, want.z);
  if (Math.abs(d) <= T.w[k] + T.m[k] + 3) {
    const road = groundAt(T, k, d, along(T, k, want.x, want.z));
    want.y = Math.max(want.y, road + 1.3);
  }
  return tag;
}

const DOORS = [[-108, -66], [8, 48]];

/* ── textures ── */
function planksTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const r = srand(7);
    const rows = 8, rh = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * 200;
      while (x < w) {
        const L = 180 + r() * 220, l = 0.42 + r() * 0.12;
        g.fillStyle = `hsl(${24 + r() * 8},${38 + r() * 12}%,${l * 52}%)`;
        g.fillRect(x, i * rh, L, rh);
        g.globalAlpha = 0.12;
        for (let k = 0; k < 7; k++) { g.fillStyle = r() < 0.5 ? '#2a160b' : '#c98f5c'; g.fillRect(x, i * rh + r() * rh, L, 1 + r() * 2); }
        g.globalAlpha = 1;
        g.fillStyle = '#1c0f08'; g.fillRect(x, i * rh, 2, rh);
        x += L;
      }
      g.fillStyle = '#1c0f08'; g.fillRect(0, i * rh, w, 2);
    }
  }, { repeat: [14, 14] });
}
function carpetTex(c1, c2) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = srand(3);
    g.fillStyle = c1; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { g.fillStyle = r() < 0.5 ? c2 : 'rgba(255,255,255,0.05)'; g.globalAlpha = 0.25; g.fillRect(r() * w, r() * h, 1.5, 1.5); }
    g.globalAlpha = 1;
  }, { repeat: [40, 30] });
}
function wallpaperTex() {
  return canvasTex(256, 256, (g, w, h) => {
    const base = landingLookdev ? '#174ab6' : '#3a3566';
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.fillStyle = landingLookdev ? '#205dcc' : '#433d74';
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 14, h);
    // little stars and moons
    g.fillStyle = landingLookdev ? '#ffcb35' : '#f3d98b';
    const star = (x, y, s) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, rr = i % 2 ? s * 0.45 : s; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.fill(); };
    star(40, 50, 9); star(170, 120, 7); star(90, 200, 8); star(220, 30, 5);
    g.beginPath(); g.arc(200, 210, 12, 0, TAU); g.fill(); g.fillStyle = base; g.beginPath(); g.arc(206, 205, 11, 0, TAU); g.fill();
  }, { repeat: [12, 5] });
}
function hallPaperTex() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5c3b4a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#6e4858'; g.lineWidth = 3;
    for (let y = 0; y < h; y += 64) for (let x = 0; x < w; x += 64) { g.beginPath(); g.moveTo(x + 32, y + 8); g.lineTo(x + 56, y + 32); g.lineTo(x + 32, y + 56); g.lineTo(x + 8, y + 32); g.closePath(); g.stroke(); }
  }, { repeat: [14, 5] });
}
function quiltTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const cols = landingLookdev ? ['#125be0', '#ffc01a', '#ef3434', '#079f66']
      : ['#2f4a8a', '#3a5aa0', '#27407a', '#33509a'];
    const n = landingLookdev ? 6 : 8, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      g.fillStyle = cols[(i + j * 3) % 4]; g.fillRect(i * s, j * s, s, s);
      if (landingLookdev) {
        const x = i * s, y = j * s;
        // Offset warp and weft, with binding at each patch seam.
        g.fillStyle = 'rgba(255,245,222,0.09)';
        for (let v = 2; v < s; v += 4) g.fillRect(x + v, y, 1, s);
        g.fillStyle = 'rgba(19,42,65,0.10)';
        for (let v = 2; v < s; v += 3) g.fillRect(x, y + v, s, 1);
        g.strokeStyle = 'rgba(24,50,68,0.38)';
        g.lineWidth = 2;
        g.strokeRect(x + 1, y + 1, s - 2, s - 2);
        g.fillStyle = 'rgba(255,245,222,0.19)';
        g.beginPath();
        if ((i + j) % 2) {
          g.moveTo(x, y);
          g.lineTo(x + s, y);
          g.lineTo(x, y + s);
        } else {
          g.moveTo(x + s, y + s);
          g.lineTo(x + s, y);
          g.lineTo(x, y + s);
        }
        g.fill();
        continue;
      }
      // a stitched star or moon in each square
      g.fillStyle = (i + j) % 3 ? '#f2d98a' : '#e9eef9';
      g.globalAlpha = 0.8;
      if ((i * 7 + j) % 2) { g.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - Math.PI / 2, rr = k % 2 ? s * 0.12 : s * 0.26; g.lineTo(i * s + s / 2 + Math.cos(a) * rr, j * s + s / 2 + Math.sin(a) * rr); } g.fill(); }
      else { g.beginPath(); g.arc(i * s + s / 2, j * s + s / 2, s * 0.22, 0, TAU); g.fill(); g.fillStyle = cols[(i + j * 3) % 4]; g.beginPath(); g.arc(i * s + s / 2 + s * 0.09, j * s + s / 2 - s * 0.06, s * 0.2, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      g.setLineDash([6, 6]); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
      g.strokeRect(i * s + 4, j * s + 4, s - 8, s - 8); g.setLineDash([]);
    }
  }, { repeat: landingLookdev ? [1, 1] : [3, 4] });
}
function rugTex() {
  return canvasTex(512, 512, (g, w, h) => {
    const cx = w / 2, cy = h / 2;
    const rings = landingLookdev ? ['#123e97', '#ffb814', '#08774e', '#08774e', '#08774e', '#08774e', '#08774e', '#08774e', '#08774e']
      : ['#e86f7d', '#f4c06a', '#6fd3b8', '#7e72d8', '#f4efe6', '#e86f7d', '#f4c06a', '#6fd3b8', '#7e72d8'];
    for (let i = 0; i < rings.length; i++) { g.fillStyle = rings[i]; g.beginPath(); g.arc(cx, cy, w / 2 - i * 26, 0, TAU); g.fill(); }
    if (landingLookdev) {
      g.save();
      g.beginPath(); g.arc(cx, cy, 203, 0, TAU); g.clip();
      g.fillStyle = 'rgba(135,255,94,0.26)';
      for (let x = -h; x < w; x += 37) {
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 7, 0);
        g.lineTo(x + h + 7, h); g.lineTo(x + h, h); g.fill();
      }
      g.restore();
      // Herringbone stitches follow the rug's binding, painted into the existing texture.
      for (const radius of [244, 224, 190, 112]) {
        const count = Math.round(radius * 0.85);
        g.strokeStyle = radius > 220 ? 'rgba(244,225,177,0.55)' : 'rgba(37,61,68,0.32)';
        g.lineWidth = 1.6;
        g.beginPath();
        for (let i = 0; i < count; i++) {
          const a = i * TAU / count;
          const inner = radius - 4;
          g.moveTo(cx + inner * Math.cos(a - 0.015), cy + inner * Math.sin(a - 0.015));
          g.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
        }
        g.stroke();
      }
    }
    const r = srand(11);
    for (let i = 0; i < 9000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'; g.fillRect(r() * w, r() * h, 2, 2); }
  });
}
function glowTex() {
  return canvasTex(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}
function spineTex() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 8, w, 4); g.fillRect(0, h - 12, w, 4);
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(w * 0.3, h * 0.35, w * 0.4, h * 0.3);
  });
}

export class World {
  constructor(scene, T, { roomProps = true } = {}) {
    this.scene = scene; this.T = T;
    const root = (this.root = new THREE.Group());
    scene.add(root);
    this.glowTex = glowTex();
    this.anim = [];
    this.noDash = new Set(['books']);
    this.runnerTags = new Set(['rug', 'landing', 'door', 'underbed']);
    this.build();
    if (roomProps) this.props = addProps(this);
    root.traverse((o) => { if (o.isMesh && !o.userData.noShadow) { o.receiveShadow = true; o.castShadow = !!o.userData.cast; } });
    this.merged = mergeStatic(root, { keep: (o) => o === this.startLine || this.padMeshes.has(o) });
    this.moon.shadow.needsUpdate = true;
  }

  /* the places the app frames: the podium, the select turntable, the title diorama */
  get info() {
    return {
      podium: [[-84, 6, 52], [-92, 4, 50], [-76, 3, 50]], podLook: [-84, 7.2, 51], podCam: { c: [-84, 52], r: 17, y: 10 },
      turn: [-84, 0.2, 52], title: { c: [135, -20], r: 300, y: 400, look: [130, 0, 10] }, bounds: [-141, 411, -109, 109],
    };
  }
  /* the chase camera's wish, kept out of the furniture: under the bed it stays under the slats */
  camFix(want, pose, hint) {
    const tag = keepCameraAboveRoad(this.T, want, hint);

    // Pull the camera back through a doorway only while the sightline fits.
    const wall = ROOM.x1;
    const dx = want.x - pose.x;
    if ((want.x - wall) * (pose.x - wall) < 0) {
      const t = (wall - pose.x) / dx;
      const z = pose.z + (want.z - pose.z) * t;
      const y = pose.y + 2 + (want.y - pose.y - 2) * t;
      const fits = y < 67 && DOORS.some(([low, high]) => z > low + 3 && z < high - 3);
      if (!fits) {
        const safe = Math.max(0, t - 3 / Math.abs(dx));
        want.x = pose.x + dx * safe;
        want.z = pose.z + (want.z - pose.z) * safe;
      }
    }
    const ub = want.x > BED.x0 - 4 && want.x < BED.x1 + 4 && want.z > BED.z0 && want.z < BED.z1 + 4;
    if (pose.y < BED.under && ub && tag !== 'books') want.y = Math.min(want.y, BED.under - 1.4);
    if (pose.y > BED.top - 1 && ub) want.y = Math.max(want.y, BED.top + 2.2);
  }
  /* 0…1: how dark it is here (under the bed) */
  darkAt(pose) { return pose.y < BED.under && pose.x > BED.x0 && pose.x < BED.x1 && pose.z > BED.z0 && pose.z < BED.z1 ? 1 : 0; }
  dispose() { this.root.removeFromParent(); this.lightsG.removeFromParent(); }

  build() {
    this.scene.background = new THREE.Color('#0b0a1a');
    this._lights();
    this._rooms();
    this._bed();
    this._furniture();
    this._landing();
    this._trackParts();
    this._guides();
    if (landingLookdev) dressLanding(this);
    this.readable = buildReadable(this, { railCols: landingLookdev ? ['#e5242e', '#fff9e8'] : undefined, arrowTags: new Set(['door', 'drawer', 'pillows', 'underbed', 'landing', 'books']) });
  }

  add(o) { this.root.add(o); return o; }

  glow(color, size, x, y, z, op = 0.8) {
    const m = new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(m);
    s.scale.set(size, size, 1); s.position.set(x, y, z);
    s.userData.noShadow = true;
    return this.add(s);
  }

  _lights() {
    const S = (this.lightsG = new THREE.Group());
    this.scene.add(S);
    this.hemi = landingLookdev ? new THREE.HemisphereLight('#c3d9f0', '#9c7e63', 1.32)
      : new THREE.HemisphereLight('#5d63b8', '#2a1c22', 1.25);
    S.add(this.hemi);
    // the moon through the west window: low and cool, casting the furniture's shadows (once)
    const moon = (this.moon = new THREE.DirectionalLight(landingLookdev ? '#dceaff' : '#a9bcff', landingLookdev ? 2.35 : 2.1));
    moon.position.set(-420, 300, 60);
    moon.target.position.set(80, 0, 0);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    const c = moon.shadow.camera;
    c.left = -300; c.right = 300; c.top = 200; c.bottom = -200; c.near = 50; c.far = 1100;
    moon.shadow.bias = -0.0008; moon.shadow.normalBias = 0.6;
    moon.shadow.autoUpdate = false;
    S.add(moon, moon.target);
    // the bedside lamp
    this.lamp = new THREE.PointLight('#ffb066', 2600, 260, 1.6);
    this.lamp.position.set(58, 52, -98);
    S.add(this.lamp);
    // the night-light by the skirting (a little moon, mint)
    this.night = new THREE.PointLight(landingLookdev ? '#b8d6db' : '#8ff0d0', 700, 90, 1.7);
    this.night.position.set(-120, 10, 96);
    S.add(this.night);
    // the landing's sconce, warm
    this.sconce = new THREE.PointLight('#ffc98a', 2400, 230, 1.5);
    this.sconce.position.set(270, 80, -106);
    S.add(this.sconce);
    // a cool fill down the stairwell's window
    this.stairLight = new THREE.PointLight('#8fa6ff', 1200, 220, 1.6);
    this.stairLight.position.set(390, 70, 60);
    S.add(this.stairLight);
  }

  _rooms() {
    const R = ROOM, H = HALL;
    const floor = new THREE.MeshStandardMaterial({ map: planksTex(), roughness: 0.62, color: landingLookdev ? '#e2bd91' : '#b89a86' });
    const f = mesh(new THREE.PlaneGeometry(R.x1 - R.x0, R.z1 - R.z0), floor, (R.x0 + R.x1) / 2, 0, 0, this.root);
    f.rotation.x = -Math.PI / 2;
    // the landing's runner carpet: the floor round the stairwell hole
    const carpet = new THREE.MeshStandardMaterial({ map: carpetTex(landingLookdev ? '#512288' : '#6b3242', landingLookdev ? '#331453' : '#4a1f2c'), roughness: 0.95 });
    const S = STAIRS;
    const pieces = [[H.x0, H.x1, H.z0, S.z0], [H.x0, H.x1, S.z1, H.z1], [H.x0, S.x0, S.z0, S.z1], [S.x1, H.x1, S.z0, S.z1]];
    for (const [x0, x1, z0, z1] of pieces) { const p = mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), carpet, (x0 + x1) / 2, 0, (z0 + z1) / 2, this.root); p.rotation.x = -Math.PI / 2; }
    // the stairwell: a drop to the hall below, the stairs going down into the dark
    const well = mat('#2b1d26', { roughness: 0.9 });
    const depth = 90;
    for (const [x, z, w, d, ry] of [[(S.x0 + S.x1) / 2, S.z0, S.x1 - S.x0, 0, 0], [(S.x0 + S.x1) / 2, S.z1, S.x1 - S.x0, 0, Math.PI], [S.x0, (S.z0 + S.z1) / 2, S.z1 - S.z0, 0, Math.PI / 2], [S.x1, (S.z0 + S.z1) / 2, S.z1 - S.z0, 0, -Math.PI / 2]]) {
      const wl = mesh(new THREE.PlaneGeometry(w, depth), well, x, -depth / 2, z, this.root); wl.rotation.y = ry;
    }
    const steps = mat('#7a4b33', { roughness: 0.7 });
    for (let i = 0; i < 10; i++) mesh(new THREE.BoxGeometry(34, 6, 8.5), steps, S.x1 - 22, -6 - i * 6, S.z0 + 6 + i * 8.5, this.root);
    const pit = mesh(new THREE.PlaneGeometry(S.x1 - S.x0, S.z1 - S.z0), mat('#120b12'), (S.x0 + S.x1) / 2, -depth, (S.z0 + S.z1) / 2, this.root);
    pit.rotation.x = -Math.PI / 2;

    // walls: wallpaper over a skirting board
    const paper = new THREE.MeshStandardMaterial({ map: wallpaperTex(), roughness: 0.85 });
    const hpaper = new THREE.MeshStandardMaterial({ map: hallPaperTex(), roughness: 0.85 });
    const skirt = mat('#efe8dc', { roughness: 0.5 });
    const wall = (x0, z0, x1, z1, m, y0 = 0, y1 = R.h) => {
      const L = Math.hypot(x1 - x0, z1 - z0), w = mesh(new THREE.PlaneGeometry(L, y1 - y0), m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, this.root);
      w.rotation.y = Math.atan2(-(z1 - z0), x1 - x0);
      if (y0 === 0) {
        const s = mesh(new THREE.BoxGeometry(L, 5, 1.2), skirt, (x0 + x1) / 2, 2.5, (z0 + z1) / 2, this.root);
        s.rotation.y = w.rotation.y;
        s.translateZ(0.6);
      }
      return w;
    };
    // bedroom: north, south, west (a window in it), east (the two doorways)
    wall(R.x0, R.z0, R.x1, R.z0, paper);
    wall(R.x1, R.z1, R.x0, R.z1, paper);
    const wz0 = -14, wz1 = 58, wy0 = 28, wy1 = 92;
    wall(R.x0, R.z1, R.x0, wz1, paper); wall(R.x0, wz0, R.x0, R.z0, paper);
    wall(R.x0, wz1, R.x0, wz0, paper, 0, wy0); wall(R.x0, wz1, R.x0, wz0, paper, wy1, R.h);
    // Both faces and the camera use the same doorway clearances.
    const ex = R.x1, dh = 70;
    const [[back0, back1], [out0, out1]] = DOORS;
    for (const [z0, z1] of [[R.z0, back0], [back1, out0], [out1, R.z1]]) {
      wall(ex, z0, ex, z1, paper);
      wall(ex + 0.2, z1, ex + 0.2, z0, hpaper);
    }
    const trim = mat('#f2ece0', { roughness: 0.45 });
    for (const [z0, z1] of DOORS) {
      wall(ex, z0, ex, z1, paper, dh, R.h);
      wall(ex + 0.2, z1, ex + 0.2, z0, hpaper, dh, R.h);
      for (const z of [z0, z1]) mesh(new THREE.BoxGeometry(5, dh, 3), trim, ex, dh / 2, z, this.root);
      mesh(new THREE.BoxGeometry(5, 4, z1 - z0 + 3), trim, ex, dh, (z0 + z1) / 2, this.root);
    }
    // landing walls
    wall(H.x0, H.z0, H.x1, H.z0, hpaper); wall(H.x1, H.z1, H.x0, H.z1, hpaper); wall(H.x1, H.z0, H.x1, H.z1, hpaper);
    // the window: frame, sill, curtains, the night sky and moon outside
    const fx = R.x0;
    const sky = mesh(new THREE.PlaneGeometry(wz1 - wz0 + 30, wy1 - wy0 + 20), new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0e1240'); gr.addColorStop(1, '#2c2a6a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      const r = srand(5); g.fillStyle = '#fff'; for (let i = 0; i < 90; i++) { g.globalAlpha = 0.3 + r() * 0.7; g.fillRect(r() * w, r() * h * 0.8, 1.5, 1.5); }
      g.globalAlpha = 1;
      // rooftops
      g.fillStyle = '#0a0a1e'; g.beginPath(); g.moveTo(0, h); let x = 0; while (x < w) { const hh = h * (0.72 + r() * 0.12); g.lineTo(x, hh); g.lineTo(x + 30, hh - 14); g.lineTo(x + 60, hh); x += 60; } g.lineTo(w, h); g.fill();
      g.fillStyle = '#ffd98a'; for (let i = 0; i < 9; i++) g.fillRect(r() * w, h * (0.82 + r() * 0.12), 4, 5);
    }) }), fx - 12, (wy0 + wy1) / 2, (wz0 + wz1) / 2, this.root);
    sky.rotation.y = Math.PI / 2; sky.userData.noShadow = true;
    const moonDisc = mesh(new THREE.CircleGeometry(7, 32), new THREE.MeshBasicMaterial({ color: '#fff6d8' }), fx - 11, wy1 - 16, wz0 + 18, this.root);
    moonDisc.rotation.y = Math.PI / 2; moonDisc.userData.noShadow = true;
    this.glow('#c9d6ff', 60, fx - 10, wy1 - 16, wz0 + 18, 0.6);
    const fr = mat('#f2ece0', { roughness: 0.4 });
    mesh(new THREE.BoxGeometry(4, 3, wz1 - wz0 + 8), fr, fx + 1, wy0 - 1, (wz0 + wz1) / 2, this.root);
    mesh(new THREE.BoxGeometry(4, 3, wz1 - wz0 + 8), fr, fx + 1, wy1 + 1, (wz0 + wz1) / 2, this.root);
    mesh(new THREE.BoxGeometry(4, wy1 - wy0, 2.5), fr, fx + 1, (wy0 + wy1) / 2, (wz0 + wz1) / 2, this.root);
    mesh(new THREE.BoxGeometry(2.5, 2.5, wz1 - wz0), fr, fx + 1, (wy0 + wy1) / 2, (wz0 + wz1) / 2, this.root);
    mesh(new THREE.BoxGeometry(9, 2.5, wz1 - wz0 + 14), fr, fx + 4, wy0 - 2.5, (wz0 + wz1) / 2, this.root);
    // curtains, gathered at the sides
    const cur = mat(landingLookdev ? '#e62c35' : '#7b3a6a', { roughness: 0.9, side: THREE.DoubleSide });
    for (const z of [wz0 - 9, wz1 + 9]) {
      const g = new THREE.CylinderGeometry(7, 9, wy1 - wy0 + 30, 16, 1, true);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.25 * Math.sin(a * 8); p.setX(i, p.getX(i) * k * 0.45); p.setZ(i, p.getZ(i) * k); }
      g.computeVertexNormals();
      const c = mesh(g, cur, fx + 5, (wy0 + wy1) / 2 + 6, z, this.root); c.userData.cast = true;
    }
    // the moonbeam: a soft additive shaft from the window across the rug
    const beamTex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const g2 = g.createLinearGradient(0, 0, w, 0); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(0.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = g2; g.fillRect(0, 0, w, h); });
    const beamM = new THREE.MeshBasicMaterial({ map: beamTex, color: '#9fb4ff', transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < 3; i++) {
      const b = mesh(new THREE.PlaneGeometry(70 - i * 12, 190), beamM, fx + 70, 36, (wz0 + wz1) / 2 + (i - 1) * 6, this.root);
      b.rotation.set(0, Math.PI / 2 + (i - 1) * 0.4, -1.08); b.userData.noShadow = true;
    }
    // the moon's pool on the floor (the window's shape, soft)
    const pool = mesh(new THREE.PlaneGeometry(90, 70), new THREE.MeshBasicMaterial({ map: this.glowTex, color: '#7d8fd8', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), -70, 0.25, 22, this.root);
    pool.rotation.x = -Math.PI / 2; pool.userData.noShadow = true;
    // the rug
    const rug = mesh(new THREE.CircleGeometry(62, 64), new THREE.MeshStandardMaterial({ map: rugTex(), roughness: 1 }), -84, 0.15, 52, this.root);
    rug.rotation.x = -Math.PI / 2;
  }

  _bed() {
    const B = BED, root = this.root;
    const wood = new THREE.MeshStandardMaterial({ color: landingLookdev ? '#a77546' : '#8a5a3c', roughness: 0.55 });
    const W = B.x1 - B.x0, D = B.z1 - B.z0, cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2;
    // frame and legs
    const frame = mesh(rbox(W + 3, 4, D + 3, 1.2), wood, cx, B.under + 2, cz, root); frame.userData.cast = true;
    for (const [x, z] of [[B.x0, B.z0], [B.x1, B.z0], [B.x0, B.z1], [B.x1, B.z1]]) { const l = mesh(new THREE.CylinderGeometry(2.2, 1.8, B.under, 12), wood, x, B.under / 2, z, root); l.userData.cast = true; }
    // slats underneath (seen from under the bed)
    const slat = mat('#6e452c', { roughness: 0.7 });
    for (let z = B.z0 + 8; z < B.z1; z += 11) mesh(new THREE.BoxGeometry(W - 2, 1, 6), slat, cx, B.under - 0.2, z, root);
    // the mattress and the quilted duvet over it
    const mattress = mesh(rbox(W, 5, D, 2), mat('#f1ece4', { roughness: 0.9 }), cx, B.under + 6.5, cz, root); mattress.userData.cast = true;
    const quilt = new THREE.MeshStandardMaterial({ map: quiltTex(), roughness: 0.95 });
    const dg = new THREE.BoxGeometry(W + 4, 2.4, D - 14, 40, 2, 40);
    const p = dg.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
      // soft puffs between the stitching, and the overhang drooping over the sides
      const puff = (Math.abs(Math.sin(x * 0.2)) * Math.abs(Math.sin(z * 0.2))) * 0.45;
      const ex = Math.max(0, Math.abs(x) - W / 2 + 1);
      p.setY(i, y + (y > 0 ? puff : 0) - ex * 2.6);
    }
    dg.computeVertexNormals();
    const duvet = mesh(dg, quilt, cx, B.top - 1.2, cz + 7, root); duvet.userData.cast = true;
    // a turned-down sheet band at the head, the headboard, two big pillows
    mesh(rbox(W + 3, 2.2, 10, 1), mat('#f6f1e8', { roughness: 0.9 }), cx, B.top - 0.7, B.z0 + 8, root);
    const hb = mesh(rbox(W + 6, 46, 4, 2), wood, cx, 23, B.z0 - 1, root); hb.userData.cast = true;
    for (let i = 0; i < 7; i++) mesh(new THREE.CylinderGeometry(1.2, 1.2, 30, 8), mat('#a3714f'), B.x0 + 10 + i * (W - 20) / 6, 24, B.z0 + 1.5, root);
    const pil = mat('#f6f1f4', { roughness: 0.95 });
    const p1 = mesh(pillowGeo(30, 7, 16), pil, B.x0 + 20, B.top + 3, B.z0 + 9, root); p1.rotation.x = -0.45; p1.userData.cast = true;
    // a teddy left at the foot? no: a little stuffed star cushion by the headboard
    const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU - Math.PI / 2, r = i % 2 ? 3 : 7; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const st = mesh(new THREE.ExtrudeGeometry(star, { depth: 2.5, bevelEnabled: true, bevelSize: 1.2, bevelThickness: 1.2, bevelSegments: 3 }), mat('#f4c84a', { roughness: 0.9 }), B.x0 + 8, B.top + 7, B.z0 + 6, root);
    st.rotation.set(-0.3, 0.3, 0.2);
    // dust bunnies and lost things under the bed
    const fluff = mat('#8d8a96', { roughness: 1 });
    for (const P of this.T.def.posts) if (P.kind === 'bunny') {
      const g = new THREE.IcosahedronGeometry(P.r * 1.3, 2);
      const q = g.attributes.position; const r = srand(P.x * 13);
      for (let i = 0; i < q.count; i++) { const k = 0.8 + r() * 0.45; q.setXYZ(i, q.getX(i) * k, q.getY(i) * k * 0.7, q.getZ(i) * k); }
      g.computeVertexNormals();
      mesh(g, fluff, P.x, P.r * 0.7, P.z, root);
      // two button eyes: they're watching
      for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.28, 8, 6), glowMat('#fff6c0', 0.8), P.x + s * 0.7, P.r * 1.05, P.z + P.r * 0.95, root);
    }
    const r = srand(21);
    for (let i = 0; i < 16; i++) {
      const x = B.x0 + 4 + r() * (W - 8), z = B.z0 + 6 + r() * (D - 12);
      if (Math.abs(z + 46) < 14) continue;
      const g = new THREE.IcosahedronGeometry(1.2 + r() * 1.5, 1);
      mesh(g, fluff, x, 0.8, z, root).scale.y = 0.6;
    }
    // a lost sock and a toy block under there
    mesh(rbox(5, 5, 5, 0.6), mat('#e85d75'), B.x0 + 30, 2.5, B.z0 + 30, root).rotation.y = 0.5;
    const glowStars = glowMat('#cfffb0', 1.6);
    for (let i = 0; i < 12; i++) { const s = mesh(new THREE.CircleGeometry(0.6, 5), glowStars, B.x0 + 6 + r() * (W - 12), B.under - 0.8, B.z0 + 10 + r() * (D - 20), root); s.rotation.x = Math.PI / 2; s.userData.noShadow = true; }
  }

  _furniture() {
    const root = this.root;
    // the nightstand and lamp (east of the bed's head)
    const ns = mat('#9b6a48', { roughness: 0.5 });
    const n = mesh(rbox(26, 30, 22, 1.5), ns, 58, 15, -98, root); n.userData.cast = true;
    mesh(rbox(1.8, 1.8, 1.8, 0.9), mat('#e9c349', { metalness: 0.8, roughness: 0.3 }), 58, 22, -86.6, root);
    mesh(new THREE.CylinderGeometry(5, 6, 2, 20), mat('#e9e2d6', { roughness: 0.4 }), 58, 31, -100, root);
    mesh(new THREE.CylinderGeometry(1, 1, 14, 10), mat('#c9a35a', { metalness: 0.7, roughness: 0.3 }), 58, 38, -100, root);
    const shade = mesh(new THREE.CylinderGeometry(6, 10, 11, 24, 1, true), new THREE.MeshStandardMaterial({ color: '#ffd9a0', emissive: '#ffb066', emissiveIntensity: 1.4, side: THREE.DoubleSide, roughness: 0.8 }), 58, 49, -100, root);
    shade.userData.noShadow = true;
    this.glow('#ffb066', 70, 58, 47, -100, 0.55);
    this.glow('#ff9a4a', 160, 58, 30, -96, 0.18);
    // an alarm clock on the nightstand (the item's cousin) and a glass of water
    const ac = mesh(new THREE.CylinderGeometry(3.2, 3.2, 2.4, 24), mat('#e2463f', { roughness: 0.35 }), 48, 33.2, -92, root); ac.rotation.x = Math.PI / 2;
    mesh(new THREE.CircleGeometry(2.6, 24), glowMat('#fff7e0', 0.5), 48, 33.2, -90.7, root);
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(1.1, 10, 8), mat('#e9c349', { metalness: 0.8, roughness: 0.3 }), 48 + s * 2.2, 36.2, -92, root);
    mesh(new THREE.CylinderGeometry(1.6, 1.4, 5, 16), new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.4, roughness: 0.05 }), 66, 32.5, -94, root);
    // the night-light: a crescent moon plugged into the skirting
    const nl = mesh(new THREE.TorusGeometry(2.4, 1.1, 10, 20, Math.PI * 1.3), glowMat('#b8ffe8', 2.2), -122, 9, 110.5, root);
    nl.rotation.z = 0.8; nl.userData.noShadow = true;
    this.glow('#8ff0d0', 40, -122, 9, 108, 0.7);
    this.glow('#8ff0d0', 110, -122, 4, 100, 0.2);
    // a toy box, blocks, a ball, a rocket poster
    const tb = mesh(rbox(40, 24, 26, 2), mat(landingLookdev ? '#1257dc' : '#4f7fd1', { roughness: 0.6 }), -118, 12, -88, root); tb.userData.cast = true;
    mesh(rbox(42, 3, 28, 1.2), mat(landingLookdev ? '#ffbd15' : '#f4c84a', { roughness: 0.5 }), -118, 25, -88, root);
    const cols = ['#e85d75', '#f4c84a', '#6fd3b8', '#7e72d8'];
    const r = srand(9);
    for (let i = 0; i < 10; i++) {
      const x = -30 + r() * 140, z = 70 + r() * 36;
      const b = mesh(rbox(6, 6, 6, 0.7), mat(cols[i % 4], { roughness: 0.5 }), x, 3, z, root); b.rotation.y = r() * 3; b.userData.cast = true;
    }
    const ball = mesh(new THREE.SphereGeometry(9, 28, 20), mat('#e85d75', { roughness: 0.35 }), 92, 9, 88, root); ball.userData.cast = true;
    mesh(new THREE.TorusGeometry(9.05, 1.2, 8, 40), mat('#f4efe6', { roughness: 0.35 }), 92, 9, 88, root).rotation.y = 0.7;
    // a poster and a pennant on the north wall
    const poster = canvasTex(256, 360, (g, w, h) => {
      g.fillStyle = '#1b1840'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ff3b6b'; g.font = '900 44px "Bolster Display",sans-serif'; g.textAlign = 'center'; g.fillText('PILLOW', w / 2, 70); g.fillStyle = '#3ff0c8'; g.fillText('FIGHT', w / 2, 118);
      g.fillStyle = '#9b5cff'; g.font = '900 120px "Bolster Display",sans-serif'; g.fillText('II', w / 2, 260);
      g.fillStyle = '#f4efe6'; g.font = '700 22px sans-serif'; g.fillText('LIGHTS OUT', w / 2, 320);
    });
    mesh(new THREE.PlaneGeometry(26, 36), new THREE.MeshStandardMaterial({ map: poster, roughness: 0.7 }), -100, 70, -111.5, root);
    const pen = canvasTex(256, 96, (g, w, h) => { g.fillStyle = '#3ff0c8'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h / 2); g.lineTo(0, h); g.fill(); g.fillStyle = '#120d1f'; g.font = '900 27px "Bolster Display",sans-serif'; g.fillText('FLUFFED', 18, h / 2 - 3); g.fillText('AND FURIOUS', 18, h / 2 + 21, 148); });
    const pn = mesh(new THREE.PlaneGeometry(40, 15), new THREE.MeshStandardMaterial({ map: pen, transparent: true, side: THREE.DoubleSide }), 90, 82, -111.5, root);
    pn.rotation.z = -0.08;
    // fairy lights along the north wall
    const fl = [];
    for (let i = 0; i < 26; i += landingLookdev ? 2 : 1) {
      const x = -140 + i * 10.4, y = 100 - Math.sin((i % 13) / 12 * Math.PI) * 10;
      const c = cols[i % 4];
      mesh(new THREE.SphereGeometry(0.9, 8, 6), glowMat(c, 2.5), x, y, -110.5, root).userData.noShadow = true;
      fl.push(this.glow(c, 9, x, y, -109.5, 0.7));
    }
    this.fairy = fl;
  }

  _landing() {
    const root = this.root, H = HALL;
    // the sconce on the landing's north wall
    mesh(new THREE.CylinderGeometry(3, 6, 8, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#ffe1b0', emissive: '#ffc98a', emissiveIntensity: 1.6, side: THREE.DoubleSide }), 270, 80, -109, root);
    this.glow('#ffc98a', 80, 270, 80, -106, 0.5);
    // framed pictures
    const r = srand(33);
    for (const [x, y, w, h] of [[170, 62, 30, 22], [340, 70, 26, 34], [390, 58, 20, 20]]) {
      mesh(new THREE.BoxGeometry(w + 3, h + 3, 1.2), mat('#c9a35a', { metalness: 0.5, roughness: 0.4 }), x, y, -111.4, root);
      const pic = canvasTex(128, 128, (g, W2, H2) => { const gr = g.createLinearGradient(0, 0, 0, H2); gr.addColorStop(0, `hsl(${200 + r() * 80},50%,40%)`); gr.addColorStop(1, `hsl(${20 + r() * 40},60%,55%)`); g.fillStyle = gr; g.fillRect(0, 0, W2, H2); g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(W2 * 0.7, H2 * 0.3, 12, 0, TAU); g.fill(); });
      mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: pic }), x, y, -110.7, root);
    }
    // the tall window over the stairs (east wall), moonlit
    mesh(new THREE.PlaneGeometry(50, 70), new THREE.MeshBasicMaterial({ color: '#1d2160' }), H.x1 - 0.5, 60, 40, root).rotation.y = -Math.PI / 2;
    this.glow('#9fb4ff', 120, H.x1 - 4, 60, 40, 0.35);
    // the dresser with its bottom drawer pulled out (the sock drawer)
    const T = this.T, drw = [194, 252], dz = -72;
    const oak = mat('#a8774f', { roughness: 0.5 });
    const dres = mesh(rbox(drw[1] - drw[0] + 30, 60, 26, 1.5), oak, (drw[0] + drw[1]) / 2, 34, -99, root); dres.userData.cast = true;
    for (let i = 0; i < 3; i++) {
      mesh(rbox(drw[1] - drw[0] + 24, 15, 1.5, 0.6), mat('#b98a60', { roughness: 0.5 }), (drw[0] + drw[1]) / 2, 14 + i * 17, -85.5, root);
      for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(1.4, 10, 8), mat('#e9c349', { metalness: 0.8, roughness: 0.3 }), (drw[0] + drw[1]) / 2 + s * 22, 14 + i * 17, -84.3, root);
    }
    // the drawer's sides and lining; the deck itself follows the track spline
    const dfx0 = drw[0] - 24, dfx1 = drw[1] + 24;
    // its sides sit just outside the road's own edge (stage 5: one road width everywhere)
    let half = 11.5;
    for (let k = 0; k < T.N; k++) if (T.def.points[T.sec[k]].tag === 'drawer') half = Math.max(half, T.w[k] + T.m[k] + 0.6);
    for (const s of [-1, 1]) mesh(rbox(dfx1 - dfx0, 5, 1.6, 0.5), oak, (dfx0 + dfx1) / 2, 4.5, dz + s * half, root);
    // the drawer's lining: a striped paper
    const lining = canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#f3e7d3'; g.fillRect(0, 0, w, h); g.fillStyle = '#e3b9c3'; for (let x = 0; x < w; x += 24) g.fillRect(x, 0, 10, h); }, { repeat: [6, 1] });
    this.drawerLining = new THREE.MeshStandardMaterial({ map: lining, roughness: 0.9 });
    // the rolled socks: stripy balls (the slalom posts) and a few loose ones
    const sockTex = (a, b) => canvasTex(64, 64, (g, w, h) => { g.fillStyle = a; g.fillRect(0, 0, w, h); g.fillStyle = b; for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 8); });
    const socks = [['#e85d75', '#f4efe6'], ['#6fd3b8', '#1b1840'], ['#f4c84a', '#7e72d8'], ['#9b5cff', '#f4efe6']];
    let si = 0;
    for (const P of T.def.posts) if (P.kind === 'sock') {
      const [a, b] = socks[si++ % 4];
      const s = mesh(new THREE.SphereGeometry(P.r * 1.25, 20, 14), new THREE.MeshStandardMaterial({ map: sockTex(a, b), roughness: 0.95 }), P.x, 3.1 + P.r * 1.05, P.z, root);
      s.scale.set(1, 0.95, 1.15); s.rotation.y = si; s.userData.cast = true;
      const cuff = mesh(new THREE.TorusGeometry(P.r * 0.9, P.r * 0.35, 8, 18), mat(b, { roughness: 0.95 }), P.x, 3.1 + P.r * 1.05, P.z + P.r * 1.05, root);
      cuff.rotation.y = 0;
    }
  }

  /* the pieces the track rides on: the book stairs off the bed, the toy
     plank up to the banister and down again, the banister's rail top and
     its balusters, the pillow pile back up onto the bed */
  _trackParts() {
    const T = this.T, root = this.root, N = T.N, def = T.def;
    const secOf = (k) => def.points[T.sec[k]].tag;
    const runs = {};
    for (let k = 0; k < N; k++) { const t = secOf(k); (runs[t] = runs[t] || []).push(k); }
    const ribbon = (ks, material, thick, widen = 0) => {
      // a slab along the samples: top at the track's y, width 2(w+m)
      const pos = [], uv = [], idx = [];
      ks.forEach((k, i) => {
        const w = T.w[k] + T.m[k] + widen, rx = rightX(T, k), rz = rightZ(T, k), y = T.y[k];
        for (const [s, dy] of [[-1, 0], [1, 0], [-1, -thick], [1, -thick]]) {
          pos.push(T.x[k] + rx * w * s, y + dy, T.z[k] + rz * w * s);
          uv.push(i / Math.max(1, ks.length - 1), (s + 1) / 2);
        }
        if (i) { const a = (i - 1) * 4, b = i * 4; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 2, a + 3, b + 2, a + 3, b + 3, b + 2, a, a + 2, b, a + 2, b + 2, b, a + 1, b + 1, a + 3, a + 3, b + 1, b + 3); }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      // The road's upper face must face the camera from above.
      for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
      g.setIndex(idx); g.computeVertexNormals();
      const m = mesh(g, material, 0, 0, 0, root); m.userData.cast = true;
      return m;
    };
    const contiguous = (ks) => { const out = []; let cur = []; for (const k of ks) { if (cur.length && k !== cur[cur.length - 1] + 1) { out.push(cur); cur = []; } cur.push(k); } if (cur.length) out.push(cur); return out; };

    // the banister: a polished handrail as wide as a road, balusters down to the floor
    const rail = new THREE.MeshStandardMaterial({ color: landingLookdev ? '#bc844c' : '#7a4428', roughness: 0.28, metalness: 0.05 });
    const bal = mat('#efe6d6', { roughness: 0.45 });
    for (const run of contiguous(runs.banister || [])) {
      ribbon(run, rail, 3.2);
      // a rounded lip either side
      for (const s of [-1, 1]) {
        const pts = run.map((k) => new THREE.Vector3(T.x[k] + rightX(T, k) * (T.w[k] + T.m[k]) * s, T.y[k] - 1.05, T.z[k] + rightZ(T, k) * (T.w[k] + T.m[k]) * s));
        mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, 1.0, 8), rail, 0, 0, 0, root);
      }
      for (let i = 0; i < run.length; i += 6) {
        const k = run[i], y = T.y[k] - 3.2, x = T.x[k], z = T.z[k];
        const inWell = x > STAIRS.x0 && x < STAIRS.x1 && z > STAIRS.z0 && z < STAIRS.z1;
        const bottom = inWell ? -60 : 0, L = y - bottom;
        const b = mesh(new THREE.CylinderGeometry(0.9, 1.1, L, 10), bal, x, bottom + L / 2, z, root); b.userData.cast = true;
        if (i % 36 === 0) for (const sd of [-1, 1]) { const off = (T.w[k] + T.m[k] + 2.2) * sd, nx = x + rightX(T, k) * off, nz = z + rightZ(T, k) * off; const np = mesh(rbox(3.6, y + 6.2, 3.6, 0.8), rail, nx, (y + 6.2) / 2 - 3, nz, root); np.userData.cast = true; mesh(new THREE.SphereGeometry(2.2, 14, 10), rail, nx, y + 3.6, nz, root); }
      }
    }
    // the toy planks (a giant wooden ruler) up and down
    const plank = new THREE.MeshStandardMaterial({ map: canvasTex(512, 64, (g, w, h) => { g.fillStyle = '#e9c98f'; g.fillRect(0, 0, w, h); g.fillStyle = '#5a3a1e'; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 2, x % 80 ? 14 : 26); g.font = '700 16px sans-serif'; for (let x = 0; x < w; x += 80) g.fillText(String(x / 80), x + 4, 44); }, { repeat: [1, 1] }), roughness: 0.5 });
    // Neighboring decks own separate spans and meet at exactly one cross section.
    // Continue the ramps over elevated approach samples, stopping above the flat room floor.
    for (const run of contiguous(runs.plank || [])) {
      let first = run[0], last = run.at(-1);
      while (first > 0 && secOf(first - 1) === 'landing' && T.y[first - 1] > 0.08) first--;
      while (last + 1 < N && secOf(last + 1) === 'landing' && T.y[last + 1] > 0.08) last++;
      if (first > 0 && secOf(first - 1) === 'banister') first--;
      if (last + 1 < N && secOf(last + 1) === 'banister') last++;
      const deck = Array.from({ length: last - first + 1 }, (_, i) => first + i);
      ribbon(deck, plank, 1.6);
    }
    for (const run of contiguous(runs.drawer || [])) {
      let first = run[0], last = run.at(-1);
      while (first > 0 && secOf(first - 1) === 'landing' && T.y[first - 1] > 0.08) first--;
      while (last + 1 < N && secOf(last + 1) === 'landing' && T.y[last + 1] > 0.08) last++;
      ribbon(Array.from({ length: last - first + 1 }, (_, i) => first + i), this.drawerLining, 0.85);
    }
    // the book stairs: a tumble of fat books, each top flush with the track
    const books = landingLookdev ? ['#ed2339', '#1461e1', '#07976a', '#ffb41c', '#7529c6', '#f4781c', '#60ac20', '#e73585']
      : ['#c0392b', '#2e86de', '#16a085', '#f39c12', '#8e44ad', '#d35400', '#27ae60', '#e84393'];
    const spine = spineTex();
    const bookMaterials = books.map((color) => new THREE.MeshStandardMaterial({ color, map: spine, roughness: 0.74 }));
    const bk = runs.books || [];
    for (const run of contiguous(bk)) {
      const ext = [(run[0] - 1 + N) % N, ...run, (run[run.length - 1] + 1) % N];
      ribbon(ext, mat(landingLookdev ? '#ffb225' : '#a17454', { roughness: 0.82 }), 0.6);
    }
    const r = srand(4);
    for (let i = 0; i < bk.length; i += 4) {
      const k = bk[i], y = T.y[k], w = T.w[k] + T.m[k] + 3;
      const yaw = Math.atan2(T.tx[k], T.tz[k]);
      // Keep the decorative book covers below the continuous drivable surface.
      let h = Math.min(y, ...[-3, -2, -1, 1, 2, 3].map((q) => T.y[(k + q + N) % N])) - 0.6;
      let n = 0;
      while (h > 0.5 && n < 10) {
        const t = Math.min(h, 2.6 + r() * 1.6);
        const b = mesh(rbox(w * 2 + r() * 4, t, 5.5, 0.4), bookMaterials[(i + n) % bookMaterials.length], T.x[k], h - t / 2, T.z[k], root);
        b.rotation.y = yaw + (r() - 0.5) * 0.035; b.userData.cast = true;
        h -= t; n++;
      }
    }
    // the drawer's run and the duvet need nothing. Up onto the bed: a plain,
    // well-lit wooden toy ramp (the giant ruler again) on stacked toy-block
    // piers, railed (stage 3: the old pillow pile stood above the road, so
    // karts looked as if they sank into it). The pillows are heaped either
    // side of it now, clear of the road and below its rails.
    const pk = (runs.pillows || []).filter((k) => T.y[k] > 0.02);
    if (pk.length) {
      const ext = [...pk, ...[1, 2, 3].map((q) => (pk[pk.length - 1] + q) % N)];
      ribbon(ext, plank, 1.6);
      const blocks = ['#ff3b6b', '#3ab7ff', '#ffd84a', '#3ff0c8'].map((c) => mat(c, { roughness: 0.55 }));
      for (let i = 0; i < pk.length; i += 9) {
        const k = pk[i], y = T.y[k] - 1.6;
        if (y < 1) continue;
        for (const sd of [-1, 1]) {
          const o = (T.w[k] + T.m[k] - 2.2) * sd, x = T.x[k] + rightX(T, k) * o, z = T.z[k] + rightZ(T, k) * o;
          let h = 0, n = 0;
          while (h < y - 0.1) { const t = Math.min(4, y - h); const b = mesh(rbox(4, t, 4, 0.3), blocks[(i + n + (sd > 0 ? 1 : 0)) % 4], x, h + t / 2, z, root); b.rotation.y = Math.atan2(T.tx[k], T.tz[k]) + n * 0.12; b.userData.cast = true; h += t; n++; }
        }
      }
      const pcol = ['#f6f1f4', '#e7d6f3', '#d6f0e9', '#fbe3d2'];
      for (let i = 4; i < pk.length; i += 11) {
        const k = pk[i], y = T.y[k];
        for (const sd of [-1, 1]) {
          const o = (T.w[k] + T.m[k] + 8.5) * sd, h = Math.max(4, Math.min(y + 1, 14));
          const p = mesh(pillowGeo(13, h, 9), mat(pcol[(i + (sd > 0 ? 2 : 0)) % 4], { roughness: 0.95 }), T.x[k] + rightX(T, k) * o, h / 2 - 0.5, T.z[k] + rightZ(T, k) * o, root);
          p.rotation.y = Math.atan2(T.tx[k], T.tz[k]) + 0.3 * sd; p.userData.cast = true;
        }
      }
    }
  }

  /* guide lines: stitched dashes at the track's edges, a felt runner on the
     floor sections, the start line, the boost pads */
  _guides() {
    const T = this.T, N = T.N, root = this.root, def = T.def;
    const dash = new THREE.MeshBasicMaterial({ color: '#fffaf0', transparent: true, opacity: 0.95 });
    const neon = new THREE.MeshBasicMaterial({ color: '#ff3b6b' });
    const neon2 = new THREE.MeshBasicMaterial({ color: '#3ff0c8' });
    const runner = new THREE.MeshStandardMaterial({ color: this.runnerColor || '#2c2440', roughness: 1, transparent: true, opacity: 0.78, depthWrite: false });
    // stage 3: bolder, closer edge lines (the road reads at speed)
    const dg = new THREE.PlaneGeometry(0.85, 2.4);
    const insts = [];
    for (let k = 0; k < N; k += 3) {
      const tag = def.points[T.sec[k]].tag;
      if (this.noDash.has(tag)) continue;
      for (const s of [-1, 1]) insts.push([k, s]);
    }
    const im = new THREE.InstancedMesh(dg, dash, insts.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
    insts.forEach(([k, s], i) => {
      const w = T.w[k];
      P.set(T.x[k] + rightX(T, k) * w * s, T.y[k] + 0.22 + (this.dashLift ? this.dashLift(k) : T.y[k] > 19 ? 0.9 : 0), T.z[k] + rightZ(T, k) * w * s);
      E.set(-Math.PI / 2, 0, -Math.atan2(T.tx[k], T.tz[k]) + Math.PI, 'YXZ');
      E.set(-Math.PI / 2, 0, 0); Q.setFromEuler(E);
      const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(T.tx[k], T.tz[k]));
      Q.premultiply(qy);
      M.compose(P, Q, S); im.setMatrixAt(i, M);
    });
    im.userData.noShadow = true;
    root.add(im);
    // the felt runner under the floor sections (reads the road in the dark)
    const pos = [], idx = [];
    let n = 0;
    for (let k = 0; k <= N; k += 2) {
      const kk = k % N, tag = def.points[T.sec[kk]].tag;
      const on = this.runnerTags.has(tag);
      const w = T.w[kk] + 0.6;
      pos.push(T.x[kk] - rightX(T, kk) * w, T.y[kk] + 0.12 + (on ? 0 : -50), T.z[kk] - rightZ(T, kk) * w, T.x[kk] + rightX(T, kk) * w, T.y[kk] + 0.12 + (on ? 0 : -50), T.z[kk] + rightZ(T, kk) * w);
      if (n) idx.push((n - 1) * 2, n * 2, (n - 1) * 2 + 1, (n - 1) * 2 + 1, n * 2, n * 2 + 1);
      n++;
    }
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setIndex(idx); rg.computeVertexNormals();
    const rm = mesh(rg, runner, 0, 0, 0, root); rm.userData.noShadow = true; rm.renderOrder = -1;
    // the start line: a stitched checker band across the duvet
    const sk = this.startK ?? 0;
    const chk = canvasTex(256, 32, (g, w, h) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#120d1f' : '#f6f1e8'; g.fillRect(i * 16, j * 16, 16, 16); } });
    this.startLine = mesh(new THREE.PlaneGeometry(1, 2.4), new THREE.MeshBasicMaterial({ map: chk }), 0, 0, 0, root);
    this.startLine.userData.noShadow = true;
    // the boost pads: glowing feather chevrons
    const padTex = canvasTex(128, 128, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = 12; g.lineCap = 'round';
      for (const y of [30, 64, 98]) { g.beginPath(); g.moveTo(22, y + 18); g.lineTo(64, y - 14); g.lineTo(106, y + 18); g.stroke(); }
    });
    this.pads = []; this.padMeshes = new Set();
    for (let k = 0; k < N; k++) {
      if (!T.pad[k] || T.pad[(k - 1 + N) % N]) continue;
      const m = new THREE.MeshBasicMaterial({ map: padTex, color: '#ffd84a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const p = mesh(new THREE.PlaneGeometry(9, 9), m, T.x[k], T.y[k] + 0.3, T.z[k], root);
      p.rotation.set(-Math.PI / 2, 0, Math.atan2(T.tx[k], T.tz[k]) + Math.PI, 'YXZ');
      p.rotation.order = 'YXZ'; p.rotation.y = Math.atan2(T.tx[k], T.tz[k]); p.rotation.x = -Math.PI / 2; p.rotation.z = Math.PI;
      p.userData.noShadow = true;
      const base = mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: '#ff3b6b', transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }), T.x[k], T.y[k] + 0.25, T.z[k], root);
      base.rotation.copy(p.rotation); base.userData.noShadow = true;
      this.pads.push(m); this.padMeshes.add(p); this.padMeshes.add(base);
    }
    void neon; void neon2;
  }

  setStart(k) {
    const T = this.T, L = this.startLine, w = T.w[k] + T.m[k];
    L.scale.set(w * 2, 1, 1);
    L.position.set(T.x[k], T.y[k] + 1.1, T.z[k]);
    L.rotation.order = 'YXZ'; L.rotation.set(-Math.PI / 2, Math.atan2(T.tx[k], T.tz[k]) + Math.PI / 2, 0);
    L.rotation.y = Math.atan2(T.tx[k], T.tz[k]); L.rotation.x = -Math.PI / 2;
  }

  update(dt, t) {
    for (let i = 0; i < this.pads.length; i++) this.pads[i].opacity = 0.55 + 0.45 * Math.sin(t * 8 + i);
    if (this.fairy) for (let i = 0; i < this.fairy.length; i++) this.fairy[i].material.opacity = 0.45 + 0.35 * Math.sin(t * 2.3 + i * 1.7);
  }
}
