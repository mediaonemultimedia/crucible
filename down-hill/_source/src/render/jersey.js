/* Kevalanche's forward throw, the hockey-fight jersey pull: a felt hockey
   jersey (render only) yanked up over the other one's head — his arms forced
   up into the sleeves, smothered — then left in the bear's fists when the
   victim flips away, and tossed over his shoulder. The OG's jersey is red
   with white stripes; the Hockey Goon ALT's is navy with orange.        */

import * as THREE from 'three/webgpu';
import { Fn, vec3, vec4, float, normalWorld, normalize, positionLocal, mix, smoothstep, select, frontFacing, mx_noise_float } from 'three/tsl';
import { shade } from '../../shared/grommet/props.js';

export function makeJersey(alt = false) {
  const base = alt ? vec3(0.05, 0.08, 0.2) : vec3(0.74, 0.06, 0.09);
  const band = alt ? vec3(0.97, 0.45, 0.1) : vec3(0.96, 0.94, 0.9);
  const felt = (sleeve) => {
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    m.colorNode = Fn(() => {
      const p = positionLocal;
      const N0 = normalize(normalWorld);
      const N = select(frontFacing, N0, N0.negate());
      // stripes: two round the hem, one round each cuff; a felt mottle; the
      // inside a shade darker
      const y = p.y;
      const s = sleeve
        ? smoothstep(0.24, 0.26, y).mul(smoothstep(0.4, 0.38, y))
        : smoothstep(-0.78, -0.76, y).mul(smoothstep(-0.62, -0.64, y)).add(smoothstep(-0.55, -0.53, y).mul(smoothstep(-0.46, -0.48, y)));
      const fuzz = mx_noise_float(vec3(p.mul(34))).mul(0.07).add(0.97);
      const c = mix(base, band, s).mul(fuzz).mul(select(frontFacing, float(1), float(0.62)));
      return vec4(shade(c, N, { spec: 0.08, power: 12, wrap: 0.55 }), 1);
    })();
    return m;
  };
  const g = new THREE.Group();
  // the body: a felt sack closed round the top (it's over his head), open at the hem
  const prof = [[0.6, -0.95], [0.67, -0.62], [0.69, -0.22], [0.63, 0.12], [0.52, 0.36], [0.34, 0.54], [0.12, 0.64], [0.001, 0.66]].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 30), felt(false));
  g.add(body);
  // the sleeves, the arms up inside them, cuffs at the top
  const sg = new THREE.CylinderGeometry(0.17, 0.23, 0.82, 16, 1, true);
  sg.translate(0, 0, 0);
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(sg, felt(true));
    m.position.set(s * 0.4, 0.62, 0);
    m.rotation.z = -s * 0.32;
    g.add(m);
  }
  g.userData.body = body;
  return g;
}
