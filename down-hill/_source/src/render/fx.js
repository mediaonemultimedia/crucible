/* Everything that flies, glows or flutters in a race, all pooled and
   instanced (two particle draws, one ball draw, however busy it gets):

   - feathers (the hits' bursts, the tier-1 drift sparks, the slicks);
     glows (tier-2 gold and tier-3 mint drift sparks, boost flames, the
     resurfacer's snow, the pads' sparkle, pops); Johnny's tennis balls;
   - the item boxes: gift-wrapped little pillows, bobbing and turning;
   - the items in flight: the pillow missile, the pillowcase, the fuzzy
     handcuffs (and the fuzzy chain between two cuffed karts), the alarm
     clock (and its jump-scare over the leader); feather slicks on the
     ground;
   - the sock on a string that fishes a fallen kart back.                */

import * as THREE from 'three/webgpu';
import { rbox, pillowGeo, mat, glowMat, mesh, canvasTex } from './geo.js';

const TAU = Math.PI * 2;
export const TIER_COLORS = [null, '#ffffff', '#ffc93a', '#4dffc3'];

function featherTex() {
  return canvasTex(64, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(w / 2, 4); g.bezierCurveTo(w * 0.95, h * 0.25, w * 0.9, h * 0.7, w / 2, h - 8); g.bezierCurveTo(w * 0.1, h * 0.7, w * 0.05, h * 0.25, w / 2, 4); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.lineWidth = 2;
    for (let y = 20; y < h - 20; y += 9) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w * 0.1, y + 16); g.stroke(); g.beginPath(); g.moveTo(w / 2, y + 4); g.lineTo(w * 0.9, y + 20); g.stroke(); }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(200,190,210,1)'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(w / 2, 6); g.lineTo(w / 2, h - 2); g.stroke();
  });
}
function dotTex() {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
}

