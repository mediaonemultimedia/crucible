# Grommet — source

Readable source for **Grommet** (Crucible No. 22): plush athletes, each a soft
body under shell fur, each playing one little sport against you. Stage 1 is the
**leopard** (tennis) and the **polar bear** (goalkeeping); then the **crow**
(catch & hoard) and the **giraffe** (ring toss).

This tree lives on the `grommet-source` branch only. What ships to `main` is
the single built file, `grommet/index.html`.

```
npm install
npm test                 # node --test test/*.test.mjs
npm run build            # → final.html (self-contained; the build fails on any network reference)
node tools/shots.mjs     # headless Chromium screenshots → shots/ (WebGL 2 on SwiftShader)
```

Open `final.html?character=leopard|bear|crow|giraffe` (add `&webgl` to force the WebGL 2
path). Copy it to `grommet/index.html` on the release branch to publish.

## What came from Flock

The engine is copied from Flock's source (`flock-source`, `flock/_source/`),
not shared — Flock is never touched:

| file | from Flock | changed |
|---|---|---|
| `softbody.js` | small-steps PBD, fixed 1/120 s clock (`advance()`), clouds, chains, tethers, memory | floor friction is a param (`mu`) so shuffling feet can slide |
| `body.js` | CPU-deformed packed-attribute mesh (≤ 8 vertex buffers) | partial grids (`vr`), partial tubes (`s0…s1`, `rs`), torus `B`, cloth mode (compression → creases) |
| `fur.js` | 64-shell TSL fur, Kajiya-Kay, eyes, floor + shadow | pattern atlas (spots, nose), court canvas on the floor |
| `groom.js`, `math.js`, `tools.js`, `idle.js` | as was | tools: Serve/Shoot replaces stick/toys; idle: no octopus arm curls |
| `pose.js` | the `Pose` class and springs from `toys.js` | — |
| `rigbuilder.js` | `RigBuilder` from `rigs.js` | `clothGrid` / `clothTube`, a cloth atlas, extra rig fields |

New: `balance.js` (standing upright; the damped get-up servo), `ball.js`,
`net.js`, `cloth.js` (cotton), `props.js` (racquet, balls, stars, goal),
`athletes/` (rigs and games), `characters.js` (colours, faces, rosettes, courts).

## Hard-won rules (read before changing physics)

- **Never step with the raw frame dt.** Everything per-step runs inside
  `soft.advance()`; uneven step lengths pump energy into PBD.
- **A displacement applied every substep is a force.** `x += v·h` each substep
  accelerates without bound (that was the first shuffle, and it exploded). Push
  with `F·h²`, or servo a *velocity*: displace by `Δv·h` toward a target
  velocity (`_footwork`, `rightUp`).
- **A position pull of fraction α per substep is a spring of stiffness α/h².**
  Fine for small corrections (standing `balance`), violent for big ones —
  righting a fallen bear with it flung him into the air. Big recoveries use
  `rightUp`, a capped, damped velocity servo.
- **Keep vertex attributes packed** (WebGPU caps a pipeline at 8 vertex
  buffers): `tuP`, `tvU`, `uvfp`, `look` carry two things each.
- **No fur under clothes**: every cloth part needs a `furMask` entry in its rig.

## How an athlete is put together

```
src/athletes/
  index.js          ATHLETES registry + ORDER (selector order, ⇧1…⇧9)
  standing.js       torso + head bulk + inCloud legs + flat soles (cloud 0)
  game.js           Athlete: attention, balance, footwork, tail, ball hookup
  leopard.rig.js    rest shape, kit (shirt, collar, sleeves, headband), furMask
  leopard.game.js   tennis
  bear.rig.js       rest shape, gloves, furMask
  bear.game.js      goalkeeping
  crow.rig.js       round body, head, flat wing chains, tail fan, felt feet
  crow.game.js      catch & hoard: tosses, the beak, the lunge, the nest
  giraffe.rig.js    four legs, a long neck chain, the head a second cloud on it
  giraffe.game.js   ring toss: tracking, the neck's reach, the stack, the shake
ring.js             a felt ring: a rigid torus (impulse contacts; no three.js)
characters.js       per-athlete colours, eyes, face, pattern, court, words
props.js            what they play with (three.js)
crowprops.js        the crow's beak, nest and treasures (three.js)
giraffeprops.js     the giraffe's felt rings (three.js)
```

