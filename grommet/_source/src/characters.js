/* Everything about an athlete that isn't physics or mesh: colourways (fur,
   under, accent; the spot and nose colours; the kit's cloth and trim), where
   the bead eyes sit, the embroidered face and the printed pattern under
   the pile (both painted into atlases), the court, and the words.

   Painting works in each part's own atlas rectangle, in world units: a
   rosette is rosette-sized whatever the region's scale. `at(part, u, v)` is
   a pixel in that part's region; `blob(part, u, v, w, h)` an ellipse w × h
   in world units there.                                                  */

import { mulberry32 } from './math.js';

export const CHARACTER_INFO = {
  leopard: {
    label: 'Leopard', sport: 'Tennis', tool: 'Serve', verb: 'Serve',
    colors: {
      golden: { fur: '#d9a252', under: '#f6ebd3', accent: '#3a281c', spot: '#36251a', nose: '#a26f79', cloth: '#f5f3ec', trim: '#2f6a4e' },
      snow: { fur: '#d9d5cc', under: '#f7f5f0', accent: '#4b4a50', spot: '#46464c', nose: '#ad8b90', cloth: '#f5f3ec', trim: '#3a5d8c' },
      amber: { fur: '#cf8a3e', under: '#f3e0c2', accent: '#2f1f16', spot: '#2c1c13', nose: '#94606a', cloth: '#f5f3ec', trim: '#a8402e' },
      panther: { fur: '#4a403a', under: '#5c524a', accent: '#211b18', spot: '#2a221e', nose: '#5e4b4e', cloth: '#f5f3ec', trim: '#c9a23c' },
    },
    eyes: { part: 'head', u: 0.086, v: 0.5, lift: 0.032, scale: [0.135, 0.15, 0.09] },
    pile: 8, stitch: [0.09, 0.05, 0.04],
    aria: 'A plush leopard in a white polo and headband who plays tennis with a wooden racquet',
    blurb: 'A plush leopard in his whites. Serve him a ball: he watches it, shuffles across, picks forehand or backhand and swings — all of it soft body. Time it wrong and it’s off the frame; beat him to the head and he’s seeing stars.',
    hand: 'Grab his head, an ear, the tail or an arm and pull — it gives, then springs back. Shift as you let go to pin that point.',
    play: 'Click the court to serve a ball there; flick to serve it harder. Or use Serve (S). Auto keeps the rally going.',
    camera: { az: 0.42, el: 0.3, dist: 14.5, y: 1.55 },
    face: leopardFace, pattern: leopardPattern, court: tennisCourt, tint: '#c9875f',
  },
  bear: {
    label: 'Polar bear', sport: 'Goalkeeping', tool: 'Shoot', verb: 'Shoot',
    colors: {
      polar: { fur: '#f2ede2', under: '#fbf8f1', accent: '#e4ddd0', spot: '#e4ddd0', nose: '#1c1a1b', cloth: '#c3dc45', trim: '#1e2a46' },
      glacier: { fur: '#e6edf0', under: '#f7fafb', accent: '#d5dee3', spot: '#d5dee3', nose: '#1c1d22', cloth: '#ef8a3a', trim: '#232a3a' },
      cream: { fur: '#efe2c8', under: '#faf4e6', accent: '#e2d3b4', spot: '#e2d3b4', nose: '#2a201c', cloth: '#5bb4e4', trim: '#1d2433' },
      honey: { fur: '#9a6a42', under: '#c79a6e', accent: '#7d5434', spot: '#7d5434', nose: '#1f1714', cloth: '#e8e04a', trim: '#2a2a2a' },
    },
    eyes: { part: 'head', u: 0.082, v: 0.47, lift: 0.03, scale: [0.11, 0.12, 0.075] },
    pile: 15, stitch: [0.03, 0.025, 0.028],
    aria: 'A chunky plush polar bear in goalkeeper gloves guarding a small soft goal',
    blurb: 'A chunky polar bear in keeper’s gloves. Take a shot: he reads it, dives — a whole soft body thrown at the corner — lands in a heap and hauls himself up again.',
    hand: 'Grab his head, an ear or an arm and pull — it gives, then springs back. Comb the long fur the wrong way and it stands up.',
    play: 'Click the goal to shoot there; flick to hit it harder. Or use Shoot (S). Corners and pace beat him more often.',
    camera: { az: 0.28, el: 0.3, dist: 17, y: 1.6 },
    face: bearFace, pattern: () => {}, court: pitch, tint: '#8fb27a',
  },
  crow: {
    label: 'Crow', sport: 'Catch & hoard', tool: 'Toss', verb: 'Toss',
    // nose: the beak and legs (felt); cloth: the feet; sheen: the gloss on
    // the pile; beak: its heft (a raven's is bigger)
    colors: {
      crow: { fur: '#1c1b21', under: '#24232b', accent: '#1c1b21', spot: '#1c1b21', nose: '#3d3c43', cloth: '#3d3c43', trim: '#3d3c43', sheen: '#2c2a70', beak: 1 },
      hooded: { fur: '#8e8b89', under: '#9d9a97', accent: '#1d1c22', spot: '#1d1c22', nose: '#323137', cloth: '#323137', trim: '#323137', sheen: '#26264e', beak: 1 },
      white: { fur: '#f0ede7', under: '#f7f5f0', accent: '#ebe7e0', spot: '#ebe7e0', nose: '#e6b6ad', cloth: '#e2b2a8', trim: '#e2b2a8', sheen: '#000000', beak: 1 },
      raven: { fur: '#131217', under: '#1a1920', accent: '#131217', spot: '#131217', nose: '#29282e', cloth: '#29282e', trim: '#29282e', sheen: '#382878', beak: 1.25 },
    },
    eyes: { part: 'head', u: 0.118, v: 0.43, lift: 0.028, scale: [0.085, 0.092, 0.06] },
    pile: 4, stitch: [0.02, 0.02, 0.025],
    aria: 'A round plush crow with a felt beak who catches what you toss him and hoards shiny things in a twig nest',
    blurb: 'A round plush crow, glossy black. Toss him a crumb: he hops across and snaps it out of the air — wide ones get a flap and a lunge. Toss him something shiny and it goes in his nest. Then try taking it back.',
    hand: 'Grab his head, a wing or the tail and pull. Or pick a treasure out of his nest and carry it off — he’ll come and take it back.',
    play: 'Click where he should catch it; flick to toss it harder. Shiny things (T) go to his nest. Or use Toss (S).',
    camera: { az: 0.3, el: 0.3, dist: 12.5, y: 1.25, x: 0.8 },
    face: crowFace, pattern: crowPattern, court: crowMat, tint: '#9c9aa8',
  },
  giraffe: {
    label: 'Giraffe', sport: 'Ring toss', tool: 'Toss', verb: 'Toss a ring',
    // spot: the patches; accent: the mane and the tufts; nose: nostrils;
    // cloth: the felt hooves
    colors: {
      savanna: { fur: '#e3b467', under: '#f6e8cb', accent: '#5e3a22', spot: '#9b5b2b', nose: '#3f2a1e', cloth: '#4a3324', trim: '#4a3324' },
      reticulated: { fur: '#efdcb4', under: '#fbf3e2', accent: '#55301c', spot: '#8a3b1a', nose: '#3a2418', cloth: '#3d2a20', trim: '#3d2a20' },
      masai: { fur: '#e6cb95', under: '#f7ecd4', accent: '#46301f', spot: '#6e4429', nose: '#33241b', cloth: '#3a2a20', trim: '#3a2a20' },
      mint: { fur: '#cfe4c4', under: '#f1f7ea', accent: '#5a8766', spot: '#86b18a', nose: '#3e5a47', cloth: '#e3a19b', trim: '#e3a19b' },
    },
    eyes: { part: 'head', u: 0.15, v: 0.4, lift: 0.026, scale: [0.075, 0.085, 0.055] },
    pile: 7, stitch: [0.08, 0.05, 0.03],
    aria: 'A tall plush giraffe with felt ossicones who plays ring toss, catching felt rings over his head and stacking them on his neck',
    blurb: 'A tall plush giraffe. Toss him a felt ring: he watches it come, stretches or dips his long neck to get his ossicones under it, and down it slides onto the stack. The more he carries the more his neck sags and sways — until he shakes the lot off.',
    hand: 'Grab his head, an ear or the tail and pull. Pick a ring up off the floor and drop it over his ossicones yourself.',
    play: 'Click where the ring should come down; flick to toss it harder. Or use Toss (S). Collect (G) picks up the rings on the floor.',
    camera: { az: 0.72, el: 0.2, dist: 18.5, y: 2.35, x: 0.2 },
    face: giraffeFace, pattern: giraffePattern, court: giraffeMat, tint: '#c8a76a',
  },
  penguin: {
    label: 'Penguin', sport: 'Batting', tool: 'Pitch', verb: 'Pitch',
    // fur: the black back; under: the white front; nose: the beak; cloth:
    // the felt feet; trim: his cap
    colors: {
      classic: { fur: '#1f1e24', under: '#f5f2ea', accent: '#1f1e24', spot: '#1f1e24', nose: '#f7a03a', cloth: '#f09232', trim: '#c0392f' },
      emperor: { fur: '#2c3340', under: '#f7f2e2', accent: '#2c3340', spot: '#2c3340', nose: '#e9a43a', cloth: '#3a3a40', trim: '#1f3f78' },
      fairy: { fur: '#5b7fa6', under: '#f4f4f0', accent: '#5b7fa6', spot: '#5b7fa6', nose: '#3a3a40', cloth: '#e8a3a0', trim: '#e2b23a' },
      rockhopper: { fur: '#26262c', under: '#f6f3ec', accent: '#26262c', spot: '#26262c', nose: '#d4523a', cloth: '#e58fa0', trim: '#2f7a4f' },
    },
    eyes: { part: 'head', u: 0.092, v: 0.44, lift: 0.028, scale: [0.09, 0.1, 0.065] },
    pile: 5, stitch: [0.06, 0.05, 0.05],
    aria: 'A round plush penguin in a felt ball cap who bats the pitches you throw him with a wooden bat',
    blurb: 'A round plush penguin in a felt cap, bat on his shoulder. Pitch to him: he watches it in, loads and swings — the soft body behind it. Square it up on the sweet spot and it’s gone; mistime it and it’s foul — or he whiffs and spins himself round.',
    hand: 'Grab his head, a flipper or the tail and pull — it gives, then springs back. Shift as you let go to pin that point.',
    play: 'Click by the plate to pitch it there; flick to throw it harder. Or use Pitch (S). He takes the ones off the plate.',
    camera: { az: -0.42, el: 0.22, dist: 13, y: 1.45, x: -1.0 },
    face: penguinFace, pattern: () => {}, court: diamond, tint: '#b88057',
  },
  otter: {
    label: 'Otter', sport: 'Juggling', tool: 'Toss', verb: 'Toss',
    // fur: the brown; under: the cream face and bib; accent: the darker
    // paws and feet; nose: the nose pad
    colors: {
      river: { fur: '#7a5236', under: '#ecdcc0', accent: '#4e3322', spot: '#4e3322', nose: '#2a1d17', cloth: '#3aa6a0', trim: '#3aa6a0' },
      sea: { fur: '#5e4a3d', under: '#d9cdbd', accent: '#3b2e26', spot: '#3b2e26', nose: '#1f1714', cloth: '#e8b13a', trim: '#e8b13a' },
      honey: { fur: '#a8774b', under: '#f3e6cc', accent: '#6b4a2e', spot: '#6b4a2e', nose: '#3b2a20', cloth: '#d4574a', trim: '#d4574a' },
      silver: { fur: '#8e8a86', under: '#efebe4', accent: '#5f5b58', spot: '#5f5b58', nose: '#2b2a2c', cloth: '#5a7cc4', trim: '#5a7cc4' },
    },
    eyes: { part: 'head', u: 0.105, v: 0.46, lift: 0.026, scale: [0.08, 0.088, 0.06] },
    pile: 5, stitch: [0.05, 0.035, 0.03],
    aria: 'A sleek plush otter sitting up who juggles the shells and pebbles you toss him',
    blurb: 'A sleek plush otter, sitting up. Toss him a shell: he catches it and keeps it going, paw to paw. Toss another, and another — he’ll keep them all up for as long as he can. Too many, or a wild toss, and the lot comes tumbling down.',
    hand: 'Grab his head, an ear, an arm or the tail and pull — it gives, then springs back. Shift as you let go to pin that point.',
    play: 'Click by his paws to toss a shell there; flick to toss it harder. Or use Toss (S), one at a time. Five at once is too many.',
    camera: { az: 0.35, el: 0.22, dist: 11.5, y: 1.45 },
    face: otterFace, pattern: () => {}, court: otterMat, tint: '#86a9b4',
  },
  panda: {
    label: 'Pandas', sport: 'Sumo', tool: 'Charge', verb: 'Charge',
    // fur / under: the white; accent and spot: the black (ears, arms, legs,
    // saddle, eye patches); cloth: the challenger's mawashi; trim: the
    // champion's
    colors: {
      classic: { fur: '#f3f0e9', under: '#f6f3ec', accent: '#1f1d20', spot: '#1f1d20', nose: '#1a181a', cloth: '#c8352e', trim: '#4a2a6e' },
      qinling: { fur: '#efe6d8', under: '#f3ebdf', accent: '#5b3e2e', spot: '#5b3e2e', nose: '#3a2820', cloth: '#2f6fa8', trim: '#c9952f' },
      ink: { fur: '#ebe6dc', under: '#efebe2', accent: '#2c2f38', spot: '#2c2f38', nose: '#202228', cloth: '#d97b2b', trim: '#2b5b45' },
      sakura: { fur: '#f6f0ee', under: '#f9f4f2', accent: '#3a2c33', spot: '#3a2c33', nose: '#2c2226', cloth: '#e06f8c', trim: '#3c3a8a' },
    },
    eyes: { part: 'head', parts: ['head', 'head b'], u: 0.088, v: 0.47, lift: 0.03, scale: [0.085, 0.095, 0.065] },
    pile: 12, stitch: [0.05, 0.045, 0.05], shells: 40,
    aria: 'Two chubby plush pandas in felt mawashi, a champion and a challenger, wrestling sumo in a round felt ring',
    blurb: 'Two chubby plush pandas in a felt ring. You’re the challenger, in red: charge him. The champion reads it, braces and shoves back — belly to belly, all soft body — and side-steps a wild one. Out of the ring or down, and the bout’s over.',
    hand: 'Grab either panda — a head, an ear, an arm — and pull; it gives, then springs back. Best between bouts.',
    play: 'Click the ring to charge that way; flick to charge harder. Click again in a clinch to shove. Or use Charge (S). Champion (panel) sets his strength.',
    camera: { az: -0.55, el: 0.34, dist: 17.5, y: 1.4 },
    face: pandaFace, pattern: pandaPattern, court: dohyo, tint: '#c7a47a',
  },
};

