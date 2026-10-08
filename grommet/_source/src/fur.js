/* Materials and set dressing: the shell fur, bead eyes, studio floor with its
   soft contact shadow, and the wooden stick.

   Fur is the body mesh drawn SHELLS times (instanced); shell 0 is the skin,
   each further shell is pushed out along the normal and bent by the groom
   lean, the fur-lag spring and gravity, then cut to strands in the fragment
   shader by a jittered cell pattern. Shading is Kajiya-Kay along the actual
   strand direction, plus a nap term so brushed patches read like velvet.

   Grommet adds a pattern atlas under the pile (the same uv as the groom and
   mask maps): R spots (a leopard's rosettes, in the spot colour), G the
   nose (its own colour), B a rosette's darker-gold heart. The fur still
   grows through it; only its colour changes, as in a printed plush.     */

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, attribute, float, vec2, vec3, vec4, texture, positionLocal, normalLocal,
  instanceIndex, cameraPosition, positionWorld, normalWorld, mix, smoothstep, clamp, normalize,
  dot, max, pow, sqrt, abs, fract, floor, sin, length, varying, Discard, mx_noise_float, reflect,
} from 'three/tsl';

export const SHELLS = 64;

export const KEY = new THREE.Vector3(-0.42, 0.86, 0.48).normalize();
export const FILL = new THREE.Vector3(0.7, 0.35, -0.45).normalize();

export const FUR_COLORS = {
  coral:  { fur: '#ef7a5f', under: '#f6dcc3' },
  lilac:  { fur: '#a596d8', under: '#ece4f6' },
  lagoon: { fur: '#3fa9a8', under: '#d9f0e8' },
  oat:    { fur: '#d6c2a0', under: '#f6efe2' },
};

const hash2 = (p) => fract(sin(dot(p, vec2(127.1, 311.7))).mul(43758.5453));

