/* Tennis, for the leopard.

   You serve; he plays it. Per fixed step he reads the ball's flight (it is
   ballistic, so he can see where it will cross his hitting plane), picks a
   forehand or a backhand by the side it's coming, shuffles across to put
   it on his racquet, winds back and swings — every one of those a pose of
   the sewn shape or a push on the soft body, none of it keyframed:

     the stroke    his right arm is turned about the shoulder (swing angle θ
                   round the vertical, elevation e) and the upper body
                   turned with it; shape memory hauls the stuffed arm after
                   the pose, so it lags, overshoots and wobbles like plush
     the racquet   a rigid body gripped in the paw: its handle runs along
                   the forearm (the last three chain points, measured from
                   the physics), cocked up at the wrist by an eased angle
     contact       the ball against the string plane, every substep, using
                   the plane's own velocity at the contact point: strings
                   inside the head are lively, the wooden frame is dead and
                   skews the ball; a clean contact is steered back toward
                   you (the face sets most of it, and he aims a little)
     timing        a fast ball gets a late or early swing more often —
                   reaction time and a timing wobble that grows with pace
     a bonk        a ball that beats him and hits his head squashes it (an
                   impulse into the head's stuffing, the headband dented
                   with it) and leaves him dazed: balance slackened, the
                   head circling until it clears

   His right is −x; he faces +z, toward the server.                         */

import { Athlete, smooth, clamp, spring, ease, TAU } from './game.js';
import { Ball, BALL_G } from '../ball.js';
import { LEOPARD } from './leopard.rig.js';

/* the racquet, along its handle axis from the paw (units of 9 cm): leather
   grip, wooden shaft and throat, an oval head strung across */
export const RQ = { butt: -0.16, grip: 0.4, throat: 0.7, head: 1.07, a: 0.37, b: 0.3, frame: 0.045 };
export const TENNIS_R = 0.15;
const LEVER = LEOPARD.ARM_LEN + RQ.head;           // shoulder → sweet spot, arm and racquet in line
export const SERVER = [0.0, 1.9, 10.5];

/* the swing script: θ from wound-back to follow-through, a smooth ramp
   (zero speed at both ends, fastest through the middle)                  */
const SW = 0.34;                                   // seconds, backswing end to follow-through
const ramp = (u) => u - Math.sin(TAU * u) / TAU;
const STROKES = {
  // θ: the swing angle round the vertical (0 = arm straight out to his
  // right, π/2 = straight ahead, π = out to his left); turn: shoulders
  fore: { θb: -1.15, θc: 0.32, θf: 2.2, turnB: -0.55, turnC: 0.08, turnF: 0.5, sign: 1 },
  back: { θb: 3.55, θc: Math.PI - 0.32, θf: 0.95, turnB: 0.95, turnC: -0.05, turnF: -0.45, sign: -1 },
};
for (const s of Object.values(STROKES)) {
  // where in the ramp the contact angle comes
  const f = (s.θc - s.θb) / (s.θf - s.θb);
  let lo = 0, hi = 1;
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (ramp(m) < f) lo = m; else hi = m; }
  s.uc = (lo + hi) / 2;
}
const READY = { θ: 0.91, e: -0.8, wrist: 1.3 };

/* the racquet's frame from the physics: paw point, forearm direction,
   the body's up, the wrist cock ω. Returns {p, h, w, n, C} (grip point,
   handle axis, across, face normal, head centre)                        */
