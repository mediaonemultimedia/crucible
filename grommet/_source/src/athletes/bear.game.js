/* Goalkeeping, for the polar bear.

   You shoot; he keeps. He reads the ball's flight to the line he guards,
   and either takes it on the body (a step across, arms up and in front)
   or dives. The dive is the whole soft body thrown: an impulse — across,
   up, and a roll so he goes over sideways and a little forward, a belly
   flop — while his arms are re-posed up over his head toward the ball and
   his paws are pulled at it. Balance is off while he's in the air; he lands
   like a sack of stuffing, lies there a moment, then balance comes back on
   gradually and hauls him upright (never a teleport), and he shuffles home.

   A save is the ball meeting him — body, arms or gloves — and bouncing
   off, physically: the ball and the stuffing push each other apart by
   mass. A goal is the ball crossing the line inside the posts; the net
   catches it. Faster shots, and shots into the corners, give him less time
   than his dive needs, so they go in more.                               */

import { Athlete, clamp, spring, ease } from './game.js';
import { Ball } from '../ball.js';
import { makeGoalSpec, Net } from '../net.js';
import { BEAR } from './bear.rig.js';
import { rightUp, settle } from '../balance.js';

export const FOOTBALL_R = 0.3;
export const SHOOTER = [0, FOOTBALL_R, 11.5];
export const FOOTBALL_G = 14;
const LOAD = 0.1;                   // the crouch before a dive: a hard shot doesn't leave time for it      // a felt ball, kicked flat and hard: a flatter arc than the tennis ball's

export class BearGame extends Athlete {
  constructor(soft) {
    super(soft);
    this.goal = makeGoalSpec();
    this.net = new Net(this.goal);
    this.saves = 0;
    this.goals = 0;
    this.speed = 16;
    this.balanceK = 0.007;
    this.raise = spring(); this.reachSide = 0;
    this.reachPt = null;
    this.msg = 'ready';
    this._go('ready');
  }

  _springs() { return [...super._springs(), this.raise]; }

  reset() {
    super.reset();
    this.net.reset();
    this.balanceK = 0.007;
    this.reachPt = null;
    this.msg = 'ready';
  }

  /* aim: [x, y] where it should cross the goal line; speed units/s */
  launch({ aim = null, speed = this.speed } = {}) {
    const G = this.goal;
    if (!aim) {
      const s = Math.random() < 0.5 ? -1 : 1;
      aim = [s * (0.5 + Math.random() * 2.3), 0.45 + Math.random() * 2.3];
    }
    aim = [clamp(aim[0], -G.w - 1.5, G.w + 1.5), clamp(aim[1], FOOTBALL_R, G.h + 1.2)];
    const S = [aim[0] * 0.15, FOOTBALL_R, SHOOTER[2]];
    const T = [aim[0], aim[1], G.z];
    const d = Math.hypot(T[0] - S[0], T[1] - S[1], T[2] - S[2]);
    const tau = d / clamp(speed, 6, 32);
    const v = [(T[0] - S[0]) / tau, (T[1] - S[1]) / tau + 0.5 * FOOTBALL_G * tau, (T[2] - S[2]) / tau];
    this.ball = new Ball({ r: FOOTBALL_R, mass: 2.2, restitution: 0.5, roll: 1.0, x: S, v, g: FOOTBALL_G });
    this.ball.kind = 'football';
    this.outcome = null;
    this.touched = false;
    this.react = this.time + 0.15 + Math.random() * 0.04;
    this.plan = null;
    if (this.state === 'ready' || this.state === 'return') this._go('set');
    this.msg = 'set…';
    return this.ball;
  }

