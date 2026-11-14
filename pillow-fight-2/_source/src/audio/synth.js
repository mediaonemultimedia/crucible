/* Synthesised sounds (WebAudio, any BaseAudioContext — the live one or an
   OfflineAudioContext for captures): the chiptune instruments the music
   plays, and the SFX slots whose drafts weren't usable (whoosh, grab,
   block, ui-tick, ui-confirm) plus a low thump layered under heavy hits.
   Every voice is a couple of nodes that stop themselves.                */

import { hz } from './music.js';

/* per context: the pulse waves and a second of white noise, made once */
const KIT = new WeakMap();
export function kit(ctx) {
  let k = KIT.get(ctx);
  if (k) return k;
  const pulse = (duty) => {
    const n = 48, re = new Float32Array(n), im = new Float32Array(n);
    // a pulse of duty d: harmonic n ∝ sin(nπd)/n, as a cosine series (the phase is inaudible)
    for (let i = 1; i < n; i++) { re[i] = (2 / (i * Math.PI)) * Math.sin(i * Math.PI * duty); im[i] = 0; }
    return ctx.createPeriodicWave(re, im, { disableNormalization: false });
  };
  const len = ctx.sampleRate | 0, nb = ctx.createBuffer(1, len, ctx.sampleRate), d = nb.getChannelData(0);
  let seed = 0x9e3779b9;
  for (let i = 0; i < len; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; d[i] = ((seed >>> 0) / 4294967296) * 2 - 1; }
  k = { p25: pulse(0.25), p12: pulse(0.125), p50: pulse(0.5), noise: nb };
  KIT.set(ctx, k);
  return k;
}

/* an envelope on a gain node: attack, decay to sustain, release at `end` */
function env(g, t, peak, { a = 0.004, d = 0.08, s = 0.6, end, r = 0.05 }) {
  const G = g.gain;
  G.setValueAtTime(0, t);
  G.linearRampToValueAtTime(peak, t + a);
  G.setTargetAtTime(peak * s, t + a, d / 3);
  const e = Math.max(end, t + a + 0.01);
  G.setTargetAtTime(0, e, r / 4);      // (from wherever the decay got to)
  return e + r * 1.5;
}

function noiseSrc(ctx, t, rate = 1) {
  const s = ctx.createBufferSource();
  s.buffer = kit(ctx).noise;
  s.loop = true;
  s.playbackRate.value = rate;
  // start somewhere different in the second of noise each time (no comb from re-use)
  s.start(t, (t * 7.31) % 0.9);
  return s;
}

/* ── the music's instruments ───────────────────────────────────────────── */

const LEVEL = { lead: 0.13, lead2: 0.085, arp: 0.05, bass: 0.26, tbone: 0.16 };

/* one note: inst, MIDI note, time, duration (s), gain (0–1 from the track) */
export function playNote(ctx, dest, inst, note, t, dur, gain = 1) {
  const K = kit(ctx), f = hz(note), g = ctx.createGain();
  g.connect(dest);
  if (inst === 'bass') {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    o.connect(g);
    const stop = env(g, t, LEVEL.bass * gain, { a: 0.003, d: 0.12, s: 0.75, end: t + dur * 0.92, r: 0.04 });
    o.start(t); o.stop(stop);
    return;
  }
  if (inst === 'tbone') {
    // the sad trombone: a saw through a closing low-pass, each note sagging
    // flat as it goes; the last one long, with a slow wobble
    const o = ctx.createOscillator(), lp = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    lp.type = 'lowpass'; lp.Q.value = 4;
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.linearRampToValueAtTime(1500, t + 0.08);
    lp.frequency.linearRampToValueAtTime(600, t + dur);
    o.frequency.setValueAtTime(f * 1.02, t);
    o.frequency.linearRampToValueAtTime(f * 0.985, t + dur);
    if (dur > 1) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.03, t + 0.5);
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.2);
    }
    o.connect(lp); lp.connect(g);
    const stop = env(g, t, LEVEL.tbone * gain, { a: 0.03, d: 0.2, s: 0.8, end: t + dur * 0.9, r: 0.12 });
    o.start(t); o.stop(stop);
    return;
  }
  // the pulses
  const o = ctx.createOscillator();
  o.setPeriodicWave(inst === 'lead' ? K.p25 : K.p12);
  o.frequency.setValueAtTime(f, t);
  // a little vibrato on long lead notes (it sings)
  if (dur > 0.45 && inst !== 'arp') {
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 5.5;
    lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.012, t + 0.3);
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.1);
  }
  o.connect(g);
  const short = inst === 'arp';
  const stop = env(g, t, (LEVEL[inst] ?? 0.1) * gain, short ? { a: 0.002, d: 0.06, s: 0.35, end: t + Math.min(dur, 0.12), r: 0.03 } : { a: 0.004, d: 0.12, s: 0.62, end: t + dur * 0.9, r: 0.05 });
  o.start(t); o.stop(stop);
}

