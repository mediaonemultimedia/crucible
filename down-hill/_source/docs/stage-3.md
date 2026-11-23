# DOWN HILL: Stage 3, Kevin's first-playtest fixes (Kevin-approved, Sun Nov 22)
- **Repo:** https://github.com/mediaonemultimedia/crucible
- **Branch:** `kart-source`, in `down-hill/_source/`.
- **Read first:** `docs/stage-1.md`, `docs/stage-2.md` and the README. Every rule there (originality, performance, PUSH EARLY, quality bar, shipping) still applies.

Kevin played it and liked it ("first try, pretty decent, the track was a lot of fun"). These are his notes, in priority order.

## 1. If there's a barrier, you collide with it (top priority)
Kevin, verbatim: "when there's bumpers up on the side, the expectation is that there's going to be collision detection there… especially on an upper bridge… you should collide with those bumpers and stay on the track, even though it slows you down."
- **The rule:** every drawn rail, bumper, kerb, wall or barrier is SOLID in the sim, on all 3 tracks. A drop-off is only allowed where there is visibly NO barrier.
- **Known case:** on The Landing, the `plank` and `banister` waypoints use `edge: 'drop'` with `m: 0.8`. If the renderer draws rails or bumpers there (Kevin says it does), make those sections solid walls, or remove the drawn rail and make the drop obvious. Kevin's preference: rails plus collision.
- **Audit every section** of Laundry Day and Sprinkler Park the same way.
- **Hitting a rail:** it scrapes you and slows you down (sparks and a scrape sound). It never bounces you off.

## 2. Falling through the track at the pillows (The Landing)
Kevin "went through the pillows" and "disappeared below the track a couple of times". The likely cause is the spline that leads up the pillow pile onto the bed.
- **Suspect 1:** the `underbed` section (x −36…10, z −24…−28, y 0) lies directly BELOW the `duvet` section (x −10…8, z −50…−14, y 16). `locate(T, x, z, k, 20)` is a 2D xz search, so a kart in the air (off the pillow-pile `launch: 19`, or the duvet's `launch: 7`) can snap to the under-bed samples and get placed below.
- **Suspect 2:** `groundAt` / the landing check on the steep pillow ramp (y 0 → 8 → 16 over ~27 units) lets a fast kart tunnel below the surface.
- **Fix it properly:**
  - Make `locate` height-aware or prefer continuity, so it never jumps to a layer more than a few units above or below the kart.
  - Clamp so you can't sink under the ground you're on.
  - Add a safety net: if a kart ever ends up more than a small distance below the ground of its current segment, put it back on the surface. Don't fish it out with the sock.
- **If the pillow pile is still unreliable after that, SIMPLIFY it.** Kevin is fine with that. For example, use a plain, clearly lit ramp (a stack of storybooks or a wooden toy ramp) up onto the bed, with rails.
- **Add a regression test:** 20+ CPU and autopilot laps on all 3 tracks at high speed with items on. Assert that no kart is ever below its segment's ground and that none hits the sock fish-out except at real drop edges. Log the counts in the PR.
- Check the other tracks for the same layering problem (the dryer-drum shortcut, the treehouse ramp).

## 3. Make it clear where to go
Kevin: some parts were "a little bit skinny and not quite as clear".
- **Widen the narrow sections.** The banister (w 6.5), the planks, the doorways (w 8, m 1) and the under-bed are the main ones. Nothing should be narrower than about 8.5 half-width plus margin, unless it's a deliberate, well-signposted squeeze.
- **Make the road readable at speed:**
  - stronger edge lines or kerb stripes
  - chevron arrow signs on the outside of every sharp turn (in-world props that fit: sticky notes, flash cards, toy road signs)
  - a faint racing-line glow or arrows on the floor through confusing junctions (the doorways, the drawer entry, the pillow ramp, and any spot where the road crosses open floor)
  - better lighting contrast between the road and the off-road
- **Do the same pass** on Laundry Day and Sprinkler Park.
- **Before and after shots:** take shots of every section from the race camera, then LOOK at them as a first-time player. Can you tell where to go within half a second?

## 4. Light kart refinements (only if the budget allows)
Kevin: "a few refinements… but don't go crazy; more detail means more processing power."
- Add a few cheap, characterful details per kart: shaped silhouettes, a trim colour, a decal or number plate with the fighter's flag, and one signature prop (for example, Zach's cart junk sparkle or Kevalanche's hockey sticks).
- **Rules:** same draw-call budget; prefer merged geometry and shared materials.
- **Frame cost:** report frame cost before and after with 8 karts and in 4-way split screen. If any refinement costs measurable fps, drop it.

## Shipping
- Create `kart-release-3` off `main`. It touches ONLY `down-hill/` (`index.html`, plus `controller/` if needed).
- Auto-merge your own PR only if the full quality bar passes, plus the new fall-through and collision tests. Then confirm the Pages deploy.
- The PR summary should list every changed section with before and after screenshots.
- Never push to `main`, never force-push, no self-scheduled follow-ups and no polling.
