/* The things the athletes play with: a wooden racquet, a felt tennis ball,
   a felt football, a small goal with a soft net, and the stars of a bonk.
   All drawn with the same hand-lit node materials as the plush (the scene
   has no lights: one key, one fill, a sky, as in Flock).                  */

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, attribute, float, vec2, vec3, vec4, positionLocal, normalWorld, cameraPosition, positionWorld,
  mix, smoothstep, clamp, normalize, dot, pow, abs, sin, fract, min, length, varying, Discard, mx_noise_float, atan,
  frontFacing, select,
} from 'three/tsl';
import { KEY, FILL } from './fur.js';
import { RQ } from './athletes/leopard.game.js';

const K = () => vec3(KEY.x, KEY.y, KEY.z);
const F = () => vec3(FILL.x, FILL.y, FILL.z);

/* the shared hand lighting: wrapped key, fill, sky, a little floor AO */
function shade(base, N, { spec = 0, power = 40, wrap = 0.55 } = {}) {
  const V = normalize(cameraPosition.sub(positionWorld));
  const ndl = clamp(dot(N, K()).mul(1 - wrap).add(wrap), 0, 1);
  const fill = clamp(dot(N, F()).mul(0.5).add(0.35), 0, 1).mul(0.25);
  const sky = mix(vec3(0.72, 0.68, 0.64), vec3(0.98, 0.97, 0.95), N.y.mul(0.5).add(0.5)).mul(0.32);
  const ao = mix(float(0.6), float(1), smoothstep(0.0, 0.7, positionWorld.y));
  const H = normalize(K().add(V));
  const sp = pow(clamp(dot(N, H), 0, 1), float(power)).mul(spec);
  return base.mul(vec3(ndl).mul(vec3(1.0, 0.96, 0.9)).add(vec3(fill).mul(vec3(0.85, 0.9, 1))).add(sky)).mul(ao).add(vec3(sp));
}

/* ── the racquet ───────────────────────────────────────────────────────────
   Built along +y (the handle axis) from the grip point at the origin, the
   head across x, strung in the x-y plane, face normal +z — exactly the
   frame racquetFrame() measures from the paw.                            */
export function makeRacquet() {
  const g = new THREE.Group();
  const wood = new THREE.MeshBasicNodeMaterial();
  wood.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    const p = positionLocal;
    const grain = sin(p.y.mul(38).add(p.x.mul(20)).add(mx_noise_float(vec3(p.mul(6))).mul(4))).mul(0.5).add(0.5);
    const base = mix(vec3(0.5, 0.31, 0.16), vec3(0.66, 0.45, 0.25), grain);
    return vec4(shade(base, N, { spec: 0.35, power: 60 }), 1);
  })();
  const leather = new THREE.MeshBasicNodeMaterial();
  leather.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    const p = positionLocal;
    // a spiral wrap: overlapping turns of leather tape
    const a = atan(p.x, p.z).div(Math.PI * 2);
    const wrapT = fract(p.y.mul(13).add(a));
    const ridge = smoothstep(0.0, 0.12, wrapT).mul(smoothstep(1.0, 0.82, wrapT));
    const base = mix(vec3(0.16, 0.085, 0.05), vec3(0.3, 0.17, 0.09), ridge).mul(mx_noise_float(vec3(p.mul(40))).mul(0.08).add(0.96));
    return vec4(shade(base, N, { spec: 0.12, power: 20 }), 1);
  })();
  const strings = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  strings.colorNode = Fn(() => {
    const p = positionLocal;
    const gap = 0.052;
    const sx = abs(fract(p.x.div(gap)).sub(0.5)), sy = abs(fract(p.y.sub(RQ.head).div(gap)).sub(0.5));
    const on = smoothstep(0.36, 0.42, sx).add(smoothstep(0.36, 0.42, sy));
    Discard(on.lessThan(0.5));
    const N0 = normalize(normalWorld);
    const N = select(frontFacing, N0, N0.negate());
    return vec4(shade(vec3(0.93, 0.9, 0.82), N, { spec: 0.3, power: 30, wrap: 0.7 }), 1);
  })();

  // the oval head
  const ell = [];
  for (let k = 0; k < 48; k++) {
    const t = (k / 48) * Math.PI * 2;
    ell.push(new THREE.Vector3(RQ.b * Math.sin(t), RQ.head - RQ.a * Math.cos(t), 0));
  }
  const head = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ell, true), 96, RQ.frame, 10, true), wood);
  // the open throat: two struts from the head down into the shaft
  for (const s of [-1, 1]) {
    const c = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(s * RQ.b * 0.62, RQ.head - RQ.a * 0.8, 0),
      new THREE.Vector3(s * 0.05, RQ.throat - 0.08, 0),
      new THREE.Vector3(0, RQ.grip + 0.02, 0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 16, RQ.frame * 0.85, 8, false), wood));
  }
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, RQ.grip - 0.0, 14), wood);
  shaft.position.y = RQ.grip / 2 + 0.02;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.064, RQ.grip - RQ.butt, 20, 8), leather);
  grip.position.y = (RQ.grip + RQ.butt) / 2;
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.072, 0.045, 20), wood);
  butt.position.y = RQ.butt;
  const face = new THREE.Mesh(new THREE.CircleGeometry(1, 48), strings);
  face.scale.set(RQ.b, RQ.a, 1);
  face.position.y = RQ.head;
  g.add(head, shaft, grip, butt, face);
  g.traverse((o) => { o.frustumCulled = false; });
  g.matrixAutoUpdate = false;
  return g;
}

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
export function poseRacquet(g, F) {
  _x.fromArray(F.w); _y.fromArray(F.h); _z.fromArray(F.n);
  _m.makeBasis(_x, _y, _z).setPosition(F.p[0], F.p[1], F.p[2]);
  g.matrix.copy(_m);
  g.matrixWorldNeedsUpdate = true;
}

