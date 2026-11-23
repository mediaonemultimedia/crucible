/* Stage 5: a few small toys and odds and ends beside the road that sell the
   scale (Kevin loves the toy-scale feel). Each track's props are ONE merged,
   vertex-coloured mesh: one draw, no textures, nothing animated, so they add
   no frame cost worth measuring.

   - The Landing: crayons, building blocks, a toy car parked on the rug, a
     sleeping cat's tail curling out from under the bed;
   - Laundry Day: giant clothes pegs, a lost coin, lint balls;
   - Sprinkler Park: acorns, a garden gnome, a trail of ants.

   Each prop is placed off the road: beside a sample of the track, past its
   edge (w + m) plus a gap, on the floor, and never on another stretch of
   the road or the podium / turntable spot.                               */

import * as THREE from 'three/webgpu';
import { rightX, rightZ, sceneryClearsRoad } from '../race/track.js';

const TAU = Math.PI * 2;

/* pieces → one geometry with a colour per vertex */
function merge(parts) {
  const pos = [], nor = [], col = [];
  const C = new THREE.Color();
  for (const { g, c } of parts) {
    const G = g.index ? g.toNonIndexed() : g;
    if (!G.attributes.normal) G.computeVertexNormals();
    C.set(c);
    const P = G.attributes.position, N = G.attributes.normal;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(C.r, C.g, C.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

/* a little builder: pieces placed in a prop's own frame, then the prop placed in the world */
class Kit {
  constructor() { this.parts = []; this.M = new THREE.Matrix4(); this.L = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.E = new THREE.Euler(); }
  at(x, y, z, yaw = 0, s = 1) { this.M.compose(new THREE.Vector3(x, y, z), this.Q.setFromEuler(this.E.set(0, yaw, 0)), new THREE.Vector3(s, s, s)); return this; }
  add(geo, c, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const g = geo.clone();
    this.L.compose(new THREE.Vector3(x, y, z), this.Q.setFromEuler(this.E.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
    g.applyMatrix4(this.L); g.applyMatrix4(this.M);
    this.parts.push({ g, c });
    return this;
  }
}

const cyl = (r0, r1, h, n = 10) => new THREE.CylinderGeometry(r0, r1, h, n);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const ball = (r, a = 12, b = 9) => new THREE.SphereGeometry(r, a, b);

/* ── the props themselves (in their own frame, standing on y = 0) ── */
const P = {
  crayon(k, c, lie = 1) {
    // lying on the floor: a paper-wrapped stick with a sharpened tip
    k.add(cyl(0.9, 0.9, 9, 8), c, 0, 0.9, 0, 0, 0, Math.PI / 2);
    k.add(cyl(0.93, 0.93, 6, 8), '#f4efe6', -0.6, 0.9, 0, 0, 0, Math.PI / 2);
    k.add(cyl(0.95, 0.95, 0.35, 8), '#2b2933', -3.2, 0.9, 0, 0, 0, Math.PI / 2);
    k.add(cyl(0.95, 0.95, 0.35, 8), '#2b2933', 2, 0.9, 0, 0, 0, Math.PI / 2);
    k.add(cyl(0.1, 0.9, 1.8, 8), c, 5.4, 0.9, 0, 0, 0, -Math.PI / 2);
    void lie;
  },
  block(k, c, s = 4, lean = 0) {
    k.add(box(s, s, s), c, 0, s / 2, 0, 0, lean, 0);
    // a raised letter-ish panel on two faces
    k.add(box(s * 0.62, s * 0.62, 0.18), '#fff7e8', 0, s / 2, s / 2 + 0.05, 0, 0, 0);
    k.add(box(0.18, s * 0.62, s * 0.62), '#fff7e8', s / 2 + 0.05, s / 2, 0, 0, 0, 0);
  },
  toyCar(k) {
    k.add(box(4.2, 1.5, 7.5), '#e8463c', 0, 1.6, 0);
    k.add(box(3.6, 1.4, 3.6), '#e8463c', 0, 3, -0.6);
    k.add(box(3.7, 1.0, 3.2), '#bfe8ff', 0, 3, -0.6);
    k.add(box(4.3, 0.4, 0.5), '#f4efe6', 0, 1.3, 3.8);
    for (const [x, z] of [[-2.1, 2.4], [2.1, 2.4], [-2.1, -2.4], [2.1, -2.4]]) { k.add(cyl(1.05, 1.05, 0.8, 12), '#2b2933', x, 1.05, z, 0, 0, Math.PI / 2); k.add(cyl(0.45, 0.45, 0.84, 8), '#d8d8de', x, 1.05, z, 0, 0, Math.PI / 2); }
  },
  catTail(k) {
    // a big ginger tail, striped, curling out across the floorboards
    const pts = [];
    for (let i = 0; i <= 16; i++) { const u = i / 16; pts.push(new THREE.Vector3(u * 24, 2.6 + Math.sin(u * Math.PI) * 1.4, Math.sin(u * 2.6) * 3 + u * u * 4)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    for (let i = 0; i < 10; i++) {
      const a = i / 10, b = (i + 1) / 10;
      const seg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curve.getPoints(40).slice(Math.floor(a * 40), Math.floor(b * 40) + 1)), 6, 2.6 - a * 0.9, 9);
      k.add(seg, i % 2 ? '#c8742e' : '#e89a4e');
    }
    const tip = curve.getPoint(1);
    k.add(ball(1.75, 10, 8), '#f4efe6', tip.x, tip.y, tip.z);
  },
  peg(k, c) {
    // a wooden clothes peg on its side
    k.add(box(10, 0.9, 1.4), c, 0, 0.7, -0.8, 0, 0, 0.04);
    k.add(box(10, 0.9, 1.4), c, 0, 0.7, 0.8, 0, 0, -0.04);
    k.add(cyl(1.0, 1.0, 3.2, 10), '#c9ccd4', 0.8, 0.9, 0, Math.PI / 2);
  },
  coin(k) {
    k.add(cyl(3.2, 3.2, 0.5, 24), '#d9b24a', 0, 0.25, 0);
    k.add(cyl(2.6, 2.6, 0.56, 24), '#e9c65e', 0, 0.25, 0);
  },
  lint(k, r = 2.4) {
    const g = new THREE.IcosahedronGeometry(r, 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + 0.22 * Math.sin(x * 3.1 + y * 2.3) * Math.cos(z * 2.7); p.setXYZ(i, x * n, y * n * 0.8, z * n); }
    g.computeVertexNormals();
    k.add(g, '#9a95a6', 0, r * 0.7, 0);
    k.add(new THREE.IcosahedronGeometry(r * 0.5, 1), '#b8b2c4', r * 0.6, r * 0.5, r * 0.3);
  },
  acorn(k, tip = 0) {
    k.add(ball(1.5, 12, 9), '#a0662f', 0, 1.5, 0, tip, 0, 0, 1, 1.3, 1);
    k.add(ball(1.6, 12, 6), '#6e4a2a', 0, 2.6, 0, tip, 0, 0, 1, 0.55, 1);
    k.add(cyl(0.18, 0.25, 0.8, 6), '#5a3a1e', 0, 3.4, 0, tip);
  },
  gnome(k) {
    k.add(cyl(2.4, 3, 6, 14), '#2f6bd8', 0, 3, 0);
    k.add(box(5.8, 0.8, 4.2), '#5a3a1e', 0, 0.4, 0);
    k.add(ball(2.1, 14, 10), '#f2c7a0', 0, 7.2, 0);
    k.add(ball(0.55, 8, 6), '#e8907a', 0, 7.1, 2.05);
    k.add(cyl(0.1, 2.3, 2.8, 12), '#f4efe6', 0, 5.6, 1.1, Math.PI * 0.9);
    k.add(cyl(0.05, 2.4, 6.5, 14), '#d4202c', 0, 10.8, -0.4, -0.12);
    k.add(box(1.1, 3.4, 1.1), '#2f6bd8', 2.7, 4, 0.6, 0.6, 0, 0.4);
  },
  ants(k, n = 9) {
    for (let i = 0; i < n; i++) {
      const x = i * 2.2, z = Math.sin(i * 0.9) * 1.2;
      for (const [dx, r] of [[0, 0.35], [0.55, 0.28], [1.05, 0.4]]) k.add(ball(r, 8, 6), '#1d1416', x + dx, 0.4, z);
    }
  },
};

/* where a prop can go: beside sample k, `gap` past the road's edge, on the floor */
function spot(T, k, side, gap, avoid) {
  const off = (T.w[k] + T.m[k] + gap) * side;
  const x = T.x[k] + rightX(T, k) * off, z = T.z[k] + rightZ(T, k) * off;
  if (T.y[k] > 0.5) return null;
  for (let q = 0; q < T.N; q += 2) { const lim = T.w[q] + T.m[q] + gap * 0.6; if ((T.x[q] - x) ** 2 + (T.z[q] - z) ** 2 < lim * lim) return null; }
  for (const [ax, az, r] of avoid) if ((ax - x) ** 2 + (az - z) ** 2 < r * r) return null;
  return { x, z, yaw: Math.atan2(T.tx[k], T.tz[k]) };
}
/* try lap fractions from f onwards until one fits */
function place(T, startK, f, side, gap, avoid) {
  for (let d = 0; d < 0.2; d += 0.004) for (const s of [side, -side]) {
    const k = (startK + Math.round((f + d) * T.N)) % T.N;
    const p = spot(T, k, s, gap, avoid);
    if (p) { avoid.push([p.x, p.z, 10]); return p; }
  }
  return null;
}

const PLANS = {
  landing: [
    ['crayon', 0.08, 1, 4, ['#e8463c'], 0.4], ['crayon', 0.085, 1, 7, ['#2f6bd8'], -0.2], ['crayon', 0.17, -1, 5, ['#3ab795'], 1.1],
    ['block', 0.13, -1, 5, ['#ffd84a', 4], 0.3], ['block', 0.135, -1, 9, ['#e8463c', 3.4, 0.4], 0.9], ['block', 0.4, 1, 6, ['#3ab7ff', 4.5], 0.2],
    ['toyCar', 0.2, 1, 6, [], 0.8], ['catTail', 0.31, -1, 5, [], 0],
    ['crayon', 0.72, -1, 5, ['#9b5cff'], 0.6], ['block', 0.82, 1, 5, ['#3ff0c8', 3.6, 0.5], 0],
  ],
  laundry: [
    ['peg', 0.03, 1, 4, ['#d9b48a'], 0.5], ['peg', 0.27, -1, 5, ['#9bd3c2'], -0.4], ['peg', 0.78, 1, 4, ['#d9b48a'], 1.2],
    ['coin', 0.3, 1, 4, [], 0], ['coin', 0.95, -1, 4, [], 0],
    ['lint', 0.4, -1, 4, [2.6], 0], ['lint', 0.62, 1, 4, [2], 0], ['lint', 0.83, -1, 5, [3], 0],
  ],
  park: [
    ['acorn', 0.06, 1, 4, [0], 0], ['acorn', 0.065, 1, 7, [1.3], 1], ['acorn', 0.46, -1, 4, [0.3], 2], ['acorn', 0.8, 1, 5, [1.4], 0.4], ['acorn', 0.805, 1, 8, [0], 0],
    ['gnome', 0.29, -1, 6, [], -0.8], ['gnome', 0.9, 1, 7, [], 2.2],
    ['ants', 0.13, -1, 3, [11], 0.3], ['ants', 0.6, 1, 3, [9], -0.3], ['ants', 0.97, -1, 3, [8], 0],
  ],
};

/* build the track's props into world.root: one mesh */
export function addProps(world) {
  const T = world.T, plan = PLANS[T.def.id];
  if (!plan) return null;
  // the start line's sample (as the race finds it)
  const [sx, sy, sz] = T.def.start || [0, 0, 0];
  let startK = 0, bd = 1e18;
  for (let k = 0; k < T.N; k++) { const d = (T.x[k] - sx) ** 2 + (T.z[k] - sz) ** 2 + (T.y[k] - sy) ** 2 * 4; if (d < bd) { bd = d; startK = k; } }
  const info = world.info;
  const avoid = [[...info.turn].filter((_, i) => i !== 1).concat(22), ...info.podium.map(([x, , z]) => [x, z, 16])];
  const kit = new Kit();
  const spots = [];
  let n = 0;
  for (const [kind, f, side, gap, args, spin] of plan) {
    const p = place(T, startK, f, side, gap, avoid);
    if (!p) continue;
    kit.at(p.x, 0.02, p.z, p.yaw + spin);
    const first = kit.parts.length;
    P[kind](kit, ...args);
    const footprint = new THREE.Box3();
    for (const { g } of kit.parts.slice(first)) {
      g.computeBoundingBox();
      footprint.union(g.boundingBox);
    }
    const mid = footprint.getCenter(new THREE.Vector3());
    const size = footprint.getSize(new THREE.Vector3());
    if (!sceneryClearsRoad(T, mid.x, mid.z, size.x / 2, size.z / 2, 0, footprint.min.y, footprint.max.y)) {
      for (const { g } of kit.parts.splice(first)) g.dispose();
      continue;
    }
    spots.push([kind, p.x, p.z]);
    n++;
  }
  if (!kit.parts.length) return null;
  const m = new THREE.Mesh(merge(kit.parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  m.userData.cast = true; m.userData.props = n; m.userData.spots = spots;
  world.root.add(m);
  void TAU;
  return m;
}
