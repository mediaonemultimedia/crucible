/* Puppets: the fighting poses on top of the shared plush rigs.

   A puppet reads one fighter's sim state (action, move, frame, facing) and
   turns it into what the soft body pulls toward: pose bones (arms, neck,
   head), a lean for the balance servo, grabs on arm tips (Flock's pull:
   the tip is drawn toward a target, the arm stretches and springs back),
   impulses for hits. It never writes anything back to the sim: the plush
   is decoration on a deterministic game.

   Everything is in the plush's own frame (the rig's rest coordinates: +y
   up, the toy facing +z). `aim` is the direction to the opponent in that
   frame (the fighter's mesh is turned three-quarters to the camera), so a
   jab goes at the other fighter, not out of the screen.

   Bipeds (Kevalanche, Johnny Deuce, Sumaura) and the giraffe (K8-E) extend
   Grommet's Athlete (attention, balance, footwork-in-place, daze wobble);
   the octopus (Rubberta) is Flock's rig, driven directly.                 */

import { Athlete, clamp, spring, ease, TAU } from '../../shared/grommet/athletes/game.js';
import { Pose } from '../../shared/grommet/pose.js';
import { rightUp, settle } from '../../shared/grommet/balance.js';
import { racquetFrame } from '../../shared/grommet/athletes/leopard.game.js';
import { FIGHTERS } from '../fighters/index.js';

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const pulse = (t, a, b, c) => smooth(a, b, t) * (1 - smooth(b, c, t));

/* the sim's view of a move: progress through startup / active / recovery */
export function phaseOf(F) {
  if (F.act !== 'attack') return null;
  const m = FIGHTERS[F.id].moves[F.mv];
  const first = m.hits.length ? m.hits[0].from : m.spawn.length ? m.spawn[0].at : m.grab ? m.grab.from : 6;
  const last = m.hits.length ? m.hits[m.hits.length - 1].to : m.spawn.length ? m.spawn[m.spawn.length - 1].at + 2 : first + 3;
  const t = F.t;
  return {
    m, t, first, last, total: m.total,
    wind: clamp(t / Math.max(1, first), 0, 1),             // 0 → 1 over startup
    out: t < first ? 0 : t <= last ? 1 : 1 - clamp((t - last) / Math.max(1, m.total - last), 0, 1),
  };
}

/* shared by every puppet: the fight frame and the drive from the sim */
const FightMixin = (Base) => class extends Base {
  _fightInit() {
    this.F = null;                 // the sim fighter, this frame
    this.aim = [0, 0, 1];          // to the opponent, in the plush's frame
    this.side = [1, 0, 0];         // aim × up
    this.oppHead = [0, 2.5, 5];
    this.kick = [0, 0, 0];         // a velocity kick waiting for the next substep
    this.fallen = 0;
    this.threat = false;          // the other one is swinging (block pose)
    this.reachK = 0;              // Sky Neck: how much further the neck has to go
  }

  /* fight-frame vector [side, up, fwd] → plush frame */
  fv(s, u, f) {
    const a = this.aim, d = this.side;
    return [d[0] * s + a[0] * f, u + d[1] * s + a[1] * f, d[2] * s + a[2] * f];
  }

  /* a velocity change for every point (inertia of the group, a hit) */
  shove(v, filter = null) {
    const soft = this.soft;
    for (let i = 0; i < soft.n; i++) {
      const w = filter ? filter(i, soft.x[i * 3 + 1]) : 1;
      if (!w) continue;
      // (each substep predicts from v, so this carries into the next one)
      soft.v[i * 3] += v[0] * w; soft.v[i * 3 + 1] += v[1] * w; soft.v[i * 3 + 2] += v[2] * w;
    }
  }
};

/* A chain that can grow along itself (an arm thrown out in a heavy): its
   links, bending windows and tethers scale, and the posed chain slides out
   from its root, so the soft body is pulled to the longer shape and the
   limb (and anything skinned to it — a glove, a sleeve) goes with it. The
   giraffe's neck does the same thing its own way, below.               */
class ChainStretch {
  constructor(soft, chain) {
    const rig = soft.rig, idx = [...chain.idx];
    this.soft = soft; this.idx = chain.idx; this.s = 1;
    this.links = [];
    for (let l = 0; l < rig.linkA.length; l++) if (idx.includes(rig.linkA[l]) && idx.includes(rig.linkB[l])) this.links.push([l, rig.linkLen[l]]);
    this.wins = [];
    for (const g of soft.windows) if ([...g.ix].every((i) => idx.includes(i))) this.wins.push([g, Float64Array.from(g.q)]);
    this.teth = [];
    const T = soft._tethers;
    if (T) for (let q = 0; q < T.i.length; q++) if (idx.includes(T.i[q]) && T.i[q] !== idx[0]) this.teth.push([q, T.lim[q]]);
    const R = rig.rest, a = idx[0], b = idx[idx.length - 1];
    this.len = Math.hypot(R[b * 3] - R[a * 3], R[b * 3 + 1] - R[a * 3 + 1], R[b * 3 + 2] - R[a * 3 + 2]);
    this.root = [R[a * 3], R[a * 3 + 1], R[a * 3 + 2]];
    this.tipR = soft.r[b];
  }

  set(s) {
    if (Math.abs(s - this.s) < 1e-3) return;
    this.s = s;
    const rig = this.soft.rig, T = this.soft._tethers;
    for (const [l, L] of this.links) rig.linkLen[l] = L * s;
    for (const [g, q] of this.wins) for (let j = 0; j < q.length; j++) g.q[j] = q[j] * s;
    for (const [q, L] of this.teth) T.lim[q] = L * s;
  }

