// screenshots during and after the opening demo
import { launch, open, frames } from './lib.mjs';
const [,, outPrefix, q = '?fixed', vp = '1280x800'] = process.argv;
const [w, h] = vp.split('x').map(Number);
const b = await launch();
const { page, errors } = await open(b, q, { width: w, height: h });
await page.waitForFunction(() => window.__tusche.frame >= 420, null, { timeout: 900000, polling: 100 });
await page.screenshot({ path: outPrefix + '-mid.png' });
await page.waitForFunction(() => !window.__tusche.demo, null, { timeout: 1800000, polling: 100 });
const f = await page.evaluate(() => window.__tusche.frame);
await frames(page, 360);
await page.screenshot({ path: outPrefix + '-end.png' });
console.log(JSON.stringify({ errors: errors.filter(e => !e.includes('GPU stall')), demoFrames: f }));
await b.close();
