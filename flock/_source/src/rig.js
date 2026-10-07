/* The rest shapes — where every physics point sits before anything touches
   it. Units: 1 = 9 cm (the octopus head is ~18 cm across, a large plush).
   +z faces the camera, +y is up, floor at y = 0.

   Every character produces the same structure for SoftBody and Body:
     clouds   shape-matched point clouds (clouds[0] is the main one, `head`)
     arms     appendage chains — arms, ears, tails, legs, necks — each a run of
              points held by 3-point shape-matched windows, stretch links,
              long-range tethers and shape memory
     parts    the display mesh: ellipsoid (or torus) grids skinned to a cloud,
              and tubes swept along chains
     regions  the groom/mask atlas layout, one rectangle per part, with the
              fur's default lean and ruffle there
   The octopus below is the Phase 1 rig, unchanged; the others live in
   rigs.js and are built with RigBuilder.                                     */

import { buildWolf, buildLion, buildLlama } from './rigs.js';

export const CHARACTERS = ['octopus', 'wolf', 'lion', 'llama'];

export const HEAD = { cx: 0, cy: 1.32, cz: 0, rx: 1.0, ry: 1.07, rz: 0.97 };
export const ARMS = 8;
export const ARM_N = 14;             // points per arm, including the root
export const ARM_LEN = 2.75;
export const ARM_ROOT_PHI = 0.79 * Math.PI;   // polar angle where arms leave the head

/* tube radius along the arm, s in [0,1] from root to tip */
export function armRadius(s) {
  return 0.065 + 0.19 * Math.pow(1 - s, 0.9);
}

function headPoint(phi, theta, scale = 1) {
  const sp = Math.sin(phi);
  return [
    HEAD.cx + HEAD.rx * sp * Math.sin(theta) * scale,
    HEAD.cy + HEAD.ry * Math.cos(phi) * scale,
    HEAD.cz + HEAD.rz * sp * Math.cos(theta) * scale,
  ];
}

export function armAngle(k) {
  return (k + 0.5) * (2 * Math.PI / ARMS);
}

export function buildRig(name = 'octopus') {
  if (name === 'wolf') return buildWolf();
  if (name === 'lion') return buildLion();
  if (name === 'llama') return buildLlama();
  return buildOctopus();
}

const armUnder = (s, c) => smooth(0.15, 0.6, c) * smooth(0.0, 0.08, s);

