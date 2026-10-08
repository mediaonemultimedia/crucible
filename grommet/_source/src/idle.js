/* Idle life: the toy fidgets on its own. (Copied from Flock; the octopus's
   arm curls are gone — an athlete's arms belong to its sport.)

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

    // arms are the sport's; the rest fidget on their own rhythms
    for (const arm of rig.arms) if (arm.kind !== 'arm') this._other(arm, t, a, hh);
  }

  /* the others: a tail that wags now and then, ears that flick, a long neck
     that looks about. Pushed sideways relative to the part's own cloud.   */
  _other(ch, t, a, hh) {
    const { x } = this.body;
    const idx = ch.idx, N = idx.length;
    const k = ch.k, TAU = Math.PI * 2;
    let f = 0;
    if (ch.kind === 'tail' && ch.swish) return this._swish(ch, t, a, hh);
    if (ch.kind === 'tail') {
      // bursts of wagging: a fast wag under a slow on/off swell
      const swell = Math.max(0, Math.sin(TAU * 0.09 * t + k)) ** 2;
      f = Math.sin(TAU * 1.4 * t) * swell * 300 * a;
    } else if (ch.kind === 'ear') {
      // a flick every few seconds, one ear at a time
      const ph = (t * 0.23 + k * 0.37) % 1;
      f = ph < 0.06 ? Math.sin(ph / 0.06 * Math.PI) * 400 * a : 0;
    } else if (ch.kind === 'neck') {
      f = (0.7 * Math.sin(TAU * 0.11 * t) + 0.3 * Math.sin(TAU * 0.047 * t + 1.3)) * 900 * a;
    } else return;
    if (!f) return;
    // sideways: perpendicular to the chain and to the cloud's up
    const r0 = idx[0], r1 = idx[N - 1];
    const dx = x[r1 * 3] - x[r0 * 3], dy = x[r1 * 3 + 1] - x[r0 * 3 + 1], dz = x[r1 * 3 + 2] - x[r0 * 3 + 2];
    const R = this.body.cloudR[ch.cloud];
    // side = chain direction × the cloud's forward (z); falls back to its x
    let sx = dy * R[8] - dz * R[5], sy = dz * R[2] - dx * R[8], sz = dx * R[5] - dy * R[2];
    let sl = Math.hypot(sx, sy, sz);
    if (sl < 1e-4) { sx = R[0]; sy = R[3]; sz = R[6]; sl = 1; }
    sx /= sl; sy /= sl; sz /= sl;
    for (let j = 1; j < N; j++) {
      const i = idx[j];
      const w = j / (N - 1);
      x[i * 3] += sx * f * w * hh;
      x[i * 3 + 1] += sy * f * w * hh;
      x[i * 3 + 2] += sz * f * w * hh;
    }
  }

  /* a big brush of a tail lying on the floor sweeps along it rather than
     flapping: each point is pushed sideways in the floor plane, across its
     own run of the chain, with the tip lifting a little as it goes        */
  _swish(ch, t, a, hh) {
    const { x } = this.body;
    const idx = ch.idx, N = idx.length, TAU = Math.PI * 2;
    const swell = 0.45 + 0.55 * Math.max(0, Math.sin(TAU * 0.07 * t + ch.k)) ** 2;
    const f = (0.75 * Math.sin(TAU * 0.42 * t) + 0.25 * Math.sin(TAU * 0.9 * t + 0.7)) * swell * 260 * a * (1 + (this.excite || 0) * 1.6);
    for (let j = 2; j < N; j++) {
      const i = idx[j], ip = idx[j - 1];
      const tx = x[i * 3] - x[ip * 3], tz = x[i * 3 + 2] - x[ip * 3 + 2];
      const tl = Math.hypot(tx, tz) || 1;
      const w = Math.pow(j / (N - 1), 1.4);
      x[i * 3] += (-tz / tl) * f * w * hh;
      x[i * 3 + 1] += Math.abs(f) * 0.25 * w * w * hh;
      x[i * 3 + 2] += (tx / tl) * f * w * hh;
    }
  }
}
