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

### 5. Controller art: one shared layout, Kevin paints a background per skin (Nov 18 decision)
**Layout is fixed for every fighter.** The canvas is 2400×1100, full bleed, positioned with `object-fit: cover`. The x 222–2178 safe zone always shows; the pink side bleed may crop on 16:9 phones. The reference is `docs/friday-nov20/skin-template.html`; port its layout constant `L` and its control drawing code exactly. Also see `pf2-skin-guide.png` and `pf2-skin-overlay.png`.
- **Kevin's backgrounds:** `docs/friday-nov20/backgrounds/<id>.webp` (2400×1100), one per fighter and ALT (14 ids, as listed in skins/). Each has the art and the button plate only, with NO stick, buttons, labels, SUPER, START, MOVES or LED.
  - **If a background isn't there yet,** fall back to the full painting in `skins/<id>.webp`. Fit it with contain, and don't draw code controls over it; use invisible hit zones from `skins/skins.json` and the sprite-press method instead. Log which skins used the fallback in the PR body.
- **Controls are drawn in code, on top, the same for everyone.** Only colours change per skin.
  - **Buttons are DISHED arcade buttons.** That means a convex glossy housing ring, a dark seam, and a CONCAVE cap: dark at the top, light at the bottom, with an inner shadow under the top lip and a thin light rim along the bottom inside edge. They must NOT look like roller balls, so no domed specular blob on the cap. On press, the cap sinks (translateY plus scale .92, darker) and springs back.
  - **Stick:** ring plus ball (moves). **SUPER:** glossy pill. **START:** NES rubber pill with "START" printed above it. **MOVES:** tab. **Ping LED.** Labels go under the buttons.
- **Per-skin colour config:** 6 cap colours, stick ring and ball, SUPER colour and text colour, label colour, and MOVES colour. Take them from Kevin's paintings in `skins/` (e.g. Sebas: orange, teal and cream on top; green, red and cream on the bottom; brass ring; orange ball). Keep every cap visible against its plate.
- **No procedural wear or art.** Kevin's background is the whole look.

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
- Release branch `pf2-release-5` off current `main`. It touches ONLY `pillow-fight-2/index.html` (plus `controller.html` if you went that route) and the skin images in `pillow-fight-2/controller/` (backgrounds/ and any fallback skins/).
- **Auto-merge** YOUR PR (`gh pr merge <n> --merge`) only if all the quality-bar checks pass, then confirm the Pages deploy. Otherwise, leave the PR open with a comment.
- The PR should open with a skimmable summary: how to pair, the controls, and screenshots of the phone panel for 3+ fighters and the cheat sheet. LOOK at them critically.
- Never push to `main`, never force-push, merge only your own PR. No self-scheduled follow-ups and no polling.
