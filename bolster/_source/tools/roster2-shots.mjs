/* Roster 2's evidence: each new fighter's moves, frame by frame, in a close
   fight camera (a contact sheet per fighter), and single shots of the
   signature, special, dive slam and throw.

     node tools/roster2-shots.mjs [--html final.html] [--out shots/roster2] [sheet-<id> | moves-<id> …]

   sheet-<id>: one sheet, every move (light, heavy, low, guard, forward jump,
   dive slam, signature, special, throw); moves-<id>: the signature, the
   special, the dive slam and the throw as their own full-frame shots.
   WebGL 2 on SwiftShader; prints every console error. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'roster2')));
const extra = opt('--q', '');
fs.mkdirSync(out, { recursive: true });
let names = args.length ? args : ['sheet-sebas', 'sheet-zach', 'moves-sebas', 'moves-zach'];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

const L = 1, R = 2, UP = 4, D = 8, O = 16, P = 32, SP = 64, E = 128;
const PRE = `
  window.B = window.__bolster;
  window.F = () => B.fight;
  window.ST = () => B.fight.st;
  window.until = (cond, n = 10) => { for (let t = 0; t < n; t += 1 / 60) { B.frame(1 / 60, false); if (cond()) return true; } return false; };
  window.toFight = () => until(() => ST().phase === 'fight', 4);
  window.place = (x1, x2) => { const s = ST(); s.f[0].x = x1; s.f[1].x = x2; s.f[0].y = s.f[1].y = 0; F().prev = s.f.map((f) => ({ x: f.x, y: f.y })); };
  window.script = (fn) => { let i = 0; F().override = (st) => fn(i++, st); };
  window.reset = (x1, x2) => { script(() => [0, 0]); B.step(1.4, false); const s = ST(); for (const f of s.f) { f.hp = 900; } s.proj = []; place(x1, x2); B.step(0.6, false); };
  /* a close camera between the two, or centred on x */
  window.cam = (x, d = 11.5, ty = 1.8) => {
    const c = B.stage.camera;
    c.aspect = innerWidth / innerHeight; c.fov = 26; c.position.set(x, ty + 1.1, d); c.lookAt(x, ty, 0); c.updateProjectionMatrix();
    B.stage.update(0);
    B.renderer.render(B.stage.scene, c);
  };
  window.mid = () => (F().plush[0].group.position.x + F().plush[1].group.position.x) / 2;