  /* after the pose bones: the posed chain slid out from its root */
  pose() {
    const s = this.s, P = this.soft.pose;
    if (s < 1.001 || !P) return;
    const idx = this.idx, r = idx[0];
    const rx = P[r * 3], ry = P[r * 3 + 1], rz = P[r * 3 + 2];
    for (let j = 1; j < idx.length; j++) {
      const i = idx[j];
      P[i * 3] = rx + (P[i * 3] - rx) * s; P[i * 3 + 1] = ry + (P[i * 3 + 1] - ry) * s; P[i * 3 + 2] = rz + (P[i * 3 + 2] - rz) * s;
    }
  }
}

/* ── the bipeds ──────────────────────────────────────────────────────────── */

const READY = {
  boxer:  { R: [-0.28, 0.42, 0.86], L: [0.2, 0.5, 0.86], lean: 0.12 },
  tennis: { R: [-0.75, 0.05, 0.65], L: [0.45, 0.1, 0.85], lean: 0.08 },
  sumo:   { R: [-0.8, -0.05, 0.6], L: [0.8, -0.05, 0.6], lean: 0.2 },
};

export class BipedPuppet extends FightMixin(Athlete) {
  constructor(soft, style) {
    super(soft);
    this._fightInit();
    this.style = style;
    this.balanceK = 0.011;
    this.armR = [spring(), spring(), spring()];
    this.armL = [spring(), spring(), spring()];
    this.lean3 = [spring(), spring(), spring()];
    const r = READY[style];
    r.R.forEach((v, d) => { this.armR[d].x = v; }); r.L.forEach((v, d) => { this.armL[d].x = v; });
    this.wrist = spring(); this.wrist.x = 0.9;
    this.tR = r.R; this.tL = r.L; this.tLean = [r.lean, 0, 0];
    this.stiff = 260;
    this.rq = style === 'tennis' ? racquetFrame(soft, this.cfg.armR, 0.9) : null;
    this.restY = this.c0[1];
    // the arms can be thrown out past their sewn length (a heavy's reach)
    this.reachR = new ChainStretch(soft, this.rig.arms[this.cfg.armR]);
    this.reachL = new ChainStretch(soft, this.rig.arms[this.cfg.armL]);
    this.sR = spring(); this.sR.x = 1; this.sL = spring(); this.sL.x = 1;
    this.tS = [1, 1];
  }

  _springs() { return [...super._springs(), ...this.armR, ...this.armL, ...this.lean3, this.wrist, this.sR, this.sL]; }

  /* how much an arm must grow for its fist to reach `x` world units in
     front of his middle (the sim's hit box edge), the body leaning `lean`
     into it: the socket's own place along the aim, the arm's length, the
     fist's size (and the racquet's, for the leopard) */
  _reachFor(arm, x, lean = 0) {
    const C = arm.root, c0 = this.c0, a = this.aim;
    const along = (C[0] - c0[0]) * a[0] + (C[2] - c0[2]) * a[2];
    const prop = this.style === 'tennis' && arm === this.reachR ? 0.75 : 0;
    const lift = Math.sin(lean) * (C[1] - 0.2);
    return clamp((x - along - lift - arm.tipR - prop) / arm.len, 1, 2.6);
  }

  /* the sim says what he's doing; pick the pose targets */
  perform(F, ph) {
    this.F = F;
    const st = this.style, R0 = READY[st];
    const bob = Math.sin(this.time * TAU * 1.6) * 0.06;
    let R = R0.R, L = R0.L, lean = [R0.lean + bob * 0.3, 0, 0], k = 260, wrist = 0.9;
    const act = F.act;
    this.tS = [1, 1];
    if (act === 'dash') {
      // a dash: the body thrown low into the direction of travel, arms tucked
      const fwd = F.dd > 0;
      lean = fwd ? [0.55, 0, 0] : [-0.35, 0, 0];
      R = [-0.35, 0.3, fwd ? 0.75 : 0.5]; L = [0.3, 0.35, fwd ? 0.75 : 0.5];
      k = 500;
    }
    this.lookAt = this.oppHead;
    if (act === 'walkF') lean = [R0.lean + 0.1, 0, Math.sin(this.time * TAU * 2.2) * 0.06];
    if (act === 'walkB') lean = [R0.lean - 0.05, 0, Math.sin(this.time * TAU * 2.2) * 0.06];
    if (act === 'crouch') lean = [R0.lean + 0.25, 0, 0];
    if (act === 'jump') { R = [-0.6, 0.6, 0.4]; L = [0.6, 0.6, 0.4]; lean = [0.1, 0, 0]; }
    if (act === 'blockstun' || (F.back && (act === 'idle' || act === 'walkB' || act === 'crouch') && this.threat)) {
      R = [0.15, 0.75, 0.62]; L = [-0.12, 0.72, 0.66]; lean = [-0.05, 0, 0]; k = 500;
      if (F.down) { R = [0.2, 0.2, 0.9]; L = [-0.15, 0.25, 0.9]; lean = [0.3, 0, 0]; }
    }
    if (act === 'hitstun') { const s = clamp(1 - F.t / 14, 0, 1); R = [-0.8, 0.2, -0.2]; L = [0.8, 0.3, -0.1]; lean = [-0.35 * s, 0, 0.1 * s]; k = 400; }
    if (act === 'grabbed') { R = [-0.3, 0.9, 0.2]; L = [0.3, 0.9, 0.2]; lean = [-0.15, 0, Math.sin(this.time * 30) * 0.1]; k = 500; }
    if (act === 'win') {
      // a fist pumped at the sky, one then the other
      const w = Math.sin(this.time * TAU * 1.1);
      R = [-0.55, 0.75 + 0.35 * w, 0.15]; L = [0.55, 0.75 - 0.35 * w, 0.15]; lean = [-0.12, 0, 0.08 * w];
      if (st === 'tennis') L = [0.5, -0.4, 0.4];
    }
    if (act === 'lose') { R = [-0.4, -0.9, 0.2]; L = [0.4, -0.9, 0.2]; lean = [0.35, 0, 0]; }
    if (ph) ({ R, L, lean, k, wrist } = this._attack(F, ph, R, L, lean, k, wrist));
    this.tR = R; this.tL = L; this.tLean = lean; this.stiff = k; this.tWrist = wrist;
    this.fallTarget = act === 'down' || act === 'ko' ? 1 : 0;
    this.crouchT = act === 'crouch' || (act === 'blockstun' && F.down) || (ph && ph.m.low) ? 1 : 0;
  }

