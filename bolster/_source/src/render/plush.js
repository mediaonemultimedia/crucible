/* One fighter on screen: the plush itself, built from the shared rigs and
   materials exactly as Grommet and Flock build them (rig → SoftBody → Body
   → 64-shell fur, cotton kit, bead eyes), placed in a group that the sim
   moves along the stage and turns to face the other fighter.

   The soft body lives in the group's own frame and runs on its own fixed
   clock off real time. It is posed by a puppet from the sim's state and
   nudged by the group's acceleration (so a jump squashes it, a landing
   slumps it, a walk leaves the ears behind), and by blows. Nothing here
   reaches back into the sim.                                              */

import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, normalWorld, normalize, positionLocal, mix, step, fract, float, uniform } from 'three/tsl';
import { SoftBody } from '../../shared/grommet/softbody.js';
import { Body } from '../../shared/grommet/body.js';
import { Groom } from '../../shared/grommet/groom.js';
import { makeFurMaterial, makeMaskTexture, makeGroomTexture, makeEyeMaterial } from '../../shared/grommet/fur.js';
import { makeClothMaterial } from '../../shared/grommet/cloth.js';
import { CHARACTER_INFO as G_INFO, paintAthlete } from '../../shared/grommet/characters.js';
import { CHARACTER_INFO as F_INFO, paintFace } from '../../shared/flock/characters.js';
import { buildBear } from '../../shared/grommet/athletes/bear.rig.js';
import { buildLeopard } from '../../shared/grommet/athletes/leopard.rig.js';
import { buildPandaSolo } from '../../shared/grommet/athletes/panda.rig.js';
import { buildGiraffe } from '../../shared/grommet/athletes/giraffe.rig.js';
import { buildRig as buildFlockRig } from '../../shared/flock/rig.js';
import { buildWolf } from '../../shared/flock/rigs.js';
import { buildCrow } from '../../shared/grommet/athletes/crow.rig.js';
import { makeBeak, poseBeak } from '../../shared/grommet/crowprops.js';
import { paintLuchaMask, paintBanditMask, makeGoldChain } from './masks.js';
import { makeRacquet, poseRacquet, makeStars, poseStars, shade } from '../../shared/grommet/props.js';
import { BipedPuppet, GiraffePuppet, OctopusPuppet, WolfPuppet, CrowPuppet, phaseOf } from './puppets.js';
import { FIGHTERS } from '../fighters/index.js';
import { Gloves, shaveCaps, cuffOnly } from './gloves.js';

export const SHELLS_EACH = 48;

