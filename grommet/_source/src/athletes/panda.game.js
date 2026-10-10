/* Sumo, for the pandas.

   Two plush pandas face each other across a felt dohyo. You are the
   challenger (red mawashi): drag-and-flick, or click, to set where he
   charges and how hard. The champion (purple mawashi, topknot) is the
   ring's own: he reads your charge, braces and meets it, pushes back,
   belly-bumps when your push sags, and side-steps a reckless one.

   Nothing is keyframed. Each panda is a stuffed cloud standing on the same
   balance pull as every standing athlete here, driven by a velocity servo
   with a capped acceleration — his strength — and every bit of contact
   between them is the soft body's own: their points collide (a broadphase
   between the two toys), so bellies squash, arms push (re-posed forward
   and pulled at the opponent by a force on their tips), and whoever pushes
   harder moves the other back across the felt. Footing gives way to a
   panda being driven backward fast, so a big shove can tip one over.

     a bout     a short shiko first (each lifts a leg and stomps; the
                ring's dust puffs), the charge, the clinch, until a panda
                touches the floor outside the rope, or touches down inside
                it (anything but his soles), or falls. A bout that drags on
                tires the challenger, so it always ends.
     after      the winner does a happy wobble, arms up; the loser sits
                down on his bottom, dazed. Then both walk back to their
                marks, turn to face each other, and it starts again.

   Champion: cloud 0, at +x facing −x. Challenger: cloud 1, at −x facing +x. */

import { Athlete, clamp, spring, ease, TAU } from './game.js';
import { balance, rightUp } from '../balance.js';
import { PANDA } from './panda.rig.js';

export const RING_R = PANDA.RING_R;
const SHIKO_T = 2.2;
const END_T = 3.2;
const BAL = 0.006;
const TIRE_T = 9;           // the challenger tires after this long in a clinch
const DECIDE_T = 15;        // and the judges decide, at the very latest
const CONTACT_D = 1.95;     // centres this close: they're locked together

const col = (B, v) => [B[0][0] * v[0] + B[1][0] * v[1] + B[2][0] * v[2], B[0][1] * v[0] + B[1][1] * v[1] + B[2][1] * v[2], B[0][2] * v[0] + B[1][2] * v[1] + B[2][2] * v[2]];
const colT = (B, v) => [B[0][0] * v[0] + B[0][1] * v[1] + B[0][2] * v[2], B[1][0] * v[0] + B[1][1] * v[1] + B[1][2] * v[2], B[2][0] * v[0] + B[2][1] * v[1] + B[2][2] * v[2]];

/* one wrestler: his cloud, his frame, his attention, his drive */
class Rikishi {
  constructor(game, cfg, k) {
    const rig = game.rig, rest = rig.rest;
    this.game = game; this.soft = game.soft; this.cfg = cfg; this.k = k;
    this.ix = rig.clouds[k].ix;
    this.all = rig.bodies[k].ix;
    this.side = cfg.side;
    this.mark = [cfg.side * PANDA.MARK, 0];
    this.restFwd = col(cfg.R, [0, 0, 1]);
    this.yaw = spring(); this.pitch = spring(); this.earTurn = spring(); this.perk = spring(); this.att = 0;
    this.reach = spring(); this.up = spring(); this.spread = spring();
    this.leanS = [0, 0, 0];
    this.leanT = [0, 0, 0];
    this.K = BAL;
    this.drive = null;
    this.daze = 0;
    this.standY = null;
    this.lift = [0, 0];          // each foot: an upward pull (shiko)
    this.stomp = [0, 0];
    this.bump = 0;
    // soles: the cloud's points by the floor, by side (his right is −x locally)
    this.feet = [[], []];
    this.sole = new Uint8Array(rig.n);
    let cy = 0;
    for (const i of this.ix) cy += rest[i * 3 + 1] / this.ix.length;
    this.standC = cy;
    for (const i of this.ix) {
      if (rest[i * 3 + 1] > 0.36) continue;
      const loc = colT(cfg.R, [rest[i * 3] - this.mark[0], 0, rest[i * 3 + 2] - this.mark[1]]);
      this.feet[loc[0] < 0 ? 0 : 1].push(i);
    }
    for (const i of this.all) if (rest[i * 3 + 1] < 0.4) this.sole[i] = 1;
    // the neck pivot: the cloud's rest point nearest it
    let best = 0, bd = 1e9;
    for (const i of this.ix) {
      const d = Math.hypot(rest[i * 3] - cfg.pivot[0], rest[i * 3 + 1] - cfg.pivot[1], rest[i * 3 + 2] - cfg.pivot[2]);
      if (d < bd) { bd = d; best = i; }
    }
    this.neck = best;
  }

