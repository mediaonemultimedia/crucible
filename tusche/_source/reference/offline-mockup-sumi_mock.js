// sumi_mock.js: a 5-second loop, a reference mock-up for a possible Crucible piece: sumi-e brushwork on off-white paper.
// Black ink, red blossoms, gold. A loaded brush lays down a plum branch (a cursor gesture in the real piece), blossoms
// bleed open along it, petals drift, then everything sinks back into the paper and the loop starts again.
// Render: node render.mjs --loop=sumi --clip --out=out/sumi.mp4   ·   studio.html?loop=sumi
(() => {
  const SUMI = '#1E1B1A', GREY = '#6A6460', MIST = '#B9B2A8', RED = '#C8323C', PINK = '#EE8C93', GOLD = '#C9973A', GOLDLT = '#E2BD6A';
  const LEN = 5, T_FADE = 4.25;

  // the branch: one sweeping gesture, upper left down into the middle (an S like a calligraphic stroke)
  const BR = through([[150, 70], [300, 170], [420, 240], [520, 330], [600, 450], [700, 520], [850, 560], [980, 640]], 8);
  const brAt = f => BR[Math.min(BR.length - 1, Math.floor(f * (BR.length - 1)))];
  const brushK = t => easeOut(seg(t, .15, 1.5));       // how much of the branch is painted
  // blossoms pinned along the branch: [fraction, dx, dy, size, red?]
  const BLOOMS = [[.22, -26, -28, 1.0, 1], [.27, 20, 6, .8, 0], [.44, 34, -18, 1.25, 1], [.48, -10, 30, .9, 0], [.52, 46, 26, 1.1, 1],
                  [.66, -30, -26, .75, 0], [.78, 18, -34, 1.0, 1], [.83, 40, 10, .7, 0], [.97, 22, -20, .85, 1]];

  function blossom(x, y, s, red, k, seed) {           // five soft petals that bleed open, then ink stamens
    if (k <= 0) return;
    const r = 44 * s * backOut(k), col = red ? RED : PINK;
    for (let p = 0; p < 5; p++) {
      boilSeed('bl' + seed + 'p' + p);
      const a = p * TAU / 5 + seed, px = x + Math.cos(a) * r * .62, py = y + Math.sin(a) * r * .62;
      paint(ellPts(px, py, r * .55, r * .45, 14, 1.5, a), { fill: col, fillOp: 170 + 60 * hash(seed + p), bleed: .22, tex: .7, ink: null });
    }
    boilSeed('bl' + seed + 'c');
    paint(ellPts(x, y, r * .28, r * .28, 10, .8), { fill: mixCol(col, SUMI, .35), fillOp: 120, bleed: .1, ink: null });
    if (k > .55) for (let i = 0; i < 7; i++) {          // stamens: quick flicks with a dot
      const a = i * TAU / 7 + seed * 2, l = r * (.55 + .2 * hash(seed + i)), q = seg(k, .55, 1);
      inkLine([[x, y], [x + Math.cos(a) * l * q, y + Math.sin(a) * l * q]], .5, SUMI, 'inkfine', 0);
      if (q > .9) paint(ellPts(x + Math.cos(a) * l, y + Math.sin(a) * l, 2.2, 2.2, 6, .2), { wash: SUMI, ink: null });
    }
  }

  // a brush mark: swells in fast from the touch-down, then tapers to a dry tail
  function brushStroke(P, W) {
    const C = through(P), n = C.length, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const f = i / Math.max(1, n - 1), a = C[Math.max(0, i - 1)], b = C[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1;
      const w = W / 2 * Math.sin(Math.min(1, f / .12) * Math.PI / 2) * (1 - .85 * f) + .6;
      L.push([C[i][0] - dy / d * w, C[i][1] + dx / d * w]); R.push([C[i][0] + dy / d * w, C[i][1] - dx / d * w]);
    }
    return L.concat(R.reverse());
  }

  LOOPS.sumi = t => {
    const fade = 1 - easeIn(seg(t, T_FADE, LEN - .05));   // the branch and blossoms sink back into the paper
    camBegin(960 + 10 * Math.sin(t * TAU / LEN), 540, 1.01);

    // gold sun: a soft wet disc, slightly uneven
    boilSeed('sun');
    paint(ellPts(1500, 230, 112, 108, 30, 3), { wash: GOLDLT, washOp: 150, fill: GOLD, fillOp: 230, bleed: .2, tex: .8, ink: null });
    paint(ellPts(1490, 220, 70, 66, 24, 2), { fill: GOLDLT, fillOp: 90, bleed: .25, tex: .5, ink: null });

    // the mountain: dry-brush strokes raking down from a snow-white peak, grey washes pooling at the base
    boilSeed('mtnwash');
    paint([[1100, 840], [1400, 470], [1540, 470], [1860, 840]], { fill: MIST, fillOp: 120, bleed: .3, tex: .8, ink: null });
    for (let i = 0; i < 64; i++) {                       // brush rakes under the ridge: vertical at the centre, following the slope at the edges
      boilSeed('mtn' + i);
      const sgn = hash(i) < .5 ? -1 : 1, sp = sgn * Math.sqrt(hash(i + 1)), x0 = 1470 + sp * 380;
      const y0 = Math.max(400 + .62 * Math.abs(x0 - 1470), 468 + 30 * hash(i + 7)) + 6;        // the snow cap stays bare paper
      const ang = Math.PI / 2 - sp * (.95 + .1 * hash(i + 6)), len = Math.max(30, (835 - y0) / Math.sin(ang)) * (.5 + .5 * hash(i + 2));
      const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len, dark = hash(i + 5);
      paint(brushStroke([[x0, y0], [lerp(x0, x1, .5) + sgn * 4, lerp(y0, y1, .5)], [x1, y1]], 10 + 26 * hash(i + 3)),
        { wash: mixCol(SUMI, MIST, .12 + .6 * (1 - dark) + .2 * Math.abs(sp)), washOp: 130 + 110 * dark, fill: SUMI, fillOp: 40, bleed: .1, tex: .95, ink: null });
    }
    for (let i = 0; i < 4; i++) {                        // mist bands with a thread of gold, like a vein in the wash
      boilSeed('mist' + i);
      const y = 800 + i * 42, x = 900 + 240 * hash(i + 20);
      paint(ellPts(x + 300, y, 520 + 160 * hash(i), 26 + 10 * hash(i + 1), 26, 6), { fill: i % 2 ? MIST : GREY, fillOp: 55, bleed: .35, tex: .9, ink: null });
    }
    boilSeed('gold');
    inkLine(through([[860, 830], [1020, 812], [1180, 836], [1340, 806], [1520, 828], [1700, 810], [1860, 826]]), 1.1, GOLD, 'inkfine', .6);

    // the branch: one loaded stroke, black wash core with grey bleed, dry-brush bristle streaks along its edges
    const bk = brushK(t);
    if (bk > 0) {
      const n = Math.max(2, Math.floor(bk * (BR.length - 1)) + 1), P = BR.slice(0, n);
            boilSeed('branch');
      paint(ribbon(P, 40, lerp(40, 4, bk)), { wash: SUMI, washOp: 235, fill: GREY, fillOp: 120, bleed: .12, tex: .9, ink: null });
      for (let s = 0; s < 5; s++) {                      // bristles: offset dry strokes that break up toward the tail
        boilSeed('bristle' + s);
        const off = (s - 2) * 6;
        inkLine(P.map(([x, y], i) => [x + off * .4, y + off + 3 * Math.sin(i * .7 + s)]), 1.2 + hash(s), mixCol(SUMI, GREY, .3 * hash(s + 2)), 'dry', .2);
      }
      for (const [f, dx, dy] of [[.3, -60, -50], [.58, 70, -70], [.74, -50, 60], [.9, 60, 40]]) {   // twigs flick off once the brush passes
        if (bk < f) continue;
        boilSeed('twig' + f);
        const [x, y] = brAt(f), q = easeOut(seg(bk, f, f + .15));
        inkLine([[x, y], [x + dx * .45 * q + dy * .15 * q, y + dy * .45 * q - dx * .1 * q], [x + dx * 1.6 * q, y + dy * 1.6 * q]], 1.3, SUMI, 'dry', .8);
      }
      // blossoms open one after another behind the brush
      BLOOMS.forEach(([f, dx, dy, s, red], i) => {
        const [x, y] = brAt(f), k = seg(t, .9 + f * 1.1 + .05 * i, 1.6 + f * 1.1 + .05 * i);
        blossom(x + dx, y + dy, s, red, k, i + 1);
        if (k > .2) for (let j = 0; j < 6; j++) {         // splatter from the loaded brush
          boilSeed('spl' + i + j);
          const a = hash(i * 9 + j) * TAU, d = 40 + 60 * hash(i * 7 + j);
          paint(ellPts(x + dx + Math.cos(a) * d, y + dy + Math.sin(a) * d, 1.5 + 2.5 * hash(j + i), 1.5 + 2.5 * hash(j + i), 6, .2), { wash: red ? RED : PINK, washOp: 170, ink: null });
        }
      });
      // loose petals drifting down and right
      for (let i = 0; i < 12; i++) {
        const a0 = 1.4 + hash(i + 40) * 1.8, q = t - a0;
        if (q < 0) continue;
        boilSeed('petal' + i);
        const [sx, sy] = brAt(.2 + .75 * hash(i + 50)), x = sx + q * 90 + 30 * Math.sin(q * 2.4 + i), y = sy + q * 70;
        paint(ellPts(x, y, 9, 6, 10, .5, q * 2 + i), { fill: hash(i) > .5 ? RED : PINK, fillOp: 180, bleed: .15, ink: null });
      }
    }
    if (fade < 1) {                                      // the ink sinks back: a veil of paper washes over the branch side
      boilSeed('veil');
      paint(rectPts(-200, -200, 1260, 960), { wash: PAL.paper, washOp: 255 * (1 - fade), ink: null });
    }

    // the seal: a red square stamp, abstract marks only (no characters)
    boilSeed('seal');
    paint(rrPts(1700, 900, 70, 70, 6, 1), { wash: RED, washOp: 220, ink: null });
    for (const [x0, y0, x1, y1] of [[1712, 916, 1756, 916], [1734, 912, 1734, 952], [1714, 940, 1752, 958]]) inkLine([[x0, y0], [x1, y1]], 1.6, PAL.paper, 'ink', 0);
    camEnd();

    // the brush itself, while it paints: a bamboo shaft with a black tip, lifting away at the end of the stroke
    if (t > .1 && t < 1.85) {
      const [x, y] = brAt(bk), lift = seg(t, 1.45, 1.85);
      boilSeed('brush');
      inkLine([[x + 8, y - 14 - 60 * lift], [x + 110, y - 200 - 60 * lift]], 5, '#B8915A', 'ink', 0);
      paint(ribbon([[x, y - 60 * lift], [x + 4, y - 8 - 60 * lift], [x + 14, y - 30 - 60 * lift]], 3, 16), { wash: SUMI, ink: null });
    }
  };
  LOOPS.sumi.len = LEN;
})();
