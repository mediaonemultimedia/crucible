/* Sebas Perra's body (bolster-models): a standing plush wolf, built on the
   same standing anatomy as Kevalanche (Grommet's `standingBody`: one
   stuffed cloud for the torso, the head as extra bulk, two short inCloud
   legs on broad flat feet), to the owner's reference
   (`assets/refs/wolf-plush-ref.png`):

   - a big round head, as wide as the body; a short rounded cream muzzle
     with a small dark nose; glossy bead eyes set wide;
   - tall pointed ears, grey outside, cream inside; soft cheek ruffs at the
     sides of the head (short free chains: they bob behind a turn or a hit);
   - two-tone fur: grey on top, back and limbs; a cream face, chest and
     belly patch, paw ends and feet;
   - a chunky, round body; short stubby arms sunk into the shoulders (no
     visible joint), angled down, cream paws; short legs, cream feet;
   - a big bushy tail, grey with a cream tip, curling up behind him.

   The luchador mask is painted onto the `head` grid by render/masks.js
   (eye holes at the eyes below), the evil twin's sash rides the `torso`
   grid (render/attire.js): neither knows anything else about this body.
   Render only — nothing here reaches the sim.                             */

import { RigBuilder, smooth, lerp3 } from '../../shared/grommet/rigbuilder.js';
import { standingBody, athleteCfg, sunk } from '../../shared/grommet/athletes/standing.js';

export const WOLF = {
  TORSO: { c: [0, 1.32, 0], r: [0.8, 0.74, 0.64], B: null, bulge: (phi) => 0.9 + 0.2 * (phi / Math.PI) },
  HEAD: { c: [0, 2.52, 0.1], r: [0.8, 0.68, 0.7], B: null, bulge: (phi) => 1 + 0.06 * Math.sin(phi * 1.2) },
  SHOULDER: 0.64, SHOULDER_Y: 1.82, ARM_LEN: 0.8,
  // the bead eyes and the mask's eye holes: (0.5 ± u, v) on the head grid
  EYES: { part: 'head', u: 0.098, v: 0.475, lift: 0.03, scale: [0.1, 0.112, 0.07] },
};