function buildOctopus() {
  const pos = [];
  const radius = [];
  const head = [];
  const add = (p, r, inHead) => {
    const i = radius.length;
    pos.push(p[0], p[1], p[2]);
    radius.push(r);
    if (inHead) head.push(i);
    return i;
  };

  // head shell: fibonacci points on a slightly shrunk ellipsoid so the
  // collision spheres land on the visible surface
  const SHELL = 90;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < SHELL; i++) {
    const y = 1 - (i + 0.5) / SHELL * 2;
    const phi = Math.acos(y);
    if (phi > ARM_ROOT_PHI + 0.05) continue;   // the underside is all arm roots
    add(headPoint(phi, i * golden, 0.86), 0.15, true);
  }
  // inner core gives the cloud volume, so squashing it has something to resist
  const center = add([HEAD.cx, HEAD.cy, HEAD.cz], 0.4, true);
  for (let i = 0; i < 12; i++) {
    const y = 1 - (i + 0.5) / 12 * 2;
    add(headPoint(Math.acos(y), i * golden, 0.48), 0.3, true);
  }

  const arms = [];
  const seg = ARM_LEN / (ARM_N - 1);
  for (let k = 0; k < ARMS; k++) {
    const a = armAngle(k);
    const dir = [Math.sin(a), 0, Math.cos(a)];
    const side = [Math.cos(a), 0, -Math.sin(a)];
    const anchor = add(headPoint(ARM_ROOT_PHI - 0.32, a, 0.5), 0.2, true);
    const idx = [];
    const root = headPoint(ARM_ROOT_PHI, a, 0.9);
    // walk a 2-D turtle in the (outward, up) plane, with a small sideways sway
    // so the eight arms don't read as rotated copies of one
    let rad = Math.hypot(root[0] - HEAD.cx, root[2] - HEAD.cz), y = root[1], lat = 0;
    const sway = (k % 2 ? 1 : -1) * (0.18 + 0.05 * (k % 3));
    for (let j = 0; j < ARM_N; j++) {
      const s = j * seg;
      const u = j / (ARM_N - 1);
      if (j > 0) {
        let th = -0.95 + 0.95 * smooth(0, 0.6, s);
        if (s > 1.75) th += 3.3 * (s - 1.75);
        rad += Math.cos(th) * seg;
        y += Math.sin(th) * seg;
        lat += sway * seg * Math.sin(u * Math.PI);
      }
      const r = armRadius(u);
      const p = [
        HEAD.cx + dir[0] * rad + side[0] * lat,
        Math.max(y, r * 0.9),
        HEAD.cz + dir[2] * rad + side[2] * lat,
      ];
      idx.push(add(p, r * 0.92, j === 0));
    }
    arms.push({ k, angle: a, idx: Int32Array.from(idx), anchor });
  }

  // bending windows: three consecutive points matched to their rest triangle,
  // the first one reaching back to an inner anchor so the arm holds its angle
  // where it leaves the head
  const windows = [];
  for (const arm of arms) {
    windows.push(Int32Array.of(arm.anchor, arm.idx[0], arm.idx[1]));
    for (let j = 1; j < ARM_N - 1; j++)
      windows.push(Int32Array.of(arm.idx[j - 1], arm.idx[j], arm.idx[j + 1]));
  }

  const n = radius.length;
  const rest = Float64Array.from(pos);
  const links = [];
  for (const arm of arms) {
    links.push([arm.anchor, arm.idx[0]]);
    for (let j = 0; j < ARM_N - 1; j++) links.push([arm.idx[j], arm.idx[j + 1]]);
  }
  const linkA = Int32Array.from(links.map((l) => l[0]));
  const linkB = Int32Array.from(links.map((l) => l[1]));
  const linkLen = Float64Array.from(links.map(([a, b]) => Math.hypot(
    rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1], rest[a * 3 + 2] - rest[b * 3 + 2])));

  const armOf = new Int16Array(n).fill(-1);
  const armJ = new Int16Array(n).fill(-1);
  for (const arm of arms) arm.idx.forEach((i, j) => { if (j > 0) { armOf[i] = arm.k; armJ[i] = j; } });

  // the generalised fields, all at their Phase 1 values
  for (const arm of arms) Object.assign(arm, {
    kind: 'arm', cloud: 0, from: center, len: ARM_LEN, seg, radius: armRadius,
    ref: [0, -1, 0], flat: 1, bend: 1, mem: 1, stretch: 1.32, skip: 3, inCloud: false,
    under: armUnder, pile: one, accent: zero,
  });
  const headIx = Int32Array.from(head);
  const parts = [{
    kind: 'grid', name: 'head', cloud: 0, U: 72, V: 46, region: 0,
    c: [HEAD.cx, HEAD.cy, HEAD.cz], r: [HEAD.rx, HEAD.ry, HEAD.rz], B: null,
    bulge: (phi) => 1 + 0.05 * Math.sin(phi * 1.4),
    pile: one, under: zero, accent: zero,
  }];
  const regions = [{ x0: 0, x1: 1, y0: 0, y1: 0.5 }];
  for (const arm of arms) {
    parts.push({ kind: 'tube', chain: arm.k, AS: 54, AA: 22, CAP: 6, region: regions.length });
    regions.push({ x0: arm.k / 8, x1: (arm.k + 1) / 8, y0: 0.5, y1: 1 });
  }

  return {
    name: 'octopus',
    n, rest, radius: Float64Array.from(radius),
    head: headIx, center, arms, windows,
    linkA, linkB, linkLen, armOf, armJ, seg,
    clouds: [{ ix: headIx, center, parent: -1, mem: 0, k: 1, k0: 0 }],
    windowK: new Float64Array(windows.length).fill(1),
    linkK: new Float64Array(linkA.length).fill(0.1),
    tethers: null, restSkip: false, react: false, camY: 0,
    parts, regions,
  };
}

const one = () => 1;
const zero = () => 0;

export function smooth(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