/* the painting helpers for one rig and one canvas */
function painter(g, size, rig) {
  const parts = {};
  for (const P of rig.parts) if (P.kind === 'grid' && !parts[P.name]) parts[P.name] = P;
  const reg = (name) => rig.regions[parts[name].region];
  const at = (name, u, v) => {
    const R = reg(name);
    return [(R.x0 + u * (R.x1 - R.x0)) * size, (R.y0 + v * (R.y1 - R.y0)) * size];
  };
  // world size → pixels at (u, v) on an ellipsoid part
  const px = (name, v, w, h) => {
    const P = parts[name], R = reg(name);
    const sp = Math.max(0.2, Math.sin(v * Math.PI));
    return [w / (2 * Math.PI * Math.max(P.r[0], P.r[2]) * sp) * (R.x1 - R.x0) * size, h / (Math.PI * P.r[1]) * (R.y1 - R.y0) * size];
  };
  const blob = (name, u, v, w, h, style, rot = 0) => {
    const [x, y] = at(name, u, v), [rx, ry] = px(name, v, w, h);
    g.fillStyle = style;
    g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill();
    // wrap round the back seam
    const R = reg(name), W = (R.x1 - R.x0) * size;
    if (x - rx < R.x0 * size) { g.beginPath(); g.ellipse(x + W, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); }
    if (x + rx > R.x1 * size) { g.beginPath(); g.ellipse(x - W, y, rx, ry, rot, 0, Math.PI * 2); g.fill(); }
  };
  const eyeRing = (name, u, v, w) => {
    for (const s of [-1, 1]) {
      const [x, y] = at(name, 0.5 + s * u, v), [rx, ry] = px(name, v, w, w);
      const gr = g.createRadialGradient(x, y, 0, x, y, 1);
      gr.addColorStop(0, 'rgb(40,0,0)'); gr.addColorStop(0.6, 'rgb(90,0,0)'); gr.addColorStop(1, 'rgb(255,0,0)');
      g.save(); g.translate(x, y); g.scale(rx, ry); g.translate(-x, -y);
      g.fillStyle = gr;
      g.beginPath(); g.arc(x, y, 1, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  };
  const stitch = (name, pts, w) => {
    const [, ry] = px(name, pts[0][1], w, w);
    g.strokeStyle = 'rgb(0,0,255)';
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = Math.max(1.5, ry * 2);
    g.beginPath();
    pts.forEach(([u, v], k) => { const [x, y] = at(name, u, v); if (k) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
  };
  // a chain's tube region: (around a ∈ [0,1], along s ∈ [0,1]) → pixels
  const tubeAt = (P, a, s) => {
    const R = rig.regions[P.region];
    return [(R.x0 + a * (R.x1 - R.x0)) * size, (R.y0 + Math.min(1, s * 0.985) * (R.y1 - R.y0)) * size];
  };
  return { parts, reg, at, px, blob, eyeRing, stitch, tubeAt, rig };
}

/* paint an athlete's mask (pile, blush, stitch) and pattern (spots, nose) */
export function paintAthlete(maskTex, patTex, name, rig) {
  const info = CHARACTER_INFO[name];
  {
    const g = maskTex.userData.ctx, size = maskTex.userData.size;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgb(255,0,0)';
    g.fillRect(0, 0, size, size);
    const P = painter(g, size, rig);
    // no fur under the clothes
    for (const m of rig.furMask || []) {
      const c = `rgb(${Math.round(m.pile * 255)},0,0)`;
      g.fillStyle = c;
      if (m.part) {
        const [, y0] = P.at(m.part, 0, m.v0), [, y1] = P.at(m.part, 0, m.v1);
        const R = P.reg(m.part);
        g.fillRect(R.x0 * size, y0, (R.x1 - R.x0) * size, y1 - y0);
      } else {
        const T = rig.parts.find((q) => q.kind === 'tube' && q.name === m.chain);
        const [x0, y0] = P.tubeAt(T, 0, m.s0), [x1, y1] = P.tubeAt(T, 1, m.s1);
        g.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    }
    info.face(g, size, P);
    maskTex.needsUpdate = true;
  }
  {
    const g = patTex.userData.ctx, size = patTex.userData.size;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#000';
    g.fillRect(0, 0, size, size);
    g.globalCompositeOperation = 'lighter';
    info.pattern(g, size, painter(g, size, rig), rig);
    noseOf(name)(g, size, painter(g, size, rig));
    patTex.needsUpdate = true;
  }
}

const noseOf = (name) => (name === 'leopard' ? leopardNose : name === 'crow' ? () => {} : name === 'giraffe' ? giraffeNose : name === 'penguin' ? penguinNose : name === 'otter' ? otterNose : name === 'panda' ? pandaNose : bearNose);

/* ── the leopard ─────────────────────────────────────────────────────────── */

function leopardFace(g, size, P) {
  const { blob, eyeRing, stitch } = P;
  eyeRing('head', 0.086, 0.5, 0.3);
  g.globalCompositeOperation = 'lighter';
  blob('head', 0.375, 0.62, 0.2, 0.11, 'rgba(0,140,0,0.55)');
  blob('head', 0.625, 0.62, 0.2, 0.11, 'rgba(0,140,0,0.55)');
  // nose pad: short pile; the split muzzle, a smile, whisker dots
  // the nose pad is bare felt: no pile at all
  g.globalCompositeOperation = 'source-over';
  nosePad(g, P, 'muzzle', 0.5, 0.335, 0.13, 0.18, 'rgb(0,0,0)');
  g.globalCompositeOperation = 'lighter';
  stitch('muzzle', [[0.5, 0.42], [0.5, 0.53]], 0.028);
  stitch('muzzle', [[0.41, 0.6], [0.455, 0.595], [0.5, 0.53], [0.545, 0.595], [0.59, 0.6]], 0.03);
  for (const s of [-1, 1])
    for (const [du, dv] of [[0.1, 0.4], [0.125, 0.47], [0.095, 0.5]]) blob('muzzle', 0.5 + s * du, dv, 0.028, 0.028, 'rgb(0,0,190)');
}

/* a nose pad: a soft inverted triangle, w × h in world units */
function nosePad(g, P, part, u, v, w, h, style) {
  const [x, y] = P.at(part, u, v), [sx, sy] = P.px(part, v, 1, 1);
  g.fillStyle = style;
  g.beginPath();
  g.moveTo(x - w * sx, y - h * 0.45 * sy);
  g.quadraticCurveTo(x, y - h * 0.62 * sy, x + w * sx, y - h * 0.45 * sy);
  g.quadraticCurveTo(x + w * 0.75 * sx, y + h * 0.2 * sy, x, y + h * 0.55 * sy);
  g.quadraticCurveTo(x - w * 0.75 * sx, y + h * 0.2 * sy, x - w * sx, y - h * 0.45 * sy);
  g.fill();
}

function leopardNose(g, size, P) {
  nosePad(g, P, 'muzzle', 0.5, 0.335, 0.125, 0.17, 'rgb(0,255,0)');
}

/* rosettes and spots, scattered in world units over every furred part.
   Each mark is an ellipse in world units (rotated in the world, then mapped
   into the atlas by the part's local scale), so a rosette is round on the
   plush however its region is stretched.                                 */
function leopardPattern(g, size, P, rig) {
  const rnd = mulberry32(2207);
  // an ellipse w × h (radii), turned by rot, at world offset (cx, cy) from a
  // pixel origin with sx, sy pixels per unit; wrapped round the seam
  const mark = (o, cx, cy, w, h, rot, style) => {
    g.fillStyle = style;
    for (const shift of [0, -o.W, o.W]) {
      g.beginPath();
      for (let k = 0; k < 18; k++) {
        const t = (k / 18) * Math.PI * 2;
        const ex = Math.cos(t) * w, ey = Math.sin(t) * h;
        const x = cx + ex * Math.cos(rot) - ey * Math.sin(rot), y = cy + ex * Math.sin(rot) + ey * Math.cos(rot);
        const X = o.x + x * o.sx + shift, Y = o.y + y * o.sy;
        if (k) g.lineTo(X, Y); else g.moveTo(X, Y);
      }
      g.closePath();
      g.fill();
    }
  };
  // a rosette: a broken ring of dark petals round a deeper-gold heart
  const rosette = (o, R) => {
    mark(o, 0, 0, R * 0.62, R * 0.55, rnd() * 3, 'rgba(0,0,255,0.9)');
    const n = 4 + Math.floor(rnd() * 3), rot0 = rnd() * 6.28;
    for (let k = 0; k < n; k++) {
      if (rnd() < 0.12) continue;                       // an open rosette
      const a = rot0 + (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.45;
      const rr = R * (0.8 + rnd() * 0.2);
      mark(o, Math.cos(a) * rr, Math.sin(a) * rr, R * (0.36 + rnd() * 0.16), R * (0.2 + rnd() * 0.08), a + Math.PI / 2, 'rgba(255,0,0,0.95)');
    }
  };
  const dot = (o, R) => mark(o, 0, 0, R, R * (0.75 + rnd() * 0.3), rnd() * 3, 'rgba(255,0,0,0.95)');

  for (const part of rig.parts) {
    if (part.kind === 'grid') {
      const name = part.name;
      if (name === 'muzzle') continue;
      const R = rig.regions[part.region];
      const rx = Math.max(part.r[0], part.r[2]), ry = part.r[1];
      const W = (R.x1 - R.x0) * size;
      const head = name === 'head', foot = name === 'foot';
      const spacing = head ? 0.17 : foot ? 0.16 : 0.32;
      const rows = Math.floor(Math.PI * ry / spacing);
      for (let j = 1; j < rows; j++) {
        const v = (j + (rnd() - 0.5) * 0.7) / rows;
        const phi = v * Math.PI, sp = Math.sin(phi);
        if (sp < 0.12) continue;
        const ring = 2 * Math.PI * rx * sp;
        const cols = Math.max(1, Math.floor(ring / spacing));
        const off = rnd();
        for (let i = 0; i < cols; i++) {
          const u = (i + off + (rnd() - 0.5) * 0.5) / cols;
          const th = (u - 0.5) * 2 * Math.PI;
          const l = [sp * Math.sin(th), Math.cos(phi), sp * Math.cos(th)];
          if (part.under(u, v, l) > 0.25) continue;
          // keep the face clear round the eyes and muzzle
          if (head && l[2] > 0.5 && l[1] < 0.3 && l[1] > -0.8) continue;
          const o = { x: (R.x0 + (((u % 1) + 1) % 1) * (R.x1 - R.x0)) * size, y: (R.y0 + v * (R.y1 - R.y0)) * size,
            sx: W / ring, sy: (R.y1 - R.y0) * size / (Math.PI * ry), W };
          if (head) dot(o, 0.034 + rnd() * 0.02);
          else if (foot) dot(o, 0.032);
          else rosette(o, 0.13 + rnd() * 0.04);
        }
      }
    } else {
      const ch = rig.arms[part.chain];
      if (ch.kind === 'ear') continue;
      const R = rig.regions[part.region];
      const W = (R.x1 - R.x0) * size;
      const len = ch.len;
      const spacing = ch.kind === 'tail' ? 0.17 : 0.27;
      const rows = Math.max(1, Math.floor(len / spacing));
      for (let j = 0; j < rows; j++) {
        const s = (j + 0.5 + (rnd() - 0.5) * 0.5) / rows;
        if (ch.kind === 'tail' && ch.accent(s, 0) > 0.1) continue;
        const r = ch.radius(s);
        const ring = 2 * Math.PI * r;
        const cols = Math.max(2, Math.floor(ring / spacing));
        const off = rnd();
        for (let i = 0; i < cols; i++) {
          const a = (i + off) / cols;
          const c = Math.cos(a * 2 * Math.PI);
          if (ch.under(s, c) > 0.25) continue;
          const o = { x: (R.x0 + (((a % 1) + 1) % 1) * (R.x1 - R.x0)) * size, y: (R.y0 + s * 0.985 * (R.y1 - R.y0)) * size,
            sx: W / ring, sy: (R.y1 - R.y0) * 0.985 * size / len, W };
          if (ch.kind === 'tail' || (ch.kind === 'arm' && s > 0.8)) dot(o, 0.032 + rnd() * 0.012);
          else if (ch.kind === 'arm') rosette(o, 0.1 + rnd() * 0.025);
          else rosette(o, 0.11 + rnd() * 0.03);
        }
      }
    }
  }
}

/* ── the polar bear ──────────────────────────────────────────────────────── */

function bearFace(g, size, P) {
  const { eyeRing, stitch } = P;
  eyeRing('head', 0.082, 0.47, 0.26);
  g.globalCompositeOperation = 'source-over';
  nosePad(g, P, 'muzzle', 0.5, 0.33, 0.18, 0.21, 'rgb(0,0,0)');
  g.globalCompositeOperation = 'lighter';
  stitch('muzzle', [[0.5, 0.42], [0.5, 0.56]], 0.035);
  stitch('muzzle', [[0.41, 0.6], [0.46, 0.6], [0.5, 0.55], [0.54, 0.6], [0.59, 0.6]], 0.035);
}

function bearNose(g, size, P) {
  nosePad(g, P, 'muzzle', 0.5, 0.33, 0.175, 0.2, 'rgb(0,255,0)');
}

/* ── the crow ────────────────────────────────────────────────────────────── */

function crowFace(g, size, P) {
  const { eyeRing, blob, stitch, tubeAt } = P;
  eyeRing('head', 0.118, 0.43, 0.2);
  // a short-cropped patch where the beak is sewn on, so it isn't buried
  g.globalCompositeOperation = 'source-over';
  blob('head', 0.5, 0.56, 0.3, 0.2, 'rgb(70,0,0)');
  // the second foot (painter's lookups find the first): no fur under felt
  for (const part of P.rig.parts) {
    if (part.kind !== 'grid' || part.name !== 'foot') continue;
    const R = P.rig.regions[part.region];
    g.fillStyle = 'rgb(0,0,0)';
    g.fillRect(R.x0 * size, R.y0 * size, (R.x1 - R.x0) * size, (R.y1 - R.y0) * size);
  }
  // feathers: rows of stitched scallops down each folded wing, and the
  // tail's feathers stitched along their length
  g.globalCompositeOperation = 'lighter';
  for (const part of P.rig.parts) {
    if (part.kind !== 'tube') continue;
    const ch = P.rig.arms[part.chain];
    if (ch.kind === 'arm') {
      for (const s0 of [0.38, 0.55, 0.7, 0.84]) {
        for (let k = 0; k < 6; k++) {
          const a0 = k / 6, a1 = (k + 1) / 6;
          const pts = [];
          for (let q = 0; q <= 6; q++) {
            const a = a0 + (a1 - a0) * q / 6;
            pts.push(tubeAt(part, a, s0 + 0.05 * Math.sin(Math.PI * q / 6)));
          }
          g.strokeStyle = 'rgb(0,0,150)';
          g.lineWidth = Math.max(1.2, size / 512 * 1.4);
          g.beginPath();
          pts.forEach(([x, y], q) => (q ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.stroke();
        }
      }
    } else if (ch.kind === 'tail') {
      for (const a of [0.125, 0.375, 0.625, 0.875]) {
        const [x0, y0] = tubeAt(part, a, 0.2), [x1, y1] = tubeAt(part, a, 0.97);
        g.strokeStyle = 'rgb(0,0,150)';
        g.lineWidth = Math.max(1.2, size / 512 * 1.4);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
    }
  }
  void stitch;
}

/* the legs are felt (the beak's colour); a hooded crow's black bib */
function crowPattern(g, size, P, rig) {
  for (const part of rig.parts) {
    if (part.kind !== 'tube' || rig.arms[part.chain].kind !== 'leg') continue;
    const R = rig.regions[part.region];
    g.fillStyle = 'rgb(0,255,0)';
    g.fillRect(R.x0 * size, R.y0 * size, (R.x1 - R.x0) * size, (R.y1 - R.y0) * size);
  }
  // the bib: under the beak, down the throat to the top of the chest
  P.blob('torso', 0.5, 0.2, 0.75, 0.42, 'rgb(255,0,0)');
  P.blob('head', 0.5, 0.78, 0.6, 0.42, 'rgb(255,0,0)');
}

/* a soft play mat with a chalk ring where he stands, and his corner */
function crowMat(g, toPx, k) {
  const [a, b] = toPx(-4.6, -3.1), [c, d] = toPx(4.6, 4.2);
  g.fillStyle = 'rgb(0,255,0)';
  g.beginPath();
  g.roundRect ? g.roundRect(a, b, c - a, d - b, 0.6 * k) : g.rect(a, b, c - a, d - b);
  g.fill();
  const [sx, sy] = toPx(0, 0.05);
  g.strokeStyle = 'rgb(200,0,0)';
  g.lineWidth = 0.06 * k;
  g.setLineDash([0.18 * k, 0.14 * k]);
  g.beginPath(); g.arc(sx, sy, 1.15 * k, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
}

/* ── courts, painted into the floor ──────────────────────────────────────── */

function tennisCourt(g, toPx, k) {
  const line = (x0, z0, x1, z1, w = 0.09) => {
    const [a, b] = toPx(x0, z0), [c, d] = toPx(x1, z1);
    g.fillStyle = 'rgb(255,0,0)';
    g.fillRect(Math.min(a, c) - w * k / 2, Math.min(b, d) - w * k / 2, Math.abs(c - a) + w * k, Math.abs(d - b) + w * k);
  };
  // his half of a small clay court: baseline behind him, sidelines, the
  // service line and centre line out toward you
  const [a, b] = toPx(-5.4, -1.0), [c, d] = toPx(5.4, 14);
  g.fillStyle = 'rgb(0,255,0)';
  g.fillRect(a - 2.2 * k, b - 2.2 * k, c - a + 4.4 * k, d - b + 4.4 * k);
  line(-5.4, -1.0, 5.4, -1.0);
  line(-5.4, -1.0, -5.4, 14); line(5.4, -1.0, 5.4, 14);
  line(-4.2, -1.0, -4.2, 14, 0.06); line(4.2, -1.0, 4.2, 14, 0.06);
  line(-4.2, 5.2, 4.2, 5.2);
  line(0, 5.2, 0, 14);
  line(0, -1.0, 0, -0.65);
}

function pitch(g, toPx, k) {
  const line = (x0, z0, x1, z1, w = 0.1) => {
    const [a, b] = toPx(x0, z0), [c, d] = toPx(x1, z1);
    g.fillStyle = 'rgb(255,0,0)';
    g.fillRect(Math.min(a, c) - w * k / 2, Math.min(b, d) - w * k / 2, Math.abs(c - a) + w * k, Math.abs(d - b) + w * k);
  };
  const [a, b] = toPx(-14, -3.4), [c, d] = toPx(14, 14);
  g.fillStyle = 'rgb(0,255,0)';
  g.fillRect(a, b, c - a, d - b);
  line(-12, -1.3, 12, -1.3);
  // the six-yard box and the penalty box
  line(-4.8, -1.3, -4.8, 1.6); line(4.8, -1.3, 4.8, 1.6); line(-4.8, 1.6, 4.8, 1.6);
  line(-9, -1.3, -9, 9.6); line(9, -1.3, 9, 9.6); line(-9, 9.6, 9, 9.6);
  const [sx, sy] = toPx(0, 6.9);
  g.fillStyle = 'rgb(255,0,0)';
  g.beginPath(); g.arc(sx, sy, 0.16 * k, 0, Math.PI * 2); g.fill();
  // the arc at the top of the box
  g.strokeStyle = 'rgb(255,0,0)';
  g.lineWidth = 0.1 * k;
  g.beginPath(); g.arc(sx, sy, 3.4 * k, Math.PI * 0.29, Math.PI * 0.71); g.stroke();
}

/* ── the giraffe ─────────────────────────────────────────────────────────── */

function giraffeFace(g, size, P) {
  const { eyeRing, stitch, blob } = P;
  eyeRing('head', 0.15, 0.4, 0.17);
  g.globalCompositeOperation = 'lighter';
  // a little lash stitched over each eye, and a smile under the muzzle
  for (const s of [-1, 1]) {
    const u = 0.5 + s * 0.15;
    stitch('head', [[u - s * 0.03, 0.33], [u, 0.315], [u + s * 0.035, 0.325], [u + s * 0.05, 0.305]], 0.014);
  }
  stitch('muzzle', [[0.43, 0.66], [0.465, 0.69], [0.5, 0.675], [0.535, 0.69], [0.57, 0.66]], 0.02);
  // cheeks
  blob('head', 0.5 - 0.2, 0.55, 0.12, 0.08, 'rgba(0,110,0,0.5)');
  blob('head', 0.5 + 0.2, 0.55, 0.12, 0.08, 'rgba(0,110,0,0.5)');
  // the hooves are felt: no fur under them (every foot, not just the first)
  g.globalCompositeOperation = 'source-over';
  for (const part of P.rig.parts) {
    if (part.kind !== 'grid' || !/foot$/.test(part.name)) continue;
    const R = P.rig.regions[part.region];
    const y0 = R.y0 + 0.5 * (R.y1 - R.y0);
    g.fillStyle = 'rgb(0,0,0)';
    g.fillRect(R.x0 * size, y0 * size, (R.x1 - R.x0) * size, (R.y1 - y0) * size);
  }
}

function giraffeNose(g, size, P) {
  // two soft nostrils, high on the front of the muzzle
  for (const s of [-1, 1]) P.blob('muzzle', 0.5 + s * 0.07, 0.42, 0.06, 0.035, 'rgb(0,255,0)', s * 0.5);
}

/* patches: rounded, many-sided, a cream net of fur between them — on the
   body, the neck, the legs (smaller toward the hooves), the head (small),
   none on the belly, the muzzle or the inside of the legs               */
function giraffePattern(g, size, P, rig) {
  const rnd = mulberry32(4411);
  const patch = (cx, cy, sx, sy, R, W) => {
    const n = 6 + Math.floor(rnd() * 3), rot = rnd() * 6.28;
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2 + (rnd() - 0.5) * 0.5;
      const rr = R * (0.78 + rnd() * 0.3);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    g.fillStyle = 'rgba(255,0,0,0.95)';
    for (const shift of [0, -W, W]) {
      g.beginPath();
      // rounded corners: through the midpoints, curving at each vertex
      const m = (k) => { const a = pts[k % n], b = pts[(k + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
      const p0 = m(n - 1);
      g.moveTo(cx + p0[0] * sx + shift, cy + p0[1] * sy);
      for (let k = 0; k < n; k++) { const q = m(k); g.quadraticCurveTo(cx + pts[k][0] * sx + shift, cy + pts[k][1] * sy, cx + q[0] * sx + shift, cy + q[1] * sy); }
      g.fill();
    }
  };
  for (const part of rig.parts) {
    if (part.kind === 'grid') {
      if (part.name === 'muzzle' || /foot$/.test(part.name)) continue;
      const R = rig.regions[part.region];
      const rx = Math.max(part.r[0], part.r[2]), ry = part.r[1];
      const W = (R.x1 - R.x0) * size;
      const head = part.name === 'head';
      const spacing = head ? 0.15 : 0.34;
      const rows = Math.floor(Math.PI * ry / spacing);
      for (let j = 0; j < rows; j++) {
        const v = (j + 0.5 + (rnd() - 0.5) * 0.4) / rows;
        const phi = v * Math.PI, sp = Math.sin(phi);
        if (sp < 0.2) continue;
        const ring = 2 * Math.PI * rx * sp;
        const cols = Math.max(1, Math.round(ring / spacing));
        const off = rnd();
        for (let i = 0; i < cols; i++) {
          const u = (i + off + (rnd() - 0.5) * 0.3) / cols;
          const th = (u - 0.5) * 2 * Math.PI;
          const l = [sp * Math.sin(th), Math.cos(phi), sp * Math.cos(th)];
          if (part.under(u, v, l) > 0.2) continue;
          if (head && (l[2] > 0.35 || l[1] > 0.6)) continue;
          const sx = W / ring, sy = (R.y1 - R.y0) * size / (Math.PI * ry);
          patch((R.x0 + (((u % 1) + 1) % 1) * (R.x1 - R.x0)) * size, (R.y0 + v * (R.y1 - R.y0)) * size, sx, sy, spacing * 0.44, W);
        }
      }
    } else {
      const ch = rig.arms[part.chain];
      if (ch.kind === 'ear' || ch.kind === 'horn') continue;
      const R = rig.regions[part.region];
      const W = (R.x1 - R.x0) * size, len = ch.len;
      const spacing = ch.kind === 'neck' ? 0.27 : ch.kind === 'tail' ? 0.16 : 0.2;
      const rows = Math.max(1, Math.floor(len / spacing));
      for (let j = 0; j < rows; j++) {
        const s = (j + 0.5 + (rnd() - 0.5) * 0.3) / rows;
        if (ch.kind === 'leg' && s > 0.72) continue;
        if (ch.kind === 'tail' && s > 0.6) continue;
        const ring = 2 * Math.PI * ch.radius(s);
        const cols = Math.max(2, Math.round(ring / spacing));
        const off = rnd();
        for (let i = 0; i < cols; i++) {
          const a = (i + off + (rnd() - 0.5) * 0.3) / cols;
          const c = Math.cos(a * 2 * Math.PI);
          if (ch.under(s, c) > 0.2 || ch.accent(s, c) > 0.3) continue;
          const sx = W / ring, sy = (R.y1 - R.y0) * 0.985 * size / len;
          const shrink = ch.kind === 'leg' ? 1 - 0.45 * s : 1;
          patch((R.x0 + (((a % 1) + 1) % 1) * (R.x1 - R.x0)) * size, (R.y0 + s * 0.985 * (R.y1 - R.y0)) * size, sx, sy, spacing * 0.42 * shrink, W);
        }
      }
    }
  }
}

/* a round sandy mat, and a chalk line to toss from */
function giraffeMat(g, toPx, k) {
  const [cx, cy] = toPx(0, 0.3);
  g.fillStyle = 'rgb(0,255,0)';
  g.beginPath(); g.ellipse(cx, cy, 4.2 * k, 4.2 * k, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgb(200,0,0)';
  g.lineWidth = 0.07 * k;
  g.setLineDash([0.2 * k, 0.14 * k]);
  g.beginPath(); g.arc(cx, cy, 1.55 * k, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  const [a, b] = toPx(-1.6, 4.9), [c] = toPx(1.6, 4.9);
  g.fillStyle = 'rgb(220,0,0)';
  g.fillRect(a, b - 0.05 * k, c - a, 0.1 * k);
}

/* ── the penguin ─────────────────────────────────────────────────────────── */

function penguinFace(g, size, P) {
  const { eyeRing, blob, stitch } = P;
  eyeRing('head', 0.092, 0.44, 0.2);
  g.globalCompositeOperation = 'lighter';
  blob('head', 0.5 - 0.17, 0.56, 0.13, 0.08, 'rgba(0,120,0,0.5)');
  blob('head', 0.5 + 0.17, 0.56, 0.13, 0.08, 'rgba(0,120,0,0.5)');
  // a seam down the beak, and the felt feet carry no fur (both of them)
  stitch('beak', [[0.5, 0.25], [0.5, 0.62]], 0.012);
  g.globalCompositeOperation = 'source-over';
  for (const part of P.rig.parts) {
    if (part.kind !== 'grid' || part.name !== 'foot') continue;
    const R = P.rig.regions[part.region];
    g.fillStyle = 'rgb(0,0,0)';
    g.fillRect(R.x0 * size, R.y0 * size, (R.x1 - R.x0) * size, (R.y1 - R.y0) * size);
  }
}

/* the beak is felt in the nose colour, all of it */
function penguinNose(g, size, P) {
  const R = P.reg('beak');
  g.fillStyle = 'rgb(0,255,0)';
  g.fillRect(R.x0 * size, R.y0 * size, (R.x1 - R.x0) * size, (R.y1 - R.y0) * size);
}

/* a little felt diamond: the dirt round the plate, the plate, the
   batter's boxes, foul lines out toward you, and the pitcher's mound */
function diamond(g, toPx, k) {
  const px = -2.5, pz = 0.32;
  const [cx, cy] = toPx(px, pz);
  g.fillStyle = 'rgb(0,255,0)';
  g.beginPath(); g.ellipse(cx, cy, 3.6 * k, 3.6 * k, 0, 0, Math.PI * 2); g.fill();
  const [mx, my] = toPx(0.4, 11);
  g.beginPath(); g.ellipse(mx, my, 1.6 * k, 1.6 * k, 0, 0, Math.PI * 2); g.fill();
  // the plate: a pentagon, its point toward the catcher (−z)
  g.fillStyle = 'rgb(255,0,0)';
  g.beginPath();
  for (const [x, z] of [[-0.28, 0.2], [0.28, 0.2], [0.28, -0.05], [0, -0.3], [-0.28, -0.05]]) {
    const [a, b] = toPx(px + x, pz + z);
    g.lineTo(a, b);
  }
  g.closePath(); g.fill();
  // the batter's boxes, either side
  g.strokeStyle = 'rgb(220,0,0)';
  g.lineWidth = 0.06 * k;
  for (const s of [-1, 1]) {
    const [a, b] = toPx(px + s * 0.55 - (s < 0 ? 1.0 : 0), pz - 1.0);
    g.strokeRect(a, b, 1.0 * k, 2.0 * k);
  }
  // foul lines from the plate out toward the pitcher's side
  g.lineWidth = 0.08 * k;
  for (const s of [-1, 1]) {
    const [a, b] = toPx(px, pz), [c, d] = toPx(px + s * 20 * Math.sin(0.6), pz + 20 * Math.cos(0.6));
    g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke();
  }
  // the rubber on the mound
  const [ra, rb] = toPx(0.1, 10.95), [rc, rd] = toPx(0.7, 11.05);
  g.fillStyle = 'rgb(255,0,0)';
  g.fillRect(ra, rb, rc - ra, rd - rb);
}

/* ── the otter ───────────────────────────────────────────────────────────── */

function otterFace(g, size, P) {
  const { eyeRing, blob, stitch } = P;
  eyeRing('head', 0.105, 0.46, 0.18);
  g.globalCompositeOperation = 'source-over';
  nosePad(g, P, 'muzzle', 0.5, 0.3, 0.15, 0.13, 'rgb(0,0,0)');
  g.globalCompositeOperation = 'lighter';
  stitch('muzzle', [[0.5, 0.36], [0.5, 0.5]], 0.022);
  stitch('muzzle', [[0.42, 0.56], [0.46, 0.57], [0.5, 0.5], [0.54, 0.57], [0.58, 0.56]], 0.022);
  // whisker dots on the pads
  for (const s of [-1, 1])
    for (const [du, dv] of [[0.1, 0.38], [0.13, 0.45], [0.09, 0.47], [0.12, 0.53]]) blob('muzzle', 0.5 + s * du, dv, 0.026, 0.026, 'rgb(0,0,190)');
  blob('head', 0.5 - 0.17, 0.6, 0.11, 0.07, 'rgba(0,110,0,0.45)');
  blob('head', 0.5 + 0.17, 0.6, 0.11, 0.07, 'rgba(0,110,0,0.45)');
}

function otterNose(g, size, P) {
  nosePad(g, P, 'muzzle', 0.5, 0.3, 0.145, 0.125, 'rgb(0,255,0)');
}

/* a round blue felt pond-mat, and a ripple stitched round where he sits */
function otterMat(g, toPx, k) {
  const [cx, cy] = toPx(0, 0.4);
  g.fillStyle = 'rgb(0,255,0)';
  g.beginPath(); g.ellipse(cx, cy, 3.9 * k, 3.4 * k, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgb(200,0,0)';
  g.lineWidth = 0.06 * k;
  g.setLineDash([0.2 * k, 0.14 * k]);
  for (const r of [1.3, 2.1]) { g.beginPath(); g.ellipse(cx, cy - 0.3 * k, r * k, r * 0.88 * k, 0, 0, Math.PI * 2); g.stroke(); }
  g.setLineDash([]);
}

/* ── the pandas ──────────────────────────────────────────────────────────── */

function pandaFace(g, size, P) {
  const { eyeRing, blob, stitch } = P;
  for (const [head, muzzle] of [['head', 'muzzle'], ['head b', 'muzzle b']]) {
    eyeRing(head, 0.088, 0.47, 0.13);
    g.globalCompositeOperation = 'source-over';
    nosePad(g, P, muzzle, 0.5, 0.31, 0.16, 0.17, 'rgb(0,0,0)');
    g.globalCompositeOperation = 'lighter';
    stitch(muzzle, [[0.5, 0.4], [0.5, 0.53]], 0.03);
    stitch(muzzle, [[0.42, 0.58], [0.46, 0.585], [0.5, 0.53], [0.54, 0.585], [0.58, 0.58]], 0.03);
    blob(head, 0.5 - 0.2, 0.6, 0.13, 0.08, 'rgba(0,120,0,0.5)');
    blob(head, 0.5 + 0.2, 0.6, 0.13, 0.08, 'rgba(0,120,0,0.5)');
  }
}

/* the eye patches: a black teardrop tilted down and out round each eye,
   with a ring of white felt left round the bead */
function pandaPattern(g, size, P) {
  for (const head of ['head', 'head b']) {
    for (const s of [-1, 1]) {
      // an oval, longer down and out from the eye than above it
      P.blob(head, 0.5 + s * 0.1, 0.49, 0.38, 0.33, 'rgb(255,0,0)');
      P.blob(head, 0.5 + s * 0.12, 0.54, 0.3, 0.26, 'rgb(255,0,0)');
      g.globalCompositeOperation = 'destination-out';
      P.blob(head, 0.5 + s * 0.088, 0.47, 0.135, 0.135, 'rgb(255,0,0)');
      g.globalCompositeOperation = 'lighter';
    }
  }
}

function pandaNose(g, size, P) {
  for (const m of ['muzzle', 'muzzle b']) nosePad(g, P, m, 0.5, 0.31, 0.155, 0.165, 'rgb(0,255,0)');
}

/* the dohyo: a round platform of clay, the starting lines, and the rope
   (a prop: it stands up off the floor) */
function dohyo(g, toPx, k) {
  const [cx, cy] = toPx(0, 0);
  g.fillStyle = 'rgb(0,255,0)';
  g.beginPath(); g.ellipse(cx, cy, 4.4 * k, 4.4 * k, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgb(255,0,0)';
  for (const s of [-1, 1]) {
    const [a, b] = toPx(s * 0.55 - 0.05, -0.45), [c, d] = toPx(s * 0.55 + 0.05, 0.45);
    g.fillRect(a, b, c - a, d - b);
  }
  // a faint brushed ring of sand just outside the rope
  g.strokeStyle = 'rgb(90,0,0)';
  g.lineWidth = 0.25 * k;
  g.beginPath(); g.ellipse(cx, cy, 3.75 * k, 3.75 * k, 0, 0, Math.PI * 2); g.stroke();
}
