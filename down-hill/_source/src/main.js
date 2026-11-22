/* Down Hill — a Pillow Fight kart race. The app: the renderer and the room,
   the screens (title → select → countdown → race → results), the chase
   camera, the HUD, and the glue that turns the race's events into
   feathers, sparks, grunts, bubbles and music.

   Deep links: ?p1=kevalanche&alt1=1&cpu=hard&track=landing (straight into
   a race), p1cpu=LEVEL (the player's kart drives itself), seed=N, hold (no
   free-running loop; tools step window.__dh), screen=select, webgl (force
   WebGL 2), laps=N.                                                      */

import * as THREE from 'three/webgpu';
import { makeRenderer } from './render/renderer.js';
import { World, BED } from './render/world.js';
import { RacerView } from './render/racer.js';
import { Fx, TIER_COLORS } from './render/fx.js';
import { Race, DT, ROULETTE, ITEMS, ITEM_NAMES, COUNT_TICKS } from './race/sim.js';
import { CPU } from './race/cpu.js';
import { buildTrack, TRACKS, rightX, rightZ } from './race/track.js';
import { RACERS, ORDER, racerId, WEIGHTS } from './race/roster.js';
import { Controls } from './input/controls.js';
import { AudioEngine } from './audio/engine.js';
import { CLIPS } from './audio/clips.js';
import { Hum } from './audio/hum.js';
import { say, dismiss, place } from './ui/bubble.js';
import { tauntLine, koLine } from './ui/lines.js';
import { ICONS, FEATHER, CLOCK_SCARE } from './ui/icons.js';
import { unpackRows } from './render/readback.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const ORD = (n) => n + (['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || 'th');
const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
const lerp = (a, b, t) => a + (b - a) * t;
const angLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

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

class App {
  constructor(renderer, canvas) {
    this.renderer = renderer; this.canvas = canvas;
    this.hold = Q.has('hold');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.3, 1400);
    this.T = buildTrack(TRACKS[Q.get('track')] || TRACKS.landing);
    this.world = new World(this.scene, this.T);
    this.views = new Map();
    this.controls = new Controls();
    this.audio = new AudioEngine({ storage: globalThis.localStorage, clips: CLIPS });
    this.hum = new Hum(this.audio);
    this.screen = 'title';
    this.t = 0;
    this.sel = 0;
    this.level = ['easy', 'normal', 'hard'].includes(Q.get('cpu')) ? Q.get('cpu') : 'normal';
    this.seed = +(Q.get('seed') || 0) || ((Date.now() & 0xffff) + 1);
    this.bubbles = [];
    this.cam = { pos: new THREE.Vector3(-30, 40, 120), look: new THREE.Vector3(-18, 20, 0), fov: 64, shake: 0 };
    this.frameMs = [];
    this.raceN = 0;
    addEventListener('resize', () => this.resize());
    addEventListener('keydown', (e) => this.key(e));
    addEventListener('pointerdown', () => this.audio.unlock());
    this.resize();
    this._buildCards();
    this._diff();
    this.world.setStart(new Race({ racers: [{ id: 'k8e' }], seed: 1, humans: [] }).startK);
    this.minimap = this._minimapBase();
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  /* a racer's view (kart + plush), built once and kept */
  view(id, alt) {
    const key = `${id}:${alt ? 1 : 0}`;
    let v = this.views.get(key);
    if (!v) { v = new RacerView(this.scene, id, alt); this.views.set(key, v); }
    v.group.visible = true;
    return v;
  }
  hideViews() { for (const v of this.views.values()) v.group.visible = false; }

