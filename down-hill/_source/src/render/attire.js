/* Worn felt that follows the plush's own skin (cosmetic only: nothing here
   reaches the sim). Kept apart from the fighters' rigs on purpose: a piece
   only needs a grid part by name ('torso'), so it carries over when a body
   is remodelled.

   The sash: Evil Sebas's black-and-red felt sash, worn over one shoulder
   and across to the other hip, the way a rudo wears his title. It is a soft
   felt band re-laid on the torso's surface every frame — sampled from the
   skinned body itself (bilinear between its vertices), so it stretches,
   squashes and turns with the stuffing through every move, hit and K.O.
   and can't float off or sink in. Black felt, a red felt edge either side
   with a running stitch in black thread between, the edges rolled under
   into the fur; the pile beneath it is cut short so fur doesn't come
   through.                                                              */

import * as THREE from 'three/webgpu';
import {
  Fn, float, vec3, vec4, normalWorld, cameraPosition, positionWorld, positionLocal,
  mix, smoothstep, normalize, dot, pow, abs, fract, uv, mx_noise_float,
} from 'three/tsl';
import { shade } from '../../shared/grommet/props.js';

/* the band's colours: deep felt black, a crimson felt edge, black thread */
function sashMaterial() {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  m.colorNode = Fn(() => {
    const N0 = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
    const N = dot(N0, V).lessThan(0).select(N0.negate(), N0);
    const t = uv().y, s = uv().x;                       // t: across 0 → 1; s: along, in band widths
    const across = abs(t.sub(0.5)).mul(2);              // 0 middle → 1 rolled edge
    const red = smoothstep(0.6, 0.64, across);
    const black = vec3(0.034, 0.03, 0.036), crimson = vec3(0.55, 0.035, 0.05);
    const base = mix(black, crimson, red).toVar();
    // a running stitch along each seam, in black thread on the red
    const seam = smoothstep(0.05, 0.0, abs(across.sub(0.78))).mul(smoothstep(0.42, 0.5, fract(s.mul(5.5))).mul(smoothstep(0.98, 0.9, fract(s.mul(5.5)))));
    base.assign(mix(base, vec3(0.02, 0.015, 0.02), seam.mul(0.9)));
    // felt: fine fibres, a soft fuzzy rim, the seam a little sunk
    const fib = mx_noise_float(vec3(positionLocal.mul(70))).mul(0.09).add(0.97);
    const sunk = mix(float(1), float(0.72), smoothstep(0.06, 0.0, abs(across.sub(0.62))));
    const b2 = base.mul(fib).mul(sunk);
    const rim = pow(float(1).sub(abs(dot(N, V))), float(2.2));
    return vec4(shade(b2, N, { spec: 0.05, power: 10, wrap: 0.5 }).add(b2.mul(rim.mul(0.4))).add(vec3(0.22, 0.02, 0.03).mul(rim.mul(red).mul(0.35))), 1);
  })();
  return m;
}

/* a grid part's skin, sampled smoothly at (u, v): position and normal */
function sampler(body, partName) {
  const P = body.parts.find((q) => q.name === partName);
  return (u, v, outP, outN) => {
    u = ((u % 1) + 1) % 1;
    const fu = u * P.U, fv = Math.min(P.V - 1e-4, Math.max(0, v * P.V));
    const i = Math.min(P.U - 1, Math.floor(fu)), j = Math.floor(fv), a = fu - i, b = fv - j;
    const pos = body.pos, nrm = body.nrm, W = P.U + 1;
    const v00 = P.o + j * W + i, v10 = v00 + 1, v01 = v00 + W, v11 = v01 + 1;
    const w00 = (1 - a) * (1 - b), w10 = a * (1 - b), w01 = (1 - a) * b, w11 = a * b;
    for (let d = 0; d < 3; d++) {
      outP.setComponent(d, pos[v00 * 3 + d] * w00 + pos[v10 * 3 + d] * w10 + pos[v01 * 3 + d] * w01 + pos[v11 * 3 + d] * w11);
      outN.setComponent(d, nrm[v00 * 3 + d] * w00 + nrm[v10 * 3 + d] * w10 + nrm[v01 * 3 + d] * w01 + nrm[v11 * 3 + d] * w11);
    }
    outN.normalize();
  };
}

/* the sash. opts: part (a grid part's name), the path round it (u wraps,
   0.5 the front; v 0 the top): v = vc − A·cos 2π(u − us), so the band is
   highest (the shoulder) at u = us and lowest (the hip) opposite; w its
   width in world units */
