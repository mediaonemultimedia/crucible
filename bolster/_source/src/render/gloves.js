/* Kevalanche's boxing gloves. Grommet's bear wears goalkeeper gloves: a
   cloth tube over the paw, the same size as the paw. Bolster keeps that
   tube only as the cuff (the white strap band and all) and puts a real
   boxing glove on the end of each arm: a padded fist, bulbous at the
   knuckles and narrower at the wrist, a thumb pad along the inside, laces
   on the cuff, glossy red leather with a seam over the knuckles. Each glove
   follows the last stretch of its arm chain in the soft body, so it swings
   with a punch and rolls with the arm.

   Why the fur came through before: the fur mask that shaves the arm under
   the glove is a rectangle in the arm tube's atlas region running to
   v = 0.985 (where the tube's rings end), but the tube's end cap — the
   fist — is mapped from 0.985 to 1.0, outside it. The fist kept its full
   pile, longer than the glove is thick, so the strands came out through
   the top of every glove. shaveCaps() extends each chain mask over its cap. */

import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, normalWorld, normalize, positionLocal, smoothstep, abs, float, uniform, mix, fract, mx_noise_float, pow, dot, cameraPosition, positionWorld } from 'three/tsl';
import { shade } from '../../shared/grommet/props.js';

export const CUFF = 0.45;   // the cloth tube keeps this much of the old glove, from its wrist end

/* paint pile 0 over the end cap of every masked chain that runs to its end
   (plus a texel or two either way, for the mask's filtering) */
export function shaveCaps(maskTex, rig) {
  const g = maskTex.userData.ctx, size = maskTex.userData.size;
  g.save();
  g.globalCompositeOperation = 'source-over';   // the face painter leaves it on 'lighter'
  for (const m of rig.furMask || []) {
    if (m.part || (m.s1 ?? 1) < 1) continue;
    const T = rig.parts.find((q) => q.kind === 'tube' && q.name === m.chain);
    if (!T) continue;
    const R = rig.regions[T.region];
    const y0 = (R.y0 + 0.97 * (R.y1 - R.y0)) * size;
    g.fillStyle = `rgb(${Math.round(m.pile * 255)},0,0)`;
    g.fillRect(R.x0 * size - 1, y0, (R.x1 - R.x0) * size + 2, R.y1 * size - y0 + 2);
  }
  g.restore();
  maskTex.needsUpdate = true;
}

/* the glove tubes become cuffs (before the cloth Body is built from them) */
export function cuffOnly(rig) {
  for (const p of rig.cloth?.parts || []) {
    if (!/ glove$/.test(p.name || '')) continue;
    p.s1 = p.s0 + (1 - p.s0) * CUFF;
    p.CAP = 0;
  }
}

function leather(color, { tape = false } = {}) {
  const m = new THREE.MeshBasicNodeMaterial();
  const c = uniform(new THREE.Color(color));
  m.colorNode = Fn(() => {
    const p = positionLocal;
    // a seam down the back of the fist and over the knuckles, and one round
    // the wrist where the padding meets the cuff
    const seam = smoothstep(0.022, 0.008, abs(p.x)).mul(smoothstep(0.0, 0.1, p.z)).add(smoothstep(0.03, 0.012, abs(p.y.sub(0.1))));
    const base = mix(c, c.mul(0.55), seam.clamp(0, 1).mul(0.8));
    if (!tape) return vec4(shade(base, normalize(normalWorld), { spec: 0.6, power: 34, wrap: 0.45 }), 1);
    // the hockey goon's: white athletic tape wound round the knuckles —
    // three turns on a slant, each edge a touch darker where it overlaps the
    // next, a cloth weave, matte; the leather glossy round it
    const w = p.y.add(p.x.mul(0.18)).add(p.z.mul(0.1));
    const on = smoothstep(0.5, 0.52, w).mul(smoothstep(0.86, 0.84, w));
    const turn = fract(w.sub(0.5).mul(9));
    const lap = smoothstep(0.0, 0.08, turn).mul(smoothstep(1.0, 0.86, turn)).mul(0.25).add(0.75);
    const weave = mx_noise_float(vec3(p.mul(160))).mul(0.05).add(0.97);
    const tapeC = vec3(0.93, 0.91, 0.86).mul(lap).mul(weave);
    const N = normalize(normalWorld);
    return vec4(mix(shade(base, N, { spec: 0.6, power: 34, wrap: 0.45 }), shade(tapeC, N, { spec: 0.05, power: 10, wrap: 0.5 }), on), 1);
  })();
  m.userData.color = c;
  return m;
}
function plain(color, spec = 0.05) {
  const m = new THREE.MeshBasicNodeMaterial();
  const c = uniform(new THREE.Color(color));
  m.colorNode = Fn(() => vec4(shade(c, normalize(normalWorld), { spec, power: 12 }), 1))();
  m.userData.color = c;
  return m;
}

