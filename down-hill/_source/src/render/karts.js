/* The seven karts, each themed to its driver, each with an ALT re-skin to
   match the ALT outfit. Built from a few dozen primitives each (no
   textures bigger than a decal strip), all MeshStandardMaterial lit by the
   room. Local frame: +z forward, y up, the ground at y = 0; about 4.4 long
   and 2.8 wide (the sim's bump radius is 1.55).

   build(id, alt) → { group, body, wheels, seat, plush: {scale, y, z},
   exhaust, detail (hidden at the far LOD), parts: {…per-kart moving bits} } */

import * as THREE from 'three/webgpu';
import { rbox, mat, glowMat, mesh, canvasTex, mergeStatic } from './geo.js';

const TAU = Math.PI * 2;

/* skins: OG and ALT colours for each kart */
const SKIN = {
  zamboni: [
    { body: '#f3f1ec', trim: '#c8202a', accent: '#1d4fa3', hub: '#c8202a', seat: '#1d4fa3', text: 'KEV 19' },
    { body: '#14254a', trim: '#ef6a1e', accent: '#ef6a1e', hub: '#ef6a1e', seat: '#0b1530', text: 'GOON 44' },
  ],
  bus: [
    { body: '#c8161d', trim: '#f2d37a', accent: '#232227', hub: '#e9e2cf', seat: '#2e2a30', win: '#ffe7a3' },
    { body: '#151317', trim: '#d8b25a', accent: '#0f6b47', hub: '#d8b25a', seat: '#0f6b47', win: '#ffd88a' },
  ],
  roadster: [
    { body: '#f2c14e', trim: '#8a4b22', accent: '#fff6df', hub: '#d9d9de', seat: '#6a3a1c' },
    { body: '#2a2630', trim: '#ff2bd6', accent: '#c9c9d2', hub: '#ff2bd6', seat: '#121015' },
  ],
  lowrider: [
    { body: '#14915a', trim: '#f4f1ea', accent: '#e9c349', hub: '#e9c349', seat: '#f4f1ea' },
    { body: '#151318', trim: '#d4102c', accent: '#d4102c', hub: '#c9c9d2', seat: '#d4102c' },
  ],
  washtub: [
    { body: '#a9b2ba', trim: '#e06a4f', accent: '#7c868f', hub: '#e06a4f', seat: '#e06a4f' },
    { body: '#1b2430', trim: '#7af6ff', accent: '#0e141c', hub: '#7af6ff', seat: '#0e141c', glow: '#7af6ff' },
  ],
  ballmachine: [
    { body: '#2f7d4a', trim: '#f4f1ea', accent: '#d7f230', hub: '#f4f1ea', seat: '#1f5a34', ball: '#d7f230' },
    { body: '#1a181d', trim: '#ff2230', accent: '#ff2230', hub: '#ff2230', seat: '#0c0b0e', ball: '#ff3340', glow: '#ff2230' },
  ],
  cart: [
    { body: '#b9c3cc', trim: '#d0242b', accent: '#e9c349', hub: '#d0242b', seat: '#d0242b' },
    { body: '#d9d4c4', trim: '#3a3a40', accent: '#8ff0c0', hub: '#3a3a40', seat: '#2b2b30', glow: '#8ff0c0' },
  ],
};

function wheel(r, w, tire, hub) {
  const g = new THREE.Group();
  const t = mesh(new THREE.CylinderGeometry(r, r, w, 18, 1), mat(tire, { roughness: 0.9 }), 0, 0, 0, g);
  t.rotation.z = Math.PI / 2;
  const h = mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w * 1.06, 14), mat(hub, { roughness: 0.35, metalness: 0.4 }), 0, 0, 0, g);
  h.rotation.z = Math.PI / 2;
  const cap = mesh(new THREE.SphereGeometry(r * 0.22, 10, 8), mat('#f4f1ea', { roughness: 0.3, metalness: 0.5 }), 0, 0, 0, g);
  cap.scale.set(w * 2.4, 1, 1);
  return g;
}

function addWheels(K, { r = 0.5, w = 0.5, x = 1.25, zf = 1.35, zb = -1.35, tire = '#1e1c22', hub, y = r }) {
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const wl = wheel(r, w, tire, hub);
    wl.position.set(sx * x, y, sz > 0 ? zf : zb);
    wl.userData.front = sz > 0;
    wl.userData.r = r;
    K.group.add(wl);
    K.wheels.push(wl);
  }
}

function base(id, alt) {
  const group = new THREE.Group(), body = new THREE.Group();
  group.add(body);
  const seat = new THREE.Group();
  body.add(seat);
  return { id, alt, group, body, seat, wheels: [], detail: [], exhaust: [], parts: {}, plush: { scale: 0.62, y: 0.55, z: -0.25 } };
}