  _attack(F, ph, R, L, lean, k, wrist) {
    const st = this.style, mv = F.mv, t = ph.t;
    const w = ph.wind;
    let o = ph.out;
    const tip = (h) => (h.box.x + h.box.w) / 1000 - 0.12;     // the hit box's far edge, world units
    k = 900;
    if (mv === 'light') {
      // a jab: the lead (left) hand snapped straight out to the hit box's edge
      // (thrown from the first frame: the stuffing needs the head start)
      o = t < ph.first ? smooth(0, ph.first, t + 1) : o;
      L = mix3([0.25, 0.45, 0.85], [0.05, 0.12, 1], o); lean = [0.15 + 0.2 * o, 0.25 * o, 0];
      this.tS[1] = mix(1, this._reachFor(this.reachL, tip(ph.m.hits[0]), lean[0]) * 1.12, o);
      if (st === 'tennis') {
        R = mix3([-0.9, 0.2, 0.2], [-0.2, 0.15, 1], o); L = [0.5, 0.1, 0.7]; wrist = 0.3; lean = [0.15, -0.35 * o, 0];
        this.tS = [mix(1, this._reachFor(this.reachR, tip(ph.m.hits[0]), lean[0]), o), 1];
      }
      if (st === 'sumo') { L = mix3([0.6, 0.3, 0.7], [0.15, 0.35, 1], o); lean = [0.25 + 0.2 * o, 0.2 * o, 0]; }
    } else if (mv === 'heavy') {
      // the heavy: a wind-up (he rears back, the punching arm drawn far
      // behind him, the body turned away and sinking), then the lunge —
      // he steps in, turns through it and the arm goes all the way out,
      // well past the jab, to the hit box's far edge; then a slow return
      const first = ph.first, load = smooth(0, first * 0.55, t), fire = smooth(first - 5, first - 1, t);
      const back = load * (1 - fire);
      const reachX = tip(ph.m.hits[0]);
      const leanOut = 0.42;
      const S = this._reachFor(st === 'sumo' ? this.reachL : this.reachR, reachX, leanOut) * 1.2;
      const out = Math.max(fire * (t <= ph.last ? 1 : o), 0);
      if (st === 'boxer') {
        R = mix3(mix3(R, [-0.75, 0.45, -0.7], back), [0.04, 0.2, 1], out);
        L = mix3(L, [0.35, 0.55, 0.6], back);
        lean = [mix(-0.22 * back, leanOut, out), mix(-0.7 * back, 0.55, out), 0];
        this.tS = [mix(1, S, out), 1];
      } else if (st === 'tennis') {
        // the racquet taken right back over the shoulder, then a long flat drive
        R = mix3(mix3(R, [-0.9, 0.6, -0.75], back), [0.15, 0.25, 1], out);
        wrist = mix(mix(0.9, 1.7, back), 0.15, out);
        lean = [mix(-0.2 * back, leanOut, out), mix(-0.75 * back, 0.6, out), 0];
        this.tS = [mix(1, S, out), 1];
      } else {
        // sumo: both palms drawn back to the hips, then a two-handed shove
        R = mix3(mix3(R, [-0.75, -0.2, -0.65], back), [-0.12, 0.2, 1], out);
        L = mix3(mix3(L, [0.75, -0.2, -0.65], back), [0.12, 0.2, 1], out);
        lean = [mix(-0.25 * back, leanOut + 0.1, out), 0, 0];
        this.tS = [mix(1, S, out), mix(1, S, out)];
      }
      k = back > 0.05 && out < 0.05 ? 500 : 1800;
    } else if (mv === 'lowLight') {
      L = mix3([0.3, -0.1, 0.8], [0.1, -0.55, 1], o); lean = [0.45, 0.15 * o, 0];
      if (st === 'tennis') { R = mix3([-0.6, -0.2, 0.5], [-0.1, -0.6, 1], o); wrist = 0.1; }
    } else if (mv === 'airLight' || mv === 'airHeavy') {
      const a = mv === 'airHeavy';
      R = mix3([-0.5, 0.7, 0.3], [-0.1, -0.7, 0.9], o); L = a ? mix3([0.5, 0.7, 0.3], [0.1, -0.7, 0.9], o) : [0.6, 0.3, 0.5];
      lean = [0.3 * o, 0, 0];
      if (st === 'tennis') { R = mix3([-0.3, 1, -0.2], [0, -0.6, 1], o); wrist = mix(1.6, 0.4, o); }
    } else if (mv === 'signature') {
      if (st === 'boxer') {
        // Glacier Uppercut: the right fist from the floor to the sky
        const up = smooth(3, 9, t);
        R = mix3([-0.2, -0.9, 0.4], [0.05, 1, 0.25], up); L = [0.4, 0.2, 0.6]; lean = [mix(0.4, -0.15, up), 0.3 * up, 0];
      } else if (st === 'tennis') {
        // Serve: toss with the left, the racquet up and over
        const sw = smooth(6, 13, t);
        L = mix3([0.3, 0.2, 0.7], [0.1, 1, 0.2], smooth(0, 6, t) * (1 - smooth(12, 18, t)));
        R = mix3([-0.5, 1, -0.6], [0.2, -0.3, 1], sw); wrist = mix(1.8, 0.2, sw); lean = [mix(-0.2, 0.35, sw), 0, 0];
      } else {
        // Bamboo Headbutt: head down, arms back, flying
        R = [-0.6, -0.2, -0.8]; L = [0.6, -0.2, -0.8]; lean = [0.9 * Math.max(w, o), 0, 0]; k = 700;
      }
    } else if (mv === 'special') {
      if (st === 'boxer') {
        // Avalanche Rush: a flurry, left-right-left, leaning in
        const ph2 = ((t - 4) / 5) % 2, alt = ph2 < 1 ? 1 : 0, p = Math.sin((ph2 % 1) * Math.PI);
        R = alt ? mix3([-0.3, 0.4, 0.7], [-0.05, 0.25, 1], p) : [-0.3, 0.45, 0.7];
        L = alt ? [0.3, 0.45, 0.7] : mix3([0.3, 0.4, 0.7], [0.05, 0.25, 1], p);
        lean = [0.4, (alt ? 0.25 : -0.25) * p, 0];
        if (t > 44) { const s = smooth(44, 50, t); R = mix3([-1, 0.1, -0.2], [0.2, 0.9, 0.7], s); lean = [0.2, mix(-0.4, 0.4, s), 0]; }
      } else if (st === 'tennis') {
        const ph2 = ((t - 6) / 9) % 1, sw = smooth(0.2, 0.6, ph2);
        L = [0.2, 0.9, 0.3];
        R = mix3([-0.5, 1, -0.5], [0.3, -0.2, 1], sw); wrist = mix(1.8, 0.2, sw); lean = [mix(-0.15, 0.3, sw), 0, 0];
      } else {
        // Hundred Paw Slap, then up and down on her bottom
        if (t < 42) {
          const p = Math.abs(Math.sin(t * 0.8)), q = Math.abs(Math.cos(t * 0.8));
          R = mix3([-0.6, 0.5, 0.4], [-0.05, 0.3, 1], p); L = mix3([0.6, 0.5, 0.4], [0.05, 0.3, 1], q);
          lean = [0.35, 0.15 * (p - q), 0];
        } else { R = [-0.7, 0.7, -0.2]; L = [0.7, 0.7, -0.2]; lean = [t < 58 ? -0.5 : -0.8, 0, 0]; }
      }
    }
    return { R, L, lean, k, wrist };
  }

