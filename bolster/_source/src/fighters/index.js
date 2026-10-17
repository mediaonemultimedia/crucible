/* The roster: every fighter's numbers. Pure data (and a few builder helpers)
   — the sim reads it, the AI reads it, the renderer reads the names.

   Units are the sim's: 1000 = one world unit (9 cm at plush scale); speeds
   in units per tick (60 ticks/s); frames are ticks. Boxes are relative to
   the fighter, x measured forward from his centre (so they mirror with his
   facing), y up from his feet: { x, y, w, h }.

   A move is a list of hits (each its own active window, box, damage and
   level), optional motion (forward velocity over a window, a hop), optional
   projectiles, an optional grab, and a total length. Startup is the first
   hit's `from`; recovery is what's left after the last hit's `to`.        */

export const MAX_METER = 1000;

const hit = (from, to, box, dmg, o = {}) => ({
  from, to, box, dmg, level: 'mid', hitstun: 16, blockstun: 11, push: 34, bpush: 0, kd: 0, chip: 0, pause: 8, ...o,
});
const move = (o) => ({ ext: null, total: 20, hits: [], motion: [], spawn: [], air: 0, cancel: 0, lite: 0, whiffLag: 0, low: 0, invuln: null, grab: null, kind: 'normal', ...o });

/* shared shape of the ordinary moves; each fighter tunes reach and power.

   Light (O): quick startup, short reach, low damage, fast recovery — the
   poke; -1 on block (safe), and it chains on contact into another light
   (three in a string, then a short lockout), the heavy, the signature or
   the special.
   Heavy (P): a wind-up of `hStart` frames (he rears back and loads it), then
   a lunge — the body steps in over `lunge` frames at `lungeV` per tick and
   the limb goes out well past the jab — more damage, a long recovery. While
   the limb is out his own hurt box goes out with it (`ext`), so a whiffed
   heavy can be punished — and a whiff adds `whiffLag` more. On block it's
   -9 to -11: the blocker gets out first and hits back with a light or a
   throw. On contact it cancels into the signature (S+P) or, on a full
   meter, the special.
   Throw (O+P together, close): grabs, holds, tosses — beats a blocker,
   escaped (teched) by O+P inside the first TECH ticks of the hold.       */
function normals({ tDmg = 100, lReach, hReach, cReach, lDmg = 40, hDmg = 85, cDmg = 35, aDmg = 55, ahDmg = 80, dDmg = 70, lY = 1800, hY = 1700, hStart = 14, hTotal = 42, lW = 900, hW = 1000, lungeV = 50, lunge = 8 }) {
  const lungeFrom = hStart - lunge + 2;
  return {
    light: move({ total: 14, cancel: 1, lite: 1, hits: [hit(4, 5, { x: lReach - lW, y: lY, w: lW, h: 700 }, lDmg, { hitstun: 18, blockstun: 8, push: 30, pause: 7 })] }),
    heavy: move({
      total: hTotal, cancel: 2, whiffLag: 6,
      motion: [{ from: lungeFrom, to: hStart + 1, vx: lungeV }],
      ext: { from: hStart - 1, to: hTotal - 12, x1: hReach - 500 },
      hits: [hit(hStart, hStart + 3, { x: hReach - hW, y: hY, w: hW, h: 900 }, hDmg, { hitstun: 21, blockstun: 15, push: 48, bpush: 16, pause: 11 })],
    }),
    lowLight: move({ total: 17, low: 1, cancel: 1, lite: 1, hits: [hit(5, 7, { x: cReach - 1000, y: 150, w: 1000, h: 650 }, cDmg, { level: 'low', hitstun: 17, blockstun: 9, push: 26, pause: 7 })] }),
    airLight: move({ total: 26, air: 1, hits: [hit(4, 18, { x: 100, y: -1000, w: 1100, h: 1800 }, aDmg, { level: 'high', hitstun: 16, blockstun: 11, pause: 8 })] }),
    airHeavy: move({ total: 32, air: 1, hits: [hit(7, 24, { x: 0, y: -1300, w: 1400, h: 2000 }, ahDmg, { level: 'high', hitstun: 20, blockstun: 14, push: 40, pause: 11 })] }),
    // the dive slam (S+P in the air): a hang, a fast drop — an overhead on
    // the way down — and the impact round his feet when he lands; a whiff
    // leaves him sat in the landing lag, long enough to punish
    dive: move({ total: 200, air: 1, dive: 520, hits: [hit(7, 199, { x: -300, y: -900, w: 1600, h: 1700 }, dDmg, { level: 'high', hitstun: 20, blockstun: 16, push: 36, pause: 10 })] }),
    diveLand: move({ total: 30, impact: 10, hits: [hit(0, 2, { x: -1100, y: 0, w: 2200 + 400, h: 700 }, 45, { level: 'high', hitstun: 18, blockstun: 12, push: 44, pause: 9 })] }),
    // the throw: a grab inside `near` of touching, a hold (the victim can
    // tech it), the toss — knockdown, unblockable, no combo after it
    throw: move({ kind: 'throw', total: 30, grab: { from: 4, to: 6, near: 520, hold: 'throwHold', throw: 1 } }),
    throwHold: move({ kind: 'throw', total: 44, hits: [hit(24, 24, null, tDmg, { auto: 1, level: 'unblockable', kd: 1, toss: 1, push: 0, pause: 10 })] }),
  };
}