/* a number / word decal on a strip */
function decal(text, fg, bg, w = 256, h = 64) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = `900 ${Math.round(h * 0.62)}px "Bolster Display","Arial Black",sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
  });
}

/* ── Kevalanche: a stubby ice resurfacer ── */
function zamboni(alt) {
  const S = SKIN.zamboni[alt ? 1 : 0], K = base('zamboni', alt), B = K.body;
  mesh(rbox(2.7, 0.9, 4.3, 0.3), mat(S.body, { roughness: 0.45 }), 0, 0.95, 0, B);
  // the snow tank up front: a tall rounded hopper
  mesh(rbox(2.5, 1.15, 1.5, 0.28), mat(S.body, { roughness: 0.45 }), 0, 1.75, 1.25, B);
  mesh(rbox(2.56, 0.18, 1.56, 0.08), mat(S.trim), 0, 1.95, 1.25, B);
  // a red stripe round the waist, the blue band below
  mesh(rbox(2.76, 0.22, 4.36, 0.1), mat(S.trim), 0, 1.2, 0, B);
  mesh(rbox(2.74, 0.16, 4.34, 0.08), mat(S.accent), 0, 0.62, 0, B);
  // the conditioner at the back: a wide flat box, a roller and a squeegee
  mesh(rbox(2.9, 0.42, 0.7, 0.14), mat(S.accent, { roughness: 0.5 }), 0, 0.45, -2.25, B);
  const roll = mesh(new THREE.CylinderGeometry(0.2, 0.2, 2.8, 14), mat('#e8f2fb', { roughness: 0.2, metalness: 0.2 }), 0, 0.22, -2.55, B);
  roll.rotation.z = Math.PI / 2;
  K.parts.roller = roll;
  // a number decal on each side
  const dm = new THREE.MeshStandardMaterial({ map: decal(S.text, alt ? '#ef6a1e' : '#c8202a', alt ? '#14254a' : '#f3f1ec'), roughness: 0.5 });
  for (const s of [-1, 1]) { const d = mesh(new THREE.PlaneGeometry(2.2, 0.55), dm, s * 1.37, 1.55, 1.25, B); d.rotation.y = s * Math.PI / 2; K.detail.push(d); }
  // a little steering column and a seat back
  mesh(rbox(1.5, 0.9, 0.3, 0.12), mat(S.seat), 0, 1.65, -1.05, B);
  if (alt) {
    // the goon: a hockey stick strapped to the side, a tape-wrapped blade
    const st = mesh(rbox(0.12, 0.12, 3.6, 0.05), mat('#d9b27c'), 1.45, 1.35, -0.2, B);
    st.rotation.x = 0.08;
    mesh(rbox(0.14, 0.4, 0.7, 0.05), mat('#111'), 1.45, 1.15, 1.75, B);
    K.detail.push(st);
  } else {
    // his stick rides along (stage 3), and a maple leaf flag on a whip
    const st = mesh(rbox(0.12, 0.12, 3.6, 0.05), mat('#d9b27c'), 1.45, 1.35, -0.2, B);
    st.rotation.x = 0.08;
    mesh(rbox(0.14, 0.4, 0.7, 0.05), mat('#1d4fa3'), 1.45, 1.15, 1.75, B);
    K.detail.push(st);
    const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2), mat('#ddd'), -1.05, 2.4, -1.9, B);
    const fl = mesh(new THREE.PlaneGeometry(0.8, 0.5), new THREE.MeshStandardMaterial({ map: flagTex('ca'), side: THREE.DoubleSide }), -1.45, 3.25, -1.9, B);
    K.detail.push(pole, fl); K.parts.flag = fl;
  }
  addWheels(K, { r: 0.52, w: 0.55, x: 1.3, zf: 1.45, zb: -1.35, hub: S.hub });
  K.plush = { scale: 0.6, y: 1.1, z: -0.35 };
  K.exhaust.push(new THREE.Vector3(0, 0.3, -2.7));
  return K;
}

/* ── Sumaura: a squat double-decker (the ALT: an art-deco casino coach) ── */
function bus(alt) {
  const S = SKIN.bus[alt ? 1 : 0], K = base('bus', alt), B = K.body;
  mesh(rbox(2.8, 1.25, 4.6, 0.35), mat(S.body, { roughness: 0.4 }), 0, 1.05, 0, B);
  // the upper deck: open-topped, a rail round it
  mesh(rbox(2.7, 0.75, 4.2, 0.3), mat(S.body, { roughness: 0.4 }), 0, 2.0, -0.1, B);
  mesh(rbox(2.84, 0.12, 4.64, 0.05), mat(S.trim, { roughness: 0.3, metalness: alt ? 0.6 : 0 }), 0, 1.66, 0, B);
  // window bands, lit warm from inside
  const win = mat(S.win, { emissive: S.win, emissiveIntensity: 0.5, roughness: 0.2 });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) { const w = mesh(rbox(0.06, 0.45, 0.78, 0.04), win, s * 1.4, 1.25, -1.55 + i * 1.02, B); K.detail.push(w); }
    for (let i = 0; i < 3; i++) { const w = mesh(rbox(0.06, 0.35, 0.95, 0.04), win, s * 1.36, 2.08, -1.4 + i * 1.25, B); K.detail.push(w); }
  }
  // the front: a big black grille and headlamps
  mesh(rbox(2.2, 0.6, 0.12, 0.05), mat(S.accent), 0, 0.85, 2.32, B);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.2, 12, 10), glowMat('#fff3c4', 1.2), s * 1.0, 0.95, 2.33, B);
  // destination blind / the casino's marquee
  const dm = new THREE.MeshStandardMaterial({ map: decal(alt ? 'CASINO ♠' : '19 LANDING', alt ? '#ffd88a' : '#fff', '#111', 256, 48), emissive: '#ffffff', emissiveMap: decal(alt ? 'CASINO ♠' : '19 LANDING', alt ? '#ffd88a' : '#fff', '#111', 256, 48), emissiveIntensity: 0.6 });
  const dst = mesh(new THREE.PlaneGeometry(1.8, 0.34), dm, 0, 1.5, 2.34, B);
  K.detail.push(dst);
  if (alt) {
    // art-deco fans in gold on the flanks, a green-felt deck
    for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
      const fan = mesh(new THREE.CircleGeometry(0.42, 16, 0, Math.PI), mat(S.trim, { metalness: 0.7, roughness: 0.3 }), s * 1.42, 0.55, -1.2 + i * 2.4, B);
      fan.rotation.y = s * Math.PI / 2; K.detail.push(fan);
    }
    mesh(rbox(2.5, 0.06, 3.9, 0.03), mat('#0f6b47', { roughness: 0.9 }), 0, 2.36, -0.1, B);
  }
  addWheels(K, { r: 0.5, w: 0.5, x: 1.28, zf: 1.55, zb: -1.5, hub: S.hub });
  K.plush = { scale: 0.58, y: 1.85, z: -0.2 };
  K.exhaust.push(new THREE.Vector3(0.9, 0.35, -2.4));
  return K;
}

/* ── K8-E: an open-top racing-stripe roadster ── */
function roadster(alt) {
  const S = SKIN.roadster[alt ? 1 : 0], K = base('roadster', alt), B = K.body;
  // a long low body, the nose tapering
  const bodyG = rbox(2.5, 0.75, 4.6, 0.33);
  const p = bodyG.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getZ(i); if (z > 0.6) { const t = (z - 0.6) / 1.7; p.setX(i, p.getX(i) * (1 - 0.32 * t)); p.setY(i, p.getY(i) * (1 - 0.3 * t) - 0.1 * t); } }
  bodyG.computeVertexNormals();
  mesh(bodyG, mat(S.body, { roughness: 0.3, metalness: 0.15 }), 0, 0.8, 0.1, B);
  // twin racing stripes over the nose and tail
  for (const s of [-1, 1]) {
    const st = mesh(rbox(0.32, 0.06, 4.5, 0.03), mat(S.trim, { roughness: 0.35 }), s * 0.3, 1.17, 0.1, B);
    K.detail.push(st);
  }
  // the cockpit tub, a little windscreen, a roll hoop
  mesh(rbox(1.6, 0.4, 1.4, 0.2), mat(S.seat, { roughness: 0.8 }), 0, 1.0, -0.45, B);
  const ws = mesh(new THREE.PlaneGeometry(1.5, 0.45), new THREE.MeshStandardMaterial({ color: '#cfe8ff', transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide }), 0, 1.4, 0.5, B);
  ws.rotation.x = -0.45;
  const hoop = mesh(new THREE.TorusGeometry(0.6, 0.07, 8, 20, Math.PI), mat(S.accent, { metalness: 0.6, roughness: 0.25 }), 0, 1.15, -1.35, B);
  K.detail.push(hoop);
  // headlamps, a tail spoiler
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.17, 12, 10), glowMat('#fff6d8', 1.0), s * 0.75, 0.85, 2.25, B);
  mesh(rbox(2.4, 0.08, 0.5, 0.04), mat(S.trim), 0, 1.45, -2.05, B);
  for (const s of [-1, 1]) mesh(rbox(0.08, 0.4, 0.2, 0.03), mat(S.trim), s * 0.9, 1.25, -2.05, B);
  if (alt) {
    // punk studs down the stripes, spiked hubs
    for (let i = 0; i < 8; i++) for (const s of [-1, 1]) { const c = mesh(new THREE.ConeGeometry(0.08, 0.22, 6), mat('#d8d8de', { metalness: 0.8, roughness: 0.2 }), s * 0.3, 1.27, -1.9 + i * 0.55, B); K.detail.push(c); }
  } else {
    // giraffe spots on the flanks
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
      const sp = mesh(new THREE.CircleGeometry(0.22 + (i % 2) * 0.08, 7), mat('#a8622f'), s * 1.27, 0.75 + (i % 2) * 0.15, -1.6 + i * 0.62, B);
      sp.rotation.y = s * Math.PI / 2; K.detail.push(sp);
    }
  }
  addWheels(K, { r: 0.48, w: 0.45, x: 1.22, zf: 1.45, zb: -1.4, hub: S.hub });
  K.plush = { scale: 0.56, y: 0.55, z: -0.45 };
  K.exhaust.push(new THREE.Vector3(-0.6, 0.45, -2.4), new THREE.Vector3(0.6, 0.45, -2.4));
  return K;
}

/* ── Sebas: a lowrider (bounces on its hydraulics on TAUNT) ── */
function lowrider(alt) {
  const S = SKIN.lowrider[alt ? 1 : 0], K = base('lowrider', alt), B = K.body;
  mesh(rbox(2.7, 0.6, 4.9, 0.22), mat(S.body, { roughness: 0.18, metalness: 0.35 }), 0, 0.68, 0, B);
  // fins at the back, a long bonnet
  for (const s of [-1, 1]) { const f = mesh(rbox(0.16, 0.35, 1.4, 0.08), mat(S.body, { roughness: 0.18, metalness: 0.35 }), s * 1.25, 1.08, -1.75, B); f.rotation.x = -0.12; }
  // chrome bumpers
  const chrome = mat('#e8e8ee', { metalness: 0.95, roughness: 0.12 });
  mesh(rbox(2.85, 0.22, 0.24, 0.1), chrome, 0, 0.5, 2.48, B);
  mesh(rbox(2.85, 0.22, 0.24, 0.1), chrome, 0, 0.5, -2.48, B);
  // pinstripes (or the rudo's flames)
  for (const s of [-1, 1]) {
    const tex = alt ? flameTex() : pinTex(S.trim);
    const d = mesh(new THREE.PlaneGeometry(4.2, 0.5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.2, metalness: 0.2 }), s * 1.36, 0.72, 0.1, B);
    d.rotation.y = s * Math.PI / 2; K.detail.push(d);
  }
  // white-wall seat bench, a chain steering wheel
  mesh(rbox(2.0, 0.55, 0.35, 0.15), mat(S.seat, { roughness: 0.7 }), 0, 1.15, -1.05, B);
  const sw = mesh(new THREE.TorusGeometry(0.28, 0.05, 8, 18), mat(S.accent, { metalness: 0.9, roughness: 0.2 }), 0, 1.35, 0.55, B);
  sw.rotation.x = -0.9; K.detail.push(sw);
  for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.18, 12, 10), glowMat('#fff3c4', 1.0), s * 0.95, 0.72, 2.45, B);
  addWheels(K, { r: 0.42, w: 0.42, x: 1.2, zf: 1.6, zb: -1.6, tire: '#f2efe6', hub: S.hub });
  K.plush = { scale: 0.6, y: 0.62, z: -0.5 };
  K.parts.hydraulics = true;
  K.exhaust.push(new THREE.Vector3(0.8, 0.35, -2.6));
  return K;
}

/* ── Rubberta: a tin washtub on wheels ── */
function washtub(alt) {
  const S = SKIN.washtub[alt ? 1 : 0], K = base('washtub', alt), B = K.body;
  const tin = mat(S.body, { metalness: alt ? 0.3 : 0.75, roughness: alt ? 0.6 : 0.35 });
  const tub = mesh(new THREE.CylinderGeometry(1.6, 1.3, 1.25, 28, 4, true), tin, 0, 1.2, 0, B);
  tub.material = tin;
  tub.geometry.computeVertexNormals();
  const inside = mesh(new THREE.CylinderGeometry(1.55, 1.25, 1.2, 28, 1, true), mat(S.accent, { metalness: 0.5, roughness: 0.5, side: THREE.BackSide }), 0, 1.2, 0, B);
  K.detail.push(inside);
  mesh(new THREE.CircleGeometry(1.28, 24), mat(S.accent, { metalness: 0.5, roughness: 0.5 }), 0, 0.6, 0, B).rotation.x = -Math.PI / 2;
  // ribs round it, a rolled rim, two handles
  for (const y of [0.85, 1.25]) { const r = mesh(new THREE.TorusGeometry(1.34 + (y - 0.6) * 0.24, 0.05, 6, 32), tin, 0, y, 0, B); r.rotation.x = Math.PI / 2; K.detail.push(r); }
  const rim = mesh(new THREE.TorusGeometry(1.6, 0.09, 8, 36), tin, 0, 1.83, 0, B); rim.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) { const h = mesh(new THREE.TorusGeometry(0.28, 0.05, 6, 14, Math.PI), mat(S.trim), s * 1.65, 1.7, 0, B); h.rotation.y = Math.PI / 2; h.rotation.z = s * -0.4; K.detail.push(h); }
  if (alt) {
    // the abyss tub: glowing rivets and a porthole
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; mesh(new THREE.SphereGeometry(0.07, 8, 6), glowMat(S.glow, 2.2), Math.sin(a) * 1.5, 1.55, Math.cos(a) * 1.5, B); }
    const port = mesh(new THREE.TorusGeometry(0.32, 0.07, 8, 20), mat('#c9a35a', { metalness: 0.8, roughness: 0.3 }), 0, 1.2, 1.5, B);
    mesh(new THREE.CircleGeometry(0.3, 16), glowMat('#1d6c8a', 1.0), 0, 1.2, 1.49, B);
    K.detail.push(port);
  } else {
    // soap suds on the rim
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + 0.3; const s = mesh(new THREE.SphereGeometry(0.16 + (i % 3) * 0.06, 10, 8), mat('#ffffff', { roughness: 0.3 }), Math.sin(a) * 1.55, 1.9, Math.cos(a) * 1.55, B); K.detail.push(s); }
  }
  // paddling tentacles over the sides (her own: felt tubes that row)
  const tc = alt ? '#16131f' : '#e8735e';
  K.parts.paddles = [];
  for (const s of [-1, 1]) for (const z of [0.55, -0.55]) {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.45, -0.1, 0), new THREE.Vector3(0.7, -0.6, 0.1), new THREE.Vector3(0.75, -1.1, 0.25)]);
    const t = mesh(new THREE.TubeGeometry(curve, 10, 0.13, 7), mat(tc, { roughness: 0.85 }), 0, 0, 0);
    const pv = new THREE.Group(); pv.position.set(s * 1.45, 1.75, z); pv.rotation.y = s > 0 ? 0 : Math.PI; pv.add(t); B.add(pv);
    K.parts.paddles.push({ g: pv, s, ph: z > 0 ? 0 : Math.PI });
    K.detail.push(pv);
  }
  addWheels(K, { r: 0.38, w: 0.32, x: 1.1, zf: 1.05, zb: -1.05, hub: S.hub, y: 0.38 });
  K.plush = { scale: 0.64, y: 1.3, z: 0 };
  K.exhaust.push(new THREE.Vector3(0, 0.5, -1.5));
  return K;
}

/* ── Johnny: a tennis-ball machine (fires balls out the back when boosting) ── */
function ballmachine(alt) {
  const S = SKIN.ballmachine[alt ? 1 : 0], K = base('ballmachine', alt), B = K.body;
  mesh(rbox(2.5, 0.8, 4.1, 0.25), mat(S.body, { roughness: 0.55 }), 0, 0.85, 0, B);
  // the hopper: a wire-topped funnel heaped with balls, behind the seat
  const hop = mesh(new THREE.CylinderGeometry(1.15, 0.6, 1.0, 20, 1, true), mat(S.body, { roughness: 0.5, side: THREE.DoubleSide }), 0, 1.75, -1.3, B);
  hop.scale.z = 0.8;
  const ballM = alt ? glowMat(S.ball, 0.9) : mat(S.ball, { roughness: 0.8 });
  const bg = new THREE.SphereGeometry(0.22, 12, 10);
  const rnd = (i) => (Math.sin(i * 12.9898) * 43758.5453) % 1;
  for (let i = 0; i < 14; i++) {
    const a = i * 2.4, r = 0.25 + Math.abs(rnd(i)) * 0.65;
    const b = mesh(bg, ballM, Math.cos(a) * r, 2.2 + (i % 3) * 0.12, -1.3 + Math.sin(a) * r * 0.75, B);
    K.detail.push(b);
  }
  // the launcher barrel out the back
  const bar = mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.1, 14), mat(S.trim, { roughness: 0.4, metalness: 0.3 }), 0, 1.2, -2.3, B);
  bar.rotation.x = Math.PI / 2 - 0.25;
  K.parts.barrel = new THREE.Vector3(0, 1.35, -2.9);
  // white court lines round the deck, net trim
  for (const sx of [-1, 1]) mesh(rbox(0.1, 0.06, 4.12, 0.03), mat(S.trim), sx * 1.22, 1.25, 0, B);
  for (const sz of [-1, 1]) mesh(rbox(2.5, 0.06, 0.1, 0.03), mat(S.trim), 0, 1.25, sz * 2.02, B);
  mesh(rbox(2.5, 0.06, 0.1, 0.03), mat(S.trim), 0, 1.25, 0.9, B);
  if (alt) {
    // the padel laser: red light strips along the flanks
    for (const s of [-1, 1]) mesh(rbox(0.04, 0.08, 3.6, 0.02), glowMat(S.glow, 3), s * 1.27, 0.85, 0, B);
  } else {
    const dm = new THREE.MeshStandardMaterial({ map: decal('DEUCE', '#d7f230', '#2f7d4a'), roughness: 0.5 });
    for (const s of [-1, 1]) { const d = mesh(new THREE.PlaneGeometry(1.8, 0.45), dm, s * 1.26, 0.85, 0.4, B); d.rotation.y = s * Math.PI / 2; K.detail.push(d); }
  }
  mesh(rbox(1.5, 0.75, 0.3, 0.12), mat(S.seat), 0, 1.5, -0.55, B);
  addWheels(K, { r: 0.45, w: 0.42, x: 1.2, zf: 1.35, zb: -1.3, hub: S.hub });
  K.plush = { scale: 0.6, y: 0.85, z: 0.05 };
  K.exhaust.push(new THREE.Vector3(0, 1.3, -2.9));
  return K;
}

/* ── Zach: a stolen shopping cart piled with shiny junk ── */
function cart(alt) {
  const S = SKIN.cart[alt ? 1 : 0], K = base('cart', alt), B = K.body;
  // the wire basket: four mesh walls (a grid texture, alpha-tested) and a floor
  const wire = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.lineWidth = 7;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); }
  }, { repeat: [3, 1.2] });
  const wm = new THREE.MeshStandardMaterial({ color: S.body, map: wire, alphaMap: wire, alphaTest: 0.5, metalness: 0.85, roughness: 0.3, side: THREE.DoubleSide });
  const wall = (w, h, x, y, z, ry, tilt = 0) => { const m = mesh(new THREE.PlaneGeometry(w, h), wm, x, y, z, B); m.rotation.y = ry; m.rotation.x = tilt; return m; };
  wall(4.0, 1.5, 1.25, 1.55, 0, Math.PI / 2); wall(4.0, 1.5, -1.25, 1.55, 0, -Math.PI / 2);
  wall(2.5, 1.5, 0, 1.55, 2.0, 0, 0.15); wall(2.5, 1.5, 0, 1.55, -2.0, 0);
  const frame = mat(S.body, { metalness: 0.9, roughness: 0.25 });
  for (const [x, z] of [[-1.25, 2], [1.25, 2], [-1.25, -2], [1.25, -2]]) mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5), frame, x, 1.55, z, B);
  for (const y of [0.8, 2.3]) { mesh(rbox(2.6, 0.08, 0.08, 0.03), frame, 0, y, 2, B); mesh(rbox(2.6, 0.08, 0.08, 0.03), frame, 0, y, -2, B); mesh(rbox(0.08, 0.08, 4.0, 0.03), frame, 1.25, y, 0, B); mesh(rbox(0.08, 0.08, 4.0, 0.03), frame, -1.25, y, 0, B); }
  mesh(rbox(2.5, 0.08, 4.0, 0.03), mat(S.accent === '#8ff0c0' ? '#3a3a40' : '#8a9198', { metalness: 0.6, roughness: 0.4 }), 0, 0.82, 0, B);
  // the push handle, in the store's red (the ghost galleon: a mast and a tattered sail)
  mesh(rbox(2.7, 0.18, 0.18, 0.08), mat(S.trim, { roughness: 0.5 }), 0, 2.55, -2.35, B);
  for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6), frame, s * 1.2, 2.3, -2.2, B);
  // the junk: coins, a spoon, a ring, bottle caps, a disco ball
  const gold = mat('#e9c349', { metalness: 0.95, roughness: 0.2 }), silver = mat('#e6e9ee', { metalness: 0.95, roughness: 0.12 });
  for (let i = 0; i < 9; i++) { const c = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 16), gold, -0.7 + (i % 3) * 0.6, 1.0 + Math.floor(i / 3) * 0.08, 1.0 + (i % 2) * 0.3, B); c.rotation.set(0.3 * (i % 3), 0, 0.4 * ((i % 2) - 0.5)); K.detail.push(c); }
  const disco = mesh(new THREE.IcosahedronGeometry(0.45, 1), mat('#dfe6ee', { metalness: 1, roughness: 0.05, flatShading: true }), 0.6, 1.5, 1.2, B);
  K.parts.disco = disco; K.detail.push(disco);
  const ring = mesh(new THREE.TorusGeometry(0.25, 0.06, 8, 18), gold, -0.6, 1.35, 1.5, B); ring.rotation.x = 1.2; K.detail.push(ring);
  const sp = mesh(rbox(0.12, 0.05, 1.3, 0.02), silver, 0.2, 1.2, 1.65, B); sp.rotation.set(0.6, 0.4, 0); K.detail.push(sp);
  if (alt) {
    const mast = mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2), mat('#4a3b2c'), 0, 3.0, 1.6, B);
    const sail = mesh(new THREE.PlaneGeometry(1.8, 1.5, 6, 4), new THREE.MeshStandardMaterial({ map: sailTex(), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.9, emissive: '#5fffb0', emissiveIntensity: 0.12 }), 0, 3.4, 1.62, B);
    K.parts.flag = sail; K.detail.push(mast, sail);
    // a ghostly glow in the basket
    mesh(new THREE.SphereGeometry(0.3, 10, 8), glowMat(S.glow, 2.5), -0.6, 1.1, 0.6, B);
  }
  addWheels(K, { r: 0.32, w: 0.28, x: 1.1, zf: 1.7, zb: -1.7, hub: S.hub, y: 0.32 });
  // casters: small, on little forks
  for (const w of K.wheels) mesh(rbox(0.1, 0.5, 0.1, 0.03), frame, w.position.x, 0.65, w.position.z, B);
  K.plush = { scale: 0.66, y: 2.1, z: -0.4 };
  K.exhaust.push(new THREE.Vector3(0, 0.6, -2.2));
  return K;
}

/* ── textures ── */
export function flagTex(code) {
  return canvasTex(96, 64, (g, w, h) => {
    if (code === 'ca') {
      g.fillStyle = '#d52b1e'; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(w / 4, 0, w / 2, h);
      g.fillStyle = '#d52b1e'; g.beginPath();
      const cx = w / 2, cy = h / 2, s = h * 0.38;
      const P = [[0, -1], [0.18, -0.6], [0.42, -0.72], [0.34, -0.36], [0.6, -0.3], [0.44, -0.08], [0.5, 0.1], [0.12, 0.04], [0.06, 0.45], [-0.06, 0.45], [-0.12, 0.04], [-0.5, 0.1], [-0.44, -0.08], [-0.6, -0.3], [-0.34, -0.36], [-0.42, -0.72], [-0.18, -0.6]];
      P.forEach(([x, y], i) => (i ? g.lineTo(cx + x * s, cy + y * s) : g.moveTo(cx + x * s, cy + y * s)));
      g.fill();
    }
    else if (code === 'gb') {
      g.fillStyle = '#1f3a8a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = h * 0.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke();
      g.strokeStyle = '#c8102e'; g.lineWidth = h * 0.07; g.stroke();
      g.fillStyle = '#fff'; g.fillRect(w * 0.42, 0, w * 0.16, h); g.fillRect(0, h * 0.37, w, h * 0.26);
      g.fillStyle = '#c8102e'; g.fillRect(w * 0.455, 0, w * 0.09, h); g.fillRect(0, h * 0.43, w, h * 0.14);
    } else if (code === 'mx') {
      for (const [i, c] of ['#006847', '#fff', '#ce1126'].entries()) { g.fillStyle = c; g.fillRect((i * w) / 3, 0, w / 3 + 1, h); }
      g.fillStyle = '#8c5a2b'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.14, 0, TAU); g.fill();
    } else if (code === 'br') {
      g.fillStyle = '#009c3b'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffdf00'; g.beginPath(); g.moveTo(w / 2, h * 0.1); g.lineTo(w * 0.92, h / 2); g.lineTo(w / 2, h * 0.9); g.lineTo(w * 0.08, h / 2); g.fill();
      g.fillStyle = '#002776'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.22, 0, TAU); g.fill();
    } else if (code === 'nl') {
      for (const [i, c] of ['#ae1c28', '#fff', '#21468b'].entries()) { g.fillStyle = c; g.fillRect(0, (i * h) / 3, w, h / 3 + 1); }
    }
  });
}
function pinTex(c) {
  return canvasTex(512, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = c; g.lineWidth = 4;
    for (const o of [0, 10]) { g.beginPath(); g.moveTo(10, 22 + o); for (let x = 10; x < w - 10; x += 8) g.lineTo(x, 22 + o + Math.sin(x / 40) * 6); g.stroke(); }
    g.beginPath(); g.arc(w - 60, 30, 16, 0, TAU); g.stroke();
  });
}
function flameTex() {
  return canvasTex(512, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#ffd23a'); gr.addColorStop(0.3, '#ff6a1a'); gr.addColorStop(1, '#d4102c');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(w, 10);
    for (let i = 0; i < 7; i++) { const x = w - i * 60; g.quadraticCurveTo(x - 40, 0, x - 60, 26 + (i % 2) * 8); g.quadraticCurveTo(x - 30, 40, x - 60, 54); }
    g.lineTo(w, 58); g.fill();
  });
}
function sailTex() {
  return canvasTex(128, 112, (g, w, h) => {
    g.fillStyle = '#e8e2cf'; g.fillRect(0, 0, w, h);
    // torn edges
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(Math.random() * w, h - Math.random() * 18, 6 + Math.random() * 8, 0, TAU); g.fill(); }
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 5, 0, TAU); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    // a skull
    g.fillStyle = '#26262b';
    g.beginPath(); g.arc(w / 2, h * 0.42, 20, 0, TAU); g.fill(); g.fillRect(w / 2 - 12, h * 0.42 + 10, 24, 14);
    g.fillStyle = '#e8e2cf'; g.beginPath(); g.arc(w / 2 - 8, h * 0.4, 6, 0, TAU); g.arc(w / 2 + 8, h * 0.4, 6, 0, TAU); g.fill();
    g.strokeStyle = '#26262b'; g.lineWidth = 7; g.beginPath(); g.moveTo(w / 2 - 34, h * 0.72); g.lineTo(w / 2 + 34, h * 0.88); g.moveTo(w / 2 + 34, h * 0.72); g.lineTo(w / 2 - 34, h * 0.88); g.stroke();
  });
}

/* stage 3's light refinement: a number plate on the back of every kart with
   its driver's flag (one small plane, a far-LOD detail), where the body ends */
const PLATE = {
  zamboni: { flag: 'ca', n: '19', at: [0, 0.98, -2.17] }, bus: { flag: 'gb', n: '07', at: [0, 0.9, -2.31] },
  roadster: { flag: 'ca', n: '08', at: [0, 0.78, -2.32] }, lowrider: { flag: 'mx', n: '13', at: [0, 0.74, -2.47] },
  washtub: { flag: 'br', n: '88', at: [0, 1.02, -1.47], w: 0.95 }, ballmachine: { flag: 'nl', n: '15', at: [0, 0.82, -2.07] },
  cart: { flag: 'ca', n: '00', at: [0, 1.25, -2.05] },
};
function plateTex(flag, n, alt) {
  const f = flagTex(flag).image;
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = alt ? '#17131f' : '#f6f1e6'; g.fillRect(0, 0, w, h);
    g.drawImage(f, 6, 8, 66, 44);
    g.strokeStyle = alt ? '#3ff0c8' : '#17131f'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
    g.fillStyle = alt ? '#3ff0c8' : '#17131f'; g.font = '900 34px "Bolster Display","Arial Black",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(n, 100, h / 2 + 2);
  });
}
function addPlate(K, kind, alt) {
  const P = PLATE[kind];
  if (!P) return;
  const w = P.w || 1.25;
  const pl = mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshStandardMaterial({ map: plateTex(P.flag, P.n, alt), roughness: 0.45 }), P.at[0], P.at[1], P.at[2], K.body);
  pl.rotation.y = Math.PI;
  K.detail.push(pl);
}

const BUILD = { zamboni, bus, roadster, lowrider, washtub, ballmachine, cart };
export function buildKart(kind, alt = false) {
  const K = BUILD[kind](alt);
  addPlate(K, kind, alt);
  // the body's fixed parts merge by material (the wheels, the seat, the
  // moving bits and the far-LOD details stay their own)
  const moving = new Set([K.seat, ...K.detail, ...Object.values(K.parts).filter((p) => p && p.isObject3D), ...(K.parts.paddles || []).map((p) => p.g)]);
  for (const o of moving) o.userData.keep = true;
  mergeStatic(K.body);
  K.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
  return K;
}
