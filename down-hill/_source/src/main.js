/* Fluffed and Furious — a Pillow Fight kart race. The app: the renderer and the
   world, the screens (title → select → countdown → race → results; the
   Pillow Cup's standings and its overall podium), the players (1 to 4 on
   one screen: the keyboard's two halves, gamepads and phone pads mix
   freely), the chase cameras (split screen: one camera and one HUD per
   player), and the glue that turns the race's events into feathers,
   sparks, grunts, bubbles, buzzes and music.

   Deep links: ?p1=kevalanche&alt1=1&cpu=hard&track=landing (straight into
   a race), p2=…&alt2=… (… p4: split screen), cup=1 (the Pillow Cup),
   p1cpu=LEVEL (the player's kart drives itself), seed=N, hold (no
   free-running loop; tools step window.__dh), screen=select, webgl (force
   WebGL 2), laps=N, pads=off|1, net=local (the pads' test loopback).
   ?pad=CODE is the phone pad itself (src/pad/pad.js).                     */

import * as THREE from 'three/webgpu';
import { makeRenderer } from './render/renderer.js';
import { installLook, setGrade } from './render/look.js';
import { installTypeArt, typeImg, placeImg, countImg, resultsButtons, paintMusic, toastArt } from './ui/typeart.js';
import { TIER_AT } from './race/sim.js';
import { makeWorld } from './render/worlds.js';
import { RacerView } from './render/racer.js';
import { Fx, TIER_COLORS } from './render/fx.js';
import { Race, DT, SPIN_RECOVER, spinRecoveryYaw, ITEMS, ITEM_NAMES, ITEM_TIPS, COUNT_TICKS } from './race/sim.js';
import { CPU, LEVEL_NAMES, cupStrength } from './race/cpu.js';
import { buildTrack, TRACKS, CUP, rightX, rightZ } from './race/track.js';
import { RACERS, ORDER, racerId, WEIGHTS, WALLOPS } from './race/roster.js';
import { Controls, MENU_KEYS, gamepads } from './input/controls.js';
import { AudioEngine } from './audio/engine.js';
import { CLIPS } from './audio/clips.js';
import { Hum } from './audio/hum.js';
import { say, dismiss, place } from './ui/bubble.js';
import { tauntLine, koLine, lastLine } from './ui/lines.js';
import { ICONS, CLOCK_SCARE } from './ui/icons.js';
import { unpackRows } from './render/readback.js';
import { PadHost } from './pad/host.js';
import { runPad } from './pad/pad.js';
import { skinId } from './pad/skins.js';
import { START, LEFT, RIGHT, UP, DOWN, GAS, ITEM, SUPER, BRAKE } from './pad/wire.js';

const Q = new URLSearchParams(location.search);
const raceMeshStyle = typeof RACE_REMESH !== 'undefined' && RACE_REMESH ? 'smooth' : null;
const $ = (id) => document.getElementById(id);
const ORD = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = (x) => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
const angLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* the 14 looks: the 7 OG on top, their ALT twins below */
export const SLOTS = [...ORDER.map((id) => ({ id, alt: false })), ...ORDER.map((id) => ({ id, alt: true }))];
const COLORS = {
  kevalanche: ['#f3f1ec', '#c8202a'], sumaura: ['#c8161d', '#232227'], k8e: ['#f2c14e', '#8a4b22'], sebas: ['#14915a', '#e9c349'],
  rubberta: ['#e8735e', '#a9b2ba'], johnny: ['#2f7d4a', '#d7f230'], zach: ['#2b2933', '#e9c349'],
};
const ALT_COLORS = {
  kevalanche: ['#14254a', '#ef6a1e'], sumaura: ['#151317', '#d8b25a'], k8e: ['#2a2630', '#ff2bd6'], sebas: ['#151318', '#d4102c'],
  rubberta: ['#16131f', '#7af6ff'], johnny: ['#1a181d', '#ff2230'], zach: ['#d9d4c4', '#8ff0c0'],
};
export const PCOL = ['#ff3b6b', '#3ff0c8', '#ffc93a', '#9b5cff'];
export const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];
const MAXP = 4;
/* the track menu: each track, then the cup */
const CHOICES = [...Object.keys(TRACKS).map((id) => ({ id, name: TRACKS[id].name })), { id: 'cup', name: 'The Pillow Cup' }];
const COURSE_NOTES = {
  landing: 'Quilt grid · book drop · banister jump',
  laundry: 'Clay-court flyover · switchbacks · championship jump',
  hockey: 'Rink crossover · icy bends · penalty-box jump',
  park: 'Canopy climb · open flume · buoy slalom',
  dojo: 'Lantern courtyard · rooftop crossover · moon gate jump',
  cup: 'Race all five courses, starting on The Landing',
};
const lookKey = (id, alt) => `${id}:${alt ? 1 : 0}`;
/* the ghost's samples ↔ a localStorage string */
const encode16 = (a) => { const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192)); return btoa(s); };
const decode16 = (s) => { const b = Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); return new Int16Array(b.buffer, 0, b.length >> 1); };

/* split screen: the views' rectangles (fractions of the window) */
export function layout(n) {
  if (n <= 1) return [[0, 0, 1, 1]];
  if (n === 2) return [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]];
  return [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]];
}

const PROP_CUES = {
  pillow: ['Pillow boost', 'Wallop for a speed burst', '#ff71be', 3],
  ball: ['Tennis ball', 'Wallop to spin a rival', '#f5ff58', 5.2],
  puck: ['Hockey puck', 'Wallop to slide it at rivals', '#6bf6ff', 1.8],
  beach: ['Beach ball', 'Wallop to knock rivals sideways', '#ffe168', 5.7],
  gong: ['Shortcut gong', 'Wallop to open the gate', '#ffcb5b', 5.9],
};
const cueProjection = new THREE.Vector3();

const VIEW_HTML = `<div class="vdark"></div><div class="fabric"></div>
<div class="speed"></div>
<div class="islot"><div class="item"></div><div class="item-name"></div><div class="taunt-ic"><b>Taunt</b><kbd class="tk">T</kbd></div></div>
<div class="tip"></div><div class="tprompt">TAUNT! <kbd class="tk">T</kbd></div><div class="warn">LOCKED ON — SPRING CUSHION!</div><div class="caption"></div>
<div class="lap"><div class="l">Lap</div><div class="n">1/3</div><div class="tm">0:00.00</div></div>
<canvas class="minimap" width="400" height="400"></canvas>
<div class="place">8<sup>th</sup></div>
<div class="drift"><span>Drift</span><i></i><i></i><i></i></div>
<div class="kpop"></div><div class="final">${typeImg('final-lap', 'FINAL LAP!')}</div><div class="start-lights" aria-hidden="true"><i></i><i></i><i></i></div><div class="count"></div><div class="toast"></div>
<div class="wallop-hud"></div><div class="prop-cue" hidden><b></b><span></span></div>
<div class="prop-cue gate-cue" hidden><b>Shortcut open</b><span></span></div><div class="wrong-way" hidden>${typeImg('wrong-way', 'WRONG WAY!')}</div><div class="lookback">Look back</div><div class="ptag"></div><div class="scare"></div><div class="wait"></div>`;

