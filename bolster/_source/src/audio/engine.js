/* The game's sound: the sound effects (the owner's cleaned-up clips, inlined
   by the build, plus a few synthesised ones) and the music (audio/songs.js,
   played by audio/sequencer.js). Presentation only — it is told what
   happened (sim events after the tick, screen changes) and never touches
   the sim.

   The graph:
     sfx voices → sfx bus ───────────────────────────┐
     loop  → loop bus → duck → music bus ─┬─ (mode) ─┤→ master (mute) → compressor (limiter) → out
     jingles / stings → sting bus ────────┘          │
   Up to MAX_VOICES effects at once (the oldest gives way); the compressor
   keeps a pile-up from clipping.

   Autoplay: no AudioContext until the first key press or click
   (`unlock`, from the page's own gesture handlers), so the browser never
   warns. Settings (mute, music, SFX) are remembered in localStorage.      */

import { Sequencer } from './sequencer.js';
import { SONGS, songSeconds } from './songs.js';
import { SYNTH } from './synth.js';

/* the cleaned clips (tools/sfx.mjs → assets/audio/game/*.mp3), base64,
   put in by the build (tools/build.mjs `define`); none in the node tests */
// eslint-disable-next-line no-undef
const CLIP_DATA = typeof __PF_SFX__ !== 'undefined' ? __PF_SFX__ : {};

/* an effect id → the buffers it plays (a clip, a synthesised layer, or both) */
export const LAYERS = {
  'hit-light': [{ b: 'clip:hit-light' }, { b: 'smack', g: 0.55 }],
  // the heavy hit's draft was unusable: the light thump an octave-ish down,
  // a synthesised boom and a heavier smack
  'hit-heavy': [{ b: 'clip:hit-light', r: 0.7, g: 0.9 }, { b: 'boom', g: 0.75 }, { b: 'smack', g: 0.45, r: 0.78 }],
  'block': [{ b: 'thud', g: 0.85 }, { b: 'clip:block', g: 0.45 }],
  'whoosh': [{ b: 'clip:whoosh' }],
  'grab': [{ b: 'grab' }],
  'knockdown': [{ b: 'clip:knockdown' }, { b: 'boom', g: 0.35, r: 0.8 }],
  'jump': [{ b: 'clip:jump' }],
  'land': [{ b: 'clip:land' }],
  'feather-burst': [{ b: 'clip:feather-burst' }],
  'crowd-ooh': [{ b: 'clip:crowd-ooh' }],
  'ui-tick': [{ b: 'ui-tick' }],
  'ui-confirm': [{ b: 'ui-confirm' }],
};

/* each effect's level in the mix (hits punchy, bodies and air under them, UI quiet) */
export const LEVEL = {
  'hit-light': 0.8, 'hit-heavy': 1, 'block': 0.7, 'whoosh': 0.55, 'grab': 0.75, 'knockdown': 0.85,
  'jump': 0.45, 'land': 0.5, 'feather-burst': 0.7, 'crowd-ooh': 0.55, 'ui-tick': 0.28, 'ui-confirm': 0.38,
};

export const MAX_VOICES = 14;
const SAME_MAX = 4;
const STORE_KEY = 'pillowfight.audio.v1';
export const DEFAULTS = { mute: false, music: 0.6, sfx: 0.85 };

export function loadSettings(ls) {
  try {
    const s = JSON.parse(ls?.getItem(STORE_KEY) || 'null');
    if (!s || typeof s !== 'object') return { ...DEFAULTS };
    const n = (v, d) => (Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : d);
    return { mute: !!s.mute, music: n(s.music, DEFAULTS.music), sfx: n(s.sfx, DEFAULTS.sfx) };
  } catch { return { ...DEFAULTS }; }
}
export function saveSettings(ls, s) { try { ls?.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* private mode: the session keeps them */ } }

