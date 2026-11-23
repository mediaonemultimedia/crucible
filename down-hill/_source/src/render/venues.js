import * as THREE from 'three/webgpu';
import { World, keepCameraAboveRoad } from './world.js';
import { canvasTex, mesh, srand } from './geo.js';
import { buildReadable } from './readable.js';
import { lateral, rightX, rightZ, sceneryClearsRoad } from '../race/track.js';

const VENUES = {
  laundry: { sky: '#65aeed', ground: '#28774b', lane: '#c64d29', deck: '#8a2c1c', rail: '#164e3b', light: '#ffedbd', title: 'CENTRE COURT', sub: 'SUMAURA INVITATIONAL' },
  hockey: { sky: '#14285b', ground: '#152f69', lane: '#8ccbea', deck: '#254a87', rail: '#df233e', light: '#ddf2ff', title: 'RINK 88', sub: 'OVERTIME' },
  park: { sky: '#62cdef', ground: '#078d9d', lane: '#e5a434', deck: '#744557', rail: '#ff6830', light: '#fff3c1', title: 'RUBBERTA’S RAPIDS', sub: 'CIRCUITO DAS ÁGUAS' },
};
const standard = (color, roughness = 0.82) => new THREE.MeshStandardMaterial({ color, roughness });
const box = (root, material, x, y, z, w, h, d) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z, root);
const tagAt = (T, k) => T.def.points[T.sec[k]].tag;

function ribbon(T, root, material, section, profile) {
  const pos = [], uv = [], indices = [];
  for (let k = 0; k < T.N; k += 2) {
    const end = Math.min(k + 2, T.N);
    if (!section(k)) continue;
    const start = pos.length / 3;
    for (const sample of [k, end]) {
      const i = sample % T.N;
      for (const [u, [d, h]] of profile(T.w[i] + T.m[i]).entries()) {
        pos.push(T.x[i] + rightX(T, i) * d, T.y[i] + h, T.z[i] + rightZ(T, i) * d);
        uv.push(u, sample * T.step / 24);
      }
    }
    indices.push(start, start + 1, start + 2, start + 2, start + 1, start + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  const strip = mesh(g, material, 0, 0, 0, root);
  return strip;
}

function lanePaint(V, slick) {
  return canvasTex(256, 256, (g, w, h) => {
    const rnd = srand(58235);
    g.fillStyle = slick ? '#007fc9' : V.lane;
    g.fillRect(0, 0, w, h);
    g.fillStyle = slick ? '#46cde8' : '#fff3d0';
    g.fillRect(5, 0, 5, h);
    g.fillRect(w - 10, 0, 5, h);
    for (let i = 0; i < 410; i++) {
      g.fillStyle = i % 2 ? '#ffffff24' : '#001b5430';
      g.fillRect(rnd() * w, rnd() * h, slick ? 1 + rnd() * 3 : 2, slick ? 10 + rnd() * 65 : 2);
    }
    if (slick) {
      g.fillStyle = '#85eeff54';
      for (const x of [34, 89, 166, 223]) g.fillRect(x, 0, 4, h);
    }
  }, { repeat: [1, 1] });
}

function balconyArt(id, V) {
  // One strip of opaque painted scenery for the entire perimeter.
  return canvasTex(1024, 256, (g, w, h) => {
    const rnd = srand(2307);
    const sky = g.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, V.sky);
    sky.addColorStop(1, id === 'hockey' ? '#4865a2' : '#d3f5ff');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    if (id === 'park') {
      for (const [color, y, a] of [['#439c87', 132, 32], ['#14775a', 168, 42], ['#0c594c', 211, 22]]) {
        g.fillStyle = color;
        g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x * Math.PI / 128) * a + Math.sin(x * Math.PI / 64) * 15);
        g.lineTo(w, h); g.fill();
      }
    } else {
      g.strokeStyle = id === 'hockey' ? '#7798d1' : '#e6f4db';
      g.lineWidth = 2;
      for (let x = 0; x < w; x += 128) {
        g.beginPath(); g.moveTo(x, 65); g.lineTo(x + 64, 13); g.lineTo(x + 128, 65); g.stroke();
      }
      g.fillStyle = id === 'hockey' ? '#23397c' : '#32634b';
      for (let row = 0; row < 6; row++) {
        const y = 63 + row * 32;
        g.fillRect(0, y, w, 28);
        for (let x = 5; x < w; x += 12) {
          g.fillStyle = ['#ffe89c', '#fa4f60', '#f3fbff', '#44bacb', '#7d61c4'][Math.floor(rnd() * 5)];
          g.fillRect(x, y + 4 + rnd() * 8, 6, 9);
        }
        g.fillStyle = id === 'hockey' ? '#162651' : '#23452d';
      }
    }
  });
}

