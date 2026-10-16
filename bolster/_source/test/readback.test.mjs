// The card portraits' readback (src/render/readback.js): WebGPU hands back
// rows padded to 256 bytes; read as packed they shear into stripes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { unpackRows, rowJitter } from '../src/render/readback.js';

// a smooth "portrait": a radial blob on a gradient, W×H RGBA
function picture(W, H) {
  const d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const r = Math.hypot(x - W / 2, y - H * 0.45) / (W * 0.4), i = (y * W + x) * 4;
    d[i] = r < 1 ? 230 : 60 + y / 4; d[i + 1] = r < 1 ? 40 + x / 3 : 30; d[i + 2] = r < 1 ? 40 : 120; d[i + 3] = 255;
  }
  return d;
}
// what the GPU copy gives: rows at `stride` bytes, optionally bottom row first
function readback(img, W, H, stride, flip) {
  const px = new Uint8Array((H - 1) * stride + W * 4);
  for (let y = 0; y < H; y++) px.set(img.subarray(y * W * 4, (y + 1) * W * 4), (flip ? H - 1 - y : y) * stride);
  return px;
}

for (const [W, H] of [[240, 320], [256, 320], [150, 200], [300, 400]]) {
  test(`portrait readback ${W}×${H}: padded WebGPU rows and flipped WebGL rows come back as the picture`, () => {
    const img = picture(W, H), stride = Math.ceil(W * 4 / 256) * 256;
    assert.deepEqual(unpackRows(readback(img, W, H, stride, false), W, H, { stride }), img);
    assert.deepEqual(unpackRows(readback(img, W, H, W * 4, true), W, H, { flip: true }), img);
    assert.ok(rowJitter(img, W, H) < 4);
    if (stride !== W * 4) {
      // the bug: the padded buffer read as if packed is all stripes
      const sheared = unpackRows(readback(img, W, H, stride, false), W, H);
      assert.ok(rowJitter(sheared, W, H) > 5 * rowJitter(img, W, H), 'shear should show');
    }
  });
}

test('portrait readback refuses a buffer too short for its stride', () => {
  assert.throws(() => unpackRows(new Uint8Array(240 * 4 * 320), 240, 320, { stride: 1024 }));
});
