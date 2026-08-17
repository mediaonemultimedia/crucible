#!/usr/bin/env node
/* ─────────────────────────────────────────────────────────────────────────────
   crucible-recorder — live alpha capture companion for the Crucible series.

   A study in the series renders its frame twice: once to the screen, and, while
   recording, once more into an off-screen RGBA8 target whose alpha is a real
   matte rather than a baked-in black. Those raw frames are POSTed here one at a
   time and piped straight into ffmpeg, which encodes ProRes 4444 with a genuine
   alpha channel.

   Nothing is buffered to disk in between and nothing accumulates in browser
   memory: the browser holds at most one frame in flight, and ffmpeg's stdin is
   the backpressure signal for the whole chain. A take can therefore run for as
   long as there is disk for the .mov itself.

   Zero dependencies — plain node:http, so there is nothing to install and
   nothing to keep current.

   Usage:  node server.mjs [--port 7878] [--out DIR]
   ───────────────────────────────────────────────────────────────────────────── */

import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const VERSION = '1.0.0';

/* ── configuration ──────────────────────────────────────────────────────── */

function arg(name, fallback){
  const i = process.argv.indexOf('--' + name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const PORT    = Number(arg('port', 7878));
const OUT_DIR = path.resolve(arg('out', '/Users/kevincave/Desktop/Claude/recordings'));
const FFMPEG  = arg('ffmpeg', '/opt/homebrew/bin/ffmpeg');
const FFPROBE = arg('ffprobe', '/opt/homebrew/bin/ffprobe');

// A take is stopped on its own if it runs past this, so a session left running
// by accident cannot quietly fill the disk.
const MAX_SECONDS   = Number(arg('max-seconds', 1200));   // 20 minutes
// and stopped early if the volume gets tight
const MIN_FREE_BYTES = 4 * 1024 * 1024 * 1024;            // keep 4 GB clear

/* How many frames may sit in Node's pipe buffer before the browser is told to
   ease off. A pipe accepts 64 KB at a time and a frame is eight megabytes, so
   every frame written is buffered by Node and drained over many turns of the
   event loop — a queue of a few frames is what normal operation looks like, not
   a warning. Set this too low (three was the first guess) and the brake is on
   permanently, which halves the capture rate for no reason. Eight frames is
   about 64 MB of headroom and only trips when the encoder is genuinely losing. */
const QUEUE_FRAMES = 8;

/* ── sessions ───────────────────────────────────────────────────────────── */

/** @type {Map<string, Session>} */
const sessions = new Map();

/* Default deliverable: hevc_videotoolbox with alpha. Apple's hardware HEVC
   encoder can carry a real alpha channel (the same mechanism behind Keynote
   and macOS screen-recording exports with transparency), and on this
   project's actual fire footage it measured ~15x smaller than ProRes 4444 at
   visually equivalent quality — 23.8 MB vs 356 MB for the same 5 seconds at
   2132x1080 — verified by decoding real frames from both and comparing alpha
   values pixel-by-pixel (mean diff 0.16/255, max diff 3/255), and confirmed
   importing correctly with intact transparency in After Effects.

   The catch, and the reason this needed a second look before shipping as the
   default: this is not a self-describing alpha format the way ProRes is.
   ffprobe reports the stream as plain yuv420p — no alpha plane visible at the
   container level at all — even though the alpha is genuinely there once
   decoded. See checkAlphaByDecode() below, which exists specifically because
   the old pix-format string check goes blind on this codec.

   ProRes 4444 (prores_ks, software — prores_videotoolbox rejects every frame
   with -12912 on this machine) is kept as the PRORES_ARGS fallback, selectable
   per-session via cfg.codec === 'prores', for anyone who needs the
   maximum-compatibility mezzanine file over the small deliverable. */
const HEVC_ALPHA_ARGS = ['-c:v', 'hevc_videotoolbox', '-alpha_quality', '0.9',
  '-q:v', '65', '-tag:v', 'hvc1', '-pix_fmt', 'yuva444p10le'];
const PRORES_ARGS = ['-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le',
  '-alpha_bits', '16', '-vendor', 'apl0', '-qscale:v', '9'];

function encoderArgs(codec){
  return codec === 'prores' ? PRORES_ARGS : HEVC_ALPHA_ARGS;
}

function stamp(d = new Date()){
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function slug(s){
  return String(s || 'study').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'study';
}

class Session {
  constructor(cfg){
    this.id      = randomUUID().slice(0, 8);
    this.study   = slug(cfg.study);
    this.width   = cfg.width;
    this.height  = cfg.height;
    // The browser copies a GPU texture into a buffer, and WebGPU requires each
    // row of that copy to start on a 256-byte boundary. Rather than make the
    // browser strip the padding (a per-frame memcpy of the whole frame, on the
    // interactive thread), the padded rows are handed to ffmpeg as if they were
    // the real width and cropped away in the filter graph. Costs nothing.
    this.stride  = cfg.stride;
    this.padded  = cfg.stride / 4;
    this.fps     = cfg.fps;
    this.codec   = cfg.codec === 'prores' ? 'prores' : 'hevc';

    this.file = path.join(OUT_DIR,
      `${this.study}__${stamp()}__${this.width}x${this.height}p${this.fps}_${this.codec}_alpha.mov`);

    this.frameBytes = this.stride * this.height;
    this.startedAt  = Date.now();
    this.received   = 0;    // frames handed over by the browser
    this.written    = 0;    // frames actually pushed into ffmpeg (incl. holds)
    this.held       = 0;    // duplicated frames, i.e. the cost of a late frame
    this.closing    = false;
    this.done       = false;
    this.error      = null;
    this.dropped    = 0;    // handed over but ahead of the clock, so not written
    this.bytesIn    = 0;
    this.lastFrame  = null; // most recent payload, whether written or not
    this.prev       = null; // most recent *written* payload, for holds
    this.diskLow    = false;
    this.stderr     = '';

    // The volume can fill under a long take — ProRes 4444 at 1080p30 is roughly
    // 2.5 GB a minute (the hevc default is far lighter, but the disk guard
    // stays conservative and codec-agnostic rather than trusting an estimate)
    // — so the take is stopped before the disk is, not after.
    this.diskTimer = setInterval(async () => {
      this.diskLow = (await freeBytes(OUT_DIR)) < MIN_FREE_BYTES;
    }, 5000);
    this.diskTimer.unref?.();

    const args = [
      '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'rawvideo',
      '-pixel_format', 'rgba',
      '-video_size', `${this.padded}x${this.height}`,
      '-framerate', String(this.fps),
      '-i', 'pipe:0',
      '-vf', `crop=${this.width}:${this.height}:0:0`,
      ...encoderArgs(this.codec),
      '-movflags', '+write_colr',
      this.file,
    ];

    this.ff = spawn(FFMPEG, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    this.ff.stderr.on('data', d => { this.stderr = (this.stderr + d).slice(-4000); });
    this.ff.stdin.on('error', () => { /* closed under us; surfaced via exit */ });
    this.ff.on('error', e => { this.error = String(e.message || e); this.done = true; });
    this.exited = new Promise(res => this.ff.on('close', code => {
      this.code = code;
      if (code !== 0 && !this.error) this.error = `ffmpeg exited ${code}: ${this.stderr.trim().slice(0, 500)}`;
      this.done = true;
      res(code);
    }));

    log(`▶ ${this.id} ${this.study} ${this.width}×${this.height} @${this.fps} → ${path.basename(this.file)}`);
  }

  get elapsed(){ return (Date.now() - this.startedAt) / 1000; }

  /* Whether ffmpeg is genuinely behind — which is not the same question as
     whether the last write() returned false. A frame is several megabytes and a
     pipe buffer is 64 KB, so every single write to stdin returns false and Node
     buffers the remainder; taking that as backpressure would throttle the
     capture to a halt on the very first frame. What actually matters is whether
     the queue Node is holding is growing, so the signal is the depth of that
     queue measured in frames. */
  get busy(){
    return this.ff.stdin.writableLength > this.frameBytes * QUEUE_FRAMES;
  }

  /* Frames arrive whenever the browser managed to produce one, which under live
     interaction is not on a metronome. Rather than let the file drift out of
     sync with the wall clock — a ten second take that plays back as seven — each
     frame is placed at the position its timestamp says it belongs at, and any
     gap is filled by holding the previous frame. The take is then always the
     length it actually was, and a dropped frame costs a repeat instead of a
     lurch. */
  push(buf, tMs){
    if (this.closing || this.done) return { ok:false, reason:'closed' };
    this.received++;
    this.bytesIn += buf.length;
    this.lastFrame = buf;

    const target = Math.max(1, Math.round((tMs / 1000) * this.fps));

    // Ahead of the clock — the browser handed over more frames than this many
    // seconds of video can hold. Keep it as the frame to repeat if the next one
    // is late, but do not write it: the file stays locked to the wall clock.
    if (target <= this.written) { this.dropped++; return { ok:true, busy:this.busy }; }

    let holds = target - this.written - 1;
    // A very long stall should not blow the file up with thousands of repeats.
    if (holds > this.fps * 3) holds = this.fps * 3;

    if (holds > 0 && this.prev) {
      for (let i = 0; i < holds; i++) this.#write(this.prev);
      this.held += holds;
    }
    this.#write(buf);
    this.prev = buf;

    if (this.elapsed > MAX_SECONDS) return { ok:true, stop:'max-duration' };
    // Checked on a slow cadence rather than every frame: statfs is a syscall and
    // this runs on the path a live frame takes to the encoder.
    if (this.received % (this.fps * 5) === 0 && this.diskLow) return { ok:true, stop:'disk-space' };
    return { ok:true, busy:this.busy };
  }

  #write(buf){
    if (!this.ff.stdin.writable) return;
    this.ff.stdin.write(buf);
    this.written++;
  }

  async stop(){
    if (this.closing) { await this.exited; return this.result; }
    this.closing = true;
    clearInterval(this.diskTimer);

    /* Hold the last frame out to the wall clock before closing. Without this the
       file ends at the last frame that made it across, so a take whose final
       second was spent watching the plume settle comes back a second short —
       and every take is at least one frame short. A take should be exactly as
       long as it was performed. */
    if (this.prev && !this.error) {
      const want = Math.round(this.elapsed * this.fps);
      let pad = Math.min(want - this.written, this.fps * 3);
      for (let i = 0; i < pad; i++) { this.#write(this.prev); this.held++; }
    }
    try { this.ff.stdin.end(); } catch {}
    await this.exited;

    let probe = null;
    let bytes = 0;
    try { bytes = (await fsp.stat(this.file)).size; } catch {}
    if (!this.error && bytes > 0) probe = await ffprobe(this.file);

    /* The point of the whole exercise is the alpha channel, so the encode is
       not reported as a success until it's been genuinely confirmed. For a
       self-describing pix_fmt (ProRes's yuva444p10le/12le) the string alone
       is enough — yuv444p10le and yuva444p10le differ by one letter and by
       everything that matters. For hevc, the string never says so either way
       (see checkAlphaByDecode above), so fall back to actually decoding a
       frame and looking at the alpha channel's variance. */
    const ALPHA_FMTS = /^(yuva\d|ya\d|ayuv|[rb]gba|abgr|argb)/;
    let alpha = !!(probe && ALPHA_FMTS.test(probe.pix_fmt || ''));
    let alphaCheck = alpha ? { ok: true, via: 'pix_fmt' } : null;
    if (!alpha && !this.error && bytes > 0) {
      const midFrame = this.written > 1 ? Math.floor(this.written / 2) : 0;
      const decoded = await checkAlphaByDecode(this.file, this.width, this.height, midFrame);
      alphaCheck = { ...decoded, via: 'decode' };
      alpha = !!decoded.ok;
    }

    this.result = {
      id: this.id,
      file: this.file,
      bytes,
      seconds: Number((this.written / this.fps).toFixed(3)),
      wallSeconds: Number(this.elapsed.toFixed(3)),
      frames: { received: this.received, written: this.written,
                held: this.held, dropped: this.dropped },
      probe,
      alpha,
      alphaCheck,
      codec: this.codec,
      error: this.error,
      ok: !this.error && bytes > 0 && alpha,
    };
    sessions.delete(this.id);
    log(`■ ${this.id} ${path.basename(this.file)} — ${this.result.frames.written} frames, ` +
        `${(bytes/1048576).toFixed(1)} MB, ${this.codec}, pix_fmt=${probe?.pix_fmt || '?'} ` +
        `${this.result.ok ? `✓ alpha (${alphaCheck.via}${alphaCheck.range != null ? ', range ' + alphaCheck.range : ''})` : '✗ ' + (this.error || `no alpha (${alphaCheck?.reason || 'unknown'})`)}`);
    return this.result;
  }

  status(){
    return {
      id: this.id, study: this.study, file: this.file, codec: this.codec,
      width: this.width, height: this.height, fps: this.fps,
      elapsed: Number(this.elapsed.toFixed(2)),
      frames: { received: this.received, written: this.written,
                held: this.held, dropped: this.dropped },
      megabytesIn: Number((this.bytesIn / 1048576).toFixed(1)),
      busy: this.busy, done: this.done, error: this.error, diskLow: this.diskLow,
      maxSeconds: MAX_SECONDS,
    };
  }
}

function ffprobe(file){
  return new Promise(res => {
    execFile(FFPROBE, ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,profile,pix_fmt,width,height,r_frame_rate,codec_tag_string,nb_frames',
      '-of', 'json', file], (err, stdout) => {
      if (err) return res(null);
      try { res(JSON.parse(stdout).streams?.[0] || null); } catch { res(null); }
    });
  });
}

/* hevc_videotoolbox's alpha is real but invisible to ffprobe — the stream
   reports plain yuv420p, no auxiliary alpha stream, nothing the pix-format
   heuristic above can see. So when that heuristic comes back empty, decode an
   actual frame from the middle of the take to raw RGBA and look at the alpha
   channel directly: a genuine matte varies across the frame (edges, motes,
   plume shape); a channel that's silently missing or collapsed comes back
   constant. This is the same check used to hand-verify the encoder before it
   shipped as the default, just automated. */
function checkAlphaByDecode(file, width, height, frameIndex){
  return new Promise(res => {
    const args = ['-hide_banner', '-loglevel', 'error', '-y', '-i', file,
      '-vf', `select=eq(n\\,${frameIndex})`, '-vframes', '1',
      '-pix_fmt', 'rgba', '-f', 'rawvideo', 'pipe:1'];
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    const chunks = [];
    p.stdout.on('data', d => chunks.push(d));
    p.on('error', () => res({ ok: false, reason: 'decode failed to start' }));
    p.on('close', () => {
      const buf = Buffer.concat(chunks);
      const expect = width * height * 4;
      if (buf.length !== expect) return res({ ok: false, reason: `decoded ${buf.length}B, expected ${expect}B` });
      let min = 255, max = 0, sum = 0;
      const n = width * height;
      const stride = Math.max(1, Math.floor(n / 20000)); // sample, not every pixel
      let sampled = 0;
      for (let i = 0; i < n; i += stride) {
        const a = buf[i * 4 + 3];
        if (a < min) min = a;
        if (a > max) max = a;
        sum += a;
        sampled++;
      }
      const range = max - min;
      res({ ok: range > 8, range, min, max, mean: Number((sum / sampled).toFixed(1)), sampled });
    });
  });
}

/* ── http ───────────────────────────────────────────────────────────────── */

function log(...a){ console.log(`[${new Date().toISOString().slice(11,19)}]`, ...a); }

function cors(res){
  // Studies are opened from file:// as often as from a local server, and a
  // file:// page sends Origin: null — so the wildcard is the only thing that
  // covers both. The server binds to the loopback interface only.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Frame-Time,X-Session');
}

function json(res, code, obj){
  cors(res);
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type':'application/json', 'Content-Length':b.length });
  res.end(b);
}

function readBody(req, limit = 96 * 1024 * 1024){
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on('data', c => {
      n += c.length;
      if (n > limit) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks, n)));
    req.on('error', reject);
  });
}

