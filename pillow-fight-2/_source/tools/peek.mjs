/* One-off headless screenshots of final.html (WebGL 2 on SwiftShader):
     node tools/peek.mjs <out.png> '<query>' '<js run in the page>' [width height]
   Prints console errors. */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [out, q = '?hold&webgl', run = '', w = 1280, h = 720] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) errs.push('NETWORK ' + r.url()); });
await page.goto('file://' + path.join(root, 'final.html') + q);
await page.waitForFunction(() => window.__pf2, null, { timeout: 120000 });
if (run) { const r = await page.evaluate(run); if (r !== undefined) console.log('result:', JSON.stringify(r)); }
await page.waitForTimeout(300);
await page.screenshot({ path: out, timeout: 240000 });
console.log(errs.length ? errs.join('\n') : 'no console errors');
await browser.close();
