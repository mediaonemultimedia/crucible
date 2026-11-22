/* The panda's and the leopard's muzzles, refined (bolster-models).

   Kevalanche's muzzle is the one that works: a soft rounded panel of short
   pile, pushed forward from the face, a broad felt nose pad and a small
   stitched mouth. Sumaura's and Johnny's were the shared rigs' (Grommet's)
   and read a little off: the head's long fur stood up over the muzzle's
   edge and poked through it, the pile on the muzzle itself was long enough
   to look spiky, the leopard's whisker dots read as dirt and his small
   nose was lost.

   Here, after the shared rig is built and painted (nothing in shared/ is
   changed):
   - `refit(rig, spec)` reshapes the muzzle grid (centre, radii, tilt) and
     gives it a short, tidy pile that lengthens toward its back edge, so it
     reads as a sewn-on panel that blends into the face;
   - `paintMuzzle(…)` repaints that grid: the old marks cleared, then a
     properly shaped nose (the panda's a black rounded pad; the leopard's a
     pink-brown cat's triangle), a small stitched mouth, the leopard's two
     whisker pads (a little fuller, a groove between) with three fine
     whisker dots each — and the head's pile cut short round the muzzle's
     seam, so no face fur pokes over it.
   OG and ALT both (the twins keep their own colours). Render only.        */

import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, normalWorld, normalize, uniform, pow, float, dot, clamp, cameraPosition, positionWorld } from 'three/tsl';
import { shade } from '../../shared/grommet/props.js';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, s], [0, -s, c]]; };

export const MUZZLES = {
  // short, broad, rounded
  panda: { c: [0, 2.31, 0.68], r: [0.34, 0.215, 0.25], tilt: 0.14, pile: [0.3, 0.62], under: 1 },
  // a short cat's muzzle, a touch narrower and fuller below the nose
  leopard: { c: [0, 2.3, 0.63], r: [0.3, 0.205, 0.22], tilt: 0.12, pile: [0.32, 0.62], under: 1 },
};

const gridOf = (rig, name) => rig.parts.find((p) => p.kind === 'grid' && p.name === name);

export function refit(rig, kind) {
  const M = MUZZLES[kind], P = gridOf(rig, 'muzzle');
  if (!P) return;
  P.c = M.c; P.r = M.r; P.B = rotX(M.tilt);
  const [p0, p1] = M.pile;
  // short on the front, longer toward the back edge where it meets the face
  P.pile = (u, v, l) => p0 + (p1 - p0) * sm(0.35, -0.3, l[2]);
  if (M.under != null) { const w = M.under; P.under = () => w; }
  // a tidy, combed pile: no ruffle on the muzzle
  const R = rig.regions[P.region];
  R.ruf = 0.02;
}

