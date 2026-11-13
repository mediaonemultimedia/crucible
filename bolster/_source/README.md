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
node tools/roster2-shots.mjs [sheet-<id>|moves-<id>]
                                 # roster 2's move sheets and move shots → shots/roster2/
node tools/online-match.mjs --p1 sebas --p2 zach --out online-roster2
                                 # two pages: names, lobby practice, then a match with the new two
node tools/sith-shots.mjs        # the Sith twins vs the originals, the racquets → shots/sith/
node tools/versus-shots.mjs      # versus on one keyboard, names, the leaderboard → shots/versus/
node tools/keys-shots.mjs         # the keyboard legend → shots/keys/
node tools/twins-shots.mjs [--lineup] # the evil twins, roster line-ups → shots/twins/
node tools/goon-shots.mjs [scene …]  # the hockey goon's evidence → shots/goon/
node tools/audio-prep.mjs            # the SFX drafts → trimmed, normalised clips (src/assets/sfx)
node tools/audio-check.mjs           # sound in the real page: gesture, mute, the match's SFX, pause, practice
node tools/audio-render.mjs          # offline captures → shots/audio/*.mp3, with peak / gap / seam checks
node tools/audio-fps.mjs             # the sound's CPU share per frame, the music scheduler's cost
node tools/fixes-shots.mjs           # the select grid OG / ALT, every card portrait → shots/fixes/
```

Headless tools use `CHROMIUM` (default `/opt/pw-browsers/chromium`) as the browser.

Open `final.html`, or deep-link straight into a fight:
`final.html?p1=kevalanche&p2=sumaura&cpu=hard` (fighter ids, or `sebasperra` /
`zachsparrow` / `johnnydeuce`; `practice=sebas&dummy=zach` opens practice; `versus=1&n1=A&n2=B` is two
players on one keyboard; `screen=board` the leaderboard; `screen=names` the name screen; `p1cpu=normal` hands player 1
to the computer too; `seed=N` fixes the match seed; `toques=1`; `webgl` forces
the WebGL 2 path; `hold` stops the free-running loop for scripted stepping;
`boxes` draws the sim's hurt, limb, hit and shot boxes over the picture).

## Fixes: card portraits, the goon's head and gloves (bolster-fixes)

- **The wrong portrait on a card** (Zach Sparrow's card showing Sumaura's
  face). Root cause: the seven card portraits are rendered at start-up, one
  fighter at a time at x = 0 in the stage's scene, a GPU readback awaited
  between each — and the title answers clicks the whole time. A player who
  went straight on to character select got the select mat's plush built
  into that same scene, unposed (the animation loop hadn't started), at
  x = 0: inside every portrait rendered after that. Zach, small and last,
  came out as whoever stood on the mat (a big panda in front of him). Then
  start-up sent the player back to the title, and the next select screen
  showed the spoiled portraits. Fixed at both ends: each portrait is taken
  with everything but the arena and its own fighter hidden
  (`render/showcase.js`, `Stage.base`), and the fighter is gone before the
  readback wait; start-up no longer yanks a player who has moved on back to
  the title, and cards already on screen get their portraits when they
  arrive (`_cardPortrait`, by the card's own id).
- **Twins' card portraits:** a card switched to ALT now shows the evil
  twin, not the OG. Each twin is framed off the select mat the first time it
  has stood there ~0.45 s (`snapSlot`, copied off the page's canvas in the
  same task: no readback, no extra plush to build), kept for the session,
  and used by the VS card too. Until then the card shows the OG.
- `test/portraits.test.mjs` (headless Chromium, on `final.html`; skipped
  without it): page A takes the portraits untouched; page B races to select
  with Sumaura on the mat; each of B's portraits must match A's for its own
  fighter (and be nearer it than any other). Then Vs Computer (every card
  OG → ALT → OG → ALT), the computer's seat, Practice and Versus (both
  seats), the mirror flip and back from a match: every card's picture is
  its own fighter's, in the variant it shows. No console errors.
- **Kevalanche ALT, no mullet:** the locks, their springs and their shader
  are gone (`Mullet`, `lockMat`, `tools/goon-probe.mjs`), and so is the
  haircut in the pile (the cropped top and sides, the long nape): his head
  is his OG's shape and short fur. The black eye and the felt tooth stay.
- **Kevalanche ALT in Edmonton colours** (`KEV.colors` in
  `render/twins.js`): the fur a navy so deep it reads almost black
  (`#0f1f40`, accent `#0b1a33`; blue enough to keep its shading and pile
  depth under the lights), the ear insides and muzzle a slightly muted felt
  orange (`#e2692c`), the nose dark (`#0b0d14`), the chest and belly navy
  (no underside hint). The bruise is a lighter plum (`#9a5aa6`) so the black
  eye reads on navy; the felt tooth stays cream. Colours only, no logos.
  Evidence: `shots/fixes/goon/navy/` (before: `navy-before/`).
