# crucible-recorder

Record a **live, performed** take from a Crucible study — dragging the plume,
tweaking sliders, orbiting the camera — straight out to a **ProRes 4444 .mov
with a real alpha channel**, ready to composite in After Effects.

This is not the chart pipeline. That one is deterministic: it seeks a timeline,
renders each frame at its leisure and never has to keep up with anything. This
one has to capture a performance in real time without ever making the piece feel
heavy to play with. Different problem, different machine.

---

## Using it

**1. Start the companion** in a terminal and leave it running:

```
ai-node-studio/tools/recorder/crucible-rec
```

```
crucible-recorder 1.0.0 — http://127.0.0.1:7878
output   /Users/kevincave/Desktop/Claude/recordings
encoder  prores_ks 4444 → yuva444p10le (ap4h)
free     26.2 GB
```

**2. Open the study**, press `c` for the panel and scroll to **Capture**.

| Control | What it does |
| --- | --- |
| **Height** | 720 / 1080 / 1440. Width follows the window's aspect. |
| **Rate** | 24 / 30 / 60 fps. |
| **Background** | `Opaque` is the normal view. `Alpha` puts a checkerboard behind the canvas so you can see the matte you are about to record. |
| **Record / Stop** | Or `shift-R` from anywhere. |

**3. Perform the take.** Everything stays live — drag to push the fluid, orbit,
move sliders, change palette. A red `REC` readout sits at the top of the screen
with the running time, frame count and any held frames, and a hairline runs
around the viewport.

**4. Press Stop.** The companion flushes ffmpeg, probes the finished file and
the panel reports back:

```
solve__2026-08-16_213527__1818x1080p30_alpha.mov
7.03 s · 211 frames · 476.3 MB
prores 4444 · yuva444p12le — alpha verified.
```

Files land in `/Users/kevincave/Desktop/Claude/recordings/`, named
`{study}__{date}_{time}__{w}x{h}p{fps}_alpha.mov`.

---

## In After Effects

Interpret Footage → **Alpha: Premultiplied (Matted With Black)**.

The capture writes a premultiplied matte: RGB exactly as rendered, alpha =
`max(r,g,b)`. Over black that reconstructs the on-screen frame pixel for pixel;
over anything else it behaves the way a glowing, semi-transparent volume should.
For a purely additive comp you can ignore the matte entirely and use Add or
Screen — the RGB is already correct for that.

**The recorded plate is not identical to the screen, deliberately.** The
vignette and the film grain are dropped, because both belong to a finished shot
rather than to the fluid, and you will want to place your own. Bloom, exposure,
the ACES curve, the chromatic separation and the gamma are all exactly as
rendered. Nothing from the interface is ever in the file — the plate is a
separate render pass, so the wordmark, readout, panel and REC indicator cannot
end up baked in.

---

## How it works

```
study frame ─┬─► composite (vignette + grain, opaque) ──► screen
             │
             └─► composite (alpha plate) ──► RGBA8 texture
                        │
                  copyTextureToBuffer
                        │
                    mapAsync            ← GPU latency absorbed here
                        │
                  one POST at a time    ← 127.0.0.1:7878
                        │
                   ffmpeg stdin ──► ProRes 4444 .mov
```

Nothing accumulates. Three GPU staging buffers, at most two frames waiting to be
posted, one POST in flight. A take is bounded by the size of the .mov and
nothing else, so it can run as long as there is disk.

**Timing is owned by the companion, not the browser.** Each frame carries the
milliseconds since Record was pressed, and is written at the position that
timestamp says it belongs at; a gap is filled by holding the previous frame, and
a frame that arrives ahead of the clock is dropped. On Stop the last frame is
held out to the wall clock. A take is therefore always exactly as long as it was
performed, whatever happened in the middle — a dropped frame costs a repeat
instead of a lurch.

### Three things that were measured, not assumed

