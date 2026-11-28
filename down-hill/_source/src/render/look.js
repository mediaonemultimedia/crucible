/* The overhaul's look: "plush toys racing toy cars in a sunlit toy-box world".

   - a global colour grade inside every node material's output (no extra
     pass, so split screen costs nothing): a saturation lift, warm
     highlights and cool shadows, a touch of contrast. Per-course values
     through uniforms (setGrade).
   - a rim light: any material with userData.rim = [r, g, b, strength] gets
     a fresnel edge so karts and plush pop off the road.
   - Khronos Neutral tone mapping, which keeps hues and saturation intact
     while rolling off the highlights.
   - blob contact shadows: one soft disc per kart, held on the ground.   */

import * as THREE from 'three/webgpu';
import { Fn, uniform, vec3, vec4, float, dot, mix, max, pow, smoothstep, clamp, normalView, positionView, normalize, abs, Discard } from 'three/tsl';
import { canvasTex } from './geo.js';

export const GRADE = {
  sat: uniform(1.22),        // saturation multiplier
  warm: uniform(new THREE.Color(1.05, 0.99, 0.9)),   // highlight tint
  cool: uniform(new THREE.Color(0.9, 0.96, 1.08)),   // shadow tint
  contrast: uniform(1.06),
  lift: uniform(0.0),        // raise the blacks a hair (cartoon shadows aren't black)
};

const GRADES = {
  landing: { sat: 1.22, warm: [1.05, 0.99, 0.9], cool: [0.9, 0.95, 1.1], contrast: 1.07, lift: 0.01, exposure: 1.0 },
  laundry: { sat: 1.2, warm: [1.06, 1.0, 0.9], cool: [0.92, 0.97, 1.06], contrast: 1.05, lift: 0.01, exposure: 1.08 },
  hockey: { sat: 1.06, warm: [1.0, 1.0, 1.0], cool: [0.9, 0.97, 1.1], contrast: 1.07, lift: 0.012, exposure: 1.1 },
  park: { sat: 1.24, warm: [1.06, 1.0, 0.9], cool: [0.9, 0.98, 1.06], contrast: 1.05, lift: 0.01, exposure: 1.1 },
  dojo: { sat: 1.2, warm: [1.1, 0.98, 0.85], cool: [0.86, 0.92, 1.14], contrast: 1.08, lift: 0.02, exposure: 1.18 },
  menu: { sat: 1.15, warm: [1.04, 1.0, 0.92], cool: [0.93, 0.97, 1.06], contrast: 1.04, lift: 0.01, exposure: 1.05 },
};

let renderer = null;
export function setGrade(id) {
  const g = GRADES[id] || GRADES.menu;
  GRADE.sat.value = g.sat; GRADE.contrast.value = g.contrast; GRADE.lift.value = g.lift;
  GRADE.warm.value.setRGB(...g.warm); GRADE.cool.value.setRGB(...g.cool);
  if (renderer) renderer.toneMappingExposure = g.exposure;
}

const grade = Fn(([c]) => {
  const lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  // vibrance: dull colours get the lift, already-saturated ones barely move (no neon clay)
  const mx = max(max(c.r, c.g), c.b), mn = c.r.min(c.g).min(c.b);
  const s0 = mx.sub(mn).div(mx.max(0.0001));
  // …and near-whites stay white (clouds, cream paint)
  const k = mix(GRADE.sat, float(1), smoothstep(0.25, 0.85, s0).max(smoothstep(0.55, 0.9, lum)));
  const sat = mix(vec3(lum), c, k).max(0);
  // split tone by luminance: cool in the shadows, warm in the lights
  const t = smoothstep(0.05, 0.7, lum);
  const tinted = sat.mul(mix(vec3(GRADE.cool), vec3(GRADE.warm), t));
  // contrast around mid-grey (in linear, pivot 0.18)
  const con = pow(tinted.div(0.18).max(0.0001), vec3(GRADE.contrast)).mul(0.18);
  return con.add(GRADE.lift);
});

export function installLook(r) {
  renderer = r;
  r.toneMapping = THREE.NeutralToneMapping;
  setGrade('menu');
  const proto = THREE.NodeMaterial.prototype;
  if (proto._lookPatched) return;
  proto._lookPatched = true;
  const base = proto.setupOutput;
  proto.setupOutput = function (builder, out) {
    // particles right in front of the low chase cam would fill the frame: drop them
    const near = this.userData?.nearCull;
    if (near) Discard(positionView.z.negate().lessThan(near));
    if (this.userData?.noGrade || this.blending === THREE.AdditiveBlending) return base.call(this, builder, out);
    let rgb = out.rgb;
    const rim = this.userData?.rim;
    if (rim) {
      const v = normalize(positionView).negate();
      const f = pow(clamp(float(1).sub(abs(dot(normalize(normalView), v))), 0, 1), float(rim[4] ?? 2.6));
      // scaled by headroom: reads on a black crow, doesn't blow out a white bear
      const head = float(1).sub(dot(rgb, vec3(0.2126, 0.7152, 0.0722))).clamp(0.15, 1);
      rgb = rgb.add(vec3(rim[0], rim[1], rim[2]).mul(f.mul(rim[3]).mul(head)));
    }
    return base.call(this, builder, vec4(grade(rgb), out.a));
  };
}

/* three's render-object cache ignores userData: key the marked materials */
export function markLook(m, key) {
  const base = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => base() + '|look:' + key;
  m.needsUpdate = true;
}

/* mark every mesh material under a group for the rim (shared materials too) */
export function addRim(group, rim = [1.0, 0.92, 0.78, 0.7, 2.4]) {
  group.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.transparent && m.blending === THREE.AdditiveBlending) continue;
      if (!m.userData.rim) { m.userData.rim = rim; markLook(m, 'rim' + rim.join(',')); }
    }
  });
}

/* particles: never drawn closer than `d` to the eye */
export function nearCull(m, d = 2.6) { m.userData.nearCull = d; markLook(m, 'near' + d); }

/* the blob shadow: a soft dark disc, one shared texture + material */
let blobMat = null;
export function blobShadow(w = 2.6, l = 3.6) {
  blobMat ??= new THREE.MeshBasicMaterial({
    map: canvasTex(128, 128, (g, s) => {
      const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, 'rgba(24,10,48,0.72)'); gr.addColorStop(0.5, 'rgba(24,10,48,0.5)'); gr.addColorStop(1, 'rgba(20,12,40,0)');
      g.fillStyle = gr; g.fillRect(0, 0, s, s);
    }),
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  if (!blobMat.userData.noGrade) { blobMat.userData.noGrade = true; markLook(blobMat, 'nograde'); }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), blobMat);
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  m.userData.noShadow = true;
  return m;
}