  _think(dt) {
    const b = this.ball, c = this.soft.cloudC[0], G = this.goal;
    this.lookAt = b && !b.dead && b.t < 4 ? b.x : null;
    if (b && (b.dead || b.t > 7)) this.ball = null;
    const up = this.soft.cloudR[0][4];

    if (this.state === 'set' && b && this.time >= this.react && !this.outcome) this._read(b);
    if (this.state === 'load' && this.t >= LOAD && b) {
      const P = this.plan.P, t = Math.max(0, this.plan.at - this.time);
      this._dive(b, P, t);
    }
    if (this.state === 'block') {
      if (this.t > 0.9) this._go('return');
    }
    if (this.state === 'dive') {
      // down again: any of the body on the floor after the top of the leap
      // (a trailing foot dragging the floor isn't a landing: he's down when
      // his middle is)
      let touch = 0;
      for (const i of this.rig.clouds[0].ix) touch += this.soft.contact[i];
      if ((this.t > 0.3 && touch > 6 && c[1] < 1.1) || this.t > 1.6) this._go('down');
    }
    if (this.state === 'down') {
      ease(this.raise, 0, 18, dt);
      if (this.t > 0.85) this._go('getup');
    }
    if (this.state === 'getup') {
      // he heaves himself up (balance.js: rightUp, a damped velocity servo,
      // per substep); balance proper eases back in for the last of it
      if (up > 0.95) this._steady = Math.min(1, (this._steady || 0) + dt / 0.6);
      this.balanceK = 0.007 * (this._steady || 0) ** 2;
      if (this._steady >= 1) { this._steady = 0; this.balanceK = 0.007; this._go('return'); }
      if (this.t > 6) { this._steady = 0; this.balanceK = 0.007; this._go('return'); }
    }
    if (this.state === 'return') {
      this.drive = { x: this.home[0], z: this.home[1], speed: 2.4 };
      ease(this.raise, 0, 40, dt);
      if (Math.hypot(c[0] - this.home[0], c[2] - this.home[1]) < 0.1 && this.t > 0.3) { this.drive = null; this._go('ready'); }
    }
    if (this.state === 'ready') ease(this.raise, 0, 40, dt);
    if (this.state === 'block' || this.state === 'set') ease(this.raise, this.plan?.raise ?? 0, 160, dt);
    if (this.state === 'dive') ease(this.raise, 1, 260, dt);

    // judge the shot
    if (b && !this.outcome) {
      const z = b.x[2];
      if (z < G.z - b.r * 0.3) {
        const inside = Math.abs(b.x[0]) < G.w - 0.05 && b.x[1] < G.h - 0.05;
        // pushed round the post (or over the bar) by the keeper: a save
        this._result(inside ? 'goal' : this.touched ? 'save' : 'wide');
      } else if (this.touched && ((b.v[2] > 1 && z > G.z + 0.8) || (b.speed() < 1.2 && b.t > 1) || this.time - this.touchT > 1.6)) this._result('save');
      else if (b.t > 3.5) this._result('wide');
    }
  }

  /* read the shot, every step until he commits: where it crosses the line
     he stands on, and how long he has. Shuffle across if his feet can get
     him there; otherwise dive — late enough that he's still in the air,
     stretched out, when it arrives                                       */
  _read(b) {
    const c = this.soft.cloudC[0], G = this.goal;
    const zl = c[2] + 0.35;
    const t = b.timeToZ(zl);
    if (!Number.isFinite(t)) return;
    const P = b.at(t);
    const tg = b.timeToZ(G.z), Pg = b.at(tg);
    const onTarget = Math.abs(Pg[0]) < G.w + 0.25 && Pg[1] < G.h + 0.25;
    const dx = P[0] - c[0];
    this.plan = { P, t, at: this.time + t, side: Math.sign(dx) || 1, raise: P[1] > 1.6 ? 0.8 : 0.45 };
    if (!onTarget) { this.plan.raise = 0.2; this.drive = null; this.msg = 'watching it go'; this._go('block'); return; }
    const body = 0.9;
    if (Math.abs(dx) < body && P[1] < 2.9) {
      // into the body: a step across, arms up in front
      this.drive = { x: c[0] + dx * 0.8, z: this.home[1], speed: 3 };
      this.msg = 'got it covered';
      this._go('block');
      return;
    }
    // can his feet get him there in time? then shuffle and take it on the body
    const feet = 2.6 * Math.max(0, t - 0.15);
    const D = Math.abs(dx) - body;
    if (D < feet * 0.8 && P[1] < 2.9) {
      this.drive = { x: P[0] - Math.sign(dx) * 0.3, z: this.home[1], speed: 3.2 };
      this.msg = 'across…';
      return;
    }
    // no: dive, when there's just the flight of a dive left (a low ball is
    // a fall to the side, quicker than a leap for a high one) — after a
    // beat to load his legs, which is what a hard shot doesn't leave him
    if (t <= (P[1] < 1.2 ? 0.38 : 0.46) + LOAD) { this.plan.loadAt = this.time; this._go('load'); this.msg = 'set…'; return; }
    // meanwhile, edge that way
    this.drive = { x: c[0] + Math.sign(dx) * 0.6, z: this.home[1], speed: 2 };
    this.msg = 'set…';
  }

