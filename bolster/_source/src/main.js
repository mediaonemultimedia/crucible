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
import { FIGHTERS, ROSTER, MAX_METER, fighterId } from './fighters/index.js';
import { U } from './render/stage.js';
import { ROUND_TICKS, hurtBox, limbBox, activeHits } from './sim/sim.js';
import { moveOf } from './fighters/index.js';
import { FLAGS } from './ui/flags.js';
import { say, dismiss } from './ui/bubble.js';
import { SAYINGS } from './ui/sayings.js';
import { Online } from './online.js';
import { CPU } from './ai/cpu.js';
import { DUMMY_MODES, defaultSettings } from './practice.js';
import { hash, createMatch } from './sim/sim.js';
import { LEFT as K_L, RIGHT as K_R, UP as K_U, DOWN as K_D, LIGHT as K_O, HEAVY as K_P, SPECIAL as K_S, BLOCK as K_E } from './sim/input.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const params = new URLSearchParams(location.search);

const CONTROLS = `
  <h4>Controls</h4>
  <span><kbd>A</kbd><kbd>D</kbd></span><span>walk (back is only a walk)</span>
  <span><kbd>D</kbd><kbd>D</kbd></span><span>dash in (double-tap forward)</span>
  <span><kbd>A</kbd><kbd>A</kbd></span><span>backdash (double-tap back)</span>
  <span><kbd>W</kbd> <kbd>S</kbd></span><span>jump · crouch</span>
  <span class="new"><kbd>E</kbd></span><span class="new">block — high and mid; you stand your ground</span>
  <span class="new"><kbd>S</kbd>+<kbd>E</kbd></span><span class="new">crouch block — lows and mids, not overheads</span>
  <span><kbd>O</kbd></span><span>light attack — quick, safe</span>
  <span><kbd>P</kbd></span><span>heavy attack — long reach; punishable if blocked</span>
  <span><kbd>S</kbd>+<kbd>O</kbd></span><span>low attack</span>
  <span><kbd>S</kbd>+<kbd>P</kbd></span><span>signature move</span>
  <span class="new"><kbd>O</kbd>+<kbd>P</kbd></span><span class="new">throw (close) — beats a block; O+P as you're grabbed escapes</span>
  <span class="new"><kbd>O</kbd> <kbd>O</kbd> <kbd>P</kbd></span><span class="new">combo — chain as each hit lands; the last one's amplified</span>
  <span><kbd>W</kbd> then <kbd>S</kbd>+<kbd>P</kbd></span><span>dive slam (in the air: an overhead — block it standing)</span>
  <span><kbd>Space</kbd></span><span>special (full meter)</span>
  <span><kbd>Esc</kbd></span><span>pause</span>
  <p class="tip">Don't just mash forward: block their heavy, then hit back — a light or a throw gets in first. Hitting them as they wind up is a COUNTER.</p>`;

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
    this.mode = 'cpu';             // 'cpu' or 'practice' (the select screen's flow)
    this.practice = null;          // a practice session: { lobby, p1, p2 }
    this.practiceSettings = defaultSettings();
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
    if (this.practice && !(name === 'fight' || name === 'pause' || (name === 'online' && this.practice.lobby))) this.endPractice();
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
    for (const b of $$('#mode-screen .opt')) b.onclick = () => {
      if (b.disabled) return;
      if (b.dataset.mode === 'online') { this.mode = 'cpu'; this.net.menu(); } else { this.mode = b.dataset.mode; this.go('select'); }
    };
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
    if (s === 'online' && this.practice?.lobby) {
      // practising in the lobby: the game keys are the fight's; C copies the link, Esc leaves
      if (k === 'Escape') this.net.act('cancel');
      else if (k === 'KeyC' && $('#online-screen').dataset.state === 'hosting') this.net.copy();
      else this._practiceKey(k);
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
    if (s === 'fight') { if (k === 'Escape' && !this.net.on) { e.preventDefault(); this.pause(true); } else if (this.practice) this._practiceKey(k); return; }
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
    if (this.mode === 'practice') this.startPractice({ p1: ROSTER[this.pick[0]], p2: ROSTER[this.pick[1]] });
    else this.go('diff');
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
      if (i === this.pick[1] && this.picking === 1) c.insertAdjacentHTML('beforeend', `<span class="tag t2">${this.mode === 'practice' ? 'DUMMY' : 'CPU'}</span>`);
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
    const pr = this.mode === 'practice';
    $('#select-step').textContent = this.picking === 0 ? (pr ? 'Practice — pick your fighter' : 'Pick for Player 1') : (pr ? 'Pick the practice dummy' : 'Pick the Computer’s fighter');
    $('#select-hint').textContent = this.picking === 0 ? 'Player 1 — A / D to choose, O to pick' : pr ? 'Dummy — A / D to choose, O to start practising, P to go back' : 'Computer — A / D to choose, O to pick, P to go back';
    $('.plate.p2 .who').textContent = this.net.on ? 'Player 2' : pr ? 'Dummy' : 'Computer';
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
    this.endPractice();
    this.kb.clear();
    const f = (this.fight = new Fight(this.stage, { p1, p2, seed: this.seed, cpu: [p1cpu, level], keyboard: this.kb, toques: this.toques, net }));
    // (the state the match starts from: a test checks it's the fresh one, whatever practice came before)
    this.matchStart = { p1, p2, seed: this.seed, hash: hash(f.st) };
    f.onEvent = (e) => this._event(e);
    f.onTick = (st) => this._hud(st);
    $('#banner').textContent = '';
    $('#bubbles').textContent = '';
    $('#pops').textContent = '';
    for (const c of $$('.combo')) c.classList.remove('on', 'amp');
    for (let k = 0; k < 2; k++) $(`#n${k + 1}`).innerHTML = k === 0 ? `${flagOf(f.st.f[k].id)}<span>${f.name(k)}</span>` : `<span>${f.name(k)}</span>${flagOf(f.st.f[k].id)}`;
    this._hudCache = {};
    this._hud(f.st);
    this.go('fight');
    this._nag = [0, 0];
  }

  /* ── practice ─────────────────────────────────────────────────────────
     A fighter against the dummy (src/practice.js), from the menu (any
     fighter, any dummy) or in the online lobby while waiting for the other
     player. Local only: its own seed (never the app's match seed), nothing
     sent; thrown away when it ends. */
  startPractice({ p1, p2, lobby = false } = {}) {
    if (this.show) { this.show.dispose(); this.show = null; }
    if (this.fight) { this.fight.dispose(); this.fight = null; }
    if (!p2) p2 = ROSTER[(ROSTER.indexOf(p1) + 1) % ROSTER.length];
    this.kb.clear();
    const seed = ((Math.random() * 0x7fffffff) | 0) || 1;
    const f = (this.fight = new Fight(this.stage, { p1, p2, seed, keyboard: this.kb, toques: this.toques, practice: this.practiceSettings }));
    f.onEvent = (e) => this._event(e);
    f.onTick = (st) => this._hud(st);
    this.practice = { lobby, p1, p2 };
    $('#banner').textContent = '';
    $('#bubbles').textContent = '';
    for (const c of $$('.combo')) c.classList.remove('on', 'amp');
    $('#n1').innerHTML = `${flagOf(p1)}<span>${f.name(0)}</span>`;
    $('#n2').innerHTML = `<span>Dummy · ${FIGHTERS[p2].name}</span>${flagOf(p2)}`;
    this._hudCache = {};
    this._hud(f.st);
    document.body.classList.add('practicing');
    document.body.classList.toggle('lobby', lobby);
    this._prCache = {};
    this._paintDummy();
    this._paintMoves(p1);
    if (!lobby) this.go('fight');
  }

  endPractice() {
    if (!this.practice) return;
    if (this.fight?.practice) { this.fight.dispose(); this.fight = null; }
    this.practice = null;
    this.kb.clear();
    document.body.classList.remove('practicing', 'lobby');
    $('#bubbles').textContent = '';
  }

  /* the dummy panel's keys: 1–6 the dummy, R refill, M meter, X reset, H hide */
  _practiceKey(k) {
    const S = this.practiceSettings;
    const m = /^(Digit|Numpad)([1-6])$/.exec(k);
    if (m) S.mode = DUMMY_MODES[+m[2] - 1].id;
    else if (k === 'KeyR') S.refill = !S.refill;
    else if (k === 'KeyM') S.meter = !S.meter;
    else if (k === 'KeyX') this._practiceReset();
    else if (k === 'KeyH') document.body.classList.toggle('pr-hide');
    else return;
    this._paintDummy();
  }

  _practiceReset() {
    const f = this.fight;
    if (!f?.practice) return;
    const st = f.st;
    st.proj = [];
    st.f.forEach((g, k) => { g.x = k ? 2300 : -2300; g.y = 0; g.vx = g.vy = g.pv = 0; g.air = 0; g.act = 'idle'; g.t = 0; g.mv = ''; g.face = k ? -1 : 1; g.hp = FIGHTERS[g.id].health; });
    f.prev = st.f.map((g) => ({ x: g.x, y: g.y }));
    for (const p of f.plush) p.reset();
  }

  _paintDummy() {
    const S = this.practiceSettings, el = $('#pr-dummy');
    el.innerHTML = `<h5>Dummy <small>H hides</small></h5><div class="modes">${DUMMY_MODES.map((d) => `<button data-m="${d.id}" class="${S.mode === d.id ? 'on' : ''}"><kbd>${d.key}</kbd>${d.label}</button>`).join('')}</div>
      <div class="toggles"><button data-t="refill" class="${S.refill ? 'on' : ''}"><kbd>R</kbd>Refill</button><button data-t="meter" class="${S.meter ? 'on' : ''}"><kbd>M</kbd>Meter</button><button data-t="reset"><kbd>X</kbd>Reset</button></div>`;
    for (const b of el.querySelectorAll('button')) b.onclick = (e) => {
      e.stopPropagation();
      if (b.dataset.m) S.mode = b.dataset.m;
      else if (b.dataset.t === 'reset') this._practiceReset();
      else S[b.dataset.t] = !S[b.dataset.t];
      b.blur();
      this._paintDummy();
    };
  }

  _paintMoves(id) {
    const f = FIGHTERS[id], k = (...ks) => ks.map((x) => `<kbd>${x}</kbd>`).join('+');
    $('#pr-moves').innerHTML = `<h5>${f.name} — moves <small>Esc pause · X reset</small></h5>
      <span>${k('O')} light</span><span>${k('P')} heavy</span><span>${k('S', 'O')} low</span><span>${k('S', 'P')} ${f.signatureName}</span><span>${k('Space')} ${f.specialName}</span>
      <span><kbd>W</kbd> then ${k('S', 'P')} ${f.diveName}</span><span>${k('O', 'P')} ${f.throwName}</span><span>${k('E')} / ${k('S', 'E')} block</span><span><kbd>D</kbd><kbd>D</kbd> · <kbd>A</kbd><kbd>A</kbd> dash</span>
      <span class="bnb"><kbd>O</kbd> → <kbd>O</kbd> → <kbd>P</kbd> bread &amp; butter</span>`;
  }

  /* per frame: the input display and the combo readout */
  _paintPractice() {
    const f = this.fight;
    if (!f?.practice) return;
    const C = this._prCache || (this._prCache = {});
    const rows = f.inputs.rows;
    const key = rows.map((r) => `${r.m}:${r.t}`).join(',');
    if (C.in !== key) {
      C.in = key;
      const ic = (m) => {
        const o = [];
        for (const [b, t] of [[K_L, '←'], [K_R, '→'], [K_U, '↑'], [K_D, '↓']]) if (m & b) o.push(`<span class="ik d">${t}</span>`);
        for (const [b, t, c] of [[K_O, 'O', 'o'], [K_P, 'P', 'p'], [K_S, 'SP', 's'], [K_E, 'E', 'e']]) if (m & b) o.push(`<span class="ik ${c}">${t}</span>`);
        return o.join('') || '<span class="ik d">·</span>';
      };
      $('#pr-in').innerHTML = rows.map((r, j) => `<li style="--k:${j}"><b>${Math.min(99, r.t)}</b>${ic(r.m)}</li>`).join('');
    }
    const c = f.combos.last, ck = c ? `${c.hits}|${c.dmg}|${c.amp}|${c.ctr}|${f.combos.best}` : '';
    if (C.combo !== ck) {
      C.combo = ck;
      $('#pr-combo').innerHTML = c ? `<b>${c.hits}</b> hit${c.hits > 1 ? 's' : ''} · <b>${c.dmg}</b> damage${c.amp ? '<em>AMPLIFIED!</em>' : ''}${c.ctr ? '<i>COUNTER</i>' : ''}<span class="best">best ${f.combos.best} damage</span>` : 'Land a hit — O, O, P';
    }
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
    const sec = this.fight?.practice ? '∞' : Math.ceil(st.timer / 60);
    if (C.t !== sec) { C.t = sec; $('#timer').textContent = sec; $('#timer').classList.toggle('low', sec <= 10); }
  }

  banner(text, cls = '', ms = 1200, sub = '') {
    const B = $('#banner');
    B.innerHTML = `<span class="b pop ${cls}">${text}</span>${sub ? `<span class="sub">${sub}</span>` : ''}`;
    const mine = (this._bn = (this._bn || 0) + 1);
    if (ms) this.later(ms / 1000, () => { if (this._bn === mine) B.textContent = ''; });
  }

  /* the combo counter on the attacker's side: '3 HIT COMBO', 'AMPLIFIED!' on the finisher */
  combo(k, n, amp) {
    const c = $(`#combo${k + 1}`);
    c.querySelector('b').textContent = n;
    c.querySelector('span').textContent = n >= 3 ? 'HIT COMBO' : 'HIT';
    c.classList.remove('on', 'amp');
    void c.offsetWidth;            // restart the pop
    c.classList.add('on');
    if (amp) c.classList.add('amp');
    const mine = (this._cn = this._cn || [0, 0])[k] = this._cn[k] + 1;
    this.later(amp ? 1.6 : 1.1, () => { if (this._cn[k] === mine) c.classList.remove('on', 'amp'); });
  }

  /* a small neon word popped up where it happened (COUNTER, TECH) */
  pop(text, x, y, cls = '') {
    const v = new THREE.Vector3(x / U, y / U, 0).project(this.stage.camera);
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    el.style.left = `${Math.max(60, Math.min(innerWidth - 60, (v.x * 0.5 + 0.5) * innerWidth))}px`;
    el.style.top = `${Math.max(150, (-v.y * 0.5 + 0.5) * innerHeight - 110)}px`;
    $('#pops').appendChild(el);
    (this.pops = this.pops || []).push({ el, t: 0 });
    this._pops(0);
  }

  /* the pops run on the app's own time (like the banners): a slam in, a hold, a drift up and out */
  _pops(dt) {
    if (!this.pops?.length) return;
    this.pops = this.pops.filter((p) => {
      p.t += dt;
      const t = p.t;
      if (t >= 0.9) { p.el.remove(); return false; }
      const sc = t < 0.12 ? 1.7 - 0.7 * (t / 0.12) : 1, up = t > 0.6 ? (t - 0.6) / 0.3 : 0;
      p.el.style.opacity = 1 - up;
      p.el.style.transform = `translate(-50%, ${-50 - 70 * up}%) skewX(-10deg) scale(${sc})`;
      return true;
    });
  }

  /* the K.O.'s white flash: bright through the sim's hit-freeze, gone as
     the slow motion starts (so it's the same on both screens online) */
  _flash(st) {
    const el = $('#flash');
    let a = 0;
    if (st && st.phase === 'ko' && st.kt < st.kn) {
      const n = st.kf ? 12 : 9;
      a = st.kt < n ? 0.92 * (1 - st.kt / n) : 0;
    }
    if (this._fa !== a) { this._fa = a; el.style.opacity = a; }
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
    if (e.k === 'hit') {
      if (e.n >= 2) this.combo(e.p, e.n, e.amp);
      if (e.ctr) this.pop('COUNTER', e.x, e.y, e.p ? 'p2' : 'p1');
    }
    if (e.k === 'tech') this.pop('TECH', e.x, e.y, 'tech');
    // the K.O.: the white flash on contact; the launch, the slow motion and
    // the bounce are the sim's (fight.js shows them); then the banner
    if (e.k === 'koapex' && st.fluff && st.f[e.p].act === 'ko' && !this._fluffed) {
      // Fluffatality: he bursts at the top of the arc, in slow motion
      this._fluffed = true;
      const p = f.plush[e.p];
      this.stage.burst(p);
      this.stage.shake(0.9);
      p.deflateTarget = 1;
      this.banner('Fluffatality', 'fluffatality', 0);
    }
    if (e.k === 'ko') this._fluffed = false;
    if (e.k === 'kobanner') {
      const dbl = e.w === 2;
      if (e.fluff) this.later(0.6, () => this.banner('Fluffatality', 'fluffatality', 1800, dbl ? '' : 'K.O.'));
      else this.banner(dbl ? 'Double K.O.' : 'K.O.', 'ko', 1500);
      if (e.perfect) this.later(e.fluff ? 2.5 : 1.55, () => this.banner('Fluffless Victory!', 'fluffless', 1700));
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
      this._flash(this.fight.st);
      if (this.practice) this._paintPractice();
      this._pops(this.fight.paused ? 0 : dt);
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
  app.cpuFor = (k, level, seed) => new CPU(k, level, seed);   // tests: scripted online play
  app.boxes = params.has('boxes');
  app.say = (text, x, y, o) => say($('#bubbles'), text, x, y, o);
  app.hash = hash;
  app.freshHash = (p1, p2, seed) => hash(createMatch({ p1, p2, seed }));   // tests: the match practice must not touch
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
  const p1 = fighterId(params.get('p1')), p2 = fighterId(params.get('p2'));
  if (p1 && p2) {
    app.toques = params.get('toques') === '1';
    app.startFight({ p1, p2, level: params.get('cpu') || 'normal', p1cpu: params.get('p1cpu'), seed: (params.get('seed') | 0) || null });
    if (params.get('speed')) app.fight.speed = +params.get('speed');
  } else if (params.get('room')) app.net.joinRoom(params.get('room'));
  else if (params.get('screen') === 'select') app.go('select');
  else if (params.get('practice') !== null) app.startPractice({ p1: fighterId(params.get('practice')) || ROSTER[0], p2: fighterId(params.get('dummy')) || null });
  else app.go('title');
  document.body.classList.add('is-live');
}

start().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 30px 30px;font:12px ui-monospace,monospace;color:#ffd0db">Pillow Fight couldn't start: ${String(err.message || err)}</p>`);
});
