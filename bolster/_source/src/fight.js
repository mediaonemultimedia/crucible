/* A fight on screen: the sim at a fixed 60 ticks/s (an accumulator off real
   time), the inputs that feed it (keyboard or CPU, per side), and the view
   of it — two plush, the stage, effects — interpolated between ticks.
   Sim events become sparks, shakes, banners and speech bubbles; the UI
   gets them through `onEvent`.                                          */

import { createMatch, stepInPlace, INTRO, MAX_SEP } from './sim/sim.js';
import { FIGHTERS, MAX_METER } from './fighters/index.js';
import { CPU } from './ai/cpu.js';
import { Plush } from './render/plush.js';
import { U } from './render/stage.js';
import { Rollback } from './net/rollback.js';
import { Dummy, practiceMatch, practiceAfter, ComboMeter, InputLog } from './practice.js';

export const TICK = 1 / 60;

export class Fight {
  constructor(stage, { p1, p2, seed = 1, cpu = [null, 'normal'], keyboard = null, keyboard2 = null, toques = false, net = null, practice = null }) {
    this.stage = stage;
    // practice (src/practice.js): player 2 is the dummy, the state tended between ticks
    this.practice = practice;
    if (practice) { net = null; cpu = [null, null]; this.dummy = new Dummy(1, seed); this.pmem = {}; this.combos = new ComboMeter(0); this.inputs = new InputLog(14); }
    this.st = practice ? practiceMatch({ p1, p2, seed }) : createMatch({ p1, p2, seed });
    // online: the sim runs inside a rollback session; this side's keyboard is player `net.local`
    this.session = net ? new Rollback(this.st, { local: net.local, send: net.send, onDesync: net.onDesync }) : null;
    if (net) cpu = [null, null];
    this.mirror = p1 === p2;
    this.cpu = cpu.map((lv, k) => (lv ? new CPU(k, lv, seed * 7 + k) : null));
    this.kb = keyboard;
    this.kb2 = practice || net ? null : keyboard2;     // versus on one keyboard: player 2's keys
    this.plush = [new Plush(stage.scene, p1, { side: 0 }), new Plush(stage.scene, p2, { side: 1, evil: this.mirror })];
    this.plush[1].monocle.visible = this.mirror;
    for (const p of this.plush) p.toque.visible = toques;
    this.acc = 0;
    this.paused = false;
    this.prev = this.st.f.map((f) => ({ x: f.x, y: f.y }));
    this.prevProj = new Map();
    this.onEvent = () => {};
    this.onTick = () => {};
    this.speed = 1;          // (the K.O.'s slow motion is the sim's own: st.ks)
    this.lastInputs = [0, 0];
    this.override = null;
    this.focus = null;         // the winner screen: the camera on one spot
    this._place(1);
  }

  name(k) {
    const f = FIGHTERS[this.st.f[k].id];
    return (this.mirror && k === 1 ? 'Evil ' : '') + f.name;
  }

  /* one sim tick */
  tick() {
    if (this.session) return this._netTick();
    const st = this.st;
    this.prev = st.f.map((f) => ({ x: f.x, y: f.y }));
    this.prevProj = new Map(st.proj.map((p) => [p.id, { x: p.x, y: p.y }]));
    let a = this.cpu[0] ? this.cpu[0].input(st) : this.kb ? this.kb.sample() : 0;
    let b = this.cpu[1] ? this.cpu[1].input(st) : this.dummy ? this.dummy.input(st, this.practice) : this.kb2 ? this.kb2.sample() : 0;
    // a scripted input (screenshots, the browser test) can take either side
    if (this.override) { const o = this.override(st); if (o[0] !== null) a = o[0]; if (o[1] !== null) b = o[1]; }
    this.lastInputs = [a, b];
    stepInPlace(st, a, b);
    if (this.practice) {
      this.inputs.push(a);
      for (const e of st.ev) this.combos.event(e);
      practiceAfter(st, this.practice, this.pmem);
    }
    for (const e of st.ev) this._fx(e);
    this.onTick(st);
  }

  /* online: the local mask goes into the session, which may roll back and
     resimulate; it hands back each event once */
  _netTick() {
    const S = this.session, before = S.st.f.map((f) => ({ x: f.x, y: f.y }));
    const projBefore = new Map(S.st.proj.map((p) => [p.id, { x: p.x, y: p.y }]));
    const m = this.kb ? this.kb.sample() : 0;
    const ev = this.override ? S.advance(this.override(S.st)[S.local] ?? m) : S.advance(m);
    this.st = S.st;
    if (!ev) return;
    this.prev = before;
    this.prevProj = projBefore;
    this.lastInputs = S.local === 0 ? [m, S.lastRemote] : [S.lastRemote, m];
    for (const e of ev) this._fx(e);
    this.onTick(this.st);
  }

