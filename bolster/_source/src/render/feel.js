/* Kevalanche's feel pass: a richer rig and three-beat timing (render only).

   The owner: "it would be nice to have that powerful ease-in and then strike
   on some of the attacks … maybe some of our rigs need to be a little more
   intricate to make the motion more fluid." Before this, his moves played at
   one even speed (every target eased by one critically damped spring) and
   each arm was one stiff chain turned about the shoulder.

   The rig (all pose-side: the soft body is the same particles, the same fur,
   the same gloves; nothing new is drawn, so there are no seams or joint balls):
   - elbows: each arm chain bends at two of its particles (a rounded elbow,
     the bend shared 35 / 65 between them), the forearm folding toward a hint
     (up for a guard and a wind-up, in for a hook);
   - wrists: the glove rolls about the forearm (a corkscrew on the punch) and
     lags its arm on a soft spring (render/gloves.js `feel`);
   - spine: a twist of the upper body about the vertical, weighted up the
     torso (hips 0, shoulders and arms 1, the head 0.45 so the eyes stay on
     the opponent); the hips are the balance servo's own twist, so the hips
     can lead and the chest and arm follow;
   - knees: a sink — the upper body lowered in the pose and the knee
     particles pushed forward — for the coil, the landing, a buckle.
   - secondary: velocity kicks on the ears, belly and fists at the strike,
     the contact and the landing; the stuffing does the rest (follow-through).

   The beats, inside the sim's frame data (startup / active / recovery are the
   sim's; this only decides where the plush is inside them):
   - anticipation: a slow, eased coil over most of the startup — the weight
     back, the hips and the shoulder leading backwards, the knees in;
   - strike: the last 2 ticks of startup into the first active one: stiff
     springs, hips first, chest next, the arm last, a stretch along the arm,
     a kick on the fist;
   - impact + recovery: on contact the glove squashes and the target gets a
     crunchy squash (fight.js); the arm overshoots a touch past its end pose,
     then everything comes home on underdamped springs (a soft settle).

   It reads the sim; it never writes to it. `?feel=old` plays the previous
   BipedPuppet('boxer') instead (main.js sets FEEL.old).                  */

import { BipedPuppet } from './puppets.js';
import { clamp, spring, TAU } from '../../shared/grommet/athletes/game.js';

import { TOSS } from '../fighters/index.js';

export const FEEL = { old: false };

const mix = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t * (3 - 2 * t); };
const easeIn = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return t * t; };
const easeOut = (a, b, x) => { const t = clamp((x - a) / (b - a || 1e-6), 0, 1); return 1 - (1 - t) * (1 - t); };
/* a damped spring: zeta 1 critical, < 1 overshoots and settles */
function drive(s, target, k, z, dt) {
  s.v += (k * (target - s.x) - 2 * z * Math.sqrt(k) * s.v) * dt;
  s.x += s.v * dt;
}
const vspring = (v) => v.map((x) => ({ x, v: 0 }));

/* a pose of the whole bear, in the fight frame. Arms: [out, up, fwd] (out:
   away from his own middle on that arm's side), `b` the elbow bend (rad),
   `hint` which way the forearm folds ('up' | 'in' | 'fwd'), `roll` the
   glove's turn about the forearm (0 thumb up, 1 palm down). */
const GUARD = {
  lead: [0.3, 0.05, 0.95], leadB: 1.05, rear: [0.42, -0.12, 0.9], rearB: 1.45,
  hip: 0, chest: 0, pitch: 0.12, roll: 0, sink: 0.12,
};

export class BoxerFeel extends BipedPuppet {
  constructor(soft) {
    super(soft, 'boxer');
    const rig = this.rig, rest = rig.rest, n = soft.n;
    this.chR = rig.arms[this.cfg.armR]; this.chL = rig.arms[this.cfg.armL];
    // arm targets per physical arm (fight frame, eased): direction, elbow, roll, stretch
    this.aR = { d: vspring([-0.42, -0.12, 0.9]), b: spring(), roll: spring(), s: spring() };
    this.aL = { d: vspring([0.3, 0.05, 0.95]), b: spring(), roll: spring(), s: spring() };
    this.aR.b.x = 1.45; this.aL.b.x = 1.05; this.aR.s.x = this.aL.s.x = 1;
    this.hip = spring(); this.chest = spring(); this.pitch = spring(); this.roll = spring(); this.sink = spring();
    this.pitch.x = 0.12; this.sink.x = 0.12;
    this.tgt = null;
    this.lead = 'L';
    this.kicks = [];
    this.frac = 1;                   // the render's place between two sim ticks
    this.freeze = 0;                 // > 0 while the sim's hit-pause holds (render)
    this.gloveFx = [{ squash: spring(), roll: 0 }, { squash: spring(), roll: 0 }];   // [R, L]
    // the spine twist: weights by rest height; arms (whole chains, anchors
    // too) turn with the shoulders; the head a little less
    const w = new Float64Array(n), inArm = new Uint8Array(n), inHead = new Uint8Array(n);
    for (const ch of [this.chR, this.chL]) { for (const i of ch.idx) inArm[i] = 1; if (ch.anchor >= 0) inArm[ch.anchor] = 1; }
    for (const i of this.cfg.head) inHead[i] = 1;
    for (let i = 0; i < n; i++) {
      const y = rest[i * 3 + 1];
      w[i] = inArm[i] ? 1 : inHead[i] ? 0.45 : sstep(0.9, 1.85, y);
    }
    const ix = [], ww = [];
    for (let i = 0; i < n; i++) if (w[i] > 0.01) { ix.push(i); ww.push(w[i]); }
    // (sorted by weight, so the pose computes each rotation once per weight)
    const order = ix.map((i, k) => k).sort((a, b) => ww[a] - ww[b]);
    this.spine = { ix: Int32Array.from(order.map((k) => ix[k])), w: Float64Array.from(order.map((k) => ww[k])), pivot: [this.c0[0], 0, this.c0[2]] };
    // the sink: everything above the feet lowered by its height; the knees
    // (the leg chains' middle particles) pushed forward
    this.sinkW = new Float64Array(n);
    for (let i = 0; i < n; i++) this.sinkW[i] = sstep(0.32, 1.25, rest[i * 3 + 1]);
    this.knees = [];
    for (const k of this.cfg.legs) { const id = rig.arms[k].idx; for (let j = 1; j < id.length - 1; j++) this.knees.push([id[j], Math.sin(Math.PI * j / (id.length - 1))]); }
    // secondary motion: who gets the kicks
    this.ears = [];
    for (const e of this.cfg.ears) for (let j = 0; j < e.ix.length; j++) this.ears.push([e.ix[j], (j + 1) / e.ix.length]);
    this.belly = [];
    const c0 = this.c0;
    for (const i of rig.clouds[0].ix) {
      const y = rest[i * 3 + 1], z = rest[i * 3 + 2] - c0[2];
      if (y > 0.85 && y < 1.75 && z > 0.25 && !inHead[i]) this.belly.push([i, sstep(0.25, 0.6, z) * (1 - Math.abs(y - 1.3) / 0.5)]);
    }
    this.fists = [this.chR, this.chL].map((ch) => Array.from(ch.idx.slice(3), (i, j) => [i, (j + 1) / (ch.idx.length - 3)]));
    this.lastMove = '';
    this.wasAir = false;
    this.hitT = 99;
  }

