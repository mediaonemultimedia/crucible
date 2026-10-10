/* The pandas' ring: the dohyo's rope (tawara) — a fat twist of straw-
   coloured felt lying on the floor round the ring — and the dust a stomp
   puffs up off the clay. Same hand lighting as the other props.          */

import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, normalWorld, normalize, uniform, mx_noise_float, positionLocal, sin, atan, mix, smoothstep, fract } from 'three/tsl';
import { shade } from './props.js';

export function makeRope(R) {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    const p = positionLocal;
    // the twist: bands winding round the rope as it goes round the ring
    const a = atan(p.x, p.z).mul(R * 3.2);
    const around = atan(p.y, p.x.mul(p.x).add(p.z.mul(p.z)).sqrt().sub(R));
    const tw = fract(a.add(around.mul(0.9)).div(Math.PI));
    const band = smoothstep(0.0, 0.18, tw).mul(smoothstep(1.0, 0.8, tw));
    const straw = mix(vec3(0.62, 0.52, 0.32), vec3(0.8, 0.7, 0.47), band).mul(mx_noise_float(vec3(p.mul(30))).mul(0.06).add(0.97));
    return vec4(shade(straw, N, { spec: 0.05, power: 10, wrap: 0.6 }), 1);
  })();
  const m = new THREE.Mesh(new THREE.TorusGeometry(R, 0.13, 14, 160).rotateX(Math.PI / 2), mat);
  m.position.y = 0.09;
  m.scale.y = 0.75;
  m.frustumCulled = false;
  m.visible = false;
  return m;
}

/* a pool of soft puffs: each grows, drifts up and out, and fades */
export function makeDust() {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(1, 14, 10);
  g.userData.puffs = [];
  for (let k = 0; k < 24; k++) {
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    const fade = uniform(0);
    mat.colorNode = Fn(() => vec4(shade(vec3(0.82, 0.72, 0.58), normalize(normalWorld), { wrap: 0.9 }), fade))();
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.frustumCulled = false;
    m.userData = { fade, life: 0, v: new THREE.Vector3() };
    g.add(m);
    g.userData.puffs.push(m);
  }
  g.userData.next = 0;
  return g;
}

export function puffDust(g, at, strength = 1) {
  const P = g.userData.puffs;
  for (let k = 0; k < 6; k++) {
    const m = P[g.userData.next++ % P.length];
    const a = (k / 6) * Math.PI * 2 + Math.random() * 0.6;
    m.position.set(at[0] + Math.cos(a) * 0.25, 0.08, at[2] + Math.sin(a) * 0.25);
    m.userData.v.set(Math.cos(a) * (0.7 + Math.random() * 0.5) * strength, 0.25 + Math.random() * 0.25, Math.sin(a) * (0.7 + Math.random() * 0.5) * strength);
    m.userData.life = 1;
    m.visible = true;
  }
}

export function poseDust(g, dt) {
  for (const m of g.userData.puffs) {
    const u = m.userData;
    if (u.life <= 0) { m.visible = false; continue; }
    u.life = Math.max(0, u.life - dt / 0.9);
    m.position.addScaledVector(u.v, dt);
    u.v.multiplyScalar(Math.exp(-3 * dt));
    const s = 0.1 + (1 - u.life) * 0.32;
    m.scale.set(s, s * 0.7, s);
    u.fade.value = 0.5 * u.life * u.life;
  }
}
