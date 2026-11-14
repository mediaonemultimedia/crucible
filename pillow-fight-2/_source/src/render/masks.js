/* Roster 2's printed-on looks and their one prop.

   The masks are painted into the fur's pattern atlas (fur.js: R the spot
   colour, G the "nose" colour), on the head grid, so they're part of the
   plush like a leopard's rosettes — the pile grows through them, cut short
   over the mask (the mask atlas's R) so they read as satin, not fur:

   - Sebas Perra's luchador mask: the whole crown down to the cheekbones,
     eye holes ringed in trim, flames sweeping back from the eyes, a stripe
     over the top. The técnico's is his own colours; his evil twin's is the
     rudo's — black and red, the flames sharpened into horns.
   - Evil Zach Sparrow's bandit mask: a black band across the eyes with
     little holes round the beads, the ties at the back of his head.

   And the evil Zach's stolen gold chain (a ring of little links and a
   medallion), worn round his neck.                                      */

import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, normalWorld, normalize } from 'three/tsl';
import { shade } from '../../shared/grommet/props.js';

const gridOf = (rig, name) => rig.parts.find((p) => p.kind === 'grid' && p.name === name);

/* (u, v) on a grid part → atlas pixels; u wraps round (0.5 the front), v
   runs top (0) to bottom (1) */
