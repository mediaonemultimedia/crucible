/* A small chiptune sequencer. Notes are scheduled ahead on the AudioContext
   clock (a lookahead scheduler: `pump(until)` is called every ~30 ms and from
   the game's frame, and schedules every step that starts before `until`), so
   timing stays steady under load; nothing is timed by setTimeout.

   Voices: pulse waves (12.5 / 25 / 50 % duty, band-limited PeriodicWaves),
   a triangle bass, noise drums (one shared noise buffer through a filter),
   all one-shot nodes that stop themselves. Works on an OfflineAudioContext
   too (the evidence renders: tools/audio-render.mjs).                     */

import { stepDur } from './songs.js';

const hz = (n) => 440 * 2 ** ((n - 69) / 12);

/* a pulse wave's Fourier series, 32 harmonics (band-limited: no aliasing fizz) */
function pulseWave(ctx, duty) {
  const N = 32, re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  return ctx.createPeriodicWave(re, im);
}

/* instrument: wave, level, attack, decay to sustain, release */
const INST = {
  lead:  { wave: 'p25', g: 0.17, a: 0.004, dk: 0.12, sus: 0.62, r: 0.05 },
  lead2: { wave: 'p12', g: 0.15, a: 0.004, dk: 0.1, sus: 0.55, r: 0.05 },
  comp:  { wave: 'p50', g: 0.1, a: 0.003, dk: 0.06, sus: 0.3, r: 0.04 },
  arp:   { wave: 'p12', g: 0.08, a: 0.002, dk: 0.05, sus: 0.35, r: 0.02 },
  bass:  { wave: 'triangle', g: 0.36, a: 0.004, dk: 0.2, sus: 0.8, r: 0.04 },
  horn:  { wave: 'p50', g: 0.2, a: 0.03, dk: 0.25, sus: 0.85, r: 0.12, lp: 1400 },
  bloop: { wave: 'sine', g: 0.42, a: 0.005, dk: 0.6, sus: 0.6, r: 0.15 },
};

export class Sequencer {
  constructor(ctx, out, now = () => ctx.currentTime) {
    this.now = now;
    this.ctx = ctx;
    this.out = out;
    this.waves = { p12: pulseWave(ctx, 0.125), p25: pulseWave(ctx, 0.25), p50: pulseWave(ctx, 0.5) };
    const n = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    let s = 0x9e3779b9;
    for (let i = 0; i < n; i++) { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; d[i] = (s / 4294967296) * 2 - 1; }
    this.song = null;
    this.tempo = 1;
    this.boost = false;
    this.playing = false;
    this.voices = 0;
  }

  /* start a piece at time `at`; loop, or call onEnd once it's played out */
  start(song, { at = this.now() + 0.06, loop = true, onEnd = null, from = 0 } = {}) {
    this.song = song;
    this.loop = loop;
    this.onEnd = onEnd;
    this.step = from;
    this.next = at;
    this.playing = true;
    this._idx = song.notes.findIndex((x) => x.s >= from);
    if (this._idx < 0) this._idx = song.notes.length;
  }

  stop() { this.playing = false; this.song = null; this.onEnd = null; }

  /* hold where it is (the pause): `resume` carries on from the same step */
  hold() { if (this.playing) { this.playing = false; this.held = true; } }
  resume(at = this.now() + 0.06) { if (this.held && this.song) { this.held = false; this.playing = true; this.next = at; } }

  /* schedule every step that starts before `until` (seconds, context time) */
  pump(until) {
    if (!this.playing || !this.song) return;
    const S = this.song, now = this.now();
    // fell behind (a throttled tab): skip ahead rather than burst
    if (this.next < now - 0.1) {
      const dt = stepDur(S, this.tempo);
      while (this.next < now) { this.next += dt; this._advance(); if (!this.playing) return; }
    }
    while (this.playing && this.next < until) {
      const dt = stepDur(S, this.tempo);
      // swing: the off-beat 16th pushed late
      const sw = this.step % 2 ? (2 * S.swing - 1) * dt : 0;
      while (this._idx < S.notes.length && S.notes[this._idx].s === this.step) {
        const x = S.notes[this._idx++];
        if (x.b && !this.boost) continue;
        this.note(x, this.next + sw, x.d * dt);
      }
      this.next += dt;
      this._advance();
    }
  }

