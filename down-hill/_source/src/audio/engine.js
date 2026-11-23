/* The sound of Pillow Fight: one AudioContext (made on the first key or
   click — the browsers' autoplay rule), two buses (music, SFX) into a
   compressor and a limiter (no clipping however much piles up), a voice
   cap, the decoded clips, and a lookahead sequencer for the music (notes
   scheduled ~0.25 s ahead on the AudioContext clock, so the timing holds
   whatever the frame rate does). Presentation only: the game tells it what
   happened; it never touches the game.                                   */

import { TRACKS, compile } from './music.js';
import { playNote, playDrum, playFx, playSynthSfx, kit } from './synth.js';

export const STORE_KEY = 'pillowfight.audio.v1';
export const DEFAULTS = { muted: false, music: 70, sfx: 85 };
const LOOKAHEAD = 0.25;          // s of music scheduled ahead
const MAX_VOICES = 14;           // SFX playing at once
const MAX_SAME = 4;              // …of one sound
export const PRACTICE_MUSIC = 0.35;   // practice: the music low
export const MUSIC_GAIN = 0.5;        // the music under the engines, items and voices (was 0.9: about -5 dB)

const db = (x) => 10 ** (x / 20);
/* the clips' levels, from their measured loudness (tools/audio-prep.mjs:
   the loudest 100 ms, RMS) to where each sits in the mix: hits punchy, the
   heavy and the K.O. on top, footsteps and jumps under, the UI quiet */
export const MIX = {
  'hit-light': db(-9.5), 'hit-heavy': db(-1), 'knockdown': db(-2), 'land': db(-10),
  'jump': db(-13), 'crowd-ooh': db(-9), 'feather-burst': db(-3),
  // synthesised (their own levels are in synth.js)
  'whoosh-light': 1, 'whoosh-heavy': 1, 'grab': 1, 'block': 1, 'thump': 1, 'ui-tick': 0.8, 'ui-confirm': 0.8,
};
export const CLIP_IDS = ['hit-light', 'hit-heavy', 'knockdown', 'land', 'jump', 'crowd-ooh', 'feather-burst'];

const COMPILED = {};
export const track = (name) => COMPILED[name] || (COMPILED[name] = compile(TRACKS[name]));

/* settings: in localStorage (any failure: the defaults, for the session) */
export function loadSettings(ls) {
  try {
    const s = JSON.parse(ls?.getItem(STORE_KEY) || 'null');
    if (!s || typeof s !== 'object') return { ...DEFAULTS };
    const n = (v, d) => (Number.isFinite(+v) ? Math.max(0, Math.min(100, Math.round(+v))) : d);
    return { muted: !!s.muted, music: n(s.music, DEFAULTS.music), sfx: n(s.sfx, DEFAULTS.sfx) };
  } catch { return { ...DEFAULTS }; }
}
export function saveSettings(ls, s) {
  try { ls?.setItem(STORE_KEY, JSON.stringify({ muted: !!s.muted, music: s.music, sfx: s.sfx })); } catch { /* private mode: for the session */ }
}
/* a slider (0–100) → gain: a squared curve, so the low end is usable */
export const level = (v) => (v / 100) ** 2;

/* each instrument's place in the stereo field, and how much of it goes to the echo */
const PAN = { lead: -0.12, lead2: 0.26, arp: -0.3, bass: 0, drums: 0.04 };
const SEND = { lead: 0.3, arp: 0.22 };
const ECHO = { beats: 0.75, feedback: 0.3, lp: 1900, pan: 0.42 };

/* ── the sequencer: one track on one context ───────────────────────────── */
export class Sequencer {
  constructor(ctx, dest, name, { loop = null, onEnd = null } = {}) {
    this.ctx = ctx;
    this.c = track(name);
    this.name = name;
    this.loop = loop ?? this.c.loop;
    this.onEnd = onEnd;
    this.out = ctx.createGain();
    this.out.connect(dest);
    this.buses = {};
    this.echo = null;
    this.tempo = 1;
    this.intense = false;
    this.pending = null;         // a final-lap switch waiting for its bar line
    this.idx = 0;
    this.base = 0;               // the beat offset of the current pass of the loop
    this.on = false;
    this.done = false;
  }

