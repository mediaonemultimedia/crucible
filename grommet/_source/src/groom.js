/* The groom map — which way every patch of fur is lying, and how roughed-up it is.

   One texture in the body's UV atlas, cut into one rectangle per part (the
   rig's `regions`). The octopus: the head fills v ∈ [0, ½); arm k fills
   u ∈ [k/8, (k+1)/8), v ∈ [½, 1). Per texel:
     R,G  lean, in the surface's own (u, v) tangent frame, −1…1
     B    ruffle 0…1 — fibres brushed up against their nap, standing and crossed

   The float copy is the truth; the byte texture is what the GPU samples.
   Default nap: lying toward +v (down the head, out toward the arm tips) —
   unless a region says otherwise: the lion's mane leans hard out from the
   face, the llama's fleece stands up a little ruffled. Left alone, fur
   drifts back to its region's default.                                     */

export const GROOM_SIZE = 512;
export const NAP = 0.38;

/* the octopus atlas: head on top, eight arm strips below */
export const OCTOPUS_REGIONS = [{ x0: 0, x1: 1, y0: 0, y1: 0.5 }];
for (let k = 0; k < 8; k++) OCTOPUS_REGIONS.push({ x0: k / 8, x1: (k + 1) / 8, y0: 0.5, y1: 1 });

export class Groom {
  constructor(size = GROOM_SIZE, regions = OCTOPUS_REGIONS) {
    this.size = size;
    const n = size * size;
    this.lean = new Float32Array(n * 2);
    this.ruffle = new Float32Array(n);
    this.bytes = new Uint8Array(n * 4);
    // the resting groom, per texel
    this.dLean = new Float32Array(n * 2);
    this.dRuffle = new Float32Array(n);
    this.dirty = true;
    this.smoothing = 0;
    this._row = 0;
    this.setLayout(regions);
  }

  /* a new atlas (a new character): regions in uv, with optional default
     lean (lu, lv) and ruffle (ruf); then everything back to its default   */
  setLayout(regions) {
    const S = this.size;
    this.regions = regions.map((r) => ({
      x0: Math.round(r.x0 * S), x1: Math.round(r.x1 * S), y0: Math.round(r.y0 * S), y1: Math.round(r.y1 * S),
      lu: r.lu ?? 0, lv: r.lv ?? NAP, ruf: r.ruf ?? 0,
    }));
    for (let i = 0; i < S * S; i++) { this.dLean[i * 2] = 0; this.dLean[i * 2 + 1] = NAP; this.dRuffle[i] = 0; }
    for (const R of this.regions)
      for (let y = R.y0; y < R.y1; y++)
        for (let x = R.x0; x < R.x1; x++) {
          const i = y * S + x;
          this.dLean[i * 2] = R.lu; this.dLean[i * 2 + 1] = R.lv; this.dRuffle[i] = R.ruf;
        }
    this.smoothing = 0;
    this.reset();
  }

  reset() {
    this.lean.set(this.dLean);
    this.ruffle.set(this.dRuffle);
    this._encodeAll();
  }

  smooth(seconds = 0.9) { this.smoothing = seconds; }

  /* region bounds in texels for a uv: [x0, x1) wrap range, y0, y1 */
  region(u, v) {
    const S = this.size;
    const x = Math.min(S - 1, Math.max(0, Math.floor(u * S))), y = Math.min(S - 1, Math.max(0, Math.floor(v * S)));
    for (const R of this.regions) if (x >= R.x0 && x < R.x1 && y >= R.y0 && y < R.y1) return R;
    return { x0: 0, x1: S, y0: 0, y1: S };
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

  /* a dent: something landed here. The fibres under it splay out from the
     middle and stand ruffled, a crater in the pile that grows back slowly */
  dent(u, v, rx, ry, strength = 1) {
    const S = this.size;
    const R = this.region(u, v);
    const W = R.x1 - R.x0;
    const cx = u * S, cy = v * S;
    const iy0 = Math.max(R.y0, Math.floor(cy - ry)), iy1 = Math.min(R.y1 - 1, Math.ceil(cy + ry));
    for (let y = iy0; y <= iy1; y++) {
      const ny = (y + 0.5 - cy) / ry;
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x + 0.5 - cx) / rx;
        const d2 = nx * nx + ny * ny;
        if (d2 >= 1) continue;
        const f = (1 - d2) * strength;
        const wx = R.x0 + ((((x - R.x0) % W) + W) % W);
        const i = y * S + wx;
        const d = Math.sqrt(d2) || 1;
        this.lean[i * 2] += (nx / d * 0.8 - this.lean[i * 2]) * f;
        this.lean[i * 2 + 1] += (ny / d * 0.8 - this.lean[i * 2 + 1]) * f;
        this.ruffle[i] = Math.min(1, Math.max(this.ruffle[i], 0.85 * f));
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
        const dx = this.dLean[i * 2], dy = this.dLean[i * 2 + 1], dr = this.dRuffle[i];
        if (lx === dx && ly === dy && rf === dr) continue;
        this.lean[i * 2] = lx + (dx - lx) * kLean;
        this.lean[i * 2 + 1] = ly + (dy - ly) * kLean;
        this.ruffle[i] = rf + (dr - rf) * kRuf;
        if (Math.abs(this.lean[i * 2] - dx) < 1e-3 && Math.abs(this.lean[i * 2 + 1] - dy) < 1e-3 && Math.abs(this.ruffle[i] - dr) < 1e-3) {
          this.lean[i * 2] = dx; this.lean[i * 2 + 1] = dy; this.ruffle[i] = dr;
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
