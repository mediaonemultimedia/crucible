/* The Sith twins and the Jedi originals (cosmetic only: nothing here
   reaches the sim).

   Johnny Deuce, Sebas Perra and Kevalanche have evil twins that read as
   the dark side of the same fighter: a hooded cowl and a short cloak over
   their evil colours, eyes that glow red (Kevalanche's other eye under a
   patch with a red-hot edge; Sebas's through the rudo's mask), and red
   swing trails. Evil Johnny swings a red racquet — glossy red frame, red
   strings, a white stencilled mark, a black-and-red striped throat, a
   black grip — that hums: a red rim glow that shimmers along the frame.

   Everyone else's evil twin gets the red trails; every original swings
   with a cool blue-white trail (the Jedi side), Johnny's racquet most of
   all. The trail follows the bit of the plush that does the hitting: the
   soft-body point nearest the sim's active hit box, traced back through
   the last few frames so the wind-up's arc shows too (Johnny: the
   racquet's head, every swing).                                         */

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, float, vec3, vec4, positionLocal, normalWorld, cameraPosition, positionWorld,
  mix, smoothstep, normalize, dot, pow, abs, sin, fract, Discard, mx_noise_float, atan, frontFacing, select,
  attribute, varying, length, uv, clamp, texture,
} from 'three/tsl';
import { shade } from '../../shared/grommet/props.js';
import { RQ } from '../../shared/grommet/athletes/leopard.game.js';

/* the fighters with the full Sith look (the rest: trails only) */
export const SITH = { johnny: true, sebas: true, kevalanche: true };

/* app time for the hum and the eye flicker (any plush may advance it) */
export const SITH_T = uniform(0);

const RED = new THREE.Color('#ff2a1f'), BLUE = new THREE.Color('#7fd4ff');

/* ── the red racquet ──────────────────────────────────────────────────────
   Built like Grommet's (props.js makeRacquet: along +y from the grip, the
   head across x, strung in x-y, face normal +z) so poseRacquet places it. */

/* the string bed: red strings, a white stencilled mark painted over them —
   two jagged strokes like a pair of 2s back to back (Deuce), with the
   stencil's bridges left open */
function stringTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  // the mark: a broad angular 'W'-ish stencil in the middle of the bed
  g.fillStyle = '#fff';
  const W = [[0.17, 0.26], [0.31, 0.26], [0.39, 0.6], [0.47, 0.36], [0.53, 0.36], [0.61, 0.6], [0.69, 0.26], [0.83, 0.26], [0.68, 0.76], [0.56, 0.76], [0.5, 0.56], [0.44, 0.76], [0.32, 0.76]];
  g.beginPath();
  W.forEach(([x, y], k) => (k ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S)));
  g.closePath();
  g.fill();
  // stencil bridges (the gaps a spray stencil leaves)
  g.globalCompositeOperation = 'destination-out';
  g.fillRect(0.36 * S, 0.44 * S, 0.06 * S, 0.035 * S);
  g.fillRect(0.58 * S, 0.44 * S, 0.06 * S, 0.035 * S);
  g.fillRect(0.47 * S, 0.62 * S, 0.06 * S, 0.03 * S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeSithRacquet() {
  const g = new THREE.Group();
  // glossy red lacquer: a hard specular and a clear-coat rim
  const lacquer = new THREE.MeshBasicNodeMaterial();
  lacquer.colorNode = Fn(() => {
    const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
    const rim = pow(float(1).sub(abs(dot(N, V))), float(3)).mul(0.5);
    return vec4(shade(vec3(0.86, 0.05, 0.03), N, { spec: 0.9, power: 80, wrap: 0.35 }).add(vec3(1, 0.25, 0.15).mul(rim)), 1);
  })();
  // the throat: dark red-black diagonal stripes, a little gloss
  const stripes = new THREE.MeshBasicNodeMaterial();
  stripes.colorNode = Fn(() => {
    const p = positionLocal;
    const band = smoothstep(0.42, 0.5, fract(p.y.mul(9).add(p.x.mul(14))));
    const base = mix(vec3(0.08, 0.01, 0.015), vec3(0.62, 0.03, 0.03), band);
    return vec4(shade(base, normalize(normalWorld), { spec: 0.7, power: 60, wrap: 0.4 }), 1);
  })();
  const black = new THREE.MeshBasicNodeMaterial();
  black.colorNode = Fn(() => {
    const p = positionLocal;
    const a = atan(p.x, p.z).div(Math.PI * 2);
    const ridge = smoothstep(0.0, 0.12, fract(p.y.mul(13).add(a))).mul(0.05);
    return vec4(shade(vec3(0.035, 0.03, 0.035).add(ridge), normalize(normalWorld), { spec: 0.25, power: 24 }), 1);
  })();
  const white = new THREE.MeshBasicNodeMaterial();
  white.colorNode = Fn(() => vec4(shade(vec3(0.95, 0.94, 0.93), normalize(normalWorld), { spec: 0.3 }), 1))();
  // red strings with the white stencil on them; the gaps between strings cut out
  const tex = stringTexture();
  const strings = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  strings.colorNode = Fn(() => {
    const p = positionLocal;
    const gap = 0.052;
    const sx = abs(fract(p.x.div(gap)).sub(0.5)), sy = abs(fract(p.y.sub(RQ.head).div(gap)).sub(0.5));
    const on = smoothstep(0.34, 0.4, sx).add(smoothstep(0.34, 0.4, sy));
    Discard(on.lessThan(0.5));
    const N0 = normalize(normalWorld);
    const N = select(frontFacing, N0, N0.negate());
    const mark = texture(tex, uv()).a;
    const base = mix(vec3(0.82, 0.06, 0.04), vec3(0.97, 0.96, 0.95), mark);
    return vec4(shade(base, N, { spec: 0.3, power: 30, wrap: 0.7 }), 1);
  })();

  const ell = [];
  for (let k = 0; k < 48; k++) {
    const t = (k / 48) * Math.PI * 2;
    ell.push(new THREE.Vector3(RQ.b * Math.sin(t), RQ.head - RQ.a * Math.cos(t), 0));
  }
  const curve = new THREE.CatmullRomCurve3(ell, true);
  const head = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, RQ.frame * 1.12, 10, true), lacquer);
  for (const s of [-1, 1]) {
    const c = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(s * RQ.b * 0.62, RQ.head - RQ.a * 0.8, 0),
      new THREE.Vector3(s * 0.05, RQ.throat - 0.08, 0),
      new THREE.Vector3(0, RQ.grip + 0.02, 0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(c, 16, RQ.frame * 0.95, 8, false), stripes));
  }
  // the bridge across the throat, and the little white badge on it
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(RQ.frame * 0.7, RQ.frame * 0.7, RQ.b * 1.1, 10), lacquer);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.y = RQ.head - RQ.a * 0.86;
  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.02), white);
  badge.position.set(0, RQ.throat - 0.02, 0.045);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, RQ.grip, 14), stripes);
  shaft.position.y = RQ.grip / 2 + 0.02;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.066, RQ.grip - RQ.butt, 20, 8), black);
  grip.position.y = (RQ.grip + RQ.butt) / 2;
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.074, 0.074, 0.045, 20), lacquer);
  butt.position.y = RQ.butt;
  const face = new THREE.Mesh(new THREE.CircleGeometry(1, 48), strings);
  face.scale.set(RQ.b, RQ.a, 1);
  face.position.y = RQ.head;

  // the hum: a red glow round the frame, brightest at the silhouette,
  // a shimmer running round it and a slow throb
  const glow = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  glow.colorNode = Fn(() => {
    const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
    const edge = pow(float(1).sub(abs(dot(N, V))), float(1.6));
    const p = positionLocal;
    const shimmer = mx_noise_float(vec3(p.x.mul(9), p.y.mul(9).sub(SITH_T.mul(5)), SITH_T.mul(1.7))).mul(0.5).add(0.5);
    const throb = sin(SITH_T.mul(7.5)).mul(0.12).add(0.88);
    const a = edge.mul(shimmer.mul(0.7).add(0.45)).mul(throb).mul(0.85);
    return vec4(vec3(1, 0.16, 0.08).mul(a), a);
  })();
  const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, RQ.frame * 2.1, 12, true), glow);
  halo.renderOrder = 3;
  g.add(head, halo, shaft, grip, butt, face, bridge, badge);
  g.traverse((o) => { o.frustumCulled = false; });
  g.matrixAutoUpdate = false;
  g.userData.halo = halo;
  return g;
}

/* ── the hooded cowl and the cloak ────────────────────────────────────────
   Heavy dark wool: near-black with a deep oxblood cast, the inside darker
   still, a faint red at the silhouette (the glow of the eyes inside). */
