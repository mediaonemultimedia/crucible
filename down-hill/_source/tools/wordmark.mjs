// Render the title's transparent PNG. Run with node tools/wordmark.mjs.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const assets = new URL('../src/assets/', import.meta.url);
const font = (await readFile(new URL('archivo-black.woff2', assets))).toString('base64');
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage();
  const png = await page.evaluate(async (font) => {
    const face = new FontFace('Title lettering', `url(data:font/woff2;base64,${font})`);
    document.fonts.add(await face.load());
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 532;
    const g = canvas.getContext('2d');
    g.lineJoin = 'round';
    g.textBaseline = 'alphabetic';

    // A forward lean and a slight climb across the lockup, like the course.
    g.translate(640, 258);
    g.rotate(-0.052);
    g.transform(1, 0, -0.19, 1, 0, 0);
    function word(text, x, y, width, size, palette) {
      const [face, mid, low, bevel, side] = palette;
      g.save();
      g.translate(x, y);
      g.font = `${size}px "Title lettering"`;
      g.scale(width / g.measureText(text).width, 1);
      g.lineWidth = 32;
      g.strokeStyle = '#15142f';
      for (let i = 24; i >= 0; i -= 3) g.strokeText(text, -i * 0.28, i);
      g.lineWidth = 15;
      g.strokeStyle = side;
      g.fillStyle = side;
      for (let i = 20; i >= 4; i -= 2) {
        g.strokeText(text, -i * 0.28, i);
        g.fillText(text, -i * 0.28, i);
      }
      g.lineWidth = 8;
      g.strokeStyle = bevel;
      g.strokeText(text, 0, 0);
      const ink = g.createLinearGradient(0, -size * .79, 0, 0);
      ink.addColorStop(0, face);
      ink.addColorStop(.48, mid);
      ink.addColorStop(1, low);
      g.fillStyle = ink;
      g.fillText(text, 0, 0);
      g.restore();
    }
    word('FLUFFED', -466, -36, 942, 235, ['#fffdf4', '#fffdf4', '#eef6ff', '#d3ecff', '#4383c7']);
    word('FURIOUS', -500, 174, 1025, 251, ['#fff476', '#ffd33c', '#ff8f22', '#ffdb67', '#ba3047']);

    // The ampersand is a rubber pit badge set into the seam between words.
    g.save();
    g.translate(0, -23);
    g.rotate(0.11);
    g.fillStyle = '#15142f';
    g.beginPath();
    g.roundRect(-58, -43, 116, 90, 22);
    g.fill();
    g.fillStyle = '#116b72';
    g.beginPath();
    g.roundRect(-49, -37, 98, 71, 16);
    g.fill();
    g.fillStyle = '#bdfdea';
    g.font = '62px "Title lettering"';
    g.textAlign = 'center';
    g.fillText('&', 0, 19);
    g.restore();
    return canvas.toDataURL('image/png').split(',')[1];
  }, font);
  await writeFile(new URL('fluffed-furious.png', assets), Buffer.from(png, 'base64'));
} finally {
  await browser.close();
}
