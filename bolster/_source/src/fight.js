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

export const TICK = 1 / 60;

export class Fight {
  constructor(stage, { p1, p2, seed = 1, cpu = [null, 'normal'], keyboard = null, toques = false }) {
    this.stage = stage;
    this.st = createMatch({ p1, p2, seed });
    this.mirror = p1 === p2;
    this.cpu = cpu.map((lv, k) => (lv ? new CPU(k, lv, seed * 7 + k) : null));
    this.kb = keyboard;
    this.plush = [new Plush(stage.scene, p1, { side: 0 }), new Plush(stage.scene, p2, { side: 1, evil: this.mirror })];
    this.plush[1].monocle.visible = this.mirror;
    for (const p of this.plush) p.toque.visible = toques;
    this.acc = 0;
    this.paused = false;
    this.prev = this.st.f.map((f) => ({ x: f.x, y: f.y }));
    this.prevProj = new Map();
    this.onEvent = () => {};
    this.onTick = () => {};
    this.speed = 1;
    this.slow = 0;          // seconds of slow motion (a K.O.)
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
    const st = this.st;
    this.prev = st.f.map((f) => ({ x: f.x, y: f.y }));
    this.prevProj = new Map(st.proj.map((p) => [p.id, { x: p.x, y: p.y }]));
    let a = this.cpu[0] ? this.cpu[0].input(st) : this.kb ? this.kb.sample() : 0;
    let b = this.cpu[1] ? this.cpu[1].input(st) : 0;
    // a scripted input (screenshots, the browser test) can take either side
    if (this.override) { const o = this.override(st); if (o[0] !== null) a = o[0]; if (o[1] !== null) b = o[1]; }
    this.lastInputs = [a, b];
    stepInPlace(st, a, b);
    for (const e of st.ev) this._fx(e);
    this.onTick(st);
  }

  _fx(e) {
    const S = this.stage, st = this.st;
    if (e.k === 'hit' || e.k === 'block') {
      const x = e.x / U, y = e.y / U;
      const victim = this.plush[1 - e.p], dir = Math.sign(st.f[1 - e.p].x - st.f[e.p].x) || 1;
      if (e.k === 'hit') {
        const big = e.dmg >= 70 || e.kd;
        S.spark(x, y, big ? 'big' : 'hit', big ? 2.1 : 1.4);
        S.tufts(x, y, big ? 10 : 5, big ? 1.3 : 0.9, dir);
        S.shake(big ? 0.55 : 0.18);
        victim.hit(e.dmg, e.kd, dir);
      } else {
        S.spark(x, y, 'block', 1.5, dir);
        victim.hit(e.dmg * 0.3, 0, dir);
      }
    }
    if (e.k === 'ko') { S.shake(1); this.slow = 1.2; }
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
    if (e.k === 'clash') { S.spark(e.x / U, e.y / U, 'hit', 1.2); S.tufts(e.x / U, e.y / U, 4, 0.6, 1); }
    this.onEvent(e, this);
  }

  /* real time in; whole ticks out; then draw, interpolated */
  frame(dt) {
    if (!this.paused) {
      let d = dt * this.speed;
      if (this.slow > 0) { this.slow -= dt; d *= 0.35; }
      this.acc = Math.min(this.acc + d, TICK * 8);
      while (this.acc >= TICK) { this.acc -= TICK; this.tick(); }
    }
    this._place(this.paused ? 0 : dt);
  }

  _place(dt) {
    const st = this.st, a = this.acc / TICK;
    const P = st.f.map((f, k) => ({ x: (this.prev[k].x + (f.x - this.prev[k].x) * a) / U, y: (this.prev[k].y + (f.y - this.prev[k].y) * a) / U }));
    for (let k = 0; k < 2; k++) {
      const F = st.f[k], O = st.f[1 - k];
      const threat = O.act === 'attack' || st.proj.some((p) => p.o !== k);
      this.plush[k].update(Math.min(dt, 0.05), F, O, P[k].x, P[k].y, P[1 - k].x, P[1 - k].y, threat);
    }
    const extra = this.stage.projectiles(st.proj, a, this.prevProj);
    this.stage.frame(P[0].x, P[1].x, dt || 0.016, innerWidth / innerHeight, this.focus);
    this.stage.paintShadows(this.plush, extra);
    this.stage.update(dt);
  }

  dispose() { for (const p of this.plush) p.dispose(this.stage.scene); this.stage.projectiles([], 0, null); }
}