const G = G_INFO;
export const LOOKS = {
  kevalanche: {
    build: buildBear, info: () => G.bear, paint: 'bear', Puppet: (s) => new BipedPuppet(s, 'boxer'), yaw: 0.85, gloves: true,
    // polar fur and red boxing gloves; evil: a brown bear in black
    colors: { ...G.bear.colors.polar, cloth: '#c9302a', trim: '#f4efe6' },
    evil: { ...G.bear.colors.honey, cloth: '#1d1b1f', trim: '#c9302a' },
  },
  johnny: {
    build: buildLeopard, info: () => G.leopard, paint: 'leopard', Puppet: (s) => new BipedPuppet(s, 'tennis'), yaw: 0.85,
    colors: G.leopard.colors.golden,
    evil: { ...G.leopard.colors.panther, cloth: '#2a2a30', trim: '#c9a23c' },
  },
  sumaura: {
    build: buildPandaSolo, info: () => G.panda, paint: 'panda', Puppet: (s) => new BipedPuppet(s, 'sumo'), yaw: 0.8,
    colors: G.panda.colors.classic,
    evil: { ...G.panda.colors.qinling, trim: '#1f1d20' },
  },
  k8e: {
    build: buildGiraffe, info: () => G.giraffe, paint: 'giraffe', Puppet: (s) => new GiraffePuppet(s), yaw: 1.2,
    colors: G.giraffe.colors.savanna,
    evil: { fur: '#8f7fa3', under: '#ddd3e6', accent: '#3a2948', spot: '#4b3360', nose: '#2b2033', cloth: '#2b2033', trim: '#2b2033' },
  },
  rubberta: {
    build: () => buildFlockRig('octopus'), info: () => ({ ...F_INFO.octopus, pile: 9 }), paint: 'octopus', Puppet: (s) => new OctopusPuppet(s), yaw: 0.75,
    colors: { ...F_INFO.octopus.colors.coral, spot: '#c4553e', nose: '#8a5a62', cloth: '#ffffff', trim: '#ffffff' },
    evil: { ...F_INFO.octopus.colors.lagoon, fur: '#2f6f8f', accent: '#2f6f8f', under: '#bfe0e8', spot: '#1d4a60', nose: '#203040', cloth: '#ffffff', trim: '#ffffff' },
  },
  // Flock's wolf, front legs freed as arms, in a luchador's mask: the
  // técnico's emerald with white trim; his evil twin a darker wolf in the
  // rudo's black and red (spot: the mask, nose: its trim)
  sebas: {
    build: () => buildWolf({ fighter: true }), info: () => ({ ...F_INFO.wolf, pile: 9 }), paint: 'wolf', Puppet: (s) => new WolfPuppet(s), yaw: 0.8,
    colors: { ...F_INFO.wolf.colors.grey, spot: '#14915a', nose: '#f4f1ea', cloth: '#ffffff', trim: '#ffffff' },
    evil: { ...F_INFO.wolf.colors.dusk, spot: '#151318', nose: '#d4102c', cloth: '#ffffff', trim: '#ffffff' },
    mask: (m, p, rig, evil) => paintLuchaMask(m, p, rig, { evil }), noMonocle: true,
  },
  // Grommet's crow with his felt beak; his evil twin an ash-grey crow in a
  // bandit's mask, wearing a stolen gold chain
  zach: {
    build: buildCrow, info: () => G.crow, paint: 'crow', Puppet: (s) => new CrowPuppet(s), yaw: 0.85,
    colors: G.crow.colors.crow,
    evil: { fur: '#7d7a86', under: '#8c8995', accent: '#86838f', spot: '#121115', nose: '#2a292f', cloth: '#2a292f', trim: '#2a292f', sheen: '#1e1e3a', beak: 1 },
    mask: (m, p, rig, evil) => { if (evil) paintBanditMask(m, p, rig); }, chain: true, noMonocle: true,
  },
};

/* the solo panda wears the champion's face from a two-panda atlas: paint
   with the second panda's parts pointed off the canvas */
function paintSoloPanda(maskTex, patTex, rig) {
  const off = rig.regions.length;
  const proxy = {
    ...rig,
    regions: [...rig.regions, { x0: 3, x1: 3.2, y0: 3, y1: 3.2 }],
    parts: [...rig.parts, ...rig.parts.filter((p) => p.kind === 'grid').map((p) => ({ ...p, name: p.name + ' b', region: off }))],
  };
  paintAthlete(maskTex, patTex, 'panda', proxy);
}

