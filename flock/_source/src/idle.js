/* Idle life: the octopus fidgets on its own.

   Not keyframed — small, slow, out-of-phase forces feed the same soft body
   everything else does, so the arms curl, lift and sway like a plush being
   breathed on, and still squash and collide properly. `amount` 0 adds
   nothing at all.                                                          */

export class Idle {
  constructor(body) {
    this.body = body;
    this.amount = 0.5;
    this.t = 0;
    body.hooks.push((h) => this._apply(h));
  }

  _apply(h) {
    this.t += h;
    const a = this.amount;
    if (a <= 0) return;
    const { x, rig } = this.body;
    const t = this.t, TAU = Math.PI * 2;
    const c = this.body.head.c;
    const hh = h * h;

    // breathing: a slow swell of the head cloud
    const breath = Math.sin(TAU * t / 3.6) * 160 * a;
    for (const i of rig.head) {
      x[i * 3] += (x[i * 3] - c[0]) * breath * hh;
      x[i * 3 + 1] += (x[i * 3 + 1] - c[1]) * breath * hh;
      x[i * 3 + 2] += (x[i * 3 + 2] - c[2]) * breath * hh;
    }

    // arms: each curls its tip up and drifts sideways on its own slow rhythm
    for (const arm of rig.arms) {
      const k = arm.k, idx = arm.idx, N = idx.length;
      const curl = 0.6 * Math.sin(TAU * (0.16 + 0.021 * k) * t + k * 2.39)
                 + 0.4 * Math.sin(TAU * 0.067 * t + k * 1.7);
      const sway = Math.sin(TAU * (0.1 + 0.017 * k) * t + k * 3.1);
      const up = (0.45 + 0.55 * curl) * 680 * a;
      const side = sway * 320 * a;
      for (let j = 5; j < N; j++) {
        const i = idx[j];
        const w = (j - 4) / (N - 5);
        const rx = x[i * 3] - c[0], rz = x[i * 3 + 2] - c[2];
        const rl = Math.hypot(rx, rz) || 1;
        x[i * 3] += (-rz / rl) * side * w * hh;
        x[i * 3 + 1] += up * w * w * hh;
        x[i * 3 + 2] += (rx / rl) * side * w * hh;
      }
    }
  }
}