**Post the frame as a `Blob`, never a `Uint8Array`.** `fetch()` uploads a typed
array by streaming it through the renderer at a flat ~24 MB/s regardless of
size — 330 ms for one 1080p frame, which by itself capped the whole pipeline at
three frames a second. A Blob is handed to the network stack by reference and
the same eight megabytes post in about 7 ms. This one change took the capture
from 3 fps to 30.

**`stdin.write()` returning false is not backpressure.** A frame is eight
megabytes and a pipe buffer is 64 KB, so every write returns false and Node
buffers the rest. Treating that as a signal throttles the capture to a halt on
the very first frame — and worse, latches: the only way to learn the flag has
cleared is to post another frame. The real signal is the depth of Node's queue
in frames, and it only trips when the encoder is genuinely losing.

**ffmpeg was never the bottleneck.** `prores_ks` sustains better than 90 fps on
1080p random noise, which is far harder than a plume on black. The hardware
encoder is not an alternative: `prores_videotoolbox` rejects every frame with
-12912 on this machine.

### Expect a little RGB overshoot

In the finished file a few percent of pixels have `max(RGB)` slightly above
alpha — up to about 15/255 on the noisiest particle detail. That is ProRes 4444
DCT ringing, not a fault in the capture: feeding the encoder a synthetic source
where `rgb == a` exactly reproduces it identically. It is what every ProRes 4444
alpha deliverable looks like, and un-premultiplying clips it away.

---

## Practicalities

**ProRes 4444 is enormous** — roughly 2.5 GB per minute at 1080p30. The
companion refuses to start with less than 4 GB free, re-checks every five
seconds during a take and stops cleanly if the volume gets tight. Takes also
stop themselves at 20 minutes (`--max-seconds`). Short takes, looped or
retimed in AE, are the intended way to work.

**Resolution is fixed when ffmpeg starts.** Resizing the window mid-take changes
the shape of the frame but not the shape of the file, so the plate will stretch.
The HUD says `aspect drift` when the window has moved more than 2% from where it
started.

**The companion binds to the loopback interface only.** CORS is wide open
because a study opened from `file://` sends `Origin: null`, and nothing narrower
covers both that and `localhost`.

### Options

```
crucible-rec [--port 7878] [--out DIR] [--max-seconds 1200]
             [--ffmpeg PATH] [--ffprobe PATH]
```

### Endpoints

| | |
| --- | --- |
| `GET /health` | version, output directory, free space, active takes |
| `POST /start` | `{study, width, height, stride, fps}` → session |
| `POST /frame?id=&t=` | raw padded RGBA body, one frame |
| `POST /stop` | `{id}` → result, including the ffprobe of the finished file |
| `GET /status?id=` | live counters for a take |

---

## Porting it to another study

Every Crucible study has a control panel, and the transport, pacing, UI, HUD,
timing and error handling in the `REC` module are all study-agnostic. Only three
functions know that Solve is raw WebGPU, and they are marked
`── study adapter ──` in the source:

- `alloc(w, h)` — make a capture target and staging buffers
- `draw(enc, slot)` — render the alpha plate and copy it to a staging buffer
- `afterSubmit(slot)` — map the buffer and hand the bytes over as a `Blob`

Copy the `/* ── recording ── */` block, the `#rec-*` CSS, the HUD markup and
`buildCaptureGroup()` into the target study, then supply that trio. A Three.js
or WebGL study reads back with `gl.readPixels` into a `PIXEL_PACK_BUFFER`; a 2D
canvas study can go straight to `canvas.convertToBlob({type:'image/png'})` and
have the companion take PNG on stdin instead of rawvideo.

What the study must provide either way is a render path that produces **real
alpha** rather than colour composited onto a dark background. In Solve that is a
second composite pipeline built from the same shader with the vignette and grain
switched off and `max(r,g,b)` written to the alpha channel. Getting that right
is the actual work of porting; the rest is plumbing.
