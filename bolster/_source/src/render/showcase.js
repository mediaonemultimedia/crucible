/* Plush on show outside a fight: the two picks standing on the mat behind
   the character select, and the card portraits (each fighter rendered once
   into a render target and read back into an image). Uses the same Plush,
   fed a standing-still fighter instead of the sim's.                     */

import * as THREE from 'three/webgpu';
import { Plush } from './plush.js';
import { unpackRows } from './readback.js';

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

/* the title: all five in a row on the mat, turned nearly to face us */
export class Lineup {
  constructor(stage, ids) {
    this.stage = stage;
    const n = ids.length;
    this.x = ids.map((_, k) => (k - (n - 1) / 2) * 2.95);
    this.items = ids.map((id, k) => {
      const p = new Plush(stage.scene, id, { side: this.x[k] > 0 ? 1 : 0 });
      p.yawScale = this.x[k] === 0 ? 0.15 : 0.32;
      return p;
    });
  }

  frame(dt) {
    this.items.forEach((p, k) => {
      const F = still(p.id, this.x[k] > 0 ? -1 : 1);
      p.update(dt, F, F, this.x[k], 0, this.x[k] > 0 ? this.x[k] - 3 : this.x[k] + 3, 0, false);
    });
    const half = this.x[this.x.length - 1] + 1.2, aspect = innerWidth / innerHeight;
    // the camera a little higher and back, so the row stands in the lower
    // half and the Pillow Fight logo has the top of the screen
    this.stage.frame(-half, half, dt, aspect, aspect < 1.2 ? null : { x: 0, d: 24, y: -2.6 });
    this.stage.paintShadows(this.items);
    this.stage.update(dt);
  }

  dispose() { for (const p of this.items) p.dispose(this.stage.scene); this.items = []; }
}

/* render each fighter's portrait once; returns {id: dataURL} */
export async function portraits(renderer, stage, ids) {
  // 256 px wide: 1024-byte rows, already WebGPU's 256-byte copy alignment
  // (unpackRows honours the padded stride anyway, whatever the width)
  const W = 256, H = 320;
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
    const [cy, d] = { k8e: [2.85, 9], rubberta: [1.3, 6.4] }[id] || [2.05, 6.4];
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
    img.data.set(unpackRows(px, W, H, { flip: webgl, stride: webgl ? W * 4 : Math.ceil(W * 4 / 256) * 256 }));
    g.putImageData(img, 0, 0);
    out[id] = c.toDataURL('image/png');
    p.dispose(stage.scene);
    void box;
  }
  stage.floor.visible = shadowsWas;
  rt.dispose();
  return out;
}