  /* an instrument's bus: panned, and (the lead, the shimmer) a send to the echo */
  bus(inst) {
    let b = this.buses[inst];
    if (b) return b;
    const ctx = this.ctx;
    b = this.buses[inst] = ctx.createGain();
    const pan = PAN[inst] ?? 0;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; b.connect(p); p.connect(this.out); } else b.connect(this.out);
    if (SEND[inst]) { const s = ctx.createGain(); s.gain.value = SEND[inst]; b.connect(s); s.connect(this._echo()); }
    return b;
  }

  /* a dotted-eighth echo, darker on each repeat, on the other side */
  _echo() {
    if (this.echo) return this.echo.in;
    const ctx = this.ctx, d = ctx.createDelay(2), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
    d.delayTime.value = ECHO.beats * this.spb();
    fb.gain.value = ECHO.feedback;
    lp.type = 'lowpass'; lp.frequency.value = ECHO.lp; lp.Q.value = 0.5;
    wet.gain.value = 1;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet);
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = ECHO.pan; wet.connect(p); p.connect(this.out); } else wet.connect(this.out);
    this.echo = { in: d, d };
    return d;
  }

  spb() { return 60 / (this.c.bpm * this.tempo); }
  timeOf(beat) { return this.t0 + (beat - this.b0) * this.spb(); }
  beatAt(time) { return this.b0 + (time - this.t0) / this.spb(); }

  /* the beats one pass of the loop adds (after the first: from loopBeat to the end) */
  get passBeats() { return this.c.beats - (this.loop ? this.c.loopBeat : 0); }

  start(at = this.ctx.currentTime + 0.05, fromBeat = 0) {
    this.t0 = at; this.b0 = fromBeat;
    const B = this.c.beats, L0 = this.loop ? this.c.loopBeat : 0, L = B - L0;
    this.base = fromBeat < B ? 0 : Math.floor((fromBeat - L0) / L) * L;
    const inLoop = fromBeat - this.base;
    this.idx = this.c.events.findIndex((e) => e.beat >= inLoop - 1e-6);
    if (this.idx < 0) { this.idx = this.loop ? this.c.loopIdx : 0; this.base += L; }
    this.on = true;
    this.endAt = this.loop ? Infinity : this.timeOf(this.c.beats) + 1.2;
    return this;
  }

  /* schedule everything that starts before `until` (AudioContext seconds) */
  pump(until) {
    if (!this.on) return;
    const E = this.c.events;
    for (let n = 0; n < 4000; n++) {
      if (this.idx >= E.length) {
        if (!this.loop) { this.on = false; return; }
        this.idx = this.c.loopIdx; this.base += this.passBeats;
      }
      const e = E[this.idx], beat = this.base + e.beat;
      if (this.pending && beat >= this.pending.beat - 1e-6 && this.timeOf(this.pending.beat) < until) this._switch();
      const t = this.timeOf(beat);
      if (t >= until) return;
      this.idx++;
      if (e.hype && !this.intense) continue;
      if (t < this.ctx.currentTime - 0.02) continue;            // (late: skip, never pile up)
      const dur = e.dur * this.spb();
      if (e.inst === 'drums') playDrum(this.ctx, this.bus('drums'), e.drum, t, e.gain);
      else if (e.inst === 'fx') playFx(this.ctx, this.out, e.fx, t, e.gain);
      else playNote(this.ctx, this.bus(e.inst), e.inst, e.note, t, dur, e.gain, e);
    }
  }

  /* the final lap (or back): the hype layer and the new tempo from the next
     bar line, so the switch lands on the downbeat */
  queueIntense(on, tempo = 1) {
    if (!this.on) { this.intense = on; this.tempo = tempo; return; }
    const E = this.c.events;
    const next = this.idx < E.length ? this.base + E[this.idx].beat : this.base + this.passBeats + (this.loop ? this.c.loopBeat : 0);
    this.pending = { beat: Math.ceil(next / 4 - 1e-6) * 4, on, tempo };
  }
  _switch() {
    const p = this.pending;
    this.pending = null;
    const t = this.timeOf(p.beat);
    this.t0 = t; this.b0 = p.beat;
    this.tempo = p.tempo;
    this.intense = p.on;
    if (this.echo) this.echo.d.delayTime.setValueAtTime(ECHO.beats * this.spb(), Math.max(t, this.ctx.currentTime));
  }

  /* a new tempo from the next note on (the beats so far keep their times) */
  setTempo(f) {
    if (f === this.tempo || !this.on) { this.tempo = f; return; }
    const E = this.c.events, e = E[Math.min(this.idx, E.length - 1)];
    const beat = this.base + (this.idx < E.length ? e.beat : this.c.beats);  // (a stray tempo: from the next note)
    const t = Math.max(this.ctx.currentTime, this.timeOf(beat));
    this.t0 = t; this.b0 = beat;
    this.tempo = f;
  }

  stop(fade = 0.08) {
    this.on = false;
    const now = this.ctx.currentTime, g = this.out.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(0, now, fade / 3);
    const out = this.out;
    const offline = globalThis.OfflineAudioContext && this.ctx instanceof globalThis.OfflineAudioContext;
    if (!offline && typeof setTimeout === 'function') setTimeout(() => { try { out.disconnect(); } catch { /* gone */ } }, (fade + 1.5) * 1000);
  }
}