  _springs() {
    const a = [this.aR, this.aL].flatMap((A) => [...A.d, A.b, A.roll, A.s]);
    return [...super._springs(), ...a, this.hip, this.chest, this.pitch, this.roll, this.sink];
  }

  /* fight-frame arm-local [out, up, fwd] → fight frame [side, up, fwd] for an arm */
  _side(arm, v) { return [arm === 'R' ? -v[0] : v[0], v[1], v[2]]; }

  /* the sim says what he's doing: targets for this frame */
  perform(F, ph) {
    this.F = F;
    this.lookAt = this.oppHead;
    const act = F.act;
    // the lead hand is the one nearer the opponent (he squares up the same
    // way whichever way he faces); latched while he's mid-move
    if (!ph || this.lastMove !== `${F.mv}`) this.lead = this.aim[0] >= 0 ? 'L' : 'R';
    const rear = this.lead === 'L' ? 'R' : 'L';
    // time: the sim's tick, plus where the render is between ticks
    const tt = ph ? Math.max(0, ph.t - 0.5 + this.frac) : 0;
    const T = { ...GUARD, k: 320, z: 0.8, kb: 300, kc: 260, kh: 180, ks: 300, sLead: 1, sRear: 1, hint: { lead: 'up', rear: 'up' }, rollL: 0, rollR: 0, crouch: 0 };
    const t = this.time;
    // idle: breathing in the knees, the gloves bobbing a beat behind
    const bob = Math.sin(t * TAU * 1.6);
    T.sink = 0.12 + 0.05 * bob; T.lead = [0.3, 0.05 + 0.03 * Math.sin(t * TAU * 1.6 - 0.9), 0.95]; T.chest = 0.04 * Math.sin(t * TAU * 0.8);
    if (act === 'walkF' || act === 'walkB') {
      const s = Math.sin(t * TAU * 2.2), f = act === 'walkF' ? 1 : -0.6;
      T.hip = 0.12 * s; T.chest = -0.06 * s; T.pitch = 0.12 + 0.1 * f; T.sink = 0.16 + 0.06 * Math.abs(s);
      T.roll = 0.05 * s;
    }
    if (act === 'dash') { const fwd = F.dd > 0; T.pitch = fwd ? 0.5 : -0.3; T.sink = 0.45; T.chest = fwd ? 0.15 : -0.1; T.k = 600; }
    if (act === 'crouch') { T.sink = 0.55; T.pitch = 0.35; T.crouch = 1; }
    if (act === 'jumpsquat') { T.sink = 0.9; T.pitch = 0.3; T.k = 900; T.ks = 1600; T.lead = [0.45, -0.3, 0.7]; T.rear = [0.5, -0.4, 0.6]; }
    if (act === 'jump') {
      // up: arms thrown up and out, legs tucked; coming down: the arms out for the landing
      const up = F.vy > 0 ? 1 : 0;
      T.lead = up ? [0.55, 0.7, 0.35] : [0.7, 0.15, 0.5]; T.rear = up ? [0.6, 0.65, 0.3] : [0.7, 0.1, 0.45];
      T.leadB = 0.5; T.rearB = 0.6; T.sink = up ? 0.55 : 0.2; T.pitch = 0.1; T.k = 260; T.z = 0.7;
    }
    if (act === 'guard' || act === 'blockstun') {
      // the shell: both gloves up in front of the face, elbows in, chin down
      T.lead = [0.2, 0.15, 0.95]; T.rear = [0.25, 0.1, 0.95]; T.leadB = 1.7; T.rearB = 1.75; T.pitch = 0.22; T.sink = 0.3; T.k = 900;
      if (F.down) { T.sink = 0.6; T.pitch = 0.45; T.crouch = 1; }
      if (act === 'blockstun') { const r = Math.max(0, 1 - F.t / 8); T.pitch -= 0.35 * r; T.chest = 0.12 * r; T.sink += 0.2 * r; T.k = 700; T.z = 0.55; }
    }
    if (act === 'hitstun') {
      // a whip back from the blow, the knees buckle, the arms flung loose;
      // then the body comes back on soft springs
      const s = Math.max(0, 1 - F.t / 12);
      T.pitch = 0.1 - 0.6 * s; T.chest = 0.35 * s * (this.lead === 'L' ? 1 : -1); T.sink = 0.2 + 0.45 * s; T.roll = 0.12 * s;
      T.lead = [0.75, 0.25, 0.4]; T.rear = [0.7, 0.1, 0.3]; T.leadB = 0.4; T.rearB = 0.5; T.k = 380; T.z = 0.45; T.kh = 500; T.kc = 500;
    }
    if (act === 'grabbed') {
      T.lead = [0.3, 0.9, 0.2]; T.rear = [0.3, 0.9, 0.2]; T.leadB = 0.3; T.rearB = 0.3; T.pitch = -0.15; T.roll = Math.sin(t * 30) * 0.1; T.k = 600;
      // held for a throw (render/throws.js): smothered under a jersey (arms
      // forced up, head ducked, flailing), hugged (arms pinned out), dangling
      const wf = Math.sin(t * 23);
      if (this.held === 'smother') { T.lead = [0.15 + 0.1 * wf, 1, 0.1]; T.rear = [0.15 - 0.1 * wf, 1, 0.1]; T.leadB = 0.15; T.rearB = 0.15; T.pitch = 0.5; T.hip = 0.12 * wf; T.k = 900; }
      else if (this.held === 'hug') { T.lead = [0.75, 0.45 + 0.2 * wf, 0.25]; T.rear = [0.75, 0.45 - 0.2 * wf, 0.25]; T.leadB = 0.5; T.rearB = 0.5; }
      else if (this.held === 'dangle') { T.lead = [0.3, -0.8, 0.35 + 0.25 * wf]; T.rear = [0.3, -0.8, 0.35 - 0.25 * wf]; T.leadB = 0.2; T.rearB = 0.2; T.pitch = 0.08; T.k = 300; }
    }
    if (act === 'down' || act === 'ko') { T.lead = [0.6, -0.6, 0.3]; T.rear = [0.6, -0.7, 0.2]; T.leadB = 0.2; T.rearB = 0.2; T.sink = 0.3; T.k = 120; T.z = 0.5; }
    if (act === 'win') {
      const w = Math.sin(t * TAU * 1.1);
      T.lead = [0.45, 0.8 + 0.3 * w, 0.2]; T.rear = [0.45, 0.8 - 0.3 * w, 0.2]; T.leadB = 0.35 - 0.3 * w; T.rearB = 0.35 + 0.3 * w;
      T.pitch = -0.12; T.roll = 0.08 * w; T.chest = 0.15 * w; T.sink = 0.1 + 0.15 * Math.abs(w);
    }
    if (act === 'lose') { T.lead = [0.4, -0.9, 0.2]; T.rear = [0.4, -0.9, 0.2]; T.leadB = 0.15; T.rearB = 0.15; T.pitch = 0.35; T.sink = 0.35; T.k = 140; }
    if (ph) this._attack(F, ph, tt, T, rear);
    this.tgt = T;
    // the base class's targets (it eases its own springs; ours drive the bones)
    this.tR = this.fv(...this._side('R', this.lead === 'R' ? T.lead : T.rear));
    this.tL = this.fv(...this._side('L', this.lead === 'L' ? T.lead : T.rear));
    this.tLean = [T.pitch, T.hip, T.roll];
    this.stiff = T.k; this.tWrist = 0.9;
    this.tS = this.lead === 'R' ? [T.sLead, T.sRear] : [T.sRear, T.sLead];
    this.fallTarget = act === 'down' || act === 'ko' ? 1 : 0;
    this.crouchT = act === 'crouch' || (guarding(F) && F.down) || (ph && ph.m.low) ? 1 : 0;
    // landing: a sink and a jiggle; the jump: a kick up the ears
    const air = !!F.air;
    if (this.wasAir && !air) { this.sink.v += 9; this._kick(this.belly, [0, -2.2, 0]); this._kick(this.ears, [0, -2.6, 0]); }
    if (!this.wasAir && air) this._kick(this.ears, [0, -1.8, 0]);
    this.wasAir = air;
    this.lastMove = ph ? `${F.mv}` : '';
  }

