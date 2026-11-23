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
node tools/items-test.mjs     # every item fires, hits and resolves, 1P and 4-way split (stage 5)
node tools/avgdriver.mjs normal 0 40   # the difficulty curve: an "average driver" vs 7 CPUs, finishing places
node tools/bounce-repro.mjs [--html final.html]   # the bounce repro: slow frames + bad-network phones → shots/bounce/
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

## Status — stage 3, Kevin's first-playtest fixes (`docs/stage-3.md`)

| # | Stage 3 item | State |
|---|---|---|
| 1 | Every drawn barrier is solid, on all 3 tracks: new `edge: 'rail'` (a drawn rail, solid in the sim). The Landing's planks + banister, Laundry Day's ramp + towel conveyor, Sprinkler Park's ramp + treehouse deck were `drop`; now railed and solid. Hitting one scrapes (sparks, a grind) and slows you; it never bounces you off. No track has a `drop` section now. | done — `race/track.js`, `race/sim.js`, `render/readable.js`; `test/stage3.test.mjs` |
| 2 | Falling through at the pillows: `locate` is layer-aware (a far-off sample whose road is above the kart or far below it is pushed away, so an airborne kart over the duvet never snaps to the under-bed), the under-bed ceiling only clamps karts actually under it, and a safety net puts any kart below its road back on top (never the sock). The pillow pile is SIMPLIFIED to a railed wooden toy ramp (the ruler) on toy-block piers, pillows heaped beside it. | done — regression: 3 races × 8 karts × 3 laps per track (72 laps each, two of them at 1.25× / 1.4× speed), items on: 0 below the road, 0 safety-net catches, 0 layer jumps, 0 edge falls, 0 stuck fish-outs |
| 3 | Clear where to go: skinny sections widened (banister 6.5 → 8.5, planks 8 → 9, doorways 8 + 1 → 9 + 2.5, under-bed 8 → 9, conveyor 7 → 8.5, park ramp / deck → 8.5; nothing under 8.5), bolder and closer edge lines (now on the banister, planks, conveyor and deck too), kerbs and sticky-note chevron signs on every sharp turn, a faint glowing arrow trail through the junctions, a stronger road runner | done — before / after race-camera shots of every waypoint: `shots/stage3/before`, `shots/stage3/after` (`node tools/tour.mjs <track> <dir> --all`) |
| 4 | Light kart refinement: a number plate with the driver's flag on the back of every kart (far-LOD detail), Kevalanche's hockey stick on the OG too | done — frame cost below |
| — | Quality bar + ship (`kart-release-3`) | done — shipped PR #58 (merged); on the release build `npm test` 30/30 and `tools/check.mjs` ALL CHECKS PASS (8/8 finish on all three tracks, mean laps 53.6 / 51.1 / 52.1 s, JS p95 ≤ 0.8 ms, 0 edge falls, 0 safety-net catches, zero errors, zero network) |

### Stage 3 frame cost (`node tools/framecost.mjs a.html b.html`, The Landing, 8 karts, 90 race frames, SwiftShader 1280×720)
| build | views | JS / frame (mean, p95) | render call p50 | draws / frame | triangles |
|---|---|---|---|---|---|
| main (stage 2) | 1 | 0.57, 1.4 ms | 8.6 ms | 401 | 1.70 M |
| stage 3, no plates | 1 | 0.81, 2.4 ms | 8.9 ms | 410 | 1.71 M |
| stage 3 (shipped) | 1 | 0.69, 1.4 ms | 8.7 ms | 415 | 1.71 M |
| main (stage 2) | 4 | 1.17, 2.7 ms | 25.7 ms | 1,441 | 3.53 M |
| stage 3, no plates | 4 | 0.89, 2.7 ms | 32.8 ms | 1,478 | 3.58 M |
| stage 3 (shipped) | 4 | 1.00, 4.6 ms | 31.0 ms | 1,494 | 3.58 M |

The rails, kerbs, signs and arrows add ~9 draws per view (merged by material); the plates
add one small plane per near kart and cost nothing measurable (inside run-to-run noise), so
they stay. SwiftShader render times are a CPU rasteriser's and swing a few ms between runs.

## Status — stage 4, the music pass (`docs/stage-4-music.md`)

