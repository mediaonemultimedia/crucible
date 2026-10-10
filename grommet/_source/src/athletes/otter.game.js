/* Juggling, for the otter.

   You toss him shells and pebbles, one at a time. He catches each in a paw
   and keeps it going: a cascade, paw to paw. Every paw is an arm chain
   re-posed toward where it needs to be (the sewn arm turned about its
   shoulder) and pulled there by a force on its last points; the things he
   juggles are little rigid balls under gravity:

     catching   a paw goes to where the incoming thing will come down and
                closes on it when it's close enough (it can be late, or
                short: a stuffed arm lags its pose)
     carrying   held, it rides the paw: down and in, a scoop
     throwing   at the bottom of the scoop the paw comes up and lets go —
                the throw aimed to come down where the other paw waits, a
                beat later. A paw that's holding when the next one is
                about to land throws early to free itself
     too much   more than he can keep up (five at once), or a toss out of
                his reach, and it all comes tumbling down: everything lets
                go, bounces off him (two-way collision with the plush) and
                rolls about the mat. He looks at the floor, a bit sheepish.

   He faces +z; his right is −x.                                          */

import { Athlete, clamp, spring, ease, TAU } from './game.js';
import { Ball } from '../ball.js';
import { OTTER } from './otter.rig.js';

export const ITEM_G = 16;
export const THROWER = [0.2, 1.8, 8.5];
export const MAX_JUGGLE = 4;
const TF = 0.84;            // a throw's flight, paw to paw
const DWELL = 0.3;          // how long a paw carries before it throws
const CATCH_R = 0.36;       // a paw closes on something this close
export const PEBBLES = {
  shell: { r: 0.13, mass: 0.2 },
  pebble: { r: 0.11, mass: 0.25 },
};