  /* Kevalanche's throws (render/throws.js). Forward, the hockey-fight
     jersey pull: the fists ride the jersey up from his chest over his head,
     the bear rattles him blind under it, hauls him up — and flips him away;
     the jersey stays in the fists, and goes over his shoulder. Back, the
     bear-hug suplex: both arms round his middle, a lift, the back arched
     (the plush's own turn, throws.js) and over. */
  _throws(t0, T, lead, once, punchKick) {
    const t = this.throwT ?? t0, g = this.grip, back = !!this.throwBack;
    const arm = (A) => (A === 'R' ? this.reachR : this.reachL);
    const aimArm = (A, spread, off, to, cap = 1.35) => {
      const c = arm(A), r = this.reachGrip(c.root, [off[0] + (A === 'R' ? -spread : spread), off[1], off[2]], to);
      return { v: this._side(A, r.d), s: clamp((r.l - c.tipR) / c.len, 1, cap) };
    };
    const set = (A, v, b, s) => { if (A === lead) { T.lead = v; T.leadB = b; T.sLead = s; } else { T.rear = v; T.rearB = b; T.sRear = s; } };
    T.hint = { lead: 'in', rear: 'in' };
    if (!back) {
      if (g) {
        const up = sstep(0.5, 6, t);
        const to = [mix(g.C[0], g.G[0], up), mix(g.C[1] - 0.35, g.G[1] + 0.05, up), mix(g.C[2], g.G[2], up)];
        for (const A of ['R', 'L']) { const a = aimArm(A, 0.2, [0, 0, -0.12], to); set(A, a.v, 0.3, a.s); }
        const sh = Math.sin(t * 1.7) * sstep(5, 7, t) * (1 - sstep(17, 19, t));
        const haul = sstep(18, 22, t) * (1 - sstep(22, 25, t)), flip = easeIn(22.5, 26, t);
        T.hip = 0.25 * sh; T.chest = 0.32 * sh; T.roll = 0.07 * sh;
        T.pitch = mix(mix(0.18, -0.3, haul), 0.5, flip); T.sink = mix(mix(0.25, 0.55, haul), 0.05, flip);
        T.k = 2400; T.kb = 2000; T.kc = 900; T.kh = 900;
        if (once('yank', 1)) { punchKick('R', 1.4); punchKick('L', 1.4); }
        if (once('flip', 23)) { punchKick('R', 2.6); punchKick('L', 2.6); this.sink.v -= 6; }
      } else {
        // the jersey left in his fists, a look at it — then over his shoulder
        const a = t - TOSS, toss = easeIn(6, 11, a), rec = sstep(11, 20, a);
        T.lead = mix3([0.12, 0.5, 0.9], [0.35, 1, -0.4], toss); T.rear = mix3([0.12, 0.45, 0.9], [0.5, 0.25, 0.6], toss);
        T.leadB = 0.35; T.rearB = 0.6; T.sLead = T.sRear = 1;
        T.chest = -0.45 * toss; T.hip = -0.2 * toss; T.pitch = mix(0.35, -0.15, toss); T.sink = 0.15; T.k = 1400; T.kb = 1200;
        if (once('jtoss', TOSS + 8)) punchKick(lead, 1.8);
        if (rec) {
          T.lead = mix3(T.lead, GUARD.lead, rec); T.rear = mix3(T.rear, GUARD.rear, rec); T.leadB = mix(T.leadB, GUARD.leadB, rec); T.rearB = mix(T.rearB, GUARD.rearB, rec);
          T.chest = mix(T.chest, 0, rec); T.hip = mix(T.hip, 0, rec); T.pitch = mix(T.pitch, GUARD.pitch, rec); T.k = 300; T.z = 0.5;
        }
      }
    } else if (g) {
      for (const A of ['R', 'L']) { const a = aimArm(A, 0.45, [0, 0, 0.2], g.C, 1.3); set(A, a.v, 0.9, a.s); }
      const lift = sstep(6, 12, t), arch = sstep(12, 23, t);
      T.pitch = mix(mix(0.25, 0, lift), -0.5, arch); T.sink = mix(0.3 + 0.3 * lift, 0.15, arch);
      T.k = 1800; T.kb = 1500; T.kc = 600; T.kh = 600;
      if (once('hug', 2)) this._kick(this.belly, [0, -1.6, 0]);
    } else {
      const a = t - TOSS, rec = sstep(2, 18, a);
      T.lead = mix3([0.6, 0.85, -0.2], GUARD.lead, rec); T.rear = mix3([0.6, 0.8, -0.2], GUARD.rear, rec);
      T.leadB = mix(0.3, GUARD.leadB, rec); T.rearB = mix(0.3, GUARD.rearB, rec); T.sLead = T.sRear = 1;
      T.pitch = mix(-0.6, GUARD.pitch, rec); T.sink = mix(0.25, 0.12, rec); T.k = 400; T.z = 0.5;
      if (once('slamB', TOSS)) { this.sink.v += 8; this._kick(this.belly, [0, -2.5, 0]); }
    }
  }

