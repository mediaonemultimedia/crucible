# Changes to the shared modules

Everything under `shared/` is copied from another piece's source branch (the
header of each file names the branch, commit and path) and kept as close to
unmodified as possible. Bolster extends the rigs from outside (`src/render/`).
The only edits:

| file | change | why |
|---|---|---|
| `grommet/fur.js` | the shading varyings (normal, strand, groom tangents) are multiplied by `modelWorldMatrix` | a fighter's mesh is turned to face the other and moved along the stage; lighting was computed in mesh-local space. For Grommet's untransformed mesh the matrix is the identity, so nothing changes there |
| `grommet/cloth.js` | the same for the cloth normal | same |
| `grommet/athletes/panda.rig.js` | adds `buildPandaSolo()` (one panda, the champion, at the origin facing +z) | Grommet's rig is two pandas in one ring; Sumaura is one |

Not copied (not needed): the athletes' games other than `leopard.game.js`
(its racquet frame and constants are used), `main.js`, `tools.js`, `net.js`,
`crowprops.js`, `otterprops.js`, the other rigs; Flock's renderer (Grommet's
`softbody.js`, `body.js` and `fur.js` are Flock's, extended, and run the
octopus rig unchanged).

Flock's source branch has no README; its rig (`flock/rig.js`), face and
colourways (`flock/characters.js`) and arm-grasp state machine
(`flock/grasp.js`, for reference) come from `flock/_source/src/`.
