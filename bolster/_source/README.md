# Bolster — source

Readable source for **Bolster** (Crucible No. 23): a Street Fighter–style
one-on-one fighting game whose fighters are Crucible's plush soft bodies. The
gameplay is 2D (one line, a side camera); the fighters are the same 3D plush
models, fur and soft-body rigs as Grommet (No. 22) and Flock (No. 21).

This tree lives on the `bolster-source` branch only. What ships to `main` is
the single built file, `bolster/index.html`.

```
npm install
npm test                         # node --test test/*.test.mjs
npm run build                    # → final.html (self-contained; fails on any network reference)
node tools/shots.mjs [scene …]   # headless Chromium screenshots → shots/ (WebGL 2 on SwiftShader)
node tools/cpu-match.mjs         # a whole CPU-vs-CPU match in the browser, zero console errors
node tools/font.mjs              # re-subset the two embedded fonts (needs fonttools)
```

Open `final.html`, or deep-link straight into a fight:
`final.html?p1=kevalanche&p2=sumaura&cpu=hard` (`p1cpu=normal` hands player 1
to the computer too; `seed=N` fixes the match seed; `toques=1`; `webgl` forces
the WebGL 2 path; `hold` stops the free-running loop for scripted stepping).

## The roster

| Fighter | Animal | From | Signature (S+P) | Special (Space, full meter) |
|---|---|---|---|---|
| Kevalanche 🇨🇦 | polar bear | Grommet's keeper, in red boxing gloves | Glacier Uppercut (anti-air, invulnerable to air attacks early) | Avalanche Rush — a charging flurry, a last hook |
| Rubberta 🇧🇷 | octopus | Flock's octopus | Tentacle Sweep (low, long) | Abraço — eight-arm grab and squeeze, unblockable up close |
| Johnny Deuce 🇨🇦 | leopard | Grommet's tennis leopard, racquet in hand | Serve (a tennis-ball projectile) | Match Point — a volley of five serves |
| Sumaura 🇬🇧 | panda | one of Grommet's sumo pandas (the champion) | Bamboo Headbutt (a flying charge) | Hundred Paw Slap ending in the Royal Squash |
| K8-E 🇨🇦 | giraffe | Grommet's ring-toss giraffe | Ring Toss (a felt-ring projectile) | Sky Neck — the neck goes up out of shot and comes down on them |

## How it's put together

```
src/
  sim/sim.js        the game: step(state, in1, in2) → state at 60 ticks/s.
                    Integers only (1000 = one world unit), the PRNG in the
                    state, no clock, no renderer. clone() / hash() for rollback.
  sim/rng.js        mulberry32 on a uint32 in the state
  sim/input.js      the 7-bit input mask (← → ↑ ↓ O P Space)
  fighters/         per-fighter numbers: walk/jump, push and hurt boxes, every
                    move's hits (window, box, damage, level, stun, push),
                    motion, projectiles, grab; names, flags, lines
  ai/cpu.js         the computer: reads the sim (the opponent `delay` ticks
                    late), returns the same mask a keyboard would; difficulty
                    = reaction time, block/guess rate, anti-air, punish, special
  input/keyboard.js keys → mask, sampled once per tick (taps latched)
  render/stage.js   renderer (WebGPU, WebGL 2 fallback — Grommet's), camera,
                    felt mat, contact shadows, sparks, stuffing, projectiles
  render/plush.js   one fighter: rig → SoftBody → Body → shell fur + cotton +
                    bead eyes, in a group the sim moves; toque, monocle, stars
  render/puppets.js the fighting poses on the shared rigs (see below)
  render/showcase.js the plush on the select screen; the card portraits
  fight.js          sim + inputs + view: fixed-step accumulator, interpolation,
                    sim events → effects
  ui/bubble.js      the hand-cut cardboard speech bubbles (procedural SVG)
  ui/flags.js       little SVG flags
  main.js           screens, HUD, banners, easter eggs, deep links, test hook
shared/             copied, as unmodified as possible (see shared/CHANGES.md)
  grommet/          from grommet-source @ b6164e2
  flock/            from flock-source @ 1cc2ec1
test/               sim.test.mjs, ai.test.mjs
tools/              build.mjs, font.mjs, shots.mjs, cpu-match.mjs
docs/PLAN.md        the plan this was built from
```

### The sim (and stage 2)

