/* What the crow plays with, and his beak: two rigid felt mandibles on a
   hinge, a twig nest lined with felt, and the things you toss him — a
   bread crumb and a berry (food), a felt-and-foil button, a bottle cap
   and a little key (shiny). Same hand lighting as the other props.     */

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, attribute, float, vec3, vec4, positionLocal, normalWorld, normalLocal, cameraPosition, positionWorld,
  mix, smoothstep, clamp, normalize, dot, pow, abs, varying, mx_noise_float, reflect,
} from 'three/tsl';
import { KEY } from './fur.js';
import { shade, feltMaterial } from './props.js';
import { NEST, ITEMS } from './athletes/crow.game.js';
import { mulberry32 } from './math.js';

/* ── the beak ──────────────────────────────────────────────────────────────
   Closed, the two mandibles make one solid, rounded cone, deeper than it is
   wide (a crow's bill is pinched in from the sides): the upper is the top
   of it — an arched, rounded section rising to a ridge (culmen) down its
   middle, curving over into a slight hook at the tip — and the lower is
   the shallower bottom of the same cone. They meet along the gape line,
   and each is closed by its own inside face along it, so an open beak
   shows a mouth, not a hollow shell. Lofted along z from the hinge at the
   origin. The first quarter or so is buried in the head (the hinge sits
   well inside the stuffing), so the bill comes out of the fur at its full
   section and the pile closes round it: no seam, no cut edge.          */
export const BEAK_SECTION = {
  // the half-width and the heights (upper above, lower below the gape) of
  // the section at s along the bill, as fractions of w and h
  taper: (s) => Math.pow(Math.max(0, 1 - Math.pow(s, 1.5)), 0.7),
  lower: 0.62,
  // the section round from one gape edge (a = 0) over the top (a = π/2)
  // to the other: a rounded arch with a soft ridge, never a flat top
  arch: (a, upper) => {
    const sy = Math.sin(a);
    return Math.pow(sy, 0.95) * (upper ? 1 + 0.12 * Math.pow(sy, 12) : 1);
  },
};