/* ── the engine ───────────────────────────────────────────────────────── */
export class AudioEngine {
  constructor({ storage = null, clips = null } = {}) {
    this.ls = storage;
    this.clipData = clips;       // { id: base64 MP3 }
    this.settings = loadSettings(storage);
    this.ctx = null;
    this.buffers = {};
    this.voices = [];
    this.want = null;            // the loop the game wants: 'menu', 'fight' or null
    this.loopSeq = null;
    this.stings = [];
    this.paused = false;
    this.intense = false;
    this.practice = false;
    this.listeners = new Set();
    this.counts = { sfx: 0, dropped: 0, stolen: 0 };
    this.log = null;             // tests and captures: an array to push every SFX to
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  /* on a user gesture (key or pointer): make or wake the context */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !this.hidden) this.ctx.resume().catch(() => {}); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { try { ctx = new AC(); } catch { return; } }
    this._wire(ctx);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    this._decode();
    this.timer = setInterval(() => this.pump(), 25);
    // a hidden tab: let the context sleep (timers are throttled there; no stutter on return)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      this.hidden = document.hidden;
      if (document.hidden) ctx.suspend().catch(() => {}); else ctx.resume().catch(() => {});
    });
    this._applyWant();
  }

  /* the graph, on any context (the live one, or an OfflineAudioContext for a capture) */
  _wire(ctx) {
    this.ctx = ctx;
    kit(ctx);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    this.master = ctx.createGain();
    this.out = ctx.createGain();
    this.out.gain.value = 0.92;
    this.master.connect(comp); comp.connect(lim); lim.connect(this.out); this.out.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.duckNode = ctx.createGain();
    this.sfxBus = ctx.createGain();
    // the music's own glue: a soft compressor and the top end rolled off a
    // little (no harsh highs), under the engines, items and voices
    const mComp = ctx.createDynamicsCompressor();
    mComp.threshold.value = -22; mComp.knee.value = 12; mComp.ratio.value = 2.5; mComp.attack.value = 0.012; mComp.release.value = 0.25;
    const mTone = ctx.createBiquadFilter();
    mTone.type = 'highshelf'; mTone.frequency.value = 4500; mTone.gain.value = -4;
    this.duckNode.connect(this.musicBus); this.musicBus.connect(mComp); mComp.connect(mTone); mTone.connect(this.master); this.sfxBus.connect(this.master);
    this._levels(true);
  }

  async _decode() {
    if (!this.clipData) return;
    const ctx = this.ctx;
    await Promise.all(Object.entries(this.clipData).map(async ([id, b64]) => {
      try {
        const bin = atob(b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(u.buffer, res, rej); if (p && p.then) p.then(res, rej); });
        this.buffers[id] = trimLead(ctx, buf);
      } catch (err) { console.warn('audio clip', id, err?.message || err); }
    }));
  }

  /* ── levels and settings ── */
  _levels(now = false) {
    if (!this.ctx) return;
    const S = this.settings, t = this.ctx.currentTime;
    const set = (p, v) => { if (now) p.value = v; else { p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.setTargetAtTime(v, t, 0.03); } };
    set(this.master.gain, S.muted ? 0 : 1);
    set(this.musicBus.gain, level(S.music) * MUSIC_GAIN * (this.practice ? PRACTICE_MUSIC : 1) * (this.paused ? 0 : 1));
    set(this.sfxBus.gain, level(S.sfx));
  }

  set(key, v) {
    if (key === 'muted') this.settings.muted = !!v;
    else this.settings[key] = Math.max(0, Math.min(100, Math.round(v)));
    saveSettings(this.ls, this.settings);
    this._levels();
    for (const f of this.listeners) f(this.settings);
  }
  toggleMute() { this.set('muted', !this.settings.muted); return this.settings.muted; }
  onChange(f) { this.listeners.add(f); }

  /* ── SFX ── */
  play(id, { gain = 1, rate = 1, delay = 0 } = {}) {
    this.counts.sfx++;
    if (this.log) this.log.push({ id, gain, rate, delay, t: this.ctx ? this.ctx.currentTime : 0 });
    if (!this.ctx || this.ctx.state !== 'running' || this.settings.muted || !this.settings.sfx) return;
    this._playAt(id, this.ctx.currentTime + delay, gain, rate);
  }

  _playAt(id, t, gain, rate, now = this.ctx.currentTime) {
    const ctx = this.ctx, dest = this.sfxBus;
    this._cull(id, t, now);
    const g = (MIX[id] ?? 1) * gain;
    const buf = this.buffers[id];
    let v;
    if (buf) {
      const s = ctx.createBufferSource(), out = ctx.createGain();
      s.buffer = buf; s.playbackRate.value = rate;
      out.gain.value = g;
      s.connect(out); out.connect(dest);
      s.start(t);
      v = { end: t + buf.duration / rate, out, srcs: [s] };
    } else if (CLIP_IDS.includes(id) && !this.synthFallback) {
      this.counts.dropped++;     // (not decoded yet)
      return;
    } else {
      v = playSynthSfx(ctx, dest, id, t, rate, g);
      if (!v) return;
    }
    v.id = id;
    this.voices.push(v);
  }

  /* the voice cap: drop the ended; steal the oldest when full */
  _cull(id, t, now) {
    this.voices = this.voices.filter((v) => v.end > now);
    const steal = (v) => {
      this.counts.stolen++;
      try { v.out.gain.cancelScheduledValues(now); v.out.gain.setTargetAtTime(0, Math.max(now, t - 0.01), 0.006); } catch { /* ended */ }
      for (const s of v.srcs) { try { s.stop(Math.max(now, t) + 0.04); } catch { /* ended */ } }
      this.voices.splice(this.voices.indexOf(v), 1);
    };
    const same = this.voices.filter((v) => v.id === id);
    if (same.length >= MAX_SAME) steal(same[0]);
    if (this.voices.length >= MAX_VOICES) steal(this.voices[0]);
  }

  ui(id) { this.play(id === 'confirm' ? 'ui-confirm' : 'ui-tick', { gain: 1, rate: 1 }); }

  /* ── music ── */
  /* the loop the game is in ('menu', 'fight' or null: silence); idempotent */
  music(name) {
    this.want = name;
    this._applyWant();
  }

  _applyWant() {
    if (!this.ctx) return;
    const cur = this.loopSeq?.on ? this.loopSeq.name : null;
    if (cur === this.want) return;
    if (this.loopSeq) { this.loopSeq.stop(0.4); this.loopSeq = null; }
    if (!this.want) return;
    this.loopSeq = new Sequencer(this.ctx, this.duckNode, this.want);
    this.loopSeq.intense = this.intense;
    this.loopSeq.tempo = this.intense ? this.loopSeq.c.hypeTempo : 1;
    this.loopSeq.start(this.ctx.currentTime + 0.08);
    this.loopSeq.pump(this.ctx.currentTime + LOOKAHEAD);
  }

  /* a sting or jingle over (vs, round) or instead of (win, lose) the loop */
  sting(name) {
    if (!this.ctx) return;
    if (name === 'win' || name === 'lose' || name === 'vs') { this.want = null; this._applyWant(); }
    if (name === 'round') this.duck(0.45, 1.2);
    const s = new Sequencer(this.ctx, this.musicBus, name).start(this.ctx.currentTime + 0.03);
    s.pump(this.ctx.currentTime + LOOKAHEAD);
    this.stings.push(s);
  }

  /* the music dips (under the K.O., a jingle) and comes back after `hold` s */
  duck(to = 0.3, hold = 2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, g = this.duckNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(to, t, 0.04);
    g.setTargetAtTime(1, t + hold, 0.35);
  }

  /* tense (the final lap): the same song a touch faster with the extra
     layer in, from the next bar line */
  setIntense(on) {
    on = !!on;
    if (on === this.intense) return;
    this.intense = on;
    if (this.loopSeq) this.loopSeq.queueIntense(on, on ? this.loopSeq.c.hypeTempo : 1);
  }

  setPractice(on) { if (this.practice !== !!on) { this.practice = !!on; this._levels(); } }

  /* the game's pause: the music holds where it is and picks up from there */
  pause(on) {
    on = !!on;
    if (on === this.paused) return;
    this.paused = on;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (on) {
      if (this.loopSeq?.on) { this.resumeAt = { name: this.loopSeq.name, beat: this.loopSeq.beatAt(now) }; this.loopSeq.stop(0.05); this.loopSeq = null; }
      for (const s of this.stings) s.stop(0.05);
      this.stings = [];
    } else if (this.resumeAt && this.resumeAt.name === this.want) {
      this.loopSeq = new Sequencer(this.ctx, this.duckNode, this.want);
      this.loopSeq.intense = this.intense;
      this.loopSeq.tempo = this.intense ? this.loopSeq.c.hypeTempo : 1;
      this.loopSeq.start(now + 0.06, this.resumeAt.beat);
      this.resumeAt = null;
    } else { this.resumeAt = null; this._applyWant(); }
    this._levels();
  }

  /* the scheduler (a 25 ms timer, and every frame) */
  pump() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const until = this.ctx.currentTime + LOOKAHEAD;
    if (this.loopSeq) this.loopSeq.pump(until);
    if (this.stings.length) {
      for (const s of this.stings) s.pump(until);
      this.stings = this.stings.filter((s) => s.on || this.ctx.currentTime < s.endAt);
    }
  }
}