/* ── the toque: red-and-white knit, a rolled brim, a pompom ──────────────── */
function knitMaterial() {
  const m = new THREE.MeshBasicNodeMaterial();
  m.colorNode = Fn(() => {
    const y = positionLocal.y;
    const band = step(0.5, fract(y.mul(5.5)));
    const rib = fract(positionLocal.x.mul(18).add(positionLocal.z.mul(18))).mul(0.06);
    const base = mix(vec3(0.78, 0.07, 0.1), vec3(0.96, 0.94, 0.9), band).sub(rib);
    return vec4(shade(base, normalize(normalWorld), { spec: 0.05, power: 10 }), 1);
  })();
  return m;
}
function makeToque() {
  const g = new THREE.Group();
  const knit = knitMaterial();
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.5, 0.62, 28, 6, true), knit);
  cone.position.y = 0.31;
  const white = new THREE.MeshBasicNodeMaterial();
  white.colorNode = Fn(() => vec4(shade(vec3(0.97, 0.95, 0.92), normalize(normalWorld), { spec: 0.04 }), 1))();
  const red = new THREE.MeshBasicNodeMaterial();
  red.colorNode = Fn(() => vec4(shade(vec3(0.8, 0.08, 0.1), normalize(normalWorld), { spec: 0.04 }), 1))();
  const brim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.1, 12, 36), red);
  brim.rotation.x = Math.PI / 2;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), white);
  top.position.y = 0.66;
  // a little maple leaf on the front of the brim
  const leaf = new THREE.Shape();
  const P = [[0, 1], [0.18, 0.6], [0.42, 0.72], [0.34, 0.36], [0.6, 0.3], [0.44, 0.08], [0.5, -0.1], [0.12, -0.04], [0.06, -0.45], [-0.06, -0.45], [-0.12, -0.04], [-0.5, -0.1], [-0.44, 0.08], [-0.6, 0.3], [-0.34, 0.36], [-0.42, 0.72], [-0.18, 0.6]];
  P.forEach(([x, y], k) => (k ? leaf.lineTo(x, y) : leaf.moveTo(x, y)));
  const lm = new THREE.Mesh(new THREE.ExtrudeGeometry(leaf, { depth: 0.04, bevelEnabled: false }), white);
  lm.scale.setScalar(0.11);
  lm.position.set(0, 0.0, 0.6);
  g.add(cone, brim, top, lm);
  g.visible = false;
  return g;
}

/* ── the monocle: a gold rim, a glint of glass, a little chain ───────────── */
function makeMonocle() {
  const g = new THREE.Group();
  const gold = new THREE.MeshBasicNodeMaterial();
  gold.colorNode = Fn(() => vec4(shade(vec3(0.85, 0.66, 0.24), normalize(normalWorld), { spec: 0.6, power: 30 }), 1))();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.13, 10, 32), gold);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicNodeMaterial({ color: 0xdff2ff, transparent: true, opacity: 0.32, depthWrite: false }));
  const chain = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.05, 6, 24, Math.PI * 0.9), gold);
  chain.rotation.z = -Math.PI * 0.95;
  chain.position.set(0.6, -1.5, -0.1);
  g.add(rim, glass, chain);
  g.visible = false;
  return g;
}

