/* Batting, for the penguin.

   You pitch; he bats. Per fixed step he reads the pitch (it is ballistic,
   so he can see where it will cross the plate beside him), decides whether
   it's one to swing at, winds the bat back and swings — the bat flipper
   turned about the shoulder (a pose of the sewn shape: shape memory hauls
   the stuffed flipper after it, so it lags and wobbles like plush), the
   shoulders turned with it:

     the bat       a rigid body gripped in the flipper: its handle runs
                   along the flipper's last three chain points (measured
                   from the physics), cocked by an eased wrist angle
     contact       the ball against the bat's barrel — a capsule that thins
                   to the handle — every substep, with the bat's own
                   velocity at the contact point. Nothing is steered: the
                   bat's motion and where on it the ball meets it decide
                   where it goes. Early, the barrel is already round and it
                   is pulled foul; late, it is pushed foul; the handle jams
                   it, the sweet spot sends it
     the call      from the ball's flight just off the bat: outside the
                   foul lines (or back over him) a foul; fair and carrying
                   past the fence a home run; fair and short of it a hit
     a whiff       a swing that meets nothing spins him round on his own
                   follow-through (a capped velocity servo on his yaw, his
                   feet sliding), and he wobbles back to face you
     the count     balls and strikes: he takes pitches well off the plate,
                   swings at the rest; three strikes or four balls and a
                   new count

   His right is −x; he faces +z, toward the pitcher.                       */

import { Athlete, clamp, spring, ease, TAU } from './game.js';
import { Ball, BALL_G } from '../ball.js';
import { PENGUIN } from './penguin.rig.js';

/* the bat, along its handle axis from the grip (units of 9 cm): a knob, a
   thin handle, swelling to the barrel; the sweet spot most of the way out */
export const BAT = { knob: -0.14, handle: 0.42, len: 1.42, rH: 0.05, rB: 0.105, sweet: 1.1 };
export const BASEBALL_R = 0.16;
export const PITCHER = [0.4, 1.7, 11];
export const FENCE = 28;                           // a home run carries this far
const FOUL_LINE = 0.6;                             // radians each side of straight back at you
const LEVER = PENGUIN.ARM_LEN + BAT.sweet;         // shoulder → sweet spot

/* the bat's radius at s along it */
export const batR = (s) => BAT.rH + (BAT.rB - BAT.rH) * clamp((s - BAT.handle) / (BAT.len * 0.8 - BAT.handle), 0, 1) ** 0.8;

/* the swing: θ round the vertical from wound-back to follow-through on a
   smooth ramp (θ = 0 the bat straight out to his right, moving forward) */
const SW = 0.32;
const ramp = (u) => u - Math.sin(TAU * u) / TAU;
const SWING = { θb: -1.5, θc: 0.12, θf: 2.75, turnB: -0.6, turnC: 0.05, turnF: 0.7 };
{
  const f = (SWING.θc - SWING.θb) / (SWING.θf - SWING.θb);
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (ramp(m) < f) lo = m; else hi = m; }
  SWING.uc = (lo + hi) / 2;
}
// at the ready: the bat up over his right shoulder
const READY = { θ: -0.55, e: 0.75, wrist: 0.95 };
export const ZONE = { y0: 0.85, y1: 2.45, half: 0.62 };   // the strike zone, about the plate

/* the bat's frame from the physics (as the leopard's racquet): grip point,
   handle axis h; returns {p, h, tip} */
export function batFrame(soft, k, wrist, out = {}) {
  const ch = soft.rig.arms[k], x = soft.x, idx = ch.idx, N = idx.length;
  const a = idx[N - 3], t = idx[N - 1];
  const p = [x[t * 3], x[t * 3 + 1], x[t * 3 + 2]];
  let f = [p[0] - x[a * 3], p[1] - x[a * 3 + 1], p[2] - x[a * 3 + 2]];
  const fl = Math.hypot(...f) || 1;
  f = f.map((v) => v / fl);
  const R = soft.cloudR[0];
  const U = [R[1], R[4], R[7]], F = [R[2], R[5], R[8]];
  let n = [U[1] * f[2] - U[2] * f[1], U[2] * f[0] - U[0] * f[2], U[0] * f[1] - U[1] * f[0]];
  let nl = Math.hypot(...n);
  if (nl < 0.25) { const b = (0.25 - nl) * 4; n = n.map((v, d) => v + F[d] * b); nl = Math.hypot(...n); }
  n = n.map((v) => v / nl);
  const up = [f[1] * n[2] - f[2] * n[1], f[2] * n[0] - f[0] * n[2], f[0] * n[1] - f[1] * n[0]];
  const c = Math.cos(wrist), s = Math.sin(wrist);
  const h = [f[0] * c + up[0] * s, f[1] * c + up[1] * s, f[2] * c + up[2] * s];
  out.p = p; out.h = h; out.n = n;
  out.tip = [p[0] + h[0] * BAT.len, p[1] + h[1] * BAT.len, p[2] + h[2] * BAT.len];
  return out;
}

