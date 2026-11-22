# Down Hill — source

*Down Hill: a Pillow Fight kart race.* The Pillow Fight 2 plush cast race
karts round **The Landing** — a giant kid's bedroom and the upstairs landing
at night. This tree lives on the `kart-source` branch only; what ships to
`main` is the single built file `down-hill/index.html`
(https://mediaonemultimedia.github.io/crucible/down-hill/).

PF2's code is **copied** here, never imported across folders: the plush
models, materials, accessories and OG/ALT twins (`src/render/plush.js` and
friends, `shared/`), the audio engine, chiptune instruments and SFX
(`src/audio/`, `src/assets/sfx/`), the fonts, the speech bubbles, the
neon-arcade look, the build gate and the check / shots tooling.
`pillow-fight-2/` and `bolster/` are never edited.

```
npm install
npm test                      # node --test test/*.test.mjs (track, sim, items, CPUs: whole races in node)
npm run build                 # → final.html (self-contained; fails on any network reference)
node tools/check.mjs          # in the real page: menus → race, a whole 3-lap 8-CPU race, frame cost
node tools/shots.mjs [scene]  # → shots/: select, grid, drift, items, underbed, banister, podium, karts
node tools/peek.mjs out.png '?hold&webgl&p1=zach' '__dh.step(5)'   # one screenshot
node tools/pad-test.mjs       # four simulated phones: pairing, menus, latency, tilt, in-sync race, loss, haptics → shots/pad/
node tools/tour.mjs laundry   # a screenshot at each section of a track → shots/tracks/
```

Deep links: `?p1=kevalanche&alt1=1&cpu=hard&track=landing` (straight into a
race), `p1cpu=LEVEL` (the player's kart drives itself), `seed=N`, `laps=N`,
`screen=select`, `hold` (no free-running loop: tools step `window.__dh`),
`webgl` (force WebGL 2), `noportraits`.

## Status — stage 1 of 2

| # | Stage 1 item | State |
|---|---|---|
| 1 | Karts and the cast: 7 fighters × OG/ALT = 14 looks, themed karts, light racing plush, LOD | done — `render/karts.js`, `render/racer.js`; `shots/karts-*.png` |
| 2 | Driving feel: chase cam + speed FOV kick, drift (white/gold/mint tiers, wiggle charge), ramps + TAUNT tricks with landing boost, feather pads, fluff/cereal slowdown, the sock on a string | done — `race/sim.js`; `test/race.test.mjs`; `shots/drift.png` |
| 3 | Items: Feather Slick, Pillow Missile, Espresso Shot, Fuzzy Handcuffs, Pillowcase, Alarm Clock; odds by place | done — `shots/item-*.png` |
| 4 | Track 1, The Landing: duvet → book ramp → rug → under the bed → banister → sock drawer → pillow pile | done — `render/world.js`; `shots/underbed.png`, `shots/banister.png` |
| 5 | Race flow (title, select with portraits + turntable, countdown, race, podium results), 7 CPUs × 3 levels, HUD, keyboard + gamepad, audio, deep links | done |
| — | Quality bar (`tools/check.mjs`, `tools/shots.mjs`) and shipping | done — check passes (JS p95 0.8 ms, 395 draws, laps 47–63 s); shipped PR #55 (`kart-release-1`, merged) |

### Performance (the hard rule)
- Racing plush are frozen: no soft body, cloth or fur sim runs during a race
  (measured: one woken PF2 plush costs ~10 ms of JS per frame on the test
  machine — that is PF2's lag). Trick, taunt and hit poses are the rig's:
  stand up, spin, barrel roll, squash, wobble. The podium and the select
  turntable wake the soft bodies (no race running then).
- Fur: 12 shells near, 5 past 26 units, over a velvet base; far karts hide
  their small parts. The room and each kart body are merged by material.
- `tools/check.mjs` measures the JS per frame over a whole 8-CPU race and
  the render call's CPU time and draw stats (numbers in the PR).

## How it works

### The race (`src/race/`, pure JS, deterministic, runs in node)
- `track.js`: the track is a closed centripetal Catmull-Rom spline through
  hand-placed waypoints, sampled every unit into arrays (position, tangent,
  half-width, fluff margin, edge kind, launch points, pads, the under-bed
  ceiling, a racing line). The Landing is sketched compact and run 1.8×
  wider, 1.25× taller (a lap of ~52 s).
- `sim.js`: 60 Hz, one seeded PRNG, no clock. Arcade handling: the kart
  goes where its nose points (grip bleeds the sideways slip); DRIFT held
  while turning locks a slide, charging white → gold → mint tiers (into the
  slide and counter-steer wiggles charge faster) released into a boost.
  Walls push you back along the track and turn your nose (nobody sticks);
  `drop` edges (the banister, the planks) let you fall, and the sock on a
  string fishes you back to the last good spot. Ramps launch; TAUNT in the
  air is a trick and a landing boost. Bump-and-grind contact by weight.
  Items from gift-wrapped pillow boxes, odds by place.
- `cpu.js`: the racing line with a personal sway, drifts on long bends
  (not on the rail), dodges slicks and posts, uses items sensibly, gentle
  rubber band to the human; easy / normal / hard.

### Render (`src/render/`)
- `racer.js`: the PF2 plush in its kart, LIGHT: the soft body settles once
  and is frozen (woken only for a pose — trick, hit, podium — and only near
  the camera), 12 fur shells near / 5 far over a velvet base (`solid`,
  `rootLift`: two uniforms added to the copied `fur.js`, 0 = PF2's look),
  far karts drop their small details. A tiny rig on top: breathing bob,
  steer lean, squash on landings, wobble when hit, spin-outs, the trick's
  barrel roll, wheel spin and steer, each kart's own moving parts.
- `karts.js`: the seven karts and their ALT re-skins, from primitives.
- `world.js`: the room, built around the spline. `fx.js`: pooled,
  instanced particles, the item boxes, items in flight, the sock.

## Status — stage 2 of 2 (`docs/stage-2.md`)

| # | Stage 2 item | State |
|---|---|---|
| 0 | Stage 1 finished and shipped | done — PR #55 merged before stage 2 began |
| 1 | Phone controllers (up to 4): PF2's pad ported (QR, wire, padlink, skins, wake lock, reconnect, haptics), Kevin's 14 backgrounds, kart button map (GAS DRIFT ITEM / BRAKE LOOK-BACK TAUNT, pill = USE ITEM, HOW-TO sheet with the items), auto-gas, hit buzz, STICK or TILT steering (calibrated roll, dead zone, 3 sensitivities, smoothing, re-centre, iPhone permission tap, falls back to STICK), steering in the stick-X byte | done — `src/pad/`; `test/pad.test.mjs`; `tools/pad-test.mjs` (4 phones) |
| 2 | Split screen 2–4 (own camera + HUD each, CPUs fill to 8; keyboard halves, gamepads, phones mix), LOD / pixel ratio per view count | done — `main.js` `_views`, `_render`; `tools/check.mjs` split-2 / split-4 |
| 3 | Laundry Day (conveyor, rolling pods, dryer-drum shortcut, sock piles), Sprinkler Park (sprinklers, hose jump, kiddie pool, treehouse ramp), The Pillow Cup (3 races, points, overall podium) | done — `race/track.js`, `race/sim.js`, `render/laundry.js`, `render/park.js`; `tools/tour.mjs` |
| 4 | Polish: best-lap ghost per track, photo-finish slow-mo, last-place roast | done — `main.js` ghost / photo; `ui/lines.js` LAST_LINES |
| — | Quality bar + ship (`kart-release-2`) | done — shipped PR #56 (merged, Pages deploy run 80 succeeded); check passes on the release build (all three tracks: 8/8 finish, mean laps 55.1 / 51.5 / 52.3 s, JS p95 ≤ 0.8 ms; zero errors, zero network); pad test passes with 4 phones in sync |

### Split-screen frame cost (`tools/check.mjs`, SwiftShader, 1280×720)
| views | JS / frame (mean, p95) | draws / frame | triangles / frame | render call (CPU, SwiftShader) |
|---|---|---|---|---|
| 1 | 0.31, 0.8 ms | 395 | 1.52 M | 12 ms |
| 2 | 1.07, 3.8 ms | 772 (386 / view) | 2.15 M | 18 ms |
| 4 | 1.17, 2.4 ms | 1,436 (359 / view) | 3.68 M | 35.5 ms |

Per view count: pixel ratio 1.75 → 1.25 → 1, fur shells 12/5 → 9/4 → 7/3, LOD
switch 26 → 19 → 14 units, far cull 260 → 210 → 170; the moonlight/sun
shadow map is static (drawn once). SwiftShader's render times are a CPU
rasteriser's, not a GPU's.

## Stage 2 hooks
- `input/controls.js` has `extra`: a function returning another input to
  merge (the phone pads plug in there); `Race` takes `humans: [...]`, the
  HUD and camera are per `me` — split screen is N cameras over one race.
- `race/track.js` `TRACKS` is a registry; `?track=` picks one.