/* a quick dash in (double-tap forward) and a short backdash (double-tap
   back): [ticks, speed per tick] */
const DASH = { f: [16, 150], b: [14, 100] };

/* projectiles: one of your own on screen at a time (the special's volley
   aside), a long recovery after the throw, slowish, at mid height (a jump
   clears it), and only a little chip on block                           */
export const FIGHTERS = {
  kevalanche: {
    id: 'kevalanche', name: 'Kevalanche', animal: 'Polar bear', flag: '🇨🇦', nation: 'ca', style: 'Boxer — quick jabs, heavy hooks',
    health: 1020, walkF: 56, walkB: 42, jumpV: 440, jumpX: 135, jumpB: 110, jumpG: 22, fallG: 30, grav: 12,
    push: { w: 1500, h: 2900 },
    hurt: { stand: { x: -760, y: 0, w: 1520, h: 3250 }, crouch: { x: -760, y: 0, w: 1520, h: 2300 }, air: { x: -700, y: 300, w: 1400, h: 2700 } },
    moves: {
      ...normals({ lReach: 1950, hReach: 2450, cReach: 1950, lDmg: 40, hDmg: 95, lY: 2000, hY: 1800, hStart: 14, hTotal: 42, lungeV: 72, lunge: 9, hW: 1200 }),
      signature: move({
        kind: 'signature', total: 46, invuln: { from: 1, to: 9, vs: 'air' },
        motion: [{ from: 5, to: 5, vy: 210 }, { from: 5, to: 14, vx: 22 }],
        hits: [hit(5, 13, { x: 100, y: 1600, w: 1300, h: 2600 }, 115, { kd: 1, hitstun: 24, blockstun: 16, push: 30, pause: 13, chip: 10 })],
      }),
      special: move({
        kind: 'special', total: 72, invuln: { from: 1, to: 5, vs: 'all' },
        motion: [{ from: 4, to: 44, vx: 74 }],
        hits: [6, 11, 16, 21, 26, 31, 36].map((f) => hit(f, f + 2, { x: 200, y: 1500, w: 1250, h: 1100 }, 30, { hitstun: 26, blockstun: 14, push: 4, pause: 5, chip: 5 }))
          .concat([hit(48, 52, { x: 200, y: 1300, w: 1500, h: 1600 }, 95, { kd: 1, push: 70, pause: 16, chip: 12 })]),
      }),
    },
    signatureName: 'Glacier Uppercut', specialName: 'Avalanche Rush',
    catchphrase: { main: 'Knocked out cold.', egg: 'You just lost to a pillow.' },
    impatient: 'Not yet, bud.',
  },

  rubberta: {
    id: 'rubberta', name: 'Rubberta', animal: 'Octopus', flag: '🇧🇷', nation: 'br', style: 'Capoeira; tentacles strike like long rubbery punches',
    health: 980, walkF: 52, walkB: 46, jumpV: 450, jumpX: 140, jumpB: 115, jumpG: 22, fallG: 30, grav: 12,
    push: { w: 2100, h: 2300 },
    hurt: { stand: { x: -950, y: 0, w: 1900, h: 2500 }, crouch: { x: -950, y: 0, w: 1900, h: 1700 }, air: { x: -850, y: 200, w: 1700, h: 2200 } },
    moves: {
      ...normals({ lReach: 2150, hReach: 2750, cReach: 2150, lDmg: 30, hDmg: 84, lY: 1300, hY: 1200, hStart: 13, hTotal: 42, lW: 1400, hW: 1900, lungeV: 36, lunge: 7 }),
      signature: move({
        kind: 'signature', total: 46, low: 1,
        hits: [hit(11, 15, { x: 400, y: 0, w: 2500, h: 650 }, 80, { level: 'low', kd: 1, hitstun: 24, blockstun: 14, push: 30, pause: 11, chip: 8 })],
      }),
      special: move({
        kind: 'special', total: 50, grab: { from: 8, to: 14, range: 3000, hold: 'specialHold' },
        hits: [hit(8, 14, { x: 300, y: 300, w: 2700, h: 2200 }, 0, { whiff: 1 })],
      }),
      specialHold: move({
        kind: 'special', total: 74,
        hits: [14, 26, 38, 50].map((f) => hit(f, f, null, 52, { auto: 1, level: 'unblockable', hitstun: 30, push: 0, pause: 7 }))
          .concat([hit(64, 64, null, 90, { auto: 1, level: 'unblockable', kd: 1, push: 80, pause: 16 })]),
      }),
    },
    signatureName: 'Tentacle Sweep', specialName: 'Abraço',
    catchphrase: { main: 'Eight arms, zero chances.', egg: 'Tentacle-ly speaking… you lost.' },
    impatient: 'Calma!',
  },

  johnny: {
    id: 'johnny', name: 'Johnny Deuce', animal: 'Leopard', flag: '🇳🇱', nation: 'nl', style: 'Racquet up close, tennis balls at range',
    health: 960, walkF: 60, walkB: 48, jumpV: 455, jumpX: 145, jumpB: 115, jumpG: 22, fallG: 30, grav: 12,
    push: { w: 1250, h: 2900 },
    hurt: { stand: { x: -640, y: 0, w: 1280, h: 3200 }, crouch: { x: -640, y: 0, w: 1280, h: 2200 }, air: { x: -600, y: 300, w: 1200, h: 2600 } },
    moves: {
      ...normals({ lReach: 2100, hReach: 2550, cReach: 2150, lDmg: 36, hDmg: 84, lY: 1700, hY: 1500, hStart: 13, hTotal: 40, lW: 1100, hW: 1400, lungeV: 45, lunge: 7 }),
      signature: move({
        kind: 'signature', total: 60,
        spawn: [{ at: 16, proj: { kind: 'ball', dx: 900, y: 1400, vx: 128, vy: 0, box: { w: 420, h: 420 }, dmg: 58, level: 'mid', life: 150, hitstun: 20, blockstun: 13, push: 36, chip: 4 } }],
      }),
      special: move({
        kind: 'special', total: 66,
        spawn: [10, 19, 28, 37, 46].map((at, k) => ({ at, proj: { kind: 'ball', dx: 900, y: 1500 + (k % 2) * 900, vx: 160, vy: 0, box: { w: 420, h: 420 }, dmg: 52, level: 'mid', life: 130, hitstun: 22, blockstun: 12, push: 20, chip: 4, kd: k === 4 ? 1 : 0, special: 1 } })),
      }),
    },
    signatureName: 'Serve', specialName: 'Match Point',
    catchphrase: { main: 'Game, set, match… sorry \'bout that.', egg: 'My mom has a better backhand, and she\'s a house cat.' },
    impatient: 'Nog niet!',
  },

  sumaura: {
    id: 'sumaura', name: 'Sumaura', animal: 'Panda', flag: '🇬🇧', nation: 'gb', style: 'Sumo',
    health: 1080, walkF: 46, walkB: 36, jumpV: 430, jumpX: 130, jumpB: 105, jumpG: 22, fallG: 31, grav: 12,
    push: { w: 1700, h: 2900 },
    hurt: { stand: { x: -880, y: 0, w: 1760, h: 3250 }, crouch: { x: -880, y: 0, w: 1760, h: 2300 }, air: { x: -820, y: 300, w: 1640, h: 2700 } },
    moves: {
      ...normals({ tDmg: 115, lReach: 1850, hReach: 2450, cReach: 1950, lDmg: 42, hDmg: 102, cDmg: 40, aDmg: 60, ahDmg: 92, lY: 1700, hY: 1500, hStart: 14, hTotal: 43, hW: 1300, lungeV: 75, lunge: 9 }),
      signature: move({
        kind: 'signature', total: 52, stopOnHit: 1,
        motion: [{ from: 11, to: 32, vx: 165 }],
        hits: [hit(12, 32, { x: 200, y: 900, w: 1200, h: 1800 }, 86, { kd: 1, hitstun: 24, blockstun: 8, push: 50, bpush: 30, pause: 13, chip: 10 })],
      }),
      special: move({
        kind: 'special', total: 92,
        motion: [{ from: 2, to: 40, vx: 16 }, { from: 46, to: 46, vy: 300 }, { from: 46, to: 64, vx: 34 }],
        hits: [6, 10, 14, 18, 22, 26, 30, 34, 38].map((f) => hit(f, f + 1, { x: 300, y: 1100, w: 1300, h: 1500 }, 19, { hitstun: 22, blockstun: 10, push: 3, pause: 4, chip: 3 }))
          .concat([hit(58, 76, { x: -400, y: -600, w: 1700, h: 1500 }, 125, { level: 'high', kd: 1, push: 60, pause: 18, chip: 14, landing: 1 })]),
      }),
    },
    signatureName: 'Bamboo Headbutt', specialName: 'Hundred Paw Slap → Royal Squash',
    catchphrase: { main: 'Right. That\'s you squashed.', egg: 'Blimey, you look absolutely cream crackered.' },
    impatient: 'Patience, love.',
  },

  k8e: {
    id: 'k8e', name: 'K8-E', animal: 'Giraffe', flag: '🇨🇦', nation: 'ca', style: 'Long reach; the neck stretches',
    health: 950, walkF: 50, walkB: 44, jumpV: 440, jumpX: 135, jumpB: 110, jumpG: 22, fallG: 30, grav: 12,
    push: { w: 1500, h: 5200 },   // the neck: nobody jumps over a giraffe
    hurt: { stand: { x: -800, y: 0, w: 1600, h: 3400 }, crouch: { x: -800, y: 0, w: 1600, h: 2400 }, air: { x: -750, y: 400, w: 1500, h: 2800 } },
    moves: {
      ...normals({ tDmg: 90, lReach: 2600, hReach: 3350, cReach: 2400, lDmg: 32, hDmg: 78, cDmg: 32, lY: 1900, hY: 1900, hStart: 15, hTotal: 44, lW: 1300, hW: 1700, lungeV: 20, lunge: 7 }),
      signature: move({
        kind: 'signature', total: 64,
        spawn: [{ at: 18, proj: { kind: 'ring', dx: 1200, y: 1450, vx: 100, vy: 0, box: { w: 600, h: 460 }, dmg: 60, level: 'mid', life: 180, hitstun: 20, blockstun: 13, push: 36, chip: 4 } }],
      }),
      special: move({
        kind: 'special', total: 64, track: 14,
        hits: [hit(30, 40, { abs: 1, x: -800, y: 0, w: 1600, h: 4200 }, 230, { level: 'high', kd: 1, hitstun: 30, blockstun: 20, push: 40, pause: 18, chip: 24 })],
      }),
    },
    signatureName: 'Ring Toss', specialName: 'Sky Neck',
    catchphrase: { main: 'Heads up next time, eh.', egg: 'I can see your house from up here. It\'s sad, eh.' },
    impatient: 'Not yet, bud.',
  },
};

