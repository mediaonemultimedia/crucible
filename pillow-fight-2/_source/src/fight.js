/* A fight on screen (PF2): the sim at a fixed 60 ticks/s (an accumulator
   off real time), the inputs that feed it (keyboard or CPU, per side), and
   the view — two plush in the bedroom arena, effects, the camera —
   interpolated between ticks. Sim events become sparks, stuffing, feathers,
   shakes, camera moments; the UI gets them through `onEvent`, the sound
   through `onSfx`. Nothing here writes to the sim's state.              */

import { createMatch, stepInPlace, RING } from './sim/sim.js';
import { FIGHTERS } from './fighters/index.js';
import { CPU } from './ai/cpu.js';
import { Plush } from './render/plush.js';
import { U, BED_H } from './render/arena.js';
import { ordinal, sessionTickOf } from './audio/sfxmap.js';
import { Rollback } from './net/rollback.js';

export const TICK = 1 / 60;

/* what a puppet sees: PF1's acts and moves (the 3D-only ones mapped onto the
   nearest PF1 animation); facing is the group's job now, so face = 1 */
export function puppetView(F) {
  let act = F.act, mv = F.mv, t = F.t;
  if (act === 'side' || act === 'circle') act = 'walkF';
  else if (act === 'ringout') act = 'down';
  else if (act === 'attack' && mv === 'sweep') { mv = 'heavy'; t = Math.max(0, t - 4); }
  return { ...F, act, mv, t, face: 1 };
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Fight {
  constructor(arena, { p1, p2, seed = 1, cpu = [null, 'normal'], keyboard = null, keyboard2 = null, practice = null, alt = null, dummy = null, net = null }) {
    this.arena = arena;
    this.practice = practice;
    this.st = createMatch({ p1, p2, seed });
    // online: the sim runs inside a rollback session; this side's keyboard is player `net.local`
    this.session = net ? new Rollback(this.st, { local: net.local, send: net.send, onDesync: net.onDesync }) : null;
    if (net) { cpu = [null, null]; keyboard2 = null; }
    if (practice) { this.st.phase = 'fight'; this.st.pt = 0; this.st.timer = 99 * 60; }
    this.mirror = p1 === p2;
    this.evil = alt ? [!!alt[0], !!alt[1]] : [false, this.mirror];
    this.cpu = cpu.map((lv, k) => (lv ? new CPU(k, lv, seed * 7 + k) : null));
    this.dummy = dummy;
    this.kb = keyboard;
    this.kb2 = keyboard2;
    this.plush = [p1, p2].map((id, k) => {
      const p = new Plush(arena.scene, id, { side: k, evil: this.evil[k] });
      arena.add(p.group);
      p.monocle.visible = this.evil[k];
      p.toque.visible = false;
      return p;
    });
    this.tall = Math.max(...[p1, p2].map((id) => (id === 'k8e' ? 5.2 : FIGHTERS[id].hurt.stand.h / 1000)));
    this.acc = 0;
    this.paused = false;
    this.prev = this.st.f.map((f) => ({ x: f.x, y: f.y, z: f.z }));
    this.prevProj = new Map();
    this.onEvent = () => {};
    this.onTick = () => {};
    this.onSfx = () => {};
    this.onSwing = () => {};
    this.evTick = 0; this.evN = 1;
    this.lastInputs = [0, 0];
    this.override = null;
    this.focus = null;
    this.koAz = 0;
    this._place(1);
  }

  name(k) { return (this.evil[k] ? 'Evil ' : '') + FIGHTERS[this.st.f[k].id].name; }

  tick() {
    if (this.session) return this._netTick();
    const st = this.st;
    this.prev = st.f.map((f) => ({ x: f.x, y: f.y, z: f.z }));
    this.prevProj = new Map(st.proj.map((p) => [p.id, { x: p.x, y: p.y, z: p.z }]));
    let a = this.cpu[0] ? this.cpu[0].input(st) : this.kb ? this.kb.sample() : 0;
    let b = this.cpu[1] ? this.cpu[1].input(st) : this.dummy ? this.dummy(st) : this.kb2 ? this.kb2.sample() : 0;
    if (this.override) { const o = this.override(st); if (o[0] !== null) a = o[0]; if (o[1] !== null) b = o[1]; }
    this.lastInputs = [a, b];
    stepInPlace(st, a, b);
    if (this.practice) this.practice.after?.(st);
    this.evTick = st.tick;
    for (const e of st.ev) { this.evN = ordinal(st.ev, e); this._fx(e); }
    this.onSwing(st, st.tick);
    this.onTick(st);
  }

  /* online: the local mask goes into the session, which may roll back and
     resimulate; it hands back each event once */
  _netTick() {
    const S = this.session, before = S.st.f.map((f) => ({ x: f.x, y: f.y, z: f.z }));
    const projBefore = new Map(S.st.proj.map((p) => [p.id, { x: p.x, y: p.y, z: p.z }]));
    let m = this.kb ? this.kb.sample() : 0;
    if (this.override) { const o = this.override(S.st)[S.local]; if (o !== null && o !== undefined) m = o; }
    const flow0 = S.flowDone;
    const ev = S.advance(m);
    this.st = S.st;
    if (!ev) return;
    this.prev = before;
    this.prevProj = projBefore;
    this.lastInputs = S.local === 0 ? [m, S.lastRemote] : [S.lastRemote, m];
    for (const e of ev) { [this.evTick, this.evN] = sessionTickOf(S, e, flow0); this._fx(e); }
    this.onSwing(this.st, this.st.tick);
    this.onTick(this.st);
  }

  _fx(e) {
    this.onSfx(e, this.evTick, this.evN);
    const S = this.arena, st = this.st;
    if (e.k === 'hit' || e.k === 'block') {
      const x = e.x / U, y = e.y / U, z = e.z / U;
      const att = st.f[e.p], victim = this.plush[1 - e.p];
      const d = [att.fx / 1024, att.fz / 1024];
      if (e.k === 'hit') {
        const big = e.dmg >= 70 || e.kd;
        S.spark(x, y, z, big || e.amp ? 'big' : 'hit', e.amp ? 3.1 : big ? 2.1 : e.ctr ? 1.8 : 1.4);
        S.tufts(x, y, z, e.amp ? 20 : big ? 10 : 5, e.amp ? 1.8 : big ? 1.3 : 0.9, d, big || e.amp ? 6 : 1);
        S.shake(e.amp ? 0.85 : big ? 0.55 : 0.18);
        victim.hit(e.amp ? e.dmg * 1.6 : e.dmg, e.kd, 1);
        const ap = this.plush[e.p];
        if (ap.puppet.contact) {
          ap.puppet.contact(e);
          victim.crunchBy(big || e.amp ? 2.6 : 1.5);
          if (big || e.amp) S.nudge(e.amp ? 2.4 : 1.7);
        } else victim.crunchBy(big ? 1.6 : 0.8);
        if (e.edge) S.shake(0.4);
      } else {
        S.spark(x, y, z, 'block', 1.5);
        victim.hit(e.dmg * 0.3, 0, 1);
        if (this.plush[e.p].puppet.contact) { this.plush[e.p].puppet.contact(e); victim.crunchBy(0.8); }
      }
    }
    if (e.k === 'koflash') {
      const f = st.f[1 - e.p], x = e.x / U, y = e.y / U, z = e.z / U, d = [f.kfx / 1024, f.kfz / 1024];
      S.spark(x, y, z, 'big', e.final ? 4 : 3.3);
      S.tufts(x, y, z, e.final ? 46 : 30, e.final ? 2.6 : 2, d, e.final ? 40 : 22);
      S.shake(1.1);
      this.plush[1 - e.p].hit(260, 1, 1);
      this.koAz = S.cam.az;
    }
    if (e.k === 'kobounce') {
      const x = e.x / U, z = e.z / U, y = e.y / U;
      for (const s of [-1, 1]) S.tufts(x + s * 0.4, y + 0.1, z, e.carpet ? 14 : 9, e.carpet ? 1.3 : 0.9, [s, 0], e.carpet ? 14 : 4);
      S.shake(e.carpet ? 0.8 : 0.45);
      this.plush[e.p].hit(140, 1, 0);
    }
    if (e.k === 'ringout') {
      const f = st.f[e.p];
      S.tufts(f.x / U, 0.2, f.z / U, 12, 1.2, [f.vx / 60 || 0, f.vz / 60 || 0], 10);
      this.koAz = S.cam.az;
    }
    if (e.k === 'slam') {
      const x = e.x / U, z = e.z / U;
      for (let a = 0; a < 6; a++) S.tufts(x + Math.cos(a) * 0.5, 0.12, z + Math.sin(a) * 0.5, 2, 0.8, [Math.cos(a), Math.sin(a)]);
      S.shake(0.4);
    }
    if (e.k === 'land' && e.hard) S.shake(0.25);
    if (e.k === 'dash' || e.k === 'side') {
      const f = st.f[e.p];
      S.tufts(f.x / U, 0.15, f.z / U, 3, 0.4, [-f.fx / 1024, -f.fz / 1024]);
    }
    if (e.k === 'special') {
      const f = st.f[e.p];
      S.pushIn([f.x / U, 1.6, f.z / U], 1.0);
      if (f.id === 'sebas') S.moonAt(f.x / U - f.fx / 400, f.z / U - f.fz / 400);
      if (f.id === 'zach') S.shake(0.3);
    }
    if (e.k === 'clash') { S.spark(e.x / U, e.y / U, e.z / U, 'hit', 1.2); S.tufts(e.x / U, e.y / U, e.z / U, 4, 0.6); }
    this.onEvent(e, this);
  }

  frame(dt) {
    if (!this.paused) {
      this.acc = Math.min(this.acc + dt, TICK * 8);
      while (this.acc >= TICK) { this.acc -= TICK; this.tick(); }
    }
    this._place(this.paused ? 0 : dt);
  }

  /* positions in arena space, interpolated between the last two ticks */
  positions(a = this.acc / TICK) {
    return this.st.f.map((f, k) => {
      const p = this.prev[k];
      return [(p.x + (f.x - p.x) * a) / U, (p.y + (f.y - p.y) * a) / U, (p.z + (f.z - p.z) * a) / U];
    });
  }

  _place(dt) {
    const st = this.st, a = this.acc / TICK;
    const koSeq = st.phase === 'ko' && st.kt < st.kn;
    const slow = koSeq ? st.ks / 100 : 1;
    const P = this.positions(a);
    for (let k = 0; k < 2; k++) {
      const F = st.f[k], O = st.f[1 - k], pl = this.plush[k];
      const threat = O.act === 'attack' || st.proj.some((p) => p.o !== k);
      pl.frac = koSeq || st.pause > 0 ? 1 : a;
      pl.simPause = st.pause;
      // the spin attack: one whole turn through the swing
      pl.yawExtra = F.act === 'attack' && F.mv === 'sweep' ? -Math.PI * 2 * smooth(8, 24, F.t + a) : 0;
      // a sidestep's little hop
      pl.hop = F.act === 'side' ? 0.28 * Math.sin(Math.PI * Math.min(1, (F.t + a) / 18)) : 0;
      // (render only) turned a little toward the camera, as PF1 did, so the faces read
      const yf = Math.atan2(F.fx, F.fz), az = this.arena.cam.az;
      pl.yawCheat = Math.max(-0.5, Math.min(0.5, Math.atan2(Math.sin(az - yf), Math.cos(az - yf)) * 0.32));
      pl.update(Math.min(dt, 0.05) * slow, puppetView(F), O, P[k], P[1 - k], threat);
    }
    let focus = null;
    if (koSeq) {
      const L = st.f.map((f, k) => (f.act === 'ko' ? k : -1)).filter((k) => k >= 0);
      const k = L.length === 1 ? L[0] : -1;
      const p = k >= 0 ? P[k] : [(P[0][0] + P[1][0]) / 2, 0, (P[0][2] + P[1][2]) / 2];
      const t = st.kt / 60;
      if (st.ko === 'ringout') {
        // the ring-out cam: low, off to the side of his fall, slowly swinging round
        const out = Math.atan2(p[0], p[2]);
        focus = { x: p[0] * 0.85, y: Math.max(-BED_H + 1.2, p[1] + 0.6), z: p[2] * 0.85, d: 10.5, h: 0.4, az: out + 1.1 - t * 0.25 };
      } else {
        // the K.O. cam: in close on the one flying, orbiting slowly
        focus = { x: p[0], y: Math.max(1.6, p[1] + 1.1), z: p[2], d: st.kf ? 8.5 : 9.5, h: 0.8, az: this.koAz + 0.5 + t * 0.35 };
      }
    }
    this.focus = focus || this.winFocus || null;
    const extra = this.arena.projectiles(st.proj, a, this.prevProj);
    this.arena.frame(P[0], P[1], dt || 0.016, innerWidth / innerHeight, this.focus, this.tall);
    this.arena.paintShadows(this.plush, extra);
    this.arena.update(dt * slow);
  }

  dispose() {
    for (const p of this.plush) { p.group.removeFromParent(); p.dispose(this.arena.scene); }
    this.arena.projectiles([], 0, null);
  }
}

export { RING };