export function makeFurMaterial(groomTex, maskTex, patTex) {
  const U = {
    spot: uniform(new THREE.Color('#3a2a1e')),
    nose: uniform(new THREE.Color('#8a5a62')),
    shells: uniform(SHELLS),
    pile: uniform(0.11),
    density: uniform(95),
    color: uniform(new THREE.Color(FUR_COLORS.coral.fur)),
    under: uniform(new THREE.Color(FUR_COLORS.coral.under)),
    accent: uniform(new THREE.Color(FUR_COLORS.coral.fur)),
    stitch: uniform(new THREE.Color().setRGB(0.16, 0.08, 0.07, THREE.LinearSRGBColorSpace)),
    key: uniform(KEY.clone()),
    fill: uniform(FILL.clone()),
    meshView: uniform(0),
  };

  const n = normalLocal;
  const tuP = attribute('tuP', 'vec4');
  const tvU = attribute('tvU', 'vec4');
  const uvfp = attribute('uvfp', 'vec4');
  const tu = tuP.xyz, press = tuP.w;
  const tv = tvU.xyz, underA = tvU.w;
  const uvA = uvfp.xy, fpA = uvfp.zw;
  const lag = attribute('lag', 'vec3');
  const look = attribute('look', 'vec4');
  const accentA = look.x, pileMul = look.y;

  const h = float(instanceIndex).div(U.shells.sub(1));
  const gV = texture(groomTex, uvA).level(0);
  const mV = texture(maskTex, uvA).level(0);
  const leanV = tu.mul(gV.r.mul(2).sub(1)).add(tv.mul(gV.g.mul(2).sub(1)));
  const ruffleV = gV.b;
  const pileLocal = U.pile.mul(mV.r).mul(float(1).sub(mV.b.mul(0.75))).mul(mix(float(1), float(0.72), underA)).mul(pileMul);
  const down = vec3(0, -1, 0);
  const gT = down.sub(n.mul(dot(n, down)));
  // how far the fibres bow over: lean from the groom, trailing lag, a little sag
  const bowV = leanV.mul(float(1).sub(ruffleV.mul(0.55))).mul(float(1).add(press.mul(0.9)))
    .add(lag).add(gT.mul(0.28));
  const lift = float(1).sub(press.mul(0.55)).mul(float(1).sub(length(leanV).mul(0.32))).mul(float(1).add(ruffleV.mul(0.25)));

  U.positionNode = positionLocal
    .add(n.mul(h.mul(pileLocal).mul(lift)))
    .add(bowV.mul(pileLocal).mul(pow(h, float(1.55))));

  // strand direction ≈ d(position)/dh — the axis Kajiya-Kay shades along
  const strandV = normalize(n.mul(lift).add(bowV.mul(pow(h.add(0.02), float(0.55)).mul(1.55))));

  const vH = varying(h);
  const vN = varying(n);
  const vS = varying(strandV);
  const vTu = varying(tu);
  const vTv = varying(tv);
  const vUnder = varying(underA);
  const vAccent = varying(accentA);
  const vFp = varying(fpA);
  const vUv = varying(uvA);
  const vPile = varying(mV.r.mul(float(1).sub(mV.b.mul(0.75))));

  const colorNode = Fn(() => {
    const g = texture(groomTex, vUv);
    const m = texture(maskTex, vUv);
    const ruffle = g.b;
    const lean = vTu.mul(g.r.mul(2).sub(1)).add(vTv.mul(g.g.mul(2).sub(1)));
    const hh = vH.toVar();

    // ── strand cut: two staggered jittered grids, warped where ruffled ──────
    const p0 = vFp.mul(U.density).toVar();
    const warp = vec2(
      mx_noise_float(vec3(p0.mul(0.21), 1.7)),
      mx_noise_float(vec3(p0.mul(0.21), 5.3)),
    ).mul(ruffle.mul(2.4).add(0.35)).mul(hh);
    const p = p0.add(warp);
    const strand = Fn(([q, salt]) => {
      const cell = floor(q);
      const f = fract(q);
      const o = vec2(hash2(cell.add(salt)), hash2(cell.add(salt).add(19.19))).mul(0.56).add(0.22);
      const top = hash2(cell.add(salt).add(7.7)).mul(0.42).add(0.58);
      const t = hh.div(top);
      const rad = mix(float(0.5), float(0.13), t);
      const inside = length(f.sub(o)).lessThan(rad).and(t.lessThan(1));
      return vec2(inside.select(float(1), float(0)), hash2(cell.add(salt).add(3.1)));
    });
    const sA = strand(p, float(0));
    const sB = strand(p.add(vec2(0.5, 0.37)), float(41));
    const hit = max(sA.x, sB.x);
    Discard(hh.greaterThan(0.001).and(hit.lessThan(0.5)).and(U.meshView.lessThan(0.5)));
    Discard(hh.greaterThan(vPile.add(0.02)).and(U.meshView.lessThan(0.5)));
    const strandRand = sA.x.greaterThan(0.5).select(sA.y, sB.y);

    // ── albedo ──────────────────────────────────────────────────────────────
    const he = clamp(hh.div(max(vPile, float(0.05))), 0, 1);
    const base = mix(mix(vec3(U.color), vec3(U.accent), vAccent), vec3(U.under), vUnder).toVar();
    const pt = texture(patTex, vUv);
    base.assign(mix(base, base.mul(vec3(0.84, 0.7, 0.52)), pt.b));            // rosette heart
    base.assign(mix(base, vec3(U.spot), pt.r));                                // spots
    base.assign(mix(base, vec3(U.nose), pt.g));                                // nose
    base.assign(mix(base, vec3(0.95, 0.42, 0.45), m.g.mul(0.7)));            // blush
    base.assign(mix(base, vec3(U.stitch), m.b));                               // stitching
    base.mulAssign(strandRand.mul(0.16).add(0.92));
    base.mulAssign(mix(float(0.5), float(1.0), pow(he, float(0.8))));          // dark roots
    base.assign(mix(base, base.mul(1.18).add(0.04), smoothstep(0.72, 1.0, he).mul(0.35))); // frosted tips

    // ── lighting ────────────────────────────────────────────────────────────
    const N = normalize(vN);
    const T = normalize(vS);
    const V = normalize(cameraPosition.sub(positionWorld));
    const L = U.key;
    const Hk = normalize(L.add(V));
    const ndl = dot(N, L);
    const wrap = clamp(ndl.mul(0.5).add(0.5), 0, 1);
    const tl = dot(T, L);
    const kk = sqrt(clamp(float(1).sub(tl.mul(tl)), 0, 1));
    const diff = wrap.mul(mix(float(1), kk, 0.45));
    const T1 = normalize(T.sub(N.mul(0.12)));
    const T2 = normalize(T.add(N.mul(0.16)));
    const th1 = dot(T1, Hk), th2 = dot(T2, Hk);
    const s1 = pow(sqrt(clamp(float(1).sub(th1.mul(th1)), 0, 1)), float(90));
    const s2 = pow(sqrt(clamp(float(1).sub(th2.mul(th2)), 0, 1)), float(22));
    const laid = clamp(length(lean), 0, 1);
    const specMask = smoothstep(-0.1, 0.35, ndl).mul(he).mul(float(1).sub(ruffle.mul(0.75)));
    const spec = s1.mul(0.22).add(laid.mul(0.12)).add(s2.mul(0.3).mul(base.r.add(0.3))).mul(specMask);

    // velvet: fibres pointing at the viewer show their cut ends (deep, matte);
    // fibres lying away show their sides (light, sheeny)
    const Vt = V.sub(N.mul(dot(N, V)));
    const nap = dot(lean, normalize(Vt.add(vec3(1e-5)))).mul(smoothstep(0.1, 0.6, laid));
    const napShade = float(1).sub(nap.mul(0.28)).sub(ruffle.mul(0.12));

    const fillL = clamp(dot(N, U.fill).mul(0.5).add(0.35), 0, 1).mul(0.32);
    const sky = mix(vec3(0.78, 0.72, 0.66), vec3(1.0, 0.98, 0.95), N.y.mul(0.5).add(0.5)).mul(0.36);
    const groundAO = mix(float(0.5), float(1), smoothstep(0.0, 0.85, positionWorld.y));
    const ao = mix(float(0.32), float(1), pow(he, float(0.7))).mul(groundAO);

    const rim = pow(float(1).sub(abs(dot(N, V))), float(3.5)).mul(he).mul(0.2);

    const lit = base.mul(diff.mul(vec3(1.0, 0.96, 0.9)).mul(1.05).add(vec3(fillL).mul(vec3(0.85, 0.9, 1.0))).add(sky)).mul(ao).mul(napShade)
      .add(vec3(spec).mul(vec3(1.0, 0.97, 0.92)))
      .add(base.mul(1.3).add(0.15).mul(rim));
    const meshCol = mix(base, vec3(0.2), 0.2).mul(wrap.mul(0.6).add(0.4));
    return vec4(mix(lit, meshCol, U.meshView), 1);
  });

  const mat = new THREE.MeshBasicNodeMaterial();
  mat.positionNode = U.positionNode;
  mat.colorNode = colorNode();
  mat.side = THREE.FrontSide;
  return { material: mat, uniforms: U };
}