- **Kevalanche ALT, hockey gloves rebuilt** (`makeHockeyGlove` in
  `render/gloves.js`): four separate fingers, each three padded rolls
  (sausages with a crease between, the little finger smaller) on little
  joints, and a separate two-roll thumb that wraps round the front of the
  fist; a thick padded back with a flex roll at the wrist; a long flared
  gauntlet cuff with a rolled orange lip and an orange band; an orange
  piping on the knuckle line; a tan-grey palm and thumb pad. Royal blue,
  colours only. The hand closes by what he's doing (the sim's `act`, read
  only): slightly open at rest, a fist to punch or throw, tight in the
  guard, loose when hit; the wrist's corkscrew closes it too, and the feel
  pass's fx may set `grip` (0…1) outright (for new grabs). Same frame as
  before (the lag, the corkscrew, the contact squash), the fist the same
  size and reach. OG Kevalanche and every other fighter are untouched;
  render only (the golden hashes still match).
- Evidence: `shots/fixes/` (`select-og`, `select-alt`, `select-versus`,
  `select-practice`, `cards`), `shots/fixes/goon/{before,after}/` (`node
  tools/goon-shots.mjs`; the new `glove-views` and `heavy-close`, `block`
  scenes: the glove front, side and three-quarter, a heavy hook's strike,
  the guard).

## Sound and music (bolster-audio)

Presentation only: no sim, frame data, hit box, netcode or balance change
(`test/audio.test.mjs`: the state hash is identical with the sound
listening, for any input sequence). Everything is in `src/audio/`.

- **Starts on the first key or click** (the browsers' autoplay rule): no
  AudioContext before that, so no autoplay warning. A hidden tab suspends it.
- **Mix:** music and SFX buses → a compressor → a limiter → out (no clipping
  however many sounds pile up); at most 14 SFX voices (4 of one sound), the
  oldest stolen with a 6 ms fade.
- **SFX** (`sfxmap.js`, `engine.js`): the owner's drafts in
  `assets/audio/` (AI SFX model; owner-approved) → `tools/audio-prep.mjs`:
  trimmed to the sound, high-passed, faded in and out, peak-normalised,
  mono 56 kb/s MP3 (decodeAudioData reads MP3 in every target browser,
  Safari included; the decoded buffer's encoder delay is trimmed so a hit
  lands on its frame) → `src/assets/sfx/`, inlined as base64 by the build
  (~41 KB of clips). Levels from each clip's measured loudness (`MIX`).
  **Used:** hit-light, hit-heavy, knockdown, land, jump, crowd-ooh,
  feather-burst (a 2 s steady roar shaped into a burst). **Not used,
  synthesised instead** (`synth.js`): whoosh (a ~50 Hz rumble — no swing on
  laptop speakers), grab, block, ui-tick, ui-confirm (steady hiss 3–18 dB
  over the floor, no event in it). A short sine thump sits under heavy hits.
- **Events → sounds:** light / heavy hits (heavy: specials, signatures,
  throws, amplified finishers, knockdowns, ≥ 62 damage), each play varied
  ±6 % pitch and ±1.5 dB (from the tick: repeatable), a counter-hit louder
  and lower; blocks; a whoosh on each attack's startup (light quieter,
  one per swing, ≥ 7 ticks apart per player); the grab on a throw's
  connect; knockdown on throw landings, knockdowns and the dive slam; jump
  and land; the K.O. = heavy hit + feather burst, the crowd's *ooh* on the
  K.O. itself (a confirmed flow event online). Menus: a tick on every
  highlight move (keyboard, mouse, select grid, OG/ALT), a confirm on every
  pillow pressed and every lock-in.
- **Rollback-safe:** sounds are driven from sim events after the tick
  (never inside it). Each is keyed (tick, kind, player, ordinal) and never
  fires twice; an event a resimulation moved ≤ 2 ticks is the same sound.
  Online the tick is read from the rollback session's log (or its snapshot
  ring, for a tick confirmed in the same advance) — read only.
- **Music, composed in code** (`music.js`: notes as data; `synth.js`: 25 % and
  12.5 % pulse leads, triangle bass, noise / sine drums; a lookahead
  sequencer on the AudioContext clock, 0.25 s ahead, a 25 ms timer plus
  every frame). Original tunes:
  - **Menu loop** — F major, 110 BPM, swung eighths, 16 bars (35 s); the
    second half adds an arpeggio and a high answer.
  - **Fight loop** — 150 BPM, 36 bars (58 s): A in D minor, B in F major (the
    tune up an octave on the thin pulse, 16th arpeggios), a 4-bar
    breakdown back to the top. **Tense** (the last 15 s, or either fighter
    under 25 % stuffing): 7 % faster, 16th hats, the arpeggio under A too.
  - **VS sting** (1.7 s), **round start** (two notes up and a crash),
    **win jingle** (4.4 s, a rising fanfare to a top C), **lose jingle**
    (a sagging muted-saw trombone, four notes down, the last one wobbling,
    then a deflating bloop).
  - Flow: menu loop on every menu; the VS card's sting; the round sting on
    'Round N'; the fight loop on 'Fight!' (it carries on across rounds);
    ducked under the K.O.; the win or lose jingle at the match's end (lose:
    the player at this keyboard lost to the computer or online, or a draw).
    The pause holds the music and picks up where it was. Practice: the
    fight loop at 35 %.
- **Controls:** the speaker in the top-right corner of every menu (click,
  or **M** anywhere — except practice, where M is the meter, and versus if
  a player rebound a key to M); on the pause card a *Sound: on/off* pillow
  and **Music** / **SFX** volume pillows (drag, or ◀ ▶ on the highlighted
  one). In the keyboard legend and the controls list. Settings in
  `localStorage` (`pillowfight.audio.v1`; private mode: the session).