  /* the beats of one move: where he is in its startup / active / recovery */
  _attack(F, ph, t, T, rear) {
    const mv = F.mv, first = ph.first, last = ph.last, total = ph.total;
    const lead = this.lead;
    const drive = (arm) => (arm === 'R' ? 1 : -1);          // + twist brings the right shoulder forward
    const tip = (h) => (h.box.x + h.box.w) / 1000 - 0.12;
    const reach = (arm, x, lean) => this._reachFor(arm === 'R' ? this.reachR : this.reachL, x, lean);
    // a new move: kicks fire once, at their tick
    if (this.lastMove !== `${mv}` || t + 0.5 < (this._lt ?? 0)) this.fired = {};
    this._lt = t;
    const once = (key, at) => { if (t >= at && !this.fired[key]) { this.fired[key] = 1; return true; } return false; };
    const punchKick = (arm, sp) => {
      const d = this.fv(0, 0.1, 1), side = arm === 'R' ? 0 : 1;
      this._kick(this.fists[side], [d[0] * sp, d[1] * sp, d[2] * sp]);
      this._kick(this.belly, [-d[0] * sp * 0.18, 0.4, -d[2] * sp * 0.18]);
      this._kick(this.ears, [-d[0] * sp * 0.3, -0.3 * sp * 0.2, -d[2] * sp * 0.3]);
    };
    // where the move is: c (coil, eased in, then held), f (fire), r (recovery)
    const beats = (fireLen, coilEnd = first - fireLen) => ({
      c: sstep(0, Math.max(1, coilEnd), t),
      f: easeIn(first - 2 - fireLen, first - 2, t),
      r: t > last ? easeOut(last, total, t) : 0,
    });
    if (mv === 'light') {
      // the jab: a flick of the lead shoulder back, then the lead hand
      // snapped straight out, a corkscrew to palm-down, a bounce home
      const b = beats(2, first - 4);
      const L0 = [0.3, 0.02, 0.86], Lc = [0.38, 0.0, 0.7], Lx = [0.06, 0.12, 1];
      T.lead = b.f > 0 ? mix3(Lc, Lx, b.f) : mix3(L0, Lc, b.c);
      T.leadB = mix(mix(1.05, 1.35, b.c), 0.08, b.f);
      T.chest = drive(lead) * mix(-0.12 * b.c, 0.28, b.f); T.hip = drive(lead) * 0.1 * b.f;
      T.pitch = mix(0.08, 0.3, b.f); T.sink = mix(0.2, 0.08, b.f);
      T.sLead = mix(1, reach(lead, tip(ph.m.hits[0]), 0.3) * 1.1, b.f) * (t > first && t < last + 1 ? 1.04 : 1);
      T[lead === 'L' ? 'rollL' : 'rollR'] = b.f;
      T.k = b.f > 0 ? 5200 : 420; T.z = 1; T.kb = b.f > 0 ? 4000 : 400; T.kc = b.f > 0 ? 2400 : 300;
      if (b.r > 0) { T.k = 520; T.z = 0.5; T.kb = 500; T.kc = 320; T.sLead = 1; T.lead = GUARD.lead; T.leadB = GUARD.leadB; T.chest = 0; T.hip = 0; T.pitch = GUARD.pitch; }
      if (once('jab', first - 3)) punchKick(lead, 2);
    } else if (mv === 'heavy') {
      // the heavy hook: the big coil (knees in, weight back, the hips and
      // the rear shoulder turned away, the rear glove drawn back by the ear),
      // a beat held — then the hips go, the chest, and the arm last, round
      // in an arc, stretched to the hit box's far edge; a long springy settle
      const D = drive(rear);
      const coilEnd = first - 7;
      const c = sstep(0, coilEnd, t);
      const hipF = easeIn(first - 6, first - 3, t), chF = easeIn(first - 5, first - 2, t), armF = easeIn(first - 4, first - 2, t);
      const reachX = tip(ph.m.hits[0]), S = reach(rear, reachX, 0.45) * 1.18;
      const Rc = [0.85, 0.42, -0.62], Rmid = [0.62, 0.28, 0.62], Rx = [0.0, 0.3, 1];
      T.rear = armF < 0.5 ? mix3(mix3(GUARD.rear, Rc, c), Rmid, armF * 2) : mix3(Rmid, Rx, (armF - 0.5) * 2);
      T.rearB = mix(mix(GUARD.rearB, 1.0, c), 0.12, armF);
      T.hint.rear = armF > 0.2 ? 'in' : 'up';
      T.lead = mix3(mix3(GUARD.lead, [0.25, 0.25, 1], c), [0.45, 0.25, 0.55], chF);
      T.leadB = mix(1.05, 1.5, chF);
      T.hip = D * mix(-0.45 * c, 0.42, hipF);
      T.chest = D * mix(-0.65 * c, 0.5, chF);
      T.pitch = mix(mix(0.12, -0.22, c), 0.5, hipF);
      T.sink = mix(mix(0.12, 0.9, c), -0.05, hipF);
      T.sRear = mix(1, S, armF) * (t >= first - 2 && t <= first ? 1.06 : 1);
      T[rear === 'L' ? 'rollL' : 'rollR'] = armF;
      const firing = t >= first - 6 && t <= last;
      T.k = firing ? (armF > 0 && t < first ? 6000 : 1600) : 360; T.z = firing ? 1 : 0.85;
      T.kb = firing ? 5000 : 260; T.kc = firing ? 3000 : 200; T.kh = firing ? 2200 : 160; T.ks = firing ? 2200 : 260;
      if (t > last) {
        // home: underdamped, so the twist swings back a touch past guard and settles
        T.rear = GUARD.rear; T.rearB = GUARD.rearB; T.lead = GUARD.lead; T.leadB = GUARD.leadB; T.sRear = 1;
        T.hip = -0.08 * D * (1 - easeOut(last, total, t)); T.chest = -0.1 * D * (1 - easeOut(last, total, t)); T.pitch = GUARD.pitch; T.sink = 0.2;
        T.k = 230; T.z = 0.42; T.kb = 260; T.kc = 200; T.kh = 160; T.ks = 300;
      }
      if (once('coil', 1)) this._kick(this.belly, [0, -0.8, 0]);
      if (once('hips', first - 6)) this._kick(this.belly, this.fv(0.3 * D, 0, -0.8));
      if (once('hook', first - 3)) punchKick(rear, 3.2);
    } else if (mv === 'lowLight') {
      // a low jab from the crouch: a dip, then the lead hand shot along the mat
      const b = beats(2, first - 4);
      T.lead = b.f > 0 ? mix3([0.38, -0.3, 0.7], [0.08, -0.55, 1], b.f) : mix3([0.3, -0.1, 0.85], [0.38, -0.3, 0.7], b.c);
      T.leadB = mix(1.2, 0.08, b.f); T.rear = [0.3, 0.15, 0.95]; T.rearB = 1.6;
      T.pitch = mix(0.4, 0.6, b.f); T.sink = 0.65; T.chest = drive(lead) * mix(-0.1 * b.c, 0.25, b.f); T.crouch = 1;
      T.sLead = mix(1, 1.15, b.f); T[lead === 'L' ? 'rollL' : 'rollR'] = b.f;
      T.k = b.f > 0 ? 5000 : 420; T.kb = b.f > 0 ? 4000 : 400; T.kc = 1500;
      if (b.r > 0) { T.k = 480; T.z = 0.5; T.lead = [0.3, -0.1, 0.85]; T.leadB = 1.1; T.sLead = 1; }
      if (once('low', first - 3)) punchKick(lead, 2);
    } else if (mv === 'airLight' || mv === 'airHeavy') {
      // in the air: wound up over his head, then the fist (both, heavy) down through it
      const both = mv === 'airHeavy';
      const b = beats(2, first - 4);
      const up = [0.4, 0.85, 0.2], dn = [0.08, -0.65, 0.9];
      T.lead = mix3(mix3(GUARD.lead, up, b.c), dn, b.f); T.leadB = mix(mix(1, 1.5, b.c), 0.15, b.f);
      T.rear = both ? T.lead : [0.6, 0.3, 0.4]; T.rearB = both ? T.leadB : 0.8;
      T.pitch = mix(mix(0.1, -0.3, b.c), 0.45, b.f); T.sink = mix(0.5, 0.3, b.f); T.chest = drive(lead) * mix(-0.2 * b.c, 0.2, b.f);
      T.k = b.f > 0 ? 4000 : 380; T.kb = b.f > 0 ? 3000 : 300;
      if (once('air', first - 3)) punchKick(lead, both ? 3 : 2);
    } else if (mv === 'dive' || mv === 'diveLand') {
      // the double-fist hammer: both gloves raised high over his head, the
      // back arched through the hang; slammed down; the landing crumples him
      if (mv === 'dive') {
        const c = sstep(0, 4, t), f = easeIn(4, 6, t);
        const up = [0.12, 1, -0.1], dn = [0.1, -0.4, 0.95];
        T.lead = mix3(mix3(GUARD.lead, up, c), dn, f); T.rear = T.lead;
        T.leadB = mix(mix(1, 1.2, c), 0.15, f); T.rearB = T.leadB;
        T.pitch = mix(mix(0.1, -0.4, c), 0.6, f); T.sink = mix(0.3, 0.45, c); T.k = f > 0 ? 4500 : 300; T.kb = T.k;
        if (once('dive', 5)) punchKick(lead, 2.5);
      } else {
        const r = sstep(10, 28, t);
        T.lead = mix3([0.1, -0.45, 0.9], GUARD.lead, r); T.rear = mix3([0.12, -0.45, 0.9], GUARD.rear, r);
        T.leadB = mix(0.2, GUARD.leadB, r); T.rearB = mix(0.2, GUARD.rearB, r);
        T.pitch = mix(0.65, GUARD.pitch, r); T.sink = mix(1, 0.15, r); T.k = 300; T.z = 0.55; T.ks = 700;
        if (once('slam', 0)) { this.sink.v += 14; this._kick(this.belly, [0, -3.5, 0]); this._kick(this.ears, [0, -4, 0]); }
      }
    } else if (mv === 'throw') {
      // the grab: both arms shot out to take hold, a lean in
      const r = easeIn(1, 4, t) * (1 - sstep(9, 24, t));
      T.lead = mix3(GUARD.lead, [0.2, 0.35, 1], r); T.rear = mix3(GUARD.rear, [0.2, 0.35, 1], r);
      T.leadB = mix(1.05, 0.3, r); T.rearB = mix(1.45, 0.3, r); T.hint = { lead: 'in', rear: 'in' };
      T.pitch = mix(0.12, 0.4, r); T.sink = mix(0.2, 0.35, r); T.k = r > 0 && t < 9 ? 3000 : 400;
    } else if (mv === 'throwHold' && (this.grip || this.throwT != null)) {
      this._throws(t, T, lead, once, punchKick);
    } else if (mv === 'throwHold') {
      // the clinch (both gloves wrapped round him, a shake), a dip and a
      // half-turn back — then the two-handed shove, the hips through it
      const c = sstep(10, 18, t), toss = easeIn(19, 22, t), rec = sstep(28, 44, t);
      const sh = Math.sin(t * 0.9) * 0.12 * (1 - c);
      T.lead = mix3([0.0, 0.3, 0.85], [0.1, 0.35, 1], toss); T.rear = T.lead;
      T.leadB = mix(1.2, 0.15, toss); T.rearB = T.leadB; T.hint = { lead: 'in', rear: 'in' };
      T.hip = drive(rear) * mix(-0.25 * c, 0.3, toss) + sh; T.chest = drive(rear) * mix(-0.35 * c, 0.35, toss);
      T.pitch = mix(mix(0.15, -0.1, c), 0.65, toss); T.sink = mix(mix(0.2, 0.7, c), 0, toss);
      T.sLead = T.sRear = mix(1, 1.45, toss);
      T.k = toss > 0 && t < 26 ? 4000 : 500; T.kb = T.k; T.kc = toss > 0 ? 2500 : 400; T.kh = toss > 0 ? 2000 : 300;
      if (rec) { T.lead = mix3(T.lead, GUARD.lead, rec); T.rear = mix3(T.rear, GUARD.rear, rec); T.leadB = mix(T.leadB, GUARD.leadB, rec); T.rearB = mix(T.rearB, GUARD.rearB, rec); T.sLead = T.sRear = 1; T.k = 260; T.z = 0.45; T.hip = 0; T.chest = 0; }
      if (once('toss', 20)) { punchKick(lead, 2.5); punchKick(rear, 2.5); }
    } else if (mv === 'signature') {
      // Glacier Uppercut: the deep dip (knees right in, the rear glove down
      // by the hip, the shoulder turned away), then the legs drive, the hips
      // turn and the fist goes from the floor to the sky; he hangs at the top,
      // then drops back into his guard with a bounce
      const D = drive(rear);
      const c = sstep(0, first - 3, t), f = easeIn(first - 3, first - 1.2, t), hipF = easeIn(first - 3.5, first - 1.5, t);
      const Rlow = [0.45, -0.85, 0.35], Rup = [0.08, 1, 0.3];
      T.rear = mix3(mix3(GUARD.rear, Rlow, c), Rup, f); T.rearB = mix(mix(GUARD.rearB, 1.55, c), 0.25, f); T.hint.rear = f > 0.4 ? 'fwd' : 'up';
      T.lead = mix3(GUARD.lead, [0.4, 0.2, 0.7], c); T.leadB = 1.4;
      T.hip = D * mix(-0.3 * c, 0.35, hipF); T.chest = D * mix(-0.45 * c, 0.45, f);
      T.pitch = mix(mix(0.12, 0.45, c), -0.25, f); T.sink = mix(mix(0.12, 1.1, c), -0.2, hipF);
      T.sRear = mix(1, 1.18, f) * (t >= first && t <= first + 2 ? 1.05 : 1);
      T[rear === 'L' ? 'rollL' : 'rollR'] = -0.4 * f;
      const firing = t >= first - 3 && t <= last;
      T.k = firing ? (f > 0 ? 6500 : 1600) : 380; T.kb = firing ? 4500 : 300; T.kc = firing ? 3000 : 300; T.kh = firing ? 2200 : 200; T.ks = firing ? 2600 : 380;
      if (t > last) {
        const r = easeOut(last, total, t);
        T.rear = mix3(Rup, GUARD.rear, r); T.rearB = mix(0.25, GUARD.rearB, r); T.lead = GUARD.lead; T.sRear = 1;
        T.hip = D * 0.2 * (1 - r); T.chest = D * 0.25 * (1 - r); T.pitch = mix(-0.2, GUARD.pitch, r); T.sink = mix(0.3, 0.12, r);
        T.k = 240; T.z = 0.45; T.kb = 260; T.kc = 220; T.kh = 160; T.ks = 420;
      }
      if (once('dip', 1)) this._kick(this.belly, [0, -1.2, 0]);
      if (once('upper', first - 3)) { const sp = 3.5; this._kick(this.fists[rear === 'R' ? 0 : 1], [0, sp, 0]); this._kick(this.ears, [0, -2.5, 0]); this._kick(this.belly, [0, -1.6, 0]); }
    } else if (mv === 'special') {
      // Avalanche Rush: a big coil, then a flurry — lead, rear, lead … each
      // punch fired in 2 ticks with the shoulder behind it — then the last
      // hook wound right back and thrown with everything
      const hits = ph.m.hits, fin = hits[hits.length - 1].from;
      const c = sstep(0, first - 2, t);
      T.pitch = mix(-0.15, 0.45, sstep(first - 2, first, t)); T.sink = mix(0.2, 0.75, c);
      T.lead = mix3(GUARD.lead, [0.3, 0.1, 0.75], c); T.rear = mix3(GUARD.rear, [0.35, 0.0, 0.7], c); T.leadB = 1.4; T.rearB = 1.6;
      T.chest = drive(rear) * -0.3 * c; T.hip = drive(rear) * -0.15 * c;
      T.k = 600; T.kb = 800; T.kc = 900; T.kh = 700;
      if (t >= first - 3 && t < fin - 9) {
        // which punch of the flurry, and where in it
        let k = 0;
        for (let j = 0; j < hits.length - 1; j++) if (t >= hits[j].from - 4) k = j;
        const h0 = hits[k].from, arm = k % 2 ? rear : lead, other = arm === lead ? rear : lead;
        const f = easeIn(h0 - 4, h0 - 2, t), back = sstep(h0 + 1, h0 + 3, t), p = f * (1 - back);
        const out = [0.06, 0.15, 1], tuck = [0.32, 0.05, 0.8];
        T[arm === lead ? 'lead' : 'rear'] = mix3(tuck, out, p); T[arm === lead ? 'leadB' : 'rearB'] = mix(1.4, 0.1, p);
        T[other === lead ? 'lead' : 'rear'] = tuck; T[other === lead ? 'leadB' : 'rearB'] = 1.55;
        T[arm === lead ? 'sLead' : 'sRear'] = mix(1, 1.25, p);
        T[arm === 'L' ? 'rollL' : 'rollR'] = p;
        T.chest = drive(arm) * 0.32 * p; T.hip = drive(arm) * 0.15 * p; T.sink = 0.55 - 0.1 * p;
        T.k = 5000; T.kb = 4000; T.kc = 2600; T.kh = 1600;
        if (once(`r${k}`, h0 - 3)) punchKick(arm, 2);
      } else if (t >= fin - 9) {
        // the last one: a short coil, then the hook with the hips behind it
        const D = drive(rear);
        const cc = sstep(fin - 10, fin - 5, t), f = easeIn(fin - 4, fin - 2, t), hipF = easeIn(fin - 6, fin - 3, t);
        T.rear = f < 0.5 ? mix3(mix3([0.32, 0.05, 0.8], [0.8, 0.3, -0.35], cc), [0.62, 0.3, 0.6], f * 2) : mix3([0.62, 0.3, 0.6], [0.0, 0.3, 1], (f - 0.5) * 2);
        T.rearB = mix(mix(1.4, 1.6, cc), 0.15, f); T.hint.rear = f > 0.2 ? 'in' : 'up';
        T.lead = mix3([0.32, 0.05, 0.8], [0.45, 0.25, 0.55], f); T.leadB = 1.5;
        T.hip = D * mix(-0.4 * cc, 0.45, hipF); T.chest = D * mix(-0.55 * cc, 0.55, f);
        T.pitch = mix(mix(0.45, -0.15, cc), 0.55, hipF); T.sink = mix(mix(0.55, 0.85, cc), -0.05, hipF);
        T.sRear = mix(1, 1.3, f) * (t >= fin && t <= fin + 1 ? 1.06 : 1); T[rear === 'L' ? 'rollL' : 'rollR'] = f;
        const firing = t >= fin - 6 && t <= hits[hits.length - 1].to;
        T.k = firing ? 6000 : 300; T.kb = firing ? 5000 : 300; T.kc = firing ? 3000 : 250; T.kh = firing ? 2200 : 200; T.ks = firing ? 2200 : 300;
        if (t > hits[hits.length - 1].to) {
          T.rear = GUARD.rear; T.rearB = GUARD.rearB; T.lead = GUARD.lead; T.leadB = GUARD.leadB; T.sRear = 1; T.hip = 0; T.chest = 0;
          T.pitch = GUARD.pitch; T.sink = 0.2; T.k = 220; T.z = 0.4; T.kb = 240; T.kc = 180; T.kh = 140; T.ks = 300;
        }
        if (once('fin', fin - 3)) punchKick(rear, 3.5);
      }
    }
  }

