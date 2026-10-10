import * as THREE from 'three/webgpu';
import { ATHLETES, ORDER } from './athletes/index.js';
import { SoftBody } from './softbody.js';
import { Idle } from './idle.js';
import { Groom } from './groom.js';
import { Body } from './body.js';
import { SHELLS, makeFurMaterial, makeMaskTexture, makeGroomTexture, makeEyeMaterial, Floor } from './fur.js';
import { makeClothMaterial } from './cloth.js';
import { Tools } from './tools.js';
import { CHARACTER_INFO, paintAthlete } from './characters.js';
import { makeRacquet, poseRacquet, makeTennisBall, makeFootball, poseBall, makeStars, poseStars, makeGoal } from './props.js';
import { TENNIS_R } from './athletes/leopard.game.js';
import { FOOTBALL_R } from './athletes/bear.game.js';
import { CROW } from './athletes/crow.rig.js';
import { makeBeak, poseBeak, makeNest, makeItems, poseItems } from './crowprops.js';
import { makeRings, poseRings } from './giraffeprops.js';
import { makeBat, poseBat, makeBaseball } from './props.js';
import { BAT, batR, BASEBALL_R } from './athletes/penguin.game.js';

const $ = (s) => document.querySelector(s);

/* WebGPU when the adapter answers; WebGL 2 when it doesn't. Some browsers
   expose navigator.gpu but never resolve requestAdapter, which would leave
   init() pending forever — so give it a moment, then fall back on a fresh
   canvas (the old one may yet be claimed by the late WebGPU context).      */
async function makeRenderer() {
  let canvas = $('#stage');
  if (navigator.gpu && !/[?&]webgl\b/.test(location.search)) {
    const r = new THREE.WebGPURenderer({ canvas, antialias: true });
    const ok = await Promise.race([
      r.init().then(() => true, () => false),
      new Promise((res) => setTimeout(() => res(false), 2500)),
    ]);
    if (ok && r.backend.isWebGPUBackend) return { renderer: r, canvas };
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh);
    canvas = fresh;
  }
  const r = new THREE.WebGPURenderer({ canvas, antialias: true, forceWebGL: true });
  await r.init();
  return { renderer: r, canvas };
}

