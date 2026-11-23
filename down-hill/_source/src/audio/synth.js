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

const LEVEL = { lead: 0.13, lead2: 0.085, arp: 0.05, bass: 0.21, tbone: 0.16 };
/* the warm voices (a channel with a low-pass): levels for a filtered pulse */
const WARM = { lead: 0.092, lead2: 0.05, arp: 0.024 };

/* one note: inst, MIDI note, time, duration (s), gain (0–1 from the track),
   v: the channel's voicing ({ wave: 'p50' | 'p25' | 'p12', lp: Hz }) */
export function playNote(ctx, dest, inst, note, t, dur, gain = 1, v = {}) {
  const K = kit(ctx), f = hz(note), g = ctx.createGain();
  g.connect(dest);
  if (inst === 'bass') {
    // a triangle (the NES bass) with a soft, filtered half-pulse an octave
    // up for body on small speakers; bouncy: it lets go before the next note
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    o.connect(g);
    const o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g2 = ctx.createGain();
    o2.setPeriodicWave(K.p50);
    o2.frequency.setValueAtTime(f, t);
    lp.type = 'lowpass'; lp.Q.value = 0.6;
    lp.frequency.setValueAtTime(900, t); lp.frequency.setTargetAtTime(420, t, 0.05);
    g2.gain.value = 0.16;
    o2.connect(lp); lp.connect(g2); g2.connect(g);
    const stop = env(g, t, LEVEL.bass * gain, { a: 0.003, d: 0.14, s: 0.62, end: t + Math.max(0.06, dur * 0.86), r: 0.05 });
    o.start(t); o.stop(stop); o2.start(t); o2.stop(stop);
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
  const warm = !!v.lp;
  const o = ctx.createOscillator();
  o.setPeriodicWave(K[v.wave] || (inst === 'lead' ? K.p25 : K.p12));
  o.frequency.setValueAtTime(f, t);
  let src = o;
  if (warm) {
    // a gentle low-pass that tracks the pitch, opening a little on the attack
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 0.5;
    const fc = Math.min(v.lp, Math.max(800, f * 7));
    lp.frequency.setValueAtTime(fc * 1.6, t);
    lp.frequency.setTargetAtTime(fc, t + 0.01, 0.07);
    o.connect(lp); src = lp;
  }
  // vibrato on long notes (it sings); the warm voices start straight and ease in
  if (dur > (warm ? 0.32 : 0.45) && inst !== 'arp') {
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = warm ? 5.2 : 5.5;
    const delay = warm ? 0.2 : 0, depth = f * (warm ? 0.0075 : 0.012);
    lg.gain.setValueAtTime(0, t); lg.gain.setValueAtTime(0, t + delay); lg.gain.linearRampToValueAtTime(depth, t + delay + 0.3);
    lfo.connect(lg); lg.connect(o.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.15);
  }
  src.connect(g);
  const short = inst === 'arp';
  const peak = ((warm ? WARM[inst] : LEVEL[inst]) ?? 0.1) * gain;
  const shape = short ? { a: 0.003, d: 0.08, s: 0.35, end: t + Math.min(dur, 0.14), r: 0.05 }
    : warm ? { a: 0.008, d: 0.16, s: 0.72, end: t + dur * 0.93, r: 0.09 }
      : { a: 0.004, d: 0.12, s: 0.62, end: t + dur * 0.9, r: 0.05 };
  const stop = env(g, t, peak, shape);
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
  if (d === 't' || d === 'l') {
    // a toy tom (high / low): a triangle thud dropping in pitch, a breath of noise
    const o = ctx.createOscillator(), hi = d === 't';
    o.type = 'triangle';
    o.frequency.setValueAtTime(hi ? 240 : 165, t);
    o.frequency.exponentialRampToValueAtTime(hi ? 150 : 100, t + 0.14);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42 * gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); o.start(t); o.stop(t + 0.24);
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
  } else if (d === 'h') { f.type = 'bandpass'; f.frequency.value = 7200; f.Q.value = 0.9; len = 0.032; lvl = 0.055; }
  else if (d === 'o') { f.type = 'bandpass'; f.frequency.value = 6800; f.Q.value = 0.8; len = 0.14; lvl = 0.05; }
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
  } else if (id.startsWith('sp-') || id.startsWith('dh-')) {
    // the motion specials (PF2): soft, plush, cartoon — noise and sines only
    const N = (lenS, type, f0, f1, q, peak, a = 0.01, nrate = 1) => {
      const n = noiseSrc(ctx, t, nrate), f = ctx.createBiquadFilter(), ng = ctx.createGain();
      f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0 * rate, t); f.frequency.exponentialRampToValueAtTime(f1 * rate, t + lenS);
      ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(peak * gain, t + a); ng.gain.exponentialRampToValueAtTime(0.0001, t + lenS);
      n.connect(f); f.connect(ng); ng.connect(g); n.stop(t + lenS + 0.02); srcs.push(n);
      return ng;
    };
    const O = (lenS, type, f0, f1, peak, a = 0.005, at = 0) => {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(f0 * rate, t + at); o.frequency.exponentialRampToValueAtTime(f1 * rate, t + at + lenS);
      og.gain.setValueAtTime(0.0001, t + at); og.gain.exponentialRampToValueAtTime(peak * gain, t + at + a); og.gain.exponentialRampToValueAtTime(0.0001, t + at + lenS);
      o.connect(og); og.connect(g); o.start(t + at); o.stop(t + at + lenS + 0.02); srcs.push(o);
    };
    g.gain.value = 1;
    const k = id.slice(3);
    let len = 0.3;
    if (k === 'snow') { len = 0.22; N(0.2, 'bandpass', 2600, 900, 0.9, 0.34, 0.004, 1.4); N(0.12, 'lowpass', 900, 300, 0.7, 0.3, 0.003); }       // a snowball bursting: a crunchy puff
    else if (k === 'glove') { len = 0.3; N(0.28, 'bandpass', 1500, 600, 0.8, 0.26, 0.01, 0.6); O(0.12, 'sine', 210, 90, 0.35); }              // a felt glove's whump and a feather rustle
    else if (k === 'flame') { len = 0.55; N(0.55, 'lowpass', 500, 2400, 0.6, 0.3, 0.06, 0.5); N(0.5, 'bandpass', 3200, 1800, 3, 0.08, 0.03, 2.2); } // a soft whoomph of flame, a crackle
    else if (k === 'fire') { len = 0.35; N(0.35, 'lowpass', 1800, 300, 0.7, 0.34, 0.004, 0.7); O(0.14, 'sine', 160, 60, 0.3); }               // a flame puffs out
    else if (k === 'stretch') { len = 0.42; O(0.4, 'triangle', 260, 1100, 0.16, 0.02); O(0.4, 'sine', 520, 2200, 0.05, 0.02); }            // a slide-whistle neck
    else if (k === 'bonk') { len = 0.2; O(0.18, 'sine', 620, 300, 0.32); N(0.06, 'bandpass', 1800, 1200, 1.2, 0.18, 0.002); }                 // the head bonks
    else if (k === 'ink') { len = 0.3; O(0.16, 'sine', 420, 140, 0.32, 0.004); N(0.22, 'bandpass', 900, 2600, 2, 0.16, 0.01, 0.8); }          // a wet squirt
    else if (k === 'splat') { len = 0.3; N(0.28, 'lowpass', 1200, 200, 1.2, 0.4, 0.003, 0.8); O(0.1, 'sine', 180, 70, 0.25); }                // the ink splats
    else if (k === 'roll') { len = 0.75; N(0.75, 'lowpass', 220, 520, 1.5, 0.42, 0.08, 0.4); O(0.7, 'sine', 55, 75, 0.2, 0.08); }              // a big plush rumbling roll
    else if (k === 'torpedo') { len = 0.6; O(0.55, 'sine', 1500, 520, 0.11, 0.03); N(0.55, 'bandpass', 600, 2400, 1.3, 0.3, 0.05); }         // a whistling dive across
    else if (k === 'tornado') {
      // a whirling gust: band-passed noise with a fast tremolo
      len = 0.8;
      const ng = N(0.8, 'bandpass', 500, 1600, 1.1, 0.38, 0.06, 0.9);
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 11 * rate; lg.gain.value = 0.5;
      l.connect(lg); lg.connect(ng.gain); l.start(t); l.stop(t + 0.82); srcs.push(l);
    }
    // ── Down Hill (dh-): the kart race's own ──
    else if (k === 'boost') { len = 0.6; N(0.6, 'bandpass', 500, 3200, 1.1, 0.36, 0.01, 1); O(0.45, 'sawtooth', 160, 520, 0.07, 0.01); }
    else if (k === 'pad') { len = 0.32; O(0.12, 'square', 660, 990, 0.08); O(0.16, 'square', 990, 1480, 0.08, 0.004, 0.08); N(0.3, 'bandpass', 2000, 4200, 1.4, 0.12, 0.01, 1.4); }
    else if (k === 'tier') { len = 0.3; O(0.25, 'triangle', 1200, 1250, 0.16, 0.003); O(0.2, 'sine', 2400, 2500, 0.06, 0.003, 0.03); }
    else if (k === 'tick') { len = 0.05; O(0.04, 'square', 1500, 1400, 0.05, 0.002); }
    else if (k === 'get') { len = 0.36; for (const [a, f] of [[0, 784], [0.07, 988], [0.14, 1175], [0.21, 1568]]) O(0.12, 'square', f, f, 0.07, 0.003, a); }
    else if (k === 'throw') { len = 0.3; N(0.28, 'bandpass', 700, 2600, 1.6, 0.3, 0.01, 1); }
    else if (k === 'spin') { len = 0.75; O(0.7, 'triangle', 900, 140, 0.2, 0.01); N(0.6, 'bandpass', 1400, 400, 1.5, 0.14, 0.02, 1); }
    else if (k === 'bonk') { len = 0.25; O(0.2, 'sine', 560, 220, 0.34); N(0.08, 'bandpass', 1700, 900, 1.2, 0.22, 0.002); }
    else if (k === 'ring') {
      // the alarm clock: a hammer between two bells, very fast, very loud
      len = 1.3;
      for (let i = 0; i < 26; i++) { const a = i * 0.048; O(0.05, 'square', i % 2 ? 2300 : 2650, i % 2 ? 2280 : 2600, 0.09, 0.002, a); }
      O(1.2, 'sine', 1180, 1170, 0.05, 0.01);
    }
    else if (k === 'reel') { len = 0.9; for (let i = 0; i < 14; i++) N(0.03, 'bandpass', 3000, 2800, 4, 0.18, 0.002, 1 + i * 0.02); O(0.85, 'sine', 300, 600, 0.05, 0.05); }
    else if (k === 'beep') { len = 0.25; O(0.22, 'square', 880, 880, 0.12, 0.003); }
    else if (k === 'go') { len = 0.6; O(0.55, 'square', 1760, 1760, 0.13, 0.003); O(0.55, 'square', 1318, 1318, 0.07, 0.003); }
    else if (k === 'grunt') { len = 0.32; O(0.28, 'sawtooth', 240, 120, 0.12, 0.01); N(0.22, 'bandpass', 900, 500, 3, 0.16, 0.01, 1); O(0.2, 'square', 120, 80, 0.06, 0.01); }
    else if (k === 'clink') { len = 0.5; for (const [a, f] of [[0, 2900], [0.09, 3400], [0.2, 3100]]) O(0.2, 'sine', f, f * 0.98, 0.12, 0.002, a); N(0.4, 'bandpass', 1200, 1600, 2, 0.08, 0.02, 0.7); }
    else if (k === 'scrape') { len = 0.16; N(0.15, 'bandpass', 3600, 2200, 2.5, 0.22, 0.004, 1.6); N(0.12, 'highpass', 5200, 4200, 0.7, 0.08, 0.002, 2); }   // a rail's grind: gritty, metallic
    else if (k === 'bump') { len = 0.22; O(0.18, 'sine', 150, 60, 0.36, 0.003); N(0.1, 'lowpass', 900, 300, 0.8, 0.2, 0.002); }
    else if (k === 'honk') { len = 0.5; O(0.22, 'square', 392, 392, 0.09, 0.005); O(0.22, 'square', 494, 494, 0.07, 0.005); O(0.24, 'square', 392, 392, 0.09, 0.005, 0.26); O(0.24, 'square', 523, 523, 0.07, 0.005, 0.26); }
    else if (k === 'flap') { len = 0.45; for (let i = 0; i < 5; i++) N(0.07, 'bandpass', 800, 1400, 1.2, 0.2, 0.004, 1 + i * 0.05); }
    else if (k === 'splat') { len = 0.3; N(0.28, 'lowpass', 1200, 200, 1.2, 0.4, 0.003, 0.8); O(0.1, 'sine', 180, 70, 0.25); }
    else if (k === 'trick') { len = 0.5; O(0.45, 'triangle', 400, 1600, 0.12, 0.01); N(0.4, 'bandpass', 800, 3000, 1.5, 0.16, 0.02, 1); }
    // stage 5: the box's ding, the boost's whoosh, the four new items
    else if (k === 'ding') { len = 0.55; O(0.5, 'sine', 1568, 1568, 0.16, 0.002); O(0.4, 'sine', 3136, 3136, 0.05, 0.002); O(0.45, 'triangle', 2093, 2093, 0.06, 0.002, 0.06); }
    else if (k === 'whoosh') { len = 0.55; N(0.55, 'bandpass', 300, 2600, 0.9, 0.42, 0.03, 1); N(0.4, 'highpass', 2400, 5200, 0.7, 0.07, 0.02, 1.6); }
    else if (k === 'candy') { len = 0.6; for (const [a2, f] of [[0, 1047], [0.06, 1319], [0.12, 1568], [0.18, 2093], [0.26, 2637]]) O(0.16, 'triangle', f, f, 0.09, 0.003, a2); N(0.5, 'highpass', 5000, 7000, 0.7, 0.05, 0.02, 2); }
    else if (k === 'plane') { len = 0.5; O(0.45, 'sine', 900, 1400, 0.06, 0.03); N(0.45, 'bandpass', 1500, 2600, 3, 0.12, 0.04, 1.2); }
    else if (k === 'steam') { len = 1.1; N(1.1, 'highpass', 2200, 3800, 0.6, 0.3, 0.05, 1.3); N(0.8, 'lowpass', 600, 200, 0.7, 0.18, 0.04, 0.5); }
    else if (k === 'boing') { len = 0.7; O(0.65, 'sine', 140, 620, 0.32, 0.004); O(0.6, 'triangle', 280, 900, 0.08, 0.004); }
    else if (k === 'squash') { len = 0.3; O(0.25, 'sine', 300, 60, 0.3, 0.003); N(0.2, 'lowpass', 1400, 200, 1, 0.3, 0.003, 0.7); }
    else if (k === 'lock') { len = 0.22; O(0.08, 'square', 1760, 1760, 0.06, 0.002); O(0.08, 'square', 1760, 1760, 0.06, 0.002, 0.12); }
    else if (k === 'scare') { len = 0.7; O(0.6, 'sawtooth', 110, 55, 0.18, 0.003); N(0.5, 'lowpass', 2000, 300, 0.8, 0.3, 0.003, 0.6); }
    else return null;
    end = t + len + 0.03;
  } else return null;
  return { end, out: g, srcs };
}
