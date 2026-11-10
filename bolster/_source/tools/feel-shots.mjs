/* Evidence for the feel pass (Kevalanche): every move as a frame strip in
   the fight camera — the same scripted inputs and seed against any build —
   and, with --clips, every tick of a move as a GIF.

     node tools/feel-shots.mjs [--html final.html] [--q '&feel=old'] [--out shots/feel/after] [--clips] [scene …]

   Scenes: jab heavy low uppercut rush throw air dive walk jump block hit ko
   (default: all). Strips are labelled with the move and tick (t is the
   sim's frame of the move: startup, then the first active frame, then
   recovery). WebGL 2 on SwiftShader; prints every console error.          */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'feel', 'after')));
const extra = opt('--q', '');
const clips = flag('--clips');
fs.mkdirSync(out, { recursive: true });

const O = 16, P = 32, U = 4, D = 8, R = 2, SP = 64, E = 128;
/* scene: where they stand, player 1's (and 2's) inputs by tick, what to capture:
   [mv, t] (that move at that frame) or ['@', i] (tick i of the scene) */
const SCENES = {
  jab: { x: [-1000, 1050], p1: (i) => (i === 1 ? O : 0), shots: [['light', 1], ['light', 3], ['light', 4], ['light', 5], ['light', 7], ['light', 10], ['light', 13]], n: 30 },
  heavy: { x: [-1300, 1500], p1: (i) => (i === 1 ? P : 0), shots: [['heavy', 4], ['heavy', 9], ['heavy', 12], ['heavy', 14], ['heavy', 15], ['heavy', 20], ['heavy', 27], ['heavy', 36]], n: 60 },
  low: { x: [-1000, 1050], p1: (i) => (i >= 1 && i < 30 ? D | (i === 2 ? O : 0) : 0), shots: [['lowLight', 1], ['lowLight', 3], ['lowLight', 5], ['lowLight', 6], ['lowLight', 9], ['lowLight', 14]], n: 34 },
  uppercut: { x: [-1100, 1100], p1: (i) => (i === 1 ? D : i === 2 ? D | P : 0), shots: [['signature', 1], ['signature', 3], ['signature', 4], ['signature', 5], ['signature', 7], ['signature', 14], ['signature', 24], ['signature', 38]], n: 70 },
  rush: { x: [-1300, 1800], meter: 1, p1: (i) => (i === 1 ? SP : 0), shots: [['special', 2], ['special', 4], ['special', 6], ['special', 11], ['special', 16], ['special', 42], ['special', 46], ['special', 48], ['@', 72], ['@', 88]], n: 90 },
  throw: { x: [-700, 700], p1: (i) => (i === 1 ? O | P : 0), shots: [['throw', 3], ['throwHold', 6], ['throwHold', 14], ['throwHold', 19], ['throwHold', 21], ['throwHold', 24], ['throwHold', 32], ['throwHold', 42]], n: 80 },
  air: { x: [-1500, 1700], p1: (i) => (i === 1 ? U | R : i === 14 ? P : 0), shots: [['airHeavy', 2], ['airHeavy', 5], ['airHeavy', 7], ['airHeavy', 9], ['airHeavy', 16], ['@', 50]], n: 70 },
  dive: { x: [-1500, 2200], p1: (i) => (i === 1 ? U | R : i === 16 ? D | P : 0), shots: [['dive', 2], ['dive', 5], ['dive', 7], ['dive', 9], ['diveLand', 1], ['diveLand', 4], ['diveLand', 8], ['@', 100]], n: 110 },
  walk: { x: [-3000, 3000], p1: (i) => (i >= 1 ? R : 0), shots: [['@', 8], ['@', 13], ['@', 18], ['@', 23], ['@', 28]], n: 30 },
  jump: { x: [-2500, 3500], p1: (i) => (i === 1 ? U : 0), shots: [['@', 2], ['@', 4], ['@', 10], ['@', 24], ['@', 44], ['@', 52], ['@', 56], ['@', 64]], n: 70 },
  block: { x: [-1000, 1000], p1: () => E, p2: (i) => (i === 6 ? P : 0), shots: [['@', 4], ['@', 20], ['@', 22], ['@', 25], ['@', 30], ['@', 40]], n: 50 },
  hit: { x: [-1000, 1000], p1: () => 0, p2: (i) => (i === 6 ? P : 0), shots: [['@', 18], ['@', 20], ['@', 23], ['@', 27], ['@', 33], ['@', 44]], n: 50 },
  ko: { x: [-1000, 1000], hp: 40, p1: () => 0, p2: (i) => (i === 6 ? P : 0), shots: [['@', 20], ['@', 26], ['@', 60], ['@', 120], ['@', 200], ['@', 260]], n: 270 },
};
let names = args.length ? args : Object.keys(SCENES);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const PRE = `
  window.O = 16; window.P = 32; window.U = 4; window.D = 8; window.R = 2; window.SP = 64; window.E = 128;
  window.B = window.__bolster;
  window.F = () => B.fight;
  window.ST = () => B.fight.st;
  window.until = (cond, n = 10) => { for (let t = 0; t < n; t += 1 / 60) { B.frame(1 / 60, false); if (cond()) return true; } return false; };
  window.toFight = () => until(() => ST().phase === 'fight', 4);
  window.place = (x1, x2) => { const s = ST(); s.f[0].x = x1; s.f[1].x = x2; F().prev = s.f.map((f) => ({ x: f.x, y: f.y })); };
  /* the fight camera, closer, framed between the two (a fixed height) */
  window.cam = (x, y = 0) => {
    const C = B.stage.camera;
    C.aspect = innerWidth / innerHeight; C.fov = 30; C.position.set(x, 2.9 + y, 11.5); C.lookAt(x, 1.9 + y, 0); C.updateProjectionMatrix();
    B.renderer.render(B.stage.scene, C);
  };
`;