  _think(dt) {
    const k = this.stiff;
    const R = this.fv(...this.tR), L = this.fv(...this.tL);
    for (let d = 0; d < 3; d++) {
      ease(this.armR[d], R[d], k, dt);
      ease(this.armL[d], L[d], k, dt);
      ease(this.lean3[d], this.tLean[d], 140, dt);
    }
    ease(this.wrist, this.tWrist ?? 0.9, 300, dt);
    ease(this.sR, this.tS[0], this.stiff > 600 ? 2600 : 300, dt);
    ease(this.sL, this.tS[1], this.stiff > 600 ? 2600 : 300, dt);
    this.reachR.set(clamp(this.sR.x, 1, 2.6));
    this.reachL.set(clamp(this.sL.x, 1, 2.6));
    // a lean in the fight frame → a rotation vector in the plush's frame:
    // forward lean is a turn about the side axis, a twist about up
    const l = this.lean3.map((s) => s.x);
    const sd = this.side;
    this.lean = [sd[0] * l[0] + 0 * l[1] + this.aim[0] * l[2], l[1], sd[2] * l[0] + this.aim[2] * l[2]];
    this.face = Math.atan2(this.aim[0], this.aim[2]) * 0.35;
    this.daze = Math.max(0, this.daze - dt * 0.6);
    if (this.rq) this.rq = racquetFrame(this.soft, this.cfg.armR, this.wrist.x, this.rq);
  }

  _applyPose() {
    super._applyPose();
    if (this.pose.active) { this.reachR.pose(); this.reachL.pose(); }
  }

  _bones() {
    const ar = this.armR.map((s) => s.x), al = this.armL.map((s) => s.x);
    return [this.armBone(this.cfg.armR, ar), this.armBone(this.cfg.armL, al)];
  }