  _fx(e) {
    const S = this.stage, st = this.st;
    if (e.k === 'hit' || e.k === 'block') {
      const x = e.x / U, y = e.y / U;
      const victim = this.plush[1 - e.p], dir = Math.sign(st.f[1 - e.p].x - st.f[e.p].x) || 1;
      if (e.k === 'hit') {
        const big = e.dmg >= 70 || e.kd;
        // an amplified finisher: a bigger spark, more stuffing, a harder shake
        S.spark(x, y, big || e.amp ? 'big' : 'hit', e.amp ? 3.1 : big ? 2.1 : e.ctr ? 1.8 : 1.4);
        S.tufts(x, y, e.amp ? 20 : big ? 10 : 5, e.amp ? 1.8 : big ? 1.3 : 0.9, dir);
        S.shake(e.amp ? 0.85 : big ? 0.55 : 0.18);
        victim.hit(e.amp ? e.dmg * 1.6 : e.dmg, e.kd, dir);
      } else {
        S.spark(x, y, 'block', 1.5, dir);
        victim.hit(e.dmg * 0.3, 0, dir);
      }
    }
    if (e.k === 'koflash') {
      // the K.O. hit: a white flash (the UI's), a big burst of stuffing, the camera kicked
      const x = e.x / U, y = e.y / U, dir = Math.sign(st.f[1 - e.p].x - st.f[e.p].x) || 1;
      S.spark(x, y, 'big', e.final ? 4 : 3.3);
      S.tufts(x, y, e.final ? 46 : 30, e.final ? 2.6 : 2, dir);
      if (e.final) { S.tufts(x, y + 0.6, 24, 3, -dir); S.tufts(x, y - 0.4, 18, 2.4, dir); }
      S.shake(1.1);
      this.plush[1 - e.p].hit(260, 1, dir);
    }
    if (e.k === 'kobounce') {
      // the floor: a squash and a puff of fluff both ways
      const x = e.x / U;
      for (const d of [-1, 1]) S.tufts(x + d * 0.4, 0.1, 9, 0.9, d);
      S.shake(0.45);
      this.plush[e.p].hit(140, 1, 0);
    }
    if (e.k === 'slam') {
      // the dive slam hits the mat: a ring of fluff thrown out both ways, a little shake
      const x = e.x / U;
      for (const d of [-1, 1]) { S.tufts(x + d * 0.35, 0.12, 7, 1.0, d); S.tufts(x + d * 0.8, 0.08, 4, 0.6, d); }
      S.shake(0.4);
    }
    if (e.k === 'land' && e.hard) S.shake(0.25);
    if (e.k === 'dash') {
      // a kick of fluff off the mat behind the feet
      const f = st.f[e.p], back = -f.face * e.d;
      S.tufts(f.x / U + back * 0.4, 0.15, 4, 0.45, back);
    }
    // Sebas Perra's howl: the full moon comes up behind him
    if (e.k === 'special' && st.f[e.p].id === 'sebas') this.stage.moonAt(st.f[e.p].x / U);
    // a murder of crows: a shake as they come in
    if (e.k === 'special' && st.f[e.p].id === 'zach') S.shake(0.3);
    if (e.k === 'clash') { S.spark(e.x / U, e.y / U, 'hit', 1.2); S.tufts(e.x / U, e.y / U, 4, 0.6, 1); }
    this.onEvent(e, this);
  }

  /* real time in; whole ticks out; then draw, interpolated */
  frame(dt) {
    if (!this.paused) {
      const d = dt * this.speed;
      this.acc = Math.min(this.acc + d, TICK * 8);
      while (this.acc >= TICK) { this.acc -= TICK; this.tick(); }
    }
    this._place(this.paused ? 0 : dt);
  }

  _place(dt) {
    const st = this.st, a = this.acc / TICK;
    // the K.O. cinematic: the camera eases in on the one flying and follows
    // him up; the stuffing (soft bodies, sparks, tufts) runs at the sim's
    // time scale, so the slow motion is the same on every screen
    const koSeq = st.phase === 'ko' && st.kt < st.kn;
    const slow = koSeq ? st.ks / 100 : 1;
    const P = st.f.map((f, k) => ({ x: (this.prev[k].x + (f.x - this.prev[k].x) * a) / U, y: (this.prev[k].y + (f.y - this.prev[k].y) * a) / U }));
    for (let k = 0; k < 2; k++) {
      const F = st.f[k], O = st.f[1 - k];
      const threat = O.act === 'attack' || st.proj.some((p) => p.o !== k);
      this.plush[k].update(Math.min(dt, 0.05) * slow, F, O, P[k].x, P[k].y, P[1 - k].x, P[1 - k].y, threat);
    }
    if (koSeq) {
      const L = st.f.map((f, k) => (f.act === 'ko' ? k : -1)).filter((k) => k >= 0);
      const k = L.length === 1 ? L[0] : -1;
      const x = k >= 0 ? P[k].x : (P[0].x + P[1].x) / 2, y = k >= 0 ? P[k].y : 0;
      // (ty: the height to keep in the middle — his middle, a little low in the climb)
      this.koCam = { x, d: st.kf ? 9 : 10, y: 0, ty: Math.max(1.8, y + 1.2) };
      this.focus = this.koCam;
    } else if (this.koCam) { if (this.focus === this.koCam) this.focus = null; this.koCam = null; }
    const extra = this.stage.projectiles(st.proj, a, this.prevProj);
    this.stage.frame(P[0].x, P[1].x, dt || 0.016, innerWidth / innerHeight, this.focus, Math.max(P[0].y, P[1].y));
    this.stage.paintShadows(this.plush, extra);
    this.stage.update(dt * slow);
  }

  dispose() { for (const p of this.plush) p.dispose(this.stage.scene); this.stage.projectiles([], 0, null); }
}
