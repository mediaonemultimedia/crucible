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
| `grommet/athletes/standing.js` | adds `sunk()` and `remap()` | Pillow Fight polish: where a biped's arm socket goes (inside the torso) and how a fraction along the old arm maps onto the longer chain |
| `grommet/athletes/bear.rig.js`, `leopard.rig.js`, `panda.rig.js` | the arm chains start at a socket sunk ~0.24 into the torso (the hand ends where it did); the bear's gloves and fur mask, the leopard's sleeves and fur mask remapped so they sit where they did along the visible arm | the arms read as separate pieces when turned far from their sewn pose (a punch, a guard): their round ends stood off the body. Grommet's own copies are untouched |

Not copied (not needed): the athletes' games other than `leopard.game.js`
(its racquet frame and constants are used), `main.js`, `tools.js`, `net.js`,
`crowprops.js`, `otterprops.js`, the other rigs; Flock's renderer (Grommet's
`softbody.js`, `body.js` and `fur.js` are Flock's, extended, and run the
octopus rig unchanged).

Flock's source branch has no README; its rig (`flock/rig.js`), face and
colourways (`flock/characters.js`) and arm-grasp state machine
(`flock/grasp.js`, for reference) come from `flock/_source/src/`.