  setScreen(s) {
    this.screen = s;
    document.body.dataset.screen = s;
    for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === s || (s === 'race' && el.id === 'hud'));
    document.body.classList.toggle('racing', s === 'race');
    if (s === 'title' || s === 'select') this.audio.music('menu');
  }

  /* ── input outside the race ── */
  key(e) {
    this.audio.unlock();
    const c = e.code;
    if (c === 'KeyM') { this.audio.toggleMute(); return; }
    if (this.screen === 'title') { if (c === 'Enter' || c === 'Space') { this.audio.ui('confirm'); this.toSelect(); } return; }
    if (this.screen === 'select') {
      const s = this.sel, col = s % 7, row = Math.floor(s / 7);
      if (c === 'ArrowLeft' || c === 'KeyA') this.pick(row * 7 + (col + 6) % 7);
      else if (c === 'ArrowRight' || c === 'KeyD') this.pick(row * 7 + (col + 1) % 7);
      else if (c === 'ArrowUp' || c === 'KeyW' || c === 'ArrowDown' || c === 'KeyS') this.pick((1 - row) * 7 + col);
      else if (c === 'Digit1' || c === 'Digit2' || c === 'Digit3') { this.level = ['easy', 'normal', 'hard'][+c.slice(5) - 1]; this._diff(); this.audio.ui('tick'); }
      else if (c === 'Enter' || c === 'Space') { this.audio.ui('confirm'); const S = SLOTS[this.sel]; this.startRace({ p1: S.id, alt1: S.alt }); }
      else if (c === 'Escape') this.toTitle();
      return;
    }
    if (this.screen === 'race') {
      if (c === 'Escape' || c === 'KeyP') this.togglePause();
      else if (this.paused && c === 'KeyR') { this.togglePause(); this.startRace(this.last); }
      else if (this.paused && c === 'KeyQ') { this.togglePause(); this.toSelect(); }
      return;
    }
    if (this.screen === 'results') {
      if (c === 'Enter' || c === 'Space') { this.audio.ui('confirm'); this.startRace(this.last); }
      else if (c === 'Escape') this.toSelect();
    }
  }

  togglePause() {
    this.paused = !this.paused;
    $('pause').classList.toggle('on', this.paused);
    this.audio.pause(this.paused);
    this.controls.clear();
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
      d.innerHTML = `<div class="sw"></div>${S.alt ? '<span class="alt">ALT</span>' : ''}<div class="lab">${R.name}</div>`;
      d.addEventListener('click', () => { if (this.sel === i) { const s = SLOTS[i]; this.startRace({ p1: s.id, alt1: s.alt }); } else this.pick(i); });
      box.appendChild(d);
    });
  }
  _diff() {
    const box = $('diff');
    for (const p of box.querySelectorAll('.pill')) p.remove();
    for (const l of ['easy', 'normal', 'hard']) {
      const b = document.createElement('div');
      b.className = 'pill' + (l === this.level ? ' sel' : ''); b.textContent = l;
      b.addEventListener('click', () => { this.level = l; this._diff(); });
      box.appendChild(b);
    }
  }
  toSelect() {
    this.clearRace();
    this.setScreen('select');
    this.pick(this.sel);
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
      const spot = [-40, 0.2, 90];
      for (let i = 0; i < SLOTS.length; i++) {
        const S = SLOTS[i];
        const v = this.view(S.id, S.alt);
        const vis = v.group.visible, inRace = this.screen === 'race';
        if (inRace) break;
        const old = v.group.position.clone(), oldR = v.group.rotation.y;
        v.update(1 / 60, { fwd: 0, drift: 0, steer: 0, air: 0, spinT: 0, boostT: 0, caseT: 0, wobT: 0 }, { x: spot[0], y: spot[1], z: spot[2], yaw: 0.55 }, cam.position, cam.quaternion);
        v.group.visible = true;
        const tall = S.id === 'k8e' ? 1.3 : 1;
        cam.position.set(spot[0] + 2.0, spot[1] + 3.6 * tall, spot[2] + 5.6 * tall);
        cam.lookAt(spot[0] + 0.1, spot[1] + 2.0 * tall, spot[2]);
        v.update(0, { fwd: 0, drift: 0, steer: 0, air: 0, spinT: 0, boostT: 0, caseT: 0, wobT: 0 }, { x: spot[0], y: spot[1], z: spot[2], yaw: 0.55 }, cam.position, cam.quaternion);
        r.setRenderTarget(rt); r.render(this.scene, cam); r.setRenderTarget(null);
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
  pick(i) {
    this.sel = i;
    const S = SLOTS[i], R = RACERS[S.id], W = WEIGHTS[R.weight];
    for (const c of document.querySelectorAll('.card')) c.classList.toggle('c1', +c.dataset.slot === i);
    $('s-name').textContent = R.name;
    $('s-animal').textContent = `${R.animal} · ${S.alt ? R.altName.split('— ')[1] : 'the original'} · ${R.weight}`;
    $('s-kart').textContent = S.alt ? R.altKart : R.kartName;
    $('s-blurb').textContent = R.blurb;
    const bar = (v) => `<div class="bar"><i style="width:${Math.round(v * 100)}%"></i></div>`;
    $('s-stats').innerHTML = `<span>Speed</span>${bar((W.top - 26.5) / 2.6)}<span>Accel</span>${bar((W.accel - 13) / 4.5)}<span>Handling</span>${bar((W.grip - 0.85) / 0.25)}<span>Weight</span>${bar((W.mass - 0.6) / 0.85)}`;
    this.audio.ui('tick');
    this.hideViews();
    this.turn = this.view(S.id, S.alt);
    this.turnA = this.turnA || 0;
  }

  /* ── the race ── */
  clearRace() {
    if (this.fx) { this.fx.root.removeFromParent(); for (const p of [this.fx.feathers, this.fx.glows, this.fx.balls]) p.mesh.removeFromParent(); }
    this.fx = null; this.race = null;
    for (const b of this.bubbles) dismiss(b.el);
    this.bubbles = [];
    this.hum.stop();
    $('fabric').classList.remove('on');
    document.body.classList.remove('looking');
  }

  startRace(o) {
    this.clearRace();
    this.last = o;
    const p1 = racerId(o.p1) || 'kevalanche', alt1 = !!o.alt1;
    // the field: the player, the six other fighters (OG or ALT, mixed), and the player's own twin
    const seed = o.seed ?? (this.raceN ? this.seed + this.raceN * 977 : this.seed);
    this.raceN++;
    let r = seed >>> 0;
    const rnd = () => { r = (Math.imul(r ^ (r >>> 15), 2246822507) + 0x9e3779b9) >>> 0; return r / 4294967296; };
    const others = ORDER.filter((id) => id !== p1).map((id) => ({ id, alt: rnd() < 0.4 }));
    others.push({ id: p1, alt: !alt1 });
    for (let i = others.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [others[i], others[j]] = [others[j], others[i]]; }
    const level = o.cpu || this.level;
    const p1cpu = o.p1cpu || null;
    const racers = [...others.map((x) => ({ ...x, cpu: level })), { id: p1, alt: alt1, cpu: p1cpu }];
    const human = racers.length - 1;
    this.me = human;
    this.race = new Race({ racers, seed, humans: p1cpu ? [] : [human], laps: o.laps || +Q.get('laps') || null });
    this.cpus = this.race.karts.map((K) => (K.cpu ? new CPU(this.race, K.i, K.cpu, seed) : null));
    this.hideViews();
    this.rviews = this.race.karts.map((K) => this.view(K.id, K.alt));
    this.fx = new Fx(this.scene, this.race);
    this.world.setStart(this.race.startK);
    this.prev = this.race.karts.map((K) => ({ x: K.x, y: K.y, z: K.z, yaw: K.yaw }));
    this.acc = 0;
    this.lastItem = null; this.finalShown = false; this.resultsAt = 0;
    this.camMode = 'chase';
    const K = this.race.karts[human];
    this.cam.pos.set(K.x - Math.sin(K.yaw) * 30, K.y + 14, K.z - Math.cos(K.yaw) * 30);
    this.cam.look.set(K.x, K.y + 2, K.z);
    this.introT = 0;
    this.setScreen('race');
    $('h-count').textContent = '';
    this.audio.music(null);
    this.audio.setIntense(false);
  }

  /* one sim tick: inputs (keyboard/pad for the human, the CPUs think), step, events */
  tick() {
    const R = this.race;
    this.prev = R.karts.map((K) => ({ x: K.x, y: K.y, z: K.z, yaw: K.yaw }));
    const inputs = R.karts.map((K, i) => {
      if (this.cpus[i]) return this.cpus[i].think();
      if (R.karts[i].fin) return this._autopilot(i);
      return this.controls.sample();
    });
    if (this.me != null && !this.cpus[this.me]) this.lookBack = !!inputs[this.me]?.back;
    R.step(inputs);
    for (const e of R.events) this.onEvent(e);
    R.events.length = 0;
  }
  _autopilot(i) { if (!this.auto) this.auto = {}; if (!this.auto[i]) this.auto[i] = new CPU(this.race, i, 'normal', 3); return this.auto[i].think(); }

  /* ── race events → feathers, sparks, sound, bubbles ── */
  onEvent(e) {
    const R = this.race, A = this.audio, me = this.me;
    const K = e.i != null ? R.karts[e.i] : null, V = e.i != null ? this.rviews[e.i] : null;
    const near = K ? this._dist(K) < 60 : true;
    const mine = e.i === me;
    const g = (x) => (mine ? 1 : near ? 0.6 * x : 0);
    switch (e.k) {
      case 'count': $('h-count').textContent = e.n; $('h-count').className = 'count'; A.play('dh-beep'); break;
      case 'go': $('h-count').textContent = 'GO!'; $('h-count').className = 'count go'; A.play('dh-go'); A.music('race'); setTimeout(() => { if ($('h-count').textContent === 'GO!') $('h-count').textContent = ''; }, 900); break;
      case 'hit': {
        const c = (K.alt ? ALT_COLORS : COLORS)[K.id];
        this.fx.burst(K.x, K.y + 2, K.z, ['#ffffff', '#ffffff', c[0], c[1], '#ffd1e0'], e.kind === 'alarm' ? 44 : 30, e.kind === 'missile' ? 11 : 8);
        V.hit();
        if (near) { A.play('dh-grunt', { rate: RACERS[K.id].voice * (K.alt ? 0.85 : 1), gain: g(1) }); A.play('dh-spin', { gain: g(0.8) }); A.play('feather-burst', { gain: g(0.8) }); }
        if (e.kind === 'missile' && near) A.play('dh-bonk', { gain: g(1) });
        if (mine) { this.cam.shake = 0.6; this.toast(e.kind === 'slick' ? 'SLICKED!' : e.kind === 'alarm' ? 'WAKE UP!' : 'BONK!', '#ff3b6b'); }
        break;
      }
      case 'use': if (near) A.play(e.item === 'espresso' ? 'dh-boost' : e.item === 'cuffs' ? 'dh-clink' : e.item === 'alarm' ? 'dh-tick' : 'dh-throw', { gain: g(1) }); if (e.item === 'espresso') this.fx.burst(K.x, K.y + 3, K.z, ['#5a3218', '#f4efe6'], 10, 4); break;
      case 'gotItem': if (mine) A.play('dh-get'); break;
      case 'box': { const B = R.boxes[e.b]; this.fx.sparks(B.x, B.y, B.z, '#ffd84a', 12, 7, 0.9, 0.5); this.fx.burst(B.x, B.y, B.z, ['#ff3b6b', '#3ff0c8', '#ffd84a'], 8, 5); if (near) A.play('dh-pad', { gain: g(0.5), rate: 1.3 }); break; }
      case 'boost': if (near) A.play('dh-boost', { gain: g(e.tier ? 0.9 : 0.7) }); if (e.tier) this.fx.sparks(K.x, K.y + 1, K.z, TIER_COLORS[e.tier], 14, 6, 1.0, 0.45); break;
      case 'tier': if (mine) A.play('dh-tier', { rate: 0.8 + e.tier * 0.25 }); break;
      case 'drift': if (near) A.play('whoosh-light', { gain: g(0.5) }); break;
      case 'pad': if (near) A.play('dh-pad', { gain: g(1) }); this.fx.sparks(K.x, K.y + 0.5, K.z, '#ffd84a', 10, 6, 0.8, 0.4); break;
      case 'launch': if (near) A.play('jump', { gain: g(0.8) }); break;
      case 'land': if (near) A.play('land', { gain: g(0.4 + e.hard * 0.6) }); V.land(e.hard); if (e.hard > 0.3) this.fx.burst(K.x, K.y + 0.3, K.z, ['#ffffff', '#e7e0f0'], 6, 4); break;
      case 'trick': {
        V.taunt(true);
        if (near) { A.play('dh-trick', { gain: g(1) }); A.play('dh-grunt', { rate: RACERS[K.id].voice * 1.25, gain: g(0.7) }); }
        if (mine || (this._dist(K) < 30 && !this.bubbles.some((b) => b.i !== me))) this.bubble(e.i, tauntLine(K.id, K.alt, this.raceN * 7 + R.tick), 1.6);
        this.fx.sparks(K.x, K.y + 2, K.z, '#ffffff', 10, 6, 0.8, 0.5);
        break;
      }
      case 'trickBoost': if (mine) this.toast('TRICK!', '#3ff0c8'); this.fx.sparks(K.x, K.y + 1, K.z, '#4dffc3', 14, 7, 0.9, 0.5); break;
      case 'taunt': {
        V.taunt(false);
        if (near) { A.play('dh-honk', { gain: g(0.8), rate: RACERS[K.id].voice }); A.play('dh-grunt', { rate: RACERS[K.id].voice * 1.2, gain: g(0.6) }); }
        if (mine || this._dist(K) < 40) this.bubble(e.i, tauntLine(K.id, K.alt, this.raceN * 5 + R.tick), 2.0);
        break;
      }
      case 'fall': if (near) A.play('crowd-ooh', { gain: g(0.7) }); if (mine) this.toast('OOPS!', '#9b5cff'); break;
      case 'fished': if (near) A.play('dh-reel', { gain: g(0.7) }); break;
      case 'alarm': {
        A.play('dh-ring', { gain: e.i === me ? 1 : near ? 0.8 : 0.4 });
        this.fx.scare(e.i);
        if (e.i === me) { A.play('dh-scare'); const s = $('scare'); s.classList.remove('on'); void s.offsetWidth; s.classList.add('on'); this.cam.shake = 1; }
        break;
      }
      case 'wobble': break;
      case 'cuffs': { A.play('dh-clink', { gain: [e.a, e.b].includes(me) ? 1 : 0.5 }); const X = R.karts[e.a]; this.fx.burst(X.x, X.y + 2, X.z, ['#ff6fb5', '#ffc0e0'], 16, 5); if ([e.a, e.b].includes(me)) this.toast('CUFFED!', '#ff6fb5'); break; }
      case 'case': if (near) A.play('dh-flap', { gain: g(1) }); if (mine) this.toast('PILLOWCASED!', '#f4efe6'); break;
      case 'pop': if (e.kind === 'missile' || e.kind === 'case') { this.fx.burst(e.x, e.y, e.z, ['#ffffff', '#ffd1e0'], 12, 6); } break;
      case 'bounce': this.fx.sparks(e.x, e.y, e.z, '#ffffff', 4, 4, 0.5); break;
      case 'fizzle': this.fx.burst(e.x, e.y, e.z, ['#ffffff'], 6, 3); break;
      case 'bump': if (Math.min(this._dist(R.karts[e.i]), this._dist(R.karts[e.j])) < 40) A.play('dh-bump', { gain: 0.4 + e.p * 0.6 }); this.fx.sparks(e.x, e.y + 1, e.z, '#ffffff', 5, 4, 0.6); if (e.i === me || e.j === me) this.cam.shake = Math.max(this.cam.shake, e.p * 0.35); break;
      case 'wall': if (mine) { A.play('dh-bump', { gain: 0.3 + e.p * 0.4, rate: 0.8 }); this.cam.shake = Math.max(this.cam.shake, e.p * 0.25); } break;
      case 'lap': if (mine && e.lap === R.laps) { const f = $('h-final'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); A.setIntense(true); A.play('dh-tier', { rate: 1.6 }); } break;
      case 'finish': if (mine) { this.toast(`${ORD(e.place)}!`, e.place === 1 ? '#ffc93a' : '#3ff0c8'); A.music(null); A.sting(e.place <= 3 ? 'win' : 'lose'); this.resultsAt = this.t + 3.5; } break;
      case 'done': if (!this.resultsAt) this.resultsAt = this.t + 2; break;
      default: break;
    }
  }

  _dist(K) { const c = this.cam.pos; return Math.hypot(K.x - c.x, K.y - c.y, K.z - c.z); }

  toast(text, color) {
    const t = $('h-toast');
    t.textContent = text; t.style.color = color; t.style.textShadow = `0 4px 0 #120d1f, 0 0 24px ${color}`;
    t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
  }

  /* a speech bubble over racer i, for `secs` */
  bubble(i, text, secs) {
    const old = this.bubbles.find((b) => b.i === i);
    if (old) { dismiss(old.el); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    if (this.bubbles.length >= 3) { const b = this.bubbles.shift(); dismiss(b.el); }
    const el = say($('bubbles'), text, -999, -999, { size: 22, maxWidth: 240, tail: 'down-left' });
    this.bubbles.push({ i, el, until: this.t + secs });
  }

  _bubbles() {
    const v = new THREE.Vector3();
    this.bubbles = this.bubbles.filter((b) => {
      if (this.t > b.until) { dismiss(b.el); return false; }
      const g = (this.rviews || [])[b.i]?.group || this.podiumBubble?.group;
      if (!g) return true;
      v.copy(g.position); v.y += 4.2;
      v.project(this.camera);
      const behind = v.z > 1;
      b.el.style.display = behind ? 'none' : '';
      place(b.el, (v.x * 0.5 + 0.5) * innerWidth + 20, (-v.y * 0.5 + 0.5) * innerHeight - 10, Math.max(0.55, Math.min(1, 30 / (this._distG(g) + 6))));
      return true;
    });
  }
  _distG(g) { return this.cam.pos.distanceTo(g.position); }

  /* ── the chase camera ── */
  _camera(dt, alpha) {
    const R = this.race, K = R.karts[this.me], P = this.prev[this.me];
    const pose = this._pose(K, P, alpha);
    const C = this.cam;
    const yaw = pose.yaw;
    const back = this.lookBack ? -1 : 1;
    const sp = Math.abs(K.fwd), top = K.S.top;
    const intro = R.phase === 'count' ? Math.max(0, 1 - R.tick / (COUNT_TICKS - 30)) : 0;
    const dist = (8.6 + sp * 0.06) * (1 + intro * 2.5);
    const h = 4.3 + intro * 9 + (K.air ? 1.2 : 0);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const want = new THREE.Vector3(pose.x - fx * dist * back, pose.y + h, pose.z - fz * dist * back);
    // under the bed: the camera stays under the slats
    const ub = want.x > BED.x0 - 4 && want.x < BED.x1 + 4 && want.z > BED.z0 && want.z < BED.z1 + 4;
    if (pose.y < BED.under && ub) want.y = Math.min(want.y, BED.under - 1.4);
    if (pose.y > BED.top - 1 && ub) want.y = Math.max(want.y, BED.top + 2.2);
    want.x = Math.max(-141, Math.min(411, want.x)); want.z = Math.max(-109, Math.min(109, want.z));
    if (K.fish) { want.set(pose.x - fx * 14, pose.y + 9, pose.z - fz * 14); }
    const k = this.lookBack !== this._lb ? 1 : Math.min(1, dt * (K.fish ? 2.5 : 7.5));
    this._lb = this.lookBack;
    C.pos.lerp(want, k);
    const look = new THREE.Vector3(pose.x + fx * 5 * back, pose.y + 1.8, pose.z + fz * 5 * back);
    C.look.lerp(look, Math.min(1, dt * 12));
    const fov = 64 + Math.min(1.3, sp / top) * 9 + (K.boostT > 0 ? 7 : 0);
    C.fov = lerp(C.fov, fov, Math.min(1, dt * 4));
    this.camera.fov = C.fov; this.camera.updateProjectionMatrix();
    this.camera.position.copy(C.pos);
    if (C.shake > 0) { C.shake = Math.max(0, C.shake - dt * 2.2); const s = C.shake * 0.5; this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.y += (Math.random() - 0.5) * s; }
    this.camera.lookAt(C.look);
    document.body.classList.toggle('looking', !!this.lookBack);
    // dark under the bed
    const under = pose.y < BED.under && pose.x > BED.x0 && pose.x < BED.x1 && pose.z > BED.z0 && pose.z < BED.z1;
    this.dark = lerp(this.dark || 0, under ? 1 : 0, Math.min(1, dt * 3));
  }

  _pose(K, P, a) {
    if (K.fish) return this.fx.fishPose(K, { yaw0: K.yaw, yaw: K.yaw });
    return { x: lerp(P.x, K.x, a), y: lerp(P.y, K.y, a), z: lerp(P.z, K.z, a), yaw: angLerp(P.yaw, K.yaw, a) };
  }

  /* ── HUD ── */
  _hud() {
    const R = this.race, K = R.karts[this.me];
    $('h-place').innerHTML = `${K.place}<sup>${ORD(K.place).slice(-2)}</sup>`;
    $('h-place').className = 'place' + (K.place === 1 ? ' p1' : '');
    $('h-lap').textContent = `${R.lapOf(K)}/${R.laps}`;
    $('h-time').textContent = fmt(R.timeOf(K));
    // the item slot: the roulette spins through the icons, then lands
    let it = K.item, spin = false;
    if (K.item && K.roulette > 0) { it = ITEMS[Math.floor(R.tick / 4) % ITEMS.length]; spin = true; if (R.tick % 4 === 0 && K.i === this.me && !this.cpus[this.me]) this.audio.play('dh-tick', { gain: 0.6 }); }
    const key = `${it}|${spin}`;
    if (key !== this.lastItem) {
      this.lastItem = key;
      $('h-item').innerHTML = it ? ICONS[it] : '';
      $('h-item').classList.toggle('spin', spin);
      $('h-itemname').innerHTML = it && !spin ? `${ITEM_NAMES[it]}<br><kbd>Space</kbd>` : '';
    }
    const tiers = $('h-drift').querySelectorAll('i');
    tiers.forEach((el, j) => { el.className = K.drift && K.tier > j ? `t${K.tier}` : ''; });
    $('fabric').classList.toggle('on', K.caseT > 0);
    this._drawMinimap();
  }

  _minimapBase() {
    const T = this.T, c = document.createElement('canvas');
    c.width = 460; c.height = 340;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let k = 0; k < T.N; k++) { x0 = Math.min(x0, T.x[k]); x1 = Math.max(x1, T.x[k]); z0 = Math.min(z0, T.z[k]); z1 = Math.max(z1, T.z[k]); }
    const s = Math.min((c.width - 50) / (x1 - x0), (c.height - 50) / (z1 - z0));
    const ox = (c.width - (x1 - x0) * s) / 2 - x0 * s, oz = (c.height - (z1 - z0) * s) / 2 - z0 * s;
    const g = c.getContext('2d');
    const path = () => { g.beginPath(); for (let k = 0; k <= T.N; k += 3) { const q = k % T.N; g.lineTo(T.x[q] * s + ox, T.z[q] * s + oz); } g.closePath(); };
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(155,92,255,.55)'; g.lineWidth = 16; path(); g.stroke();
    g.strokeStyle = '#2a2140'; g.lineWidth = 10; path(); g.stroke();
    // elevated parts brighter (bed, banister)
    g.lineWidth = 10;
    for (let k = 0; k < T.N; k += 3) { const q = (k + 3) % T.N; if (T.y[k] > 8) { g.strokeStyle = T.y[k] > 18 ? '#3a5aa0' : '#7a4428'; g.beginPath(); g.moveTo(T.x[k] * s + ox, T.z[k] * s + oz); g.lineTo(T.x[q] * s + ox, T.z[q] * s + oz); g.stroke(); } }
    const sk = new Race({ racers: [{ id: 'k8e' }], seed: 1, humans: [] }).startK;
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath();
    g.moveTo((T.x[sk] - rightX(T, sk) * 9) * s + ox, (T.z[sk] - rightZ(T, sk) * 9) * s + oz); g.lineTo((T.x[sk] + rightX(T, sk) * 9) * s + ox, (T.z[sk] + rightZ(T, sk) * 9) * s + oz); g.stroke();
    return { c, s, ox, oz };
  }
  _drawMinimap() {
    const M = this.minimap, cv = $('minimap'), g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.drawImage(M.c, 0, 0);
    const R = this.race;
    for (const K of [...R.karts].sort((a, b) => (a.i === this.me) - (b.i === this.me))) {
      const [c1, c2] = (K.alt ? ALT_COLORS : COLORS)[K.id];
      const x = K.x * M.s + M.ox, y = K.z * M.s + M.oz, me = K.i === this.me;
      g.beginPath(); g.arc(x, y, me ? 11 : 8, 0, Math.PI * 2);
      g.fillStyle = c1; g.fill(); g.lineWidth = me ? 4 : 3; g.strokeStyle = me ? '#fff' : c2; g.stroke();
    }
    for (const S of R.shots) if (S.kind === 'alarm') { g.fillStyle = '#e2463f'; g.beginPath(); g.arc(S.x * M.s + M.ox, S.z * M.s + M.oz, 6, 0, 7); g.fill(); }
  }

  /* ── results: the podium ── */
  toResults() {
    const R = this.race;
    this.setScreen('results');
    const me = R.karts[this.me];
    $('r-title').textContent = this.cpus[this.me] ? 'Results' : me.place === 1 ? 'You win!' : `You came ${ORD(me.place)}`;
    $('board').innerHTML = R.finishOrder.map((i, p) => {
      const K = R.karts[i], N = RACERS[K.id];
      return `<div class="row${i === this.me ? ' you' : ''}"><span class="p">${p + 1}</span><span>${N.name}${K.alt ? ' <small style="color:var(--violet)">ALT</small>' : ''}</span><span class="t">${fmt(R.timeOf(K))}</span></div>`;
    }).join('');
    // the top three on a podium of books by the rug, in their winning poses
    const spots = [[-84, 6, 52], [-92, 4, 50], [-76, 3, 50]];
    this.podium = R.finishOrder.slice(0, 3).map((i, p) => ({ i, v: this.rviews[i], spot: spots[p] }));
    for (const v of this.rviews) v.group.visible = false;
    this.podium.forEach((P, p) => { P.v.group.visible = true; P.v.driver.pose(p === 0 ? 'win' : 'idle', 60); });
    if (!this.podiumMeshes) {
      this.podiumMeshes = new THREE.Group();
      const cols = ['#ffc93a', '#d9dce6', '#d39a62'];
      spots.forEach(([x, y, z], p) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(7.5, y, 6.5), new THREE.MeshStandardMaterial({ color: cols[p], roughness: 0.5 }));
        m.position.set(x, y / 2, z); this.podiumMeshes.add(m);
      });
      this.scene.add(this.podiumMeshes);
    }
    this.podiumMeshes.visible = true;
    const W = R.karts[R.finishOrder[0]];
    this.podiumBubble = this.podium[0].v;
    this.bubbles.forEach((b) => dismiss(b.el)); this.bubbles = [];
    setTimeout(() => { if (this.screen === 'results') { this.bubble(-1, koLine(W.id, W.alt, this.raceN), 99); } }, 900);
    this.audio.music(null);
    this.podT = 0;
  }

  _podium(dt) {
    this.podT += dt;
    for (const P of this.podium) {
      const v = P.v, [x, y, z] = P.spot;
      const K = this.race.karts[P.i];
      v.update(dt, { ...K, fwd: 0, drift: 0, steer: 0, air: 0, spinT: 0, boostT: 0, caseT: 0, wobT: 0 }, { x, y, z, yaw: Math.PI * 0.08 + (P === this.podium[0] ? Math.sin(this.podT) * 0.15 : 0) }, this.camera.position, this.camera.quaternion);
      if (P === this.podium[0] && Math.floor(this.podT * 3) !== Math.floor((this.podT - dt) * 3)) this.fx?.sparks(x + (Math.random() - 0.5) * 8, y + 5 + Math.random() * 3, z, ['#ffc93a', '#3ff0c8', '#ff3b6b'][Math.floor(Math.random() * 3)], 6, 5, 0.8, 0.6);
    }
    const a = -0.25 + Math.sin(this.podT * 0.3) * 0.18;
    this.camera.fov = 50; this.camera.updateProjectionMatrix();
    this.camera.position.set(-84 + Math.sin(a) * 26, 12, 52 + Math.cos(a) * 26);
    this.cam.pos.copy(this.camera.position);
    this.camera.lookAt(-84, 6.5, 51);
  }

  /* ── the frame ── */
  frame(dt, render = true) {
    const t0 = performance.now();
    dt = Math.min(dt, 0.1);
    this.t += dt;
    for (const a of this.controls.padMenu()) {
      const map = { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', confirm: 'Enter', cancel: 'Escape' };
      if (this.screen !== 'race' || a === 'confirm') this.key({ code: this.screen === 'race' && a === 'confirm' ? 'X' : map[a] });
    }
    if (this.screen === 'race' && this.race) {
      if (!this.paused) {
        this.acc += dt;
        let n = 0;
        while (this.acc >= DT && n < 6) { this.tick(); this.acc -= DT; n++; }
        if (n === 6) this.acc = 0;
      }
      const alpha = this.paused ? 1 : Math.min(1, this.acc / DT);
      const R = this.race;
      this._camera(dt, alpha);
      R.karts.forEach((K, i) => {
        const v = this.rviews[i], pose = this._pose(K, this.prev[i], alpha);
        v.update(this.paused ? 0 : dt, K, pose, this.camera.position, this.camera.quaternion);
        if (!this.paused) this.fx.kartTrail(K, v, dt);
      });
      this.fx.camPos = this.camera.position;
      this.fx.update(this.paused ? 0 : dt, this.camera.quaternion, R.karts, this.rviews);
      this._hud();
      this.hum.update(R.karts, this.cpus[this.me] ? -1 : this.me, this.camera.position);
      if (this.resultsAt && this.t > this.resultsAt && (R.phase === 'done' || R.karts[this.me].fin)) {
        if (R.phase !== 'done') R._end();
        this.hum.stop();
        this.toResults();
      }
    } else if (this.screen === 'results') {
      this._podium(dt);
      this.fx?.update(dt, this.camera.quaternion, this.race.karts, this.rviews);
    } else {
      this._idleCam(dt);
    }
    if (this.screen !== 'results' && this.podiumMeshes) this.podiumMeshes.visible = false;
    this._bubbles();
    this.world.update(dt, this.t);
    document.body.style.setProperty('--dark', (this.dark || 0).toFixed(3));
    $('dark').style.opacity = ((this.dark || 0) * 0.55).toFixed(3);
    const js = performance.now() - t0;
    if (render) this.renderer.render(this.scene, this.camera);
    this.frameMs.push(js);
    if (this.frameMs.length > 600) this.frameMs.shift();
  }

  /* title and select: the camera drifts round the room; on select it circles the pick on the rug */
  _idleCam(dt) {
    this.dark = 0;
    if (this.screen === 'select' && this.turn) {
      this.turnA += dt * 0.45;
      const v = this.turn, x = -84, z = 52;
      v.update(dt, { fwd: 0, drift: 0, steer: Math.sin(this.t * 0.8) * 0.4, air: 0, spinT: 0, boostT: 0, caseT: 0, wobT: 0, x, y: 0.2, z }, { x, y: 0.2, z, yaw: this.turnA }, this.camera.position, this.camera.quaternion);
      if (Math.floor(this.t / 3.2) !== Math.floor((this.t - dt) / 3.2)) v.taunt(false);
      this.camera.fov = 40; this.camera.updateProjectionMatrix();
      this.camera.position.set(x + 1.2, 4.4, z + 11.5);
      this.camera.lookAt(x - 0.4, 0.2, z);
      return;
    }
    // title: the whole house as a diorama, swaying slowly
    const a = Math.sin(this.t * 0.07) * 0.22;
    this.camera.fov = 50; this.camera.updateProjectionMatrix();
    this.camera.position.set(135 + Math.sin(a) * 300, 400, Math.cos(a) * 300 - 20);
    this.camera.lookAt(130, 0, 10);
    this.cam.pos.copy(this.camera.position);
  }

  /* tools/shots.mjs: stage one item mid-effect, in front of the camera */
  shotItem(it) {
    const A = this, R = this.race, T = R.T, N = T.N, me = this.me;
    A.step(3.8, false);
    const k0 = R._nearest([-64 * 1.8, 0, 30 * 1.8]);
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
    const [a, b, c] = others;
    let pre = 0.05, post = 0.3;
    this.controls.sample = () => ({ ...still(), item: this._fire > 0 && this._fire-- > 0, back: !!this._back });
    if (it === 'slick') { put(a, -16, 0); this.cpus[a] = drive(a); this._back = true; post = 0.75; }
    else if (it === 'missile') { put(a, 20, 0); post = 0.28; }
    else if (it === 'espresso') { this.controls.sample = () => ({ ...still(), gas: true, item: this._fire > 0 && this._fire-- > 0 }); post = 0.45; }
    else if (it === 'cuffs') { put(a, 9, -3); put(b, 12, 3); post = 1.4; }
    else if (it === 'case') { put(a, 9, 0); post = 0.7; }
    else if (it === 'alarm') { put(a, 22, 0); post = 0; }
    R._place();
    void c;
    const K = R.karts[me];
    K.item = it; K.roulette = 0;
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
    let last = performance.now();
    const f = (now) => {
      const dt = (now - last) / 1000; last = now;
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
  const { renderer, canvas } = await makeRenderer($('stage'));
  const app = new App(renderer, canvas);
  window.__dh = app;
  $('title').querySelector('.feather').innerHTML = FEATHER;
  $('scare').innerHTML = `${CLOCK_SCARE}<b>BRRRRING!</b>`;
  // the deep links
  const p1 = racerId(Q.get('p1'));
  if (p1 || Q.has('p1cpu')) {
    const pc = Q.get('p1cpu');
    app.startRace({ p1: p1 || 'kevalanche', alt1: Q.get('alt1') === '1', cpu: Q.get('cpu') || undefined, p1cpu: pc ? (['easy', 'normal', 'hard'].includes(pc) ? pc : 'hard') : null });
  } else if (Q.get('screen') === 'select') app.toSelect();
  else app.setScreen('title');
  app.frame(1 / 60);
  document.body.classList.add('is-live');
  if (!app.hold) app.loop();
}

start().catch((e) => { console.error(e); $('loading').textContent = 'This browser cannot run Down Hill (WebGL 2 needed).'; });
