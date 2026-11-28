/* Board shots for the overhaul: the same moments from any build, at 1920×1080
   in real Chrome (GPU, not SwiftShader).
     node tools/board-shots.mjs <html> <outDir> [scene …]
   Scenes: title select setup landing laundry hockey park dojo split4 hit drift results */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const [html, outDir, ...want] = process.argv.slice(2);
if (!html || !outDir) throw new Error('usage: board-shots.mjs <html> <outDir> [scene …]');
fs.mkdirSync(outDir, { recursive: true });
const W = +(process.env.W || 1920), H = +(process.env.H || 1080);
const browser = await chromium.launch({ channel: 'chrome', args: ['--ignore-gpu-blocklist', '--enable-gpu'] });
const problems = [];

async function open(q) {
  const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  p.on('console', (m) => { if (m.type() === 'error') problems.push(`${q}: ${m.text()}`); });
  p.on('pageerror', (e) => problems.push(`${q}: pageerror ${e.message}`));
  p.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) problems.push(`${q}: NETWORK ${r.url()}`); });
  await p.goto('file://' + path.resolve(html) + q);
  await p.waitForFunction(() => window.__dh && document.body.classList.contains('is-live'), null, { timeout: 180000 });
  return p;
}
const snap = async (p, name, settle = 0) => { if (settle) { await p.waitForTimeout(settle); await p.evaluate(() => __dh.step(1 / 60)); } await p.waitForTimeout(400); await p.screenshot({ path: path.join(outDir, name + '.png'), timeout: 240000 }); console.log('shot', name); };
const race = (track, extra = '') => async () => {
  const p = await open(`?hold&p1=zach&p1cpu=hard&cpu=normal&seed=4&track=${track}${extra}`);
  await p.evaluate(async () => { await __dh.fx?.pipelineWarmup; __dh.step(12, false); __dh.step(1 / 60); });
  await snap(p, track, 3500); await p.close();
};

const SCENES = {
  async title() { const p = await open('?hold'); await p.evaluate(() => __dh.step(2.5)); await snap(p, 'title'); await p.close(); },
  async select() {
    const p = await open('?hold&screen=select');
    await p.evaluate(async () => { await __dh.portraits(); __dh.pick(3); __dh.step(1.2); });
    await snap(p, 'select'); await p.close();
  },
  async setup() {
    const p = await open('?hold&screen=select&noportraits');
    await p.evaluate(() => { __dh.toSetup(); __dh.step(1.2); });
    await snap(p, 'setup'); await p.close();
  },
  landing: race('landing'), laundry: race('laundry'), hockey: race('hockey'), park: race('park'), dojo: race('dojo'),
  async split4() {
    const p = await open('?hold&p1=zach&p2=sumaura&alt2=1&p3=k8e&p4=kevalanche&cpu=normal&seed=4&track=landing');
    await p.evaluate(async () => {
      const A = __dh, CPU = A.cpus.find(Boolean).constructor;
      A.hv.forEach((v, i) => { const c = new CPU(A.race, v.i, 'hard', 9 + i); A.humanP[i].ctl.sample = () => c.think(); });
      await A.fx?.pipelineWarmup; A.step(12, false); A.step(1 / 60);
    });
    await snap(p, 'split4', 3500); await p.close();
  },
  async hit() {
    const p = await open('?hold&p1=johnny&cpu=normal&seed=12');
    const r = await p.evaluate(() => __dh.shotItem('missile'));
    if (!r) problems.push('hit: missile not staged');
    await snap(p, 'hit'); await p.close();
  },
  async drift() {
    const p = await open('?hold&p1=k8e&p1cpu=hard&seed=7');
    const ok = await p.evaluate(() => {
      const A = __dh, K = () => A.race.karts[A.me];
      for (let n = 0; n < 60 * 120; n++) { A.frame(1 / 60, false); if (K().drift && K().tier >= 2 && !K().air) { A.step(0.1); return true; } }
      return false;
    });
    if (!ok) problems.push('drift: no tier-2+ drift found');
    await snap(p, 'drift'); await p.close();
  },
  async results() {
    const p = await open('?hold&p1=sumaura&p1cpu=hard&seed=9&laps=1');
    await p.evaluate(() => { const A = __dh; for (let n = 0; n < 60 * 150 && A.screen === 'race'; n++) A.frame(1 / 60, false); A.step(2.5); });
    await snap(p, 'results'); await p.close();
  },
};

for (const [name, f] of Object.entries(SCENES)) if (!want.length || want.includes(name)) {
  try { await f(); } catch (e) { problems.push(`${name}: ${e.message}`); }
}
await browser.close();
console.log(problems.length ? 'PROBLEMS\n' + problems.join('\n') : 'no console errors, no network');
