# Pillow Fight 2 — source

A Virtua Fighter–style **3D arena** fighting game with Pillow Fight's plush
cast: the sequel to *Pillow Fight* (Crucible No. 23, `bolster/`), which stays
frozen. This tree lives on the `pf2-source` branch only; what ships to
`main` is the single built file `pillow-fight-2/index.html`
(https://mediaonemultimedia.github.io/crucible/pillow-fight-2/).

PF1's code is **copied** here, never imported across folders: the plush
models, materials, accessories, OG/ALT twins (`src/render/`, `shared/`), the
audio engine, chiptune and SFX (`src/audio/`, `src/assets/sfx/`,
`assets/audio/`), fonts, the logo, the neon arcade CSS and the build gate.

```
npm install
npm test                         # node --test test/*.test.mjs  (sim, combat, AI)
npm run build                    # → final.html (self-contained; fails on any network reference)
node tools/check.mjs             # the release checks in the real page (menus, CPU match, versus, practice, frame cost)
node tools/shots.mjs [scene …]   # evidence → shots/pf2/ (ring-overview, sidestep, ringout, select, …)
node tools/peek.mjs out.png '?hold&webgl' '__pf2.step(1)'   # one screenshot
```

Deep links: `final.html?p1=kevalanche&p2=rubberta&cpu=hard` (a fight),
`p1cpu=LEVEL` (CPU vs CPU), `versus=1` (two players, one keyboard),
`practice=k8e&dummy=sumaura`, `screen=select`, `alt1=1` / `alt2=1` (the evil
twins), `seed=N`, `hold` (no free-running loop; tools step `__pf2`),
`webgl` (force WebGL 2), `noportraits` (skip the card portraits).

## Status — stage 1 of 2

| # | Milestone | State |
|---|---|---|
| 1 | Arena + camera | done |
| 2 | 3D movement, ring edge, ring-outs, deterministic tests | done |
| 3 | Combat core in 3D | done |
| 4 | All 7 fighters ported with movesets | done (data + puppets; see known issues) |
| 5 | CPU, modes, HUD, select, audio, title | done |
| 6 | Build + release | see the PR / `pf2-release` |

## Controls

One player (vs Computer, practice) — PF1's keys, W / S now sidestep:

| Key | Action |
|---|---|
| A / D (← / →) | walk back / forward along the line; double-tap: dash |
| W / S (↑ / ↓) | **tap: sidestep** into / out of the screen (beats linear attacks); **hold: circle** |
| Q | hop |
| Left Shift (or C) | crouch |
| O | light · Shift+O low light |
| P | heavy · **←+P spin** (tracks a sidestep) · Shift+P signature |
| O+P | throw (beats block; tech it with O+P) |
| E | block (Shift+E low block) |
| Space | special (full meter) |
| Esc / M | pause / mute |

Versus on one keyboard: P1 W A S D, Q hop, Left Shift crouch, G light, H
heavy, E block, Space special. P2 arrows, Num 8 hop, Num 2 crouch, Num 4
light, Num 5 heavy, Num 6 block, Num 0 special. The select screen and the
pause card draw the keyboard legend (`ui/keymap.js`).

## How it works

### Sim (`src/sim/sim.js`, rollback-ready)
- Fixed 60 Hz, integers only (1000 = one world unit), no trig: a facing is
  an integer vector of length 1024 from an integer square root; no
  `Math.random`, no clock (a test greps for them). `clone` = structured
  copy, `hash` = FNV-1a over the JSON. Inputs: a 10-bit mask per player
  (`sim/input.js`: LEFT RIGHT UP DOWN LIGHT HEAVY SPECIAL BLOCK JUMP CROUCH).
- **VF movement:** both face each other along a line that turns freely.
  LEFT / RIGHT are screen-relative (the camera keeps P1 on the left, so RIGHT
  is P1's forward and P2's back). UP / DOWN tapped: a sidestep (18 ticks,
  round the other one at a constant distance, attackable from tick 12);
  held: the circling walk. JUMP: a short hop (¾ of PF1's take-off). CROUCH.
- **Linear vs tracking:** every hit box is a rectangle in the attacker's
  frame (along `[x, x+w]`, across `±W`), tested against the defender's
  vertical cylinder. An attack locks the facing it started with, so a
  sidestep takes the body out of a narrow (W 450) box. Circular moves
  (`circ: 1`) keep re-aiming until they strike and have wide boxes (W 2600):
  every fighter has the **spin** (back + heavy); Rubberta's Tentacle Sweep
  tracks too. Projectiles fly their own line: sidestep them.
- **Ring:** the mattress top is `|x|, |z| ≤ RING` (7600). Walking stops at
  the edge (`EDGE` inside it). A knockdown from a heavy / spin / signature /
  special / launcher that carries a fighter past the edge is a **ring-out**
  (`act: 'ringout'`, the round lost, a slow-motion fall to the carpet `BED`
  below, the ring-out cinematic). A heavy blow with his back within
  `EDGE_KO` of the edge turns into a ring-out knockdown. Lights never ring
  out (clamped).
- **Throws** (O+P): PF1's grab rules (beats block; not airborne, knocked
  down, getting up or stunned; tech window `TECH`; two throws at once tech).
  The owner's rule in 3D: at the grab, the room from the victim to the edge
  straight ahead is compared with the room behind the thrower; the victim
  goes **toward the side with more room** (ahead, or over the shoulder), and
  the toss is shortened to the room there is: a throw never rings out.
- K.O. and ring-out cinematics are the sim's own slow motion (`ks`), so
  both online peers will see the same thing (stage 2).

### Render
- `render/arena.js`: the bedroom (quilted mattress with a stitched ring
  band and piped edges, wooden base, corner pillow stacks, toy blocks, a
  ball, picture books, the nightstand lamp, window and moon, fairy lights,
  a neon "Z" sign, pink / mint / violet walls). The room lives in
  `arena.world`; the camera's azimuth is applied by **turning the world the
  other way**, so the plush's hand lighting (PF1's fixed key light) stays
  camera-relative: backs and sides are lit as well as fronts.
