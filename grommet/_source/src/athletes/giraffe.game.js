/* Ring toss, for the giraffe.

   You toss him soft felt rings. His head and eyes follow each one up and
   over; he reads where it will come down and stretches or dips his long
   neck to get his ossicones under it — the neck re-posed about its root
   (shape memory hauls the stuffing after it, lagging and swaying), plus a
   pull on the head toward where it has to be, the body taking the
   reaction. A ring that drops over his ossicones is caught: he flicks his
   nose up, and it slides down his neck — a rigid ring threaded on the
   neck, held round it, sliding with friction — and stacks on the ones
   before it at the base.

   Each ring weighs on him: the neck sags further forward the more there
   are, and its sway (a spring the size of the stack: heavier, slower,
   bigger) wobbles more. Past STACK_MAX, or when a ring clonks him on the
   head, he dips his neck and gives a big shake: the rings slide down it
   toward his head and off over his ossicones, and fly.

   Misses bounce off him, land and roll; Collect clears the floor.       */

import { Athlete, clamp, spring, ease, TAU } from './game.js';
import { Ring, RING, RING_G, ringPair } from '../ring.js';
import { GIRAFFE } from './giraffe.rig.js';

export const THROWER = [0, 2.2, 8.5];
export const STACK_MAX = 6;
export const STAGE = [[0, -5, 5], [2, -3.6, 5]];   // where rings can roll to: [axis, min, max]
const CLONK_V = 4.2;                              // a ring this fast into his head
const MU = 0.35;                                  // felt on fur
const MAX_RINGS = 14;
const HUES = 6;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/* the rotation vector taking direction a onto direction b, at most `max` */
function rotBetween(a, b, max = Math.PI) {
  const ax = cross(a, b), s = len(ax), c = dot(a, b);
  const ang = Math.min(max, Math.atan2(s, c));
  return s > 1e-9 ? ax.map((v) => v / s * ang) : [0, 0, 0];
}

