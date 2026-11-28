/* Re-render the race-setup course overviews from the current game (the title
   diorama camera of each world), 1120×680, into src/assets/courses/<id>.png.
   Convert to WebP after: python3 -c "from PIL import Image; …" (see below).
     node tools/course-art.mjs build/lookdev-race.html                        */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = path.resolve(process.argv[2] || path.join(root, 'build/lookdev-race.html'));
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1120, height: 680 }, deviceScaleFactor: 1 });
  await page.goto('file://' + html + '?hold&noportraits');
  await page.waitForFunction(() => window.__dh && document.body.classList.contains('is-live'));
  await page.addStyleTag({ content: '#ui,#pads,#bubbles{display:none!important}' });
  for (const id of ['landing', 'laundry', 'hockey', 'park', 'dojo']) {
    await page.evaluate(async (id) => { const A = __dh; A.setTrack(id); A.setScreen('title'); A.step(3); }, id);
    await page.waitForTimeout(500);
    const png = path.join(root, 'src/assets/courses', id + '.png');
    await page.screenshot({ path: png });
    execFileSync('python3', ['-c', `from PIL import Image; Image.open(${JSON.stringify(png)}).save(${JSON.stringify(png.replace(/\.png$/, '.webp'))}, quality=84); import os; os.remove(${JSON.stringify(png)})`]);
    console.log('course art', id);
  }
} finally { await browser.close(); }