- Tests: `test/audio.test.mjs` (the event map and variation; the dedupe;
  whoosh rate limit; the state hash with the sound listening; an online
  match over a laggy, lossy link where every real event sounds exactly once
  on each peer; the music's lengths and sections; settings). Evidence:
  `tools/audio-check.mjs` (the real page), `tools/audio-render.mjs` →
  `shots/audio/*.mp3` (menu loop, fight A / B / seam / tense, the four
  jingles, a 20 s CPU-v-CPU stretch with its SFX) and `captures.json`
  (peak, RMS, longest quiet run, the seam), screenshots
  `shots/audio/*.png`; `tools/audio-fps.mjs`.

## The hockey goon, refined (bolster-goon)

(The mullet and the first hockey gloves below were replaced in
bolster-fixes, above.)

Kevalanche's ALT only (his OG, every other fighter and the feel pass's
animation are untouched). Render only: no sim, frame data, hit box, netcode
or balance change; the golden hashes in `test/feel.test.mjs` still match.

- **A black bear** (superseded by the Edmonton recolour above; `render/twins.js`, `KEV.colors`): near-black brown fur
  (`#20100a`, warm enough to keep its shading and depth under the lights),
  a tan muzzle like a real black bear's, the chest and belly dark too (a
  hint of the old underside left). The fur's white strand highlights greyed
  a pile this dark, so the fur material has a `gloss` uniform (1 for every
  other fighter; 0.4 here; `shared/CHANGES.md`). The bruise is a lighter
  plum so the black eye reads on the dark fur; the felt tooth is a touch
  bigger.
- **Hockey gloves** (`render/gloves.js`, `makeHockeyGlove`): chunky plush
  felt in royal blue and orange (colours only: no logo, crest, name or
  number). Four padded finger rolls curled over the knuckles, each in three
  puffs; a padded back of the hand; an orange piping roll on the knuckle
  line; an orange palm; a thumb in two puffs; a short padded bell cuff with
  an orange band and a fat roll at the wrist (closed inside the arm, so no
  fur shows through). Same frame as the boxing glove, so they follow the
  wrist corkscrew, the lag and the contact squash; built in true proportions
  (`HY`: the length scale matched to the width at rest) and the same
  envelope at the fist, so his reach reads the same. The cloth cuff tube on
  the forearm is blue with an orange trim. The white tape is gone.
- **A real mullet** (`Mullet` in `render/twins.js`): the top and sides
  cropped short, the back of the head cropped under the locks; nine soft
  plush locks from under the crown down the nape to the shoulders (the
  side ones shorter), each a wavy S (alternating lock to lock), fat in the
  middle, tapering to a rounded tip flipped out and up. Each lock is drawn
  as short shell fur (14 shells, its strands in rows spiralling round it like
  a curl; dark roots, frosted tips). It rides the head's own frame and lags
  it on a render-only spring driven by its tip's acceleration (the strike, a
  hit, the landing, the walk's bob and sway) and by gravity when the head
  tips (hit, K.O.), the bend growing toward the tip. Every frame each lock
  is pushed out of the torso and the skull (ellipsoids padded for the fur),
  so it never clips his shoulders or back.
- Checks: `node tools/goon-probe.mjs` (a 40 s Hard-v-Hard goon mirror: no
  NaN, no lock point inside the torso, the springs' spread, the mullet's
  cost per update ≈ 0.5 ms on the sandbox). Evidence: `node
  tools/goon-shots.mjs [--html F] [--out D] [--q Q] [scene …]` →
  `shots/goon/before`, `shots/goon/after` (head front and three-quarter
  back, gloves, idle, heavy, hit, K.O., walk, the locks through a heavy and
  a jump, next to the OG and to Rubberta), `shots/goon/feel-old/`
  (`?feel=old`), `shots/goon/online/`.

## Model pass: the wolf rebuilt, the crow's tail, two muzzles (bolster-models)

Render only: no sim, frame data, hit box, netcode or balance change (the sim
files are untouched; hashes, rollback and online unchanged). Kevalanche,
K8-E and Rubberta are untouched (the benchmark).

