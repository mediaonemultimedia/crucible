/* Bolster — No. 23. The app: title → mode → character select → difficulty
   → best of three → winner, the HUD and banners, speech bubbles, the
   easter eggs, deep links (?p1=kevalanche&p2=sumaura&cpu=hard), and a test
   hook (window.__bolster). The game itself is the sim (src/sim/); this
   file only drives it and shows it.                                     */

import * as THREE from 'three/webgpu';
import { makeRenderer, Stage } from './render/stage.js';
import { Showcase, portraits } from './render/showcase.js';
import { Fight } from './fight.js';
import { Keyboard } from './input/keyboard.js';
import { FIGHTERS, ROSTER, MAX_METER } from './fighters/index.js';
import { ROUND_TICKS } from './sim/sim.js';
import { FLAGS } from './ui/flags.js';
import { say } from './ui/bubble.js';
import { SAYINGS } from './ui/sayings.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const params = new URLSearchParams(location.search);

const CONTROLS = `
  <h4>Controls</h4>
  <span><kbd>A</kbd><kbd>D</kbd></span><span>walk · hold back to block</span>
  <span><kbd>W</kbd> <kbd>S</kbd></span><span>jump · crouch (crouch-block lows)</span>
  <span><kbd>O</kbd></span><span>light attack</span>
  <span><kbd>P</kbd></span><span>heavy attack</span>
  <span><kbd>S</kbd>+<kbd>O</kbd></span><span>low attack</span>
  <span><kbd>S</kbd>+<kbd>P</kbd></span><span>signature move</span>
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
    this.backend = renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
    this.errors = [];
    $('#controls-select').innerHTML = CONTROLS;
    $('#controls-pause').innerHTML = CONTROLS;
    this._bindUI();
    this.resize();
    addEventListener('resize', () => this.resize());
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
    if (name !== 'select' && name !== 'diff' && this.show && name !== 'pause') { this.show.dispose(); this.show = null; }
  }

  _bindUI() {
    for (const b of $$('#mode-screen .opt')) b.onclick = () => { if (!b.disabled) this.go('select'); };
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
    if (s === 'fight') { if (k === 'Escape') { e.preventDefault(); this.pause(true); } return; }
    if (s === 'pause') {
      if (k === 'Escape') this.pause(false);
      else if (up || down) this._menuMove('#pause-screen .opt', up ? -1 : 1);
      else if (ok) this._menuFire('#pause-screen .opt');
      return;
    }
    if (s === 'win') {
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
      c.onclick = () => { this.pick[this.picking] = i; this._lock(); };
      c.onmouseenter = () => { if (this.screen === 'select') { this.pick[this.picking] = i; this._paintSelect(); } };
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
    say(t, SAYINGS[0], 0, 70, { size: 28, tail: 'down', ms: 2600 });
  }

  /* nap time: 30 s with nothing pressed and the cards doze off */
  _wake() {
    this.idle = 0;
    if (document.body.classList.contains('napping')) {
      document.body.classList.remove('napping');
      for (const c of $$('.card')) { c.classList.remove('startle'); void c.offsetWidth; c.classList.add('startle'); setTimeout(() => c.classList.remove('startle'), 700); }
    }
  }

  /* ── the fight ───────────────────────────────────────────────────────── */
  startFight({ p1 = ROSTER[this.pick[0]], p2 = ROSTER[this.pick[1]], level = this.level, p1cpu = null, seed = null } = {}) {
    if (this.show) { this.show.dispose(); this.show = null; }
    if (this.fight) this.fight.dispose();
    this.seed = seed ?? (((this.seed * 1103515245 + 12345) >>> 0) || 1);
    this.last = { p1, p2, level, p1cpu };
    this.kb.clear();
    const f = (this.fight = new Fight(this.stage, { p1, p2, seed: this.seed, cpu: [p1cpu, level], keyboard: this.kb, toques: this.toques }));
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
    clearTimeout(this._bt);
    if (ms) this._bt = setTimeout(() => { B.textContent = ''; }, ms);
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
        setTimeout(() => {
          const p = f.plush[loser];
          this.stage.burst(p);
          this.stage.shake(0.9);
          const t0 = performance.now();
          const tick = () => { const k = Math.min(1, (performance.now() - t0) / 450); p.deflate = k; if (k < 1) requestAnimationFrame(tick); };
          tick();
          this.banner('Fluffatality', 'fluffatality', 2600);
        }, 1100);
      } else if (e.perfect) setTimeout(() => this.banner('Fluffless Victory!', 'fluffless', 1700), 1550);
    }
    if (e.k === 'time') {
      this.banner(e.w === 2 ? 'Draw' : 'Time', '', 1500);
      if (e.perfect) setTimeout(() => this.banner('Fluffless Victory!', 'fluffless', 1700), 1550);
    }
    if (e.k === 'impatient') {
      const [x, y] = this.headScreen(e.p);
      say($('#bubbles'), FIGHTERS[st.f[e.p].id].impatient, x, y, { size: Math.max(20, Math.min(26, innerWidth / 50)), tail: e.p === 0 ? 'down-left' : 'down-right', ms: 1700, maxWidth: 240 });
    }
    if (e.k === 'end') setTimeout(() => this._winner(), 1300);
  }

  _winner() {
    const f = this.fight;
    if (!f || f.st.phase !== 'end') return;
    const st = f.st, w = st.winner;
    $('#banner').textContent = '';
    this.go('win');
    document.body.classList.add('fighting');
    if (w === 2) {
      $('#win-eyebrow').textContent = 'No winner';
      $('#win-name').textContent = 'Draw';
      return;
    }
    $('#win-eyebrow').textContent = w === 0 ? 'Player 1 wins' : f.cpu[0] ? 'CPU 2 wins' : 'The computer wins';
    $('#win-name').innerHTML = `${f.name(w)} wins`;
    const id = st.f[w].id, line = st.egg ? FIGHTERS[id].catchphrase.egg : FIGHTERS[id].catchphrase.main;
    this.catchline = line;
    // the camera comes in on the winner; the bubble goes over his head
    this.winFocus = w;
    setTimeout(() => {
      const [x, y] = this.headScreen(w, 0.2);
      const size = Math.max(22, Math.min(34, innerWidth / 38));
      const left = x > innerWidth * 0.55;
      const b = say($('#bubbles'), line, x, y, { size, tail: left ? 'down-right' : 'down-left', ms: 0, maxWidth: Math.min(380, innerWidth * 0.55) });
      // keep it on screen
      const r = b.getBoundingClientRect();
      let dx = 0, dy = 0;
      if (r.left < 12) dx = 12 - r.left;
      if (r.right > innerWidth - 12) dx = innerWidth - 12 - r.right;
      if (r.top < 90) dy = 90 - r.top;
      if (dx || dy) { b.style.left = `${parseFloat(b.style.left) + dx}px`; b.style.top = `${parseFloat(b.style.top) + dy}px`; }
      this.winBubble = b;
    }, 700);
  }

  /* ── the loop ─────────────────────────────────────────────────────────── */
  frame(dt, draw = true) {
    if (this.screen === 'select' || this.screen === 'diff') {
      this.idle += dt;
      if (this.screen === 'select' && this.idle > 30 && !document.body.classList.contains('napping')) document.body.classList.add('napping');
    }
    if (this.fight) {
      this.fight.frame(dt);
      if (this.screen === 'win' && this.winFocus !== undefined) {
        // drift in on the winner
        const c = this.stage.cam, x = this.fight.plush[this.winFocus].pos.x;
        c.x += (x - c.x) * Math.min(1, dt * 2);
        c.d += (12.5 - c.d) * Math.min(1, dt * 2);
        this.stage.frame(c.x, c.x, 0, innerWidth / innerHeight);
      }
    } else if (this.show) this.show.frame(dt);
    else this.stage.frame(-2.7, 2.7, dt, innerWidth / innerHeight), this.stage.update(dt);
    if (draw) this.renderer.render(this.stage.scene, this.stage.camera);
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
  if (document.fonts?.load) { try { await Promise.all([document.fonts.load('26px "Bolster Hand"'), document.fonts.load('26px "Bolster Display"')]); } catch { /* the fallback hand will do */ } }
  const app = new App(renderer, canvas);
  window.__bolster = app;
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
  } else if (params.get('screen') === 'select') app.go('select');
  document.body.classList.add('is-live');
}

start().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 30px 30px;font:12px ui-monospace,monospace;color:#7a4030">Bolster couldn't start: ${String(err.message || err)}</p>`);
});