function painter(tex, rig) {
  const g = tex.userData.ctx, size = tex.userData.size;
  const reg = (name) => rig.regions[gridOf(rig, name).region];
  const at = (name, u, v) => { const R = reg(name); return [(R.x0 + u * (R.x1 - R.x0)) * size, (R.y0 + v * (R.y1 - R.y0)) * size]; };
  const px = (name, v, w, h) => {
    const P = gridOf(rig, name), R = reg(name), sp = Math.max(0.2, Math.sin(v * Math.PI));
    return [w / (2 * Math.PI * Math.max(P.r[0], P.r[2]) * sp) * (R.x1 - R.x0) * size, h / (Math.PI * P.r[1]) * (R.y1 - R.y0) * size];
  };
  const clear = (name, style) => { const R = reg(name); g.fillStyle = style; g.fillRect(R.x0 * size, R.y0 * size, (R.x1 - R.x0) * size, (R.y1 - R.y0) * size); };
  const ell = (name, u, v, w, h, style) => {
    const [x, y] = at(name, u, v), [rx, ry] = px(name, v, w, h);
    g.fillStyle = style; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  };
  const stitch = (name, pts, w, style = 'rgb(0,0,255)') => {
    const [, ry] = px(name, pts[0][1], w, w);
    g.strokeStyle = style; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = Math.max(1.4, ry * 2);
    g.beginPath(); pts.forEach(([u, v], k) => { const [x, y] = at(name, u, v); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
  };
  return { g, size, at, px, clear, ell, stitch };
}

/* where the muzzle meets the head, in the head grid's (u, v), and how big */
function seam(rig) {
  const H = gridOf(rig, 'head'), M = gridOf(rig, 'muzzle');
  const d = [(M.c[0] - H.c[0]) / H.r[0], (M.c[1] - H.c[1]) / H.r[1], (M.c[2] - H.c[2]) / H.r[2]];
  const l = Math.hypot(...d);
  const v = Math.acos(d[1] / l) / Math.PI, u = 0.5 + Math.atan2(d[0], d[2]) / (2 * Math.PI);
  return { u, v, w: M.r[0] * 2.3, h: M.r[1] * 2.3 };
}

export function paintMuzzle(maskTex, patTex, rig, kind) {
  if (!gridOf(rig, 'muzzle')) return;
  // the mask: R pile, G blush, B stitch
  {
    const P = painter(maskTex, rig), { g } = P;
    g.save();
    g.globalCompositeOperation = 'source-over';
    P.clear('muzzle', 'rgb(255,0,0)');
    // the head's pile cut short round the seam: a soft ring, shortest at the
    // edge of the muzzle, back to full a little way out
    const S = seam(rig), [x, y] = P.at('head', S.u, S.v), [rx, ry] = P.px('head', S.v, S.w, S.h);
    g.globalCompositeOperation = 'multiply';
    g.save(); g.translate(x, y); g.scale(rx, ry);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, 'rgb(120,255,255)'); gr.addColorStop(0.55, 'rgb(150,255,255)'); gr.addColorStop(1, 'rgb(255,255,255)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill();
    g.restore();
    g.globalCompositeOperation = 'source-over';
    if (kind === 'leopard') {
      // two whisker pads: fuller pile either side, a groove down the middle
      g.globalCompositeOperation = 'multiply';
      P.ell('muzzle', 0.5, 0.52, 0.05, 0.22, 'rgb(170,255,255)');
      g.globalCompositeOperation = 'source-over';
    }
    // the nose: bare felt (no pile), its colour in the pattern below
    g.fillStyle = 'rgb(0,0,0)';
    nose(P, kind);
    g.globalCompositeOperation = 'lighter';
    if (kind === 'panda') {
      P.stitch('muzzle', [[0.5, 0.405], [0.5, 0.5]], 0.022);
      P.stitch('muzzle', [[0.435, 0.545], [0.468, 0.552], [0.5, 0.5], [0.532, 0.552], [0.565, 0.545]], 0.022);
    } else {
      // the cat's mouth: down from the nose, then an ω
      P.stitch('muzzle', [[0.5, 0.39], [0.5, 0.47]], 0.02);
      P.stitch('muzzle', [[0.43, 0.5], [0.455, 0.525], [0.48, 0.515], [0.5, 0.47], [0.52, 0.515], [0.545, 0.525], [0.57, 0.5]], 0.02);
      // three fine whisker dots on each pad
      for (const s of [-1, 1]) for (const [du, dv] of [[0.085, 0.43], [0.11, 0.455], [0.09, 0.48]]) P.ell('muzzle', 0.5 + s * du, dv, 0.016, 0.016, 'rgb(0,0,150)');
    }
    g.restore();
    maskTex.needsUpdate = true;
  }
  // the pattern: R spots (none on the muzzle), G the nose colour
  {
    const P = painter(patTex, rig), { g } = P;
    g.save();
    g.globalCompositeOperation = 'source-over';
    P.clear('muzzle', 'rgb(0,0,0)');
    g.fillStyle = 'rgb(0,255,0)';
    nose(P, kind);
    g.restore();
    patTex.needsUpdate = true;
  }
}

/* the nose, filled in the current style: the panda's a broad rounded pad;
   the leopard's a cat's rounded triangle, point down */
function nose(P, kind) {
  const { g } = P;
  const v = kind === 'panda' ? 0.31 : 0.305;
  const [x, y] = P.at('muzzle', 0.5, v), [sx, sy] = P.px('muzzle', v, 1, 1);
  g.beginPath();
  if (kind === 'panda') {
    const w = 0.11, h = 0.1;
    g.moveTo(x - w * sx, y - h * 0.3 * sy);
    g.bezierCurveTo(x - w * sx, y - h * 0.75 * sy, x + w * sx, y - h * 0.75 * sy, x + w * sx, y - h * 0.3 * sy);
    g.bezierCurveTo(x + w * sx, y + h * 0.25 * sy, x + w * 0.35 * sx, y + h * 0.55 * sy, x, y + h * 0.55 * sy);
    g.bezierCurveTo(x - w * 0.35 * sx, y + h * 0.55 * sy, x - w * sx, y + h * 0.25 * sy, x - w * sx, y - h * 0.3 * sy);
  } else {
    const w = 0.08, h = 0.07;
    g.moveTo(x - w * sx, y - h * 0.45 * sy);
    g.quadraticCurveTo(x, y - h * 0.62 * sy, x + w * sx, y - h * 0.45 * sy);
    g.quadraticCurveTo(x + w * 1.02 * sx, y - h * 0.25 * sy, x + w * 0.8 * sx, y - h * 0.08 * sy);
    g.lineTo(x + w * 0.16 * sx, y + h * 0.5 * sy);
    g.quadraticCurveTo(x, y + h * 0.62 * sy, x - w * 0.16 * sx, y + h * 0.5 * sy);
    g.lineTo(x - w * 0.8 * sx, y - h * 0.08 * sy);
    g.quadraticCurveTo(x - w * 1.02 * sx, y - h * 0.25 * sy, x - w * sx, y - h * 0.45 * sy);
  }
  g.fill();
}

/* ── the nose itself: a small stuffed felt nose sewn on the muzzle ─────────
   The painted pad was flat and its edge stepped (the atlas is coarse at
   that size); a plush toy's nose is a little sewn-on piece of its own. So
   the nose is a small soft solid — a rounded pad (dog, wolf, panda) or a
   cat's rounded triangle, point down — with a satin sheen, riding the
   muzzle's skin every frame (its surface point and normal, the head's up),
   over the bare patch painted for it. Its colour is the plush's nose
   colour (the twins keep theirs).                                         */

export const NOSES = {
  // half-extents in world units (width, height, depth); v on the muzzle grid
  wolf: { v: 0.3, size: [0.125, 0.09, 0.075], taper: 0.3, lift: 0.025 },
  panda: { v: 0.31, size: [0.13, 0.088, 0.075], taper: 0.3, lift: 0.02 },
  leopard: { v: 0.305, size: [0.095, 0.072, 0.055], taper: 0.62, lift: 0.015 },
};

export function makeNose(kind, color) {
  const S = NOSES[kind];
  const geo = new THREE.SphereGeometry(1, 28, 18);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // narrower toward the bottom (a rounded triangle, point down), the top
    // edge a touch flattened, the back flat against the muzzle
    const k = 1 - S.taper * sm(-0.9, 0.95, -y);
    p.setXYZ(i, x * k, y * (y > 0 ? 0.85 : 1), z < 0 ? z * 0.35 : z);
  }
  geo.computeVertexNormals();
  const col = uniform(new THREE.Color(color));
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const N = normalize(normalWorld), V = normalize(cameraPosition.sub(positionWorld));
    const rim = pow(float(1).sub(clamp(dot(N, V), 0, 1)), float(2.5));
    const base = vec3(col);
    // a satin felt: a soft broad sheen, a faint rim
    return vec4(shade(base, N, { spec: 0.32, power: 22, wrap: 0.45 }).add(vec3(0.06, 0.055, 0.06).mul(rim)), 1);
  })();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  const P = new THREE.Vector3(), Nn = new THREE.Vector3(), U = new THREE.Vector3(), X = new THREE.Vector3(), Y = new THREE.Vector3(), M = new THREE.Matrix4();
  return {
    mesh,
    setColor(c) { col.value.set(c); },
    update(plush) {
      const body = plush.body, part = body.parts.find((q) => q.name === 'muzzle');
      body.surfacePoint('muzzle', 0.5, S.v, P, Nn);
      const R = plush.soft.cloudR[part.cloud] || plush.soft.cloudR[0];
      U.set(R[1], R[4], R[7]);
      X.crossVectors(U, Nn).normalize();
      Y.crossVectors(Nn, X);
      M.makeBasis(X, Y, Nn);
      mesh.quaternion.setFromRotationMatrix(M);
      mesh.position.copy(P).addScaledVector(Nn, S.lift);
      mesh.scale.set(S.size[0], S.size[1], S.size[2]);
    },
  };
}
