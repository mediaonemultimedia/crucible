# Grommet — source

Readable source for **Grommet** (Crucible No. 22): plush athletes, each a soft
body under shell fur, each playing one little sport against you. Stage 1 is the
**leopard** (tennis) and the **polar bear** (goalkeeping); then the **crow**
(catch & hoard) and the **giraffe** (ring toss). Stage 2 adds the **penguin**
(batting), the **otter** (juggling) and two **pandas** (sumo).

This tree lives on the `grommet-source` branch only. What ships to `main` is
the single built file, `grommet/index.html`.

```
npm install
npm test                 # node --test test/*.test.mjs
npm run build            # → final.html (self-contained; the build fails on any network reference)
node tools/shots.mjs     # headless Chromium screenshots → shots/ (WebGL 2 on SwiftShader)
```

Open `final.html?character=leopard|bear|crow|giraffe|penguin|otter|panda` (add `&webgl` to force the WebGL 2
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
  penguin.rig.js    an egg of a body, flat flippers (the right one holds the bat), felt cap and feet
  penguin.game.js   batting: the count, the swing, the bat's contact, the whiff-spin
  otter.rig.js      a pear sat on its bottom (a seat ring, no feet), short arms, flat tail
  otter.game.js     juggling: paws to the catch, the scoop, the throw, the tumble
  panda.rig.js      two pandas in one rig (cloud 0 the champion, cloud 1 the challenger)
  panda.game.js     sumo: Rikishi per panda, the charge, the clinch, the call, the reset
ring.js             a felt ring: a rigid torus (impulse contacts; no three.js)
characters.js       per-athlete colours, eyes, face, pattern, court, words
props.js            what they play with (three.js)
crowprops.js        the crow's beak, nest and treasures (three.js)
giraffeprops.js     the giraffe's felt rings (three.js)
otterprops.js       the otter's shells and pebbles (three.js)
pandaprops.js       the dohyo rope and the stomp dust (three.js)
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

### The penguin (how he differs)

- **The bat** is the racquet idea again: a rigid body gripped in the right
  flipper (`batFrame`: the flipper's last points give the handle axis, an
  eased wrist cocks it), and every swing is that straight-sewn flipper
  turned about the shoulder. Contact is the ball against the bat's capsule
  (it thins from barrel to handle, `batR`) with the bat's own velocity at
  the contact point, swept over the substep. Nothing is steered: the call
  comes from the ball's flight off the bat — outside the foul lines, back
  over him or topped into the floor by the plate is foul; fair and carrying
  past `FENCE` a home run; fair and short a hit.
- **Aiming low**: the stuffed flipper rides high through a fast swing (more
  so low down), so his plan aims under it by a learned line (`AIM_FIX`),
  measured with the bat swinging through without the ball.
- **The count**: pitches well off the plate he takes (ball); the rest he
  swings at, and chases a few near ones. Three strikes or four balls, a new
  count; fouls count as strikes up to two.
- **The whiff-spin** is a capped velocity servo on his yaw that makes one
  full turn. Two things had to give for it: the felt soles' static grip
  (`restV`) is off while he turns, and the stuffing's rotation estimate is
  turned on by each substep's spin — shape matching toward a frame refined
  from the last substep's lags a fast turn, and that lag is a brake (it held
  him to a sixth of the speed asked).

### The otter (how he differs)

- **Sitting up**: no legs to stand on. Cloud 0 is a long pear sat on a flat
  ring of points (`seat`), a wider footprint than any biped's; his hind legs
  are short inCloud chains along the floor, his flat tail lies behind.
- **Paws** are arm chains re-posed toward eased aims (three critically
  damped springs per paw, so a new aim is a reach, not a snap) and pulled
  there by a capped, damped spring on their last two points.
- **The cascade** is event-driven: a paw meets the next thing coming down to
  it (where the arc crosses paw height, clamped to his reach), closes on it
  inside `CATCH_R`, carries it through a scoop, and throws it to come down
  where the other paw waits, `TF` later; a paw still holding when the next
  is about to land throws early. Juggled things are little `Ball`s with no
  plush collision while they're his; loose ones (tumbling, missed) collide
  both ways with him, the mat and each other, and a pebble squeezed out from
  between his paws is soaked up (capped at 5 u/s) rather than shot off.
