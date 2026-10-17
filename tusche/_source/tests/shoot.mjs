// node shoot.mjs <out.png> <query> <frames> [actionsJSON]
import { launch, open, frames, playAndWait } from './lib.mjs';
const [,, out, q = '?fixed', n = '60', acts] = process.argv;
const b = await launch();
const vp = process.env.VP ? { width: +process.env.VP.split('x')[0], height: +process.env.VP.split('x')[1] } : undefined;
const { page, errors } = await open(b, q, vp);
if (acts) await playAndWait(page, JSON.parse(acts), 0);
await frames(page, +n);
await page.screenshot({ path: out });
console.log(JSON.stringify({ errors, demo: await page.evaluate(() => window.__tusche.demo), frame: await page.evaluate(() => window.__tusche.frame) }));
await b.close();
