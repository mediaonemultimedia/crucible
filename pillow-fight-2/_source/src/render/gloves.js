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
   Plush hockey gloves in the same frame and envelope as the boxing glove
   (so his reach reads the same): makeHockeyGlove below. Felt plush, the
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

/* built in true proportions (the unit is the glove's width scale; the
   length scale is matched to it at rest, see HY), +y wrist → knuckles, +x
   the thumb's side (mirrored per hand by pose()), +z the back of the hand.

   A hockey glove, as one reads at a glance: a long flared gauntlet cuff up
   the forearm, a thick padded back of the hand with a flex roll at the
   wrist, four separate fingers each in three padded rolls (sausages with a
   gap between, the outer two smaller), and a separate padded thumb that
   wraps round the front of the fist. The fingers and the thumb are little
   jointed chains: pose(curl) closes them from slightly open (rest) to a
   fist (punching). Royal blue, orange trims (the cuff's band and its
   rolled lip, a piping on the knuckle line), a tan-grey palm. */
const FINGERS = [   // x (thumb side +), roll radius, three roll lengths
  [0.27, 0.084, [0.175, 0.15, 0.13]],    // index
  [0.09, 0.088, [0.185, 0.16, 0.14]],    // middle
  [-0.09, 0.084, [0.175, 0.15, 0.13]],   // ring
  [-0.266, 0.075, [0.15, 0.13, 0.115]],  // little
];
const OPEN = [0.3, 0.34, 0.24], FIST = [1.5, 1.55, 1.25];
/* a padded roll: a sausage (a capsule, its ends a touch flattened) from
   y = 0 to y = L, radius r across (x), d deep (z) */