Kevin: "more beeps than an actual song". Every track is now a song: a tune you can hum,
lower and warmer, over moving chords, a counter-melody and a walking bass. Still all
synthesised from data (`src/audio/music.js`); no audio files.

| # | Item | State |
|---|---|---|
| 1 | Melody first: 4-bar question / answer phrases, mostly steps with a few leaps, held notes and rests, a hook that comes back; no run of one pitch | done — `test/music.test.mjs` asserts it (no 3 in a row, ≥ 60 % steps, ≥ 8 held notes) |
| 2 | Lower and warmer: the tune in octave 4 (62–73 % of notes under c5; peaks e5–a5), a 50 % / 25 % pulse through a pitch-tracking low-pass with a soft attack, delayed vibrato on long notes; the 12.5 % arp is gone (a quiet filtered shimmer in the intro / lift only) | done — `audio/synth.js` (`wave`, `lp` per channel) |
| 3 | Harmony and groove: vi, ii, borrowed iv, secondary dominants, a key-change lift for B; `lead2` a counter-melody under the tune; a syncopated walking bass (`bassLine`, chart-driven, approach notes into each chord); drums sit back (≤ 3 hats a bar), tom fills into every section | done |
| 4 | Structure: intro (2) · A (8) · A' (8) · B lift (8) · A (8) · turnaround (2) → back to the first A (`loopFrom`); loops of 60 / 78 / 69 s | done |
| 5 | Final lap: the same song ×1.06 with the hype layer (off-beat hats, the shimmer under the tune), switched on the next bar line (`Sequencer.queueIntense`) | done — tested: lands on a bar line within one bar |
| 6 | Mix: music bus 0.9 → 0.5 (≈ −5 dB) under the engines / items / voices, a soft music compressor and a −4 dB high shelf at 4.5 kHz, the lead panned a touch left with a dotted-8th echo on the right, the counter-melody right | done — `audio/engine.js` |
| 7 | The Landing (F, lifts to G, 136 bpm), Laundry Day (E dorian funk, lifts to F♯ dorian, 104 bpm, swung 16ths), Sprinkler Park (B♭, lifts to D♭, 118 bpm), and the title / select theme (G, 100 bpm) | done |

`node tools/music.mjs` renders each track offline in headless Chromium (the real engine
and graph on an OfflineAudioContext) to `shots/music/*.mp3`: from the top, the lift, and
the final-lap switch; `shots/music/before/` has the old loops. Measured on 40 s from the
top (old → new): RMS −18.6 → −21.2 dBFS (Landing), −19.5 → −21.8 (Laundry), −20.1 →
−21.0 (Park); energy above 6 kHz about −45 → −58 to −60 dB; the "brightness" (first-difference / RMS)
0.10–0.12 → 0.05–0.06.

## Status — stage 5, items, difficulty curve and feel (`docs/stage-5.md`)

Kevin's second playtest: the boost should hit harder, the CPUs were a little too hard for a
first race, he "didn't get any items", didn't know what the Alarm Clock did, never noticed the
taunt tricks, and loves the toy scale.

