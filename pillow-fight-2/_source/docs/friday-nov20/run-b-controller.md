**RUN B of 2: PHONE CONTROLLER for Pillow Fight 2.** Repo: https://github.com/mediaonemultimedia/crucible.
- Source branch: `pf2-source` (`pillow-fight-2/_source/`).
- Live game: https://mediaonemultimedia.github.io/crucible/pillow-fight-2/.

Read the README first. Full specs for tonight are on `pf2-source` at `pillow-fight-2/_source/docs/friday-nov20/` (run-a-specials.md has the 7 specials).

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

### 3. Cabinet look
Use the arcade cabinet panel from Kevin's reference photo.
- **Left:** a virtual ball-top stick with a glossy ball on a yellow ring base, 8-way, with a dead zone. It must make ↓↘→, half-circles and charge motions easy. No d-pad.
- **Right:** six convex arcade buttons in a 2×3 block on a dark plate, each clearly labelled:
  - **BOP** (blue): light
  - **WALLOP** (red): heavy
  - **GRAB** (white): one-press throw
  - **JUMP**
  - **BLOCK**
  - **TAUNT**: plays that fighter's trash-talk line
- **Top:** a yellow **START** button (pause/menu).
- Buttons press in with a glossy highlight, flash, and make a click sound.
- Landscape layout. In portrait, show a "rotate your phone" prompt.
- Haptics via `navigator.vibrate`: a short buzz on hit taken, a longer one on KO. Feature-detect, since iPhone won't buzz, and fail silently.

### 4. Pick your fighter on the phone
- Choose OG or ALT on your own phone, and see the cursor move on the big screen.
- The KO screen shows a rude one-liner on the loser's phone, in the fighter's voice and in the existing trash-talk tone.
- When Rubberta's Ink Jet hits you, your phone screen gets an ink splat that drips off over ~2 seconds. It never blocks the controls' hit areas.

### 5. Controller themed by fighter and country
After picking, the phone panel restyles partly from the character and partly from their country. ALT twins get a darker, evil variant of the same theme. Look in the PF1/PF2 source for each fighter's country.
- **Kevalanche** (Canada): snowy, plaid.
  - ALT Goon: Oilers navy/orange hockey boards and ice scratches, no logos.
- **Zach Sparrow** (Canada): crow feathers, maple accents.
- **Rubberta** (Brazil): green/yellow Carnaval, ocean, ink.
- **Sumaura** (Britain): red phone box/double-decker red, tea, a sumo mawashi stripe.
- **Sebas Perra** (Mexico): lucha poster type, papel picado, pink/turquoise.
- **Johnny Deuce** and **K8-E**: use their country if the source has one; otherwise theme on the character (tennis court / giraffe savanna).

Keep everything tasteful and fun, not stereotyped. All art is generated in code (CSS/SVG/canvas). Keep it readable, and keep the buttons recognisably the same layout.

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
- Release branch `pf2-release-5` off current `main`. It touches ONLY `pillow-fight-2/index.html` (plus `controller.html` if you went that route).
- **Auto-merge** YOUR PR (`gh pr merge <n> --merge`) only if all the quality-bar checks pass, then confirm the Pages deploy. Otherwise, leave the PR open with a comment.
- The PR should open with a skimmable summary: how to pair, the controls, and screenshots of the phone panel for 3+ fighters and the cheat sheet. LOOK at them critically.
- Never push to `main`, never force-push, merge only your own PR. No self-scheduled follow-ups and no polling.
