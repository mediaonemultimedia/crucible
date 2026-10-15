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
  from, to, box, dmg, level: 'mid', hitstun: 16, blockstun: 11, push: 34, kd: 0, chip: 0, pause: 8, ...o,
});
const move = (o) => ({ total: 20, hits: [], motion: [], spawn: [], air: 0, cancel: 0, low: 0, invuln: null, grab: null, kind: 'normal', ...o });

/* shared shape of the ordinary moves; each fighter tunes reach and power */
function normals({ lReach, hReach, cReach, lDmg = 40, hDmg = 85, cDmg = 35, aDmg = 55, ahDmg = 80, lY = 1800, hY = 1700, hStart = 9, hTotal = 34, lW = 900, hW = 1000 }) {
  return {
    light: move({ total: 16, cancel: 1, hits: [hit(4, 6, { x: lReach - lW, y: lY, w: lW, h: 700 }, lDmg, { hitstun: 15, blockstun: 10, push: 30, pause: 7 })] }),
    heavy: move({ total: hTotal, hits: [hit(hStart, hStart + 3, { x: hReach - hW, y: hY, w: hW, h: 900 }, hDmg, { hitstun: 21, blockstun: 15, push: 48, pause: 11 })] }),
    lowLight: move({ total: 17, low: 1, cancel: 1, hits: [hit(5, 7, { x: cReach - 1000, y: 150, w: 1000, h: 650 }, cDmg, { level: 'low', hitstun: 15, blockstun: 10, push: 26, pause: 7 })] }),
    airLight: move({ total: 22, air: 1, hits: [hit(4, 12, { x: 100, y: -700, w: 1100, h: 1500 }, aDmg, { level: 'high', hitstun: 16, blockstun: 11, pause: 8 })] }),
    airHeavy: move({ total: 26, air: 1, hits: [hit(7, 14, { x: 0, y: -1000, w: 1400, h: 1700 }, ahDmg, { level: 'high', hitstun: 20, blockstun: 14, push: 40, pause: 11 })] }),
  };
}