export class PenguinGame extends Athlete {
  constructor(soft) {
    super(soft);
    this.theta = spring(); this.elev = spring(); this.turn = spring(); this.wrist = spring(); this.left = spring();
    this.balls = 0; this.strikes = 0;
    this.hits = 0; this.homers = 0; this.pitches = 0;
    this.balanceK = 0.007;
    this.speed = 14;
    this.bat = batFrame(soft, this.cfg.armR, READY.wrist);
    this.batPrev = null;
    // the upper body turns as one: everything above the hips, the flippers whole
    const rest = this.rig.rest, ix = [], w = [];
    const armPts = new Set();
    for (const k of this.cfg.arms) for (const i of this.rig.arms[k].idx) armPts.add(i);
    const low = new Set();
    for (const k of this.cfg.legs) for (const i of this.rig.arms[k].idx) low.add(i);
    for (const i of this.rig.arms[this.cfg.tail].idx) low.add(i);
    for (let i = 0; i < this.rig.n; i++) {
      if (low.has(i)) continue;
      const wt = armPts.has(i) ? 1 : smoothW(rest[i * 3 + 1]);
      if (wt > 0) { ix.push(i); w.push(wt); }
    }
    this.turnBone = { ix: Int32Array.from(ix), w: Float64Array.from(w), pivot: [0, 1.2, 0], first: true };
    this.shoulder = [-PENGUIN.SHOULDER, PENGUIN.SHOULDER_Y, 0.06];
    this.plate = this._platePoint();
    this.aimZ = this.plate[1];         // tool 4 aims across the plate
    this.spin = 0;
    this._restV = this.rig.restV;
    this._ready();
  }

  _ready() {
    this.theta.x = READY.θ; this.elev.x = READY.e; this.wrist.x = READY.wrist;
    this.theta.v = this.elev.v = this.wrist.v = 0;
    this.plan = null; this.contact = false; this.call = null;
    this.face = 0;
    this.msg = 'batter up';
    this._go('ready');
  }

  _springs() { return [...super._springs(), this.theta, this.elev, this.turn, this.wrist, this.left]; }

  reset() {
    super.reset();
    this.rig.restV = this._restV;
    this._ready();
    this.balls = this.strikes = 0;
    this.spin = 0;
  }

  /* where the sweet spot crosses in front of him at the contact angle, level */
  _platePoint() {
    const S = this.shoulder, c0 = this.c0, s = SWING;
    const ct = Math.cos(s.turnC), st = Math.sin(s.turnC);
    const sx = S[0] - c0[0], sz = S[2] - c0[2];
    const shx = ct * sx + st * sz, shz = -st * sx + ct * sz;
    return [c0[0] + shx - LEVER * Math.cos(s.θc), c0[2] + shz + LEVER * Math.sin(s.θc)];
  }

  /* ── the pitch ────────────────────────────────────────────────────────── */

