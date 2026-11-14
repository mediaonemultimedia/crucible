/* Pillow Fight 2 — the app: title → mode → character select → (difficulty)
   → the VS card → the fight (HUD, banners, K.O. / ring-out moments) → the
   winner and a rematch; pause on Esc; practice with a dummy and the move
   list; the sound (PF1's engine, chiptune and SFX).

   Deep links: ?p1=kevalanche&p2=rubberta&cpu=hard (a fight), p1cpu=LEVEL
   (CPU vs CPU), versus=1 (two players, one keyboard), practice=ID&dummy=ID,
   screen=select, seed=N, hold (no free-running loop: tools step it),
   webgl (force WebGL 2), noportraits.                                     */

import * as THREE from 'three/webgpu';
import { makeRenderer, Arena, U } from './render/arena.js';
import { portraits, Turntable } from './render/portraits.js';
import { Fight } from './fight.js';
import { Keyboard } from './input/keyboard.js';
import { FIGHTERS, ROSTER, MAX_METER, fighterId } from './fighters/index.js';
import { hash, createMatch, ROUND_TICKS } from './sim/sim.js';
import { FLAGS } from './ui/flags.js';
import { say, dismiss } from './ui/bubble.js';
import { SOLO, ACTIONS, toMap, loadBindings, keyCap } from './input/layouts.js';
import { keyboardSVG, soloBinding, comboLine } from './ui/keymap.js';
import { TWIN_TITLE } from './ui/variant.js';
import { AudioEngine, renderOffline } from './audio/engine.js';
import { CLIPS } from './audio/clips.js';
import { SfxRouter } from './audio/sfxmap.js';
import { CPU } from './ai/cpu.js';
import { LEFT, RIGHT, UP, DOWN, LIGHT, HEAVY, SPECIAL, BLOCK, JUMP, CROUCH } from './sim/input.js';
import { Online } from './online.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const params = new URLSearchParams(location.search);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LS = (() => { try { const s = window.localStorage; s.getItem('x'); return s; } catch { return null; } })();
const flagOf = (id) => FLAGS[FIGHTERS[id].nation];

/* frame data for a move: startup, active, recovery, on block, and how it
   travels — tracking (circular: catches a sidestep), linear (a sidestep
   beats it), a shot (flies its own line: sidestep it), a throw */
export function frameData(id, name) {
  const m = FIGHTERS[id].moves[name];
  if (!m) return null;
  const tag = m.kind === 'throw' ? 'throw' : m.circ || m.hits.some((h) => h.W >= 2000) ? 'tracking' : m.spawn.length && !m.hits.length ? 'shot' : 'linear';
  if (m.grab) return { tag, start: m.grab.from, active: m.grab.to - m.grab.from + 1, rec: m.total - m.grab.to, blk: null };
  const h0 = m.hits[0], hN = m.hits[m.hits.length - 1];
  if (!h0) { const at = m.spawn[0]?.at ?? 0; return { tag, start: at, active: 1, rec: m.total - at, blk: null }; }
  const rec = m.total - hN.to;
  return { tag, start: h0.from, active: hN.to - h0.from + 1, rec, blk: hN.level === 'unblockable' ? null : hN.blockstun - rec };
}
const MOVE_ROWS = [['O', 'light', 'Light (chains)'], ['P', 'heavy', 'Heavy (lunge)'], ['← + P', 'sweep', 'Spin'], ['Shift + O', 'lowLight', 'Low light'],
  ['Shift + P', 'signature', null], ['Space', 'special', null], ['O + P', 'throw', null]];

/* the move list (practice, the select plates) */
export function moveList(id) {
  const f = FIGHTERS[id];
  return [
    ['O', 'Light (chains)'], ['P', 'Heavy (lunge)'], ['← + P', 'Spin — tracks a sidestep'], ['Shift + O', 'Low light'],
    ['Shift + P', f.signatureName], ['Space', `${f.specialName} (full meter)`], ['O + P', `${f.throwName} (throw)`],
    ['Q, then P', 'Hop + air heavy'], ['Q, then Shift + P', f.diveName], ['W / S tap', 'Sidestep (beats linear moves)'], ['W / S hold', 'Circle'], ['→→ / ←←', 'Dash'],
  ];
}

class App {
  constructor(renderer, canvas) {
    this.renderer = renderer; this.canvas = canvas;
    this.arena = new Arena();
    this.bind = loadBindings(LS);
    this.kb = new Keyboard(window, SOLO);
    this.kb2 = new Keyboard(window, toMap(this.bind[1]));
    this.kb2.enabled = false;
    this.screen = 'title';
    this.fight = null; this.table = null;
    this.pick = [0, 1]; this.locked = [false, false]; this.picking = 0;
    this.alt = [false, false];
    this.level = 'normal'; this.mode = 'cpu';
    this.seed = (params.get('seed') | 0) || ((Date.now() & 0xffff) + 1);
    this.portraits = {};
    this.timers = [];
    this.audio = new AudioEngine({ storage: LS, clips: CLIPS });
    this.router = new SfxRouter();
    this.audio.onChange(() => this._paintSound());
    this.dummyMode = 'stand';
    this.net = new Online(this);
    this._bindUI();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  later(sec, fn) { this.timers.push({ t: sec, fn }); }
  _timers(dt) {
    if (!this.timers.length) return;
    const due = [];
    this.timers = this.timers.filter((q) => { q.t -= dt; if (q.t <= 0) { due.push(q); return false; } return true; });
    for (const q of due) q.fn();
  }

  resize() { this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); this.renderer.setSize(innerWidth, innerHeight, false); }

