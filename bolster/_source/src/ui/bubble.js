/* Speech bubbles, hand-cut from cardboard.

   Everything a fighter says is a comic bubble glued onto a scrap of kraft
   card that someone cut out with scissors: the card is an irregular polygon
   of straight, sharp cuts (10–16 of them, uneven, a few nicks where the
   scissors went in at an angle) reaching past the bubble all round, with a
   tail cut out toward the speaker; corrugation shows faintly through, the
   cut edge is darker, and it casts a soft shadow as if lying on the screen.
   On it the bubble: cream paper, a thick wobbly marker outline with a
   second sketchy pass a little out of register, a halftone shadow on its
   lower right, a couple of shine ticks, and hand-lettered text (Gochi Hand,
   embedded) with a wandering baseline and every letter turned a little.

   Each one is generated fresh (cosmetic randomness: Math.random is fine
   here) — no two the same — tilted a few degrees, and slapped down with a
   squash and settle.                                                      */

const SVGNS = 'http://www.w3.org/2000/svg';
const FONT = '"Bolster Hand", "Comic Sans MS", cursive';
let uid = 0;

const R = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let _ctx;
function measure(text, size) {
  _ctx = _ctx || document.createElement('canvas').getContext('2d');
  _ctx.font = `${size}px ${FONT}`;
  return _ctx.measureText(text).width;
}