export class GiraffeGame extends Athlete {
  constructor(soft) {
    super(soft);
    this.balanceK = 0.007;
    this.speed = 15;
    this.rings = [];
    this.nextId = 1;
    this.best = 0;
    this.catches = 0;
    this.shakes = 0;
    this.msg = 'ready';
    const rest = this.rig.rest, cfg = this.cfg;
    const neck = this.rig.arms[cfg.neck];
    this.neckCh = neck;
    const N = neck.idx.length;
    const P = (i) => [rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]];
    this.pivotRest = P(neck.idx[0]);
    this.topRest = P(neck.idx[N - 1]);
    this.hornK = cfg.horns.map((k) => this.rig.arms[k]);
    this.tipRest = this._hornMid(P);
    this.neckL = len(sub(this.topRest, this.pivotRest));
    this.tipOff = sub(this.tipRest, this.topRest);
    // the neck bone: the neck turned about its root, more toward the top,
    // carrying the head and all that rides on it
    const ix = [], w = [];
    for (let j = 1; j < N; j++) { ix.push(neck.idx[j]); w.push(Math.min(1, j / (N - 2))); }
    // (the head's own points only: the ears and ossicones remember their
    // places on the head, in the head's frame — posing them too would turn
    // them twice)
    for (const i of cfg.skull) if (!ix.includes(i)) { ix.push(i); w.push(1); }
    this.neckBone = { ix: Int32Array.from(ix), w: Float64Array.from(w), pivot: this.pivotRest };
    this.neckTop = neck.idx[N - 1];
    // the neck's bending windows near its root: eased off for a shake, so the
    // neck can hinge down at the shoulders (its stuffing still holds its line)
    this.rootWin = [];
    this.rig.windows.forEach((w, k) => { if ([neck.anchor, neck.idx[0], neck.idx[1], neck.idx[2]].includes(w[1]) && neck.idx.includes(w[2])) this.rootWin.push(k); });
    this.rootWinK = this.rootWin.map((k) => this.rig.windowK[k]);
    // the neck's pose: aim (eased), sag and sway (springs), the shake
    this.aim = [spring(), spring(), spring()];
    this.aimT = [0, 0, 0];
    this.sag = spring(); this.sway = spring();
    this.flick = spring();           // the nose tossed up after a catch, radians
    this.dip = spring();              // the neck lowered for a shake
    this.shakeA = 0; this.shakePh = 0;
    this.reach = 0;                   // how hard he pulls his head toward the aim
    this.reachAt = null;
    this.aimZ = GIRAFFE.HEAD.c[2];    // tool 4 aims across this plane
    this.target = null;
    this.path = null;
    this._go('ready');
  }

  _springs() { return [...super._springs(), ...this.aim, this.sag, this.sway, this.flick, this.dip]; }

  _hornMid(P) {
    const a = this.hornK[0].idx, b = this.hornK[1].idx;
    const pa = P(a[a.length - 1]), pb = P(b[b.length - 1]);
    return [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
  }

  hornTip() {
    const x = this.soft.x;
    return this._hornMid((i) => [x[i * 3], x[i * 3 + 1], x[i * 3 + 2]]);
  }

  reset() {
    super.reset();
    this.rings = [];
    this.target = null;
    this.aimT = [0, 0, 0];
    this.shakeA = 0;
    this.reach = 0;
    this.lean = null;
    this.face = 0;
    this.msg = 'ready';
  }

  get ball() { return null; }
  set ball(v) { /* the giraffe's things are rings, not one ball */ }
  get items() { return null; }

  onNeck() { return this.rings.filter((r) => r.state === 'neck'); }

  /* ── tossing ─────────────────────────────────────────────────────────── */

  /* aim: [x, y] where it should come down through his head's plane (aimZ) */
  launch({ aim = null, speed = this.speed } = {}) {
    const live = this.rings.filter((r) => r.state !== 'gone');
    if (live.length >= MAX_RINGS) {
      const old = live.find((r) => r.state === 'free' && r.floor) || live.find((r) => r.state === 'free');
      if (old) old.state = 'gone';
    }
    if (!aim) {
      const t = this.hornTip();
      aim = [t[0] + (Math.random() - 0.5) * 1.0, t[1] - 0.1 + (Math.random() - 0.5) * 0.5];
    }
    aim = [clamp(aim[0], -4, 4), clamp(aim[1], 1, 6)];
    const S = [THROWER[0] + aim[0] * 0.15, THROWER[1], THROWER[2]];
    const T = [aim[0], aim[1], this.aimZ];
    const d = len(sub(T, S));
    // a lob, coming down onto him: the pace slider sets how long it hangs
    const tau = d / clamp(speed * 0.5, 4, 12);
    const v = [(T[0] - S[0]) / tau, (T[1] - S[1]) / tau + 0.5 * RING_G * tau, (T[2] - S[2]) / tau];
    // tossed flat, tipped a little back toward you, spinning
    const axis = [(Math.random() - 0.5) * 0.12, 1, 0.16 + (Math.random() - 0.5) * 0.1];
    const ring = new Ring({ x: S, v, axis, spin: 7 + Math.random() * 4, hue: (this.nextId - 1) % HUES });
    ring.id = this.nextId++;
    ring.tossed = true;
    this.rings.push(ring);
    if (!['shake', 'clonk'].includes(this.state)) { this.target = ring; this.react = this.time + 0.1; this._go('track'); this.msg = 'eyes on it…'; }
    return ring;
  }

  collect() {
    let n = 0;
    for (const r of this.rings) if (r.state === 'free' || r.state === 'hand') { r.state = 'gone'; n++; }
    this.rings = this.rings.filter((r) => r.state !== 'gone');
    return n;
  }

  /* ── the Hand on a ring ──────────────────────────────────────────────── */

  itemAt(origin, dir) {
    let best = null, bt = 1e9;
    for (const r of this.rings) {
      if (r.state !== 'free') continue;
      const o = sub(r.x, origin), t = dot(o, dir);
      if (t < 0) continue;
      const d2 = dot(o, o) - t * t, R = r.R + r.r + 0.05;
      if (d2 < R * R && t < bt) { bt = t; best = r; }
    }
    return best ? { id: best.id, point: [...best.x] } : null;
  }

  grabItem(id) {
    const r = this.rings.find((q) => q.id === id);
    if (!r || r.state !== 'free') return false;
    r.state = 'hand';
    r.tossed = false;
    r.handV = [0, 0, 0];
    return true;
  }

  moveItem(id, p) {
    const r = this.rings.find((q) => q.id === id);
    if (!r || r.state !== 'hand') return false;
    const y = Math.max(r.r + 0.02, p[1]);
    r.handV = [(p[0] - r.x[0]) * 30, (y - r.x[1]) * 30, (p[2] - r.x[2]) * 30];
    r.x = [p[0], y, p[2]]; r.p = [...r.x];
    r.setAxis([0, 1, 0]);
    r.w = [0, 0, 0];
    return true;
  }

  releaseItem(id) {
    const r = this.rings.find((q) => q.id === id);
    if (!r || r.state !== 'hand') return;
    r.state = 'free';
    const v = r.handV || [0, 0, 0], sp = len(v);
    r.v = sp > 6 ? v.map((c) => c * 6 / sp) : v;
    r.sleep = 0;
  }

  /* ── every fixed step ────────────────────────────────────────────────── */

  _think(dt) {
    this.rings = this.rings.filter((r) => r.state !== 'gone' && !r.dead);
    const on = this.onNeck();
    let look = null, aimT = [0, 0, 0], flickT = 0, dipT = 0;
    this.reach = 0;
    this.drive = null;
    this.daze = Math.max(0, this.daze - dt * 0.9);

    if (this.auto && this.state === 'ready' && this.time > (this.nextAuto || 0) && !this.rings.some((r) => r.tossed && r.state === 'free')) {
      this.nextAuto = this.time + 1.8;
      this.launch();
    }

    switch (this.state) {
      case 'ready': {
        // watch anything still moving: a ring in flight, one rolling away
        const mv = this.rings.find((r) => r.state === 'free' && !r.floor && r.speed() > 0.5) || this.rings.find((r) => r.state === 'hand');
        look = mv ? mv.x : null;
        if (on.length > STACK_MAX && this._settled(on)) { this._startShake('that’s enough!'); break; }
        break;
      }
      case 'track': {
        const T = this.target;
        if (!T || T.state === 'gone' || T.state === 'hand') { this._go('ready'); break; }
        if (T.state === 'neck') { this._go('caught'); break; }
        // (a ring right at his head gives no direction to look in)
        look = len(sub(T.x, this.headCentre())) > 0.9 ? T.x : null;
        if (!T.tossed) { this.msg = this.msg === 'eyes on it…' ? 'missed' : this.msg; this.after = this.time + 0.5; this._go('miss'); break; }
        // gone past him, below his ossicones: that one's a miss
        const tip = this.hornTip();
        if (T.v[1] < 0 && T.x[1] < tip[1] - 0.45 && T.x[2] < tip[2] + 0.6) { T.tossed = false; this.msg = 'missed'; break; }
        if (this.time >= this.react) aimT = this._plan(T);
        else this.corr = null;
        break;
      }
      case 'caught': {
        // a toss of the nose: the ring slips past his head onto the neck
        flickT = this.t < 0.55 ? 0.55 : 0;
        look = null;
        this._look = [0, 0];
        if (this.t > 0.9) this._go('ready');
        break;
      }
      case 'miss': {
        const T = this.target;
        look = T && T.state === 'free' ? T.x : null;
        if (this.t > 0.9) this._go('ready');
        break;
      }
      case 'clonk': {
        flickT = -0.25;
        if (this.t > 0.45) this._startShake(on.length ? 'shake it off!' : 'ow');
        break;
      }
      case 'shake': {
        // down goes the neck, nose to the floor, then side to side, hard —
        // feet planted where he stands
        dipT = 1;
        this.drive = { x: this.shakeAt[0], z: this.shakeAt[1], speed: 0.5 };
        const t = this.t;
        this.shakeA = t < 0.35 ? 0 : Math.min(1, (t - 0.35) / 0.25) * (t > this.shakeEnd ? Math.max(0, 1 - (t - this.shakeEnd) / 0.3) : 1);
        this.shakePh += dt * 2.6;
        if (this.shakeEnd === Infinity && t > 1.2 && !on.length) this.shakeEnd = t;
        if (t > 3.4 && this.shakeEnd === Infinity) this.shakeEnd = t;
        if (t > this.shakeEnd + 0.35) { this.shakeA = 0; this._go('recover'); this.msg = on.length ? 'phew' : 'all off'; }
        break;
      }
      case 'recover': {
        if (this.t > 1) this._go('ready');
        break;
      }
    }
    this.lookAt = look;

    // the aim eases in (and back out): a whole neck swung over, not snapped
    for (let d = 0; d < 3; d++) ease(this.aim[d], aimT[d], this.state === 'track' ? 70 : 30, dt);
    ease(this.flick, flickT, 90, dt);
    ease(this.dip, dipT, 22, dt);

    // the stack's weight: the neck sags forward under it, and sways as a
    // spring the size of the stack (heavier is slower, and swings wider)
    const n = on.length;
    let sagT = 0;
    for (const r of on) sagT += 0.035 + 0.06 * clamp(1 - (r.s ?? 0) / (this.pathLen || 1), 0, 1);
    const om = TAU * 1.5 / Math.sqrt(1 + 0.35 * n), z = 0.16 / (1 + 0.1 * n);
    this.sag.v += (om * om * (sagT - this.sag.x) - 2 * z * om * this.sag.v) * dt;
    this.sag.x += this.sag.v * dt;
    this.sway.v += (om * om * (0 - this.sway.x) - 2 * z * om * this.sway.v) * dt;
    this.sway.x += this.sway.v * dt;
  }

  _settled(on) { return on.every((r) => r.rest); }

  _startShake(msg) {
    this.msg = msg;
    this.shakes++;
    this.shakeEnd = Infinity;
    this.shakePh = 0;
    this.target = null;
    const c = this.soft.cloudC[0];
    this.shakeAt = [c[0], c[2]];
    this._go('shake');
  }

  /* read the toss: the first point of its fall where his ossicones can be
     — the top of his neck that far from its root, his head held level —
     and the neck's turn to put them there                                 */
  _plan(T) {
    const g = RING_G, c = this.soft.cloudC[0];
    const pivot = this.worldOf(this.pivotRest);
    const L = this.neckL;
    let pick = null, near = null, nd = 1e9;
    for (let t = 0; t < 2.5; t += 1 / 60) {
      const vy = T.v[1] - g * t;
      if (vy > 0) continue;
      const Q = [T.x[0] + T.v[0] * t, T.x[1] + T.v[1] * t - 0.5 * g * t * t, T.x[2] + T.v[2] * t];
      if (Q[1] < 0.4) break;
      const top = sub(Q, this.tipOff);
      const d = len(sub(top, pivot));
      // as low as his neck goes (a dip to a little above level)
      if (top[1] < pivot[1] + 0.35) continue;
      const ok = d < L * 1.08 && d > L * 0.5;
      if (ok) { pick = { Q, top, t, d }; break; }
      if (d < nd) { nd = d; near = { Q, top, t, d }; }
    }
    const P = pick || near;
    if (!P) return [0, 0, 0];
    // out of reach: stretch for it, and a step or two that way
    this.reach = clamp((P.d - L * 0.95) / 0.5, 0, 1) * (pick ? 0.6 : 1) + 0.35;
    this.reachAt = P.top;
    this.tipAt = P.Q;
    if (!pick && P.d > L * 1.08) {
      const h = [P.top[0] - pivot[0], P.top[2] - pivot[2]], hl = Math.hypot(h[0], h[1]) || 1;
      const k = Math.min(1.1, P.d - L) / hl;
      this.drive = { x: clamp(c[0] + h[0] * k, this.home[0] - 1.2, this.home[0] + 1.2), z: clamp(c[2] + h[1] * k, this.home[1] - 0.8, this.home[1] + 1), speed: 1.6 };
    }
    this.msg = pick ? 'under it…' : 'stretch…';
    // what the neck's own weight and lag leave him short by, learned as he
    // goes (he watches his ossicones miss the spot and corrects)
    const tip = this.hornTip(), corr = this.corr || (this.corr = [0, 0, 0]);
    for (let d = 0; d < 3; d++) corr[d] = clamp(corr[d] + (P.Q[d] - tip[d]) * 2.5 / 120, -0.7, 0.7);
    const goal = [P.top[0] + corr[0], P.top[1] + corr[1], P.top[2] + corr[2]];
    // the turn of the neck, in his own (rest) frame
    const R = this.soft.cloudR[0], w = sub(goal, c);
    const tl = [this.c0[0] + R[0] * w[0] + R[3] * w[1] + R[6] * w[2], this.c0[1] + R[1] * w[0] + R[4] * w[1] + R[7] * w[2], this.c0[2] + R[2] * w[0] + R[5] * w[1] + R[8] * w[2]];
    const rv = rotBetween(sub(this.topRest, this.pivotRest), sub(tl, this.pivotRest), 1.25);
    // (sideways, a neck only bends so far)
    rv[2] = clamp(rv[2], -0.6, 0.6);
    return rv;
  }

  /* ── the pose ────────────────────────────────────────────────────────── */

  _neckRv() {
    const a = this.aim.map((s) => s.x);
    return [a[0] + this.sag.x, a[1], a[2] + this.sway.x];
  }

  /* the shake: the neck lowered forward, then swung side to side */
  _shakeRv() {
    const sw = this.shakeA * Math.sin(this.shakePh * TAU) * 0.5;
    return [this.dip.x * 1.75, sw, sw * 0.3];
  }

  _applyPose() {
    const { cfg } = this;
    const nv = this._neckRv();
    const quiet = Math.abs(nv[0]) + Math.abs(nv[1]) + Math.abs(nv[2]) + this.dip.x + this.shakeA < 2e-4 && Math.abs(this.yaw.x) + Math.abs(this.pitch.x) + Math.abs(this.perk.x) + Math.abs(this.flick.x) < 2e-4 &&
      this._springs().every((s) => Math.abs(s.v) < 2e-3);
    if (quiet) { if (this.pose.active) this.pose.release(); return; }
    // the head on top: held level against most of the neck's turn (so his
    // ossicones point up), and looking — except in a shake, nose down
    const level = 0.9 * (1 - this.dip.x);
    const look = 1 - 0.5 * (this.state === 'track' ? 1 : 0);
    const sh = this._shakeRv();
    const bones = [
      // a shake turns the whole neck down at its root (a straight slope for
      // the rings to slide off), and swings it
      ...(this.dip.x > 1e-3 || this.shakeA > 0 ? [{ ix: this.neckBone.ix, rv: sh, pivot: this.pivotRest }] : []),
      { ...this.neckBone, rv: nv },
      {
        ix: cfg.skull, pivotIx: this.neckTop,
        rv: [-this.pitch.x * look - nv[0] * level - this.flick.x + this.dip.x * 0.5, this.yaw.x - nv[1] * level, -nv[2] * level],
      },
      ...cfg.ears.map((e) => ({ ix: e.ix, rv: [this.perk.x * 0.3 - this.dip.x * 0.4, this.earTurn.x * 0.3, 0], pivotIx: e.root })),
    ];
    this.pose.apply(bones);
  }

  /* ── every substep ───────────────────────────────────────────────────── */

  _push(h) {
    const soft = this.rootWin.length && this.dip.x;
    this.rootWin.forEach((k, j) => { this.rig.windowK[k] = this.rootWinK[j] * (1 - 0.92 * clamp(soft, 0, 1)); });
    this._buildPath();
    if (this.reach > 0.01 && this.tipAt) this._reachForce(h * h);
    this._ringsStep(h);
  }

  /* the head pulled toward where its neck top has to be; the body takes
     the reaction, so he doesn't haul himself over */
  _reachForce(hh) {
    const x = this.soft.x, ix = this.cfg.head, m = ix.length;
    // toward where his ossicones have to be, by how far off they are now
    let g = sub(this.tipAt, this.hornTip());
    const d = len(g);
    if (d > 0.8) g = g.map((v) => v / d * 0.8);
    const F = this._pull || (this._pull = [0, 0, 0]), e = Math.min(1, 8 * Math.sqrt(hh));
    for (let k = 0; k < 3; k++) F[k] += (g[k] - F[k]) * e;
    const k = 60 * this.reach * hh;
    for (const i of ix) { x[i * 3] += F[0] * k; x[i * 3 + 1] += F[1] * k; x[i * 3 + 2] += F[2] * k; }
    this.soft._shift(this.rig.clouds[0].ix, -F[0] * k * m, -F[1] * k * m, -F[2] * k * m);
  }

  /* the line a caught ring is threaded on, top first: between his ossicone
     tips, the middle of his head, down the neck to its root              */
  _buildPath() {
    const x = this.soft.x, P = (i) => [x[i * 3], x[i * 3 + 1], x[i * 3 + 2]];
    const idx = this.neckCh.idx, N = idx.length;
    // (through the top of his head, between the ossicones' roots: the
    // line the ring has to pass his head along)
    const a = this.hornK[0].idx[0], b = this.hornK[1].idx[0];
    const hb = [(x[a * 3] + x[b * 3]) / 2, (x[a * 3 + 1] + x[b * 3 + 1]) / 2, (x[a * 3 + 2] + x[b * 3 + 2]) / 2];
    const nodes = [this.hornTip(), hb], rad = [0.13, 0.2], pt = [-1, -1];
    for (let j = N - 1; j >= 0; j--) { nodes.push(P(idx[j])); rad.push(this.neckCh.radius(j / (N - 1))); pt.push(idx[j]); }
    const cum = [0];
    for (let k = 1; k < nodes.length; k++) cum.push(cum[k - 1] + len(sub(nodes[k], nodes[k - 1])));
    // the bottom of the stack: a little above where the neck meets him
    const base = cum[nodes.length - 2] + 0.55 * (cum[nodes.length - 1] - cum[nodes.length - 2]);
    this.path = { nodes, rad, pt, cum, base };
    this.pathLen = base;
  }

  /* the nearest point of the path: arc length, centre, tangent (down the
     path), the neck's radius there, and the segment */
  _project(p, near = -1) {
    const { nodes, cum, rad } = this.path;
    let best = null;
    // a ring threaded on the neck stays near where it was along it: search
    // the segments round its last one (the nearest overall can be across a
    // bend, and a jump there is a kick)
    const k0 = near >= 0 ? Math.max(0, near - 1) : 0, k1 = near >= 0 ? Math.min(nodes.length - 1, near + 2) : nodes.length - 1;
    for (let k = k0; k < k1; k++) {
      const a = nodes[k], b = nodes[k + 1], ab = sub(b, a), L2 = dot(ab, ab);
      const t = clamp(L2 > 1e-12 ? dot(sub(p, a), ab) / L2 : 0, 0, 1);
      const c = [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t];
      const d = len(sub(p, c));
      if (!best || d < best.d - 1e-9) {
        const L = Math.sqrt(L2) || 1;
        best = { d, k, t, c, tan: ab.map((v) => v / L), s: cum[k] + t * L, rn: rad[k] + (rad[k + 1] - rad[k]) * t };
      }
    }
    // before the top: extend along the first segment
    if (best.k === 0 && best.t === 0) {
      const tn = best.tan, a = nodes[0];
      const s = dot(sub(p, a), tn);
      if (s < 0) { best.s = s; best.c = [a[0] + tn[0] * s, a[1] + tn[1] * s, a[2] + tn[2] * s]; }
    }
    return best;
  }

  _ringsStep(h) {
    const soft = this.soft;
    const free = [], neck = [];
    for (const r of this.rings) {
      r._h = h;
      if (r.state === 'free') free.push(r);
      else if (r.state === 'neck') neck.push(r);
      else if (r.state === 'hand') { r.p = [...r.x]; }
    }
    for (const r of free) r.integrate(h);
    for (const r of neck) this._neckRing(r, h);
    this._stack(neck, h);
    for (const r of neck) {
      for (let d = 0; d < 3; d++) r.v[d] = (r.x[d] - r.p[d]) / h;
      // felt on fur is dead: knocks against the neck don't bounce
      if (r.tan) {
        const vt = dot(r.v, r.tan);
        const lat = r.v.map((c, d) => c - r.tan[d] * vt), ll = len(lat), k = Math.min(1, 3 / (ll || 1)) * Math.exp(-4 * h);
        for (let d = 0; d < 3; d++) r.v[d] = r.tan[d] * vt + lat[d] * k;
      }
      const sp = len(r.v);
      if (sp > 20) for (let d = 0; d < 3; d++) r.v[d] *= 20 / sp;
      this._exit(r);
    }
    // free rings: against him, each other, the stack, the floor
    const c = soft.cloudC[0];
    for (const r of free) {
      if (r.sleep > 40 && !this._nearBody(r, c, 0.4)) { r.finish(h); continue; }
      if (this._nearBody(r, c, 0)) this._softCollide(r, this.time < (r.ghost || 0));
    }
    for (let a = 0; a < free.length; a++) {
      for (let b = a + 1; b < free.length; b++) ringPair(free[a], free[b]);
      for (const q of neck) ringPair(free[a], q, false);
    }
    for (const r of free) {
      r.floorStep();
      // the edge of the mat: a ring rolling off it is stopped there
      if (r.x[1] < r.R + 0.3) for (const [d, lo, hi] of STAGE) {
        if (r.x[d] < lo) { r.x[d] = lo; r.v[d] = Math.abs(r.v[d]) * 0.2; }
        else if (r.x[d] > hi) { r.x[d] = hi; r.v[d] = -Math.abs(r.v[d]) * 0.2; }
      }
      r.finish(h);
      if (r.floor && r.tossed && r.t > 0.1) { r.tossed = false; if (this.target === r && this.state === 'track') this.msg = 'missed'; }
      if (r.state === 'free' && this.time > (r.noCatch || 0)) this._tryCatch(r);
    }
  }

  _nearBody(r, c, pad) {
    return Math.hypot(r.x[0] - c[0], r.x[2] - c[2]) < 3.4 + pad && r.x[1] < 5.4 + pad;
  }

  /* a ring against the plush: the exact distance from each stuffing point
     to its centreline circle. The ring is light: it gives way, the plush
     a little; a hard one into his head is a clonk                         */
  _softCollide(r, ghost = false) {
    const s = this.soft, X = s.x, V = s.v, Rr = s.r, n = s.n, reach = r.R + r.r + 0.2;
    let clonk = 0, at = null;
    const inHead = this._inHead || (this._inHead = (() => { const m = new Uint8Array(n); for (const i of this.cfg.core) m[i] = 1; return m; })());
    for (let i = 0; i < n; i++) {
      const dx = X[i * 3] - r.x[0], dy = X[i * 3 + 1] - r.x[1], dz = X[i * 3 + 2] - r.x[2];
      if (dx > reach || dx < -reach || dy > reach || dy < -reach || dz > reach || dz < -reach) continue;
      if (ghost && s.cloudMask[i] & 2) continue;
      const p = [X[i * 3], X[i * 3 + 1], X[i * 3 + 2]];
      const nb = r.nearest(p);
      if (!nb) continue;
      const m = r.r + Rr[i] * 0.85;
      if (nb.d >= m) continue;
      const pen = m - nb.d, N = nb.n;
      X[i * 3] += N[0] * pen * 0.2; X[i * 3 + 1] += N[1] * pen * 0.2; X[i * 3 + 2] += N[2] * pen * 0.2;
      for (let d = 0; d < 3; d++) r.x[d] -= N[d] * pen * 0.8;
      const P = [nb.c[0] + N[0] * r.r, nb.c[1] + N[1] * r.r, nb.c[2] + N[2] * r.r];
      const sp = r.contact(P, [-N[0], -N[1], -N[2]], [V[i * 3], V[i * 3 + 1], V[i * 3 + 2]], 0.35, 0.5);
      r.wake();
      if (inHead[i] && sp > clonk) { clonk = sp; at = P; }
    }
    if (clonk > CLONK_V && r.tossed && !['shake', 'clonk'].includes(this.state)) {
      r.tossed = false;
      this.daze = Math.min(1, 0.4 + clonk * 0.05);
      this.events.push({ kind: 'bonk', at, strength: 0.6 });
      this.msg = 'clonk!';
      this.sway.v += (Math.random() < 0.5 ? -1 : 1) * 1.2;
      this._go('clonk');
    }
  }

  /* over the ossicones: both tips inside the ring as it comes down */
  _tryCatch(r) {
    if (r.v[1] > 0.5 || r.floor) return;
    const x = this.soft.x;
    const ax = r.axis(), up = sub(this.hornTip(), this.headCentre());
    const ul = len(up);
    if (Math.abs(dot(ax, up) / ul) < 0.4) return;
    const inner = r.R - r.r;
    for (const ch of this.hornK) {
      const i = ch.idx[ch.idx.length - 1];
      const l = r.toLocal(sub([x[i * 3], x[i * 3 + 1], x[i * 3 + 2]], r.x));
      if (Math.abs(l[2]) > r.r + 0.1) return;
      if (Math.hypot(l[0], l[1]) > inner - 0.07) return;
    }
    // caught: threaded on him now. What was carrying it across is spent on
    // his ossicones; it drops on down over his head
    this._buildPath();
    const pr = this._project(r.x);
    const vt = Math.max(1.5, dot(r.v, pr.tan));
    r.v = pr.tan.map((c) => c * vt);
    r.s = pr.s; r.tan = pr.tan; r.seg = pr.k;
    const o = sub(sub(r.x, pr.c), pr.tan.map((v) => v * dot(sub(r.x, pr.c), pr.tan)));
    r.slack = Math.max(0, len(o) - Math.max(0.03, r.R - r.r - pr.rn));
    r.state = 'neck';
    r.rest = false;
    r.threaded = false;
    r.spinA = 0;
    r.spin = dot(r.w, ax);
    const wasTossed = r.tossed;
    r.tossed = false;
    this.catches++;
    this.events.push({ kind: 'catch', at: [...r.x] });
    const n = this.onNeck().length;
    this.best = Math.max(this.best, n);
    this.msg = n > 1 ? `ringer! ${n} on` : 'ringer!';
    this.sway.v += (r.v[0]) * 0.08 * (1 + 0.2 * n);
    this.sag.v += Math.max(0, -r.v[1]) * 0.03 * (1 + 0.15 * n);
    if (wasTossed || this.state === 'track') this._go('caught');
  }

  /* a ring on the neck: free flight, then held round the path (a little
     clearance), friction along it against the neck's own motion; the
     neck takes its share of every push                                    */
  _neckRing(r, h) {
    const x = this.soft.x, V = this.soft.v;
    r.p = [...r.x];
    r.v[1] -= RING_G * h;
    for (let d = 0; d < 3; d++) r.x[d] += r.v[d] * h;
    const pr = this._project(r.x, r.seg ?? -1);
    r.s = pr.s; r.tan = pr.tan; r.pc = pr.c; r.seg = pr.k;
    // its room round the neck (a ring caught off-centre is let in gently:
    // a hard snap onto the line would be a kick)
    r.slack = Math.max(0, (r.slack || 0) - 0.6 * h);
    const clr = Math.max(0.03, r.R - r.r - pr.rn) + r.slack;
    const o = sub(sub(r.x, pr.c), pr.tan.map((v) => v * dot(sub(r.x, pr.c), pr.tan)));
    const ol = len(o);
    r.off = o;
    r.contactN = 0;
    if (ol > clr) {
      const ex = ol - clr, u = o.map((v) => v / ol);
      const share = this.state === 'shake' ? 0.15 : 0.25;
      for (let d = 0; d < 3; d++) r.x[d] -= u[d] * ex * (1 - share);
      // the neck's share, to the points either side
      const { pt } = this.path, k = pr.k;
      // (a ring weighs little: whatever the knock, it nudges the neck)
      const push = Math.min(ex * share, 0.002);
      for (const [j, w] of [[k, 1 - pr.t], [k + 1, pr.t]]) {
        const i = pt[j];
        if (i < 0) continue;
        for (let d = 0; d < 3; d++) x[i * 3 + d] += u[d] * push * w;
      }
      r.contactN = ex;
      // in a shake the neck knocks it about: it rattles, not slides
      if (this.state === 'shake') {
        const vr = (r.x[0] - r.p[0]) / h * u[0] + (r.x[1] - r.p[1]) / h * u[1] + (r.x[2] - r.p[2]) / h * u[2];
        if (vr > 0) for (let d = 0; d < 3; d++) r.x[d] -= u[d] * vr * h * 0.5;
      }
    }
    // friction along the neck: the ring's slide relative to the neck,
    // held back by at most μ × the push that kept it round the neck
    const { pt } = this.path;
    const ia = pt[pr.k], ib = pt[pr.k + 1];
    const vn = [0, 0, 0];
    for (const [i, w] of [[ia, 1 - pr.t], [ib, pr.t]]) if (i >= 0) for (let d = 0; d < 3; d++) vn[d] += V[i * 3 + d] * w;
    const mu = this.state === 'shake' && this.shakeA > 0.2 ? 0.04 : MU;
    const ds = dot(sub(r.x, r.p), pr.tan) - dot(vn, pr.tan) * h;
    // (the steady load, not the knock of arriving: a ring flung against the
    // neck isn't nailed to the spot by it)
    const f = Math.min(Math.abs(ds), mu * Math.min(r.contactN, 3 * RING_G * h * h));
    for (let d = 0; d < 3; d++) r.x[d] -= pr.tan[d] * Math.sign(ds) * f;
  }

  /* the stack: the bottom ring rests where the neck meets him, each one
     above on the one below; all ride the neck as it moves               */
  _stack(neck, h) {
    if (!neck.length) return;
    neck.sort((a, b) => b.s - a.s);
    const base = this.path.base, gap = 2 * RING.r * 1.06;
    let limit = base;
    for (const r of neck) {
      const pr = this._project(r.x, r.seg ?? -1);
      r.s = pr.s; r.tan = pr.tan; r.seg = pr.k;
      if (r.s > limit) {
        const ds = Math.min(r.s - limit, 0.03);
        for (let d = 0; d < 3; d++) r.x[d] -= pr.tan[d] * ds;
        // a landing: the stack takes the knock, and he feels it
        const vin = dot(r.v, pr.tan);
        if (!r.rest && vin > 1.2) { this.sag.v += vin * 0.012 * (1 + 0.25 * neck.length); this.sway.v += (Math.random() - 0.5) * vin * 0.03; }
        r.s = limit;
        r.rest = true;
      } else if (r.s < limit - 0.08) r.rest = false;
      limit = r.s - gap;
      // the ring tips with its slide round the neck; it turns slowly
      r.spinA = (r.spinA || 0) + (r.spin || 0) * h;
      r.spin = (r.spin || 0) * Math.exp(-3 * h);
    }
    void h;
  }

  /* off the top: it's free again (a shake) */
  _exit(r) {
    // (only once it's been over his head: a ring caught a touch above the
    // tips is on its way down, not off)
    if (r.s > 0.2) r.threaded = true;
    if (r.s > -0.04 || (!r.threaded && r.s > -0.3)) { this._orientOnNeck(r); return; }
    r.state = 'free';
    r.rest = false;
    r.tossed = false;
    r.noCatch = this.time + 1.2;
    r.ghost = this.time + 0.3;      // clear of his ossicones before it touches him
    // tumbling as it goes
    r.w = [(Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6];
    this.events.push({ kind: 'fling', at: [...r.x] });
  }

  /* threaded, it lies across the neck: square to it, leaning back toward
     level, tipped by where it sits round the neck */
  _orientOnNeck(r) {
    const t = r.tan;
    let n = [-t[0], -t[1], -t[2]];
    const up = n[1] < 0 ? [0, -1, 0] : [0, 1, 0];
    n = n.map((v, d) => v * 0.7 + up[d] * 0.3);
    if (r.off) { const k = 0.6; n = n.map((v, d) => v + r.off[d] * k); }
    const l = len(n);
    r.setAxis(n.map((v) => v / l), r.spinA || 0);
    r.w = [0, 0, 0];
  }

  /* ── readouts ────────────────────────────────────────────────────────── */

  ringEnergy() { return this.rings.reduce((e, r) => e + (r.state === 'gone' ? 0 : r.energy()), 0); }
  readout() { return [['Rings on', this.onNeck().length], ['Best stack', this.best]]; }
  status() { return this.msg; }
}