/* ── felt balls ────────────────────────────────────────────────────────────
   Patterns are baked into vertex colours on a fine sphere: a tennis ball's
   two-lobed seam, a football's black pentagons and white hexagons with
   their stitched seams. The felt itself is in the shader: a fuzzy halo at
   the silhouette, a soft sheen, fibres.                                  */
function feltMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial();
  const col = attribute('color', 'vec3');
  const vCol = varying(col);
  mat.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    const V = normalize(cameraPosition.sub(positionWorld));
    const fib = mx_noise_float(vec3(positionLocal.mul(38))).mul(0.06).add(0.97);
    const base = vCol.mul(fib);
    const fuzz = pow(float(1).sub(abs(dot(N, V))), float(2.2)).mul(0.28);
    return vec4(shade(base, N, { spec: 0.04, power: 8, wrap: 0.5 }).add(base.mul(fuzz)), 1);
  })();
  return mat;
}

export function makeTennisBall(r) {
  const geo = new THREE.SphereGeometry(1, 56, 40);
  const P = geo.attributes.position, n = P.count;
  const col = new Float32Array(n * 3);
  const seam = [];
  const k = 0.3, c = 2 * Math.sqrt(k * (1 - k));
  for (let s = 0; s < 400; s++) {
    const t = (s / 400) * Math.PI * 2;
    const v = new THREE.Vector3((1 - k) * Math.cos(t) + k * Math.cos(3 * t), (1 - k) * Math.sin(t) - k * Math.sin(3 * t), c * Math.sin(2 * t)).normalize();
    seam.push(v);
  }
  const felt = new THREE.Color('#d6e03e'), white = new THREE.Color('#f4f2e6');
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i).normalize();
    let d = 9;
    for (const q of seam) d = Math.min(d, v.distanceTo(q));
    const w = THREE.MathUtils.smoothstep(0.075, 0.045, d);
    const cc = felt.clone().lerp(white, w);
    col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, feltMaterial());
  m.scale.setScalar(r);
  m.visible = false;
  return m;
}

export function makeFootball(r) {
  const geo = new THREE.SphereGeometry(1, 72, 52);
  const P = geo.attributes.position, n = P.count;
  const col = new Float32Array(n * 3);
  const phi = (1 + Math.sqrt(5)) / 2;
  const ico = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    ico.push(new THREE.Vector3(0, a, b * phi), new THREE.Vector3(a, b * phi, 0), new THREE.Vector3(a * phi, 0, b));
  }
  ico.forEach((p) => p.normalize());
  // hexagon centres: the icosahedron's face centres
  const hex = [];
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) for (let l = j + 1; l < 12; l++) {
    const a = ico[i], b = ico[j], c = ico[l];
    if (a.distanceTo(b) < 1.1 && b.distanceTo(c) < 1.1 && a.distanceTo(c) < 1.1) hex.push(a.clone().add(b).add(c).normalize());
  }
  const centres = [...ico.map((p) => [p, 1]), ...hex.map((p) => [p, 0])];
  const black = new THREE.Color('#2a2826'), white = new THREE.Color('#f2efe6'), seamC = new THREE.Color('#9d978c');
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i).normalize();
    let b1 = -2, b2 = -2, kind = 0;
    for (const [c, k] of centres) {
      // pentagons are smaller than hexagons: weight their pull a little less
      const d = v.dot(c) - (k ? 0.035 : 0);
      if (d > b1) { b2 = b1; b1 = d; kind = k; } else if (d > b2) b2 = d;
    }
    const cc = (kind ? black : white).clone().lerp(seamC, THREE.MathUtils.smoothstep(0.012, 0.0, b1 - b2) * 0.9);
    col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, feltMaterial());
  m.scale.setScalar(r);
  m.visible = false;
  return m;
}

