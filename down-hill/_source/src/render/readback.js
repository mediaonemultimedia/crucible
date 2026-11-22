/* Render-target readback → tightly packed RGBA rows, top row first.
   WebGPU copies a texture to a buffer with each row padded to a multiple
   of 256 bytes (three's copyTextureToBuffer hands that buffer back as is),
   so a 240-px portrait comes back with 1024-byte rows, not 960: read it as
   packed and every row shears 64 bytes further — the stripes. WebGL 2's
   readPixels is packed but bottom row first.                           */

export function unpackRows(px, W, H, { flip = false, stride = W * 4 } = {}) {
  const row = W * 4, out = new Uint8ClampedArray(row * H);
  if (stride < row || px.length < (H - 1) * stride + row) throw new Error(`readback: ${px.length} bytes for ${W}×${H} at stride ${stride}`);
  for (let y = 0; y < H; y++) {
    const src = (flip ? H - 1 - y : y) * stride;
    out.set(px.subarray(src, src + row), y * row);
  }
  return out;
}

/* mean absolute difference between neighbouring rows, 0–255: a sheared
   image (rows offset from each other) scores far higher than a picture */
export function rowJitter(rgba, W, H) {
  let s = 0;
  for (let y = 1; y < H; y++) for (let x = 0; x < W * 4; x++) if ((x & 3) !== 3) s += Math.abs(rgba[y * W * 4 + x] - rgba[(y - 1) * W * 4 + x]);
  return s / ((H - 1) * W * 3);
}
