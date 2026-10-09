/* Catch & hoard, for the crow.

   You toss him things. Food (a crumb, a berry) he wants in his beak, out of
   the air: his head and eyes follow the arc, he hops across into line
   (both feet at once, a soft body landing each time) and opens his beak as
   it arrives; it snaps shut on contact and the food goes down with a
   gulp and a bob of the head. A toss too wide or too fast for his feet gets
   a flap-and-lunge: the wings beat (they are chains, re-posed outward and
   up and back, their flat cross-section turned with them), the body is
   thrown that way in a short hop-flight held up a little by the beats. A
   food he misses he goes to and pecks off the floor.

   Shiny things (a felt-and-foil button, a bottle cap, a little key) he
   catches the same way and does not eat: he struts to the twig nest in the
   corner and drops them in, and there they rest, physically — each a small
   rigid ball under gravity against the nest's bowl and rim and each other.
   Take one back out with the Hand and he is indignant: a flap and a hop,
   then over he comes to take it back (from your hand, if you hold it low
   enough) and return it to the nest.

   The beak is two rigid felt mandibles riding the head's frame (measured
   every substep by shape-matching the head's stuffing to its sewn shape):
   `beak` (0…1) is how far the lower mandible hangs open. Catches are the
   beak's mouth meeting the item while it's open.                         */

import { Athlete, clamp, spring, ease, TAU } from './game.js';
import { Ball } from '../ball.js';
import { CROW } from './crow.rig.js';
import { extractRotation, quatToMat } from '../math.js';
import { rodrigues } from '../pose.js';

export const ITEM_G = 16;
export const THROWER = [0, 1.5, 8.5];
export const NEST = { c: [2.3, -1.05], R: 0.6, rimR: 0.68, rimr: 0.17, rimY: 0.22, y0: 0.05, dip: 0.2 };
export const STAGE = [[0, -4.5, 4.5], [2, -3, 4]];   // where things can roll to: [axis, min, max]
export const ITEMS = {
  crumb: { kind: 'food', r: 0.1, mass: 0.2 },
  berry: { kind: 'food', r: 0.085, mass: 0.2 },
  button: { kind: 'shiny', r: 0.115, mass: 0.3 },
  cap: { kind: 'shiny', r: 0.115, mass: 0.3 },
  key: { kind: 'shiny', r: 0.125, mass: 0.35 },
};
const FOODS = ['crumb', 'berry'], SHINIES = ['button', 'cap', 'key'];
export const BEAK_OPEN = 0.62;        // radians, the lower mandible at full gape
const MOUTH = 0.62;                   // the mouth: this far along the beak
const LUNGE_T = 0.42;                 // the flight of a lunge, about
const LIFT = 0.45;
const PECK_REACH = 0.42;                // a bowed peck lands this far ahead of his middle
export const PECK_PIVOT = [0, 1.3, 0.05];   // a bow swings the head down and forward about here                    // of gravity, held up by the beats

/* when a thing in flight is at height y on its way down (null: never) */
function downTime(b, y) {
  const A = 0.5 * b.g, B = -b.v[1], C = y - b.x[1];
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B + Math.sqrt(disc)) / (2 * A);
  return t > 0 ? t : null;
}

const _A = new Float64Array(9), _M = new Float64Array(9);

export class CrowGame extends Athlete {
  constructor(soft) {
    super(soft);
    this.balanceK = 0.007;
    this.speed = 15;
    this.kind = 'food';
    this.items = [];
    this.nextId = 1;
    this.row = 0;
    this.best = 0;
    this.catches = 0;
    this.beak = spring();            // 0 shut … 1 wide
    this.peck = spring();            // the head bowed forward, radians
    this.flap = spring();            // 0 folded … 1 beating
    this.lunge = spring();           // how far he leans into a lunge
    this.beakT = 0;
    this.peckT = 0;
    this.flapT = 0;
    this.beatPhase = 0;
    this.target = null;
    this.held = null;                // the item in his beak
    this.nest = NEST;
    this.aimZ = this.home[1] + 0.85; // tool 4 aims across this plane (his mouth's)
    this.msg = 'ready';
    // the head's own frame: its stuffing shape-matched to its sewn shape
    const rest = this.rig.rest, core = this.cfg.core;
    this._hc0 = [0, 0, 0];
    for (const i of core) for (let d = 0; d < 3; d++) this._hc0[d] += rest[i * 3 + d] / core.length;
    this._hq0 = new Float64Array(core.length * 3);
    core.forEach((i, j) => { for (let d = 0; d < 3; d++) this._hq0[j * 3 + d] = rest[i * 3 + d] - this._hc0[d]; });
    this._hq = [0, 0, 0, 1];
    this.hC = [0, 0, 0];
    this.hR = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    // the beak in the head's rest frame, from the head's centre
    const B = CROW.BEAK, dl = Math.hypot(...B.dir);
    this.beakDir = B.dir.map((v) => v / dl);
    this.beakBase = [CROW.HEAD.c[0] + B.base[0] - this._hc0[0], CROW.HEAD.c[1] + B.base[1] - this._hc0[1], CROW.HEAD.c[2] + B.base[2] - this._hc0[2]];
    this.beakLen = B.len;
    this.mouth = [0, 0, 0];
    this.tip = [0, 0, 0];
    this._mouthPrev = null;
    this.mouthV = [0, 0, 0];
    // the wings' sewn directions and flat axes, for re-posing them
    this.wings = [this.cfg.armR, this.cfg.armL].map((k) => {
      const ch = this.rig.arms[k], i0 = ch.idx[0], i1 = ch.idx[ch.idx.length - 1];
      const d = [rest[i1 * 3] - rest[i0 * 3], rest[i1 * 3 + 1] - rest[i0 * 3 + 1], rest[i1 * 3 + 2] - rest[i0 * 3 + 2]];
      return { k, side: Math.sign(rest[i0 * 3]), d0: d.map((v) => v / Math.hypot(...d)), ref0: [...ch.ref] };
    });
    this._headFrame();
    this._go('ready');
  }

