/* The motion specials' look (render only; the sim never sees any of it).

   - The shots: Kevalanche's snowball (OG) or his hockey glove (ALT, a copy
     of the one on his hand, spinning), Johnny's giant flaming tennis ball,
     Rubberta's ink blob. Built here, flown by arena.projectiles.
   - Soft puffs (camera-facing quads, instanced, one draw per kind): snow,
     flame (additive, stylised: round soft licks, no gore), ink, a whirl of
     air for the tornado. Trails while a shot flies, bursts when it lands.
   - Rubberta's ink on a face: a few blots on the front of the head that
     drip and fade over the two seconds the sim counts down (`f.ink`).
   - Johnny's toss: the giant ball thrown up off his hand before the serve. */

import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, normalWorld, normalize, positionLocal, mx_noise_float, float } from 'three/tsl';
import { shade, makeTennisBall } from '../../shared/grommet/props.js';
import { TENNIS_R } from '../../shared/grommet/athletes/leopard.game.js';

const tex = (draw, w = 128, h = 128) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const radial = (g, w, stops) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  for (const [a, c] of stops) gr.addColorStop(a, c);
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
};
const felt = (r, g, b, o = {}) => {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = Fn(() => {
    const n = o.fuzz ? mx_noise_float(positionLocal.mul(o.fuzz)).mul(0.05) : float(0);
    return vec4(shade(vec3(r, g, b).sub(n), normalize(normalWorld), { spec: o.spec ?? 0.04, power: o.power ?? 30, wrap: o.wrap ?? 0.6 }), 1);
  })();
  return m;
};

/* a lumpy snowball of soft felt: a ball and a few packed clumps */
function makeSnow() {
  const g = new THREE.Group(), m = felt(0.96, 0.98, 1.0, { fuzz: 18, wrap: 0.75, spec: 0.08 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 2), m); g.add(core);
  for (let k = 0; k < 7; k++) {
    const a = k * 2.4, b = (k * 1.7) % 3.1 - 1.5;
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + (k % 3) * 0.03, 1), m);
    c.position.set(Math.cos(a) * Math.cos(b) * 0.28, Math.sin(b) * 0.28, Math.sin(a) * Math.cos(b) * 0.28);
    g.add(c);
  }
  return g;
}

/* the giant tennis ball, on fire: the ball, and three soft licks of flame
   streaming back from it (additive, flickered in animShot) */
function makeFlame(flameMat) {
  const g = new THREE.Group();
  const ball = makeTennisBall(TENNIS_R * 2.2 * 2.1); ball.visible = true; g.add(ball);
  const licks = [];
  for (let k = 0; k < 3; k++) {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), flameMat);
    q.renderOrder = 16; licks.push(q); g.add(q);
  }
  g.userData.ball = ball; g.userData.licks = licks;
  return g;
}

/* a glossy blob of ink (deep violet-black) with two droplets trailing it */
function makeInk() {
  const g = new THREE.Group(), m = felt(0.09, 0.06, 0.16, { spec: 0.9, power: 60, wrap: 0.35 });
  const blob = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), m); g.add(blob);
  const d1 = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 9), m); d1.position.set(-0.42, 0.05, 0.06); g.add(d1);
  const d2 = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), m); d2.position.set(-0.66, -0.02, -0.05); g.add(d2);
  g.userData.blob = blob; g.userData.drops = [d1, d2];
  return g;
}

const KINDS = {
  snow: { n: 90, add: false },
  flame: { n: 110, add: true },
  ink: { n: 70, add: false },
  whirl: { n: 24, add: true },
};

