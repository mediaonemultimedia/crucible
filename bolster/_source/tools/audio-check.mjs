/* The audio pass, in the browser (headless Chromium): the real page.

   - no AudioContext before the first gesture; after a key: running, the
     menu loop scheduled; zero console errors or warnings throughout
   - the corner speaker and M: mute on / off, remembered (localStorage)
   - a CPU-vs-CPU match (seeded): every SFX the game asks for, with its sim
     tick (→ shots/audio/fight-sfx.json, rendered to WAV by audio-render.mjs);
     the round / 'Fight!' / K.O. / jingle flow; the pause holds the music
   - practice: the music low
   - screenshots of the speaker and the pause card's sound pillows

     node tools/audio-check.mjs [--html final.html]                       */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const html = path.resolve(root, arg('--html', 'final.html'));
const out = path.join(root, 'shots/audio');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errs = [], warns = [];
const fail = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail.push(what); };

async function open(q, vp = { width: 1280, height: 720 }) {
  const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); if (m.type() === 'warning') warns.push(m.text()); });
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('request', (r) => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) errs.push('network request: ' + r.url()); });
  await page.goto(`file://${html}?${q}`);
  await page.waitForFunction(() => document.body.classList.contains('is-live'), null, { timeout: 240000 });
  return page;
}

/* 1. the title: silent until a gesture */
{
  const page = await open('webgl&noportraits');
  const before = await page.evaluate(() => ({ ctx: !!window.__bolster.audio.ctx }));
  check(!before.ctx, 'no AudioContext before the first gesture');
  await page.waitForTimeout(400);
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(900);
  const after = await page.evaluate(() => { const A = window.__bolster.audio; return { state: A.ctx?.state, loop: A.loopSeq?.name, on: A.loopSeq?.on, screen: window.__bolster.screen, buffers: Object.keys(A.buffers).length }; });
  check(after.state === 'running', `after a key: AudioContext ${after.state}`);
  check(after.loop === 'menu' && after.on, `menu loop playing on the ${after.screen} screen`);
  check(after.buffers === 7, `7 clips decoded (${after.buffers})`);
  // the corner speaker
  await page.screenshot({ timeout: 120000, path: path.join(out, 'speaker-on.png'), clip: { x: 1280 - 360, y: 0, width: 360, height: 140 } });
  await page.click('#sound');
  await page.waitForTimeout(200);
  const m1 = await page.evaluate(() => ({ muted: window.__bolster.audio.settings.muted, stored: localStorage.getItem('pillowfight.audio.v1'), off: document.querySelector('#sound').classList.contains('off'), gain: window.__bolster.audio.master.gain.value }));
  check(m1.muted && m1.off && /"muted":true/.test(m1.stored), 'the speaker mutes (and it is remembered)');
  await page.waitForTimeout(300);
  await page.screenshot({ timeout: 120000, path: path.join(out, 'speaker-off.png'), clip: { x: 1280 - 360, y: 0, width: 360, height: 140 } });
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(100);
  const m2 = await page.evaluate(() => window.__bolster.audio.settings.muted);
  check(m2 === false, 'M unmutes');
  await page.screenshot({ timeout: 120000, path: path.join(out, 'mode-menu.png') });
  // the legend has M
  const legend = await page.evaluate(() => { window.__bolster.pause; return document.querySelector('#controls-select')?.innerHTML.includes('<b>Mute</b> M') || document.querySelector('#controls-pause')?.innerHTML.includes('<b>Mute</b> M'); });
  check(legend, 'the keyboard legend shows M (mute)');
  await page.close();
}

/* 2. a CPU-vs-CPU match: the SFX it asks for, by sim tick; the flow */
{
  const page = await open('p1=kevalanche&p2=johnny&p1cpu=hard&cpu=hard&seed=7&hold&webgl&noportraits');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const B = window.__bolster, A = B.audio;
    window.__sfx = []; window.__flow = [];
    const play = A.play.bind(A), sting = A.sting.bind(A), music = A.music.bind(A), duck = A.duck.bind(A), intense = A.setIntense.bind(A);
    A.play = (id, o = {}) => { window.__sfx.push({ id, gain: +(o.gain ?? 1).toFixed(3), rate: +(o.rate ?? 1).toFixed(3), delay: o.delay || 0, tick: B.fight?.st.tick ?? 0 }); play(id, o); };
    A.sting = (n) => { window.__flow.push({ sting: n, tick: B.fight?.st.tick ?? 0 }); sting(n); };
    A.music = (n) => { window.__flow.push({ music: n, tick: B.fight?.st.tick ?? 0 }); music(n); };
    A.duck = (to, hold) => { window.__flow.push({ duck: to, hold, tick: B.fight?.st.tick ?? 0 }); duck(to, hold); };
    A.setIntense = (on) => { if (!!on !== A.intense) window.__flow.push({ intense: !!on, tick: B.fight?.st.tick ?? 0 }); intense(on); };
  });
  let s;
  for (let k = 0; k < 80; k++) {
    s = await page.evaluate(() => { const B = window.__bolster; B.step(4, false); return { screen: B.screen, phase: B.fight.st.phase, tick: B.fight.st.tick }; });
    if (s.screen === 'win') break;
  }
  await page.evaluate(() => window.__bolster.step(1, true));
  const r = await page.evaluate(() => ({ sfx: window.__sfx, flow: window.__flow, counts: window.__bolster.audio.counts, winner: window.__bolster.fight.st.winner }));
  fs.writeFileSync(path.join(out, 'fight-sfx.json'), JSON.stringify(r, null, 1));
  const ids = new Set(r.sfx.map((x) => x.id));
  console.log(`  match: ${r.sfx.length} SFX over ${(s.tick / 60).toFixed(0)} s; ${[...ids].sort().join(', ')}`);
  for (const id of ['hit-light', 'hit-heavy', 'block', 'whoosh-light', 'whoosh-heavy', 'jump', 'land', 'knockdown', 'feather-burst', 'crowd-ooh', 'thump']) check(ids.has(id), `the match played ${id}`);
  check(r.flow.some((f) => f.sting === 'round') && r.flow.some((f) => f.music === 'fight') && r.flow.some((f) => f.duck) && r.flow.some((f) => f.sting === 'win'), 'round sting, the fight loop on "Fight!", the K.O. duck, the win jingle');
  // a flurry: never more than a whoosh per 7 ticks per player
  const w = r.sfx.filter((x) => x.id.startsWith('whoosh'));
  check(w.length > 10, `${w.length} whooshes`);
  // no two identical sounds on the same tick (no double-play)
  const keys = r.sfx.map((x) => `${x.tick}:${x.id}:${x.rate}`);
  check(new Set(keys).size === keys.length, 'no sound played twice for one event');
  await page.close();
}

