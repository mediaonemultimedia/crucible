// Shared Playwright helpers: headless Chromium (GPU if present, else SwiftShader), frame-count waits.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of ['playwright', '/opt/node-tools/node_modules/playwright']) { try { return require(p); } catch {} }
  throw new Error('playwright not found');
}
export const { chromium } = loadPlaywright();
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PAGE = process.env.TUSCHE_PAGE || path.join(HERE, '..', 'src', 'index.html');
export const pageUrl = (q = '') => pathToFileURL(PAGE).href + q;
export async function launch() {
  return chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
}
export async function open(browser, q, viewport = { width: 1280, height: 800 }, extra = {}) {
  const page = await browser.newPage({ viewport, ...extra });
  const errors = [], requests = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => errors.push('pageerror: ' + (e.stack || e)));
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) requests.push(r.url()); });
  await page.goto(pageUrl(q));
  await page.waitForFunction(() => window.__tusche && window.__tusche.frame > 2, null, { timeout: 60000 });
  return { page, errors, requests };
}
// wait until the page has rendered n more frames (the sim and demo are frame-driven)
export async function frames(page, n) {
  const f0 = await page.evaluate(() => window.__tusche.frame);
  await page.waitForFunction(t => window.__tusche.frame >= t, f0 + n, { timeout: 600000, polling: 50 });
}
export async function playAndWait(page, actions, extra = 10) {
  await page.evaluate(a => window.__tusche.play(a), actions);
  await page.waitForFunction(() => !window.__tusche.demo, null, { timeout: 600000, polling: 50 });
  if (extra) await frames(page, extra);
}