export function racquetFrame(soft, k, wrist, out = {}) {
  const ch = soft.rig.arms[k], x = soft.x, idx = ch.idx, N = idx.length;
  const a = idx[N - 3], t = idx[N - 1];
  const p = [x[t * 3], x[t * 3 + 1], x[t * 3 + 2]];
  let f = [p[0] - x[a * 3], p[1] - x[a * 3 + 1], p[2] - x[a * 3 + 2]];
  const fl = Math.hypot(...f) || 1;
  f = f.map((v) => v / fl);
  const R = soft.cloudR[0];
  const U = [R[1], R[4], R[7]], F = [R[2], R[5], R[8]];
  // face normal: across the forearm, level with the body (falls back to
  // the body's forward when the arm points straight up or down)
  let n = [U[1] * f[2] - U[2] * f[1], U[2] * f[0] - U[0] * f[2], U[0] * f[1] - U[1] * f[0]];
  let nl = Math.hypot(...n);
  if (nl < 0.25) { const b = (0.25 - nl) * 4; n = n.map((v, d) => v + F[d] * b); nl = Math.hypot(...n); }
  n = n.map((v) => v / nl);
  // the wrist: the handle turns from the forearm line toward "up" in the
  // face plane, about the face normal
  const up = [f[1] * n[2] - f[2] * n[1], f[2] * n[0] - f[0] * n[2], f[0] * n[1] - f[1] * n[0]];
  const c = Math.cos(wrist), s = Math.sin(wrist);
  const h = [f[0] * c + up[0] * s, f[1] * c + up[1] * s, f[2] * c + up[2] * s];
  const w = [n[1] * h[2] - n[2] * h[1], n[2] * h[0] - n[0] * h[2], n[0] * h[1] - n[1] * h[0]];
  out.p = p; out.h = h; out.w = w; out.n = n;
  out.C = [p[0] + h[0] * RQ.head, p[1] + h[1] * RQ.head, p[2] + h[2] * RQ.head];
  return out;
}

export class LeopardGame extends Athlete {
  constructor(soft) {
    super(soft);
    this.theta = spring(); this.elev = spring(); this.turn = spring(); this.wrist = spring(); this.left = spring();
    this.theta.x = READY.θ; this.elev.x = READY.e; this.wrist.x = READY.wrist;
    this.leftDir = null;
    this.rally = 0;
    this.best = 0;
    this.hits = 0;
    this.balanceK = 0.007;
    this.speed = 15;
    this.rq = racquetFrame(soft, this.cfg.armR, this.wrist.x);
    this.rqPrev = null;
    // the upper body turns as one: everything above the hips, the arms whole
    const rest = this.rig.rest, ix = [], w = [];
    const armPts = new Set();
    for (const k of this.cfg.arms) for (const i of this.rig.arms[k].idx) armPts.add(i);
    const legPts = new Set();
    for (const k of this.cfg.legs) for (const i of this.rig.arms[k].idx) legPts.add(i);
    const tail = new Set(this.rig.arms[this.cfg.tail].idx);
    for (let i = 0; i < this.rig.n; i++) {
      if (tail.has(i) || legPts.has(i)) continue;
      const wt = armPts.has(i) ? 1 : smooth(0.95, 1.5, rest[i * 3 + 1]);
      if (wt > 0) { ix.push(i); w.push(wt); }
    }
    this.turnBone = { ix: Int32Array.from(ix), w: Float64Array.from(w), pivot: [0, 1.4, 0], first: true };
    this.shoulder = [-LEOPARD.SHOULDER, LEOPARD.SHOULDER_Y, 0.02];
    this.msg = 'ready';
    this._go('ready');
  }

  _springs() { return [...super._springs(), this.theta, this.elev, this.turn, this.wrist, this.left]; }

  reset() {
    super.reset();
    this.theta.x = READY.θ; this.elev.x = READY.e; this.wrist.x = READY.wrist;
    this.stroke = null; this.plan = null;
    this.msg = 'ready';
  }

  /* ── the serve ────────────────────────────────────────────────────────── */

