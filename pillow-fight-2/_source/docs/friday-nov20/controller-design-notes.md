# Pillow Fight 2: phone controller design notes

The thinking behind the controller look, plus what Kevin approved and rejected in the Nov 17 review.
The mockups next to this file (`kevalanche-controller.html`, `sebas-controller.html`) are the reference builds.

## The big idea
The phone should feel like **a real arcade control panel overlay**: a hybrid of an arcade cabinet and an old-school Nintendo pad. It's a physical object you're holding, not a flat app UI.
- **Arcade:** the ball-top stick, Sanwa-style buttons and printed panel art.
- **Nintendo:** rubber pill buttons in recessed wells.

## Layout (same for every fighter)
- **Stick, left.** Ball-top on a yellow ring base, 8-way. It's a stick and not a d-pad because motion inputs (↓↘→, half-circles, charges) are hard on a glass d-pad.
- **Six buttons, right.** A 2×3 Street Fighter-style arc:
  - top row: **BOP** (light), **WALLOP** (heavy), **GRAB** (one-press throw)
  - bottom row: **BLOCK**, **JUMP**, **TAUNT**

  GRAB is a single button because two-button chords are unreliable on a touchscreen. There's no duck button: stick-down ducks, like SF.
- **SUPER, centre.** A large glossy pill, vertically level with the stick's centre. The keyboard has Space for the meter super, and the phone needed its own one-press equivalent.
- **START, top centre.** An NES-style rubber pill in a recessed well, with "START" printed on the overlay above it.
- **▲ MOVES, bottom right.** A tab that opens the cheat sheet.
- **Ping dot, top right.** Green/amber/red connection quality, no text.

## Buttons
Real arcade buttons, Sanwa/Seimitsu style:
- a solid coloured housing ring with a glossy lip
- a slightly smaller domed plunger with a dark seam around it
- on press, the plunger sinks and the ring stays put
- a little click sound

Cap colours come from each theme's palette. **No button colour may vanish against its plate.** For example, El Rudo's dark buttons are gunmetal with crimson rings, not black on black.

## The button plate
- **The default is solid** near-black/dark grey behind the buttons. It's cleaner than an outline: the buttons pop and the white labels read on every theme, so it looks like a cabinet panel bolted onto the art.
- **Theme colour** shows up in the edge trim, a corner flash, an accent notch and hash marks.
- **Plate shape follows the character.** Angular livery cuts for sharp designs (Kevalanche, Sebas); soft bubbly blobs for bubbly ones (likely Rubberta, Sumaura).

## Panel art: a livery, not a UI
- **References:** car/race livery decals (jagged shards, racing-stripe bundles), SNK MVS panel overlays, game-art badge panels.
- **Toolkit:**
  - jagged livery shards
  - racing-stripe bundles
  - halftone dot patches
  - rough brush strokes
  - thin speed lines
  - small technical decals (barcode bars, chevrons; never words)
- **Dynamic but fairly simple.** One strong diagonal energy and a few motifs, not wall-to-wall detail.
- **No fighter name, portrait or country text.** The character comes through only in the art.
- **Influence comes mostly from the CHARACTER.** Country is an extra ingredient only where it adds something (Brazil, Mexico, UK).
- **Every fighter is unique, and so is each ALT.** An ALT is a proper evil/alternate variant of the theme, not just a recolour.

## Wear
The look is a well-loved cabinet, echoing the scuffs in the PILLOW FIGHT II logo.
- **SPARSE and random:** about 8-10 small clusters of only 3-6 chips each, mostly tiny with the odd bigger one, in the primer colour.
- **Most of the board stays clean.**
- **Rejected:** noise-filter speckle (it read like snow across the whole board) and big dense clusters.

## Fighters so far
### Kevalanche
- **OG (polar bear, Canadian):** icy-blue jagged avalanche shards, white snow brush, halftone, a red flannel-plaid racing stripe. Ice-blue, red and white buttons; ice-blue stick ball; gold SUPER.
- **ALT Hockey Goon:** Oilers navy with an orange/white/orange hockey-sweater stripe bundle cut by a jagged break, faint skate scratches. Navy, orange and white buttons; orange stick and SUPER.

### Sebas Perra
- **OG técnico (wolf luchador, Mexican):** marigold sunburst on warm cream, strong magenta (Mexican pink), turquoise and gold. A hero cluster of three calavera skulls top-left, claw marks top-right. Orange stick ball.
- **ALT El Rudo:** near-black with jagged crimson flames, crimson livery bars, bone/crimson/black calaveras with the big one cracked, claw rips showing bare board. Gunmetal, crimson and bone buttons; crimson SUPER.
- **Rejected:**
  - papel picado banner (its loose hang didn't suit the crisp livery)
  - big luchador mask (the skulls read better)
  - soft pink (it read 90s, not Mexican)

### Still to design (Friday build, same bar)
- **Zach Sparrow:** crow-feather shards, iridescent purple/teal, beak-sharp diagonals.
- **K8-E:** giraffe-patch panels, tall stripes (long neck), sunny savanna.
- **Johnny Deuce:** tennis-first: court lines, felt-ball yellow-green, racquet-string mesh; at most a small Dutch-orange accent.
- **Rubberta:** Brazil green/yellow Carnaval energy plus ocean blue, ink splatter, tentacle curves. Likely a bubbly plate.
- **Sumaura:** UK red with navy, a sumo mawashi stripe, maybe bamboo. Likely a rounded plate.

## Cheat sheet
- A slide-up card that looks like a real move list taped to a cabinet: kraft cardboard, marker lettering, tape corners, a coffee ring.
- It lists the fighter's motion special (with BOP/WALLOP versions), throws, sidestep and super.

## Feel
- Buttons fire on finger-down, never on release.
- No zoom, scroll or text selection.
- Haptic buzz on hit and KO (Android only). Phones without vibration get a red edge flash and a shake.
- Rubberta's Ink Jet splats ink over the victim's phone screen and drips off, never covering the buttons.