  c() { return this.soft.cloudC[this.k]; }
  R() { return this.soft.cloudR[this.k]; }
  upright() { return this.R()[4]; }

  /* where he faces, in the world: his rest forward, turned with him */
  fwd() {
    const R = this.R(), f = this.restFwd;
    const v = [R[0] * f[0] + R[1] * f[1] + R[2] * f[2], 0, R[6] * f[0] + R[7] * f[1] + R[8] * f[2]];
    const l = Math.hypot(v[0], v[2]) || 1;
    return [v[0] / l, 0, v[2] / l];
  }

  /* a world vector in his own frame (+z forward, −x his right) */
  local(v) {
    const R = this.R();
    const r = [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
    return colT(this.cfg.R, r);
  }

  /* a local direction (his frame) as a rest-frame one, for the pose */
  rest(v) { return col(this.cfg.R, v); }

  headCentre() {
    const x = this.soft.x, ix = this.cfg.core, o = [0, 0, 0];
    for (const i of ix) { o[0] += x[i * 3]; o[1] += x[i * 3 + 1]; o[2] += x[i * 3 + 2]; }
    return o.map((v) => v / ix.length);
  }

  meanV() {
    const v = this.soft.v, o = [0, 0, 0];
    for (const i of this.ix) { o[0] += v[i * 3]; o[1] += v[i * 3 + 1]; o[2] += v[i * 3 + 2]; }
    return o.map((q) => q / this.ix.length);
  }

  /* per fixed step: attention on a target, springs */
  attend(T, dt) {
    let yawT = 0, pitchT = 0;
    if (T) {
      const hc = this.headCentre();
      const l = this.local([T[0] - hc[0], T[1] - hc[1], T[2] - hc[2]]);
      yawT = clamp(Math.atan2(l[0], l[2]), -0.8, 0.8);
      pitchT = clamp(Math.atan2(l[1], Math.hypot(l[0], l[2])), -0.5, 0.4);
    }
    this.att += clamp((T ? 1 : 0) - this.att, -dt * 0.8, dt * 4);
    ease(this.yaw, yawT * this.att, 90, dt);
    ease(this.pitch, pitchT * this.att, 90, dt);
    ease(this.earTurn, yawT * this.att, 120, dt);
    ease(this.perk, this.att, 60, dt);
    const lk = Math.min(1, dt * 5);
    this.leanS = this.leanS.map((v, d) => v + (this.leanT[d] - v) * lk);
    this.daze = Math.max(0, this.daze - dt / 3.5);
  }

  bones(armBone) {
    const cfg = this.cfg, out = [];
    out.push({ ix: cfg.head, rv: this.rest([-this.pitch.x, this.yaw.x, 0]), pivotIx: this.neck });
    for (const e of cfg.ears) out.push({ ix: e.ix, rv: this.rest([this.perk.x * 0.25, this.earTurn.x * 0.3, 0]), pivotIx: e.root });
    // arms: hanging (0), reaching forward at the chest (reach), up (up),
    // out to the sides on the knees (spread)
    const r = this.reach.x, u = this.up.x, s0 = this.spread.x;
    for (const [k, s] of [[cfg.armR, -1], [cfg.armL, 1]]) {
      const hang = [s * 0.5, -0.78, 0.36], fwd = [s * 0.22, -0.02, 1], upD = [s * 0.5, 0.85, 0.2], wide = [s * 0.75, -0.55, 0.35];
      const d = [0, 1, 2].map((q) => hang[q] * (1 - r - u - s0) + fwd[q] * r + upD[q] * u + wide[q] * s0);
      out.push(armBone(k, this.rest(d)));
    }
    return out;
  }
}

export class PandaGame extends Athlete {
  constructor(soft) {
    super(soft);
    const rig = this.rig;
    this.champ = new Rikishi(this, rig.toy, 0);
    this.chal = new Rikishi(this, rig.toy2, 1);
    this.both = [this.champ, this.chal];
    this.won = 0; this.lost = 0; this.streak = 0; this.bouts = 0;
    this.difficulty = 0.5;
    this.speed = 17;
    this.ritual = false;          // a shiko done since the last bout
    this.queued = null;           // a charge asked for before the ritual
    this.winner = null; this.loser = null; this.why = '';
    this.dust = [];
    this.home = [...this.champ.mark];
    this._restV = this.rig.restV;
    this.aimZ = null;
    this.msg = 'charge when ready';
    this._go('ready');
  }

