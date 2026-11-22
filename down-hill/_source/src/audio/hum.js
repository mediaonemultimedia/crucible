/* The engines: each kart its own synthesised hum (its racer's waveform and
   base pitch from race/roster.js), rising with speed, a whine on boost, a
   rattle on fluff. Four voices, given to the player and the three nearest
   karts each frame; gains by distance. On the engine's SFX bus.          */

import { RACERS } from '../race/roster.js';

export class Hum {
  constructor(audio) { this.audio = audio; this.voices = []; this.on = false; }

  _make(ctx, dest) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = 7;
    f.type = 'lowpass'; f.frequency.value = 600; f.Q.value = 3;
    g.gain.value = 0;
    lfo.frequency.value = 18; lg.gain.value = 4;
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    const g2 = ctx.createGain(); g2.gain.value = 0.35;
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(dest);
    o.start(); o2.start(); lfo.start();
    return { o, o2, f, g, lfo, who: -1 };
  }

  start() {
    const A = this.audio;
    if (!A.ctx || this.on) return;
    this.on = true;
    for (let i = 0; i < 4; i++) this.voices.push(this._make(A.ctx, A.sfxBus));
  }

  stop() {
    for (const v of this.voices) { try { v.g.gain.setTargetAtTime(0, v.g.context.currentTime, 0.05); setTimeout(() => { try { v.o.stop(); v.o2.stop(); v.lfo.stop(); } catch { /* gone */ } }, 300); } catch { /* gone */ } }
    this.voices = []; this.on = false;
  }

  update(karts, me, cam) {
    if (!this.on) { if (this.audio.ready) this.start(); else return; }
    const ctx = this.audio.ctx, t = ctx.currentTime;
    const order = karts.map((K) => ({ K, d: Math.hypot(K.x - cam.x, K.z - cam.z, K.y - cam.y) })).sort((a, b) => (a.K.i === me ? -1 : b.K.i === me ? 1 : a.d - b.d)).slice(0, this.voices.length);
    this.voices.forEach((v, j) => {
      const e = order[j];
      if (!e) { v.g.gain.setTargetAtTime(0, t, 0.05); return; }
      const K = e.K, R = RACERS[K.id];
      if (v.who !== K.i) { v.who = K.i; v.o.type = R.hum.wave; }
      const sp = Math.min(1.5, Math.abs(K.fwd) / K.S.top);
      const f0 = R.hum.base * (1 + sp * 1.7 + (K.boostT > 0 ? 0.35 : 0)) * (K.air ? 1.12 : 1);
      v.o.frequency.setTargetAtTime(f0, t, 0.06); v.o2.frequency.setTargetAtTime(f0 * 2, t, 0.06);
      v.f.frequency.setTargetAtTime(380 + sp * 1300 + (K.boostT > 0 ? 900 : 0), t, 0.08);
      v.lfo.frequency.setTargetAtTime(K.surf !== 'track' ? 32 : 14 + sp * 10, t, 0.1);
      const near = K.i === me ? 1 : Math.max(0, 1 - e.d / 45);
      const gain = (K.fish ? 0 : 0.05 + 0.07 * sp) * near * (K.i === me ? 1 : 0.6);
      v.g.gain.setTargetAtTime(gain, t, 0.08);
    });
  }
}