- **The tumble**: five at once, or one he can't reach, and everything lets
  go — the ones in his paws pop up and drop back onto his belly and legs.
  His lean is eased: the balance pull is stiff, so a jump in what it pulls
  toward was a kick (KE 1200 out of nowhere).
- `stones`, not `items`: `main.js` reads `game.items` as the crow's.

### The pandas (how they differ)

- **Two toys, one rig**: each panda is built facing +z at the origin by the
  same code, then turned and moved to its mark (`place()`: points, grid
  centres and bases, chain frames). One soft body, one fur mesh, one draw;
  `rig.bodies` lists which points are whose. `SoftBody` then (only for such
  a rig): leaves cross-toy pairs out of the all-pairs list and collides the
  two through a box-overlap broadphase (`_collideBodies`, which also counts
  `touching`); damps each toy about its own mean velocity (`_finishBodies`
  — one panda's charge isn't the other's jiggle); and skips the head-on-
  torso memory for a cloud with no parent. `Pose` takes several posed
  clouds; `balance`, `rightUp` and `settle` take a cloud index. With no
  `bodies` every line of that is skipped: the other athletes run exactly
  the code they did.
- **Rikishi**: each panda's frame (`cfg.R`, its rest turn), attention,
  arms (hang / reach / up / out), lean, balance strength, drive. Pose bones
  and leans are written in his own frame and turned into the rest frame.
- **Strength** is a velocity servo on his stuffing with a capped
  acceleration (`_drive`). Contact is the soft body's own collisions: who
  pushes harder moves the other. Locked together, each grips the other's
  mawashi (`_grip`: their motion across the line between them is shared,
  equal and opposite) — without it the pair orbited each other and the
  bout became a dance. A clinch needs real contact (`touching`) and both
  facing each other: a charge brushing past a side-step isn't one, and a
  charging challenger faces where he runs.
- **The champion** meets a charge, or side-steps a reckless one (all-out,
  or well off the line), circles a little at the rope, and belly-bumps
  when your push sags. Difficulty scales his push; his form varies a little
  bout to bout. Your push tires (`stamina`), so a bout always ends; the
  judges decide at `DECIDE_T` regardless.
- **The call**: a panda loses when any of his points touches the floor
  outside the rope, anything but a sole touches inside it, or he tips over.
- **After**: the winner bounces with his arms up; the loser sits back,
  dazed (gently: a stiff lean back fought the floor and thrashed). Getting
  up is `rightUp` with the soles' static grip off (it snagged him half-way,
  and switching the balance pull on at 45° then blew him apart — balance
  only comes back once he's upright). Then both walk to their marks and the
  shiko plays (a roll onto one leg, a lift, a stomp, dust; then the other).
- Two pandas carry twice the vertices, so they get 40 shells (`shells` in
  their character info) instead of 64.

### Adding one

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
Penguin: well-timed pitches (low, middle, high) are hit fair and forward off
the barrel; early, late or way off is never a clean hit; a whiff spins him a
full turn (no frame jumps, bounded energy) and he wobbles back to face the
pitcher on his mark; one well off the plate is taken for a ball, and the
count adds up (strike three resets it); an inning of random pitches never
runs away. Otter: two tossed in stay juggled paw to paw for 5 s (at least 8
throws, nothing below his paws, bounded energy); three go round; five is too
many and everything tumbles, bouncing off him, coming to rest on the mat
without flying off, and he looks at the floor; a toss out of reach drops
everything. Pandas: the shiko comes first (a foot lifted, four stomps, dust);
a strong well-aimed charge drives the champion out at two difficulties; a
weak one is met and repelled; a reckless one is side-stepped and carries the
challenger out; six mixed bouts each end with exactly one winner inside
16 s, the two never closer than a body apart, stuffing never sinking more
than 60% of a touching distance into the other, bounded energy; after a bout
the winner's arms go up and the loser sits back dazed, and both end on their
marks, upright, facing each other, at rest.

There is no GPU in the build sandbox: screenshots are SwiftShader, and frame
rate / WebGPU behaviour have to be checked on real hardware.