  _push(h) {
    // a velocity kick from the sim (the group's own acceleration, a blow)
    const s = this.soft;
    // falling over (a knockdown, the K.O.): balance off, a shove back; up
    // again: the damped get-up servo, then balance resumes
    if (this.fallTarget && !this.fallen) {
      this.fallen = 1;
      this.balanceK = 0;
      const b = this.aim;
      this.shove([-b[0] * 3.2, 2.2, -b[2] * 3.2], (i, y) => clamp((y - 0.8) / 2, 0, 1));
    }
    if (this.fallen) {
      if (!this.fallTarget) {
        rightUp(s, h, { k: 9, maxTurn: 3.2, standY: this.restY, maxLift: 2 });
        if (s.cloudR[0][4] > 0.93) { this.fallen = 0; this.balanceK = 0.011; s.params.mu = 0.55; }
      } else { settle(s, h, 3); this.balanceK = 0; }
    } else if (this.crouchT) {
      // crouching: the head and shoulders pressed down a little
      const x = s.x;
      for (const i of this.cfg.core) x[i * 3 + 1] -= 9 * h * h * 60;
    }
    // keep him on his mark in the plush's own frame (the group moves him)
    this.drive = this.fallen ? null : { x: this.home[0], z: this.home[1], speed: 2.5 };
    if (this.F && (this.F.act === 'walkF' || this.F.act === 'walkB')) this._stepInPlace(h);
  }

  _stepInPlace(h) {
    const s = this.soft, x = s.x;
    this.stepPhase += h * 3.6;
    const ph = this.stepPhase * TAU, lift = s.params.gravity * 1.7, hh = h * h;
    for (let f = 0; f < 2; f++) {
      const up = Math.max(0, Math.sin(ph + f * Math.PI)) * lift;
      for (const i of this.feet[f]) x[i * 3 + 1] += up * hh;
    }
  }
}

/* ── the giraffe ─────────────────────────────────────────────────────────── */