  /* aim: [x, y] where it should cross his hitting plane (world); speed in
     units/s. Without an aim, somewhere he can reach — mostly.            */
  launch({ aim = null, speed = this.speed, from = SERVER } = {}) {
    const c = this.soft.cloudC[0];
    const zc = this.home[1] + 0.5;
    if (!aim) {
      const r = Math.random();
      aim = [this.home[0] + (r < 0.45 ? -2.3 - Math.random() * 0.8 : r < 0.9 ? 0.6 + Math.random() * 1.4 : -0.3 + Math.random() * 0.6), 1.1 + Math.random() * 1.4];
    }
    const S = [from[0] + (aim[0] - c[0]) * 0.12, from[1], from[2]];
    const T = [aim[0], aim[1], zc];
    const d = Math.hypot(T[0] - S[0], T[1] - S[1], T[2] - S[2]);
    const tau = d / clamp(speed, 5, 30);
    const v = [(T[0] - S[0]) / tau, (T[1] - S[1]) / tau + 0.5 * BALL_G * tau, (T[2] - S[2]) / tau];
    this.ball = new Ball({ r: TENNIS_R, mass: 0.35, restitution: 0.62, roll: 0.8, x: S, v });
    this.ball.kind = 'tennis';
    this.ball.served = this.time;
    this.outcome = null;
    this.stroke = null;
    this.plan = null;
    this.hitT = -1;
    // he reacts after a beat; and the faster it comes the shakier his read
    this.react = this.time + 0.1 + Math.random() * 0.05;
    const pace = Math.max(0, speed - 11);
    this.timingErr = (Math.random() * 2 - 1) * (0.008 + 0.0042 * Math.pow(pace, 1.25));
    if (this.state !== 'dazed') this._go('track');
    this.msg = 'watching the ball';
    return this.ball;
  }

  /* ── per fixed step: read the ball, choose, move, swing ───────────────── */

  _think(dt) {
    const b = this.ball;
    this.daze = Math.max(0, this.daze - dt / 2.6);
    if (this.state === 'dazed' && this.daze <= 0.05) this._go('recover');
    // the ball has his attention while it's coming, and as it leaves
    this.lookAt = b && !b.dead && b.t < 4 && (b.v[2] < 0 || b.x[2] < 6) ? b.x : null;
    if (b && (b.dead || b.t > 6)) { this.ball = null; }

    if (this.state === 'track' && b && this.time >= this.react) this._plan(b);
    if (this.state === 'track' || this.state === 'swing') this._stroke(dt);
    if (this.state === 'follow' && this.t > 0.32) this._go('recover');
    if (this.state === 'recover') {
      this.drive = { x: this.home[0], z: this.home[1], speed: 1.6 };
      if (this.t > 0.6) { this._go('ready'); }
    }
    if (this.state === 'ready' || this.state === 'recover' || this.state === 'dazed') {
      ease(this.theta, READY.θ, 60, dt); ease(this.elev, READY.e, 60, dt);
      ease(this.turn, 0, 60, dt); ease(this.wrist, READY.wrist, 70, dt); ease(this.left, 0, 50, dt);
      const c = this.soft.cloudC[0];
      if (this.state === 'ready') this.drive = Math.hypot(c[0] - this.home[0], c[2] - this.home[1]) > 0.08 ? { x: this.home[0], z: this.home[1], speed: 1.4 } : null;
    }

    // a ball that got past him
    if (b && !this.outcome && b.x[2] < this.soft.cloudC[0][2] - 1.2) this._result('miss');
    // auto: the server plays a returned ball straight back, and puts a new
    // one in play after anything else
    if (this.auto && b && this.outcome === 'return' && b.x[2] > SERVER[2] - 2.5 && !this._autoAt) this._autoAt = this.time + 0.35;
    if (this.auto && this.outcome && this.outcome !== 'return' && !this._autoAt && this.state !== 'dazed') this._autoAt = this.time + 1.6;
    if (this.auto && !b && !this._autoAt) this._autoAt = this.time + 0.8;
    if (this._autoAt && this.time >= this._autoAt) { this._autoAt = 0; this.launch({}); }
    this.lean = this.state === 'dazed' ? [0.12 * Math.sin(this.time * 4.1), 0, 0.18 * Math.cos(this.time * 3.3)] : null;
  }