### The crow (how he differs)

- **Beak**: not stuffing. Two rigid felt mandibles (`crowprops.js`) ride the
  head's frame, which `CrowGame._headFrame()` measures every substep by
  shape-matching the head's stuffing to its sewn shape. `beak` (0…1) is the
  gape; `mouth` (between the mandibles) is what catches.
- **Wings** are flat `arm` chains. A beat re-poses them (out, up, round) and
  turns the chain's `ref` with the same rotation, so the flat cross-section
  turns with the wing (`_posture()`); the tips are also driven toward the pose.
- **Peck**: the head bows about `PECK_PIVOT` (low, in the chest) while the
  body leans — a round plush can't reach the floor otherwise.
- **Lunge**: a hop impulse, then per substep the beats hold up `LIFT` of his
  weight and servo the body's velocity toward where the toss comes down to
  his mouth (a capped velocity servo, as in `_footwork`).
- **Turning** is rate-limited (`faceT` → `face`) and the bow is on springs: a
  big balance-facing jump while bowed spun him at 20 rad/s.
- **Things** (food, shiny) are light `Ball`s with their own soft collision
  (`_softCollide`: they give way, the plush hardly does), the nest's bowl and
  rim, each other, and the edge of the mat (`STAGE`). The Hand picks them up
  through `Tools`' optional `items` hook (null for everyone else).
- `fur.js` has a `sheen` uniform (black = none, so the others are unchanged).

### The giraffe (how he differs)

- **Four legs, a neck, a head on it.** Cloud 0 is the body and four inCloud
  legs on flat soles (`standingBody` is for bipeds; his is in his rig). The
  neck is a chain off the front of it, and the head is a *second cloud* that
  shares the neck's top point and remembers how it sat on the body, like
  Flock's llama — but only the top point: sharing two made the neck's bending
  windows steer the head, and it wouldn't hold level.
- **Pose bones go to the head cloud's own points only** (`cfg.skull`: its
  shell, core, and the roots of the ears and ossicones). The chain points of
  the ears and ossicones remember their places in the head's measured frame;
  posing them as well turned them twice, and pinning their roots to an
  unturned pose tore the head off the neck (it walked him across the mat).
- **Aiming the neck**: `_plan()` finds the first point of the ring's fall
  where his ossicone tips can be (the neck top that far from its root), and
  the neck bone turns toward it. What the neck's weight and lag leave him
  short by is integrated (`corr`) and the head is pulled toward the spot
  (`_reachForce`, the body taking the reaction). He catches a ring when both
  tips are inside it as it comes down.
- **On the neck** a ring is a particle held round a path (ossicone tips →
  between their roots → down the neck chain) with a little clearance,
  friction along it against the neck's motion, a share of every push given
  to the neck (capped: a ring weighs little), and lateral knocks damped (felt
  is dead). Rings stack **in the order they came on** (one can't pass another
  on a neck); a settled ring is held down on the one below. A ring caught off
  centre gets `slack`, shrinking: snapping it onto the line was a kick.
- **Sag and sway** are pose-space springs: the stack's weight sets the sag's
  target, its natural frequency drops and its damping falls as rings are
  added, and catches and landings kick it.