export class GiraffePuppet extends FightMixin(Athlete) {
  constructor(soft) {
    super(soft);
    this._fightInit();
    this.balanceK = 0.009;
    const rest = this.rig.rest, cfg = this.cfg;
    const neck = this.rig.arms[cfg.neck];
    const N = neck.idx.length;
    const P = (i) => [rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]];
    this.neckCh = neck;
    this.pivotRest = P(neck.idx[0]);
    this.neckTop = neck.idx[N - 1];
    const ix = [], w = [];
    for (let j = 1; j < N; j++) { ix.push(neck.idx[j]); w.push(Math.min(1, j / (N - 2))); }
    for (const i of cfg.skull) if (!ix.includes(i)) { ix.push(i); w.push(1); }
    this.neckBone = { ix: Int32Array.from(ix), w: Float64Array.from(w), pivot: this.pivotRest };
    // the top half of the neck, for a curl over (Sky Neck)
    const ix2 = [], w2 = [];
    for (let j = (N >> 1); j < N; j++) { ix2.push(neck.idx[j]); w2.push(Math.min(1, (j - (N >> 1) + 1) / (N - (N >> 1) - 1))); }
    for (const i of cfg.skull) if (!ix2.includes(i)) { ix2.push(i); w2.push(1); }
    this.upperBone = { ix: Int32Array.from(ix2), w: Float64Array.from(w2), pivotIx: neck.idx[N >> 1] };
    this.nx = spring(); this.ny = spring(); this.curl = spring(); this.headP = spring(); this.stretch = spring();
    this.stretch.x = 1;
    this.lean3 = [spring(), spring()];
    this.restY = this.c0[1];
    this.targets = { nx: 0.12, ny: 0, curl: 0, head: 0, stretch: 1, lean: [0, 0], k: 200 };
    // the neck's links, windows and tethers at rest (the stretch scales them)
    this._linkSet = [];
    for (let l = 0; l < this.rig.linkA.length; l++) {
      const a = this.rig.linkA[l], b = this.rig.linkB[l];
      if (neck.idx.includes(a) && neck.idx.includes(b)) this._linkSet.push([l, this.rig.linkLen[l]]);
    }
    this._winSet = [];
    soft.windows.forEach((g, k) => {
      const ixs = [...g.ix];
      if (ixs.every((i) => neck.idx.includes(i))) this._winSet.push([g, Float64Array.from(g.q)]);
    });
    const T = soft._tethers;
    this._tethSet = [];
    if (T) for (let q = 0; q < T.i.length; q++) {
      const i = T.i[q];
      if (neck.idx.includes(i) || cfg.skull.includes(i)) this._tethSet.push([q, T.lim[q]]);
    }
    this._curS = 1;
    { const a = neck.idx[0], b = neck.idx[N - 1]; this.neckLen = Math.hypot(rest[b * 3] - rest[a * 3], rest[b * 3 + 1] - rest[a * 3 + 1], rest[b * 3 + 2] - rest[a * 3 + 2]); }
  }

  _springs() { return [...super._springs(), this.nx, this.ny, this.curl, this.headP, this.stretch, ...this.lean3]; }

  /* how far the neck must stretch for the head to reach a hit box's far
     edge (world units in front of her middle): measured at rest, scaled */
  neckReach(h) {
    const R = this.rig.rest, r = this.neckCh.idx[0], c0 = this.c0, a = this.aim;
    const along = (R[r * 3] - c0[0]) * a[0] + (R[r * 3 + 2] - c0[2]) * a[2];
    const want = (h.box.x + h.box.w) / 1000 - 0.15 - along - 0.45;          // less the head's own length
    return clamp(want / (this.neckLen * 0.82), 1, 3.2);
  }

  perform(F, ph) {
    this.F = F;
    const T = { nx: 0.15 + Math.sin(this.time * TAU * 1.3) * 0.05, ny: 0, curl: 0, head: 0, stretch: 1, lean: [0, 0], k: 200 };
    const act = F.act;
    this.lookAt = this.oppHead;
    if (act === 'crouch') { T.nx = 0.7; T.head = 0.4; T.lean = [0.15, 0]; }
    if (act === 'blockstun' || (F.back && this.threat && (act === 'idle' || act === 'walkB' || act === 'crouch'))) { T.nx = -0.35; T.head = 0.5; T.lean = [-0.1, 0]; T.k = 500; }
    if (act === 'hitstun') { T.nx = -0.4 * clamp(1 - F.t / 14, 0, 1); T.head = -0.4; T.lean = [-0.15, 0]; T.k = 500; }
    if (act === 'jump') { T.nx = 0.5; T.head = 0.3; }
    if (act === 'win') { T.nx = -0.1; T.head = -0.3 + Math.sin(this.time * 7) * 0.2; }
    if (act === 'lose') { T.nx = 1.2; T.head = 0.6; }
    if (act === 'grabbed') { T.nx = -0.3; T.head = -0.5 + Math.sin(this.time * 25) * 0.2; T.k = 500; }
    if (ph) {
      const t = ph.t, o = ph.out, w = ph.wind;
      T.k = 700;
      if (F.mv === 'light') { T.nx = mix(0.25, 1.1, o); T.head = -0.6 * o; T.stretch = mix(1, this.neckReach(ph.m.hits[0]), o); }
      else if (F.mv === 'heavy') {
        // the wind-up: the neck drawn right back and up, coiled; then it
        // snaps forward and down, stretched out to the hit box's far edge
        const back = smooth(0, ph.first * 0.6, t) * (1 - smooth(ph.first - 3, ph.first, t));
        const out = smooth(ph.first - 3, ph.first, t) * (t <= ph.last ? 1 : o);
        T.nx = mix(mix(0.15, -0.55, back), 1.25, out); T.head = mix(0.35 * back, -0.7, out);
        T.stretch = mix(mix(1, 0.92, back), this.neckReach(ph.m.hits[0]), out); T.lean = [mix(-0.12 * back, 0.14, out), 0];
        T.k = back > 0.05 && out < 0.05 ? 450 : 900;
      }
      else if (F.mv === 'lowLight') { T.nx = mix(0.6, 1.9, o); T.head = -1 * o; T.stretch = 1 + 0.3 * o; }
      else if (F.mv === 'airLight' || F.mv === 'airHeavy') { T.nx = mix(0.4, 1.6, o); T.head = -0.8; T.stretch = 1 + 0.3 * o; }
      else if (F.mv === 'signature') {
        // Ring Toss: the nose flicks up, then the throw
        const fl = smooth(2, 12, t) * (1 - smooth(14, 22, t));
        T.nx = mix(0.1, -0.35, fl) + 0.5 * smooth(13, 17, t) * (1 - smooth(22, 34, t)); T.head = -1.1 * fl + 0.3 * smooth(13, 17, t);
      } else if (F.mv === 'special') {
        // Sky Neck: straight up, out of the frame, then over and down
        const up = smooth(2, 14, t), over = smooth(18, 30, t), back = smooth(44, 60, t);
        T.nx = mix(mix(0, -0.1, up), 0.55, over) * (1 - back) + 0.1 * back;
        T.curl = 1.6 * over * (1 - back);
        T.stretch = 1 + (2.6 * up + this.reachK * over) * (1 - back);
        T.head = mix(0, 1.2, over) * (1 - back);
        T.k = 300;
      }
    }
    this.targets = T;
    this.fallTarget = act === 'down' || act === 'ko' ? 1 : 0;
  }

  _think(dt) {
    const T = this.targets;
    ease(this.nx, T.nx, T.k, dt); ease(this.ny, T.ny, T.k, dt); ease(this.curl, T.curl, T.k, dt);
    ease(this.headP, T.head, T.k, dt); ease(this.stretch, T.stretch, T.k * 0.6, dt);
    ease(this.lean3[0], T.lean[0], 120, dt); ease(this.lean3[1], T.lean[1], 120, dt);
    const sd = this.side;
    this.lean = [sd[0] * this.lean3[0].x, this.lean3[1].x, sd[2] * this.lean3[0].x];
    this.face = Math.atan2(this.aim[0], this.aim[2]) * 0.4;
    this.daze = Math.max(0, this.daze - dt * 0.6);
    this._setStretch(clamp(this.stretch.x, 0.9, 4.2));
  }

  /* the neck grows: its links, bending windows and tethers scale with it,
     and the pose (below) carries the head out along it */
  _setStretch(s) {
    if (Math.abs(s - this._curS) < 1e-3) return;
    this._curS = s;
    for (const [l, L] of this._linkSet) this.rig.linkLen[l] = L * s;
    for (const [g, q] of this._winSet) for (let j = 0; j < q.length; j++) g.q[j] = q[j] * s;
    const T = this.soft._tethers;
    for (const [q, L] of this._tethSet) T.lim[q] = L * s;
  }

  /* the neck turned toward the fight frame's forward (rotation about the side axis) */
  _applyPose() {
    const sd = this.side;
    const a = this.nx.x, c = this.curl.x;
    const rv = [sd[0] * a, this.yaw.x * 0.3, sd[2] * a];
    const rv2 = [sd[0] * c, 0, sd[2] * c];
    const level = 0.85;
    const hp = this.headP.x - (a + c) * level;
    const bones = [
      { ...this.neckBone, rv },
      ...(Math.abs(c) > 1e-3 ? [{ ...this.upperBone, rv: rv2 }] : []),
      { ix: this.cfg.skull, pivotIx: this.neckTop, rv: [sd[0] * hp, this.yaw.x * 0.6, sd[2] * hp] },
      ...this.cfg.ears.map((e) => ({ ix: e.ix, rv: [this.perk.x * 0.3, this.earTurn.x * 0.3, 0], pivotIx: e.root })),
    ];
    this.pose.apply(bones);
    // stretch the posed neck along itself: each neck point slides out from
    // the root by the stretch, and the head rides on the top
    const s = this._curS;
    if (s > 1.001) {
      const P = this.soft.pose, idx = this.neckCh.idx, r = idx[0];
      const rx = P[r * 3], ry = P[r * 3 + 1], rz = P[r * 3 + 2];
      const top = this.neckTop;
      const t0 = [P[top * 3], P[top * 3 + 1], P[top * 3 + 2]];
      for (let j = 1; j < idx.length; j++) {
        const i = idx[j];
        P[i * 3] = rx + (P[i * 3] - rx) * s; P[i * 3 + 1] = ry + (P[i * 3 + 1] - ry) * s; P[i * 3 + 2] = rz + (P[i * 3 + 2] - rz) * s;
      }
      const d = [P[top * 3] - t0[0], P[top * 3 + 1] - t0[1], P[top * 3 + 2] - t0[2]];
      for (const i of this.cfg.skull) { if (idx.includes(i)) continue; P[i * 3] += d[0]; P[i * 3 + 1] += d[1]; P[i * 3 + 2] += d[2]; }
    }
  }

  _push(h) {
    const s = this.soft;
    if (this.fallTarget && !this.fallen) {
      this.fallen = 1; this.balanceK = 0;
      const b = this.aim;
      this.shove([-b[0] * 2.5, 1.5, -b[2] * 2.5], (i, y) => clamp((y - 1) / 3, 0, 1));
    }
    if (this.fallen) {
      if (!this.fallTarget) {
        rightUp(s, h, { k: 8, maxTurn: 3, standY: this.restY, maxLift: 2 });
        if (s.cloudR[0][4] > 0.93) { this.fallen = 0; this.balanceK = 0.009; s.params.mu = 0.55; }
      } else { settle(s, h, 3); this.balanceK = 0; }
    }
    this.drive = this.fallen ? null : { x: this.home[0], z: this.home[1], speed: 2.5 };
    if (this.F && (this.F.act === 'walkF' || this.F.act === 'walkB')) BipedPuppet.prototype._stepInPlace.call(this, h);
  }

  _bones() { return []; }
}