export function makeSash(plush, { part = 'torso', vc = 0.46, A = 0.26, us = 0.79, w = 0.33, lift = 0.035, thick = 0.045 } = {}) {
  const body = plush.body, rig = plush.rig;
  const NS = 120, PR = [[-1, -0.35], [-0.92, 0.45], [-0.62, 0.92], [0, 1], [0.62, 0.92], [0.92, 0.45], [1, -0.35]];
  const NC = PR.length;
  const path = (u) => [u, vc - A * Math.cos(2 * Math.PI * (u - us))];

  // the pile cut short under it (the fur's pile is the mask's red channel)
  const grid = rig.parts.find((q) => q.kind === 'grid' && q.name === part);
  if (grid && plush.maskTex) {
    const tex = plush.maskTex, S = tex.userData.size, R = rig.regions[grid.region], g = tex.userData.ctx;
    const at = (u, v) => [(R.x0 + u * (R.x1 - R.x0)) * S, (R.y0 + v * (R.y1 - R.y0)) * S];
    const pxV = w / (Math.PI * grid.r[1]) * (R.y1 - R.y0) * S;
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.strokeStyle = 'rgb(46,255,255)';
    g.lineWidth = pxV * 1.25; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    for (let k = 0; k <= 160; k++) { const [u, v] = path(k / 160), [x, y] = at(u, v); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
    g.restore();
    tex.needsUpdate = true;
  }

  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array((NS + 1) * NC * 3), uvs = new Float32Array((NS + 1) * NC * 2), idx = [];
  for (let i = 0; i < NS; i++) for (let c = 0; c < NC - 1; c++) {
    const a = i * NC + c, b = (i + 1) * NC + c;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length), 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  const mesh = new THREE.Mesh(geo, sashMaterial());
  mesh.frustumCulled = false;

  const sample = sampler(body, part);
  const Ps = [], Ns = [];
  for (let i = 0; i <= NS; i++) { Ps.push(new THREE.Vector3()); Ns.push(new THREE.Vector3()); }
  const T = new THREE.Vector3(), X = new THREE.Vector3(), Q = new THREE.Vector3();

  function update() {
    for (let i = 0; i <= NS; i++) { const [u, v] = path(i / NS); sample(u, v, Ps[i], Ns[i]); }
    let along = 0;
    for (let i = 0; i <= NS; i++) {
      const p = Ps[i], n = Ns[i];
      const a = Ps[(i + NS - 1) % NS], b = Ps[(i + 1) % NS];
      T.subVectors(b, a).normalize();
      X.crossVectors(n, T).normalize();           // across the band, in the skin
      if (i) along += Ps[i].distanceTo(Ps[i - 1]) / w;
      for (let c = 0; c < NC; c++) {
        const [x, y] = PR[c];
        // a soft pillowed felt band, its edges rolled under into the fur
        Q.copy(p).addScaledVector(X, x * w * 0.5).addScaledVector(n, lift + y * thick);
        pos.set([Q.x, Q.y, Q.z], (i * NC + c) * 3);
        uvs.set([along, c / (NC - 1)], (i * NC + c) * 2);
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
    geo.computeVertexNormals();
  }
  update();
  return { mesh, update };
}


/* ── Zach Sparrow's wings: layered felt primaries ─────────────────────────
   The wing itself is the crow's stuffed, stitched chain (its scallops of
   covert feathers are stitched in the atlas). At its tip four long felt
   flight feathers are sewn in layers, shingled one over the next, lying
   back along the folded wing at rest and fanning open as the wing opens
   (an attack, a jump, a block): how far is measured each frame from the
   wing's own turn away from where it is sewn. Each is a soft felt vane, a
   little cupped, a quill stitched down it in thread; they ride the wing's
   rings (render/twins.js tubeRing) so they never float off it.          */

function featherGeo(L, W) {
  // a long rounded vane, the trailing side wider, the tip rounded off
  const s = new THREE.Shape(), N = 18, pts = [];
  // (a narrow quill base, the vane full by a third of the way, a round end)
  const wOf = (t) => Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, t - 0.32) / 0.68, 2.2))) * (0.35 + 0.65 * Math.min(1, t / 0.3));
  for (let k = 0; k <= N; k++) { const t = k / N; pts.push([W * 0.42 * wOf(t), L * t]); }
  for (let k = N; k >= 0; k--) { const t = k / N; pts.push([-W * 0.58 * wOf(t), L * t]); }
  pts.forEach(([x, y], k) => (k ? s.lineTo(x, y) : s.moveTo(x, y)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.014, bevelSegments: 3, curveSegments: 4 });
  // cupped a little across the vane, the tip curling back toward the body
  const P = geo.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i);
    P.setZ(i, P.getZ(i) - 1.6 * x * x - 0.18 * Math.pow(Math.max(0, y / L), 2.5) * L * 0.25);
  }
  geo.computeVertexNormals();
  return geo;
}

