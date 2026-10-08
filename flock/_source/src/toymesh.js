/* The toys, dressed: a feather on a string tied to a little wooden wand, a
   ball of wound yarn trailing a loose end, a felt carrot on a stick. Same
   material language as the plush and the stick — soft wrap-lit felt with a
   fine fuzz, wood with a grain — and no textures: every pattern is a few
   lines of shader. toys.js does the physics; this only follows it.        */

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, float, vec2, vec3, vec4, positionLocal, positionWorld, normalWorld, cameraPosition, uv,
  mix, smoothstep, clamp, normalize, dot, pow, abs, fract, sin, Discard, mx_noise_float,
} from 'three/tsl';
import { KEY } from './fur.js';

const L = vec3(KEY.x, KEY.y, KEY.z);

/* wrap-lit felt: a soft diffuse, a fuzzy rim, a fine noise in the fibres */
function shade(base, N, fuzzScale = 70) {
  const V = normalize(cameraPosition.sub(positionWorld));
  const wrap = clamp(dot(N, L).mul(0.5).add(0.5), 0, 1);
  const sky = mix(vec3(0.78, 0.72, 0.66), vec3(1.0, 0.98, 0.95), N.y.mul(0.5).add(0.5)).mul(0.3);
  const fuzz = mx_noise_float(positionLocal.mul(fuzzScale)).mul(0.07).add(1);
  const rim = pow(float(1).sub(abs(dot(N, V))), float(2.5)).mul(0.22);
  return base.mul(wrap.mul(0.78).add(0.18).add(sky)).mul(fuzz).add(base.mul(1.2).add(0.12).mul(rim));
}

function feltMaterial(color, extra) {
  const mat = new THREE.MeshBasicNodeMaterial();
  const c = uniform(new THREE.Color(color));
  mat.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    const base = extra ? extra(vec3(c)) : vec3(c);
    return vec4(shade(base, N), 1);
  })();
  return mat;
}

function woodMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    const y = positionLocal.y;
    const ang = positionLocal.x.mul(3.1).add(positionLocal.z.mul(2.3));
    const grain = sin(y.mul(46).add(mx_noise_float(vec3(y.mul(3), ang, 0)).mul(5))).mul(0.5).add(0.5);
    const wood = mix(vec3(0.62, 0.45, 0.29), vec3(0.73, 0.56, 0.38), grain);
    const ndl = clamp(dot(N, L).mul(0.6).add(0.45), 0, 1);
    return vec4(wood.mul(ndl.add(0.25)), 1);
  })();
  return mat;
}

/* a unit cylinder posed between two points */
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function rod(mesh, a, b, r) {
  _a.set(a[0], a[1], a[2]); _b.set(b[0], b[1], b[2]);
  mesh.position.copy(_a).add(_b).multiplyScalar(0.5);
  const d = _b.sub(_a);
  const len = d.length() || 1e-4;
  mesh.quaternion.setFromUnitVectors(_up, d.multiplyScalar(1 / len));
  mesh.scale.set(r, len, r);
}

/* ── feather on a string ──────────────────────────────────────────────────── */

function makeFeather(rope) {
  const g = new THREE.Group();
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 12, 1);
  const wand = new THREE.Mesh(cyl, woodMaterial());
  const thread = feltMaterial('#3a302b');
  const segs = [];
  for (let k = 0; k < rope; k++) { const m = new THREE.Mesh(cyl, thread); segs.push(m); g.add(m); }
  // the vane: a plane cut to a feather's outline in the shader, fine barbs
  // angled off a pale shaft, white at the quill to a dusky rose at the tip
  const vaneGeo = new THREE.PlaneGeometry(1, 1, 1, 12).translate(0, -0.5, 0);
  const vaneMat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  vaneMat.colorNode = Fn(() => {
    const t = uv().y.oneMinus();                       // 0 at the quill, 1 at the tip
    const s = uv().x.sub(0.5).mul(2);                  // −1 … 1 across
    const width = pow(sin(t.mul(Math.PI * 0.92).add(0.08)), float(0.7)).mul(smoothstep(0.0, 0.1, t));
    const barbs = fract(t.mul(34).add(abs(s).mul(5)).add(mx_noise_float(vec3(t.mul(9), s.mul(3), 1)).mul(0.6)));
    const fray = mx_noise_float(vec3(t.mul(16), s.mul(2), 3)).mul(0.14);
    Discard(abs(s).greaterThan(width.add(fray).mul(0.98)));
    Discard(barbs.lessThan(0.12).and(abs(s).greaterThan(0.1)).and(t.greaterThan(0.08)));
    const shaft = smoothstep(0.07, 0.02, abs(s));
    const col = mix(vec3(0.97, 0.95, 0.92), vec3(0.2, 0.62, 0.66), smoothstep(0.2, 0.85, t)).toVar();
    col.assign(mix(col, vec3(0.99, 0.97, 0.93), shaft));
    col.mulAssign(barbs.mul(0.12).add(0.9));
    // a fluffy base: the downy barbs near the quill are paler and looser
    const N = normalize(normalWorld);
    const lit = abs(dot(N, L)).mul(0.55).add(0.55);
    return vec4(col.mul(lit), 1);
  })();
  const vane = new THREE.Mesh(vaneGeo, vaneMat);
  const quill = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), feltMaterial('#e9d3b4'));
  g.add(wand, vane, quill);
  return {
    group: g,
    update(t, now) {
      rod(wand, t.handle(), t.top, 0.035);
      const P = t.pts;
      for (let k = 0; k < rope; k++) rod(segs[k], [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]], [P[k * 3 + 3], P[k * 3 + 4], P[k * 3 + 5]], 0.011);
      const e = rope * 3, f = [P[e], P[e + 1], P[e + 2]];
      // the feather hangs on along the rope's last run, turning lazily
      _a.set(P[e] - P[e - 3], P[e + 1] - P[e - 2], P[e + 2] - P[e - 1]);
      if (_a.lengthSq() < 1e-8) _a.set(0, -1, 0);
      _a.normalize();
      vane.position.set(f[0], f[1], f[2]);
      vane.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), _a);
      vane.rotateY(Math.sin(now * 1.3) * 0.9 + now * 0.4);
      vane.scale.set(0.46, 0.9, 1);
      quill.position.set(f[0], f[1], f[2]);
      quill.scale.setScalar(0.045);
    },
  };
}