function wrap(text, size, maxW) {
  const words = text.split(/\s+/), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (measure(t, size) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

/* a closed path through points, smoothed (Catmull-Rom → cubic Béziers) */
function smoothPath(P) {
  const n = P.length;
  let d = `M${P[0][0].toFixed(1)},${P[0][1].toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + 'Z';
}

/* a straight-cut polygon */
const polyPath = (P) => 'M' + P.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L') + 'Z';

/* the bubble's outline: a wobbly ellipse with a tail toward `tip` */
function bubbleShape(cx, cy, rx, ry, tip, wob = 0.022, tailW = 0.34) {
  const ta = Math.atan2((tip[1] - cy) / ry, (tip[0] - cx) / rx);
  const N = 46, P = [];
  const ph = R(0, 6.28), ph2 = R(0, 6.28);
  let placed = false;
  for (let k = 0; k < N; k++) {
    const a = ta + tailW / 2 + (k / N) * (Math.PI * 2 - tailW);
    const w = 1 + wob * Math.sin(a * 3 + ph) + wob * 0.6 * Math.sin(a * 7 + ph2) + R(-wob, wob) * 0.4;
    P.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
    if (k === N - 1 && !placed) { P.push([tip[0], tip[1]]); placed = true; }
  }
  return P;
}

/* the card: a ring of straight scissor cuts around the bubble, a tail, nicks */
function cardShape(cx, cy, rx, ry, tip) {
  const n = Math.floor(R(10, 15));
  const ta = Math.atan2((tip[1] - cy) / ry, (tip[0] - cx) / rx);
  const tailHalf = 0.34;
  const ang = [];
  // spread the cuts unevenly round the free part of the circle
  const span = Math.PI * 2 - tailHalf * 2;
  let acc = 0;
  const steps = [];
  for (let k = 0; k < n; k++) steps.push(R(0.55, 1.45));
  const tot = steps.reduce((s, v) => s + v, 0);
  for (let k = 0; k < n; k++) { acc += steps[k] / tot * span; ang.push(ta + tailHalf + acc - steps[k] / tot * span * R(0.3, 0.7)); }
  const P = [];
  // where the tail leaves the card: two corners either side, cut out to the tip
  const base = (a, m) => [cx + Math.cos(a) * (rx + m), cy + Math.sin(a) * (ry + m)];
  P.push(base(ta + tailHalf * R(0.85, 1.15), R(12, 20)));
  const nicks = new Set();
  while (nicks.size < 3) nicks.add(Math.floor(R(1, n - 1)));
  ang.forEach((a, k) => {
    const m = R(16, 34);
    P.push(base(a, m));
    if (nicks.has(k)) {
      // a nick: the scissors went in at an angle and came back out
      const a2 = a + R(0.08, 0.16), m2 = m - R(7, 13);
      P.push([cx + Math.cos(a2) * (rx + m2) + R(-3, 3), cy + Math.sin(a2) * (ry + m2) + R(-3, 3)]);
    }
  });
  P.push(base(ta - tailHalf * R(0.85, 1.15), R(12, 20)));
  // the tail: out past the bubble's own tip, a little crooked
  const tx = tip[0] - cx, ty = tip[1] - cy, tl = Math.hypot(tx, ty) || 1;
  const ux = tx / tl, uy = ty / tl;
  P.push([tip[0] + ux * R(14, 22) + -uy * R(-8, 8), tip[1] + uy * R(14, 22) + ux * R(-8, 8)]);
  return P;
}

const el = (name, attrs = {}, parent = null) => {
  const e = document.createElementNS(SVGNS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

/* make a bubble. `tail` is where the speaker is, relative to the bubble:
   'down-left', 'down-right', 'down', 'left', 'right'. Returns a positioned
   element whose tail tip sits at (0, 0) of its own box (see place()). */
export function makeBubble(text, { size = 26, maxWidth = 300, tail = 'down-left' } = {}) {
  const id = 'b' + uid++;
  const lines = wrap(text, size, maxWidth);
  const lh = size * 1.12;
  const tw = Math.max(...lines.map((l) => measure(l, size))) + size * 0.4;
  const th = lines.length * lh;
  const rx = Math.max(tw * 0.62 + 22, 70), ry = Math.max(th * 0.72 + 20, 42);
  const pad = 60;
  const W = rx * 2 + pad * 2, Hh = ry * 2 + pad * 2 + 70;
  const cx = W / 2, cy = pad + ry;
  const tailDir = {
    'down-left': [-0.55, 1], 'down-right': [0.55, 1], down: [R(-0.15, 0.15), 1], left: [-1, 0.45], right: [1, 0.45],
  }[tail] || [-0.5, 1];
  const tdl = Math.hypot(...tailDir);
  const reach = 1 + 46 / Math.min(rx, ry);
  const tip = [cx + (tailDir[0] / tdl) * rx * reach * 1.02, cy + (tailDir[1] / tdl) * ry * reach + 30];

  const svg = el('svg', { width: W, height: Hh + 30, viewBox: `0 0 ${W} ${Hh + 30}`, role: 'img', 'aria-label': text });
  const defs = el('defs', {}, svg);
  // soft shadow beneath the card
  const f = el('filter', { id: id + 'sh', x: '-20%', y: '-20%', width: '140%', height: '150%' }, defs);
  el('feDropShadow', { dx: 3, dy: 6, stdDeviation: 4.5, 'flood-color': '#2b1d10', 'flood-opacity': 0.38 }, f);
  // kraft: a mottled fill, corrugation ribs, fibres
  const lg = el('linearGradient', { id: id + 'kr', x1: R(0, 0.3), y1: 0, x2: R(0.7, 1), y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': pick(['#c29a68', '#bf9663', '#c49d6b']) }, lg);
  el('stop', { offset: R(0.35, 0.6), 'stop-color': '#b98f5e' }, lg);
  el('stop', { offset: 1, 'stop-color': pick(['#ab8150', '#a87d4d', '#b08654']) }, lg);
  const ribA = R(-8, 8) + (Math.random() < 0.5 ? 0 : 90);
  const rib = el('pattern', { id: id + 'rib', width: 9, height: 9, patternUnits: 'userSpaceOnUse', patternTransform: `rotate(${ribA.toFixed(1)})` }, defs);
  el('rect', { x: 0, y: 0, width: 4.2, height: 9, fill: '#7a5428', opacity: 0.09 }, rib);
  el('rect', { x: 4.6, y: 0, width: 1.2, height: 9, fill: '#e3c18f', opacity: 0.13 }, rib);
  // halftone dots for the bubble's shadow
  const ht = el('pattern', { id: id + 'ht', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(20)' }, defs);
  el('circle', { cx: 3, cy: 3, r: 1.55, fill: '#161210' }, ht);

  const g = el('g', {}, svg);
  // ── the card ────────────────────────────────────────────────────────────
  const C = cardShape(cx, cy, rx, ry, tip);
  const cd = polyPath(C);
  el('path', { d: cd, fill: `url(#${id}kr)`, filter: `url(#${id}sh)` }, g);
  el('path', { d: cd, fill: `url(#${id}rib)` }, g);
  // a few darker fibres and a scuff
  for (let k = 0; k < 7; k++) {
    const x = cx + R(-rx, rx), y = cy + R(-ry, ry), a = R(0, Math.PI), l = R(6, 16);
    el('line', { x1: x, y1: y, x2: x + Math.cos(a) * l, y2: y + Math.sin(a) * l, stroke: '#6e4b25', 'stroke-width': 0.8, opacity: 0.25 }, g);
  }
  // the raw cut edge: darker, a hair of exposed fluting inside it
  el('path', { d: cd, fill: 'none', stroke: '#8a6236', 'stroke-width': 3.2, 'stroke-linejoin': 'miter', 'stroke-miterlimit': 10 }, g);
  el('path', { d: cd, fill: 'none', stroke: '#d9b682', 'stroke-width': 1, opacity: 0.5, transform: `translate(${R(0.6, 1.2)},${R(0.6, 1.2)})` }, g);

  // ── the bubble ──────────────────────────────────────────────────────────
  const bT = [tip[0] - (tailDir[0] / tdl) * 10, tip[1] - (tailDir[1] / tdl) * 12];
  const B = bubbleShape(cx, cy, rx, ry, bT);
  const bd = smoothPath(B);
  el('path', { d: bd, fill: `url(#${id}ht)`, transform: `translate(${R(6, 8)},${R(7, 9)})` }, g);
  el('path', { d: bd, fill: '#fbf5e4' }, g);
  // the marker: a thick wobbly pass…
  el('path', { d: bd, fill: 'none', stroke: '#141110', 'stroke-width': R(4.6, 5.6), 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }, g);
  // …and a second, sketchier one, out of register
  const B2 = bubbleShape(cx + R(-2.5, 2.5), cy + R(-2, 2), rx * R(0.985, 1.015), ry * R(0.98, 1.02), [bT[0] + R(-3, 3), bT[1] + R(-3, 3)], 0.03);
  const p2 = el('path', { d: smoothPath(B2), fill: 'none', stroke: '#141110', 'stroke-width': R(1.4, 2.1), opacity: 0.8, 'stroke-linecap': 'round' }, g);
  // leave the second pass open in a place or two, as a hand would
  p2.setAttribute('stroke-dasharray', `${R(180, 320).toFixed(0)} ${R(10, 26).toFixed(0)} ${R(260, 500).toFixed(0)} ${R(8, 18).toFixed(0)}`);
  // shine ticks near the top corners
  const tick = (a, len, w) => {
    const x0 = cx + Math.cos(a) * rx * 0.8, y0 = cy + Math.sin(a) * ry * 0.74;
    const x1 = cx + Math.cos(a + len) * rx * 0.8, y1 = cy + Math.sin(a + len) * ry * 0.74;
    el('path', { d: `M${x0.toFixed(1)},${y0.toFixed(1)} Q${(cx + Math.cos(a + len / 2) * rx * 0.86).toFixed(1)},${(cy + Math.sin(a + len / 2) * ry * 0.8).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`, fill: 'none', stroke: '#141110', 'stroke-width': w, 'stroke-linecap': 'round' }, g);
  };
  tick(R(-2.75, -2.55), R(0.18, 0.26), 3.2);
  tick(R(-2.35, -2.2), R(0.06, 0.09), 3.2);
  if (Math.random() < 0.7) tick(R(-0.7, -0.55), R(0.08, 0.14), 2.6);

  // ── the lettering ───────────────────────────────────────────────────────
  const tg = el('g', { fill: '#1a1512', 'font-family': FONT, 'font-size': size }, g);
  const y0 = cy - th / 2 + size * 0.86;
  lines.forEach((line, li) => {
    const t = el('text', { x: cx, y: y0 + li * lh, 'text-anchor': 'middle' }, tg);
    const chars = [...line];
    const rot = [], dy = [];
    let prev = 0;
    for (let k = 0; k < chars.length; k++) {
      rot.push(R(-2.8, 2.8).toFixed(1));
      const o = Math.sin(k * 0.9 + li * 2 + R(0, 0.4)) * 1.2 + R(-0.9, 0.9);
      dy.push((o - prev).toFixed(2));
      prev = o;
    }
    t.setAttribute('rotate', rot.join(' '));
    t.setAttribute('dy', dy.join(' '));
    t.textContent = line;
  });

  const box = document.createElement('div');
  box.className = 'bubble slap';
  const tilt = R(2, 5) * (Math.random() < 0.5 ? -1 : 1);
  box.style.setProperty('--rot', `${tilt.toFixed(1)}deg`);
  // its tail tip (the card's) is the anchor
  const anchor = C[C.length - 1];
  box.style.setProperty('--ox', `${anchor[0]}px`);
  box.style.setProperty('--oy', `${anchor[1]}px`);
  box.dataset.ax = anchor[0]; box.dataset.ay = anchor[1];
  box.appendChild(svg);
  return box;
}

/* put a bubble's tail tip at screen point (x, y), scaled to fit */
export function place(box, x, y, scale = 1) {
  const ax = +box.dataset.ax, ay = +box.dataset.ay;
  box.style.left = `${x - ax}px`;
  box.style.top = `${y - ay}px`;
  box.firstChild.style.transform = scale !== 1 ? `scale(${scale})` : '';
  box.firstChild.style.transformOrigin = `${ax}px ${ay}px`;
}

/* show one for a while, then let it go */
export function say(layer, text, x, y, { size = 26, maxWidth = 300, tail = 'down-left', ms = 1800, scale = 1 } = {}) {
  const b = makeBubble(text, { size, maxWidth, tail });
  layer.appendChild(b);
  place(b, x, y, scale);
  if (ms > 0) setTimeout(() => { b.classList.remove('slap'); b.classList.add('out'); setTimeout(() => b.remove(), 320); }, ms);
  return b;
}
