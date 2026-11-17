**CONTINUATION CHECK for tonight's Pillow Fight runs.** Repo: https://github.com/mediaonemultimedia/crucible.

Two runs fired this evening. You run after the weekly usage reset, in case either was cut off by a limit.
- **Run A (5pm PT):** motion special moves for all 7 fighters in PF1 (`bolster-source`) and PF2 (`pf2-source`). Spec: `pillow-fight-2/_source/docs/friday-nov20/run-a-specials.md` on `pf2-source`.
- **Run B (7:30pm PT):** the PF2 phone controller: QR pairing, cabinet stick and buttons, fighter themes, cheat sheet. Spec: `run-b-controller.md` in the same folder.

## Step 1: Check, cheaply
- Use `gh pr list --state all` and check for merged PRs from branches `pf2-release-4`, `bolster-release-specials` and `pf2-release-5`.
- Read the README status lines on `pf2-source` and `bolster-source`.
- Check the live sites:
  - https://mediaonemultimedia.github.io/crucible/pillow-fight-2/
  - https://mediaonemultimedia.github.io/crucible/bolster/

**If all three PRs merged and the READMEs say done, stop immediately** with a one-paragraph summary. Don't spend usage.

## Step 2: If something is missing
Finish it from where the source branches left off.
- **If a run still looks active** (commits in the last 15 minutes), wait up to 15 minutes, then continue on top of its pushes. Never discard its work.
- **Follow the original specs:** the two spec files, plus the README notes.
- **Push early:** commit and push the source branch after each piece.

## Shipping and quality bar
- Use the same release branches, each touching only that game's `index.html`. Create the branch if it doesn't exist; otherwise add to the open PR.
- **Auto-merge** your PR (`gh pr merge <n> --merge`) only if ALL of these hold, then confirm the Pages deploy:
  - tests pass
  - build gate passes
  - online stays in sync
  - zero console errors
  - 60 fps
- Never push to `main`, never force-push, merge only PRs from these branches. No self-scheduled follow-ups and no polling.