  _dive(b, P, t) {
    const soft = this.soft, c = soft.cloudC[0], g = soft.params.gravity;
    const s = Math.sign(P[0] - c[0]) || 1;
    // with his arms up and out that way, his paws are about here from his
    // middle; so his middle has to get to P minus that, in the time left —
    // a ballistic throw (it's all the same stuffing in the air)
    const tt = clamp(t, 0.26, 0.5);
    const oy = clamp(P[1] - c[1], -0.35, 1.1);
    const arm = [s * (BEAR.SHOULDER + BEAR.ARM_LEN * 0.8), oy];
    const dx = P[0] - c[0] - arm[0], dy = P[1] - (c[1] + arm[1]);
    const vx = clamp(dx / tt, -4.8, 4.8);
    const vy = clamp(dy / tt + 0.5 * g * tt, 2.2, 9.5);
    // over sideways (roll about z) and a little forward (about x): a low
    // ball is a full-length belly flop, a high one a leap
    const low = clamp(1 - (P[1] - 0.5) / 2.4, 0, 1);
    const wz = -s * (0.9 + 0.9 * low), wx = 0.5 + 0.6 * low;
    soft.impulse((i, x, y, z) => {
      const rx = x - c[0], ry = y - c[1], rz = z - c[2];
      return [vx + (0 * rz - wz * ry), vy + (wz * rx - wx * rz), 0.3 + (wx * ry - 0 * rx)];
    });
    this.balanceK = 0;
    this.drive = null;
    this.plan.dive = true;
    this.reachSide = s;
    this.reachPt = P;
    this.msg = s < 0 ? 'diving right!' : 'diving left!';
    this._go('dive');
  }

  _bones() {
    const r = this.raise.x;
    if (r < 0.01) return [];
    const out = [];
    for (const k of [this.cfg.armR, this.cfg.armL]) {
      const ch = this.rig.arms[k], rest = this.rig.rest, i0 = ch.idx[0], i1 = ch.idx[ch.idx.length - 1];
      const d0 = [rest[i1 * 3] - rest[i0 * 3], rest[i1 * 3 + 1] - rest[i0 * 3 + 1], rest[i1 * 3 + 2] - rest[i0 * 3 + 2]];
      const l0 = Math.hypot(...d0);
      const sideOfArm = Math.sign(rest[i0 * 3]);
      let want;
      if (this.state === 'dive' || (this.state === 'down' && this.reachSide)) {
        // both arms out at the ball, in his own (tumbling) frame
        const P = this.reachPt, i0w = soft0(this.soft, i0);
        const l = this.toLocal([P[0] - i0w[0], P[1] - i0w[1], P[2] - i0w[2]]);
        const ll = Math.hypot(...l) || 1;
        want = [l[0] / ll + sideOfArm * 0.12, l[1] / ll + 0.15, l[2] / ll + 0.1];
      } else {
        // a keeper's ready: arms up and out in front
        want = [sideOfArm * 0.45, 0.25 + 0.5 * r, 0.75];
      }
      const wl = Math.hypot(...want);
      const dir = [0, 1, 2].map((d) => d0[d] / l0 * (1 - r) + want[d] / wl * r);
      out.push(this.armBone(k, dir));
    }
    return out;
  }

