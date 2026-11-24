/* Warm split-screen benchmark. Run with Chrome hardware acceleration:
   node tools/framecost.mjs build/lookdev-race.html --track=landing --views=4
   Use --headed for a window or --webgl to force the WebGL backend.
   GPU timestamps are collected after the frame-pacing sample. */
import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = (name, fallback) => args.find((arg) => arg.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const files = args.filter((arg) => !arg.startsWith('--'));
const track = option('track', 'landing');
const requestedViews = option('views', null);
const views = requestedViews ? [Number(requestedViews)] : [1, 4];
const warmup = Number(option('warmup', '120'));
const frames = Number(option('frames', '600'));
const gpuFrames = 45;

if (!files.length || views.some(n => n !== 1 && n !== 4) ||
    !Number.isInteger(warmup) || warmup < 1 || !Number.isInteger(frames) || frames < 2) {
  throw new Error('Pass at least one HTML file. Use --views=1 or --views=4 and positive --warmup and --frames counts.');
}

const chrome = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : { channel: 'chrome' };
const browser = await chromium.launch({ ...chrome, headless: !args.includes('--headed'),
  args: ['--enable-unsafe-swiftshader'] });
const summary = [];

try {
  for (const file of files) for (const n of views) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    try {
      const url = pathToFileURL(path.resolve(file));
      const params = new URLSearchParams({ cpu: 'hard', seed: 4, track, p1: 'zach' });
      for (const flag of ['hold', 'noportraits', 'warm-effects', ...(args.includes('--webgl') ? ['webgl'] : [])]) params.set(flag, '');
      if (n === 4) Object.entries({ p2: 'sumaura', alt2: 1, p3: 'k8e', p4: 'kevalanche' }).forEach(([k, v]) => params.set(k, v));
      url.search = params;
      await page.goto(url.href);
      await page.waitForFunction(n => window.__dh?.race && __dh.hv.length === n, n);
      const result = await page.evaluate(async ({ warmup, frames, gpuFrames, track }) => {
        const app = window.__dh;
        if (app.race.karts.length !== 8 || app.trackId !== track) throw new Error('Race field or course did not match the benchmark.');
        const CPU = app.cpus.find(Boolean).constructor;
        app.hv.forEach((view, i) => {
          const cpu = new CPU(app.race, view.i, 'hard', 9 + i);
          app.humanP[i].ctl.sample = () => cpu.think();
        });
        await app.fx.pipelineWarmup;
        app.step(10, false);
        const renderer = app.renderer;
        const info = renderer.info;
        const originalFrame = app.frame.bind(app);
        const warm = [], measured = [];
        info.autoReset = false;

        // Use the game's own rAF loop, including its elapsed-time simulation.
        await new Promise(resolve => {
          app.frame = dt => {
            const start = performance.now();
            info.reset();
            originalFrame(dt);
            const data = {
              dt: dt * 1000, wall: performance.now() - start,
              update: app.frameMs.at(-1), submit: app.renderMs.at(-1),
              draws: info.render.drawCalls, triangles: info.render.triangles,
            };
            if (warm.length < warmup) warm.push(data);
            else measured.push(data);
            if (measured.length === frames) {
              app.frame = () => {};
              resolve();
            }
          };
          app.loop();
        });

        const backend = renderer.backend;
        const gpu = [];
        if (backend.isWebGPUBackend && backend.hasFeature('timestamp-query')) {
          backend.trackTimestamp = true;
          for (let i = 0; i < gpuFrames; i++) {
            await new Promise(requestAnimationFrame);
            originalFrame(1 / 60);
            const duration = await renderer.resolveTimestampsAsync();
            if (duration > 0) gpu.push(duration);
          }
          backend.trackTimestamp = false;
        }
        info.autoReset = true;

        const stats = (values) => {
          const sorted = [...values].sort((a,b) => a-b);
          const at = q => +sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))].toFixed(2);
          return { p50: at(.5), p95: at(.95), p99: at(.99), max: at(1) };
        };
        const gaps = measured.map(frame => frame.dt);
        const nSlow = gaps.filter(ms => ms > 25).length;
        const avg = key => Math.round(measured.reduce((sum, frame) => sum + frame[key], 0) / measured.length);
        return {
          backend: backend.isWebGPUBackend ? 'WebGPU' : 'WebGL',
          device: backend.device?.adapterInfo?.description || backend.device?.adapterInfo?.vendor || null,
          sampled: measured.length, warmed: warm.length,
          fps: +(1000 * gaps.length / gaps.reduce((s,v) => s + v, 0)).toFixed(2),
          missesOver25ms: nSlow, frameGap: stats(gaps), warmFrameGap: stats(warm.map(frame => frame.dt)),
          mainThread: stats(measured.map(frame => frame.wall)), update: stats(measured.map(frame => frame.update)),
          renderSubmit: stats(measured.map(frame => frame.submit)), gpu: gpu.length ? { ...stats(gpu), samples: gpu.length } : null,
          draws: avg('draws'), triangles: avg('triangles'),
        };
      }, { warmup, frames, gpuFrames, track });
      console.log(JSON.stringify({ file: path.basename(file), track, views: n, ...result }));
      summary.push({ file: path.basename(file), track, views: n, fps: result.fps, missed: result.missesOver25ms,
        maxGapMs: result.frameGap.max, mainP95Ms: result.mainThread.p95, gpuP95Ms: result.gpu?.p95 });
    } finally {
      await page.close();
    }
  }
  console.table(summary);
} finally {
  await browser.close();
}