/* ── the octopus ─────────────────────────────────────────────────────────── */

export class OctopusPuppet extends FightMixin(class {}) {
  constructor(soft) {
    super();
    this.soft = soft;
    this.rig = soft.rig;
    this._fightInit();
    this.time = 0;
    this.daze = 0;
    this.lookAt = null;
    this.gaze = null;
    this.pose = new Pose(soft, -1);
    this.arms = this.rig.arms.map((a) => ({ k: a.k, angle: a.angle, idx: a.idx, grab: null }));
    this.restC = [0, 0, 0];
    const ix = this.rig.head, rest = this.rig.rest;
    for (const i of ix) for (let d = 0; d < 3; d++) this.restC[d] += rest[i * 3 + d] / ix.length;
    this.squash = spring();
    this.sway = spring();
    this.plan = [];        // arm k → {target (plush frame), k}
    soft.hooks.push((h) => this._apply(h));
    this.events = [];
  }

  headCentre(out = [0, 0, 0]) { const c = this.soft.headC; out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return out; }

  /* the arms nearest a direction (in the plush's frame), nearest first */
  armsToward(dir, n = 2) {
    return [...this.arms].sort((a, b) => (Math.sin(b.angle) * dir[0] + Math.cos(b.angle) * dir[2]) - (Math.sin(a.angle) * dir[0] + Math.cos(a.angle) * dir[2])).slice(0, n);
  }

