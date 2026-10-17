/* Bolster — No. 23. The game is called Pillow Fight. The app: title → mode → character select → difficulty
   → best of three → winner, the HUD and banners, speech bubbles, the
   easter eggs, deep links (?p1=kevalanche&p2=sumaura&cpu=hard), and a test
   hook (window.__bolster). The game itself is the sim (src/sim/); this
   file only drives it and shows it.                                     */

import * as THREE from 'three/webgpu';
import { makeRenderer, Stage } from './render/stage.js';
import { Showcase, Lineup, portraits } from './render/showcase.js';
import { Fight } from './fight.js';
import { Keyboard } from './input/keyboard.js';
import { FIGHTERS, ROSTER, MAX_METER } from './fighters/index.js';
import { ROUND_TICKS, hurtBox, limbBox, activeHits } from './sim/sim.js';
import { moveOf } from './fighters/index.js';
import { FLAGS } from './ui/flags.js';
import { say, dismiss } from './ui/bubble.js';
import { SAYINGS } from './ui/sayings.js';
import { Online } from './online.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const params = new URLSearchParams(location.search);

const CONTROLS = `
  <h4>Controls</h4>
  <span><kbd>A</kbd><kbd>D</kbd></span><span>walk · hold back to block</span>
  <span><kbd>D</kbd><kbd>D</kbd></span><span>dash in (double-tap forward)</span>
  <span><kbd>A</kbd><kbd>A</kbd></span><span>backdash (double-tap back)</span>
  <span><kbd>W</kbd> <kbd>S</kbd></span><span>jump · crouch (crouch-block lows)</span>
  <span><kbd>O</kbd></span><span>light attack — quick, short</span>
  <span><kbd>P</kbd></span><span>heavy attack — wind-up, lunge, long reach</span>
  <span><kbd>S</kbd>+<kbd>O</kbd></span><span>low attack</span>
  <span><kbd>S</kbd>+<kbd>P</kbd></span><span>signature move</span>
  <span><kbd>W</kbd> then <kbd>S</kbd>+<kbd>P</kbd></span><span>dive slam (in the air: an overhead — block it standing)</span>
  <span><kbd>Space</kbd></span><span>special (full meter)</span>
  <span><kbd>Esc</kbd></span><span>pause</span>`;

const flagOf = (id) => FLAGS[FIGHTERS[id].nation];