async function freeBytes(dir){
  try { const s = await fsp.statfs(dir); return s.bavail * s.bsize; }
  catch { return Infinity; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const p = url.pathname;

  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

  try {
    if (p === '/health') {
      return json(res, 200, {
        ok: true, service: 'crucible-recorder', version: VERSION,
        ffmpeg: FFMPEG, outDir: OUT_DIR,
        encoder: 'hevc_videotoolbox (alpha) — default, request codec:"prores" for prores_ks 4444',
        maxSeconds: MAX_SECONDS,
        freeGB: Number(((await freeBytes(OUT_DIR)) / 1073741824).toFixed(1)),
        active: [...sessions.values()].map(s => s.status()),
      });
    }

    if (p === '/start' && req.method === 'POST') {
      const cfg = JSON.parse((await readBody(req, 1 << 20)).toString() || '{}');
      const width  = Math.max(2, Math.round(cfg.width  || 1920));
      const height = Math.max(2, Math.round(cfg.height || 1080));
      const stride = Math.max(width * 4, Math.round(cfg.stride || Math.ceil(width * 4 / 256) * 256));
      const fps    = Math.min(120, Math.max(1, Math.round(cfg.fps || 30)));
      if (stride % 256 !== 0) return json(res, 400, { error: 'stride must be a multiple of 256' });
      if (height % 2 !== 0 || width % 2 !== 0) return json(res, 400, { error: 'width and height must be even' });

      const free = await freeBytes(OUT_DIR);
      if (free < MIN_FREE_BYTES) {
        return json(res, 507, { error: `only ${(free/1073741824).toFixed(1)} GB free on the output volume` });
      }
      await fsp.mkdir(OUT_DIR, { recursive: true });

      const s = new Session({ study: cfg.study, width, height, stride, fps, codec: cfg.codec });
      sessions.set(s.id, s);
      // Rough, content-dependent estimate, enough for the HUD to warn, not a
      // guarantee. hevc's ~0.6 bits/pixel is calibrated from real measurement
      // on fire footage (a worst case — grain-heavy, full-frame detail, the
      // kind of content that compresses worst under either codec); ProRes
      // 4444's ~6 bits/pixel is the original software-encoder measurement.
      const bitsPerPixel = s.codec === 'prores' ? 6 : 0.6;
      const mbPerMin = (width * height * bitsPerPixel * fps * 60) / 1048576 / 8;
      return json(res, 200, { ...s.status(), codec: s.codec, estMBPerMinute: Math.round(mbPerMin) });
    }

    if (p === '/frame' && req.method === 'POST') {
      const s = sessions.get(url.searchParams.get('id'));
      if (!s) return json(res, 404, { error: 'no such session' });
      const t = Number(url.searchParams.get('t') || 0);
      const buf = await readBody(req);
      const expect = s.stride * s.height;
      if (buf.length !== expect) {
        return json(res, 400, { error: `frame is ${buf.length} bytes, expected ${expect}` });
      }
      const r = s.push(buf, t);
      if (r.stop) { const done = await s.stop(); return json(res, 200, { stopped: r.stop, result: done }); }
      return json(res, 200, { n: s.received, written: s.written, held: s.held,
                              dropped: s.dropped, busy: s.busy });
    }

    if (p === '/stop' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req, 1 << 20)).toString() || '{}');
      const s = sessions.get(body.id || url.searchParams.get('id'));
      if (!s) return json(res, 404, { error: 'no such session' });
      return json(res, 200, await s.stop());
    }

    if (p === '/status') {
      const s = sessions.get(url.searchParams.get('id'));
      if (!s) return json(res, 404, { error: 'no such session' });
      return json(res, 200, s.status());
    }

    return json(res, 404, { error: 'not found' });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', async () => {
  await fsp.mkdir(OUT_DIR, { recursive: true });
  log(`crucible-recorder ${VERSION} — http://127.0.0.1:${PORT}`);
  log(`output   ${OUT_DIR}`);
  log(`encoder  hevc_videotoolbox (alpha, hvc1) — default; codec:"prores" for prores_ks 4444`);
  log(`free     ${((await freeBytes(OUT_DIR)) / 1073741824).toFixed(1)} GB`);
});

async function shutdown(){
  for (const s of [...sessions.values()]) { try { await s.stop(); } catch {} }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
