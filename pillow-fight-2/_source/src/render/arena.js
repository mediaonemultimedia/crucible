/* The arena: a giant square mattress ring in a cosy, oversized bedroom at
   night — quilted top, piped edges, pillows piled at the corners as soft
   posts, toys and a lamp on the carpet below, fairy lights and Pillow
   Fight's neon (pink on one wall, mint on the other, violet everywhere).

   Everything in the room lives in `world`, in arena space (the sim's x, z
   over 1000; y up from the mattress top). The camera's own azimuth is
   applied by turning `world` the other way, so the camera itself always
   looks down −z: the plush's hand lighting (a fixed key from the upper left,
   as in PF1) then stays camera-relative from every angle, and the backs
   and sides of the fighters are lit as well as their fronts.

   Also here: contact shadows on the quilt, hit sparks, stuffing, the
   projectiles in 3D, the moon behind a howl, and the camera (orbiting,
   auto-framing, the ring-out / K.O. / super-move shots, never inside the
   furniture). All of it reads the sim and the plush; none of it feeds back. */

import * as THREE from 'three/webgpu';
import { Fn, vec2, vec3, vec4, float, positionWorld, positionLocal, normalWorld, normalize, mix, smoothstep, length, mx_noise_float, abs, fract, sin, cos, step, min, max, texture, uniform, clamp, dot, pow, cameraPosition, atan, uv } from 'three/tsl';
import { makeTennisBall } from '../../shared/grommet/props.js';
import { TENNIS_R } from '../../shared/grommet/athletes/leopard.game.js';
import { shade } from '../../shared/grommet/props.js';
import { RING_COLORS } from '../../shared/grommet/giraffeprops.js';
import { KEY, FILL } from '../../shared/grommet/fur.js';
import { makeCap } from '../../shared/grommet/crowprops.js';
import { ITEMS } from '../../shared/grommet/athletes/crow.game.js';
import { RING, BED } from '../sim/sim.js';

export const U = 1000;
export const RING_W = RING / U;          // 7.6: the mattress top's half-width the sim plays on
export const BED_H = BED / U;            // the carpet is this far below the top
const MAT = RING_W + 0.45;               // the mattress itself, piping included
const ROOM = 36;                         // walls at ±ROOM
const lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export async function makeRenderer(canvas) {
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

/* the room's own light: PF1's hand lighting without the floor AO, plus the
   lamp's warm pool and the neon spill (by arena position, so it turns with
   the room) */
const K = () => vec3(KEY.x, KEY.y, KEY.z);
const FL = () => vec3(FILL.x, FILL.y, FILL.z);
function roomLight(base, N, { spec = 0, power = 30, wrap = 0.5, P = null } = {}) {
  const V = normalize(cameraPosition.sub(positionWorld));
  const ndl = clamp(dot(N, K()).mul(1 - wrap).add(wrap), 0, 1);
  const fill = clamp(dot(N, FL()).mul(0.5).add(0.35), 0, 1).mul(0.22);
  const sky = mix(vec3(0.34, 0.3, 0.5), vec3(0.62, 0.58, 0.8), N.y.mul(0.5).add(0.5)).mul(0.3);
  const H = normalize(K().add(V));
  const sp = pow(clamp(dot(N, H), 0, 1), float(power)).mul(spec);
  let c = base.mul(vec3(ndl).mul(vec3(0.95, 0.88, 0.95)).mul(0.78).add(vec3(fill).mul(vec3(0.8, 0.85, 1))).add(sky)).add(vec3(sp));
  if (P) {
    // the bedside lamp (a warm pool) and the neon walls' spill
    const lamp = smoothstep(16, 2, length(P.xz.sub(vec2(14, -13)))).mul(vec3(0.5, 0.3, 0.12));
    const pink = smoothstep(-8, -34, P.x).mul(vec3(0.32, 0.02, 0.12));
    const mint = smoothstep(8, 34, P.x).mul(vec3(0.02, 0.24, 0.17));
    c = c.add(base.mul(lamp.add(pink).add(mint)));
  }
  return c;
}

/* a pillow: a box whose thickness falls away to a seam at the edges */
function pillowGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d, 18, 6, 14);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const nx = x / (w / 2), nz = z / (d / 2);
    const puff = Math.max(0.1, (1 - nx ** 4) * (1 - nz ** 4)) ** 0.7;
    p.setXYZ(i, x * (1 - 0.06 * (1 - nz * nz)), y * puff, z * (1 - 0.06 * (1 - nx * nx)));
  }
  g.computeVertexNormals();
  return g;
}