class App {
  constructor(renderer, canvas) {
    this.renderer = renderer;
    this.canvas = canvas;
    this.stage = new Stage();
    this.kb = new Keyboard();
    this.screen = 'title';
    this.fight = null;
    this.show = null;
    this.pick = [0, 1];            // cursor per side
    this.locked = [false, false];
    this.picking = 0;
    this.level = 'normal';
    this.toques = false;
    this.eggKeys = '';
    this.idle = 0;
    this.seed = (params.get('seed') | 0) || ((Date.now() & 0xffff) + 1);
    this.portraits = {};
    this.net = new Online(this);
    this.backend = renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
    this.errors = [];
    this.timers = [];
    $('#controls-select').innerHTML = CONTROLS;
    $('#controls-pause').innerHTML = CONTROLS;
    this._bindUI();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  /* after `sec` seconds of the app's own time (paused while held or paused,
     so banners and bubbles keep step with the game, not the wall clock) */
  later(sec, fn) { this.timers.push({ t: sec, fn }); }

  _timers(dt) {
    if (!this.timers.length) return;
    const due = [];
    this.timers = this.timers.filter((q) => { q.t -= dt; if (q.t <= 0) { due.push(q); return false; } return true; });
    for (const q of due) q.fn();
  }

  resize() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight, false);
  }

  /* ── screens ──────────────────────────────────────────────────────────── */
  go(name) {
    this.screen = name;
    for (const s of $$('.screen')) s.classList.toggle('on', s.id === `${name}-screen`);
    document.body.classList.toggle('fighting', name === 'fight' || name === 'pause');
    document.body.dataset.screen = name;
    this.idle = 0;
    document.body.classList.remove('napping');
    if (name === 'select') this._enterSelect();
    if (name === 'title' && !this.lineup) this.lineup = new Lineup(this.stage, ROSTER);
    if (name !== 'title' && this.lineup) { this.lineup.dispose(); this.lineup = null; }
    if (name !== 'select' && name !== 'diff' && this.show && name !== 'pause') { this.show.dispose(); this.show = null; }
  }

  _bindUI() {
    for (const b of $$('#mode-screen .opt')) b.onclick = () => { if (b.disabled) return; if (b.dataset.mode === 'online') this.net.menu(); else this.go('select'); };
    for (const b of $$('#online-screen .opt')) b.onclick = () => this.net.act(b.dataset.act);
    for (const b of $$('#diff-screen .opt')) b.onclick = () => { this.level = b.dataset.level; this.startFight(); };
    for (const b of $$('#pause-screen .opt')) b.onclick = () => this._pauseAct(b.dataset.act);
    for (const b of $$('#win-screen .opt')) b.onclick = () => this._winAct(b.dataset.act);
    $('#title-screen').onclick = () => this.go('mode');
    addEventListener('keydown', (e) => this._key(e));
    addEventListener('pointerdown', () => this._wake());
  }

  _menuMove(sel, d) {
    const opts = $$(sel).filter((b) => !b.disabled);
    let i = opts.findIndex((b) => b.classList.contains('sel'));
    i = (i + d + opts.length) % opts.length;
    opts.forEach((b, k) => b.classList.toggle('sel', k === i));
  }

  _menuFire(sel) { const b = $$(sel).find((x) => x.classList.contains('sel')); b?.click(); }

  _key(e) {
    const k = e.code;
    this._wake();
    const up = k === 'KeyW' || k === 'ArrowUp', down = k === 'KeyS' || k === 'ArrowDown';
    const left = k === 'KeyA' || k === 'ArrowLeft', right = k === 'KeyD' || k === 'ArrowRight';
    const ok = k === 'KeyO' || k === 'Enter', back = k === 'KeyP' || k === 'Escape' || k === 'Backspace';
    const s = this.screen;
    if (e.repeat && (ok || back)) return;
    if (s === 'title') { this.go('mode'); return; }
    if (s === 'mode') {
      if (up || down) this._menuMove('#mode-screen .opt', up ? -1 : 1);
      else if (ok || k === 'Space') this._menuFire('#mode-screen .opt');
      else if (back) this.go('title');
      return;
    }
    if (s === 'online') {
      const sel = `#online-screen .ol-${$('#online-screen').dataset.state} .opt`;
      if (up || down) this._menuMove(sel, up ? -1 : 1);
      else if (ok) this._menuFire(sel);
      else if (k === 'Escape') this.net.act('cancel');
      return;
    }
    if (s === 'select' && this.net.on) { this.net.selectKey(k, { left, right, ok, back }); return; }
    if (s === 'select') {
      // the toque code: E then H
      if (k === 'KeyE') this.eggKeys = 'e';
      else if (k === 'KeyH' && this.eggKeys === 'e') { this.eggKeys = ''; this._toques(); return; }
      else this.eggKeys = '';
      if (left || right) { this._cursor(left ? -1 : 1); return; }
      if (ok) { this._lock(); return; }
      if (back) { if (this.picking === 1) { this.picking = 0; this.locked[0] = false; this._paintSelect(); } else this.go('mode'); }
      return;
    }
    if (s === 'diff') {
      if (up || down) this._menuMove('#diff-screen .opt', up ? -1 : 1);
      else if (ok) this._menuFire('#diff-screen .opt');
      else if (back) { this.go('select'); }
      return;
    }
    if (s === 'fight') { if (k === 'Escape' && !this.net.on) { e.preventDefault(); this.pause(true); } return; }
    if (s === 'pause') {
      if (k === 'Escape') this.pause(false);
      else if (up || down) this._menuMove('#pause-screen .opt', up ? -1 : 1);
      else if (ok) this._menuFire('#pause-screen .opt');
      return;
    }
    if (s === 'win') {
      if (this.net.on && back && k === 'Escape') { this._winAct('select'); return; }
      if (left || right || up || down) this._menuMove('#win-screen .opt', left || up ? -1 : 1);
      else if (ok) this._menuFire('#win-screen .opt');
    }
  }

  /* ── character select ─────────────────────────────────────────────────── */
  _enterSelect() {
    this.locked = [false, false];
    this.picking = 0;
    this.toques = false;
    if (this.fight) { this.fight.dispose(); this.fight = null; }
    if (!this.show) this.show = new Showcase(this.stage);
    const cards = $('#cards');
    cards.textContent = '';
    ROSTER.forEach((id, i) => {
      const f = FIGHTERS[id];
      const c = document.createElement('div');
      c.className = 'card';
      c.dataset.id = id;
      c.innerHTML = `<span class="zzz"><i>z</i><i>z</i><i>z</i></span><span class="flag">${flagOf(id)}</span><span class="lab">${f.name}</span>`;
      if (this.portraits[id]) { const im = new Image(); im.alt = ''; im.src = this.portraits[id]; c.prepend(im); }
      c.onclick = () => { if (this.net.on) { this.net.choose(i, true); return; } this.pick[this.picking] = i; this._lock(); };
      c.onmouseenter = () => { if (this.screen !== 'select') return; if (this.net.on) { this.net.choose(i, false); return; } this.pick[this.picking] = i; this._paintSelect(); };
      cards.appendChild(c);
    });
    this._paintSelect();
  }

  _cursor(d) {
    this.pick[this.picking] = (this.pick[this.picking] + d + ROSTER.length) % ROSTER.length;
    this._paintSelect();
  }

  _lock() {
    this.locked[this.picking] = true;
    if (this.picking === 0) { this.picking = 1; this._paintSelect(); return; }
    this._paintSelect();
    this.go('diff');
  }

  _paintSelect() {
    const ids = this.pick.map((i) => ROSTER[i]);
    const mirror = ids[0] === ids[1];
    for (const c of $$('.card')) {
      const i = ROSTER.indexOf(c.dataset.id);
      c.classList.toggle('c1', i === this.pick[0]);
      c.classList.toggle('c2', i === this.pick[1] && (this.picking === 1 || this.locked[1]));
      c.querySelectorAll('.tag').forEach((t) => t.remove());
      if (i === this.pick[0]) c.insertAdjacentHTML('beforeend', '<span class="tag t1">P1</span>');
      if (i === this.pick[1] && this.picking === 1) c.insertAdjacentHTML('beforeend', '<span class="tag t2">CPU</span>');
    }
    const plate = (sel, id, evil, locked, active) => {
      const f = FIGHTERS[id];
      const P = $(sel);
      P.classList.toggle('locked', locked);
      P.style.opacity = active || locked ? 1 : 0.35;
      P.querySelector('.nm').textContent = (evil ? 'Evil ' : '') + f.name;
      P.querySelector('.an').innerHTML = `${f.animal} · ${f.style}`;
      P.querySelector('.moves').innerHTML = `<b>S+P</b> ${f.signatureName}<br><b>Space</b> ${f.specialName}`;
    };
    plate('.plate.p1', ids[0], false, this.locked[0], this.picking === 0);
    plate('.plate.p2', ids[1], mirror && (this.picking === 1 || this.locked[1]), this.locked[1], this.picking === 1);
    $('#select-step').textContent = this.picking === 0 ? 'Pick for Player 1' : 'Pick the Computer’s fighter';
    $('#select-hint').textContent = this.picking === 0 ? 'Player 1 — A / D to choose, O to pick' : 'Computer — A / D to choose, O to pick, P to go back';
    $('.plate.p2 .who').textContent = this.net.on ? 'Player 2' : 'Computer';
    if (this.net.on) this.net.paintSelect(ids, mirror, plate);
    if (this.show) {
      this.show.set(0, ids[0], { toque: this.toques });
      this.show.set(1, this.picking === 1 || this.locked[1] ? ids[1] : null, { evil: mirror, toque: this.toques });
    }
  }

  _toques() {
    this.toques = true;
    this._paintSelect();
    const t = $('#toast');
    t.textContent = '';
    const b = say(t, SAYINGS[0], 0, 120, { size: 28, tail: 'down' });
    this.later(2.6, () => dismiss(b));
  }

  /* nap time: 30 s with nothing pressed and the cards doze off */
  _wake() {
    this.idle = 0;
    if (document.body.classList.contains('napping')) {
      document.body.classList.remove('napping');
      for (const c of $$('.card')) { c.classList.remove('startle'); void c.offsetWidth; c.classList.add('startle'); this.later(0.7, () => c.classList.remove('startle')); }
    }
  }

  /* ── the fight ───────────────────────────────────────────────────────── */
  startFight({ p1 = ROSTER[this.pick[0]], p2 = ROSTER[this.pick[1]], level = this.level, p1cpu = null, seed = null, net = null } = {}) {
    if (this.show) { this.show.dispose(); this.show = null; }
    if (this.fight) this.fight.dispose();
    this.seed = seed ?? (((this.seed * 1103515245 + 12345) >>> 0) || 1);
    this.last = { p1, p2, level, p1cpu };
    this.kb.clear();
    const f = (this.fight = new Fight(this.stage, { p1, p2, seed: this.seed, cpu: [p1cpu, level], keyboard: this.kb, toques: this.toques, net }));
    f.onEvent = (e) => this._event(e);
    f.onTick = (st) => this._hud(st);
    $('#banner').textContent = '';
    $('#bubbles').textContent = '';
    for (let k = 0; k < 2; k++) $(`#n${k + 1}`).innerHTML = k === 0 ? `${flagOf(f.st.f[k].id)}<span>${f.name(k)}</span>` : `<span>${f.name(k)}</span>${flagOf(f.st.f[k].id)}`;
    this._hudCache = {};
    this._hud(f.st);
    this.go('fight');
    this._nag = [0, 0];
  }

  pause(on) {
    if (!this.fight) return;
    this.fight.paused = on;
    this.kb.clear();
    this.go(on ? 'pause' : 'fight');
  }

  _pauseAct(a) {
    if (a === 'resume') this.pause(false);
    if (a === 'select') { this.fight.dispose(); this.fight = null; this.go('select'); }
    if (a === 'title') { this.fight.dispose(); this.fight = null; this.go('title'); }
  }

  _winAct(a) {
    $('#bubbles').textContent = '';
    if (this.net.on) { this.net.winAct(a); return; }
    if (a === 'rematch') this.startFight(this.last);
    if (a === 'select') { this.fight?.dispose(); this.fight = null; this.go('select'); }
  }

  _hud(st) {
    const C = this._hudCache || (this._hudCache = {});
    for (let k = 0; k < 2; k++) {
      const f = st.f[k], max = FIGHTERS[f.id].health;
      const pct = Math.max(0, f.hp / max * 100);
      const key = `${pct.toFixed(1)}|${f.meter}`;
      if (C[k] !== key) {
        C[k] = key;
        const bar = $(`#hp${k + 1}`);
        bar.querySelector('.fill').style.width = `${pct}%`;
        bar.querySelector('.lag').style.width = `${pct}%`;
        bar.classList.toggle('low', pct < 25);
        const m = $(`#m${k + 1}`);
        m.querySelector('i').style.width = `${f.meter / MAX_METER * 100}%`;
        m.classList.toggle('full', f.meter >= MAX_METER);
      }
      const pips = $$(`#pips${k + 1} b`);
      pips.forEach((p, i) => p.classList.toggle('on', st.wins[k] > i));
    }
    const sec = Math.ceil(st.timer / 60);
    if (C.t !== sec) { C.t = sec; $('#timer').textContent = sec; $('#timer').classList.toggle('low', sec <= 10); }
  }

  banner(text, cls = '', ms = 1200, sub = '') {
    const B = $('#banner');
    B.innerHTML = `<span class="b pop ${cls}">${text}</span>${sub ? `<span class="sub">${sub}</span>` : ''}`;
    const mine = (this._bn = (this._bn || 0) + 1);
    if (ms) this.later(ms / 1000, () => { if (this._bn === mine) B.textContent = ''; });
  }

  /* where a fighter's head is on screen */
  headScreen(k, lift = 0.6) {
    const p = this.fight.plush[k];
    const v = new THREE.Vector3(...p.hc).applyMatrix4(p.group.matrixWorld);
    v.y += lift + (p.id === 'k8e' ? 0.4 : 0.9);
    v.project(this.stage.camera);
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  }

  _event(e) {
    const f = this.fight, st = f.st;
    if (e.k === 'banner') {
      if (e.text === 'round') this.banner(st.wins[0] === 1 && st.wins[1] === 1 ? 'Final Round' : `Round ${e.n}`, '', 900);
      else this.banner('Fight!', '', 800);
    }
    if (e.k === 'round') { for (const p of f.plush) p.reset(); }
    if (e.k === 'ko') {
      const dbl = e.w === 2;
      this.banner(dbl ? 'Double K.O.' : 'K.O.', 'ko', 1500);
      const loser = dbl ? -1 : 1 - e.w;
      if (e.fluff && loser >= 0) {
        // Fluffatality: the loser goes up in a cloud of stuffing and flops
        this.later(1.1, () => {
          const p = f.plush[loser];
          this.stage.burst(p);
          this.stage.shake(0.9);
          p.deflateTarget = 1;
          this.banner('Fluffatality', 'fluffatality', 2600);
        });
      } else if (e.perfect) this.later(1.55, () => this.banner('Fluffless Victory!', 'fluffless', 1700));
    }
    if (e.k === 'time') {
      this.banner(e.w === 2 ? 'Draw' : 'Time', '', 1500);
      if (e.perfect) this.later(1.55, () => this.banner('Fluffless Victory!', 'fluffless', 1700));
    }
    if (e.k === 'impatient') {
      const [x, y] = this.headScreen(e.p);
      const b = say($('#bubbles'), FIGHTERS[st.f[e.p].id].impatient, x, y, { size: Math.max(20, Math.min(26, innerWidth / 50)), tail: e.p === 0 ? 'down-left' : 'down-right', maxWidth: 240 });
      this.later(1.8, () => dismiss(b));
    }
    if (e.k === 'end') this.later(1.3, () => this._winner());
  }

  _winner() {
    const f = this.fight;
    if (!f || f.st.phase !== 'end') return;
    const st = f.st, w = st.winner;
    $('#banner').textContent = '';
    this.go('win');
    this.net.winScreen();
    if (w === 2) {
      $('#win-eyebrow').textContent = 'No winner';
      $('#win-name').textContent = 'Draw';
      return;
    }
    $('#win-eyebrow').textContent = `Pillow Fight · ${this.net.on ? `Player ${w + 1} wins${w === this.net.local ? ' — that’s you' : ''}` : w === 0 ? 'Player 1 wins' : f.cpu[0] ? 'CPU 2 wins' : 'The computer wins'}`;
    $('#win-name').innerHTML = `${f.name(w)} wins`;
    const id = st.f[w].id, line = st.egg ? FIGHTERS[id].catchphrase.egg : FIGHTERS[id].catchphrase.main;
    this.catchline = line;
    // the camera comes in on the winner (off to one side, to leave room for
    // what he says), and the bubble goes up beside his head
    const x = f.plush[w].pos.x, k = innerWidth / innerHeight < 1 ? 0 : 1;
    const dir = x > f.plush[1 - w].pos.x ? 1 : -1;     // the loser's on the other side: talk away from him
    f.focus = { x: x + dir * 2.2 * k, d: k ? 11.5 : 19, y: 0.4 };
    this.later(0.9, () => {
      if (this.screen !== 'win') return;
      const [hx, hy] = this.headScreen(w, -0.3);
      const size = Math.max(22, Math.min(36, innerWidth / 36));
      const right = dir > 0;
      const bx = k ? hx + (right ? 70 : -70) : hx, by = k ? hy + 40 : hy - 10;
      const b = say($('#bubbles'), line, bx, by, { size, tail: !k ? 'down' : right ? 'left' : 'right', maxWidth: Math.min(300, innerWidth * 0.55) });
      // keep it on screen (measured from its own size: it's mid-slap now)
      const sv = b.querySelector('svg'), bw = +sv.getAttribute('width'), bh = +sv.getAttribute('height');
      const left = parseFloat(b.style.left), top = parseFloat(b.style.top);
      let dx = 0, dy = 0;
      if (left < 12) dx = 12 - left;
      if (left + bw > innerWidth - 12) dx = innerWidth - 12 - bw - left;
      if (top + 50 < 150) dy = 150 - top - 50;
      if (dx || dy) { b.style.left = `${left + dx}px`; b.style.top = `${top + dy}px`; }
      this.winBubble = b;
    });
  }

  /* ── the loop ─────────────────────────────────────────────────────────── */
  frame(dt, draw = true) {
    this._timers(this.fight?.paused ? 0 : dt);
    this.net.frame(dt);
    if (this.screen === 'select' || this.screen === 'diff') {
      this.idle += dt;
      if (this.screen === 'select' && this.idle > 30 && !document.body.classList.contains('napping')) document.body.classList.add('napping');
    }
    if (this.fight) {
      this.fight.frame(dt);
    } else if (this.show) this.show.frame(dt);
    else if (this.lineup) this.lineup.frame(dt);
    else this.stage.frame(-2.7, 2.7, dt, innerWidth / innerHeight), this.stage.update(dt);
    if (draw) this.renderer.render(this.stage.scene, this.stage.camera);
    if (draw && this.boxes) this._boxes();
  }

  /* ?boxes: the sim's boxes over the picture — hurt (blue), a heavy's limb
     (cyan), active hits (red), shots (amber) — to check reach against the
     plush */
  _boxes() {
    const c = this.boxCanvas || (this.boxCanvas = Object.assign(document.createElement('canvas'), { id: 'boxes' }));
    if (!c.isConnected) { c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:4'; document.body.appendChild(c); }
    c.width = innerWidth; c.height = innerHeight;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    if (!this.fight) return;
    const cam = this.stage.camera, v = new THREE.Vector3();
    const P = (x, y) => { v.set(x / 1000, y / 1000, 0).project(cam); return [(v.x * 0.5 + 0.5) * c.width, (-v.y * 0.5 + 0.5) * c.height]; };
    const box = (b, col) => {
      if (!b) return;
      const [x0, y0] = P(b.x0, b.y1), [x1, y1] = P(b.x1, b.y0);
      g.fillStyle = col + '33'; g.strokeStyle = col; g.lineWidth = 2;
      g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    };
    for (const f of this.fight.st.f) {
      box(hurtBox(f), '#3b8bff'); box(limbBox(f), '#3ff0c8');
      for (const h of activeHits(f)) box(h.box, '#ff3b3b');
    }
    for (const p of this.fight.st.proj) box({ x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2 }, '#ffb020');
  }

  /* advance by `seconds` without drawing (slow or headless hosts: tests,
     screenshots), then draw one frame */
  step(seconds, draw = true) {
    for (let t = 0; t < seconds - 1e-9; t += 1 / 60) this.frame(1 / 60, false);
    if (draw) this.frame(0, true);
  }
}