class App {
  constructor(renderer, canvas) {
    this.renderer = renderer; this.canvas = canvas;
    installLook(renderer);
    installTypeArt();
    this.hold = Q.has('hold');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.3, 1400);
    this.choice = Math.max(0, CHOICES.findIndex((c) => c.id === (Q.get('cup') ? 'cup' : Q.get('track') || 'landing')));
    this.setTrack(TRACKS[Q.get('track')] ? Q.get('track') : 'landing');
    this.views = new Map();
    this.audio = new AudioEngine({ storage: globalThis.localStorage, clips: CLIPS });
    this.hum = new Hum(this.audio);
    this.screen = 'title';
    this.t = 0;
    this.level = LEVEL_NAMES.includes(Q.get('cpu')) ? Q.get('cpu') : 'normal';
    this.seenHit = new Set();      // items whose first hit this session has been captioned
    this.tipsShown = new Set();    // one-time tips (the first ramp's TAUNT)
    this.seed = +(Q.get('seed') || 0) || ((Date.now() & 0xffff) + 1);
    this.bubbles = [];
    this.cam = { pos: new THREE.Vector3(-30, 40, 120), look: new THREE.Vector3(-18, 20, 0), fov: 64, shake: 0 };
    this.frameMs = [];
    this.renderMs = [];
    this.raceN = 0;
    this.hv = [];          // the race's human views
    this.gpPrev = {};
    // the players: P1 is the keyboard (all of it) and the first gamepad
    this.players = [];
    this.addPlayer({ kb: 'all', gp: 'auto' });
    // the phone pads: off in the test harness (?hold) unless asked for (?pads=1); ?pads=off turns them off
    this.pads = new PadHost(this, Q);
    const localLookdev = typeof LOOKDEV_RACE !== 'undefined' && LOOKDEV_RACE;
    this.padsOn = localLookdev ? ['lan', 'local'].includes(Q.get('net')) && Q.get('pads') !== 'off' : Q.get('pads') === 'off' ? false : this.hold ? Q.has('pads') : true;
    this.pads.onSeat = (k, on) => this.padSeat(k, on);
    this.padN = 0;
    addEventListener('resize', () => this.resize());
    addEventListener('keydown', (e) => this.key(e));
    addEventListener('pointerdown', () => this.audio.unlock());
    this.resize();
    this._buildCards();
    this._bindSetup();
    this._diff();
  }

  /* ── the track (and its world) ── */
  setTrack(id) {
    if (this.world && this.trackId === id) return;
    this.trackId = TRACKS[id] ? id : 'landing';
    this.world?.dispose();
    this.T = buildTrack(TRACKS[this.trackId]);
    this.world = makeWorld(this.scene, this.T);
    // The launch after the banister is on the descending plank.
    this.banisterLip = this.trackId === 'landing'
      ? this.T.launch.findIndex((launch, k) => launch > 0 && this.T.def.points[this.T.sec[k]].tag === 'plank')
      : -1;
    this.world.setStart(new Race({ track: this.trackId, racers: [{ id: 'k8e' }], seed: 1, humans: [] }).startK);
    this.minimap = this._minimapBase();
    if (this.ghost) this.ghost.mesh.visible = false;
  }

  resize() {
    const w = innerWidth, h = innerHeight, n = this.hv.length;
    // split screen draws the room up to four times: a lower pixel ratio per view
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, n > 2 ? 1 : n > 1 ? 1.25 : 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    for (const H of this.hv) { H.camera.aspect = (H.rect[2] * w) / (H.rect[3] * h); H.camera.updateProjectionMatrix(); }
  }

  /* a racer's view (kart + plush), built once and kept */
  view(id, alt) {
    const key = lookKey(id, alt);
    let v = this.views.get(key);
    if (!v) { v = new RacerView(this.scene, id, alt); this.views.set(key, v); }
    v.group.visible = true;
    return v;
  }
  hideViews() { for (const v of this.views.values()) v.group.visible = false; }

  setScreen(s) {
    this.screen = s;
    setGrade(s === 'race' ? this.trackId : 'menu');
    if (s !== 'results' && s !== 'cup') for (const v of this.views.values()) v.cheer = null;
    if (raceMeshStyle) for (const v of this.views.values()) {
      v.setRaceMesh(s === 'race' && this.rviews.includes(v) ? raceMeshStyle : null);
    }
    document.body.dataset.screen = s;
    for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === s || (s === 'race' && el.id === 'hud'));
    document.body.classList.toggle('racing', s === 'race');
    if (s === 'title' || s === 'select') this.audio.music('menu');
    if ((s === 'title' || s === 'select') && this.padsOn) this.pads.start();
    this.pads.paint(true);
  }

  /* ── the players ───────────────────────────────────────────────────── */
  addPlayer({ kb = null, gp = null, phone = -1 } = {}) {
    if (this.players.length >= MAXP) return null;
    const p = { ctl: new Controls(window, { map: kb || 'none', gp }), phone, sel: 0, locked: false };
    p.ctl.claimed = () => this.players.filter((q) => q !== p && typeof q.ctl.gp === 'number').map((q) => q.ctl.gp);
    p.ctl.extra = () => (p.phone >= 0 ? this.pads.state[p.phone].sample() : null);
    // a free look to start on
    const taken = new Set(this.players.map((q) => q.sel));
    p.sel = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].find((i) => !taken.has(i)) ?? 0;
    this.players.push(p);
    this._playersChanged();
    return p;
  }
  removePlayer(p) {
    const j = this.players.indexOf(p);
    if (j <= 0) return;
    p.ctl.dispose();
    this.players.splice(j, 1);
    if (p.ctl.map === 'right') this.players[0].ctl.map = 'all';
    this._playersChanged();
  }
  _playersChanged() {
    if (this.screen === 'select') { this._paintPicks(); this.pads.paint(true); }
  }
  playerOfPhone(k) { return this.players.find((p) => p.phone === k) || null; }
  num(p) { return this.players.indexOf(p); }

  /* ── input outside the race ── */
  key(e) {
    this.audio.unlock();
    const c = e.code;
    if (c === 'KeyM') { this.audio.toggleMute(); return; }
    if (this.screen === 'race') {
      if (c === 'Escape' || c === 'KeyP') this.togglePause();
      else if (this.paused && c === 'KeyR') { this.togglePause(); this.startRace(this.last); }
      else if (this.paused && c === 'KeyQ') { this.togglePause(); this.toSelect(); }
      return;
    }
    if (this.screen === 'setup') {
      if (c === 'Escape') {
        this.toSelect();
        return;
      }
      if (e.target instanceof Element && e.target.closest('button, select')) return;
      const action = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'confirm' }[c];
      if (action) {
        e.preventDefault?.();
        this.menu(this.players[0], action);
      }
      return;
    }
    if (this.screen === 'select') {
      if (c === 'Digit1' || c === 'Digit2' || c === 'Digit3' || c === 'Digit4') { this.level = LEVEL_NAMES[+c.slice(5) - 1]; this._diff(); this.audio.ui('tick'); return; }
      // the keyboard's other half joins (and leaves)
      const kb2 = this.players.find((p) => p.ctl.map === 'right');
      if ((c === 'Slash' || c === 'ShiftRight') && !kb2) { if (this.players.length < MAXP) { this.players[0].ctl.map = 'left'; this.addPlayer({ kb: 'right' }); this.audio.ui('confirm'); } return; }
      if (c === 'Backspace' && kb2 && !kb2.locked) { this.removePlayer(kb2); this.audio.ui('tick'); return; }
    }
    if (c === 'Escape') { this.menu(this.players[0], 'cancel'); return; }
    // which player's half is this key on?
    for (const p of this.players) {
      const M = MENU_KEYS[p.ctl.map];
      if (!M) continue;
      for (const a of ['left', 'right', 'up', 'down', 'confirm']) if (M[a].includes(c)) { e.preventDefault?.(); this.menu(p, a); return; }
    }
  }

  /* a menu action from player p (null: a device nobody owns yet: it may join) */
  menu(p, a) {
    const s = this.screen;
    if (s === 'title') { if (a === 'confirm' || a === 'start') { this.audio.ui('confirm'); this.toSelect(); } return; }
    if (s === 'select') {
      if (!p) return;
      if (p.locked) { if (a === 'cancel') { p.locked = false; this._paintPicks(); this.audio.ui('tick'); } return; }
      const col = p.sel % 7, row = Math.floor(p.sel / 7);
      if (a === 'left') this.pick(p, row * 7 + (col + 6) % 7);
      else if (a === 'right') this.pick(p, row * 7 + (col + 1) % 7);
      else if (a === 'up' || a === 'down') this.pick(p, (1 - row) * 7 + col);
      else if (a === 'confirm' || a === 'start') this.lock(p);
      else if (a === 'cancel') { if (this.num(p) === 0) this.toTitle(); else if (p.phone < 0 && p.ctl.map !== 'right') this.removePlayer(p); }
      return;
    }
    if (s === 'setup') {
      if (a === 'left' || a === 'prev') this.cycleTrack(-1);
      else if (a === 'right' || a === 'next') this.cycleTrack(1);
      else if (a === 'up' || a === 'down') {
        const music = $('race-music');
        music.selectedIndex = (music.selectedIndex + (a === 'up' ? -1 : 1) + music.length) % music.length;
        this._selectMusic();
      } else if (a === 'confirm' || a === 'start') this.go();
      else if (a === 'cancel') this.toSelect();
      return;
    }
    if (s === 'results' || s === 'cup') {
      if (a === 'confirm' || a === 'start') { this.audio.ui('confirm'); this.afterResults(); }
      else if (a === 'cancel') { this.cup = null; this.toSelect(); }
    }
  }

  togglePause() {
    this.paused = !this.paused;
    $('pause').classList.toggle('on', this.paused);
    this.audio.pause(this.paused);
    for (const p of this.players) p.ctl.clear();
  }

  toTitle() {
    this.setScreen('title');
    this.hideViews();
    this.clearRace();
  }

  /* ── select ── */
  _buildCards() {
    const box = $('cards');
    box.innerHTML = '';
    SLOTS.forEach((S, i) => {
      const R = RACERS[S.id], [c1, c2] = (S.alt ? ALT_COLORS : COLORS)[S.id];
      const d = document.createElement('div');
      d.className = 'card'; d.dataset.slot = i;
      d.style.setProperty('--c1', c1); d.style.setProperty('--c2', c2);
      d.innerHTML = `<div class="sw"></div>${S.alt ? '<span class="alt">ALT</span>' : ''}<div class="lab">${R.name}</div><div class="cur"></div>`;
      d.addEventListener('click', () => { const p = this.players[0]; if (p.sel === i) this.lock(p); else this.pick(p, i); });
      box.appendChild(d);
    });
  }
  _diff() {
    const box = $('diff');
    for (const p of box.querySelectorAll('.pill')) p.remove();
    for (const l of LEVEL_NAMES) {
      const b = document.createElement('div');
      b.className = 'pill' + (l === this.level ? ' sel' : ''); b.textContent = l;
      b.addEventListener('click', () => { this.level = l; this._diff(); });
      box.appendChild(b);
    }
  }

  _bindSetup() {
    const media = JSON.parse($('race-media').textContent);
    this.courseArt = media.courses;
    this.recordings = media.recordings;
    this.recording = null;
    const music = $('race-music');
    music.add(new Option('Original game soundtrack', ''));
    this.recordings.forEach(({ artist, title }, i) => music.add(new Option(`${title} · ${artist}`, String(i))));
    music.addEventListener('change', () => this._selectMusic());
    $('music-preview').addEventListener('click', () => {
      this.audio.unlock();
      if (this.musicPreview) this.audio.music('menu');
      else this.audio.music(null, this.recording.url);
      this.musicPreview = !this.musicPreview;
      $('music-preview').textContent = this.musicPreview ? 'Stop preview' : 'Preview';
    });
    $('course-back').addEventListener('click', () => this.cycleTrack(-1));
    $('course-next').addEventListener('click', () => this.cycleTrack(1));
    $('setup-back').addEventListener('click', () => this.toSelect());
    $('setup-start').addEventListener('click', () => this.go());
  }

  _selectMusic() {
    const value = $('race-music').value;
    this.recording = value === '' ? null : this.recordings[Number(value)];
    this.musicPreview = false;
    this.audio.music('menu');
    $('music-preview').hidden = !this.recording;
    $('music-preview').textContent = 'Preview';
    paintMusic();
  }

  _paintSetup() {
    const course = CHOICES[this.choice];
    const image = $('course-art');
    const track = course.id === 'cup' ? CUP[0] : course.id;
    image.src = this.courseArt[track];
    image.alt = `Overhead view of ${TRACKS[track].name}`;
    $('course-name').innerHTML = `${typeImg(`c-${course.id}`, '')}<span class="k-sr">${esc(course.name)}</span>`;
    $('course-note').textContent = COURSE_NOTES[course.id];
    $('setup-start').textContent = course.id === 'cup' ? 'Start cup' : 'Start race';
    if (this.screen === 'setup') this.pads.paint(true);
  }

  cycleTrack(d) {
    this.choice = (this.choice + d + CHOICES.length) % CHOICES.length;
    this.audio.ui('tick');
    this._paintSetup();
  }

  toSetup() {
    this.hideViews();
    this._paintSetup();
    this._selectMusic();
    this.setScreen('setup');
  }

  toSelect() {
    this.clearRace();
    this.cup = null;
    for (const p of this.players) p.locked = false;
    this.setScreen('select');
    this.pick(this.players[0], this.players[0].sel);
    if (!Q.has('noportraits')) this.portraits();
  }

  /* the cards' portraits: each racer in their kart, rendered once from the
     front three-quarter into a small target and read back into the card */
  async portraits() {
    if (this._portraits) return this._portraits;
    this._portraits = (async () => {
      const W = 240, H = 300, r = this.renderer;
      const rt = new THREE.RenderTarget(W, H, { samples: 4 });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      const cam = new THREE.PerspectiveCamera(34, W / H, 0.3, 400);
      const webgl = !r.backend.isWebGPUBackend;
      const [sx, sy, sz] = this.world.info.turn;
      const spot = [sx, sy, sz];
      for (let i = 0; i < SLOTS.length; i++) {
        const S = SLOTS[i];
        const v = this.view(S.id, S.alt);
        const vis = v.group.visible, inRace = this.screen === 'race';
        if (inRace) break;
        const old = v.group.position.clone(), oldR = v.group.rotation.y;
        const still = { lobby: true, fwd: 0, drift: 0, steer: 0, air: 0, spinT: 0, boostT: 0, caseT: 0, wobT: 0 };
        v.update(1 / 60, still, { x: spot[0], y: spot[1], z: spot[2], yaw: 0.55 }, cam.position, cam.quaternion);
        v.group.visible = true;
        const hidden = [];
        for (const o of this.views.values()) if (o !== v && o.group.visible) { o.group.visible = false; hidden.push(o); }
        const tall = S.id === 'k8e' ? 1.3 : 1;
        cam.position.set(spot[0] + 2.0, spot[1] + 3.6 * tall, spot[2] + 5.6 * tall);
        cam.lookAt(spot[0] + 0.1, spot[1] + 2.0 * tall, spot[2]);
        v.update(0, still, { x: spot[0], y: spot[1], z: spot[2], yaw: 0.55 }, cam.position, cam.quaternion);
        r.setRenderTarget(rt); r.render(this.scene, cam); r.setRenderTarget(null);
        for (const o of hidden) o.group.visible = true;
        v.group.position.copy(old); v.group.rotation.y = oldR; v.group.visible = vis && v === this.turn;
        const px = await r.readRenderTargetPixelsAsync(rt, 0, 0, W, H);
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d'), img = g.createImageData(W, H);
        img.data.set(unpackRows(px, W, H, { flip: webgl, stride: webgl ? W * 4 : Math.ceil(W * 4 / 256) * 256 }));
        g.putImageData(img, 0, 0);
        const card = document.querySelector(`.card[data-slot="${i}"]`);
        if (card && !card.querySelector('img')) { const im = new Image(); im.src = c.toDataURL('image/png'); card.insertBefore(im, card.querySelector('.lab')); }
        if (this.turn) this.turn.group.visible = this.screen === 'select';
      }
      rt.dispose();
    })();
    return this._portraits;
  }

  /* player p moves onto slot i (the plate and the turntable follow whoever moved last) */
  pick(p, i, quiet = false) {
    if (typeof p === 'number') { i = p; p = this.players[0]; }
    p.sel = i;
    this.sel = this.players[0].sel;
    this.focus = p;
    const S = SLOTS[i], R = RACERS[S.id], W = WEIGHTS[R.weight];
    $('s-who').textContent = `P${this.num(p) + 1}`;
    $('s-who').style.background = PCOL[this.num(p)];
    $('s-name').textContent = R.name;
    $('s-animal').textContent = `${R.animal} · ${S.alt ? R.altName.split('— ')[1] : 'the original'} · ${R.weight}`;
    $('s-kart').textContent = S.alt ? R.altKart : R.kartName;
    $('s-blurb').textContent = R.blurb;
    const attack = WALLOPS[S.id];
    $('s-wallop').textContent = `Wallop · ${attack.name} · ${attack.range} reach · ${attack.recovery.toFixed(2)}s recovery`;
    const bar = (v) => `<div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div>`;
    $('s-stats').innerHTML = `<span>Speed</span>${bar((W.top - 26.5) / 2.6)}<span>Accel</span>${bar((W.accel - 13) / 4.5)}<span>Handling</span>${bar((W.grip - 0.85) / 0.25)}<span>Weight</span>${bar((W.mass - 0.6) / 0.85)}`;
    if (!quiet) this.audio.ui('tick');
    this.hideViews();
    this.turn = this.view(S.id, S.alt);
    this.turn.showT = 0;
    this.turn.ejT = 0;
    this.turn.hyd = 0;
    this._paintPicks();
  }
  _paintPicks() {
    for (const c of document.querySelectorAll('.card')) {
      const i = +c.dataset.slot, on = this.players.map((p, j) => (p.sel === i ? j : -1)).filter((j) => j >= 0);
      c.classList.toggle('c1', on.length > 0);
      c.style.setProperty('--pc', on.length ? PCOL[on[0]] : 'transparent');
      c.querySelector('.cur').innerHTML = on.map((j) => `<b style="background:${PCOL[j]}">P${j + 1}${this.players[j].locked ? ' ✓' : ''}</b>`).join('');
    }
    const box = $('players');
    if (!box) return;
    const dev = (p) => [p.ctl.map === 'all' ? 'keyboard' : p.ctl.map === 'left' ? 'keys: left half' : p.ctl.map === 'right' ? 'keys: right half' : '', p.ctl.gamepad() ? 'gamepad' : '', p.phone >= 0 ? 'phone' : ''].filter(Boolean).join(' + ') || '—';
    box.innerHTML = this.players.map((p, j) => {
      const S = SLOTS[p.sel];
      return `<div class="pp${p.locked ? ' lk' : ''}" style="--pc:${PCOL[j]}"><b>P${j + 1}</b><span>${esc(RACERS[S.id].name)}${S.alt ? ' <em>ALT</em>' : ''}</span><small>${p.locked ? 'ready' : dev(p)}</small></div>`;
    }).join('') + (this.players.length < MAXP ? `<div class="pp join"><small>${this.players.some((p) => p.ctl.map === 'right') ? '' : '<kbd>/</kbd> keyboard P2 · '}<kbd>A</kbd> on a gamepad · or scan the phone QR</small></div>` : '');
  }
  lock(p) {
    const taken = this.players.some((q) => q !== p && q.locked && q.sel === p.sel);
    if (taken) { this.audio.ui('tick'); this.flash(`${RACERS[SLOTS[p.sel].id].name}${SLOTS[p.sel].alt ? ' (ALT)' : ''} is taken — try the twin`); return; }
    this.audio.ui('confirm');
    p.locked = true;
    this._paintPicks();
    if (this.players.every((q) => q.locked)) {
      // overhaul: the racer on the turntable hops and spins on lock-in, then on to setup
      if (this.hold) this.toSetup();
      else { if (this.turn) this.turn.cheer = 'win'; this._lockT = 0.75; }
    }
  }
  flash(text) { const el = $('s-flash'); if (!el) return; el.textContent = text; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }

  /* everyone's in: a race, or the cup's first race */
  go(extra = {}) {
    const C = CHOICES[this.choice];
    const picks = this.players.map((p) => ({ id: SLOTS[p.sel].id, alt: SLOTS[p.sel].alt, p }));
    if (C.id === 'cup') { this.cup = { race: 0, tracks: CUP.slice(), pts: new Map(), field: null }; this.startRace({ picks, track: CUP[0], ...extra }); }
    else { this.cup = null; this.startRace({ picks, track: C.id, ...extra }); }
  }

  /* ── the race ── */
  clearRace() {
    if (this.fx) { this.fx.root.removeFromParent(); for (const p of [this.fx.feathers, this.fx.glows, this.fx.balls]) p.mesh.removeFromParent(); this.fx.dispose?.(); }
    this.fx = null; this.race = null;
    for (const b of this.bubbles) dismiss(b.el);
    this.bubbles = [];
    this.hum.stop();
    this._views(0);
    $('roast')?.classList.remove('on');
    document.body.classList.remove('looking', 'photo');
    this.slowmo = null;
  }

  /* the HUD panels and cameras, one per human (n = 0 clears them) */
  _views(n, humans = []) {
    const box = $('hud');
    box.innerHTML = '';
    const rects = layout(n);
    this.hv = humans.map((i, j) => {
      const el = document.createElement('div');
      el.className = `view v${n > 2 ? 4 : n}`;
      el.innerHTML = VIEW_HTML;
      const [x, y, w, h] = rects[j];
      Object.assign(el.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
      el.style.setProperty('--pc', PCOL[j]);
      el.querySelector('.ptag').textContent = n > 1 ? `P${j + 1}` : '';
      el.querySelector('.scare').innerHTML = `${CLOCK_SCARE}<b>BRRRRING!</b>`;
      box.appendChild(el);
      const q = (s) => el.querySelector(s);
      return {
        j, i, rect: rects[j], el, q,
        place: q('.place'), lap: q('.lap .n'), time: q('.lap .tm'), item: q('.item'), itemName: q('.item-name'), drift: q('.drift'), final: q('.final'),
        tip: q('.tip'), tprompt: q('.tprompt'), tauntIc: q('.taunt-ic'), warn: q('.warn'), caption: q('.caption'), speed: q('.speed'), islot: q('.islot'),
        lights: q('.start-lights'), count: q('.count'), toastEl: q('.toast'), kpop: q('.kpop'), wallop: q('.wallop-hud'), propCue: q('.prop-cue'), gateCue: q('.gate-cue'), wrongWay: q('.wrong-way'), fabric: q('.fabric'), scare: q('.scare'), dark: q('.vdark'), mm: q('.minimap'), wait: q('.wait'),
        camera: new THREE.PerspectiveCamera(64, 1, 0.3, 1400),
        cam: { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 64, shake: 0 },
        lastItem: null, lookBack: false, lb: false, darkV: 0, tipUntil: 0, capUntil: 0, hud: {},
      };
    });
    // three players: the fourth quarter is a TV camera on the leader
    if (n === 3) {
      const el = document.createElement('div');
      el.className = 'view v4 tv';
      el.innerHTML = '<div class="ptag">Leader cam</div><div class="count"></div>';
      const [x, y, w, h] = rects[3];
      Object.assign(el.style, { left: `${x * 100}%`, top: `${y * 100}%`, width: `${w * 100}%`, height: `${h * 100}%` });
      box.appendChild(el);
      this.tv = { j: 3, i: -1, rect: rects[3], el, tv: true, count: el.querySelector('.count'), camera: new THREE.PerspectiveCamera(50, 1, 0.3, 1400), cam: { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50, shake: 0 } };
    } else this.tv = null;
    // fewer, cheaper fur shells further out when the room is drawn several times
    RacerView.lodNear = n > 2 ? 14 : n > 1 ? 19 : 26;
    RacerView.farCull = n > 2 ? 170 : n > 1 ? 210 : 260;
    // and thinner fur: fewer shells near and far (re-applied to every kart)
    RacerView.shellsNear = n > 2 ? 7 : n > 1 ? 9 : 12;
    RacerView.shellsFar = n > 2 ? 3 : n > 1 ? 4 : 5;
    for (const v of this.views.values()) { const l = v.lod; v.lod = -1; v.setLod(l === 1 ? 1 : 0); }
    document.body.dataset.views = String(n);
    this.resize();
  }
  allViews() { return this.tv ? [...this.hv, this.tv] : this.hv; }

  /* o: { picks: [{id, alt, p}], track, cpu, seed, laps, p1cpu } (or the old { p1, alt1 }) */
  startRace(o) {
    this.clearRace();
    this.last = o;
    let picks = o.picks;
    if (!picks) picks = [{ id: racerId(o.p1) || 'kevalanche', alt: !!o.alt1, p: this.players[0] }];
    picks = picks.slice(0, MAXP);
    const track = TRACKS[o.track] ? o.track : this.trackId;
    this.setTrack(track);
    const seed = o.seed ?? (this.raceN ? this.seed + this.raceN * 977 : this.seed);
    this.raceN++;
    const level = o.cpu || this.level;
    const p1cpu = o.p1cpu || null;
    let racers;
    if (this.cup?.field) racers = this.cup.field.map((r) => ({ ...r }));
    else {
      // the field: the humans' looks; the CPUs fill it to eight — every other fighter
      // first (OG or ALT, mixed), then the humans' twins, then whatever's left
      let r = seed >>> 0;
      const rnd = () => { r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return r / 4294967296; };
      const used = new Set(picks.map((h) => lookKey(h.id, h.alt)));
      const ids = new Set(picks.map((h) => h.id));
      const cpus = [];
      for (const id of ORDER) if (!ids.has(id)) { const alt = rnd() < 0.4; cpus.push({ id, alt }); used.add(lookKey(id, alt)); }
      for (const h of picks) if (!used.has(lookKey(h.id, !h.alt))) { cpus.push({ id: h.id, alt: !h.alt }); used.add(lookKey(h.id, !h.alt)); }
      for (const S of SLOTS) if (!used.has(lookKey(S.id, S.alt))) { cpus.push({ ...S }); used.add(lookKey(S.id, S.alt)); }
      const field = cpus.slice(0, 8 - picks.length);
      for (let i = field.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [field[i], field[j]] = [field[j], field[i]]; }
      // the humans at the back of the grid, as is tradition
      racers = [...field.map((x) => ({ ...x, cpu: level })), ...picks.map((h) => ({ id: h.id, alt: h.alt, cpu: p1cpu, human: 1 }))];
      if (this.cup) this.cup.field = racers.map((x) => ({ ...x }));
    }
    const humans = racers.map((x, i) => (x.human ? i : -1)).filter((i) => i >= 0);
    this.humanP = humans.map((i, j) => picks[j]?.p || this.players[j] || null);
    this.me = humans[0];
    this.race = new Race({ track, racers, seed, humans: p1cpu ? [] : humans, laps: o.laps || +Q.get('laps') || null });
    // stage 5's difficulty curve: a single race is the level's gentle version;
    // the Pillow Cup ramps up race by race (gentle, medium, full strength)
    this.strength = o.strength ?? (this.cup ? cupStrength(this.cup.race) : 0);
    this.cpus = this.race.karts.map((K) => (K.cpu ? new CPU(this.race, K.i, K.cpu, seed, racers[K.i].human ? 1 : this.strength) : null));
    this.auto = null;
    this.hideViews();
    this.rviews = this.race.karts.map((K) => this.view(K.id, K.alt));
    this.fx = new Fx(this.scene, this.race);
    this.world.setStart(this.race.startK);
    this.world.reset?.(this.race);
    this.prev = this.race.karts.map((K) => ({ x: K.x, y: K.y, z: K.z, yaw: K.yaw, spinT: K.spinT }));
    this.acc = 0;
    this.resultsAt = 0;
    this._views(humans.length, humans);
    for (const H of this.allViews()) {
      const K = this.race.karts[H.tv ? humans[0] : H.i];
      H.cam.pos.set(K.x - Math.sin(K.yaw) * 30, K.y + 14, K.z - Math.cos(K.yaw) * 30);
      H.cam.look.set(K.x, K.y + 2, K.z);
    }
    this.cam = this.hv[0].cam;
    this.ghostStart();
    this.slowmo = null; this.photoDone = false; document.body.classList.remove('photo');
    this.setScreen('race');
    if (this.hv.length === 4 && this.renderer.backend.isWebGPUBackend && (!this.hold || Q.has('warm-effects'))) {
      this.fx.warmPipelines(this.renderer, this.hv[0].camera);
    }
    this.audio.music(null);
    this.audio.setIntense(false);
    for (const p of this.players) p.ctl.clear();
    this.pads.state.forEach((P) => P.clear());
  }

  /* one sim tick: inputs (each human's controls, the CPUs think), step, events */
  tick() {
    const R = this.race;
    this.prev = R.karts.map((K) => ({ x: K.x, y: K.y, z: K.z, yaw: K.yaw, spinT: K.spinT }));
    const inputs = R.karts.map((K, i) => {
      if (this.cpus[i]) return this.cpus[i].think();
      if (R.karts[i].fin) return this._autopilot(i);
      const j = this.hv.findIndex((H) => H.i === i);
      const p = this.humanP[j];
      return p ? p.ctl.sample() : { steer: 0 };
    });
    for (const H of this.hv) if (!this.cpus[H.i]) H.lookBack = !!inputs[H.i]?.back;
    this.lookBack = this.hv[0]?.lookBack;
    R.step(inputs);
    this.ghostTick?.();
    for (const e of R.events) this.onEvent(e);
    R.events.length = 0;
  }
  /* the key (or button) for an action, as this view's player would press it */
  keyFor(H, act) {
    const p = this.humanP?.[H.j];
    if (act === 'wallop') {
      if (p?.phone >= 0) return 'Wallop';
      if (p?.ctl.map === 'none' && p.ctl.gamepad?.()) return 'L3';
      return p?.ctl.map === 'right' ? 'O' : 'X';
    }
    if (p && p.phone >= 0 && p.ctl.map === 'none') return act === 'item' ? 'SUPER' : 'TAUNT';
    if (p && p.ctl.map === 'none' && p.ctl.gamepad?.()) return act === 'item' ? 'LB' : 'Y';
    const m = p ? p.ctl.map : 'all';
    if (act === 'item') return m === 'right' ? 'Enter' : 'Space';
    return m === 'right' ? 'L' : 'T';
  }
  /* a tip under the item slot (an item's name and what it does; the first ramp's TAUNT) */
  tip(H, html, secs = 2, cls = '') {
    if (!H) return;
    const el = H.tip;
    el.innerHTML = html; el.className = 'tip on ' + cls;
    H.hud.tip = true;
    H.tipUntil = this.t + secs;
  }
  /* a small caption naming an item the first time it hits someone this session */
  caption(kind, i) {
    const it = ['plane', 'sugar', 'missile', 'slick', 'alarm', 'wash', 'spring', 'cuffs', 'case'].includes(kind) ? kind : null;
    if (!it || this.seenHit.has(it)) return;
    this.seenHit.add(it);
    const who = RACERS[this.race.karts[i].id].name;
    for (const H of this.hv) { H.caption.innerHTML = `<i>${ICONS[it] || ''}</i><span><b>${esc(ITEM_NAMES[it])}</b> · ${esc(ITEM_TIPS[it])}<small>${esc(who)} got hit</small></span>`; H.caption.className = 'caption on'; H.hud.cap = true; H.capUntil = this.t + 3; }
  }

  _autopilot(i) { if (!this.auto) this.auto = {}; if (!this.auto[i]) this.auto[i] = new CPU(this.race, i, 'normal', 3); return this.auto[i].think(); }

  hvOf(i) { return this.hv.find((H) => H.i === i) || null; }

  /* ── race events → feathers, sparks, sound, bubbles, buzzes ── */
  onEvent(e) {
    const R = this.race, A = this.audio;
    const K = e.i != null && e.i >= 0 ? R.karts[e.i] : null, V = K ? this.rviews[e.i] : null;
    const near = K ? this._dist(K) < 60 : true;
    const H = K ? this.hvOf(e.i) : null, mine = !!H;
    const g = (x) => (mine ? 1 : near ? 0.6 * x : 0);
    switch (e.k) {
      case 'count':
        for (const v of this.allViews()) {
          v.count.innerHTML = countImg(e.n);
          v.count.className = 'count';
          v.lights.dataset.phase = String(e.n);
        }
        A.play('dh-beep');
        break;
      case 'start-cue':
        for (const v of this.allViews()) v.lights.dataset.phase = 'ready';
        A.play('dh-beep', { rate: 1.42, gain: 0.9 });
        break;
      case 'go': {
        const views = this.allViews();
        for (const v of views) {
          v.lights.dataset.phase = 'go';
          v.count.innerHTML = countImg('GO!');
          v.count.dataset.ink = 'GO!';
          v.count.className = 'count go';
        }
        A.play('dh-go');
        for (const h of this.hv) { const k = R.karts[h.i]; this.fx.burst(k.x, k.y + 4, k.z, ['#ffc93a', '#3ff0c8', '#ff3b6b', '#9b5cff', '#2e9bff', '#ffffff'], 40, 11); }
        A.music(this.world.music || 'race', this.recording?.url);
        setTimeout(() => {
          for (const v of views) {
            delete v.lights.dataset.phase;
            if (v.count.dataset.ink === 'GO!') {
              v.count.textContent = '';
              delete v.count.dataset.ink;
            }
          }
        }, 900);
        break;
      }
      case 'wallop':
        V.wallop(e.windup);
        if (near) A.play('dh-whoosh', { gain: g(0.6), rate: e.pose === 'sweep' ? 1.2 : 0.98 });
        break;
      case 'wallop-prop': {
        const P = R.wallopProp;
        const colors = {
          pillow: ['#ffe1f3', '#ffffff', '#ff6ea3'], ball: ['#efff72', '#ffffd8'],
          puck: ['#dbf9ff', '#70dfff'], beach: ['#4cecff', '#fff293', '#ff6588'],
          gong: ['#ffc252', '#fff0a2'],
        }[P.type];
        this.fx.burst(P.x, P.y + 1.5, P.z, colors, P.type === 'pillow' ? 24 : 12, 7);
        if (near) A.play(`dh-wallop-${P.type}`, { gain: mine ? 1 : 0.65 });
        const labels = { pillow: 'PILLOW POP BOOST!', ball: 'BALL IN PLAY!', puck: 'PUCK IN PLAY!',
          beach: 'BEACH BALL BOUNCE!', gong: 'SHORTCUT OPEN!' };
        if (mine || P.type === 'gong') for (const view of P.type === 'gong' ? this.hv : [H]) this.toast(view, labels[P.type], '#efff65');
        break;
      }
      case 'beach-hop':
        if (this._dist(e) < 55) {
          A.play('dh-beach-hop', { gain: Math.max(.24, .66 - e.hop * .08), rate: 1 + e.hop * .06 });
          this.fx.burst(e.x, e.y + .45, e.z, ['#d4fcff', '#54d1ff'], 5, 4);
        }
        break;
      case 'beach-bump':
        V.hit();
        if (near) A.play('dh-bonk', { gain: g(0.8), rate: 1.3 });
        if (mine) this.toast(H, 'BOUNCED OFF LINE!', '#55f9ff');
        break;
      case 'wallop-hit': {
        V.hit();
        this.fx.burst(K.x, K.y + 2, K.z, ['#fff8d8', '#ffcd50', '#ff70ad'], 9, 6.5);
        if (near) A.play('dh-bonk', { gain: g(0.9) });
        if (mine) { H.cam.shake = 0.4; this.hitStop(H, 0.07); this.toast(H, 'WALLOPED!', '#ff84b2'); this.buzz(e.i, 'bump'); }
        const hitter = this.hvOf(e.by);
        if (hitter) { this.hitStop(hitter, 0.05); this.toast(hitter, 'WALLOP!', '#ffcc52'); }
        break;
      }
      case 'hit': {
        const c = (K.alt ? ALT_COLORS : COLORS)[K.id];
        this.fx.burst(K.x, K.y + 2, K.z, ['#ffffff', '#ffffff', c[0], c[1], '#ffd1e0'], e.kind === 'alarm' ? 44 : 30, e.kind === 'missile' ? 11 : 8);
        V.hit();
        if (near) { A.play('dh-grunt', { rate: RACERS[K.id].voice * (K.alt ? 0.85 : 1), gain: g(1) }); A.play('dh-spin', { gain: g(0.8) }); A.play('feather-burst', { gain: g(0.8) }); }
        if (e.kind === 'missile' && near) A.play('dh-bonk', { gain: g(1) });
        if (mine) {
          H.cam.shake = e.kind === 'missile' || e.kind === 'alarm' ? 0.9 : 0.6;
          this.hitStop(H, e.kind === 'missile' || e.kind === 'alarm' ? 0.1 : 0.07);
          this.toast(H, { slick: 'SLICKED!', alarm: 'WAKE UP!', pod: 'PODDED!', splash: 'SOAKED!', plane: 'PAPER CUT!', sugar: 'SUGAR CRASH!' }[e.kind] || 'BONK!', '#ff3b6b');
          this.buzz(e.i, e.kind);
        }
        if (e.kind === 'plane' && near) A.play('dh-bonk', { gain: g(0.9), rate: 1.2 });
        if (e.kind === 'sugar' && near) A.play('dh-candy', { gain: g(0.6), rate: 0.8 });
        this.caption(e.kind, e.i);
        break;
      }
      case 'sugar': if (near) A.play('dh-candy', { gain: g(1) }); if (mine) { this.toast(H, 'SUGAR RUSH!', '#ff6fb5'); } this.fx.burst(K.x, K.y + 2, K.z, ['#ff6fb5', '#ffd84a', '#3ff0c8', '#9b5cff', '#ffffff'], 26, 7); break;
      case 'wash': {
        A.play('dh-steam', { gain: 0.9 });
        this.fx.wash(e);
        for (const i of e.hit) { const h = this.hvOf(i); if (h) { this.toast(h, 'SHRUNK IN THE WASH!', '#3ab7ff'); this.buzz(i, 'wash'); } }
        const hw = this.hvOf(e.from); if (hw) this.toast(hw, 'HOT WASH!', '#3ab7ff');
        if (e.hit.length) this.caption('wash', e.hit[0]);
        break;
      }
      case 'flat': if (near) A.play('dh-squash', { gain: g(1) }); if (mine) { this.toast(H, 'SQUASHED!', '#3ab7ff'); this.buzz(e.i, 'bump'); } this.fx.burst(K.x, K.y + 0.5, K.z, ['#ffffff', '#bfe8ff'], 10, 5); break;
      case 'eject': {
        V.eject(1.5);
        A.play('dh-boing', { gain: mine ? 1 : near ? 0.8 : 0.4 });
        if (near) A.play('dh-grunt', { rate: RACERS[K.id].voice * 1.4, gain: g(0.8) });
        this.fx.burst(K.x, K.y + 2, K.z, ['#ff3b6b', '#ffc0d0', '#ffffff'], 18, 7);
        if (mine) { this.toast(H, 'SPRUNG!', '#ff3b6b'); this.buzz(e.i, 'missile'); H.cam.shake = 0.6; this.hitStop(H, 0.08); }
        const hf = this.hvOf(e.from); if (hf) this.toast(hf, 'BOING!', '#ffd84a');
        this.caption('spring', e.i);
        break;
      }
      case 'ejectLand': if (near) A.play('land', { gain: g(0.8) }); V.land(1); break;
      case 'block': if (near) A.play('dh-bonk', { gain: g(0.8), rate: 1.5 }); this.fx.burst(e.x, e.y, e.z, ['#ffffff', '#ffd1e0'], 12, 6); if (mine) this.toast(H, 'BLOCKED!', '#3ff0c8'); break;
      case 'unCuff': break;
      case 'use': if (near) A.play(e.item === 'espresso' ? 'dh-boost' : e.item === 'cuffs' ? 'dh-clink' : e.item === 'alarm' ? 'dh-tick' : e.item === 'plane' ? 'dh-plane' : e.item === 'wash' ? 'dh-steam' : e.item === 'spring' ? 'dh-lock' : e.item === 'sugar' ? 'dh-candy' : 'dh-throw', { gain: g(1) }); if (e.item === 'espresso') this.fx.burst(K.x, K.y + 3, K.z, ['#5a3218', '#f4efe6'], 10, 4); break;
      case 'gotItem':
        if (mine) {
          A.play('dh-get');
          this.tip(H, `<b>${esc(ITEM_NAMES[e.item])}</b>: ${esc(ITEM_TIPS[e.item])} <kbd>${this.keyFor(H, 'item')}</kbd>`, 2.2, 'it');
        }
        this.fx.itemPop(e.i);
        break;
      case 'box': { const B = R.boxes[e.b]; this.fx.sparks(B.x, B.y, B.z, '#ffd84a', 14, 8, 1.0, 0.5); this.fx.burst(B.x, B.y, B.z, ['#ff3b6b', '#3ff0c8', '#ffd84a'], 10, 6); if (mine) A.play('dh-ding', { gain: 0.9 }); else if (near) A.play('dh-ding', { gain: g(0.35), rate: 1.1 }); break; }
      case 'boost': {
        if (near) { A.play('dh-boost', { gain: g(e.tier ? 0.9 : 0.7) }); A.play('dh-whoosh', { gain: g(e.tier === 3 || e.espresso ? 1 : 0.75) }); }
        if (e.tier) this.fx.sparks(K.x, K.y + 1, K.z, TIER_COLORS[e.tier], 16, 7, 1.0, 0.45);
        // a feather burst out the back
        this.fx.tailBurst(K, e.tier === 3 ? '#4dffc3' : e.tier === 2 ? '#ffc93a' : '#ffffff', e.tier === 3 || e.espresso ? 22 : 14);
        if (mine) H.cam.punch = Math.max(H.cam.punch || 0, e.tier === 3 || e.espresso ? 1 : e.tier === 2 ? 0.8 : 0.6);
        if (mine && e.tier) { this.kpop(H, e.tier === 3 ? 'super-turbo' : 'mini-turbo'); A.play('dh-ding', { gain: 0.45, rate: 1 + e.tier * 0.18 }); }
        if (e.tier || e.espresso) V?.wheelie(e.tier === 3 || e.espresso ? 1 : 0.7);
        break;
      }
      case 'tier': if (mine) A.play('dh-tier', { rate: 0.8 + e.tier * 0.25 }); break;
      case 'drift': if (near) A.play('whoosh-light', { gain: g(0.5) }); break;
      case 'pad':
        if (near) { A.play('dh-pad', { gain: g(1) }); A.play('dh-whoosh', { gain: g(0.7) }); }
        this.fx.sparks(K.x, K.y + 0.5, K.z, '#ffd84a', 12, 6, 0.8, 0.4); this.fx.tailBurst(K, '#ffffff', 12);
        if (mine) H.cam.punch = Math.max(H.cam.punch || 0, 0.7);
        break;
      case 'launch':
        if (near) A.play('jump', { gain: g(0.8) });
        // the first ramp of the session: a one-time tip about the TAUNT trick
        if (mine && !this.tipsShown.has('taunt' + H.j)) { this.tipsShown.add('taunt' + H.j); this.tip(H, `In the air? Press <kbd>${this.keyFor(H, 'taunt')}</kbd> to TAUNT: a trick, and a <b>STYLE BOOST</b> when you land`, 3.4, 'big'); }
        break;
      case 'land': if (near) A.play('land', { gain: g(0.4 + e.hard * 0.6) }); V.land(e.hard); if (e.hard > 0.3) this.fx.burst(K.x, K.y + 0.3, K.z, ['#ffffff', '#e7e0f0'], 6, 4); break;
      case 'trick': {
        V.taunt(true);
        if (near) { A.play('dh-trick', { gain: g(1) }); A.play('dh-grunt', { rate: RACERS[K.id].voice * 1.25, gain: g(0.7) }); }
        if (mine || (this._dist(K) < 30 && !this.bubbles.some((b) => !this.hvOf(b.i)))) this.bubble(e.i, tauntLine(K.id, K.alt, this.raceN * 7 + R.tick), 1.6);
        this.fx.sparks(K.x, K.y + 2, K.z, '#ffffff', 10, 6, 0.8, 0.5);
        break;
      }
      case 'trickBoost':
        if (mine) { this.toast(H, 'STYLE BOOST!', '#ffc93a'); H.cam.punch = Math.max(H.cam.punch || 0, 0.8); A.play('dh-whoosh', { gain: 0.9 }); }
        // gold feathers: the landing boost is clearly visible
        this.fx.burst(K.x, K.y + 1.5, K.z, ['#ffc93a', '#ffe27a', '#fff2b0', '#ffffff'], 26, 8);
        this.fx.tailBurst(K, '#ffc93a', 18);
        break;
      case 'taunt': {
        V.taunt(false);
        if (near) { A.play('dh-honk', { gain: g(0.8), rate: RACERS[K.id].voice }); A.play('dh-grunt', { rate: RACERS[K.id].voice * 1.2, gain: g(0.6) }); }
        if (mine || this._dist(K) < 40) this.bubble(e.i, tauntLine(K.id, K.alt, this.raceN * 5 + R.tick), 2.0);
        break;
      }
      case 'shortcut':
        if (mine) this.toast(H, 'SECRET CHUTE!', '#ffe56a');
        if (near) A.play('dh-whoosh', { gain: g(0.7) });
        break;
      case 'torpedo': {
        if (mine) { this.toast(H, 'TORPEDOED!', '#ff8dc7'); H.cam.shake = 0.32; }
        const attacker = this.hvOf(e.by);
        if (attacker) this.toast(attacker, 'TORPEDO HIT!', '#7af9e0');
        break;
      }
      case 'fall': if (near) A.play('crowd-ooh', { gain: g(0.7) }); if (mine) this.toast(H, 'OOPS!', '#9b5cff'); break;
      case 'fished': if (near) A.play('dh-reel', { gain: g(0.7) }); break;
      case 'alarm': {
        A.play('dh-ring', { gain: mine ? 1 : near ? 0.8 : 0.4 });
        this.fx.scare(e.i);
        if (mine) { A.play('dh-scare'); const s = H.scare; s.classList.remove('on'); void s.offsetWidth; s.classList.add('on'); H.cam.shake = 1; }
        this.caption('alarm', e.i);
        break;
      }
      case 'wobble': break;
      case 'cuffs': {
        const Hs = [e.a, e.b].map((i) => this.hvOf(i)).filter(Boolean);
        A.play('dh-clink', { gain: Hs.length ? 1 : 0.5 });
        const X = R.karts[e.a]; this.fx.burst(X.x, X.y + 2, X.z, ['#ff6fb5', '#ffc0e0'], 16, 5);
        for (const h of Hs) { this.toast(h, 'CUFFED!', '#ff6fb5'); this.buzz(h.i, 'cuffs'); }
        this.caption('cuffs', e.a);
        break;
      }
      case 'case': if (near) A.play('dh-flap', { gain: g(1) }); if (mine) { this.toast(H, 'PILLOWCASED!', '#f4efe6'); this.buzz(e.i, 'case'); } this.caption('case', e.i); break;
      case 'pop': if (e.kind === 'missile' || e.kind === 'case' || e.kind === 'plane') { this.fx.burst(e.x, e.y, e.z, e.kind === 'plane' ? ['#f4efe6', '#dcd3ea', '#ffffff'] : ['#ffffff', '#ffd1e0'], 12, 6); } break;
      case 'bounce': this.fx.sparks(e.x, e.y, e.z, '#ffffff', 4, 4, 0.5); break;
      case 'fizzle': this.fx.burst(e.x, e.y, e.z, ['#ffffff'], 6, 3); break;
      case 'bump': {
        if (Math.min(this._dist(R.karts[e.i]), this._dist(R.karts[e.j])) < 40) A.play('dh-bump', { gain: 0.4 + e.p * 0.6 });
        this.fx.sparks(e.x, e.y + 1, e.z, '#ffffff', 5, 4, 0.6);
        for (const i of [e.i, e.j]) { const h = this.hvOf(i); if (h) { h.cam.shake = Math.max(h.cam.shake, e.p * 0.35); if (e.p > 0.5) this.buzz(i, 'bump'); } }
        break;
      }
      case 'scrape': {
        // a rail or a wall: sparks off the side you hit, a grind
        this.fx.sparks(e.x, e.y, e.z, e.rail ? '#ffd27a' : '#ffffff', 3, 5, 0.55, 0.3);
        if (mine) { A.play('dh-scrape', { gain: 0.25 + e.p * 0.35, rate: 0.9 + e.p * 0.3 }); H.cam.shake = Math.max(H.cam.shake, 0.06); }
        break;
      }
      case 'wall': if (mine) { A.play('dh-bump', { gain: 0.3 + e.p * 0.4, rate: 0.8 }); H.cam.shake = Math.max(H.cam.shake, e.p * 0.25); } break;
      case 'lap': if (mine && e.lap === R.laps) { const f = H.final; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); A.setIntense(true); A.play('dh-tier', { rate: 1.6 }); } break;
      case 'finish': {
        if (mine) {
          this.toast(H, `${ORD(e.place)}!`, e.place === 1 ? '#ffc93a' : '#3ff0c8');
          H.wait.textContent = this.hv.length > 1 ? 'Finished! Waiting for the others…' : '';
          if (this.hv.every((h) => R.karts[h.i].fin)) { A.music(null); A.sting(this.hv.some((h) => R.karts[h.i].place <= 3) ? 'win' : 'lose'); this.resultsAt = this.t + 3.5; }
        }
        this.photoFinish?.(e);
        break;
      }
      case 'done': if (!this.resultsAt) this.resultsAt = this.t + 2; break;
      default: this.world.onEvent?.(e, this, near, g); break;
    }
  }

  /* a buzz on that racer's phone (hit by an item, a big bump) */
  buzz(i, kind) {
    const j = this.hv.findIndex((H) => H.i === i), p = this.humanP?.[j];
    if (p && p.phone >= 0) this.pads.send(p.phone, { t: 'bz', kind });
  }

  _dist(K) {
    let d = 1e9;
    for (const H of this.allViews()) d = Math.min(d, Math.hypot(K.x - H.camera.position.x, K.y - H.camera.position.y, K.z - H.camera.position.z));
    if (!this.hv.length) d = Math.hypot(K.x - this.camera.position.x, K.y - this.camera.position.y, K.z - this.camera.position.z);
    return d;
  }

  toast(H, text, color) {
    if (!H) return;
    const t = H.toastEl;
    const art = toastArt(text);
    if (art) t.innerHTML = art; else t.textContent = text;
    t.dataset.ink = art ? '' : text; t.style.setProperty('--toast-ink', color);
    t.classList.toggle('sticker', !!art);
    t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
  }

  /* overhaul: the second sticker slot, low and near the kart (MINI-TURBO!, OVERTAKE!) */
  kpop(H, id) {
    if (!H?.kpop) return;
    H.kpop.innerHTML = typeImg(id, id);
    H.kpop.classList.remove('on'); void H.kpop.offsetWidth; H.kpop.classList.add('on');
  }

  /* overhaul: the hit pause — the 1P race holds for a beat; in split screen only that view's camera holds */
  hitStop(H, secs) {
    if (!H) return;
    if (this.hv.length === 1) this.hitT = Math.max(this.hitT || 0, secs);
    H.stop = Math.max(H.stop || 0, secs);
    H.el.classList.remove('impact'); void H.el.offsetWidth; H.el.classList.add('impact');
  }

  /* a speech bubble over racer i, for `secs` */
  bubble(i, text, secs) {
    const old = this.bubbles.find((b) => b.i === i);
    if (old) { dismiss(old.el); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    if (this.bubbles.length >= 3 + this.hv.length) { const b = this.bubbles.shift(); dismiss(b.el); }
    const el = say($('bubbles'), text, -999, -999, { size: this.hv.length > 2 ? 16 : this.hv.length > 1 ? 19 : 22, maxWidth: 240, tail: 'down-left' });
    this.bubbles.push({ i, el, until: this.t + secs });
  }

  _bubbles() {
    const v = new THREE.Vector3();
    const views = this.screen === 'race' && this.hv.length ? this.allViews() : [{ camera: this.camera, rect: [0, 0, 1, 1] }];
    this.bubbles = this.bubbles.filter((b) => {
      if (this.t > b.until) { dismiss(b.el); return false; }
      const g = b.i >= 0 ? (this.rviews || [])[b.i]?.group : this.podiumBubble?.group;
      if (!g) return true;
      // in the view of its own racer if that's a human, else the first view that sees it
      const own = this.hv.find((H) => H.i === b.i);
      let shown = false;
      for (const W of own ? [own, ...views] : views) {
        v.copy(g.position); v.y += 4.2;
        v.project(W.camera);
        if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
        const [rx, ry, rw, rh] = W.rect;
        const d = W.camera.position.distanceTo(g.position);
        place(b.el, (rx + (v.x * 0.5 + 0.5) * rw) * innerWidth + 20, (ry + (-v.y * 0.5 + 0.5) * rh) * innerHeight - 10, Math.max(0.5, Math.min(1, 30 / (d + 6))) * (views.length > 1 ? 0.8 : 1));
        shown = true;
        break;
      }
      b.el.style.display = shown ? '' : 'none';
      return true;
    });
  }

  /* ── the chase cameras ── */
  _camera(H, dt, alpha) {
    const R = this.race;
    if (H.stop > 0) { H.stop -= dt; return; }
    let i = H.i;
    if (H.tv) i = R.order[0];
    const K = R.karts[i], P = this.prev[i];
    const pose = this._pose(K, P, alpha);
    const C = H.cam, cam = H.camera;
    const yaw = pose.yaw;
    const back = H.lookBack ? -1 : 1;
    const sp = Math.abs(K.fwd), top = K.S.top;
    const intro = R.phase === 'count' ? Math.max(0, 1 - R.tick / (COUNT_TICKS - 30)) : 0;
    const tv = H.tv ? 1 : 0;
    // a boost's kick: the camera pulls back and the FOV punches out, then settles
    C.punch = Math.max(0, (C.punch || 0) - dt * 1.6);
    const punch = Math.sin(Math.min(1, C.punch) * Math.PI * 0.5);
    // shrunk in the wash: the camera comes in closer to the little kart
    C.size = lerp(C.size ?? 1, K.shrinkT > 0 && !tv ? 0.72 : 1, Math.min(1, dt * 4));
    let reveal = 0;
    if (this.banisterLip >= 0 && !H.tv && !H.lookBack && !K.fish && R.phase === 'race' && K.fwd > 0) {
      const T = R.T;
      const along = (K.k - this.banisterLip) * T.step
        + (pose.x - T.x[K.k]) * T.tx[K.k] + (pose.z - T.z[K.k]) * T.tz[K.k];
      reveal = smooth01((along + 45) / 29) * smooth01((44 - along) / 23) * smooth01(K.fwd / 10);
    }
    C.reveal = lerp(C.reveal || 0, reveal, Math.min(1, dt * 8));
    const lift = H.lookBack || H.lb || K.fish ? 0 : C.reveal;
    // overhaul: low and close, so the kart and its plush fill the frame (tv and the banister reveal as before)
    const dist = ((5.9 + sp * 0.04) * (1 + intro * 2.5) + tv * 9.3 + punch * 2.2 + lift * 5.4) * C.size;
    const h = (2.75 + intro * 9 + (K.air ? 0.9 : 0) + tv * 7.5 + lift * 6.1) * C.size;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const want = new THREE.Vector3(pose.x - fx * dist * back, pose.y + h, pose.z - fz * dist * back);
    const [bx0, bx1, bz0, bz1] = this.world.info.bounds;
    want.x = Math.max(bx0, Math.min(bx1, want.x)); want.z = Math.max(bz0, Math.min(bz1, want.z));
    if (K.fish) { want.set(pose.x - fx * 14, pose.y + 9, pose.z - fz * 14); }
    this.world.camFix(want, pose, K.k);
    const k = H.lookBack !== H.lb ? 1 : Math.min(1, dt * (K.fish ? 2.5 : tv ? 3 : 7.5));
    H.lb = H.lookBack;
    // overhaul: smooth the camera's offset from the kart (not its world position), so it
    // doesn't fall behind at speed and shrink the kart; height still eases on its own
    const ox = want.x - pose.x, oz = want.z - pose.z;
    if (C.ox === undefined || k === 1) { C.ox = ox; C.oz = oz; } else { C.ox += (ox - C.ox) * k; C.oz += (oz - C.oz) * k; }
    C.pos.set(pose.x + C.ox, C.pos.y + (want.y - C.pos.y) * (k === 1 ? 1 : Math.min(1, dt * 9)), pose.z + C.oz);
    this.world.camFix(C.pos, pose, K.k);
    const look = new THREE.Vector3(pose.x + fx * (5.5 + lift * 0.9) * back, pose.y + 1.45 - lift * 3.35, pose.z + fz * (5.5 + lift * 0.9) * back);
    // look-ahead: lean the aim toward where the road goes next
    if (!H.lookBack && !K.fish && !tv && R.T) {
      const T = R.T, ka = (K.k + 14) % T.N;
      const ax = T.x[ka] - pose.x, az = T.z[ka] - pose.z;
      const side = ax * fz - az * fx; // + = road bends right of the nose
      C.lean = lerp(C.lean || 0, Math.max(-6, Math.min(6, side * 0.22)), Math.min(1, dt * 3));
      look.x += fz * C.lean; look.z -= fx * C.lean;
    }
    C.look.lerp(look, Math.min(1, dt * 12));
    const fov = (60 + Math.min(1.45, sp / top) * 9 + (K.boostT > 0 ? 9 : 0) + punch * 10) * (this.hv.length === 2 && !tv ? 0.82 : 1);
    C.fov = lerp(C.fov, fov, Math.min(1, dt * 4));
    cam.fov = C.fov; cam.updateProjectionMatrix();
    cam.position.copy(C.pos);
    if (C.shake > 0) { C.shake = Math.max(0, C.shake - dt * 2.2); const s = C.shake * 0.5; cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s; }
    cam.lookAt(C.look);
    if (this.slowmo) this.slowmoCam?.(H, pose);
    H.darkV = lerp(H.darkV || 0, this.world.darkAt(pose), Math.min(1, dt * 3));
  }

  _pose(K, P, a) {
    if (K.fish) return this.fx.fishPose(K, { yaw0: K.yaw, yaw: K.yaw });
    let yaw = angLerp(P.yaw, K.yaw, a);
    if (K.spinT === 0 && P.spinT > 0 && this.race.humans.includes(K.i)) {
      yaw = angLerp(spinRecoveryYaw(this.race.T, K, P.yaw), K.yaw, a);
    } else if (K.spinT > 0 && K.spinT < SPIN_RECOVER && this.race.humans.includes(K.i)) {
      // Predict the remaining tapered spin, then ease in only the final
      // correction. Kart and chase camera share this presentation heading.
      const ticks = Math.floor(K.spinT / DT);
      const remainingTurn = K.spinDir * 11 * 1.4 * DT * (K.air ? 0.55 : 1) *
        (ticks * K.spinT - DT * ticks * (ticks + 1) / 2);
      const exit = K.yaw + remainingTurn;
      yaw += (spinRecoveryYaw(this.race.T, K, exit) - exit) * smooth01(1 - K.spinT / SPIN_RECOVER);
    }
    return { x: lerp(P.x, K.x, a), y: lerp(P.y, K.y, a), z: lerp(P.z, K.z, a), yaw };
  }

  _propCues(H, R, K) {
    const P = R.wallopProp, C = R.T.cut;
    const active = R.phase === 'race' && !K.fin && !K.fish && !H.lookBack;
    const nearProp = active && P && !P.reset && this._cueNear(R.T, K, P.k, P.x, P.y, P.z, 56);
    const gateAt = C?.m0 + 1;
    const gx = C ? C.ax + gateAt * C.ux : 0, gz = C ? C.az + gateAt * C.uz : 0;
    const nearGate = active && P?.type === 'gong' && P.reset && !K.cut &&
      this._cueNear(R.T, K, C.kA, gx, 0, gz, 76);
    if (!nearProp && !nearGate) {
      H.propCue.hidden = H.gateCue.hidden = true;
      return;
    }

    H.camera.updateMatrixWorld();
    const place = (el, x, y, z) => {
      cueProjection.set(x, y, z).project(H.camera);
      const p = cueProjection;
      el.hidden = p.z < -1 || p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1;
      if (!el.hidden) {
        el.style.left = `${Math.min(80, Math.max(20, (p.x + 1) * 50)).toFixed(1)}%`;
        el.style.top = `${Math.min(82, Math.max(24, (1 - p.y) * 50)).toFixed(1)}%`;
      }
    };

    H.propCue.hidden = !nearProp;
    if (nearProp) {
      const [title, hint, color, height] = PROP_CUES[P.type];
      const inReach = !K.air && K.spinT <= 0 && K.ejectT <= 0 && K.wallopReady <= R.tick &&
        Number.isFinite(R.wallopPropReach(K, WALLOPS[K.id]));
      if (H.hud.propReach !== inReach) {
        H.hud.propReach = inReach;
        H.propCue.classList.toggle('in-reach', inReach);
        H.propCue.firstElementChild.textContent = inReach ? `Wallop now · ${this.keyFor(H, 'wallop')}` : title;
      }
      if (!H.hud.propStyle) {
        H.hud.propStyle = true;
        H.propCue.lastElementChild.textContent = hint;
        H.propCue.style.setProperty('--cue', color);
      }
      place(H.propCue, P.x, P.y + P.lift + height, P.z);
    }

    H.gateCue.hidden = !nearGate;
    if (nearGate) {
      const seconds = Math.ceil(P.reset / 60);
      if (H.hud.gateSeconds !== seconds) {
        H.hud.gateSeconds = seconds;
        H.gateCue.lastElementChild.textContent = `Take the bypass · ${seconds}s`;
      }
      place(H.gateCue, gx, 5.2, gz);
    }
  }

  _cueNear(T, K, sample, x, y, z, range) {
    const dk = Math.abs(K.k - sample);
    return Math.min(dk, T.N - dk) * T.step < range * 1.4 &&
      Math.abs(K.y - y) < 24 && (K.x - x) ** 2 + (K.z - z) ** 2 < range ** 2;
  }

  /* ── HUD (one per human view) ── */
  _hud(H) {
    const R = this.race, K = R.karts[H.i];
    if (H.hud.place !== K.place) {
      const was = H.hud.place;
      H.hud.place = K.place;
      H.place.innerHTML = placeImg(K.place);
      H.place.className = 'place' + (K.place === 1 ? ' p1' : '') + (was ? (K.place < was ? ' gain' : ' lose') : ' bump');
      if (was && R.phase === 'race' && !K.fin && R.tick > 60 * 6) {
        const V = this.rviews[H.i];
        if (K.place < was) { if (!(H.otT > this.t)) { H.otT = this.t + 1.6; this.kpop(H, 'overtake'); this.audio.play('dh-ding', { gain: 0.5, rate: 1.25 }); } V?.cheerHop(); }
        else V?.sulk();
      }
    }
    H.lap.textContent = `${R.lapOf(K)}/${R.laps}`;
    H.time.textContent = fmt(R.timeOf(K));
    // the item slot: the roulette spins through the icons, then lands
    let it = K.item, spin = false;
    if (K.item && K.roulette > 0) { it = ITEMS[Math.floor(R.tick / 4) % ITEMS.length]; spin = true; if (R.tick % 4 === 0 && H.j === 0 && !this.cpus[H.i]) this.audio.play('dh-tick', { gain: 0.6 }); }
    const key = `${it}|${spin}`;
    if (key !== H.lastItem) {
      H.lastItem = key;
      H.item.innerHTML = it ? ICONS[it] : '';
      H.item.classList.toggle('spin', spin);
      H.itemName.innerHTML = it && !spin ? `<strong>${esc(ITEM_NAMES[it])}</strong><kbd>${this.keyFor(H, 'item')}</kbd>` : '';
      H.islot.dataset.item = it && !spin ? it : '';
      H.islot.classList.toggle('has', !!it);
      if (it && !spin) { H.item.classList.remove('land'); void H.item.offsetWidth; H.item.classList.add('land'); }
    }
    // only write the DOM when something changed
    const set = (k, v, f) => { if (H.hud[k] !== v) { H.hud[k] = v; f(v); } };
    if (!H.hud.keys) { H.hud.keys = 1; for (const el of H.el.querySelectorAll('.tk')) el.textContent = this.keyFor(H, 'taunt'); }
    set('tip', this.t < H.tipUntil, (v) => H.tip.classList.toggle('on', v));
    set('cap', this.t < H.capUntil, (v) => H.caption.classList.toggle('on', v));
    set('wrongWay', R.phase === 'race' && !K.fin && K.wrongWayT >= 0.45, (v) => { H.wrongWay.hidden = !v; });
    set('windup', K.wallopAt > R.tick, (v) => H.wallop.classList.toggle('windup', v));
    const ready = K.wallopReady <= R.tick;
    set('wallopReady', ready, (v) => {
      H.wallop.classList.toggle('cooldown', !v);
      H.wallop.textContent = v ? `Wallop · ${this.keyFor(H, 'wallop')}` : 'Wallop · recovering';
    });
    // the TAUNT prompt: airborne off a ramp, no trick yet
    const tp = !!(K.air && K.ramp && !K.trick && K.airT > 0.06 && K.spinT <= 0 && !K.fin);
    set('tp', tp, (v) => H.tprompt.classList.toggle('on', v));
    set('tic', K.air ? (K.trick ? 2 : 1) : 0, (v) => { H.tauntIc.classList.toggle('air', v === 1); H.tauntIc.classList.toggle('done', v === 2); });
    // someone's spring cushion is locked on you
    set('warn', R.karts.some((O) => O.lock === K.i), (v) => H.warn.classList.toggle('on', v));
    // speed lines while a boost runs
    set('spd', K.boostT > 0 ? Math.min(1, K.boostT * 1.6).toFixed(1) : '0', (v) => { H.speed.style.opacity = v; });
    set('dch', K.drift ? Math.min(1, K.charge / TIER_AT[3]).toFixed(2) + ':' + K.tier : '', (v) => {
      if (!v) { delete H.islot.dataset.tier; H.islot.style.removeProperty('--charge'); return; }
      const [c, t] = v.split(':'); H.islot.dataset.tier = t; H.islot.style.setProperty('--charge', c);
    });
    const tiers = H.drift.querySelectorAll('i');
    tiers.forEach((el, j) => { el.className = K.drift && K.tier > j ? `t${K.tier}` : ''; });
    H.fabric.classList.toggle('on', K.caseT > 0);
    H.el.classList.toggle('looking', !!H.lookBack);
    H.dark.style.opacity = (H.darkV * 0.55).toFixed(3);
    if ((R.tick + H.j) % (this.hv.length > 2 ? 3 : this.hv.length > 1 ? 2 : 1) === 0) this._drawMinimap(H);
  }

  _minimapBase() {
    const T = this.T, c = document.createElement('canvas');
    c.width = 400; c.height = 400;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < T.N; k++) { x0 = Math.min(x0, T.x[k]); x1 = Math.max(x1, T.x[k]); z0 = Math.min(z0, T.z[k]); z1 = Math.max(z1, T.z[k]); }
    const s = Math.min((c.width - 50) / (x1 - x0), (c.height - 50) / (z1 - z0));
    const ox = (c.width - (x1 - x0) * s) / 2 - x0 * s, oz = (c.height - (z1 - z0) * s) / 2 - z0 * s;
    const g = c.getContext('2d');
    const path = () => { g.beginPath(); for (let k = 0; k <= T.N; k += 3) { const q = k % T.N; g.lineTo(T.x[q] * s + ox, T.z[q] * s + oz); } g.closePath(); };
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(155,92,255,.55)'; g.lineWidth = 16; path(); g.stroke();
    g.strokeStyle = '#2a2140'; g.lineWidth = 10; path(); g.stroke();
    // raised parts brighter
    g.lineWidth = 10;
    const hi = T.def.mapHigh || [8, 18];
    for (let k = 0; k < T.N; k += 3) { const q = (k + 3) % T.N; if (T.y[k] > hi[0]) { g.strokeStyle = T.y[k] > hi[1] ? '#3a5aa0' : '#7a4428'; g.beginPath(); g.moveTo(T.x[k] * s + ox, T.z[k] * s + oz); g.lineTo(T.x[q] * s + ox, T.z[q] * s + oz); g.stroke(); } }
    const sk = new Race({ track: T.def.id, racers: [{ id: 'k8e' }], seed: 1, humans: [] }).startK;
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath();
    g.moveTo((T.x[sk] - rightX(T, sk) * 9) * s + ox, (T.z[sk] - rightZ(T, sk) * 9) * s + oz); g.lineTo((T.x[sk] + rightX(T, sk) * 9) * s + ox, (T.z[sk] + rightZ(T, sk) * 9) * s + oz); g.stroke();
    return { c, s, ox, oz };
  }
  _drawMinimap(H) {
    const M = this.minimap, cv = H.mm, g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(M.c, 0, 0);
    const R = this.race, humans = new Set(this.hv.map((h) => h.i));
    if (this.ghost?.on && this.ghost.pos) { g.globalAlpha = 0.6; g.fillStyle = '#bfe8ff'; g.beginPath(); g.arc(this.ghost.pos.x * M.s + M.ox, this.ghost.pos.z * M.s + M.oz, 7, 0, 7); g.fill(); g.globalAlpha = 1; }
    for (const K of [...R.karts].sort((a, b) => (a.i === H.i) - (b.i === H.i) || humans.has(a.i) - humans.has(b.i))) {
      const [c1, c2] = (K.alt ? ALT_COLORS : COLORS)[K.id];
      const x = K.x * M.s + M.ox, y = K.z * M.s + M.oz, me = K.i === H.i, hj = this.hv.findIndex((h) => h.i === K.i);
      g.beginPath(); g.arc(x, y, me ? 11 : hj >= 0 ? 10 : 8, 0, Math.PI * 2);
      g.fillStyle = c1; g.fill(); g.lineWidth = me ? 4 : 3; g.strokeStyle = me ? '#fff' : hj >= 0 ? PCOL[hj] : c2; g.stroke();
    }
    for (const S of R.shots) if (S.kind === 'alarm') { g.fillStyle = '#e2463f'; g.beginPath(); g.arc(S.x * M.s + M.ox, S.z * M.s + M.oz, 6, 0, 7); g.fill(); }
  }

  /* ── results: the podium (and the cup's standings) ── */
  toResults() {
    const R = this.race;
    this.setScreen('results');
    const hs = this.hv.map((H) => H.i);
    const tag = (i) => { const j = hs.indexOf(i); return j >= 0 && hs.length > 1 ? ` <b class="ptg" style="background:${PCOL[j]}">P${j + 1}</b>` : ''; };
    const me = R.karts[this.me];
    const winner = R.karts[R.finishOrder[0]], wj = hs.indexOf(winner.i);
    $('r-title').textContent = this.cpus[this.me] ? 'Results' : hs.length > 1 ? (wj >= 0 ? `P${wj + 1} wins!` : `${RACERS[winner.id].name} wins`) : me.place === 1 ? 'You win!' : `You came ${ORD(me.place)}`;
    // the cup: points for every place
    let cupHTML = '';
    if (this.cup) {
      const C = this.cup;
      R.finishOrder.forEach((i, p) => { C.pts.set(i, (C.pts.get(i) || 0) + POINTS[p]); });
      C.race++;
      const rows = [...C.pts.entries()].sort((a, b) => b[1] - a[1]);
      C.standing = rows.map(([i]) => i);
      cupHTML = `<div class="cuph">The Pillow Cup · race ${C.race} of ${C.tracks.length}</div>` + rows.map(([i, pts], p) => {
        const K = R.karts[i], N = RACERS[K.id];
        return `<div class="row cupr${hs.includes(i) ? ' you' : ''}"><span class="p">${p + 1}</span><span>${N.name}${K.alt ? ' <small style="color:var(--violet)">ALT</small>' : ''}${tag(i)}</span><span class="t">${pts} pts</span></div>`;
      }).join('');
    }
    $('board').innerHTML = R.finishOrder.map((i, p) => {
      const K = R.karts[i], N = RACERS[K.id];
      return `<div class="row${hs.includes(i) ? ' you' : ''}"><span class="p">${p + 1}</span><span>${N.name}${K.alt ? ' <small style="color:var(--violet)">ALT</small>' : ''}${tag(i)}</span><span class="t">${this.cup ? `+${POINTS[p]}` : fmt(R.timeOf(K))}</span></div>`;
    }).join('') + cupHTML;
    $('board').classList.toggle('cupb', !!this.cup);
    const last = this.cup && this.cup.race >= this.cup.tracks.length;
    resultsButtons($('again'), this.cup ? (last ? 'cup' : 'next') : 'race');
    this._podiumOf(R.finishOrder.slice(0, 3));
    this.bubble(-1, koLine(winner.id, winner.alt, this.raceN), 99);
    // the roast for last place, in the winner's voice
    const lastI = R.finishOrder[R.finishOrder.length - 1], LK = R.karts[lastI];
    const roast = lastLine(winner.id, this.raceN + R.tick);
    const lj = hs.indexOf(lastI);
    const rEl = $('roast');
    if (rEl) {
      rEl.innerHTML = `<small>Last place: ${esc(RACERS[LK.id].name)}${LK.alt ? ' (ALT)' : ''}${lj >= 0 && hs.length > 1 ? ` · P${lj + 1}` : ''}</small>“${esc(roast)}”<i>— ${esc(RACERS[winner.id].name)}</i>`;
      rEl.classList.remove('on'); void rEl.offsetWidth; rEl.classList.add('on');
    }
    // the phones: their place, and the roast on the last-placed one's
    this.hv.forEach((H, j) => {
      const p = this.humanP[j];
      if (!p || p.phone < 0) return;
      const K = R.karts[H.i];
      if (H.i === lastI) this.pads.send(p.phone, { t: 'ko', line: roast, who: RACERS[winner.id].name });
      else if (H.i === winner.i) this.pads.send(p.phone, { t: 'ko', line: `${ORD(K.place)}! ${tauntLine(K.id, K.alt, this.raceN)}`, who: 'You' });
      else this.pads.send(p.phone, { t: 'ko', line: koLine(winner.id, winner.alt, this.raceN + j), who: `${RACERS[winner.id].name} · you came ${ORD(K.place)}` });
    });
    this.audio.music(null);
    this.podT = 0;
  }

  /* the top three on the podium, in their winning poses */
  _podiumOf(order) {
    const R = this.race, I = this.world.info;
    const spots = I.podium;
    this.podium = order.slice(0, 3).map((i, p) => ({ i, v: this.rviews[i], spot: spots[p] }));
    for (const v of this.rviews) { v.group.visible = false; v.racing = false; v.mayWake = true; }
    if (this.ghost) this.ghost.mesh.visible = false;
    this.podium.forEach((P, p) => { P.v.group.visible = true; P.v.driver.pose(p === 0 ? 'win' : 'idle', 60); });
    if (this.podiumMeshes) this.podiumMeshes.removeFromParent();
    this.podiumMeshes = new THREE.Group();
    const cols = ['#ffc93a', '#d9dce6', '#d39a62'];
    spots.forEach(([x, y, z], p) => {
      const g = I.podiumGround || 0;
      const m = new THREE.Mesh(new THREE.BoxGeometry(7.5, y - g, 6.5), new THREE.MeshStandardMaterial({ color: cols[p], roughness: 0.5 }));
      m.position.set(x, g + (y - g) / 2, z); this.podiumMeshes.add(m);
    });
    this.scene.add(this.podiumMeshes);
    this.podiumMeshes.visible = true;
    this.podiumBubble = this.podium[0].v;
    this.bubbles.forEach((b) => dismiss(b.el)); this.bubbles = [];
    void R;
  }

  afterResults() {
    if (this.screen === 'cup') { this.cup = null; this.toSelect(); return; }
    if (this.cup) {
      if (this.cup.race >= this.cup.tracks.length) { this.toCupPodium(); return; }
      const picks = this.last.picks;
      this.startRace({ picks, track: this.cup.tracks[this.cup.race] });
      return;
    }
    this.startRace(this.last);
  }

  /* the Pillow Cup's overall podium */
  toCupPodium() {
    const R = this.race, C = this.cup;
    this.setScreen('cup');
    const hs = this.hv.length ? this.hv.map((H) => H.i) : [];
    const order = C.standing;
    const W = R.karts[order[0]], wj = hs.indexOf(W.i);
    $('c-title').textContent = wj >= 0 && hs.length > 1 ? `P${wj + 1} wins the Pillow Cup!` : wj >= 0 ? 'You win the Pillow Cup!' : `${RACERS[W.id].name} wins the Pillow Cup`;
    $('c-board').innerHTML = order.map((i, p) => {
      const K = R.karts[i], N = RACERS[K.id], j = hs.indexOf(i);
      return `<div class="row${j >= 0 ? ' you' : ''}"><span class="p">${p + 1}</span><span>${N.name}${K.alt ? ' <small style="color:var(--violet)">ALT</small>' : ''}${j >= 0 && hs.length > 1 ? ` <b class="ptg" style="background:${PCOL[j]}">P${j + 1}</b>` : ''}</span><span class="t">${C.pts.get(i)} pts</span></div>`;
    }).join('');
    $('roast')?.classList.remove('on');
    this._podiumOf(order.slice(0, 3));
    this.bubble(-1, koLine(W.id, W.alt, this.raceN + 3), 99);
    this.audio.sting('win');
    this.podT = 0;
  }

  _podium(dt) {
    this.podT += dt;
    const I = this.world.info;
    for (const P of this.podium) {
      const v = P.v, [x, y, z] = P.spot;
      const K = this.race.karts[P.i];
      const rank = this.podium.indexOf(P);
      v.cheer = ['win', 'wave', 'bounce'][rank] || 'sulk';
      // confetti: a big pop as the podium appears, then a shower over the winner every couple of seconds
      if (rank === 0 && (this.podT - dt < 0.35 && this.podT >= 0.35 || Math.floor(this.podT / 2.2) !== Math.floor((this.podT - dt) / 2.2)))
        this.fx?.burst(x, y + 7, z, ['#ffc93a', '#3ff0c8', '#ff3b6b', '#9b5cff', '#2e9bff', '#ffffff'], 34, 9);
      v.update(dt, { ...K, fwd: 0, drift: 0, steer: 0, air: 0, spinT: 0, boostT: 0, caseT: 0, wobT: 0 }, { x, y, z, yaw: (I.podYaw ?? Math.PI * 0.08) + (P === this.podium[0] ? Math.sin(this.podT) * 0.15 : 0) }, this.camera.position, this.camera.quaternion);
      if (P === this.podium[0] && Math.floor(this.podT * 3) !== Math.floor((this.podT - dt) * 3)) this.fx?.sparks(x + (Math.random() - 0.5) * 8, y + 5 + Math.random() * 3, z, ['#ffc93a', '#3ff0c8', '#ff3b6b'][Math.floor(Math.random() * 3)], 6, 5, 0.8, 0.6);
    }
    const a = -0.25 + Math.sin(this.podT * 0.3) * 0.18 + (I.podCam.a || 0);
    this.camera.fov = 50; this.camera.updateProjectionMatrix();
    const [cx, cz] = I.podCam.c;
    this.camera.position.set(cx + Math.sin(a) * I.podCam.r, I.podCam.y, cz + Math.cos(a) * I.podCam.r);
    this.cam.pos.copy(this.camera.position);
    this.camera.lookAt(...I.podLook);
  }

  /* ── the frame ── */
  frame(dt, render = true) {
    const t0 = performance.now();
    dt = Math.min(dt, 0.1);
    this.t += dt;
    this._menuPads();
    if (this._lockT > 0 && (this._lockT -= dt) <= 0) { if (this.screen === 'select' && this.players.every((q) => q.locked)) this.toSetup(); }
    this.pads.frame(dt);
    this._lostPhones();
    let rdt = dt;
    if (this.screen === 'race' && this.race) {
      rdt = this.slowmo ? dt * this.slowmo.k : dt;
      if (this.hitT > 0) { this.hitT -= dt; rdt *= 0.08; }
      if (!this.paused) {
        this.acc += rdt;
        let n = 0;
        while (this.acc >= DT && n < 6) { this.tick(); this.acc -= DT; n++; }
        if (n === 6) this.acc = 0;
      }
      this.slowmoStep?.(dt);
      // the alarm clock ticks all the way across the field
      if (!this.paused && this.race.shots.some((S) => S.kind === 'alarm') && Math.floor(this.t * 5) !== Math.floor((this.t - dt) * 5)) this.audio.play('dh-tick', { gain: 0.7, rate: Math.floor(this.t * 5) % 2 ? 1 : 0.8 });
      const alpha = this.paused ? 1 : Math.min(1, this.acc / DT);
      const R = this.race;
      for (const H of this.allViews()) this._camera(H, dt, alpha);
      this.camera.position.copy(this.hv[0].camera.position); this.camera.quaternion.copy(this.hv[0].camera.quaternion);
      // the soft-body budget: none in a race. Every plush is frozen and the
      // trick / taunt / hit poses are the rig's (render/racer.js); the soft
      // bodies wake only on the podium and the select turntable
      this.rviews.forEach((v) => { v.mayWake = false; v.racing = true; });
      const near = new THREE.Vector3();
      const vs = this.allViews();
      R.karts.forEach((K, i) => {
        const v = this.rviews[i], pose = this._pose(K, this.prev[i], alpha);
        // LOD: against the nearest of the cameras
        let best = vs[0].camera.position, bd = 1e18;
        for (const H of vs) { const d = (H.camera.position.x - pose.x) ** 2 + (H.camera.position.z - pose.z) ** 2 + (H.camera.position.y - pose.y) ** 2; if (d < bd) { bd = d; best = H.camera.position; } }
        near.copy(best);
        v.update(this.paused ? 0 : rdt, K, pose, near, this.hv[0].camera.quaternion);
        if (!this.paused) this.fx.kartTrail(K, v, rdt);
      });
      this.fx.camPos = this.hv[0].camera.position;
      this.fx.update(this.paused ? 0 : rdt, this.hv[0].camera.quaternion, R.karts, this.rviews);
      for (const H of this.hv) { this._hud(H); if (render) this._propCues(H, R, R.karts[H.i]); }
      this.hum.update(R.karts, this.cpus[this.me] ? -1 : this.me, this.hv[0].camera.position);
      this.world.race?.(R, this.paused ? 0 : rdt, this);
      const humansIn = this.hv.every((H) => R.karts[H.i].fin) || this.cpus[this.me];
      if (this.resultsAt && this.t > this.resultsAt && (R.phase === 'done' || humansIn) && !this.slowmo) {
        if (R.phase !== 'done') R._end();
        this.hum.stop();
        this.ghostEnd?.();
        this.toResults();
      }
    } else if (this.screen === 'results' || this.screen === 'cup') {
      this._podium(dt);
      this.fx?.update(dt, this.camera.quaternion, this.race.karts, this.rviews);
    } else {
      this._idleCam(dt);
    }
    if (this.screen !== 'results' && this.screen !== 'cup' && this.podiumMeshes) this.podiumMeshes.visible = false;
    this._bubbles();
    this.world.update(dt, this.t);
    $('dark').style.opacity = this.screen === 'race' ? '0' : '0';
    const js = performance.now() - t0;
    if (render && this.screen !== 'setup') {
      const r0 = performance.now();
      this._render();
      this.renderMs.push(performance.now() - r0);
      if (this.renderMs.length > 600) this.renderMs.shift();
    }
    this.frameMs.push(js);
    if (this.frameMs.length > 600) this.frameMs.shift();
  }

  /* one render per view (split screen: viewports + scissor) */
  _render() {
    const r = this.renderer;
    const vs = this.screen === 'race' && this.hv.length > 1 ? this.allViews() : null;
    if (!vs) { r.render(this.scene, this.screen === 'race' && this.hv.length ? this.hv[0].camera : this.camera); return; }
    const W = innerWidth, H = innerHeight;
    r.setScissorTest(true);
    for (const V of vs) {
      const [x, y, w, h] = V.rect;
      const px = Math.round(x * W), py = Math.round(y * H), pw = Math.round(w * W), ph = Math.round(h * H);
      // the backends agree on a top-left origin here (three's WebGPURenderer)
      r.setViewport(px, py, pw, ph); r.setScissor(px, py, pw, ph);
      // the particles and plush lights face this view's camera
      this.fx?.face?.(V.camera.quaternion);
      r.render(this.scene, V.camera);
    }
    r.setScissorTest(false);
    r.setViewport(0, 0, W, H);
  }

  /* gamepads and phones in the menus */
  _menuPads() {
    if (this.screen === 'race' && !this.paused) {
      // START / Options on a gamepad pauses
      for (const g of gamepads()) { const b = !!g.buttons[9]?.pressed; if (b && !this.gpPrev[`s${g.index}`]) this.togglePause(); this.gpPrev[`s${g.index}`] = b; }
      return;
    }
    for (const g of gamepads()) {
      const b = (i) => !!g.buttons[i]?.pressed;
      const now = { left: (g.axes[0] || 0) < -0.6 || b(14), right: (g.axes[0] || 0) > 0.6 || b(15), up: (g.axes[1] || 0) < -0.6 || b(12), down: (g.axes[1] || 0) > 0.6 || b(13), confirm: b(0), cancel: b(1), next: b(5), prev: b(4), start: b(9) };
      const prev = this.gpPrev[g.index] || {};
      this.gpPrev[g.index] = now;
      const owner = this.players.find((p) => p.ctl.gamepad()?.index === g.index) || null;
      for (const a in now) {
        if (!now[a] || prev[a]) continue;
        if (this.screen === 'race') { if (a === 'start') this.togglePause(); continue; }
        if (!owner && this.screen === 'select' && (a === 'confirm' || a === 'start')) { this.addPlayer({ gp: g.index }); this.audio.ui('confirm'); continue; }
        this.menu(owner, a);
      }
    }
  }

  /* The title camera drifts around the world; the lobby holds a three-quarter view. */
  _idleCam(dt) {
    const I = this.world.info;
    if (this.screen === 'select' && this.turn) {
      const v = this.turn, [x, y, z] = I.turn;
      v.update(dt, { lobby: true, fwd: 0, drift: 0, steer: 0, air: 0, spinT: 0, boostT: 0, caseT: 0, wobT: 0, x, y, z }, { x, y, z, yaw: -Math.PI / 6 }, this.camera.position, this.camera.quaternion);
      this.camera.fov = 40; this.camera.updateProjectionMatrix();
      this.camera.position.set(x + 1.2, y + 4.2, z + 12.25);
      this.camera.lookAt(x - 0.4, y + 0.23, z);
      return;
    }
    // title: the whole world as a diorama, swaying slowly
    const a = Math.sin(this.t * 0.07) * 0.22, T = I.title;
    this.camera.fov = 50; this.camera.updateProjectionMatrix();
    this.camera.position.set(T.c[0] + Math.sin(a) * T.r, T.y, Math.cos(a) * T.r + T.c[1]);
    this.camera.lookAt(...T.look);
    this.cam.pos.copy(this.camera.position);
  }

  /* ── the phone pads (src/pad/) ───────────────────────────────────────
     The first phone shares Player 1 with the keyboard (as in PF2); every
     other phone is a player of its own (up to four in all). */
  padSeat(k, on) {
    if (on) {
      if (this.playerOfPhone(k)) return;
      // a phone coming back (it slept, the page reloaded): its own player again
      const lost = this.players.find((p) => p.lostPhone === k);
      const p1 = this.players[0];
      if (lost) { lost.phone = k; lost.lostPhone = undefined; }
      else if (p1.phone < 0 && p1.lostPhone === undefined && !this.players.some((p) => p.phone >= 0 || p.lostPhone !== undefined) && this.players.length === 1) p1.phone = k;
      else if ((this.screen === 'title' || this.screen === 'select') && this.players.length < MAXP) this.addPlayer({ phone: k });
      const p = this.playerOfPhone(k);
      if (p) this.pads.send(k, { t: 'seat', k, who: `P${this.num(p) + 1}` });
      else this.pads.send(k, { t: 'full' });
    } else {
      const p = this.playerOfPhone(k);
      if (!p) return;
      // keep the player a while: phones drop and come back
      p.lostPhone = k; p.lostAt = this.t; p.phone = -1;
    }
    this._playersChanged();
  }
  /* a phone that hasn't come back in 8 s (outside a race): its player goes */
  _lostPhones() {
    if (this.screen === 'race') return;
    for (const p of this.players.slice()) {
      if (p.lostPhone === undefined || this.t - p.lostAt < 8) continue;
      p.lostPhone = undefined;
      if (this.num(p) > 0 && p.ctl.map === 'none' && p.ctl.gp === null) this.removePlayer(p);
    }
  }
  padSeatName(k) { const p = this.playerOfPhone(k); return p ? `P${this.num(p) + 1}` : ''; }
  padMode() { /* the phone steers by stick or tilt: its own business (the stick-X byte either way) */ }
  padPress(k, pressed) {
    const p = this.playerOfPhone(k);
    if (!p) return;
    if (this.screen === 'race') { if (pressed & START) this.togglePause(); return; }
    const acts = [];
    if (pressed & LEFT) acts.push('left');
    if (pressed & RIGHT) acts.push('right');
    if (pressed & UP) acts.push('up');
    if (pressed & DOWN) acts.push('down');
    if (pressed & (GAS | ITEM | SUPER)) acts.push('confirm');
    if (pressed & START) acts.push('start');
    if (pressed & BRAKE) acts.push('cancel');
    for (const a of acts) this.menu(p, a);
  }
  padSelect(k, m) {
    const p = this.playerOfPhone(k);
    if (!p) return;
    if (this.screen === 'setup') {
      if (this.num(p) === 0 && m.trk) this.cycleTrack(1);
      else if (this.num(p) === 0 && m.lock) this.go();
      return;
    }
    if (this.screen !== 'select') return;
    if (p.locked) { if (m.lock) this.menu(p, 'cancel'); return; }
    if (m.dx) this.menu(p, m.dx < 0 ? 'left' : 'right');
    if (typeof m.alt === 'boolean' && SLOTS[p.sel].alt !== m.alt) this.menu(p, 'up');
    if (m.lock) this.menu(p, 'confirm');
  }
  padSheet() {}
  padView(k) {
    const p = this.playerOfPhone(k);
    const scr = this.screen;
    if (!p) return { scr, skin: 'kevalanche' };
    let S = SLOTS[p.sel];
    const j = this.num(p);
    const v = { scr, who: `P${j + 1}`, pick: scr === 'select', name: RACERS[S.id].name, locked: p.locked, alt: S.alt };
    if (scr === 'setup' && j === 0) v.trk = CHOICES[this.choice].name;
    if (scr === 'race' && this.race) {
      const H = this.hv.find((h) => this.humanP[h.j] === p);
      if (H) { const K = this.race.karts[H.i]; S = { id: K.id, alt: K.alt }; v.place = K.place; v.lap = `${this.race.lapOf(K)}/${this.race.laps}`; }
    }
    v.fid = S.id; v.skin = skinId(S.id, S.alt);
    return v;
  }

  /* ── the ghost: your best lap on this track, replayed beside you ──────
     Single-player races record P1's kart every other tick; a lap faster
     than the stored best replaces it (localStorage, per track). The next
     lap, a pale see-through kart drives the best one in step with you. */
  ghostStart() {
    const G = (this.ghost = this.ghost || { mesh: this._ghostMesh(), best: {} });
    G.on = this.hv.length === 1;
    G.mesh.visible = false;
    G.rec = null; G.pos = null;
    if (!G.on) return;
    const id = this.trackId;
    if (!(id in G.best)) {
      G.best[id] = null;
      try { const j = JSON.parse(globalThis.localStorage?.getItem(`downhill.ghost.v${id === 'landing' ? 2 : 3}.${id}`) || 'null'); if (j && j.t > 0 && typeof j.d === 'string') G.best[id] = { t: j.t, d: decode16(j.d) }; } catch { /* no storage: no ghost */ }
    }
  }
  _ghostMesh() {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: '#bfe8ff', transparent: true, opacity: 0.32, depthWrite: false });
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 4.6), m); body.position.y = 1.1; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 10), m); head.position.set(0, 2.9, -0.4); g.add(head);
    for (const [x, z] of [[-1.6, 1.5], [1.6, 1.5], [-1.6, -1.5], [1.6, -1.5]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.6, 12), m); w.rotation.z = Math.PI / 2; w.position.set(x, 0.7, z); g.add(w); }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.12, 6, 18), new THREE.MeshBasicMaterial({ color: '#e8f8ff', transparent: true, opacity: 0.6, depthWrite: false })); halo.rotation.x = Math.PI / 2; halo.position.set(0, 4.4, -0.4); g.add(halo);
    g.visible = false; g.renderOrder = 5;
    this.scene.add(g);
    return g;
  }
  ghostTick() {
    const G = this.ghost;
    if (!G?.on || !this.race) return;
    const R = this.race, K = R.karts[this.me], N = R.T.N;
    if (R.phase !== 'race' || K.fin && !G.rec) return;
    const lap = Math.floor(K.kc / N);
    if (!G.rec || lap !== G.rec.lap) {
      // a lap just ended: the best one on this track is kept
      if (G.rec && lap === G.rec.lap + 1 && G.rec.lap >= 0 && !G.rec.fished) {
        const t = R.tick - G.rec.t0, best = G.best[this.trackId];
        if (!best || t < best.t) {
          const d = Int16Array.from(G.rec.buf);
          G.best[this.trackId] = { t, d };
          try { globalThis.localStorage?.setItem(`downhill.ghost.v${this.trackId === 'landing' ? 2 : 3}.${this.trackId}`, JSON.stringify({ t, d: encode16(d) })); } catch { /* full or blocked: fine */ }
          if (best) this.toast(this.hv[0], 'NEW BEST LAP!', '#bfe8ff');
        }
      }
      G.rec = K.fin ? null : { lap, t0: R.tick, buf: [], fished: false };
      if (!G.rec) { G.mesh.visible = false; return; }
    }
    if (K.fish) G.rec.fished = true;
    if ((R.tick - G.rec.t0) % 2 === 0 && G.rec.buf.length < 60 * 300 * 2) G.rec.buf.push(Math.round(K.x * 8), Math.round(K.y * 8), Math.round(K.z * 8), Math.round(K.yaw * 1000) % 32000);
    // play the best lap back in step
    const best = G.best[this.trackId];
    if (!best || G.rec.lap < 0) { G.mesh.visible = false; G.pos = null; return; }
    const f = (R.tick - G.rec.t0) / 2, i = Math.floor(f), n = best.d.length / 4;
    if (i + 1 >= n) { G.mesh.visible = false; G.pos = null; return; }
    const a = f - i, d = best.d, q = i * 4, q2 = q + 4;
    const x = lerp(d[q], d[q2], a) / 8, y = lerp(d[q + 1], d[q2 + 1], a) / 8, z = lerp(d[q + 2], d[q2 + 2], a) / 8, yaw = angLerp(d[q + 3] / 1000, d[q2 + 3] / 1000, a);
    G.mesh.visible = true;
    G.mesh.position.set(x, y, z); G.mesh.rotation.y = yaw;
    G.pos = { x, z };
    // fade out when you're on top of it
    const dd = Math.hypot(K.x - x, K.z - z);
    G.mesh.children.forEach((c) => { c.material.opacity = Math.min(0.32, 0.06 + dd * 0.03); });
  }
  ghostEnd() { if (this.ghost) { this.ghost.mesh.visible = false; this.ghost.rec = null; } }

  /* ── the photo finish: a human and a rival about to cross the line
     together on the last lap → slow motion, a side-on camera at the line,
     and the flash. Once a race. */
  photoCheck() {
    const R = this.race;
    if (this.slowmo || this.photoDone || R.phase !== 'race' || this.cpus[this.me]) return;
    const N = R.T.N, end = R.laps * N;
    for (const H of this.hv) {
      const K = R.karts[H.i];
      if (K.fin || end - K.kc > 22 || end - K.kc < 2) continue;
      const rival = R.karts.find((O) => O !== K && !O.fin && Math.abs(O.kc - K.kc) < 6 && end - O.kc < 24);
      if (rival) { this.slowmo = { k: 0.22, t: 2.2, i: H.i, j: rival.i }; this.photoDone = true; this.audio.play('dh-tier', { rate: 0.5, gain: 0.8 }); document.body.classList.add('photo'); return; }
    }
  }
  slowmoStep(dt) {
    if (!this.slowmo) { this.photoCheck?.(); return; }
    const S = this.slowmo;
    S.t -= dt;
    if (S.t <= 0) {
      this.slowmo = null;
      document.body.classList.remove('photo');
      const f = $('flash'); if (f) { f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }
      this.audio.play('dh-bonk', { rate: 2.2, gain: 0.7 });
    }
  }
  /* the side-on camera at the line, for the photo finish */
  slowmoCam(H) {
    const R = this.race, T = R.T, k = R.startK, S = this.slowmo;
    if (!S || (H.i !== S.i && !H.tv)) return;
    const side = T.w[k] + T.m[k] + 6;
    const cx = T.x[k] + rightX(T, k) * side, cz = T.z[k] + rightZ(T, k) * side, cy = T.y[k] + 3.2;
    const K = R.karts[S.i];
    H.camera.position.set(cx - T.tx[k] * 4, cy, cz - T.tz[k] * 4);
    H.camera.lookAt(K.x * 0.5 + T.x[k] * 0.5, T.y[k] + 1.6, K.z * 0.5 + T.z[k] * 0.5);
    H.camera.fov = 46; H.camera.updateProjectionMatrix();
  }

  /* tools/shots.mjs: stage one item mid-effect, in front of the camera */
  shotItem(it) {
    const A = this, R = this.race, T = R.T, N = T.N, me = this.me;
    A.step(3.8, false);
    const k0 = R._nearest(T.def.shotAt || [-64 * 1.8, 0, 30 * 1.8]);
    const put = (i, dk, d) => {
      const K = R.karts[i], k = (k0 + dk + N) % N;
      K.x = T.x[k] + rightX(T, k) * d; K.z = T.z[k] + rightZ(T, k) * d; K.y = T.y[k]; K.k = k;
      K.yaw = Math.atan2(T.tx[k], T.tz[k]); K.vx = K.vz = K.fwd = 0; K.kc = (k0 - R.startK + N) % N + dk; K.air = 0; K.drift = 0; K.boostT = 0; K.invT = 0;
      this.prev[i] = { x: K.x, y: K.y, z: K.z, yaw: K.yaw };
    };
    const still = () => ({ steer: 0, gas: false, brake: false, drift: false, item: false, taunt: false, back: false });
    const drive = (i) => ({ think: () => ({ ...still(), gas: true, steer: 0 }), level: 'stub', i });
    // everyone off to the side, far behind, except the actors
    R.karts.forEach((K, i) => { if (i !== me) { put(i, -160 - i * 8, (i % 2 ? 1 : -1) * 4); this.cpus[i] = { think: still }; } });
    put(me, 0, 0);
    const others = R.karts.map((K) => K.i).filter((i) => i !== me);
    const [a, b] = others;
    let pre = 0.05, post = 0.3;
    const ctl = this.humanP[0].ctl;
    ctl.sample = () => ({ ...still(), item: this._fire > 0 && this._fire-- > 0, back: !!this._back });
    if (it === 'slick') { put(a, -16, 0); this.cpus[a] = drive(a); this._back = true; post = 0.75; }
    else if (it === 'missile') {
      // dead ahead along the thrower's nose (the track may bend away)
      put(a, 18, 0);
      const M = R.karts[me], A2 = R.karts[a];
      A2.x = M.x + Math.sin(M.yaw) * 18; A2.z = M.z + Math.cos(M.yaw) * 18; this.prev[a] = { x: A2.x, y: A2.y, z: A2.z, yaw: A2.yaw };
      post = 0.28;
    }
    else if (it === 'espresso') { ctl.sample = () => ({ ...still(), gas: true, item: this._fire > 0 && this._fire-- > 0 }); post = 0.45; }
    else if (it === 'cuffs') { put(a, 9, -3); put(b, 12, 3); post = 1.4; }
    else if (it === 'case') { put(a, 9, 0); post = 0.7; }
    else if (it === 'alarm') { put(a, 22, 0); post = 0; }
    else if (it === 'sugar') { ctl.sample = () => ({ ...still(), gas: true, item: this._fire > 0 && this._fire-- > 0 }); post = 0.9; }
    else if (it === 'plane') { put(a, 70, 2); post = 0.5; }
    else if (it === 'wash') { put(a, 7, -4); put(b, 10, 4); post = 0.75; }
    else if (it === 'spring') { put(a, 14, 0); post = 0.55; }
    R._place();
    const K = R.karts[me];
    K.item = it; K.roulette = 0;
    if (it === 'spring' && this._lockOnly) { A.step(0.4, false); A.step(1 / 60); return true; }
    A.step(pre, false);
    this._fire = 2;
    if (it === 'alarm') {
      let n = 0;
      while (!this.fx.scares.length && n++ < 600) A.frame(1 / 60, false);
      A.step(0.25, false);
    } else A.step(post, false);
    A.step(1 / 60);
    return it === 'alarm' ? this.fx.scares.length > 0 : true;
  }

  loop() {
    let last;
    const f = (now) => {
      const dt = last === undefined ? 0 : (now - last) / 1000;
      last = now;
      this.frame(dt);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }

  /* tools: step the whole app by `secs` in 1/60 frames, rendering the last */
  step(secs, render = true) {
    const n = Math.max(1, Math.round(secs * 60));
    for (let i = 0; i < n; i++) this.frame(1 / 60, render && i === n - 1);
  }
}