  /* where will it cross the plane in front of him, and what does that take */
  _plan(b) {
    const c = this.soft.cloudC[0];
    const S = this.shoulder, c0 = this.c0;
    const opts = [];
    for (const key of ['fore', 'back']) {
      const s = STROKES[key];
      let e = 0, P = null, rel = null, tc = Infinity;
      for (let it = 0; it < 3; it++) {
        const Lr = LEVER * Math.cos(e);
        const ct = Math.cos(s.turnC), st = Math.sin(s.turnC);
        const sx = S[0] - c0[0], sz = S[2] - c0[2];
        const shx = ct * sx + st * sz, shz = -st * sx + ct * sz;
        rel = [shx - Lr * Math.cos(s.θc), S[1] - c0[1] + LEVER * Math.sin(e), shz + Lr * Math.sin(s.θc)];
        tc = b.timeToZ(c[2] + rel[2]);
        if (!Number.isFinite(tc)) break;
        P = b.at(tc);
        e = Math.asin(clamp((P[1] - (c[1] + S[1] - c0[1])) / LEVER, -0.8, 0.95));
      }
      if (!P) continue;
      const bx = P[0] - rel[0];
      opts.push({ key, e, P, tc, bx, move: bx - c[0], at: this.time + tc });
    }
    if (!opts.length) return;
    // keep the chosen side unless the other is clearly easier now
    opts.sort((p, q) => Math.abs(p.move) - Math.abs(q.move));
    let pick = opts[0];
    if (this.plan && this.plan.key !== pick.key) {
      const cur = opts.find((o) => o.key === this.plan.key);
      if (cur && Math.abs(cur.move) < Math.abs(pick.move) + 0.6) pick = cur;
    }
    if (this.state === 'swing' && this.plan) return;
    this.plan = pick;
    this.stroke = STROKES[pick.key];
    // out of reach: he'll go as far as his feet take him and stretch
    const reach = 2.0;
    const tx = this.home[0] + clamp(pick.bx - this.home[0], -reach - 0.6, reach + 0.6);
    this.drive = { x: tx, z: this.home[1], speed: 5 };
    this.msg = pick.key === 'fore' ? 'forehand…' : 'backhand…';
  }

  _stroke(dt) {
    const s = this.stroke, P = this.plan;
    if (!s || !P) return;
    const lead = 0.06;
    const ts = P.at - s.uc * SW - lead + this.timingErr;
    if (this.state === 'track') {
      // wind back: arm round behind, shoulders turned, racquet cocked up
      ease(this.theta, s.θb, 140, dt); ease(this.turn, s.turnB, 110, dt);
      ease(this.elev, P.e * 0.6, 120, dt); ease(this.wrist, 0.55, 120, dt);
      ease(this.left, 1, 60, dt);
      if (this.time >= ts) this._go('swing');
      return;
    }
    // the stroke itself: θ along the ramp; the arm and racquet straighten
    // into one lever and the shoulders uncoil through contact
    const u = clamp(this.t / SW, 0, 1);
    const r = ramp(u);
    const θ = s.θb + (s.θf - s.θb) * r;
    ease(this.theta, θ, 2400, dt);
    ease(this.turn, s.turnB + (s.turnF - s.turnB) * r, 600, dt);
    ease(this.elev, P.e, 300, dt);
    ease(this.wrist, 0.08, 400, dt);
    ease(this.left, 0, 40, dt);
    this.drive = null;
    if (u >= 1) this._go('follow');
  }

  _bones() {
    const out = [{ ...this.turnBone, rv: [0, this.turn.x, 0] }];
    // the swing: the right arm pointed along (θ, e), in the turned frame
    const θ = this.theta.x, e = this.elev.x, ce = Math.cos(e);
    const dir = [-Math.cos(θ) * ce, Math.sin(e), Math.sin(θ) * ce];
    const tr = this.turn.x, ct = Math.cos(tr), st = Math.sin(tr);
    const turned = (a) => [ct * a[0] + st * a[2], a[1], -st * a[0] + ct * a[2]];
    out.push(this.armBone(this.cfg.armR, dir, turned));
    // the left arm reaches out toward the ball during the wind-back
    if (this.left.x > 0.01 && this.ball) {
      const L = this.left.x;
      const d = [0.55 * L + 0.42 * (1 - L), -0.86 * (1 - L) + 0.1 * L, 0.2 * (1 - L) + 0.8 * L];
      out.push(this.armBone(this.cfg.armL, d, turned));
    }
    return out;
  }

  /* ── per substep: the racquet, the ball ────────────────────────────────── */