  go(name) {
    this.screen = name;
    for (const s of $$('.screen')) s.classList.toggle('on', s.id === `${name}-screen`);
    document.body.classList.toggle('fighting', name === 'fight' || name === 'pause');
    document.body.classList.toggle('practicing', !!this.fight?.practice && (name === 'fight' || name === 'pause'));
    document.body.dataset.screen = name;
    if (['title', 'mode'].includes(name)) $('#bubbles').textContent = '';
    if (name !== 'fight' && name !== 'win' && name !== 'pause') this._drainOff(true);
    if (name !== 'fight') $('#namecard').className = '';
    if (name === 'select') this._enterSelect();
    if (name !== 'select' && name !== 'diff' && name !== 'pause' && this.table) { this.table.dispose(); this.table = null; }
    if ((name === 'title' || name === 'mode') && this.fight) { this.fight.dispose(); this.fight = null; }
    const A = this.audio;
    A.pause(name === 'pause');
    A.setPractice(!!this.fight?.practice);
    if (['title', 'mode', 'select', 'diff', 'online'].includes(name)) { A.setIntense(false); A.music('menu'); }
    if (name === 'fight' && this.fight?.practice) A.music('fight');
  }

  /* ── sound ─────────────────────────────────────────────────────────── */
  _sfx(e, tick, n) { for (const x of this.router.route(e, tick, n)) this.audio.play(x.id, x); }
  _swing(st) { for (const x of this.router.whooshes(st)) this.audio.play(x.id, x); }
  _paintSound() {
    const S = this.audio.settings, b = $('#sound');
    if (b) { b.classList.toggle('off', S.muted); b.setAttribute('aria-pressed', String(S.muted)); }
    const m = $('#pause-screen .opt[data-act=mute]');
    if (m) m.innerHTML = `${S.muted ? 'Sound: off' : 'Sound: on'} <small>M</small>`;
    for (const k of ['music', 'sfx']) {
      const r = $(`#vol-${k}`);
      if (r && +r.value !== S[k]) r.value = S[k];
      const o = $(`#pause-screen .opt[data-act=${k}]`);
      if (o) { o.style.setProperty('--v', `${S[k]}%`); o.querySelector('b').textContent = S[k]; }
    }
  }
  toggleMute() { if (!this.audio.toggleMute()) this.audio.ui('confirm'); }

  _bindUI() {
    for (const b of $$('#mode-screen .opt')) b.onclick = () => {
      if (b.disabled) return;
      if (b.dataset.mode === 'online') { this.mode = 'cpu'; this.net.menu(); return; }
      this.mode = b.dataset.mode;
      this.go('select');
    };
    for (const b of $$('#diff-screen .opt')) b.onclick = () => { this.level = b.dataset.level; this.startFight({ vs: true }); };
    for (const b of $$('#online-screen .opt')) b.onclick = () => this.net.act(b.dataset.act);
    for (const b of $$('#pause-screen .opt')) b.onclick = () => this._pauseAct(b.dataset.act);
    for (const b of $$('#win-screen .opt')) b.onclick = () => this._winAct(b.dataset.act);
    for (const b of $$('.opt')) b.addEventListener('pointerenter', () => { if (b.disabled) return; if (!b.classList.contains('sel')) this.audio.ui('tick'); for (const o of b.parentNode.querySelectorAll(':scope > .opt')) o.classList.toggle('sel', o === b); });
    document.addEventListener('click', (e) => { const b = e.target.closest?.('.opt'); if (b && !b.disabled && !b.classList.contains('vol')) this.audio.ui('confirm'); }, true);
    $('#sound').onclick = (e) => { e.stopPropagation(); this.toggleMute(); $('#sound').blur(); };
    for (const k of ['music', 'sfx']) {
      const r = $(`#vol-${k}`);
      r.addEventListener('input', () => this.audio.set(k, +r.value));
      r.addEventListener('click', (e) => e.stopPropagation());
    }
    this._paintSound();
    $('#title-screen').onclick = () => this.go('mode');
    addEventListener('keydown', (e) => this._key(e));
    addEventListener('pointerdown', () => this.audio.unlock());
  }

  _menuMove(sel, d) {
    const opts = $$(sel).filter((b) => !b.disabled);
    let i = opts.findIndex((b) => b.classList.contains('sel'));
    i = (i + d + opts.length) % opts.length;
    opts.forEach((b, k) => b.classList.toggle('sel', k === i));
    this.audio.ui('tick');
  }
  _menuFire(sel) {
    const b = $$(sel).find((x) => x.classList.contains('sel'));
    if (!b) return;
    b.classList.add('pressed');
    setTimeout(() => b.classList.toggle('pressed', false), 110);
    b.click();
  }

