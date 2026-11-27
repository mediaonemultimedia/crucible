/* One racer on screen: a kart (render/karts.js) with its fighter seated in
   it — the PF2 plush itself (same rig, fur, faces, accessories and twins,
   render/plush.js), but LIGHT for racing:

   - the soft body is settled once and then FROZEN: no per-frame soft-body
     step, no cloth or fur sim, no trail. It's only woken for a pose (the
     trick's taunt, a hit, the podium), for as long as the pose lasts, and
     only when the camera is near enough to see it;
   - fewer fur shells (LOD 0: 14, LOD 1 past ~35 units: 5) — the shells are
     instanced, so this is just the draw's instance count;
   - the idle and the steer-lean are a tiny rig on the group: a breathing
     bob, a lean into the turn, a squash on landings, a wobble when hit.

   The kart's wheels spin and steer, the body rolls and pitches, and each
   kart's own bits move (the lowrider's hydraulics, the washtub's paddling
   tentacles, the resurfacer's roller, the disco ball).                  */

import { SPIN_RECOVER } from '../race/sim.js';
import * as THREE from 'three/webgpu';
import { createRaceRemesh } from './race-remesh.js';
import { Plush } from './plush.js';
import { buildKart } from './karts.js';
import { mat, rbox } from './geo.js';
import { buildLookdevKart, driverStances } from './lookdev-karts.js';

const previewKarts = typeof LOOKDEV_RACE !== 'undefined' && LOOKDEV_RACE;
import { KEY, FILL } from '../../shared/grommet/fur.js';
import { RACERS, WALLOPS } from '../race/roster.js';
import { stepSpring } from '../../shared/grommet/spring.js';

export const SHELLS_NEAR = 12, SHELLS_FAR = 5;
const still = (id, act = 'idle') => ({ id, act, face: 1, fx: 0, fz: 1024, x: 0, y: 0, z: 0, t: 0, mv: '', back: 0, down: 0, kr: 0, kb: 0, air: 0, vy: 0 });

export class Driver {
  constructor(scene, id, evil) {
    const p = (this.p = new Plush(scene, id, { evil }));
    p.monocle.visible = false; p.toque.visible = false;
    p.group.removeFromParent();
    p.trail.mesh?.removeFromParent?.();
    this.id = id;
    this.F = still(id);
    this.root = new THREE.Group();
    this.root.add(p.group);
    this.awake = 0; this.actT = 0;
    for (let i = 0; i < 12; i++) p.update(1 / 60, this.F, this.F, [0, 0, 0], [0, 0, 3], false);
    this.shells = 0;
    this.setShells(SHELLS_NEAR);
  }

  setShells(n) {
    if (this.shells === n) return;
    this.shells = n;
    this.p.body.geometry.instanceCount = n;
    const U = this.p.fur.uniforms;
    U.shells.value = n;
    // a velvet base under a soft fuzz (race LOD): no strand speckle at distance
    U.solid.value = n >= SHELLS_NEAR ? 0.5 : 0.85;
    U.rootLift.value = n >= SHELLS_NEAR ? 0.3 : 0.45;
  }

  /* wake the soft body for a pose: 'win' (the taunt / podium), 'hitstun', 'jump', 'lose' */
  pose(act, secs) {
    this.F.act = act; this.F.t = 0; this.actT = secs; this.awake = Math.max(this.awake, secs + 0.7);
  }

  /* the plush's hand light follows the camera (its key was set up in view space in PF2) */
  light(camQ) {
    const U = this.p.fur.uniforms;
    U.key.value.copy(KEY).applyQuaternion(camQ);
    U.fill.value.copy(FILL).applyQuaternion(camQ);
  }

  /* `half`: the soft body steps every other frame (30 Hz, twice the dt) */
  update(dt, near, half = false) {
    if (this.awake <= 0) return false;
    this.awake -= dt;
    if (this.actT > 0) { this.actT -= dt; if (this.actT <= 0) { this.F.act = 'idle'; this.F.t = 0; } }
    this.F.t++;
    if (!near) return false;
    this._acc = (this._acc || 0) + dt;
    if (half && (this._flip = !this._flip)) return false;
    this.p.update(Math.min(this._acc, 1 / 20), this.F, this.F, [0, 0, 0], [0, 0, 3], false);
    this._acc = 0;
    return true;
  }

