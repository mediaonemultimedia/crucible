# Crucible — rules for Codex
- Repo: mediaonemultimedia/crucible. Source lives on branches: kart-source (down-hill/_source/), pf2-source (pillow-fight-2/_source/). main only holds built index.html files and is published to GitHub Pages.
- Always `git pull` before starting. Commit + push to the source branch when done. NEVER push to main, never force-push. Releases go via a PR (kart-release-N off main) that Kevin merges.
- Before working, read: down-hill/_source/README.md, down-hill/_source/docs/*.md (stage-1 to stage-5, bounce-glitch), and these notes from Claude's memory:
  ~/.claude/projects/-Users-kevincave-Desktop-Claude/memory/project_down-hill-kart.md
  ~/.claude/projects/-Users-kevincave-Desktop-Claude/memory/feedback_bolster-visual-quality.md
  ~/.claude/projects/-Users-kevincave-Desktop-Claude/memory/user_kevin-creative-profile.md
  ~/.claude/projects/-Users-kevincave-Desktop-Claude/memory/feedback_big-qr-codes.md
- Originality: genre mechanics are fine, but every kart, item, name, decal and look is ours. No copying any existing game.
- Performance: 60 fps with 8 karts and in 4-way split screen. Prefer merged geometry, shared materials and texture decals over extra meshes. Report frame cost before and after.
- Never use ElevenLabs. No network calls in the built game.
- Verify in a browser (screenshots) before saying something is done. Keep replies short.
