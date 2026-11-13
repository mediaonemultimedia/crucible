/* Synthesised sounds, rendered once into sample arrays (no nodes per play):
   the slots whose drafts were unusable (grab, the two UI sounds), the
   heavy hit's body, and the short transients layered on the clips so a hit
   still reads on a laptop speaker (the drafts' thumps sit around 50 Hz).
   Pure: (sampleRate) → Float32Array, deterministic (a fixed-seed noise).   */

const TAU = Math.PI * 2;

function noise(seed = 0x2545f491) {
  let s = seed >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s / 4294967296) * 2 - 1; };
}

/* one-pole low-pass / high-pass in place */
function lowpass(x, sr, hz) { const a = 1 - Math.exp(-TAU * hz / sr); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] = y; } return x; }
function highpass(x, sr, hz) { const a = 1 - Math.exp(-TAU * hz / sr); let y = 0; for (let i = 0; i < x.length; i++) { y += a * (x[i] - y); x[i] -= y; } return x; }

const len = (sr, s) => Math.max(1, Math.round(sr * s));
const norm = (x, peak) => { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m; return x; };
const fades = (x, sr, fi = 0.001, fo = 0.01) => { const a = len(sr, fi), b = len(sr, fo); for (let i = 0; i < a && i < x.length; i++) x[i] *= i / a; for (let i = 0; i < b && i < x.length; i++) x[x.length - 1 - i] *= i / b; return x; };

/* a pitched body: a sine falling from f0 to f1, decaying */
function body(sr, dur, f0, f1, decay) {
  const x = new Float32Array(len(sr, dur));
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / sr, f = f1 + (f0 - f1) * Math.exp(-t / (dur * 0.35));
    ph += TAU * f / sr;
    x[i] = Math.sin(ph) * Math.exp(-t / decay);
  }
  return x;
}

/* filtered noise, decaying */
function puff(sr, dur, lo, hi, decay, seed) {
  const r = noise(seed), x = new Float32Array(len(sr, dur));
  for (let i = 0; i < x.length; i++) x[i] = r() * Math.exp(-(i / sr) / decay);
  if (hi) lowpass(lowpass(x, sr, hi), sr, hi);
  if (lo) highpass(highpass(x, sr, lo), sr, lo);
  return x;
}

const mix = (...parts) => {
  const n = Math.max(...parts.map(([x]) => x.length)), out = new Float32Array(n);
  for (const [x, g, off = 0] of parts) for (let i = 0; i < x.length && i + off < n; i++) out[i + off] += x[i] * g;
  return out;
};

export const SYNTH = {
  /* a cloth-and-stuffing smack: the transient on a light hit */
  smack: (sr) => fades(norm(mix([puff(sr, 0.05, 1400, 7000, 0.012, 7), 1], [body(sr, 0.05, 420, 220, 0.018), 0.5]), 0.9), sr, 0.0005, 0.01),
  /* the heavy hit's body: a deep boom that a small speaker still hears (its harmonics) */
  boom: (sr) => {
    const b = body(sr, 0.28, 150, 58, 0.09);
    for (let i = 0; i < b.length; i++) b[i] = Math.tanh(b[i] * 2.2);       // soft-clipped: harmonics
    return fades(norm(mix([b, 1], [puff(sr, 0.12, 500, 3000, 0.035, 11), 0.55], [puff(sr, 0.03, 2000, 9000, 0.008, 12), 0.35]), 0.92), sr, 0.0005, 0.03);
  },
  /* a block: a soft padded thup */
  thud: (sr) => fades(norm(mix([body(sr, 0.11, 240, 120, 0.03), 1], [puff(sr, 0.06, 600, 3500, 0.015, 21), 0.6]), 0.85), sr, 0.0005, 0.02),
  /* the grab: a fistful of plush — a fabric rustle into a low fwump */
  grab: (sr) => {
    const rustle = puff(sr, 0.16, 900, 5000, 0.05, 31);
    for (let i = 0; i < rustle.length; i++) { const t = i / sr; rustle[i] *= 0.6 + 0.4 * Math.sin(TAU * 38 * t); }
    return fades(norm(mix([rustle, 0.7], [body(sr, 0.16, 170, 85, 0.05), 1, len(sr, 0.03)]), 0.85), sr, 0.002, 0.03);
  },
  /* menu move: a small soft pip */
  'ui-tick': (sr) => {
    const x = new Float32Array(len(sr, 0.05));
    let ph = 0;
    for (let i = 0; i < x.length; i++) { const t = i / sr; ph += TAU * (1320 - 300 * t / 0.05) / sr; x[i] = (Math.sin(ph) + 0.25 * Math.sign(Math.sin(ph))) * Math.exp(-t / 0.012); }
    return fades(norm(x, 0.6), sr, 0.0008, 0.008);
  },
  /* menu select: two notes up, a pulse with a little sparkle */
  'ui-confirm': (sr) => {
    const x = new Float32Array(len(sr, 0.22));
    let ph = 0;
    for (let i = 0; i < x.length; i++) {
      const t = i / sr, f = t < 0.07 ? 784 : 1175;              // G5 → D6
      ph += f / sr;
      const pulse = (ph % 1) < 0.25 ? 1 : -1, env = t < 0.07 ? Math.exp(-t / 0.05) : Math.exp(-(t - 0.07) / 0.06);
      x[i] = (pulse * 0.5 + Math.sin(TAU * ph) * 0.5) * env;
    }
    lowpass(x, sr, 6000);
    return fades(norm(x, 0.7), sr, 0.001, 0.02);
  },
};
