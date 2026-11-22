# DOWN HILL: a Pillow Fight kart racer. Stage 1 of 2 (Kevin-approved, Sat Nov 21)

An ORIGINAL arcade kart racer starring the Pillow Fight 2 plush cast. It's the same genre as the big console kart games, but every name, item, track, UI and look must be our own. Do not copy any existing game's items, item names, track designs, HUD, music or logos.

- **Working title:** DOWN HILL (a pun on down feathers). Use "a Pillow Fight kart race" as the subtitle.
- **Repo:** https://github.com/mediaonemultimedia/crucible
- **Source branch:** `kart-source`. Source lives in `down-hill/_source/`; this spec is at `down-hill/_source/docs/stage-1.md`.
- **Ships as:** the single built file `down-hill/index.html`. Live at https://mediaonemultimedia.github.io/crucible/down-hill/
- **Reference code:** `kart-source` was branched from `pf2-source`, so `pillow-fight-2/_source/` is right there. COPY what you need into `down-hill/_source/` (the plush models, materials and accessories, the OG/ALT twins, the audio engine, synth SFX, music, fonts, the neon arcade CSS, the build tool with its no-network gate, and the check and shots tooling). Never import across folders. Never edit `pillow-fight-2/` or `bolster/`.
- **Pillow Fight 2's file layout is a good model:** `npm run build` produces one self-contained HTML file, `tools/check.mjs` and the shots tools run in the real page, and tests use `node --test`.

## PUSH EARLY
Usage limits have killed runs before they pushed. Commit and push `kart-source` after every numbered item below, and keep a README status table current. Stage 2 resumes from your pushes.

## Build, in priority order

### 1. Karts and the cast (8 racers)
All 7 fighters, each with an OG and an ALT (14 looks). The ALT twins also let two people pick the same fighter. Each fighter is seated in a kart themed to them:

| Fighter | Animal / nation | Kart | Weight |
|---|---|---|---|
| Kevalanche | polar bear, hockey goon, 🇨🇦 | A stubby ice-resurfacer cart; drifting sprays snow | heavy |
| Sumaura | panda, sumo, 🇬🇧 | A squat red double-decker bus kart | heavy |
| K8-E | giraffe, 🇨🇦 | An open-top racing-stripe roadster, with her neck way up out of the top | medium |
| Sebas Perra | wolf, luchador, 🇲🇽 | A lowrider that bounces on hydraulics on TAUNT | medium |
| Rubberta | octopus, capoeira, 🇧🇷 | A tin washtub on wheels; tentacles flail and paddle | light |
| Johnny Deuce | leopard, tennis, 🇳🇱 | A tennis-ball-machine kart that fires balls out the back when boosting | light |
| Zach Sparrow | crow, thief, 🇨🇦 | A stolen shopping cart piled with shiny junk | light |

- ALTs re-skin the kart to match the ALT outfit (the goon, El Rudo, the ghost pirate, the punk, padel laser, deep sea, art-deco casino).
- Weight changes top speed, acceleration, handling and how hard you bump others. Keep it subtle; any pick can win.
- **PERFORMANCE IS A HARD RULE.** Kevin already sees occasional lag in PF2 with only 2 fighters. Build a LIGHT racing version of each plush (fewer segments, no softbody or fur sim, baked or simple materials, a tiny idle and steer-lean rig), plus a lower LOD for karts far from the camera.
  - 8 karts must hold 60 fps on a mid laptop.
  - Measure frame cost in `tools/check.mjs` and report the numbers in the PR.
  - The plush look and faces must still read clearly at race-camera distance. Hold each fighter to the PF2 likeness bar; compare screenshots side by side.

### 2. Driving feel (this is what matters most)
- **Arcade handling:** a chase camera with a speed FOV kick, light drift on corners, and bump-and-grind contact between karts. Nobody gets stuck on walls.
- **Drift boost:** hold DRIFT while turning to slide, and keep sliding to charge 3 spark tiers in OUR colours: white feathers, then gold, then mint. Release to boost. Small counter-steer wiggles charge it faster.
- **Ramps and tricks:** press TAUNT in mid-air to do a trick. The fighter does a showy taunt pose, plays their trash-talk line and gets a landing boost. Kevin loves the taunting, so make it feel great.
- **Boost pads:** feather-burst pads on the track.
- **Off-track:** you slow down on carpet fluff, spilled cereal and similar surfaces.
- **Falling off:** fall off the course and a dangling sock on a string fishes you back on.