export const FIGHTERS = {
  kevalanche: {
    id: 'kevalanche', name: 'Kevalanche', animal: 'Polar bear', flag: '🇨🇦', nation: 'ca', style: 'Boxer — quick jabs, heavy hooks',
    health: 1000, walkF: 56, walkB: 42, jumpV: 262, jumpX: 50, grav: 12,
    push: { w: 1500, h: 2900 },
    hurt: { stand: { x: -760, y: 0, w: 1520, h: 3250 }, crouch: { x: -760, y: 0, w: 1520, h: 2300 }, air: { x: -700, y: 300, w: 1400, h: 2700 } },
    moves: {
      ...normals({ lReach: 1900, hReach: 2150, cReach: 1900, lDmg: 42, hDmg: 90, lY: 2000, hY: 1800, hStart: 8 }),
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
    health: 980, walkF: 52, walkB: 46, jumpV: 270, jumpX: 52, grav: 12,
    push: { w: 2100, h: 2300 },
    hurt: { stand: { x: -950, y: 0, w: 1900, h: 2500 }, crouch: { x: -950, y: 0, w: 1900, h: 1700 }, air: { x: -850, y: 200, w: 1700, h: 2200 } },
    moves: {
      ...normals({ lReach: 2500, hReach: 3050, cReach: 2500, lDmg: 36, hDmg: 80, lY: 1300, hY: 1200, hStart: 10, hTotal: 37, lW: 1500, hW: 1900 }),
      signature: move({
        kind: 'signature', total: 40, low: 1,
        hits: [hit(9, 14, { x: 400, y: 0, w: 2850, h: 650 }, 85, { level: 'low', kd: 1, hitstun: 24, blockstun: 14, push: 30, pause: 11, chip: 8 })],
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
    id: 'johnny', name: 'Johnny Deuce', animal: 'Leopard', flag: '🇨🇦', nation: 'ca', style: 'Racquet up close, tennis balls at range',
    health: 960, walkF: 60, walkB: 48, jumpV: 268, jumpX: 54, grav: 12,
    push: { w: 1250, h: 2900 },
    hurt: { stand: { x: -640, y: 0, w: 1280, h: 3200 }, crouch: { x: -640, y: 0, w: 1280, h: 2200 }, air: { x: -600, y: 300, w: 1200, h: 2600 } },
    moves: {
      ...normals({ lReach: 2200, hReach: 2500, cReach: 2150, lDmg: 38, hDmg: 82, lY: 1700, hY: 1500, hStart: 9, lW: 1200, hW: 1400 }),
      signature: move({
        kind: 'signature', total: 38,
        spawn: [{ at: 12, proj: { kind: 'ball', dx: 900, y: 2300, vx: 150, vy: 0, box: { w: 420, h: 420 }, dmg: 62, level: 'mid', life: 120, hitstun: 20, blockstun: 13, push: 36, chip: 6 } }],
      }),
      special: move({
        kind: 'special', total: 66,
        spawn: [10, 19, 28, 37, 46].map((at, k) => ({ at, proj: { kind: 'ball', dx: 900, y: 1500 + (k % 2) * 900, vx: 175, vy: 0, box: { w: 420, h: 420 }, dmg: 52, level: 'mid', life: 120, hitstun: 22, blockstun: 12, push: 20, chip: 6, kd: k === 4 ? 1 : 0, special: 1 } })),
      }),
    },
    signatureName: 'Serve', specialName: 'Match Point',
    catchphrase: { main: 'Game, set, match… sorry \'bout that.', egg: 'My mom has a better backhand, and she\'s a house cat.' },
    impatient: 'Not yet, bud.',
  },

  sumaura: {
    id: 'sumaura', name: 'Sumaura', animal: 'Panda', flag: '🇬🇧', nation: 'gb', style: 'Sumo',
    health: 1080, walkF: 46, walkB: 36, jumpV: 250, jumpX: 44, grav: 12,
    push: { w: 1700, h: 2900 },
    hurt: { stand: { x: -880, y: 0, w: 1760, h: 3250 }, crouch: { x: -880, y: 0, w: 1760, h: 2300 }, air: { x: -820, y: 300, w: 1640, h: 2700 } },
    moves: {
      ...normals({ lReach: 1950, hReach: 2200, cReach: 1950, lDmg: 46, hDmg: 98, cDmg: 40, aDmg: 60, ahDmg: 92, lY: 1700, hY: 1500, hStart: 10, hTotal: 38 }),
      signature: move({
        kind: 'signature', total: 46, stopOnHit: 1,
        motion: [{ from: 7, to: 7, vy: 120 }, { from: 7, to: 30, vx: 185 }],
        hits: [hit(8, 30, { x: 200, y: 900, w: 1200, h: 1800 }, 105, { kd: 1, hitstun: 24, blockstun: 16, push: 50, pause: 13, chip: 10 })],
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
    health: 950, walkF: 50, walkB: 44, jumpV: 255, jumpX: 46, grav: 12,
    push: { w: 1500, h: 3000 },
    hurt: { stand: { x: -800, y: 0, w: 1600, h: 3400 }, crouch: { x: -800, y: 0, w: 1600, h: 2400 }, air: { x: -750, y: 400, w: 1500, h: 2800 } },
    moves: {
      ...normals({ lReach: 2800, hReach: 3600, cReach: 2600, lDmg: 34, hDmg: 78, cDmg: 32, lY: 2800, hY: 2500, hStart: 12, hTotal: 40, lW: 1300, hW: 1700 }),
      signature: move({
        kind: 'signature', total: 42,
        spawn: [{ at: 14, proj: { kind: 'ring', dx: 1200, y: 2600, vx: 115, vy: 0, box: { w: 600, h: 500 }, dmg: 65, level: 'mid', life: 150, hitstun: 20, blockstun: 13, push: 36, chip: 6 } }],
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

export const ROSTER = ['kevalanche', 'rubberta', 'johnny', 'sumaura', 'k8e'];

/* the move a fighter's state names */
export const moveOf = (id, name) => FIGHTERS[id].moves[name];

/* frame data a player could read in a training mode (and the AI uses) */
export function frameData(m) {
  const first = m.hits.length ? m.hits[0].from : m.spawn.length ? m.spawn[0].at : m.grab ? m.grab.from : m.total;
  const last = m.hits.length ? m.hits[m.hits.length - 1].to : first;
  return { startup: first, active: last - first + 1, recovery: m.total - last };
}