  _key(e) {
    this.audio.unlock();
    const c = e.code;
    if (c === 'KeyM' && !(this.mode === 'versus' && this.screen === 'fight')) { this.toggleMute(); return; }
    if (this.vs) { this._vsEnd(); return; }
    const up = c === 'KeyW' || c === 'ArrowUp', down = c === 'KeyS' || c === 'ArrowDown', left = c === 'KeyA' || c === 'ArrowLeft', right = c === 'KeyD' || c === 'ArrowRight';
    const ok = c === 'KeyO' || c === 'Enter' || c === 'Space', back = c === 'KeyP' || c === 'Escape' || c === 'Backspace';
    switch (this.screen) {
      case 'title': if (!e.repeat) this.go('mode'); return;
      case 'mode':
        if (up || down) this._menuMove('#mode-screen .opt', up ? -1 : 1);
        else if (ok) this._menuFire('#mode-screen .opt');
        else if (c === 'Escape') this.go('title');
        return;
      case 'online': {
        const st = $('#online-screen').dataset.state;
        if (c === 'KeyC' && st === 'hosting') { this.net.copy(); return; }
        if (up || down) this._menuMove(`#online-screen .ol-${st} .opt`, up ? -1 : 1);
        else if (ok) this._menuFire(`#online-screen .ol-${st} .opt`);
        else if (c === 'Escape') this.net.act(st === 'menu' ? 'back' : 'cancel');
        return;
      }
      case 'diff':
        if (up || down) this._menuMove('#diff-screen .opt', up ? -1 : 1);
        else if (ok) this._menuFire('#diff-screen .opt');
        else if (back) { this.locked[1] = false; this.picking = 1; this.go('select'); }
        return;
      case 'select':
        if (this.net.on) return this.net.selectKey(e, { up, down, left, right, ok, back });
        return this._selectKey(e, { up, down, left, right, ok, back });
      case 'pause':
        if (c === 'Escape') this.pause(false);
        else if (up || down) this._menuMove('#pause-screen .col > .opt, #pause-screen .snd > .opt', up ? -1 : 1);
        else if (left || right) { const s = $$('#pause-screen .opt.vol').find((x) => x.classList.contains('sel')); if (s) { const k = s.dataset.act; this.audio.set(k, Math.max(0, Math.min(100, this.audio.settings[k] + (right ? 5 : -5)))); } }
        else if (ok) this._menuFire('#pause-screen .col > .opt, #pause-screen .snd > .opt');
        return;
      case 'win':
        if (this.net.on && c === 'Escape') { this._winAct('select'); return; }
        if (left || right || up || down) this._menuMove('#win-screen .opt', 1);
        else if (ok) this._menuFire('#win-screen .opt');
        return;
      case 'fight':
        if (c === 'Escape' && !e.repeat && !this.net.on) { this.pause(true); return; }
        if (this.fight?.practice && !e.repeat) {
          const dm = { Digit1: 'stand', Digit2: 'block', Digit3: 'sidestep', Digit4: 'cpu', Digit5: 'drill' }[c];
          if (dm) { this.dummyMode = dm; if (dm === 'drill') { this.drillN = 0; this._practiceReset(); } this._paintPractice(); }
          if (c === 'KeyR') this._practiceReset();
        }
    }
  }

  /* ── character select ──────────────────────────────────────────────── */
  _enterSelect() {
    this.locked = [false, false]; this.picking = 0;
    if (this.mode === 'versus' && this.pick[0] === this.pick[1]) this.pick[1] = (this.pick[0] + 1) % ROSTER.length;
    if (this.fight) { this.fight.dispose(); this.fight = null; }
    if (!this.table) this.table = new Turntable(this.arena);
    const cards = $('#cards');
    cards.textContent = '';
    const n = ROSTER.length;
    ROSTER.forEach((id, i) => {
      const f = FIGHTERS[id], c = document.createElement('div');
      c.className = 'card'; c.dataset.id = id;
      // the row curves round the viewer: a carousel's arc
      const a = (i - (n - 1) / 2) * 7;
      c.style.setProperty('--ry', `${-a}deg`); c.style.setProperty('--tz', `${-Math.abs(i - (n - 1) / 2) * 14}px`);
      c.innerHTML = `<span class="flag">${flagOf(id)}</span><span class="lab">${f.name}</span>`;
      this._cardPortrait(c);
      const seat = () => (this.mode === 'versus' ? (this.locked[0] ? 1 : 0) : this.picking);
      c.onclick = () => { if (this.net.on) { this.net.choose(i, true); return; } const k = seat(); if (this.locked[k]) return; this.pick[k] = i; this._lock(k); };
      c.onmouseenter = () => { if (this.net.on) { if (!this.locked[this.net.local] && this.pick[this.net.local] !== i) { this.net.choose(i, false); this.audio.ui('tick'); } return; } const k = seat(); if (this.locked[k] || this.pick[k] === i) return; this.pick[k] = i; this.audio.ui('tick'); this._paintSelect(); };
      cards.appendChild(c);
    });
    this._legend();
    this._paintSelect();
  }

  _cardPortrait(c) {
    const src = this.portraits[c.dataset.id];
    if (!src || c.querySelector('img')) return;
    const im = new Image(); im.alt = ''; im.src = src;
    c.prepend(im);
  }

  _legend() {
    const vs = this.mode === 'versus';
    const B = vs ? this.bind : [soloBinding()];
    $('#legend').classList.toggle('vs', vs);
    $('#legend').innerHTML = keyboardSVG(B, { title: vs ? 'Versus keys on one keyboard' : 'One-player keys', cols: vs ? 23 : 18.5 }) + `<div class="combo">${comboLine()}</div>`;
    $('#controls-pause').innerHTML = `<div class="kb" style="display:block;width:min(560px,60vw)">${$('#legend').innerHTML}</div>`;
  }

  _selectKey(e, { up, down, left, right, ok, back }) {
    const c = e.code;
    if (this.mode === 'versus') {
      // both pick at once: player 1 on A / D (G locks), player 2 on the arrows (Num 4 locks)
      const B = this.bind;
      for (let k = 0; k < 2; k++) {
        if (this.locked[k]) { if (B[k].heavy.includes(c)) { this.locked[k] = false; this._paintSelect(); } continue; }
        if (B[k].left.includes(c) || B[k].right.includes(c)) { this.pick[k] = (this.pick[k] + (B[k].right.includes(c) ? 1 : -1) + ROSTER.length) % ROSTER.length; this.audio.ui('tick'); this._paintSelect(); }
        if (B[k].up.includes(c) || B[k].down.includes(c)) { this.alt[k] = !this.alt[k]; this._paintSelect(); }
        if (B[k].light.includes(c) || (k === 0 && c === 'Enter')) this._lock(k);
      }
      if (c === 'Escape') this.go('mode');
      return;
    }
    const k = this.picking;
    if (left || right) { this.pick[k] = (this.pick[k] + (right ? 1 : -1) + ROSTER.length) % ROSTER.length; this.audio.ui('tick'); this._paintSelect(); }
    else if (up || down) { this.alt[k] = !this.alt[k]; this.audio.ui('tick'); this._paintSelect(); }
    else if (ok && !e.repeat) this._lock(k);
    else if (back) {
      if (k === 1) { this.picking = 0; this.locked[0] = false; this._paintSelect(); }
      else this.go('mode');
    }
  }

