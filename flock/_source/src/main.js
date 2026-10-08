import * as THREE from 'three/webgpu';
import { buildRig, CHARACTERS } from './rig.js';
import { SoftBody } from './softbody.js';
import { Grasp } from './grasp.js';
import { Idle } from './idle.js';
import { Groom } from './groom.js';
import { Body } from './body.js';
import {
  SHELLS, makeFurMaterial, makeMaskTexture, makeGroomTexture,
  makeEyeMaterial, Floor, makeStick, poseStick,
} from './fur.js';
import { Tools } from './tools.js';
import { CHARACTER_INFO, paintFace } from './characters.js';

/* the stick is the octopus's: the others get a grasp that never grasps */
const NO_GRASP = {
  params: { grip: 0.6, reach: 1.25 }, arms: [],
  update() {}, releaseAll() {}, holdingCount() { return 0; }, armState() { return 'idle'; },
};

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
  const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 120);

  // the current character: rebuilt whole by setCharacter()
  let rig, soft, grasp, idle, body;
  const groom = new Groom();

  const groomTex = makeGroomTexture(groom);
  const maskTex = makeMaskTexture();
  const fur = makeFurMaterial(groomTex, maskTex);
  const shells = new THREE.Mesh(undefined, fur.material);
  shells.frustumCulled = false;
  scene.add(shells);

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

  const stickMesh = makeStick();
  scene.add(stickMesh);

  // rig view: points + links, rebuilt per character
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
  const state = { speed: 1, paused: false, mesh: false, character: null, color: {}, stuffing: 0.42, damping: 0.45, grip: 0.6, idle: 0.5 };
  const furBox = $('#p-fur');
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  // four swatches, re-dealt for each character
  const buildSwatches = () => {
    const info = CHARACTER_INFO[state.character];
    furBox.textContent = '';
    for (const [name, c] of Object.entries(info.colors)) {
      const b = document.createElement('button');
      const bands = c.accent !== c.fur
        ? `${c.fur} 0 44%,${c.accent} 44% 70%,${c.under} 70%`
        : `${c.fur} 62%,${c.under} 62%`;
      b.innerHTML = `<span class="sw" style="background:linear-gradient(90deg,${bands})"></span><b>${cap(name)}</b>`;
      b.setAttribute('aria-pressed', String(name === state.color[state.character]));
      b.onclick = () => {
        state.color[state.character] = name;
        fur.uniforms.color.value.set(c.fur);
        fur.uniforms.under.value.set(c.under);
        fur.uniforms.accent.value.set(c.accent);
        for (const x of furBox.children) x.setAttribute('aria-pressed', String(x === b));
      };
      furBox.appendChild(b);
      if (name === state.color[state.character]) b.onclick();
    }
  };
  const slider = (id, fmt, apply) => {
    const s = $('#s-' + id), o = $('#o-' + id);
    const set = () => { const v = parseFloat(s.value); o.textContent = fmt(v); apply(v); };
    s.addEventListener('input', set);
    set();
  };
  slider('pile', (v) => `${v} mm`, (v) => { fur.uniforms.pile.value = v / 90; });   // 1 unit = 9 cm
  slider('density', (v) => String(v), (v) => { fur.uniforms.density.value = v; });
  slider('stuffing', (v) => v.toFixed(2), (v) => { state.stuffing = v; if (soft) soft.params.stuffing = v; });
  slider('damping', (v) => v.toFixed(2), (v) => { state.damping = v; if (soft) soft.params.damping = v; });
  slider('grip', (v) => v.toFixed(2), (v) => { state.grip = v; if (grasp) grasp.params.grip = v; });
  slider('idle', (v) => (v === 0 ? 'still' : v.toFixed(2)), (v) => { state.idle = v; if (idle) idle.amount = v; });
  // body sliders remember their values across characters
  const applyBody = () => {
    soft.params.stuffing = state.stuffing;
    soft.params.damping = state.damping;
    grasp.params.grip = state.grip;
    idle.amount = state.idle;
  };

  const HINTS = {
    hand: '',
    finger: '<b>Finger</b>Press into the plush. Hold to push deeper; it fills back out when you lift.',
    comb: '<b>Comb</b>Brush the fur. With the nap it lies flat and shines; against it, it stands up and stays ruffled.',
    stick: '<b>Stick</b>Click the floor to lay a stick near an arm. Drag the stick to lift — whatever it is holding comes too.',
  };
  const setTool = (m) => {
    if (m === 'stick' && state.character !== 'octopus') return;
    tools.setMode(m);
    for (const b of document.querySelectorAll('#tools button')) b.setAttribute('aria-pressed', String(b.dataset.tool === m));
    HINTS.hand = '<b>Hand</b>' + CHARACTER_INFO[state.character].hand;
    $('#hint').innerHTML = HINTS[m];
  };
  for (const b of document.querySelectorAll('#tools button')) b.onclick = () => setTool(b.dataset.tool);

  // when the panel is open, slide the framing left so the octopus sits in
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

  /* ── characters ─────────────────────────────────────────────────────────── */
  let action = null;   // {name, t, ...}
  const charBox = $('#p-char');
  CHARACTERS.forEach((name, k) => {
    const b = document.createElement('button');
    b.dataset.char = name;
    b.innerHTML = `<b>${CHARACTER_INFO[name].label}</b><i>⇧${k + 1}</i>`;
    b.onclick = () => setCharacter(name);
    charBox.appendChild(b);
  });

  /* swap the whole specimen: physics, mesh, groom, mask, stick, UI. The old
     geometry is disposed (the renderer frees its GPU buffers); the groom and
     mask textures are reused and repainted, so nothing else leaks.        */
  const setCharacter = (name) => {
    if (!CHARACTER_INFO[name] || name === state.character) return;
    const info = CHARACTER_INFO[name];
    state.character = name;
    if (!state.color[name]) state.color[name] = Object.keys(info.colors)[0];
    action = null;
    const old = body;
    rig = buildRig(name);
    soft = new SoftBody(rig);
    grasp = name === 'octopus' ? new Grasp(soft) : NO_GRASP;
    idle = new Idle(soft);
    applyBody();
    body = new Body(rig, soft);
    body.geometry.instanceCount = state.mesh ? 1 : SHELLS;
    shells.geometry = body.geometry;
    old?.dispose();
    groom.setLayout(rig.regions);
    groomTex.needsUpdate = true;
    paintFace(maskTex, name, rig);
    buildRigView();
    if (!tools) {
      tools = new Tools({
        canvas, camera, body, soft, grasp, groom, stickMesh,
        onStick: (on) => { $('#b-stick').disabled = !on; },
      });
    } else tools.attach({ body, soft, grasp });
    tools.stickEnabled = name === 'octopus';
    stickMesh.visible = false;

    // UI
    for (const b of charBox.children) b.setAttribute('aria-pressed', String(b.dataset.char === name));
    document.body.dataset.char = name;
    buildSwatches();
    canvas.setAttribute('aria-label', info.aria);
    $('#title p').textContent = info.blurb;
    $('#l-hold').textContent = info.readout;
    $('#r-hold').innerHTML = `0<small>${info.unit[1]}</small>`;
    fur.uniforms.stitch.value.setRGB(...info.stitch, THREE.LinearSRGBColorSpace);
    $('#b-stick').disabled = true;
    setTool(tools.mode === 'stick' && name !== 'octopus' ? 'hand' : tools.mode);
    // re-aim the camera at the newcomer
    const o = tools.orbit;
    o.target.set(soft.headC[0], THREE.MathUtils.clamp(soft.headC[1] * 0.55 + 0.2, 0.6, 2.4) + rig.camY, soft.headC[2]);
    tools.applyOrbit();
  };

  const reset = () => {
    tools.releasePins();
    soft.reset();
    grasp.releaseAll();
    soft.planes = [];
    action = null;
  };
  $('#b-reset').onclick = reset;
  $('#b-smooth').onclick = () => groom.smooth(1.1);
  $('#b-stick').onclick = () => { tools.removeStick(); };
  $('#b-shake').onclick = () => {
    // pick it up by the crown and shake, the way you would a toy
    let top = rig.head[0];
    for (const c of rig.clouds) for (const i of c.ix) if (soft.x[i * 3 + 1] > soft.x[top * 3 + 1]) top = i;
    const at = [soft.x[top * 3], soft.x[top * 3 + 1], soft.x[top * 3 + 2]];
    soft.grab('shake', top, at, 0.3);
    action = { name: 'shake', t: 0, at };
  };
  $('#b-squish').onclick = () => { action = { name: 'squish', t: 0 }; soft.planes = [{ y: 4 }]; };
  $('#b-toss').onclick = () => {
    const c = soft.headC;
    const side = Math.random() < 0.5 ? -1 : 1;
    soft.impulse((i, x, y, z) => {
      const rx = x - c[0], ry = y - c[1];
      // up and a little sideways, with a tumble about the view axis
      return [side * 1.4 - ry * side * 4.5, 8.2 + rx * side * 4.5, -0.8];
    });
  };
  const slow = $('#b-slow'), pause = $('#b-pause'), mesh = $('#b-mesh');
  slow.onclick = () => { state.speed = state.speed === 1 ? 0.25 : 1; slow.setAttribute('aria-pressed', String(state.speed !== 1)); };
  pause.onclick = () => { state.paused = !state.paused; pause.setAttribute('aria-pressed', String(state.paused)); };
  mesh.onclick = () => {
    state.mesh = !state.mesh;
    mesh.setAttribute('aria-pressed', String(state.mesh));
    fur.uniforms.meshView.value = state.mesh ? 1 : 0;
    body.geometry.instanceCount = state.mesh ? 1 : SHELLS;
    rigLines.visible = rigPts.visible = state.mesh;
  };

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    const digit = /^Digit([1-4])$/.exec(e.code);
    if (e.shiftKey && digit) setCharacter(CHARACTERS[+digit[1] - 1]);
    else if (k >= '1' && k <= '4') setTool(['hand', 'finger', 'comb', 'stick'][+k - 1]);
    else if (k === 'c') togglePanel(!document.body.classList.contains('panel-open'));
    else if (k === 'r') reset();
    else if (k === ' ') { e.preventDefault(); pause.onclick(); }
    else if (k === 'escape') tools.releasePins();
  });

  // the octopus is squished from 2.75 to 1.0 (Phase 1); others in proportion
  const squishSpan = () => {
    if (rig.name === 'octopus') return [2.75, 1.0];
    let top = 0;
    for (const c of rig.clouds) for (const i of c.ix) top = Math.max(top, soft.x[i * 3 + 1] + soft.r[i]);
    return [top + 0.2, top * 0.45];
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
      // press from just above the toy's top down to a bit over a third of it
      const sq = action.span || (action.span = squishSpan());
      soft.planes[0].y = THREE.MathUtils.lerp(sq[0], sq[1], ease);
      if (t > 1.4) { soft.planes = []; action = null; }
    }
  };

  const first = new URLSearchParams(location.search).get('character');
  setCharacter(CHARACTERS.includes(first) ? first : 'octopus');

  /* ── loop ───────────────────────────────────────────────────────────────── */
  const backend = renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  $('#o-backend').textContent = backend;
  const P = new THREE.Vector3(), N = new THREE.Vector3(), up = new THREE.Vector3(), X = new THREE.Vector3();
  const M = new THREE.Matrix4();
  const _q = new THREE.Quaternion(), _z = new THREE.Vector3(0, 0, 1);
  let last = performance.now(), frames = 0, fpsT = 0, readT = 0;

  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    // keep the octopus framed on narrow screens
    const narrow = innerWidth / innerHeight < 0.8;
    camera.fov = narrow ? 40 : 30;
    tools.orbit.dist = narrow ? 19 : 12.4;
    tools.applyOrbit();
    camera.setViewOffset(innerWidth, innerHeight, frame.shift, 0, innerWidth, innerHeight);
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

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
      grasp.update(h);
    }, (h) => {
      body.pressPoints = tools.pressPoints();
      body.update(h);
    });
    groom.relax(real);
    if (groom.dirty) { groomTex.needsUpdate = true; groom.dirty = false; }
    // the camera drifts after the octopus so play never walks it out of frame
    const ft = tools.orbit.target, hc = soft.headC;
    if (!tools.ptrs.size) {   // never move the camera under a working pointer
      const k = Math.min(1, real * 1.4);
      ft.x += (hc[0] - ft.x) * k;
      ft.z += (hc[2] - ft.z) * k;
      ft.y += (THREE.MathUtils.clamp(hc[1] * 0.55 + 0.2, 0.6, 2.4) + rig.camY - ft.y) * k;
      tools.applyOrbit();
    }
    floor.paint(soft, soft.stick);

    // eyes ride the head surface
    const ey = CHARACTER_INFO[rig.name].eyes;
    const eyePart = body.parts.find((q) => q.name === ey.part);
    const R = soft.cloudR[eyePart.cloud];
    up.set(R[1], R[4], R[7]);
    for (const e of eyes) {
      body.surfacePoint(eyePart.name, 0.5 + e.userData.side * ey.u, ey.v, P, N);
      e.position.copy(P).addScaledVector(N, ey.lift);
      X.crossVectors(up, N).normalize();
      const Y = new THREE.Vector3().crossVectors(N, X);
      M.makeBasis(X, Y, N);
      e.quaternion.setFromRotationMatrix(M);
      // almond eyes slant up toward the temples
      if (ey.tilt) e.quaternion.multiply(_q.setFromAxisAngle(_z, -e.userData.side * ey.tilt));
      e.scale.set(...ey.scale);
    }

    if (soft.stick) { stickMesh.visible = true; poseStick(stickMesh, soft.stick); }
    else stickMesh.visible = false;

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
    if (readT > 0.12) {
      readT = 0;
      const mass = Math.round(60 + 50 * soft.params.stuffing);
      $('#r-mass').innerHTML = `${mass}<small>g</small>`;
      $('#r-vol').innerHTML = `${(soft.volumeRatio() * 100).toFixed(1)}<small>%</small>`;
      // particles share the mass; 1 unit = 9 cm
      const ke = soft.kinetic() * (mass / 1000 / soft.n) * 0.0081 * 1000;
      $('#r-ke').innerHTML = `${ke.toFixed(2)}<small>mJ</small>`;
      const arms = new Set();
      for (const g of soft.grabs.values()) if (rig.armOf[g.i] >= 0) arms.add(rig.armOf[g.i]);
      grasp.arms.forEach((a, k) => { if (a.state === 'grip') arms.add(k); });
      const unit = CHARACTER_INFO[rig.name].unit;
      $('#r-hold').innerHTML = `${arms.size}<small>${arms.size === 1 ? unit[0] : unit[1]}</small>`;
    }
  };

  renderer.setAnimationLoop(() => {
    // a hidden or collapsed pane has no swapchain to draw into
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    const now = performance.now();
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
    frameFn(real);
  });

  document.body.classList.add('is-live');
  // the current character's objects are getters: they change on a switch
  window.__flock = {
    get soft() { return soft; }, get grasp() { return grasp; }, get idle() { return idle; },
    get body() { return body; }, get rig() { return rig; }, get character() { return state.character; },
    groom, tools, renderer, fur, scene, camera, shells,
    setCharacter,
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
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 30px 30px;font:12px ui-monospace,monospace;color:#7a4030">Flock couldn't start: ${String(err.message || err)}</p>`);
});