async function start() {
  const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  document.body.classList.toggle('touch', touch);
  const { renderer, canvas } = await makeRenderer($('#stage'));
  if (document.fonts?.load) { try { await Promise.all([document.fonts.load('26px "Bolster Hand"'), document.fonts.load('26px "Bolster Display"'), document.fonts.load('700 26px "Bolster Condensed"')]); } catch { /* the fallback hand will do */ } }
  const app = new App(renderer, canvas);
  window.__bolster = app;
  app.moveOf = moveOf;
  app.boxes = params.has('boxes');
  app.say = (text, x, y, o) => say($('#bubbles'), text, x, y, o);
  // portraits for the cards
  if (!params.has('noportraits')) { try { app.portraits = await portraits(renderer, app.stage, ROSTER); } catch (err) { console.warn('portraits', err); } }
  let last = performance.now();
  app.hold = params.has('hold');
  renderer.setAnimationLoop(() => {
    if (!canvas.clientWidth) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!app.hold) app.frame(dt);
  });
  /* deep link: ?p1=kevalanche&p2=sumaura&cpu=hard straight into a fight
     (p1cpu=LEVEL hands player 1 to the computer too: CPU vs CPU) */
  const p1 = params.get('p1'), p2 = params.get('p2');
  if (p1 && p2 && FIGHTERS[p1] && FIGHTERS[p2]) {
    app.toques = params.get('toques') === '1';
    app.startFight({ p1, p2, level: params.get('cpu') || 'normal', p1cpu: params.get('p1cpu'), seed: (params.get('seed') | 0) || null });
    if (params.get('speed')) app.fight.speed = +params.get('speed');
  } else if (params.get('room')) app.net.joinRoom(params.get('room'));
  else if (params.get('screen') === 'select') app.go('select');
  else app.go('title');
  document.body.classList.add('is-live');
}

start().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 30px 30px;font:12px ui-monospace,monospace;color:#ffd0db">Pillow Fight couldn't start: ${String(err.message || err)}</p>`);
});
