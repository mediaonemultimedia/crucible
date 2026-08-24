# Crucible

An ongoing series of real-time graphics studies.

Each piece takes one narrow technical question — how cloth settles, how a splat
cloud resolves, how type behaves as a cast object — and follows it far enough to
learn something. These are studies, not products. They're built to be looked at,
pulled apart, and abandoned when the question runs out.

Live at the repo's GitHub Pages URL. Or clone it and open `index.html` — it works
the same either way.

---

## The studies

| No. | Piece | | |
|:--|:--|:--|:--|
| 03 | **Mercury** | — | _pending rebuild_ |
| 04 | **Torsion** | — | _pending rebuild_ |
| 05 | **Torsion 2.0** | — | _pending rebuild_ |
| 06 | **Weft** | Real-time cloth study | _pending rebuild_ |
| 07 | **Cast** | Kinetic typography as a cast, lit, physical object | [`/cast/`](./cast/) |
| 08 | **Solve** | GPU compute fluid — pressure solve in WebGPU | [`/solve/`](./solve/) |
| 09 | **Torsion Pineapple** | Imported mesh driven through a torsion field | [`/torsion-pineapple/`](./torsion-pineapple/) |
| 10 | **Anneal** | Gaussian splats resolving out of disorder | [`/anneal/`](./anneal/) |

Studies 03–06 were lost to a storage failure and are being rebuilt. They'll be
added here as they land. Numbering follows build order, not merit — it starts at
03 because the first two experiments weren't kept.

---

## Tech

Built on [Three.js](https://threejs.org/), dropping to raw **WebGL** and
**WebGPU** where a study calls for it. Solve is pure WebGPU compute with no
Three.js at all.

**Single-file architecture.** Every study is one self-contained HTML file with
its shaders, geometry, fonts and textures inlined. There is no build step, no
package install, and no server required to view one — open the file in a browser
and it runs. The `src/` trees they were authored from live outside this repo;
what's committed here is the built artifact, which is the thing meant to be read
and shared.

This makes the files large (Cast is ~1 MB, Torsion Pineapple ~1.6 MB) and that's
the deliberate trade: a study you can email to someone, or open in five years,
beats a study that needs a working toolchain.

A modern browser with WebGL2 is required; Solve additionally requires WebGPU
(Chrome 113+, Edge 113+, or Safari 18+).

### Controls

Each piece carries its own panel and shares a common set of keys:

| Key | |
|:--|:--|
| `C` | toggle the control panel |
| `space` | pause / resume |
| `R` | reset |
| `← →` | scrub the timeline |
| drag | orbit the camera |

Individual studies add their own — Anneal cycles backdrops with `B`, Torsion
Pineapple replays with `G`.

Every study also carries a small index link in the top-left corner (`No. NN`)
that opens the series index and links across to the other pieces.

---

## Attribution

Studies **09 (Torsion Pineapple)** and **10 (Anneal)** are built from the
"Pineapple" mesh by **Rainbow** — <https://sketchfab.com/encoded01> — used under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

If you reuse either study, or the mesh data extracted into them, that
attribution has to travel with it.

---

## Archive

`/archive/` holds a handful of older, unrelated prototypes — ad-intelligence
dashboards, a 3D racket configurator, a field-morph sketch. They predate this
series, share none of its design language, and are kept only so their links
don't rot. Nothing in there is part of the series.
<!-- push access test 2026-08-24T22:02:27Z -->