export function poseBall(mesh, ball) {
  if (!ball || ball.dead) { mesh.visible = false; return; }
  mesh.visible = true;
  mesh.position.set(ball.x[0], ball.x[1], ball.x[2]);
  mesh.quaternion.set(ball.q[0], ball.q[1], ball.q[2], ball.q[3]);
}

/* ── stars of a bonk: three little felt stars circling the head ──────────── */
export function makeStars() {
  const shape = new THREE.Shape();
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + Math.PI / 2, r = k % 2 ? 0.42 : 1;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (k) shape.lineTo(x, y); else shape.moveTo(x, y);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2 });
  geo.center();
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => vec4(shade(vec3(1.0, 0.8, 0.26), normalize(normalWorld), { spec: 0.15, power: 20 }), 1))();
  const g = new THREE.Group();
  for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(geo, mat); m.scale.setScalar(0.11); g.add(m); }
  g.visible = false;
  return g;
}

export function poseStars(g, head, amount, t) {
  g.visible = amount > 0.04;
  if (!g.visible) return;
  g.children.forEach((m, k) => {
    const a = t * 3.2 + (k / 3) * Math.PI * 2;
    m.position.set(head[0] + Math.cos(a) * 0.62, head[1] + 0.95 + Math.sin(a * 2) * 0.05, head[2] + Math.sin(a) * 0.62);
    m.rotation.set(0.3, a * 1.5, Math.sin(a) * 0.4);
    m.scale.setScalar(0.11 * Math.min(1, amount * 2));
  });
}

/* ── the goal: padded posts and crossbar, a thin back frame, a soft net ──── */
export function makeGoal(G, net) {
  const g = new THREE.Group();
  const pad = new THREE.MeshBasicNodeMaterial();
  pad.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    const base = vec3(0.95, 0.94, 0.9).mul(mx_noise_float(vec3(positionWorld.mul(30))).mul(0.03).add(0.98));
    return vec4(shade(base, N, { spec: 0.1, power: 16 }), 1);
  })();
  const bar = (a, b, r) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, A.distanceTo(B), 18, 1), pad);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    g.add(m);
    for (const p of [A, B]) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), pad); s.position.copy(p); g.add(s); }
  };
  for (const [a, b, r] of G.bars) bar(a, b, r);

  // the net: one mesh per panel, its vertices the net's knots
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const cell = attribute('cell', 'vec2');
  const vCell = varying(cell);
  mat.colorNode = Fn(() => {
    const f = vCell;
    const du = min(fract(f.x), float(1).sub(fract(f.x))), dv = min(fract(f.y), float(1).sub(fract(f.y)));
    const on = smoothstep(0.075, 0.045, min(du, dv));
    Discard(on.lessThan(0.5));
    const N0 = normalize(normalWorld);
    const N = select(frontFacing, N0, N0.negate());
    return vec4(shade(vec3(0.93, 0.92, 0.88), N, { wrap: 0.8 }), 1);
  })();
  const meshes = net.panels.map((P) => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(P.ix.length * 3);
    const cellA = new Float32Array(P.ix.length * 2);
    const idx = [];
    for (let j = 0; j < P.rows; j++) for (let i = 0; i < P.cols; i++) {
      const k = j * P.cols + i;
      cellA[k * 2] = i; cellA[k * 2 + 1] = j;
      if (i < P.cols - 1 && j < P.rows - 1) idx.push(k, k + 1, k + P.cols, k + 1, k + P.cols + 1, k + P.cols);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('cell', new THREE.BufferAttribute(cellA, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    g.add(m);
    return { m, geo, pos, P };
  });
  g.userData.update = () => {
    for (const { geo, pos, P } of meshes) {
      for (let k = 0; k < P.ix.length; k++) { const i = P.ix[k]; pos[k * 3] = net.x[i * 3]; pos[k * 3 + 1] = net.x[i * 3 + 1]; pos[k * 3 + 2] = net.x[i * 3 + 2]; }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
    }
  };
  g.userData.update();
  return g;
}