  perform(F, ph) {
    this.F = F;
    const act = F.act, c = this.restC;
    const plan = [];
    const A = this.aim, S = this.side;
    const at = (side, up, fwd) => [c[0] + S[0] * side + A[0] * fwd, up, c[2] + S[2] * side + A[2] * fwd];
    let squash = 0, sway = Math.sin(this.time * TAU * 1.1) * 0.5;      // the ginga: always swaying
    const front = this.armsToward(A, 4);
    if (act === 'crouch') squash = 0.35;
    if (act === 'blockstun' || (F.back && this.threat && (act === 'idle' || act === 'walkB' || act === 'crouch'))) {
      plan.push({ a: front[0], t: at(-0.5, 1.6, 1.0), k: 0.25 }, { a: front[1], t: at(0.5, 1.6, 1.0), k: 0.25 });
      squash = 0.2; sway = 0;
    }
    if (act === 'hitstun') { squash = -0.1; sway = 0; }
    if (act === 'win') {
      const w = Math.sin(this.time * TAU * 1.5);
      plan.push({ a: front[0], t: at(-1.2, 3.2 + w * 0.3, 0.3), k: 0.18 }, { a: front[1], t: at(1.2, 3.2 - w * 0.3, 0.3), k: 0.18 });
    }
    if (act === 'grabbed') { squash = 0.3; sway = Math.sin(this.time * 30) * 0.8; }
    if (act === 'ko' || act === 'down') { squash = 0.6; sway = 0; }
    if (act === 'lose') squash = 0.4;
    if (ph) {
      const t = ph.t, o = ph.out;
      const tip = (h) => (h.box.x + h.box.w) / 1000 - 0.15;
      if (F.mv === 'light') {
        // a long rubbery jab: one tentacle pulled out to the hit box and back
        if (o > 0.05) plan.push({ a: front[0], t: at(0.15, 1.35, mix(1.6, tip(ph.m.hits[0]), o)), k: 0.45 * o });
      } else if (F.mv === 'heavy') {
        // the wind-up: two arms coiled back behind her, the head pulled down;
        // then both whipped out together, all the way to the far edge
        const back = smooth(0, ph.first * 0.6, t) * (1 - smooth(ph.first - 3, ph.first, t));
        const out = smooth(ph.first - 3, ph.first, t) * (t <= ph.last ? 1 : o);
        if (out > 0.05) {
          plan.push({ a: front[0], t: at(-0.3, 1.25, mix(1.8, tip(ph.m.hits[0]), out)), k: 0.55 * out });
          plan.push({ a: front[1], t: at(0.3, 1.25, mix(1.8, tip(ph.m.hits[0]), out)), k: 0.55 * out });
        } else if (back > 0.05) {
          plan.push({ a: front[0], t: at(-0.9, 1.9, -0.6), k: 0.3 * back });
          plan.push({ a: front[1], t: at(0.9, 1.9, -0.6), k: 0.3 * back });
          squash = 0.25 * back; sway = 0;
        }
      } else if (F.mv === 'lowLight') {
        if (o > 0.05) plan.push({ a: front[0], t: at(0, 0.2, mix(1.4, 2.6, o)), k: 0.45 * o });
        squash = 0.3;
      } else if (F.mv === 'signature') {
        // Tentacle Sweep: two arms raked along the floor
        const sw = smooth(7, 14, t);
        if (t > 4 && t < 30) {
          plan.push({ a: front[0], t: at(mix(-2, 1, sw), 0.15, mix(1.5, 3.1, Math.sin(sw * Math.PI) * 0.6 + 0.4)), k: 0.45 });
          plan.push({ a: front[1], t: at(mix(-1.4, 1.6, sw), 0.15, mix(1.5, 2.8, Math.sin(sw * Math.PI) * 0.6 + 0.4)), k: 0.4 });
        }
        squash = 0.35; sway = mix(-1, 1, sw) * 1.2;
      } else if (F.mv === 'airLight' || F.mv === 'airHeavy') {
        if (o > 0.05) {
          plan.push({ a: front[0], t: at(-0.3, -0.5, mix(1, 2.2, o)), k: 0.45 * o });
          if (F.mv === 'airHeavy') plan.push({ a: front[1], t: at(0.3, -0.5, mix(1, 2.2, o)), k: 0.45 * o });
        }
      } else if (F.mv === 'special') {
        // Abraço: all eight arms reach out together
        const r = smooth(2, 10, t) * (1 - smooth(16, 30, t));
        this.arms.forEach((a, j) => { if (r > 0.02) plan.push({ a, t: at(Math.sin(j * 0.8) * 0.9, 1.0 + (j % 3) * 0.5, mix(1.5, 3.0, r)), k: 0.35 * r }); });
        squash = -0.2 * r;
      } else if (F.mv === 'specialHold') {
        // …and squeeze: the arms wrapped round the other fighter, pulsing
        const sq = 0.5 + 0.5 * Math.sin(t * 0.55);
        const R = mix(1.2, 0.75, sq);
        this.arms.forEach((a, j) => {
          const th = (j / 8) * TAU;
          plan.push({ a, t: at(Math.cos(th) * R * 0.9, 1.9 + Math.sin(th) * R * 1.2, 1.55 + Math.cos(th * 2) * 0.35), k: 0.32 });
        });
        squash = -0.15; sway = 0;
      }
    }
    this.plan = plan;
    this.tSquash = squash; this.tSway = sway;
    this.lookAt = this.oppHead;
  }

  update(dt) {
    this.time += dt;
    ease(this.squash, this.tSquash ?? 0, 120, dt);
    ease(this.sway, this.tSway ?? 0, 60, dt);
    this.daze = Math.max(0, this.daze - dt * 0.6);
    // grabs: Flock's pull, a tip drawn toward its target
    const want = new Map();
    for (const p of this.plan) want.set(p.a.k, p);
    for (const a of this.arms) {
      const id = 'arm' + a.k, p = want.get(a.k);
      const tip = a.idx[a.idx.length - 1];
      if (p && p.k > 0.01) {
        if (!a.grab) { this.soft.grab(id, tip, p.t, p.k); a.grab = true; }
        else { this.soft.moveGrab(id, p.t); this.soft.grabs.get(id).k = p.k; }
      } else if (a.grab) { this.soft.release(id); a.grab = false; }
    }
    const T = this.lookAt;
    this.gaze = T ? { at: T, amount: 1 } : null;
  }

  _apply(h) {
    const s = this.soft, x = s.x, hh = h * h;
    // the ginga: the head rocks side to side over the arms
    const S = this.side, sw = this.sway.x * 6;
    // squash: the head pressed down (crouch, a K.O.) or drawn up (a reach)
    const sq = this.squash.x * 60;
    for (const i of this.rig.head) {
      x[i * 3] += S[0] * sw * hh; x[i * 3 + 2] += S[2] * sw * hh;
      x[i * 3 + 1] -= sq * hh * (x[i * 3 + 1] > 1.2 ? 1 : 0.3);
    }
    // keep it on its mark in its own frame
    const c = s.headC;
    const dx = this.restC[0] - c[0], dz = this.restC[2] - c[2];
    for (const i of this.rig.head) { x[i * 3] += dx * 2 * h; x[i * 3 + 2] += dz * 2 * h; }
  }

  reset() {
    for (const a of this.arms) if (a.grab) { this.soft.release('arm' + a.k); a.grab = false; }
    this.plan = [];
  }
}
