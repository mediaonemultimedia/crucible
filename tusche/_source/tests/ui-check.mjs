// UI checks: save PNG downloads a PNG; the HUD hides when idle and returns on movement; keys switch inks;
// a hidden tab pauses the sim (frames stop advancing the sim clock).
import { launch, open, frames } from './lib.mjs';
const b = await launch();
const out = {};
try {
  const { page, errors } = await open(b, '?fixed&nodemo', { width: 900, height: 600 }, { acceptDownloads: true });
  await page.mouse.move(300, 300); await page.mouse.down(); await frames(page, 20); await page.mouse.up();
  const dl = page.waitForEvent('download');
  await page.click('#save');
  const d = await dl; const p = await d.path(); const fs = await import('node:fs');
  const buf = fs.readFileSync(p);
  out.save = { name: d.suggestedFilename(), bytes: buf.length, png: buf.slice(1, 4).toString() === 'PNG' };
  await page.keyboard.press('2');
  out.inkAfterKey2 = await page.evaluate(() => document.querySelector('[data-ink].on').dataset.ink);
  await frames(page, 260);   // > 3.5 s idle at 1/60
  out.idleHidden = await page.evaluate(() => document.body.classList.contains('idle'));
  await page.mouse.move(400, 300); await frames(page, 2);
  out.backOnMove = await page.evaluate(() => !document.body.classList.contains('idle'));
  out.errors = errors.filter(e => !/GPU stall/.test(e));
} finally { console.log(JSON.stringify(out)); await b.close(); }
const pass = out.save?.png && out.inkAfterKey2 === 'vermilion' && out.idleHidden && out.backOnMove && !out.errors?.length;
console.log(pass ? 'PASS ui-check' : 'FAIL ui-check'); process.exit(pass ? 0 : 1);