function robeMaterial(lining) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const L = vec3(...lining);
  m.colorNode = Fn(() => {
    const N0 = normalize(normalWorld);
    const N = select(frontFacing, N0, N0.negate());
    const V = normalize(cameraPosition.sub(positionWorld));
    const p = positionLocal;
    // a soft twill: fine diagonal ribs, barely there
    const twill = smoothstep(0.3, 0.7, fract(p.x.add(p.y).mul(60))).mul(0.004);
    const outside = vec3(0.026, 0.017, 0.021).add(twill);
    const base = select(frontFacing, outside, L);
    const glowIn = select(frontFacing, vec3(0, 0, 0), L.mul(0.5));
    // a red rim light at the silhouette (the dark side's back light)
    const rim = pow(float(1).sub(abs(dot(N, V))), float(6)).mul(0.3);
    const sheen = select(frontFacing, rim, rim.mul(1.4));
    return vec4(shade(base, N, { spec: 0.025, power: 8, wrap: 0.45 }).add(glowIn).add(vec3(0.6, 0.035, 0.03).mul(sheen)), 1);
  })();
  return m;
}

/* a cowl over the back and top of the head, open wide at the face (+z),
   the ears through it; r: the head part's radii */
export function makeHood(r, k = 1.2) {
  const g = new THREE.Group();
  const src = new THREE.SphereGeometry(1, 48, 28, 0, Math.PI * 2, 0, Math.PI * 0.64);
  // the face window: an oval cut out of the front, brow to chin, so the crown
  // and the sides stay covered; the brow edge brought forward a little
  const P = src.attributes.position;
  const face = (x, y, z) => {
    const az = Math.atan2(x, z), el = Math.asin(Math.max(-1, Math.min(1, y)));
    return (az / 1.05) ** 2 + ((el + 0.25) / 0.72) ** 2;
  };
  for (let i = 0; i < P.count; i++) {
    let x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const f = face(x, y, z);
    if (f < 1.6 && y > 0.1 && z > 0) z += (1.6 - f) * 0.12;
    if (z < 0 && y < 0.25) y -= (0.25 - y) * 0.7 * Math.min(1, -z * 1.6);
    // soft folds: wool gathered round the head, deeper at the back and the drape
    const az = Math.atan2(x, z), back = Math.max(0, -z), w = 1 + (Math.sin(az * 7 + y * 4) * 0.04 + Math.sin(az * 13 - y * 9) * 0.015) * (0.4 + back);
    P.setXYZ(i, x * w, y, z * w);
  }
  const ix = src.index.array, keep = [];
  for (let t = 0; t < ix.length; t += 3) {
    let cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < 3; j++) { cx += P.getX(ix[t + j]) / 3; cy += P.getY(ix[t + j]) / 3; cz += P.getZ(ix[t + j]) / 3; }
    const l = Math.hypot(cx, cy, cz) || 1;
    if (face(cx / l, cy / l, cz / l) >= 1) keep.push(ix[t], ix[t + 1], ix[t + 2]);
  }
  src.setIndex(keep);
  src.computeVertexNormals();
  const hood = new THREE.Mesh(src, robeMaterial([0.09, 0.006, 0.01]));
  hood.scale.set(r[0] * k, r[1] * (k + 0.04), r[2] * k);
  hood.position.set(0, r[1] * 0.06, -r[2] * 0.04);
  g.add(hood);
  g.traverse((o) => { o.frustumCulled = false; });
  g.visible = false;
  return g;
}

/* a cloak from the shoulders to the shins round the back and sides, open
   at the front, lined in crimson; r: the torso's radii, h: its length */
export function makeCloak(r, h) {
  const g = new THREE.Group();
  const prof = [];
  const top = r[0] * 0.95, bot = r[0] * 1.55;
  for (let k = 0; k <= 14; k++) {
    const t = k / 14;
    prof.push(new THREE.Vector2(top + (bot - top) * Math.pow(t, 0.7), -h * t));
  }
  // a shoulder yoke: the top edge turned in toward the neck
  prof.unshift(new THREE.Vector2(r[0] * 0.55, h * 0.04));
  const half = Math.PI * 0.66;          // round the back (−z), each way
  const geo = new THREE.LatheGeometry(prof, 48, Math.PI - half, 2 * half);
  // folds: a ripple round it, deeper toward the hem; the depth follows the torso
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const a = Math.atan2(x, z), d = Math.max(0, -y / h);
    const f = 1 + Math.sin(a * 8) * 0.06 * d;
    P.setXYZ(i, x * f, y, z * f * (r[2] / r[0]) * 1.1 - d * 0.12);
  }
  geo.computeVertexNormals();
  g.add(new THREE.Mesh(geo, robeMaterial([0.3, 0.012, 0.02])));
  g.traverse((o) => { o.frustumCulled = false; });
  g.visible = false;
  return g;
}