export function buildWolfPlush() {
  const b = new RigBuilder('wolf');
  const { TORSO, HEAD } = WOLF;
  const { h0, h1 } = standingBody(b, {
    TORSO, HEAD,
    hip: [0.36, 0.82, 0.04], foot: [0.4, 0.27, 0.1], legR: 0.24,
    FOOT: { c: [0.41, 0.17, 0.19], r: [0.27, 0.17, 0.34] },
    // a cream oval from the chest down the belly; the back a shade darker
    torsoLook: {
      under: (u, v, l) => smooth(0.5, 0.78, l[2]) * (1 - smooth(0.38, 0.68, l[1])) * (1 - smooth(-0.45, -0.75, l[1])),
      accent: (u, v, l) => smooth(-0.1, -0.7, l[2]) * smooth(-0.4, 0.4, l[1]) * 0.35,
      pile: () => 1.1,
    },
    footLook: { under: () => 1, pile: () => 0.85 },
    // grey legs, the cream of the foot coming a little way up
    legLook: { under: (u) => 0.85 * smooth(0.7, 1, u), pile: () => 1.05 },
  });

  // the face: a cream mask over the lower face, cheeks and jaw; grey crown
  // and a grey point down between the eyes (under the luchador mask, on him)
  const faceUnder = (l) => {
    const face = smooth(0.3, 0.62, l[2]) * smooth(0.36, 0.12, l[1]);
    const peak = smooth(0.16, 0.06, Math.abs(l[0])) * smooth(-0.02, 0.22, l[1]);
    const jaw = smooth(0.02, -0.42, l[1]) * smooth(-0.35, 0.15, l[2]);
    return Math.max(face * (1 - peak), jaw);
  };
  b.grid({
    name: 'head', cloud: 0, ...HEAD, U: 64, V: 40, eye: true,
    under: (u, v, l) => faceUnder(l),
    // longer pile round the jowls, the plush's fluffy cheeks
    pile: (u, v, l) => 1 + 0.4 * smooth(0.5, 0.9, Math.abs(l[0])) * smooth(0.15, -0.4, l[1]) + 0.2 * smooth(0.0, -0.5, l[2]),
  });
  // a short rounded muzzle, cream, pushed forward and a touch down: a sewn-on
  // panel, short pile so it reads as one soft piece
  b.grid({ name: 'muzzle', cloud: 0, c: [0, 2.3, 0.76], r: [0.29, 0.215, 0.33], B: null, U: 32, V: 22, under: () => 1, pile: () => 0.5 });

  // tall pointed ears: stiff felt-backed, flattened front-to-back, grey with
  // cream insides; a touch less stiff than the old ones so they bob
  for (const s of [-1, 1]) {
    b.chain({
      name: s < 0 ? 'right ear' : 'left ear', kind: 'ear', cloud: 0, n: 5,
      anchor: [s * 0.28, 2.92, 0.04],
      path: (u) => [s * (0.42 + 0.13 * u), 3.0 + 0.68 * u, 0.1 - 0.05 * u],
      radius: (u) => 0.035 + 0.235 * Math.pow(1 - u, 0.8),
      ref: [0, 0, 1], flat: 0.4, bend: 3, mem: 5, stretch: 1.1, skip: 2, AS: 22, AA: 18, CAP: 5,
      under: (u, c) => smooth(0.15, 0.55, c) * smooth(0.1, 0.26, u) * (1 - smooth(0.62, 0.84, u)),
      accent: (u, c) => smooth(0.75, 0.95, u) * 0.6 + smooth(-0.1, -0.6, c) * 0.3,
      pile: (u, c) => 0.8 - 0.2 * smooth(0.3, 0.7, c) * (1 - smooth(0.6, 0.85, u)),
    });
  }

  // cheek ruffs: short grey tufts at the sides of the head, long ruffled
  // pile; free chains, so they lag and bob
  const ruffs = [];
  for (const s of [-1, 1]) {
    ruffs.push(b.chain({
      name: s < 0 ? 'right ruff' : 'left ruff', kind: 'ruff', cloud: 0, n: 3,
      anchor: [s * 0.46, 2.34, 0.28],
      path: (u) => [s * (0.64 + 0.2 * u), 2.32 - 0.1 * u, 0.36 - 0.1 * u],
      radius: (u) => 0.12 - 0.06 * u,
      ref: [0, -1, 0], bend: 1.2, mem: 2.2, stretch: 1.15, skip: 2, AS: 10, AA: 14, CAP: 6,
      pile: () => 1.45, accent: () => 0.1, groom: { ruf: 0.22 },
    }));
  }

  // short stubby arms that grow out of the shoulders: the socket sunk well
  // into the torso (render/puppets.js turns them about it), hanging down
  // and a little forward; cream paw ends
  const arms = [];
  for (const s of [-1, 1]) {
    const root0 = [s * WOLF.SHOULDER, WOLF.SHOULDER_Y, 0.06];
    let d = [s * 0.42, -0.85, 0.32];
    const dl = Math.hypot(...d);
    d = d.map((v) => v / dl);
    const end = [root0[0] + d[0] * WOLF.ARM_LEN, root0[1] + d[1] * WOLF.ARM_LEN, root0[2] + d[2] * WOLF.ARM_LEN];
    const root = sunk(root0, s);
    const L = Math.hypot(end[0] - root[0], end[1] - root[1], end[2] - root[2]);
    const at = (f) => (L - WOLF.ARM_LEN + f * WOLF.ARM_LEN) / L;     // a fraction of the visible arm
    arms.push(b.chain({
      name: s < 0 ? 'right arm' : 'left arm', kind: 'arm', cloud: 0, n: 6,
      anchor: [s * 0.38, 1.82, 0.0],
      path: (u) => lerp3(root, end, u),
      // thick at the shoulder, a soft paw that swells a little at the end
      radius: (u) => 0.205 - 0.02 * u + 0.045 * smooth(at(0.6), at(0.95), u) * (1 - 0.45 * smooth(at(0.96), 1, u)),
      ref: [0, -1, 0], bend: 2.6, mem: 5, stretch: 1.14, skip: 3, AS: 20, AA: 18, CAP: 7,
      under: (u) => smooth(at(0.72), at(0.84), u),
      pile: (u) => 1.1 - 0.15 * smooth(at(0.7), 1, u),
    }));
  }

  // the big bushy tail: out of the small of the back, back and up in a
  // curl beside him, grey with a cream tip
  b.chain({
    name: 'tail', kind: 'tail', cloud: 0, n: 8, anchor: [0.05, 0.86, -0.36],
    path: (u) => {
      const P = [[0.08, 0.82, -0.6], [0.3, 0.8, -0.98], [0.52, 1.08, -1.18], [0.62, 1.5, -1.1], [0.58, 1.86, -0.88]];
      const f = Math.min(P.length - 1.0001, u * (P.length - 1)), k = Math.floor(f), t = f - k;
      const p0 = P[Math.max(0, k - 1)], p1 = P[k], p2 = P[k + 1], p3 = P[Math.min(P.length - 1, k + 2)];
      return [0, 1, 2].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t * t + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t * t * t));
    },
    radius: (u) => 0.12 + 0.2 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.86)), 0.7),
    ref: [0, -1, 0], bend: 2.4, mem: 2.6, stretch: 1.18, AS: 36, AA: 20, CAP: 9,
    pile: (u) => 1.55 + 0.25 * smooth(0.7, 1, u),
    under: (u) => smooth(0.74, 0.86, u),
    accent: (u, c) => smooth(0.2, 0.8, c) * 0.3 * (1 - smooth(0.6, 0.75, u)),
    groom: { ruf: 0.14 },
  });

  const toy = athleteCfg(b, h0, h1, { pivot: [0, 1.98, 0.04], chest: [0, 1.6, 0.6], armR: arms[0].k, armL: arms[1].k });
  // the ruffs turn with the head (and lag behind it: they're soft)
  const head = [...toy.head];
  for (const r of ruffs) head.push(r.anchor, ...r.idx);
  toy.head = Int32Array.from(head);
  return b.finish({ camY: 0.1, toy });
}

