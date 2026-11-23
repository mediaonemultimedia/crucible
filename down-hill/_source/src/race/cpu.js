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

/* each level at full strength (stage 4's CPUs; Champion is hard plus a bit) */
export const LEVELS = {
  easy: { top: 0.86, look: 1.0, drift: 0.35, tier: 1, item: 0.012, noise: 0.22, band: [0.09, 0.1], err: 0 },
  normal: { top: 0.94, look: 1.0, drift: 0.75, tier: 2, item: 0.025, noise: 0.12, band: [0.07, 0.06], err: 0 },
  hard: { top: 0.995, look: 1.0, drift: 1.0, tier: 3, item: 0.05, noise: 0.05, band: [0.05, 0.03], err: 0 },
  champion: { top: 1.012, look: 1.0, drift: 1.0, tier: 3, item: 0.07, noise: 0.035, band: [0.05, 0.02], err: 0 },
};
export const LEVEL_NAMES = ['easy', 'normal', 'hard', 'champion'];

/* Stage 5's difficulty curve. Strength 0 is the gentle version of a level (a
   single race, and the Pillow Cup's first race): a lower top speed, more
   late-braking mistakes into the tight corners, slower and sloppier item
   use, a milder catch-up band. 1 is the level at full strength (the cup's
   third race). Champion never eases off. */
export const GENTLE = { top: 0.955, drift: 0.6, item: 0.45, noise: 1.5, band: 0.5, err: 0.4 };
export function levelAt(level, strength = 1) {
  const F = LEVELS[level] || LEVELS.normal;
  const s = level === 'champion' ? 1 : Math.max(0, Math.min(1, strength));
  const l = (g, f) => g + (f - g) * s;
  return {
    ...F,
    top: l(F.top * GENTLE.top, F.top),
    drift: l(F.drift * GENTLE.drift, F.drift),
    item: l(F.item * GENTLE.item, F.item),
    noise: l(F.noise * GENTLE.noise + 0.03, F.noise),
    band: [l(F.band[0] * GENTLE.band, F.band[0]), F.band[1]],
    err: l(GENTLE.err, F.err),
    slow: l(1, 0),                 // 1: item use waits a beat longer
  };
}
/* the strength of race n (0-based) of the cup; a single race is 0 */
export const cupStrength = (n) => [0, 0.5, 1][Math.max(0, Math.min(2, n))];

/* the "average driver": a stand-in for a casual human in the tuning runs
   (tools / tests): full kart speed like any human, but no drift, wandering
   lines, slow hands on the stick, late into the corners, items whenever */
export const AVERAGE = { top: 1, look: 0.75, drift: 0, tier: 0, item: 0.01, noise: 0.6, band: [0, 0], err: 0, clip: 0.5, lift: [0.018, 18], human: 1 };

export class CPU {
  constructor(race, i, level = 'normal', seed = 1, strength = 1) {
    this.race = race; this.i = i;
    if (typeof level === 'object') { this.level = 'average'; this.L = level; }
    else {
      this.level = LEVELS[level] ? level : 'normal';
      this.L = levelAt(this.level, strength);
    }
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
    if (L.human) K.topMul = 1;

    if (R.phase === 'count') {
      // rev for the jump start (the hard ones time it)
      const left = 220 - R.tick;
      I.gas = this.level === 'hard' || this.level === 'champion' ? left < 40 : this.level === 'normal' ? left < 25 : false;
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
    const careful = T.drop[t] || T.drop[K.k] || T.rail[t];
    let want = careful ? T.line[t] * 0.4 + this.bias * 0.3 : T.line[t] + this.bias + Math.sin(this.sway) * T.w[t] * (L.human ? 0.5 : 0.28);
    if (L.human) want = want * 0.5 + Math.sin(this.sway * 2.3 + 1) * T.w[t] * 0.2;     // wanders rather than hugging the line
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
    // (a casual human clips the inside of the tight bends, into the fluff)
    if (L.human && !careful) { let b2 = 0; for (let q = 2; q < 16; q += 2) b2 += T.curv[(t + q) % N]; if (Math.abs(b2 / 7) > 0.025) want -= Math.sign(b2) * T.w[t] * L.clip; }
    const lim = T.w[t] - (careful ? 3 : L.human ? -1.5 : 2);
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
    // slow hands: a casual thumb on the stick lags and overshoots a little
    if (L.human) { this.st = (this.st || 0) + (steer - (this.st || 0)) * 0.22; steer = Math.max(-1, Math.min(1, this.st * 1.1)); }
    I.steer = steer;
    I.gas = true;
    if (Math.abs(diff) > 1.2 && K.fwd > 14) { I.gas = false; I.brake = Math.abs(diff) > 1.6; }

    // the drift: a long bend ahead, and speed to carry
    let bend = 0;
    for (let q = 4; q < 30; q += 2) bend += T.curv[(K.k + q) % N];
    bend /= 13;
    // a tight corner coming at speed, or already out at the wall on its outside: lift (the rails scrape)
    const outside = K.d * Math.sign(-bend || 1) > T.w[K.k] - 0.5;
    // (a braking mistake: now and then a gentle CPU — or a casual human — goes into it too hot)
    if (Math.abs(bend) > 0.03 && !this.inBend) { this.inBend = 1; this.late = this.rng.int(1000) < L.err * 1000; }
    else if (Math.abs(bend) < 0.015) this.inBend = 0;
    if (!onCut && !K.drift && K.fwd > 21 && !this.late && (Math.abs(bend) > 0.034 || (outside && Math.abs(bend) > 0.014))) I.gas = false;
    if (this.late && this.inBend && Math.abs(bend) > 0.03) I.steer *= 0.72;
    // a casual human lifts early for the bends (no drift to carry the speed)
    if (L.lift && Math.abs(bend) > L.lift[0] && K.fwd > L.lift[1]) I.gas = false;
    const wantDrift = Math.abs(bend) > 0.016 && K.fwd > 16 && !K.air && !careful && !onCut;
    if (onCut) { I.drift = false; } else if (K.wallT > 0.1) {
      // against a rail or a wall: let go of any slide and ease off it
      I.drift = false;
      if (!K.cut && Math.abs(K.d) > T.w[K.k]) I.steer = Math.max(-1, Math.min(1, I.steer + (K.d > 0 ? -0.5 : 0.5)));
    } else if (K.drift) {
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
      const beat = 20 + (L.slow || 0) * 50 + (L.human ? 90 : 0);
      if (it === 'alarm' || it === 'cuffs' || it === 'sugar' || it === 'wash' || it === 'plane') use = this.holdItem > beat;
      else if (it === 'spring') use = K.lock >= 0 && this.holdItem > beat;
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
    if (K.air && !K.trick && K.airT > 0.12 && this.rng.int(1000) < (L.human ? 4 : this.level === 'easy' ? 30 : 120)) I.taunt = true;
    return I;
  }
}
