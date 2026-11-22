/* The CPU racers: they follow the track's racing line (each with its own
   slow sway across it, so the pack spreads out), drift the long bends —
   the hard ones hold the slide to the mint tier — dodge slicks, and use
   their items sensibly: missiles at someone lined up ahead, slicks when
   someone's on their tail, espresso on a straight, the alarm clock and the
   handcuffs straight away. A gentle rubber band keeps the pack near the
   human (never more than a few per cent of top speed). Deterministic: each
   CPU draws from its own seeded PRNG.                                   */

import { rightX, rightZ } from './track.js';
import { noInput } from './sim.js';
import { makeRng } from '../sim/rng.js';

export const LEVELS = {
  easy: { top: 0.86, look: 1.0, drift: 0.35, tier: 1, item: 0.012, noise: 0.22, band: [0.09, 0.1] },
  normal: { top: 0.94, look: 1.0, drift: 0.75, tier: 2, item: 0.025, noise: 0.12, band: [0.07, 0.06] },
  hard: { top: 0.995, look: 1.0, drift: 1.0, tier: 3, item: 0.05, noise: 0.05, band: [0.05, 0.03] },
};

export class CPU {
  constructor(race, i, level = 'normal', seed = 1) {
    this.race = race; this.i = i;
    this.level = LEVELS[level] ? level : 'normal';
    this.L = LEVELS[this.level];
    this.rng = makeRng((seed * 7919 + i * 104729) >>> 0);
    this.sway = this.rng.int(1000) / 1000 * Math.PI * 2;
    this.swayF = 0.004 + this.rng.int(1000) / 1000 * 0.004;
    this.bias = (this.rng.int(1000) / 1000 - 0.5) * 3;
    this.holdItem = 0;
    this.revT = 0;
    this.backT = 0;
  }