export const dashOf = () => DASH;

export const ROSTER = ['kevalanche', 'rubberta', 'johnny', 'sumaura', 'k8e'];

/* the move a fighter's state names */
export const moveOf = (id, name) => FIGHTERS[id].moves[name];

/* frame data a player could read in a training mode (and the AI uses) */
export function frameData(m) {
  const first = m.grab ? m.grab.from : m.hits.length ? m.hits[0].from : m.spawn.length ? m.spawn[0].at : m.total;
  const last = m.grab ? m.grab.to : m.hits.length ? m.hits[m.hits.length - 1].to : first;
  return { startup: first, active: last - first + 1, recovery: m.total - last };
}

/* how far a move reaches from where he stood when he pressed it: the
   furthest hit box edge plus the ground the move itself covers before it */
export function reachOf(m) {
  let r = 0, last = 0;
  for (const h of m.hits) if (h.box && !h.box.abs) { r = Math.max(r, h.box.x + h.box.w); last = Math.max(last, h.to); }
  let travel = 0;
  for (const mo of m.motion) if (mo.vx) travel += mo.vx * Math.max(0, Math.min(mo.to, last) - mo.from + 1);
  return r + travel;
}

/* a move that throws something (and isn't the special's volley) */
export const isShot = (m) => m.kind === 'signature' && m.spawn.length > 0;