function rollGeo(L, r, d) {
  const g = new THREE.CapsuleGeometry(1, 1, 6, 16);
  const p = g.attributes.position, half = Math.max(0.001, L / 2 - r * 0.55);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), cap = Math.sign(y) * Math.max(0, Math.abs(y) - 0.5);   // the round ends
    p.setXYZ(i, p.getX(i) * r, L / 2 + Math.sign(y) * half + cap * r * 0.8, p.getZ(i) * d);
  }
  g.computeVertexNormals();
  return g;
}
function makeHockeyGlove(M) {
  const g = new THREE.Group();
  const ball = new THREE.SphereGeometry(1, 24, 16);
  const add = (geo, mat, pos, scl, parent = g) => { const m = new THREE.Mesh(geo, mat); if (pos) m.position.set(...pos); if (scl) m.scale.set(...scl); parent.add(m); return m; };
  const ring = (R, r, pos, mat, parent = g, seg = 36) => { const m = add(new THREE.TorusGeometry(R, r, 10, seg), mat, pos, null, parent); m.rotation.x = Math.PI / 2; return m; };
  // the hand: a core round the paw (it ends inside, at y ≈ 0.4–0.55), the
  // palm side in tan-grey, a thick padded back
  add(ball, M.blue, [0, 0.31, 0.0], [0.375, 0.29, 0.31]);
  add(ball, M.palm, [0, 0.31, -0.15], [0.36, 0.28, 0.21]);
  add(ball, M.blue, [0, 0.29, 0.1], [0.39, 0.27, 0.19]);
  // inside the fist: the palm's leather where the fingers close over it
  add(ball, M.palm, [0, 0.46, -0.16], [0.36, 0.17, 0.2]);
  // a flex roll across the back at the wrist, and the orange piping on the
  // knuckle line where the fingers meet the hand
  const across = (y, z, r, bow, mat, w = 0.36) => {
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16, x = -w + 2 * w * t, e = (2 * t - 1) ** 2; pts.push(new THREE.Vector3(x, y - 0.02 * e, z - bow * e)); }
    return add(tubeGeo(pts, (t) => r * Math.sqrt(Math.max(0, Math.min(1, t * 7, (1 - t) * 7))), 12, new THREE.Vector3(0, 1, 0)), mat);
  };
  across(0.1, 0.22, 0.08, 0.12, M.blue, 0.34);
  across(0.53, 0.17, 0.042, 0.05, M.orange, 0.33);
  // fingers: jointed chains of three rolls (a crease between rolls)
  const fingers = FINGERS.map(([x, r, lens]) => {
    const root = new THREE.Group(); root.position.set(x, 0.52, 0.02); g.add(root);
    const joints = []; let parent = root;
    lens.forEach((L, i) => {
      const j = new THREE.Group(); if (i) j.position.y = lens[i - 1]; parent.add(j); joints.push(j);
      const rr = r * (1 - 0.05 * i);
      add(rollGeo(L + rr * 0.35, rr, rr * 1.04), M.blue, null, null, j);
      parent = j;
    });
    return { root, joints, x };
  });
  // the thumb: two fat rolls from the base of the palm on the thumb side,
  // up and round the front of the fist
  const tRoot = new THREE.Group(); g.add(tRoot);
  // the thumb's base: a fat pad on the palm side (the paw stays inside it
  // when the wrist rolls)
  const thenar = add(ball, M.palm, null, [0.22, 0.24, 0.24]);
  tRoot.rotation.order = 'ZXY';
  const t1 = new THREE.Group(), t2 = new THREE.Group(); tRoot.add(t1); t1.add(t2); t2.position.y = 0.19;
  add(rollGeo(0.23, 0.1, 0.095), M.blue, null, null, t1);
  add(rollGeo(0.19, 0.092, 0.088), M.blue, null, null, t2);
  // the gauntlet: a cuff flaring up the forearm, a rolled lip in orange, an
  // orange band; closed inside the arm, so no fur shows through
  const prof = [[0.05, -0.48], [0.28, -0.5], [0.4, -0.5], [0.43, -0.47], [0.415, -0.36], [0.385, -0.2], [0.35, -0.06], [0.33, 0.06], [0.15, 0.1]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  add(new THREE.LatheGeometry(new THREE.SplineCurve(prof).getPoints(24), 36), M.blue);
  ring(0.415, 0.045, [0, -0.47, 0], M.orange);
  ring(0.4, 0.026, [0, -0.33, 0], M.orange);
  g.scale.set(1, 1, 0.9);

  /* the fingers and thumb closed by `curl` (0 open … 1 a fist), the thumb
     on the `side` (1: +x) */
  const pose = (curl, side) => {
    const c = Math.max(0, Math.min(1, curl));
    for (const F of fingers) {
      F.root.position.x = F.x * side;
      F.root.rotation.z = -F.x * side * 0.22 * (1 - c);   // a little splay when open
      F.joints.forEach((j, i) => { j.rotation.x = -(OPEN[i] + (FIST[i] - OPEN[i]) * c); });
    }
    thenar.position.set(0.16 * side, 0.33, -0.18);
    tRoot.position.set(0.33 * side, 0.21, -0.2);
    tRoot.rotation.z = side * (0.3 + 0.75 * c);
    tRoot.rotation.x = -(0.45 + 0.5 * c);
    t2.rotation.z = side * 0.6 * c;
    t2.rotation.x = -0.3 * c;
  };
  pose(0.25, 1);
  return { group: g, pose };
}
const HY = 1.7;
const GRIP = { attack: 1, throw: 1, win: 1, guard: 0.75, blockstun: 0.75, crouch: 0.5, hitstun: 0.08, grabbed: 0.08, down: 0.05, ko: 0.05, lose: 0.1, getup: 0.3 };
const smooth01 = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };   // the length scale × this ≈ the width scale at rest (true proportions)

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
        A.curl = 0.25;
        A.mirror = (side) => H.pose(A.curl, side);
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
  update(dt = 0, fx = null, act = '') {
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
      if (this.hk) {
        // the hockey glove's hand, by what he's doing (the sim's act, read
        // only): slightly open at rest, a fist to punch or grab, tight in
        // the guard, loose when hit; closing as the wrist corkscrews too.
        // fx may carry `grip` (0 open … 1 fist) to set it outright
        const want = G?.grip ?? Math.max(GRIP[act] ?? 0.22, G ? smooth01((Math.abs(G.roll) - 0.12) / 0.5) : 0);
        const c = A.curl + (want - A.curl) * Math.min(1, dt > 0 ? dt * 30 : 1);
        if (Math.abs(c - A.curl) > 1e-3 || A.side !== side) { A.curl = c; A.side = side; A.mirror(side); }
      } else if (A.side !== side) { A.side = side; A.mirror(side); }
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