  _lock(k) {
    this.locked[k] = true;
    this.audio.ui('confirm');
    if (this.mode === 'versus') {
      this._paintSelect();
      if (this.locked[0] && this.locked[1]) this.later(0.35, () => this.screen === 'select' && this.startFight({ vs: true }));
      return;
    }
    if (k === 0) { this.picking = 1; if (this.pick[1] === this.pick[0]) this.pick[1] = (this.pick[0] + 1) % ROSTER.length; this._paintSelect(); return; }
    if (this.mode === 'practice') { this.startPractice({ p1: ROSTER[this.pick[0]], p2: ROSTER[this.pick[1]] }); return; }
    this.go('diff');
  }

  _paintSelect() {
    const ids = this.pick.map((i) => ROSTER[i]);
    const online = this.net.on;
    const two = this.mode === 'versus' || online || this.picking === 1 || this.locked[1];
    for (const c of $$('.card')) {
      const i = ROSTER.indexOf(c.dataset.id);
      c.classList.toggle('c1', i === this.pick[0]);
      c.classList.toggle('c2', two && i === this.pick[1]);
      c.querySelectorAll('.tag').forEach((t) => t.remove());
      if (i === this.pick[0]) c.insertAdjacentHTML('beforeend', '<span class="tag t1">P1</span>');
      if (two && i === this.pick[1]) c.insertAdjacentHTML('beforeend', `<span class="tag t2">${this.mode === 'practice' ? 'DUMMY' : this.mode === 'versus' ? 'P2' : 'CPU'}</span>`);
    }
    const plate = (sel, k, active) => {
      const id = ids[k], f = FIGHTERS[id], P = $(sel), evil = this.alt[k];
      P.classList.toggle('locked', this.locked[k]);
      P.style.opacity = active || this.locked[k] ? 1 : 0.35;
      P.querySelector('.nm').textContent = (evil ? 'Evil ' : '') + f.name;
      P.querySelector('.an').innerHTML = `${esc(f.animal)} · ${esc(f.style)}${evil ? `<br><b style="color:#ff6b6b">ALT</b> ${esc(TWIN_TITLE[id] || '')}` : ' · <b>OG</b>'}`;
      P.querySelector('.moves').innerHTML = `<b>Shift+P</b> ${esc(f.signatureName)}<br><b>Space</b> ${esc(f.specialName)}<br><b>←+P</b> Spin (tracking)`;
    };
    plate('.plate.p1', 0, this.mode === 'versus' || online || this.picking === 0);
    $('.plate.p2').style.display = two ? '' : 'none';
    if (two) plate('.plate.p2', 1, true);
    $('.plate.p1 .who').textContent = 'Player 1';
    $('.plate.p2 .who').textContent = this.mode === 'practice' ? 'Dummy' : this.mode === 'versus' ? 'Player 2' : 'Computer';
    const pr = this.mode === 'practice';
    if (this.mode === 'versus') {
      $('#select-step').textContent = this.locked[0] && this.locked[1] ? 'Both locked in — fight!' : 'Both pick at once';
      $('#select-hint').textContent = 'P1: A / D choose, W / S OG or ALT, G lock · P2: ← / → choose, ↑ / ↓ OG or ALT, Num 4 lock · Esc back';
    } else {
      $('#select-step').textContent = this.picking === 0 ? (pr ? 'Practice — pick your fighter' : 'Pick for Player 1') : (pr ? 'Pick the practice dummy' : 'Pick the Computer’s fighter');
      $('#select-hint').textContent = `${this.picking === 0 ? 'Player 1' : pr ? 'Dummy' : 'Computer'} — A / D to choose, W / S for OG or ALT, O to pick${this.picking ? ', P to go back' : ''}`;
    }
    if (online) this.net.paintSelect();
    if (this.table) { this.table.set(0, ids[0], this.alt[0]); this.table.set(1, two ? ids[1] : null, this.alt[1]); }
  }

  /* ── the fight ─────────────────────────────────────────────────────── */
  startFight({ p1 = ROSTER[this.pick[0]], p2 = ROSTER[this.pick[1]], level = this.level, p1cpu = null, seed = null, vs = false, net = null } = {}) {
    if (this.table) { this.table.dispose(); this.table = null; }
    if (this.fight) { this.fight.dispose(); this.fight = null; }
    const versus = this.mode === 'versus' && !net;
    this.kb.setMap(versus ? toMap(this.bind[0]) : SOLO);
    this.kb2.enabled = versus;
    this.kb2.setMap(toMap(this.bind[1]));
    const s = seed || (this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff) || 1;
    const f = (this.fight = new Fight(this.arena, { p1, p2, seed: s, cpu: net ? [null, null] : [p1cpu, versus ? null : level], keyboard: this.kb, keyboard2: versus ? this.kb2 : null, alt: this.alt, net }));
    this.last = net ? null : { p1, p2, level, p1cpu };
    this._legend();
    f.onEvent = (e) => this._event(e);
    f.onTick = (st) => this._hud(st);
    f.onSfx = (e, t, n) => this._sfx(e, t, n);
    f.onSwing = (st) => this._swing(st);
    f.onIntro = (k) => this._nameCard(f, k);
    if (f.intro && f.intro.k >= 0) this._nameCard(f, f.intro.k);
    this.router.reset?.();
    $('#pn1').textContent = f.name(0); $('#pn2').textContent = f.name(1);
    $('#n1').textContent = net ? this.net.label(0) : versus ? 'Player 1' : p1cpu ? `CPU · ${p1cpu}` : 'Player 1';
    $('#n2').textContent = net ? this.net.label(1) : versus ? 'Player 2' : `CPU · ${level}`;
    this._hudCache = null;
    this._hud(f.st);
    this.go('fight');
    this.audio.music(null);
    if (vs) this._vsCard(f);
  }