  _springs() { return [...super._springs(), this.beak, this.peck, this.flap, this.lunge]; }

  reset() {
    super.reset();
    this.items = [];
    this.held = null;
    this.target = null;
    this.beakT = this.peckT = this.flapT = 0;
    this.balanceK = 0.007;
    this.lean = null;
    this.face = 0;
    this.msg = 'ready';
    for (const w of this.wings) this.rig.arms[w.k].ref = [...w.ref0];
  }

  /* ── the beak ────────────────────────────────────────────────────────── */

  _headFrame() {
    const x = this.soft.x, core = this.cfg.core, q = this._hq0, m = core.length;
    const c = this.hC;
    c[0] = c[1] = c[2] = 0;
    for (const i of core) { c[0] += x[i * 3]; c[1] += x[i * 3 + 1]; c[2] += x[i * 3 + 2]; }
    c[0] /= m; c[1] /= m; c[2] /= m;
    _A.fill(0);
    for (let j = 0; j < m; j++) {
      const i = core[j];
      const px = x[i * 3] - c[0], py = x[i * 3 + 1] - c[1], pz = x[i * 3 + 2] - c[2];
      const qx = q[j * 3], qy = q[j * 3 + 1], qz = q[j * 3 + 2];
      _A[0] += px * qx; _A[1] += px * qy; _A[2] += px * qz;
      _A[3] += py * qx; _A[4] += py * qy; _A[5] += py * qz;
      _A[6] += pz * qx; _A[7] += pz * qy; _A[8] += pz * qz;
    }
    extractRotation(_A, this._hq, 4);
    quatToMat(this._hq, this.hR);
    const B = this.beakBase, D = this.beakDir, L = this.beakLen;
    // the mouth sits between the mandibles: lower as the beak opens
    const gape = this.beak.x * BEAK_OPEN * 0.5;
    const mo = [B[0] + D[0] * L * MOUTH, B[1] + D[1] * L * MOUTH - Math.sin(gape) * L * MOUTH * 0.5, B[2] + D[2] * L * MOUTH];
    const ti = [B[0] + D[0] * L, B[1] + D[1] * L, B[2] + D[2] * L];
    this._toWorld(mo, this.mouth);
    this._toWorld(ti, this.tip);
  }

  _toWorld(l, out) {
    const R = this.hR, c = this.hC;
    out[0] = c[0] + R[0] * l[0] + R[1] * l[1] + R[2] * l[2];
    out[1] = c[1] + R[3] * l[0] + R[4] * l[1] + R[5] * l[2];
    out[2] = c[2] + R[6] * l[0] + R[7] * l[1] + R[8] * l[2];
    return out;
  }

  /* the beak's frame for drawing: hinge point, and the head's rotation */
  beakFrame() {
    return { base: this._toWorld(this.beakBase, [0, 0, 0]), R: this.hR, dir: this.beakDir, open: this.beak.x * BEAK_OPEN };
  }

  /* ── things to toss ──────────────────────────────────────────────────── */

