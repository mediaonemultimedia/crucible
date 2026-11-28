# UI kit (overhaul stage 2)

One small kit, used everywhere: `src/ui/kit.css` (inlined last by `tools/build.mjs`, so it restyles the older panels in place) and `src/ui/typeart.js`.

## Rules
- **Chunky and outlined.** Every panel, pill, button and badge has a 4 px dark outline (`--k-ink`), rounded corners (`--k-r` 22 px, pills 999 px) and a 6 px dark lip underneath (`--k-lip`) so it reads as a pressable object.
- **Glossy candy fills.** Vertical three-stop gradients (`--k-*-hi`, base, `--k-*-lo`) with an inset white top highlight. Panels are grape; buttons are sun (default), mint (go / primary), berry (danger / wallop). Cream (`#fffdf2 → #ffe7b5`) is the light surface for pills, the lap counter, the minimap and the course card.
- **Bouncy.** Elements pop in with overshoot (`k-pop`, `k-in`, easing `--k-pop`). Buttons squash onto their lip when pressed (`:active`). Nothing slides linearly.
- **Big targets.** Buttons are at least 52 px tall; the item bubble is 112 px.

## Type
- Display words are **images**, pre-rendered from Kevin's Adobe Fonts by `node tools/render-type.mjs` into `src/assets/type/*.png` (+ `index.js`). The fonts never ship (Adobe licence: images are fine, embedding is not), and no Adobe family name appears in shipped CSS.
  - Snicker: wordmark, menu headers, buttons, PRESS START, FINAL LAP.
  - CC Smash: countdown 3-2-1-GO!, place badges 1st–8th, WRONG WAY!
  - CC Biff Bam Boom: comic hits (POW, BONK, SPLAT, WHUMP, SMASHED!, OVERTAKE!, MINI-TURBO!, WALLOP NOW!).
  - Chaloops: course titles and item names.
  - Brevia, Ruddy: specimen only for now (`out/type-specimen.png`).
- Live text (names, timers, laps, tips) uses the bundled OFL Lilita One subset (`--k-live`, family "Bolster Display").
- Re-run `node tools/render-type.mjs` after changing words or palettes; `--specimen out.png` renders the comparison sheet. Missing families fall back to Lilita One and are reported as STAND-IN.

## Using it
- Add `k-panel` / `k-btn` (`mint`, `berry`) to new elements; existing screens are mapped by selector in `kit.css`.
- `typeImg(id, alt)` returns an `<img>` for any type image; `placeImg(n)`, `countImg(n)`.
- The HUD place badge bounces on every change (`gain` flashes green, `lose` flashes red). The drift charge is a ring round the item bubble (`--charge` 0–1, `data-tier` colours white / gold / mint), not bars.
- Course overviews: `node tools/course-art.mjs build/lookdev-race.html` re-renders `src/assets/courses/*.webp` from the current game.