/* one glove in its own frame: +y from the wrist to the knuckles, +x toward
   the thumb side, +z the back of the hand. Length 1 (scaled to the arm). */
function makeGlove(mat, laceMat) {
  const g = new THREE.Group();
  // the fist: a lathe, narrow at the wrist, bulbous at the knuckles, a
  // rounded front; flattened a touch palm-to-back
  const prof = [[0.0, 0.0], [0.3, 0.0], [0.33, 0.08], [0.39, 0.25], [0.44, 0.45], [0.45, 0.6], [0.42, 0.75], [0.34, 0.88], [0.2, 0.97], [0.0, 1.0]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const fist = new THREE.Mesh(new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(28), 32), mat);
  fist.scale.set(1, 1, 0.86);
  // the thumb pad: a capsule along the inside of the fist, its tip tucked
  // in against the knuckles
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.32, 8, 16), mat);
  thumb.position.set(0.36, 0.44, 0.12);
  thumb.rotation.set(0.25, 0, -0.32);
  // laces: three crossings on the palm side of the cuff, below the wrist
  const laces = new THREE.Group();
  for (let k = 0; k < 3; k++) for (const d of [-1, 1]) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), laceMat);
    l.position.set(0, -0.08 - k * 0.11, -0.335);
    l.rotation.z = d * 0.9;
    laces.add(l);
  }
  thumb.rotation.order = 'ZXY';
  g.add(fist, thumb, laces);
  return g;
}

/* ── the hockey goon's gloves (Kevalanche ALT) ─────────────────────────────
   Chunky plush hockey gloves in the same frame and envelope as the boxing
   glove (so his reach reads the same): four padded finger rolls curled
   over the knuckles, each sewn in three puffs; a padded back of the hand;
   an orange piping roll across the knuckle line; a contrasting palm; a
   thick padded cuff roll at the wrist with an orange band. Felt plush, the
   roster's material; colours only (no marks of any team). */

/* plush felt: fine fibres, a fuzzy rim, a soft sheen */
function plushFelt(color, { fib = 0.1, fuzz = 0.3, spec = 0.08, scale = 38 } = {}) {
  const m = new THREE.MeshBasicNodeMaterial();
  const c = uniform(new THREE.Color(color));
  m.colorNode = Fn(() => {
    const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
    const f = mx_noise_float(vec3(positionLocal.mul(scale))).mul(fib).add(1 - fib / 3);
    const base = vec3(c).mul(f);
    const rim = pow(float(1).sub(abs(dot(N, V))), float(2.2));
    return vec4(shade(base, N, { spec, power: 10, wrap: 0.5 }).add(base.mul(rim.mul(fuzz))), 1);
  })();
  m.userData.color = c;
  return m;
}

/* a tube along points with a radius per point (0…1 along it), its ends
   closed to a point (radius → ~0 at the ends gives rounded tips) */