  focus() {
    const a = this.champ.c(), b = this.chal.c();
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  }

  reset() {
    super.reset();
    for (const r of this.both) {
      for (const s of [r.yaw, r.pitch, r.earTurn, r.perk, r.reach, r.up, r.spread]) { s.x = 0; s.v = 0; }
      r.leanS = [0, 0, 0]; r.leanT = [0, 0, 0]; r.drive = null; r.daze = 0; r.standY = null; r.K = BAL; r.att = 0;
      r.lift = [0, 0]; r.stomp = [0, 0]; r.bump = 0;
    }
    this.ritual = false; this.queued = null; this.winner = this.loser = null;
    this.rig.restV = this._restV;
    this.msg = 'charge when ready';
    this._go('ready');
  }

  /* ── your charge ──────────────────────────────────────────────────────── */

  /* aim: [x, z] on the floor to charge toward (default: straight at him);
     power 0…1 (or from speed, the panel's pace) */
  launch({ aim = null, power = null, speed = this.speed } = {}) {
    if (power === null) power = clamp((speed - 6) / 16, 0.05, 1);
    const c = this.champ.c();
    aim = aim ? [aim[0], aim[1]] : [c[0], c[2]];
    if (this.state === 'clinch' || this.state === 'tachiai') {
      // another shove: a second wind toward where you point
      this.charge.aim = aim;
      this.charge.wind = Math.min(1.4, this.charge.wind + 0.45 * power + 0.15);
      this.msg = 'shove!';
      return null;
    }
    if (this.state === 'end' || this.state === 'reset') return null;
    this.queued = { aim, power };
    if (!this.ritual) { if (this.state !== 'shiko') this._go('shiko'); this.msg = 'shiko…'; return null; }
    this._tachiai();
    return null;
  }

  _tachiai() {
    const q = this.queued;
    this.queued = null;
    const ch = this.chal.c(), cc = this.champ.c();
    const d = [q.aim[0] - ch[0], q.aim[1] - ch[2]];
    const dl = Math.hypot(...d) || 1;
    const dir = [d[0] / dl, d[1] / dl];
    const to = [cc[0] - ch[0], cc[2] - ch[2]], tl = Math.hypot(...to) || 1;
    // how far off the line to him the charge is aimed (radians, signed)
    const off = Math.atan2(dir[0] * to[1] / tl - dir[1] * to[0] / tl, dir[0] * to[0] / tl + dir[1] * to[1] / tl);
    this.charge = { dir, power: q.power, off, wind: 1, t: 0 };
    // the champion reads it: a reckless charge (all-out, or well off the
    // line) he may simply step out of the way of
    const D = this.difficulty;
    const reckless = q.power > 0.85 || (q.power > 0.55 && Math.abs(off) > 0.3);
    this.plan = reckless && Math.random() < 0.35 + 0.4 * D ? 'henka' : 'meet';
    this.react = 0.18 - 0.08 * D + Math.random() * 0.06;
    // how he's feeling today: a little stronger or weaker, bout to bout
    this.form = 0.9 + Math.random() * 0.2;
    this.ritual = false;
    this.bouts++;
    this.msg = 'hakkeyoi!';
    this._go('tachiai');
  }

