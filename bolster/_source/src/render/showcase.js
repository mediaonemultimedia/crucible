/* Plush on show outside a fight: the two picks standing on the mat behind
   the character select, and the card portraits (each fighter rendered once
   into a render target and read back into an image). Uses the same Plush,
   fed a standing-still fighter instead of the sim's.                     */

import * as THREE from 'three/webgpu';
import { Plush } from './plush.js';

const still = (id, face, act = 'idle') => ({ id, act, face, x: 0, y: 0, t: 0, mv: '', back: 0, down: 0 });

export class Showcase {
  constructor(stage) {
    this.stage = stage;
    this.slots = [null, null];
    this.ids = [null, null];
    this.x = [-2.7, 2.7];
  }

  set(k, id, { evil = false, toque = false } = {}) {
    if (this.ids[k] === id && this.slots[k]?.evil === evil) { if (this.slots[k]) this.slots[k].toque.visible = toque; return; }
    this.slots[k]?.dispose(this.stage.scene);
    this.ids[k] = id;
    this.slots[k] = id ? new Plush(this.stage.scene, id, { side: k, evil }) : null;
    if (this.slots[k]) { this.slots[k].monocle.visible = evil; this.slots[k].toque.visible = toque; }
  }

  frame(dt) {
    const [a, b] = this.slots;
    for (let k = 0; k < 2; k++) {
      const p = this.slots[k];
      if (!p) continue;
      const F = still(p.id, k ? -1 : 1, 'idle');
      p.update(dt, F, F, this.x[k], 0, this.x[1 - k], 0, false);
    }
    this.stage.frame(this.x[0], this.x[1], dt, innerWidth / innerHeight);
    this.stage.paintShadows(this.slots.filter(Boolean));
    this.stage.update(dt);
  }

  dispose() { for (let k = 0; k < 2; k++) this.set(k, null); }
}

/* render each fighter's portrait once; returns {id: dataURL} */
export async function portraits(renderer, stage, ids) {
  const W = 240, H = 320;
  const rt = new THREE.RenderTarget(W, H, { samples: 4 });
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 100);
  const out = {};
  const webgl = !renderer.backend.isWebGPUBackend;
  const shadowsWas = stage.floor.visible;
  for (const id of ids) {
    const p = new Plush(stage.scene, id, { side: 0 });
    const F = still(id, 1);
    for (let i = 0; i < 30; i++) p.update(1 / 60, F, F, 0, 0, 3, 0, false);
    stage.paintShadows([p]);
    // frame his head and shoulders, a little from his good side
    const box = new THREE.Box3().setFromObject(p.shells);
    const top = id === 'k8e' ? 4.6 : id === 'rubberta' ? 2.6 : 3.3;
    const cy = top * 0.62, d = top * 1.95;
    cam.position.set(1.6, cy + 0.5, d);
    cam.lookAt(0.15, cy, 0);
    renderer.setRenderTarget(rt);
    renderer.render(stage.scene, cam);
    renderer.setRenderTarget(null);
    const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const img = g.createImageData(W, H);
    const row = W * 4;
    for (let y = 0; y < H; y++) {
      const src = (webgl ? H - 1 - y : y) * row;
      img.data.set(px.subarray(src, src + row), y * row);
    }
    g.putImageData(img, 0, 0);
    out[id] = c.toDataURL('image/png');
    p.dispose(stage.scene);
    void box;
  }
  stage.floor.visible = shadowsWas;
  rt.dispose();
  return out;
}