async function start() {
  // the phone pad: the same page, ?pad=CODE (no renderer, no game)
  if (Q.has('pad')) { runPad(Q); return; }
  const [{ renderer, canvas }] = await Promise.all([
    makeRenderer($('stage')),
    document.fonts.load('700 51px "Bolster Condensed"'),
    document.fonts.load('58px "Bolster Hand"'),
    document.fonts.load('105px Bungee'),
    document.fonts.load('28px "Archivo Black"'),
    document.fonts.load('700 15px "Barlow Condensed"'),
    document.fonts.load('102px "Bolster Display"'),
  ]);
  const app = new App(renderer, canvas);
  window.__dh = app;
  // the deep links
  const picks = [];
  for (let n = 1; n <= MAXP; n++) {
    const id = racerId(Q.get(`p${n}`));
    if (!id && n > 1) break;
    if (n > 1 && !app.players[n - 1]) { if (n === 2) app.players[0].ctl.map = 'left'; app.addPlayer({ kb: n === 2 ? 'right' : null, gp: n > 2 ? n - 2 : null }); }
    picks.push({ id: id || 'kevalanche', alt: Q.get(`alt${n}`) === '1', p: app.players[n - 1] });
  }
  if (racerId(Q.get('p1')) || Q.has('p1cpu')) {
    const pc = Q.get('p1cpu');
    const track = TRACKS[Q.get('track')] ? Q.get('track') : 'landing';
    if (Q.get('cup')) { app.cup = { race: 0, tracks: CUP.slice(), pts: new Map(), field: null }; }
    app.startRace({ picks, track: app.cup ? CUP[0] : track, cpu: Q.get('cpu') || undefined, p1cpu: pc ? (['easy', 'normal', 'hard'].includes(pc) ? pc : 'hard') : null });
  } else if (Q.get('screen') === 'select') app.toSelect();
  else app.setScreen('title');
  app.frame(1 / 60);
  document.body.classList.add('is-live');
  if (!app.hold) app.loop();
}

start().catch((e) => { console.error(e); $('loading').textContent = 'This browser cannot run Fluffed and Furious (WebGL 2 needed).'; });
