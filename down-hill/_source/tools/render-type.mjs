/* The overhaul's display type, pre-rendered from Kevin's Adobe Fonts (installed
   locally) into transparent PNGs. Adobe's licence allows images made with the
   fonts, not embedding the fonts, so the game ships only these PNGs, never a
   font file or an Adobe family name.

     node tools/render-type.mjs                 → src/assets/type/*.png + index.js
     node tools/render-type.mjs --specimen OUT  → a specimen sheet PNG

   The look follows Kevin's title refs: chunky letters, a thick dark outline, a
   3D extrude, a candy gradient fill, a glossy top highlight, letters that tilt
   and bounce. Every face falls back to Lilita One if the family is missing, so
   one re-run after activating the fonts fixes the art.                       */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'src/assets/type');

// palettes: [top, bottom, extrude, outline, gloss alpha]
export const PAL = {
  candy: ['#ffe46b', '#ff8a1e', '#c2410c', '#26113d', 0.6],
  berry: ['#ff9ad5', '#ff2e84', '#a3104f', '#26113d', 0.55],
  mint: ['#b8ffde', '#1fd39a', '#0b7d5f', '#10233a', 0.55],
  sky: ['#b8ecff', '#2e9bff', '#1b4fb3', '#13163d', 0.55],
  grape: ['#e2c2ff', '#9b4dff', '#5a1fb0', '#1c0f3a', 0.5],
  cherry: ['#ffb0a0', '#ff2f3d', '#a3101c', '#2a0d18', 0.5],
  gold: ['#fff6b0', '#ffc21a', '#b86e00', '#2b1606', 0.6],
  silver: ['#ffffff', '#b9c6dd', '#5f6f8f', '#18203a', 0.6],
  bronze: ['#ffd2a6', '#e07a35', '#8a3e12', '#2a1206', 0.5],
  cream: ['#ffffff', '#ffe9c4', '#c9925a', '#26113d', 0.5],
  ink: ['#4a4f6a', '#2a2d44', '#11131f', '#0b0c16', 0.25],
};

const F = { wordmark: 'Snicker', head: 'Snicker', ruddy: 'Ruddy', comic: 'CCBiffBamBoom', smash: 'CCSmash', label: 'Chaloops', small: 'Brevia', fun: 'Snicker' };

