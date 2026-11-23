# DOWN HILL: Stage 5, items, difficulty curve and feel (Kevin-approved, Sun Nov 22)
- **Repo:** https://github.com/mediaonemultimedia/crucible
- **Branch:** `kart-source`, in `down-hill/_source/`.
- **Read first:** `docs/stage-1.md`, `docs/stage-3.md`, `docs/stage-4-music.md` and the README. Stages 3 (playtest fixes) and 4 (music) ran earlier tonight. Pull and build on top of them; never discard their work. If either one is unfinished or unmerged, leave its files alone and note it in the PR.
- **All rules still apply:** originality (genre mechanics are fine, but every item, name and look is ours), performance (60 fps with 8 karts and in split screen), PUSH EARLY, and the quality bar.

## Kevin's playtest answers (summarised)
- **Speed:** good. The **boost should hit a bit harder**.
- **CPUs:** good racers, but **a little too hard for a first race**. Start easier and ramp up.
- **Items:**
  - He **"didn't get any items"** in his race.
  - He **saw the Alarm Clock but didn't know what it did**.
  - **The handcuffs were a great idea.**
  - He wants more of the classic kart-game item TYPES, in our own pillow-fight flavour.
- **Taunt tricks:** he **never noticed them**.
- **Camera, lap length, phone stick:** all good.
- **His favourite part:** the toy-scale level design, which plays like a classic miniature-toy racer. Lean into that.

## 1. Boost kick
- Drift-boost tiers, the feather pads and the Espresso Shot each get roughly +15–20% peak speed and a slightly longer tail.
- Add more feel when a boost fires: an FOV punch, a short camera pull-back, a feather burst out the back, a whoosh, and a subtle motion-blur or speed-line overlay.
- Keep it stable: no new wall-clipping or fall-throughs. Rerun stage 3's fall-through test.

## 2. Difficulty curve
- **New default:** the first race and single races on "normal" are about 10–15% gentler than now. Use slightly lower CPU top speed, later braking errors, less perfect item use and milder rubber-banding.
- **The Pillow Cup ramps up:** race 1 is gentle, race 2 medium, race 3 at today's strength.
- **Settings:** add "easy / normal / hard" plus a "Champion" setting, which is today's hard plus a bit.
- **Tuning target:** a casual human finishing in the top 3 about half the time on normal race 1. Verify it with a scripted "average driver" bot: imperfect lines, no drift mastery. Report the finishing places in the PR.

## 3. Items: everyone gets them, everyone understands them
- **Find out why Kevin got none.**
  - Are the box rows too sparse? Too easy to miss? Too hard to see? Do they respawn too slowly? Does the human get skipped?
  - Fix it so you pass at least one box row about every 12–15 seconds.
  - Boxes should be big, glowing and bobbing, spanning most of the road width.
  - Add an audible "ding" and a roulette when you grab one.
- **Every item explains itself:** when you get one, the HUD shows its name plus a 3-to-5-word tip for 2 seconds (e.g. "ALARM CLOCK: wakes up whoever's in 1st").
  - The first time each item hits someone in a session, a small caption names it.
  - The Alarm Clock gets a visible flight: it flies over the field to the leader with a ticking sound, then rings.
- **New items** (original names and looks; keep them cheap to render):
  - **Sugar Rush** (an invincibility star TYPE): a giant lollipop. You glow rainbow-candy for about 6 seconds, drive faster, are immune to items and off-road slowdown, and karts you bump spin out. Use rear-place odds only.
  - **Paper Plane** (the homing-projectile TYPE): a folded paper plane that homes in on the racer directly ahead, follows the track and bonks them. Players can block it with a Pillow Missile held behind them, or dodge it with a well-timed Feather Slick.
  - **Hot Wash** (the shrink-everyone TYPE, in a laundry pun): a puff of steam from the leader's direction. Every OTHER racer shrinks to about 60% for about 5 seconds ("shrunk in the wash"): slower, and anyone full-size can squash them flat (a brief pancake).
    - **Performance:** it's just a scale on existing meshes. If it costs measurable fps in split screen, cut it and say so.
    - Use mid-to-rear odds only.
  - **Spring Cushion** (Kevin's ejector-seat idea, verbatim: "you can see in the distance that it's targeting somebody in front of you, and then you hit the button and they get thrown out of their kart"):
    - When you pick it up, a reticle locks onto the racer ahead and stays visible over them, on THEIR screen too, as a warning.
    - Press ITEM again to fire: their seat cushion springs and they are launched high out of the kart, flail comically and land back in it, losing about 1.5 seconds.
    - Lock range is about 60 units, line of sight along the track.
- **Rebalance the odds table** for 10 items (Feather Slick, Pillow Missile, Espresso Shot, Fuzzy Handcuffs, Pillowcase, Alarm Clock, Sugar Rush, Paper Plane, Hot Wash, Spring Cushion) by position. Rear racers get the strong ones; the leader gets mostly defensive ones.
- **Phone pad:** update the cardboard "how to race" sheet with all 10 items, each with a hand-drawn icon and a one-line tip.

## 4. Make the taunt trick discoverable
- When you're airborne off a ramp, a big **"TAUNT!" prompt** pops up showing the key or button.
- The landing boost is clearly visible: gold feathers and a "STYLE BOOST" toast.
- The first ramp of the first race shows a one-time tip.
- Put a TAUNT icon in the HUD near the item slot.

## 5. More toy-scale charm (cheap only)
Kevin loves the toy-scale feel. Add a few small, cheap props per track that sell the scale:
- **The Landing:** crayons, building blocks, a toy car parked on the rug, a sleeping cat's tail.
- **Laundry Day:** clothes pegs, a lost coin, a lint ball.
- **Sprinkler Park:** acorns, a garden gnome, ants.
Use instanced or merged geometry, and add no frame cost.

## Shipping
- Create `kart-release-5` off `main`. It touches ONLY `down-hill/index.html`, plus `down-hill/controller/` if the sheet art changes.
- Auto-merge your own PR only if the full quality bar passes, plus stage 3's fall-through tests and a new item test (every item fires, hits, and resolves with no errors, in 1P and 4-way split). Then confirm the Pages deploy.
- The PR opens with a GIF or shot of each new item mid-effect, plus the difficulty-curve finishing places.
- Never push to `main`, never force-push, no self-scheduled follow-ups and no polling.

## 6. Bigger phone-pad QR (Kevin, Sun Nov 22, all games)
Kevin: QR codes must scan from a good distance across the room — "decent size, not massive". PF2 + Battle Royale already got this (PR #57); match it exactly in `src/index.html`:
- `#pads .qr` 112px → `width/height: clamp(200px,24vh,320px)`, border-radius 6px; `.h` 14px, `.code` 44px, `.how` 13px, `.seats` 14px (gap 3px, margin-top 6px).
- `body[data-screen=select] #pads .qr` 84px → `clamp(160px,17vh,240px)`; select `.code` 32px. Widen the select `.seats` max-width if the row wraps badly.
- Screenshot title + select at 1920×1080 and 1280×720: nothing overlapped, the QR still decodes (jsQR in the pad test).