`;

async function open(q, vp) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto('file://' + html + q + extra);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  await page.evaluate(PRE);
  await page.evaluate(`toFight(); F().cpu = [null, null];`);
  return { page, errs };
}

/* each move: where they stand, the script (i: tick), when to stop, a label */
const MOVES = {
  light: { x: [-1300, 1300], s: `(i) => [i === 1 ? ${O} : 0, 0]`, at: `f.mv === 'light' && f.t >= 5` },
  heavy: { x: [-1500, 1500], s: `(i) => [i === 1 ? ${P} : 0, 0]`, at: `f.mv === 'heavy' && f.t >= 15` },
  low: { x: [-1300, 1300], s: `(i) => [i >= 1 && i < 12 ? ${D} | (i === 2 ? ${O} : 0) : 0, 0]`, at: `f.mv === 'lowLight' && f.t >= 6` },
  guard: { x: [-1700, 1700], s: `(i) => [${E}, i === 2 ? ${P} : 0]`, at: `ST().f[1].act === 'attack' && ST().f[1].t >= 15` },
  jump: { x: [-3600, 2400], s: `(i) => [i === 1 ? ${UP | R} : 0, 0]`, at: `f.act === 'jump' && f.t >= 16` },
  dive: { x: [-2600, 1200], s: `(i, st) => [i === 1 ? ${UP | R} : st.f[0].act === 'jump' && st.f[0].t >= 14 ? ${D | P} : 0, 0]`, at: `f.mv === 'dive' && f.t >= 5` },
  'dive-drop': { x: [-2600, 1200], s: `(i, st) => [i === 1 ? ${UP | R} : st.f[0].act === 'jump' && st.f[0].t >= 14 ? ${D | P} : 0, 0]`, at: `(f.mv === 'dive' && f.t >= 9) || f.mv === 'diveLand'` },
  signature: { x: [-1500, 1500], s: `(i) => [i >= 1 && i < 8 ? ${D} | (i === 2 ? ${P} : 0) : 0, 0]`, at: `f.mv === 'signature' && f.t >= 13` },
  special: { x: [-1300, 1300], s: `(i, st) => { if (i === 0) st.f[0].meter = 1000; return [i === 1 ? ${SP} : 0, 0]; }`, at: `f.mv === 'special' && f.t >= 18` },
  'special-late': { x: [-2600, 2600], s: `(i, st) => { if (i === 0) st.f[0].meter = 1000; return [i === 1 ? ${SP} : 0, 0]; }`, at: `f.mv === 'special' && f.t >= 32` },
  throw: { x: [-800, 800], s: `(i) => [i === 1 ? ${O | P} : 0, 0]`, at: `f.mv === 'throwHold' && f.t >= 8` },
  toss: { x: [-800, 800], s: `(i) => [i === 1 ? ${O | P} : 0, 0]`, at: `f.mv === 'throwHold' && f.t >= 19` },
};

async function pose(page, m, camX = null) {
  return page.evaluate(`reset(${m.x[0]}, ${m.x[1]}); script(${m.s});
    const ok = until(() => { const f = ST().f[0]; return ${m.at}; }, 4);
    B.step(0, false); cam(${camX ?? 'mid()'}, 11.5, Math.max(1.8, Math.max(...F().plush.map((p) => p.group.position.y)) + 1.0)); ok`);
}

let errors = 0;
for (const name of names) {
  const [kind, id] = name.split('-');
  const t0 = Date.now();
  const opp = id === 'zach' ? 'sebas' : 'zach';
  if (kind === 'sheet') {
    const { page, errs } = await open(`?p1=${id}&p2=${opp}&cpu=normal&seed=7&hold&webgl&noportraits`, { width: 640, height: 420 });
    const tiles = [];
    for (const mv of ['light', 'heavy', 'low', 'guard', 'jump', 'dive', 'dive-drop', 'signature', 'special', 'special-late', 'throw', 'toss']) {
      const ok = await pose(page, MOVES[mv]);
      const f = path.join(out, `_${id}-${mv}.png`);
      await page.screenshot({ path: f });
      execFileSync('convert', [f, '-gravity', 'NorthWest', '-fill', '#fff', '-undercolor', '#000a', '-pointsize', '18', '-annotate', '+8+6', ` ${mv}${ok ? '' : ' (not reached)'} `, f]);
      tiles.push(f);
    }
    const sheet = path.join(out, `sheet-${id}.png`);
    execFileSync('montage', [...tiles, '-tile', '4x3', '-geometry', '+3+3', '-background', '#222', sheet]);
    for (const f of tiles) fs.unlinkSync(f);
    console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s${errs.length ? '  ERRORS:\n    ' + errs.join('\n    ') : ''}`);
    errors += errs.length;
    await page.close();
  } else if (kind === 'moves') {
    const { page, errs } = await open(`?p1=${id}&p2=${opp}&cpu=normal&seed=7&hold&webgl&noportraits`, { width: 1280, height: 720 });
    for (const [mv, label] of [['signature', 'signature'], ['special', 'special'], ['special-late', 'special-2'], ['dive', 'dive'], ['dive-drop', 'dive-2'], ['throw', 'throw'], ['toss', 'throw-2']]) {
      await pose(page, MOVES[mv]);
      // wider, with the HUD over it
      await page.evaluate(`cam(mid(), 15, Math.max(2.2, Math.max(...F().plush.map((p) => p.group.position.y)) + 1.2))`);
      await page.screenshot({ path: path.join(out, `${id}-${label}.png`) });
    }
    console.log(`${name}: ${((Date.now() - t0) / 1000).toFixed(1)} s${errs.length ? '  ERRORS:\n    ' + errs.join('\n    ') : ''}`);
    errors += errs.length;
    await page.close();
  } else console.log(`no scene ${name}`);
}
await browser.close();
console.log(errors ? `${errors} console errors` : 'zero console errors');
process.exit(errors ? 1 : 0);