export class Plush {
  constructor(scene, id, { evil = false, side = 0 } = {}) {
    const L = LOOKS[id];
    this.id = id; this.side = side; this.evil = evil;
    this.look = L;
    const rig = (this.rig = L.build());
    const soft = (this.soft = new SoftBody(rig));
    soft.params.stuffing = 0.5;
    soft.params.damping = 0.5;
    this.puppet = L.Puppet(soft);
    if (L.gloves) cuffOnly(rig);
    this.body = new Body(rig, soft);
    this.cloth = rig.cloth ? new Body(rig, soft, { cloth: true }) : null;

    this.groom = new Groom();
    this.groom.setLayout(rig.regions);
    this.groomTex = makeGroomTexture(this.groom);
    this.maskTex = makeMaskTexture();
    this.patTex = makeMaskTexture();
    this.fur = makeFurMaterial(this.groomTex, this.maskTex, this.patTex);
    this.clothMat = makeClothMaterial();

    const info = (this.info = L.info());
    if (L.paint === 'octopus' || L.paint === 'wolf') {
      paintFace(this.maskTex, L.paint, rig);
      const g = this.patTex.userData.ctx;
      g.fillStyle = '#000'; g.fillRect(0, 0, this.patTex.userData.size, this.patTex.userData.size);
      this.patTex.needsUpdate = true;
    } else if (L.paint === 'panda') paintSoloPanda(this.maskTex, this.patTex, rig);
    else paintAthlete(this.maskTex, this.patTex, L.paint, rig);
    shaveCaps(this.maskTex, rig);
    L.mask?.(this.maskTex, this.patTex, rig, evil);
    this.setColors(evil ? L.evil : L.colors);
    this.fur.uniforms.pile.value = (info.pile || 9) / 90;
    this.fur.uniforms.shells.value = SHELLS_EACH;
    this.fur.uniforms.stitch.value.setRGB(...(info.stitch || [0.1, 0.06, 0.05]), THREE.LinearSRGBColorSpace);

    const group = (this.group = new THREE.Group());
    this.shells = new THREE.Mesh(this.body.geometry, this.fur.material);
    this.body.geometry.instanceCount = SHELLS_EACH;
    this.shells.frustumCulled = false;
    group.add(this.shells);
    if (this.cloth) {
      this.clothMesh = new THREE.Mesh(this.cloth.geometry, this.clothMat.material);
      this.clothMesh.frustumCulled = false;
      group.add(this.clothMesh);
    }
    const eyeMat = makeEyeMaterial(), eyeGeo = new THREE.SphereGeometry(1, 32, 22);
    this.eyes = [-1, 1].map((s) => { const m = new THREE.Mesh(eyeGeo, eyeMat); m.userData.side = s; group.add(m); return m; });
    if (rig.racquet) { this.racquet = makeRacquet(); group.add(this.racquet); }
    if (L.gloves) this.gloves = new Gloves(group, soft, rig, (evil ? L.evil : L.colors).cloth);
    if (rig.beak) {
      // the crow's felt beak, riding the head's own frame
      const c = evil ? L.evil : L.colors;
      this.beak = makeBeak(rig.beak);
      this.beak.userData.color.value.set(c.nose);
      this.beakScale = c.beak || 1;
      group.add(this.beak);
    }
    if (L.chain && evil) { this.chain = makeGoldChain({ c: [0, 1.6, 0.06], rx: 0.53, rz: 0.52 }); this.chain.visible = true; group.add(this.chain); }
    this.monocleOK = !L.noMonocle;
    this.stars = makeStars();
    group.add(this.stars);
    this.toque = makeToque();
    group.add(this.toque);
    this.monocle = makeMonocle();
    group.add(this.monocle);
    scene.add(group);

    this.yawScale = 1;              // the title lineup turns them nearly to face us
    this.yaw = { x: side ? -L.yaw : L.yaw, v: 0 };
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.lastVel = null;
    this.squash = { x: 0, v: 0 };   // hit-pause squash, on the group's scale
    this.deflate = 0;               // a Fluffatality: the stuffing's gone
    this.time = 0;
    this._P = new THREE.Vector3(); this._N = new THREE.Vector3(); this._U = new THREE.Vector3();
    this._M = new THREE.Matrix4(); this._X = new THREE.Vector3(); this._Gz = new THREE.Vector3();
    this.hc = [0, 0, 0];
    // the plush stays on its mark in its own frame: the group carries it
    // along the stage, so a blow may rock it but never walk it off its
    // hitbox (a capped velocity servo on the body's mean, as Grommet moves)
    const ix0 = rig.clouds[0].ix;
    this._home = [0, 0];
    for (const i of ix0) { this._home[0] += rig.rest[i * 3] / ix0.length; this._home[1] += rig.rest[i * 3 + 2] / ix0.length; }
    soft.hooks.push((h) => this._anchor(h, ix0));
    // let him settle onto his feet before the first frame
    for (let i = 0; i < 90; i++) soft.advance(1 / 120, (h) => this.puppet.update(h), (h) => { this.body.update(h); this.cloth?.update(h); });
  }

  _anchor(h, ix) {
    const s = this.soft, x = s.x, v = s.v;
    let cx = 0, cz = 0, mx = 0, mz = 0;
    for (const i of ix) { cx += x[i * 3]; cz += x[i * 3 + 2]; mx += v[i * 3]; mz += v[i * 3 + 2]; }
    const n = ix.length;
    cx /= n; cz /= n; mx /= n; mz /= n;
    const cap = 7;
    let tx = (this._home[0] - cx) * 9, tz = (this._home[1] - cz) * 9;
    const tl = Math.hypot(tx, tz);
    if (tl > cap) { tx *= cap / tl; tz *= cap / tl; }
    const e = Math.min(1, 14 * h);
    const dx = (tx - mx) * e * h, dz = (tz - mz) * e * h;
    for (let i = 0; i < s.n; i++) { x[i * 3] += dx; x[i * 3 + 2] += dz; }
  }