  displayFace(enabled, time) {
    if (!enabled && !this.faceWasShown) return;
    this.faceWasShown = enabled;
    const p = this.p;
    if (enabled && !this.faceDots) {
      const dot = new THREE.SphereGeometry(1, 10, 7);
      const shine = new THREE.MeshBasicMaterial({ color: '#fff2dd', toneMapped: false });
      this.faceDots = p.eyes.map(eye => {
        const bright = new THREE.Mesh(dot, shine);
        const tiny = new THREE.Mesh(dot, shine);
        bright.position.set(-0.25, 0.32, 0.93); bright.scale.set(0.21, 0.18, 0.07);
        tiny.position.set(0.28, 0.01, 0.96); tiny.scale.set(0.085, 0.085, 0.05);
        eye.add(bright, tiny);
        return [bright, tiny];
      });
    }
    // A pair of soft vinyl cheek patches on the three pale/spotted faces.
    if (enabled && !this.faceCheeks && ['kevalanche', 'johnny', 'rubberta'].includes(this.id)) {
      const geo = new THREE.SphereGeometry(1, 14, 8);
      const tint = new THREE.MeshBasicMaterial({ color: this.id === 'rubberta' ? '#ffa199' : '#f49a9f', transparent: true, opacity: 0.68, depthWrite: false });
      const P = new THREE.Vector3(), N = new THREE.Vector3(), Z = new THREE.Vector3(0, 0, 1);
      const ey = p.info.eyes;
      this.faceCheeks = [-1, 1].map(side => {
        const cheek = new THREE.Mesh(geo, tint);
        p.body.surfacePoint(ey.part || 'head', 0.5 + side * ey.u * 1.65, ey.v + 0.078, P, N);
        cheek.position.copy(P).addScaledVector(N, 0.045);
        cheek.quaternion.setFromUnitVectors(Z, N.normalize());
        cheek.scale.set(ey.scale[0] * 0.54, ey.scale[1] * 0.27, 0.035);
        p.group.add(cheek);
        return cheek;
      });
    }
    this.faceCheeks?.forEach(cheek => { cheek.visible = enabled; });
    const blinkPhase = time % 4.8;
    const blink = enabled && blinkPhase > 4.54 ? Math.sin((blinkPhase - 4.54) / 0.26 * Math.PI) ** 2 : 0;
    p.eyes.forEach((eye, i) => {
      const [x, y, z] = p.info.eyes.scale;
      eye.scale.set(x * (enabled ? 1.08 : 1), y * (enabled ? 1.14 - 0.97 * blink : 1), z);
      this.faceDots?.[i].forEach(dot => { dot.visible = enabled && blink < 0.6; });
    });
    p.eyeGlow?.forEach(glow => { glow.visible = !(enabled && (blink > 0.5 || this.id === 'zach')); });
  }

  dispose(scene) {
    const dot = this.faceDots?.[0][0];
    if (dot) { dot.geometry.dispose(); dot.material.dispose(); }
    const cheek = this.faceCheeks?.[0];
    if (cheek) { cheek.geometry.dispose(); cheek.material.dispose(); }
    this.p.dispose(scene);
  }
}

export class RacerView {
  constructor(scene, id, alt) {
    const R = RACERS[id];
    this.id = id; this.alt = alt;
    const original = buildKart(R.kart, alt);
    this.kart = previewKarts ? buildLookdevKart(R.kart, alt, original, { animateWheels: true }) : original;
    if (previewKarts) {
      const geometries = new Set();
      original.group.traverse((object) => { if (object.isMesh) geometries.add(object.geometry); });
      geometries.forEach((geometry) => geometry.dispose());
    }
    this.group = this.kart.group;
    this.driver = new Driver(scene, id, alt);
    const P = this.kart.plush;
    const d = this.driver.root;
    d.scale.setScalar(P.scale);
    d.position.set(0, P.y, P.z);
    this.kart.seat.add(d);
    if (previewKarts) driverStances(this.driver, this.kart.body)(true);
    scene.add(this.group);
    this.t = Math.random() * 10;
    this.lean = 0; this.pitch = 0; this.roll = 0; this.bob = 0; this.squash = 0; this.squashV = 0;
    this.spin = 0; this.hyd = 0; this.lod = 0; this.wheelA = 0;
  }

  setRaceMesh(style) {
    const p = this.driver.p;
    if (!style) {
      if (this.raceMesh) Object.assign(p.shells, { geometry: p.body.geometry, material: p.fur.material });
      return;
    }
    this.raceMesh ??= createRaceRemesh(p, style);
    Object.assign(p.shells, this.raceMesh);
  }