  /* a velocity kick on some particles (weights), applied next substep */
  _kick(list, v) { this.kicks.push([list, v]); }

  /* a hit (or block) of his landed: the glove squashes, the arm gives a
     little at the contact, the belly and ears jiggle (fight.js calls it) */
  contact(e) {
    const F = this.F;
    if (!F || F.act !== 'attack') return;
    const heavy = F.mv === 'heavy' || F.mv === 'signature' || (F.mv === 'special' && e.dmg >= 60) || F.mv === 'airHeavy' || F.mv === 'dive';
    const arm = F.mv === 'light' || F.mv === 'lowLight' || F.mv === 'airLight' ? this.lead : this.lead === 'L' ? 'R' : 'L';
    const g = this.gloveFx[arm === 'R' ? 0 : 1];
    g.squash.v -= heavy ? 14 : 8;
    const d = this.fv(0, 0, 1), s = heavy ? -2.2 : -1.2;
    this._kick(this.fists[arm === 'R' ? 0 : 1], [d[0] * s, 0, d[2] * s]);
    this._kick(this.belly, [d[0] * 0.6, heavy ? -0.9 : -0.4, d[2] * 0.6]);
    this._kick(this.ears, [0, heavy ? -1.6 : -0.8, 0]);
  }

  _think(dt) {
    const T = this.tgt;
    if (!T) return super._think(dt);
    // the sim's hit-pause: the render holds too (a crunchy contact), only
    // the stuffing's own wobble goes on
    const slow = this.freeze > 0 ? 0.08 : 1;
    const h = dt * slow;
    for (const [A, arm] of [[this.aR, 'R'], [this.aL, 'L']]) {
      const isLead = arm === this.lead;
      const d = this.fv(...this._side(arm, isLead ? T.lead : T.rear));
      for (let k = 0; k < 3; k++) drive(A.d[k], d[k], T.k, T.z, h);
      drive(A.b, isLead ? T.leadB : T.rearB, T.kb, T.z, h);
      drive(A.roll, arm === 'L' ? T.rollL : T.rollR, 900, 0.7, h);
      drive(A.s, isLead ? T.sLead : T.sRear, T.ks > 1000 || T.k > 1000 ? 2600 : T.ks, 0.75, h);
    }
    // (the hips and the lean go through the balance servo, a pull on the
    // whole body: driven hard it whips the stuffing about, so they stay
    // moderate and the chest's twist, a pose, carries the speed)
    drive(this.hip, T.hip, Math.min(T.kh, 480), 1, h);
    drive(this.chest, T.chest, T.kc, T.z, h);
    drive(this.pitch, T.pitch, clamp(T.kh, 160, 360), 1, h);
    drive(this.roll, T.roll, 200, 0.7, h);
    drive(this.sink, T.sink, T.ks, Math.min(1, T.z + 0.1), h);
    for (const g of this.gloveFx) drive(g.squash, 0, 900, 0.3, dt);
    this.reachR.set(clamp(this.aR.s.x, 1, 2.6));
    this.reachL.set(clamp(this.aL.s.x, 1, 2.6));
    // keep the base springs in step (other code reads them: the trail, gloves)
    for (let k = 0; k < 3; k++) { this.armR[k].x = this.aR.d[k].x; this.armL[k].x = this.aL.d[k].x; }
    this.sR.x = this.aR.s.x; this.sL.x = this.aL.s.x;
    // hips: the balance servo's lean (pitch forward, twist, a little roll)
    const sd = this.side, l = [this.pitch.x, this.hip.x, this.roll.x];
    this.lean = [sd[0] * l[0] + this.aim[0] * l[2], l[1], sd[2] * l[0] + this.aim[2] * l[2]];
    this.face = Math.atan2(this.aim[0], this.aim[2]) * 0.35;
    this.daze = Math.max(0, this.daze - dt * 0.6);
    this.gloveFx[0].roll = this.aR.roll.x; this.gloveFx[1].roll = this.aL.roll.x;
  }