  think() {
    const R = this.race, T = R.T, N = T.N, K = R.karts[this.i], L = this.L;
    const I = noInput();
    if (K.fish) return I;
    // the rubber band (relative to the human, or the middle of the pack in CPU-only races)
    const ref = R.humans.length ? R.karts[R.humans[0]] : R.karts[R.order[Math.floor(R.order.length / 2)]];
    let band = 0;
    if (ref && ref !== K) {
      const gap = (ref.kc - K.kc) / 220;
      band = gap > 0 ? Math.min(1, gap) * L.band[0] : -Math.min(1, -gap) * L.band[1];
    }
    K.topMul = L.top * (1 + band) * (K.fin ? 0.85 : 1);

    if (R.phase === 'count') {
      // rev for the jump start (the hard ones time it)
      const left = 220 - R.tick;
      I.gas = this.level === 'hard' ? left < 40 : this.level === 'normal' ? left < 25 : false;
      return I;
    }
    // stuck against something: back up a moment
    if (this.backT > 0) { this.backT--; I.brake = true; I.steer = this.backSteer; return I; }
    if (Math.abs(K.fwd) < 1.5 && R.phase === 'race' && K.spinT <= 0 && !K.air) { this.slow = (this.slow || 0) + 1; if (this.slow > 70) { this.slow = 0; this.backT = 40; this.backSteer = K.d > 0 ? 1 : -1; } }
    else this.slow = 0;

    const sp = Math.max(8, K.fwd);
    const la = Math.round(5 + sp * 0.42 * L.look);
    const t = (K.k + la) % N;
    this.sway += this.swayF;
    const careful = T.drop[t] || T.drop[K.k];
    let want = careful ? T.line[t] * 0.4 + this.bias * 0.3 : T.line[t] + this.bias + Math.sin(this.sway) * T.w[t] * 0.28;
    // dodge slicks and posts near the line ahead
    for (const H of R.hazards) {
      const dk = ((H.k - K.k + N) % N);
      if (dk > 2 && dk < 26) {
        const hd = (H.x - T.x[H.k]) * rightX(T, H.k) + (H.z - T.z[H.k]) * rightZ(T, H.k);
        if (Math.abs(hd - want) < 4) want = hd + (want >= hd ? 4.5 : -4.5);
      }
    }
    for (const P of R.pods.length ? [...T.def.posts, ...R.pods.map((p) => ({ x: p.x, z: p.z, r: p.r + 1.2 }))] : T.def.posts) {
      const dx = P.x - K.x, dz = P.z - K.z, dist = Math.hypot(dx, dz);
      if (dist < 16 && dist > 0.1) {
        const pk = t; const pd = (P.x - T.x[pk]) * rightX(T, pk) + (P.z - T.z[pk]) * rightZ(T, pk);
        if (Math.abs(pd - want) < P.r + 2.6) want = pd + (want >= pd ? P.r + 2.8 : -(P.r + 2.8));
      }
    }
    const lim = T.w[t] - (careful ? 3 : 2);
    want = Math.max(-lim, Math.min(lim, want));
    let tx = T.x[t] + rightX(T, t) * want, tz = T.z[t] + rightZ(T, t) * want;
    // the shortcut: decided once a lap on the way in (the bold ones take it more)
    const C = T.cut;
    let onCut = false;
    if (C) {
      const toA = (C.kA - K.k + N) % N;
      if (toA > 80 && toA < 200) this.cutPlan = null;
      if (this.cutPlan === null || this.cutPlan === undefined) if (toA < 70) this.cutPlan = this.rng.int(1000) < { easy: 250, normal: 500, hard: 750 }[this.level];
      const rx = K.x - C.ax, rz = K.z - C.az, s0 = rx * C.ux + rz * C.uz, l0 = -rx * C.uz + rz * C.ux;
      if (this.cutPlan && (K.cut || toA < 80 || (s0 > -10 && s0 < C.m0 && Math.abs(l0) < 30))) {
        const s1 = Math.max(0, s0) + Math.max(6, la);
        if (s1 < C.len + 4) { tx = C.ax + C.ux * Math.min(C.len, s1); tz = C.az + C.uz * Math.min(C.len, s1); onCut = true; }
      }
    }
    const hT = Math.atan2(tx - K.x, tz - K.z);
    const diff = Math.atan2(Math.sin(hT - K.yaw), Math.cos(hT - K.yaw));
    let steer = -diff * 2.6 + (this.rng.int(1000) / 1000 - 0.5) * L.noise;
    steer = Math.max(-1, Math.min(1, steer));
    I.steer = steer;
    I.gas = true;
    if (Math.abs(diff) > 1.2 && K.fwd > 14) { I.gas = false; I.brake = Math.abs(diff) > 1.6; }

    // the drift: a long bend ahead, and speed to carry
    let bend = 0;
    for (let q = 4; q < 30; q += 2) bend += T.curv[(K.k + q) % N];
    bend /= 13;
    const wantDrift = Math.abs(bend) > 0.016 && K.fwd > 16 && !K.air && !careful && !onCut;
    if (onCut) { I.drift = false; } else if (K.drift) {
      // hold it while the bend lasts, to this CPU's tier; let go on the straight
      I.drift = Math.abs(bend) > 0.012 && K.tier < L.tier + (L.tier === 3 ? 0 : 0) || (K.tier < 1 && Math.abs(bend) > 0.008);
      if (K.tier >= L.tier && Math.abs(bend) < 0.02) I.drift = false;
      // the hard ones wiggle the stick for a faster charge
      if (this.level === 'hard' && I.drift && (R.tick % 14) < 3) I.steer = Math.max(-1, Math.min(1, I.steer - K.drift * 1.2));
    } else if (wantDrift && this.rng.int(1000) < L.drift * 1000 * 0.2) {
      I.drift = true;
      if (Math.abs(I.steer) < 0.3) I.steer = Math.sign(bend) * -0.6 || 0.6;
    }

    // items
    if (K.item && !K.roulette) {
      this.holdItem++;
      const chance = L.item;
      const it = K.item;
      let use = false;
      if (it === 'alarm' || it === 'cuffs') use = this.holdItem > 20;
      else if (it === 'espresso') use = Math.abs(bend) < 0.01 || this.holdItem > 400;
      else if (it === 'missile' || it === 'case') {
        for (const O of R.karts) {
          if (O === K) continue;
          const dx = O.x - K.x, dz = O.z - K.z, dist = Math.hypot(dx, dz);
          if (dist < 45 && (dx * Math.sin(K.yaw) + dz * Math.cos(K.yaw)) / (dist || 1) > 0.93) { use = true; break; }
        }
        if (this.holdItem > 600) use = true;
      } else if (it === 'slick') {
        for (const O of R.karts) {
          if (O === K) continue;
          const dk = ((K.kc - O.kc));
          if (dk > 3 && dk < 22) { use = true; break; }
        }
        if (this.holdItem > 500) use = true;
      }
      if (use && this.rng.int(1000) < chance * 1000 * 4 + 40) { I.item = true; this.holdItem = 0; }
    }
    // a trick off every ramp: the CPUs love to show off too
    if (K.air && !K.trick && K.airT > 0.12 && this.rng.int(1000) < (this.level === 'easy' ? 30 : 120)) I.taunt = true;
    return I;
  }
}