  /* aim: [x, y] where it should cross the plate (world); speed in units/s.
     Without an aim, mostly strikes.                                       */
  launch({ aim = null, speed = this.speed, from = PITCHER } = {}) {
    if (this.state === 'spin') return null;
    const P = this.plate;
    if (!aim) {
      const r = Math.random();
      aim = r < 0.78
        ? [P[0] + (Math.random() - 0.5) * 0.8, 1.15 + Math.random() * 1.0]
        : [P[0] + (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.6), 0.9 + Math.random() * 1.6];
    }
    const S = [...from];
    const T = [aim[0], aim[1], P[1]];
    const d = Math.hypot(T[0] - S[0], T[1] - S[1], T[2] - S[2]);
    const tau = d / clamp(speed, 5, 30);
    const v = [(T[0] - S[0]) / tau, (T[1] - S[1]) / tau + 0.5 * BALL_G * tau, (T[2] - S[2]) / tau];
    this.ball = new Ball({ r: BASEBALL_R, mass: 0.4, restitution: 0.5, roll: 1.0, x: S, v });
    this.ball.kind = 'baseball';
    this.outcome = null;
    this.call = null;
    this.plan = null;
    this.contact = false;
    this.hitT = -1;
    this.pitches++;
    this.react = this.time + 0.1 + Math.random() * 0.05;
    // the faster it comes the shakier his timing; a pitch at the edge of the
    // zone is harder to square up (read in _plan)
    const pace = Math.max(0, speed - 10);
    this.timingErr = (Math.random() * 2 - 1) * (0.006 + 0.0045 * Math.pow(pace, 1.25));
    this.heightErr = (Math.random() * 2 - 1) * 0.06;
    this.spin = 0;
    this.face = 0;
    this._go('track');
    this.msg = 'here it comes';
    return this.ball;
  }

  /* ── per fixed step ───────────────────────────────────────────────────── */

  _think(dt) {
    const b = this.ball;
    this.daze = Math.max(0, this.daze - dt / 2.2);
    this.lookAt = b && !b.dead && b.t < 3 && (b.v[2] < 0 || b.t - (this.hitT > 0 ? this.hitT : 0) < 1.2) ? b.x : null;
    if (b && (b.dead || b.t > 6 || Math.abs(b.x[0]) > 60 || Math.abs(b.x[2]) > 60)) this.ball = null;

    if (this.state === 'track' && b && this.time >= this.react && !this.plan) this._plan(b);
    if (this.state === 'track' || this.state === 'swing') this._swing(dt);
    if (this.state === 'follow' && this.t > 0.22) {
      // nothing on the bat and the ball's gone by: round he goes
      if (!this.contact && this.plan?.swing) this._whiff();
      else this._go('recover');
    }
    if (this.state === 'spin') {
      this.spin = this.t;
      if (this.t > SPIN_T) { this.face = 0; this.rig.restV = this._restV; this.daze = Math.max(this.daze, 0.55); this._go('recover'); }
    }
    if (this.state === 'recover' && this.t > 0.9) this._go('ready');
    // back into the box after a spin has slid him off his mark
    const c = this.soft.cloudC[0];
    const off = Math.hypot(c[0] - this.home[0], c[2] - this.home[1]);
    if (this.state === 'spin' || this.state === 'swing' || this.state === 'follow') this.drive = null;
    else if (off > 0.12 || (this.drive && off > 0.03)) this.drive = { x: this.home[0], z: this.home[1], speed: 1.2 };
    else this.drive = null;
    if (this.state === 'ready' || this.state === 'recover' || this.state === 'take') {
      const k = this.state === 'recover' ? 40 : 60;
      ease(this.theta, READY.θ, k, dt); ease(this.elev, READY.e, k, dt);
      ease(this.turn, 0, k, dt); ease(this.wrist, READY.wrist, 70, dt); ease(this.left, 0, 50, dt);
    }
    if (this.state === 'take' && this.t > 0.8) this._go('ready');
    if (this.state === 'spin') {
      // the bat trails round with him, held out
      ease(this.theta, SWING.θf, 30, dt); ease(this.turn, SWING.turnF * 0.8, 30, dt);
    }

    // a pitch that got past him
    if (b && !this.call && b.x[2] < this.plate[1] - 1.4) this._decide();
    this.lean = this.state === 'spin' ? null : this.daze > 0.05 ? [0.1 * this.daze * Math.sin(this.time * 4.1), 0, 0.14 * this.daze * Math.cos(this.time * 3.3)] : null;
  }

