# Bolster (No. 23) — stage 1 implementation plan

A Street Fighter–style 1v1 plush fighting game. Gameplay is 2D (one line, side
camera); the fighters are the existing 3D plush soft bodies from Grommet and
Flock. Stage 1 = everything except online play; the sim is built for stage 2
rollback netcode from day one.

## Layout (`bolster/_source/`)

```
shared/grommet/   copied from grommet-source @ b6164e2 (headers note it)
shared/flock/     copied from flock-source @ 1cc2ec1 (octopus rig, face, colours)
src/
  sim/            pure deterministic sim: step(state, in1, in2) -> state
                  fixed 60 ticks/s, integers only (milli-units), seeded PRNG in state
    state.js      createMatch(), clone(), hash()
    step.js       the tick: input edges, state machines, movement, hit/hurt boxes,
                  projectiles, hit-pause, health/meter, rounds, timer, match end
    rng.js        mulberry32 on uint32 stored in state
    input.js      bit layout (LEFT RIGHT UP DOWN LIGHT HEAVY SPECIAL)
  fighters/       per-fighter data: stats, frame data, boxes, signature + special
  ai/             reads sim state only, emits the same bitmask (difficulty =
                  reaction delay, block probability, special usage)
  input/          keyboard -> per-tick bitmask
  render/         three.js (WebGPU, WebGL 2 fallback exactly like Grommet)
    plush.js      one fighter: Grommet/Flock rig + SoftBody + Body + fur, in a
                  group placed at the sim position; a Puppet maps sim actions
                  to pose bones (cosmetic only — nothing flows back to the sim)
    puppets/      biped (bear, leopard, panda), giraffe, octopus
    stage.js      floor, backdrop, camera, sparks, shake, stuffing burst
  ui/             DOM overlay: menus, HUD (STUFFING bars, SPECIAL meter, timer),
                  banners, cardboard speech bubbles, easter eggs
  main.js         wires it: title -> mode -> select -> difficulty -> fight -> winner
tools/build.mjs   esbuild -> single file + self-containment gate (as Grommet)
tools/font.mjs    subset Gochi Hand (OFL) to the characters used -> assets/
tools/shots.mjs   Playwright screenshots + CPU-vs-CPU run
test/             node --test
```

## Order of work

1. sim + Kevalanche end-to-end (primitive boxes render) — commit
2. tests: determinism, combat rules, rollback clone/resim — commit
3. plush render (bear first), the fur lighting made world-space — commit
4. remaining fighters' data + puppets (leopard, octopus, panda, giraffe) — commit
5. AI (three difficulties) — commit
6. menus/UI/HUD — commit
7. flavour: STUFFING, FLUFFLESS VICTORY, catchphrases (sim PRNG), speech
   bubbles, easter eggs — commit
8. polish, screenshots, release branch + PR

## Key decisions

- Units: 1 world unit = 1000 sim units (plush scale: 1 unit = 9 cm). Stage
  x in [-9500, 9500]. Positions, velocities, gravity, boxes are integers.
- Inputs: 7-bit mask per player per tick; the sim derives press edges from
  the previous mask stored in state, so a replay is just the input arrays.
- State is plain JSON-able data with a fixed key order: clone =
  structured copy, hash = FNV-1a over a canonical integer walk.
- Visible randomness (catchphrase pick, Fluffatality roll) comes from the
  state PRNG. Cosmetic-only randomness (bubble shapes) may use Math.random.
- Rendering never feeds back: plush soft bodies run on their own fixed
  1/120 s clock off real time, posed from the sim's action + frame.
- Shared modules stay as copied; changes are minimal and documented in
  `shared/CHANGES.md` (the fur/cloth lighting moved to world space so a
  turned mesh is lit correctly — a no-op for Grommet's untransformed mesh;
  a single-panda export).