export class SpecialFX {
  constructor(arena) {
    this.arena = arena;
    this.world = arena.world;
    this.camera = arena.camera;
    this.texture = {
      snow: tex((g, w) => radial(g, w, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(244,249,255,0.9)'], [1, 'rgba(230,240,255,0)']])),
      flame: tex((g, w) => radial(g, w, [[0, 'rgba(255,248,200,1)'], [0.3, 'rgba(255,196,80,0.95)'], [0.65, 'rgba(255,110,40,0.55)'], [1, 'rgba(220,60,30,0)']])),
      ink: tex((g, w) => {
        // a blot: a lumpy round splash with a couple of runs
        g.translate(w / 2, w / 2); g.fillStyle = '#1b1230';
        g.beginPath();
        for (let k = 0; k <= 24; k++) {
          const a = (k / 24) * Math.PI * 2, r = w * (0.3 + 0.08 * Math.sin(k * 2.7) + 0.05 * Math.cos(k * 5.1));
          k ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        g.fill();
        for (const [x, y, r] of [[0.36, 0.1, 0.07], [-0.3, -0.3, 0.06], [0.22, -0.36, 0.05], [-0.4, 0.2, 0.045]]) { g.beginPath(); g.arc(x * w, y * w, r * w, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(160,140,220,0.35)'; g.beginPath(); g.ellipse(-w * 0.09, -w * 0.1, w * 0.1, w * 0.05, -0.6, 0, 7); g.fill();
      }),
      drip: tex((g, w) => {
        g.translate(w / 2, w * 0.35); g.fillStyle = '#1b1230';
        g.beginPath(); g.ellipse(0, 0, w * 0.32, w * 0.26, 0, 0, 7); g.fill();
        for (const [x, l, r] of [[-0.18, 0.48, 0.05], [0.04, 0.6, 0.06], [0.2, 0.36, 0.045]]) {
          g.fillRect((x - r) * w, 0, 2 * r * w, l * w); g.beginPath(); g.arc(x * w, l * w, r * w * 1.25, 0, 7); g.fill();
        }
        g.fillStyle = 'rgba(170,150,230,0.4)'; g.beginPath(); g.ellipse(-w * 0.1, -w * 0.08, w * 0.1, w * 0.05, -0.5, 0, 7); g.fill();
      }),
      whirl: tex((g, w) => {
        g.translate(w / 2, w / 2);
        for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(0, 0, w * (0.22 + k * 0.09), k * 2, k * 2 + 2.2); g.lineWidth = w * (0.05 - k * 0.012); g.strokeStyle = `rgba(235,245,255,${0.7 - k * 0.18})`; g.stroke(); }
      }),
    };
    this.pools = {};
    const geo = new THREE.PlaneGeometry(1, 1);
    for (const [kind, K] of Object.entries(KINDS)) {
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: K.add ? THREE.AdditiveBlending : THREE.NormalBlending });
      m.map = this.texture[kind];
      const mesh = new THREE.InstancedMesh(geo, m, K.n);
      mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = 17;
      for (let i = 0; i < K.n; i++) mesh.setColorAt(i, new THREE.Color(1, 1, 1));
      this.world.add(mesh);
      this.pools[kind] = { mesh, list: [], n: K.n, add: K.add };
    }
    // the ink on faces: a few blots per fighter, on the front of the head
    const im = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    im.map = this.texture.drip;
    this.faceInk = [0, 1].map(() => {
      const blots = [0, 1, 2].map(() => { const q = new THREE.Mesh(geo, im); q.visible = false; q.renderOrder = 18; this.world.add(q); return q; });
      return { blots, k: 0 };
    });
    this.flameMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    this.flameMat.map = this.texture.flame;
    // Johnny's toss: a big ball off his hand, up, before the serve
    this.toss = makeTennisBall(TENNIS_R * 2.2 * 2.1); this.toss.visible = false; this.world.add(this.toss);
    this.glove = null;          // (fight.js: a copy of the ALT's own hockey glove)
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._qi = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
    this._hp = new THREE.Vector3(); this._hq = new THREE.Quaternion();
  }

  /* the shot models (arena.projectiles asks) */
  makeShot(kind) {
    if (kind === 'snow') return makeSnow();
    if (kind === 'flame') return makeFlame(this.flameMat);
    if (kind === 'ink') return makeInk();
    if (kind === 'glove') {
      const g = new THREE.Group();
      if (this.glove) { const c = this.glove.clone(); c.scale.setScalar(this.gloveScale || 1); g.add(c); g.userData.inner = c; } else g.add(makeSnow());
      return g;
    }
    return null;
  }

  /* each frame a shot flies: its spin, wobble, flicker — and a trail */
  animShot(m, p, x, y, z, dt) {
    const t = p.t;
    // its line (PF2: the shot's facing; PF1: along x)
    const ux = p.fx !== undefined ? p.fx / 1024 : Math.sign(p.vx) || 1, uz = p.fz !== undefined ? p.fz / 1024 : 0;
    if (p.kind === 'snow') {
      m.rotation.z = -t * 0.21; m.rotation.x = t * 0.07;
      if (Math.random() < dt * 30) this.puff('snow', x - ux * 0.3, y + (Math.random() - 0.5) * 0.25, z - uz * 0.3, 0.22 + Math.random() * 0.18, [-ux / 2, 0.4, -uz / 2], 0.6);
    } else if (p.kind === 'glove') {
      // spinning end over end, as thrown
      const inner = m.userData.inner;
      if (inner) inner.rotation.set(0, 0, -t * 0.42);
      if (Math.random() < dt * 8) this.arena.tufts(x, y, z, 0, 0.4, [0, 0], 1);
    } else if (p.kind === 'flame') {
      // the ball spins (topspin forward), the licks flicker behind it
      const b = m.userData.ball; b.rotation.z -= 0.5; b.rotation.x += 0.12;
      const back = -1;    // the model is built along +x: the trail streams to −x
      m.userData.licks.forEach((q, k) => {
        const fl = 0.85 + 0.25 * Math.sin(t * 1.7 + k * 2.1) + 0.1 * Math.sin(t * 3.9 + k);
        q.position.set(back * (0.95 + k * 0.55), (k - 1) * 0.05 + Math.sin(t * 0.9 + k) * 0.05, 0);
        q.scale.set((1.05 - k * 0.2) * fl * 1.9, (0.9 - k * 0.2) * fl * 1.45, 1);
        q.quaternion.copy(this._toCam(m));
      });
      for (let i = 0; i < 2; i++) if (Math.random() < dt * 40) this.puff('flame', x - ux * (0.9 + Math.random() * 0.4), y + (Math.random() - 0.5) * 0.3, z - uz * (0.9 + Math.random() * 0.4), 0.3 + Math.random() * 0.3, [-ux * 0.8, 1.2, -uz * 0.8], 0.45);
    } else if (p.kind === 'ink') {
      // a wobbling blob (stretched along its flight), the droplets trailing
      const w = Math.sin(t * 0.9);
      m.userData.blob.scale.set(1.18 + 0.08 * w, 0.9 - 0.06 * w, 0.95 - 0.04 * w);
      m.userData.drops.forEach((d, k) => { d.position.y = 0.04 * Math.sin(t * 0.8 + k * 2); });
      if (Math.random() < dt * 14) this.puff('ink', x - ux * 0.55, y - 0.1, z - uz * 0.55, 0.12 + Math.random() * 0.08, [0, -1.5, 0], 0.5, { grav: 1 });
    }
  }

  /* the turn that faces a child of `m` (in m's frame) to the camera */
  _toCam(m) {
    m.updateWorldMatrix(true, false);
    m.getWorldQuaternion(this._qi).invert();
    return this._q.copy(this._qi).multiply(this.camera.quaternion);
  }

  /* one soft puff: kind, arena (x, y, z), size, velocity, life (s) */
  puff(kind, x, y, z, size, v = [0, 0, 0], life = 0.6, o = {}) {
    const P = this.pools[kind];
    if (P.list.length >= P.n) P.list.shift();
    P.list.push({ p: [x, y, z], v: [...v], s: size, grow: o.grow ?? 1.6, t: 0, life, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 4, grav: o.grav || 0 });
  }

  /* a shot lands (or is blocked): its burst */
  splat(kind, x, y, z, dir, hit) {
    if (kind === 'snow') {
      for (let i = 0; i < 16; i++) { const a = Math.random() * 6.28; this.puff('snow', x, y, z, 0.25 + Math.random() * 0.35, [Math.cos(a) * 2.5 - dir[0] * 1.5, 1 + Math.random() * 2.5, Math.sin(a) * 2.5 - dir[1] * 1.5], 0.7 + Math.random() * 0.4, { grav: 1, grow: 1.3 }); }
      this.arena.tufts(x, y, z, 6, 1.0, [-dir[0], -dir[1]]);
    } else if (kind === 'glove') {
      // a feather puff
      this.arena.tufts(x, y, z, 4, 0.8, [-dir[0], -dir[1]], hit ? 16 : 8);
      for (let i = 0; i < 6; i++) this.puff('snow', x, y, z, 0.3 + Math.random() * 0.3, [(Math.random() - 0.5) * 2, 0.8, (Math.random() - 0.5) * 2], 0.5);
    } else if (kind === 'flame') {
      for (let i = 0; i < 18; i++) { const a = Math.random() * 6.28; this.puff('flame', x, y, z, 0.4 + Math.random() * 0.5, [Math.cos(a) * 3, 1.5 + Math.random() * 3, Math.sin(a) * 3], 0.45 + Math.random() * 0.3); }
      this.arena.spark(x, y, z, 'big', 1.6);
    } else if (kind === 'ink') {
      for (let i = 0; i < 14; i++) { const a = Math.random() * 6.28; this.puff('ink', x, y, z, 0.18 + Math.random() * 0.22, [Math.cos(a) * 2.2 - dir[0], 0.8 + Math.random() * 2.4, Math.sin(a) * 2.2 - dir[1]], 0.7 + Math.random() * 0.4, { grav: 1, grow: 1.1 }); }
    }
  }

  /* per frame: the puffs, the inky faces (st: the sim, for f.ink), the toss */
  update(dt, plush, st) {
    const cq = this._toCamWorld();
    for (const P of Object.values(this.pools)) {
      const keep = [];
      let n = 0;
      for (const q of P.list) {
        q.t += dt;
        if (q.t >= q.life) continue;
        const d = Math.exp(-2.2 * dt);
        q.v[0] *= d; q.v[2] *= d; q.v[1] = q.v[1] * d - (q.grav ? 9 : 0) * dt;
        for (let k = 0; k < 3; k++) q.p[k] += q.v[k] * dt;
        if (q.grav && q.p[1] < 0.03) { q.p[1] = 0.03; q.v[1] = 0; q.v[0] *= 0.5; q.v[2] *= 0.5; }
        const k = q.t / q.life, s = q.s * (1 + (q.grow - 1) * k);
        q.rot += q.spin * dt;
        this._p.set(...q.p);
        this._s.set(s, s, s);
        const r = this._qi.setFromAxisAngle(this._zAxis || (this._zAxis = new THREE.Vector3(0, 0, 1)), q.rot);
        this._m.compose(this._p, this._q.copy(cq).multiply(r), this._s);
        P.mesh.setMatrixAt(n, this._m);
        // fading: additive by colour, the rest by shrinking at the very end
        const f = P.add ? (1 - k) * (1 - k) : 1;
        P.mesh.setColorAt(n, this._c.setRGB(f, f, f));
        if (!P.add && k > 0.75) { this._s.multiplyScalar(1 - (k - 0.75) * 4); this._m.compose(this._p, this._q, this._s); P.mesh.setMatrixAt(n, this._m); }
        n++;
        keep.push(q);
      }
      P.list = keep;
      P.mesh.count = n;
      P.mesh.instanceMatrix.needsUpdate = true;
      if (P.mesh.instanceColor) P.mesh.instanceColor.needsUpdate = true;
    }
    // ink on a face: blots on the front of the head while the sim's count runs
    if (st && plush) for (let k = 0; k < 2; k++) {
      const F = st.f[k], I = this.faceInk[k], pl = plush[k];
      const on = F.ink > 0 && F.act !== 'ko' && F.act !== 'ringout';
      if (!on) { for (const b of I.blots) b.visible = false; continue; }
      this._hq.set(0, 0, 0, 0);
      const r = pl.headWorld(this._hp, this._hq);
      // into the world group's frame
      this.world.updateWorldMatrix(true, false);
      const inv = this._inv || (this._inv = new THREE.Matrix4());
      inv.copy(this.world.matrixWorld).invert();
      const hp = this._hp.applyMatrix4(inv);
      // the way the face looks: the head's own turn where the plush gives it
      // (PF2), else three-quarters to the camera (PF1's flat stage, camera at +z)
      let fx = F.face * 0.65, fz = 0.76;
      if (this._hq.lengthSq() > 0.5 && F.fx !== undefined) {
        const d = (this._hd || (this._hd = new THREE.Vector3())).set(0, 0, 1).applyQuaternion(this._hq).transformDirection(inv);
        const l = Math.hypot(d.x, d.z) || 1; fx = d.x / l; fz = d.z / l;
      }
      const fade = Math.min(1, F.ink / 20), drip = 1 - F.ink / 120;
      I.blots.forEach((b, j) => {
        const side = (j - 1) * 0.42, up = [0.08, 0.22, -0.05][j] - drip * 0.08 * (j + 1);
        b.visible = true;
        b.position.set(hp.x + fx * r * 1.02 + -fz * side * r * 0.8, hp.y + up * r, hp.z + fz * r * 1.02 + fx * side * r * 0.8);
        const s = r * [0.75, 0.95, 0.6][j] * (0.6 + 0.4 * fade);
        b.scale.set(s, s * (1 + drip * 0.35), s);
        b.quaternion.copy(cq);
      });
    }
  }

  /* the camera's turn in the world group's frame */
  _toCamWorld() {
    this.world.updateWorldMatrix(true, false);
    const w = this._wq || (this._wq = new THREE.Quaternion());
    this.world.getWorldQuaternion(w).invert();
    return (this._cq || (this._cq = new THREE.Quaternion())).copy(w).multiply(this.camera.quaternion);
  }

  /* Johnny's toss: the ball at arena (x, y, z), or hidden */
  tossAt(x, y, z, spin) {
    if (x === null) { this.toss.visible = false; return; }
    this.toss.visible = true; this.toss.position.set(x, y, z); this.toss.rotation.set(spin * 0.3, 0, -spin);
  }

  clear() {
    for (const P of Object.values(this.pools)) { P.list = []; P.mesh.count = 0; }
    for (const I of this.faceInk) for (const b of I.blots) b.visible = false;
    this.toss.visible = false;
  }
}