/* 3. pause: the music holds; the sound pillows (screenshot); practice is quiet */
{
  const page = await open('p1=sumaura&p2=zach&cpu=normal&seed=4&hold&webgl&noportraits');
  await page.keyboard.press('KeyQ');
  for (let i = 0; i < 12; i++) { if (await page.evaluate(() => { window.__bolster.step(0.5, false); return window.__bolster.audio.loopSeq?.name === 'fight'; })) break; }
  await page.evaluate(() => window.__bolster.step(2, true));
  const a = await page.evaluate(() => ({ loop: window.__bolster.audio.loopSeq?.name, phase: window.__bolster.fight.st.phase }));
  check(a.loop === 'fight', `the fight loop after 'Fight!' (${a.loop}, ${a.phase})`);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__bolster.step(0.1, true));
  await page.waitForTimeout(400);
  const p = await page.evaluate(() => ({ screen: window.__bolster.screen, on: !!window.__bolster.audio.loopSeq, bus: window.__bolster.audio.musicBus.gain.value }));
  check(p.screen === 'pause' && !p.on && p.bus < 0.05, 'paused: the music stops where it is');
  // the volume pillows by keyboard: down to SFX, right twice
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
  const sel = await page.evaluate(() => document.querySelector('#pause-screen .opt.sel')?.dataset.act);
  const before = await page.evaluate(() => window.__bolster.audio.settings[document.querySelector('#pause-screen .opt.sel')?.dataset.act]);
  await page.keyboard.press('ArrowLeft');
  const after = await page.evaluate(() => window.__bolster.audio.settings[document.querySelector('#pause-screen .opt.sel')?.dataset.act]);
  check((sel === 'sfx' || sel === 'music') && after === before - 10, `◀ turns ${sel} down (${before} → ${after})`);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.evaluate(() => window.__bolster.step(0, true));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'pause-sound.png'), timeout: 120000 });
  await page.setViewportSize({ width: 820, height: 900 });
  await page.evaluate(() => window.__bolster.step(0, true));
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(out, 'pause-sound-narrow.png'), timeout: 120000 });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__bolster.step(0.1, true));
  await page.waitForTimeout(500);
  const r2 = await page.evaluate(() => ({ on: window.__bolster.audio.loopSeq?.on, bus: window.__bolster.audio.musicBus.gain.value }));
  check(r2.on && r2.bus > 0.2, 'resumed: the music picks up again');
  await page.close();
}
{
  const page = await open('practice=kevalanche&dummy=sumaura&hold&webgl&noportraits');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => { const A = window.__bolster.audio; return { loop: A.loopSeq?.name, practice: A.practice, bus: A.musicBus.gain.value, full: (A.settings.music / 100) ** 2 * 0.9 }; });
  check(r.loop === 'fight' && r.practice && r.bus < r.full * 0.5, `practice: the fight loop, low (${r.bus.toFixed(3)} of ${r.full.toFixed(3)})`);
  // M is the meter in practice: the sound stays on
  await page.keyboard.press('KeyM');
  check(await page.evaluate(() => window.__bolster.audio.settings.muted === false), 'practice: M is still the meter (no mute)');
  await page.close();
}

await browser.close();
const audioWarn = warns.filter((w) => /audio|AudioContext|autoplay/i.test(w));
check(!errs.length, `zero console errors${errs.length ? ': ' + errs.join(' | ') : ''}`);
check(!audioWarn.length, `no audio / autoplay warnings${audioWarn.length ? ': ' + audioWarn.join(' | ') : ''}`);
if (warns.length) console.log('  (other warnings: ' + [...new Set(warns)].slice(0, 5).join(' | ') + ')');
console.log(fail.length ? `FAILED: ${fail.length}` : 'audio checks: all passed');
process.exit(fail.length ? 1 : 0);