  _push(h) {
    this.rqPrev = this.rqPrev || {};
    const P = this.rqPrev, F = this.rq;
    P.p = F.p; P.h = F.h; P.w = F.w; P.n = F.n; P.C = F.C;
    this.rq = racquetFrame(this.soft, this.cfg.armR, this.wrist.x, {});
  }

  _ballStep(h) {
    const b = this.ball;
    b.step(h, this.soft, (ball) => this._strings(ball, h));
    const t = b.touch;
    // a knock on the head: the head squashes and he's dazed
    if (t && !this.outcome && t.speed > 3.2 && this._isHead(t.i)) this._bonk(b, t);
    if (t && !this.outcome && t.speed > 2) this._result('body');
  }

  _isHead(i) {
    if (!this._hm) { this._hm = new Uint8Array(this.rig.n); for (const j of this.cfg.head) this._hm[j] = 1; }
    return this._hm[i] === 1;
  }

  /* the ball against the string plane, swept over the substep */
  _strings(b, h) {
    const F = this.rq, P = this.rqPrev;
    if (!P || !P.C || this.time - (this.hitT ?? -1) < 0.25) return;
    const rel = (Q, X) => (X[0] - Q.C[0]) * Q.n[0] + (X[1] - Q.C[1]) * Q.n[1] + (X[2] - Q.C[2]) * Q.n[2];
    const s1 = rel(F, b.x), s0 = rel(P, b.p);
    const r = b.r;
    // crossed the plane, or is within a ball's radius of it and closing
    const crossed = (s0 > 0) !== (s1 > 0);
    if (!crossed && Math.abs(s1) > r) return;
    // where on the face: in the head's own (along, across) coordinates
    const Q = [b.x[0] - F.n[0] * s1, b.x[1] - F.n[1] * s1, b.x[2] - F.n[2] * s1];
    const qa = ((Q[0] - F.C[0]) * F.h[0] + (Q[1] - F.C[1]) * F.h[1] + (Q[2] - F.C[2]) * F.h[2]) / RQ.a;
    const qb = ((Q[0] - F.C[0]) * F.w[0] + (Q[1] - F.C[1]) * F.w[1] + (Q[2] - F.C[2]) * F.w[2]) / RQ.b;
    const rho = Math.hypot(qa, qb);
    if (rho > 1.22) return;
    // the face's own velocity at that spot (it turns as well as moves)
    const Qp = [P.C[0] + (qa * RQ.a) * P.h[0] + (qb * RQ.b) * P.w[0], P.C[1] + (qa * RQ.a) * P.h[1] + (qb * RQ.b) * P.w[1], P.C[2] + (qa * RQ.a) * P.h[2] + (qb * RQ.b) * P.w[2]];
    const Qn = [F.C[0] + (qa * RQ.a) * F.h[0] + (qb * RQ.b) * F.w[0], F.C[1] + (qa * RQ.a) * F.h[1] + (qb * RQ.b) * F.w[1], F.C[2] + (qa * RQ.a) * F.h[2] + (qb * RQ.b) * F.w[2]];
    const vq = [(Qn[0] - Qp[0]) / h, (Qn[1] - Qp[1]) / h, (Qn[2] - Qp[2]) / h];
    const n = F.n;
    const vr = [b.v[0] - vq[0], b.v[1] - vq[1], b.v[2] - vq[2]];
    const vn = vr[0] * n[0] + vr[1] * n[1] + vr[2] * n[2];
    const side = crossed ? (s0 > 0 ? 1 : -1) : (s1 > 0 ? 1 : -1);
    if (vn * side >= 0) return;                     // already separating
    const frame = rho > 0.86;
    const e = frame ? 0.3 : 0.82;
    // normal: bounce; tangential: the strings grip and spin it
    const vt = [vr[0] - vn * n[0], vr[1] - vn * n[1], vr[2] - vn * n[2]];
    const grip = frame ? 0.15 : 0.45;
    let out = [0, 1, 2].map((d) => vr[d] - (1 + e) * vn * n[d] - vt[d] * grip + vq[d]);
    // put it back on the right side of the face
    const push = (r - side * s1) * side;
    for (let d = 0; d < 3; d++) b.x[d] += n[d] * push;
    // spin from the brushed strings (topspin on a rising swing)
    const sw = [n[1] * vt[2] - n[2] * vt[1], n[2] * vt[0] - n[0] * vt[2], n[0] * vt[1] - n[1] * vt[0]];
    b.w = sw.map((v) => -v * grip * 4 / r * 0.1);
    let kind;
    if (frame) {
      // off the wood: a dead, skewed shot
      const k = (Math.random() - 0.5) * 0.9;
      out = [out[0] * 0.6 + out[2] * k, out[1] * 0.6 + 2.5, out[2] * 0.6 - out[0] * k];
      kind = 'mishit';
      this.msg = 'off the frame!';
    } else {
      // a clean contact: he aims it back to you (the face sets most of it)
      const sp = clamp(Math.hypot(...out), 12, 26);
      const T = [SERVER[0] + (Math.random() - 0.5) * 3, SERVER[1], SERVER[2]];
      const d = [T[0] - b.x[0], T[1] - b.x[1], T[2] - b.x[2]];
      const tau = Math.hypot(...d) / sp;
      const want = [d[0] / tau, d[1] / tau + 0.5 * BALL_G * tau * 0.85, d[2] / tau];
      const wl = Math.hypot(...want), ol = Math.hypot(...out) || 1;
      const mix = 0.6;
      const dir = [0, 1, 2].map((k) => out[k] / ol * (1 - mix) + want[k] / wl * mix);
      const dl = Math.hypot(...dir);
      out = dir.map((v) => v / dl * wl);
      // which way did it go?
      const toward = out[2] > 4 && Math.abs(Math.atan2(out[0], out[2])) < 0.6;
      kind = toward ? 'return' : 'mishit';
      this.msg = toward ? (this.stroke === STROKES.back ? 'backhand!' : 'forehand!') : 'shanked it';
    }
    // the hand feels it: the ball's change of momentum, back into the paw
    const ch = this.rig.arms[this.cfg.armR], sv = this.soft.v;
    const dp = [0, 1, 2].map((d) => (b.v[d] - out[d]) * b.mass * 0.25);
    for (const j of ch.idx.slice(-2)) for (let d = 0; d < 3; d++) sv[j * 3 + d] += clamp(dp[d], -2.5, 2.5);
    b.v = out;
    b.p = [b.x[0] - out[0] * h, b.x[1] - out[1] * h, b.x[2] - out[2] * h];
    this.hitT = this.time;
    this.hits++;
    this.events.push({ kind: 'hit', at: Q, frame });
    if (!this.outcome) this._result(kind);
  }