function mandible(L, W, H, upper) {
  const S = 32, K = 28;
  const pos = [], idx = [];
  const hook = 0.42 * H;
  const { taper, lower, arch } = BEAK_SECTION;
  // the gape line: straight, dropping into the hook near the tip
  const gapeY = (s) => -hook * Math.pow(s, 3.2);
  for (let j = 0; j <= S; j++) {
    const s = j / S;
    const t = taper(s);
    // the sides bow out a little below the ridge at the base, so it reads
    // as a cone with shoulders, not a wedge
    const w = W * t;
    const h = (upper ? H : H * lower) * t * (upper ? 1 + 0.1 * (1 - s) : 1);
    const y0 = gapeY(s);
    for (let k = 0; k <= K; k++) {
      const a = (k / K) * Math.PI;
      const cx = Math.cos(a);
      const r = arch(a, upper);
      // a little fuller across the shoulders than an ellipse
      const xw = cx * w * (1 + 0.08 * Math.sin(a) * (1 - s));
      pos.push(xw, y0 + (upper ? r * h : -r * h), s * L);
    }
  }
  const tip = pos.length / 3;
  pos.push(0, gapeY(1) - (upper ? 0 : 0.02 * H), L * 1.01);
  const R = K + 1;
  for (let j = 0; j < S; j++) {
    for (let k = 0; k < K; k++) {
      const a = j * R + k, b = a + 1, c = a + R, d = c + 1;
      if (upper) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  // the inside face across the gape, on its own vertices (a sharp lip, and
  // the flanks' normals not bent down into it)
  const lip = pos.length / 3;
  for (let j = 0; j <= S; j++) for (const k of [0, K]) { const i = j * R + k; pos.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); }
  for (let j = 0; j < S; j++) {
    const a = lip + j * 2, b = a + 1, c = a + 2, d = a + 3;
    if (upper) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  for (let k = 0; k < K; k++) {
    const a = S * R + k;
    if (upper) idx.push(a, a + 1, tip); else idx.push(a, tip, a + 1);
  }
  // the root, capped (it is buried, but an open beak can show it)
  const rc = pos.length / 3;
  pos.push(0, upper ? H * 0.4 : -H * lower * 0.4, 0);
  for (let k = 0; k < K; k++) { if (upper) idx.push(k, rc, k + 1); else idx.push(k, k + 1, rc); }
  // every face wound counter-clockwise seen from outside, so the normals
  // point out: wound the other way (as it was) the outer skin was culled
  // and you saw the inside of the far wall — a flat, lopsided wedge
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function makeBeak(B) {
  const color = uniform(new THREE.Color('#3d3c42'));
  // felt: fibres, a soft sheen, the ridge catching the light; darker where
  // it comes out of the fur and along the gape, so its roundness shows
  // even head-on (an evenly lit cone pointing at you is a flat triangle)
  const felt = (upper) => {
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.colorNode = Fn(() => {
      const N = normalize(normalWorld);
      const V = normalize(cameraPosition.sub(positionWorld));
      const p = positionLocal;
      const fib = mx_noise_float(vec3(p.mul(90))).mul(0.07).add(0.96);
      let base = vec3(color).mul(fib);
      // in the fur's shade at the root
      base = base.mul(smoothstep(0.05, 0.3, p.z).mul(0.45).add(0.55));
      // the bill's own roundness, whatever the light: its flanks (normals
      // turned out to the side) fall off toward the gape, the ridge stays
      // lit — so it reads as a solid cone even end-on
      const side = pow(abs(normalize(normalLocal).x), float(1.4));
      if (upper) {
        const ridge = float(1).sub(smoothstep(0.0, 0.035, abs(p.x))).mul(smoothstep(0.04, 0.12, p.y));
        base = base.mul(ridge.mul(0.4).add(1.0)).mul(float(1).sub(side.mul(0.55)));
      } else base = base.mul(0.58).mul(float(1).sub(side.mul(0.35)));
      const rim = pow(float(1).sub(abs(dot(N, V))), float(2.4));
      const lit = shade(base, N, { spec: upper ? 0.32 : 0.12, power: 18, wrap: 0.2 });
      // the silhouette turns away into shadow, with a faint felt halo
      return vec4(lit.mul(float(1).sub(rim.mul(0.35))).add(vec3(0.03, 0.03, 0.035).mul(rim)), 1);
    })();
    return mat;
  };
  const g = new THREE.Group();
  const up = new THREE.Mesh(mandible(B.len, B.w, B.h, true), felt(true));
  const lo = new THREE.Mesh(mandible(B.len * 0.96, B.w * 0.96, B.h, false), felt(false));
  const upG = new THREE.Group(), loG = new THREE.Group();
  upG.add(up); loG.add(lo);
  g.add(upG, loG);
  g.userData = { up: upG, lo: loG, color };
  g.matrixAutoUpdate = false;
  g.visible = false;
  return g;
}

const _m = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

/* F: {base, R, dir, open} from CrowGame.beakFrame(); scale: [thick, long] */
export function poseBeak(g, F, scale = [1, 1]) {
  if (!F) { g.visible = false; return; }
  g.visible = true;
  const R = F.R, d = F.dir;
  // the beak's own frame in the head's rest frame: z along it, y up
  const ry = [0, 1, 0];
  const k = ry[0] * d[0] + ry[1] * d[1] + ry[2] * d[2];
  const yr = [ry[0] - d[0] * k, ry[1] - d[1] * k, ry[2] - d[2] * k];
  const yl = Math.hypot(...yr);
  const w = (v) => new THREE.Vector3(R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]);
  _z.copy(w(d)).normalize();
  _y.copy(w(yr.map((v) => v / yl))).normalize();
  _x.crossVectors(_y, _z).normalize();
  _m.makeBasis(_x, _y, _z).setPosition(F.base[0], F.base[1], F.base[2]);
  g.matrix.copy(_m);
  g.matrix.scale(new THREE.Vector3(scale[0], scale[0], scale[1]));
  g.matrixWorldNeedsUpdate = true;
  // the lower mandible drops open on its hinge; the upper lifts a little
  g.userData.lo.rotation.x = F.open;
  g.userData.up.rotation.x = -F.open * 0.22;
}

/* ── the nest ──────────────────────────────────────────────────────────────
   A ring of twigs (thin tapered sticks, every one at its own angle) round
   a felt-lined bowl the shape the physics uses (crow.game.js NEST).     */
export function makeNest() {
  const g = new THREE.Group();
  const rnd = mulberry32(911);
  const wood = new THREE.MeshBasicNodeMaterial();
  wood.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    const p = positionWorld;
    const tone = mx_noise_float(vec3(p.mul(2.7))).mul(0.5).add(0.5);
    const grain = mx_noise_float(vec3(p.x.mul(40), p.y.mul(40), p.z.mul(40))).mul(0.08).add(0.95);
    const base = mix(vec3(0.3, 0.2, 0.12), vec3(0.55, 0.42, 0.28), tone).mul(grain);
    return vec4(shade(base, N, { spec: 0.05, power: 12, wrap: 0.5 }), 1);
  })();
  const twig = new THREE.CylinderGeometry(0.012, 0.022, 1, 6, 1);
  twig.rotateX(Math.PI / 2);
  const N = 190;
  const sticks = new THREE.InstancedMesh(twig, wood, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  for (let k = 0; k < N; k++) {
    let x, y, z, yaw, pitch, len, th;
    if (k < 150) {
      // the rim: tangent-ish sticks woven round a torus
      const a = rnd() * Math.PI * 2, rr = NEST.rimR + (rnd() - 0.5) * NEST.rimr * 1.7;
      x = Math.cos(a) * rr; z = Math.sin(a) * rr;
      y = NEST.rimY + (rnd() - 0.5) * NEST.rimr * 1.5;
      yaw = -a + (rnd() - 0.5) * 0.9;
      pitch = (rnd() - 0.5) * 0.7;
      len = 0.35 + rnd() * 0.4; th = 0.7 + rnd() * 0.7;
    } else {
      // the floor of the bowl: a few lying across, under the lining's edge
      const a = rnd() * Math.PI * 2, d = NEST.R * (0.75 + rnd() * 0.35);
      x = Math.cos(a) * d; z = Math.sin(a) * d;
      y = NEST.y0 + NEST.dip * (d / NEST.R) ** 2 - 0.01;
      yaw = rnd() * Math.PI; pitch = 0.1; len = 0.4 + rnd() * 0.3; th = 0.8;
    }
    e.set(pitch, yaw, (rnd() - 0.5) * 0.3, 'YXZ');
    q.setFromEuler(e);
    s.set(th, th, len);
    p.set(NEST.c[0] + x, y, NEST.c[1] + z);
    m.compose(p, q, s);
    sticks.setMatrixAt(k, m);
  }
  sticks.frustumCulled = false;
  g.add(sticks);
  // the lining: the bowl's own curve, soft grey felt
  const pts = [];
  for (let k = 0; k <= 14; k++) {
    const d = (k / 14) * (NEST.R + 0.1);
    pts.push(new THREE.Vector2(d, NEST.y0 + NEST.dip * Math.min(1.3, (d / NEST.R) ** 2) - 0.005));
  }
  const lining = new THREE.LatheGeometry(pts, 40);
  const col = new Float32Array(lining.attributes.position.count * 3);
  for (let i = 0; i < col.length / 3; i++) { col[i * 3] = 0.52; col[i * 3 + 1] = 0.47; col[i * 3 + 2] = 0.42; }
  lining.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const lm = new THREE.Mesh(lining, feltMaterial());
  lm.position.set(NEST.c[0], 0, NEST.c[1]);
  g.add(lm);
  g.visible = false;
  return g;
}

/* ── the things ────────────────────────────────────────────────────────── */

/* foil: a crinkled mirror tinted by its vertex colour */
function foilMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial();
  const col = varying(attribute('color', 'vec3'));
  mat.colorNode = Fn(() => {
    const crinkle = vec3(
      mx_noise_float(vec3(positionLocal.mul(70))),
      mx_noise_float(vec3(positionLocal.mul(70).add(5.1))),
      mx_noise_float(vec3(positionLocal.mul(70).add(9.7))),
    ).mul(0.22);
    const N = normalize(normalWorld.add(crinkle));
    const V = normalize(cameraPosition.sub(positionWorld));
    const R = reflect(V.negate(), N);
    const room = mix(vec3(0.3, 0.27, 0.24), vec3(1.0, 0.97, 0.92), smoothstep(-0.3, 0.5, R.y));
    const win = smoothstep(0.9, 0.97, dot(R, vec3(KEY.x, KEY.y, KEY.z))).mul(1.6);
    const fres = pow(float(1).sub(clamp(dot(N, V), 0, 1)), float(2)).mul(0.4);
    return vec4(col.mul(room.mul(0.85).add(0.1)).add(vec3(win)).add(vec3(fres).mul(col)), 1);
  })();
  return mat;
}

