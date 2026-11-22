/* The renderer: three's WebGPURenderer — WebGPU where the browser has it,
   else its WebGL 2 backend (?webgl forces it). PF2's, with shadows on (the
   moonlight's map, drawn once). */
import * as THREE from 'three/webgpu';

export async function makeRenderer(canvas) {
  const setup = (r) => { r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; return r; };
  if (navigator.gpu && !/[?&]webgl\b/.test(location.search)) {
    const r = new THREE.WebGPURenderer({ canvas, antialias: true });
    const ok = await Promise.race([
      r.init().then(() => true, () => false),
      new Promise((res) => setTimeout(() => res(false), 2500)),
    ]);
    if (ok && r.backend.isWebGPUBackend) return { renderer: setup(r), canvas };
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh);
    canvas = fresh;
  }
  const r = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
  await r.init();
  return { renderer: setup(r), canvas };
}