/* rest-frame points, per side s (−1 his right, +1 his left) */
const SH = (s) => [s * OTTER.SHOULDER, OTTER.SHOULDER_Y, OTTER.SHOULDER_Z];
const CATCH = (s) => [s * 0.5, 1.24, 0.76];      // out to the side: where things come down
const DIP = (s) => [s * 0.3, 1.0, 0.72];         // the bottom of the scoop
const THROW = (s) => [s * 0.16, 1.12, 0.74];     // in toward the middle: where he lets go
const REST = (s) => [s * 0.26, 1.1, 0.7];        // paws together, nothing to do

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export class OtterGame extends Athlete {
  constructor(soft) {
    super(soft);
    this.balanceK = 0.007;
    this.speed = 15;
    this.stones = [];
    this.nextId = 1;
    this.best = 0;
    this.drops = 0;
    this.tosses = 0;
    this.aimZ = this.home[1] + CATCH(1)[2];
    this.paws = [-1, 1].map((s, j) => ({
      s, k: j === 0 ? this.cfg.armR : this.cfg.armL, hold: null, held: 0, target: this.worldOf(REST(s)), aim: REST(s),
      after: 0,                                    // time since its last throw
      sp: REST(s).map((v) => ({ x: v, v: 0 })),
    }));
    this.bowS = spring();
    this.kPaw = 380;
    this.leanS = [0, 0, 0];
    this.msg = 'ready to juggle';
    this._go('ready');
  }

  _springs() { return [...super._springs(), this.bowS]; }

  reset() {
    super.reset();
    this.stones = [];
    this.leanS = [0, 0, 0];
    for (const p of this.paws) { p.hold = null; p.held = 0; p.after = 0; p.sp = REST(p.s).map((v) => ({ x: v, v: 0 })); p.aim = REST(p.s); }
    this.msg = 'ready to juggle';
  }

  /* how many he has going: held, or in the air between his paws */
  inPlay() { return this.stones.filter((it) => it.state === 'held' || it.state === 'fly' || it.state === 'toss').length; }
  juggling() { return this.stones.filter((it) => it.state === 'held' || it.state === 'fly').length; }

  pawTip(p) {
    const ch = this.rig.arms[p.k], x = this.soft.x, t = ch.idx[ch.idx.length - 1];
    return [x[t * 3], x[t * 3 + 1], x[t * 3 + 2]];
  }

  /* ── a toss ───────────────────────────────────────────────────────────── */

  /* aim: [x, y] where it should cross his paws' plane (aimZ); speed u/s */
  launch({ aim = null, speed = this.speed, kind = null } = {}) {
    if (this.state === 'tumble') return null;
    const c = this.soft.cloudC[0];
    if (!aim) {
      // to whichever paw is less busy, a little high so it drops in
      const busy = this.paws.map((p) => (p.hold ? 1 : 0) + this.stones.filter((it) => it.paw === p && (it.state === 'fly' || it.state === 'toss')).length);
      const p = busy[0] <= busy[1] ? this.paws[0] : this.paws[1];
      const C = this.worldOf(CATCH(p.s));
      aim = [C[0] + (Math.random() - 0.5) * 0.15, C[1] + 0.25 + Math.random() * 0.15];
    }
    kind = kind || (this.tosses % 2 ? 'pebble' : 'shell');
    const spec = PEBBLES[kind];
    const S = [THROWER[0] + (aim[0] - c[0]) * 0.1, THROWER[1], THROWER[2]];
    const T = [aim[0], aim[1], this.aimZ];
    const d = Math.hypot(T[0] - S[0], T[1] - S[1], T[2] - S[2]);
    const tau = d / clamp(speed, 5, 30) + 0.12;
    const v = [(T[0] - S[0]) / tau, (T[1] - S[1]) / tau + 0.5 * ITEM_G * tau, (T[2] - S[2]) / tau];
    const ball = new Ball({ r: spec.r, mass: spec.mass, restitution: 0.42, roll: 2.5, x: S, v, g: ITEM_G });
    const it = { id: this.nextId++, kind, r: spec.r, ball, state: 'toss', paw: null, t: 0, hue: this.tosses };
    // the paw it's coming down to: the nearer one where it crosses
    const P0 = this.worldOf(CATCH(-1)), P1 = this.worldOf(CATCH(1));
    it.paw = Math.abs(T[0] - P0[0]) < Math.abs(T[0] - P1[0]) ? this.paws[0] : this.paws[1];
    this.stones.push(it);
    this.tosses++;
    if (this.state === 'ready') this._go('juggle');
    this.msg = 'here comes one';
    return it;
  }

  /* ── per fixed step ───────────────────────────────────────────────────── */

  _think(dt) {
    for (const it of this.stones) it.t += dt;
    // things at rest on the mat a while after a tumble are tidied away
    for (const it of this.stones) if (it.state === 'free' && it.rest > 3) it.state = 'gone';
    this.stones = this.stones.filter((it) => it.state !== 'gone');
    const n = this.juggling();
    if (n > this.best) this.best = n;

    if (this.state === 'tumble') {
      if (this.t > 3) { this._go(this.stones.some((it) => it.state === 'toss') ? 'juggle' : 'ready'); this.msg = 'ready to juggle'; }
    } else if (this.state === 'juggle' && !this.inPlay()) this._go('ready');

    // attention: the highest thing in the air, or what's in his paws; after
    // a tumble, the floor in front of him
    let top = null;
    for (const it of this.stones) if ((it.state === 'fly' || it.state === 'toss' || it.state === 'held') && (!top || it.ball.x[1] > top.ball.x[1])) top = it;
    if (this.state === 'tumble') {
      const c = this.soft.cloudC[0];
      this.lookAt = [c[0] + 0.3 * Math.sin(this.time * 1.3), 0, c[2] + 1.6];
    } else this.lookAt = top ? top.ball.x : null;

    // the paws: where each should be now
    for (const p of this.paws) {
      p.after += dt;
      let aim;
      if (this.state === 'tumble') aim = lerp(REST(p.s), [p.s * 0.22, 1.25, 0.55], 0.6);
      else if (p.hold) {
        // carry: from where it was caught, down through the scoop and in
        const u = clamp(p.held / DWELL, 0, 1);
        aim = u < 0.55 ? lerp(p.caughtAt, DIP(p.s), u / 0.55) : lerp(DIP(p.s), THROW(p.s), (u - 0.55) / 0.45);
      } else {
        const inc = this._incoming(p);
        if (inc) {
          // meet it where it'll be at paw height, as best he can reach
          aim = this._meet(p, inc);
        } else aim = p.after < 0.3 ? lerp(THROW(p.s), CATCH(p.s), p.after / 0.3) : this.inPlay() ? CATCH(p.s) : REST(p.s);
      }
      // eased, so a new aim is a reach and not a snap
      for (let d = 0; d < 3; d++) { p.sp[d].v += (420 * (aim[d] - p.sp[d].x) - 41 * p.sp[d].v) * dt; p.sp[d].x += p.sp[d].v * dt; }
      p.aim = p.sp.map((q) => q.x);
      p.target = this.worldOf(p.aim);
      if (p.hold) {
        p.held += dt;
        // throw when the scoop is done, or early if the next is about to land
        const inc = this._incoming(p);
        const soon = inc && this._arrival(inc) < 0.16;
        if (p.held >= DWELL || (soon && p.held > 0.08)) this._throw(p);
      }
    }
    // the paws go limp in a tumble, and firm up again slowly after
    this.kPaw += ((this.state === 'tumble' ? 60 : 380) - this.kPaw) * Math.min(1, dt * 1.5);
    // sheepish: a bow and a shrug; and a little rock while juggling
    ease(this.bowS, this.state === "tumble" ? 0.35 : 0, 30, dt);
    // (eased: the balance pull is stiff, and a jump in what it pulls toward
    // is a kick)
    const L = this.state === 'tumble'
      ? [0.06 + 0.04 * Math.sin(this.time * 2.2), 0, 0.07 * Math.sin(this.time * 3.1)]
      : n ? [0.02, 0, 0.03 * Math.sin(this.time * TAU / (TF + DWELL))] : [0, 0, 0];
    const lk = Math.min(1, dt * 4);
    this.leanS = this.leanS.map((v, d) => v + (L[d] - v) * lk);
    this.lean = Math.hypot(...this.leanS) > 1e-4 ? this.leanS : null;
  }

  /* the next thing coming down to this paw */
  _incoming(p) {
    let best = null, bt = 1e9;
    for (const it of this.stones) {
      if (it.paw !== p || (it.state !== 'fly' && it.state !== 'toss')) continue;
      const t = this._arrival(it);
      if (t < bt) { bt = t; best = it; }
    }
    return best;
  }

  /* seconds until it comes down through the height of the paws (or now) */
  _arrival(it) {
    const b = it.ball, y = this.worldOf(CATCH(1))[1];
    const A = 0.5 * b.g, B = -b.v[1], C = y - b.x[1];
    const disc = B * B - 4 * A * C;
    if (disc < 0) return 0;
    return Math.max(0, (-B + Math.sqrt(disc)) / (2 * A));
  }

  /* where the paw should go to meet it (rest frame), within reach */
  _meet(p, it) {
    const t = Math.min(this._arrival(it), 1.5);
    const P = it.ball.at(t);
    // a toss still on its way in crosses the paws' plane first
    if (it.state === 'toss' && it.ball.v[2] < -0.5) {
      const tz = (this.aimZ - it.ball.x[2]) / it.ball.v[2];
      if (tz > 0 && tz < t) { const Q = it.ball.at(tz); P[0] = Q[0]; P[1] = Q[1]; P[2] = Q[2]; }
    }
    // into his own frame (he hardly moves: the rest frame is near enough)
    const c = this.soft.cloudC[0], c0 = this.c0;
    const L = this.toLocal([P[0] - c[0], P[1] - c[1], P[2] - c[2]]);
    const q = [c0[0] + L[0], c0[1] + L[1], c0[2] + L[2]];
    const S = SH(p.s);
    // reach: no further from the shoulder than his arm goes, and not across
    q[0] = p.s < 0 ? clamp(q[0], -1.05, 0.05) : clamp(q[0], -0.05, 1.05);
    q[1] = clamp(q[1], 0.85, 2.0);
    q[2] = clamp(q[2], 0.45, 1.05);
    const d = dist(q, S), R = OTTER.ARM_LEN * 1.12;
    if (d > R) for (let k = 0; k < 3; k++) q[k] = S[k] + (q[k] - S[k]) * R / d;
    return q;
  }

  _throw(p) {
    const it = p.hold, o = this.paws[p.s < 0 ? 1 : 0];
    p.hold = null;
    p.after = 0;
    const b = it.ball;
    const C = this.worldOf(CATCH(o.s));
    // a little off, every time: he isn't a machine
    const err = 0.05;
    C[0] += (Math.random() - 0.5) * err * 2; C[2] += (Math.random() - 0.5) * err * 2;
    const tf = TF * (1 + (Math.random() - 0.5) * 0.06);
    b.v = [(C[0] - b.x[0]) / tf, (C[1] - b.x[1]) / tf + 0.5 * b.g * tf, (C[2] - b.x[2]) / tf];
    b.p = [b.x[0] - b.v[0] / 600, b.x[1] - b.v[1] / 600, b.x[2] - b.v[2] / 600];
    // a turn in the air, felt and stone tumbling
    b.w = [(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 4, -o.s * (3 + Math.random() * 3)];
    it.state = 'fly';
    it.paw = o;
    it.t = 0;
    // the paw flicks up with it
    const ch = this.rig.arms[p.k], sv = this.soft.v;
    for (const j of ch.idx.slice(-2)) sv[j * 3 + 1] += 1.2;
    this.events.push({ kind: 'throw', at: [...b.x] });
  }

  _catch(p, it) {
    p.hold = it;
    p.held = 0;
    it.state = 'held';
    // where in his frame it was caught: the scoop starts there
    const c = this.soft.cloudC[0], c0 = this.c0, P = it.ball.x;
    const L = this.toLocal([P[0] - c[0], P[1] - c[1], P[2] - c[2]]);
    p.caughtAt = [c0[0] + L[0], c0[1] + L[1] - 0.06, c0[2] + L[2]];
    // the paw gives a little with it
    const ch = this.rig.arms[p.k], sv = this.soft.v;
    for (const j of ch.idx.slice(-2)) for (let d = 0; d < 3; d++) sv[j * 3 + d] += clamp(it.ball.v[d] * it.ball.mass * 0.4, -1.5, 1.5);
    this.msg = this.juggling() > 1 ? `juggling ${this.juggling()}` : 'got it';
    if (this.juggling() > MAX_JUGGLE) this._tumble('too many!');
  }

  /* everything lets go */
  _tumble(why) {
    for (const p of this.paws) p.hold = null;
    for (const it of this.stones) {
      if (it.state === 'free') continue;
      it.rest = 0;
      const b = it.ball;
      // a fumble: what was in his paws pops up and drops back onto his
      // belly and legs; what was in the air keeps going, knocked back at him
      if (it.state === 'held' || b.x[1] < 1.6) {
        const T = this.worldOf([(Math.random() - 0.5) * 0.5, 0.55 + Math.random() * 0.6, 0.38]);
        const t = 0.32 + Math.random() * 0.1;
        b.v = [(T[0] - b.x[0]) / t, (T[1] - b.x[1]) / t + 0.5 * b.g * t, (T[2] - b.x[2]) / t];
      } else b.v = [b.v[0] * 0.5, b.v[1], b.v[2] - 0.8];
      it.state = 'free';
      b.p = [b.x[0] - b.v[0] / 600, b.x[1] - b.v[1] / 600, b.x[2] - b.v[2] / 600];
    }
    this.drops++;
    this.msg = why;
    this._go('tumble');
  }

  _bones() {
    const out = [];
    for (const p of this.paws) {
      const S = SH(p.s);
      out.push(this.armBone(p.k, [p.aim[0] - S[0], p.aim[1] - S[1], p.aim[2] - S[2]]));
    }
    // the sheepish bow: the head down a little more than looking would
    if (this.bowS.x > 1e-3) out.push({ ix: this.cfg.head, rv: [this.bowS.x, 0, 0.12 * this.bowS.x], pivotIx: this._neckIx() });
    return out;
  }

  /* ── per substep ──────────────────────────────────────────────────────── */

  _push(h) {
    const x = this.soft.x, v = this.soft.v, hh = h * h;
    // pull each paw to its target (the pose turns the arm; this puts the
    // paw there): a capped, damped spring on the last two points, damped
    // against the paw's own speed
    const k = this.kPaw, c = 2 * Math.sqrt(k);
    for (const p of this.paws) {
      const ch = this.rig.arms[p.k], N = ch.idx.length;
      const tip = this.pawTip(p);
      let d = [p.target[0] - tip[0], p.target[1] - tip[1], p.target[2] - tip[2]];
      const dl = Math.hypot(...d);
      if (dl > 0.3) d = d.map((q) => q * 0.3 / dl);
      for (const [j, w] of [[N - 1, 1], [N - 2, 0.5]]) {
        const i = ch.idx[j];
        for (let q = 0; q < 3; q++) x[i * 3 + q] += (d[q] * k - v[i * 3 + q] * c * 0.3) * w * hh;
      }
    }
    this._items(h);
  }

  _items(h) {
    for (const it of this.stones) {
      const b = it.ball;
      if (it.state === 'held') {
        // in the paw: it rides it, just in front of the pad
        const p = this.paws.find((q) => q.hold === it);
        const tip = this.pawTip(p);
        const want = [tip[0], tip[1] + it.r * 0.7, tip[2] + 0.1];
        b.p = [...b.x];
        for (let d = 0; d < 3; d++) b.x[d] += (want[d] - b.x[d]) * 0.35;
        b.v = [0, 1, 2].map((d) => (b.x[d] - b.p[d]) / h);
        continue;
      }
      if (it.state === 'fly' || it.state === 'toss') {
        b.step(h, null);
        // the paw it's meant for closes on it when it's close and coming down
        const p = it.paw;
        if (!p.hold && b.v[1] < 0.5) {
          const tip = this.pawTip(p);
          if (dist(b.x, tip) < CATCH_R + it.r) { this._catch(p, it); continue; }
        }
        // dropped: it's gone below his paws, or past him
        const c = this.soft.cloudC[0];
        if (b.x[1] < 0.72 || b.x[2] < c[2] - 0.3) {
          if (this.juggling() || this.state === 'juggle') this._tumble(it.state === 'toss' ? 'out of reach — it all comes down' : 'dropped one — it all comes down');
          else { it.state = 'free'; it.rest = 0; }
        }
        continue;
      }
      // free: bouncing off him, the mat, each other
      b.step(h, this.soft, (ball) => this._knock(ball, it));
      if (b.touch && b.touch.i >= 0 && b.touch.speed > 0.3) it.bumps = (it.bumps || 0) + 1;
      // a pebble squeezed out from between his paws doesn't shoot off: the
      // stuffing gives and soaks it up
      const vb = Math.hypot(...b.v);
      if (b.touch && vb > 5) for (let d = 0; d < 3; d++) b.v[d] *= 5 / vb;
      const sp = Math.hypot(...b.v);
      it.rest = b.x[1] < it.r + 0.02 && sp < 0.15 ? (it.rest || 0) + h : 0;
      for (const d of [0, 2]) {
        const lim = d === 0 ? 4.5 : 4;
        if (Math.abs(b.x[d]) > lim) { b.x[d] = Math.sign(b.x[d]) * lim; b.v[d] *= -0.3; }
      }
    }
  }

  /* free things against each other */
  _knock(b, it) {
    for (const o of this.stones) {
      if (o === it || o.state !== 'free') continue;
      const q = o.ball;
      const d = [b.x[0] - q.x[0], b.x[1] - q.x[1], b.x[2] - q.x[2]];
      const l = Math.hypot(...d), m = b.r + q.r;
      if (l >= m || l < 1e-6) continue;
      const n = d.map((v) => v / l), pen = (m - l) * 0.5;
      for (let k = 0; k < 3; k++) { b.x[k] += n[k] * pen; q.x[k] -= n[k] * pen; }
      b.touch = b.touch || { i: -1, speed: 0, n };
    }
  }

  readout() { return [['In the air', this.juggling()], ['Best', this.best]]; }
  status() { return this.msg; }
}
