**RUN B of 2: PHONE CONTROLLER for Pillow Fight 2.** Repo: https://github.com/mediaonemultimedia/crucible.
- Source branch: `pf2-source` (`pillow-fight-2/_source/`).
- Live game: https://mediaonemultimedia.github.io/crucible/pillow-fight-2/.

Read the README first, then `docs/friday-nov20/controller-design-notes.md` (the design rationale; follow it). Full specs for tonight are on `pf2-source` at `pillow-fight-2/_source/docs/friday-nov20/` (run-a-specials.md has the 7 specials).

Run A (special moves) started at 5pm PT and may still be running. If `pf2-source` is getting fresh commits, build on top of them and rebase as it moves. Never discard its work. If Run A's move-list data isn't there yet, read run-a-specials.md and use that.

Do not touch `bolster/` (PF1). This is PF2 only.

## PUSH EARLY (important)
Usage limits have killed runs before they pushed. Commit and push `pf2-source` after every item below, and keep a README status line current. A continuation run at 10pm PT will resume from your pushes.

## Build, in priority order

### 1. Pairing
- The title screen and the select screen each show a QR code plus a short room code.
- Scanning the QR opens a controller page on the phone (no app). Ship the controller as `pillow-fight-2/controller.html`, or as a `?pad=` mode of the same `index.html` (preferred).
- Pair over PeerJS (already used for online play).
- Up to 2 phones, one for P1 and one for P2. Keyboard still works, and keyboard plus phone can mix.
- Generate the QR in code, with no external QR service.

### 2. Low lag
- The phone sends only raw button/stick state: a few bytes, sent on change plus a 60 Hz heartbeat.
- Use an unreliable, unordered data channel.
- The game is the only sim. Phone inputs go through the existing input-delay/rollback path, so late packets are corrected rather than stalling.
- Handle input on `pointerdown`/`touchstart` (never click), with multi-touch.
- No zoom, scroll, text selection or long-press menus.
- Hold a Screen Wake Lock.
- Show a ping indicator (green/amber/red) on the title screen per paired phone.
- Auto-reconnect if the phone sleeps.

### 3. Cabinet look (the art now comes from Kevin's painted skins, see section 5; the rules below describe what they show)
Use the arcade cabinet panel from Kevin's reference photo.
- **Left:** a virtual ball-top stick with a glossy ball on a yellow ring base, 8-way, with a dead zone. It must make ↓↘→, half-circles and charge motions easy. No d-pad.
- **Right:** six convex arcade buttons in a 2×3 block on a dark plate, each clearly labelled:
  - **BOP** (blue): light
  - **WALLOP** (red): heavy
  - **GRAB** (white): one-press throw
  - **JUMP**
  - **BLOCK**
  - **TAUNT**: plays that fighter's trash-talk line
- **START:** an NES-style rubber PILL in a recessed well, top centre, with "START" printed on the overlay above it.
- **SUPER:** a LARGE glossy PILL button, vertically level with the joystick centre, between the stick and the buttons, with "SUPER" printed on the pill. It fires the meter super.
- No portrait. Any text or logo that is painted into Kevin's skins stays (see section 5); add nothing else.
- Buttons press in with a glossy highlight, flash, and make a click sound.
- Landscape layout. In portrait, show a "rotate your phone" prompt.
- Haptics via `navigator.vibrate`: a short buzz on hit taken, a longer one on KO. Feature-detect, since iPhone won't buzz, and fail silently.

### 4. Pick your fighter on the phone
- Choose OG or ALT on your own phone, and see the cursor move on the big screen.
- The KO screen shows a rude one-liner on the loser's phone, in the fighter's voice and in the existing trash-talk tone.
- When Rubberta's Ink Jet hits you, your phone screen gets an ink splat that drips off over ~2 seconds. It never blocks the controls' hit areas.