  /* where will it cross the plate, and is it one to swing at */
  _plan(b) {
    const c = this.soft.cloudC[0], S = this.shoulder, c0 = this.c0, s = SWING;
    let e = 0, P = null, rel = null, tc = Infinity;
    for (let it = 0; it < 3; it++) {
      const Lr = LEVER * Math.cos(e);
      const ct = Math.cos(s.turnC), st = Math.sin(s.turnC);
      const sx = S[0] - c0[0], sz = S[2] - c0[2];
      const shx = ct * sx + st * sz, shz = -st * sx + ct * sz;
      rel = [shx - Lr * Math.cos(s.θc), S[1] - c0[1] + LEVER * Math.sin(e), shz + Lr * Math.sin(s.θc)];
      tc = b.timeToZ(c[2] + rel[2]);
      if (!Number.isFinite(tc)) return;
      P = b.at(tc);
      // the stuffed flipper rides high through the swing (more so low
      // down): he aims under it by what he's learned
      const y = P[1] + this.heightErr;
      e = Math.asin(clamp((y - AIM_FIX(y) - (c[1] + S[1] - c0[1])) / LEVER, -0.9, 0.6));
    }
    const off = P[0] - (c[0] + rel[0]);
    const inZone = Math.abs(off) < ZONE.half && P[1] > ZONE.y0 && P[1] < ZONE.y1;
    // he chases the odd one just off the plate
    const near = Math.abs(off) < ZONE.half + 0.45 && P[1] > ZONE.y0 - 0.35 && P[1] < ZONE.y1 + 0.3;
    const swing = inZone || (near && Math.random() < 0.3);
    this.plan = { e, P, tc, at: this.time + tc, off, inZone, swing };
    this.msg = swing ? 'swing…' : 'taking it';
    if (!swing) this._go('take');
  }

  _swing(dt) {
    const s = SWING, P = this.plan;
    if (!P || !P.swing) return;
    const lead = 0.05;
    const ts = P.at - s.uc * SW - lead + this.timingErr;
    if (this.state === 'track') {
      // load: the bat back over his shoulder, shoulders turned away
      ease(this.theta, s.θb, 140, dt); ease(this.turn, s.turnB, 110, dt);
      ease(this.elev, P.e * 0.5 + 0.35, 120, dt); ease(this.wrist, 0.5, 120, dt);
      ease(this.left, 1, 60, dt);
      if (this.time >= ts) this._go('swing');
      return;
    }
    const u = clamp(this.t / SW, 0, 1);
    const r = ramp(u);
    ease(this.theta, s.θb + (s.θf - s.θb) * r, 2400, dt);
    ease(this.turn, s.turnB + (s.turnF - s.turnB) * r, 600, dt);
    ease(this.elev, P.e, 800, dt);
    ease(this.wrist, 0.04, 420, dt);
    ease(this.left, 1, 40, dt);
    if (u >= 1) this._go('follow');
  }

  _bones() {
    const out = [{ ...this.turnBone, rv: [0, this.turn.x, 0] }];
    const θ = this.theta.x, e = this.elev.x, ce = Math.cos(e);
    const dir = [-Math.cos(θ) * ce, Math.sin(e), Math.sin(θ) * ce];
    const tr = this.turn.x, ct = Math.cos(tr), st = Math.sin(tr);
    const turned = (a) => [ct * a[0] + st * a[2], a[1], -st * a[0] + ct * a[2]];
    out.push(this.armBone(this.cfg.armR, dir, turned));
    // the other flipper lifts out and forward for balance as he loads and swings
    if (this.left.x > 0.01) {
      const L = this.left.x;
      const d = [0.36 + 0.3 * L, -0.9 + 0.55 * L, 0.12 + 0.55 * L];
      out.push(this.armBone(this.cfg.armL, d, turned));
    }
    return out;
  }

  /* ── per substep ──────────────────────────────────────────────────────── */

  _push(h) {
    this.batPrev = this.bat;
    this.bat = batFrame(this.soft, this.cfg.armR, this.wrist.x, {});
    if (this.state === 'spin') this._spinServo(h);
  }

