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
```

Deep links: `?p1=kevalanche&alt1=1&cpu=hard&track=landing` (straight into a
race), `p1cpu=LEVEL` (the player's kart drives itself), `seed=N`, `laps=N`,
`screen=select`, `hold` (no free-running loop: tools step `window.__dh`),
`webgl` (force WebGL 2), `noportraits`.

## Status — stage 1 of 2

| # | Stage 1 item | State |
|---|---|---|
| 1 | Karts and the cast: 7 fighters × OG/ALT = 14 looks, themed karts, light racing plush, LOD | done — `render/karts.js`, `render/racer.js`; shots `shots/karts-*.png` |
| 2 | Driving feel: chase cam + FOV kick, drift (3 tiers), ramps + TAUNT tricks, pads, off-track, the sock | in progress |
| 3 | Items: Feather Slick, Pillow Missile, Espresso Shot, Fuzzy Handcuffs, Pillowcase, Alarm Clock | in progress |
| 4 | Track 1, The Landing | in progress |
| 5 | Race flow, CPUs, HUD, input, audio, deep links | in progress |
| — | Quality bar (check, shots) and shipping | not yet |

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

## Stage 2 hooks
- `input/controls.js` has `extra`: a function returning another input to
  merge (the phone pads plug in there); `Race` takes `humans: [...]`, the
  HUD and camera are per `me` — split screen is N cameras over one race.
- `race/track.js` `TRACKS` is a registry; `?track=` picks one.
