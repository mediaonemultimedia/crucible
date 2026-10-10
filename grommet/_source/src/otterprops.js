/* What the otter juggles: felt shells (a scallop, ridged, in soft pinks
   and creams) and pebbles (smooth, flattened, in stone greys). Vertex
   colours on a deformed sphere, the felt material and hand lighting of
   the other props.                                                       */

import * as THREE from 'three/webgpu';
import { feltMaterial } from './props.js';

const SHELL_COLORS = ['#f0b3a3', '#f3d9b8', '#e9a07f', '#f6e6d8'];
const PEBBLE_COLORS = ['#8d8a86', '#a59f95', '#6f747a', '#b7aea2'];

function shellGeometry(hex) {
  // a scallop: a flattened fan with radial ridges and a little hinge
  const geo = new THREE.SphereGeometry(1, 40, 24);
  const P = geo.attributes.position, n = P.count;
  const col = new Float32Array(n * 3);
  const base = new THREE.Color(hex), dark = base.clone().multiplyScalar(0.78), light = base.clone().lerp(new THREE.Color('#fffaf2'), 0.5);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i);
    const a = Math.atan2(v.x, v.z);
    const ridge = 0.5 + 0.5 * Math.cos(a * 9);
    const fan = 1 - 0.25 * Math.max(0, -v.z);        // narrower toward the hinge
    v.set(v.x * fan * (1 + 0.04 * ridge), v.y * 0.42 * (0.85 + 0.15 * ridge), v.z * (1 + 0.03 * ridge));
    P.setXYZ(i, v.x, v.y, v.z);
    const c = dark.clone().lerp(light, ridge * 0.8 * (v.y > 0 ? 1 : 0.5));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function pebbleGeometry(hex, seed) {
  const geo = new THREE.SphereGeometry(1, 32, 20);
  const P = geo.attributes.position, n = P.count;
  const col = new Float32Array(n * 3);
  const base = new THREE.Color(hex);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(P, i);
    const w = 1 + 0.06 * Math.sin(v.x * 3 + seed) * Math.cos(v.z * 2.5 - seed);
    v.set(v.x * 1.1 * w, v.y * 0.62 * w, v.z * 0.95 * w);
    P.setXYZ(i, v.x, v.y, v.z);
    const speck = Math.sin(v.x * 37 + seed) * Math.sin(v.y * 41) * Math.sin(v.z * 29 - seed) > 0.6 ? 0.85 : 1;
    const c = base.clone().multiplyScalar(speck * (0.94 + 0.06 * v.y));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.computeVertexNormals();
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function makeStones() {
  const g = new THREE.Group();
  g.userData.meshes = new Map();
  g.userData.mat = feltMaterial();
  g.userData.geos = {
    shell: SHELL_COLORS.map(shellGeometry),
    pebble: PEBBLE_COLORS.map((c, k) => pebbleGeometry(c, k * 1.7)),
  };
  return g;
}

export function poseStones(g, stones) {
  const M = g.userData.meshes;
  const live = new Set();
  for (const it of stones || []) {
    if (it.state === 'gone') continue;
    live.add(it.id);
    let m = M.get(it.id);
    if (!m) {
      const list = g.userData.geos[it.kind];
      m = new THREE.Mesh(list[it.hue % list.length], g.userData.mat);
      m.scale.setScalar(it.r);
      m.frustumCulled = false;
      M.set(it.id, m);
      g.add(m);
    }
    const b = it.ball;
    m.position.set(b.x[0], b.x[1], b.x[2]);
    m.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
  }
  for (const [id, m] of M) if (!live.has(id)) { g.remove(m); M.delete(id); }
}