  /* the whiff's spin: his yaw rate eased toward a profile that makes one
     full turn (zero rate at both ends), about his own centre; his feet
     slide while he goes round                                            */
  _spinServo(h) {
    const s = this.soft, x = s.x, v = s.v, ix = this.rig.clouds[0].ix, c = s.cloudC[0];
    // his felt feet slide: no static grip while he goes round
    s.params.mu = 0.08;
    this.rig.restV = 0;
    const u = clamp(this.t / SPIN_T, 0, 1);
    const w = (TAU / SPIN_T) * (1 - Math.cos(TAU * u)) * (u < 1 ? 1 : 0);
    let mx = 0, mz = 0;
    for (const i of ix) { mx += v[i * 3]; mz += v[i * 3 + 2]; }
    mx /= ix.length; mz /= ix.length;
    const e = Math.min(1, 24 * h);
    for (const i of ix) {
      const rx = x[i * 3] - c[0], rz = x[i * 3 + 2] - c[2];
      // ω about +y: v = ω × r = (ω rz, 0, −ω rx); he turns to his left
      const tx = mx * 0.5 + w * rz, tz = mz * 0.5 - w * rx;
      x[i * 3] += (tx - v[i * 3]) * e * h;
      x[i * 3 + 2] += (tz - v[i * 3 + 2]) * e * h;
    }
    // the stuffing's rotation estimate is refined from the last substep's
    // (a few iterations): a fast turn leaves it behind, and shape matching
    // toward a lagging frame is a brake. Turn it on by this substep's spin.
    const g = s.clouds[0], q = g.q4, a = w * h * 0.5, sy = Math.sin(a), cw = Math.cos(a);
    g.q4 = [cw * q[0] + sy * q[2], cw * q[1] + sy * q[3], cw * q[2] - sy * q[0], cw * q[3] - sy * q[1]];
  }

  _ballStep(h) {
    const b = this.ball;
    b.step(h, this.soft, (ball) => this._batHit(ball, h));
    const t = b.touch;
    if (t && !this.call && t.speed > 2 && !this.contact) this._result('hbp');
  }

  /* the ball against the bat's barrel, swept over the substep */
  _batHit(b, h) {
    const F = this.bat, P = this.batPrev;
    if (!P || this.contact) return;
    // closest point on the bat's axis (now) to the ball
    const rel = [b.x[0] - F.p[0], b.x[1] - F.p[1], b.x[2] - F.p[2]];
    let s = rel[0] * F.h[0] + rel[1] * F.h[1] + rel[2] * F.h[2];
    s = clamp(s, BAT.handle * 0.4, BAT.len);
    const Q = [F.p[0] + F.h[0] * s, F.p[1] + F.h[1] * s, F.p[2] + F.h[2] * s];
    let n = [b.x[0] - Q[0], b.x[1] - Q[1], b.x[2] - Q[2]];
    let d = Math.hypot(...n);
    const m = b.r + batR(s);
    // the bat may have swept through it this substep: check where the ball
    // was against where that bit of bat was
    const Qp = [P.p[0] + P.h[0] * s, P.p[1] + P.h[1] * s, P.p[2] + P.h[2] * s];
    if (d >= m) {
      const n0 = [b.p[0] - Qp[0], b.p[1] - Qp[1], b.p[2] - Qp[2]];
      const vq0 = [(Q[0] - Qp[0]), (Q[1] - Qp[1]), (Q[2] - Qp[2])];
      // swept: the bat's motion this substep carried it across the ball
      const dn = [n[0] - n0[0], n[1] - n0[1], n[2] - n0[2]];
      const cross = (n0[0] * vq0[0] + n0[1] * vq0[1] + n0[2] * vq0[2]) > 0 && (n[0] * vq0[0] + n[1] * vq0[1] + n[2] * vq0[2]) < 0;
      if (!cross) return;
      // lateral miss distance (perpendicular to the bat's motion and axis)
      const vl = Math.hypot(...vq0) || 1;
      const mv = vq0.map((q) => q / vl);
      const along = n[0] * mv[0] + n[1] * mv[1] + n[2] * mv[2];
      const perp = [n[0] - mv[0] * along, n[1] - mv[1] * along, n[2] - mv[2] * along];
      if (Math.hypot(...perp) >= m) return;
      // place it on the bat's leading face
      const pl = Math.hypot(...perp);
      const back = Math.sqrt(Math.max(0, m * m - pl * pl));
      n = [perp[0] + mv[0] * back, perp[1] + mv[1] * back, perp[2] + mv[2] * back];
      d = m;
      void dn;
    }
    if (d < 1e-6) return;
    n = n.map((q) => q / d);
    const vq = [(Q[0] - Qp[0]) / h, (Q[1] - Qp[1]) / h, (Q[2] - Qp[2]) / h];
    const vr = [b.v[0] - vq[0], b.v[1] - vq[1], b.v[2] - vq[2]];
    const vn = vr[0] * n[0] + vr[1] * n[1] + vr[2] * n[2];
    if (vn >= 0) return;                            // separating
    // the barrel is lively, the handle and the very end are dead
    const sweet = Math.exp(-((s - BAT.sweet) ** 2) / 0.06);
    const e = 0.16 + 0.3 * sweet;
    const grip = 0.25;
    const vt = [vr[0] - vn * n[0], vr[1] - vn * n[1], vr[2] - vn * n[2]];
    const out = [0, 1, 2].map((k) => vr[k] - (1 + e) * vn * n[k] - vt[k] * grip + vq[k]);
    for (let k = 0; k < 3; k++) b.x[k] = Q[k] + n[k] * (m + 0.002);
    b.w = [n[1] * vt[2] - n[2] * vt[1], n[2] * vt[0] - n[0] * vt[2], n[0] * vt[1] - n[1] * vt[0]].map((q) => -q * 0.5);
    // the flipper feels it
    const ch = this.rig.arms[this.cfg.armR], sv = this.soft.v;
    const dp = [0, 1, 2].map((k) => (b.v[k] - out[k]) * b.mass * 0.25);
    for (const j of ch.idx.slice(-2)) for (let k = 0; k < 3; k++) sv[j * 3 + k] += clamp(dp[k], -2.5, 2.5);
    b.v = out;
    b.p = [b.x[0] - out[0] * h, b.x[1] - out[1] * h, b.x[2] - out[2] * h];
    this.contact = true;
    this.hitT = b.t;
    this.events.push({ kind: 'hit', at: Q, sweet });
    this._callFlight(b);
  }

