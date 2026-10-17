# Bolster — source

Readable source for **Bolster** (Crucible No. 23): a Street Fighter–style
one-on-one fighting game whose fighters are Crucible's plush soft bodies.
The piece is Bolster; the game itself is called **Pillow Fight** (title
screen, page title, menus, winner screen), with the owner's logo
(`assets/pillow-fight-logo.webp`, inlined by the build) and a neon arcade
palette to match it. The
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
node tools/font.mjs              # re-subset the three embedded fonts (needs fonttools)
node tools/balance.mjs normal 50 # seeded CPU-vs-CPU win rates, every pairing, in the sim
node tools/framedata.mjs         # frame data for every fighter → docs/FRAMES.md
node tools/polish-shots.mjs [--html F] [--out D] [--q '&boxes'] [scene …]
                                 # shoulder sheets and light/heavy strips, any build
node tools/combat-shots.mjs [block|throws|counter|combo|controls|ko|ko-final]
                                 # the combat pass's evidence → shots/combat/
```

Open `final.html`, or deep-link straight into a fight:
`final.html?p1=kevalanche&p2=sumaura&cpu=hard` (`p1cpu=normal` hands player 1
to the computer too; `seed=N` fixes the match seed; `toques=1`; `webgl` forces
the WebGL 2 path; `hold` stops the free-running loop for scripted stepping;
`boxes` draws the sim's hurt, limb, hit and shot boxes over the picture).

## Combat pass (bolster-combat)

The owner's note: *"there are few advantages to staying away, I just press
forward and keep punching."* This pass makes spacing, defence and timing
matter. Full rules and every move's frame data: `docs/FRAMES.md`.

- **E blocks.** Holding back only walks away now. E standing blocks high
  and mid, S+E low and mid; overheads (jump-ins, the dive slam, Sky Neck,
  the Royal Squash) need a standing block. Guarding holds you in place
  (act `guard`: no walk, jump or dash). A blocked hit pushes both apart
  (blocker 1.5× the push, attacker ½, all of it in the corner). Only
  signatures, specials and shots chip. The input mask gains an eighth bit
  (`BLOCK = 128`); masks 0–127 mean what they did, so replays and the
  online protocol (which sends masks as numbers) are unchanged in shape.
- **Frame advantage:** lights −1 on block (safe), heavies −9 to −11 and
  every signature, the Bamboo Headbutt now included, −10 or worse
  (punishable: the blocker is out first and a light or a throw gets in);
  a blocked dive slam gets the whole 30-tick landing lag. A whiffed heavy
  adds 6 ticks.
- **Throw:** O+P within 2 real ticks of each other (hit-pause doesn't
  stretch it), close (touching + 520); beats a blocker, can't grab anyone
  in the air, knocked down or in hit/block stun. **Tech** with O+P in the
  first 12 ticks of the hold. Animations: Kevalanche clinch-and-shove,
  Rubberta tentacle wrap-and-fling, Johnny racquet hook, Sumaura push-out,
  K8-E neck swing (`render/puppets.js`, moves `throw` / `throwHold`).
- **Counter-hit:** a hit in the other one's startup: 125%, +8 hitstun, a
  COUNTER pop.
- **Anti-mash:** three lights in a string lock lights out for 26 ticks; the
  same light landing again within 2 s does 85 / 70 / 55%.
- **Chains and the amplified finisher:** on contact, inside 9 ticks of the
  last active frame: light → light / heavy / S+P / special, low → the same,
  heavy → S+P or the special on a full meter. A heavy / signature / special
  that finishes a true combo is amplified (132% after one link, 144% after
  two, a hard knockdown, +90 / +130 meter, a bigger spark): the HUD shows
  `N HIT COMBO` on the attacker's side and `AMPLIFIED!`. Hits after the
  third scale down 15% each. Every fighter's O → O → P is a true combo on
  every opponent (tested); bread-and-butters are in `docs/FRAMES.md`.
- **The slow-motion K.O.** (every round-ending K.O.; not a time-out): a
  6-tick hit-freeze with a white flash and a stuffing burst, then the loser
  launched up and back at 25% speed (90 ticks; 120 and higher for the
  match-winning K.O.), the time scale ramping back as he comes down, one
  bounce with a squash and a puff, flat, then the K.O. banner. It's a phase
  of the sim (`koStep`): a fixed tick count, inputs ignored, the launch in
  hundredths of a unit advanced by the scheduled scale `st.ks` each tick —
  not a render trick — so online peers see the same frames and a rollback
  across the K.O. resimulates it exactly. The renderer only reads it: the
  camera eases in and tracks the plush, the soft bodies and particles run
  at `st.ks`, the tumble is the sim's `kr`. A Fluffatality bursts at the
  top of the arc (`koapex`). `kobanner` is a flow event (fires once
  confirmed online).
- **AI:** blocks with E (Easy rarely, Hard well), guards on a guess when
  someone's in range (more against someone who never stops swinging),
  leans its guard low against a low-heavy opponent and never crouches under
  an overhead, punishes unsafe moves it blocked (a light, sometimes a
  throw), throws turtles, techs throws (Easy 10%, Hard 75%), chains O → O
  → P on contact (Hard confirms the hit first).
- **Bug fixed on the way:** a projectile carried no hit-pause, so the first
  shot to connect left `st.pause` NaN for the rest of the match — no more
  hit-pause, and buffered presses never expired (which is how mashing O and
  P apart could throw). Every shot now has its own pause.

`test/combat.test.mjs` covers all of it, including the **anti-mash test**:
a bot that walks forward mashing lights and heavies (`src/ai/masher.js`)
loses at least 70% of seeded matches to the Normal CPU (it lost 18 of 20 and 34 of 40 in
the wider run).

## Online (stage 2: bolster-online)

Mode → **Online** → **Host a match** opens a room and shows its code (5
characters, no 0/O/1/I) and a share link, `…/bolster/?room=ABCDE`, with
**Copy link**. The friend opens the link and lands on *Joining match
ABCDE…*, then both are on a shared character select: the host is Player 1
(pink), the guest Player 2 (mint); each moves only their own cursor (A / D,
O to lock in, P to change, Esc to leave) and sees the other's live. When
both are locked the host picks the seed and sends it with both fighters;
then the usual best of three. **Rematch** (either player) takes both back to
select; **Leave** ends it. Same keys on both computers. Esc doesn't pause an
online match.

```
src/net/rollback.js  the rollback session (GGPO-style): 2-tick input delay,
                     remote predicted as 'same as last', a 16-snapshot ring,
                     restore + resimulate on a misprediction, a hard stall
                     8 ticks past the last confirmed remote input, time sync
                     (the side that's ahead skips a tick now and then),
                     inputs sent redundantly (every unacked one, each packet),
                     a state hash every 60 ticks riding on every packet.
                     Events: cosmetic ones fire once per tick (keyed, so a
                     resimulation doesn't repeat them); banners / round /
                     K.O. / time / end only once their tick is confirmed.
src/net/link.js      PeerJS (bundled; WebRTC data channels — 'ctl' reliable,
                     'in' unordered) or a BroadcastChannel loopback (?net=local)
src/online.js        the screens: host / join / errors, the shared select,
                     start, rematch, leave, ping, 'Waiting for opponent (10s)'
```

Network: nothing until Online is picked or a `?room=` link is opened. Then
only the PeerJS cloud broker (`0.peerjs.com`, the handshake) and public
STUN (`stun.l.google.com:19302`) — PeerJS's built-in TURN servers are
overridden — and the peer connection itself. `npm run build` fails on any
other host, ws/stun/turn literal or URL in the bundle; `tools/online-errors.mjs`
checks in the browser that the offline modes make zero requests.

Errors: *Room not found* (bad or stale link / host gone), *Connection failed —
some office or school networks block this* (no TURN relay, so strict NATs
and firewalls can't connect) with **Try again** and **Play vs Computer**; an
opponent who goes quiet mid-match pauses it with *Waiting for opponent
(10s)*, then back to the menu. The HUD shows round-trip ping (green < 90 ms,
yellow < 180, red) and *desync* if a hash ever disagrees (`?netdebug` logs
both states and PeerJS's own trace).

Tests and tools:

```
node --test test/net.test.mjs        two peers over an in-memory link at 0–150 ms ± jitter,
                                     5% loss, skewed clocks, CPU and random inputs: hashes
                                     agree every 60 ticks, final state = a fresh sim of the
                                     true inputs, rollback ≤ 10 ticks, events exactly once
node tools/online-match.mjs [--lag 40]      two pages over the loopback: host, join by link,
                                     select, a whole match, K.O., winner, rematch, leave
node tools/online-match.mjs --broker 9000   the same over real PeerJS + WebRTC, with a
                                     PeerServer on 127.0.0.1:9000 (npm i peer; see below)
node tools/online-errors.mjs [--broker 9000] offline = zero requests; the cloud broker
                                     attempt and 'Connection failed'; 'Room not found'
node tools/online-drop.mjs           the opponent vanishes mid-match
```

A local PeerServer for the `--broker` runs: `npm i peer` somewhere, then
`ExpressPeerServer` on 127.0.0.1:9000 at path `/` (the page only accepts
`?broker=localhost:PORT` or `127.0.0.1:PORT`). The sandbox these were built
in can't reach `0.peerjs.com` (its proxy refuses), so the public broker was
verified only as far as the attempt and the error screen; real-internet
latency and NAT traversal can't be measured here.

Evidence: `shots/online/` (loopback) and `shots/online-peerjs/` (real PeerJS).

## Moves pass (bolster-moves)

- **Card portraits** were stripes under WebGPU: three's `copyTextureToBuffer`
  pads each row to 256 bytes (a 240-px portrait came back at 1024 bytes a
  row, not 960) and the readback was read as packed. `render/readback.js`
  honours the stride; portraits are 256 px wide (already aligned).
  `test/readback.test.mjs` covers padded/flipped rows at several sizes;
  `node tools/portrait-check.mjs [--shear out.png]` scores each real portrait
  (row-vs-column difference ratio, subject centred) and can draw the old shear.
- **Kevalanche's gloves**: the arm's fur mask stopped at v = 0.985 of the tube
  region, but the paw's end cap is mapped 0.985–1.0, so the fist kept full
  pile and it came out through the glove (and the face painter left the mask
  canvas in `lighter` mode). `render/gloves.js`: `shaveCaps()` masks the caps;
  the old glove tube is kept as the cuff; a padded boxing-glove mesh (~1.4×,
  thumb pad, laces, seams, glossy leather) rides the end of each arm chain.
- **Jumps**: a 3-tick crouch (`jumpsquat`), then a ballistic leap — rise
  gravity `jumpG`, a hang under `HANG_V`, a faster fall `fallG` (~48–51 ticks
  in the air, apex ~4.3 units). A forward leap clears every fighter's standing
  hurt box but K8-E's (her push box is 5.2 units tall: the neck). Landing
  re-faces both; air normals' windows were lengthened for the higher arc.
  The camera rises and eases back while someone is high.
- **Dive slam** (S+P in the air, all fighters): a 6-tick hang, a fast drop
  that's an overhead (standing block only), an impact shockwave round the
  feet if the drop missed, 30 ticks of landing lag (12 if it connected).
  Poses: double-fist hammer, tentacle splat, overhead smash, belly-flop,
  neck chop. The CPU uses it now and then (`dive` per difficulty).
- **Johnny Deuce is Dutch** 🇳🇱 ("Nog niet!").

`node tools/moves-shots.mjs [jump-johnny|jump-k8e|dives]` and
`node tools/polish-shots.mjs gloves-kevalanche` make the evidence in `shots/moves/`.

## The roster

| Fighter | Animal | From | Signature (S+P) | Special (Space, full meter) |
|---|---|---|---|---|
| Kevalanche 🇨🇦 | polar bear | Grommet's keeper, in red boxing gloves | Glacier Uppercut (anti-air, invulnerable to air attacks early) | Avalanche Rush — a charging flurry, a last hook |
| Rubberta 🇧🇷 | octopus | Flock's octopus | Tentacle Sweep (low, long) | Abraço — eight-arm grab and squeeze, unblockable up close |
| Johnny Deuce 🇳🇱 | leopard | Grommet's tennis leopard, racquet in hand | Serve (a tennis-ball projectile) | Match Point — a volley of five serves |
| Sumaura 🇬🇧 | panda | one of Grommet's sumo pandas (the champion) | Bamboo Headbutt (a flying charge) | Hundred Paw Slap ending in the Royal Squash |
| K8-E 🇨🇦 | giraffe | Grommet's ring-toss giraffe | Ring Toss (a felt-ring projectile) | Sky Neck — the neck goes up out of shot and comes down on them |

## How it's put together

```
src/
  sim/sim.js        the game: step(state, in1, in2) → state at 60 ticks/s.
                    Integers only (1000 = one world unit), the PRNG in the
                    state, no clock, no renderer. clone() / hash() for rollback.
  sim/rng.js        mulberry32 on a uint32 in the state
  sim/input.js      the 8-bit input mask (← → ↑ ↓ O P Space E)
  fighters/         per-fighter numbers: walk/jump, push and hurt boxes, every
                    move's hits (window, box, damage, level, stun, push),
                    motion, projectiles, grab; names, flags, lines
  ai/cpu.js         the computer: reads the sim (the opponent `delay` ticks
                    late), returns the same mask a keyboard would; difficulty
                    = reaction time, block/guess rate, anti-air, punish, special,
                    and per-difficulty projectile cooldown / throw chance /
                    zoning, approach and dash rates, and jumping shots (on
                    the thrower's wind-up)
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
inputs see the same thing. Stage 2's `net/` (PeerJS, rollback) uses only
the input mask per tick, `clone`, `stepInPlace`, `hash` — see *Online* above.

Rules: double-tap forward dashes in, double-tap back backdashes (a tap is
a press let go within 12 ticks; a held walk that stops and starts again is
not one); E blocks (holding back only walks; see *Combat pass*); standing
blocks high and mid, crouching blocks low and mid; jumping attacks and Sky
Neck are high (overheads); the Abraço is unblockable. Light (O) is quick,
short and weak with a fast recovery, and chains into another light, heavy,
the signature or the special on contact. Heavy (P) winds up (13–15
ticks: he rears back and loads it), then lunges — the body steps in and the
limb goes well past the jab — for more damage and a long recovery; while
the limb is out it has its own hurt box at its height, so a whiffed heavy
can be punished. The big fighters (Kevalanche, Sumaura) lunge furthest.
Projectiles (Ring Toss, Serve): one of your own on screen at a time (gone
when it hits, is blocked, passes 4500 units beyond the other fighter or
reaches the walls), 16–18 ticks of startup, 44–46 of recovery, mid height
(a jump clears it), slow (100 and 128 per tick), 4 chip on block and no
more. Match Point's volley is a special and may have five out. Frame data
for every move: `docs/FRAMES.md`. Meter fills from hits landed (90% of damage) and taken (35%), a
little on block, none from a special's own hits; tuned for about one full
meter a round. Combos scale down (a special much less). 99-second rounds, best
of three; a draw on time gives both a round. (Combo scaling, chains and the
amplified finisher are the combat pass's: see above.)

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

Arms: Grommet sews a biped's arm with its first point on the torso's
surface, so an arm turned far from its sewn pose showed its round end
standing off the body. In Bolster's copies of the rigs the shoulder socket
is sunk into the torso (`shared/grommet/athletes/standing.js: sunk`), so the
arm turns about a point inside the stuffing and always comes out of the fur
(and, for Johnny Deuce, out of his sleeve). The puppets can also stretch a
limb along itself (`ChainStretch`: links, windows and tethers scale, the
posed chain slides out) so a jab and a heavy reach their hit boxes' far
edges — check with `?boxes`.

### Bubbles

`ui/bubble.js` builds every bubble fresh as SVG: a kraft card cut as an
irregular polygon of 10–16 straight scissor cuts (uneven, with a few nicks)
reaching past the bubble with a tail cut toward the speaker, a mottled fill,
faint corrugation ribs, a darker raw edge, a soft drop shadow; on it a cream
bubble with a thick wobbly marker outline and a second sketchy pass out of
register, a halftone shadow lower right, shine ticks, and Gochi Hand lettering
with a wandering baseline and each letter turned ±2.8°. Tilted a few degrees,
slapped down (squash, settle). Cosmetic randomness uses `Math.random`.

## Palette

Neon arcade, from the logo: deep #120d1f (backdrop, menus; #1d1630 and
#2a2140 for panels and empty bar tracks), hot pink #ff3b6b for player 1,
mint #3ff0c8 for player 2, violet #9b5cff shared (special meter, selection,
highlights), white text. Text on pink or mint is #120d1f (white on #ff3b6b
would miss AA); white on the deep backdrop and panels is 15–19:1, the dim #bdb3dc 7.7–9.7:1, the pink label on the backdrop 5.5:1.
The arena is a dark floor with a violet pool of light, a felt mat bordered
pink → violet → mint, and a back wall glowing pink on player 1's side and
mint on player 2's with two neon tubes; the plush keep their own fur colours
(their lighting is their own). The cardboard speech bubbles are unchanged:
handmade props against the neon.

## Fonts

Three OFL fonts are subset and inlined (base64) by the build: Gochi Hand (the
bubble lettering — subset to exactly the characters the fighters say), Lilita
One (a few display bits — printable ASCII) and Oswald Bold (the HUD's and
menus' condensed caps — printable ASCII). They're declared as "Bolster Hand",
"Bolster Display" and "Bolster Condensed" (a modified OFL font doesn't carry
its Reserved Font Name). Licences: `src/assets/*-OFL.txt`.

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
and both spend the special. `test/polish.test.mjs`: no second shot while
one is out (and never two in a whole Hard-vs-Hard match), shots' startup,
recovery, speed and chip, a shot can be jumped clean, dashes both ways for
every fighter (and a walk isn't one), light vs heavy (startup, recovery,
damage, reach; the big ones gain the most), a heavy lands from beyond the
jab's range, a whiffed heavy's limb can be hit, Kevalanche (Normal) closes
in on K8-E (Normal) and lands hits over seeded matches, and K8-E's throw
rate on each difficulty (Normal under 8 a minute).

There is no GPU in the build sandbox: screenshots are SwiftShader, and frame
rate / WebGPU behaviour have to be checked on real hardware.