  _vsCard(f) {
    const card = $('#vs');
    const side = (k) => {
      const id = f.st.f[k].id, F = FIGHTERS[id];
      const ti = f.evil[k] ? `<b>ALT</b>${esc(TWIN_TITLE[id] || '')}` : `<b>OG</b>${esc(F.animal)}`;
      return { pt: `<figure class="pt s${k + 1}"></figure>`, tag: `<div class="tag s${k + 1}"><span class="ti">${ti}</span><span class="nm">${esc(f.name(k))}</span><span class="who">${f.session ? this.net.label(k) : k === 0 ? 'Player 1' : this.mode === 'versus' ? 'Player 2' : `Computer · ${this.level}`}</span></div>` };
    };
    const A = side(0), B = side(1);
    card.innerHTML = `<div class="bg b1"></div><div class="bg b2"></div><div class="seam"></div>${A.pt}${B.pt}<div class="mid">VS</div>${A.tag}${B.tag}<div class="skip">Any key to skip</div>`;
    card.className = 'on';
    document.body.classList.add('vs-on');
    card.onclick = () => this._vsEnd();
    this.audio.sting('vs');
    // online the sim never holds for the card (both peers run the intro under it)
    this.vs = { t: 0, dur: f.session ? 1.1 : 1.6, online: !!f.session };
    if (!f.session) f.paused = true;
    this.kb.clear(); this.kb2.clear();
    [0, 1].forEach((k) => {
      const src = this.portraits[f.st.f[k].id];
      if (src) { const im = new Image(); im.alt = ''; im.className = 'in'; im.src = src; card.querySelector(`.pt.s${k + 1}`).appendChild(im); }
    });
  }

  /* the round-1 intro's name card: who's on screen, their animal and style */
  _nameCard(f, k) {
    const el = $('#namecard');
    if (k === null || k === undefined || !f || f !== this.fight) { el.className = ''; return; }
    const id = f.st.f[k].id, F = FIGHTERS[id];
    el.innerHTML = `<span class="who">${k === 0 ? 'Player 1' : f.session ? 'Player 2' : this.mode === 'versus' ? 'Player 2' : 'Computer'}</span><b>${esc(f.name(k))}</b><span class="an">${flagOf(id)} ${esc(F.animal)} · ${esc(F.style)}</span>`;
    el.className = `on s${k + 1}`;
  }

  _vsEnd(now = false) {
    const card = $('#vs');
    if (!this.vs) { if (now) card.className = ''; return; }
    this.vs = null;
    document.body.classList.toggle('vs-on', false);
    if (this.fight && this.screen === 'fight' && !this.fight.session) { this.fight.paused = false; this.kb.clear(); this.kb2.clear(); }
    if (now) { card.className = ''; return; }
    card.className = 'out';
    setTimeout(() => { if (!this.vs) card.className = ''; }, 200);
  }

  /* ── practice: a dummy (stand / block all / sidestep everything / CPU),
     STUFFING and meter topped up, the move list; R puts them back ─────── */
  startPractice({ p1, p2 }) {
    if (this.table) { this.table.dispose(); this.table = null; }
    if (this.fight) { this.fight.dispose(); this.fight = null; }
    this.kb.setMap(SOLO); this.kb2.enabled = false;
    const cpu = new CPU(1, 'normal', 5);
    const dummy = (st) => {
      const f = st.f[1], o = st.f[0];
      if (this.dummyMode === 'cpu') return cpu.input(st);
      if (this.dummyMode === 'block') return BLOCK | (o.act === 'attack' && FIGHTERS[o.id].moves[o.mv]?.low ? CROUCH : 0);
      if (this.dummyMode === 'sidestep') return o.act === 'attack' && o.t === 2 ? (st.tick & 1 ? UP : DOWN) : 0;
      if (this.dummyMode === 'drill') return f.act === 'idle' && o.act === 'attack' && FIGHTERS[o.id].moves[o.mv]?.lite ? BLOCK : 0;
      return 0;
    };
    // the frame readout: when one of P1's moves touches the dummy, the tick
    // each of them is free again — the difference is the advantage
    const fr = { on: null };
    const free = (f) => ['idle', 'walkF', 'walkB', 'crouch', 'guard', 'circle'].includes(f.act) && !f.air;
    const practice = {
      after: (st) => {
        const [a, d] = st.f;
        for (const e of st.ev) {
          if ((e.k === 'hit' || e.k === 'block') && e.p === 0 && a.act === 'attack') {
            const fd = frameData(a.id, a.mv);
            fr.on = { mv: a.mv, k: e.k, fd, af: null, df: null, t: st.tick };
          }
          if (e.k === 'ringout' && e.p === 1 && this.dummyMode === 'drill') { this.drillN = (this.drillN || 0) + 1; const el = $('#pr-ro'); if (el) el.textContent = this.drillN; }
        }
        if (fr.on) {
          if (fr.on.af === null && free(a)) fr.on.af = st.tick;
          if (fr.on.df === null && free(d)) fr.on.df = st.tick;
          if (fr.on.af !== null && fr.on.df !== null) {
            const adv = fr.on.df - fr.on.af, o = fr.on;
            const nm = { light: 'Light', heavy: 'Heavy', sweep: 'Spin', lowLight: 'Low light', signature: FIGHTERS[a.id].signatureName, special: FIGHTERS[a.id].specialName }[o.mv] || o.mv;
            this._frameLine = `<b>${esc(nm)}</b> · ${o.fd ? `startup ${o.fd.start}f · ${o.fd.tag}` : ''} · on ${o.k}: <b class="${adv >= 0 ? 'plus' : 'minus'}">${adv > 0 ? '+' : ''}${adv}</b>`;
            const el = $('#pr-frames'); if (el) el.innerHTML = this._frameLine;
            fr.on = null;
          } else if (st.tick - fr.on.t > 240) fr.on = null;
        }
        // a K.O. or a ring-out in practice: a moment to watch it, then back on the marks
        if (st.f.some((f) => f.act === 'ringout' || f.act === 'ko')) { fr.down = (fr.down || 0) + 1; if (fr.down > 100) { fr.down = 0; this.later(0, () => this._practiceReset()); } } else fr.down = 0;
        for (const f of st.f) {
          if (st.tick % 120 === 0 && f.act !== 'attack') f.meter = MAX_METER;
          if (f.hp < FIGHTERS[f.id].health * 0.3 && f.act === 'idle') f.hp = FIGHTERS[f.id].health;
        }
        if (st.phase !== 'fight') { st.phase = 'fight'; st.pt = 0; }
        st.timer = ROUND_TICKS;
      },
    };
    const f = (this.fight = new Fight(this.arena, { p1, p2, seed: 3, cpu: [null, null], keyboard: this.kb, practice, dummy, alt: this.alt }));
    f.onEvent = (e) => this._event(e);
    f.onTick = (st) => this._hud(st);
    f.onSfx = (e, t, n) => this._sfx(e, t, n);
    f.onSwing = (st) => this._swing(st);
    $('#pn1').textContent = f.name(0); $('#pn2').textContent = f.name(1);
    $('#n1').textContent = 'Practice'; $('#n2').textContent = 'Dummy';
    this.last = null;
    this._legend();
    this._hudCache = null;
    this.go('fight');
    this._paintPractice();
  }