  /* ── per fixed step ───────────────────────────────────────────────────── */

  update(dt) {
    this.time += dt;
    this.t += dt;
    this._think(dt);
    const A = this.champ, B = this.chal;
    // they watch each other; between bouts, a glance at you now and then
    const watch = this.state !== 'end' || this.t < 0.6;
    A.attend(watch ? B.headCentre() : null, dt);
    B.attend(watch ? A.headCentre() : null, dt);
    this.gaze = A.att > 0.02 ? { at: B.headCentre(), amount: A.att } : null;
    this.gaze2 = B.att > 0.02 ? { at: A.headCentre(), amount: B.att } : null;
    this.pose.apply([...A.bones((k, d) => this.armBone(k, d)), ...B.bones((k, d) => this.armBone(k, d))]);
  }

  gazeOf(j) { return j === 0 ? this.gaze : this.gaze2; }

  _think(dt) {
    const A = this.champ, B = this.chal, st = this.state;
    const D = this.difficulty;
    const strength = (18 + 50 * D) * (this.form || 1);
    for (const r of this.both) { r.lift = [0, 0]; r.stomp = [0, 0]; }
    // facing: each toward the other
    const ca = A.c(), cb = B.c();
    const dAB = [cb[0] - ca[0], cb[2] - ca[2]];
    const dist = Math.hypot(...dAB) || 1;
    const nAB = [dAB[0] / dist, dAB[1] / dist];
    A.face = Math.atan2(nAB[0], nAB[1]);
    B.face = Math.atan2(-nAB[0], -nAB[1]);

    if (st === 'ready') {
      for (const r of this.both) {
        r.leanT = [0.1, 0, 0]; r.K = BAL; r.drive = this._home(r, 2.0);
        ease(r.reach, 0.15, 30, dt); ease(r.up, 0, 30, dt); ease(r.spread, 0.35, 30, dt);
      }
    } else if (st === 'shiko') this._shiko(dt);
    else if (st === 'tachiai' || st === 'clinch') this._bout(dt, strength, nAB, dist);
    else if (st === 'end') this._end(dt);
    else if (st === 'reset') this._reset(dt);
  }

  /* back to his mark, slowly; nothing if he's on it */
  _home(r, speed) {
    const c = r.c(), d = Math.hypot(c[0] - r.mark[0], c[2] - r.mark[1]);
    if (d < 0.05) return null;
    const dir = [(r.mark[0] - c[0]) / d, (r.mark[1] - c[2]) / d];
    return { dir, speed: Math.min(speed, d * 3), acc: 20 };
  }

  /* the ritual: each lifts a leg out to the side and stomps it down, then
     the other; the dust puffs where it lands */
  _shiko(dt) {
    const t = this.t;
    for (const r of this.both) {
      r.K = BAL; r.drive = null;
      ease(r.spread, 1, 40, dt); ease(r.reach, 0, 40, dt); ease(r.up, 0, 30, dt);
      const ph = t < 1.1 ? t / 1.1 : (t - 1.1) / 1.1;
      const foot = t < 1.1 ? 0 : 1;
      const s = foot === 0 ? -1 : 1;                  // which side is up (his right first)
      if (ph < 0.6) {
        // weight over the other leg, this one lifted out
        const u = Math.sin(Math.min(1, ph / 0.5) * Math.PI / 2);
        r.leanT = [0.08, 0, s * 0.34 * u];
        r.lift[foot] = u;
      } else if (ph < 0.75) {
        r.leanT = [0.12, 0, 0];
        r.stomp[foot] = 1;
        if (!r['stomped' + foot]) {
          r['stomped' + foot] = true;
          const f = r.feet[foot], x = this.soft.x;
          let m = [0, 0, 0];
          for (const i of f) for (let d = 0; d < 3; d++) m[d] += x[i * 3 + d] / f.length;
          this.events.push({ kind: 'dust', at: [m[0], 0.02, m[2]], strength: 1 });
        }
      } else r.leanT = [0.12, 0, 0];
    }
    if (t > SHIKO_T) {
      for (const r of this.both) { r.stomped0 = r.stomped1 = false; }
      this.ritual = true;
      if (this.queued) this._tachiai(); else { this._go('ready'); this.msg = 'charge when ready'; }
    }
  }