export function tubeGeo(pts, rad, radial = 14, ref = new THREE.Vector3(0, 0, 1)) {
  const n = pts.length, pos = [], idx = [], uvs = [];
  const T = new THREE.Vector3(), B = new THREE.Vector3(), Nn = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    T.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    Nn.copy(ref).addScaledVector(T, -ref.dot(T)).normalize();
    B.crossVectors(T, Nn);
    const t = i / (n - 1), r = rad(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      p.copy(pts[i]).addScaledVector(Nn, Math.cos(a) * (r.length ? r[1] : r)).addScaledVector(B, Math.sin(a) * (r.length ? r[0] : r));
      pos.push(p.x, p.y, p.z); uvs.push(j / radial, t);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const puff = (n, lo = 0.8) => (t) => { const e = Math.min(1, t * 9, (1 - t) * 9); return Math.sqrt(Math.max(0, e * (2 - e))) * (lo + (1 - lo) * Math.pow(Math.abs(Math.sin(Math.PI * n * t)), 0.45)); };

/* built in true proportions (the unit is the glove's width scale; the
   length scale is matched to it at rest, see HY), +y wrist → knuckles */
function makeHockeyGlove(M) {
  const g = new THREE.Group();
  const add = (geo, mat, pos, scl) => { const m = new THREE.Mesh(geo, mat); if (pos) m.position.set(...pos); if (scl) m.scale.set(...scl); g.add(m); return m; };
  const ball = new THREE.SphereGeometry(1, 28, 20);
  // the hand inside (fills between the pads); the palm in the contrast colour
  add(ball, M.blue, [0, 0.29, 0.0], [0.35, 0.31, 0.31]);
  add(ball, M.palm, [0, 0.27, -0.19], [0.27, 0.18, 0.09]);
  // the back of the hand: a padded panel
  add(ball, M.blue, [0, 0.19, 0.17], [0.35, 0.17, 0.13]);
  // the thumb: two puffs up the thumb side, tip tucked toward the fingers;
  // one mesh per side (the glove is mirrored for the other hand)
  const thumbs = [1, -1].map((s) => {
    const pts = new THREE.CatmullRomCurve3([[0.25, 0.04, 0.06], [0.35, 0.17, 0.03], [0.37, 0.32, -0.05], [0.3, 0.44, -0.15], [0.19, 0.48, -0.21]]
      .map(([x, y, z]) => new THREE.Vector3(x * s, y, z))).getPoints(24);
    const m = new THREE.Mesh(tubeGeo(pts, (t) => 0.105 * puff(2, 0.85)(t), 14, new THREE.Vector3(s, 0, 0)), M.blue);
    g.add(m);
    return m;
  });
  // four finger rolls over the knuckles, curling under to the palm, each in
  // three puffs (the seams between them are the dips); the outer two a touch
  // smaller and lower, like a hand
  [[-0.252, 0.1, 0.9], [-0.084, 0.112, 1], [0.084, 0.112, 1], [0.25, 0.105, 0.95]].forEach(([x, r, k]) => {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const a = 0.0 + (i / 30) * 2.65;
      pts.push(new THREE.Vector3(x, 0.3 + 0.2 * k * Math.sin(a), 0.02 + 0.2 * k * Math.cos(a)));
    }
    add(tubeGeo(pts, (t) => r * puff(3, 0.78)(t), 14, new THREE.Vector3(1, 0, 0)), M.blue);
  });
  // an orange piping roll across the knuckle line, where fingers meet hand
  const pipe = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16, x = -0.35 + 0.7 * t, e = (2 * t - 1) ** 2; pipe.push(new THREE.Vector3(x, 0.3 - 0.03 * e, 0.285 - 0.09 * e)); }
  add(tubeGeo(pipe, (t) => 0.042 * Math.sqrt(Math.max(0, Math.min(1, t * 8, (1 - t) * 8))), 10, new THREE.Vector3(0, 1, 0)), M.orange);
  // the cuff: a short padded bell (closed inside the arm, so no fur shows
  // through), an orange band round it, a fat roll at the wrist
  const prof = [[0.05, -0.34], [0.37, -0.335], [0.425, -0.3], [0.43, -0.2], [0.405, -0.06], [0.36, 0.06], [0.2, 0.08]].map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(18), 32), M.blue);
  const ring = (R, r, y, mat) => { const m = add(new THREE.TorusGeometry(R, r, 12, 36), mat, [0, y, 0]); m.rotation.x = Math.PI / 2; return m; };
  ring(0.37, 0.06, 0.04, M.blue);
  ring(0.418, 0.036, -0.175, M.orange);
  g.scale.set(1, 1, 0.9);
  return { group: g, thumbs };
}
const HY = 1.7;   // the length scale × this ≈ the width scale at rest (true proportions)

export class Gloves {
  constructor(group, soft, rig, color, { tape = false, hockey = null } = {}) {
    this.soft = soft;
    this.mat = leather(color, { tape });
    this.lace = plain('#f4efe6');
    if (hockey) this.hk = { blue: plushFelt(hockey.blue), orange: plushFelt(hockey.orange), palm: plushFelt(hockey.palm || hockey.orange, { fib: 0.14, spec: 0.03 }) };
    this.arms = rig.arms.filter((c) => c.kind === 'arm').map((ch) => {
      const part = (rig.cloth?.parts || []).find((p) => p.chain === ch.k && / glove$/.test(p.name || ''));
      const s0 = part ? part.s0 : 0.7, sw = s0 + (1 - s0) * CUFF;   // the wrist: where the cuff ends
      // which way is "in" (toward the body's middle) for this arm, in rest
      const tip = ch.idx[ch.idx.length - 1];
      const A = { ch, sw, side: 0, inward: rig.rest[tip * 3] > 0 ? -1 : 1, r: ch.radius(0.9) };
      if (this.hk) {
        const H = makeHockeyGlove(this.hk);
        A.glove = new THREE.Group(); A.glove.add(H.group);
        A.mirror = (side) => { H.thumbs[0].visible = side > 0; H.thumbs[1].visible = side < 0; };
      } else {
        A.glove = makeGlove(this.mat, this.lace);
        const thumb = A.glove.children[1];
        A.mirror = (side) => { thumb.position.x = 0.36 * side; thumb.rotation.z = -0.32 * side; };
      }
      A.glove.matrixAutoUpdate = false;
      group.add(A.glove);
      return A;
    });
    this._a = new THREE.Vector3(); this._b = new THREE.Vector3(); this._t = new THREE.Vector3();
    this._x = new THREE.Vector3(); this._z = new THREE.Vector3(); this._m = new THREE.Matrix4(); this._w = new THREE.Vector3();
  }

