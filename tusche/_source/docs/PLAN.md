# Tusche (No. 24) — build plan

Evolve the seed prototype; keep its porous-medium approach (mobility ~ water^1.6 × absorbency, pigment carried
with the flux, faster evaporation at thin edges, settle-to-stain).

Baseline check (shots/00-prototype-baseline.png): the dab stamping works (no beading, round ends) but strokes read
as uniform tubes, blooms are near-circular discs, gold renders orange. `?demo` also threw on load: the first rAF
timestamp can precede `performance.now()` at script start, giving a negative dt → NaN in the demo; clamped.

## Sim (WebGL2, adaptive 1/2 → 1/3 resolution)
- Four RGBA float layers, ping-ponged through one MRT pass per substep:
  `S` suspended pigment absorbance (rgb) + water (a); `X` suspended gold metal (r) + paper dampness (g);
  `L` loose deposit (rgb + metal); `T` fixed stain (rgb + metal).
- Flow into *dry* paper is gated by a per-cell fibre threshold (front pins, breaks through where fibres carry it →
  wandering, fingered edges); damp paper accepts water freely (wet-in-wet, backruns).
- Loose deposit can be lifted by fresh water and carried to the advancing front (backrun / cauliflower rim);
  it fixes into `T` once the paper has dried.
- Pigment diffuses within shared water (wet-in-wet mixing of inks).
- Substeps are a fixed rate per second (frame-rate independent physics up to a cap); half-float fallback applies
  evaporation in fewer, larger steps so it does not round away.
- Resize re-samples the layers into new buffers (anchored, not stretched); hidden tab pauses.

## Brush
- One brush pass per frame with up to 48 dabs along the smoothed path; each dab carries its radius (taper in/out,
  speed → width, pen pressure), water, ink and dryness. Bristle streaks are a 1-D noise across the stroke, gated
  by paper tooth when dry. Ink load runs out with distance; a quick release flicks a tapered tail.
- Hold = bloom: water and a little pigment keep feeding while still; a ring around the cursor grows with dwell.

## Render
- paper × exp(−absorbance) with saturation; granulation from paper tooth; crisp dried rims (local unsharp of the
  deposit); wet areas slightly darker and softer.
- Gold is a separate metal channel rendered as body colour (ochre/leaf), with a soft light-dependent sheen when dry.

## UI
- Crucible overlay: wordmark + No. 24 badge, ink swatches (sumi, vermilion, gold, clear water), size, dry, clear,
  save PNG; keys 1/2/3/4, W, [ ], D, C, P, H, S. Idle-hide HUD, touch/pen.
- Opening demo: plum branch, held blossoms with stamen flicks, gold sun, a mist wash, a seal; any click skips.

## Tests (Node + Playwright, headless Chromium)
- conservation (evaporation off), dwell (2 s hold blooms larger than 0.5 s, read back with readPixels),
  no-NaN after a long scripted session, self-containment + zero console errors, screenshot set.