  _bout(dt, strength, nAB, dist) {
    const A = this.champ, B = this.chal, C = this.charge, D = this.difficulty;
    C.t += dt;
    // locked: body to body, each facing the other (a charge that brushes
    // past a side-step isn't a clinch)
    const fa = A.fwd(), fb = B.fwd();
    const facing = fa[0] * nAB[0] + fa[2] * nAB[1] > 0.5 && -(fb[0] * nAB[0] + fb[2] * nAB[1]) > 0.5;
    const locked = dist < CONTACT_D && (this.soft.touching || 0) > 4 && facing;
    if (this.state === 'tachiai' && locked) { this._go('clinch'); this.msg = 'locked together'; }
    const clinch = this.state === 'clinch';
    // ── the challenger: your charge, then your push, tiring
    const p = C.power;
    const stamina = clamp(Math.exp(-Math.max(0, C.t - 0.6) / (2.2 + 2.5 * p)) * C.wind, 0, 1.4) * (C.t > TIRE_T ? 0 : 1);
    C.wind = Math.max(1, C.wind - dt * 0.35);
    let bdir;
    if (clinch) {
      // into him, with whatever angle you gave it
      bdir = [-nAB[0] * 0.7 + C.dir[0] * 0.3, -nAB[1] * 0.7 + C.dir[1] * 0.3];
      const bl = Math.hypot(...bdir); bdir = [bdir[0] / bl, bdir[1] / bl];
      B.drive = { dir: bdir, speed: 0.6 + 2.4 * p, acc: (10 + 62 * p) * stamina };
    } else {
      bdir = C.dir;
      // the run-up lasts as long as the power behind it; while it does he
      // faces where he's running, not where the champion has got to
      const running = C.t < 0.4 + 1.3 * p;
      B.drive = running ? { dir: bdir, speed: 1.4 + 3.6 * p, acc: 25 + 60 * p } : { dir: bdir, speed: 0, acc: 12 };
      if (running) B.face = Math.atan2(bdir[0], bdir[1]);
    }
    B.leanT = [0.22 + 0.12 * p * stamina, 0, 0];
    ease(B.reach, locked ? 1 : 0.6, 60, dt); ease(B.spread, 0, 40, dt); ease(B.up, 0, 30, dt);

    // ── the champion
    const ca = A.c();
    const rA = Math.hypot(ca[0], ca[2]);
    if (this.plan === 'henka' && C.t < 0.36 && !locked) {
      // out of the way: he saw it coming, and jumps sideways off the line
      // of the charge (the side it isn't aimed at) as it starts
      const s = C.off >= 0 ? 1 : -1;
      const side = [-C.dir[1] * s, C.dir[0] * s];
      A.drive = { dir: side, speed: 5.6, acc: 160 };
      this.msg = 'henka — he side-steps!';
    } else if (this.t < this.react && this.state === 'tachiai') A.drive = null;
    else {
      // into him; near the rope, round him rather than back
      let dir = [nAB[0], nAB[1]];
      if (this.plan === 'henka' && !locked) {
        // after a side-step: shove him on his way
        const v = B.meanV();
        const vl = Math.hypot(v[0], v[2]);
        if (vl > 0.5) dir = [dir[0] * 0.5 + v[0] / vl * 0.5, dir[1] * 0.5 + v[2] / vl * 0.5];
      }
      if (rA > RING_R - 1.1) {
        // edge: turn the push sideways (circle out), more the closer he is
        const out = [ca[0] / rA, ca[2] / rA];
        const back = -(dir[0] * out[0] + dir[1] * out[1]);
        if (back > -0.2) {
          const tang = [-out[1], out[0]];
          const sgn = tang[0] * dir[0] + tang[1] * dir[1] >= 0 ? 1 : -1;
          const w = clamp((rA - (RING_R - 1.1)) / 0.9, 0, 0.08 + 0.22 * D);
          dir = [dir[0] * (1 - w) + tang[0] * sgn * w, dir[1] * (1 - w) + tang[1] * sgn * w];
        }
      }
      const dl = Math.hypot(...dir) || 1;
      dir = [dir[0] / dl, dir[1] / dl];
      // a belly-bump when your push sags
      A.bump = Math.max(0, A.bump - dt);
      if (locked && stamina < 0.75 && A.bump <= 0 && this.t > 0.8 && Math.random() < dt * (0.6 + 1.2 * D)) { A.bump = 0.35; this.msg = 'belly-bump!'; this._bumpKick = true; }
      const boost = A.bump > 0.12 ? 2.2 : 1;
      A.drive = { dir, speed: locked ? 1.6 : 1.2 + 0.8 * D, acc: (locked ? strength : strength * 0.8) * boost };
    }
    A.leanT = [0.2 + (A.bump > 0 ? 0.15 : 0), 0, 0];
    ease(A.reach, locked ? 1 : 0.55, 60, dt); ease(A.spread, 0, 40, dt); ease(A.up, 0, 30, dt);

    // footing: driven backward fast, a panda's balance gives
    for (const r of this.both) {
      const v = r.meanV(), f = r.fwd();
      const back = -(v[0] * f[0] + v[2] * f[2]);
      r.K = BAL * clamp(1 - (back - 0.9) / 1.4, 0.3, 1);
    }

    // ── is it over?
    const outA = this._out(A), outB = this._out(B);
    if (outA || outB) {
      const loser = outA && outB ? (outA.depth >= outB.depth ? A : B) : outA ? A : B;
      return this._decide(loser, (outA && loser === A ? outA : outB).why);
    }
    if (this.t > DECIDE_T) {
      const cb = B.c();
      return this._decide(Math.hypot(ca[0], ca[2]) > Math.hypot(cb[0], cb[2]) ? A : B, 'the judges decide');
    }
    if (clinch && C.t > TIRE_T && !this._tired) { this._tired = true; this.msg = 'the challenger tires…'; }
  }

