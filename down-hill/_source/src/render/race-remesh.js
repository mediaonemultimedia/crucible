import * as THREE from 'three/webgpu';
import { Fn, attribute, varying, texture, vec3, vec4, mix, max, dot, normalWorld, smoothstep } from 'three/tsl';

function remesh(plush, faceted) {
  const body = plush.body;
  const source = body.geometry;
  const vertices = [], indices = [];
  for (const part of body.parts) {
    const grid = part.kind === 'grid';
    const width = grid ? part.U : part.AA;
    const height = grid ? part.V : part.rings - 1;
    // Keep more samples around the eyes, nose, and small limbs.
    const step = faceted ? (part.name === 'head' ? 4 : 3) : 2;
    const cols = Math.ceil(width / step), rows = Math.ceil(height / step);
    const offset = vertices.length;
    for (let y = 0; y <= rows; y++) for (let x = 0; x <= cols; x++) {
      vertices.push(part.o + Math.round(y * height / rows) * (width + 1) + Math.round(x * width / cols));
    }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const a = offset + y * (cols + 1) + x, b = a + 1, c = a + cols + 1, d = c + 1;
      if (grid) indices.push(a, c, b, b, c, d);
      else indices.push(a, b, c, c, b, d);
    }
  }
  const target = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uvfp', 'tvU', 'look']) {
    const attr = source.getAttribute(name);
    const size = attr.itemSize;
    const array = new Float32Array(vertices.length * size);
    vertices.forEach((index, n) => {
      for (let k = 0; k < size; k++) array[n * size + k] = attr.array[index * size + k];
    });
    target.setAttribute(name, new THREE.BufferAttribute(array, size));
  }
  // Bake part of the fur envelope into the new mesh. The existing pile mask
  // keeps the nose, eye surrounds and glove edges clear.
  const ctx = plush.maskTex.userData.ctx;
  const size = plush.maskTex.userData.size;
  const rgba = ctx.getImageData(0, 0, size, size).data;
  const pos = target.getAttribute('position'), normal = target.getAttribute('normal');
  const map = target.getAttribute('uvfp'), look = target.getAttribute('look');
  const pixel = v => Math.max(0, Math.min(size - 1, Math.floor(v * size)));
  for (let i = 0; i < vertices.length; i++) {
    const p = 4 * (pixel(map.getX(i)) + size * pixel(map.getY(i)));
    const lift = 0.82 * plush.fur.uniforms.pile.value * look.getY(i) * rgba[p] / 255 * (1 - 0.75 * rgba[p + 2] / 255);
    pos.setXYZ(i, pos.getX(i) + lift * normal.getX(i), pos.getY(i) + lift * normal.getY(i), pos.getZ(i) + lift * normal.getZ(i));
  }
  target.setIndex(indices);
  if (!faceted) return target;
  const flat = target.toNonIndexed();
  flat.computeVertexNormals();
  target.dispose();
  return flat;
}

export function createRaceRemesh(plush, style) {
  const U = plush.fur.uniforms;
  const uv = varying(attribute('uvfp', 'vec4').xy);
  const under = varying(attribute('tvU', 'vec4').w);
  const accent = varying(attribute('look', 'vec4').x);
  const paint = Fn(() => {
    const mask = texture(plush.maskTex, uv);
    const pat = texture(plush.patTex, uv);
    const base = mix(mix(vec3(U.color), vec3(U.accent), accent), vec3(U.under), under).toVar();
    base.assign(mix(base, base.mul(vec3(0.84, 0.7, 0.52)), pat.b));
    base.assign(mix(base, vec3(U.spot), pat.r));
    base.assign(mix(base, vec3(U.nose), pat.g));
    base.assign(mix(base, vec3(0.95, 0.42, 0.45), mask.g.mul(0.7)));
    base.assign(mix(base, vec3(U.stitch), mask.b));
    const key = dot(normalWorld, U.key).mul(0.5).add(0.5);
    const fill = max(dot(normalWorld, U.fill), 0);
    const light = smoothstep(0.15, 0.85, key).mul(0.65).add(fill.mul(0.18)).add(0.42);
    return vec4(mix(base.mul(light), vec3(U.spot), pat.r.mul(U.glow)), 1);
  });
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = paint();
  return { geometry: remesh(plush, style === 'faceted'), material };
}