class Pool {
  constructor(scene, n, material, geo) {
    this.n = n;
    this.mesh = new THREE.InstancedMesh(geo, material, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    const c = new Float32Array(n * 3).fill(1);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(c, 3);
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.p = [];
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.S = new THREE.Vector3(); this.P = new THREE.Vector3(); this.C = new THREE.Color();
    this.qz = new THREE.Quaternion(); this.Z = new THREE.Vector3(0, 0, 1);
  }
  add(o) { if (this.p.length >= this.n) this.p.shift(); this.p.push(o); return o; }
  update(dt, camQ, ground) {
    const out = [];
    let i = 0;
    for (const q of this.p) {
      q.age += dt;
      if (q.age >= q.life) continue;
      q.vy -= (q.g ?? 0) * dt;
      const dr = Math.exp(-(q.drag ?? 0) * dt);
      q.vx *= dr; q.vy *= dr; q.vz *= dr;
      if (q.sway) { q.vx += Math.sin(q.age * 5 + q.ph) * q.sway * dt; q.vz += Math.cos(q.age * 4 + q.ph) * q.sway * dt; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.floor !== undefined && q.y < q.floor) { q.y = q.floor; q.vy = Math.abs(q.vy) * (q.bounce || 0); q.vx *= 0.7; q.vz *= 0.7; }
      q.rot += (q.spin || 0) * dt;
      const f = q.age / q.life, s = q.size * (q.grow ? 1 + f * q.grow : 1) * (f > 0.7 ? 1 - (f - 0.7) / 0.3 : 1) * Math.min(1, q.age * 12 + 0.3);
      this.P.set(q.x, q.y, q.z);
      if (q.ball) this.Q.identity(); else { this.qz.setFromAxisAngle(this.Z, q.rot); this.Q.copy(camQ).multiply(this.qz); }
      this.S.set(s * (q.ax || 1), s * (q.ay || 1), s);
      this.M.compose(this.P, this.Q, this.S);
      this.mesh.setMatrixAt(i, this.M);
      this.C.set(q.c);
      const fade = q.fade ? 1 - f : 1;
      this.mesh.instanceColor.setXYZ(i, this.C.r * fade, this.C.g * fade, this.C.b * fade);
      out.push(q); i++;
    }
    this.p = out;
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Fx {
  constructor(scene, race) {
    this.scene = scene; this.race = race; this.T = race.T;
    this.root = new THREE.Group(); scene.add(this.root);
    this.feathers = new Pool(scene, 700, new THREE.MeshBasicMaterial({ map: featherTex(), alphaTest: 0.4, side: THREE.DoubleSide }), new THREE.PlaneGeometry(0.45, 0.9));
    this.glows = new Pool(scene, 900, new THREE.MeshBasicMaterial({ map: dotTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), new THREE.PlaneGeometry(1, 1));
    this.balls = new Pool(scene, 60, mat('#ffffff', { roughness: 0.8 }), new THREE.SphereGeometry(0.28, 10, 8));
    this.t = 0;
    this._boxes();
    this.shotMeshes = new Map();
    this.hazMeshes = new Map();
    this.cuffChains = new Map();
    this._sock();
    this.scares = [];
    this.caseOn = new Map();
  }

  r() { return Math.random(); }

  /* ── the item boxes: gift-wrapped pillows ── */
  _boxes() {
    const geo = pillowGeo(2.6, 1.5, 2.6, [10, 4, 10]);
    const wraps = [['#ff3b6b', '#ffd84a'], ['#3ff0c8', '#ff3b6b'], ['#9b5cff', '#3ff0c8'], ['#ffd84a', '#9b5cff']];
    const ribbonG = rbox(2.75, 1.55, 0.36, 0.1), ribbonG2 = rbox(0.36, 1.55, 2.75, 0.1);
    const bowG = new THREE.TorusGeometry(0.38, 0.13, 8, 16);
    this.boxMeshes = this.race.boxes.map((B, i) => {
      const [a, b] = wraps[i % 4];
      const g = new THREE.Group();
      mesh(geo, mat(a, { roughness: 0.55, emissive: a, emissiveIntensity: 0.25 }), 0, 0, 0, g);
      mesh(ribbonG, mat(b, { roughness: 0.4, emissive: b, emissiveIntensity: 0.2 }), 0, 0, 0, g);
      mesh(ribbonG2, mat(b, { roughness: 0.4, emissive: b, emissiveIntensity: 0.2 }), 0, 0, 0, g);
      for (const s of [-1, 1]) { const bw = mesh(bowG, mat(b, { roughness: 0.4 }), s * 0.36, 0.92, 0, g); bw.rotation.y = Math.PI / 2; bw.rotation.x = s * 0.5; }
      // a "?" tag
      g.position.set(B.x, B.y, B.z);
      g.userData.ph = i * 0.7;
      this.root.add(g);
      return g;
    });
  }

  /* ── the sock on a string ── */
  _sock() {
    const g = new THREE.Group();
    const tex = canvasTex(64, 128, (c, w, h) => { c.fillStyle = '#f4efe6'; c.fillRect(0, 0, w, h); c.fillStyle = '#ff3b6b'; for (let y = 0; y < h; y += 24) c.fillRect(0, y, w, 11); c.fillStyle = '#3ff0c8'; c.fillRect(0, h - 22, w, 22); });
    const sm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    // the leg down, the foot curling under: a long tube on a curve
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 7, 0), new THREE.Vector3(0, 3, 0), new THREE.Vector3(0.2, 0.6, 0.4), new THREE.Vector3(0.1, -0.3, 1.8), new THREE.Vector3(0, -0.2, 2.8)]);
    mesh(new THREE.TubeGeometry(curve, 24, 1.2, 12), sm, 0, 0, 0, g);
    const toe = mesh(new THREE.SphereGeometry(1.2, 14, 10), sm, 0, -0.2, 2.8, g);
    toe.scale.set(1, 0.9, 0.8);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1, 6), mat('#f4efe6'));
    string.position.y = 7;
    g.add(string);
    g.visible = false;
    this.sock = g; this.sockString = string;
    this.root.add(g);
  }

  /* where a fished kart is drawn: down to grab it, up and over, down onto the track */
  fishPose(K, out) {
    const F = K.fish, T = this.T;
    const u = F.t / F.dur;
    const tx = T.x[F.k], ty = T.y[F.k], tz = T.z[F.k];
    const sm = (x) => x * x * (3 - 2 * x);
    let x, y, z;
    if (u < 0.3) { x = F.x; z = F.z; y = F.y + Math.max(0, (0.3 - u) / 0.3) * -1; }
    else if (u < 0.8) {
      const v = sm((u - 0.3) / 0.5);
      x = F.x + (tx - F.x) * v; z = F.z + (tz - F.z) * v;
      y = F.y + (ty + 10 - F.y) * Math.min(1, v * 1.6) + Math.sin(v * Math.PI) * 6;
    } else { const v = sm((u - 0.8) / 0.2); x = tx; z = tz; y = ty + 10 * (1 - v) + 0.2; }
    out.x = x; out.y = y; out.z = z;
    out.sock = u < 0.3 ? { x: F.x, z: F.z, y: F.y + 3 + 40 * (1 - u / 0.3), hold: 0 } : { x, y: y + 3, z, hold: 1 };
    out.yaw = Math.atan2(T.tx[F.k], T.tz[F.k]) * Math.min(1, Math.max(0, (u - 0.3) / 0.5)) + (out.yaw0 ?? 0) * (1 - Math.min(1, Math.max(0, (u - 0.3) / 0.5)));
    return out;
  }

  /* ── spawners ── */
  burst(x, y, z, colors, n = 26, power = 9) {
    for (let i = 0; i < n; i++) {
      const a = this.r() * TAU, up = this.r();
      this.feathers.add({ x, y, z, vx: Math.cos(a) * power * (0.4 + this.r()), vy: 3 + up * power, vz: Math.sin(a) * power * (0.4 + this.r()), g: 9, drag: 2.2, sway: 6, ph: this.r() * 9, age: 0, life: 1.4 + this.r() * 1.2, size: 0.9 + this.r() * 0.9, rot: this.r() * TAU, spin: (this.r() - 0.5) * 6, c: colors[i % colors.length] });
    }
  }
  sparks(x, y, z, color, n = 3, sp = 4, size = 0.6, life = 0.35) {
    for (let i = 0; i < n; i++) {
      const a = this.r() * TAU;
      this.glows.add({ x, y, z, vx: Math.cos(a) * sp, vy: 1 + this.r() * sp, vz: Math.sin(a) * sp, g: 12, drag: 3, age: 0, life: life * (0.6 + this.r() * 0.8), size: size * (0.6 + this.r() * 0.8), rot: 0, c: color, fade: 1 });
    }
  }
  puff(x, y, z, color, size = 1.6, life = 0.5, vy = 1.5) {
    this.glows.add({ x, y, z, vx: (this.r() - 0.5) * 2, vy, vz: (this.r() - 0.5) * 2, g: 0, drag: 2, age: 0, life, size, grow: 1.5, rot: 0, c: color, fade: 1 });
  }
  ball(x, y, z, vx, vy, vz, color, floor) {
    this.balls.add({ x, y, z, vx, vy, vz, g: 30, drag: 0.3, age: 0, life: 2.4, size: 1, rot: 0, c: color, ball: 1, floor, bounce: 0.55 });
  }

  /* a kart's own trail each frame: drift sparks at the back wheels, boost
     flames, the resurfacer's snow, fluff kicked up off-track */
  kartTrail(K, view, dt) {
    if (view.group.visible === false) return;
    const g = view.group;
    const yaw = g.rotation.y, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
    const bx = g.position.x - fx * 2, by = g.position.y + 0.25, bz = g.position.z - fz * 2;
    const busy = this.r() < Math.min(1, dt * 60);
    if (K.drift && !K.air && busy) {
      const tier = K.tier;
      for (const s of [-1, 1]) {
        const x = bx + rx * 1.2 * s, z = bz + rz * 1.2 * s;
        if (tier === 0) { if (this.r() < 0.35) this.puff(x, by, z, '#8f88a8', 0.9, 0.35, 0.8); }
        else if (tier === 1) { this.feathers.add({ x, y: by + 0.3, z, vx: -fx * 3 + (this.r() - 0.5) * 4, vy: 2 + this.r() * 3, vz: -fz * 3 + (this.r() - 0.5) * 4, g: 6, drag: 2, sway: 4, ph: this.r() * 9, age: 0, life: 0.7, size: 0.55, rot: this.r() * TAU, spin: 5, c: '#ffffff' }); this.sparks(x, by, z, '#ffffff', 1, 3, 0.5); }
        else this.sparks(x, by, z, TIER_COLORS[tier], tier === 3 ? 3 : 2, 5, tier === 3 ? 0.9 : 0.7, 0.32);
      }
      if (view.kart.id === 'zamboni') for (let i = 0; i < 3; i++) this.glows.add({ x: bx - rx * K.drift * 1.6, y: by + 0.3, z: bz - rz * K.drift * 1.6, vx: -rx * K.drift * 9 + (this.r() - 0.5) * 3, vy: 3 + this.r() * 4, vz: -rz * K.drift * 9 + (this.r() - 0.5) * 3, g: 14, drag: 1.5, age: 0, life: 0.6, size: 0.7 + this.r() * 0.5, rot: 0, c: '#e8f4ff' });
    }
    if (K.boostT > 0 && busy) {
      for (const e of view.kart.exhaust) {
        const p = e.clone().applyMatrix4(view.kart.body.matrixWorld);
        this.glows.add({ x: p.x, y: p.y, z: p.z, vx: -fx * 6, vy: 0.5, vz: -fz * 6, g: 0, drag: 4, age: 0, life: 0.28, size: 1.3, grow: 0.6, rot: 0, c: K.jitterT > 0 ? '#ffb070' : '#ff5a8a', fade: 1 });
        this.glows.add({ x: p.x, y: p.y, z: p.z, vx: -fx * 4, vy: 0.3, vz: -fz * 4, g: 0, drag: 4, age: 0, life: 0.18, size: 0.7, rot: 0, c: '#fff2b0', fade: 1 });
      }
      // the ball machine's volley
      if (view.kart.id === 'ballmachine' && this.r() < 0.18) {
        const p = view.kart.parts.barrel.clone().applyMatrix4(view.kart.body.matrixWorld);
        this.ball(p.x, p.y, p.z, -fx * 14 + (this.r() - 0.5) * 4, 7 + this.r() * 3, -fz * 14 + (this.r() - 0.5) * 4, view.alt ? '#ff3340' : '#d7f230', K.y);
      }
    }
    if (K.surf !== 'track' && Math.abs(K.fwd) > 8 && !K.air && this.r() < 0.4) this.puff(bx, by, bz, K.surf === 'cereal' ? '#e7b765' : '#c8bfd6', 1.1, 0.5, 2);
  }

  /* ── frame ── */
  update(dt, camQ, karts, views) {
    this.t += dt;
    const R = this.race, t = this.t;
    // boxes
    R.boxes.forEach((B, i) => {
      const g = this.boxMeshes[i];
      const show = !B.dead || B.dead < 20;
      g.visible = show;
      const s = B.dead ? Math.max(0.05, 1 - B.dead / 20) : 1;
      g.scale.setScalar(s);
      g.position.y = B.y + Math.sin(t * 2.2 + g.userData.ph) * 0.35;
      g.rotation.y = t * 1.3 + g.userData.ph;
      g.rotation.z = Math.sin(t * 1.7 + g.userData.ph) * 0.15;
    });
    // shots in flight
    const seen = new Set();
    for (const S of R.shots) {
      seen.add(S.id);
      let m = this.shotMeshes.get(S.id);
      if (!m) { m = this._shotMesh(S.kind); this.shotMeshes.set(S.id, m); this.root.add(m); }
      m.position.set(S.x, S.y, S.z);
      if (S.kind === 'missile') {
        m.rotation.y = Math.atan2(S.vx, S.vz); m.rotation.x = t * 14;
        if (this.r() < 0.8) this.feathers.add({ x: S.x, y: S.y, z: S.z, vx: 0, vy: 0.5, vz: 0, g: 2, drag: 3, sway: 3, ph: this.r() * 9, age: 0, life: 0.6, size: 0.5, rot: this.r() * TAU, spin: 4, c: '#ffffff' });
      } else if (S.kind === 'case') {
        m.rotation.y = Math.atan2(S.vx, S.vz); m.children[0].scale.y = 1 + Math.sin(t * 22) * 0.2; m.rotation.z = Math.sin(t * 16) * 0.3;
      } else if (S.kind === 'cuffs') {
        m.rotation.set(t * 9, t * 5, 0);
      } else if (S.kind === 'alarm') {
        m.rotation.set(0, t * 3, Math.sin(t * 40) * 0.25);
        m.position.y += Math.abs(Math.sin(t * 9)) * 1.4;
        if (this.r() < 0.5) this.sparks(S.x, S.y + 2, S.z, '#ffe27a', 1, 3, 0.5);
      }
    }
    for (const [id, m] of this.shotMeshes) if (!seen.has(id)) { m.removeFromParent(); this.shotMeshes.delete(id); }
    // feather slicks on the ground
    const hs = new Set();
    for (const H of R.hazards) {
      hs.add(H.id);
      let m = this.hazMeshes.get(H.id);
      if (!m) { m = this._slick(); this.hazMeshes.set(H.id, m); this.root.add(m); m.position.set(H.x, H.y + 0.15, H.z); }
      m.rotation.y = t * 0.3;
      m.children[1].rotation.y = -t * 0.8;
    }
    for (const [id, m] of this.hazMeshes) if (!hs.has(id)) { m.removeFromParent(); this.hazMeshes.delete(id); }
    // the fuzzy chain between cuffed karts
    const live = new Set();
    for (const K of karts) if (K.cuff > K.i) {
      const O = karts[K.cuff], key = K.i * 16 + O.i;
      live.add(key);
      let c = this.cuffChains.get(key);
      if (!c) { c = this._chain(); this.cuffChains.set(key, c); this.root.add(c.group); }
      const A = views[K.i].group.position, B = views[O.i].group.position;
      for (let j = 0; j < c.links.length; j++) {
        const u = (j + 0.5) / c.links.length;
        const L = c.links[j];
        L.position.set(A.x + (B.x - A.x) * u, A.y + 2.2 + (B.y - A.y) * u - Math.sin(u * Math.PI) * 1.4, A.z + (B.z - A.z) * u);
        L.rotation.set(j % 2 ? Math.PI / 2 : 0, Math.atan2(B.x - A.x, B.z - A.z), 0);
      }
      c.cuffs[0].position.set(A.x, A.y + 2.2, A.z); c.cuffs[1].position.set(B.x, B.y + 2.2, B.z);
      c.cuffs.forEach((q) => { q.rotation.y = t * 2; });
    }
    for (const [k, c] of this.cuffChains) if (!live.has(k)) { c.group.removeFromParent(); this.cuffChains.delete(k); }
    // pillowcases over heads
    for (const K of karts) {
      let m = this.caseOn.get(K.i);
      if (K.caseT > 0) {
        if (!m) { m = this._caseHead(); this.caseOn.set(K.i, m); this.root.add(m); }
        const v = views[K.i], P = new THREE.Vector3(), Q = new THREE.Quaternion();
        const r = v.driver.p.headWorld(P, Q);
        m.position.copy(P); m.quaternion.copy(Q); m.scale.setScalar(r * 0.62 * (1 + Math.sin(t * 10) * 0.05));
      } else if (m) { m.removeFromParent(); this.caseOn.delete(K.i); }
    }
    // the alarm clock's jump-scares
    this.scares = this.scares.filter((s) => {
      s.age += dt;
      const u = s.age / 1.4;
      if (u >= 1) { s.m.removeFromParent(); return false; }
      const K = karts[s.i], v = views[s.i].group.position;
      const pop = u < 0.15 ? u / 0.15 * 1.3 : u < 0.25 ? 1.3 - (u - 0.15) * 3 : 1;
      s.m.position.set(v.x, v.y + 5 + Math.sin(u * 40) * 0.3 * (1 - u), v.z);
      s.m.scale.setScalar(Math.max(0.01, pop * 3.2 * (u > 0.85 ? (1 - u) / 0.15 : 1)));
      s.m.rotation.z = Math.sin(s.age * 50) * 0.3 * (1 - u);
      s.m.lookAt(this.camPos || v);
      void K;
      return true;
    });
    // the sock
    this.sock.visible = false;
    for (const K of karts) if (K.fish) {
      const o = this.fishPose(K, { yaw0: views[K.i].group.rotation.y });
      const S = o.sock;
      this.sock.visible = true;
      this.sock.position.set(S.x, S.y, S.z);
      this.sock.rotation.y = t * 0.6;
      this.sockString.scale.y = 120; this.sockString.position.y = 7 + 60;
      break;
    }
    this.feathers.update(dt, camQ);
    this.glows.update(dt, camQ);
    this.balls.update(dt, camQ);
  }

  scare(i) {
    const m = this._clock(true);
    this.root.add(m);
    this.scares.push({ i, age: 0, m });
  }

  _shotMesh(kind) {
    const g = new THREE.Group();
    if (kind === 'missile') {
      mesh(pillowGeo(1.8, 0.9, 1.4, [8, 3, 8]), mat('#ffffff', { roughness: 0.9, emissive: '#ff3b6b', emissiveIntensity: 0.15 }), 0, 0, 0, g);
      mesh(rbox(1.86, 0.2, 0.3, 0.08), mat('#ff3b6b'), 0, 0, 0, g);
    } else if (kind === 'case') {
      const inner = new THREE.Group(); g.add(inner);
      const c = mesh(new THREE.SphereGeometry(1, 14, 10, 0, TAU, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.95, side: THREE.DoubleSide }), 0, 0, 0, inner);
      c.scale.set(1.3, 1.6, 1.1); c.rotation.x = Math.PI;
      mesh(new THREE.TorusGeometry(1.25, 0.12, 6, 24), mat('#ffb3c8'), 0, -0.2, 0, inner).rotation.x = Math.PI / 2;
    } else if (kind === 'cuffs') {
      const fur = mat('#ff6fb5', { roughness: 1 });
      for (const s of [-1, 1]) mesh(new THREE.TorusGeometry(0.7, 0.32, 10, 20), fur, s * 0.8, 0, 0, g).rotation.y = s * 0.6;
      mesh(new THREE.TorusGeometry(0.25, 0.08, 6, 12), mat('#d8d8de', { metalness: 0.9, roughness: 0.2 }), 0, 0, 0, g);
    } else if (kind === 'alarm') {
      g.add(this._clock(false));
    }
    return g;
  }

  _clock(big) {
    const g = new THREE.Group();
    const red = mat('#e2463f', { roughness: 0.35, emissive: big ? '#e2463f' : '#000', emissiveIntensity: big ? 0.4 : 0 });
    const body = mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.9, 24), red, 0, 0, 0, g); body.rotation.x = Math.PI / 2;
    const face = canvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#fff7e0'; c.beginPath(); c.arc(w / 2, h / 2, w / 2, 0, TAU); c.fill();
      c.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; c.fillRect(w / 2 + Math.cos(a) * 50 - 3, h / 2 + Math.sin(a) * 50 - 3, 6, 6); }
      if (big) { // angry eyes and a shouting mouth: it's a jump-scare
        c.fillStyle = '#222'; c.beginPath(); c.ellipse(42, 50, 10, 14, 0, 0, TAU); c.ellipse(86, 50, 10, 14, 0, 0, TAU); c.fill();
        c.lineWidth = 6; c.beginPath(); c.moveTo(28, 30); c.lineTo(54, 40); c.moveTo(100, 30); c.lineTo(74, 40); c.stroke();
        c.fillStyle = '#7a1010'; c.beginPath(); c.ellipse(64, 92, 22, 16, 0, 0, TAU); c.fill();
      } else { c.lineWidth = 6; c.strokeStyle = '#222'; c.beginPath(); c.moveTo(64, 64); c.lineTo(64, 26); c.moveTo(64, 64); c.lineTo(92, 70); c.stroke(); }
    });
    mesh(new THREE.CircleGeometry(1.1, 24), new THREE.MeshBasicMaterial({ map: face }), 0, 0, 0.46, g);
    const gold = mat('#e9c349', { metalness: 0.8, roughness: 0.3 });
    for (const s of [-1, 1]) { const b = mesh(new THREE.SphereGeometry(0.55, 14, 10, 0, TAU, 0, Math.PI / 2), gold, s * 0.85, 1.25, 0, g); b.rotation.z = -s * 0.5; }
    mesh(rbox(0.3, 0.5, 0.2, 0.05), gold, 0, 1.45, 0, g);
    for (const s of [-1, 1]) mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.6), gold, s * 0.8, -1.3, 0, g).rotation.z = s * 0.4;
    return g;
  }

  _slick() {
    const g = new THREE.Group();
    const tex = canvasTex(256, 256, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * w * 0.45;
        c.save(); c.translate(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); c.rotate(Math.random() * TAU);
        c.fillStyle = Math.random() < 0.8 ? '#ffffff' : '#ffd1e0';
        c.beginPath(); c.ellipse(0, 0, 5, 16, 0, 0, TAU); c.fill(); c.restore();
      }
    });
    const d = mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.3, roughness: 1 }), 0, 0, 0, g);
    d.rotation.x = -Math.PI / 2;
    const up = new THREE.Group(); g.add(up);
    const fm = new THREE.MeshBasicMaterial({ map: this.feathers.mesh.material.map, alphaTest: 0.4, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) { const f = mesh(new THREE.PlaneGeometry(0.6, 1.2), fm, Math.cos(i) * 1.4, 0.55, Math.sin(i) * 1.4, up); f.rotation.set(0.3, i, 0.4); }
    return g;
  }

  _chain() {
    const group = new THREE.Group();
    const fur = mat('#ff6fb5', { roughness: 1 }), steel = mat('#d8d8de', { metalness: 0.9, roughness: 0.2 });
    const links = [];
    for (let i = 0; i < 9; i++) links.push(mesh(new THREE.TorusGeometry(0.35, 0.09, 6, 12), steel, 0, 0, 0, group));
    const cuffs = [0, 1].map(() => mesh(new THREE.TorusGeometry(1.1, 0.4, 10, 22), fur, 0, 0, 0, group));
    cuffs.forEach((c) => { c.rotation.x = Math.PI / 2; });
    return { group, links, cuffs };
  }

  _caseHead() {
    const g = new THREE.Group();
    const c = mesh(new THREE.SphereGeometry(1, 16, 12, 0, TAU, 0, Math.PI * 0.72), new THREE.MeshStandardMaterial({ color: '#f4efe6', roughness: 0.95, side: THREE.DoubleSide }), 0, 0.15, 0, g);
    c.scale.set(1.35, 1.7, 1.35);
    mesh(new THREE.TorusGeometry(1.3, 0.1, 6, 24), mat('#ffb3c8'), 0, -0.9, 0, g).rotation.x = Math.PI / 2;
    return g;
  }
}