  setColors(c) {
    const U = this.fur.uniforms;
    U.color.value.set(c.fur); U.under.value.set(c.under); U.accent.value.set(c.accent ?? c.fur);
    U.spot.value.set(c.spot ?? c.fur); U.nose.value.set(c.nose ?? '#333');
    U.sheen.value.set(c.sheen || '#000000');
    this.clothMat.uniforms.cloth.value.set(c.cloth ?? '#ffffff'); this.clothMat.uniforms.trim.value.set(c.trim ?? '#ffffff');
  }

  /* a blow from the other side: the stuffing takes it */
  hit(dmg, kd, fromDir) {
    const P = this.puppet, b = P.aim;
    const s = Math.min(9, 2.5 + dmg / 18) * (kd ? 1.3 : 1);
    P.shove([-b[0] * s, s * 0.25, -b[2] * s], (i, y) => Math.min(1, Math.max(0, (y - 0.7) / 2.2)));
    if (dmg >= 60 || kd) P.daze = Math.min(1, P.daze + (kd ? 0.8 : 0.45));
    this.squash.v -= 4 + dmg / 25;
  }

  /* render-frame update: F is the sim fighter (positions interpolated by the
     caller into wx, wy), O the other one */
  update(dt, F, O, wx, wy, ox, oy, threat) {
    const L = this.look;
    this.time += dt;
    const g = this.group;
    // facing: a turn (eased) when the sim flips him
    const want = (F.face > 0 ? L.yaw : -L.yaw) * this.yawScale;
    const k = 120;
    this.yaw.v += (k * (want - this.yaw.x) - 2 * Math.sqrt(k) * this.yaw.v) * dt;
    this.yaw.x += this.yaw.v * dt;
    // the group's acceleration, felt by the stuffing as inertia
    const nx = wx, ny = wy;
    if (dt > 0) {
      const vx = (nx - this.pos.x) / dt, vy = (ny - this.pos.y) / dt;
      if (this.lastVel && dt < 0.1) {
        let ax = vx - this.lastVel[0], ay = vy - this.lastVel[1];
        const m = Math.hypot(ax, ay), cap = 9;
        if (m > cap) { ax *= cap / m; ay *= cap / m; }
        // into the plush's frame (a turn about y)
        const c = Math.cos(-this.yaw.x), s = Math.sin(-this.yaw.x);
        const lx = ax * c, lz = -ax * s;
        if (m > 0.05) this.puppet.shove([-lx * 0.4, -ay * 0.3, -lz * 0.4], (i, y) => Math.min(1, Math.max(0.2, y / 2.6)));
      }
      this.lastVel = [vx, vy];
    }
    this.pos.set(nx, ny, 0);
    g.position.set(nx, ny, 0);
    g.rotation.y = this.yaw.x;
    // the K.O. launch: he tumbles end over end (the sim's own spin, kr in
    // thousandths of a turn), about his middle; flat out once he's down
    // the wolf's and the crow's acrobatics (a flip, the moonsault, the
    // dive bomb's nose-down) turn the whole plush the same way, about its
    // own pivot height (render only)
    const ac = F.act === 'ko' ? null : this.puppet.acro?.(F);
    this._lift = 0;
    if (F.act === 'ko' && F.kb < 1 && F.kdir) { this._spin = -F.kdir * (F.kr / 1000) * Math.PI * 2; this._spinH = 1.5; }
    else if (ac) { this._spin = ac.a; this._spinH = ac.h; this._lift = ac.y || 0; }
    else { const w = Math.atan2(Math.sin(this._spin || 0), Math.cos(this._spin || 0)); this._spin = w * Math.max(0, 1 - dt * 10); if (Math.abs(this._spin) < 0.01) this._spin = 0; }
    if (this._spin || this._lift) {
      const h = this._spinH ?? 1.5, a = this._spin || 0;
      g.rotation.order = 'ZYX';
      g.rotation.z = a;
      g.position.set(nx + h * Math.sin(a), ny + h - h * Math.cos(a) + this._lift, 0);
    } else g.rotation.z = 0;
    // hit squash
    const ks = 260;
    this.squash.v += (ks * (0 - this.squash.x) - 2 * Math.sqrt(ks) * 0.5 * this.squash.v) * dt;
    this.squash.x += this.squash.v * dt;
    const sq = Math.max(-0.25, Math.min(0.2, this.squash.x * 0.06));
    const crouch = this.puppet.crouchT ? 0.84 : 1;
    // the jump: squashed in the crouch before it, stretched going up fast
    // (and coming down in a dive), squashed again on landing
    let sy = 1;
    if (F.act === 'jumpsquat') sy = 0.8;
    else if (F.air && F.vy > 160) sy = 1.12;
    else if (F.air && F.vy < -300) sy = 1.08;
    if (this._wasAir && !F.air) this._land = 1;
    this._wasAir = !!F.air;
    this._land = Math.max(0, (this._land || 0) - dt * 7);
    sy *= 1 - 0.2 * Math.sin(Math.min(1, this._land) * Math.PI * 0.5);
    this._ss = this._ss === undefined ? 1 : this._ss + (sy - this._ss) * Math.min(1, dt * 30);
    this._crouch = this._crouch === undefined ? 1 : this._crouch + (crouch - this._crouch) * Math.min(1, dt * 18);
    this.deflate += ((this.deflateTarget || 0) - this.deflate) * Math.min(1, dt * 7);
    const df = this.deflate;
    const sx = 1 / Math.sqrt(this._ss);
    g.scale.set((1 - sq * 0.5 + df * 0.35) * sx, (1 + sq) * this._crouch * (1 - df * 0.62) * this._ss, (1 - sq * 0.5 + df * 0.35) * sx);
    g.updateMatrixWorld(true);

    // the fight frame in the plush's own frame
    const P = this.puppet;
    const dir = Math.sign(ox - wx) || F.face;
    const c = Math.cos(this.yaw.x), s = Math.sin(this.yaw.x);
    P.aim = [dir * c, 0, dir * s];
    P.side = [P.aim[2], 0, -P.aim[0]];
    // look at the other one — and a little toward us, so the face reads
    const oppHead = this._X.set(ox, oy + 2.4, 5);
    g.worldToLocal(oppHead);
    P.oppHead = [oppHead.x, oppHead.y, oppHead.z];
    P.threat = threat;
    if (P instanceof GiraffePuppet) P.reachK = Math.max(0, Math.min(2.4, Math.abs(ox - wx) / 1.86 - 2.1));
    P.perform(F, phaseOf(F));

    // the soft body, on its own fixed clock
    const soft = this.soft;
    soft.advance(Math.min(dt, 1 / 20), (h) => P.update(h), (h) => { this.body.update(h); this.cloth?.update(h); });
    this.groom.relax(dt);
    if (this.groom.dirty) { this.groomTex.needsUpdate = true; this.groom.dirty = false; }

    if (this.racquet && P.rq) poseRacquet(this.racquet, P.rq);
    if (this.beak) poseBeak(this.beak, P.beakFrame(), [this.beakScale, 0.92 + 0.12 * this.beakScale]);
    if (this.chain) this._necklace();
    if ('toque' in P) P.toque = this.toque.visible;
    this.gloves?.update();
    P.headCentre(this.hc);
    poseStars(this.stars, this.hc, P.daze, this.time);
    this._eyes();
    this._hat();
  }