function sign(root, x, y, z, width, title, sub, accent, rotation = 0) {
  const map = canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = '#101932'; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, 0, w, 12); g.fillRect(0, h - 12, w, 12);
    g.textAlign = 'center'; g.fillStyle = '#fff9e4';
    g.font = 'bold 46px sans-serif'; g.fillText(title, w / 2, 77, 475);
    g.font = 'bold 23px sans-serif'; g.fillStyle = accent; g.fillText(sub, w / 2, 122, 470);
  });
  const panel = mesh(new THREE.PlaneGeometry(width, width * 160 / 512),
    new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide }), x, y, z, root);
  panel.rotation.y = rotation;
}

function groundPaint(id, V) {
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = V.ground; g.fillRect(0, 0, w, h);
    if (id === 'park') {
      const rnd = srand(4552);
      for (let i = 0; i < 550; i++) {
        g.strokeStyle = i % 2 ? '#6de1cc45' : '#03778365';
        const x = rnd() * w, y = rnd() * h;
        g.beginPath(); g.ellipse(x, y, 5 + rnd() * 32, 1 + rnd() * 3, 0, 0, Math.PI * 1.5); g.stroke();
      }
    } else {
      g.lineWidth = 4;
      g.strokeStyle = '#f9f5e8c0';
      if (id === 'laundry') {
        for (const x of [155, 570]) {
          g.fillStyle = '#668925';
          g.fillRect(x - 25, 260, 350, 470);
          g.strokeRect(x, 272, 300, 443);
          g.strokeRect(x + 27, 272, 246, 443);
          g.strokeRect(x + 27, 390, 246, 210);
          g.beginPath(); g.moveTo(x, 493); g.lineTo(x + 300, 493); g.moveTo(x + 150, 390); g.lineTo(x + 150, 600); g.stroke();
        }
      } else {
        g.fillStyle = '#acd8ee'; g.fillRect(92, 290, 840, 442);
        g.strokeStyle = '#d91f4e'; g.beginPath(); g.arc(512, 511, 92, 0, 2 * Math.PI); g.stroke();
        g.fillRect(510, 290, 4, 442);
        for (const x of [290, 730]) for (const y of [400, 625]) {
          g.beginPath(); g.arc(x, y, 44, 0, 2 * Math.PI); g.stroke();
        }
      }
    }
  });
}

export class VenueWorld extends World {
  constructor(scene, T) { super(scene, T, { roomProps: false }); }

  get info() {
    const start = this.T.def.start;
    return {
      podium: [[-12, 1, 205], [-22, 0, 202], [-2, 0, 202]],
      podLook: [-12, 3.5, 204], podCam: { c: [-12, 205], r: 19, y: 9 },
      turn: start, title: { c: [0, 0], r: 365, y: 410, look: [0, 15, 25] },
      bounds: [-310, 310, -230, 235],
    };
  }

  darkAt() { return 0; }