### 3. Items (original, pillow-fight flavoured)
Items come from gift-wrapped pillow boxes floating over the track. You hold one item at a time, and the odds depend on your place (rear racers get the good stuff).
- **Feather Slick:** drop it behind you. Anyone who drives through spins out in a feather cloud.
- **Pillow Missile:** thrown straight ahead (or backward while LOOK BACK is held). It bounces off walls and bonks the first kart it hits.
- **Espresso Shot:** a big speed boost with jittery steering.
- **Fuzzy Handcuffs:** this is Kevin's idea. They fly to the 2 racers just ahead of you and chain them together for 4 seconds, so they drag and swerve each other.
- **Pillowcase:** thrown forward, it lands over a rival's head. For ~2.5 seconds their steering goes wobbly and their view gets a soft fabric vignette.
- **Alarm Clock:** our catch-up item. It homes in on 1st place and rings, a cartoon alarm-clock jump-scare. The leader spins out and racers next to them wobble.
- Every hit has a big readable reaction: a feather burst, a squash, and the fighter's hurt grunt.

### 4. Track 1, "The Landing"
A huge kid's bedroom and upstairs hallway, seen at plush scale. It's a single looping circuit, 3 laps of about 50 to 60 seconds each.
- **Route:** start on the duvet, jump off the bed onto a ramp made of a book stack, cross the rug, go under the bed (dark, with dust bunnies), and do a banister drift section along the landing rail. Then slalom through a sock drawer, take a bounce-pad pillow pile, and finish back at the bed.
- **Make it look gorgeous:** warm lamp light, a night-light glow and moonlight through the window. Hold it to Kevin's refined, cinematic bar, not a flat blockout.
- **Track tooling:** guide lines, invisible walls only where needed, a respawn spline and CPU racing lines.

### 5. Race flow and the CPUs
- **Screens:** title, then fighter select (OG or ALT, with kart preview turntables), then a countdown, the race, and results with podium poses and a trash-talk line from the winner.
- **The field:** 1 human plus 7 CPU racers, with easy, normal and hard difficulty. CPUs use the racing lines, drift, use items sensibly and rubber-band gently.
- **HUD:** in the PF2 neon arcade style, showing position, lap, an item slot (roulette spin), a minimap and the drift tier.
- **Input:** keyboard (arrows or WASD to steer; plus keys for GAS, BRAKE/REVERSE, DRIFT, ITEM, TAUNT and LOOK BACK; show the keys on the title screen) and the Gamepad API.
- **Audio:** reuse the PF2 audio engine. Each kart gets its own synthesized engine hum, plus a fun racing chiptune loop. Use no external audio services, and never ElevenLabs.
- **Deep links:** `?p1=kevalanche&alt1=1&cpu=hard&track=landing`, `?hold` for stepping tools, and `?seed=N`.

## Quality bar
- `node tools/check.mjs` runs a full 3-lap race with 8 CPUs (p1cpu), with zero console errors, 60 fps, and zero network requests.
- Use `tools/shots.mjs` to produce: select, the start grid, a drift with tier-3 sparks, every item mid-effect, the under-bed section, the banister, the podium, and each of the 14 karts posed.
- LOOK at the shots critically before shipping. Fix anything that looks cheap or off-model.

## Shipping
- Create release branch `kart-release-1` off current `main`. It must touch ONLY `down-hill/index.html`. Also add a Down Hill entry to the Crucible index page if it lists the games (follow how pillow-fight-2 is listed). Use no number unless the index numbers everything.
- **Auto-merge YOUR PR** (`gh pr merge <n> --merge`) only if the quality bar passes, then confirm the Pages deploy. Otherwise, leave the PR open with a comment.
- Open the PR with a skimmable summary (controls, items, what's in) and screenshots.
- Never push to `main`, never force-push, and merge only your own PR. No self-scheduled follow-ups and no polling.

## Stage 2 preview (do NOT build now; just leave clean hooks)
- Phone controllers: reuse the PF2 pad, QR pairing and Kevin's 14 painted backgrounds with a kart button map.
- Split screen for 2 to 4 local players.
- 2 more tracks and a 3-track cup.
