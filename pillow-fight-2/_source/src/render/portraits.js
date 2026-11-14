/* The select cards' portraits: PF1's (each fighter rendered once into a
   render target, head and shoulders from the good side, and read back into
   an image), on the PF2 quilt. Also the select screen's turntable: the
   picks standing on the mattress while the camera circles them.        */

import * as THREE from 'three/webgpu';
import { Plush } from './plush.js';
import { unpackRows } from './readback.js';

export const still = (id, fx = 1024, fz = 0, act = 'idle') => ({ id, act, face: 1, fx, fz, x: 0, y: 0, z: 0, t: 0, mv: '', back: 0, down: 0, kr: 0, kb: 0 });

/* {id: dataURL} for every id */
export async function portraits(renderer, arena, ids) {
  const W = 256, H = 320;
  const rt = new THREE.RenderTarget(W, H, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
  const out = {};
  const webgl = !renderer.backend.isWebGPUBackend;
  arena.world.rotation.y = 0; arena.world.updateMatrixWorld(true);
  for (const id of ids) {
    // only the room and this fighter (the page is live meanwhile)
    const hidden = [];
    for (const o of [...arena.world.children, ...arena.scene.children]) {
      if (o === arena.world || arena.base.has(o) || !o.visible) continue;
      o.visible = false; hidden.push(o);
    }
    const p = new Plush(arena.scene, id, { side: 0 });
    arena.add(p.group);
    const F = still(id, 0, 1024);
    for (let i = 0; i < 30; i++) p.update(1 / 60, F, F, [0, 0, 0], [0, 0, 3], false);
    arena.paintShadows([p]);
    const [cy, d] = { k8e: [2.85, 9], rubberta: [1.3, 6.4], zach: [1.55, 5.2], sebas: [2.3, 7.0] }[id] || [2.05, 6.4];
    cam.position.set(1.6, cy + 0.5, d);
    cam.lookAt(0.15, cy, 0);
    renderer.setRenderTarget(rt);
    renderer.render(arena.scene, cam);
    renderer.setRenderTarget(null);
    for (const o of hidden) o.visible = true;
    p.group.removeFromParent(); p.dispose(arena.scene);
    const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    img.data.set(unpackRows(px, W, H, { flip: webgl, stride: webgl ? W * 4 : Math.ceil(W * 4 / 256) * 256 }));
    g.putImageData(img, 0, 0);
    out[id] = c.toDataURL('image/png');
  }
  rt.dispose();
  return out;
}

/* the select screen: one or two picks on the quilt, the camera circling
   (a turntable: backs and sides on show, the 3D the cards can't) */
export class Turntable {
  constructor(arena) { this.arena = arena; this.slots = [null, null]; this.ids = [null, null]; this.t = 0; }

  set(k, id, evil = false) {
    if (this.ids[k] === id && this.slots[k]?.evil === evil) return;
    const old = this.slots[k];
    if (old) { old.group.removeFromParent(); old.dispose(this.arena.scene); }
    this.ids[k] = id;
    this.slots[k] = id ? new Plush(this.arena.scene, id, { side: k, evil }) : null;
    if (this.slots[k]) { this.arena.add(this.slots[k].group); this.slots[k].monocle.visible = evil; this.slots[k].toque.visible = false; }
  }

  frame(dt) {
    this.t += dt;
    const two = this.slots[0] && this.slots[1];
    const P = [[two ? -2.4 : 0, 0, 0], [two ? 2.4 : 0, 0, 0]];
    for (let k = 0; k < 2; k++) {
      const p = this.slots[k];
      if (!p) continue;
      const F = two ? still(p.id, k ? -1024 : 1024, 0) : still(p.id, 0, 1024);
      p.update(dt, F, F, P[k], two ? P[1 - k] : [0, 0, 3], false);
    }
    // the camera: round and round, slowly, a little above
    const az = this.t * 0.35;
    const A = this.arena, C = A.cam;
    C.ready = false;
    const d = two ? 13 : 9.5;
    A.frame([-1, 0, 0], [1, 0, 0], dt, innerWidth / innerHeight, { x: 0, y: two ? 1.7 : 1.6, z: 0, d, h: 1.2, az });
    A.paintShadows(this.slots.filter(Boolean));
    A.update(dt);
  }

  dispose() { this.set(0, null); this.set(1, null); }
}
