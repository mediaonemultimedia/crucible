/* Four local engine voices. A low motor note and a smaller exhaust
   harmonic rise under throttle, with a pulse that quickens under load. */
import { RACERS } from '../race/roster.js';

export class Hum {
  constructor(audio) { this.audio = audio; this.voices = []; this.on = false; }

  _make(ctx, dest) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'triangle'; o2.type = 'triangle';
    f.type = 'lowpass'; f.frequency.value = 340; f.Q.value = 0.55;
    g.gain.value = 0;
    lfo.frequency.value = 13; lg.gain.value = 0.12;
    const pulse = ctx.createGain();
    pulse.gain.value = 0.82;
    lfo.connect(lg); lg.connect(pulse.gain);
    const g2 = ctx.createGain(); g2.gain.value = 0.24;
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(pulse); pulse.connect(g); g.connect(dest);
    o.start(); o2.start(); lfo.start();
    return { o, o2, f, g, lfo, lg };
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
      const sp = Math.min(1.6, Math.abs(K.fwd) / K.S.top);
      const gridRev = sp < 0.06 ? (K.rev || 0) : 0;
      const throttle = Boolean(K.inp?.gas);
      const boost = K.boostT > 0;
      const load = K.air ? 0.15 : throttle ? 1 : 0.3;
      const f0 = (40 + R.hum.base * 0.19) * (1 + sp * 0.75 + gridRev * 0.45 + (boost ? 0.13 : 0));
      v.o.frequency.setTargetAtTime(f0, t, 0.075);
      v.o2.frequency.setTargetAtTime(f0 * 2, t, 0.075);
      v.f.frequency.setTargetAtTime(155 + sp * 230 + load * 160 + (boost ? 150 : 0), t, 0.085);
      v.lfo.frequency.setTargetAtTime(12 + sp * 24 + gridRev * 9, t, 0.08);
      v.lg.gain.setTargetAtTime(0.09 + load * 0.1 + (K.drift ? 0.03 : 0), t, 0.08);
      const near = K.i === me ? 1 : Math.max(0, 1 - e.d / 45);
      const gain = (K.fish ? 0 : 0.065 + 0.07 * sp + 0.025 * load + (boost ? 0.035 : 0)) * near * (K.i === me ? 1 : 0.6);
      v.g.gain.setTargetAtTime(gain, t, 0.08);
    });
  }
}