// id, text, face, px, palette, opts
const ART = [
  ['wordmark-1', 'FLUFFED', 'wordmark', 190, 'candy', { tilt: 0.09, bounce: 10, extrude: 18, outline: 13 }],
  ['wordmark-amp', '&', 'wordmark', 150, 'berry', { tilt: 0.2, extrude: 14, outline: 12 }],
  ['wordmark-2', 'FURIOUS', 'wordmark', 190, 'berry', { tilt: 0.09, bounce: 10, extrude: 18, outline: 13, seed: 3 }],
  ['count-3', '3', 'smash', 300, 'cherry', { extrude: 22, outline: 16 }],
  ['count-2', '2', 'smash', 300, 'gold', { extrude: 22, outline: 16 }],
  ['count-1', '1', 'smash', 300, 'mint', { extrude: 22, outline: 16 }],
  ['count-go', 'GO!', 'smash', 300, 'candy', { extrude: 24, outline: 18, tilt: 0.12 }],
  ...['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'].map((t, i) => [`place-${i + 1}`, t, 'smash', 150,
    ['gold', 'silver', 'bronze', 'sky', 'sky', 'grape', 'grape', 'grape'][i], { extrude: 12, outline: 11, tilt: 0.05, small: 0.55 }]),
  ['final-lap', 'FINAL LAP!', 'head', 130, 'cherry', { extrude: 12, outline: 11, tilt: 0.07 }],
  ['wrong-way', 'WRONG WAY!', 'smash', 120, 'gold', { extrude: 10, outline: 11, tilt: 0.06 }],
  ['wallop-now', 'WALLOP NOW!', 'comic', 96, 'berry', { extrude: 8, outline: 9, tilt: 0.1 }],
  ['shortcut-open', 'SHORTCUT OPEN', 'head', 90, 'mint', { extrude: 8, outline: 9, tilt: 0.05 }],
  ['pow', 'POW!', 'comic', 150, 'gold', { extrude: 12, outline: 12, tilt: 0.16 }],
  ['bonk', 'BONK!', 'comic', 150, 'sky', { extrude: 12, outline: 12, tilt: 0.16, seed: 2 }],
  ['splat', 'SPLAT!', 'comic', 150, 'mint', { extrude: 12, outline: 12, tilt: 0.16, seed: 4 }],
  ['whump', 'WHUMP!', 'comic', 150, 'berry', { extrude: 12, outline: 12, tilt: 0.16, seed: 5 }],
  ['smashed', 'SMASHED!', 'comic', 140, 'cherry', { extrude: 12, outline: 12, tilt: 0.14, seed: 6 }],
  ['overtake', 'OVERTAKE!', 'comic', 120, 'candy', { extrude: 10, outline: 11, tilt: 0.1, seed: 7 }],
  ['mini-turbo', 'MINI-TURBO!', 'comic', 110, 'sky', { extrude: 10, outline: 10, tilt: 0.1, seed: 8 }],
  ['super-turbo', 'SUPER TURBO!', 'comic', 110, 'grape', { extrude: 10, outline: 10, tilt: 0.1, seed: 9 }],
  ['style-boost', 'STYLE BOOST!', 'comic', 110, 'gold', { extrude: 10, outline: 10, tilt: 0.1, seed: 1 }],
  ['h-pick', 'PICK YOUR RACER', 'head', 110, 'candy', { extrude: 10, outline: 10, tilt: 0.05 }],
  ['h-setup', 'RACE SETUP', 'head', 110, 'sky', { extrude: 10, outline: 10, tilt: 0.05 }],
  ['h-results', 'RESULTS', 'head', 120, 'gold', { extrude: 11, outline: 11, tilt: 0.06 }],
  ['h-howto', 'HOW TO PLAY', 'head', 100, 'mint', { extrude: 9, outline: 10, tilt: 0.05 }],
  ['press-start', 'PRESS START', 'head', 96, 'cream', { extrude: 9, outline: 10, tilt: 0.04 }],
  ['b-start', 'START!', 'head', 96, 'mint', { extrude: 8, outline: 9, tilt: 0.04 }],
  ['b-next', 'NEXT', 'head', 90, 'mint', { extrude: 8, outline: 9 }],
  ['b-retry', 'RETRY', 'head', 90, 'gold', { extrude: 8, outline: 9 }],
  ['c-landing', 'The Landing', 'label', 110, 'candy', { extrude: 9, outline: 10, tilt: 0.07 }],
  ['c-laundry', 'Centre Court', 'label', 110, 'gold', { extrude: 9, outline: 10, tilt: 0.07 }],
  ['c-hockey', 'Rink 88', 'label', 110, 'sky', { extrude: 9, outline: 10, tilt: 0.07 }],
  ['c-park', "Rubberta's Rapids", 'label', 100, 'mint', { extrude: 9, outline: 10, tilt: 0.07 }],
  ['c-dojo', 'Midnight Dojo', 'label', 110, 'grape', { extrude: 9, outline: 10, tilt: 0.07 }],
  ...[['slick', 'Feather Slick'], ['missile', 'Pillow Missile'], ['espresso', 'Espresso Shot'], ['cuffs', 'Fuzzy Cuffs'], ['case', 'Pillowcase'],
    ['alarm', 'Alarm Clock'], ['sugar', 'Sugar Rush'], ['plane', 'Paper Plane'], ['wash', 'Hot Wash'], ['spring', 'Spring Cushion']]
    .map(([id, t]) => [`i-${id}`, t, 'label', 64, 'cream', { extrude: 5, outline: 7, tilt: 0.05 }]),
];