/* ── ball of yarn ──────────────────────────────────────────────────────────── */

function makeYarn(r) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicNodeMaterial();
  const col = uniform(new THREE.Color('#c4474f'));
  mat.colorNode = Fn(() => {
    const p = normalize(positionLocal);
    // three windings, each a set of strands circling its own axis; noise
    // decides which winding lies on top where
    const w1 = sin(dot(p, vec3(0.0, 0.94, 0.34)).mul(64).add(mx_noise_float(p.mul(4)).mul(1.5)));
    const w2 = sin(dot(p, vec3(0.86, -0.3, 0.41)).mul(64).add(mx_noise_float(p.mul(4).add(7)).mul(1.5)));
    const w3 = sin(dot(p, vec3(-0.45, -0.2, 0.87)).mul(64).add(mx_noise_float(p.mul(4).add(13)).mul(1.5)));
    const n1 = mx_noise_float(p.mul(2.2).add(vec3(3, 1, 2)));
    const n2 = mx_noise_float(p.mul(2.2).add(vec3(9, 4, 6)));
    const strand = mix(mix(w1, w2, smoothstep(-0.1, 0.1, n1)), w3, smoothstep(-0.05, 0.15, n2));
    const groove = smoothstep(-1, 0.4, strand);
    const ply = sin(dot(p, vec3(1.7, 2.3, -1.1)).mul(300)).mul(0.04);
    const base = vec3(col).mul(groove.mul(0.5).add(0.55).add(ply));
    const N = normalize(normalWorld);
    return vec4(shade(base, N, 160), 1);
  })();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
  // the loose end trails on the floor behind the way it last rolled
  const strandMat = feltMaterial('#b8404a');
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.55, -0.85), new THREE.Vector3(0.1, -0.95, -1.25), new THREE.Vector3(0.35, -0.98, -1.9),
    new THREE.Vector3(0.1, -0.98, -2.5), new THREE.Vector3(-0.3, -0.98, -2.9),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.05, 6, false), strandMat);
  g.add(ball, tail);
  let heading = 0;
  return {
    group: g,
    update(t) {
      ball.position.set(...t.x);
      ball.quaternion.set(...t.q);
      ball.scale.setScalar(r);
      const sp = Math.hypot(t.v[0], t.v[2]);
      if (sp > 0.3) {
        const want = Math.atan2(t.v[0], t.v[2]);
        let d = want - heading;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        heading += d * 0.08;
      }
      tail.position.set(t.x[0], t.x[1], t.x[2]);
      tail.rotation.set(0, heading, 0);
      tail.scale.setScalar(r);
      // lifted off the floor, the end hangs instead of lying there
      tail.visible = t.x[1] < r + 0.25;
    },
  };
}

/* ── carrot on a stick ─────────────────────────────────────────────────────── */

