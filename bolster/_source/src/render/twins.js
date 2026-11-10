/* The evil twins, each their own character (cosmetic only: nothing here
   reaches the sim). Evil Sebas (the rudo's mask) and Evil Johnny (the red
   racquet, black tennis whites) keep the Sith looks of render/sith.js; these five are
   built like the octopus is: the look is in the plush itself — its fur
   colours, the pile's length and lie, the printed pattern and the stitched
   lines in the atlases — and the few things it wears are felt, leather or
   metal sewn to the soft body, carried by its points each frame:

   - Kevalanche, hockey goon: a black bear (near-black brown, a tan
     muzzle) with a hockey mullet (the top and sides cropped, nine wavy
     plush locks down the nape to the shoulders, tips flipped out, on
     render-only springs), a black eye (a bruised ring round the eye nearer
     the camera), one felt front tooth with a gap beside it, and plush
     hockey gloves in royal blue and orange (render/gloves.js).
   - Rubberta, anglerfish: abyss-black flock with glowing photophores (the
     fur's spots lit from within), glowing rings round the eyes, a grimace
     of needle teeth embroidered in pale thread, and a lure: a felt stalk
     from the top of her head arching over her face, a glowing bulb
     dangling from it on a thread (it swings).
   - Sumaura, Bond villain: an inverted panda (black fur, white eye patches
     and limbs), a tuxedo printed on — a white shirt front with a black bow
     tie and studs, satin lapels (the pile cut short), a white pocket
     square, the mawashi a black satin cummerbund — and a scar stitched
     across one eye patch.
   - K8-E, punk: charcoal with near-black patches, a neon mohawk — the mane
     down the back of her neck grown long and hot magenta, running up over
     her head to the forehead — a spiked leather collar at the base of the
     neck, a stitched handlebar moustache, a septum ring.
   - Zach Sparrow, ghost pirate: bleached white feathers, glowing red eyes,
     a bone-grey beak, a tattered felt tricorn.                          */

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, attribute, float, vec2, vec3, vec4, positionLocal, normalWorld, normalLocal, cameraPosition, positionWorld,
  mix, smoothstep, clamp, normalize, dot, pow, abs, sin, fract, mx_noise_float, length, uv, varying, max,
  instanceIndex, floor, Discard,
} from 'three/tsl';
import { shade } from '../../shared/grommet/props.js';
import { extractRotation, quatToMat } from '../../shared/grommet/math.js';
import { SITH_T, makeEyeGlow } from './sith.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/* ── the atlases ──────────────────────────────────────────────────────────── */

const gridOf = (rig, name) => rig.parts.find((p) => p.kind === 'grid' && p.name === name);
const tubeOf = (rig, name) => rig.parts.find((p) => p.kind === 'tube' && p.name === name);