  /* out of the ring, or down: {why, depth} or null */
  _out(r) {
    const x = this.soft.x, con = this.soft.contact;
    let depth = 0, why = null;
    for (const i of r.all) {
      if (!con[i]) continue;
      const rr = Math.hypot(x[i * 3], x[i * 3 + 2]);
      if (rr > RING_R) { const d = rr - RING_R; if (d > depth || !why) { depth = d; why = 'out of the ring'; } }
      else if (!r.sole[i] && !why) { why = 'touched down'; depth = 0.01; }
    }
    if (!why && r.upright() < 0.62) { why = 'over he goes'; depth = 0.02; }
    return why ? { why, depth } : null;
  }

  _decide(loser, why) {
    const A = this.champ, B = this.chal;
    this.loser = loser;
    this.winner = loser === A ? B : A;
    if (this.winner === B) { this.won++; this.streak = this.streak > 0 ? this.streak + 1 : 1; }
    else { this.lost++; this.streak = this.streak < 0 ? this.streak - 1 : -1; }
    this.why = why;
    this.msg = (this.winner === B ? 'you win — ' : 'the champion wins — ') + why;
    this._tired = false;
    for (const r of this.both) r.drive = null;
    loser.daze = 1;
    this.events.push({ kind: 'bout', winner: this.winner === B ? 'challenger' : 'champion', why });
    this._go('end');
  }