/* drop an MP3's encoder delay and any silence before the sound (so a hit is on the frame) */
export function trimLead(ctx, buf, thresh = 0.004) {
  const d = buf.getChannelData(0);
  let i = 0;
  while (i < d.length && Math.abs(d[i]) < thresh) i++;
  i = Math.max(0, i - 24);
  if (i < 32) return buf;
  const out = ctx.createBuffer(buf.numberOfChannels, buf.length - i, buf.sampleRate);
  for (let c = 0; c < buf.numberOfChannels; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(i));
  return out;
}

/* ── captures: the same graph and voices on an OfflineAudioContext ─────────
   music: a track name; sfx: [{ t, id, gain, rate }]; → AudioBuffer      */
export async function renderOffline({ seconds, music = null, musicFrom = 0, intenseAt = null, sfx = [], clips = null, settings = DEFAULTS, sampleRate = 44100, practice = false, stings = [] }) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const E = new AudioEngine({ clips });
  E.settings = { ...settings };
  E.practice = practice;
  E._wire(ctx);
  E.synthFallback = false;
  if (clips) await E._decode();
  if (music) {
    const s = new Sequencer(ctx, E.duckNode, music).start(0.02, musicFrom);
    if (intenseAt !== null) {
      s.pump(intenseAt);
      s.queueIntense(true, s.c.hypeTempo);
    }
    s.pump(seconds);
  }
  for (const st of stings) {
    if (st.duck) { const g = E.duckNode.gain; g.setTargetAtTime(st.duck, st.t, 0.04); g.setTargetAtTime(1, st.t + (st.hold || 2), 0.35); continue; }
    if (st.stopMusic) { const g = E.duckNode.gain; g.setTargetAtTime(0, st.t, 0.4 / 3); continue; }
    const s = new Sequencer(ctx, E.musicBus, st.name).start(st.t);
    s.pump(seconds);
  }
  // SFX in time order (the voice cap counts as it would live)
  for (const x of [...sfx].sort((a, b) => a.t - b.t)) E._playAt(x.id, x.t + (x.delay || 0), x.gain ?? 1, x.rate ?? 1, x.t);
  return ctx.startRendering();
}