/* (u, v) on a grid part → atlas pixels; u wraps (0.5 the front), v top→bottom */
function painter(tex, rig, name) {
  const size = tex.userData.size, part = gridOf(rig, name), R = rig.regions[part.region];
  const at = (u, v) => [(R.x0 + u * (R.x1 - R.x0)) * size, (R.y0 + v * (R.y1 - R.y0)) * size];
  const g = tex.userData.ctx;
  // world size (w × h) at v → pixels
  const px = (v, w, h) => {
    const sp = Math.max(0.2, Math.sin(v * Math.PI));
    return [w / (2 * Math.PI * Math.max(part.r[0], part.r[2]) * sp) * (R.x1 - R.x0) * size, h / (Math.PI * part.r[1]) * (R.y1 - R.y0) * size];
  };
  const poly = (pts) => { pts.forEach(([u, v], k) => { const [x, y] = at(u, v); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  const ell = (u, v, w, h, rot = 0) => { const [x, y] = at(u, v), [rx, ry] = px(v, w, h); g.moveTo(x + rx, y); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); };
  const line = (pts, w) => {
    const [, ry] = px(pts[0][1], w, w);
    g.lineWidth = Math.max(1.5, ry * 2); g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); pts.forEach(([u, v], k) => { const [x, y] = at(u, v); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  };
  return { g, at, px, poly, ell, line, size, R };
}

/* a soft-edged radial blob: colour 'rgb(r,g,b)' fading to transparent */
function softBlob(P, u, v, w, h, rgb, a0 = 1, inner = 0.55) {
  const [x, y] = P.at(u, v), [rx, ry] = P.px(v, w, h);
  const gr = P.g.createRadialGradient(0, 0, 0, 0, 0, 1);
  gr.addColorStop(0, `rgba(${rgb},${a0})`); gr.addColorStop(inner, `rgba(${rgb},${a0})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  P.g.save(); P.g.translate(x, y); P.g.scale(rx, ry); P.g.fillStyle = gr;
  P.g.beginPath(); P.g.arc(0, 0, 1, 0, Math.PI * 2); P.g.fill(); P.g.restore();
}

/* edit one channel of an atlas rectangle in place: fn(value 0–255, x, y) */
function channel(tex, x0, y0, w, h, ch, fn) {
  const g = tex.userData.ctx, S = tex.userData.size;
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  w = Math.min(S - x0, Math.ceil(w)); h = Math.min(S - y0, Math.ceil(h));
  if (w <= 0 || h <= 0) return;
  const im = g.getImageData(x0, y0, w, h), d = im.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4 + ch; d[i] = Math.max(0, Math.min(255, fn(d[i], x0 + x, y0 + y))); }
  g.putImageData(im, x0, y0);
}

/* wrap a grid's or a chain's look functions before the Body is built */
function wrapGrid(rig, name, k, f) { const P = gridOf(rig, name); const old = P[k] || (() => (k === 'pile' ? 1 : 0)); P[k] = (u, v, l) => f(old(u, v, l), u, v, l); }
function wrapChain(rig, name, k, f) { const C = rig.arms.find((c) => c.name === name); const old = C[k]; C[k] = (s, c) => f(old(s, c), s, c); }

/* ── materials: the same hand lighting as the plush's props ─────────────── */

/* felt: fine fibres, a soft fuzzy rim, almost no gloss */
function feltMat(color, { fib = 0.08, fuzz = 0.26, spec = 0.04, side = THREE.FrontSide, scale = 60 } = {}) {
  const m = new THREE.MeshBasicNodeMaterial({ side });
  const c = color.isNode ? color : uniform(new THREE.Color(color));
  m.colorNode = Fn(() => {
    const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
    const f = mx_noise_float(vec3(positionLocal.mul(scale))).mul(fib).add(1 - fib / 3);
    const base = vec3(c).mul(f);
    const rim = pow(float(1).sub(abs(dot(N, V))), float(2.2));
    return vec4(shade(base, N, { spec, power: 8, wrap: 0.5 }).add(base.mul(rim.mul(fuzz))), 1);
  })();
  m.userData.color = c;
  return m;
}
/* polished metal: a cool studio reflection */
function metalMat(tint = [0.82, 0.83, 0.86]) {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = Fn(() => {
    const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
    const rim = pow(float(1).sub(abs(dot(N, V))), float(2));
    const env = mix(vec3(0.18, 0.17, 0.2), vec3(1, 0.98, 0.96), smoothstep(-0.2, 0.7, N.y));
    return vec4(shade(vec3(...tint).mul(0.55), N, { spec: 1.1, power: 60, wrap: 0.3 }).add(env.mul(0.25)).add(vec3(rim.mul(0.25))), 1);
  })();
  return m;
}
/* leather: a little gloss, a stitched edge (v of the band's uv near 0 or 1) */
function leatherMat(color) {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    const t = uv().y;
    const edge = smoothstep(0.2, 0.12, abs(t.sub(0.5)).negate().add(0.5));
    const dash = smoothstep(0.35, 0.5, fract(uv().x.mul(90)));
    const grain = mx_noise_float(vec3(positionLocal.mul(140))).mul(0.06).add(0.97);
    const base = vec3(...color).mul(grain).add(vec3(0.16).mul(edge.mul(dash).mul(0.6)));
    return vec4(shade(base, N, { spec: 0.45, power: 30, wrap: 0.45 }), 1);
  })();
  return m;
}
/* a glow: additive, round, bright in the middle (on a camera-facing sprite) */
function glowSprite(color, k = 1) {
  const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const c = new THREE.Color(color);
  m.colorNode = Fn(() => {
    const d = length(uv().sub(0.5)).mul(2);
    const pulse = sin(SITH_T.mul(2.3)).mul(0.08).add(0.92);
    const a = pow(clamp(float(1).sub(d), 0, 1), float(2.2)).mul(k).mul(pulse);
    return vec4(vec3(c.r, c.g, c.b).mul(a).add(vec3(pow(a, float(3)).mul(0.6))), a);
  })();
  const s = new THREE.Sprite(m);
  s.renderOrder = 6;
  s.frustumCulled = false;
  return s;
}

/* ── frames off the soft body ────────────────────────────────────────────── */

const _P = new THREE.Vector3(), _N = new THREE.Vector3(), _M = new THREE.Matrix4();

/* the head's own turn (its core points' best rotation from rest), its
   centre, as a Matrix4 — so a hat or a lure turns with the head, not the
   body (a bird's head is in the body's cloud) */
class HeadFrame {
  constructor(plush) {
    this.soft = plush.soft;
    this.core = plush.puppet.cfg?.core || plush.rig.head;
    const rest = plush.rig.rest, c0 = [0, 0, 0];
    for (const i of this.core) for (let d = 0; d < 3; d++) c0[d] += rest[i * 3 + d] / this.core.length;
    this.c0 = c0;
    this.q0 = new Float64Array(this.core.length * 3);
    this.core.forEach((i, j) => { for (let d = 0; d < 3; d++) this.q0[j * 3 + d] = rest[i * 3 + d] - c0[d]; });
    this.A = new Float64Array(9); this.q = new Float64Array([0, 0, 0, 1]); this.R = new Float64Array(9);
    this.c = [0, 0, 0];
    this.m = new THREE.Matrix4();
  }
  update() {
    const x = this.soft.x, core = this.core, q0 = this.q0, A = this.A, c = this.c, n = core.length;
    c[0] = c[1] = c[2] = 0;
    for (const i of core) { c[0] += x[i * 3]; c[1] += x[i * 3 + 1]; c[2] += x[i * 3 + 2]; }
    c[0] /= n; c[1] /= n; c[2] /= n;
    A.fill(0);
    for (let j = 0; j < n; j++) {
      const i = core[j], px = x[i * 3] - c[0], py = x[i * 3 + 1] - c[1], pz = x[i * 3 + 2] - c[2];
      const qx = q0[j * 3], qy = q0[j * 3 + 1], qz = q0[j * 3 + 2];
      A[0] += px * qx; A[1] += px * qy; A[2] += px * qz; A[3] += py * qx; A[4] += py * qy; A[5] += py * qz; A[6] += pz * qx; A[7] += pz * qy; A[8] += pz * qz;
    }
    extractRotation(A, this.q, 4);
    quatToMat(this.q, this.R);
    const R = this.R;
    this.m.set(R[0], R[1], R[2], c[0], R[3], R[4], R[5], c[1], R[6], R[7], R[8], c[2], 0, 0, 0, 1);
    return this.m;
  }
  /* a head-local point (relative to the rest centre) → the group's frame */
  point(l, out) { const R = this.R, c = this.c; return out.set(c[0] + R[0] * l[0] + R[1] * l[1] + R[2] * l[2], c[1] + R[3] * l[0] + R[4] * l[1] + R[5] * l[2], c[2] + R[6] * l[0] + R[7] * l[1] + R[8] * l[2]); }
}

/* a frame sitting on the plush's skin at a grid point: z the surface
   normal, y the head's up (made square to it) */
function skinMatrix(plush, part, u, v, up, out, lift = 0) {
  plush.body.surfacePoint(part, u, v, _P, _N);
  const Z = _N.clone().normalize(), Y = up.clone().addScaledVector(Z, -up.dot(Z)).normalize(), X = new THREE.Vector3().crossVectors(Y, Z);
  out.makeBasis(X, Y, Z).setPosition(_P.x + Z.x * lift, _P.y + Z.y * lift, _P.z + Z.z * lift);
  return out;
}

/* the ring of a tube part at s (its centre, its axis, its mean radius) */
export function tubeRing(body, partName, s) {
  const P = body.parts.find((q) => q.name === partName);
  const j = Math.max(0, Math.min(P.AS - 1, Math.round(s * (P.AS - 1)))), AA = P.AA, pos = body.pos;
  const c = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let i = 0; i < AA; i++) { const v = P.o + j * (AA + 1) + i; c.x += pos[v * 3]; c.y += pos[v * 3 + 1]; c.z += pos[v * 3 + 2]; }
  c.multiplyScalar(1 / AA);
  const j2 = Math.min(P.AS - 1, j + 1), j1 = j2 === j ? j - 1 : j;
  for (let i = 0; i < AA; i++) {
    const v1 = P.o + j1 * (AA + 1) + i, v2 = P.o + j2 * (AA + 1) + i;
    a.x += pos[v2 * 3] - pos[v1 * 3]; a.y += pos[v2 * 3 + 1] - pos[v1 * 3 + 1]; a.z += pos[v2 * 3 + 2] - pos[v1 * 3 + 2];
  }
  a.normalize();
  // the ring's angle-0 vertex: the chain's reference side (the front, a neck)
  const v0 = P.o + j * (AA + 1);
  b.set(pos[v0 * 3] - c.x, pos[v0 * 3 + 1] - c.y, pos[v0 * 3 + 2] - c.z);
  const r = b.length();
  b.addScaledVector(a, -b.dot(a)).normalize();
  return { c, axis: a, ref: b, r };
}

/* ── Kevalanche: the hockey goon ─────────────────────────────────────────── */

function makeTooth() {
  // one front tooth, a little felt tab sewn under the lip: rounded corners,
  // slightly domed; the other's gap is the lip's dark shadow beside it
  const s = new THREE.Shape();
  const w = 0.5, h = 0.62, r = 0.16;
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(w / 2, -h + r); s.quadraticCurveTo(w / 2, -h, w / 2 - r, -h);
  s.lineTo(-w / 2 + r, -h); s.quadraticCurveTo(-w / 2, -h, -w / 2, -h + r); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 4, curveSegments: 6 });
  geo.translate(0, 0.05, -0.1);
  const m = new THREE.Mesh(geo, feltMat('#efe8d6', { fib: 0.05, fuzz: 0.2, scale: 30 }));
  m.matrixAutoUpdate = false;
  return m;
}

/* the mullet: nine soft plush locks from the back of the head down the
   nape to the shoulders, wavy (an S each, alternating), fat in the middle,
   tapering, the tips flipped out. Each rides the head's own frame and
   lags it on a render-only spring (the feel pass's approach): the lock's
   tip is driven by its own acceleration (the strike, a hit, a landing, the
   walk's bob and sway) and by gravity when the head tips (hit, K.O.), the
   bend growing toward the tip. Every frame each lock is pushed out of the
   torso and the head (ellipsoids padded for the fur), so it never clips
   through his shoulders or back. Nothing reaches the sim. */
const LOCK_N = 22, LOCK_R = 12, LOCK_SHELLS = 14, LOCK_PILE = 0.05;
/* a lock's plush: the same idea as the body's shell fur (the lock drawn
   LOCK_SHELLS times, each pushed out along the normal, cut to strands), its
   strands in rows slanting round the lock so they spiral like a curl; dark
   roots, frosted tips, a soft matte light */
const hash2 = (p) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));
function lockMat(color) {
  const m = new THREE.MeshBasicNodeMaterial();
  const c = uniform(new THREE.Color(color));
  const h = float(instanceIndex).div(LOCK_SHELLS - 1);
  m.positionNode = positionLocal.add(normalLocal.mul(h.mul(LOCK_PILE)));
  const vH = varying(h);
  m.colorNode = Fn(() => {
    const t = uv();
    const q = vec2(t.x.mul(24).add(t.y.mul(8)), t.y.mul(48));
    const cell = floor(q), f = fract(q);
    const o = vec2(hash2(cell), hash2(cell.add(19.19))).mul(0.5).add(0.25);
    const top = hash2(cell.add(7.7)).mul(0.45).add(0.55);
    const rad = mix(float(0.62), float(0.16), vH.div(top));
    Discard(vH.greaterThan(0.001).and(length(f.sub(o)).greaterThan(rad).or(vH.greaterThan(top))));
    const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
    // the curl: broad strand grooves spiralling down the lock
    const g = sin(t.x.mul(3).add(t.y.mul(2.4)).mul(Math.PI * 2)).mul(0.5).add(0.5);
    const base = vec3(c).mul(hash2(cell.add(3.1)).mul(0.18).add(0.91))
      .mul(mix(float(0.86), float(1.04), smoothstep(0.15, 0.85, g)))
      .mul(mix(float(0.62), float(1.0), pow(vH, float(0.8))))
      .toVar();
    base.assign(mix(base, base.mul(1.2).add(0.03), smoothstep(0.7, 1.0, vH).mul(0.35)));
    const rim = pow(float(1).sub(abs(dot(N, V))), float(3)).mul(vH);
    return vec4(shade(base, N, { spec: 0.0, power: 10, wrap: 0.6 }).add(base.mul(1.2).add(0.04).mul(rim.mul(0.2))), 1);
  })();
  m.userData.color = c;
  return m;
}

class Mullet {
  constructor(plush, color) {
    this.plush = plush;
    this.head = new HeadFrame(plush);
    const rig = plush.rig, H = gridOf(rig, 'head'), T = gridOf(rig, 'torso');
    const c0 = this.head.c0;
    // the body's frame (the soft body's cloud 0), its rest centre
    const ix = rig.clouds[0].ix; this.b0 = [0, 0, 0];
    for (const i of ix) for (let d = 0; d < 3; d++) this.b0[d] += rig.rest[i * 3 + d] / ix.length;
    const pad = 0.13;
    this.torso = { c: T.c.map((v, d) => v - this.b0[d]), r: T.r.map((v) => v + pad) };
    this.skull = { c: H.c.map((v, d) => v - c0[d]), r: H.r.map((v) => v + 0.1) };
    this.mat = lockMat(color);
    this.group = new THREE.Group();
    const [hx, hy, hz] = H.c, [rx, ry, rz] = H.r;
    const DEF = [0, 0.27, -0.27, 0.54, -0.54, 0.81, -0.81, 1.08, -1.08].map((th, k) => [th, 1 - 0.3 * Math.pow(Math.abs(th) / 1.08, 1.5) + [0, -0.04, 0.03][k % 3], k % 2 ? 1 : -1]);
    this.locks = DEF.map(([th, len, wv], k) => {
      const d = [Math.sin(th), 0, -Math.cos(th)], side = [Math.cos(th), 0, Math.sin(th)];
      const at = (rad, y, z = rad) => [hx + d[0] * rx * rad, y, hz + d[2] * rz * z];
      // from under the crown down to the shoulders (the sides shorter)
      const yTop = hy + ry * 0.5, yEnd = 1.86 + 0.32 * (1 - len) + 0.1 * Math.abs(th);
      const F = [0, 0.2, 0.42, 0.6, 0.76, 0.9, 1.0], RAD = [0.88, 1.1, 1.13, 1.07, 1.07, 1.13, 1.27];
      const WAVE = [0, 0.02, 0.05, -0.045, 0.045, 0.015, -0.03], LIFT = [0, 0, 0, 0, 0, 0.01, 0.06];
      const ctrl = F.map((f, j) => {
        const P = at(RAD[j], yTop + (yEnd - yTop) * f + LIFT[j], RAD[j] * 1.03);
        // the wave: a lateral S, alternating lock to lock
        const w = WAVE[j] * wv;
        return new THREE.Vector3(P[0] + side[0] * w - c0[0], P[1] - c0[1], P[2] + side[2] * w - c0[2]);
      });
      const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
      const rest = curve.getSpacedPoints(LOCK_N - 1);
      const L = curve.getLength();
      const geo = new THREE.InstancedBufferGeometry();
      const pos = new Float32Array(LOCK_N * (LOCK_R + 1) * 3), uvs = [], idx = [];
      for (let i = 0; i < LOCK_N; i++) for (let j = 0; j <= LOCK_R; j++) uvs.push(j / LOCK_R + k * 0.13, i / (LOCK_N - 1));
      for (let i = 0; i < LOCK_N - 1; i++) for (let j = 0; j < LOCK_R; j++) { const a = i * (LOCK_R + 1) + j, b = a + LOCK_R + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geo.setIndex(idx);
      geo.instanceCount = LOCK_SHELLS;
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      const sc = 1 - 0.15 * Math.abs(th);
      return {
        rest, L, mesh, geo, pos, w: 0.17 * sc, dp: 0.09 * sc,
        k: 95 + 14 * k, o: new THREE.Vector3(), v: new THREE.Vector3(), prev: null, pv: new THREE.Vector3(),
        cur: rest.map(() => new THREE.Vector3()),
      };
    });
    plush.group.add(this.group);
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._g = new THREE.Vector3();
  }

  /* push p out of an ellipsoid (centre c, radii r, both in a frame R, C) */
  _out(p, E, R, C) {
    const a = this._a.set(p.x - C[0], p.y - C[1], p.z - C[2]);
    // into the frame (R is rest→now, so its transpose)
    const lx = R[0] * a.x + R[3] * a.y + R[6] * a.z - E.c[0], ly = R[1] * a.x + R[4] * a.y + R[7] * a.z - E.c[1], lz = R[2] * a.x + R[5] * a.y + R[8] * a.z - E.c[2];
    const qx = lx / E.r[0], qy = ly / E.r[1], qz = lz / E.r[2], q = Math.hypot(qx, qy, qz);
    if (q >= 1 || q < 1e-6) return;
    const f = 1 / q, nx = lx * f + E.c[0], ny = ly * f + E.c[1], nz = lz * f + E.c[2];
    p.set(C[0] + R[0] * nx + R[1] * ny + R[2] * nz, C[1] + R[3] * nx + R[4] * ny + R[5] * nz, C[2] + R[6] * nx + R[7] * ny + R[8] * nz);
  }

  update(dt) {
    const hf = this.head; hf.update();
    const soft = this.plush.soft, BR = soft.cloudR[0], BC = soft.cloudC[0];
    const HR = hf.R, HC = hf.c;
    const grp = this.plush.group, q = this._q.copy(grp.quaternion), qi = q.clone().invert();
    const h = Math.min(1 / 30, Math.max(0, dt || 0));
    // the head's down, now, in the group's frame (gravity, for the droop)
    const hd = this._g.set(-HR[1], -HR[4], -HR[7]);
    for (const K of this.locks) {
      const n = K.rest.length;
      // the rigid lock: its rest curve in the head's frame
      for (let i = 0; i < n; i++) hf.point([K.rest[i].x, K.rest[i].y, K.rest[i].z], K.cur[i]);
      // its tip in the world (the stage carries the group), for the spring
      const tip = this._b.copy(K.cur[n - 1]).applyQuaternion(q).add(grp.position);
      if (h > 0) {
        if (!K.prev) { K.prev = tip.clone(); K.pv.set(0, 0, 0); }
        const vel = tip.clone().sub(K.prev).multiplyScalar(1 / h);
        const acc = vel.clone().sub(K.pv).multiplyScalar(1 / h);
        if (acc.length() > 90) acc.setLength(90);
        if (vel.length() > 25) { vel.set(0, 0, 0); acc.set(0, 0, 0); K.o.set(0, 0, 0); K.v.set(0, 0, 0); }   // a teleport
        K.prev.copy(tip); K.pv.copy(vel);
        acc.applyQuaternion(qi);
        // gravity: if the head has tipped, the lock hangs back toward down
        const droop = new THREE.Vector3(hd.x, hd.y + 1, hd.z).multiplyScalar(-0.55 * K.L);
        const kk = K.k, c = 2 * 0.28 * Math.sqrt(kk);
        for (let s = 0, m = Math.max(1, Math.ceil(h * 240)); s < m; s++) {
          const e = h / m;
          K.v.x += (-kk * (K.o.x - droop.x) - c * K.v.x - acc.x * 0.55) * e;
          K.v.y += (-kk * (K.o.y - droop.y) - c * K.v.y - acc.y * 0.55) * e;
          K.v.z += (-kk * (K.o.z - droop.z) - c * K.v.z - acc.z * 0.55) * e;
          K.o.addScaledVector(K.v, e);
        }
        const cap = 0.6 * K.L;
        if (K.o.length() > cap) K.o.setLength(cap);
      }
      // bend: the offset grows toward the tip; then out of the torso and skull
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), p = K.cur[i];
        p.addScaledVector(K.o, Math.pow(t, 1.6));
        if (t > 0.12) {
          this._out(p, this.torso, BR, BC);
          if (t > 0.3) this._out(p, this.skull, HR, HC);
        }
      }
      // the tube: width across (lateral), depth outward from the head
      const pos = K.pos, Tn = new THREE.Vector3(), Nn = new THREE.Vector3(), Bn = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), p = K.cur[i];
        Tn.subVectors(K.cur[Math.min(n - 1, i + 1)], K.cur[Math.max(0, i - 1)]).normalize();
        Nn.set(p.x - HC[0], (p.y - HC[1]) * 0.3, p.z - HC[2]);
        Nn.addScaledVector(Tn, -Nn.dot(Tn)).normalize();
        Bn.crossVectors(Tn, Nn);
        // fat in the middle, tapering to a rounded flipped tip
        const sh = (0.72 + 0.28 * smooth(0, 0.35, t)) * (1 - 0.45 * smooth(0.5, 1, t)) * Math.sqrt(Math.max(0, Math.min(1, (1 - t) * 5)));
        const rw = K.w * sh, rd = K.dp * sh;
        for (let j = 0; j <= LOCK_R; j++) {
          const a = (j / LOCK_R) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), o = (i * (LOCK_R + 1) + j) * 3;
          pos[o] = p.x + Nn.x * ca * rd + Bn.x * sa * rw;
          pos[o + 1] = p.y + Nn.y * ca * rd + Bn.y * sa * rw;
          pos[o + 2] = p.z + Nn.z * ca * rd + Bn.z * sa * rw;
        }
      }
      K.geo.attributes.position.needsUpdate = true;
      K.geo.computeVertexNormals();
    }
  }
}

const KEV = {
  // a black bear: near-black brown (warm enough to keep its shading and
  // depth under the lights), a tan muzzle like a real black bear's; the
  // bruise a lighter plum so it reads on the dark fur
  colors: { fur: '#20100a', under: '#b98d63', accent: '#170d08', spot: '#8a5298', nose: '#120d0c', cloth: '#1f49b6', trim: '#ef6a1e' },
  gloss: 0.4,
  hockey: { blue: '#1f49b6', orange: '#ef6a1e', palm: '#ef6a1e' },
  lock: '#231a15',
  // the top and the sides cropped (business at the front); the back of the
  // head and the nape a little longer and darker under the locks
  rig(rig) {
    const mul = (l) => smooth(-0.05, -0.45, l[2]) * smooth(0.55, 0.1, l[1]);
    wrapGrid(rig, 'head', 'pile', (p, u, v, l) => {
      const face = smooth(0.45, 0.85, l[2]);
      const crop = (0.42 * smooth(0.2, 0.7, l[1]) + 0.28 * smooth(0.45, 0.9, Math.abs(l[0])) * smooth(0.3, -0.2, l[1])) * (1 - face);
      return p * (1 - Math.min(0.55, crop)) * (1 - 0.55 * mul(l));
    });
    wrapGrid(rig, 'head', 'accent', (a, u, v, l) => Math.max(a, smooth(0.0, 0.55, mul(l))));
    // a black bear's chest and belly are dark too (just a hint left)
    wrapGrid(rig, 'torso', 'under', (x) => x * 0.18);
    wrapGrid(rig, 'torso', 'pile', (p, u, v, l) => p + 0.25 * smooth(0.55, 0.85, l[1]) * smooth(-0.1, -0.5, l[2]));
  },
  // the black eye: a bruise round the eye on the camera side as he faces
  // left (player 2's eye nearer us: u above the middle), the pile shorter
  paint(maskTex, patTex, rig) {
    const eu = 0.5 + 0.082, ev = 0.47;
    const P = painter(patTex, rig, 'head');
    P.g.save(); P.g.globalCompositeOperation = 'lighter';
    softBlob(P, eu, ev + 0.01, 0.34, 0.3, '255,0,0', 0.95, 0.45);
    softBlob(P, eu + 0.01, ev + 0.04, 0.24, 0.18, '255,0,0', 0.5, 0.3);
    P.g.restore(); patTex.needsUpdate = true;
    const M = painter(maskTex, rig, 'head');
    M.g.save(); M.g.globalCompositeOperation = 'multiply';
    softBlob(M, eu, ev, 0.26, 0.24, '150,255,255', 1, 0.5);
    M.g.restore(); maskTex.needsUpdate = true;
  },
  build(plush) {
    const tooth = makeTooth();
    plush.group.add(tooth);
    const mullet = new Mullet(plush, KEV.lock);
    const up = new THREE.Vector3(), M = new THREE.Matrix4(), S = new THREE.Matrix4();
    return {
      mullet,
      update(dt) {
        const R = plush.soft.cloudR[0];
        up.set(R[1], R[4], R[7]);
        // just under the smile, left of centre: the gap is on the other side
        skinMatrix(plush, 'muzzle', 0.483, 0.6, up, M, -0.004);
        tooth.matrix.copy(M).multiply(S.makeScale(0.088, 0.088, 0.088));
        tooth.matrixWorldNeedsUpdate = true;
        mullet.update(dt);
      },
    };
  },
};

/* ── Rubberta: the anglerfish ────────────────────────────────────────────── */

const RUB = {
  colors: { fur: '#16131f', under: '#1f1b2c', accent: '#16131f', spot: '#7af6ff', nose: '#16131f', cloth: '#16131f', trim: '#16131f' },
  glow: 1,
  stitch: [0.82, 0.86, 0.84],
  paint(maskTex, patTex, rig) {
    const S = patTex.userData.size;
    // the octopus atlas: the head on v ∈ [0, ½); x = u·S, y = v·S/2
    const H = (u, v) => [u * S, v * S * 0.5];
    const g = patTex.userData.ctx;
    g.save(); g.globalCompositeOperation = 'source-over';
    const dot = (x, y, r) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,0,0,1)'); gr.addColorStop(0.55, 'rgba(255,0,0,0.9)'); gr.addColorStop(1, 'rgba(255,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
    // photophores: two rows along each side of the head, one over the brow
    for (const s of [-1, 1]) {
      for (let k = 0; k < 6; k++) { const [x, y] = H(0.5 + s * (0.17 + k * 0.045), 0.62 + 0.02 * Math.sin(k)); dot(x, y, S * 0.011); }
      for (let k = 0; k < 4; k++) { const [x, y] = H(0.5 + s * (0.2 + k * 0.05), 0.38 - k * 0.025); dot(x, y, S * 0.009); }
    }
    // rings round the eyes (glowing), the beads inside them left dark
    for (const s of [-1, 1]) {
      const [x, y] = H(0.5 + s * 0.068, 0.5);
      g.lineWidth = S * 0.006; g.strokeStyle = 'rgb(255,0,0)';
      g.beginPath(); g.ellipse(x, y, S * 0.042, S * 0.042 * 0.5 * 1.9, 0, 0, Math.PI * 2); g.stroke();
    }
    // the arms: a line of lights down the outside of each
    for (const T of rig.parts.filter((p) => p.kind === 'tube')) {
      const R = rig.regions[T.region];
      for (let k = 0; k < 7; k++) {
        const s = 0.12 + k * 0.11, x = (R.x0 + 0.5 * (R.x1 - R.x0)) * S, y = (R.y0 + s * (R.y1 - R.y0)) * S;
        dot(x, y, Math.min((R.x1 - R.x0) * S * 0.14, S * 0.008) * (1 - k * 0.07));
      }
    }
    g.restore(); patTex.needsUpdate = true;
    // no blush on abyss-black flock
    channel(maskTex, 0, 0, S, S * 0.5, 1, () => 0);
    // the mouth: the smile unpicked, a wide downturned grimace sewn in its
    // place, needle teeth in a zigzag of pale thread
    const m = maskTex.userData.ctx;
    const [mx, my] = H(0.5, 0.585);
    channel(maskTex, mx - S * 0.06, my - S * 0.04, S * 0.12, S * 0.05, 2, () => 0);
    m.save(); m.globalCompositeOperation = 'lighter'; m.strokeStyle = 'rgb(0,0,255)'; m.lineCap = 'round'; m.lineJoin = 'round';
    m.lineWidth = S * 0.006;
    const W = S * 0.062, Y = my - S * 0.004, arc = (x) => Y + (Math.pow(x / W, 2) * S * 0.014);
    m.beginPath(); for (let k = 0; k <= 16; k++) { const x = -W + (2 * W * k) / 16; k ? m.lineTo(mx + x, arc(x)) : m.moveTo(mx + x, arc(x)); } m.stroke();
    m.lineWidth = S * 0.0032;
    m.beginPath();
    const n = 9;
    for (let k = 0; k <= n * 2; k++) {
      const x = -W * 0.86 + (1.72 * W * k) / (n * 2), y = arc(x) + (k % 2 ? S * 0.011 * (1 - Math.abs(x) / W * 0.5) : 0);
      k ? m.lineTo(mx + x, y) : m.moveTo(mx + x, y);
    }
    m.stroke(); m.restore(); maskTex.needsUpdate = true;
  },
  build(plush) {
    const H = new HeadFrame(plush);
    // the lure's stalk: a tapering felt tube from the crown, up, over and
    // forward, its tip above her face; a thread and a glowing bulb hang off it
    const pts = [[0, 0, 0], [0, 0.42, -0.05], [0, 0.72, 0.28], [0, 0.66, 0.7], [0, 0.46, 0.92]].map((p) => new THREE.Vector3(...p));
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const geo = new THREE.TubeGeometry(curve, 40, 1, 10, false);
    const P = geo.attributes.position, N = geo.attributes.normal, n = P.count;
    for (let i = 0; i < n; i++) {
      const seg = Math.floor(i / 11), t = seg / 40, c = curve.getPointAt(t), r = 0.075 * (1 - t) + 0.026 * t;
      P.setXYZ(i, c.x + N.getX(i) * r, c.y + N.getY(i) * r, c.z + N.getZ(i) * r);
    }
    geo.computeVertexNormals();
    const stalkCol = uniform(new THREE.Color('#1d1a29'));
    const stalk = new THREE.Mesh(geo, feltMat(stalkCol, { fib: 0.12, fuzz: 0.45, scale: 70 }));
    // the stalk's root, a little collar of felt where it's sewn on
    const root = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), stalk.material);
    root.scale.set(1, 0.45, 1);
    const stalkG = new THREE.Group(); stalkG.add(stalk, root); stalkG.matrixAutoUpdate = false;
    // the bulb: pale glowing felt, a bright core, a halo
    const bulbMat = new THREE.MeshBasicNodeMaterial();
    bulbMat.colorNode = Fn(() => {
      const N2 = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
      const face = clamp(dot(N2, V), 0, 1);
      const f = mx_noise_float(vec3(positionLocal.mul(30))).mul(0.06).add(0.97);
      const pulse = sin(SITH_T.mul(2.3)).mul(0.08).add(0.92);
      return vec4(mix(vec3(0.3, 0.85, 0.95), vec3(0.92, 1, 1), pow(face, float(1.5))).mul(f).mul(pulse), 1);
    })();
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), bulbMat);
    const halo = glowSprite('#5ff0ff', 1.0);
    halo.scale.setScalar(0.85);
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 6), stalk.material);
    thread.matrixAutoUpdate = false;
    plush.group.add(stalkG, bulb, halo, thread);
    const tipL = pts[pts.length - 1].clone(), base = new THREE.Vector3(), tip = new THREE.Vector3();
    const pos = new THREE.Vector3(), vel = new THREE.Vector3(), target = new THREE.Vector3(), d = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
    let first = true;
    const LEN = 0.26;
    return {
      update(dt) {
        H.update();
        const R = H.R;
        // the root on the crown, just forward of the top
        plush.body.surfacePoint('head', 0.5, 0.1, base, _N);
        const m = stalkG.matrix;
        m.set(R[0], R[1], R[2], base.x, R[3], R[4], R[5], base.y, R[6], R[7], R[8], base.z, 0, 0, 0, 1);
        stalkG.matrixWorldNeedsUpdate = true;
        tip.copy(tipL).applyMatrix4(m);
        // the bulb on its thread: a damped pendulum under the tip
        target.copy(tip).y -= LEN;
        if (first || dt <= 0 || dt > 0.1) { pos.copy(target); vel.set(0, 0, 0); first = false; }
        else {
          const k = 70, c = 2 * Math.sqrt(k) * 0.35;
          vel.addScaledVector(d.subVectors(target, pos), k * dt).addScaledVector(vel, -c * dt);
          pos.addScaledVector(vel, dt);
          // the thread's length holds
          d.subVectors(pos, tip); const l = d.length() || 1; pos.copy(tip).addScaledVector(d, LEN / l);
        }
        bulb.position.copy(pos); halo.position.copy(pos);
        d.subVectors(pos, tip); const l = d.length();
        const q = new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize());
        thread.matrix.compose(tip.clone().addScaledVector(d, 0.5), q, new THREE.Vector3(1, l, 1));
        thread.matrixWorldNeedsUpdate = true;
      },
    };
  },
};

/* ── Sumaura: the Bond villain ───────────────────────────────────────────── */

const SUM = {
  // inverted: black fur; white patches, ears, arms and legs; the mawashi
  // (trim) a black satin cummerbund
  colors: { fur: '#1b191d', under: '#211f24', accent: '#f2eee7', spot: '#f4f0e9', nose: '#a8505c', cloth: '#16141a', trim: '#121015' },
  stitch: [0.62, 0.6, 0.58],
  paint(maskTex, patTex, rig) {
    // the tuxedo on the torso's front (u 0.5 the middle, v down): a white
    // shirt front narrowing to the cummerbund, a bow tie and three studs
    // left black, a pocket square
    const P = painter(patTex, rig, 'torso'), g = P.g;
    g.save(); g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgb(255,0,0)';
    g.beginPath(); P.poly([[0.405, 0.2], [0.595, 0.2], [0.56, 0.42], [0.522, 0.7], [0.478, 0.7], [0.44, 0.42]]); g.fill();
    g.fillStyle = 'rgb(0,0,0)';
    // the bow tie (two rounded wings and a knot), studs
    g.beginPath(); P.poly([[0.5, 0.255], [0.455, 0.225], [0.445, 0.255], [0.452, 0.29], [0.5, 0.268], [0.548, 0.29], [0.555, 0.255], [0.545, 0.225]]); g.fill();
    g.beginPath(); P.ell(0.5, 0.262, 0.045, 0.05); g.fill();
    for (const v of [0.36, 0.44, 0.52]) { g.beginPath(); P.ell(0.5, v, 0.035, 0.035); g.fill(); }
    // the pocket square (on the side away from us as he faces left: either
    // way it reads), three points of white
    g.fillStyle = 'rgb(255,0,0)';
    g.beginPath(); P.poly([[0.355, 0.33], [0.365, 0.3], [0.375, 0.325], [0.385, 0.302], [0.395, 0.33], [0.39, 0.345], [0.36, 0.345]]); g.fill();
    g.restore(); patTex.needsUpdate = true;
    // satin lapels: the pile cut short in a band beside the shirt front
    const M = painter(maskTex, rig, 'torso');
    M.g.save(); M.g.globalCompositeOperation = 'multiply'; M.g.fillStyle = 'rgb(70,255,255)';
    for (const s of [-1, 1]) { M.g.beginPath(); M.poly([[0.5 + s * 0.095, 0.2], [0.5 + s * 0.15, 0.22], [0.5 + s * 0.11, 0.5], [0.5 + s * 0.06, 0.42]]); M.g.fill(); }
    M.g.fillStyle = 'rgb(120,255,255)';
    M.g.beginPath(); M.poly([[0.405, 0.2], [0.595, 0.2], [0.56, 0.42], [0.522, 0.7], [0.478, 0.7], [0.44, 0.42]]); M.g.fill();
    M.g.restore();
    // the scar: a stitched seam across the eye patch on the camera side,
    // brow to cheek, with cross-stitches over it
    const F = painter(patTex, rig, 'head');
    F.g.save(); F.g.globalCompositeOperation = 'source-over'; F.g.strokeStyle = 'rgb(0,255,0)';
    const a = [0.5 + 0.035, 0.36], b = [0.5 + 0.165, 0.6];
    F.line([a, [0.5 + 0.1, 0.48], b], 0.02);
    for (let k = 1; k < 6; k++) {
      const t = k / 6, u = a[0] + (b[0] - a[0]) * t, v = a[1] + (b[1] - a[1]) * t;
      F.line([[u - 0.022, v + 0.012], [u + 0.022, v - 0.012]], 0.013);
    }
    F.g.restore(); patTex.needsUpdate = true; maskTex.needsUpdate = true;
  },
};

/* ── K8-E: the punk ──────────────────────────────────────────────────────── */

function makeCollar() {
  // a strap round the neck (a band, scaled each frame to the neck), silver
  // cone studs round it with rounded tips (placed each frame at its radius,
  // never squashed)
  const g = new THREE.Group();
  const strap = new THREE.Group();
  const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true), leatherMat([0.07, 0.06, 0.07]));
  band.material.side = THREE.DoubleSide;
  const edge = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 6, 40), band.material);
  edge.rotation.x = Math.PI / 2;
  const edge2 = edge.clone(); edge.position.y = 0.5; edge2.position.y = -0.5;
  strap.add(band, edge, edge2);
  const spikeG = new THREE.LatheGeometry([[0, 0], [0.22, 0], [0.2, 0.08], [0.12, 0.3], [0.05, 0.5], [0, 0.55]].map(([x, y]) => new THREE.Vector2(x, y)), 12);
  const spikes = new THREE.InstancedMesh(spikeG, metalMat(), 9);
  spikes.frustumCulled = false;
  g.add(strap, spikes);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3(), sc = new THREE.Vector3();
  g.userData.fit = (r, h, size) => {
    strap.scale.set(r, h, r);
    for (let k = 0; k < 9; k++) {
      // round the back and sides; none under the chin
      const a = Math.PI * (0.32 + 1.36 * (k / 8));
      d.set(Math.sin(a), 0, Math.cos(a));
      q.setFromUnitVectors(Y, d);
      m.compose(d.clone().multiplyScalar(r * 0.98), q, sc.setScalar(size));
      spikes.setMatrixAt(k, m);
    }
    spikes.instanceMatrix.needsUpdate = true;
  };
  g.matrixAutoUpdate = false;
  return g;
}
function makeRing(r = 1, t = 0.16) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, t, 8, 24), metalMat());
  m.matrixAutoUpdate = false;
  return m;
}

const K8E = {
  colors: { fur: '#2c2832', under: '#4a4453', accent: '#ff2bd6', spot: '#121015', nose: '#121015', cloth: '#1a171d', trim: '#1a171d' },
  sheen: '#5a1450',
  // the mohawk: the mane down the back of the neck long and neon, running
  // on up the back of the head and over it to the forehead
  rig(rig) {
    wrapChain(rig, 'neck', 'pile', (p, s, c) => p + 2.2 * smooth(-0.78, -0.97, c) * smooth(0.0, 0.08, s));
    wrapChain(rig, 'neck', 'accent', (a, s, c) => smooth(-0.72, -0.92, c));
    const crest = (l) => smooth(0.2, 0.08, Math.abs(l[0])) * smooth(-0.55, -0.1, l[1] - (l[2] > 0 ? 0.55 * l[2] : 0));
    wrapGrid(rig, 'head', 'pile', (p, u, v, l) => p + 3.6 * crest(l) * smooth(0.95, 0.6, l[2]));
    wrapGrid(rig, 'head', 'accent', (a, u, v, l) => Math.max(a, smooth(0.1, 0.5, crest(l)) * smooth(0.98, 0.7, l[2])));
  },
  paint(maskTex, patTex, rig) {
    // the collar's strap: the neck's pile cut short under it
    const T = tubeOf(rig, 'neck'), R = rig.regions[T.region], S = maskTex.userData.size;
    channel(maskTex, R.x0 * S, (R.y0 + 0.06 * (R.y1 - R.y0)) * S, (R.x1 - R.x0) * S, 0.13 * (R.y1 - R.y0) * S, 0, (v) => v * 0.25);
    // a handlebar moustache, stitched in heavy thread on the muzzle
    const P = painter(patTex, rig, 'muzzle'), g = P.g;
    g.save(); g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgb(255,0,0)';
    for (const s of [-1, 1]) {
      g.beginPath();
      P.poly([[0.5, 0.5], [0.5 + s * 0.06, 0.48], [0.5 + s * 0.12, 0.5], [0.5 + s * 0.16, 0.47], [0.5 + s * 0.18, 0.41], [0.5 + s * 0.175, 0.455], [0.5 + s * 0.13, 0.55], [0.5 + s * 0.06, 0.56], [0.5, 0.54]]);
      g.fill();
    }
    g.restore(); patTex.needsUpdate = true;
  },
  build(plush) {
    const collar = makeCollar(), septum = makeRing(1, 0.17), hoops = [makeRing(1, 0.16), makeRing(1, 0.16)];
    plush.group.add(collar, septum, ...hoops);
    const M = new THREE.Matrix4(), S = new THREE.Matrix4(), up = new THREE.Vector3();
    const X = new THREE.Vector3(), Z = new THREE.Vector3();
    return {
      update() {
        // the collar: square to the neck at its base, a touch wider than it
        const ring = tubeRing(plush.body, 'neck', 0.12);
        Z.copy(ring.ref); X.crossVectors(ring.axis, Z).normalize();
        const r = ring.r + 0.035, h = 0.14;
        collar.matrix.makeBasis(X, ring.axis, Z).setPosition(ring.c);
        collar.userData.fit(r, h, 0.16);
        collar.matrixWorldNeedsUpdate = true;
        // the septum ring hangs under the nostrils, the ear hoops through
        // the near ear's edge
        const R = plush.soft.cloudR[1] || plush.soft.cloudR[0];
        up.set(R[1], R[4], R[7]);
        skinMatrix(plush, 'muzzle', 0.5, 0.5, up, M, 0.0);
        septum.matrix.copy(M).multiply(S.makeTranslation(0, -0.035, 0.01)).multiply(S.makeRotationX(Math.PI / 2 - 0.5)).multiply(S.makeScale(0.03, 0.03, 0.03));
        septum.matrixWorldNeedsUpdate = true;
        hoops.forEach((h2, k) => {
          const ring2 = tubeRing(plush.body, k ? 'right ear' : 'left ear', 0.35);
          const off = ring2.ref.clone().multiplyScalar(-ring2.r * 0.8);
          h2.matrix.makeBasis(ring2.axis.clone(), ring2.ref.clone(), new THREE.Vector3().crossVectors(ring2.axis, ring2.ref)).setPosition(ring2.c.clone().add(off)).multiply(S.makeScale(0.028, 0.028, 0.028));
          h2.matrixWorldNeedsUpdate = true;
        });
      },
    };
  },
};

/* ── Zach Sparrow: the ghost pirate ──────────────────────────────────────── */

/* a tricorn: a felt crown, the brim cocked up into three walls with three
   points, its edges frayed and notched, one tear; unit = the head's radius */
function makeTricorn() {
  const g = new THREE.Group();
  const felt = uniform(new THREE.Color('#2a2326'));
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  // the crown: a low rounded dome
  const prof = [[0, 0.5], [0.22, 0.49], [0.4, 0.43], [0.52, 0.3], [0.56, 0.12], [0.57, 0.0]].map(([x, y]) => new THREE.Vector2(x, y));
  const crown = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(14), 40), feltMat(felt, { fib: 0.1, fuzz: 0.35, scale: 24 }));
  // the brim: rings out from the crown's foot; each angle's edge folded up
  // against the crown except at the three points; a ragged edge
  const NA = 120, NR = 7, pos = [], idx = [], uvs = [];
  const notches = [];
  for (let k = 0; k < 9; k++) notches.push({ a: rnd() * Math.PI * 2, w: 0.04 + rnd() * 0.07, d: 0.25 + rnd() * 0.45 });
  const tear = 1.05;
  for (let i = 0; i <= NA; i++) {
    const a = (i / NA) * Math.PI * 2;
    const tri = Math.max(0, Math.cos(3 * (a - Math.PI / 2)));             // 1 at the three points (one forward, +z)
    let rag = 1;
    for (const n of notches) { const da = Math.abs(Math.atan2(Math.sin(a - n.a), Math.cos(a - n.a))); if (da < n.w) rag -= n.d * (1 - da / n.w); }
    rag -= 0.06 * (0.5 + 0.5 * Math.sin(a * 23 + 1.3)) * (0.5 + 0.5 * Math.sin(a * 7));
    for (let j = 0; j <= NR; j++) {
      const t = j / NR, tt = Math.min(t, Math.max(0.15, rag));
      // out from the crown, then up: the sides fold right up, the points
      // stay low and stick out
      const out = 0.57 + (0.3 + 0.32 * tri) * tt;
      const upF = (1 - Math.pow(tri, 0.6)) * 0.55 + 0.12;
      const y = Math.pow(tt, 1.6) * upF * 0.9 - 0.02;
      const r2 = out - Math.pow(tt, 2) * (1 - tri) * 0.22;
      pos.push(Math.sin(a) * r2, y, Math.cos(a) * r2);
      uvs.push(i / NA, tt / Math.max(0.15, Math.min(1, rag)));
    }
  }
  for (let i = 0; i < NA; i++) for (let j = 0; j < NR; j++) {
    const a = i * (NR + 1) + j, b = (i + 1) * (NR + 1) + j;
    // the tear: a slit through the brim on one side
    if (Math.abs(((i + 0.5) / NA) * Math.PI * 2 - tear) < 0.03 && j > 2) continue;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  // matte felt both sides, frayed darker at its very rim
  const bm = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  bm.colorNode = Fn(() => {
    const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
    const t = uv().y;
    const f = mx_noise_float(vec3(positionLocal.mul(60))).mul(0.1).add(0.96);
    const base = vec3(felt).mul(f).mul(mix(float(1), float(0.6), smoothstep(0.93, 1.0, t)));
    const Nf = dot(N, V).lessThan(0).select(N.negate(), N);
    const rim = pow(float(1).sub(abs(dot(N, V))), float(2.2));
    return vec4(shade(base, Nf, { spec: 0.04, power: 8, wrap: 0.5 }).add(base.mul(rim.mul(0.3))), 1);
  })();
  const brim = new THREE.Mesh(geo, bm);
  g.add(crown, brim);
  g.matrixAutoUpdate = false;
  return g;
}

const ZACH = {
  colors: { fur: '#e6ebee', under: '#f3f6f8', accent: '#dfe5e9', spot: '#dfe5e9', nose: '#a8a49b', cloth: '#b9b4aa', trim: '#b9b4aa', sheen: '#2a3a48', beak: 1 },
  eyesGlow: true,
  // the crown of his head under the hat: the pile short, so it doesn't
  // come up through the felt
  paint(maskTex, patTex, rig) {
    const M = painter(maskTex, rig, 'head');
    M.g.save(); M.g.globalCompositeOperation = 'multiply';
    softBlob(M, 0.5, 0.0, 2.2, 0.62, '40,255,255', 1, 0.7);
    M.g.restore(); maskTex.needsUpdate = true;
  },
  build(plush) {
    const H = new HeadFrame(plush), hat = makeTricorn();
    plush.group.add(hat);
    const head = gridOf(plush.rig, 'head'), hr = Math.max(head.r[0], head.r[2]);
    const at = [0, head.r[1] * 0.6, -0.04], T = new THREE.Vector3(), S = new THREE.Matrix4(), Q = new THREE.Matrix4();
    return {
      update() {
        H.update();
        H.point(at, T);
        // cocked forward and a little to one side, as a pirate wears it
        Q.makeRotationX(0.16).multiply(S.makeRotationZ(-0.08));
        hat.matrix.copy(H.m).setPosition(T).multiply(Q).multiply(S.makeScale(hr * 1.32, hr * 1.32, hr * 1.32));
        hat.matrixWorldNeedsUpdate = true;
      },
    };
  },
};

/* the twins with their own looks (the rest keep LOOKS[id].evil / sith.js) */
export const TWINS = { kevalanche: KEV, rubberta: RUB, sumaura: SUM, k8e: K8E, zach: ZACH };

/* the red glow on a ghost's eyes: the Sith's (render/sith.js) */
export { makeEyeGlow };
