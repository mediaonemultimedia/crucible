# Pillow Fight 2 — source

A Virtua Fighter–style **3D arena** fighting game with Pillow Fight's plush
cast: a sequel to *Pillow Fight* (Crucible No. 23, `bolster/`), which stays
frozen. This tree lives on the `pf2-source` branch only; what ships to
`main` is the single built file `pillow-fight-2/index.html`.

PF1's code is **copied** here, never imported across folders: the plush
models, materials, accessories, OG/ALT twins (`src/render/`, `shared/`),
the audio engine, chiptune and SFX (`src/audio/`, `assets/audio/`,
`src/assets/sfx/`), fonts, the logo and the build gate.

```
npm install
npm test                  # node --test test/*.test.mjs
npm run build             # → final.html (self-contained; fails on any network reference)
node tools/peek.mjs out.png '?hold&webgl' '__pf2.step(30)'   # one headless screenshot
```

## Status

STAGE 1 of 2, in progress. Milestones (pushed after each):

1. [x] Arena + camera: the mattress ring, the bedroom set, the orbiting camera, two fighters.
2. [ ] 3D movement + ring-outs, deterministic tests.
3. [ ] Combat core in 3D.
4. [ ] All 7 fighters.
5. [ ] CPU, modes, HUD, select, audio, title.
6. [ ] Build + release.

## How it works (so far)

- **Sim** (`src/sim/sim.js`): deterministic 60 Hz, integers only (1000 =
  one world unit), no trig (facings are integer vectors of length 1024 from
  an integer square root), PRNG in the state, `hash()` = FNV-1a over the
  JSON. Rollback-ready: `clone`, `hash`, inputs as 10-bit masks.
- **Arena** (`src/render/arena.js`): the room lives in `arena.world`; the
  camera's azimuth is applied by turning the world the other way, so the
  plush's hand lighting (PF1's fixed key) is always camera-relative and
  backs and sides are lit as well as fronts.
- **Known issue found in PF1**: a per-frame CanvasTexture re-upload never
  showed under the WebGL 2 backend (PF1's contact shadows were invisible).
  PF2 uses instanced soft decals instead.
