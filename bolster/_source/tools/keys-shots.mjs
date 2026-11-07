/* The keyboard legend's evidence: the versus select card (both players on
   one keyboard), the versus pause card, the one-player picture (select and
   pause), the picture after rebinding a key by clicking it, and the narrow
   screen's fallback to the text list.

     node tools/keys-shots.mjs [--html final.html] [--out shots/keys]

   Fails on any console error or a failed check. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const html = path.resolve(opt('--html', path.join(root, 'final.html')));
const out = path.resolve(opt('--out', path.join(root, 'shots', 'keys')));
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
let bad = 0;
const check = (ok, what) => { console.log(ok ? '  ok ' : '  FAIL', what); if (!ok) bad++; };

async function open(q, vp = { width: 1280, height: 720 }) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`file://${html}?${q}&hold&noportraits&seed=3`);
  await page.waitForFunction(() => document.body.classList.contains('is-live') && window.__bolster, null, { timeout: 240000 });
  const step = (s, d = false) => page.evaluate(([s, d]) => window.__bolster.step(s, d), [s, d]);
  const shot = async (n) => { await step(0, true); await page.screenshot({ path: path.join(out, `${n}.png`) }); };
  const toFight = () => page.evaluate(() => { const B = window.__bolster; for (let t = 0; t < 8 && B.fight.st.phase !== 'fight'; t += 1 / 60) B.frame(1 / 60, false); });
  const lit = (sel) => page.evaluate((sel) => [...document.querySelectorAll(`${sel} .kb g.lit`)].map((g) => `${g.dataset.code}:${g.classList.contains('p1') ? 1 : 2}`).sort().join(' '), sel);
  const visible = (sel) => page.evaluate((sel) => { const e = document.querySelector(sel); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; }, sel);
  return { page, errs, step, shot, toFight, lit, visible };
}

// ── versus: pause, then the select card, then a rebind by clicking a key
{
  const T = await open('p1=kevalanche&p2=kevalanche&versus=1&n1=Kevin&n2=John');
  const { page, step, shot, toFight, lit, visible } = T;
  await toFight();
  await page.keyboard.press('Escape'); await step(0.1);
  check(await visible('#controls-pause .kb'), 'versus pause: the keyboard picture shows');
  const L = await lit('#controls-pause');
  check(L === 'ArrowDown:2 ArrowLeft:2 ArrowRight:2 ArrowUp:2 KeyA:1 KeyD:1 KeyE:1 KeyG:1 KeyH:1 KeyS:1 KeyW:1 Numpad0:2 Numpad4:2 Numpad5:2 Numpad6:2 NumpadEnter:2 Space:1', `versus pause lit: ${L}`);
  await shot('2-pause-versus');
  await page.click('#pause-screen .opt[data-act="select"]'); await step(0.3);
  check(await page.evaluate(() => window.__bolster.screen) === 'select', 'back to the versus select');
  check(await visible('#controls-select .kb'), 'versus select: the keyboard picture shows');
  await shot('1-select-versus');
  // rebind player 1's light (G) by clicking it on the picture, then V
  await page.click('#controls-select .kb g.lit[data-code="KeyG"]'); await step(0.05);
  check(await page.evaluate(() => !!document.querySelector('#controls-select .kb g.wait[data-code="KeyG"]')), 'the clicked key waits for the new one');
  await shot('3-rebind-waiting');
  await page.keyboard.press('KeyV'); await step(0.1);
  const L2 = await lit('#controls-select');
  check(/KeyV:1/.test(L2) && !/KeyG:/.test(L2), `after rebinding light to V: ${L2}`);
  check(await page.evaluate(() => window.__bolster.bind[0].light.join()) === 'KeyV', 'the binding itself changed');
  await shot('4-select-after-rebind');
  // and back (so the saved keys are the defaults again)
  await page.click('#controls-select .kb button.rk'); await step(0.05);
  check(/KeyG:1/.test(await lit('#controls-select')), 'Reset keys: G again');
  console.log('versus', T.errs.length ? T.errs : 'ok'); bad += T.errs.length;
  await page.close();
}

// ── one player: the pause card and the select card
{
  const T = await open('p1=rubberta&p2=sumaura&cpu=normal');
  const { page, step, shot, toFight, lit, visible } = T;
  await toFight();
  await page.keyboard.press('Escape'); await step(0.1);
  check(await visible('#controls-pause .kb'), 'one-player pause: the picture shows');
  const L = await lit('#controls-pause');
  check(L === 'ArrowDown:1 ArrowLeft:1 ArrowRight:1 ArrowUp:1 KeyA:1 KeyD:1 KeyE:1 KeyO:1 KeyP:1 KeyS:1 KeyW:1 Space:1', `one-player lit: ${L}`);
  await shot('5-pause-solo');
  await page.click('#pause-screen .opt[data-act="select"]'); await step(0.3);
  await shot('6-select-solo');
  console.log('solo', T.errs.length ? T.errs : 'ok'); bad += T.errs.length;
  await page.close();
}

// ── a narrow screen: the text list instead
{
  const T = await open('p1=kevalanche&p2=johnny&versus=1&n1=Kevin&n2=John', { width: 760, height: 640 });
  const { page, step, shot, toFight, visible } = T;
  await toFight();
  await page.keyboard.press('Escape'); await step(0.1);
  check(!(await visible('#controls-pause .kb')), 'narrow: no picture');
  check(await visible('#controls-pause .pcol'), 'narrow: the text list');
  await shot('7-pause-narrow');
  console.log('narrow', T.errs.length ? T.errs : 'ok'); bad += T.errs.length;
  await page.close();
}

await browser.close();
process.exit(bad ? 1 : 0);