  /* aim: [x, y] where it should cross his beak's plane (aimZ); speed u/s */
  launch({ aim = null, speed = this.speed, kind = this.kind, sub = null } = {}) {
    const free = this.items.filter((it) => it.state !== 'gone');
    if (free.length > 16) {
      // the oldest thing not in the nest goes (or the oldest of all)
      const old = free.find((it) => !it.inNest && it !== this.held) || free.find((it) => it !== this.held);
      if (old) old.state = 'gone';
    }
    if (!aim) aim = [(Math.random() - 0.5) * 1.6, 1.8 + Math.random() * 0.5];
    const zc = this.aimZ;
    aim = [clamp(aim[0], -5, 5), clamp(aim[1], 0.3, 4)];
    const list = kind === 'shiny' ? SHINIES : FOODS;
    sub = sub || list[Math.floor(Math.random() * list.length)];
    const spec = ITEMS[sub];
    const S = [THROWER[0] + aim[0] * 0.2, THROWER[1], THROWER[2]];
    const T = [aim[0], aim[1], zc];
    const d = Math.hypot(T[0] - S[0], T[1] - S[1], T[2] - S[2]);
    // a toss, not a throw: the pace slider's 8…26 u/s becomes a lob
    const tau = d / clamp(speed * 0.55, 4.5, 15);
    const v = [(T[0] - S[0]) / tau, (T[1] - S[1]) / tau + 0.5 * ITEM_G * tau, (T[2] - S[2]) / tau];
    const ball = new Ball({ r: spec.r, mass: spec.mass, restitution: 0.3, roll: 3, x: S, v, g: ITEM_G });
    ball.w = [(Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8];
    const it = { id: this.nextId++, sub, kind: spec.kind, r: spec.r, ball, state: 'free', tossed: true, stolen: false, inNest: false, gulp: 0, t: 0 };
    this.items.push(it);
    if (!this.held && !['lunge', 'gulp', 'drop'].includes(this.state)) this._aimAt(it);
    return it;
  }

  get ball() { return null; }
  set ball(v) { /* the crow's things are items, not one ball */ }

  /* ── the Hand on his things ──────────────────────────────────────────── */

  itemAt(origin, dir) {
    let best = null, bt = 1e9;
    for (const it of this.items) {
      if (it.state === 'gone' || it.state === 'beak') continue;
      const b = it.ball.x, R = it.r * 2 + 0.08;
      const ox = b[0] - origin[0], oy = b[1] - origin[1], oz = b[2] - origin[2];
      const t = ox * dir[0] + oy * dir[1] + oz * dir[2];
      if (t < 0) continue;
      const d2 = ox * ox + oy * oy + oz * oz - t * t;
      if (d2 < R * R && t < bt) { bt = t; best = it; }
    }
    return best ? { id: best.id, point: [...best.ball.x] } : null;
  }

  grabItem(id) {
    const it = this.items.find((q) => q.id === id);
    if (!it || it.state === 'beak' || it.state === 'gone') return false;
    it.wasInNest = it.inNest;
    it.state = 'hand';
    it.tossed = false;
    it.inNest = false;
    it.handV = [0, 0, 0];
    return true;
  }

  moveItem(id, p) {
    const it = this.items.find((q) => q.id === id);
    if (!it || it.state !== 'hand') return false;
    const b = it.ball;
    const y = Math.max(it.r, p[1]);
    it.handV = [(p[0] - b.x[0]) * 30, (y - b.x[1]) * 30, (p[2] - b.x[2]) * 30];
    b.x[0] = p[0]; b.x[1] = y; b.x[2] = p[2];
    b.p = [...b.x];
    // out of the nest: that's his
    if (it.kind === 'shiny' && it.wasInNest && !this._inNestXZ(b.x, 0.1) && !it.stolen) this._stolen(it);
    return true;
  }

  releaseItem(id) {
    const it = this.items.find((q) => q.id === id);
    if (!it || it.state !== 'hand') return;
    it.state = 'free';
    const v = it.handV || [0, 0, 0], sp = Math.hypot(...v);
    it.ball.v = sp > 6 ? v.map((c) => c * 6 / sp) : v;
    if (it.kind === 'shiny' && it.wasInNest && !this._inNestXZ(it.ball.x, 0.1) && !it.stolen) this._stolen(it);
  }

  _stolen(it) {
    it.stolen = true;
    if (this.held || ['lunge', 'gulp'].includes(this.state)) return;
    this.target = it;
    this.flapT = 1;
    this.msg = 'hey — that’s mine!';
    this._go('indignant');
  }

  /* ── every fixed step ────────────────────────────────────────────────── */

  _think(dt) {
    const c = this.soft.cloudC[0];
    this.items = this.items.filter((it) => it.state !== 'gone');
    for (const it of this.items) it.t += dt;
    const T = this.target && this.target.state !== 'gone' ? this.target : (this.target = null);
    let look = null;
    this.flapT = 0;
    this.lean = null;
    if (this.state !== 'lunge') this.balanceK = 0.007;

    switch (this.state) {
      case 'ready': {
        this.beakT = 0; this.peckT = 0; this.drive = null; this.face = 0;
        const next = this._choose();
        if (next) this._aimAt(next);
        else look = this.items.find((it) => it.state === 'hand')?.ball.x || null;
        break;
      }
      case 'track': {
        if (!T || T.state !== 'free') { this._afterward(); break; }
        look = T.ball.x;
        const b = T.ball;
        if (!T.tossed) { this._pursue(T); break; }
        this._plan(b, c);
        break;
      }
      case 'lunge': {
        look = T?.ball.x || null;
        this.flapT = 1;
        this.balanceK = 0.0035;
        this.lean = [0.15, 0, -this.lungeSide * 0.32 * this.lunge.x];
        ease(this.lunge, 1, 120, dt);
        // the beats steer: the body's velocity is servoed (per substep) to
        // put his mouth where the thing will be when it gets down to it
        this.flyV = null;
        if (T && T.state === 'free' && T.tossed) {
          const b = T.ball, m = this.mouth;
          const tr = downTime(b, Math.min(m[1], b.x[1])) ?? 0;
          if (tr > 0.02 && b.x[2] > m[2] - 0.3) {
            const P = b.at(tr), k = 1 / Math.max(tr, 0.08);
            this.flyV = [clamp((P[0] - m[0]) * k, -6, 6), clamp((P[1] - m[1]) * k, -3, 3.5), clamp((P[2] - m[2]) * k, -4, 4)];
          }
        }
        if (!this.flyV && this.t > 0.15) this._go('land');
        else if (this.t > 0.9) this._go('land');
        break;
      }
      case 'land': {
        ease(this.lunge, 0, 60, dt);
        // feet down: stop where he lands
        if (!this.drive) this.drive = { x: c[0], z: c[2], speed: 0.4 };
        this.flapT = this.t < 0.25 ? 0.6 : 0;
        if (this.held) look = null;
        if (this.t > 0.45) this._afterward();
        break;
      }
      case 'gulp': {
        this.beakT = this.t < 0.08 ? 0 : this.t < 0.22 ? 0.35 : 0;
        // a bob or two of the head as it goes down
        this.peckT = 0.35 * Math.max(0, Math.sin(this.t / 0.5 * TAU * 1.5)) * (this.t < 0.55 ? 1 : 0);
        if (this.held) this.held.gulp = clamp(this.t / 0.4, 0, 1);
        if (this.t > 0.42 && this.held) { this.held.state = 'gone'; this.held = null; }
        if (this.t > 0.7) this._afterward();
        break;
      }
      case 'seek': {
        if (!T || T.state === 'beak') { this._afterward(); break; }
        look = T.ball.x;
        if (T.state === 'free' && T.tossed && T.ball.x[1] > T.r + 0.05) { this._go('track'); break; }
        this._pursue(T);
        break;
      }
      case 'peck': {
        if (!T || T.state === 'beak') { this._afterward(); break; }
        look = T.ball.x;
        {
          const [sx, sz, face] = this._standoff(T);
          this.drive = { x: sx, z: sz, speed: 0.6 };
          this.face = face;
        }
        this.peckT = Math.min(1.15, this.t * 4);
        this.lean = [0.65 * Math.min(1, this.t * 3), 0, 0];
        this.beakT = this.t > 0.12 ? 1 : 0;
        // moved off (a hand took it, it rolled): go after it again
        if (this._standoffDist(T) > 0.45 || this.t > 1.1) {
          this.tries = (this.tries || 0) + 1;
          this._go('seek');
        }
        break;
      }
      case 'carry': {
        const it = this.held;
        if (!it) { this._afterward(); break; }
        const [sx, sz, face] = this._nestStand();
        this.face = face;
        this.beakT = 0;
        look = [NEST.c[0], 0.3, NEST.c[1]];
        // a strut: walking steps, not hops
        this.drive = { x: sx, z: sz, speed: 1.7 };
        this.hopping = false;
        if (Math.hypot(c[0] - sx, c[2] - sz) < 0.12 && this.t > 0.3) { this.drive = null; this._go('drop'); }
        if (this.t > 8) { this.drive = null; this._go('drop'); }
        break;
      }
      case 'drop': {
        look = [NEST.c[0], 0.1, NEST.c[1]];
        this.peckT = Math.min(0.75, this.t * 3);
        this.lean = [0.25 * Math.min(1, this.t * 3), 0, 0];
        if (this.t > 0.32 && this.held) {
          this.beakT = 1;
          this._dropInNest(this.held);
          this.held = null;
          this.msg = 'into the nest';
        }
        if (this.t > 0.7) this._afterward();
        break;
      }
      case 'indignant': {
        look = T?.ball.x || null;
        this.flapT = 1;
        this.beakT = this.t < 0.5 ? 0.6 * Math.max(0, Math.sin(this.t * TAU * 3)) : 0;
        if (this.t > 0.08 && !this._jumped) { this._jumped = true; this._hop(2.6); }
        if (this.t > 0.65) { this._jumped = false; this.tries = 0; this._go('seek'); }
        break;
      }
      case 'return': {
        this.face = 0;
        const next = this._choose();
        if (next) { this._aimAt(next); break; }
        this.drive = { x: this.home[0], z: this.home[1], speed: 2.2 };
        this.hopping = true;
        if (Math.hypot(c[0] - this.home[0], c[2] - this.home[1]) < 0.1 && this.t > 0.3) { this.drive = null; this.hopping = false; this._go('ready'); }
        break;
      }
    }
    this.lookAt = look;

    ease(this.beak, this.beakT, this.beakT > this.beak.x ? 900 : 2600, dt);
    this.beak.x = clamp(this.beak.x, -0.05, 1.1);
    ease(this.peck, this.peckT, 220, dt);
    ease(this.flap, this.flapT, 160, dt);
    this.beatPhase += dt * (5.5 + 1.5 * this.flap.x);
    // hopping: both feet at once, a little lift, while he's going somewhere
    if (this.hopping && this.drive && this.time >= (this.nextHop || 0)) {
      const D = this.drive, far = Math.hypot(D.x - c[0], D.z - c[2]);
      if (far > 0.2 && this._grounded()) { this._hop(2.4); this.nextHop = this.time + 0.3; }
    }
    if (!this.drive) this.hopping = false;
    this._posture();
  }

  /* what needs doing next, most urgent first */
  _choose() {
    const live = this.items.filter((it) => it.state === 'free' || it.state === 'hand');
    const flying = live.find((it) => it.tossed && it.state === 'free');
    if (flying) return flying;
    const stolen = live.find((it) => it.stolen && !it.inNest);
    if (stolen) return stolen;
    const food = live.find((it) => it.kind === 'food' && it.state === 'free');
    if (food) return food;
    const stray = live.find((it) => it.kind === 'shiny' && it.state === 'free' && !it.inNest && !this._inNestXZ(it.ball.x, 0));
    return stray || null;
  }

  _aimAt(it) {
    this.target = it;
    this.tries = 0;
    this.plan = null;
    if (it.tossed && it.state === 'free') { this.react = this.time + 0.12; this.msg = it.kind === 'food' ? 'eyeing it…' : 'ooh, shiny…'; this._go('track'); }
    else { this.msg = it.stolen ? 'that’s mine' : it.kind === 'food' ? 'there it is' : 'ooh, shiny'; this._go('seek'); }
  }

  _afterward() {
    this.lean = null;
    if (this.held) {
      if (this.held.kind === 'food') { this.msg = 'gulp'; this._go('gulp'); }
      else { this.msg = 'mine'; this._go('carry'); }
      return;
    }
    const next = this._choose();
    if (next) { this._aimAt(next); return; }
    this.target = null;
    this._go('return');
  }

  /* read the toss: where it comes down through the height of his mouth,
     and when. Hop there if his feet can get him there in time; if not,
     flap and lunge, timed so he's in the air, stretched toward it, when
     it arrives. Too low to reach at all: let it land and peck it up.     */
  _plan(b, c) {
    if (this.time < this.react) { this.drive = null; return; }
    const m = this.mouth, g = b.g;
    const down = (y) => downTime(b, y);
    const apex = b.x[1] + (b.v[1] > 0 ? b.v[1] * b.v[1] / (2 * g) : 0);
    // catch it at mouth height; a lob that never gets that high, as high
    // as it does get, with a bow of the head
    const restY = this.restMouthY ?? (this.restMouthY = m[1]);
    const y = Math.min(restY, Math.max(0.7, apex - 0.05));
    const t = down(y);
    if (t === null || b.v[2] > 0.5 && b.x[2] > c[2] + 1.5) { this.drive = null; this.beakT = 0; return; }
    const P = b.at(t);
    this.peckT = clamp((restY - y) * 1.1, 0, 0.8);
    const dx = P[0] - m[0], dz = P[2] - m[2];
    const dist = Math.hypot(dx, dz);
    // open up as it comes
    this.beakT = t < 0.3 ? 1 : 0.12;
    if (apex < 0.75) {
      // a grounder: wait for it to stop, then peck it
      this.drive = null;
      this.beakT = 0;
      this.msg = 'too low…';
      return;
    }
    const feet = 2.6 * Math.max(0, t - 0.1);
    if (dist < 0.2 + feet * 0.85) {
      this.drive = dist > 0.05 ? { x: c[0] + dx, z: c[2] + dz, speed: 3.4 } : null;
      this.hopping = dist > 0.3;
      this.msg = this.target.kind === 'food' ? 'got it…' : 'ooh, shiny…';
      return;
    }
    // no: a lunge, when there's just its flight left
    if (t <= LUNGE_T) { this._lungeAt(P, t); return; }
    const k = Math.min(1, 0.9 / dist);
    this.drive = { x: c[0] + dx * k, z: c[2] + dz * k, speed: 2.6 };
    this.hopping = true;
  }

  _lungeAt(P, t) {
    const soft = this.soft, g = soft.params.gravity * (1 - LIFT);
    const tt = clamp(t, 0.25, 0.55);
    const dx = P[0] - this.mouth[0], dy = P[1] - this.mouth[1], dz = P[2] - this.mouth[2];
    // across to it in the time there is, a hop up that the beats hold,
    // timed to be a touch above it, coming down, when it gets there
    const vx = clamp(dx / tt, -6, 6);
    const vy = clamp((dy + 0.15) / tt + 0.5 * g * tt, 2.4, 6.5);
    const vz = clamp(dz / tt, -2, 2);
    // what the body is doing already (a hop across) counts toward it
    const ix = this.rig.clouds[0].ix, V = soft.v;
    let mx = 0, my = 0, mz = 0;
    for (const i of ix) { mx += V[i * 3]; my += V[i * 3 + 1]; mz += V[i * 3 + 2]; }
    mx /= ix.length; my /= ix.length; mz /= ix.length;
    soft.impulse(() => [vx - mx, vy - Math.max(0, my), vz - mz]);
    this.lungeSide = Math.sign(dx) || 1;
    this.lunge.x = 0; this.lunge.v = 0;
    this.drive = null;
    this.hopping = false;
    this.beakT = 1;
    this.msg = 'flap — lunge!';
    this._go('lunge');
  }

  _missed(it) {
    if (!it || !it.tossed) return;
    it.tossed = false;
    this.row = 0;
    if (this.target !== it || this.state !== 'track') return;
    this.msg = it.kind === 'food' ? 'missed — peck it up' : 'missed — fetch it';
    this._go('seek');
  }

  /* go to a thing on the floor (or in your hand) and stand where a bow of
     the head puts the beak on it */
  _pursue(T) {
    const [sx, sz, face] = this._standoff(T);
    this.face = face;
    this.beakT = 0;
    const c = this.soft.cloudC[0];
    const far = Math.hypot(sx - c[0], sz - c[2]);
    this.drive = { x: sx, z: sz, speed: T.stolen ? 3 : 2.4 };
    this.hopping = far > 0.35;
    // at it, and the thing is low enough for a bow: peck
    const reachable = T.ball.x[1] < 1.1;
    if (far < 0.14 && reachable && this.t > 0.2) { this.drive = null; this.hopping = false; this._go('peck'); return; }
    // held up high in a hand: reach for it as best he can
    if (!reachable && far < 0.3) { this.drive = null; this.beakT = 0.7; this.flapT = 0.5; this.msg = 'give it back!'; }
    if (this.t > 10) { this.target = null; this._afterward(); }
  }

  /* where to stand for a thing: back off from it along the line from him,
     by how far ahead of his middle a peck lands                          */
  _standoff(T) {
    const c = this.soft.cloudC[0], b = T.ball.x;
    let dx = b[0] - c[0], dz = b[2] - c[2];
    const d = Math.hypot(dx, dz);
    if (d < 1e-3) { dx = 0; dz = 1; } else { dx /= d; dz /= d; }
    const reach = PECK_REACH - ((this.tries || 0) % 3) * 0.06;
    return [b[0] - dx * reach, b[2] - dz * reach, Math.atan2(dx, dz)];
  }

  _standoffDist(T) {
    const c = this.soft.cloudC[0], b = T.ball.x;
    return Math.abs(Math.hypot(b[0] - c[0], b[2] - c[2]) - PECK_REACH);
  }

  _nestStand() {
    const c = this.soft.cloudC[0], N = NEST.c;
    let dx = N[0] - c[0], dz = N[1] - c[2];
    // come at it from the front-left (his side of the stage)
    dx = N[0] - (this.home[0] + 0.4); dz = N[1] - (this.home[1] + 0.3);
    const d = Math.hypot(dx, dz);
    dx /= d; dz /= d;
    const off = NEST.rimR + 0.62;
    return [N[0] - dx * off, N[1] - dz * off, Math.atan2(dx, dz)];
  }

  _inNestXZ(p, pad) { return Math.hypot(p[0] - NEST.c[0], p[2] - NEST.c[1]) < NEST.R + pad; }

  _dropInNest(it) {
    // dropped in with a flick of the head toward the middle of the nest
    const n = this.items.filter((q) => q.inNest).length;
    const a = n * 2.4, rr = 0.12 + 0.12 * ((n * 0.37) % 1);
    const T = [NEST.c[0] + Math.cos(a) * rr, 0.25, NEST.c[1] + Math.sin(a) * rr];
    const b = it.ball, tt = 0.3;
    b.x = [...this.mouth];
    b.p = [...b.x];
    b.v = [(T[0] - b.x[0]) / tt, (T[1] - b.x[1]) / tt + 0.5 * ITEM_G * tt, (T[2] - b.x[2]) / tt];
    it.state = 'free';
    it.tossed = false;
    it.stolen = false;
    it.gulp = 0;
    it.noCatch = this.time + 0.8;
  }

  _grounded() {
    let touch = 0;
    for (const f of this.feet) for (const i of f) touch += this.soft.contact[i];
    return touch > 3;
  }

  /* a two-footed hop: a little lift of the whole body */
  _hop(vy) { this.soft.impulse(() => [0, vy, 0]); }

  /* ── the pose: head bowed, wings folded or beating ───────────────────── */

  _posture() {
    for (const w of this.wings) {
      const f = this.flap.x;
      if (f < 0.01) { this.rig.arms[w.k].ref = [...w.ref0]; w.rv = null; continue; }
      // a beat: out and up, then down and a little forward, round and round
      const ph = this.beatPhase * TAU;
      const a = 0.3 + 0.75 * Math.sin(ph);
      const want = [w.side * Math.cos(a), Math.sin(a), -0.35 + 0.25 * Math.cos(ph)];
      const wl = Math.hypot(...want);
      const dir = w.d0.map((v, d) => v * (1 - f) + want[d] / wl * f);
      const bone = this.armBone(w.k, dir);
      w.rv = bone.rv;
      // the wing's flat axis turns with it
      const R = rodrigues(bone.rv[0], bone.rv[1], bone.rv[2], _M), r = w.ref0;
      this.rig.arms[w.k].ref = [R[0] * r[0] + R[1] * r[1] + R[2] * r[2], R[3] * r[0] + R[4] * r[1] + R[5] * r[2], R[6] * r[0] + R[7] * r[1] + R[8] * r[2]];
    }
  }

  _bones() {
    const out = [];
    for (const w of this.wings) if (w.rv) out.push(this.armBone(w.k, null, null, w.rv));
    if (this.peck.x > 0.005) out.push({ ix: this.cfg.head, rv: [this.peck.x, 0, 0], pivot: PECK_PIVOT });
    return out;
  }

  armBone(k, dir, pre, rv) {
    if (!rv) return super.armBone(k, dir, pre);
    const ch = this.rig.arms[k];
    return { ix: ch.idx.subarray(1), rv, pivotIx: ch.idx[0] };
  }

  /* ── every substep ───────────────────────────────────────────────────── */

  _push(h) {
    const soft = this.soft, x = soft.x, hh = h * h;
    this._headFrame();
    // the mouth's velocity (what a released thing leaves with)
    if (this._mouthPrev) for (let d = 0; d < 3; d++) this.mouthV[d] = (this.mouth[d] - this._mouthPrev[d]) / h;
    this._mouthPrev = [...this.mouth];
    // the beats hold him up a little through a lunge
    if (this.state === 'lunge') {
      const up = soft.params.gravity * LIFT * this.flap.x;
      for (let i = 0; i < soft.n; i++) x[i * 3 + 1] += up * hh;
      if (this.flyV) {
        const v = soft.v, n = soft.n, F = this.flyV;
        let mx = 0, my = 0, mz = 0;
        for (let i = 0; i < n; i++) { mx += v[i * 3]; my += v[i * 3 + 1]; mz += v[i * 3 + 2]; }
        mx /= n; my /= n; mz /= n;
        const k = Math.min(1, 14 * h);
        const dx = (F[0] - mx) * k * h, dy = (F[1] - my) * k * h, dz = (F[2] - mz) * k * h;
        for (let i = 0; i < n; i++) { x[i * 3] += dx; x[i * 3 + 1] += dy; x[i * 3 + 2] += dz; }
      }
    }
    // a beating wing pushes air: the tips are driven round with the pose
    if (this.flap.x > 0.05) {
      for (const w of this.wings) {
        const idx = this.rig.arms[w.k].idx, P = soft.pose;
        if (!P) continue;
        const R = soft.cloudR[0], c = soft.cloudC[0], c0 = this.c0;
        for (let j = 2; j < idx.length; j++) {
          const i = idx[j];
          const qx = P[i * 3] - c0[0], qy = P[i * 3 + 1] - c0[1], qz = P[i * 3 + 2] - c0[2];
          const gx = c[0] + R[0] * qx + R[1] * qy + R[2] * qz, gy = c[1] + R[3] * qx + R[4] * qy + R[5] * qz, gz = c[2] + R[6] * qx + R[7] * qy + R[8] * qz;
          const k = 0.08 * this.flap.x * j / idx.length;
          x[i * 3] += (gx - x[i * 3]) * k; x[i * 3 + 1] += (gy - x[i * 3 + 1]) * k; x[i * 3 + 2] += (gz - x[i * 3 + 2]) * k;
        }
      }
    }
    this._itemsStep(h);
  }

  _itemsStep(h) {
    const c = this.soft.cloudC[0];
    const free = [];
    for (const it of this.items) {
      const b = it.ball;
      if (it.state === 'beak') {
        b.p = [...b.x];
        b.x = [...this.mouth];
        b.v = [...this.mouthV];
        continue;
      }
      if (it.state !== 'free') continue;
      free.push(it);
      b._h = h;
      if (it.sleep > 30 && it.inNest) continue;
      b.integrate(h);
      const near = Math.hypot(b.x[0] - c[0], b.x[2] - c[2]) < 2 && b.x[1] < 3.4;
      if (near) this._softCollide(b);
      this._nestCollide(it, h);
    }
    // things push each other apart (a pile in the nest)
    for (let a = 0; a < free.length; a++) {
      for (let k = a + 1; k < free.length; k++) {
        const A = free[a].ball, B = free[k].ball;
        const dx = B.x[0] - A.x[0], dy = B.x[1] - A.x[1], dz = B.x[2] - A.x[2];
        const m = A.r + B.r;
        if (Math.abs(dx) > m || Math.abs(dy) > m || Math.abs(dz) > m) continue;
        const d = Math.hypot(dx, dy, dz);
        if (d >= m || d < 1e-9) continue;
        const nx = dx / d, ny = dy / d, nz = dz / d, pen = (m - d) * 0.5;
        A.x[0] -= nx * pen; A.x[1] -= ny * pen; A.x[2] -= nz * pen;
        B.x[0] += nx * pen; B.x[1] += ny * pen; B.x[2] += nz * pen;
        const vn = (B.v[0] - A.v[0]) * nx + (B.v[1] - A.v[1]) * ny + (B.v[2] - A.v[2]) * nz;
        if (vn < 0) {
          const j = vn * 0.6;
          A.v[0] += nx * j; A.v[1] += ny * j; A.v[2] += nz * j;
          B.v[0] -= nx * j; B.v[1] -= ny * j; B.v[2] -= nz * j;
        }
        free[a].sleep = free[k].sleep = 0;
      }
    }
    for (const it of free) {
      const b = it.ball;
      if (it.sleep > 30 && it.inNest) continue;
      b.finish(h);
      // the edge of the mat: a thing that rolls off it is stopped there
      for (const [d, lo, hi] of STAGE) {
        if (b.x[d] < lo) { b.x[d] = lo; b.v[d] = Math.abs(b.v[d]) * 0.2; }
        else if (b.x[d] > hi) { b.x[d] = hi; b.v[d] = -Math.abs(b.v[d]) * 0.2; }
      }
      // the floor ends a toss
      if (it.tossed && b.x[1] <= b.r + 1e-3 && b.t > 0.1) this._missed(it);
      // in the nest: settled inside the bowl, and asleep once still
      const inside = this._inNestXZ(b.x, -0.02) && b.x[1] < 0.6;
      it.inNest = inside && !it.tossed;
      it.sleep = it.inNest && b.speed() < 0.08 ? (it.sleep || 0) + 1 : 0;
      if (it.sleep > 30) { b.v = [0, 0, 0]; b.w = [0, 0, 0]; }
    }
    // the catch: an open beak meets a thing in the air
    if (!this.held && this.beak.x > 0.35) {
      for (const it of free) {
        const b = it.ball, m = this.mouth;
        const reach = it.r + (this.state === 'peck' ? 0.36 : this.state === 'lunge' || this.state === 'land' ? 0.38 : 0.3);
        if (Math.hypot(b.x[0] - m[0], b.x[1] - m[1], b.x[2] - m[2]) > reach) continue;
        if ((it.inNest && !it.stolen) || this.time < (it.noCatch || 0)) continue;
        this._caught(it);
        break;
      }
      // …or a hand holding it near enough
      if (!this.held) {
        for (const it of this.items) {
          if (it.state !== 'hand' || !it.stolen) continue;
          const b = it.ball, m = this.mouth;
          if (Math.hypot(b.x[0] - m[0], b.x[1] - m[1], b.x[2] - m[2]) < it.r + 0.34) { this._caught(it); this.events.push({ kind: 'snatch', id: it.id }); break; }
        }
      }
    }
  }

  /* a light thing against the plush: it gives way, the plush hardly does,
     and it bounces off with a little of its speed (stuffing is soft)    */
  _softCollide(b) {
    const s = this.soft, X = s.x, V = s.v, R = s.r, n = s.n;
    for (let i = 0; i < n; i++) {
      const dx = b.x[0] - X[i * 3], dy = b.x[1] - X[i * 3 + 1], dz = b.x[2] - X[i * 3 + 2];
      const m = b.r + R[i] * 0.9;
      if (dx > m || dx < -m || dy > m || dy < -m || dz > m || dz < -m) continue;
      const d = Math.hypot(dx, dy, dz);
      if (d >= m || d < 1e-9) continue;
      const nx = dx / d, ny = dy / d, nz = dz / d, pen = m - d;
      b.x[0] += nx * pen * 0.9; b.x[1] += ny * pen * 0.9; b.x[2] += nz * pen * 0.9;
      X[i * 3] -= nx * pen * 0.1; X[i * 3 + 1] -= ny * pen * 0.1; X[i * 3 + 2] -= nz * pen * 0.1;
      const vn = (b.v[0] - V[i * 3]) * nx + (b.v[1] - V[i * 3 + 1]) * ny + (b.v[2] - V[i * 3 + 2]) * nz;
      if (vn < 0) { b.v[0] -= 1.25 * vn * nx; b.v[1] -= 1.25 * vn * ny; b.v[2] -= 1.25 * vn * nz; }
    }
  }

  _caught(it) {
    const air = it.tossed && it.ball.x[1] > it.r + 0.05;
    it.state = 'beak';
    it.ball.w = [0, 0, 0];
    this.held = it;
    this.beakT = 0;
    this.beak.v = Math.min(this.beak.v, -6);
    if (air) {
      this.row++;
      this.catches++;
      this.best = Math.max(this.best, this.row);
      this.events.push({ kind: 'catch', at: [...this.mouth] });
      this.msg = it.kind === 'food' ? 'snap!' : 'snap — shiny!';
    } else this.msg = it.stolen ? 'got it back' : 'peck!';
    it.tossed = false;
    if (['track', 'peck', 'seek'].includes(this.state)) this._afterward();
  }

  /* the nest: a shallow bowl of twigs. A thing inside rests on the bowl
     (y = y0 + dip·(d/R)²); the rim is a torus everything bounces off   */
  _nestCollide(it, h) {
    const b = it.ball, N = NEST;
    const rx = b.x[0] - N.c[0], rz = b.x[2] - N.c[1];
    const d = Math.hypot(rx, rz);
    // the rim
    if (d > 1e-6) {
      const ux = rx / d, uz = rz / d;
      const qx = rx - ux * N.rimR, qy = b.x[1] - N.rimY, qz = rz - uz * N.rimR;
      const qd = Math.hypot(qx, qy, qz), m = N.rimr + b.r;
      if (qd < m && qd > 1e-9) this._contact(b, qx / qd, qy / qd, qz / qd, m - qd, h);
    }
    // the bowl
    if (d < N.rimR) {
      const s = d / N.R;
      const y = N.y0 + N.dip * s * s + b.r;
      if (b.x[1] < y) {
        // the bowl's normal: −∇(y − f(d))
        const slope = 2 * N.dip * d / (N.R * N.R);
        let nx = -slope * (d > 1e-6 ? rx / d : 0), ny = 1, nz = -slope * (d > 1e-6 ? rz / d : 0);
        const nl = Math.hypot(nx, ny, nz);
        nx /= nl; ny /= nl; nz /= nl;
        this._contact(b, nx, ny, nz, (y - b.x[1]) * ny, h);
      }
    }
  }

  _contact(b, nx, ny, nz, pen, h) {
    b.x[0] += nx * pen; b.x[1] += ny * pen; b.x[2] += nz * pen;
    const vn = b.v[0] * nx + b.v[1] * ny + b.v[2] * nz;
    if (vn < 0) { b.v[0] -= 1.25 * vn * nx; b.v[1] -= 1.25 * vn * ny; b.v[2] -= 1.25 * vn * nz; }
    // twigs grip
    const k = Math.exp(-14 * h);
    const vn2 = b.v[0] * nx + b.v[1] * ny + b.v[2] * nz;
    for (let d = 0; d < 3; d++) { const n = [nx, ny, nz][d]; b.v[d] = n * vn2 + (b.v[d] - n * vn2) * k; }
    b.w = b.w.map((w) => w * k);
  }

  hoard() { return this.items.filter((it) => it.inNest && it.kind === 'shiny').length; }
  readout() { return [['Row / best', `${this.row} / ${this.best}`], ['Hoard', this.hoard()]]; }
  status() { return this.msg; }
}