const paint = (geo, fn) => {
  const P = geo.attributes.position, col = new Float32Array(P.count * 3), v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const c = fn(v);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
};

function makeCrumb(r) {
  const geo = new THREE.BoxGeometry(1.5 * r, 1.15 * r, 1.3 * r, 4, 3, 4);
  const P = geo.attributes.position, v = new THREE.Vector3(), rnd = mulberry32(5);
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    // rounded and a little torn
    const l = v.length(), k = 0.55 + 0.45 * (r * 0.8 / Math.max(l, 1e-6));
    v.multiplyScalar(Math.min(1, k) * (0.92 + rnd() * 0.12));
    P.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const crust = new THREE.Color('#b9772f'), soft = new THREE.Color('#ecd7a8');
  paint(geo, (p) => (p.y > r * 0.35 || p.x < -r * 0.5 ? crust : soft).clone().lerp(soft, 0.15));
  return new THREE.Mesh(geo, feltMaterial());
}

function makeBerry(r) {
  const geo = new THREE.SphereGeometry(r, 20, 14);
  paint(geo, (p) => (p.y > r * 0.82 ? new THREE.Color('#2c4a26') : new THREE.Color('#3a2a6a').lerp(new THREE.Color('#5a3f8c'), Math.max(0, p.x / r) * 0.5)));
  const mat = new THREE.MeshBasicNodeMaterial();
  const col = varying(attribute('color', 'vec3'));
  mat.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    return vec4(shade(col, N, { spec: 0.9, power: 60, wrap: 0.4 }), 1);
  })();
  return new THREE.Mesh(geo, mat);
}