/* face + pile mask, in the same atlas as the groom map:
   R pile multiplier, G blush, B stitch. One canvas, repainted per character
   (faces.js draws each face).                                              */
export function makeMaskTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.userData.ctx = c.getContext('2d');
  tex.userData.size = size;
  return tex;
}

export function makeGroomTexture(groom) {
  const t = new THREE.DataTexture(groom.bytes, groom.size, groom.size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.flipY = false;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

/* glossy black bead: the studio's window reflected as a soft box */
export function makeEyeMaterial() {
  const mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = Fn(() => {
    const N = normalize(normalWorld);
    const V = normalize(cameraPosition.sub(positionWorld));
    const R = reflect(V.negate(), N);
    const fres = pow(float(1).sub(clamp(dot(N, V), 0, 1)), float(3));
    const room = mix(vec3(0.55, 0.47, 0.4), vec3(0.95, 0.92, 0.88), smoothstep(-0.25, 0.35, R.y));
    const win = smoothstep(0.955, 0.975, dot(R, vec3(KEY.x, KEY.y, KEY.z)));
    const win2 = smoothstep(0.985, 0.993, dot(R, normalize(vec3(0.55, 0.6, 0.6)))).mul(0.5);
    const base = vec3(0.025, 0.02, 0.022).add(vec3(0.04, 0.03, 0.03).mul(smoothstep(0.2, 0.8, N.y.negate())));
    return vec4(base.add(room.mul(fres.mul(0.55).add(0.04))).add(vec3(win.mul(1.5))).add(vec3(win2)), 1);
  })();
  return mat;
}

/* floor: warm studio paper, soft vignette, contact shadow painted per frame,
   and the court: lines (R) and a faint tint for the playing area (G),
   painted once per athlete into a world-mapped canvas                   */
export const COURT = 14;   // the court canvas covers x, z ∈ [−COURT, COURT]
export class Floor {
  constructor() {
    const S = 256;
    this.extent = 7;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = S;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.court = document.createElement('canvas');
    this.court.width = this.court.height = 1024;
    this.courtTex = new THREE.CanvasTexture(this.court);
    this.courtTex.colorSpace = THREE.NoColorSpace;
    this.courtTex.anisotropy = 4;
    this.tint = uniform(new THREE.Color('#c9a07a'));
    const ext = this.extent;
    const mat = new THREE.MeshBasicNodeMaterial();
    const tex = this.tex, ctex = this.courtTex, tint = this.tint;
    const center = (this.center = uniform(new THREE.Vector2()));
    mat.colorNode = Fn(() => {
      const xz = vec2(positionWorld.x, positionWorld.z);
      const suv = xz.sub(center).div(ext * 2).add(0.5);
      const sh = texture(tex, vec2(suv.x, float(1).sub(suv.y))).a;
      const r = length(xz.sub(vec2(0, 0.8)));
      const paper = mix(vec3(0.925, 0.9, 0.865), vec3(0.83, 0.8, 0.765), smoothstep(2.5, 16, r)).toVar();
      const cuv = xz.div(COURT * 2).add(0.5);
      const ct = texture(ctex, vec2(cuv.x, float(1).sub(cuv.y)));
      paper.assign(mix(paper, mix(paper, vec3(tint), 0.5), ct.g.mul(smoothstep(16, 5, r))));
      paper.assign(mix(paper, vec3(0.975, 0.965, 0.945), ct.r.mul(0.9)));
      const grain = mx_noise_float(vec3(xz.mul(9), 0)).mul(0.012);
      return vec4(paper.add(grain).mul(float(1).sub(sh.mul(0.62))), 1);
    })();
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2), mat);
  }

  /* draw the court: fn(g, toPx) with toPx(x, z) → canvas pixels, and a
     scale (pixels per unit). Lines go in red, the tint in green.        */
  paintCourt(fn) {
    const g = this.court.getContext('2d'), S = this.court.width;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
    const k = S / (COURT * 2);
    g.globalCompositeOperation = 'lighter';
    fn(g, (x, z) => [(x + COURT) * k, (z + COURT) * k], k);
    this.courtTex.needsUpdate = true;
  }

  /* paint soft shadow blobs under every physics point (and the stick, and
     any toy: `extra` is [[x, y, z, r], …]) */
  paint(soft, stick, extra = []) {
    const g = this.ctx, S = this.canvas.width, ext = this.extent;
    g.clearRect(0, 0, S, S);
    // the shadow map rides along under the octopus
    const cx = soft.headC[0], cz = soft.headC[2];
    this.center.value.set(cx, cz);
    const toPxX = (v) => (((v - cx) / (ext * 2)) + 0.5) * S;
    const toPxZ = (v) => (((v - cz) / (ext * 2)) + 0.5) * S;
    const blob = (x, y, z, r, a) => {
      // the key light comes from up-left-front; shadows lean away from it
      const sx = x - KEY.x / KEY.y * y * 0.45, sz = z - KEY.z / KEY.y * y * 0.45;
      const px = toPxX(sx), pz = toPxZ(sz);
      const rad = ((r * 1.25 + Math.max(0, y) * 0.55) / (ext * 2)) * S;
      if (!Number.isFinite(px + pz + rad) || rad <= 0) return;
      const gr = g.createRadialGradient(px, pz, 0, px, pz, rad);
      const al = a * Math.exp(-y * 0.9);
      gr.addColorStop(0, `rgba(0,0,0,${al})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(px - rad, pz - rad, rad * 2, rad * 2);
    };
    const { x, r, n } = soft;
    const c = soft.headC;
    blob(c[0], c[1] * 0.6, c[2], 1.25, 0.32);
    for (let i = 0; i < n; i++) blob(x[i * 3], x[i * 3 + 1], x[i * 3 + 2], r[i], 0.075);
    if (stick) {
      for (let t = 0; t <= 1; t += 0.05) {
        const px = stick.a[0] + (stick.b[0] - stick.a[0]) * t;
        const py = stick.a[1] + (stick.b[1] - stick.a[1]) * t;
        const pz = stick.a[2] + (stick.b[2] - stick.a[2]) * t;
        blob(px, py, pz, stick.r * 2, 0.1);
      }
    }
    for (const [px, py, pz, pr] of extra) blob(px, py, pz, pr, 0.16);
    this.tex.needsUpdate = true;
  }
}