  camFix(want, pose, hint) {
    keepCameraAboveRoad(this.T, want, hint);
    const T = this.T;
    const samples = this.cameraDecks.get(`${Math.floor(want.x / 24)},${Math.floor(want.z / 24)}`) || [];
    for (const k of samples) {
      const deck = T.y[k];
      if (deck > pose.y + 8 && deck < want.y + 4 &&
          Math.hypot(T.x[k] - want.x, T.z[k] - want.z) < 15 &&
          Math.abs(lateral(T, k, want.x, want.z)) < 14) want.y = deck - 4;
    }
  }

  build() {
    const T = this.T, root = this.root, id = T.def.id, V = VENUES[id];
    this.cameraDecks = new Map();
    for (let k = 0; k < T.N; k += 4) {
      if (T.y[k] < 9) continue;
      for (let x = Math.floor((T.x[k] - 15) / 24); x <= Math.floor((T.x[k] + 15) / 24); x++) {
        for (let z = Math.floor((T.z[k] - 15) / 24); z <= Math.floor((T.z[k] + 15) / 24); z++) {
          const key = `${x},${z}`;
          if (!this.cameraDecks.has(key)) this.cameraDecks.set(key, []);
          this.cameraDecks.get(key).push(k);
        }
      }
    }
    this.scene.background = new THREE.Color(V.sky);
    this.lightsG = new THREE.Group();
    this.scene.add(this.lightsG);
    this.lightsG.add(new THREE.HemisphereLight('#eef8ff', '#a5adb2', 1.63));
    this.moon = new THREE.DirectionalLight(V.light, 2);
    this.moon.position.set(-130, 260, 100);
    this.lightsG.add(this.moon);

    const ground = mesh(new THREE.PlaneGeometry(640, 490),
      new THREE.MeshStandardMaterial({ map: groundPaint(id, V), roughness: 0.9 }), 0, id === 'park' ? -2.7 : -0.8, 10, root);
    ground.rotation.x = -Math.PI / 2;

    const dry = new THREE.MeshStandardMaterial({ map: lanePaint(V, false), roughness: 0.78, side: THREE.DoubleSide });
    const wet = new THREE.MeshStandardMaterial({ map: lanePaint(V, true), roughness: 0.28, side: THREE.DoubleSide });
    const edge = new THREE.MeshStandardMaterial({ color: V.deck, side: THREE.DoubleSide });
    const flume = (k) => tagAt(T, k) === 'flume';
    const all = () => true;
    ribbon(T, root, dry, (k) => !flume(k), (w) => [[-w, 0], [w, 0]]);
    if (id === 'park') ribbon(T, root, wet, flume, (w) => [[-w, 0], [w, 0]]);
    for (const s of [-1, 1]) {
      ribbon(T, root, edge, all, (w) => [[s * w, 0.02], [s * w, -2.5]]);
      if (id === 'park') ribbon(T, root, wet, flume, (w) => [[s * (w - 0.1), 0], [s * (w + 0.2), 2.5]]);
    }
    ribbon(T, root, edge, (k) => T.y[k] > 1.5, (w) => [[-w, -2.5], [w, -2.5]]);
    const pilaster = standard(id === 'park' ? '#ea6a25' : '#e7ebea');
    for (let k = 0; k < T.N; k += 18) {
      if (T.y[k] < 8) continue;
      for (const s of [-1, 1]) {
        const x = T.x[k] + rightX(T, k) * 10 * s, z = T.z[k] + rightZ(T, k) * 10 * s;
        if (sceneryClearsRoad(T, x, z, 1.5, 1.5, 0, 0, T.y[k] - 2)) box(root, pilaster, x, T.y[k] / 2 - 2, z, 2.8, T.y[k], 2.8);
      }
    }
    this.runnerTags.clear();
    this.dashLift = () => 0.22;
    this._guides();
    this.readable = buildReadable(this, { railCols: [V.rail, '#fff4dc'], arrowTags: new Set() });
    this._perimeter(id, V);
    this._landmarks(id);
  }