  _practiceReset() {
    if (!this.fight) return;
    const st = this.fight.st;
    // (the ring-out drill: the dummy near the edge, P1 in front of him)
    const dr = this.dummyMode === 'drill';
    st.f.forEach((f, k) => { f.x = dr ? (k ? 0 : 2000) : k ? 2300 : -2300; f.z = dr ? (k ? -7150 : -7150) : 0; f.y = 0; f.vx = f.vz = f.vy = f.px = f.pz = 0; f.act = 'idle'; f.t = 0; f.mv = ''; f.air = 0; f.ro = 0; f.out = 0; f.tt = 0; f.bn = 0; f.stun = 0; f.hp = FIGHTERS[f.id].health; f.meter = MAX_METER; if (dr) { f.x = 0; f.z = k ? -7150 : -5150; f.fx = 0; f.fz = k ? 1024 : -1024; } else { f.fx = k ? -1024 : 1024; f.fz = 0; } });
    st.phase = 'fight'; st.ko = ''; st.kt = 0; st.kn = 0; st.ks = 100;
    st.proj = [];
    this.fight.prev = st.f.map((f) => ({ x: f.x, y: f.y, z: f.z }));
  }

  _paintPractice() {
    const f = this.fight;
    if (!f?.practice) return;
    const id = f.st.f[0].id;
    const dm = [['1', 'stand', 'Stand'], ['2', 'block', 'Block all'], ['3', 'sidestep', 'Sidestep'], ['4', 'cpu', 'CPU'], ['5', 'drill', 'Ring-out drill']];
    const F = FIGHTERS[id];
    const name = (mv, l) => l || (mv === 'signature' ? F.signatureName : mv === 'special' ? F.specialName : `${F.throwName} / ${F.throwBackName}`);
    const sg = (v) => (v === null ? '—' : v > 0 ? `+${v}` : `${v}`);
    const rows = MOVE_ROWS.map(([k, mv, l]) => { const d = frameData(id, mv); return `<tr><td><b>${esc(k)}</b></td><td>${esc(name(mv, l))}</td><td><i class="tg ${d.tag}">${d.tag}</i></td><td>${d.start}</td><td>${sg(d.blk)}</td></tr>`; }).join('');
    const drill = this.dummyMode === 'drill' ? `<div class="drill">Ring-out drill: put the dummy on the lip (a heavy pushes him onto it — LEDGE!), then a second heavy sends him off. Ring-outs: <b id="pr-ro">${this.drillN || 0}</b></div>` : '';
    $('#practice-panel').innerHTML = `<h5>Dummy</h5><div class="dm">${dm.map(([k, m, l]) => `<b class="${this.dummyMode === m ? 'on' : ''}">${k} ${l}</b>`).join('')}</div>${drill}
      <h5 style="margin-top:10px">${esc(F.name)} — moves</h5>
      <table class="fd"><tr><th>key</th><th>move</th><th>travels</th><th>start</th><th>block</th></tr>${rows}</table>
      <div class="ml" style="margin-top:4px"><b>W / S</b> sidestep (beats linear) · hold: circle · <b>Q</b> hop · <b>→→</b> dash</div>
      <h5 style="margin-top:10px">Frames</h5><div id="pr-frames" class="frames">${this._frameLine || 'Hit or block the dummy: the frame advantage shows here.'}</div>
      <div style="margin-top:8px;color:var(--dim)">R reset · Esc pause · meter refills</div>`;
  }

  pause(on) {
    if (!this.fight || this.fight.session) return;
    this.fight.paused = on;
    this.kb.clear(); this.kb2.clear();
    this.go(on ? 'pause' : 'fight');
  }
  _pauseAct(a) {
    if (a === 'resume') this.pause(false);
    if (a === 'select') { this.fight.paused = false; this.go('select'); }
    if (a === 'title') { this.go('title'); }
    if (a === 'mute') this.toggleMute();
  }
  _winAct(a) {
    $('#bubbles').textContent = '';
    if (this.net.on) { this.net.winAct(a); return; }
    if (a === 'rematch' && this.last) this.startFight({ ...this.last, vs: true });
    else this.go('select');
  }

