/* The groom map — which way every patch of fur is lying, and how roughed-up it is.

   One texture in the body's UV atlas: the head fills v ∈ [0, ½); arm k fills
   u ∈ [k/8, (k+1)/8), v ∈ [½, 1). Per texel:
     R,G  lean, in the surface's own (u, v) tangent frame, −1…1
     B    ruffle 0…1 — fibres brushed up against their nap, standing and crossed

   The float copy is the truth; the byte texture is what the GPU samples.
   Default nap: lying toward +v (down the head, out toward the arm tips).   */

export const GROOM_SIZE = 512;
export const NAP = 0.38;

export class Groom {
  constructor(size = GROOM_SIZE) {
    this.size = size;
    const n = size * size;
    this.lean = new Float32Array(n * 2);
    this.ruffle = new Float32Array(n);
    this.bytes = new Uint8Array(n * 4);
    this.dirty = true;
    this.smoothing = 0;
    this._row = 0;
    this.reset();
  }

  reset() {
    for (let i = 0; i < this.size * this.size; i++) {
      this.lean[i * 2] = 0; this.lean[i * 2 + 1] = NAP; this.ruffle[i] = 0;
    }
    this._encodeAll();
  }

  smooth(seconds = 0.9) { this.smoothing = seconds; }

  /* region bounds in texels for a uv: [x0, x1) wrap range, y0, y1 */
  region(u, v) {
    const S = this.size;
    if (v < 0.5) return { x0: 0, x1: S, y0: 0, y1: S / 2 };
    const k = Math.min(7, Math.max(0, Math.floor(u * 8)));
    return { x0: (k * S) / 8, x1: ((k + 1) * S) / 8, y0: S / 2, y1: S };
  }

  /* comb stroke at (u, v), direction (du, dv) in the tangent frame,
     brush radii in texels along u and v                                  */
  paint(u, v, du, dv, strength, rx, ry) {
    const dl = Math.hypot(du, dv);
    if (dl < 1e-6) return;
    du /= dl; dv /= dl;
    const S = this.size;
    const R = this.region(u, v);
    const W = R.x1 - R.x0;
    const cx = u * S, cy = v * S;
    const ix0 = Math.floor(cx - rx), ix1 = Math.ceil(cx + rx);
    const iy0 = Math.max(R.y0, Math.floor(cy - ry)), iy1 = Math.min(R.y1 - 1, Math.ceil(cy + ry));
    for (let y = iy0; y <= iy1; y++) {
      const ny = (y + 0.5 - cy) / ry;
      for (let x = ix0; x <= ix1; x++) {
        const nx = (x + 0.5 - cx) / rx;
        const d2 = nx * nx + ny * ny;
        if (d2 >= 1) continue;
        const f = (1 - d2) * (1 - d2) * strength;
        // wrap around the head / around the arm
        const wx = R.x0 + ((((x - R.x0) % W) + W) % W);
        const i = y * S + wx;
        const lx = this.lean[i * 2], ly = this.lean[i * 2 + 1];
        const ll = Math.hypot(lx, ly);
        const along = ll > 0.12 ? (lx * du + ly * dv) / ll : 0;
        // against the nap: fibres stand up and cross before they give in
        if (along < -0.15) this.ruffle[i] = Math.min(1, this.ruffle[i] + f * 0.9 * -along);
        else this.ruffle[i] = Math.max(0, this.ruffle[i] - f * 0.25);
        // fibres resist being turned over — reversing the nap takes a few passes
        const turn = along < -0.15 ? f * 0.35 : f;
        const target = 0.86 * (1 - 0.6 * this.ruffle[i]);
        this.lean[i * 2] = lx + (du * target - lx) * turn;
        this.lean[i * 2 + 1] = ly + (dv * target - ly) * turn;
        this._encode(i);
      }
    }
    this.dirty = true;
  }

  /* slow drift back toward the default nap; fast when smoothing */
  relax(dt) {
    const S = this.size;
    const fast = this.smoothing > 0;
    if (fast) this.smoothing -= dt;
    const rows = fast ? S : S / 16;               // a slice per frame when idle
    const dtSlice = fast ? dt : dt * 16;
    const kLean = 1 - Math.exp(-(fast ? 5 : 0.012) * dtSlice);
    const kRuf = 1 - Math.exp(-(fast ? 6 : 0.02) * dtSlice);
    for (let r = 0; r < rows; r++) {
      const y = (this._row + r) % S;
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const lx = this.lean[i * 2], ly = this.lean[i * 2 + 1], rf = this.ruffle[i];
        if (lx === 0 && ly === NAP && rf === 0) continue;
        this.lean[i * 2] = lx - lx * kLean;
        this.lean[i * 2 + 1] = ly + (NAP - ly) * kLean;
        this.ruffle[i] = rf - rf * kRuf;
        if (Math.abs(this.lean[i * 2]) < 1e-3 && Math.abs(this.lean[i * 2 + 1] - NAP) < 1e-3 && this.ruffle[i] < 1e-3) {
          this.lean[i * 2] = 0; this.lean[i * 2 + 1] = NAP; this.ruffle[i] = 0;
        }
        this._encode(i);
      }
    }
    this._row = (this._row + rows) % S;
    this.dirty = true;
  }

  sample(u, v) {
    const S = this.size;
    const x = Math.min(S - 1, Math.max(0, Math.floor(u * S)));
    const y = Math.min(S - 1, Math.max(0, Math.floor(v * S)));
    const i = y * S + x;
    return { lu: this.lean[i * 2], lv: this.lean[i * 2 + 1], ruffle: this.ruffle[i] };
  }

  _encode(i) {
    const b = this.bytes;
    b[i * 4] = Math.round((this.lean[i * 2] * 0.5 + 0.5) * 255);
    b[i * 4 + 1] = Math.round((this.lean[i * 2 + 1] * 0.5 + 0.5) * 255);
    b[i * 4 + 2] = Math.round(this.ruffle[i] * 255);
    b[i * 4 + 3] = 255;
  }

  _encodeAll() {
    for (let i = 0; i < this.size * this.size; i++) this._encode(i);
    this.dirty = true;
  }
}