function b64(s) {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

export class AudioEngine {
  /* ctx: an existing context (an OfflineAudioContext for renders); store: localStorage or null */
  constructor({ ctx = null, store = null, offline = false } = {}) {
    this.store = store;
    this.settings = loadSettings(store);
    this.ctx = null;
    this.offline = offline;
    this.buffers = {};
    this.onset = {};
    this.active = [];
    this.clock = null;
    this.want = null;             // the loop that should be playing: { name, level }
    this.modeLevel = 1;
    this.listeners = [];
    if (ctx) this._init(ctx);
  }

  get ready() { return !!this.ctx; }

  /* the context's clock (renders set `clock` to the game's own time) */
  now() { return this.clock ?? this.ctx.currentTime; }

  /* the first gesture: make (or wake) the context */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume().catch(() => {}); return; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    // (only inside a real user activation: no autoplay warning in the console)
    if (navigator.userActivation && !navigator.userActivation.isActive) return;
    let ctx;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { return; }
    this._init(ctx);
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    this.timer = setInterval(() => this.pump(), 30);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
  }

  _init(ctx) {
    this.ctx = ctx;
    const g = (v = 1) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.comp = ctx.createDynamicsCompressor();
    // a limiter more than a compressor: only the loud pile-ups are touched
    this.comp.threshold.value = -9; this.comp.knee.value = 4; this.comp.ratio.value = 16;
    this.comp.attack.value = 0.002; this.comp.release.value = 0.12;
    this.trim = g(0.92);
    this.master = g(this.settings.mute ? 0 : 1);
    this.sfxBus = g(this.settings.sfx);
    this.musicBus = g(this.settings.music * this.modeLevel);
    this.duckBus = g(1);
    this.loopBus = g(1);
    this.stingBus = g(1);
    this.loopBus.connect(this.duckBus).connect(this.musicBus);
    this.stingBus.connect(this.musicBus);
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.master.connect(this.comp).connect(this.trim).connect(ctx.destination);
    const now = () => this.now();
    this.loop = new Sequencer(ctx, this.loopBus, now);
    this.stinger = new Sequencer(ctx, this.stingBus, now);
    for (const [id, fn] of Object.entries(SYNTH)) {
      const x = fn(ctx.sampleRate), buf = ctx.createBuffer(1, x.length, ctx.sampleRate);
      buf.getChannelData(0).set(x);
      this.buffers[id] = buf;
      this.onset[id] = 0;
    }
    this.decoded = this._decode();
    if (this.want) { const w = this.want; this.want = null; this.music(w.name, w); }
  }

  async _decode() {
    const jobs = Object.entries(CLIP_DATA).map(async ([id, data]) => {
      try {
        const buf = await new Promise((ok, no) => {
          const p = this.ctx.decodeAudioData(b64(data), ok, no);
          if (p && p.then) p.then(ok, no);
        });
        // an MP3's encoder delay: start at the first sound
        const d = buf.getChannelData(0);
        let i = 0;
        while (i < d.length && Math.abs(d[i]) < 0.003) i++;
        this.onset[`clip:${id}`] = Math.max(0, (i - buf.sampleRate * 0.001) / buf.sampleRate);
        this.buffers[`clip:${id}`] = buf;
      } catch { /* that slot falls back to its other layers */ }
    });
    await Promise.all(jobs);
  }

  /* ── settings ─────────────────────────────────────────────────────────── */
  set(key, value) {
    this.settings[key] = key === 'mute' ? !!value : Math.max(0, Math.min(1, +value));
    saveSettings(this.store, this.settings);
    this._levels();
    for (const fn of this.listeners) fn(this.settings);
  }
  toggleMute() { this.set('mute', !this.settings.mute); return this.settings.mute; }
  onChange(fn) { this.listeners.push(fn); }

  /* practice: the music sits low */
  setModeLevel(k) { this.modeLevel = k; this._levels(); }

  _levels() {
    if (!this.ctx) return;
    const t = this.now(), S = this.settings;
    this.master.gain.setTargetAtTime(S.mute ? 0 : 1, t, 0.02);
    this.sfxBus.gain.setTargetAtTime(S.sfx, t, 0.02);
    this.musicBus.gain.setTargetAtTime(S.music * this.modeLevel * (this.paused ? 0 : 1), t, 0.03);
  }

  /* ── effects ──────────────────────────────────────────────────────────── */
  /* cue: { id, gain, rate, pan, delay }; at: context time (default now) */
  play(cue, at = null) {
    const c = this.ctx;
    if (!c || (this.settings.mute && !this.offline) || (this.paused && !cue.id.startsWith('ui-'))) return 0;
    const layers = LAYERS[cue.id];
    if (!layers) return 0;
    const t = (at ?? this.now()) + (cue.delay || 0);
    this._reap(t);
    const same = this.active.filter((v) => v.id === cue.id);
    if (same.length >= SAME_MAX) this._kill(same[0], t);
    while (this.active.length >= MAX_VOICES) this._kill(this.active[0], t);
    let n = 0;
    const g = c.createGain();
    g.gain.value = (cue.gain ?? 1) * (LEVEL[cue.id] ?? 1);
    let out = g;
    if (cue.pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = cue.pan; g.connect(p); out = p; }
    out.connect(this.sfxBus);
    let end = t;
    const srcs = [];
    for (const L of layers) {
      const buf = this.buffers[L.b];
      if (!buf) continue;
      const s = c.createBufferSource(), lg = c.createGain();
      s.buffer = buf;
      const rate = (cue.rate ?? 1) * (L.r ?? 1);
      s.playbackRate.value = rate;
      lg.gain.value = L.g ?? 1;
      s.connect(lg).connect(g);
      const off = this.onset[L.b] || 0;
      s.start(t + (L.d || 0), off);
      end = Math.max(end, t + (L.d || 0) + (buf.duration - off) / rate);
      srcs.push(s);
      n++;
    }
    if (!n) { out.disconnect(); return 0; }
    const v = { id: cue.id, srcs, g, end, out };
    srcs[srcs.length - 1].onended = () => { out.disconnect(); };
    this.active.push(v);
    return n;
  }

  cues(list, at = null) { for (const c of list) this.play(c, at); }

  _reap(t) { this.active = this.active.filter((v) => v.end > t); }
  _kill(v, t) {
    v.g.gain.setTargetAtTime(0, t, 0.008);
    for (const s of v.srcs) { try { s.stop(t + 0.05); } catch { /* already */ } }
    this.active.splice(this.active.indexOf(v), 1);
  }

  /* ── music ────────────────────────────────────────────────────────────── */
  /* the loop for this screen: 'menu', 'fight' or null (silence) */
  music(name, { level = 1, at = null } = {}) {
    this.want = name ? { name, level } : null;
    this.setModeLevel(level);
    if (!this.ctx) return;
    if (!name) { this._fadeLoop(); return; }
    if (this.loopName === name && this.loop.playing) return;
    if (this.loopName === name && this.loop.held) return;
    this._fadeLoop(true);
    this.loopName = name;
    this.loop.tempo = 1; this.loop.boost = false;
    const t = this.now();
    this.loopBus.gain.cancelScheduledValues(t);
    this.loopBus.gain.setValueAtTime(1, t + 0.05);
    this.loop.start(SONGS[name], { at: Math.max(t + 0.06, at ?? 0) });
    this.pump();
  }

  _fadeLoop(now = false) {
    if (!this.ctx) return;
    const t = this.now();
    this.loop.stop();
    this.loopName = null;
    this.loopBus.gain.cancelScheduledValues(t);
    this.loopBus.gain.setValueAtTime(this.loopBus.gain.value, t);
    this.loopBus.gain.linearRampToValueAtTime(0, t + (now ? 0.04 : 0.25));
  }

  /* a sting or jingle over the loop (the loop ducked under it); `then`:
     the loop to go to once it's done ('menu', or null to stay silent) */
  sting(name, { then, stopLoop = false } = {}) {
    if (!this.ctx || this.paused) return;
    const t = this.now();
    if (stopLoop) this.music(null);
    this._duck('sting', 0.2);
    this.stinger.start(SONGS[name], {
      at: t + 0.03, loop: false,
      onEnd: (end) => {
        this._duck('sting', 1);
        if (then !== undefined) { if (then) this.music(then, { level: this.modeLevel, at: end }); else this.music(null); }
      },
    });
    this.pump();
  }

  /* under the K.O. (and through the stings) the loop ducks */
  duck(on) { this._duck('ko', on ? 0.25 : 1); }
  _duck(why, v) {
    (this.ducks || (this.ducks = {}))[why] = v;
    if (!this.ctx) return;
    const level = Math.min(...Object.values(this.ducks));
    this.duckBus.gain.setTargetAtTime(level, this.now(), level < 1 ? 0.04 : 0.25);
  }

  /* the last 15 s, or someone nearly out of stuffing: a touch faster, a layer more */
  intense(on) {
    if (!this.ctx || this.loopName !== 'fight' || this.loop.boost === on) return;
    this.loop.boost = on;
    this.loop.tempo = on ? 1.07 : 1;
  }

  /* the pause: the music holds where it is; effects stop */
  pause(on) {
    if (this.paused === on) return;
    this.paused = on;
    if (!this.ctx) return;
    if (on) { this.loop.hold(); this.stinger.hold(); for (const v of [...this.active]) this._kill(v, this.now()); }
    else { this.loop.resume(); this.stinger.resume(); }
    this._levels();
  }

  /* reset between fights: no ducks, normal tempo */
  calm() { this.ducks = {}; if (this.ctx) { this.duckBus.gain.setTargetAtTime(1, this.now(), 0.1); this.stinger.stop(); } }

  pump() {
    if (!this.ctx || (this.offline && this.clock == null)) return;
    const until = this.now() + 0.15;
    this.loop.pump(until);
    this.stinger.pump(until);
  }

  /* (renders) schedule a whole piece from t on an offline context */
  renderSong(name, t0 = 0, { boost = false, tempo = 1, seconds = null } = {}) {
    const seq = name === 'fight' || name === 'menu' ? this.loop : this.stinger;
    seq.boost = boost; seq.tempo = tempo;
    seq.start(SONGS[name], { at: t0, loop: name === 'fight' || name === 'menu' });
    seq.pump(t0 + (seconds ?? songSeconds(SONGS[name], tempo)));
    seq.stop();
  }
}