  _hud(st) {
    const f0 = this.fight;
    if (f0 && !f0.practice) {
      const low = st.f.some((f) => f.hp > 0 && f.hp / FIGHTERS[f.id].health < 0.25);
      this.audio.setIntense((st.phase === 'fight' || st.phase === 'ko') && (st.timer <= 15 * 60 || low));
    }
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
      $$(`#pips${k + 1} b`).forEach((p, i) => p.classList.toggle('on', st.wins[k] > i));
    }
    const sec = f0?.practice ? '∞' : Math.ceil(st.timer / 60);
    if (C.t !== sec) { C.t = sec; $('#timer').textContent = sec; $('#timer').classList.toggle('low', sec <= 10); }
  }

  banner(text, cls = '', ms = 1200, sub = '') {
    const B = $('#banner');
    B.innerHTML = `<span class="b pop ${cls}">${text}</span>${sub ? `<span class="sub">${sub}</span>` : ''}`;
    const mine = (this._bn = (this._bn || 0) + 1);
    if (ms) this.later(ms / 1000, () => { if (this._bn === mine) B.textContent = ''; });
  }

  combo(k, n, amp) {
    const c = $(`#combo${k + 1}`);
    c.querySelector('b').textContent = n;
    c.querySelector('span').textContent = n >= 3 ? 'HIT COMBO' : 'HIT';
    c.classList.remove('on', 'amp');
    void c.offsetWidth;
    c.classList.add('on');
    if (amp) c.classList.add('amp');
    const mine = (this._cn = this._cn || [0, 0])[k] = this._cn[k] + 1;
    this.later(amp ? 1.6 : 1.1, () => { if (this._cn[k] === mine) c.classList.remove('on', 'amp'); });
  }

  /* arena (sim units) → screen */
  toScreen(x, y, z) {
    const v = new THREE.Vector3(x / U, y / U, z / U);
    this.arena.world.localToWorld(v);
    v.project(this.arena.camera);
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  }

  pop(text, x, y, z, cls = '') {
    const [sx, sy] = this.toScreen(x, y, z);
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    el.style.left = `${Math.max(60, Math.min(innerWidth - 60, sx))}px`;
    el.style.top = `${Math.max(150, sy - 110)}px`;
    $('#pops').appendChild(el);
    (this.pops = this.pops || []).push({ el, t: 0 });
  }
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

  _flash(st) {
    const el = $('#flash');
    let a = 0;
    if (st && st.phase === 'ko' && st.kt < st.kn && st.ko !== 'ringout') {
      const n = st.kf ? 12 : 9;
      a = st.kt < n ? 0.92 * (1 - st.kt / n) : 0;
    }
    if (this._fa !== a) { this._fa = a; el.style.opacity = a; }
  }

  headScreen(k, lift = 0.6) {
    const p = this.fight.plush[k];
    const v = new THREE.Vector3(...p.hc).applyMatrix4(p.group.matrixWorld);
    v.y += lift + (p.id === 'k8e' ? 0.4 : 0.9);
    v.project(this.arena.camera);
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  }

  _event(e) {
    const f = this.fight, st = f.st;
    if (e.k === 'banner' && e.text === 'round' && !this.vs) this.audio.sting('round');
    if (e.k === 'banner' && e.text === 'fight') this.audio.music('fight');
    if (e.k === 'ko') this.audio.duck(0.22, 2.8);
    if (e.k === 'round') this.audio.setIntense(false);
    if (e.k === 'end') this.audio.sting(e.w === 0 || (e.w === 1 && this.mode === 'versus') ? 'win' : 'lose');
    if (e.k === 'banner' && !f.practice) {
      if (e.text === 'round') this.banner(st.wins[0] === 1 && st.wins[1] === 1 ? 'Final Round' : `Round ${e.n}`, '', 900);
      else this.banner('Fight!', '', 800);
    }
    if (e.k === 'round') for (const p of f.plush) p.reset?.();
    if (e.k === 'hit') {
      if (e.n >= 2) this.combo(e.p, e.n, e.amp);
      if (e.ctr) this.pop('COUNTER', e.x, e.y, e.z, e.p ? 'p2' : 'p1');
      if (e.edge) this.pop('EDGE!', e.x, e.y, e.z, e.p ? 'p2' : 'p1');
    }
    if (e.k === 'tech') this.pop('TECH', e.x, e.y, e.z, 'tech');
    if (e.k === 'teeter') { const f = st.f[e.p]; this.pop('LEDGE!', f.x, 2600, f.z, e.p ? 'p2' : 'p1'); }
    if (e.k === 'ringout') this.banner('Ring Out!', 'ringout', 2400);
    if (e.k === 'koapex' && st.fluff && st.f[e.p].act === 'ko' && !this._fluffed) {
      this._fluffed = true;
      const p = f.plush[e.p];
      this.arena.burst(p); this.arena.shake(0.9);
      p.deflateTarget = 1;
      this.banner('Fluffatality', 'fluffatality', 0);
    }
    if (e.k === 'ko') this._fluffed = false;
    if (e.k === 'kobanner') {
      const dbl = e.w === 2;
      if (e.out) this.banner(dbl ? 'Double Ring Out' : 'Ring Out', 'ringout', 1500, 'Off the bed!');
      else if (e.fluff) this.later(0.6, () => this.banner('Fluffatality', 'fluffatality', 1800, 'K.O.'));
      else this.banner(dbl ? 'Double K.O.' : 'K.O.', 'ko', 1500);
      if (e.perfect) this.later(1.55, () => this.banner('Fluffless Victory!', 'fluffless', 1700));
    }
    if (e.k === 'time') this.banner(e.w === 2 ? 'Draw' : 'Time', '', 1500);
    if (e.k === 'impatient') {
      const [x, y] = this.headScreen(e.p);
      const b = say($('#bubbles'), FIGHTERS[st.f[e.p].id].impatient, x, y, { size: Math.max(20, Math.min(26, innerWidth / 50)), tail: e.p === 0 ? 'down-left' : 'down-right', maxWidth: 240 });
      this.later(1.8, () => dismiss(b));
    }
    if (e.k === 'end') { this._lossMoment(e.w); this.later(1.3, () => this._winner()); }
  }

  _lossMoment(w) {
    const f = this.fight;
    if (!f || (w !== 0 && w !== 1)) return;
    const p = f.plush[1 - w];
    if (!(p.deflateTarget > 0.3)) p.deflateTarget = 0.3;
    const d = $('#drain');
    d.className = w === 0 ? 'r' : 'l';
    void d.offsetWidth;
    d.classList.add('on');
  }
  _drainOff(now = false) {
    const d = $('#drain');
    if (!d.classList.contains('on') || now) { d.className = ''; return; }
    d.classList.add('off');
  }

  _winner() {
    const f = this.fight;
    if (!f || f.st.phase !== 'end') return;
    const st = f.st, w = st.winner;
    $('#banner').textContent = '';
    this._drainOff();
    this.go('win');
    $('#win-record').textContent = '';
    if (w === 2) { $('#win-eyebrow').textContent = 'No winner'; $('#win-name').textContent = 'Draw'; return; }
    this.net.winScreen();
    $('#win-eyebrow').textContent = `Pillow Fight 2 · ${f.session ? `Player ${w + 1} wins${w === this.net.local ? ' — that’s you' : ''}` : f.cpu[w] ? (f.cpu[0] && f.cpu[1] ? `CPU ${w + 1} wins` : 'The computer wins') : `Player ${w + 1} wins`}`;
    $('#win-name').innerHTML = `${esc(f.name(w))} wins`;
    const id = st.f[w].id, line = st.egg ? FIGHTERS[id].catchphrase.egg : FIGHTERS[id].catchphrase.main;
    // the camera comes round to the winner, close, from the front
    const W = st.f[w];
    f.winFocus = { x: W.x / U, y: (W.y / U) + 1.8, z: W.z / U, d: 8, h: 0.5, az: Math.atan2(W.fx, W.fz) - 0.35 };
    this.later(0.9, () => {
      if (this.screen !== 'win') return;
      const [hx, hy] = this.headScreen(w, -0.3);
      const size = Math.max(22, Math.min(36, innerWidth / 36));
      const b = say($('#bubbles'), line, hx + 70, hy + 40, { size, tail: 'left', maxWidth: Math.min(300, innerWidth * 0.55) });
      const sv = b.querySelector('svg'), bw = +sv.getAttribute('width');
      const left = parseFloat(b.style.left);
      if (left + bw > innerWidth - 12) b.style.left = `${innerWidth - 12 - bw}px`;
    });
  }

  /* ── the loop ─────────────────────────────────────────────────────── */
  frame(dt, draw = true) {
    this.audio.pump();
    this.net.frame(dt);
    if (this.vs && (this.vs.t += dt) >= this.vs.dur) this._vsEnd();
    this._timers(this.fight?.paused ? 0 : dt);
    if (this.fight && this.screen !== 'select' && this.screen !== 'diff') {
      this.fight.frame(dt);
      this._flash(this.fight.st);
      this._pops(this.fight.paused ? 0 : dt);
    } else if (this.table) this.table.frame(dt);
    else this._idleCam(dt);
    if (draw) this.renderer.render(this.arena.scene, this.arena.camera);
  }

  /* the title and the menus: the empty ring, the camera drifting round it */
  _idleCam(dt) {
    this.t = (this.t || 0) + dt;
    const A = this.arena;
    A.cam.ready = false;
    A.frame([-1, 0, 0], [1, 0, 0], dt, innerWidth / innerHeight, { x: 0, y: -0.5, z: 0, d: 27, h: 9, az: 0.6 + this.t * 0.07 });
    A.paintShadows([]);
    A.update(dt);
  }

  step(seconds, draw = true) {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) this.frame(1 / 60, false);
    if (draw) this.renderer.render(this.arena.scene, this.arena.camera);
  }
}

