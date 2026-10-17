# Tusche (No. 24) — source

**Tusche** is the greasy lithographic ink painters lay down as fluid, painterly washes on stone. This is a real-time
sumi-e watercolour: ink and water soak through simulated paper fibre on the GPU.

- `src/index.html` — the piece. Single self-contained file (no fonts or scripts fetched), shipped verbatim as
  `tusche/index.html` on `main` (`sh build.sh <dir>`).
- `prototype/` — the seed prototype the piece grew from (kept for reference; `?demo` fix applied).
- `reference/` — offline p5.brush mock-up of the target look (reference only; never shipped).
- `docs/PLAN.md` — the build plan.
- `tests/` — Playwright (headless Chromium) tests and screenshot scripts; `shots/` — the evidence screenshots.

## Controls
Hold = bloom (the longer, the wider; a ring grows while you rest) · drag = stroke (slow and loaded, or quick for dry
brush; the brush runs out over a long stroke; pen pressure when there is one) · `1/2/3` sumi / vermilion / gold ·
`4` or `W` clear water (or shift-drag) · `[ ]` size · `D` hold to dry · `C` clear · `P` replay the opening ·
`S` save PNG · `H` hide the HUD. Any click skips the opening.

URL flags: `?demo` / default plays the opening, `?nodemo` skips it, `?fixed` (1/60 s per frame, tests),
`?half` (force the RGBA16F fallback), `?scale=3` (force one-third resolution).

## How it works
Four RGBA float layers ping-ponged through one MRT pass per substep (720 substeps/s at half resolution):
`S` suspended pigment + water, `X` suspended gold + paper dampness, `L` loose deposit, `T` fixed stain.
- Porous-medium flow: mobility ~ water^1.6 × absorbency² — pooled water travels, thin water stalls.
- Fronts break into *dry* paper only where the water behind beats that fibre's wicking threshold (lobed,
  wandering edges, fibre hairs); damp paper is easier but still uneven (cauliflowers).
- Pigment rides the flux and diffuses through shared water (wet-in-wet); evaporation is fastest at thin edges
  (edge darkening); it settles to `L`, which *dilute* inflow lifts again (backruns) and which fixes into `T` once
  the paper has dried out.
- Half-float fallback runs the slow terms (evaporation, settling, fixing) once a frame so they don't round away.
- The sim never shrinks on resize (a smaller window shows part of the sheet); growth and resolution changes
  re-sample the layers. Adaptive: if the median frame is > 21 ms over the first 2 s it drops to one-third resolution.
- Render: paper × exp(−absorbance) with saturation, B-spline-filtered sim fields with fibre jitter, granulation,
  a band-passed dried rim, and gold as an opaque ochre/leaf body colour with a soft light-dependent sheen (the light
  drifts with the cursor).

## Tuning (in `src/index.html`)
- `KFLUX` (0.5) — how far water travels; `RATE` — substeps per second per resolution.
- `INKS` — absorbance per ink (`abs`), strength (`load`), gold `metal` amount.
- `PARAMS.evap` / `diff` / `liftIn` — drying speed, wet-in-wet feathering, backrun strength.
- In `makePaperSim`: `cloud` / `lump` scales and contrast — how lobed blooms get; fibre strength `fib`.
- In `brushFrame`: hold water `* 6` and ink `/ (1 + 1.1 * hold)` (dwell response), stroke water, `cap` (how fast the
  brush runs dry), `press` (speed → width), dryness.

## Tests
`node tests/run-tests.mjs` (needs Playwright; uses `/opt/node-tools` if not installed locally). Self-containment and
console errors, conservation with evaporation off, dwell (2 s vs 0.5 s bloom area by readPixels), long-session
NaN check, half-float drying, resize/rescale preservation. `node tests/shots.mjs` and `tests/demoshots.mjs` make
the screenshots. Everything waits on frame counts under `?fixed`; fps cannot be measured in the sandbox
(SwiftShader software GL runs ~3 fps here).