  _end(dt) {
    const W = this.winner, L = this.loser, t = this.t;
    // the winner: a happy wobble, arms up, a little bounce
    W.drive = null;
    W.K = BAL;
    W.leanT = [0, 0, 0.13 * Math.sin(t * TAU * 1.6)];
    ease(W.up, t > 0.3 ? 1 : 0, 40, dt); ease(W.reach, 0, 40, dt); ease(W.spread, 0, 40, dt);
    if (t > 0.3 && t < 2.4 && Math.floor((t - 0.3) / 0.55) !== Math.floor((t - 0.3 - dt) / 0.55)) W.hop = true;
    // the loser sits down on his bottom, dazed
    L.drive = null;
    L.K = L.upright() < 0.5 ? 0 : BAL * (globalThis.SITK || 0.25);
    L.leanT = [-(globalThis.SITL || 0.5) * Math.min(1, t / 0.6), 0, 0];
    ease(L.reach, 0.25, 30, dt); ease(L.up, 0, 30, dt); ease(L.spread, 0.6, 30, dt);
    L.daze = Math.max(L.daze, 0.7);
    if (t > END_T) { this._go('reset'); this.msg = 'back to their marks'; }
  }

  _reset(dt) {
    let ready = true;
    for (const r of this.both) {
      r.leanT = [0, 0, 0];
      ease(r.up, 0, 30, dt); ease(r.reach, 0.1, 30, dt); ease(r.spread, 0.2, 30, dt);
      if (r.upright() < (r.getup ? 0.95 : 0.85)) {
        // up first: a heave, not a snap
        r.getup = true; r.K = 0; r.drive = null; ready = false;
        continue;
      }
      r.getup = false;
      r.K = BAL;
      r.drive = this._home(r, 1.6);
      const c = r.c();
      if (Math.hypot(c[0] - r.mark[0], c[2] - r.mark[1]) > 0.12) ready = false;
      const f = r.fwd(), want = [r.side < 0 ? 1 : -1, 0];
      if (f[0] * want[0] < 0.94) ready = false;
    }
    // (getting up, the felt slides: no static grip to snag on)
    this.rig.restV = this.both.some((r) => r.getup) ? 0 : this._restV;
    const upright = this.both.every((r) => r.upright() > 0.92);
    if (upright && ((ready && this.t > 1.2) || this.t > 9)) {
      for (const r of this.both) r.getup = false;
      this._go('shiko');
      this.msg = 'shiko…';
    }
  }

  /* ── per substep ──────────────────────────────────────────────────────── */