/* one drum hit */
export function playDrum(ctx, dest, d, t, gain = 1) {
  const g = ctx.createGain();
  g.connect(dest);
  if (d === 'k') {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5 * gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g); o.start(t); o.stop(t + 0.22);
    return;
  }
  const n = noiseSrc(ctx, t), f = ctx.createBiquadFilter();
  n.connect(f); f.connect(g);
  let len = 0.04, lvl = 0.07;
  if (d === 's') {
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7; len = 0.14; lvl = 0.26;
    // the body: a short triangle thud under the rattle
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
    og.gain.setValueAtTime(0.2 * gain, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(og); og.connect(dest); o.start(t); o.stop(t + 0.1);
  } else if (d === 'h') { f.type = 'highpass'; f.frequency.value = 7000; len = 0.035; lvl = 0.07; }
  else if (d === 'o') { f.type = 'highpass'; f.frequency.value = 6500; len = 0.16; lvl = 0.06; }
  else if (d === 'c') { f.type = 'highpass'; f.frequency.value = 3800; len = 0.9; lvl = 0.09; }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(lvl * gain, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  n.stop(t + len + 0.02);
}

/* a one-off in a track: the deflating bloop (a sine sliding down through a wobble) */
export function playFx(ctx, dest, fx, t, gain = 1) {
  if (fx !== 'bloop') return;
  const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(55, t + 0.75);
  lfo.frequency.setValueAtTime(18, t); lfo.frequency.linearRampToValueAtTime(7, t + 0.75);
  lg.gain.value = 40;
  lfo.connect(lg); lg.connect(o.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32 * gain, t + 0.01);
  g.gain.setValueAtTime(0.32 * gain, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + 0.9); lfo.start(t); lfo.stop(t + 0.9);
}

/* ── synthesised SFX: returns the voice's { stop time, nodes to cut } ─── */
export function playSynthSfx(ctx, dest, id, t, rate = 1, gain = 1) {
  const g = ctx.createGain();
  g.connect(dest);
  const srcs = [];
  let end = t + 0.2;
  if (id === 'whoosh-light' || id === 'whoosh-heavy') {
    // air past a pillow: band-passed noise sweeping up and back down
    const heavy = id === 'whoosh-heavy', len = (heavy ? 0.26 : 0.15) / rate;
    const n = noiseSrc(ctx, t), f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = heavy ? 1.4 : 1.8;
    const lo = (heavy ? 380 : 700) * rate, hi = (heavy ? 1700 : 2600) * rate;
    f.frequency.setValueAtTime(lo, t);
    f.frequency.exponentialRampToValueAtTime(hi, t + len * 0.55);
    f.frequency.exponentialRampToValueAtTime(lo * 0.8, t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime((heavy ? 0.42 : 0.3) * gain, t + len * 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(f); f.connect(g); n.stop(t + len + 0.02); srcs.push(n);
    end = t + len + 0.02;
  } else if (id === 'grab') {
    // a fistful of plush: a soft cloth scrunch (noise, two quick swells) and a low pat
    const n = noiseSrc(ctx, t, 0.7), f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1100 * rate; f.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32 * gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.06 * gain, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.2 * gain, t + 0.075);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(f); f.connect(g); n.stop(t + 0.22); srcs.push(n);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(170 * rate, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.08);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.45 * gain, t + 0.004); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(og); og.connect(dest); o.start(t); o.stop(t + 0.12); srcs.push(o);
    end = t + 0.22;
  } else if (id === 'block') {
    // a cushion takes it: a muffled, padded thwap (low thud, short dull noise)
    const n = noiseSrc(ctx, t), f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1400 * rate; f.Q.value = 0.8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.38 * gain, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    n.connect(f); f.connect(g); n.stop(t + 0.1); srcs.push(n);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(240 * rate, t); o.frequency.exponentialRampToValueAtTime(110 * rate, t + 0.07);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.5 * gain, t + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(og); og.connect(dest); o.start(t); o.stop(t + 0.13); srcs.push(o);
    end = t + 0.14;
  } else if (id === 'thump') {
    // the weight under a heavy hit (small speakers lose the drafts' sub)
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120 * rate, t);
    o.frequency.exponentialRampToValueAtTime(48 * rate, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55 * gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); o.start(t); o.stop(t + 0.24); srcs.push(o);
    end = t + 0.24;
  } else if (id === 'ui-tick') {
    // a soft felt tick: a short high pulse blip
    const o = ctx.createOscillator();
    o.setPeriodicWave(kit(ctx).p25);
    o.frequency.setValueAtTime(1320 * rate, t);
    o.frequency.exponentialRampToValueAtTime(990 * rate, t + 0.03);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09 * gain, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); o.start(t); o.stop(t + 0.06); srcs.push(o);
    end = t + 0.06;
  } else if (id === 'ui-confirm') {
    // two rising notes, a fifth apart: a cheerful 'boing'
    for (const [dt, f0] of [[0, 784], [0.065, 1175]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.setPeriodicWave(kit(ctx).p25);
      o.frequency.setValueAtTime(f0 * 0.94 * rate, t + dt);
      o.frequency.exponentialRampToValueAtTime(f0 * rate, t + dt + 0.025);
      og.gain.setValueAtTime(0.0001, t + dt);
      og.gain.exponentialRampToValueAtTime(0.1 * gain, t + dt + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.16);
      o.connect(og); og.connect(g); o.start(t + dt); o.stop(t + dt + 0.17); srcs.push(o);
    }
    g.gain.value = 1;
    end = t + 0.24;
  } else return null;
  return { end, out: g, srcs };
}