  setColor(c) { this.mat.userData.color.value.set(c); }

  /* a point along a chain at s ∈ [0, 1] (its particles, linearly) */
  _at(ch, s, out) {
    const x = this.soft.x, N = ch.idx.length, f = Math.min(N - 1.0001, Math.max(0, s * (N - 1))), j = Math.floor(f), u = f - j;
    const a = ch.idx[j] * 3, b = ch.idx[j + 1] * 3;
    return out.set(x[a] + (x[b] - x[a]) * u, x[a + 1] + (x[b + 1] - x[a + 1]) * u, x[a + 2] + (x[b + 2] - x[a + 2]) * u);
  }

  /* fx (the feel pass, Kevalanche): per arm [R, L] a roll about the
     forearm (0 thumb up … 1 palm down) and a squash spring (contact); the
     glove's pointing lags its forearm on a soft spring (follow-through) */
  update(dt = 0, fx = null) {
    const W = this._w, T = this._t, X = this._x, Z = this._z;
    for (const A of this.arms) {
      const G = fx ? fx[A.inward === 1 ? 0 : 1] : null;   // (inward 1: his right arm)
      const wrist = this._at(A.ch, A.sw, this._a), end = this._at(A.ch, 1, this._b);
      T.subVectors(end, wrist);
      const reach = T.length();
      T.normalize();
      if (G && dt > 0) {
        // the glove's lag: its axis eased toward the forearm's (underdamped)
        const L = A.lag || (A.lag = { x: T.clone(), v: new THREE.Vector3() }), k = 700;
        L.v.addScaledVector(T.clone().sub(L.x), k * dt).multiplyScalar(Math.max(0, 1 - 2 * 0.45 * Math.sqrt(k) * dt));
        L.x.addScaledVector(L.v, dt);
        if (L.x.angleTo(T) > 0.5) L.x.copy(T);
        T.copy(L.x).normalize();
      }
      // the back of the hand up, square to the arm (an arm straight up or
      // down: the back of the hand forward instead)
      Z.set(0, 1, 0).addScaledVector(T, -T.y);
      if (Z.lengthSq() < 0.02) Z.set(0, 0, 1).addScaledVector(T, -T.z);
      Z.normalize();
      X.crossVectors(T, Z);
      // the thumb on the side toward the body's middle: mirrored per arm
      const side = X.x * A.inward >= 0 ? 1 : -1;
      if (A.side !== side) { A.side = side; A.mirror(side); }
      let L = reach + A.r * 1.3;            // over the end of the paw
      let k = (A.r * 1.9) / 0.45;           // knuckles ~1.4× the old glove's width
      if (G) {
        // the wrist's corkscrew: the glove turned about the forearm
        const a = G.roll * 1.35 * -A.inward, c = Math.cos(a), s = Math.sin(a);
        const x = X.clone(), z = Z.clone();
        X.copy(x).multiplyScalar(c).addScaledVector(z, s);
        Z.copy(z).multiplyScalar(c).addScaledVector(x, -s);
        // the contact: squashed along the punch, bulged round it
        const q = Math.max(-0.22, Math.min(0.15, G.squash.x * 0.02));
        L *= 1 + q; k *= 1 - q * 0.5;
      }
      this._m.makeBasis(X.multiplyScalar(k), T.multiplyScalar(this.hk ? L * HY : L), Z.multiplyScalar(k));
      W.copy(wrist).addScaledVector(this._t, -0.04 / (this.hk ? L * HY : L));
      this._m.setPosition(W);
      A.glove.matrix.copy(this._m);
      A.glove.matrixWorldNeedsUpdate = true;
    }
  }
}
