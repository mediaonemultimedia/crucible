**RUN A of 2: SPECIAL MOVES for Pillow Fight 1 AND Pillow Fight 2.** Repo: https://github.com/mediaonemultimedia/crucible.
- PF1 (piece Bolster): source branch `bolster-source` (`bolster/_source/`), live at https://mediaonemultimedia.github.io/crucible/bolster/.
- PF2 (3D Virtua Fighter-style): source branch `pf2-source` (`pillow-fight-2/_source/`), live at https://mediaonemultimedia.github.io/crucible/pillow-fight-2/.

Read both READMEs first. Full specs for tonight live on `pf2-source` at `pillow-fight-2/_source/docs/friday-nov20/` (run-a-specials.md, run-b-controller.md). PF1 is normally frozen; this run is Kevin's approved exception. Touch PF1 only for this feature.

## PUSH EARLY (important)
Usage limits have killed runs before they pushed. Commit and push the source branch after each fighter. Keep a README status line current: which fighters are done, in which game. A continuation run at 10pm PT (Thu Nov 19) will resume from your pushes. **Order:** do PF2 first (all 7 fighters), ship it, then PF1.

## What to build
Every fighter gets ONE Street Fighter-style motion special. These are new, separate from the existing Space/meter supers, which stay as they are. No meter cost.
- Inputs are relative to facing ("forward" means toward the opponent).
- Use a lenient motion buffer (about 12-15 frames, diagonals optional-ish) so it comes out on a phone stick later.
- Specials must not break existing inputs: PF2 double-tap up/down = sidestep, double-tap forward/back = dash.
- BOP = light attack button. WALLOP = heavy attack button.
- Usually BOP gives a shorter, faster or weaker version and WALLOP a longer, stronger, slower one.
- Every special is a RANGED attack, but in varied ways. Each fighter's attack is described below.
- Specials must be deterministic sim (the integer 60 Hz model) and rollback-safe online.

### The specials
1. **Kevalanche: "Drop the Gloves"**, ↓↘→ + BOP/WALLOP. Fireball.
   - **ALT Hockey Goon:** shakes off a hockey glove and hurls it spinning; feather puff on hit; the glove poofs back onto his hand.
   - **OG:** throws a snowball that bursts into snow.
   - BOP = slow projectile, WALLOP = fast. One projectile on screen per player.
2. **Johnny Deuce: "Flaming Ace"**, ↓↙← + BOP/WALLOP (a backhand-style motion).
   - Tosses a giant tennis ball up and serves it, on fire, with a flame trail.
   - WALLOP is a faster, dipping topspin serve.
3. **K8-E: "Long Neck"**, half-circle ←↙↓↘→ + BOP/WALLOP. Stretch limb, Dhalsim-like.
   - Her neck extends straight out across the ring and the head bonks.
   - BOP = mid-height and quicker; WALLOP = longer reach with more recovery.
   - The stretched neck is a hurtbox, so it can be punished.
4. **Rubberta: "Ink Jet"**, half-circle →↘↓↙← + BOP/WALLOP. Projectile.
   - A blob of ink that splats on hit and leaves the victim's face inky for ~2 seconds (cosmetic only).
   - Run B will also make the victim's phone screen get an ink splat, so expose an event hook for "inked".
5. **Sumaura: "Panda Roll"**, ← → + WALLOP (quick back, forward). Rolling body attack, Blanka-style.
   - Curls into a ball and rolls across the ring.
   - It bounces back off the opponent on block.
6. **Zach Sparrow: "Torpedo"**, hold ↓ ~0.7s, then ↑ + WALLOP. Charge move, E. Honda-style.
   - Launches beak-first, wings tucked, flying straight across the ring.
   - It travels low; a jump clears it.
7. **Sebas Perra: "Tornado de Lobo"**, hold ← ~0.7s, then → + BOP/WALLOP. Charge move.
   - Luchador spinning tail-whip, corkscrewing across the ring for multiple hits.
   - WALLOP travels further.

## Rules for both games
- **PF2 (3D):** projectiles travel along the line the fighters face. A sidestep can dodge them, which is how VF handles projectiles. Roll, torpedo and tornado are linear, so sidestepping beats them too.
- **Balance:** recovery must be punishable on whiff or block. Specials are not spammable. CPU players use them sensibly.
- **Visuals:** must meet the plush quality bar of the benchmark fighters Rubberta, Kevalanche and K8-E. Plush stays plush; flames and ink are stylised and soft, not gory. Add a sound for each special, reusing or synthesising audio like the existing SFX.
- **Practice mode:** the move list shows each special's motion with arrows, the BOP/WALLOP versions, and a tracking or linear tag (in PF2).
- **Keyboard:** the in-game keyboard legend/how-to-play mentions specials.
- **Move data:** store each fighter's move list as data (motion arrows, name, one-line description) and export it, so Run B's phone cheat sheet can read it.

## Shipping
- Release branch `pf2-release-4` off current `main`, touching ONLY `pillow-fight-2/index.html`. Then a separate release branch `bolster-release-specials`, touching ONLY `bolster/index.html`. One PR each.
- **Auto-merge** each of YOUR PRs (`gh pr merge <n> --merge`) only if ALL of these hold:
  - tests pass
  - build gate passes
  - online loopback stays in sync for 3+ minutes
  - zero console errors
  - 60 fps
- After merging, confirm the Pages deploy. Otherwise, leave the PR open with a comment explaining why.
- Before shipping, take a screenshot of each special mid-move and LOOK at them critically. Link them in the PR.
- Never push to `main`, never force-push, merge only your own PRs. No self-scheduled follow-ups and no polling.
