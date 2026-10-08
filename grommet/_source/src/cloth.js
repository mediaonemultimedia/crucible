/* Cotton: the athletes' kit. Not fur — a single matte layer, drawn once.

   The geometry is a cloth Body (body.js): the same skinning to the soft
   body's clouds and chains as the fur, a little proud of it, so the shirt
   follows every squash and the sleeves ride the swinging arms. On top of
   that, here:

     swing    each vertex trails its own fur-lag spring (the surface's
              acceleration on a damped spring), scaled by how freely that
              part hangs — the hem and cuffs flick, the collar doesn't
     creases  the cloth Body measures how far each vertex's neighbours
              have bunched toward it; the shader folds bunched cloth into
              soft ridges (the folds a sleeve gets when the arm bends)
     weave    piqué (a polo's honeycomb knit), terry loops (the headband),
              a latex palm (gloves); a placket with two buttons and a small
              embroidered ball on the chest; trim stripes at hem and cuffs
     light    wrapped diffuse, a cool sky, a little cotton sheen at the
              silhouette, darker inside (a back face is the inside)       */

import * as THREE from 'three/webgpu';
import {
  Fn, uniform, attribute, float, vec2, vec3, vec4, positionLocal, normalLocal, cameraPosition, positionWorld,
  mix, smoothstep, clamp, normalize, dot, max, pow, abs, sin, length, varying, mx_noise_float, frontFacing, select,
} from 'three/tsl';
import { KEY, FILL } from './fur.js';

export function makeClothMaterial() {
  const U = {
    cloth: uniform(new THREE.Color('#f3f1ea')),
    trim: uniform(new THREE.Color('#2f6b4f')),
    swing: uniform(0.22),
    meshView: uniform(0),
  };
  const tuP = attribute('tuP', 'vec4');
  const uvfp = attribute('uvfp', 'vec4');
  const lag = attribute('lag', 'vec3');
  const look = attribute('look', 'vec4');
  const n = normalLocal;
  const sway = look.z;
  // the hem trails the body's motion; a hair proud of the surface everywhere
  U.positionNode = positionLocal.add(lag.mul(sway.mul(U.swing))).add(n.mul(0.004));

  const vC = varying(tuP.w);          // compression: creases
  const vFp = varying(uvfp.zw);
  const vTrim = varying(look.x);
  const vStyle = varying(look.w);
  const vN = varying(n);

  const colorNode = Fn(() => {
    const fp = vFp;
    const style = vStyle;
    const isPolo = smoothstep(0.5, 0.6, style).mul(smoothstep(1.5, 1.4, style));
    const isGlove = smoothstep(1.5, 1.6, style).mul(smoothstep(2.5, 2.4, style));
    const isTerry = smoothstep(2.5, 2.6, style);
    const base = mix(vec3(U.cloth), vec3(U.trim), clamp(vTrim, 0, 1)).toVar();

    // ── details on the polo's front ───────────────────────────────────────
    const fx = abs(fp.x);
    // placket: a strip down from the collar, stitched each side, two buttons
    const inPlacket = smoothstep(0.085, 0.075, fx).mul(smoothstep(0.33, 0.36, fp.y)).mul(smoothstep(0.86, 0.83, fp.y)).mul(isPolo);
    const edge = smoothstep(0.012, 0.0, abs(fx.sub(0.08))).mul(smoothstep(0.33, 0.36, fp.y)).mul(smoothstep(0.88, 0.85, fp.y)).mul(isPolo);
    const btn = (y) => smoothstep(0.034, 0.026, length(vec2(fp.x, fp.y.sub(y))));
    const buttons = max(btn(0.52), btn(0.7)).mul(isPolo);
    // a small embroidered ball on his left chest: a disc and its seam
    const em = length(vec2(fp.x.sub(0.3), fp.y.sub(0.62)));
    const emb = smoothstep(0.062, 0.054, em).mul(isPolo);
    const embSeam = smoothstep(0.009, 0.0, abs(length(vec2(fp.x.sub(0.3).add(0.05), fp.y.sub(0.62))).sub(0.05))).mul(emb);
    base.assign(mix(base, base.mul(0.93), inPlacket));
    base.assign(mix(base, base.mul(0.72), edge.mul(0.7)));
    base.assign(mix(base, vec3(U.trim), emb));
    base.assign(mix(base, vec3(0.96, 0.95, 0.9), embSeam));
    base.assign(mix(base, vec3(0.86, 0.84, 0.8), buttons));

    // ── weave ───────────────────────────────────────────────────────────────
    // piqué: a fine honeycomb; terry: loops; latex: a grippy dimpled palm
    const pique = sin(fp.x.mul(260)).mul(sin(fp.y.mul(260))).mul(0.5).add(0.5);
    const loops = mx_noise_float(vec3(fp.mul(70), 0.3)).mul(0.5).add(0.5);
    const dimple = mx_noise_float(vec3(fp.mul(34), 2.1)).mul(0.5).add(0.5);
    const weave = mix(mix(pique.mul(0.05).add(0.975), loops.mul(0.2).add(0.88), isTerry), dimple.mul(0.1).add(0.94), isGlove);
    base.mulAssign(weave);

    // ── creases: bunched cloth folds into soft ridges ─────────────────────────
    const c = clamp(vC, 0, 1);
    const wob = mx_noise_float(vec3(fp.mul(3.2), 7.7)).mul(2.2);
    const ridge = sin(fp.x.mul(26).add(fp.y.mul(9)).add(wob)).mul(0.5).add(0.5);
    const fold = pow(ridge, float(2.2)).mul(c).mul(0.38);

    // ── light ───────────────────────────────────────────────────────────────
    const N0 = normalize(vN);
    const N = select(frontFacing, N0, N0.negate());
    const V = normalize(cameraPosition.sub(positionWorld));
    const K = vec3(KEY.x, KEY.y, KEY.z), FL = vec3(FILL.x, FILL.y, FILL.z);
    const ndl = dot(N, K);
    const wrap = clamp(ndl.mul(0.6).add(0.4), 0, 1);
    const fillL = clamp(dot(N, FL).mul(0.5).add(0.35), 0, 1).mul(0.28);
    const sky = mix(vec3(0.74, 0.7, 0.66), vec3(0.98, 0.98, 0.97), N.y.mul(0.5).add(0.5)).mul(0.34);
    const groundAO = mix(float(0.55), float(1), smoothstep(0.0, 0.9, positionWorld.y));
    const sheen = pow(float(1).sub(abs(dot(N, V))), float(3)).mul(0.16);
    const H = normalize(K.add(V));
    const gloss = pow(clamp(dot(N, H), 0, 1), float(36)).mul(isGlove.mul(0.22).add(0.02));
    const lit = base.mul(vec3(wrap).mul(vec3(1.0, 0.96, 0.9)).mul(0.98).add(vec3(fillL).mul(vec3(0.85, 0.9, 1.0))).add(sky))
      .mul(groundAO).mul(float(1).sub(fold))
      .add(vec3(sheen).mul(base)).add(vec3(gloss));
    // the inside of a sleeve or shirt: in shade
    const inside = select(frontFacing, float(1), float(0.55));
    const meshCol = mix(base, vec3(0.2), 0.2).mul(wrap.mul(0.6).add(0.4));
    return vec4(mix(lit.mul(inside), meshCol, U.meshView), 1);
  });

  const mat = new THREE.MeshBasicNodeMaterial();
  mat.positionNode = U.positionNode;
  mat.colorNode = colorNode();
  mat.side = THREE.DoubleSide;
  return { material: mat, uniforms: U };
}