  _landmarks(id) {
    const root = this.root;
    const clear = (x, z, r) => sceneryClearsRoad(this.T, x, z, r, r);
    if (id === 'park') {
      const sand = standard('#ffbf46'), grass = standard('#28aa58'), palm = standard('#a8522c');
      const island = new THREE.CylinderGeometry(1, 1.22, 1, 10);
      for (const [x, z, r] of [[-105, -100, 39], [132, 108, 14], [248, 70, 33], [-150, 50, 34], [85, 9, 13]]) {
        if (!clear(x, z, r)) continue;
        mesh(island, sand, x, -0.35, z, root).scale.set(r, 4, r);
        mesh(island, grass, x, 1.85, z, root).scale.set(r * 0.87, 1, r * 0.87);
        box(root, palm, x, 10, z, 3.4, 18, 3.4);
        const leaf = new THREE.IcosahedronGeometry(1, 0);
        for (let i = 0; i < 6; i++) {
          const angle = i * Math.PI / 3;
          const o = mesh(leaf, grass, x + Math.cos(angle) * 8, 19, z + Math.sin(angle) * 8, root);
          o.rotation.y = -angle; o.scale.set(12, 2.2, 3.7);
        }
      }
      this._rapidsMascot();
      return;
    }
    if (id === 'laundry') {
      const felt = standard('#dbe82e'), cage = standard('#167044'), tape = standard('#f5f3e0');
      for (const [x, z] of [[-102, -133], [107, 75], [58, 113]]) {
        if (!clear(x, z, 15)) continue;
        mesh(new THREE.SphereGeometry(10, 12, 8), felt, x, 8, z, root);
        const seam = mesh(new THREE.TorusGeometry(9.8, 0.35, 5, 22), tape, x, 8, z, root);
        seam.rotation.set(0.55, 0.6, 0.2);
      }
      for (const [x, z] of [[-28, -60], [125, 66]]) {
        if (!clear(x, z, 23)) continue;
        for (const s of [-1, 1]) box(root, cage, x + s * 21, 4, z, 2.5, 9, 2.5);
        for (let j = -19; j < 20; j += 2) box(root, cage, x + j, 4.3, z, 0.24, 6.5, 0.24);
        for (let j = 1; j < 8; j++) box(root, cage, x, j, z, 42, 0.25, 0.25);
        box(root, tape, x, 8, z, 42, 0.75, 1.4);
      }
      this._concourse('#17685a', '#f8ecdb', '#ff6848');
      sign(root, -145, 25, -144, 67, 'SEB’S LUCHA CLUB', 'INVITATIONAL SPONSOR', '#fa6438');
      return;
    }
    this._concourse('#334b8a', '#eff8ff', '#ed305d');
    const red = standard('#e92646'), puck = standard('#151d32'), net = standard('#dcecff');
    for (const [x, z] of [[-34, 57], [116, -78], [9, -151]]) {
      if (!clear(x, z, 20)) continue;
      mesh(new THREE.CylinderGeometry(12, 12, 5, 18), puck, x, 1.9, z, root);
      for (const side of [-1, 1]) box(root, red, x + side * 18, 8, z - 9, 2, 17, 2);
      box(root, red, x, 16.5, z - 9, 38, 2, 2);
      for (let j = -16; j <= 16; j += 4) box(root, net, x + j, 8, z - 10, 0.3, 16, 0.4);
      for (let j = 2; j < 16; j += 3) box(root, net, x, j, z - 10, 36, 0.3, 0.4);
    }
  }