  _apply(h) {
    const soft = this.soft, x = soft.x, hh = h * h;
    soft.params.mu = +(globalThis.PMU || 0.3);
    for (const r of this.both) {
      const lean = r.rest(r.leanS);
      const faceParam = r.face === undefined ? null : r.face - Math.atan2(r.restFwd[0], r.restFwd[2]);
      if (r.getup) rightUp(soft, h, { k: 6, maxTurn: 1.3, standY: r.standC, maxLift: 0.8, cloud: r.k });
      else balance(soft, r.K * (1 - 0.6 * r.daze), Math.hypot(...lean) > 1e-5 ? lean : null, faceParam, null, r.k);
      this._drive(r, h);
      // shiko: a lifted foot pulled up, a stomp driven down
      for (let f = 0; f < 2; f++) {
        if (r.lift[f] > 0) for (const i of r.feet[f]) x[i * 3 + 1] += r.lift[f] * soft.params.gravity * 3 * hh;
        if (r.stomp[f] > 0) for (const i of r.feet[f]) x[i * 3 + 1] -= soft.params.gravity * 2.5 * hh;
      }
      // a dazed panda's head circles
      if (r.daze > 0) {
        const a = r.daze, w = TAU * 1.2, ph = this.time * w + r.k;
        const fx = Math.cos(ph) * 45 * a * a, fz = Math.sin(ph) * 35 * a * a;
        for (const i of r.cfg.head) { x[i * 3] += fx * hh; x[i * 3 + 2] += fz * hh; }
      }
      if (r.hop) {
        r.hop = false;
        for (const i of r.all) x[i * 3 + 1] += 2.4 * h;
      }
    }
    // locked together, each has a grip on the other's mawashi: their motion
    // across the line between them is shared (equal and opposite pulls on
    // the two clouds' means), so a clinch shoves, it doesn't spin round
    if (this.state === 'clinch') this._grip(h);
    // a belly-bump: the champion throws his belly in
    if (this._bumpKick) {
      this._bumpKick = false;
      const A = this.champ, f = A.fwd();
      for (const i of A.all) { x[i * 3] += f[0] * 1.4 * h; x[i * 3 + 2] += f[2] * 1.4 * h; }
    }
    // hands: in a clinch each pushes his paws at the other's chest
    if (this.state === 'clinch' || this.state === 'tachiai') {
      for (const [r, o] of [[this.champ, this.chal], [this.chal, this.champ]]) {
        if (r.reach.x < 0.5) continue;
        const oc = o.c();
        const tgt = [oc[0], oc[1] + 0.35, oc[2]];
        for (const k of [r.cfg.armR, r.cfg.armL]) {
          const ch = this.rig.arms[k], t = ch.idx[ch.idx.length - 1];
          const d = [tgt[0] - x[t * 3], tgt[1] - x[t * 3 + 1], tgt[2] - x[t * 3 + 2]];
          const dl = Math.hypot(...d);
          if (dl > 1.6 || dl < 1e-6) continue;
          const F = 120 * r.reach.x;
          for (const j of ch.idx.slice(-2)) for (let q = 0; q < 3; q++) x[j * 3 + q] += d[q] / dl * F * hh;
        }
      }
    }
  }

  _grip(h) {
    const A = this.champ, B = this.chal, x = this.soft.x;
    const ca = A.c(), cb = B.c();
    let n = [cb[0] - ca[0], cb[2] - ca[2]];
    const nl = Math.hypot(...n) || 1;
    n = [n[0] / nl, n[1] / nl];
    const va = A.meanV(), vb = B.meanV();
    const t = [-n[1], n[0]];
    const rel = (vb[0] - va[0]) * t[0] + (vb[2] - va[2]) * t[1];
    const e = Math.min(1, 40 * h) * 0.5;
    const dv = rel * e;
    for (const i of A.ix) { x[i * 3] += t[0] * dv * h; x[i * 3 + 2] += t[1] * dv * h; }
    for (const i of B.ix) { x[i * 3] -= t[0] * dv * h; x[i * 3 + 2] -= t[1] * dv * h; }
  }

  /* his strength: a velocity servo on his stuffing, the push capped */
  _drive(r, h) {
    const D = r.drive;
    if (!D) return;
    const s = this.soft, x = s.x, v = s.v;
    let mx = 0, mz = 0;
    for (const i of r.ix) { mx += v[i * 3]; mz += v[i * 3 + 2]; }
    mx /= r.ix.length; mz /= r.ix.length;
    const k = Math.min(1, 30 * h);
    let dvx = (D.dir[0] * D.speed - mx) * k, dvz = (D.dir[1] * D.speed - mz) * k;
    const cap = D.acc * h, dl = Math.hypot(dvx, dvz);
    if (dl > cap) { dvx *= cap / dl; dvz *= cap / dl; }
    for (const i of r.ix) { x[i * 3] += dvx * h; x[i * 3 + 2] += dvz * h; }
  }

  readout() { return [['Won', this.won], ['Lost', this.lost], ['Streak', this.streak > 0 ? `${this.streak}W` : this.streak < 0 ? `${-this.streak}L` : '–']]; }
  status() { return this.msg; }
}