function painter(tex, rig, name) {
  const size = tex.userData.size, R = rig.regions[gridOf(rig, name).region];
  const at = (u, v) => [(R.x0 + u * (R.x1 - R.x0)) * size, (R.y0 + v * (R.y1 - R.y0)) * size];
  const g = tex.userData.ctx;
  const poly = (pts) => { pts.forEach(([u, v], k) => { const [x, y] = at(u, v); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.closePath(); };
  const ell = (u, v, ru, rv) => { const [x, y] = at(u, v), [x1, y1] = at(u + ru, v + rv); g.moveTo(x + (x1 - x), y); g.ellipse(x, y, Math.abs(x1 - x), Math.abs(y1 - y), 0, 0, Math.PI * 2); };
  return { g, at, poly, ell, size };
}

/* the luchador mask on the wolf's head; eyes at (0.5 ± eu, ev) */
export function paintLuchaMask(maskTex, patTex, rig, { evil = false, eu = 0.074, ev = 0.45 } = {}) {
  const edge = (u) => 0.6 - 0.05 * Math.max(0, 1 - Math.abs(u - 0.5) / 0.14);
  const outline = [];
  for (let k = 0; k <= 48; k++) { const u = k / 48; outline.push([u, edge(u)]); }
  outline.push([1, 0], [0, 0]);
  const holes = (P, grow = 1) => { for (const s of [-1, 1]) P.ell(0.5 + s * eu, ev, 0.043 * grow, 0.07 * grow); };

  // the pile cut short over the mask (not the eye holes): satin, not fur
  {
    const P = painter(maskTex, rig, 'head');
    P.g.save();
    P.g.globalCompositeOperation = 'multiply';
    P.g.fillStyle = 'rgb(105,255,255)';
    P.g.beginPath(); P.poly(outline); holes(P); P.g.fill('evenodd');
    P.g.restore();
    maskTex.needsUpdate = true;
  }
  const P = painter(patTex, rig, 'head'), g = P.g;
  g.save();
  g.globalCompositeOperation = 'source-over';
  const SPOT = 'rgb(255,0,0)', TRIM = 'rgb(0,255,0)';
  // the mask itself
  g.fillStyle = SPOT;
  g.beginPath(); P.poly(outline); g.fill();
  g.fillStyle = TRIM;
  // a trim band along its lower edge
  g.beginPath();
  const band = [];
  for (let k = 0; k <= 48; k++) { const u = k / 48; band.push([u, edge(u)]); }
  for (let k = 48; k >= 0; k--) { const u = k / 48; band.push([u, edge(u) - 0.035]); }
  P.poly(band); g.fill();
  // the stripe over the top, front to back, a diamond on the forehead
  g.beginPath(); P.poly([[0.488, 0.0], [0.512, 0.0], [0.512, 0.24], [0.535, 0.3], [0.5, 0.37], [0.465, 0.3], [0.488, 0.24]]); g.fill();
  g.beginPath(); P.poly([[0.0, 0.0], [0.016, 0.0], [0.016, 0.5], [0.0, 0.5]]); g.fill();
  g.beginPath(); P.poly([[0.984, 0.0], [1.0, 0.0], [1.0, 0.5], [0.984, 0.5]]); g.fill();
  // flames off the eyes, sweeping up and back (the rudo's sharpened into horns)
  for (const s of [-1, 1]) {
    const u0 = 0.5 + s * eu, F = (du, dv) => [u0 + s * du, ev + dv];
    g.beginPath();
    P.poly(evil
      ? [F(0.02, -0.06), F(0.07, -0.2), F(0.1, -0.33), F(0.09, -0.17), F(0.16, -0.24), F(0.13, -0.08), F(0.06, 0.02)]
      : [F(0.03, -0.05), F(0.08, -0.13), F(0.15, -0.18), F(0.12, -0.1), F(0.2, -0.1), F(0.14, -0.03), F(0.22, 0.0), F(0.12, 0.04), F(0.05, 0.05)]);
    g.fill();
  }
  // eye holes ringed in trim
  g.beginPath(); holes(P, 1.55); g.fill();
  g.fillStyle = 'rgb(0,0,0)';
  g.beginPath(); holes(P); g.fill();
  g.restore();
  patTex.needsUpdate = true;
}

/* the bandit's mask across the crow's eyes (0.5 ± eu, ev); the bib stays */
export function paintBanditMask(maskTex, patTex, rig, { eu = 0.15, ev = 0.43 } = {}) {
  const band = [[0.27, ev - 0.08], [0.4, ev - 0.1], [0.5, ev - 0.065], [0.6, ev - 0.1], [0.73, ev - 0.08], [0.78, ev + 0.0], [0.73, ev + 0.09], [0.6, ev + 0.08], [0.5, ev + 0.11], [0.4, ev + 0.08], [0.27, ev + 0.09], [0.22, ev + 0.0]];
  const P = painter(patTex, rig, 'head'), g = P.g;
  g.save();
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgb(255,0,0)';
  g.beginPath(); P.poly(band); g.fill();
  // the ties at the back of his head, trailing
  for (const u of [0.02, 0.98]) { g.beginPath(); P.poly([[u - 0.02, ev - 0.03], [u + 0.02, ev - 0.03], [u + 0.035, ev + 0.16], [u - 0.035, ev + 0.16]]); g.fill(); }
  g.beginPath(); P.poly([[0.0, ev - 0.025], [0.26, ev - 0.02], [0.26, ev + 0.02], [0.0, ev + 0.025]]); g.fill();
  g.beginPath(); P.poly([[0.74, ev - 0.02], [1.0, ev - 0.025], [1.0, ev + 0.025], [0.74, ev + 0.02]]); g.fill();
  // little holes round the bead eyes, so they still read
  g.fillStyle = 'rgb(0,0,0)';
  g.beginPath(); for (const s of [-1, 1]) P.ell(0.5 + s * eu, ev, 0.028, 0.042); g.fill();
  g.restore();
  patTex.needsUpdate = true;
  // the mask's pile short and flat
  const M = painter(maskTex, rig, 'head');
  M.g.save(); M.g.globalCompositeOperation = 'multiply'; M.g.fillStyle = 'rgb(120,255,255)';
  M.g.beginPath(); M.poly(band); M.g.fill(); M.g.restore();
  maskTex.needsUpdate = true;
}

/* the stolen gold chain: links round an ellipse, a medallion at the front.
   `place(group, worldOf, R)` each frame puts it round his neck. */
export function makeGoldChain({ c = [0, 1.6, 0.1], rx = 0.5, rz = 0.46, tip = 0.38, link = 0.07 } = {}) {
  const g = new THREE.Group();
  const gold = new THREE.MeshBasicNodeMaterial();
  gold.colorNode = Fn(() => vec4(shade(vec3(0.95, 0.72, 0.22), normalize(normalWorld), { spec: 0.75, power: 34, wrap: 0.3 }), 1))();
  const geo = new THREE.TorusGeometry(link, link * 0.36, 8, 14);
  const N = 22;
  const links = new THREE.InstancedMesh(geo, gold, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  for (let k = 0; k < N; k++) {
    const a = (k / N) * Math.PI * 2;
    // round the neck, hanging lower in front
    p.set(Math.sin(a) * rx, -Math.max(0, Math.cos(a)) * 0.12, Math.cos(a) * rz);
    e.set(k % 2 ? Math.PI / 2 : 0, a + Math.PI / 2, 0, 'YXZ');
    q.setFromEuler(e);
    m.compose(p, q, sc);
    links.setMatrixAt(k, m);
  }
  links.frustumCulled = false;
  const medal = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.035, 24), gold);
  medal.rotation.x = Math.PI / 2;
  medal.position.set(0, -0.22, rz + 0.02);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 6, 12), gold);
  ring.position.set(0, -0.1, rz + 0.02);
  const inner = new THREE.Group();
  inner.add(links, medal, ring);
  inner.rotation.x = tip;            // tipped forward: lower at the front
  g.add(inner);
  g.userData.c = c;
  g.visible = false;
  return g;
}