Everything that decides the game is in `src/sim/` and `src/fighters/`, and it
never looks at anything else: a match is `createMatch({p1, p2, seed})` and a
list of input pairs. State is plain data with a fixed shape, so a snapshot is
`clone(state)` (a structured copy, also JSON-safe) and `hash(state)` is FNV-1a
over its JSON. Visible randomness — the catchphrase (main line 4 in 5, the
easter egg 1 in 5) and the Fluffatality roll (1 in 10 on a special that ends
the match) — is drawn from the state's PRNG, so two peers replaying the same
inputs see the same thing. Stage 2's `net/` (PeerJS, rollback) only needs:
the input mask per tick, `clone`, `step`, `hash` — all here and tested.

Rules: holding away blocks; standing blocks high and mid, crouching blocks
low and mid; jumping attacks and Sky Neck are high (overheads); the Abraço is
unblockable. Light normals cancel into heavy, the signature or the special on
contact. Meter fills from hits landed (90% of damage) and taken (35%), a
little on block, none from a special's own hits; tuned for about one full
meter a round. Combos scale down (a special much less). 99-second rounds, best
of three; a draw on time gives both a round.

### The plush (cosmetic only)

Each fighter is the shared rig, unchanged, in a `THREE.Group` that the sim's
position and facing move and turn (three-quarters to the camera, so faces
read). The soft body lives in the group's own frame on its own fixed 1/120 s
clock off real time, and a *puppet* poses it from the sim's action and frame:

- **Bipeds** (bear, leopard, panda) extend Grommet's `Athlete`: arm bones
  eased on springs toward each move's key directions (a jab, a hook, the
  uppercut, the serve, the paw slaps), a lean for the balance servo, stepping
  in place while the group walks, a fall (balance off, a shove) and Grommet's
  damped `rightUp` to get back up, the daze wobble and stars after big hits.
- **The giraffe** poses her neck as GiraffeGame does (a weighted neck bone,
  the head held level) and *stretches* it: the neck's links, bending windows
  and tether limits scale, and the posed neck slides out along itself. Sky
  Neck is that stretch, straight up, then a second bone curls the top half
  over and down onto the other fighter.
- **The octopus** is Flock's rig driven directly: tentacle strikes are Flock's
  grab — the tip pulled toward a target, the arm stretching to its tethers and
  springing back when let go; the Abraço is all eight tips pulled onto a ring
  around the other fighter, squeezing.

The group's acceleration reaches the stuffing as inertia (a jump squashes, a
landing slumps), and blows are velocity kicks on the upper body. None of it
reaches back into the sim.

### Bubbles

`ui/bubble.js` builds every bubble fresh as SVG: a kraft card cut as an
irregular polygon of 10–16 straight scissor cuts (uneven, with a few nicks)
reaching past the bubble with a tail cut toward the speaker, a mottled fill,
faint corrugation ribs, a darker raw edge, a soft drop shadow; on it a cream
bubble with a thick wobbly marker outline and a second sketchy pass out of
register, a halftone shadow lower right, shine ticks, and Gochi Hand lettering
with a wandering baseline and each letter turned ±2.8°. Tilted a few degrees,
slapped down (squash, settle). Cosmetic randomness uses `Math.random`.

## Fonts

Two OFL fonts are subset and inlined (base64) by the build: Gochi Hand (the
bubble lettering — subset to exactly the characters the fighters say) and
Lilita One (HUD, menus, banners — subset to printable ASCII). They're declared
as "Bolster Hand" and "Bolster Display" (a modified OFL font doesn't carry its
Reserved Font Name). Licences: `src/assets/*-OFL.txt`.

## Verification

`npm test`: determinism (same inputs → same hashes, run twice; integers
everywhere), a hit lands (STUFFING down, both meters up, the attacker's more),
the blocking rules (mid vs standing and crouching, low vs standing and
crouching, a jumping attack vs both), the special needs a full meter and
spends it, the impatient-special event, a K.O. ends the round and a perfect
one is a Fluffless Victory (and not after any damage), time decides by
STUFFING share, best of three, every signature and every special connects and
deals damage, Abraço is unblockable up close, the catchphrase pick is
deterministic per seed and about 4:1, Fluffatality only on a match-ending
special K.O. at about 1 in 10, rollback (clone at N, resimulate → same hash; a
JSON round trip keeps the hash), random play always finishes; the CPU at every
difficulty finishes a match with every fighter, CPU vs CPU is reproducible,
Hard beats Easy (10 seeded matches), Hard concedes far fewer hits than Easy,
and both spend the special.

There is no GPU in the build sandbox: screenshots are SwiftShader, and frame
rate / WebGPU behaviour have to be checked on real hardware.
