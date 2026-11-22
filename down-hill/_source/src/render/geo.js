/* Small geometry and material helpers for the karts and the room (no
   three/addons: one copy of three, the webgpu build).                    */
import * as THREE from 'three/webgpu';

/* a rounded box: a segmented box whose vertices are pulled onto the
   rounded shape (the inner box grown by r along each vertex's direction) */
export function rbox(w, h, d, r = 0.1, seg = 3) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position, n = g.attributes.normal;
  const iw = w / 2 - r, ih = h / 2 - r, id = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    c.set(Math.max(-iw, Math.min(iw, v.x)), Math.max(-ih, Math.min(ih, v.y)), Math.max(-id, Math.min(id, v.z)));
    const dir = v.clone().sub(c);
    if (dir.lengthSq() < 1e-9) dir.set(n.getX(i), n.getY(i), n.getZ(i));
    dir.normalize();
    p.setXYZ(i, c.x + dir.x * r, c.y + dir.y * r, c.z + dir.z * r);
    n.setXYZ(i, dir.x, dir.y, dir.z);
  }
  return g;
}

/* a puffed cushion: a box whose thickness falls away to a seam */
export function pillowGeo(w, h, d, seg = [16, 6, 12]) {
  const g = new THREE.BoxGeometry(w, h, d, ...seg);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = x / (w / 2), nz = z / (d / 2);
    const puff = Math.max(0.12, (1 - nx ** 4) * (1 - nz ** 4)) ** 0.7;
    p.setXYZ(i, x * (1 - 0.07 * (1 - nz * nz)), y * puff, z * (1 - 0.07 * (1 - nx * nx)));
  }
  g.computeVertexNormals();
  return g;
}

const cache = new Map();
/* a standard material, shared by its parameters */
export function mat(color, o = {}) {
  const key = JSON.stringify([color, o]);
  if (cache.has(key)) return cache.get(key);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
  cache.set(key, m);
  return m;
}
export function glowMat(color, intensity = 1.5) {
  return mat(color, { emissive: color, emissiveIntensity: intensity, roughness: 0.5 });
}

/* a canvas texture painted by f(ctx, w, h) */
export function canvasTex(w, h, f, { repeat = null, srgb = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  f(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}

export function mesh(geo, material, x = 0, y = 0, z = 0, parent = null) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}

/* a seeded random for decoration (layout stays the same every load) */
export function srand(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
