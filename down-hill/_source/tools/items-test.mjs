/* Stage 5's item test, in the real page (final.html, or HTML=…), headless
   Chromium: every one of the ten items fires, hits (or does its thing),
   and resolves (nothing of it left in flight or on the road), with zero
   console errors, in 1P and in 4-way split screen. Each item is staged
   with its actors in front of the camera (App.shotItem), then the race
   runs on for a few seconds.
     node tools/items-test.mjs                                            */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = process.env.HTML || path.join(root, 'final.html');
const ITEMS = ['slick', 'missile', 'espresso', 'cuffs', 'case', 'alarm', 'sugar', 'plane', 'wash', 'spring'];
/* what each item must make happen (any one of the events listed) */
const EFFECT = {
  slick: ['hit:slick'], missile: ['hit:missile'], espresso: ['boost'], cuffs: ['cuffs'], case: ['case'], alarm: ['alarm', 'hit:alarm'],
  sugar: ['sugar'], plane: ['hit:plane'], wash: ['wash'], spring: ['eject'],
};
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = [];
const rows = [];
for (const [label, q] of [['1P', '?hold&webgl&p1=johnny&cpu=normal&seed=12'], ['4-way split', '?hold&webgl&p1=johnny&p2=k8e&p3=zach&p4=sebas&cpu=normal&seed=12']]) {
  for (const it of ITEMS) {
    const p = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const errs = [];
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    p.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) errs.push('NETWORK ' + r.url()); });
    await p.goto('file://' + html + q, { timeout: 180000 });
    await p.waitForFunction(() => window.__dh && document.body.classList.contains('is-live'), null, { timeout: 180000 });
    const r = await p.evaluate((it) => {
      const A = __dh, seen = [];
      const on = A.onEvent.bind(A);
      A.onEvent = (e) => { if (e.from === A.me || e.i === A.me || ['cuffs', 'alarm', 'wash', 'eject'].includes(e.k)) seen.push(e.k + (e.kind ? ':' + e.kind : '') + (e.item ? ':' + e.item : '')); on(e); };
      const staged = A.shotItem(it);
      // run on: everything it started must resolve
      for (let n = 0; n < 60 * 9; n++) A.frame(1 / 60, n % 30 === 0);
      const R = A.race, me = A.me;
      const left = { shots: R.shots.filter((S) => S.owner === me).length, hazards: R.hazards.filter((H) => H.owner === me).length, lock: R.karts[me].lock, item: R.karts[me].item };
      const views = A.hv.length;
      return { staged, seen: [...new Set(seen)], left, views };
    }, it);
    const want = EFFECT[it];
    const fired = r.seen.includes('use:' + it), hit = want.some((w) => r.seen.includes(w));
    const resolved = !r.left.shots && !r.left.hazards && r.left.lock < 0 && !r.left.item;
    rows.push(`${label.padEnd(11)} ${it.padEnd(9)} fired ${fired ? 'yes' : 'NO '}  effect ${hit ? 'yes' : 'NO '}  resolved ${resolved ? 'yes' : 'NO '}  errors ${errs.length}  (${r.seen.join(' ')})`);
    if (!fired || !hit || !resolved || errs.length) problems.push(`${label} ${it}: fired ${fired} effect ${hit} resolved ${resolved} ${JSON.stringify(r.left)} ${errs.join(' | ')}`);
    if (label !== '1P' && r.views !== 4) problems.push(`${label}: ${r.views} views`);
    await p.close();
  }
}
await browser.close();
console.log(rows.join('\n'));
console.log(problems.length ? `\nPROBLEMS:\n${problems.join('\n')}` : '\nITEM TEST PASSES: all 10 items fire, hit and resolve, 1P and 4-way split, zero errors');
process.exit(problems.length ? 1 : 0);