function rrectShape(w, d, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -d / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const SX = 9.2;   // the shadow canvas covers the mattress top, x, z ∈ [−SX, SX]

export class Arena {
  constructor() {
    const scene = (this.scene = new THREE.Scene());
    this.bg = new THREE.Color('#0d0918');
    scene.background = this.bg;
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 300);
    this.world = new THREE.Group();
    scene.add(this.world);
    this.cam = { az: 0, d: 15, mx: 0, mz: 0, my: 1.6, shake: 0, t: 0, push: 0, pushT: 0, ready: false, h: 4.2 };

    // contact shadows, painted per frame onto the quilt
    const c = (this.shadowCanvas = document.createElement('canvas'));
    c.width = c.height = 512;
    this.sctx = c.getContext('2d');
    this.shadowTex = new THREE.CanvasTexture(c);
    this.shadowTex.colorSpace = THREE.NoColorSpace;
    this.shadowTex.generateMipmaps = false; this.shadowTex.minFilter = THREE.LinearFilter;

    this._room();
    this._bed();
    this._pillows();
    this._toys();
    this._initSparks();
    this._initFluff();
    this.balls = new Map(); this.rings = new Map(); this.ballPool = []; this.ringPool = [];
    this.ringGeo = new THREE.TorusGeometry(0.42, 0.12, 14, 32);
    this.extras = new Map();
    this.pools = { cap: [], howl: [], crow: [] };
    this._initMoon();
    this.base = new Set(this.world.children);
  }

  add(o) { this.world.add(o); }

  /* ── the room: carpet, walls, a window, neon, fairy lights ─────────────── */
  _room() {
    const W = this.world;
    const carpet = new THREE.MeshBasicNodeMaterial();
    carpet.colorNode = Fn(() => {
      const L = vec3(0, 0, 0).toVar();
      // (arena space: the room turns with the camera, so read it local)
      const p = positionLocal;
      const xz = vec2(p.x, p.z.negate());
      const r = length(xz);
      // a deep plum shag, a round rug under the bed in rings of pink and violet
      const shag = mx_noise_float(vec3(xz.mul(7), 0)).mul(0.5).add(mx_noise_float(vec3(xz.mul(31), 1)).mul(0.25));
      const base = mix(vec3(0.07, 0.03, 0.09), vec3(0.11, 0.05, 0.13), shag.add(0.5)).toVar();
      const rug = smoothstep(17.2, 17, r);
      const band = fract(r.div(1.6));
      const rugC = mix(vec3(0.28, 0.07, 0.2), vec3(0.17, 0.08, 0.32), step(0.5, band)).mul(float(0.85).add(shag.mul(0.3)));
      base.assign(mix(base, rugC, rug));
      base.assign(mix(base, vec3(0.55, 0.2, 0.42), smoothstep(0.06, 0, abs(r.sub(17.1))).mul(0.6)));
      // the shadow of the bed on it
      const bx = max(abs(xz.x), abs(xz.y));
      const bedShadow = smoothstep(MAT + 2.2, MAT - 0.2, bx).mul(0.75);
      L.assign(roomLight(base, vec3(0, 1, 0), { P: vec3(p.x, 0, p.z) }));
      return vec4(L.mul(float(1).sub(bedShadow)), 1);
    })();
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, ROOM * 2).rotateX(-Math.PI / 2), carpet);
    fl.position.y = -BED_H;
    W.add(fl);

    // the walls: dusky violet wallpaper with a thin stripe, a dado rail, and
    // a neon tube — pink on the west wall, mint on the east, violet behind
    const wallMat = (hue, k) => {
      const m = new THREE.MeshBasicNodeMaterial();
      m.colorNode = Fn(() => {
        const p = positionLocal;
        const u = p.x, y = p.y;
        const stripe = smoothstep(0.04, 0, abs(fract(u.div(1.4)).sub(0.5))).mul(0.5);
        const paper = mix(vec3(0.045, 0.03, 0.08), vec3(0.06, 0.04, 0.1), stripe).toVar();
        paper.assign(mix(paper, vec3(0.035, 0.022, 0.05), step(y, -BED_H + 7)));
        const rail = smoothstep(0.18, 0, abs(y.sub(-BED_H + 7)));
        paper.addAssign(vec3(0.08, 0.06, 0.09).mul(rail));
        const h = vec3(...hue);
        const tube = smoothstep(0.09, 0, abs(y.sub(11))).add(smoothstep(1.6, 0, abs(y.sub(11))).mul(0.18));
        paper.addAssign(h.mul(tube.mul(1.5)));
        paper.addAssign(h.mul(0.14).mul(smoothstep(22, 2, abs(y.sub(10)))));
        const grain = mx_noise_float(vec3(p.x.mul(2), p.y.mul(2), k)).mul(0.006);
        return vec4(paper.add(grain), 1);
      })();
      return m;
    };
    const H = 40;
    const walls = [
      [[0, 0, -ROOM], 0, [0.42, 0.18, 0.95]],
      [[0, 0, ROOM], Math.PI, [0.42, 0.18, 0.95]],
      [[-ROOM, 0, 0], Math.PI / 2, [1.0, 0.18, 0.5]],
      [[ROOM, 0, 0], -Math.PI / 2, [0.12, 0.95, 0.66]],
    ];
    walls.forEach(([p, ry, hue], k) => {
      // (the shader reads y in the plane's own frame: built at room height)
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, H).translate(0, H / 2 - BED_H, 0), wallMat(hue, k));
      m.position.set(p[0], 0, p[2]);
      m.rotation.y = ry;
      W.add(m);
    });

    // a tall window on the north wall: night sky, a big moon, the curtains
    const win = document.createElement('canvas'); win.width = 256; win.height = 384;
    const g = win.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 384);
    sky.addColorStop(0, '#0b0a2a'); sky.addColorStop(1, '#2a1650');
    g.fillStyle = sky; g.fillRect(0, 0, 256, 384);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + (i % 5) * 0.12})`; g.fillRect((i * 97) % 256, (i * 53) % 300, 2, 2); }
    const mg = g.createRadialGradient(170, 110, 10, 170, 110, 70);
    mg.addColorStop(0, '#fff8e0'); mg.addColorStop(0.55, '#f3e7c4'); mg.addColorStop(0.62, 'rgba(240,220,255,0.35)'); mg.addColorStop(1, 'rgba(200,180,255,0)');
    g.fillStyle = mg; g.beginPath(); g.arc(170, 110, 70, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a2a55'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 374);
    g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 384); g.moveTo(0, 192); g.lineTo(256, 192); g.lineWidth = 7; g.stroke();
    const wt = new THREE.CanvasTexture(win); wt.colorSpace = THREE.SRGBColorSpace;
    const wm = new THREE.MeshBasicNodeMaterial({ map: wt });
    const wmesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 15), wm);
    wmesh.position.set(-6, 9, -ROOM + 0.05);
    W.add(wmesh);
    const curtain = new THREE.MeshBasicNodeMaterial();
    curtain.colorNode = Fn(() => {
      const p = positionLocal;
      const fold = sin(p.x.mul(9)).mul(0.5).add(0.5);
      const N = normalize(normalWorld);
      return vec4(roomLight(mix(vec3(0.22, 0.05, 0.2), vec3(0.42, 0.1, 0.34), fold), N), 1);
    })();
    for (const s of [-1, 1]) {
      const cg = new THREE.PlaneGeometry(3.2, 19, 24, 1);
      const pp = cg.attributes.position;
      for (let i = 0; i < pp.count; i++) pp.setZ(i, Math.sin(pp.getX(i) * 6) * 0.18);
      cg.computeVertexNormals();
      const cm = new THREE.Mesh(cg, curtain);
      cm.position.set(-6 + s * 6.3, 8, -ROOM + 0.4);
      W.add(cm);
    }

    // fairy lights strung along the walls (instanced bulbs, warm and pink)
    const pts = [];
    for (const [ax, az, nx, nz] of [[-1, -1, 1, 0], [1, -1, 0, 1], [1, 1, -1, 0], [-1, 1, 0, -1]]) {
      for (let i = 0; i < 26; i++) {
        const t = i / 25;
        const x = ax * (ROOM - 0.6) + nx * t * (ROOM * 2 - 1.2), z = az * (ROOM - 0.6) + nz * t * (ROOM * 2 - 1.2);
        const sag = Math.sin((i % 13) / 12 * Math.PI) * 1.4;
        pts.push([x, 15.5 - sag, z, i % 3]);
      }
    }
    const bulbMat = new THREE.MeshBasicNodeMaterial();
    bulbMat.colorNode = Fn(() => vec4(vec3(1.0, 0.78, 0.5), 1))();
    const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), bulbMat, pts.length);
    const m4 = new THREE.Matrix4(), col = [new THREE.Color('#ffd08a'), new THREE.Color('#ff7ab8'), new THREE.Color('#9ff5d8')];
    pts.forEach(([x, y, z, c], i) => { bulbs.setMatrixAt(i, m4.makeTranslation(x, y, z)); bulbs.setColorAt(i, col[c]); });
    bulbMat.colorNode = Fn(() => vec4(vec3(1, 1, 1), 1))();
    bulbMat.vertexColors = true;
    W.add(bulbs);
    // a big neon "Z" (sleep) sign on the south wall: three pink tubes
    const neon = new THREE.MeshBasicNodeMaterial();
    neon.colorNode = Fn(() => vec4(vec3(1.0, 0.42, 0.78), 1))();
    const zp = new THREE.CurvePath();
    zp.add(new THREE.LineCurve3(new THREE.Vector3(-1.5, 1.5, 0), new THREE.Vector3(1.5, 1.5, 0)));
    zp.add(new THREE.LineCurve3(new THREE.Vector3(1.5, 1.5, 0), new THREE.Vector3(-1.5, -1.5, 0)));
    zp.add(new THREE.LineCurve3(new THREE.Vector3(-1.5, -1.5, 0), new THREE.Vector3(1.5, -1.5, 0)));
    for (const [x, y, s] of [[-4, 10, 1], [-0.6, 12.2, 0.7], [1.9, 13.6, 0.45]]) {
      const z = new THREE.Mesh(new THREE.TubeGeometry(zp, 60, 0.12 / s, 6, false), neon);
      z.scale.setScalar(s); z.position.set(x, y, ROOM - 0.3); z.rotation.y = Math.PI;
      W.add(z);
    }
  }

  /* ── the bed: the mattress (the ring), piping, the base and legs ──────── */
  _bed() {
    const W = this.world;
    const top = new THREE.MeshBasicNodeMaterial();
    const stex = this.shadowTex;
    top.colorNode = Fn(() => {
      const p = positionLocal;
      const xz = vec2(p.x, p.z);
      // quilting: a diamond grid of seams with a button at each crossing,
      // the cells puffed up between them
      const q = 1.9;
      const u = xz.x.add(xz.y).div(q), v = xz.x.sub(xz.y).div(q);
      const du = abs(fract(u).sub(0.5)), dv = abs(fract(v).sub(0.5));
      const seam = smoothstep(0.43, 0.5, max(du, dv));
      const puff = float(1).sub(du.mul(du).add(dv.mul(dv)).mul(1.6));
      const btn = smoothstep(0.1, 0.05, length(vec2(float(0.5).sub(du), float(0.5).sub(dv))));
      // a fake normal off the puffs, for the light
      const N = normalize(vec3(fract(u).sub(0.5).add(fract(v).sub(0.5)).mul(-0.35), 1, fract(u).sub(0.5).sub(fract(v).sub(0.5)).mul(-0.35)));
      // the puffs: bright in the middle of each cell, sinking into the seams
      const fabric = mix(vec3(0.36, 0.27, 0.6), vec3(0.66, 0.56, 0.9), puff.clamp(0, 1).pow(0.8)).toVar();
      fabric.assign(mix(fabric, vec3(0.2, 0.1, 0.38), seam.mul(0.9)));
      fabric.assign(mix(fabric, vec3(0.95, 0.42, 0.7), btn));
      // the ring's edge: a stitched band just inside the piping
      const e = max(abs(xz.x), abs(xz.y));
      const band = smoothstep(RING_W - 0.55, RING_W - 0.5, e).mul(smoothstep(RING_W + 0.05, RING_W, e));
      fabric.assign(mix(fabric, vec3(0.98, 0.5, 0.74), band.mul(0.85)));
      const dash = step(0.5, fract(xz.x.add(xz.y).mul(1.6)));
      const stitch = smoothstep(0.04, 0, abs(e.sub(RING_W - 0.7))).mul(dash);
      fabric.assign(mix(fabric, vec3(1, 0.92, 0.98), stitch.mul(0.8)));
      // a centre medallion: the Pillow Fight star
      const r = length(xz);
      fabric.assign(mix(fabric, vec3(0.42, 0.24, 0.72), smoothstep(1.75, 1.7, r).mul(smoothstep(1.35, 1.4, r)).mul(0.7)));
      const lit = roomLight(fabric, N, { wrap: 0.6 }).toVar();
      const grain = mx_noise_float(vec3(xz.mul(14), 0)).mul(0.02);
      return vec4(lit.add(grain), 1);
    })();
    const T = MAT * 2;
    const topMesh = new THREE.Mesh(new THREE.PlaneGeometry(T, T, 1, 1).rotateX(-Math.PI / 2), top);
    W.add(topMesh);
    // the mattress's sides: a rounded slab, ticking stripes
    const side = new THREE.MeshBasicNodeMaterial();
    side.colorNode = Fn(() => {
      const p = positionLocal, N = normalize(normalWorld);
      const s = step(0.5, fract(p.x.add(p.z).mul(0.9)));
      const base = mix(vec3(0.55, 0.44, 0.8), vec3(0.66, 0.56, 0.9), s.mul(0.4));
      return vec4(roomLight(base, N, { wrap: 0.55 }), 1);
    })();
    const slab = new THREE.ExtrudeGeometry(rrectShape(T, T, 0.7), { depth: 1.45, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.18, bevelSegments: 4, curveSegments: 10 });
    slab.rotateX(Math.PI / 2);
    const sm = new THREE.Mesh(slab, side);
    sm.position.y = -0.22;
    W.add(sm);
    // the piping: a fat pink cord round the top edge — the ring's rope
    const pipe = new THREE.MeshBasicNodeMaterial();
    pipe.colorNode = Fn(() => {
      const N = normalize(normalWorld), p = positionLocal;
      const twist = smoothstep(0.3, 0.7, fract(p.x.add(p.z).add(p.y.mul(3)).mul(2.2))).mul(0.15);
      return vec4(roomLight(vec3(1.0, 0.36, 0.62).mul(float(0.92).add(twist)), N, { spec: 0.25, power: 24, wrap: 0.5 }), 1);
    })();
    const path = new THREE.CurvePath();
    const sp = rrectShape(T - 0.1, T - 0.1, 0.7).getPoints(64).map((v) => new THREE.Vector3(v.x, 0, -v.y));
    const curve = new THREE.CatmullRomCurve3(sp, true);
    const pg = new THREE.TubeGeometry(curve, 260, 0.2, 10, true);
    const pm = new THREE.Mesh(pg, pipe);
    pm.position.y = 0.02;
    W.add(pm);
    const pm2 = new THREE.Mesh(pg, pipe);
    pm2.position.y = -1.48;
    W.add(pm2);
    // the base: dark wood, a little wider, on four stubby legs
    const wood = new THREE.MeshBasicNodeMaterial();
    wood.colorNode = Fn(() => {
      const p = positionLocal, N = normalize(normalWorld);
      const gr = sin(p.x.add(p.z).mul(5).add(mx_noise_float(vec3(p.mul(1.5))).mul(3))).mul(0.5).add(0.5);
      return vec4(roomLight(mix(vec3(0.16, 0.08, 0.06), vec3(0.24, 0.13, 0.09), gr), N, { spec: 0.15, power: 40 }), 1);
    })();
    const base = new THREE.Mesh(new THREE.BoxGeometry(T + 0.6, 0.75, T + 0.6), wood);
    base.position.y = -1.85;
    W.add(base);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.5, 12), wood);
      leg.position.set(sx * (MAT - 0.3), -BED_H + 0.25, sz * (MAT - 0.3));
      W.add(leg);
    }
  }

  /* ── the corner posts: pillows piled at each corner ─────────────────────── */
  _pillows() {
    const W = this.world;
    const cols = [['#ff5c9a', '#ffd6e8'], ['#3ff0c8', '#d8fff3'], ['#8a5cff', '#e5dcff'], ['#ffb84d', '#fff0d6']];
    this.posts = [];
    let k = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const [a, b] = cols[k++];
      const ca = new THREE.Color(a), cb = new THREE.Color(b);
      const mat = new THREE.MeshBasicNodeMaterial();
      mat.colorNode = Fn(() => {
        const p = positionLocal, N = normalize(normalWorld);
        // a pillowcase: two colours in broad stripes, a piped seam
        const s = smoothstep(0.45, 0.55, fract(p.x.mul(0.9).add(0.25)));
        const base = mix(vec3(ca.r, ca.g, ca.b), vec3(cb.r, cb.g, cb.b), s.mul(0.55));
        const fuzz = mx_noise_float(p.mul(9)).mul(0.04);
        return vec4(roomLight(base.add(fuzz), N, { spec: 0.08, power: 16, wrap: 0.6 }), 1);
      })();
      const g = new THREE.Group();
      const stack = [[2.6, 1.0, 1.8, 0.5, 0.2], [2.4, 0.95, 1.7, 1.25, -0.5], [2.1, 0.9, 1.5, 1.95, 0.35]];
      for (const [w, h, d, y, ry] of stack) {
        const m = new THREE.Mesh(pillowGeo(w, h, d), mat);
        m.position.y = y; m.rotation.y = ry + Math.PI / 4;
        m.rotation.z = (y * 0.07) * sx;
        g.add(m);
      }
      g.position.set(sx * (RING_W + 0.25), 0, sz * (RING_W + 0.25));
      W.add(g);
      this.posts.push([sx * (RING_W + 0.25), 1.2, sz * (RING_W + 0.25), 2.1]);
    }
  }

  /* ── toys on the carpet, the nightstand and its lamp ───────────────────── */
  _toys() {
    const W = this.world, y0 = -BED_H;
    const block = (col, letter) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = col; g.fillRect(0, 0, 128, 128);
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 10; g.strokeRect(10, 10, 108, 108);
      g.fillStyle = '#fff'; g.font = 'bold 84px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(letter, 64, 70);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.MeshBasicNodeMaterial();
      m.colorNode = Fn(() => vec4(roomLight(texture(t).rgb, normalize(normalWorld), { spec: 0.2 }), 1))();
      return m;
    };
    const blocks = [['#ff5c9a', 'P', 11.5, 4, 0.3], ['#3ff0c8', 'F', 12.6, 5.6, -0.4], ['#8a5cff', '2', 11.9, 4.9, 0.9, 1], ['#ffb84d', 'Z', -12, 9, 0.2], ['#ff5c9a', 'K', -13.2, 8.2, 0.6], ['#3ff0c8', 'O', -11.4, -11, 0.4]];
    for (const [col, l, x, z, ry, up] of blocks) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), block(col, l));
      m.position.set(x, y0 + 0.65 + (up ? 1.3 : 0), z); m.rotation.y = ry;
      if (up) m.position.x -= 0.4;
      W.add(m);
    }
    // a striped toy ball
    const ballMat = new THREE.MeshBasicNodeMaterial();
    ballMat.colorNode = Fn(() => {
      const p = normalize(positionLocal);
      const seg = fract(atan(p.x, p.z).div(Math.PI * 2).mul(6));
      const c = mix(vec3(1, 0.35, 0.55), vec3(1, 0.85, 0.3), step(0.5, seg));
      const c2 = mix(c, vec3(0.3, 0.9, 0.8), step(0.75, seg));
      return vec4(roomLight(c2, normalize(normalWorld), { spec: 0.5, power: 50 }), 1);
    })();
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1.2, 24, 16), ballMat);
    ball.position.set(-11.5, y0 + 1.2, -6); W.add(ball);
    // a stack of picture books
    const bcols = ['#3a6ff0', '#ff8a3d', '#2fbf8f', '#c04bd8'];
    bcols.forEach((c, i) => {
      const cc = new THREE.Color(c);
      const m = new THREE.MeshBasicNodeMaterial();
      m.colorNode = Fn(() => vec4(roomLight(vec3(cc.r, cc.g, cc.b), normalize(normalWorld)), 1))();
      const b = new THREE.Mesh(new THREE.BoxGeometry(2.4 - i * 0.15, 0.4, 3.2 - i * 0.2), m);
      b.position.set(10.5, y0 + 0.2 + i * 0.4, -5); b.rotation.y = i * 0.25 - 0.3;
      W.add(b);
    });
    // the nightstand and the lamp (the room's warm light)
    const woodM = new THREE.MeshBasicNodeMaterial();
    woodM.colorNode = Fn(() => vec4(roomLight(vec3(0.28, 0.16, 0.11), normalize(normalWorld), { spec: 0.15 }), 1))();
    const stand = new THREE.Mesh(new THREE.BoxGeometry(4, 4.6, 4), woodM);
    stand.position.set(14, y0 + 2.3, -13); W.add(stand);
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2.2, 16), woodM);
    lampBase.position.set(14, y0 + 5.7, -13); W.add(lampBase);
    const shadeM = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    shadeM.colorNode = Fn(() => {
      const y = positionLocal.y;
      return vec4(mix(vec3(1.0, 0.62, 0.32), vec3(1.0, 0.88, 0.62), smoothstep(0.9, -0.9, y)), 1);
    })();
    const lshade = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.7, 1.9, 24, 1, true), shadeM);
    lshade.position.set(14, y0 + 7.5, -13); W.add(lshade);
    const glowC = document.createElement('canvas'); glowC.width = glowC.height = 128;
    const gg = glowC.getContext('2d'); const gr = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,200,120,0.55)'); gr.addColorStop(1, 'rgba(255,160,90,0)');
    gg.fillStyle = gr; gg.fillRect(0, 0, 128, 128);
    const gt = new THREE.CanvasTexture(glowC); gt.colorSpace = THREE.SRGBColorSpace;
    this.lampGlow = new THREE.Sprite(new THREE.SpriteNodeMaterial({ map: gt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lampGlow.scale.setScalar(9); this.lampGlow.position.set(14, y0 + 7.4, -13);
    W.add(this.lampGlow);
    // obstacles the camera stays out of: [x, y, z, r]
    this.obstacles = [[14, y0 + 4, -13, 4.2], [12, y0 + 1, 4.8, 2.4], [-12.5, y0 + 1, 8.6, 2], [-11.5, y0 + 1.2, -6, 2], [10.5, y0 + 1, -5, 2.4]];
  }

  /* ── projectiles (3D: along their own line) ─────────────────────────────── */
  _makeShot(kind) {
    if (kind === 'cap') { const g = new THREE.Group(); g.add(makeCap(ITEMS.cap.r * 2.4)); return g; }
    if (kind === 'howl') {
      const g = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        const a = 0.75 - k * 0.22;
        mat.colorNode = Fn(() => vec4(vec3(0.62, 0.78, 1.0).mul(a), 1))();
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.9 + k * 0.28, 0.07 - k * 0.012, 8, 40, Math.PI), mat);
        arc.rotation.z = -Math.PI / 2; arc.position.x = -k * 0.32; arc.renderOrder = 15;
        g.add(arc);
      }
      return g;
    }
    const g = new THREE.Group();
    const black = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    black.colorNode = Fn(() => vec4(shade(vec3(0.035, 0.032, 0.045), normalize(normalWorld), { spec: 0.35, power: 30, wrap: 0.3 }).mul(0.55).add(vec3(0.012, 0.01, 0.03)), 1))();
    const beak = new THREE.MeshBasicNodeMaterial();
    beak.colorNode = Fn(() => vec4(shade(vec3(0.24, 0.24, 0.27), normalize(normalWorld), { spec: 0.3 }), 1))();
    const bird = () => {
      const b = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), black); body.scale.set(1.5, 0.9, 0.9);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 9), black); head.position.set(0.3, 0.08, 0);
      const bk = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 10), beak); bk.rotation.z = -Math.PI / 2; bk.position.set(0.48, 0.06, 0);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.32, 3), black); tail.rotation.z = Math.PI / 2; tail.position.set(-0.4, 0.02, 0); tail.scale.z = 0.3;
      const wings = [1, -1].map((s) => {
        const w = new THREE.Group();
        const m = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.5), black);
        m.position.z = s * 0.25; m.rotation.x = Math.PI / 2; w.add(m); w.userData.s = s;
        return w;
      });
      b.add(body, head, bk, tail, ...wings); b.userData.wings = wings;
      return b;
    };
    const birds = [bird(), bird(), bird()];
    birds[1].position.set(-0.6, 0.45, -0.5); birds[1].scale.setScalar(0.8);
    birds[2].position.set(-0.9, -0.35, 0.4); birds[2].scale.setScalar(0.7);
    g.add(...birds); g.userData.birds = birds;
    return g;
  }

  projectiles(list, alpha, prev) {
    const seen = new Set();
    for (const p of list) {
      seen.add(p.id);
      const q = prev?.get(p.id);
      const x = (q ? q.x + (p.x - q.x) * alpha : p.x) / U, y = (q ? q.y + (p.y - q.y) * alpha : p.y) / U, z = (q ? q.z + (p.z - q.z) * alpha : p.z) / U;
      const yaw = Math.atan2(-p.fz, p.fx);   // a +x-built model turned to fly along (fx, fz)
      if (p.kind === 'ball') {
        let m = this.balls.get(p.id);
        if (!m) { m = this.ballPool.pop() || makeTennisBall(TENNIS_R * 2.2); this.world.add(m); this.balls.set(p.id, m); }
        m.visible = true; m.position.set(x, y, z);
        m.rotation.z -= 0.35; m.rotation.x += 0.2;
      } else if (this.pools[p.kind]) {
        let m = this.extras.get(p.id);
        if (!m) { m = this.pools[p.kind].pop() || this._makeShot(p.kind); m.userData.kind = p.kind; this.world.add(m); this.extras.set(p.id, m); }
        m.visible = true;
        m.position.set(x, y, z); m.rotation.set(0, yaw, 0);
        if (p.kind === 'cap') m.children[0].rotation.set(Math.PI / 2 - 0.35, 0, -p.t * 0.55);
        else if (p.kind === 'howl') {
          m.position.y = y + 0.15;
          m.scale.set(1 + 0.08 * Math.sin(p.t * 0.6), 0.85 + 0.25 * Math.min(1, p.t / 10), 1.6);
          if (p.t % 4 === 0 && m.userData.last !== p.t) { m.userData.last = p.t; this.tufts(x, 0.1, z, 1, 0.5, [p.fx / 1024, p.fz / 1024]); }
        } else m.userData.birds.forEach((b, j) => {
          b.position.y += Math.sin((p.t + j * 7) * 0.4) * 0.01;
          for (const w of b.userData.wings) w.rotation.x = w.userData.s * Math.sin((p.t + j * 5) * 0.9) * 0.9;
        });
      } else {
        let m = this.rings.get(p.id);
        if (!m) {
          const mat = new THREE.MeshBasicNodeMaterial();
          const col = new THREE.Color(RING_COLORS[p.id % RING_COLORS.length]);
          mat.colorNode = Fn(() => vec4(shade(vec3(col.r, col.g, col.b), normalize(normalWorld), { spec: 0.06, wrap: 0.6 }), 1))();
          m = this.ringPool.pop() || new THREE.Mesh(this.ringGeo, mat);
          this.world.add(m); this.rings.set(p.id, m);
        }
        m.visible = true; m.position.set(x, y, z);
        m.rotation.set(Math.PI / 2 - 0.5, p.t * 0.25, 0);
      }
    }
    for (const [id, m] of this.balls) if (!seen.has(id)) { m.visible = false; this.balls.delete(id); this.ballPool.push(m); }
    for (const [id, m] of this.rings) if (!seen.has(id)) { m.visible = false; this.rings.delete(id); this.ringPool.push(m); }
    for (const [id, m] of this.extras) if (!seen.has(id)) { m.visible = false; this.extras.delete(id); this.pools[m.userData.kind].push(m); }
    return [...this.balls.values(), ...this.rings.values(), ...[...this.extras.values()].filter((m) => m.userData.kind !== 'howl')].map((m) => [m.position.x, m.position.y, m.position.z, 0.3]);
  }

  /* ── the moon behind a howl ─────────────────────────────────────────────── */
  _initMoon() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    const halo = g.createRadialGradient(256, 256, 120, 256, 256, 256);
    halo.addColorStop(0, 'rgba(210,225,255,0.55)'); halo.addColorStop(1, 'rgba(160,140,255,0)');
    g.fillStyle = halo; g.fillRect(0, 0, 512, 512);
    const disc = g.createRadialGradient(220, 210, 20, 256, 256, 150);
    disc.addColorStop(0, '#fffbea'); disc.addColorStop(1, '#e6dcc2');
    g.fillStyle = disc; g.beginPath(); g.arc(256, 256, 150, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(160,150,130,0.35)';
    for (const [x, y, r] of [[200, 220, 26], [300, 300, 34], [250, 330, 16], [310, 200, 14], [190, 300, 12]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.moon = new THREE.Sprite(new THREE.SpriteNodeMaterial({ map: tex, transparent: true, depthWrite: false }));
    this.moon.visible = false;
    this.scene.add(this.moon);
    this.moonT = 9;
  }

  moonAt(x, z) { this.moonT = 0; this.moonP = [x, z]; }

  _moonStep(dt) {
    const m = this.moon;
    this.moonT += dt;
    const t = this.moonT, life = 1.5;
    if (t >= life) { m.visible = false; return; }
    m.visible = true;
    m.material.opacity = Math.min(1, t / 0.12) * (1 - Math.max(0, (t - 1.05) / (life - 1.05)));
    const s = 7.5 * (0.85 + 0.15 * Math.min(1, t / 0.25));
    m.scale.set(s, s, 1);
    // behind him, as the camera sees it (the camera looks down −z in the scene)
    const v = new THREE.Vector3(this.moonP[0], 5.2 + t * 0.25, this.moonP[1]);
    this.world.localToWorld(v);
    m.position.set(v.x + 0.6, v.y, v.z - 6);
  }

  /* ── the camera ─────────────────────────────────────────────────────────
     Side-on to the fighters' line, player 1 on the left; it orbits as they
     circle (eased, never snapping), pulls back as they part, rises for a
     hop. `focus`: { x, y, z, d, low, az? } — the K.O. and ring-out shots
     (lower, closer, slower); `push` (0…1): a super move's push-in.       */
  frame(A, B, dt, aspect, focus = null, tall = 3) {
    const C = this.cam;
    const mx = (A[0] + B[0]) / 2, mz = (A[2] + B[2]) / 2;
    const lx = B[0] - A[0], lz = B[2] - A[2];
    const sep = Math.hypot(lx, lz);
    let az = sep > 0.05 ? Math.atan2(-lz, lx) : C.az;
    const narrow = aspect < 1.2;
    // (tall: the taller fighter's height — K8-E's neck needs the room)
    const ex = Math.max(0, tall - 3.2);
    let want = Math.max(narrow ? 17 : 12.5, Math.min(narrow ? 30 : 22, 9.4 + sep * (narrow ? 1.6 : 1.12))) + ex * 2.2;
    let tx = mx, tz = mz, ty = 1.8 + ex * 0.45 + Math.max(0, Math.max(A[1], B[1]) - 0.8) * 0.5, h = 3.2;
    let k = Math.min(1, dt * 4), ka = Math.min(1, dt * 2.6);
    if (focus) {
      tx = focus.x; tz = focus.z; ty = focus.y; want = focus.d; h = focus.h ?? 1.6;
      if (focus.az !== undefined) az = focus.az;
      k = Math.min(1, dt * 2.4); ka = Math.min(1, dt * 1.6);
    }
    // a super's push-in: closer, a little lower, quickly in and eased out
    C.push += ((C.pushT > 0 ? 1 : 0) - C.push) * Math.min(1, dt * (C.pushT > 0 ? 9 : 3));
    C.pushT = Math.max(0, C.pushT - dt);
    if (C.push > 0.01 && C.pushAt && !focus) {
      want *= 1 - 0.38 * C.push; h -= 0.9 * C.push;
      tx = lerp(tx, C.pushAt[0], 0.45 * C.push); tz = lerp(tz, C.pushAt[2], 0.45 * C.push);
    }
    if (!C.ready) { C.az = az; C.d = want; C.mx = tx; C.mz = tz; C.my = ty; C.h = h; C.ready = true; }
    // the azimuth: the short way round, eased; as fast as needed when they cross over
    C.az += angDiff(C.az, az) * ka;
    if (want > C.d + 0.8 && !focus) C.d += (want - C.d) * Math.min(1, dt * 10);
    C.d += (want - C.d) * k;
    C.mx += (tx - C.mx) * k; C.mz += (tz - C.mz) * k; C.my += (ty - C.my) * k;
    C.h += (h - C.h) * k;
    C.t += dt;
    C.shake = Math.max(0, C.shake - dt * 2.4);
    const sh = C.shake * C.shake;
    let jx = Math.sin(C.t * 71) * 0.18 * sh, jy = Math.cos(C.t * 59) * 0.14 * sh;
    const N = C.nudge;
    if (N && (N.x || N.v)) {
      const kn = 600;
      N.v += (kn * (0 - N.x) - 2 * 0.35 * Math.sqrt(kn) * N.v) * dt; N.x += N.v * dt;
      if (Math.abs(N.x) < 1e-4 && Math.abs(N.v) < 1e-3) N.x = N.v = 0;
      jx += N.x; jy -= Math.abs(N.x) * 0.25;
    }
    // the camera in arena space
    const sa = Math.sin(C.az), ca = Math.cos(C.az);
    let px = C.mx + sa * C.d, pz = C.mz + ca * C.d, py = C.my + C.h + C.d * 0.06;
    [px, py, pz] = this._clear(px, py, pz, C.mx, C.my, C.mz);
    // turn the room so the camera looks down −z (the hand lighting stays camera-relative)
    const W = this.world;
    W.rotation.y = -C.az;
    W.updateMatrixWorld(true);
    const P = new THREE.Vector3(px, py, pz), T = new THREE.Vector3(C.mx, C.my, C.mz);
    W.localToWorld(P); W.localToWorld(T);
    const cam = this.camera;
    cam.aspect = aspect;
    cam.fov = narrow ? 38 : 30;
    cam.position.set(P.x + jx, P.y + jy, P.z);
    cam.lookAt(T.x + jx * 0.5, T.y + jy * 0.5, T.z);
    cam.updateProjectionMatrix();
    this.camArena = [px, py, pz];
  }

  /* keep the camera out of the furniture: above the quilt, off the posts,
     the lamp and the toys, inside the walls */
  _clear(x, y, z, tx, ty, tz) {
    const lim = ROOM - 2;
    x = Math.max(-lim, Math.min(lim, x)); z = Math.max(-lim, Math.min(lim, z));
    const overBed = Math.abs(x) < MAT + 0.8 && Math.abs(z) < MAT + 0.8;
    y = Math.max(y, overBed ? 1.3 : -BED_H + 1.2);
    for (const [ox, oy, oz, r] of [...this.posts, ...this.obstacles]) {
      const dx = x - ox, dy = y - oy, dz = z - oz, d = Math.hypot(dx, dy, dz), R = r + 0.9;
      if (d < R) {
        // out of it, upward first (a crane over the pillows)
        const lift = Math.sqrt(Math.max(0, R * R - dx * dx - dz * dz));
        y = Math.max(y, oy + lift);
      }
    }
    return [x, y, z];
  }

  shake(a) { this.cam.shake = Math.min(1.2, this.cam.shake + a); }
  nudge(v) { this.cam.nudge = this.cam.nudge || { x: 0, v: 0 }; this.cam.nudge.v += v; }
  pushIn(at, secs = 0.9) { this.cam.pushT = secs; this.cam.pushAt = at; }

  /* ── contact shadows: soft dark discs on the quilt under each plush's
     points (instanced decals; a canvas texture re-uploaded every frame
     never updated under the WebGL 2 backend — PF1's floor had the same) ── */
  _initShadows() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(14,4,30,1)'); gr.addColorStop(0.45, 'rgba(14,4,30,0.55)'); gr.addColorStop(1, 'rgba(14,4,30,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicNodeMaterial({ map: t, transparent: true, depthWrite: false, opacity: 0.55 });
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, 120);
    this.blobs.frustumCulled = false; this.blobs.count = 0; this.blobs.renderOrder = 2;
    this.world.add(this.blobs);
  }

  paintShadows(plushes, extra = []) {
    if (!this.blobs) this._initShadows();
    const kx = KEY.x * Math.cos(this.cam.az) + KEY.z * Math.sin(this.cam.az), kz = -KEY.x * Math.sin(this.cam.az) + KEY.z * Math.cos(this.cam.az);
    const v = this._v, inv = this._inv || (this._inv = new THREE.Matrix4());
    inv.copy(this.world.matrixWorld).invert();
    let n = 0;
    const blob = (x, y, z, r) => {
      if (y < -0.4 || n >= 120 || Math.abs(x) > MAT || Math.abs(z) > MAT) return;
      const h = Math.max(0, y);
      const sx = x - (kx / KEY.y) * h * 0.35, sz = z - (kz / KEY.y) * h * 0.35, R = (r * 3.4 + h * 0.7) * Math.exp(-h * 0.2);
      this._m4.compose(this._s.set(sx, 0.015 + n * 0.0004, sz), this._q.identity(), new THREE.Vector3(R, 1, R));
      this.blobs.setMatrixAt(n++, this._m4);
    };
    for (const p of plushes) {
      if (!p.group.visible) continue;
      const s = p.soft, M = p.group.matrixWorld;
      v.set(...s.headC).applyMatrix4(M).applyMatrix4(inv);
      blob(v.x, 0, v.z, 0.9);
      const step = Math.max(1, Math.floor(s.n / 34));
      for (let i = 0; i < s.n; i += step) {
        v.set(s.x[i * 3], s.x[i * 3 + 1], s.x[i * 3 + 2]).applyMatrix4(M).applyMatrix4(inv);
        blob(v.x, v.y, v.z, Math.max(0.12, s.r[i]));
      }
    }
    for (const [x, y, z, r] of extra) blob(x, y, z, r);
    this.blobs.count = n;
    this.blobs.instanceMatrix.needsUpdate = true;
  }

  /* ── hit sparks (camera-facing) ─────────────────────────────────────────── */
  _initSparks() {
    const mk = (draw) => {
      const c = document.createElement('canvas'); c.width = c.height = 256;
      draw(c.getContext('2d'));
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const burst = (g, fill, edge, spikes) => {
      g.translate(128, 128);
      g.beginPath();
      for (let k = 0; k < spikes * 2; k++) {
        const a = (k / (spikes * 2)) * Math.PI * 2, r = k % 2 ? 46 + (k % 4) * 6 : 118 - (k % 3) * 14;
        k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fillStyle = fill; g.fill();
      g.lineWidth = 9; g.strokeStyle = edge; g.stroke();
      g.beginPath(); g.arc(0, 0, 34, 0, Math.PI * 2); g.fillStyle = '#fffdf3'; g.fill();
    };
    this.texHit = mk((g) => burst(g, '#ffd23f', '#2b1d14', 9));
    this.texBig = mk((g) => burst(g, '#ff7b3a', '#2b1d14', 12));
    this.texBlock = mk((g) => {
      g.translate(128, 128);
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, 0, 50 + k * 26, -1.1, 1.1); g.lineWidth = 14 - k * 3; g.strokeStyle = '#bfe3ff'; g.stroke(); g.lineWidth = 4; g.strokeStyle = '#1e3346'; g.stroke(); }
    });
    this.sparks = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthTest: false, depthWrite: false });
      m.map = this.texHit;
      const mesh = new THREE.Mesh(geo, m);
      mesh.renderOrder = 20; mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({ mesh, t: 1, life: 0.2, size: 1, at: new THREE.Vector3() });
    }
    this._sp = 0;
  }

  /* a spark at arena (x, y, z); `dir`: the blow's way, for the block arcs */
  spark(x, y, z, kind, size = 1) {
    const s = this.sparks[this._sp++ % this.sparks.length];
    s.mesh.material.map = kind === 'block' ? this.texBlock : kind === 'big' ? this.texBig : this.texHit;
    s.mesh.material.needsUpdate = true;
    s.at.set(x, y, z);
    s.t = 0; s.life = kind === 'big' ? 0.3 : 0.2; s.size = size; s.r = Math.random() * Math.PI;
    s.mesh.visible = true;
  }

  /* ── stuffing ───────────────────────────────────────────────────────────── */
  _initFluff() {
    const N = (this.fluffN = 420);
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.colorNode = Fn(() => {
      const N = normalize(normalWorld);
      const n = mx_noise_float(positionWorld.mul(14)).mul(0.08);
      return vec4(shade(vec3(0.97, 0.95, 0.9).sub(n), N, { spec: 0.02, wrap: 0.8 }), 1);
    })();
    this.fluff = new THREE.InstancedMesh(geo, mat, N);
    this.fluff.frustumCulled = false;
    this.fluff.count = 0;
    this.world.add(this.fluff);
    // feathers: flat white quills that tumble and drift
    const fgeo = new THREE.PlaneGeometry(0.1, 0.36);
    const fmat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    fmat.colorNode = Fn(() => {
      const p = positionLocal;
      const vane = smoothstep(0.05, 0.0, abs(p.x).sub(float(0.045).mul(float(1).sub(abs(p.y).mul(2.6))))).mul(0.15);
      return vec4(vec3(0.98, 0.96, 0.99).sub(vane), 1);
    })();
    this.feathers = new THREE.InstancedMesh(fgeo, fmat, 160);
    this.feathers.frustumCulled = false; this.feathers.count = 0;
    this.world.add(this.feathers);
    this.fp = []; this.fe = [];
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._s = new THREE.Vector3(); this._v = new THREE.Vector3();
  }

  /* tufts of stuffing at arena (x, y, z), thrown along d = [dx, dz] */
  tufts(x, y, z, n = 6, power = 1, d = [1, 0], feathers = 0) {
    for (let i = 0; i < n; i++) {
      if (this.fp.length >= this.fluffN) this.fp.shift();
      const s = (1 + Math.random() * 3) * power, side = (Math.random() - 0.5) * 3 * power;
      this.fp.push({
        p: [x + (Math.random() - 0.5) * 0.3, y + (Math.random() - 0.5) * 0.3, z + (Math.random() - 0.5) * 0.3],
        v: [d[0] * s - d[1] * side, (1 + Math.random() * 4) * power, d[1] * s + d[0] * side],
        r: 0.05 + Math.random() * 0.08, life: 1.2 + Math.random() * 1.2, t: 0, spin: Math.random() * 6, drag: 1.6 + Math.random(),
      });
    }
    for (let i = 0; i < feathers; i++) {
      if (this.fe.length >= 160) this.fe.shift();
      const a = Math.random() * Math.PI * 2, s = (0.5 + Math.random() * 2) * power;
      this.fe.push({ p: [x, y + 0.2, z], v: [Math.cos(a) * s + d[0] * power, 2 + Math.random() * 3 * power, Math.sin(a) * s + d[1] * power], t: 0, life: 2.5 + Math.random() * 2, ph: Math.random() * 6, spin: 2 + Math.random() * 4 });
    }
  }

  burst(plush) {
    const s = plush.soft, M = plush.group.matrixWorld, v = this._v, inv = new THREE.Matrix4().copy(this.world.matrixWorld).invert();
    for (let i = 0; i < s.n; i += 1) {
      v.set(s.x[i * 3], s.x[i * 3 + 1], s.x[i * 3 + 2]).applyMatrix4(M).applyMatrix4(inv);
      if (this.fp.length >= this.fluffN) this.fp.shift();
      const a = Math.random() * Math.PI * 2;
      this.fp.push({
        p: [v.x, v.y, v.z],
        v: [Math.cos(a) * (2 + Math.random() * 5), 3 + Math.random() * 7, Math.sin(a) * (1 + Math.random() * 3)],
        r: 0.09 + Math.random() * 0.16, life: 3 + Math.random() * 2.5, t: 0, spin: Math.random() * 4, drag: 0.9 + Math.random() * 0.8,
      });
    }
  }

  /* per render frame: sparks, fluff and feathers */
  update(dt) {
    const C = this.camera;
    this._moonStep(dt);
    for (const s of this.sparks) {
      if (!s.mesh.visible) continue;
      s.t += dt;
      const k = s.t / s.life;
      if (k >= 1) { s.mesh.visible = false; continue; }
      const sc = s.size * (0.7 + 1.1 * Math.min(1, k * 4)) * (1 - 0.3 * k);
      s.mesh.position.copy(s.at); this.world.localToWorld(s.mesh.position);
      // toward the camera a little, so it sits on the near side of the body
      s.mesh.position.lerp(C.position, 0.06);
      s.mesh.scale.set(sc, sc, 1);
      s.mesh.quaternion.copy(C.quaternion);
      s.mesh.rotateZ(s.r);
      s.mesh.material.opacity = 1 - k * k;
    }
    const floorAt = (x, z) => (Math.abs(x) < MAT && Math.abs(z) < MAT ? 0 : -BED_H);
    const keep = [];
    let n = 0;
    for (const f of this.fp) {
      f.t += dt;
      if (f.t > f.life) continue;
      const d = Math.exp(-f.drag * dt);
      f.v[0] *= d; f.v[2] *= d; f.v[1] = f.v[1] * d - 6 * dt;
      for (let k = 0; k < 3; k++) f.p[k] += f.v[k] * dt;
      const fl = floorAt(f.p[0], f.p[2]) + f.r * 0.6;
      if (f.p[1] < fl) { f.p[1] = fl; f.v[1] = 0; f.v[0] *= 0.8; f.v[2] *= 0.8; }
      const fade = Math.min(1, (f.life - f.t) * 3);
      this._e.set(f.spin * f.t, f.spin * 0.7 * f.t, 0);
      this._q.setFromEuler(this._e);
      this._s.set(f.r * fade, f.r * 0.8 * fade, f.r * fade);
      this._m4.compose(this._v.set(...f.p), this._q, this._s);
      this.fluff.setMatrixAt(n++, this._m4);
      keep.push(f);
    }
    this.fp = keep;
    this.fluff.count = n;
    this.fluff.instanceMatrix.needsUpdate = true;
    const fk = [];
    let m = 0;
    for (const f of this.fe) {
      f.t += dt;
      if (f.t > f.life) continue;
      const d = Math.exp(-2.4 * dt);
      f.v[0] *= d; f.v[2] *= d; f.v[1] = Math.max(-0.9, f.v[1] * d - 4 * dt);
      // the drift: a feather sways side to side as it falls
      const sw = Math.sin(f.t * 3 + f.ph) * 0.9;
      f.p[0] += (f.v[0] + sw) * dt; f.p[1] += f.v[1] * dt; f.p[2] += f.v[2] * dt;
      const fl = floorAt(f.p[0], f.p[2]) + 0.02;
      if (f.p[1] < fl) { f.p[1] = fl; f.v[0] = f.v[2] = 0; }
      const fade = Math.min(1, (f.life - f.t) * 2);
      this._e.set(Math.sin(f.t * f.spin) * 0.9 + 1.2, f.t * f.spin * 0.5, Math.cos(f.t * 2 + f.ph) * 0.7);
      this._q.setFromEuler(this._e);
      this._s.set(fade, fade, fade);
      this._m4.compose(this._v.set(...f.p), this._q, this._s);
      this.feathers.setMatrixAt(m++, this._m4);
      fk.push(f);
    }
    this.fe = fk;
    this.feathers.count = m;
    this.feathers.instanceMatrix.needsUpdate = true;
  }
}