  _rapidsMascot() {
    const root = this.root, x = 248, z = 70;
    if (!sceneryClearsRoad(this.T, x, z, 27, 27)) return;
    const coral = standard('#f65f43'), apricot = standard('#ffc66d'), ink = standard('#241c43'), cream = standard('#fff7dc');
    const sphere = new THREE.SphereGeometry(1, 16, 12);
    mesh(sphere, coral, x, 27, z, root).scale.set(15, 15, 12);
    for (const side of [-1, 1]) {
      mesh(sphere, cream, x + side * 5, 28, z + 10, root).scale.set(3, 4, 2.2);
      mesh(sphere, ink, x + side * 5, 28, z + 11.8, root).scale.set(1.7, 2.4, 1.2);
      for (let i = 0; i < 3; i++) {
        const dx = (9 + i * 8) * side;
        const points = [[x + side * 7, 20, z], [x + dx, 9, z + 6 - i * 5], [x + dx, 11 + i * 5, z + 16 - i * 8]];
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))), 10, 2.8, 7);
        mesh(tube, coral, 0, 0, 0, root);
        mesh(sphere, apricot, ...points[2], root).scale.setScalar(2.75);
      }
    }
  }

  _concourse(base, canvas, accent) {
    const root = this.root;
    const body = standard(base), roof = standard(canvas), stripe = standard(accent);
    for (const x of [-239, -163, 76, 150, 224]) {
      if (!sceneryClearsRoad(this.T, x, 184, 19, 11)) continue;
      box(root, body, x, 5, 184, 37, 10, 19);
      box(root, roof, x, 11, 183, 40, 2.5, 22);
      for (let k = -1; k <= 1; k++) box(root, stripe, x + k * 12, 12, 183, 5, 1, 22);
      box(root, stripe, x, 6.8, 173.9, 27, 2.7, 0.8);
    }
  }

  _perimeter(id, V) {
    const root = this.root;
    const mural = new THREE.MeshBasicMaterial({ map: balconyArt(id, V), side: THREE.DoubleSide });
    for (const [x, z, w, angle] of [[0, -236, 640, 0], [-320, 8, 490, Math.PI / 2], [320, 8, 490, -Math.PI / 2]]) {
      const panel = mesh(new THREE.PlaneGeometry(w, 112), mural, x, 54, z, root);
      panel.rotation.y = angle;
      panel.userData.noShadow = true;
    }
    const vivid = [V.rail, '#ffc724', '#1faea2', '#6143b7', '#f9f5e3'].map((color) => standard(color));
    const dark = standard(V.deck);
    const rnd = srand(47322);
    if (id === 'park') {
      const trunk = standard('#825030'), leaves = ['#0c7652', '#12a461', '#55bc48'].map((color) => standard(color));
      const crown = new THREE.IcosahedronGeometry(1, 0);
      for (let i = 0; i < 43; i++) {
        const x = -300 + i * 14, z = -161 - rnd() * 54, tall = 11 + rnd() * 26;
        if (!sceneryClearsRoad(this.T, x, z, 14, 14)) continue;
        box(root, trunk, x, tall / 2, z, 3, tall, 3);
        for (let k = 0; k < 3; k++) {
          const o = mesh(crown, leaves[k], x + (k - 1) * 5, tall + k * 2, z, root);
          o.scale.set(14, 5.5, 8);
        }
      }
      sign(root, 0, 36, -186, 105, V.title, V.sub, '#ffdc42');
    } else {
      for (let i = 0; i < 27; i++) {
        const x = -296 + i * 23;
        const h = 14 + rnd() * 9;
        box(root, dark, x, h / 2, -171, 21, h, 38);
        box(root, vivid[i % vivid.length], x, h + 1, -155, 21, 2, 5);
        box(root, vivid[(i + 2) % vivid.length], x, h + 5, -176, 21, 8, 4);
      }
      sign(root, 0, 43, -163, 114, V.title, V.sub, id === 'hockey' ? '#4cd7ff' : '#fce373');
      sign(root, 132, 22, -148, 51, id === 'hockey' ? 'HOME 88' : 'LOVE ALL', id === 'hockey' ? 'VISITORS 08' : 'MATCH POINT', '#ffcf49');
    }
    for (let i = 0; i < 12; i++) {
      const x = i < 6 ? -287 : 278, z = -107 + (i % 6) * 59;
      const h = 19 + (i % 3) * 9;
      box(root, dark, x, h / 2, z, 2, h, 2);
      box(root, vivid[i % vivid.length], x, h - 3, z, 1.3, 9.5, 13);
    }
  }
}