/* ── the face: painted into the fur's mask atlas (R pile, G blush, B stitch)
   and pattern atlas (cleared: the luchador mask goes on top) ───────────── */

function painter(tex, rig) {
  const g = tex.userData.ctx, size = tex.userData.size;
  const parts = {};
  for (const P of rig.parts) if (P.kind === 'grid' && !parts[P.name]) parts[P.name] = P;
  const reg = (name) => rig.regions[parts[name].region];
  const at = (name, u, v) => { const R = reg(name); return [(R.x0 + u * (R.x1 - R.x0)) * size, (R.y0 + v * (R.y1 - R.y0)) * size]; };
  const px = (name, v, w, h) => {
    const P = parts[name], R = reg(name), sp = Math.max(0.2, Math.sin(v * Math.PI));
    return [w / (2 * Math.PI * Math.max(P.r[0], P.r[2]) * sp) * (R.x1 - R.x0) * size, h / (Math.PI * P.r[1]) * (R.y1 - R.y0) * size];
  };
  return { g, size, at, px };
}

export function paintWolfFace(maskTex, patTex, rig) {
  {
    const P = painter(maskTex, rig), { g, at, px } = P;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgb(255,0,0)';
    g.fillRect(0, 0, P.size, P.size);
    // the pile thinned round each bead eye, so the bead sits in the fur
    const E = WOLF.EYES;
    for (const s of [-1, 1]) {
      const [x, y] = at('head', 0.5 + s * E.u, E.v), [rx, ry] = px('head', E.v, 0.27, 0.27);
      const gr = g.createRadialGradient(x, y, 0, x, y, 1);
      gr.addColorStop(0, 'rgb(40,0,0)'); gr.addColorStop(0.6, 'rgb(90,0,0)'); gr.addColorStop(1, 'rgb(255,0,0)');
      g.save(); g.translate(x, y); g.scale(rx, ry); g.translate(-x, -y);
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 1, 0, Math.PI * 2); g.fill();
      g.restore();
    }
    // the nose: a small rounded felt pad (no pile, the dark stitch colour),
    // high on the front of the muzzle; wider than tall, softly triangular
    const [nx, ny] = at('muzzle', 0.5, 0.3), [sx, sy] = px('muzzle', 0.3, 1, 1);
    const w = 0.105, h = 0.11;
    g.fillStyle = 'rgb(0,0,255)';
    g.beginPath();
    g.moveTo(nx - w * sx, ny - h * 0.4 * sy);
    g.bezierCurveTo(nx - w * sx, ny - h * 0.75 * sy, nx + w * sx, ny - h * 0.75 * sy, nx + w * sx, ny - h * 0.4 * sy);
    g.bezierCurveTo(nx + w * 0.95 * sx, ny + h * 0.15 * sy, nx + w * 0.3 * sx, ny + h * 0.5 * sy, nx, ny + h * 0.52 * sy);
    g.bezierCurveTo(nx - w * 0.3 * sx, ny + h * 0.5 * sy, nx - w * 0.95 * sx, ny + h * 0.15 * sy, nx - w * sx, ny - h * 0.4 * sy);
    g.fill();
    // a small stitched mouth: down from the nose, a little smile each way
    g.globalCompositeOperation = 'lighter';
    const stitch = (pts, wd) => {
      const [, ry] = px('muzzle', pts[0][1], wd, wd);
      g.strokeStyle = 'rgb(0,0,255)'; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = Math.max(1.5, ry * 2);
      g.beginPath(); pts.forEach(([u, v], k) => { const [x, y] = at('muzzle', u, v); k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    };
    stitch([[0.5, 0.39], [0.5, 0.5]], 0.026);
    stitch([[0.43, 0.545], [0.465, 0.55], [0.5, 0.5], [0.535, 0.55], [0.57, 0.545]], 0.026);
    // a faint blush on the cheeks
    for (const s of [-1, 1]) {
      const [x, y] = at('head', 0.5 + s * 0.2, 0.6), [rx, ry] = px('head', 0.6, 0.2, 0.11);
      g.fillStyle = 'rgba(0,110,0,0.5)'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
    }
    maskTex.needsUpdate = true;
  }
  {
    const g = patTex.userData.ctx;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000'; g.fillRect(0, 0, patTex.userData.size, patTex.userData.size);
    patTex.needsUpdate = true;
  }
}