  /* fair or foul, and how far it carries: from the flight off the bat */
  _callFlight(b) {
    const v = b.v;
    const ang = Math.atan2(v[0], v[2]);
    this.angle = ang;
    if (v[2] <= 0.5 || Math.abs(ang) > FOUL_LINE) return this._result('foul');
    // ballistic carry to the floor
    const A = 0.5 * BALL_G, B = v[1], C = b.x[1] - b.r;
    const t = (B + Math.sqrt(B * B + 4 * A * C)) / (2 * A);
    const carry = Math.hypot(v[0], v[2]) * t;
    this.carry = carry;
    this.angle = ang;
    // topped straight into the floor by the plate: it dribbles away foul
    if (carry < 2) return this._result('foul');
    this._result(carry > FENCE ? 'homer' : 'hit');
  }

  /* a pitch went by: ball or strike */
  _decide() {
    if (this.call) return;
    const P = this.plan;
    if (P && P.swing && !this.contact) return this._result('whiff');
    this._result(P && P.inZone ? 'strike' : 'ball');
  }

  _whiff() {
    this._go('spin');
    this.face = null;
    this.drive = null;
    this.msg = 'whiff! round he goes';
    if (!this.call) this._result('whiff');
  }

  _result(kind) {
    if (this.call) return;
    this.call = kind;
    this.outcome = kind;
    const newCount = () => { this.balls = 0; this.strikes = 0; };
    if (kind === 'hit') { this.hits++; newCount(); this.msg = 'base hit!'; }
    else if (kind === 'homer') { this.hits++; this.homers++; newCount(); this.msg = 'home run!'; }
    else if (kind === 'foul') { if (this.strikes < 2) this.strikes++; this.msg = 'foul ball'; }
    else if (kind === 'hbp') { newCount(); this.msg = 'ouch — take your base'; }
    else if (kind === 'ball') { this.balls++; this.msg = this.balls >= 4 ? 'ball four — walk' : 'ball'; if (this.balls >= 4) newCount(); }
    else if (kind === 'strike' || kind === 'whiff') {
      this.strikes++;
      if (kind === 'strike') this.msg = 'strike, looking';
      if (this.strikes >= 3) { newCount(); this.msg = kind === 'whiff' ? 'whiff — strike three!' : 'strike three, looking'; }
    }
  }

  readout() { return [['Count', `${this.balls}–${this.strikes}`], ['Hits', this.hits], ['Homers', this.homers]]; }
  status() { return this.msg; }
}

const SPIN_T = 0.95;
const AIM_FIX = (y) => AIM_A + AIM_B * y;
const AIM_A = 0.42, AIM_B = -0.18;

function smoothW(y) { const t = Math.min(1, Math.max(0, (y - 0.7) / 0.6)); return t * t * (3 - 2 * t); }