| # | Item | State |
|---|---|---|
| 1 | Boost kick: a boost's peak 1.4 → 1.62 × top speed (+16 %), longer tails (drift tiers 0.6 / 1.0 / 1.45 → 0.7 / 1.15 / 1.65 s, pads 1.05 → 1.2, trick 1.15 → 1.3, the tail bleeds off at 17 u/s² not 30); on every boost an FOV punch, a camera pull-back, a feather burst out the back, a whoosh, speed lines | done — `race/sim.js` `BOOST_TOP`, `main.js` `_camera` (`punch`), `fx.tailBurst`, `index.html` `.speed` |
| 2 | Difficulty curve: a single race is each level's gentle version (lower top speed, late-braking mistakes into tight corners, slower and sloppier items, a milder catch-up band); the Pillow Cup ramps race 1 gentle → race 2 medium → race 3 at full strength; easy / normal / hard / **Champion** (hard plus a bit, never eased) | done — `race/cpu.js` `levelAt`, `GENTLE`, `cupStrength`; tuned with `node tools/avgdriver.mjs` (the "average driver": no drift, wandering lines, slow hands, early lifts; it laps at today's normal-CPU pace) — numbers below |
| 3 | Items: why Kevin got none — he starts at the back and the CPUs ahead emptied every row (a grabbed box was gone for 3.3 s). Now a row is never used up (a grabbed box pops and grows back; everyone driving through gets one), 6 rows a lap (7 on Laundry Day), 5 boxes spanning the road, bigger (3.6), glowing, bobbing, a ding and a roulette. Every item explains itself (HUD name + tip for 2 s, a caption the first time each item hits someone, the alarm clock flies high over the field, ticking, then rings). Four new items: **Sugar Rush**, **Paper Plane**, **Hot Wash**, **Spring Cushion**; a 10-item odds table by place; the phone's how-to sheet lists all ten with marker-drawn icons | done — `race/sim.js`, `race/cpu.js`, `render/fx.js`, `render/racer.js`, `ui/icons.js`, `pad/sheet.js`; `tools/items-test.mjs` |
| 4 | Taunt discoverable: a big TAUNT! prompt (with the key) whenever you're airborne off a ramp, a TAUNT badge by the item slot that lights up in the air, a one-time tip on the first ramp, gold feathers + "STYLE BOOST!" on the landing | done — `main.js` `_hud`, `onEvent` |
| 5 | Toy-scale charm: crayons, building blocks, a toy car on the rug, a sleeping cat's tail (The Landing); clothes pegs, a lost coin, lint balls (Laundry Day); acorns, garden gnomes, ants (Sprinkler Park) — one merged vertex-coloured mesh per track (one draw) | done — `render/props.js` |
| 6 | Bigger phone-pad QR (PF2 / PR #57 sizes): 112 → clamp(200px, 24vh, 320px), select 84 → clamp(160px, 17vh, 240px), bigger code / labels | done — `src/index.html` |
| 7 | One road width everywhere: half-width `ROAD` = 10.5 on every waypoint of all three tracks (was 8.5–11); the sock drawer's sides follow the road's edge | done — `race/track.js` |
| 8 | See your item on your kart: the held item rides above the rear bumper (one shared low-poly mesh per item type, instanced: ≤ 1 draw per type), flickers through the roulette, pops in with a bounce; a missile or slick held behind on LOOK BACK dangles off the back (and now blocks one missile or paper plane from behind); every kart shows its item, hidden past 72 units; the HUD slot is bottom-centre with the icon + name, in every split view | done — `fx._heldUpdate` |
| 9 | Kevalanche is number 88 (`KEV 88`, back plate `88`); Sumaura's bus sign unchanged | done — `render/karts.js` |


### Stage 5 numbers
**Difficulty curve** (`node tools/avgdriver.mjs normal <strength> 40`: the average driver vs 7 normal CPUs, 40 seeded races per track; it starts at the back of the grid):

| normal, strength | Landing top 3 | Laundry top 3 | Park top 3 | all three | mean place |
|---|---|---|---|---|---|
| race 1 / single race (gentle, 0) | 25/40 | 15/40 | 25/40 | **65/120 (54 %)** | 3.52 |
| cup race 2 (0.5) | 20/40 | 19/40 | 16/40 | 55/120 (46 %) | 3.94 |
| cup race 3 = stage 4's normal (1) | 17/40 | 16/40 | 16/40 | 49/120 (41 %) | 4.38 |

Boxes for the average driver: a row every 7.9–9.2 s on average (the longest gap 17.8–21.8 s, when it was spun out or launched near a row), 5 rows missed out of 2,281 driven through, about 16–19 items a race.

**Frame cost** (`node tools/framecost.mjs main.html final.html`, The Landing, 8 karts, SwiftShader 1280×720):

| build | views | JS / frame (mean, p95) | render call p50 | draws | triangles |
|---|---|---|---|---|---|
| main (stage 4) | 1 | 0.63, 1.5 ms | 10.4 ms | 415 | 1.71 M |
| stage 5 | 1 | 1.17, 4.4 ms | 9.9 ms | 382 | 1.65 M |
| main (stage 4) | 4 | 1.09, 3.0 ms | 38.3 ms | 1,494 | 3.59 M |
| stage 5 | 4 | 1.48, 5.3 ms | 35.8 ms | 1,408 | 3.66 M |

The instanced boxes take ~33 draws off a view; the held items add ≤ 1 draw per item type in view, the props 1. The Hot Wash is a scale on each kart's existing group (no new draws), so it stays. JS per frame is up ~0.4–0.5 ms (the extra items in play, the held-item and box matrices) and still well inside a 16.7 ms frame. `tools/check.mjs` on the release build: ALL CHECKS PASS (8/8 finish on all three tracks, mean laps 53.1 / 54.4 / 54.8 s, race JS p95 ≤ 1.0 ms, 0 safety-net catches; split-4 253 draws per view, JS p95 4.0 ms); `tools/items-test.mjs`: all 10 items fire, hit and resolve in 1P and 4-way split, zero errors; `npm test` 46/46 (stage 3's fall-through regression included: 0 below the road, 0 layer jumps, 0 edge falls on all three tracks).

