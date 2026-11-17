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

### 3. Cabinet look (Kevin-approved mockup: `docs/friday-nov20/kevalanche-controller-mockup.html`. Match its layout and feel)
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
- **SUPER:** a bigger glossy PILL button in the middle, between the stick and the buttons, with "SUPER" printed on the pill. It fires the meter super.
- NO fighter name, NO portrait and NO country text on the controller. The fighter shows only through the art.
- Buttons press in with a glossy highlight, flash, and make a click sound.
- Landscape layout. In portrait, show a "rotate your phone" prompt.
- Haptics via `navigator.vibrate`: a short buzz on hit taken, a longer one on KO. Feature-detect, since iPhone won't buzz, and fail silently.

### 4. Pick your fighter on the phone
- Choose OG or ALT on your own phone, and see the cursor move on the big screen.
- The KO screen shows a rude one-liner on the loser's phone, in the fighter's voice and in the existing trash-talk tone.
- When Rubberta's Ink Jet hits you, your phone screen gets an ink splat that drips off over ~2 seconds. It never blocks the controls' hit areas.

### 5. Controller art: unique per fighter (and per OG/ALT)
The panel art is a printed arcade control-panel overlay, like a racing livery: dynamic but fairly simple.
- **Visual language:** jagged livery shards, racing-stripe bundles, halftone dot patches, rough brush strokes, thin speed lines, tiny technical decals (barcode bars, chevrons; no words), and an outlined zone around the button cluster.
- **Wear on most of them:** paint chips revealing primer, scuffs, and rubbed areas around the stick and buttons. It's done in code with SVG feTurbulence thresholds. Keep it subtle, like the PILLOW FIGHT II logo; never mush.
- **Each fighter is distinct** (palette, shapes, motifs), driven mainly by the CHARACTER. Country is only an extra ingredient where fun (Brazil, Mexico, UK). ALT twins get their own evil variant, not just a recolour. Button cap colours and the stick ball match each theme.
- **Kevalanche OG:** icy-blue avalanche shards, a snow brush, a red flannel-plaid racing stripe. **Goon:** Oilers navy, an orange/white hockey-sweater stripe bundle cut by a jagged break, skate scratches. (These are built in the mockup; port them.)
- **Zach Sparrow:** black crow-feather shards, iridescent purple/teal sheen, beak-sharp diagonals.
- **K8-E:** giraffe-patch shapes as livery panels, tall vertical-ish stripes (long neck), sunny savanna palette.
- **Johnny Deuce:** tennis: court-line geometry, felt-ball yellow-green, racquet-string mesh, a scoreboard-tick decal; maybe one small Dutch orange accent.
- **Rubberta:** Brazil green/yellow Carnaval energy plus ocean blue, ink splatter, tentacle-curve stripes.
- **Sumaura:** UK red with navy, a sumo mawashi band as the stripe bundle, maybe a bamboo hint (panda).
- **Sebas Perra:** lucha poster: pink/turquoise/gold, papel-picado cut shapes, a wolf-claw slash.

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
