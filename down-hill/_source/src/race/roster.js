/* The field: the seven Pillow Fight 2 fighters, each in a kart of their
   own. Pure data. Weight shades the handling a little (any pick can win):

     top    top speed (units/s)        accel  how fast it gets there
     grip   how hard it turns          mass   how hard it bumps others

   `kart` names the body the renderer builds (render/karts.js); `alt` is the
   ALT twin's re-skin of it. `voice` pitches the synthesised grunt and the
   engine hum (audio/kartsfx.js).                                          */

export const WEIGHTS = {
  heavy: { top: 28.6, accel: 14.2, grip: 0.93, mass: 1.35 },
  medium: { top: 28.1, accel: 15.3, grip: 1.0, mass: 1.0 },
  light: { top: 27.6, accel: 16.6, grip: 1.07, mass: 0.75 },
};

export const RACERS = {
  kevalanche: {
    name: 'Kevalanche', animal: 'Polar bear', flag: '🇨🇦', weight: 'heavy',
    kart: 'zamboni', kartName: 'The Resurfacer', altKart: 'Goon Squad Resurfacer',
    blurb: 'A stubby ice-resurfacer cart. Drifts throw snow.', voice: 0.78, hum: { wave: 'sawtooth', base: 52 },
    altName: 'Kevalanche — the goon',
  },
  sumaura: {
    name: 'Sumaura', animal: 'Panda', flag: '🇬🇧', weight: 'heavy',
    kart: 'bus', kartName: 'The Double-Decker', altKart: 'The Casino Royale',
    blurb: 'A squat red double-decker bus.', voice: 0.82, hum: { wave: 'square', base: 48 },
    altName: 'Sumaura — art-deco casino',
  },
  k8e: {
    name: 'K8-E', animal: 'Giraffe', flag: '🇨🇦', weight: 'medium',
    kart: 'roadster', kartName: 'The Long Neck GT', altKart: 'The Mosh Roadster',
    blurb: 'An open-top racing-stripe roadster. Neck way up out of the top.', voice: 1.12, hum: { wave: 'sawtooth', base: 70 },
    altName: 'K8-E — the punk',
  },
  sebas: {
    name: 'Sebas Perra', animal: 'Wolf', flag: '🇲🇽', weight: 'medium',
    kart: 'lowrider', kartName: 'El Bajito', altKart: 'El Rudo Bajito',
    blurb: 'A lowrider. Bounces on hydraulics on TAUNT.', voice: 0.95, hum: { wave: 'square', base: 58 },
    altName: 'Sebas — El Rudo',
  },
  rubberta: {
    name: 'Rubberta', animal: 'Octopus', flag: '🇧🇷', weight: 'light',
    kart: 'washtub', kartName: 'The Tin Tub', altKart: 'The Abyss Tub',
    blurb: 'A tin washtub on wheels. Tentacles paddle.', voice: 1.2, hum: { wave: 'triangle', base: 84 },
    altName: 'Rubberta — deep sea',
  },
  johnny: {
    name: 'Johnny Deuce', animal: 'Leopard', flag: '🇳🇱', weight: 'light',
    kart: 'ballmachine', kartName: 'The Ball Machine', altKart: 'The Padel Laser',
    blurb: 'A tennis-ball machine. Boosting fires balls out the back.', voice: 1.05, hum: { wave: 'sawtooth', base: 78 },
    altName: 'Johnny — padel laser',
  },
  zach: {
    name: 'Zach Sparrow', animal: 'Crow', flag: '🇨🇦', weight: 'light',
    kart: 'cart', kartName: 'The Five-Finger Discount', altKart: 'The Ghost Galleon Cart',
    blurb: 'A stolen shopping cart piled with shiny junk.', voice: 1.3, hum: { wave: 'square', base: 92 },
    altName: 'Zach — ghost pirate',
  },
};

// Range is measured from kart centre. Recovery includes the wind-up.
export const WALLOPS = {
  kevalanche: { name: 'Snowball Punch', pose: 'punch', range: 4.8, arc: 0.55, windup: 0.22, recovery: 1.65, stagger: 0.72, shove: 11 },
  sumaura:    { name: 'Bamboo Bash', pose: 'headbutt', range: 5.4, arc: 0.65, windup: 0.20, recovery: 1.4, stagger: 0.60, shove: 9 },
  k8e:        { name: 'Neck Check', pose: 'headbutt', range: 9.3, arc: 0.80, windup: 0.16, recovery: 0.88, stagger: 0.32, shove: 4 },
  sebas:      { name: 'Lowrider Headbutt', pose: 'headbutt', range: 5.8, arc: 0.62, windup: 0.18, recovery: 1.18, stagger: 0.53, shove: 8 },
  rubberta:   { name: 'Tentacle Sweep', pose: 'sweep', range: 6.6, arc: 0.1, windup: 0.24, recovery: 1.35, stagger: 0.40, shove: 6 },
  johnny:     { name: 'Court Punch', pose: 'punch', range: 6.2, arc: 0.62, windup: 0.15, recovery: 1.06, stagger: 0.44, shove: 7 },
  zach:       { name: 'Wing Clip', pose: 'sweep', range: 5.5, arc: 0.38, windup: 0.12, recovery: 0.96, stagger: 0.37, shove: 5 },
};

export const ORDER = ['kevalanche', 'sumaura', 'k8e', 'sebas', 'rubberta', 'johnny', 'zach'];

export const stats = (id) => WEIGHTS[RACERS[id].weight];

export function racerId(s) {
  const v = String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (RACERS[v]) return v;
  const alias = { k8: 'k8e', kate: 'k8e', sebasperra: 'sebas', johnnydeuce: 'johnny', zachsparrow: 'zach', kev: 'kevalanche' };
  return alias[v] || null;
}