Also fixed: the alarm clock's flight path was drawn 42–118 units behind where the sim had it (the lap counter counts from the start line); a handcuff chain between two karts far apart (one fished out) used to yank the other across the room — it snaps now.

## Status — the bounce-and-squish fix (`docs/bounce-glitch.md`)

Kevin: "when the connection isn't great, the characters are bouncing up and down, like they're
getting squished, repeatedly, and it just doesn't end."

| # | Item | State |
|---|---|---|
| 1 | **Root cause (confirmed): unstable render springs on slow frames.** The kart body's squash (k 320, ζ 0.35) and the PF2 plush's crunch / hit squash / yaw / glove springs took one semi-implicit Euler step per frame; past dt·√k ≈ 2 that step gains energy every frame. With the 0.1 s frame clamp the kart squash grows ×2.6 per frame at 10 fps: the kart squashes and stretches on alternate frames at its clamp (0.7 ↔ 1.2) and keeps ringing for seconds after the frames recover | fixed — `shared/grommet/spring.js` `stepSpring` (equal substeps of ≤ 1/120 s; NaN-safe; bounded state), used by `render/racer.js`, `plush.js`, `gloves.js`, `arena.js`, `feel.js`, `pose.js` |
| 2 | Spring test: every render spring kicked and run at dt 0.1 for 10 s: energy falls every frame, settled | `test/spring.test.mjs` |
| 3 | Repro in the real page: an 8-kart race, two phones on a 300 ms-jitter / 15 %-loss link, every kart hit + a hard landing, 5 s of 85 ms frames, a 3 s phone dropout + reconnect, then 60 fps. Before (main): kart squash up to 4 × 10⁷, sign flipping on 57 of 59 slow frames, scale y 0.70 ↔ 1.20, still 1.7 × 10⁶ three seconds after recovery. After: ≤ 0.47 in the slow frames, 0.008 from 0.5 s after recovery | `tools/bounce-repro.mjs`; `shots/bounce/before-main.json`, `after.json` |
| 4 | **Pad input (confirmed, secondary):** TAUNT / ITEM held through a > 400 ms quiet spell came back as a second press (the race's own edge detection saw it drop and return: a TAUNT bounce); an outage of > ~2 s ran the phone's 8-bit seq past half its window, freezing input until it wrapped. Now: counted bits press only on their counters (one physical press = one press, whatever is lost, reordered or repeated); a press-to-act bit (ITEM TAUNT START SUPER) that went stale stays off until released or pressed again (GAS, BRAKE, DRIFT, LOOK and the steering come straight back); a seq far behind (or any after a quiet spell) resyncs | `src/pad/wire.js`; `test/padnet.test.mjs` (loss, 300 ms jitter, duplicates, 3 s / 2.5 s / 1 s outages, a reconnect, 5 seeds; before: 8 TAUNT presses for 6 physical) |
| 5 | Checked, not a cause: the pad host's main-thread cost on a bad link (0.02–0.03 ms a frame, 0.004 ms a packet; the pairing card repaints only on change) | `bounce-repro` `padHostCost` |
| — | Quality bar + ship (`kart-release-6`) | done — shipped PR #61 (merged, Pages deploy run 84 succeeded); `npm test` 74/74, `tools/check.mjs` ALL CHECKS PASS (split-2 JS p95 3.2 ms, split-4 4.0), `tools/pad-test.mjs` four phones in sync. Follow-up: Battle Royale ships the same unstable springs (source outside this repo) |

## Stage 2 hooks
- `input/controls.js` has `extra`: a function returning another input to
  merge (the phone pads plug in there); `Race` takes `humans: [...]`, the
  HUD and camera are per `me` — split screen is N cameras over one race.
- `race/track.js` `TRACKS` is a registry; `?track=` picks one.