  _advance() {
    const S = this.song;
    this.step++;
    if (this.step < S.steps) return;
    if (this.loop) { this.step = 0; this._idx = 0; return; }
    const cb = this.onEnd, end = this.next + 0.3;
    this.playing = false;
    this.song = null;
    this.onEnd = null;
    if (cb) cb(end);
  }

  /* one note (or drum hit) at time t, `dur` seconds long */
  note(x, t, dur) {
    const c = this.ctx;
    if (x.i === 'kick' || x.i === 'snare' || x.i === 'hat' || x.i === 'ohat' || x.i === 'crash') return this.drum(x.i, t, x.v);
    const I = INST[x.i];
    if (!I) return;
    const o = c.createOscillator(), g = c.createGain();
    if (I.wave in this.waves) o.setPeriodicWave(this.waves[I.wave]); else o.type = I.wave;
    const f = hz(x.n);
    o.frequency.setValueAtTime(f, t);
    if (x.slide) o.frequency.exponentialRampToValueAtTime(f * 2 ** (x.slide / 12), t + dur);
    let lfo = null;
    if (x.vib) {
      // vibrato that grows in (the trombone's wobble, a held note's shimmer)
      lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = x.i === 'horn' ? 5.2 : 6;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(f * (2 ** (x.vib / 12) - 1), t + Math.min(dur, 0.6));
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + I.r * 4);
    }
    const peak = I.g * x.v;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + I.a);
    g.gain.setTargetAtTime(peak * I.sus, t + I.a, I.dk / 3);
    g.gain.setTargetAtTime(0, t + Math.max(I.a, dur - 0.01), I.r / 3);
    let head = o;
    if (I.lp) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = I.lp; lp.Q.value = 2; o.connect(lp); head = lp; }
    head.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + I.r * 4);
    this.voices++;
    o.onended = () => { this.voices--; g.disconnect(); };
  }

  drum(kind, t, v) {
    const c = this.ctx, g = c.createGain();
    g.connect(this.out);
    if (kind === 'kick') {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(170, t);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
      g.gain.setValueAtTime(0.75 * v, t);
      g.gain.setTargetAtTime(0, t + 0.02, 0.05);
      o.connect(g); o.start(t); o.stop(t + 0.3);
      o.onended = () => g.disconnect();
      return;
    }
    const src = c.createBufferSource(), fl = c.createBiquadFilter();
    src.buffer = this.noise;
    const off = ((t * 7919) % 0.8 + 0.8) % 0.8;
    let len = 0.06;
    if (kind === 'snare') {
      fl.type = 'bandpass'; fl.frequency.value = 1900; fl.Q.value = 0.7; len = 0.16;
      g.gain.setValueAtTime(0.5 * v, t); g.gain.setTargetAtTime(0, t + 0.01, 0.04);
      // the drum's body under the rattle
      const o = c.createOscillator(), og = c.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(210, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.05);
      og.gain.setValueAtTime(0.35 * v, t); og.gain.setTargetAtTime(0, t + 0.005, 0.02);
      o.connect(og).connect(this.out); o.start(t); o.stop(t + 0.12);
      o.onended = () => og.disconnect();
    } else if (kind === 'hat' || kind === 'ohat') {
      fl.type = 'highpass'; fl.frequency.value = 7000; len = kind === 'ohat' ? 0.2 : 0.05;
      g.gain.setValueAtTime(0.32 * v, t); g.gain.setTargetAtTime(0, t + 0.002, kind === 'ohat' ? 0.05 : 0.012);
    } else {
      fl.type = 'highpass'; fl.frequency.value = 3500; len = 1.2;
      g.gain.setValueAtTime(0.3 * v, t); g.gain.setTargetAtTime(0, t + 0.01, 0.32);
    }
    src.connect(fl).connect(g);
    src.start(t, off, len);
    src.onended = () => g.disconnect();
  }
}