async function render(page, jobs, families) {
  return page.evaluate(async ({ jobs, PAL, families }) => {
    const out = {};
    for (const [id, text, face, px, pal, o] of jobs) {
      const fam = families[face];
      const [top, bottom, side, ink, gloss] = PAL[pal];
      const outline = o.outline ?? Math.round(px * 0.07), ex = o.extrude ?? Math.round(px * 0.07);
      const c = document.createElement('canvas'), g = c.getContext('2d');
      const font = `${px}px "${fam}", "Lilita One", sans-serif`;
      g.font = font;
      // letter layout: each glyph tilts and bobs a little (seeded), "small" shrinks suffixes (1st → 1 + st)
      const letters = []; let x = 0; const seed = o.seed ?? 0;
      [...text].forEach((ch, i) => {
        const sz = o.small && i > 0 && /[a-z]/.test(ch) ? px * o.small : px;
        g.font = `${sz}px "${fam}", "Lilita One", sans-serif`;
        const w = g.measureText(ch).width;
        const rot = (o.tilt ?? 0) * Math.sin(i * 1.9 + seed * 1.3);
        const dy = (o.bounce ?? 0) * Math.sin(i * 2.4 + seed);
        letters.push({ ch, x, w, sz, rot, dy: dy + (sz < px ? -px * 0.32 : 0) });
        x += w * (ch === ' ' ? 1 : 0.94);
      });
      const pad = outline * 2 + ex + 20;
      c.width = Math.ceil(x + pad * 2); c.height = Math.ceil(px * 1.45 + pad * 2);
      const base = pad + px * 1.05;
      const each = (fn) => { for (const L of letters) { g.save(); g.translate(pad + L.x + L.w / 2, base + L.dy); g.rotate(L.rot); g.font = `${L.sz}px "${fam}", "Lilita One", sans-serif`; g.textAlign = 'center'; fn(L); g.restore(); } };
      g.lineJoin = 'round'; g.miterLimit = 2;
      // 1) the extrude: a solid dark slab stepped down-right, then its outline
      for (let d = ex; d > 0; d -= 1) each((L) => { g.lineWidth = outline * 2; g.strokeStyle = ink; g.strokeText(L.ch, d * 0.35, d); });
      for (let d = ex; d > 0; d -= 1) each((L) => { g.lineWidth = outline * 0.9; g.strokeStyle = side; g.fillStyle = side; g.strokeText(L.ch, d * 0.35, d); g.fillText(L.ch, d * 0.35, d); });
      // 2) the outline round the face
      each((L) => { g.lineWidth = outline * 2; g.strokeStyle = ink; g.strokeText(L.ch, 0, 0); });
      // 3) the candy gradient face
      each((L) => { const gr = g.createLinearGradient(0, -L.sz * 0.8, 0, L.sz * 0.1); gr.addColorStop(0, top); gr.addColorStop(1, bottom); g.fillStyle = gr; g.fillText(L.ch, 0, 0); });
      // 4) the gloss: a soft white band across the top of each letter, clipped to it
      const shine = document.createElement('canvas'); shine.width = c.width; shine.height = c.height;
      const fg = shine.getContext('2d');
      for (const L of letters) { fg.save(); fg.translate(pad + L.x + L.w / 2, base + L.dy); fg.rotate(L.rot); fg.font = `${L.sz}px "${fam}", "Lilita One", sans-serif`; fg.textAlign = 'center'; fg.fillStyle = '#fff'; fg.fillText(L.ch, 0, 0); fg.restore(); }
      fg.globalCompositeOperation = 'source-in';
      const gl = fg.createLinearGradient(0, base - px * 0.85, 0, base - px * 0.3);
      gl.addColorStop(0, `rgba(255,255,255,${gloss})`); gl.addColorStop(0.55, `rgba(255,255,255,${gloss * 0.5})`); gl.addColorStop(0.56, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      fg.fillStyle = gl; fg.fillRect(0, 0, shine.width, shine.height);
      g.drawImage(shine, 0, 0);
      // 5) crop to the ink
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let x0 = c.width, y0 = c.height, x1 = 0, y1 = 0;
      for (let y = 0; y < c.height; y++) for (let xx = 0; xx < c.width; xx++) if (d[(y * c.width + xx) * 4 + 3] > 8) { if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      const cc = document.createElement('canvas'); cc.width = x1 - x0 + 5; cc.height = y1 - y0 + 5;
      cc.getContext('2d').drawImage(c, -x0 + 2, -y0 + 2);
      out[id] = cc.toDataURL('image/png');
    }
    return out;
  }, { jobs, PAL, families });
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage();
  // a Lilita One fallback (OFL, already bundled) for any family that isn't active
  const lilita = fs.readFileSync(path.join(root, 'src/assets/lilita-one-subset.woff2')).toString('base64');
  const families = await page.evaluate(async ({ lilita, F }) => {
    const face = new FontFace('Lilita One', `url(data:font/woff2;base64,${lilita})`);
    document.fonts.add(await face.load());
    const g = document.createElement('canvas').getContext('2d');
    const w = (f) => { g.font = `40px ${f}`; return g.measureText('Fluffed & Furious 123').width; };
    const out = {};
    for (const [k, fam] of Object.entries(F)) out[k] = w(`"${fam}", monospace`) !== w('monospace') ? fam : 'Lilita One';
    return out;
  }, { lilita, F });
  const standIn = Object.entries(families).filter(([k, f]) => f === 'Lilita One').map(([k]) => `${k} (${F[k]})`);
  if (standIn.length) console.log('STAND-IN (font not active):', standIn.join(', '));

  const si = process.argv.indexOf('--specimen');
  if (si > 0) {
    const sample = Object.keys(F).flatMap((k) => [[`${k}-a`, 'FLUFFED & FURIOUS', k, 110, 'candy', { extrude: 10, outline: 10, tilt: 0.08 }], [`${k}-b`, 'POW! 1st Final Lap 3 2 1 GO!', k, 80, 'sky', { extrude: 7, outline: 8, tilt: 0.06 }]]);
    const imgs = await render(page, sample, families);
    await page.setContent(`<body style="margin:0;background:#2a2346;font:20px sans-serif;color:#fff;padding:20px;width:1800px">${Object.keys(F).map((k) => `<div style="margin:6px 0 18px"><div style="opacity:.75">${k}: ${F[k]}${families[k] !== F[k] ? ' (STAND-IN)' : ''}</div><img src="${imgs[k + '-a']}" style="height:110px"> <img src="${imgs[k + '-b']}" style="height:70px"></div>`).join('')}</body>`);
    await page.setViewportSize({ width: 1840, height: 1000 });
    await page.screenshot({ path: process.argv[si + 1], fullPage: true });
    console.log('specimen →', process.argv[si + 1]);
  } else {
    fs.mkdirSync(OUT, { recursive: true });
    const imgs = await render(page, ART, families);
    for (const [id, url] of Object.entries(imgs)) fs.writeFileSync(path.join(OUT, id + '.png'), Buffer.from(url.split(',')[1], 'base64'));
    const ids = Object.keys(imgs);
    fs.writeFileSync(path.join(OUT, 'index.js'), `/* generated by tools/render-type.mjs: the display type as images (no font files ship) */\n${ids.map((id, i) => `import t${i} from './${id}.png';`).join('\n')}\nexport const TYPE = { ${ids.map((id, i) => `'${id}': t${i}`).join(', ')} };\n`);
    console.log(`${ids.length} type images → ${path.relative(root, OUT)}`);
  }
} finally { await browser.close(); }
