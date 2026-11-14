/* Every fighter's forward and over-the-shoulder throw, frame by frame, as
   one contact sheet per direction → shots/throws/{forward,back}.jpg (rows:
   fighters; columns: ticks into the hold). The victim is Kevalanche (or
   K8-E for Kevalanche, the tallest — the hardest to carry).
     node tools/throws-shots.mjs [--ticks 6,14,22,27,33,42] [--only id]   */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const TICKS = arg('ticks', '6,14,21,26,31,40').split(',').map(Number);
const ROSTER = (arg('only', '') || 'kevalanche,rubberta,johnny,sumaura,k8e,sebas,zach').split(',');
const out = path.join(root, 'shots/throws');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const W = 480, H = 300;
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(e.message));
const cells = { forward: [], back: [] };
for (const id of ROSTER) {
  const vic = id === 'kevalanche' ? 'k8e' : 'kevalanche';
  for (const dir of ['forward', 'back']) {
    await page.goto(`file://${path.join(root, 'final.html')}?p1=${id}&p2=${vic}&cpu=normal&seed=7&hold&webgl&noportraits`);
    await page.waitForFunction(() => window.__pf2 && document.body.classList.contains('is-live'), null, { timeout: 180000 });
    const row = [];
    let got = null;
    for (const T of TICKS) {
      got = await page.evaluate(([dir, T]) => {
        const A = __pf2, F = A.fight, st = F.st;
        A._vsEnd(true);
        for (let i = 0; i < 400 && st.phase !== 'fight'; i++) A.frame(1 / 60, false);
        if (!F._thr) {
          F.cpu = [null, null];
          const x0 = dir === 'forward' ? -3200 : 3000;
          st.f.forEach((f, k) => { f.x = x0 + k * 1300; f.z = 0; f.fx = k ? -1024 : 1024; f.fz = 0; f.act = 'idle'; f.vx = f.vz = 0; });
          F.prev = st.f.map((q) => ({ x: q.x, y: q.y, z: q.z }));
          let i = 0;
          F.override = () => [i++ === 1 ? 48 : 0, 0];
          F._thr = 1;
          for (let n = 0; n < 60 && !(st.f[0].mv === 'throwHold'); n++) A.frame(1 / 60, false);
        }
        while (st.f[0].mv === 'throwHold' && st.f[0].t < T) A.frame(1 / 60, false);
        if (st.f[0].mv !== 'throwHold') for (let n = 0; n < T - 48 && n < 30; n++) A.frame(1 / 60, false);
        A.frame(1 / 120, true);
        return { td: st.f[0].td, t: st.f[0].t, mv: st.f[0].mv, v: st.f[1].act };
      }, [dir, T]);
      const buf = await page.screenshot({ type: 'jpeg', quality: 70, timeout: 240000 });
      row.push({ T, b64: buf.toString('base64'), info: got });
    }
    if ((dir === 'forward') !== (row[0].info.td > 0)) errs.push(`${id} ${dir}: went td=${row[0].info.td}`);
    cells[dir].push({ id, row });
    console.log(id, dir, row.map((r) => `${r.T}:${r.info.mv || '-'}/${r.info.v}`).join(' '));
  }
}
// the contact sheets: a page of the frames, screenshotted
for (const dir of ['forward', 'back']) {
  const cw = 320, ch = 200;
  const sheet = await browser.newPage({ viewport: { width: cw * TICKS.length + 110, height: ch * cells[dir].length + 30 }, deviceScaleFactor: 1 });
  const html = `<body style="margin:0;background:#111;color:#eee;font:13px sans-serif"><div style="display:flex;padding-left:110px;height:30px;align-items:center">${TICKS.map((t) => `<div style="width:${cw}px">tick ${t}</div>`).join('')}</div>${cells[dir].map((r) => `<div style="display:flex;height:${ch}px"><div style="width:110px;padding:8px">${r.id}<br>${dir}</div>${r.row.map((c) => `<img style="width:${cw}px;height:${ch}px" src="data:image/jpeg;base64,${c.b64}">`).join('')}</div>`).join('')}</body>`;
  await sheet.setContent(html);
  await sheet.screenshot({ path: path.join(out, `${dir}.jpg`), type: 'jpeg', quality: 80 });
  await sheet.close();
}
await browser.close();
if (errs.length) { console.log('PROBLEMS\n' + errs.join('\n')); process.exit(1); }
console.log('throws shots OK →', out);