### 5. Controller art: Kevin's 14 finished mockups ARE the skins (match them exactly)
Kevin painted a finished controller for every fighter and every ALT. **Do not redraw the art in SVG/CSS.** Use his images as the controller background, and layer the live controls exactly over the painted ones. The older SVG/CSS mockups (`kevalanche-controller-mockup.html`, `sebas-controller-mockup.html`) are now superseded for art. Keep them only as a reference for button-press feel and the cheat sheet.
- **Files:** `docs/friday-nov20/skins/<id>.webp`, all 1920×1072. The 14 ids are `kevalanche`, `kevalanche-alt`, `zach`, `zach-alt` (ghost pirate), `k8-e`, `k8-e-alt` (punk), `johnny`, `johnny-alt` (red-laser padel), `rubberta`, `rubberta-alt` (deep-sea tentacle), `sumaura`, `sumaura-alt` (art-deco casino), `sebas` and `sebas-alt`. Map each to the game's OG/ALT roster entry. Ship them to the live site as `pillow-fight-2/controller/skins/<id>.webp`. Lazy-load only the chosen fighter's skin, and show a dark plain panel until it arrives.
- **Hit-zone map:** `docs/friday-nov20/skins/skins.json` gives each skin's stick, 6 buttons, SUPER, START and MOVES positions as fractions of the image. These are eyeballed estimates. Before shipping, build a `?pad=debug` overlay that outlines every zone on every skin, screenshot all 14, and nudge the numbers until each outline sits exactly on its painted part. Make hit zones about 15% larger than the painted part, for fat thumbs.
- **Layout on the phone:** fit the whole image (contain) in landscape, centred, with near-black letterbox bars. Never crop the art. Every zone scales with the image rect.
- **Buttons, SUPER, START and MOVES press feel:** use a sprite of that exact region, cut from the same image with `background-position`. On press, scale it to about 0.93 with a darker inner shadow, then release it with a quick spring. Add the click sound and haptic. The painted art IS the button, so no separate CSS button is drawn on top.
- **Stick:** cut the ball as a circular sprite from the image. Under it, draw a dark socket disc the size of the ball, so the painted ball is hidden whenever the live one moves. Limit travel to about 35% of the ball radius, and tilt the ball slightly with a highlight shift. The touch area for the stick is the whole left 40% of the screen (floating origin where the thumb lands); only the visual is anchored to the painted stick.
- **Keep what's painted, as painted.** Some skins carry a fighter name or logo (K8-E, Johnny, Rubberta, Sumaura) and some have no button labels (Kevalanche OG). Kevin made these, so leave them. Don't add or remove text.
- **Ping dot:** reuse the painted LED position (top right) and tint it green/amber/red with a small glowing overlay.
- **Wear:** it's already in the art. Don't add procedural wear.

### 6. Cheat sheet
- A slide-up panel on the phone (swipe up or tap a tab) showing your fighter's specials, throws and supers.
- It reads the move-list data from Run A.
- It should look like a real move list taped to a cabinet: kraft cardboard or photocopied paper, hand-lettered marker, arrow glyphs, tape corners, a slight coffee ring.
- The game pauses only if both players open their panels in practice mode. In a match it's just an overlay on the phone.

## Quality bar
- Test with two simulated phone clients in headless browsers, plus a latency/jitter injection test.
- Inputs must land within 2 frames on loopback, and online/rollback must stay in sync.
- 60 fps and zero console errors in both the game and the controller.
- The game makes zero runtime network requests except PeerJS.

## Shipping
- Release branch `pf2-release-5` off current `main`. It touches ONLY `pillow-fight-2/index.html` (plus `controller.html` if you went that route) and the 14 files in `pillow-fight-2/controller/skins/`.
- **Auto-merge** YOUR PR (`gh pr merge <n> --merge`) only if all the quality-bar checks pass, then confirm the Pages deploy. Otherwise, leave the PR open with a comment.
- The PR should open with a skimmable summary: how to pair, the controls, and screenshots of the phone panel for 3+ fighters and the cheat sheet. LOOK at them critically.
- Never push to `main`, never force-push, merge only your own PR. No self-scheduled follow-ups and no polling.