function carrotProfile(len) {
  // the felt carrot, top (y = 0) to tip (y = −len of a whole 0.9); bitten,
  // it ends in a flat cut
  const pts = [new THREE.Vector2(0.0001, 0.02)];
  const full = 0.9, n = 18;
  for (let k = 0; k <= n; k++) {
    const s = (k / n) * len;
    const r = 0.135 * Math.pow(Math.max(0, 1 - s / full), 0.75) * (1 + 0.04 * Math.sin(s * 40)) + 0.012;
    pts.push(new THREE.Vector2(r, -s));
  }
  if (len < full - 1e-3) pts.push(new THREE.Vector2(0.0001, -len));
  else pts.push(new THREE.Vector2(0.0001, -len - 0.02));
  return pts;
}

function makeCarrot() {
  const g = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 12, 1), woodMaterial());
  const body = new THREE.Group();
  const lenU = uniform(0.9);
  const carrotMat = new THREE.MeshBasicNodeMaterial();
  carrotMat.colorNode = Fn(() => {
    const y = positionLocal.y;
    const orange = vec3(0.93, 0.42, 0.12).toVar();
    // felt rings round the root, and a paler, juicy cut where it's been bitten
    const ring = smoothstep(0.75, 1.0, sin(y.mul(48).add(mx_noise_float(positionLocal.mul(12)).mul(1.2))));
    orange.mulAssign(float(1).sub(ring.mul(0.14)));
    const cut = smoothstep(lenU.negate().add(0.012), lenU.negate(), y).mul(float(lenU).lessThan(0.88).select(float(1), float(0)));
    const core = smoothstep(0.05, 0.02, vec2(positionLocal.x, positionLocal.z).length());
    const face = mix(vec3(1.0, 0.62, 0.3), vec3(1.0, 0.75, 0.42), core);
    const N = normalize(normalWorld);
    return vec4(shade(mix(orange, face, cut), N, 90), 1);
  })();
  let geo = new THREE.LatheGeometry(carrotProfile(0.9), 24);
  const carrot = new THREE.Mesh(geo, carrotMat);
  const leafMat = feltMaterial('#5d9a43');
  const leafGeo = new THREE.SphereGeometry(1, 16, 10);
  const leaves = [];
  for (let k = 0; k < 4; k++) {
    const m = new THREE.Mesh(leafGeo, leafMat);
    const a = k * Math.PI / 2 + 0.4;
    m.position.set(Math.sin(a) * 0.08, 0.13, Math.cos(a) * 0.08);
    m.rotation.set(Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7);
    m.scale.set(0.045, 0.17, 0.02);
    leaves.push(m);
    body.add(m);
  }
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 8, 20).rotateX(Math.PI / 2), feltMaterial('#d8c8a8'));
  tie.position.y = 0.04;
  body.add(carrot, tie);
  g.add(stick, body);
  let shownLen = 0.9;
  return {
    group: g,
    update(t) {
      rod(stick, t.base, t.handle(), 0.032);
      body.position.set(...t.base);
      _a.set(...t.dir);
      body.quaternion.setFromUnitVectors(_up, _a);
      if (Math.abs(t.len - shownLen) > 1e-4) {
        shownLen = t.len;
        geo.dispose();
        geo = new THREE.LatheGeometry(carrotProfile(t.len), 24);
        carrot.geometry = geo;
        lenU.value = t.len;
      }
    },
    dispose() { geo.dispose(); },
  };
}

/* one view per toy kind, built on first use; only the live one is shown */
export class ToyView {
  constructor(scene, rope) {
    this.scene = scene;
    this.views = {};
    this.rope = rope;
  }

  _get(kind) {
    if (!this.views[kind]) {
      const v = kind === 'feather' ? makeFeather(this.rope) : kind === 'yarn' ? makeYarn(0.3) : makeCarrot();
      v.group.visible = false;
      this.scene.add(v.group);
      this.views[kind] = v;
    }
    return this.views[kind];
  }

  update(play, now) {
    const t = play?.toy;
    for (const [k, v] of Object.entries(this.views)) if (!t || k !== t.kind) v.group.visible = false;
    if (!t) return;
    const v = this._get(t.kind);
    v.group.visible = true;
    v.update(t, now);
  }

  /* points for the floor's soft shadow: [x, y, z, r] */
  shadows(play) {
    const t = play?.toy;
    if (!t) return [];
    if (t.kind === 'yarn') return [[...t.x, t.r]];
    if (t.kind === 'feather') {
      const out = [];
      for (let k = 0; k < t.pts.length / 3; k++) out.push([t.pts[k * 3], t.pts[k * 3 + 1], t.pts[k * 3 + 2], k === t.pts.length / 3 - 1 ? 0.14 : 0.02]);
      return out;
    }
    const tip = t.tip(), out = [];
    for (let k = 0; k <= 4; k++) { const u = k / 4; out.push([t.base[0] + (tip[0] - t.base[0]) * u, t.base[1] + (tip[1] - t.base[1]) * u, t.base[2] + (tip[2] - t.base[2]) * u, 0.12 * (1 - u * 0.7)]); }
    return out;
  }
}