let errors = 0;
for (const name of names) {
  const S = SCENES[name];
  if (!S) { console.log(`no scene ${name}`); continue; }
  const t0 = Date.now();
  const page = await browser.newPage({ viewport: { width: 560, height: 470 }, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('file://' + html + '?p1=kevalanche&p2=johnny&cpu=normal&seed=7&hold&webgl&noportraits' + extra);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  await page.evaluate(PRE);
  await page.evaluate(`toFight(); F().cpu = [null, null]; place(${S.x[0]}, ${S.x[1]}); F().override = () => [0, 0]; B.step(1.0, false);
    ${S.meter ? 'ST().f[0].meter = 1000;' : ''} ${S.hp ? `ST().f[0].hp = ${S.hp};` : ''}
    window.__p1 = ${S.p1.toString()}; window.__p2 = ${(S.p2 || (() => 0)).toString()};
    window.__i = 0; F().override = (st) => [__p1(__i), __p2(__i)];`);
  const tiles = [], frames = [];
  const want = S.shots.map((s) => ({ s, done: false }));
  const cx = (S.x[0] + S.x[1]) / 2000 - 0.2;
  for (let i = 0; i < S.n; i++) {
    const info = await page.evaluate(`__i = ${i}; B.frame(1 / 60, false); const f = ST().f[0]; ({ mv: f.act === 'attack' ? f.mv : f.act, t: f.t, x: F().plush[0].group.position.x, y: F().plush[0].group.position.y })`);
    const hit = want.find((w) => !w.done && (w.s[0] === '@' ? w.s[1] === i : w.s[0] === info.mv && w.s[1] === info.t));
    const camX = name === 'walk' || name === 'jump' || name === 'ko' ? info.x + 1.5 : cx;
    if (hit || (clips && i > 0)) await page.evaluate(`cam(${camX}, ${['jump', 'air', 'dive'].includes(name) ? (info.y * 0.8).toFixed(3) : 0})`);
    if (hit) {
      hit.done = true;
      const f = path.join(out, `_${name}-${tiles.length}.png`);
      await page.screenshot({ path: f });
      tiles.push([f, hit.s[0] === '@' ? `${info.mv} · tick ${i}` : `${info.mv} t${info.t}`]);
    }
    if (clips && i > 0) { const f = path.join(out, `_c${String(i).padStart(3, '0')}.png`); await page.screenshot({ path: f }); frames.push(f); }
  }
  const missed = want.filter((w) => !w.done).map((w) => w.s.join(':'));
  if (tiles.length) {
    const sheet = path.join(out, `${name}.png`);
    execFileSync('montage', [...tiles.flatMap(([f, l]) => ['-label', l, f]), '-tile', `${tiles.length}x1`, '-geometry', '280x235+3+3', '-pointsize', '14', '-background', '#1d1630', '-fill', '#f4efe6', sheet]);
    for (const [f] of tiles) fs.unlinkSync(f);
  }
  if (frames.length) {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(out, '_c%03d.png'), '-vf', 'scale=420:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse', path.join(out, `${name}.gif`)]);
    for (const f of frames) fs.unlinkSync(f);
  }
  console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s${missed.length ? '  missed ' + missed.join(' ') : ''}${errs.length ? '  ERRORS:\n    ' + errs.join('\n    ') : ''}`);
  errors += errs.length;
  await page.close();
}
await browser.close();
console.log(errors ? `${errors} console errors` : 'zero console errors');
process.exit(errors ? 1 : 0);