  /* per substep: the reach, the posts, the net, the ball */
  _push(h) {
    const soft = this.soft, x = soft.x, hh = h * h;
    // a diving keeper's paws stretch for the ball, until it's past
    if ((this.state === 'dive' || this.state === 'down') && this.ball && this.reachPt && !this.outcome && this.ball.x[2] > this.goal.z - 0.3) {
      const B = this.ball.x;
      for (const k of [this.cfg.armR, this.cfg.armL]) {
        const idx = this.rig.arms[k].idx;
        for (const j of [idx.length - 1, idx.length - 2]) {
          let dx = B[0] - x[j * 3], dy = B[1] - x[j * 3 + 1], dz = B[2] - x[j * 3 + 2];
          const d = Math.hypot(dx, dy, dz);
          if (d > 3.2 || d < 1e-6) continue;
          const f = 120 * Math.min(1, d) / d;
          x[j * 3] += dx * f * hh; x[j * 3 + 1] += dy * f * hh; x[j * 3 + 2] += dz * f * hh;
        }
      }
    }
    // a landing flops rather than rolls on
    if (this.state === 'down' && this.t < 0.45) settle(soft, h, 7);
    // hauling himself back up
    if (this.state === 'getup') rightUp(soft, h, { standY: this.c0[1], k: 6 * Math.min(1, this.t / 0.5) });
    // the posts and crossbar are solid to him too, and he stays out in
    // front of his line (he can fall against the net, not into the goal)
    for (const [a, c, r] of this.goal.posts) capsulePush(soft, a, c, r);
    const zl = this.goal.z + 0.05;
    for (let i = 0; i < soft.n; i++) if (x[i * 3 + 2] < zl + soft.r[i]) x[i * 3 + 2] = zl + soft.r[i];
    // the net only needs simulating while something is moving it
    const b = this.ball;
    const near = b && b.x[2] < this.goal.z + 1.2 && b.x[2] > this.goal.zb - 1;
    if (near || this.net.energy > 1e-4) {
      this.net.step(h);
      if (near) this.net.collide(b, h);
    }
  }

  _ballStep(h) {
    const b = this.ball;
    b.step(h, this.soft, (ball) => { for (const [a, c, r] of this.goal.bars) ball.collideCapsule(a, c, r, 0.55); });
    const t = b.touch;
    if (t && t.speed > 0.3 && !this.outcome) {
      if (!this.touched) this.events.push({ kind: 'save', at: t.at });
      this.touched = true;
      this.touchT = this.time;
    }
  }

  _result(kind) {
    if (this.outcome) return;
    this.outcome = kind;
    if (kind === 'goal') { this.goals++; this.msg = 'goal!'; }
    else if (kind === 'save') { this.saves++; this.msg = 'saved!'; }
    else this.msg = 'wide';
  }

  readout() { return [['Saves', this.saves], ['Goals', this.goals]]; }
  status() { return this.msg; }
}

const soft0 = (soft, i) => [soft.x[i * 3], soft.x[i * 3 + 1], soft.x[i * 3 + 2]];

/* push the plush's points out of a capsule */
function capsulePush(soft, a, c, cr) {
  const { x, r, n } = soft;
  const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
  const l2 = dx * dx + dy * dy + dz * dz;
  for (let i = 0; i < n; i++) {
    const px = x[i * 3], py = x[i * 3 + 1], pz = x[i * 3 + 2];
    let t = ((px - a[0]) * dx + (py - a[1]) * dy + (pz - a[2]) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = px - (a[0] + dx * t), qy = py - (a[1] + dy * t), qz = pz - (a[2] + dz * t);
    const m = cr + r[i];
    if (Math.abs(qx) > m || Math.abs(qz) > m) continue;
    const d = Math.hypot(qx, qy, qz);
    if (d >= m || d < 1e-9) continue;
    const f = (m - d) / d;
    x[i * 3] += qx * f; x[i * 3 + 1] += qy * f; x[i * 3 + 2] += qz * f;
  }
}