  _bonk(b, t) {
    const x = this.soft.x, v = this.soft.v;
    // the head's stuffing takes the blow: a squash where it landed,
    // spreading out from there
    const sp = Math.min(14, t.speed);
    const dir = [-t.n[0], -t.n[1], -t.n[2]];
    for (const i of this.cfg.head) {
      const d = Math.hypot(x[i * 3] - t.at[0], x[i * 3 + 1] - t.at[1], x[i * 3 + 2] - t.at[2]);
      const f = Math.exp(-d * d / 0.35) * 0.55 + 0.12;
      for (let k = 0; k < 3; k++) v[i * 3 + k] -= dir[k] * sp * f * 0.6;
    }
    this.daze = 1;
    this._go('dazed');
    this.drive = null;
    this.events.push({ kind: 'bonk', at: t.at, strength: Math.min(1, sp / 9) });
    this.msg = 'bonk!';
    this._result('bonk');
  }

  _result(kind) {
    if (this.outcome) return;
    this.outcome = kind;
    if (kind === 'return') {
      this.rally++;
      this.best = Math.max(this.best, this.rally);
    } else {
      this.rally = 0;
      if (kind === 'miss') this.msg = this.plan && Math.abs(this.plan.move) > 2.4 ? 'out of reach' : 'missed it';
    }
    if (this.state === 'track') this._go('recover');
  }

  readout() { return [['Rally', this.rally], ['Best', this.best]]; }
  status() { return this.msg; }
}
