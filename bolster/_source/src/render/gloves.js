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
import { Fn, vec3, vec4, normalWorld, normalize, positionLocal, smoothstep, abs, float, uniform, mix } from 'three/tsl';
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

function leather(color) {
  const m = new THREE.MeshBasicNodeMaterial();
  const c = uniform(new THREE.Color(color));
  m.colorNode = Fn(() => {
    const p = positionLocal;
    // a seam down the back of the fist and over the knuckles, and one round
    // the wrist where the padding meets the cuff
    const seam = smoothstep(0.022, 0.008, abs(p.x)).mul(smoothstep(0.0, 0.1, p.z)).add(smoothstep(0.03, 0.012, abs(p.y.sub(0.1))));
    const base = mix(c, c.mul(0.55), seam.clamp(0, 1).mul(0.8));
    return vec4(shade(base, normalize(normalWorld), { spec: 0.6, power: 34, wrap: 0.45 }), 1);
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

export class Gloves {
  constructor(group, soft, rig, color) {
    this.soft = soft;
    this.mat = leather(color);
    this.lace = plain('#f4efe6');
    this.arms = rig.arms.filter((c) => c.kind === 'arm').map((ch) => {
      const part = (rig.cloth?.parts || []).find((p) => p.chain === ch.k && / glove$/.test(p.name || ''));
      const s0 = part ? part.s0 : 0.7, sw = s0 + (1 - s0) * CUFF;   // the wrist: where the cuff ends
      const glove = makeGlove(this.mat, this.lace);
      glove.matrixAutoUpdate = false;
      group.add(glove);
      // which way is "in" (toward the body's middle) for this arm, in rest
      const tip = ch.idx[ch.idx.length - 1];
      return { ch, sw, glove, thumb: glove.children[1], side: 0, inward: rig.rest[tip * 3] > 0 ? -1 : 1, r: ch.radius(0.9) };
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

  update() {
    const W = this._w, T = this._t, X = this._x, Z = this._z;
    for (const A of this.arms) {
      const wrist = this._at(A.ch, A.sw, this._a), end = this._at(A.ch, 1, this._b);
      T.subVectors(end, wrist);
      const reach = T.length();
      T.normalize();
      // the back of the hand up, square to the arm (an arm straight up or
      // down: the back of the hand forward instead)
      Z.set(0, 1, 0).addScaledVector(T, -T.y);
      if (Z.lengthSq() < 0.02) Z.set(0, 0, 1).addScaledVector(T, -T.z);
      Z.normalize();
      X.crossVectors(T, Z);
      // the thumb on the side toward the body's middle: mirrored per arm
      const side = X.x * A.inward >= 0 ? 1 : -1;
      if (A.side !== side) { A.side = side; A.thumb.position.x = 0.36 * side; A.thumb.rotation.z = -0.32 * side; }
      const L = reach + A.r * 1.3;            // over the end of the paw
      const k = (A.r * 1.9) / 0.45;           // knuckles ~1.4× the old glove's width
      this._m.makeBasis(X.multiplyScalar(k), T.multiplyScalar(L), Z.multiplyScalar(k));
      W.copy(wrist).addScaledVector(this._t, -0.04 / L);
      this._m.setPosition(W);
      A.glove.matrix.copy(this._m);
      A.glove.matrixWorldNeedsUpdate = true;
    }
  }
}