/* ── eyes: a red glow round a bead, the patch ─────────────────────────── */
function glowMaterial(color, k = 1) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const c = vec3(color.r, color.g, color.b);
  m.colorNode = Fn(() => {
    const d = length(uv().sub(0.5)).mul(2);
    const flick = sin(SITH_T.mul(11)).mul(0.06).add(sin(SITH_T.mul(3.1)).mul(0.08)).add(0.86);
    const a = pow(clamp(float(1).sub(d), 0, 1), float(1.8)).mul(flick).mul(k);
    return vec4(c.mul(a).add(vec3(1, 0.8, 0.7).mul(pow(a, float(3)).mul(0.5))), a);
  })();
  return m;
}

export function makeEyeGlow() {
  const mat = glowMaterial(RED, 1.15);
  mat.depthTest = false;             // a glow: it shows past the muzzle's fur
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.renderOrder = 6;
  m.frustumCulled = false;
  return m;
}

/* the patch: a black leather lozenge over the eye with a thin red-hot edge
   (the hood covers where a strap would go); unit size = the eye's */
export function makeEyePatch() {
  const g = new THREE.Group();
  const leather = new THREE.MeshBasicNodeMaterial();
  leather.colorNode = Fn(() => vec4(shade(vec3(0.02, 0.018, 0.022), normalize(normalWorld), { spec: 0.5, power: 40 }), 1))();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 14), leather);
  disc.scale.set(1.55, 1.35, 0.5);
  const hot = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  hot.colorNode = Fn(() => vec4(vec3(1, 0.12, 0.06).mul(sin(SITH_T.mul(6)).mul(0.15).add(0.85)), 1))();
  const edge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 8, 40), hot);
  edge.scale.set(1.5, 1.3, 1);
  edge.position.z = 0.12;
  g.add(disc, edge);
  g.traverse((o) => { o.frustumCulled = false; });
  g.visible = false;
  return g;
}

/* ── the swing trail ──────────────────────────────────────────────────────
   A ribbon in world space through the striking point's last positions,
   facing the camera (the side view: widened across the path in the
   screen's plane), bright at the head, tapering and fading to the tail. */
const MAXP = 28;
export class Trail {
  constructor(scene, color, { width = 0.2, life = 0.24 } = {}) {
    this.color = color === 'red' ? RED : BLUE;
    this.width = width;
    this.life = life;
    this.pts = [];                       // { x, y, z, t }
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAXP * 2 * 3);
    this.fade = new Float32Array(MAXP * 2 * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.fade, 2));   // (x: head → tail, y: across)
    const idx = [];
    for (let i = 0; i < MAXP - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    geo.setDrawRange(0, 0);
    this.geo = geo;
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const c = vec3(this.color.r, this.color.g, this.color.b);
    m.colorNode = Fn(() => {
      const f = uv();
      // f.x: 1 at the head → 0 at the tail; f.y: −1 → 1 across
      const across = float(1).sub(abs(f.y));
      const core = pow(across, float(4)).mul(f.x);
      const a = pow(across, float(1.2)).mul(f.x).mul(f.x).mul(0.9);
      return vec4(c.mul(a.mul(1.7)).add(vec3(1, 1, 1).mul(core.mul(0.8))), a);
    })();
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.time = 0;
  }

  push(x, y, z) {
    const L = this.pts[this.pts.length - 1];
    if (L && Math.hypot(L.x - x, L.y - y, L.z - z) < 0.015) { L.t = this.time; return; }
    this.pts.push({ x, y, z, t: this.time });
    if (this.pts.length > MAXP) this.pts.shift();
  }

  update(dt) {
    this.time += dt;
    this.pts = this.pts.filter((p) => this.time - p.t < this.life);
    const n = this.pts.length;
    if (n < 2) { this.geo.setDrawRange(0, 0); return; }
    for (let i = 0; i < n; i++) {
      const p = this.pts[i], q = this.pts[Math.min(n - 1, i + 1)], o = this.pts[Math.max(0, i - 1)];
      let tx = q.x - o.x, ty = q.y - o.y;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl; ty /= tl;
      const age = 1 - (this.time - p.t) / this.life, along = (i + 1) / n;
      const head = Math.max(0, Math.min(1, age * along * 1.3));
      const w = this.width * (0.25 + 0.75 * along) * (0.4 + 0.6 * age);
      // across the path in the screen's plane
      const nx = -ty * w, ny = tx * w;
      this.pos.set([p.x + nx, p.y + ny, p.z + 0.05, p.x - nx, p.y - ny, p.z + 0.05], i * 6);
      this.fade.set([head, -1, head, 1], i * 4);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
    this.geo.setDrawRange(0, (n - 1) * 6);
  }

  clear() { this.pts = []; this.geo.setDrawRange(0, 0); }

  dispose(scene) { scene.remove(this.mesh); this.geo.dispose(); }
}
