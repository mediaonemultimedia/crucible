/* What the giraffe plays with: soft felt rings, each a torus in its own
   colour with a running stitch round its outer edge and a paler blanket
   stitch round the hole. Felt material, the same hand lighting as the
   other props.                                                          */

import * as THREE from 'three/webgpu';
import { RING } from './ring.js';
import { feltMaterial } from './props.js';

export const RING_COLORS = ['#e0573f', '#e8b931', '#2f9c95', '#3b62b5', '#ee8a3a', '#6aab4b'];

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function ringGeometry(hex) {
  const geo = new THREE.TorusGeometry(RING.R, RING.r, 20, 72);
  const P = geo.attributes.position, n = P.count;
  const col = new Float32Array(n * 3);
  const base = new THREE.Color(hex), thread = new THREE.Color('#f6f1e4');
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i);
    const a = Math.atan2(v.y, v.x);
    const rho = Math.hypot(v.x, v.y);
    // where round the tube: outer rim (rho big), the hole (rho small)
    const outer = sm(RING.R + RING.r * 0.82, RING.R + RING.r * 0.97, rho);
    const inner = sm(RING.R - RING.r * 0.8, RING.R - RING.r * 0.95, rho);
    // dashes: a running stitch outside, a blanket stitch in the hole
    const dashO = Math.sin(a * 46) > 0.15 ? 1 : 0;
    const dashI = Math.sin(a * 30) > 0.55 ? 1 : 0;
    const w = Math.max(outer * dashO * 0.9, inner * dashI * 0.7);
    // and a felt seam where the strip was joined into a ring
    const seam = sm(0.05, 0.015, Math.abs(Math.atan2(Math.sin(a - 2.2), Math.cos(a - 2.2)))) * 0.35;
    const c = base.clone().multiplyScalar(1 - seam).lerp(thread, w);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

/* one mesh per ring, made on first sight and dropped when it's gone */
export function makeRings() {
  const g = new THREE.Group();
  g.userData.meshes = new Map();
  g.userData.geos = RING_COLORS.map(ringGeometry);
  g.userData.mat = feltMaterial();
  return g;
}

export function poseRings(g, rings) {
  const M = g.userData.meshes;
  const live = new Set();
  for (const r of rings || []) {
    if (r.state === 'gone' || r.dead) continue;
    live.add(r.id);
    let m = M.get(r.id);
    if (!m) {
      m = new THREE.Mesh(g.userData.geos[r.hue % RING_COLORS.length], g.userData.mat);
      m.frustumCulled = false;
      M.set(r.id, m);
      g.add(m);
    }
    m.position.set(r.x[0], r.x[1], r.x[2]);
    m.quaternion.set(r.q[0], r.q[1], r.q[2], r.q[3]);
  }
  for (const [id, m] of M) if (!live.has(id)) { g.remove(m); M.delete(id); }
}