- Camera: side-on to the fighters' line, P1 on the left, orbiting (eased,
  the short way round) as they circle; distance from their separation and
  the taller fighter's height; rises for a hop; the **ring-out cam** (low,
  off to the side of the fall, swinging slowly, slow motion), the **K.O.
  cam** (close, orbiting the one flying), the **super push-in** (on every
  special), the winner close-up. `_clear()` keeps it above the quilt and
  out of the pillow posts, lamp and toys.
- `render/plush.js` (PF1's, patched): full yaw from the sim's facing (plus a
  small turn toward the camera, as PF1 did, so faces read), tumbles about
  the axis across the knock (K.O.) or across the facing (flips), the spin
  attack's whole-body turn, the sidestep's little hop. `fight.js`'s
  `puppetView()` maps the 3D-only acts onto PF1 animations (side / circle →
  walk, ring-out → down, spin → heavy).
- Hits: hit-stop (the sim's pause), the plush squash and crunch, stuffing
  tufts and **feathers** (instanced quills that sway as they fall), sparks,
  camera shake / nudge, PF1's SFX (+ a ring-out gasp and a sidestep swish).
- Contact shadows are instanced soft decals. (PF1 painted a canvas texture
  every frame; under the WebGL 2 backend the re-upload never showed, so its
  shadows were invisible. Noted here, PF1 untouched.)

### UI (`src/main.js`, `src/index.html`)
Title ("PILLOW FIGHT" logo + a puffy neon **2**, subtitle **Lights Out**),
modes (vs Computer, Versus, Practice; Online greyed: stage 2), character
select (PF1's portraits on a curved card arc; the picks stand on the quilt
on a turntable; OG / ALT with W / S), difficulty, the VS card, HUD (STUFFING,
timer 60 s, round pips, SPECIAL meters, combos, COUNTER / EDGE! pops,
Ring Out / K.O. banners), pause with sound settings and the key legend,
winner close-up with the catchphrase bubble and a rematch. Practice: dummy
modes 1 stand / 2 block all / 3 sidestep / 4 CPU, the move list, R reset.

### CPU (`src/ai/cpu.js`)
Reads the state, emits masks from its own seeded PRNG (deterministic).
Easy / Normal / Hard differ in reaction delay, block and sidestep odds,
aggression, edge sense. It sidesteps linear attacks and shots it sees in
time, crouch-blocks lows, punishes blocked moves, throws blockers, spins
sidesteppers, circles off the edge and goes for ring-out heavies.

## Tests and checks
- `test/sim.test.mjs` (17): no clock / random / trig in the sim; same
  inputs → same hash; clone + resimulate from a snapshot; integer state;
  walk, dash, sidestep (distance kept), circling, hop, crouch; sidestep
  makes a linear heavy miss and the spin catches it; every fighter has a
  tracking move; the edge stops walks; heavy at the edge = ring-out (round
  lost, fall to the carpet); lights never ring out; throws beat block, go
  to the side with more room, never ring out; can't grab airborne; tech.
- `test/combat.test.mjs` (8): hits, block / low block, every special /
  signature / spin connects for all 7, projectiles are sidesteppable, the
  K.O. slow motion, 49 pairings × 2000 noisy ticks deterministic.
- `test/ai.test.mjs` (3): CPU-vs-CPU matches end with sidesteps, spins,
  throws, ring-outs; deterministic; hard beats easy.
- `tools/check.mjs`: the menus by keyboard into a vs CPU fight, a whole
  CPU match to the winner screen and a rematch, versus on one keyboard
  (each player's keys move only their own fighter), practice, per-frame
  JS cost; zero console errors, zero network requests.

## Next (stage 2)
1. **Online** (PF1's PeerJS rollback): copy `bolster/_source/src/net/`
   (`link.js`, `rollback.js`) and `online.js`; the sim is already
   rollback-shaped (`clone`, `hash`, input masks, events after the tick,
   the SFX router's dedupe). Re-enable the Online pillow and the build
   gate's `stunOk` check (disabled in `tools/build.mjs` while there's no
   online code).
2. Throw animations: proper 3D throws (the over-the-shoulder toss is a
   placeholder teleport behind the thrower).
3. Per-fighter 3D flavour: a second tracking move per fighter, sidestep
   attacks, and per-fighter wall/edge moves.
4. Ring-out drama: a lip-teeter animation at the edge; more camera
   variety; the carpet bounce puff.
5. Names / leaderboard (PF1 had them), key rebinding UI for versus (the
   bindings already load from `localStorage`), the title line-up.
6. Balance pass with a 3D `tools/balance.mjs`; frame-data doc.

## Known issues
- Performance is measured as JS time per frame (sim + puppets + soft
  bodies), not GPU time: the sandbox has no GPU (SwiftShader). See the PR
  for the PF1 baseline measured the same way.
- The camera can pass behind a corner pillow stack when a fighter is right
  in the corner (it rises over it rather than clipping).