function featherMat(color, sheen) {
  const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const c = new THREE.Color(color), sh = new THREE.Color(sheen || '#000000');
  m.colorNode = Fn(() => {
    const N0 = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
    const N = dot(N0, V).lessThan(0).select(N0.negate(), N0);
    const p = positionLocal;
    // felt fibres; faint barbs angled off the quill; the quill a stitched line
    const fib = mx_noise_float(vec3(p.mul(90))).mul(0.14).add(0.95);
    const barbs = smoothstep(0.35, 0.65, fract(p.y.mul(46).add(abs(p.x).mul(30)))).mul(0.06).add(0.97);
    const quill = smoothstep(0.009, 0.002, abs(p.x)).mul(smoothstep(0.02, 0.06, p.y));
    // (a dark felt a little lifted: under the same light the fur's pile
    // catches more of it than a flat vane does)
    const lift = c.r * 0.3 + c.g * 0.59 + c.b * 0.11 < 0.3 ? 1.9 : 0.86;
    const base = vec3(c.r, c.g, c.b).mul(lift).mul(fib).mul(barbs).toVar();
    const lum = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
    const thread = lum < 0.3 ? vec3(c.r, c.g, c.b).mul(2.2).add(0.05) : vec3(c.r, c.g, c.b).mul(0.82);
    base.assign(mix(base, thread, quill.mul(0.8)));
    const rim = pow(float(1).sub(abs(dot(N, V))), float(2.4));
    return vec4(shade(base, N, { spec: 0.025, power: 8, wrap: 0.55 }).add(base.mul(rim.mul(0.35))).add(vec3(sh.r, sh.g, sh.b).mul(rim.mul(0.45))), 1);
  })();
  return m;
}

const FEATHERS = [
  // ring s on the wing, length, width, place across the wing (1 its
  // trailing edge), fan angle shut / open (radians off the wing's axis,
  // toward the trailing side), layer (outward: shingled, tip-most on top)
  { s: 0.52, L: 0.42, W: 0.25, off: 0.7, a0: 0.07, a1: 0.7, lay: 0.0 },
  { s: 0.63, L: 0.52, W: 0.24, off: 0.62, a0: 0.04, a1: 0.68, lay: 0.014 },
  { s: 0.74, L: 0.55, W: 0.23, off: 0.5, a0: 0.02, a1: 0.42, lay: 0.028 },
  { s: 0.84, L: 0.52, W: 0.22, off: 0.3, a0: 0.0, a1: 0.2, lay: 0.042 },
];

export function makeWingFeathers(plush, { color, sheen, wings = ['right wing', 'left wing'], tubeRing }) {
  const group = new THREE.Group();
  const mat = featherMat(color, sheen);
  const sets = wings.map((name) => {
    const ms = FEATHERS.map((f) => { const m = new THREE.Mesh(featherGeo(f.L, f.W), mat); m.matrixAutoUpdate = false; m.frustumCulled = false; group.add(m); return m; });
    const ch = plush.rig.arms.find((c) => c.name === name), r = plush.rig.rest, i0 = ch.idx[0], i1 = ch.idx[ch.idx.length - 1];
    const rest = new THREE.Vector3(r[i1 * 3] - r[i0 * 3], r[i1 * 3 + 1] - r[i0 * 3 + 1], r[i1 * 3 + 2] - r[i0 * 3 + 2]).normalize();
    // the trailing side: axis × flat axis, signed once from the sewn pose
    // (the lower edge of the folded wing) so it turns with the wing and
    // never flips side when the wing is held level
    const ref = new THREE.Vector3(...(ch.ref0 || ch.ref)), sign = new THREE.Vector3().crossVectors(rest, ref).y > 0 ? -1 : 1;
    return { name, ms, rest, i0, i1, sign };
  });
  const M = new THREE.Matrix4(), X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), Wd = new THREE.Vector3();
  const D = new THREE.Vector3(), A = new THREE.Vector3(), R0 = new THREE.Matrix3();
  function update() {
    const soft = plush.soft, R = soft.cloudR[0];
    R0.set(R[0], R[1], R[2], R[3], R[4], R[5], R[6], R[7], R[8]);
    for (const S of sets) {
      // how open: the wing's turn away from its sewn direction (in the body's frame)
      const x = soft.x, i0 = S.i0, i1 = S.i1;
      A.set(x[i1 * 3] - x[i0 * 3], x[i1 * 3 + 1] - x[i0 * 3 + 1], x[i1 * 3 + 2] - x[i0 * 3 + 2]).normalize();
      D.copy(S.rest).applyMatrix3(R0);
      const open = Math.min(1, Math.max(0, (1 - A.dot(D)) / 0.55));
      const ease = open * open * (3 - 2 * open);
      S.ms.forEach((m, k) => {
        const f = FEATHERS[k], ring = tubeRing(plush.body, S.name, f.s);
        // the wing's plane: its axis and its width (square to the flat axis,
        // ring.ref); the trailing side is the one away from the head (−up)
        Wd.crossVectors(ring.axis, ring.ref).normalize().multiplyScalar(S.sign);
        const out = ring.ref.clone();
        const a = f.a0 + (f.a1 - f.a0) * ease;
        Y.copy(ring.axis).multiplyScalar(Math.cos(a)).addScaledVector(Wd, Math.sin(a)).normalize();
        Z.copy(out).addScaledVector(Y, -out.dot(Y)).normalize();
        X.crossVectors(Y, Z);
        const root = ring.c.clone().addScaledVector(Wd, f.off * ring.r * 0.8).addScaledVector(out, ring.r * 0.3 + f.lay);
        M.makeBasis(X, Y, Z).setPosition(root);
        m.matrix.copy(M);
        m.matrixWorldNeedsUpdate = true;
      });
    }
  }
  return { group, update };
}