  /* an arm: the whole chain turned to `dir` about the shoulder (as before,
     less the spine's twist, which turns the arm with the chest afterwards),
     then the elbow bent at two particles toward the hint */
  _armBones(ch, dir, bend, hint, tw) {
    const c = Math.cos(-tw), s = Math.sin(-tw);
    const d = [c * dir[0] + s * dir[2], dir[1], -s * dir[0] + c * dir[2]];
    const bones = [this.armBone(ch.k, d)];
    if (Math.abs(bend) < 1e-3) return bones;
    const dl = Math.hypot(...d) || 1, u = d.map((v) => v / dl);
    let H = hint === 'in' ? this.fv(0, 0.15, 0) : hint === 'fwd' ? this.fv(0, 0, 1) : [0, 1, 0];
    if (hint === 'in') {
      // toward his own middle: the side axis, signed for this arm
      const sg = ch === this.chR ? 1 : -1;
      H = this.fv(sg, 0.2, 0.3);
      H = [c * H[0] + s * H[2], H[1], -s * H[0] + c * H[2]];
    }
    const hd = H[0] * u[0] + H[1] * u[1] + H[2] * u[2];
    let ax = [u[1] * (H[2] - hd * u[2]) - u[2] * (H[1] - hd * u[1]), u[2] * (H[0] - hd * u[0]) - u[0] * (H[2] - hd * u[2]), u[0] * (H[1] - hd * u[1]) - u[1] * (H[0] - hd * u[0])];
    const al = Math.hypot(...ax);
    if (al < 1e-5) return bones;
    ax = ax.map((v) => v / al);
    const idx = ch.idx;
    bones.push({ ix: idx.subarray(3), rv: ax.map((v) => v * bend * 0.35), pivotIx: idx[2] });
    bones.push({ ix: idx.subarray(4), rv: ax.map((v) => v * bend * 0.65), pivotIx: idx[3] });
    return bones;
  }

