/* Portrait sanity check, in headless Chromium: loads the select screen
   (WebGL 2 by default, `--webgpu` tries the WebGPU path), takes every card
   portrait the page made and scores it — row-to-row jitter (a sheared
   readback is all stripes), and that the plush is centred (coverage of
   non-background pixels in the middle third vs the edges).
     node tools/portrait-check.mjs [--webgpu] [--html F] [--shot out.png]
   Exits 1 on a bad portrait or a console error.                       */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const webgpu = process.argv.includes('--webgpu');
const html = path.resolve(arg('--html') || path.join(root, 'final.html'));
const shot = arg('--shot');
const args = webgpu
  ? ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: Number(arg('--dpr') || 1) });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('file://' + html + '?screen=select&hold' + (webgpu ? '' : '&webgl'));
await page.waitForFunction(() => window.__bolster && Object.keys(window.__bolster.portraits || {}).length >= 5, null, { timeout: 120000 });
const res = await page.evaluate(async () => {
  const B = window.__bolster, out = {};
  out.backend = B.renderer?.backend?.isWebGPUBackend ? 'webgpu' : 'webgl2';
  for (const [id, url] of Object.entries(B.portraits)) {
    const im = new Image(); im.src = url; await im.decode();
    const W = im.width, H = im.height, c = document.createElement('canvas');
    c.width = W; c.height = H; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, W, H).data;
    // row-to-row vs column-to-column differences: a picture (fur and all)
    // is about as busy both ways; sheared rows are smooth along a row and
    // jump between rows, so the ratio climbs well past 1
    let j = 0, h = 0;
    for (let y = 1; y < H; y++) for (let x = 4; x < W * 4; x++) if ((x & 3) !== 3) {
      j += Math.abs(d[y * W * 4 + x] - d[(y - 1) * W * 4 + x]);
      h += Math.abs(d[y * W * 4 + x] - d[y * W * 4 + x - 4]);
    }
    j /= h || 1;
    // background = the corner colour; coverage by thirds across
    const bg = [d[0], d[1], d[2]], cov = [0, 0, 0];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 60) cov[Math.min(2, Math.floor(x * 3 / W))]++;
    }
    out[id] = { W, H, jitter: +j.toFixed(2), centre: +(cov[1] / (W * H / 3)).toFixed(2), edges: +((cov[0] + cov[2]) / (W * H * 2 / 3)).toFixed(2) };
  }
  return out;
});
// --shear out.png: each portrait as the old code read a WebGPU copy (240 px
// wide, rows padded 960 → 1024 bytes, read as packed) beside the real one
const shear = arg('--shear');
if (shear) {
  const url = await page.evaluate(async () => {
    const ids = Object.keys(window.__bolster.portraits), W = 240, H = 320, S = 1024;
    const c = document.createElement('canvas'); c.width = W * ids.length; c.height = H * 2;
    const g = c.getContext('2d');
    for (const [k, id] of ids.entries()) {
      const im = new Image(); im.src = window.__bolster.portraits[id]; await im.decode();
      g.drawImage(im, 8, 0, W, H, k * W, H, W, H);
      const pic = g.getImageData(k * W, H, W, H).data, pad = new Uint8Array(S * H), out = g.createImageData(W, H);
      for (let y = 0; y < H; y++) pad.set(pic.subarray(y * W * 4, (y + 1) * W * 4), y * S);
      out.data.set(pad.subarray(0, W * H * 4));
      g.putImageData(out, k * W, 0);
    }
    return c.toDataURL();
  });
  (await import('fs')).writeFileSync(shear, Buffer.from(url.split(',')[1], 'base64'));
}
if (shot) { await page.evaluate(() => window.__bolster.step?.(1.2)); await page.waitForTimeout(400); await page.screenshot({ path: shot }); }
await browser.close();
console.log(JSON.stringify(res, null, 1));
let bad = errors.length > 0;
for (const [id, r] of Object.entries(res)) if (id !== 'backend' && (r.jitter > 1.6 || r.centre < 0.25)) { console.log('BAD portrait', id, r); bad = true; }
if (errors.length) console.log('console errors:', errors);
process.exit(bad ? 1 : 0);