async function start() {
  const { renderer, canvas } = await makeRenderer();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight, false);

  const scene = new THREE.Scene();
  // exactly the floor's far tone, so there is no horizon line
  scene.background = new THREE.Color().setRGB(0.83, 0.8, 0.765, THREE.LinearSRGBColorSpace);
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 140);

  // the current athlete: rebuilt whole by setCharacter()
  let rig, soft, idle, body, cloth = null, game;
  const groom = new Groom();
  const groomTex = makeGroomTexture(groom);
  const maskTex = makeMaskTexture();
  const patTex = makeMaskTexture();
  const fur = makeFurMaterial(groomTex, maskTex, patTex);
  const shells = new THREE.Mesh(undefined, fur.material);
  shells.frustumCulled = false;
  scene.add(shells);
  const clothMat = makeClothMaterial();
  const clothMesh = new THREE.Mesh(undefined, clothMat.material);
  clothMesh.frustumCulled = false;
  clothMesh.visible = false;
  scene.add(clothMesh);

  const floor = new Floor();
  scene.add(floor.mesh);

  const eyeMat = makeEyeMaterial();
  const eyeGeo = new THREE.SphereGeometry(1, 40, 28);
  const eyes = [-1, 1].map((s) => {
    const m = new THREE.Mesh(eyeGeo, eyeMat);
    m.userData.side = s;
    scene.add(m);
    return m;
  });

  // props: built once, shown for whoever plays with them
  const racquet = makeRacquet();
  scene.add(racquet);
  const tennisBall = makeTennisBall(TENNIS_R);
  const football = makeFootball(FOOTBALL_R);
  const stars = makeStars();
  scene.add(tennisBall, football, stars);
  let goal = null;
  // the crow's: his beak, his nest, the things you toss him
  const beak = makeBeak(CROW.BEAK);
  const nest = makeNest();
  const items = makeItems();
  scene.add(beak, nest, items);
  // the giraffe's felt rings
  const rings = makeRings();
  scene.add(rings);
  // the penguin's bat and baseball
  const bat = makeBat(BAT, batR);
  const baseball = makeBaseball(BASEBALL_R);
  scene.add(bat, baseball);

  // rig view: points + links, rebuilt per athlete
  const rigLineMat = new THREE.LineBasicMaterial({ color: 0x1d1a17, depthTest: false, transparent: true, opacity: 0.9 });
  const rigPtGeo = new THREE.SphereGeometry(1, 10, 8);
  const rigPtMat = new THREE.MeshBasicMaterial({ color: 0xc8a877, depthTest: false, transparent: true, opacity: 0.95 });
  const rigM = new THREE.Matrix4();
  let rigGeo, rigPos, rigLines, rigPts;
  const buildRigView = () => {
    if (rigLines) {
      scene.remove(rigLines, rigPts);
      rigGeo.dispose();
      rigPts.dispose();
    }
    rigGeo = new THREE.BufferGeometry();
    rigPos = new Float32Array(rig.n * 3);
    rigGeo.setAttribute('position', new THREE.BufferAttribute(rigPos, 3).setUsage(THREE.DynamicDrawUsage));
    const linkIdx = [];
    for (let l = 0; l < rig.linkA.length; l++) linkIdx.push(rig.linkA[l], rig.linkB[l]);
    rigGeo.setIndex(linkIdx);
    rigLines = new THREE.LineSegments(rigGeo, rigLineMat);
    // WebGPU points are always one pixel, so the rig's points are tiny spheres
    rigPts = new THREE.InstancedMesh(rigPtGeo, rigPtMat, rig.n);
    rigLines.renderOrder = rigPts.renderOrder = 10;
    rigLines.visible = rigPts.visible = state.mesh;
    rigLines.frustumCulled = rigPts.frustumCulled = false;
    scene.add(rigLines, rigPts);
  };

  let tools = null;

  /* ── panel ──────────────────────────────────────────────────────────────── */
  const state = { speed: 1, paused: false, mesh: false, character: null, color: {}, stuffing: 0.42, damping: 0.45, idle: 0.5, pace: 15, auto: false, pile: {}, shiny: false, beakScale: 1 };
  const furBox = $('#p-fur');
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const applyColor = (c) => {
    fur.uniforms.color.value.set(c.fur);
    fur.uniforms.under.value.set(c.under);
    fur.uniforms.accent.value.set(c.accent);
    fur.uniforms.spot.value.set(c.spot);
    fur.uniforms.nose.value.set(c.nose);
    clothMat.uniforms.cloth.value.set(c.cloth);
    clothMat.uniforms.trim.value.set(c.trim);
    fur.uniforms.sheen.value.set(c.sheen || '#000000');
    beak.userData.color.value.set(c.nose);
    state.beakScale = c.beak || 1;
  };
  // four swatches, re-dealt for each athlete
  const buildSwatches = () => {
    const info = CHARACTER_INFO[state.character];
    furBox.textContent = '';
    for (const [name, c] of Object.entries(info.colors)) {
      const b = document.createElement('button');
      const bands = `${c.fur} 0 46%,${c.spot} 46% 58%,${c.under} 58% 78%,${c.cloth} 78%`;
      b.innerHTML = `<span class="sw" style="background:linear-gradient(90deg,${bands})"></span><b>${cap(name)}</b>`;
      b.setAttribute('aria-pressed', String(name === state.color[state.character]));
      b.onclick = () => {
        state.color[state.character] = name;
        applyColor(c);
        for (const x of furBox.children) x.setAttribute('aria-pressed', String(x === b));
      };
      furBox.appendChild(b);
      if (name === state.color[state.character]) b.onclick();
    }
  };
  const sliders = {};
  const slider = (id, fmt, apply) => {
    const s = $('#s-' + id), o = $('#o-' + id);
    const set = () => { const v = parseFloat(s.value); o.textContent = fmt(v); apply(v); };
    s.addEventListener('input', set);
    set();
    sliders[id] = { el: s, set };
  };
  slider('pile', (v) => `${v} mm`, (v) => { fur.uniforms.pile.value = v / 90; if (state.character) state.pile[state.character] = v; });   // 1 unit = 9 cm
  slider('density', (v) => String(v), (v) => { fur.uniforms.density.value = v; });
  slider('stuffing', (v) => v.toFixed(2), (v) => { state.stuffing = v; if (soft) soft.params.stuffing = v; });
  slider('damping', (v) => v.toFixed(2), (v) => { state.damping = v; if (soft) soft.params.damping = v; });
  slider('idle', (v) => (v === 0 ? 'still' : v.toFixed(2)), (v) => { state.idle = v; if (idle) idle.amount = v; });
  // 1 unit = 9 cm: a 15 u/s serve is 1.35 m/s at plush scale
  slider('pace', (v) => `${(v * 0.09).toFixed(1)} m/s`, (v) => { state.pace = v; if (game) game.speed = v; });
  const applyBody = () => {
    soft.params.stuffing = state.stuffing;
    soft.params.damping = state.damping;
    idle.amount = state.idle;
    game.speed = state.pace;
    game.auto = state.auto;
    if (game.items) game.kind = state.shiny ? 'shiny' : 'food';
  };

  const HINTS = {
    finger: '<b>Finger</b>Press into the plush. Hold to push deeper; it fills back out when you lift.',
    comb: '<b>Comb</b>Brush the fur. With the nap it lies flat and shines; against it, it stands up and stays ruffled.',
  };
  const setTool = (m) => {
    tools.setMode(m);
    for (const b of document.querySelectorAll('#tools button')) b.setAttribute('aria-pressed', String(b.dataset.tool === m));
    const info = CHARACTER_INFO[state.character];
    const h = m === 'hand' ? '<b>Hand</b>' + info.hand : m === 'play' ? `<b>${info.tool}</b>${info.play}` : HINTS[m];
    $('#hint').innerHTML = h + '<span id="game-state"></span>';
  };
  for (const b of document.querySelectorAll('#tools button')) b.onclick = () => setTool(b.dataset.tool);

  // when the panel is open, slide the framing left so the athlete sits in
  // the visible part of the stage rather than half under the panel
  const frame = { shift: 0, target: 0 };
  const togglePanel = (open) => {
    document.body.classList.toggle('panel-open', open);
    $('#panel-toggle').setAttribute('aria-expanded', String(open));
    frame.target = open && innerWidth > 760 ? Math.min(320, innerWidth * 0.9) / 2 : 0;
  };
  $('#panel-toggle').onclick = () => togglePanel(true);
  $('#panel-close').onclick = () => togglePanel(false);
  if (innerWidth > 1180) togglePanel(true);

  /* ── athletes ───────────────────────────────────────────────────────────── */
  const charBox = $('#p-char');
  ORDER.forEach((name, k) => {
    const b = document.createElement('button');
    b.dataset.char = name;
    b.innerHTML = `<b>${CHARACTER_INFO[name].label}</b><i>${CHARACTER_INFO[name].sport} · ⇧${k + 1}</i>`;
    b.onclick = () => setCharacter(name);
    charBox.appendChild(b);
  });

  const launch = (opts = {}) => game.launch({ speed: state.pace, ...opts });

  /* swap the whole athlete: physics, game, meshes, groom, mask, pattern, kit,
     props, court, UI. Old geometry is disposed; textures are repainted.  */
  const setCharacter = (name) => {
    if (!CHARACTER_INFO[name] || name === state.character) return;
    const info = CHARACTER_INFO[name];
    state.character = name;
    if (!state.color[name]) state.color[name] = Object.keys(info.colors)[0];
    const old = body, oldCloth = cloth;
    rig = ATHLETES[name].build();
    soft = new SoftBody(rig);
    idle = new Idle(soft);
    game = new ATHLETES[name].Game(soft);
    applyBody();
    body = new Body(rig, soft);
    body.geometry.instanceCount = state.mesh ? 1 : SHELLS;
    shells.geometry = body.geometry;
    cloth = rig.cloth ? new Body(rig, soft, { cloth: true }) : null;
    clothMesh.visible = !!cloth;
    if (cloth) clothMesh.geometry = cloth.geometry;
    old?.dispose(); oldCloth?.dispose();
    groom.setLayout(rig.regions);
    groomTex.needsUpdate = true;
    paintAthlete(maskTex, patTex, name, rig);
    floor.paintCourt(info.court);
    floor.tint.value.set(info.tint);
    buildRigView();
    if (goal) { scene.remove(goal); goal = null; }
    if (game.net) { goal = makeGoal(game.goal, game.net); scene.add(goal); }
    racquet.visible = !!rig.racquet;
    bat.visible = !!rig.bat;
    nest.visible = !!game.items;
    beak.visible = !!rig.beak;
    poseItems(items, null);
    poseRings(rings, null);
    tennisBall.visible = football.visible = baseball.visible = false;
    if (!tools) {
      tools = new Tools({
        canvas, camera, body, soft, groom,
        onLaunch: (e, flick) => aimAndLaunch(e, flick),
        // the Hand on the crow's things (nobody else leaves things about)
        items: {
          pick: (o, d) => game.itemAt?.(o, d) ?? null,
          grab: (id) => !!game.grabItem?.(id),
          move: (id, p) => game.moveItem?.(id, p),
          release: (id) => game.releaseItem?.(id),
        },
      });
    } else tools.attach({ body, soft });

    // UI
    for (const b of charBox.children) b.setAttribute('aria-pressed', String(b.dataset.char === name));
    document.body.dataset.char = name;
    buildSwatches();
    const pile = state.pile[name] ?? info.pile;
    sliders.pile.el.value = pile; sliders.pile.set();
    canvas.setAttribute('aria-label', info.aria);
    $('#title p').textContent = info.blurb;
    $('#tool-label').textContent = info.tool;
    setLaunchLabel();
    const [r0, r1, r2] = game.readout();
    $('#l-a').textContent = r0[0]; $('#l-b').textContent = r1[0];
    // a third readout, for the games that keep three numbers
    $('#read-c').hidden = !r2;
    $('#read').classList.toggle('three', !!r2);
    if (r2) $('#l-c').textContent = r2[0];
    fur.uniforms.stitch.value.setRGB(...info.stitch, THREE.LinearSRGBColorSpace);
    setTool(tools.mode);
    // frame the athlete and its court
    const o = tools.orbit, cam = info.camera;
    o.az = cam.az; o.el = cam.el; o.dist = cam.dist;
    o.target.set(game.home[0] + (cam.x || 0), cam.y, game.home[1] - (game.net ? 0.6 : 0));
    resize();
  };

  /* Serve / Shoot by pointer: where the ray meets the plane the ball is
     aimed through (his hitting plane, or the goal line); a flick adds pace */
  const aimAndLaunch = (e, flick) => {
    const ray = tools.rayAt(e);
    const zp = game.net ? game.goal.z : game.aimZ ?? game.home[1] + 0.5;
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -zp);
    const P = ray.intersectPlane(plane, new THREE.Vector3());
    if (!P) return;
    const k = flick > 250 ? THREE.MathUtils.clamp(0.75 + flick / 2400, 0.8, 1.6) : 1;
    launch({ aim: [P.x, THREE.MathUtils.clamp(P.y, 0.3, 4)], speed: state.pace * k });
  };

  /* write a dent into the groom map where the ball struck: the nearest
     vertex of the part it hit gives the atlas spot                       */
  const dent = (ev) => {
    const pos = body.pos;
    let best = -1, bd = 0.6 * 0.6;
    for (let v = 0; v < body.count; v++) {
      const dx = pos[v * 3] - ev.at[0], dy = pos[v * 3 + 1] - ev.at[1], dz = pos[v * 3 + 2] - ev.at[2];
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = v; }
    }
    if (best < 0) return;
    const u = body.uv[best * 2], v = body.uv[best * 2 + 1];
    const [rx, ry] = body.brushTexels(u, v, 0.34, groom.size);
    groom.dent(u, v, rx, ry, ev.strength ?? 0.7);
  };

  let action = null;
  const reset = () => {
    tools.releasePins();
    soft.reset();
    soft.planes = [];
    game.reset();
    game.net?.reset();
    action = null;
  };
  $('#b-reset').onclick = reset;
  $('#b-smooth').onclick = () => groom.smooth(1.1);
  $('#b-launch').onclick = () => launch();
  // the giraffe: pick up the rings off the floor
  const collectB = $('#b-collect');
  collectB.onclick = () => game.collect?.();
  // the crow: food or shiny things
  const kindB = $('#b-kind');
  const setLaunchLabel = () => {
    const info = CHARACTER_INFO[state.character];
    $('#b-launch').innerHTML = game.items ? `${info.verb} ${state.shiny ? 'shiny' : 'food'}<i>S</i>` : `${info.verb}<i>S</i>`;
  };
  kindB.onclick = () => {
    state.shiny = !state.shiny;
    kindB.setAttribute('aria-pressed', String(state.shiny));
    if (game.items) game.kind = state.shiny ? 'shiny' : 'food';
    setLaunchLabel();
  };
  const autoB = $('#b-auto');
  autoB.onclick = () => { state.auto = !state.auto; game.auto = state.auto; autoB.setAttribute('aria-pressed', String(state.auto)); if (state.auto && !game.ball) launch(); };
  $('#b-shake').onclick = () => {
    // pick it up by the crown and shake, the way you would a toy
    let top = rig.head[0];
    for (const c of rig.clouds) for (const i of c.ix) if (soft.x[i * 3 + 1] > soft.x[top * 3 + 1]) top = i;
    const at = [soft.x[top * 3], soft.x[top * 3 + 1], soft.x[top * 3 + 2]];
    soft.grab('shake', top, at, 0.3);
    action = { name: 'shake', t: 0, at };
  };
  $('#b-squish').onclick = () => { action = { name: 'squish', t: 0 }; soft.planes = [{ y: 5 }]; };
  const slow = $('#b-slow'), pause = $('#b-pause'), mesh = $('#b-mesh');
  slow.onclick = () => { state.speed = state.speed === 1 ? 0.25 : 1; slow.setAttribute('aria-pressed', String(state.speed !== 1)); };
  pause.onclick = () => { state.paused = !state.paused; pause.setAttribute('aria-pressed', String(state.paused)); };
  mesh.onclick = () => {
    state.mesh = !state.mesh;
    mesh.setAttribute('aria-pressed', String(state.mesh));
    fur.uniforms.meshView.value = state.mesh ? 1 : 0;
    clothMat.uniforms.meshView.value = state.mesh ? 1 : 0;
    body.geometry.instanceCount = state.mesh ? 1 : SHELLS;
    rigLines.visible = rigPts.visible = state.mesh;
  };

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (e.shiftKey && digit) setCharacter(ORDER[+digit[1] - 1]);
    else if (k >= '1' && k <= '4') setTool(['hand', 'finger', 'comb', 'play'][+k - 1]);
    else if (k === 's' || k === 'enter') launch();
    else if (k === 'a') autoB.onclick();
    else if (k === 't' && game.items) kindB.onclick();
    else if (k === 'g' && game.rings) collectB.onclick();
    else if (k === 'c') togglePanel(!document.body.classList.contains('panel-open'));
    else if (k === 'r') reset();
    else if (k === ' ') { e.preventDefault(); pause.onclick(); }
    else if (k === 'escape') tools.releasePins();
  });

  const squishSpan = () => {
    let top = 0;
    for (const c of rig.clouds) for (const i of c.ix) top = Math.max(top, soft.x[i * 3 + 1] + soft.r[i]);
    return [top + 0.2, top * 0.5];
  };
  const runAction = (dt) => {
    if (!action) return;
    action.t += dt;
    const t = action.t;
    if (action.name === 'shake') {
      const lift = Math.min(1, t / 0.35);
      const amp = t < 0.35 ? 0 : Math.min(1, (t - 0.35) / 0.2) * Math.max(0, 1 - (t - 1.5) / 0.3);
      const a = action.at;
      soft.moveGrab('shake', [a[0] + Math.sin((t - 0.35) * 2 * Math.PI * 3.4) * 0.75 * amp, a[1] + 1.6 * lift - (t > 1.6 ? (t - 1.6) * 3 : 0), a[2]]);
      if (t > 1.9) { soft.release('shake'); action = null; }
    } else if (action.name === 'squish') {
      const down = t < 0.45 ? t / 0.45 : t < 0.9 ? 1 : Math.max(0, 1 - (t - 0.9) / 0.45);
      const ease = down * down * (3 - 2 * down);
      const sq = action.span || (action.span = squishSpan());
      soft.planes[0].y = THREE.MathUtils.lerp(sq[0], sq[1], ease);
      if (t > 1.4) { soft.planes = []; action = null; }
    }
  };

  /* ── loop ───────────────────────────────────────────────────────────────── */
  const backend = renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  $('#o-backend').textContent = backend;
  const P = new THREE.Vector3(), N = new THREE.Vector3(), up = new THREE.Vector3(), X = new THREE.Vector3();
  const M = new THREE.Matrix4();
  const G = new THREE.Vector3();
  let last = performance.now(), frames = 0, fpsT = 0, readT = 0;

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    // keep the athlete (and its goal) framed on narrow screens
    const narrow = innerWidth / innerHeight < 0.8;
    camera.fov = narrow ? 42 : 30;
    if (tools && state.character) {
      const cam = CHARACTER_INFO[state.character].camera;
      tools.orbit.dist = narrow ? cam.dist * (game.net ? 1.7 : 1.25) : cam.dist;
      tools.applyOrbit();
    }
    camera.setViewOffset(innerWidth, innerHeight, frame.shift, 0, innerWidth, innerHeight);
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);

  const first = new URLSearchParams(location.search).get('character');
  setCharacter(ORDER.includes(first) ? first : 'leopard');

  const hc = [0, 0, 0];
  let hold = false;
  const frameFn = (real, draw = true) => {
    const dt = state.paused ? 0 : real * state.speed;
    if (Math.abs(frame.shift - frame.target) > 0.5) {
      frame.shift += (frame.target - frame.shift) * Math.min(1, real * 6);
      camera.setViewOffset(innerWidth, innerHeight, frame.shift, 0, innerWidth, innerHeight);
    }

    // fixed-step simulation; the fur-lag spring rides the same clock, since
    // it differentiates positions twice and uneven steps read as jolts
    soft.advance(dt, (h) => {
      runAction(h);
      tools.update(h);
      game.update(h);
    }, (h) => {
      body.pressPoints = tools.pressPoints();
      body.update(h);
      cloth?.update(h);
    });
    groom.relax(real);
    if (groom.dirty) { groomTex.needsUpdate = true; groom.dirty = false; }
    for (const ev of game.events) if (ev.kind === 'bonk') dent(ev);
    game.events.length = 0;

    // the camera drifts a little after the athlete, anchored to its court
    const ft = tools.orbit.target, c = soft.cloudC[0];
    if (!tools.ptrs.size) {
      const k = Math.min(1, real * 1.2), cam = CHARACTER_INFO[state.character].camera;
      const zOff = game.net ? -0.6 : 0;
      ft.x += (game.home[0] + (cam.x || 0) + (c[0] - game.home[0]) * 0.35 - ft.x) * k;
      ft.z += (game.home[1] + zOff + (c[2] - game.home[1]) * 0.25 - ft.z) * k;
      ft.y += (cam.y - ft.y) * k;
      tools.applyOrbit();
    }

    // props
    if (rig.racquet) poseRacquet(racquet, game.rq);
    const b = game.ball;
    poseBall(tennisBall, b?.kind === 'tennis' ? b : null);
    poseBall(football, b?.kind === 'football' ? b : null);
    poseBall(baseball, b?.kind === 'baseball' ? b : null);
    if (rig.bat) poseBat(bat, game.bat);
    goal?.userData.update();
    game.headCentre(hc);
    poseStars(stars, hc, game.daze, soft.time);
    const shadows = b && !b.dead ? [[b.x[0], b.x[1], b.x[2], b.r]] : [];
    if (game.items) {
      poseItems(items, game.items);
      for (const it of game.items) if (it.state !== 'gone') shadows.push([it.ball.x[0], it.ball.x[1], it.ball.x[2], it.r * 0.8]);
    }
    if (game.rings) {
      poseRings(rings, game.rings);
      for (const r of game.rings) if (r.state !== 'gone') shadows.push([r.x[0], r.x[1], r.x[2], r.R * 0.9]);
    }
    if (rig.beak) poseBeak(beak, game.beakFrame(), [state.beakScale, 0.92 + 0.12 * state.beakScale]);
    if (rig.racquet) shadows.push([game.rq.C[0], game.rq.C[1], game.rq.C[2], 0.3]);
    if (rig.bat) for (const s of [0.5, 1.0, 1.35]) shadows.push([game.bat.p[0] + game.bat.h[0] * s, game.bat.p[1] + game.bat.h[1] * s, game.bat.p[2] + game.bat.h[2] * s, 0.12]);
    floor.paint(soft, null, shadows);

    // eyes ride the head surface, and roll toward the ball
    const ey = CHARACTER_INFO[rig.name].eyes;
    const eyePart = body.parts.find((q) => q.name === ey.part);
    const R = soft.cloudR[eyePart.cloud];
    up.set(R[1], R[4], R[7]);
    const gaze = game.gaze;
    for (const e of eyes) {
      body.surfacePoint(eyePart.name, 0.5 + e.userData.side * ey.u, ey.v, P, N);
      e.position.copy(P).addScaledVector(N, ey.lift);
      if (gaze) {
        G.set(...gaze.at).sub(e.position).normalize();
        G.addScaledVector(N, -G.dot(N));
        e.position.addScaledVector(G, 0.045 * gaze.amount);
        N.addScaledVector(G, 0.6 * gaze.amount).normalize();
      }
      X.crossVectors(up, N).normalize();
      const Y = new THREE.Vector3().crossVectors(N, X);
      M.makeBasis(X, Y, N);
      e.quaternion.setFromRotationMatrix(M);
      e.scale.set(...ey.scale);
    }

    if (state.mesh) {
      for (let i = 0; i < rig.n * 3; i++) rigPos[i] = soft.x[i];
      rigGeo.attributes.position.needsUpdate = true;
      for (let i = 0; i < rig.n; i++) {
        const s = soft.r[i] * (rig.armOf[i] >= 0 ? 0.42 : 0.3);
        rigM.makeScale(s, s, s).setPosition(soft.x[i * 3], soft.x[i * 3 + 1], soft.x[i * 3 + 2]);
        rigPts.setMatrixAt(i, rigM);
      }
      rigPts.instanceMatrix.needsUpdate = true;
    }

    if (!draw) return;
    renderer.render(scene, camera);

    frames++; fpsT += real; readT += real;
    if (fpsT > 0.5) { $('#fps').textContent = Math.round(frames / fpsT); frames = 0; fpsT = 0; }
    if (readT > 0.12 || real === 0) {
      readT = 0;
      const [r0, r1, r2] = game.readout();
      $('#r-a').textContent = r0[1];
      $('#r-b').textContent = r1[1];
      if (r2) $('#r-c').textContent = r2[1];
      $('#r-vol').innerHTML = `${(soft.volumeRatio() * 100).toFixed(1)}<small>%</small>`;
      // particles share the mass; 1 unit = 9 cm
      const mass = Math.round(90 + 60 * soft.params.stuffing) * (rig.name === 'bear' ? 1.6 : rig.name === 'giraffe' ? 1.4 : 1);
      const ke = soft.kinetic() * (mass / 1000 / soft.n) * 0.0081 * 1000;
      $('#r-ke').innerHTML = `${ke.toFixed(2)}<small>mJ</small>`;
      const gs = $('#game-state');
      if (gs) gs.textContent = ` — ${game.status()}`;
    }
  };

  renderer.setAnimationLoop(() => {
    // a hidden or collapsed pane has no swapchain to draw into
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    const now = performance.now();
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    // held (by a screenshot script driving step()): redraw, don't advance
    frameFn(hold ? 0 : real);
  });

  document.body.classList.add('is-live');
  // the current athlete's objects are getters: they change on a switch
  window.__grommet = {
    get soft() { return soft; }, get game() { return game; }, get idle() { return idle; },
    get body() { return body; }, get cloth() { return cloth; }, get rig() { return rig; }, get character() { return state.character; },
    groom, tools, renderer, fur, scene, camera, shells, setCharacter, launch, setTool, maskTex, patTex,
    set hold(v) { hold = v; }, get hold() { return hold; },
    /* advance the piece by `seconds` without drawing (for slow or headless
       hosts: tests, screenshots), then optionally draw one frame          */
    step(seconds, draw = false) {
      for (let t = 0; t < seconds - 1e-9; t += 1 / 60) frameFn(1 / 60, false);
      if (draw) frameFn(0, true);
    },
  };
}

start().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 30px 30px;font:12px ui-monospace,monospace;color:#7a4030">Grommet couldn't start: ${String(err.message || err)}</p>`);
});