  _bones() {
    const T = this.tgt;
    if (!T) return super._bones();
    const tw = this.chest.x, hR = this.lead === 'R' ? T.hint.lead : T.hint.rear, hL = this.lead === 'L' ? T.hint.lead : T.hint.rear;
    const ar = this.aR.d.map((s) => s.x), al = this.aL.d.map((s) => s.x);
    return [
      ...this._armBones(this.chR, ar, this.aR.b.x, hR, tw),
      ...this._armBones(this.chL, al, this.aL.b.x, hL, tw),
      { ix: this.spine.ix, w: this.spine.w, rv: [0, tw, 0], pivot: this.spine.pivot },
    ];
  }

  _applyPose() {
    super._applyPose();
    const P = this.soft.pose;
    if (!this.pose.active || !P) return;
    // the sink: the body lowered over the knees, the knees forward
    const sk = clamp(this.sink.x, -0.35, 1.2);
    if (Math.abs(sk) > 1e-3) {
      const W = this.sinkW, dy = -0.17 * sk, a = this.aim;
      // (marked as touched, so the next apply starts them from rest again)
      const M = this.pose.touched;
      for (let i = 0; i < this.soft.n; i++) if (W[i] > 0) { P[i * 3 + 1] += dy * W[i]; M[i] = 1; }
      for (const [i, w] of this.knees) { P[i * 3] += a[0] * 0.13 * sk * w; P[i * 3 + 2] += a[2] * 0.13 * sk * w; M[i] = 1; }
      this.pose._reshape();
    }
  }

  _push(h) {
    // the queued kicks (velocity, so the stuffing carries them through)
    if (this.kicks.length) {
      const v = this.soft.v;
      for (const [list, k] of this.kicks) for (const [i, w] of list) { v[i * 3] += k[0] * w; v[i * 3 + 1] += k[1] * w; v[i * 3 + 2] += k[2] * w; }
      this.kicks.length = 0;
    }
    super._push(h);
  }
}

const guarding = (F) => F.act === 'blockstun' || F.act === 'guard';

/* which puppet Kevalanche gets: the feel pass, or the old one (?feel=old) */
export const boxerPuppet = (soft) => (FEEL.old ? new BipedPuppet(soft, 'boxer') : new BoxerFeel(soft));
