# Bounce-and-squish glitch: Down Hill + Pillow Fight II (Kevin-approved, Sun Nov 22)
- **Repo:** https://github.com/mediaonemultimedia/crucible
- **Branches:** `kart-source` (`down-hill/_source/`) and `pf2-source` (`pillow-fight-2/_source/`). Read each README first; their rules (quality bar, PUSH EARLY, shipping) apply.
- Down Hill stage 5 ran just before you (`kart-release-5`). Pull first and build on top of it. If its PR is still open/unmerged, do PF2 first, then keep your Down Hill edits small and confined (render springs / pad code) and rebase onto the latest `kart-source`.

## Kevin's report, verbatim-ish
"When the connection isn't great, the characters are bouncing up and down, like they're getting squished, repeatedly, and it just doesn't end. It happens in Down Hill and in Pillow Fight 2 too." He plays with the phone controllers.

## Lead suspect (found by reading the code, not yet reproduced)
`render/feel.js` (shared PF1-derived puppet code, in both games) integrates springs explicitly:
```js
function drive(s, target, k, z, dt) { s.v += (k*(target-s.x) - 2*z*Math.sqrt(k)*s.v)*dt; s.x += s.v*dt; }
```
called with stiffness up to k = 900 (glove squash), and other squash/stretch/bob springs elsewhere. Semi-implicit Euler goes UNSTABLE when dt·√k > ~2 → dt > ~0.067 s for k = 900, but the frame dt clamp is 0.1 s (`main.js`, `dt = Math.min(dt, 0.1)`). During any stretch of 10–15 fps frames (a main-thread hitch: PeerJS/ICE reconnects, pad paints, GC) the springs gain energy every frame, so the plush keeps bouncing and squishing, and it rings until frames recover, or forever if the hitch persists.
1. Audit EVERY spring/oscillator in both games (feel.js `drive`, puppets, attire, gloves, plush squash/stretch, kart suspension/bob, camera springs, HUD bounces). Make them dt-safe: fixed substeps (≤ 1/120 s per step) or an exact critically-damped / analytic spring. Also clamp the state (squash scale within sane bounds).
2. Prove it with a test: drive each spring at dt = 0.1 for 10 s from a kick; it must settle (energy decreasing). Before/after numbers in the PR.

## Also check (secondary suspects)
- **What causes the hitches when the connection is poor.** Profile the game page while a phone pad has lag, jitter and loss and reconnects (PF2's `tools/pad-test.mjs` already simulates lag+jitter+loss; Down Hill has `tools/pad-test.mjs`). Look for main-thread work per packet or per frame: pad card repaint (QR SVG rebuilt into innerHTML?), seat LED updates, ping bookkeeping, reconnect handlers, console logging. Keep any per-frame DOM write to "only when changed".
- **Pad input flapping** (`pad/wire.js` `PadState`): with a quiet spell > STALE_MS, held bits are cleared then re-seen. Confirm no bit (TAUNT, JUMP, BLOCK, crouch, GAS) can produce repeated press edges from packet loss, reordering, duplicates, or the 4-bit tap counters, and that the 8-bit seq `newer()` window can't freeze or replay input after a long gap or a phone reconnect (phone seq restarts). A repeating TAUNT in Down Hill bounces the kart (`bounceT`) and in PF2 is a squashy taunt, which would look exactly like Kevin's report. Add tests with simulated loss/reorder/duplicate/gap/reconnect: one physical tap = one press, a held button = one press.
- **PF2 online rollback:** check that rollback re-simulation doesn't re-fire render events (landing squash, hit squash, taunt) on every resimulated frame. Render reactions must fire once per confirmed event.
- Anything else you find that loops a squash/bounce animation.

## Repro → fix → verify
- Build a repro first: headless page plus simulated phones with bad network (300 ms jitter, 15% loss, a 3 s dropout, a reconnect) and forced slow frames (e.g. a busy-loop to 70–100 ms frames for 5 s). Record the plush/kart scale over time before the fix (it should show the ring) and after (it settles within ~0.5 s of frames recovering).
- Report: the root cause(s) you confirmed, and what was only a suspect.

## Shipping
- Two PRs off `main`: `pf2-release-6` (touches ONLY `pillow-fight-2/index.html`) and `kart-release-6` (touches ONLY `down-hill/index.html`). Also patch `battle-royale/index.html` ONLY if the same spring code is in it and the fix is a clean CSS-free JS swap you can verify headless; otherwise list it in the PR as a follow-up (its source is outside this repo).
- Auto-merge each of your own PRs only if that game's full quality bar passes (zero errors, 60 fps, no network gate failures, existing tests + the new spring and pad tests). Then confirm the Pages deploys.
- Never push to `main`, never force-push, no self-scheduled follow-ups and no polling.