  setLod(l) {
    if (this.lod === l) return;
    this.lod = l;
    this.driver.setShells(l ? RacerView.shellsFar : RacerView.shellsNear);
    for (const o of this.kart.detail) o.visible = !l;
  }

  hit() { this.squashV -= 6; this.driver.pose('hitstun', 0.5); }
  /* the spring cushion: the plush is launched high out of its seat, flails, and drops back in */
  eject(secs) { this.ejT = secs; this.ejLen = secs; this.driver.pose('hitstun', secs); }
  land(h) { this.squashV -= 3 + h * 6; }
  /* the showy pose: the plush stands up in its seat and spins once round
     (a rig-level pose every racer gets; the player's own also wakes its
     soft body for the arms-up taunt) */
  taunt(air) { this.driver.pose(air ? 'jump' : 'win', air ? 0.75 : 1.4); if (this.kart.parts.hydraulics && !air) this.hyd = 1.1; if (air) this.trickT = 0.75; this.showT = air ? 0.75 : 1.2; this.showLen = this.showT; }

  wallop(windup) {
    this.swipeT = 0;
    this.swipeWindup = windup;
    const pose = WALLOPS[this.id].pose;
    if (pose === 'headbutt' || this.strike) return;
    const pink = this.alt ? '#bc83ff' : '#ff81a6';
    const geo = pose === 'punch' ? rbox(0.86, 0.65, 1.05, 0.28, 2)
      : new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
        new THREE.Vector3(), new THREE.Vector3(.55, .14, .15),
        new THREE.Vector3(.97, .21, .69), new THREE.Vector3(.64, .29, 1.13),
      ]), 8, this.id === 'rubberta' ? .18 : .12, 5, false);
    const color = pose === 'punch' ? this.id === 'kevalanche' ? '#e92749' : '#ffb647'
      : this.id === 'zach' ? this.alt ? '#c0d7f1' : '#555083' : pink;
    this.strike = new THREE.Mesh(geo, mat(color, { roughness: 0.68 }));
    this.strike.visible = false;
    this.kart.seat.add(this.strike);
  }

  /* place it from the sim's kart K (interpolated pose passed in) */
  update(dt, K, pose, camPos, camQ) {
    const g = this.group, B = this.kart.body;
    this.t += dt;
    g.position.set(pose.x, pose.y, pose.z);
    // shrunk in the hot wash (60 %), squashed flat by a full-size kart (a pancake)
    const sWant = (K.shrinkT > 0 ? 0.6 : 1);
    this.size = (this.size ?? 1) + (sWant - (this.size ?? 1)) * Math.min(1, dt * 7);
    const flat = K.flatT > 0 ? Math.min(1, K.flatT * 4) : 0;
    this.flat = (this.flat || 0) + (flat - (this.flat || 0)) * Math.min(1, dt * 18);
    g.scale.set(this.size * (1 + this.flat * 0.35), this.size * (1 - this.flat * 0.72), this.size * (1 + this.flat * 0.35));
    // drift: the body swings into the slide (the sim's heading is the motion's)
    const driftA = K.drift ? K.drift * -0.42 : 0;
    this.driftA = (this.driftA || 0) + (driftA - (this.driftA || 0)) * Math.min(1, dt * 9);
    // the spin-out
    if (K.spinT >= SPIN_RECOVER) {
      const angle = this.spin + dt * 13 * K.spinDir;
      this.spin = Math.atan2(Math.sin(angle), Math.cos(angle));
    } else if (K.spinT > 0) {
      this.spin *= Math.min(1, K.spinT / Math.max(K.spinT, this.spinLeft || SPIN_RECOVER));
    } else this.spin = 0;
    this.spinLeft = K.spinT;
    // the trick: a full barrel roll in the air
    let trickRoll = 0;
    if (this.trickT > 0) { this.trickT -= dt; trickRoll = (1 - Math.max(0, this.trickT) / 0.75) * Math.PI * 2; }
    g.rotation.set(0, pose.yaw + this.driftA + this.spin, 0);
    // Laundry Day's dryer drum: up the wall and round once, as the sim carries you through
    let drumRoll = 0;
    if (K.drum > 0) {
      const th = K.drum * Math.PI * 2, R = 5.4;
      drumRoll = th;
      g.position.y += R * (1 - Math.cos(th));
      g.position.x += Math.cos(pose.yaw) * Math.sin(th) * R * 0.9; g.position.z -= Math.sin(pose.yaw) * Math.sin(th) * R * 0.9;
    }
    // pitch with the slope / the vertical speed in the air; roll with the steer
    const pitchT = K.air ? Math.max(-0.5, Math.min(0.45, -K.vy * 0.025)) : Math.max(-0.4, Math.min(0.4, -(K.slopeVy || 0) / Math.max(6, Math.abs(K.fwd)) * 0.9));
    const speed = Math.min(1.4, Math.abs(K.fwd) / (K.S?.top || 30));
    const launchLean = this.racing && K.boostT > 0 && !K.air ? 0.095 : 0;
    this.pitch += (pitchT + launchLean - this.pitch) * Math.min(1, dt * 8);
    const rollT = (K.steer || 0) * speed * 0.175 + (K.drift ? -K.drift * 0.1 : 0);
    this.roll += (rollT - this.roll) * Math.min(1, dt * 7);
    // (dt-safe: ≤ 1/120 s substeps — one step per frame went unstable under ~12 fps, the
    // kart bouncing and squashing over and over; bounded to its drawn range)
    const ks = 320, SQ = this._sq || (this._sq = { x: 0, v: 0 });
    SQ.x = this.squash; SQ.v = this.squashV;
    stepSpring(SQ, 0, ks, 0.35, dt, -5, 5);
    this.squash = SQ.x; this.squashV = SQ.v;
    // the lowrider's hydraulics
    let hy = 0;
    if (this.hyd > 0) { this.hyd -= dt; hy = Math.abs(Math.sin(this.hyd * 11)) * 0.9 * Math.min(1, this.hyd); }
    const hop = K.hop > 0 ? Math.sin((K.hop / 0.18) * Math.PI) * 0.35 : 0;
    B.position.y = hy + hop + Math.sin(this.t * (8 + 4 * speed)) * 0.035 * speed;
    B.rotation.set(this.pitch + (hy ? Math.sin(this.hyd * 11) * 0.12 : 0), 0, this.roll + trickRoll + drumRoll);
    const sq = Math.max(-0.33, Math.min(0.22, this.squash * 0.10));
    B.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);

    // the plush in its seat: breathing, leaning into the steer, looking about
    const d = this.driver.root, P = this.kart.plush;
    d.position.y = P.y + (previewKarts ? 0 : Math.sin(this.t * 2.2) * 0.03);
    d.rotation.z = -(K.steer || 0) * 0.16 * Math.min(1, Math.abs(K.fwd) / 12) + (K.caseT > 0 || K.wobT > 0 ? Math.sin(this.t * 14) * 0.18 : 0);
    d.rotation.x = Math.max(-0.15, Math.min(0.2, (K.boostT > 0 ? -0.12 : 0) + this.pitch * 0.4));
    d.rotation.y = (K.steer || 0) * 0.25 + (K.spinT > 0 ? Math.sin(this.t * 20) * 0.3 : 0);
    if (previewKarts) d.rotation.set(0, 0, 0);
    if (K.lobby) {
      d.rotation.z += Math.sin(this.t * 1.75) * 0.065;
      d.rotation.y += Math.sin(this.t * 1.1) * 0.08;
    }
    if (this.swipeWindup) {
      this.swipeT += dt;
      const w = this.swipeWindup, recovers = this.swipeT - w;
      const pose = WALLOPS[this.id].pose;
      const wind = Math.min(1, this.swipeT / (w * 0.65));
      const load = recovers < 0 ? Math.sin(wind * Math.PI / 2) : 0;
      const power = recovers < 0 ? 0 : Math.max(0, 1 - recovers / 0.24) ** 2;
      if (load) {
        const [lift, back, pitch, yaw, lean] = WALLOP_WINDUP[this.id];
        d.position.y += lift * P.scale * load;
        d.rotation.x += pitch * load;
        d.rotation.y += yaw * load;
        d.rotation.z += lean * load;
        d.position.z = P.z - back * P.scale * load;
      }
      if (!load) d.position.z = P.z + power * (pose === 'headbutt' ? 0.6 : 0.32);
      d.rotation.x += power * (pose === 'headbutt' ? 0.42 : 0.19);
      d.rotation.y += power * (pose === 'sweep' ? 0.85 : pose === 'punch' ? -0.62 : 0);
      d.rotation.z += power * (pose === 'sweep' ? -0.29 : 0.05);
      if (this.strike) {
        this.strike.visible = (load > 0.28 || power > 0.18) && !K.fish;
        this.strike.position.set(P.scale * (pose === 'sweep' ? 0.15 : 0.68), P.y + P.scale * 1.06,
          P.z + P.scale * (0.56 + power * (pose === 'sweep' ? .44 : 1)));
        this.strike.rotation.y = pose === 'sweep' ? 0.58 - power * 1.4 : -0.16;
        if (load) {
          const [, , , yaw, lean] = WALLOP_WINDUP[this.id];
          this.strike.position.x += P.scale * lean * load;
          this.strike.position.y += P.scale * 0.48 * load;
          this.strike.position.z -= P.scale * (pose === 'punch' ? 0.72 : 0.38) * load;
          this.strike.rotation.y += yaw * load;
          this.strike.rotation.z = -lean * load;
        } else this.strike.rotation.z = 0;
        this.strike.scale.setScalar(P.scale * (0.8 + power * .54));
      }
      if (recovers > 0.24 || K.fish) this.swipeWindup = 0;
    } else d.position.z = P.z;
    if (this.showT > 0) {
      this.showT -= dt;
      const u = 1 - Math.max(0, this.showT) / this.showLen, up = Math.sin(Math.min(1, u * 1.3) * Math.PI);
      d.position.y += up * 0.55;
      d.rotation.y += (u < 0.75 ? u / 0.75 : 1) * Math.PI * 2;
      d.scale.setScalar(P.scale * (1 + up * 0.12));
    } else d.scale.setScalar(P.scale);
    // launched out of the seat: up high, flailing, and back down into it
    if (this.ejT > 0) {
      this.ejT = Math.max(0, this.ejT - dt);
      const u = 1 - this.ejT / this.ejLen, arc = 4 * u * (1 - u);
      d.position.y += arc * 9 + Math.sin(u * 40) * 0.1 * (1 - u);
      d.rotation.x += Math.sin(u * 23) * 0.9 * arc + u * Math.PI * 2;
      d.rotation.z += Math.sin(u * 31) * 0.7 * arc;
    }

    // wheels: roll with the speed; the front ones steer
    this.wheelA += (K.fwd * dt) / 0.45;
    for (const w of this.kart.wheels) {
      const spin = previewKarts ? this.wheelA * 0.45 / w.userData.r : this.wheelA;
      const steer = w.userData.front ? -(K.steer || 0) * 0.45 : 0;
      w.rotation.set(spin, steer, 0, 'YXZ');
    }
    const parts = this.kart.parts;
    if (parts.roller) parts.roller.rotation.x = this.wheelA * 1.5;
    if (parts.disco) parts.disco.rotation.y = this.t * 1.5;
    if (parts.flag) parts.flag.rotation.y = Math.sin(this.t * 6) * 0.25;
    if (parts.paddles && !this.lod) for (const p of parts.paddles) p.g.rotation.x = Math.sin(this.t * 9 + p.ph) * 0.7 * Math.min(1, 0.3 + Math.abs(K.fwd) / 20);

    // LOD by distance to the camera
    const dist = camPos.distanceTo(g.position);
    this.dist = dist;
    this.setLod(dist > RacerView.lodNear ? 1 : 0);
    this.driver.light(camQ);
    if (!previewKarts) this.driver.update(dt, dist < 45 && this.mayWake !== false, !!this.racing);
    this.driver.displayFace(Boolean(K.lobby), this.t);
    g.visible = dist < RacerView.farCull;
  }

  dispose(scene) {
    this.strike?.geometry.dispose();
    this.raceMesh?.geometry.dispose();
    this.raceMesh?.material.dispose();
    this.driver.dispose(scene);
    this.group.removeFromParent();
  }
}

// Lift, pullback, pitch, yaw and roll. Keep the silhouettes distinct
// even at the smaller chase-camera scale in four-player split.
const WALLOP_WINDUP = {
  kevalanche: [0.08, 0.55, -0.32, -0.68, -0.23], // shoulder and fist pull back
  sumaura: [-0.36, 0.45, 0.42, 0.05, 0],        // crouch and tuck chin
  k8e: [0.56, 0.32, -0.45, 0.07, 0.1],         // neck rears straight up
  sebas: [0.16, 0.35, -0.16, 0.48, -0.5],      // side cock
  rubberta: [0.18, 0.1, -0.1, 0.7, 0.48],       // winds tentacle out and high
  johnny: [0.42, 0.15, 0.12, 0.56, 0.25],       // high backswing
  zach: [0.38, 0.24, -0.14, -0.45, -0.52],     // wing flares out
};

/* the LOD distances; split screen lowers them (main.js) */
RacerView.lodNear = 26;
RacerView.farCull = 260;
RacerView.shellsNear = SHELLS_NEAR;
RacerView.shellsFar = SHELLS_FAR;