function makeButton(r) {
  // a felt button faced with foil: a disc, its rim raised, four holes
  const geo = new THREE.CylinderGeometry(r * 0.95, r * 0.95, r * 0.34, 36, 1);
  const holes = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([a, b]) => [a * r * 0.24, b * r * 0.24]);
  const gold = new THREE.Color('#d9b45a'), dark = new THREE.Color('#2b2216'), rim = new THREE.Color('#f0d68e');
  paint(geo, (p) => {
    if (Math.abs(p.y) > r * 0.16) {
      for (const [hx, hz] of holes) if (Math.hypot(p.x - hx, p.z - hz) < r * 0.12) return dark;
      return Math.hypot(p.x, p.z) > r * 0.75 ? rim : gold;
    }
    return rim;
  });
  // more vertices on the faces, so the holes show
  return new THREE.Mesh(geo, foilMaterial());
}

function makeCap(r) {
  const geo = new THREE.CylinderGeometry(r * 0.92, r * 0.98, r * 0.5, 42, 2, false);
  const P = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const a = Math.atan2(v.z, v.x), l = Math.hypot(v.x, v.z);
    if (l > r * 0.85 && v.y < r * 0.2) {
      // the crimped skirt
      const k = 1 + 0.07 * Math.cos(a * 21);
      P.setXYZ(i, v.x * k, v.y, v.z * k);
    }
  }
  geo.computeVertexNormals();
  const red = new THREE.Color('#c23a2c'), silver = new THREE.Color('#d8d8dc');
  paint(geo, (p) => (p.y > r * 0.2 && Math.hypot(p.x, p.z) < r * 0.82 ? red : silver));
  return new THREE.Mesh(geo, foilMaterial());
}

function makeKey(r) {
  const brass = new THREE.Color('#d4a84a');
  const bow = new THREE.TorusGeometry(r * 0.42, r * 0.13, 10, 24);
  bow.translate(-r * 0.75, 0, 0);
  const shaft = new THREE.BoxGeometry(r * 1.3, r * 0.17, r * 0.12);
  shaft.translate(r * 0.3, 0, 0);
  const bit = new THREE.BoxGeometry(r * 0.32, r * 0.34, r * 0.12);
  bit.translate(r * 0.78, -r * 0.22, 0);
  const g = new THREE.Group();
  const mat = foilMaterial();
  for (const geo of [bow, shaft, bit]) { paint(geo, () => brass); g.add(new THREE.Mesh(geo, mat)); }
  return g;
}

const MAKERS = { crumb: makeCrumb, berry: makeBerry, button: makeButton, cap: makeCap, key: makeKey };

/* one mesh per thing, made on first sight and dropped when it's gone */
export function makeItems() {
  const g = new THREE.Group();
  g.userData.meshes = new Map();
  return g;
}

export function poseItems(g, items) {
  const M = g.userData.meshes;
  const live = new Set();
  for (const it of items || []) {
    if (it.state === 'gone') continue;
    live.add(it.id);
    let m = M.get(it.id);
    if (!m) { m = MAKERS[it.sub](ITEMS[it.sub].r); m.frustumCulled = false; M.set(it.id, m); g.add(m); }
    const b = it.ball;
    m.position.set(b.x[0], b.x[1], b.x[2]);
    m.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    m.scale.setScalar(Math.max(0.001, 1 - (it.gulp || 0) * 0.95));
  }
  for (const [id, m] of M) if (!live.has(id)) {
    g.remove(m);
    m.traverse((o) => o.geometry?.dispose());
    M.delete(id);
  }
}