  _eyes() {
    const ey = this.info.eyes, body = this.body, P = this.puppet;
    const part = body.parts.find((q) => q.name === (ey.part || 'head'));
    const R = this.soft.cloudR[part.cloud] || this.soft.cloudR[0];
    const up = this._U.set(R[1], R[4], R[7]);
    const Pp = this._P, N = this._N, X = this._X, Gz = this._Gz;
    this.eyePos = [];
    for (const e of this.eyes) {
      body.surfacePoint(part.name, 0.5 + e.userData.side * ey.u, ey.v, Pp, N);
      e.position.copy(Pp).addScaledVector(N, ey.lift);
      const gaze = P.gaze;
      if (gaze) {
        Gz.set(...gaze.at).sub(e.position).normalize();
        Gz.addScaledVector(N, -Gz.dot(N));
        e.position.addScaledVector(Gz, 0.045 * gaze.amount);
        N.addScaledVector(Gz, 0.6 * gaze.amount).normalize();
      }
      X.crossVectors(up, N).normalize();
      const Y = new THREE.Vector3().crossVectors(N, X);
      this._M.makeBasis(X, Y, N);
      e.quaternion.setFromRotationMatrix(this._M);
      e.scale.set(...ey.scale);
      this.eyePos.push({ p: e.position.clone(), n: N.clone(), q: e.quaternion.clone() });
    }
    // the monocle over the eye nearer the camera (not for the two whose
    // evil twins have their own looks: the rudo's mask, the bandit's)
    if (this.monocle.visible && !this.monocleOK) this.monocle.visible = false;
    if (this.monocle.visible) {
      const w0 = this.eyes[0].getWorldPosition(new THREE.Vector3()), w1 = this.eyes[1].getWorldPosition(new THREE.Vector3());
      const k = w0.z > w1.z ? 0 : 1, E = this.eyePos[k];
      this.monocle.position.copy(E.p).addScaledVector(E.n, 0.06);
      this.monocle.quaternion.copy(E.q);
      const r = Math.max(ey.scale[0], ey.scale[1]) * 1.25;
      this.monocle.scale.setScalar(r);
    }
  }

