import * as THREE from 'three/webgpu';
import { buildRig } from './rig.js';
import { SoftBody } from './softbody.js';
import { Grasp } from './grasp.js';
import { Idle } from './idle.js';
import { Groom } from './groom.js';
import { Body } from './body.js';
import {
  SHELLS, FUR_COLORS, makeFurMaterial, makeMaskTexture, makeGroomTexture,
  makeEyeMaterial, Floor, makeStick, poseStick,
} from './fur.js';
import { Tools } from './tools.js';

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

  const rig = buildRig();
  const soft = new SoftBody(rig);
  const grasp = new Grasp(soft);
  const idle = new Idle(soft);
  const groom = new Groom();
  const body = new Body(rig, soft);

  const groomTex = makeGroomTexture(groom);
  const maskTex = makeMaskTexture();
  const fur = makeFurMaterial(groomTex, maskTex);
  body.geometry.instanceCount = SHELLS;
  const shells = new THREE.Mesh(body.geometry, fur.material);
  shells.frustumCulled = false;
  scene.add(shells);

  const floor = new Floor();
  scene.add(floor.mesh);

  const eyeMat = makeEyeMaterial();
  const eyeGeo = new THREE.SphereGeometry(1, 40, 28);
  const eyes = [-1, 1].map((s) => {
    const m = new THREE.Mesh(eyeGeo, eyeMat);
    m.userData.u = 0.5 + s * 0.068;
    scene.add(m);
    return m;
  });

  const stickMesh = makeStick();
  scene.add(stickMesh);

  // rig view: points + links
  const rigGeo = new THREE.BufferGeometry();
  const rigPos = new Float32Array(rig.n * 3);
  rigGeo.setAttribute('position', new THREE.BufferAttribute(rigPos, 3).setUsage(THREE.DynamicDrawUsage));
  const linkIdx = [];
  for (let l = 0; l < rig.linkA.length; l++) linkIdx.push(rig.linkA[l], rig.linkB[l]);
  rigGeo.setIndex(linkIdx);
  const rigLines = new THREE.LineSegments(rigGeo, new THREE.LineBasicMaterial({ color: 0x1d1a17, depthTest: false, transparent: true, opacity: 0.9 }));
  // WebGPU points are always one pixel, so the rig's points are tiny spheres
  const rigPts = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xc8a877, depthTest: false, transparent: true, opacity: 0.95 }), rig.n);
  const rigM = new THREE.Matrix4();
  rigLines.renderOrder = rigPts.renderOrder = 10;
  rigLines.visible = rigPts.visible = false;
  rigLines.frustumCulled = rigPts.frustumCulled = false;
  scene.add(rigLines, rigPts);

  const tools = new Tools({
    canvas, camera, body, soft, grasp, groom, stickMesh,
    onStick: (on) => { $('#b-stick').disabled = !on; },
  });

  /* ── panel ──────────────────────────────────────────────────────────────── */
  const state = { speed: 1, paused: false, mesh: false, color: 'coral' };
  const furBox = $('#p-fur');
  for (const [name, c] of Object.entries(FUR_COLORS)) {
    const b = document.createElement('button');
    b.innerHTML = `<span class="sw" style="background:linear-gradient(90deg,${c.fur} 62%,${c.under} 62%)"></span><b>${name[0].toUpperCase() + name.slice(1)}</b>`;
    b.setAttribute('aria-pressed', String(name === state.color));
    b.onclick = () => {
      state.color = name;
      fur.uniforms.color.value.set(c.fur);
      fur.uniforms.under.value.set(c.under);
      for (const x of furBox.children) x.setAttribute('aria-pressed', String(x === b));
    };
    furBox.appendChild(b);
  }
  const slider = (id, fmt, apply) => {
    const s = $('#s-' + id), o = $('#o-' + id);
    const set = () => { const v = parseFloat(s.value); o.textContent = fmt(v); apply(v); };
    s.addEventListener('input', set);
    set();
  };
  slider('pile', (v) => `${v} mm`, (v) => { fur.uniforms.pile.value = v / 90; });   // 1 unit = 9 cm
  slider('density', (v) => String(v), (v) => { fur.uniforms.density.value = v; });
  slider('stuffing', (v) => v.toFixed(2), (v) => { soft.params.stuffing = v; });
  slider('damping', (v) => v.toFixed(2), (v) => { soft.params.damping = v; });
  slider('grip', (v) => v.toFixed(2), (v) => { grasp.params.grip = v; });
  slider('idle', (v) => (v === 0 ? 'still' : v.toFixed(2)), (v) => { idle.amount = v; });

  const HINTS = {
    hand: '<b>Hand</b>Grab the head or any arm and pull — it stretches, then springs back. Shift as you let go to pin that point, then grab another.',
    finger: '<b>Finger</b>Press into the plush. Hold to push deeper; it fills back out when you lift.',
    comb: '<b>Comb</b>Brush the fur. With the nap it lies flat and shines; against it, it stands up and stays ruffled.',
    stick: '<b>Stick</b>Click the floor to lay a stick near an arm. Drag the stick to lift — whatever it is holding comes too.',
  };
  const setTool = (m) => {
    tools.setMode(m);
    for (const b of document.querySelectorAll('#tools button')) b.setAttribute('aria-pressed', String(b.dataset.tool === m));
    $('#hint').innerHTML = HINTS[m];
  };
  for (const b of document.querySelectorAll('#tools button')) b.onclick = () => setTool(b.dataset.tool);
  setTool('hand');

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

  /* ── actions ────────────────────────────────────────────────────────────── */
  let action = null;   // {name, t, ...}
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
    for (const i of rig.head) if (soft.x[i * 3 + 1] > soft.x[top * 3 + 1]) top = i;
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
    if (k >= '1' && k <= '4') setTool(['hand', 'finger', 'comb', 'stick'][+k - 1]);
    else if (k === 'c') togglePanel(!document.body.classList.contains('panel-open'));
    else if (k === 'r') reset();
    else if (k === ' ') { e.preventDefault(); pause.onclick(); }
    else if (k === 'escape') tools.releasePins();
  });

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
      let top = 0;
      for (const i of rig.head) top = Math.max(top, soft.x[i * 3 + 1] + soft.r[i]);
      const down = t < 0.45 ? t / 0.45 : t < 0.9 ? 1 : Math.max(0, 1 - (t - 0.9) / 0.45);
      const ease = down * down * (3 - 2 * down);
      soft.planes[0].y = THREE.MathUtils.lerp(2.75, 1.0, ease);
      if (t > 1.4) { soft.planes = []; action = null; }
    }
  };

  /* ── loop ───────────────────────────────────────────────────────────────── */
  const backend = renderer.backend && renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  $('#o-backend').textContent = backend;
  const P = new THREE.Vector3(), N = new THREE.Vector3(), up = new THREE.Vector3(), X = new THREE.Vector3();
  const M = new THREE.Matrix4();
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

  renderer.setAnimationLoop(() => {
    // a hidden or collapsed pane has no swapchain to draw into
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    const now = performance.now();
    const real = Math.min(0.05, (now - last) / 1000);
    last = now;
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
      ft.y += (THREE.MathUtils.clamp(hc[1] * 0.55 + 0.2, 0.6, 2.4) - ft.y) * k;
      tools.applyOrbit();
    }
    floor.paint(soft, soft.stick);

    // eyes ride the head surface
    const R = soft.headR;
    up.set(R[1], R[4], R[7]);
    for (const e of eyes) {
      body.headPoint(e.userData.u, 0.5, P, N);
      e.position.copy(P).addScaledVector(N, 0.035);
      X.crossVectors(up, N).normalize();
      const Y = new THREE.Vector3().crossVectors(N, X);
      M.makeBasis(X, Y, N);
      e.quaternion.setFromRotationMatrix(M);
      e.scale.set(0.15, 0.175, 0.1);
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
      $('#r-hold').innerHTML = `${arms.size}<small>${arms.size === 1 ? 'arm' : 'arms'}</small>`;
    }
  });

  document.body.classList.add('is-live');
  window.__flock = { soft, grasp, idle, groom, body, tools, renderer, fur, scene, camera, shells };
}

start().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 30px 30px;font:12px ui-monospace,monospace;color:#7a4030">Flock couldn't start: ${String(err.message || err)}</p>`);
});