- **Sebas Perra, rebuilt** (`render/wolf.js`) to the owner's reference
  (`assets/refs/wolf-plush-ref.png`): a standing plush on Kevalanche's
  anatomy (Grommet's `standingBody`, the same fur and soft body) instead of
  Flock's sitting wolf. A big round head as wide as the body; a short
  rounded cream muzzle with a small dark sewn-on nose; glossy bead eyes set
  wide; tall pointed ears (grey, cream inside, dark tips); soft grey cheek
  ruffs (short free chains that lag a turn or a hit); grey on top, back and
  limbs, a cream face, chest-and-belly oval, paw ends and feet; short stubby
  arms sunk into soft shoulders, resting low and forward (`READY.lucha`);
  short legs; a big bushy tail curling up behind him, grey with a cream tip
  (it lags and wags: Grommet's Athlete). The luchador mask is the same
  painting (`render/masks.js`) with its eye holes moved to the new eyes: it
  wraps the skull and leaves the ears and muzzle free. The evil twin's felt
  sash (`render/attire.js`) is re-laid on the new torso (shoulder to hip,
  across the chest). Moves, name, voice unchanged; Flock's `buildWolf` is
  no longer used (the shared copy is untouched). The card portrait is
  reframed for the taller head (`render/showcase.js`).
- **Zach's body into his tail** (`render/crow.js`): Grommet's crow with a
  new back end. The rump and flat tail ellipsoids (a step and a stick-like
  join) are replaced, as drawn, by one teardrop laid from the chest down to
  the tail, and a fan of five layered plush feathers growing out of its
  point (free flat chains rooted inside it: they lag hops, hits and turns,
  and the middle one wags). The old rump and tail stay as stuffing, so he
  stands and falls the same. Wings and their felt primaries untouched
  (bolster-polish's).
- **Sumaura's and Johnny's muzzles** (`render/muzzles.js`, OG and ALT): the
  muzzle grid reshaped (panda short and broad; leopard a short cat's
  muzzle) with a short tidy pile that lengthens toward its back edge so it
  blends into the face; the head's pile cut short round the seam so no face
  fur pokes over it; the old marks cleared; a sewn-on felt nose (panda a
  black rounded pad, leopard a pink-brown cat's triangle), a small stitched
  mouth, the leopard's whisker pads (a groove between) with three fine
  whisker dots each.
- Evidence: `node tools/models-shots.mjs [wolf|wolf-head|wolf-play|crow|muzzles|compare]
  [--html F] [--tag before|after]` → `shots/models/` (before shots from the
  previous build; `compare-*.png` side by side, the wolf next to the
  reference), `node tools/twins-shots.mjs --lineup` → `shots/twins/lineup-*.png`.

## UI personality pass (bolster-ui)

Cosmetic only: nothing reaches the sim, its hash, frame data, hitboxes,
rollback or balance (`test/taunt.test.mjs` runs seeded and random input
sequences with and without the taunt watcher: identical hashes).

- **Pillow buttons** (every `.opt`): a soft plum cushion with a dashed
  stitched seam, a sheen on top and a thicker bottom lip. The highlighted one
  (keyboard or mouse: pointing at a pillow selects it, so there's only ever
  one) puffs up a little with a neon rim; pressed, it squashes onto its lip
  and springs back (60 ms in, 160 ms out; a keyboard press squashes it too).
  Same labels, layout and keys. Danger (Reset leaderboard) glows pink.
- **Taunting captions** (`ui/taunt.js`): the arena roasts a player who
  mashes (presses on through the anti-mash lock-out: three light presses
  inside one lock), spams one move (the same non-light move four times in a
  row inside 6 s), turtles (4.5 s of unbroken guard) or whiffs a special
  (nothing hit, blocked or grabbed 100 ticks after it began). 20 lines, all
  under 40 characters, in a small cardboard bubble beside the player's head,
  always under the HUD. Rare: one per player per 10 s, 7 s between any two,
  a line never repeats in a match; ~1–3 in a whole CPU match. Not in
  practice. The watcher only reads the state after each tick; **online** it
  reads only *confirmed* ticks (both inputs known, from the rollback
  session's snapshots), and the line comes from that state (tick, seat,
  kind, the PRNG word — read, never drawn), so both peers show the same
  caption on the same tick (checked in `test/taunt.test.mjs` over a lossy,
  laggy link and by `tools/online-match.mjs` across two pages).
- **VS card** (after character select — Vs Computer after the difficulty,
  Versus, Online; not on Rematch or deep links; `novs` turns it off): the
  two picks crossed in the middle in pink / mint frames, a big VS, the names,
  OG + animal or ALT + the twin's title, and each named player's wins from
  the leaderboard. The portraits are the picks as they stood on the select
  mat (so twins are twins), drawn onto the page's canvas and copied out in
  the same task (no readback wait). 1.5 s; any key or a click skips. Offline
  the fight waits at tick 0 under it; online nothing waits — the sim runs
  on under the card (it stands in for the 'Round 1' banner) and it's gone
  after 1.05 s, before 'Fight!'.
- **Loss moment:** on the match's `end`, the loser's side of the screen
  drains to a desaturated red (a backdrop filter) and their plush slumps
  (a partial deflate; a Fluffatality's full one is kept), then the winner
  screen as before (quote, record, Fluffless / Fluffatality untouched). The
  prompt is now **Rematch? YES / NO** in pillows (YES mint, NO pink; online
  NO is *leave*).
- Evidence: `node tools/ui-shots.mjs` → `shots/ui/` (buttons idle / hover /
  pressed, four taunts, the VS card, the loss drain, the rematch prompt);
  `node tools/online-match.mjs --lag 40 --out ui/online`.

## The feel pass: Kevalanche (bolster-feel)

The owner: *"it would be nice to have that powerful ease-in and then strike
on some of the attacks … maybe some of our rigs need to be a little more
intricate."* A pilot on **one fighter, Kevalanche (OG and ALT)**; the rest
are untouched. **`?feel=old`** plays him with the previous animation, to
compare (e.g. `final.html?p1=kevalanche&p2=johnny&feel=old`).

- **Rig** (`render/feel.js`, `BoxerFeel extends BipedPuppet`): elbows (each
  arm chain bends at two particles, a rounded joint, folding up for the
  guard and the wind-up, in for a hook); a spine twist (the upper body turned
  about the vertical, weighted up the torso: hips 0, shoulders and arms 1,
  head 0.45); the hips are the balance servo's own twist, so the hips lead
  and the chest and arm follow; knees (a sink: the body lowered over the
  knees, the knees forward); wrists (the glove rolls about the forearm — a
  corkscrew to palm-down — and lags its arm on a spring, `render/gloves.js`).
  All pose-side: the same particles, fur and gloves, so no new seams or joints
  to show. The lead hand is the one nearer the opponent, whichever way he faces.
- **Three beats, inside the frame data** (startup / active / recovery are the
  sim's, unchanged): an eased coil over the startup (weight back, the hips and
  the shoulder turned away, knees in), a 2-tick fire ending just before the
  first active frame (stiff springs: hips, then chest, then the arm, a stretch
  along it and a velocity kick on the fist), then an overshoot and a settle on
  underdamped springs. The render's place between two ticks is used, so the
  strike is smooth on 120/144 Hz screens too. Light attacks small and snappy;
  the heavy hook, Glacier Uppercut and Avalanche Rush (each flurry punch, then
  a wound-up last hook) big. Walk (hip sway, knee bob), jump (squat, tuck,
  landing sink), block (a tight shell, a recoil), hit (a whip back, knees
  buckle, loose arms on soft springs), K.O. and win/lose use the same rig.
- **Secondary:** velocity kicks on the ears, belly and fists at the strike,
  the contact and the landing; the stuffing carries them through. (No separate
  fur-strand sim: the fur rides the stuffing, as before.)
- **Impact (render only):** his glove squashes on contact; the one he hits
  gets a crunchy squash (`Plush.crunchBy`, an anisotropic scale on a stiff
  underdamped spring); a big blow knocks the camera along it (`Stage.nudge`).
  Hit-stop is the sim's own `st.pause` and is unchanged; during it his springs
  hold (the stuffing still wobbles).
- `test/feel.test.mjs`: golden sim hashes for 16 seeded input sequences
  (recorded on bolster-source before this pass) still match; posing him every
  tick never changes the state hash; `?feel=old` gives the old puppet; every
  move keeps the soft body together. `tools/feel-probe.mjs` (node: fist reach
  and height per tick, old vs new). Evidence: `node tools/feel-shots.mjs
  [--html F] [--q '&feel=old'] [--out D] [--clips] [scene …]` →
  `shots/feel/before`, `shots/feel/after` (every move, plus walk, jump, block,
  hit, K.O.), `shots/feel/compare-*.png` (before over after),
  `shots/feel/clips/side-by-side-{jab,heavy,uppercut}.gif` (every tick, half
  speed), `shots/feel/alt/` (the hockey goon), `shots/feel/feel-old-check.png`
  (`?feel=old` against the old build), `shots/feel/online/` (an online
  Kevalanche ALT match over two pages, in sync). `node tools/feel-fps.mjs`:
  the game's CPU time per frame in a CPU match, feel vs `?feel=old`.

## OG / ALT, practice keys, twin polish (bolster-polish)

- **OG / ALT on character select** (`ui/variant.js`): every fighter can be
  picked as the original or the evil twin, in every mode; the grid stays 7
  cards. The highlighted card carries an OG | ALT switch (W / S or ↑ / ↓;
  versus: each player's own jump / crouch keys; or click it); the preview
  swaps live, the card and plate show the twin's title (Hockey Goon,
  Anglerfish, Sith Ace, Tuxedo Villain, Punk, El Rudo, Ghost Pirate).
  Mirror rule: same fighter and same variant → the second seat flips.
  Vs Computer: the computer's seat starts ALT on a seeded coin (35 %).
  Each seat's last variant per fighter is remembered for the session.
  Online: `cur` / `lock` carry `v` (0 / 1), the host's `start` carries both
  resolved variants. Cosmetic only — never in the sim, its hash or
  rollback (`test/variant.test.mjs`). Deep links: `alt1=1`, `alt2=1`.
- **Practice keys panel:** the one-player keyboard (main block + arrows,
  live bindings) in the right column under Combo; **K** hides / shows it
  (default on); H still hides every panel.
- **Evil Sebas:** hood and cloak gone; the rudo mask, red eyes and colours
  kept; a black felt sash with crimson rolled edges and a stitched seam,
  re-laid on the torso's skin every frame (`render/attire.js`, needs only
  the `torso` grid, so it carries over to the wolf remodel).
- **Evil Johnny:** hood and cloak gone; black tennis whites (red cuffs,
  hem and ball) and a red terry headband (`shared/CHANGES.md`: cloth
  `band`); dark fur, red eyes, red racquet kept.
- **Zach's wings (OG and ALT):** folded and tucked against his sides at
  rest; the drawn wing tapers from a broad wrist to a point; its flat axis
  turns with the pose; four layered felt primaries at each tip lie along
  the folded wing and fan open as it opens (attacks, jump, block). Body
  and tail untouched.
- Evidence: `node tools/alt-shots.mjs`, `node tools/wing-shots.mjs`,
  `node tools/twins-shots.mjs --out shots/polish/after sebas johnny zach`,
  `node tools/online-match.mjs --p1 sebas --p2 johnny --alt 2 --out polish/online-alt`
  → `shots/polish/`; before shots in `shots/polish/before/`.

## Keyboard legend and new evil twins (bolster-keys)

### The keyboard legend (`ui/keymap.js`)

A small full-size keyboard (main block, arrow cluster, numpad) in inline
SVG; only the keys in use are lit, **P1 hot pink, P2 mint**, each with its
action on the cap (Move ◀ ▶, Jump, Crouch, Light, Heavy, Block, Special),
and a line for the combos (Throw = Light+Heavy, Dash = double-tap Move,
Signature = Crouch+Heavy, Dive slam = Crouch+Heavy in the air, Low block =
Crouch+Block). It is drawn from the live bindings, so a rebind redraws it.

- **Versus:** both players on one keyboard, on the select card and the
  pause card. Click a lit key, press the new one (Esc cancels); Reset keys.
  A key bound off the drawing (F5, say) or an action left unbound is listed
  under it as a button.
- **Vs Computer / Practice / Online:** the one-player keys (W A S D, O P E,
  Space and the arrows) in pink; on the pause card above the move list.
- Wide and tall enough (≥ 980 × 600): the picture; narrower: the old text
  list (unchanged). No title-menu Controls button (optional; not done).
- `test/keymap.test.mjs`: every bound key of the versus defaults, the solo
  layout and rebound layouts is a key on the board, lit in its player's
  colour with its action; nothing else lit; strays listed.
- Evidence: `node tools/keys-shots.mjs` → `shots/keys/`.

### The new evil twins (`render/twins.js`)

Evil Sebas (the rudo's mask) and Evil Johnny (red racquet, cowl) keep their
Sith looks. The other five get their own, built the way the octopus is:
the look is in the plush itself (fur colours, pile length and lie, printed
pattern and stitching in the atlases); the few worn things are felt,
leather or metal riding the soft body's points each frame.

- **Kevalanche, hockey goon:** (refined in bolster-goon, above) a black
  bear with a tan muzzle (no mullet since bolster-fixes); a bruised black
  eye; plush hockey gloves in royal blue and orange; one felt front tooth
  with a gap. The Sith cowl, cloak and patch are gone.
- **Rubberta, anglerfish:** abyss-black flock, glowing photophores (a `glow`
  uniform on the fur's spots: `shared/CHANGES.md`), glowing rings round the
  eyes, a grimace of needle teeth embroidered in pale thread, a felt lure
  arching over her face with a glowing bulb on a thread that swings.
- **Sumaura, Bond villain:** inverted panda (black fur; white eye patches,
  ears and limbs), a tuxedo printed on the chest (white shirt front, black
  bow tie and studs, satin lapels, pocket square; the mawashi a black satin
  cummerbund), a rose scar with cross-stitches across one eye patch. *The
  tiny white cat was dropped* (couldn't be made to plush quality); the
  shirt front is mostly behind his guard in play.
- **K8-E, punk:** charcoal with near-black patches; a neon magenta mohawk
  (the neck mane grown long, running up over the head to the forehead), a
  spiked leather collar, a stitched handlebar moustache, a septum ring and
  ear hoops. (She had no piercings or moustache before; these are new.)
- **Zach Sparrow, ghost pirate:** bleached white feathers, glowing red
  eyes, bone-grey beak, a tattered matte felt tricorn (notched brim, one
  tear). The bandit mask and gold chain are gone.

Render only: nothing reaches the sim (hashes, rollback, online unchanged).
Evidence: `node tools/twins-shots.mjs [--lineup] [ids]` → `shots/twins/`
(close-ups, gameplay, mid-attack, signature, hit, K.O.; `lineup-roster.png`
and `lineup-twins.png` for the owner's quality review).

## Sith twins, versus on one keyboard, names and a leaderboard (bolster-sith)

### The Sith twins (cosmetic only: `render/sith.js`)

A mirror match's player 2 is the evil twin; three of them are now the dark
side of the original, and every original swings like a Jedi.

- **Sith Johnny Deuce** swings a red racquet modelled on the owner's
  reference (`assets/refs/`): glossy red lacquer frame, red strings with a
  big white stencilled W-style mark (stencil bridges left open; no brand
  text), a black-and-red striped throat with a small white badge, a black
  grip. It hums: an additive red glow round the frame that shimmers along it
  (noise scrolling on app time) and throbs. His swing trail is red.
- **The Sith layer** (Johnny, Sebas Perra, Kevalanche): a dark wool cowl
  over the head — an oval face window cut out, folds at the back, the ears
  through it, a crimson inside — and a cloak from the shoulders round the
  back and sides, open at the front, lined in crimson; a thin red rim light
  on both. Eyes glow red (additive, flickering; drawn past the muzzle fur).
  Each keeps his identity: Sebas the rudo's black-and-red mask (the red eye
  glow sits in its eye holes), Kevalanche his black gloves and a new **eye
  patch** with a red-hot edge (on the eye nearer the camera; the other
  glows).
- **Layers or replaces?** It *layers* on the existing evil look (colours,
  rudo mask, gloves). PR #28's cowboy hat / bandana / eye patch were only
  planned ("not done"), never built — so there was nothing to replace; the
  Sith cowl takes the hat's place (a hat over a hood reads as neither), and
  the eye patch was kept from that plan for Kevalanche. The monocle is off
  for the Sith three.
- **Trails for everyone:** red for any evil twin, a cool blue-white for
  every original (Jedi vs Sith). The trail follows the part of the plush
  that hits: on a move's first active frame the soft-body point nearest the
  sim's active hit box is found and traced back through the last 8 frames
  (so the wind-up's arc is in it), then followed to 5 ticks after the last
  active frame; Johnny's follows his racquet head through every swing. An
  additive camera-facing ribbon, white-hot core, tapering and fading.
- Nothing reaches the sim: hashes, rollback, replays unchanged.

### Versus — two players, one keyboard (`input/layouts.js`)

Mode → **Versus** (2 players · 1 keyboard), built for a full-size keyboard
with a numpad.

| | Player 1 (left half) | Player 2 (arrows + numpad) |
|---|---|---|
| walk / jump / crouch | A D · W · S | ← → · ↑ · ↓ |
| light | **G** | **Num 4** |
| heavy | **H** | **Num 5** |
| block | E | Num 6 |
| special | Space | Num 0 (or Num Enter) |
| throw | G+H | Num 4+5 |

- **Why G/H (not V/G):** O and P moved eight keys left, still side by side
  with light on the left — so the throw is the same two-finger roll and
  muscle memory carries over; P1's right hand sits at G/H with the thumb on
  Space, well clear of P2's left hand on the arrows. V/G (the owner's idea)
  is one click away: every key on the versus card can be rebound (click a
  key, press the new one; a key taken from the other player leaves them;
  Esc/Enter/Tab/modifiers refused; saved on this device; **Reset keys**).
- **One-player, practice and online keep W A S D + O / P / E / Space.**
- **Ghosting:** cheap membrane keyboards drop some three-key chords on the
  letter block. Player 2's arrows and numpad usually sit on their own matrix
  lines (the safer side); player 1's are the usual gaming cluster (W A S D,
  E, Space) plus G/H. Matrices differ per board, so this is a likelihood,
  not a guarantee, and it couldn't be tested here (no physical keyboard) —
  if a key drops out on Kevin's board, rebind it on the card.
- Select: both pick at once (P1 A/D + G to lock, H to change; P2 ←/→ +
  Num 4 / Num Enter, Num 5); the mouse picks for whoever hasn't locked;
  mirror = Sith twin for P2. Both layouts on the select screen (compact) and
  the pause card. Esc pauses.
- `Fight` takes a second keyboard (`keyboard2`) for player 2; each
  `Keyboard` has its own map and tracks keys by code (two keys on one bit,
  Num 0 and Num Enter, don't let go of each other), ignores typing in a text
  field. Deep link: `?p1=sebas&p2=kevalanche&versus=1&n1=Sebas&n2=Kevin`.

### Names and the leaderboard (`ui/players.js`)

- Before vs Computer (one name), Versus (two: player 1 then player 2) and
  Online (yours; also when a friend opens a room link) the **name screen**:
  the names used on this device, most recent first, each seat's last one
  pre-selected (Enter and go), **＋ New name** (type, Enter) or **No name**
  (not recorded). First time: straight to typing. 1–16 characters; the same
  name can't sit in both seats. Practice: no names.
- Names show on the HUD (a tag above each fighter's name; `CPU · normal`
  for the computer), on the select plates, and on the win screen
  (*"Kevin wins"*, plus each player's record: *"Kevin 6–2 · 3 in a row"*).
- **Leaderboard** (mode menu): per name — W, L, D, win %, current and best
  streak, **Fluffless** rounds (a round won with no stuffing lost), wins–
  losses against people (versus and online), favourite fighter (most
  played). Most wins first. Titles: *Big Pillow* (top), *Professional
  Cushion* (most losses), *On a Tear* (3+ streak), *Untouched Upholstery*
  (3+ Fluffless). **Reset leaderboard** asks twice (the second press within
  4 s); names are kept.
- Storage: `localStorage` only (`pillowfight.names.v1`,
  `pillowfight.board.v1`, `pillowfight.versusKeys.v1`); no service, no
  requests. Private mode / blocked storage: works for the session.
- **Online:** each side sends its name on the existing PeerJS control
  channel (`{t:'name'}`), never in the sim; both devices record the match
  under both names (each its own copy).

Tests: `test/versus.test.mjs` (no key on both sides, every action bound,
the layouts, rebinding never makes an overlap and refuses reserved keys,
persistence and fallbacks, two `Keyboard`s on one target each hearing only
their own keys, held keys by code, typing ignored), `test/players.test.mjs`
(cleaning, the MRU list and each seat's last, a versus match for both
names, vs CPU for the person only, draws, one name in both seats, broken
storage, standings and titles, reset).
Tools: `node tools/versus-shots.mjs` (the name screen, both pick at once,
real key presses moving only their own fighter, names on the HUD, a finish,
the board, the reset's confirmation, rebinding in the pause card),
`node tools/sith-shots.mjs` (duels, close-ups, the racquets),
`node tools/online-match.mjs` (now types a name on both pages and checks
the HUD, the winner by name and both boards).
Evidence: `shots/sith/`, `shots/versus/`, `shots/online-sith/`.

## Roster 2 and practice (bolster-roster2)

Two new fighters, seven in all, and a practice mode.

| Fighter | Animal | From | Signature (S+P) | Special (Space) | Dive slam | Throw |
|---|---|---|---|---|---|---|
| Sebas Perra 🇲🇽 | wolf | a standing plush wolf (bolster-models: `render/wolf.js`; was Flock's wolf, front legs freed as arms); a luchador's mask | Lobo Slide — a low baseball-slide kick, a knockdown | Aullido de la Luna — the full moon behind him, a howl that blasts up close (mid) and a shockwave that rolls along the mat (low) | Moonsault (a backflip, a body splash) | Huracanrana (a hop, a flip, the toss) |
| Zach Sparrow 🇨🇦 | crow | Grommet's crow, felt beak and all (the fixed beak and wings of #20/#24/#25) | Bottle Cap Flick — a shiny cap, one on screen at a time, with #27's limits (16 startup, 44 recovery, 120/tick, chip 4) | Murder Most Fowl — seven crows sweep across from behind him, high and low | Dive Bomb (beak first, on a slant: `diveX`) | Peck & Toss |

- **Sebas**: an agile middleweight (1030 STUFFING, walk 58/46, a high jump he
  somersaults through). His lines are Spanglish trash talk — *"Rápido next
  time, bitch!"* (4 in 5) / *"Who's the perra now, huh?"*; impatient:
  *"Espérate! Not yet!"*. Evil twin: a darker wolf in the rudo's black-and-red
  mask, the flames sharpened into horns.
- **Zach**: a light, quick thief (960, walk 64/52) with a floatier jump (a
  little more hang: 54 ticks in the air, the others 48–51; the same rules).
  *"Finders keepers, loser."* / *"Arre yaar, my mother-in-law hits harder
  than you."*; impatient: *"Not yet, bud."*. Evil twin: an ash-grey crow in a
  black bandit's mask and a stolen gold chain.
- Both: a full set (light/heavy/low/air, signature, special, dive slam,
  throw, E-block, chains; O → O → P a 3-hit true combo on everyone, amplified),
  AI at every level (the generic CPU; Zach zones as a shooter, Sebas slides
  from range), card portraits, the slow-motion K.O. launch and Fluffatality,
  toques (the wolf's ears splay out under the brim), nap time, mirror
  matches. Frame data: `docs/FRAMES.md`; balance: `docs/BALANCE.md` (Normal,
  every pairing within 65/35).
- **How they're built** (`render/puppets.js`): `WolfPuppet` and `CrowPuppet`
  are bipeds on Grommet's Athlete like Kevalanche. The wolf was Flock's rig
  with `buildWolf({ fighter: true })` (front legs out of the torso's cloud,
  named as the arms); since bolster-models he is `render/wolf.js`, a
  standing plush on Kevalanche's anatomy; the crow's beak
  is `crowprops.js`'s two mandibles riding the head's shape-matched frame,
  opening for pecks, caws and wins. `acro(F)` turns the whole plush in the
  screen's plane for the flips (render only; the sim's boxes don't turn).
  The masks are painted into the fur's pattern atlas (`render/masks.js`),
  the pile cut short under them so they read as satin.
- Select: seven cards (`clamp(84px, 9.6vw, 136px)`), names in full at 1280×720;
  the plates sit below the controls strip.

### Practice

**Practice** on the mode menu: pick any fighter, then any dummy (the same
one is the evil twin). Also in the **online lobby**: while the host waits for
a friend (and while a guest connects), they practise with their last-played
(or selected) fighter; the room card moves to the corner (C copies the link,
Esc leaves). When the other player connects, practice ends and both go to
the shared select.

- Dummy panel (`1`–`6`): Stand, Crouch, Jump, Block (E), Block low, Random
  block (a fresh guess — stand, crouch or none — at each attack); `R` refill
  after each combo, `M` meter held full, `X` reset positions, `H` hide the
  panels. Clickable too.
- Helpers: the input display (recent masks as icons, run-length frame
  counts), the combo readout (hits, damage, AMPLIFIED!, COUNTER, best), a move
  list for the fighter (light, heavy, low, signature, special, dive slam,
  throw, block, dash, the bread-and-butter).
- `src/practice.js` is pure (the dummy, `practiceAfter`, the readouts): an
  ordinary sim match with the intro skipped, the clock held, STUFFING never
  below 450 (no K.O.), tended between ticks — never inside the sim. Local
  only: its own seed from `Math.random`, nothing sent, nothing kept; the
  online match's seed comes from the host's `crypto` as before.
  `test/practice.test.mjs` covers the dummy modes, refill/floor/meter, the
  readouts, and isolation (a match played after any amount of practice is
  identical); `tools/online-match.mjs` checks in two pages that the lobby
  practice ran, ended on join, and that both peers' match starts from the
  fresh state for its seed (`matchStart.hash === freshHash`).

Tests: `test/roster2.test.mjs` (every new move connects; Lobo Slide is low;
the howl's wave crosses the stage and can be jumped; the cap's limits; the
murder's seven crows; dive slams as overheads; both throws and techs on
everyone; O → O → P on everyone; determinism and rollback; the CPU at every
level; a balance sample), `test/net.test.mjs` (two peers with the new two over
a lossy link), and the existing suites with seven fighters.

Evidence: `shots/roster2/` (move sheets and shots), `shots/online-roster2/`
(the lobby practice and a Sebas v Zach match over two pages), `shots/`
(`select-roster2`, `select-laptop`, `fight-sebas`, `fight-zach`,
`mirror-sebas`, `mirror-zach`, `winner-sebas[-egg]`, `winner-zach[-egg]`,
`practice-menu`, `toques-roster2`, `ko-sebas`, `ko-zach`, `fluffatality-*`,
`impatient-sebas`).

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
| Sebas Perra 🇲🇽 | wolf | a standing plush wolf, a luchador | Lobo Slide (low) | Aullido de la Luna — the moon, the howl, a rolling shockwave |
| Zach Sparrow 🇨🇦 | crow | Grommet's crow, a thief | Bottle Cap Flick (a projectile) | Murder Most Fowl — a swarm of crows |

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