async function start() {
  const touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
  document.body.classList.toggle('touch', touch);
  const { renderer, canvas } = await makeRenderer($('#stage'));
  if (document.fonts?.load) { try { await Promise.all([document.fonts.load('26px "Bolster Hand"'), document.fonts.load('26px "Bolster Display"'), document.fonts.load('700 26px "Bolster Condensed"')]); } catch { /* fallbacks */ } }
  const app = new App(renderer, canvas);
  window.__pf2 = app;
  app.hash = hash;
  app.createMatch = createMatch;
  app.cpuFor = (k, level, seed) => new CPU(k, level, seed);
  app.ROSTER = ROSTER;
  app.renderAudio = (o) => renderOffline({ clips: CLIPS, ...o });
  if (!params.has('noportraits')) { try { app.portraits = await portraits(renderer, app.arena, ROSTER); } catch (err) { console.warn('portraits', err); } }
  for (const c of $$('#cards .card')) app._cardPortrait(c);
  let last = performance.now();
  app.hold = params.has('hold');
  renderer.setAnimationLoop(() => {
    if (!canvas.clientWidth) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!app.hold) app.frame(dt);
    app.fps = app.fps ? app.fps * 0.95 + (1 / Math.max(1e-3, (now - (app._lf || now)) / 1000 || 60)) * 0.05 : 60;
    app._lf = now;
  });
  const p1 = fighterId(params.get('p1')), p2 = fighterId(params.get('p2'));
  if (p1 && p2) {
    if (params.get('versus') === '1') app.mode = 'versus';
    app.alt = [params.get('alt1') === '1', params.get('alt2') === '1'];
    app.startFight({ p1, p2, level: params.get('cpu') || 'normal', p1cpu: params.get('p1cpu'), seed: (params.get('seed') | 0) || null });
  } else if (params.get('practice') !== null) app.startPractice({ p1: fighterId(params.get('practice')) || ROSTER[0], p2: fighterId(params.get('dummy')) || ROSTER[1] });
  else if (params.get('room')) app.net.joinRoom(params.get('room'));
  else if (params.get('screen') === 'select') { app.mode = params.get('mode') || 'cpu'; app.go('select'); }
  else if (app.screen === 'title') app.go('title');
  document.body.classList.add('is-live');
}

start().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 30px 30px;font:12px ui-monospace,monospace;color:#ffd0db">Pillow Fight 2 couldn't start: ${String(err.message || err)}</p>`);
});