  /* the gold chain round his neck, carried by the body's own frame */
  _necklace() {
    const P = this.puppet, c = this.chain.userData.c, R = this.soft.cloudR[0];
    const w = P.worldOf(c);
    this.chain.position.set(w[0], w[1], w[2]);
    this._M.set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1);
    this.chain.quaternion.setFromRotationMatrix(this._M);
  }

  /* the toque sits on the crown of the head, tipped with it */
  _hat() {
    if (!this.toque.visible) return;
    const soft = this.soft, x = soft.x;
    const ix = this.puppet.cfg?.core || this.rig.head;
    let cx = 0, cy = 0, cz = 0, top = -1e9;
    for (const i of ix) { cx += x[i * 3]; cy += x[i * 3 + 1]; cz += x[i * 3 + 2]; }
    cx /= ix.length; cy /= ix.length; cz /= ix.length;
    for (const i of ix) top = Math.max(top, x[i * 3 + 1] + soft.r[i]);
    const head = this.rig.parts.find((p) => p.name === 'head');
    const hr = head ? Math.max(head.r[0], head.r[2]) : 0.6;
    const cloud = head ? head.cloud : 0;
    const R = soft.cloudR[cloud] || soft.cloudR[0];
    this.toque.position.set(cx + R[1] * (top - cy) * 0.78, cy + R[4] * (top - cy) * 0.78, cz + R[7] * (top - cy) * 0.78);
    this._M.set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1);
    this.toque.quaternion.setFromRotationMatrix(this._M);
    this.toque.scale.setScalar(hr * 1.05);
  }

  /* back to the mark for a new round */
  reset() {
    this.soft.reset();
    this.puppet.reset?.();
    this.puppet.fallen = 0;
    if (this.puppet.balanceK !== undefined && this.puppet.balanceK === 0) this.puppet.balanceK = 0.011;
    this.deflate = 0;
    this.deflateTarget = 0;
    this._spin = 0;
    this.group.rotation.z = 0;
    this.group.visible = true;
    for (let i = 0; i < 40; i++) this.soft.advance(1 / 120, (h) => this.puppet.update(h), (h) => { this.body.update(h); this.cloth?.update(h); });
  }

  dispose(scene) {
    scene.remove(this.group);
    this.body.dispose?.();
    this.cloth?.dispose?.();
  }
}