- **The shake** turns the whole neck down at its root (the root bending
  windows are eased off while it does, or they fight the pose and haul him
  forward), nose down, and swings it; friction drops to almost nothing, the
  rings slide down to his head and off over his ossicones. They don't touch
  his head for 0.3 s after leaving (they'd be threaded round his horns).
- **Free rings** (`ring.js`) are rigid tori: contacts are impulses at the
  contact point against the floor (16 points round the centreline), the
  plush (exact point-to-circle distance) and each other; they only go to
  sleep lying flat.
- `react: true` (memory pushes the body back): with it off, swinging the neck
  over shoved him across the floor.

### Adding one (stage 2: penguin batter, otter juggler, panda drummer)

1. **Rig** — `src/athletes/NAME.rig.js` exporting `buildNAME()`:
   - `standingBody(b, {...})` for a biped (or your own clouds for anything
     else — the otter could float on its back); then grids (head, muzzle…)
     and chains (`kind: 'arm' | 'ear' | 'tail' | 'leg'`).
   - Kit with `b.clothGrid` / `b.clothTube` (`style` 0 plain, 1 polo front,
     2 glove, 3 terry; `trim`, `sway`), and a matching `furMask` in `finish()`.
   - `finish({ toy: athleteCfg(b, h0, h1, { pivot, chest, armR, armL }), … })`
     — the game reads `rig.toy` for the head points, neck pivot, ears, arms.
2. **Game** — `src/athletes/NAME.game.js`, `class NAMEGame extends Athlete`:
   - `launch({ aim, speed })` puts the ball (or whatever) in play;
   - `_think(dt)` per fixed step: read, decide, set `this.lookAt`,
     `this.drive` (footwork), `this.balanceK`, `this.lean`, springs;
   - `_bones()` returns pose bones (`armBone(k, dir)` points an arm);
   - `_push(h)` / `_ballStep(h)` per substep: forces (`F·h²`), contacts;
   - `readout()` → two `[label, value]` pairs; `status()` → a few words.
3. **Register** it in `athletes/index.js` (`ATHLETES` and `ORDER`).
4. **Character info** in `characters.js`: `colors` (fur, under, accent, spot,
   nose, cloth, trim), `eyes`, `pile`, `camera`, `face(g, size, P)`,
   `pattern(g, size, P, rig)`, `court(g, toPx, k)`, and the words (`label`,
   `sport`, `tool`, `verb`, `blurb`, `hand`, `play`, `aria`). Add the nose to
   `noseOf()`.
5. **Props** in `props.js` and a few lines in `main.js` to show and pose them
   (see the racquet, the balls and the goal).
6. **Tests** — add the name to the shared standing/volume/grab/frame-time
   loop (it runs over `ORDER`) and write the sport's own tests (the ball comes
   back, the dive gets there and he gets up, nothing runs away).
7. **Shots** — add scenes to `tools/shots.mjs`, run it, and *look* at them.

## Verification

`npm test` covers, per athlete: standing upright at every stuffing without
sinking or walking off; volume within 10% (and after a squish); a grab that
jumps 5 units stays finite and it lands back on its feet; uneven frame times
settle; idle stays put. Leopard: forehand and backhand returns go back toward
the server; mistimed swings don't; out of reach is a miss; a fast ball to the
head bonks him with bounded energy and he recovers; a 20 s auto rally never runs
away. Bear: corner dives get a glove to the ball and he gets back up (no
frame-to-frame jumps); a body shot is saved without a dive; faster corner shots
score more; a run of shots never runs away. Crow: well-aimed food is snapped
out of the air (beak opens on the way in, shuts on it, then a gulp); wide
tosses get a flap-and-lunge with the wings out, bounded energy, back on his
feet; a miss is pecked off the floor; shiny things end up resting in the nest
(several, none overlapping); a treasure dragged out is stolen back (and
snatched from your hand if you hold it low); a long mixed run never runs away.
Giraffe: he stands square on all four soles; well-aimed rings (centre and
either side) drop over his ossicones and slide to rest at the base of his
neck; five rings stack without overlapping and his head drops measurably
further than under one (the sag spring more than doubles); past the limit he
shakes and every ring comes off and ends at rest on the floor (bounded
energy, ring speeds, no frame jumps, back home upright); a ring dropped hard on
his head is a clonk that sets the shake off; misses bounce, roll and lie
flat at rest, and Collect clears them; a 30 s auto run never runs away.

There is no GPU in the build sandbox: screenshots are SwiftShader, and frame
rate / WebGPU behaviour have to be checked on real hardware.
