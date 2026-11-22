/* A QR code encoder, written here (no QR service, no library): byte mode,
   error correction level M, versions 1–10 (up to 213 bytes — the pad link
   is about 70). Returns the module matrix; `qrSVG` draws it.

   The standard (ISO/IEC 18004) steps: the data bits (mode, count, bytes,
   terminator, pad bytes), split into blocks, Reed–Solomon EC per block
   over GF(256) (poly 0x11d), interleaved; function patterns (finders,
   separators, timing, alignment, the dark module, format + version info);
   the zigzag placement; the mask with the lowest penalty.               */

// per version (1..10), level M: [ec codewords per block, [blocks, data codewords]...]
const M_BLOCKS = [null,
  [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
  [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]]];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

/* GF(256) */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
{ let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; }
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function rsGen(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= mul(g[j], EXP[i]); }
    g = next;
  }
  return g;
}
export function rsEncode(data, n) {
  const g = rsGen(n), r = new Array(n).fill(0);
  for (const d of data) {
    const f = d ^ r.shift();
    r.push(0);
    for (let j = 0; j < n; j++) r[j] ^= mul(g[j + 1], f);
  }
  return r;
}

const dataCap = (v) => { const [, ...gs] = M_BLOCKS[v]; return gs.reduce((s, [b, d]) => s + b * d, 0); };

function codewords(bytes, v) {
  const cap = dataCap(v), bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, v < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let k = 0; data.length < cap; k++) data.push(k & 1 ? 0x11 : 0xec);
  // blocks, EC, interleave
  const [ec, ...gs] = M_BLOCKS[v], blocks = [];
  let at = 0;
  for (const [n, d] of gs) for (let i = 0; i < n; i++) { const b = data.slice(at, at + d); at += d; blocks.push({ d: b, e: rsEncode(b, ec) }); }
  const out = [], maxD = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < maxD; i++) for (const b of blocks) if (i < b.d.length) out.push(b.d[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.e[i]);
  return out;
}

const bch = (val, poly, deg) => {
  let v = val << deg;
  const top = 31 - Math.clz32(poly);
  for (let i = 31 - Math.clz32(v); i >= top; i--) if (v >>> i & 1) v ^= poly << (i - top);
  return (val << deg) | v;
};

const MASKS = [
  (r, c) => (r + c) % 2 === 0, (r) => r % 2 === 0, (r, c) => c % 3 === 0, (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0, (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0, (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function penalty(m) {
  const n = m.length;
  let p = 0;
  // runs of 5+ in rows / columns
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) {
    let run = 1;
    for (let j = 1; j < n; j++) {
      const a = pass ? m[j][i] : m[i][j], b = pass ? m[j - 1][i] : m[i][j - 1];
      if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
    }
  }
  // 2×2 blocks
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) { const v = m[r][c]; if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) p += 3; }
  // finder-like 1:1:3:1:1
  const pat = [1, 0, 1, 1, 1, 0, 1];
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < n; i++) for (let j = 0; j + 7 <= n; j++) {
    let ok = true;
    for (let k = 0; k < 7 && ok; k++) ok = (pass ? m[j + k][i] : m[i][j + k]) === pat[k];
    if (!ok) continue;
    const at = (k) => (k < 0 || k >= n ? 0 : pass ? m[k][i] : m[i][k]);
    const light = (a, b) => { for (let k = a; k < b; k++) if (at(k)) return false; return true; };
    if (light(j - 4, j) || light(j + 7, j + 11)) p += 40;
  }
  // dark balance
  let dark = 0;
  for (const row of m) for (const v of row) dark += v;
  p += Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  return p;
}

/* the matrix (rows of 0/1) for a string (UTF-8) */
export function qrMatrix(text) {
  const bytes = [...new TextEncoder().encode(text)];
  let v = 1;
  while (v <= 10 && dataCap(v) < bytes.length + (v < 10 ? 2 : 3)) v++;
  if (v > 10) throw new Error('qr: too long');
  const n = 17 + 4 * v;
  const m = Array.from({ length: n }, () => new Array(n).fill(0));
  const fn = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r, c, val) => { if (r >= 0 && r < n && c >= 0 && c < n) { m[r][c] = val ? 1 : 0; fn[r][c] = true; } };
  // finders + separators
  for (const [R, C] of [[0, 0], [0, n - 7], [n - 7, 0]]) {
    for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
      const inR = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const dark = inR && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      set(R + r, C + c, dark);
    }
  }
  // timing
  for (let i = 8; i < n - 8; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // alignment
  const A = ALIGN[v];
  for (const r of A) for (const c of A) {
    if ((r === 6 && c === 6) || (r === 6 && c === A[A.length - 1]) || (r === A[A.length - 1] && c === 6)) continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
  }
  // reserve format areas + dark module
  for (let i = 0; i < 9; i++) { if (!fn[8][i]) set(8, i, 0); if (!fn[i][8]) set(i, 8, 0); }
  for (let i = 0; i < 8; i++) { set(8, n - 1 - i, 0); set(n - 1 - i, 8, 0); }
  set(n - 8, 8, 1);
  // version info (v ≥ 7)
  if (v >= 7) {
    const vi = bch(v, 0x1f25, 12);
    for (let i = 0; i < 18; i++) { const b = (vi >>> i) & 1, a = Math.floor(i / 3), c = n - 11 + (i % 3); set(a, c, b); set(c, a, b); }
  }
  // data
  const cw = codewords(bytes, v), bits = [];
  for (const b of cw) for (let i = 7; i >= 0; i--) bits.push((b >>> i) & 1);
  let k = 0;
  for (let right = n - 1, up = true; right >= 1; right -= 2, up = !up) {
    if (right === 6) right = 5;
    for (let i = 0; i < n; i++) {
      const r = up ? n - 1 - i : i;
      for (let dc = 0; dc < 2; dc++) { const c = right - dc; if (!fn[r][c]) { m[r][c] = k < bits.length ? bits[k] : 0; k++; } }
    }
  }
  // the best mask
  let best = null;
  for (let mk = 0; mk < 8; mk++) {
    const t = m.map((row) => row.slice());
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!fn[r][c] && MASKS[mk](r, c)) t[r][c] ^= 1;
    // format info (level M = 00), both copies
    const f = bch(mk, 0x537, 10) ^ 0x5412;
    for (let i = 0; i < 15; i++) {
      const b = (f >>> i) & 1;
      if (i < 6) t[i][8] = b; else if (i === 6) t[7][8] = b; else if (i === 7) t[8][8] = b; else if (i === 8) t[8][7] = b; else t[8][14 - i] = b;
      if (i < 8) t[8][n - 1 - i] = b; else t[n - 15 + i][8] = b;
    }
    t[n - 8][8] = 1;
    const s = penalty(t);
    if (!best || s < best.s) best = { s, t };
  }
  return best.t;
}

/* an SVG of it (dark on light, a 4-module quiet zone) */
export function qrSVG(text, { dark = '#120a1e', light = '#fff' } = {}) {
  const m = qrMatrix(text), n = m.length, q = 4, N = n + q * 2;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (m[r][c]) d += `M${c + q} ${r + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges"><rect width="${N}" height="${N}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
