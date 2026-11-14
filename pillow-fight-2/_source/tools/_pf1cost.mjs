import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto('file:///tmp/claude-0/pf1.html?p1=rubberta&p2=kevalanche&p1cpu=hard&cpu=hard&seed=5&hold&webgl&noportraits');
await p.waitForFunction(() => window.__bolster && window.__bolster.fight, null, { timeout: 180000 });
const r = await p.evaluate(() => { const A = __bolster; A._vsEnd?.(true); A.step(3, false); const t = []; for (let i = 0; i < 400; i++) { const a = performance.now(); A.frame(1 / 60, false); t.push(performance.now() - a); } t.sort((x, y) => x - y); return { median: +t[200].toFixed(2), p95: +t[380].toFixed(2), max: +t[399].toFixed(2) }; });
console.log('PF1', JSON.stringify(r));
await b.close();
