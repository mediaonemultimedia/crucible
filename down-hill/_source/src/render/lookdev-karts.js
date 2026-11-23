import * as THREE from 'three/webgpu';
import { RACERS } from '../race/roster.js';
import { SKIN } from './karts.js';
import { canvasTex, mat, mergeStatic, mesh, rbox } from './geo.js';

const steering = {
  center: new THREE.Vector3(0, 1.05, 0.34),
  radius: 0.26,
  tilt: -0.62
};
const seating = { scale: 0.88, y: 0.09, z: -0.44 };

export const LOOKDEV_KARTS = [
  { id: 'kevalanche', paint: '#eeeee3', stripe: '#c92632', hub: '#254ba2', number: '88', badge: 'KEV 88', sponsor: 'DOWN FEATHER RACING' },
  { id: 'sumaura', paint: '#c82d30', stripe: '#ffe0a1', hub: '#ead29c', number: '19', badge: '19 LANDING', sponsor: 'FLUFF CO.' },
  { id: 'sebas', paint: '#19845d', stripe: '#fff5d8', hub: '#e7af53', number: '07', badge: 'EL BAJITO', sponsor: 'DOWN FEATHER RACING' },
  { id: 'k8e', paint: '#e5aa47', stripe: '#fff3d4', hub: '#9a5532', number: '08', badge: 'LONG NECK GT', sponsor: 'FLUFF CO.', seatY: -0.60 },
  { id: 'rubberta', paint: '#809aa4', stripe: '#fcdfce', hub: '#cc6855', number: '88', badge: 'TIN TUB', sponsor: 'FLUFF CO.', seatY: 0.41 },
  { id: 'johnny', paint: '#427d58', stripe: '#e2ee75', hub: '#d7ed55', number: '15', badge: 'DEUCE', sponsor: 'DOWN FEATHER RACING' },
  { id: 'zach', paint: '#a9afb2', stripe: '#bb3338', hub: '#d6a04c', number: '00', badge: 'ZACH', sponsor: 'FLUFF CO.', seatY: 0.16 }
];
const rubber = mat('#25272a', { roughness: 0.92 });
const frame = mat('#47494e', { metalness: 0.32, roughness: 0.36 });
const chrome = mat('#d7e0ea', { metalness: 0.55, roughness: 0.26 });
const lamp = mat('#fff0c3', { emissive: '#ffe3a7', emissiveIntensity: 0.25 });
const glass = mat('#302f2c', { roughness: 0.28 });
const redLens = mat('#ae2533', { emissive: '#790e1a', emissiveIntensity: 0.24 });
const ivory = mat('#f8e4ae');
const box = (root, m, size, at, radius = 0.08) => mesh(rbox(...size, radius, Math.min(...size) < 0.2 ? 1 : 2), m, ...at, root);

function tube(root, material, start, end, radius) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const axis = b.clone().sub(a);
  const pipe = mesh(new THREE.CylinderGeometry(radius, radius, axis.length(), 10), material,
    ...a.lerp(b, 0.5), root);
  pipe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
}

// Solid atlas swatches let each articulated wheel share one material and draw.
const wheelSwatches = ['#25272a', null, '#d7e0ea'];
const swatchX = (index) => 344 + index * 40;

function livery(spec) {
  const texture = canvasTex(512, 256, (g) => {
    const type = (label, x, y, size, color) => {
      g.font = `900 ${size}px Arial, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = color;
      g.fillText(label, x, y);
    };
    g.fillStyle = spec.paint;
    g.fillRect(4, 4, 248, 88);
    g.fillStyle = spec.stripe;
    g.fillRect(4, 68, 248, 18);
    g.fillStyle = '#fff7df';
    g.beginPath();
    g.arc(51, 48, 35, 0, Math.PI * 2);
    g.fill();
    type(spec.number, 51, 49, 32, '#202022');
    g.fillStyle = '#242528';
    g.fillRect(95, 26, 146, 30);
    type(spec.sponsor, 168, 42, 11, '#fff7df');

    g.fillStyle = '#242528';
    g.fillRect(260, 4, 248, 58);
    type(spec.badge, 384, 34, 35, '#fff5d9');

    g.fillStyle = spec.id === 'kevalanche' || spec.id === 'sumaura' ? spec.paint : spec.stripe;
    g.fillRect(269, 75, 22, 90);
    g.fillRect(297, 75, 10, 90);

    wheelSwatches.forEach((color, i) => {
      g.fillStyle = color ?? spec.hub;
      g.fillRect(swatchX(i), 192, 32, 32);
    });

    const word = 'FLUFF CO.';
    g.font = '900 15px Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#f3ebd8';
    [...word].forEach((letter, i) => {
      const angle = (i - (word.length - 1) / 2) * 0.17;
      g.save();
      g.translate(69 + Math.sin(angle) * 50, 185 - Math.cos(angle) * 50);
      g.rotate(angle);
      g.fillText(letter, 0, 0);
      g.restore();
    });
  });
  return new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, roughness: 0.56 });
}

function decal(root, material, rect, size, at, rx = 0, ry = 0) {
  const geometry = new THREE.PlaneGeometry(...size);
  const [x, y, w, h] = rect;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (x + uv.getX(i) * w) / 512, 1 - (y + (1 - uv.getY(i)) * h) / 256);
  }
  const panel = mesh(geometry, material, ...at, root);
  panel.rotation.set(rx, ry, 0);
}

function solidWheelPart(root, ink, geometry, swatch, x) {
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (swatchX(swatch) + 16) / 512, 1 - 208 / 256);
  return mesh(geometry, ink, x, 0, 0, root);
}

function chassis(root, ink, length, animateWheels) {
  const wheels = [];
  const wheelbase = Math.min(1, length / 3.1);
  box(root, frame, [1.64, 0.15, 2.18 * wheelbase], [0, 0.29, 0]);
  box(root, rubber, [1.02, 0.16, 0.76], [0, 0.43, -0.42]);
  box(root, rubber, [1.02, 0.48, 0.16], [0, 0.63, -0.82]);
  for (const side of [-1, 1]) {
    tube(root, frame, [side * 0.92, 0.38, -1.16 * wheelbase], [side * 0.92, 0.38, 1.16 * wheelbase], 0.074);
    for (const front of [true, false]) {
      const radius = front ? 0.34 : 0.49;
      const width = front ? 0.33 : 0.53;
      const x = side * 1.06;
      const z = (front ? 1.04 : -0.97) * wheelbase;
      tube(root, frame, [0, radius, z], [x, radius, z], 0.06);
      const pivot = new THREE.Group();
      pivot.position.set(x, radius, z);
      const outside = side * width / 2;
      solidWheelPart(pivot, ink, new THREE.CylinderGeometry(radius, radius, width, 24), 0, 0)
        .rotation.z = Math.PI / 2;
      solidWheelPart(pivot, ink, new THREE.CylinderGeometry(radius * 0.55, radius * 0.55, 0.06, 16), 1, outside)
        .rotation.z = Math.PI / 2;
      solidWheelPart(pivot, ink, new THREE.SphereGeometry(radius * 0.18, 10, 6), 2, outside + side * 0.032);
      decal(pivot, ink, [5, 121, 128, 128], [radius * 1.9, radius * 1.9],
        [outside + side * 0.005, 0, 0], 0, side * Math.PI / 2);
      if (animateWheels) {
        mergeStatic(pivot);
        pivot.userData.keep = true;
        pivot.userData.front = front;
        pivot.userData.r = radius;
        wheels.push(pivot);
      }
      root.add(pivot);
    }
  }
  for (const end of [-1, 1]) {
    const z = end * (length / 2 - 0.085);
    box(root, chrome, [2.16, 0.16, 0.17], [0, 0.42, z]);
    for (const side of [-1, 1]) {
      tube(root, chrome, [side * 0.94, 0.42, z], [side * 1.13, 0.42, z - end * 0.19], 0.075);
    }
  }
  tube(root, chrome, [0, 0.45, 0.54], [0, 1.03, 0.34], 0.047);
  const wheel = mesh(new THREE.TorusGeometry(steering.radius, 0.041, 8, 24), rubber,
    ...steering.center, root);
  wheel.rotation.x = steering.tilt;
  tube(root, frame, [-0.22, 1.05, 0.34], [0.22, 1.05, 0.34], 0.032);
  tube(root, chrome, [0.57, 0.26, -1.03], [0.57, 0.26, -length / 2 + 0.035], 0.075);
  const outlet = mesh(new THREE.CircleGeometry(0.051, 12), rubber, 0.57, 0.26, -length / 2 + 0.034, root);
  outlet.rotation.y = Math.PI;
  return wheels;
}

function shell(root, spec, kind, ink, length) {
  const paint = mat(spec.paint, { roughness: 0.3, metalness: 0.16 });
  const trim = mat(spec.stripe, { roughness: 0.38 });
  const nose = length / 2 - 0.13;
  const bus = kind === 'bus';
  const ice = kind === 'zamboni';
  const face = (height, y) => box(root, paint, [1.83, height, nose - 0.58], [0, y, (nose + 0.58) / 2], 0.13);

  if (bus) {
    face(0.97, 0.96);
    box(root, paint, [1.87, 0.26, 2.72], [0, 0.55, 0], 0.12);
    box(root, glass, [1.62, 0.32, 0.065], [0, 1.20, nose - 0.008]);
    box(root, trim, [0.062, 0.32, 0.074], [0, 1.20, nose + 0.002]);
    box(root, glass, [0.81, 0.17, 0.065], [0, 0.76, nose + 0.002]);
    for (const side of [-1, 1]) {
      for (const [y, depth] of [[0.77, 0.18], [1.19, 0.24]]) {
        for (const z of [0.76, 1.02, 1.26]) {
          box(root, glass, [0.032, depth, 0.2], [side * 0.915, y, z], 0.028);
        }
      }
      box(root, trim, [0.039, 0.055, 0.80], [side * 0.92, 0.97, 1.03]);
    }
  } else if (ice) {
    face(0.54, 0.75);
    box(root, paint, [1.59, 0.41, 0.69], [0, 0.98, nose - 0.46], 0.16);
    box(root, trim, [1.58, 0.08, 0.65], [0, 1.18, nose - 0.46]);
    box(root, mat(spec.hub), [1.88, 0.26, 0.44], [0, 0.48, -nose + 0.11], 0.10);
    tube(root, chrome, [-0.85, 0.19, -nose - 0.04], [0.85, 0.19, -nose - 0.04], 0.12);
  } else if (kind === 'lowrider') {
    face(0.39, 0.69);
    box(root, paint, [1.86, 0.29, 0.48], [0, 0.59, -nose + 0.17], 0.12);
    box(root, chrome, [1.10, 0.14, 0.06], [0, 0.64, nose + 0.005]);
    for (const side of [-1, 1]) {
      const fin = box(root, paint, [0.19, 0.26, 0.64], [side * 0.82, 0.83, -nose + 0.23]);
      fin.rotation.x = -0.25;
      mesh(new THREE.SphereGeometry(0.089, 10, 6), redLens, side * 0.76, 0.74, -nose - 0.095, root);
    }
  } else if (kind === 'roadster') {
    const bonnet = rbox(1.80, 0.39, nose - 0.58, 0.14, 2);
    const points = bonnet.attributes.position;
    for (let i = 0; i < points.count; i++) {
      points.setX(i, points.getX(i) * (0.88 - 0.32 * points.getZ(i)));
    }
    bonnet.computeVertexNormals();
    mesh(bonnet, paint, 0, 0.69, (nose + 0.58) / 2, root);
    mesh(new THREE.TorusGeometry(0.52, 0.047, 6, 16, Math.PI), chrome, 0, 0.57, -1, root);
    box(root, trim, [1.7, 0.10, 0.31], [0, 0.94, -nose + 0.12]);
    for (const side of [-1, 1]) tube(root, frame, [side * 0.55, 0.59, -1.07], [side * 0.55, 0.91, -nose + 0.12], 0.037);
  } else if (kind === 'washtub') {
    const tin = mat(spec.paint, { side: THREE.DoubleSide, metalness: 0.48, roughness: 0.33 });
    mesh(new THREE.CylinderGeometry(0.99, 0.85, 0.40, 24, 1, true), tin, 0, 0.58, 0.02, root);
    for (const [radius, thickness, height] of [[1, 0.054, 0.79], [0.91, 0.032, 0.53]]) {
      mesh(new THREE.TorusGeometry(radius, thickness, 6, 20), chrome, 0, height, 0.02, root).rotation.x = -Math.PI / 2;
    }
    for (const side of [-1, 1]) {
      mesh(new THREE.TorusGeometry(0.22, 0.037, 6, 12, Math.PI), chrome, side * 1.01, 0.74, 0.02, root)
        .rotation.set(0, Math.PI / 2, Math.PI);
      for (let i = 0; i < 3; i++) {
        mesh(new THREE.SphereGeometry(0.09 + i * 0.02, 8, 6), ivory, side * (0.83 - i * 0.09), 0.79, 0.46 + i * 0.09, root);
      }
    }
    box(root, paint, [1.54, 0.30, 0.25], [0, 0.67, nose - 0.12]);
  } else if (kind === 'ballmachine') {
    face(0.39, 0.69);
    const hopper = mesh(new THREE.CylinderGeometry(0.69, 0.47, 0.49, 18), paint, 0, 0.84, -1.14, root);
    hopper.scale.z = 0.56;
    const rim = mesh(new THREE.TorusGeometry(0.69, 0.036, 6, 20), chrome, 0, 1.08, -1.14, root);
    rim.rotation.x = Math.PI / 2;
    rim.scale.y = 0.56;
    const felt = mat('#cddb57', { roughness: 0.92 });
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI / 3;
      mesh(new THREE.SphereGeometry(0.143, 10, 8), felt, Math.cos(a) * 0.42 * (i < 6), 1.10 + 0.12 * (i === 6),
        -1.14 + Math.sin(a) * 0.22 * (i < 6), root);
    }
    tube(root, frame, [0, 0.69, -1.15], [0, 0.84, -nose - 0.04], 0.19);
    tube(root, chrome, [0, 0.81, -nose + 0.06], [0, 0.84, -nose - 0.05], 0.196);
  } else if (kind === 'cart') {
    const front = nose - 0.05;
    const rear = 0.57;
    box(root, paint, [1.73, 0.20, front - rear], [0, 0.59, (front + rear) / 2]);
    for (const y of [0.68, 0.98]) {
      tube(root, chrome, [-0.88, y, front], [0.88, y, front], 0.033);
      for (const side of [-1, 1]) tube(root, chrome, [side * 0.88, y, front], [side * 0.88, y, rear], 0.033);
    }
    for (let i = -4; i <= 4; i++) {
      const x = i * 0.21;
      tube(root, chrome, [x, 0.67, front], [x, 0.99, front], 0.015);
      if (i === 0) continue;
      const z = rear + Math.abs(i) * (front - rear) / 4;
      const side = Math.sign(i);
      tube(root, chrome, [side * 0.88, 0.67, z], [side * 0.88, 0.99, z], 0.016);
    }
    for (const side of [-1, 1]) {
      tube(root, chrome, [side * 0.74, 0.51, -1.04], [side * 0.79, 1.03, -1.35], 0.04);
      mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 12), ivory, side * 0.48, 0.74, front - 0.20, root);
    }
    tube(root, trim, [-0.80, 1.03, -1.35], [0.80, 1.03, -1.35], 0.068);
    mesh(new THREE.IcosahedronGeometry(0.21, 1), chrome, 0, 0.85, front - 0.20, root);
  }

  for (const side of [-1, 1]) {
    box(root, paint, [0.22, 0.36, 1.32], [side * 0.79, 0.62, 0.0], 0.10);
    decal(root, ink, [6, 6, 244, 84], [1.09, 0.28], [side * 0.904, 0.62, 0.01], 0, side * Math.PI / 2);
    mesh(new THREE.SphereGeometry(0.155, 14, 8), chrome, side * 0.70, 0.70, nose + 0.01, root);
    const lens = mesh(new THREE.SphereGeometry(0.125, 14, 8), lamp, side * 0.70, 0.70, nose + 0.096, root);
    lens.scale.z = 0.56;
  }
  decal(root, ink, [262, 6, 244, 54], [bus ? 1.33 : 0.94, bus ? 0.23 : 0.19],
    [0, bus ? 1.47 : ice ? 0.94 : 0.81, nose + 0.025]);
  if (bus) box(root, ivory, [1.79, 0.065, 0.79], [0, 1.46, nose - 0.38]);
  if (kind !== 'washtub' && kind !== 'cart') decal(root, ink, [264, 74, 47, 92], [0.42, bus ? 0.49 : ice ? 0.46 : 0.57],
    [0, bus ? 1.496 : ice ? 1.223 : 0.888, ice ? nose - 0.46 : nose - 0.39], -Math.PI / 2);
}

// Pose the existing plush particles once and keep both stances for the toggle.
export function driverStances(driver, body) {
  const plush = driver.p;
  const { x } = plush.soft;
  const standing = x.slice();
  driver.root.updateWorldMatrix(true, true);
  const toPlush = new THREE.Matrix4().copy(plush.group.matrixWorld).invert().multiply(body.matrixWorld);
  const start = new THREE.Vector3();
  const point = new THREE.Vector3();
  const middle = new THREE.Vector3();
  const curl = new THREE.Vector3();
  const end = new THREE.Vector3();
  const steeringUp = new THREE.Vector3(0, Math.cos(steering.tilt), Math.sin(steering.tilt));
  const octopus = plush.rig.name === 'octopus';
  const gripAngle = octopus ? -Math.PI / 7 : Math.PI / 9;
  const giraffe = plush.rig.name === 'giraffe';
  const tentacles = octopus ? plush.puppet.armsToward([0, 0, 1]) : [];
  const gripChains = new Set(tentacles.map((arm) => arm.k));
  for (const chain of plush.rig.arms) {
    if (!octopus && chain.kind !== 'arm' && chain.kind !== 'leg') continue;
    const indices = chain.idx;
    const socket = indices[0] * 3;
    start.fromArray(standing, socket);
    const side = Math.sign(start.x);
    const grips = chain.kind === 'arm' || gripChains.has(chain.k)
      || (giraffe && chain.name.includes('fore leg'));
    const steeringTentacle = gripChains.has(chain.k);
    if (grips) {
      end.copy(steering.center).addScaledVector(steeringUp, Math.sin(gripAngle) * steering.radius);
      end.x += side * Math.cos(gripAngle) * steering.radius;
      end.applyMatrix4(toPlush);
      middle.copy(start).lerp(end, 0.46);
      middle.x += side * 0.32;
      middle.y -= 0.32;
      if (steeringTentacle) {
        // Flare past the tub's sides, then turn inward below the eyes.
        middle.set(side * 1.64, 1.15, 0.06).applyMatrix4(toPlush);
        curl.set(side * 1.25, 1.22, 0.97).applyMatrix4(toPlush);
      }
    } else if (octopus) {
      end.set(0.79 * Math.sin(chain.angle), 0.66, -0.39 + 0.63 * Math.cos(chain.angle)).applyMatrix4(toPlush);
      middle.copy(start).lerp(end, 0.45);
      middle.y -= 0.26;
    } else {
      end.set(side * 0.40, 0.49, giraffe ? -0.86 : 0.61).applyMatrix4(toPlush);
      middle.set(side * 0.60, 0.91, giraffe ? -1.06 : 0.36).applyMatrix4(toPlush);
    }
    if (giraffe) {
      // The separately skinned felt hooves follow their leg tips.
      const tip = indices[indices.length - 1] * 3;
      const rest = plush.rig.rest;
      const delta = point.copy(end).sub(new THREE.Vector3().fromArray(standing, tip));
      for (const particle of plush.rig.clouds[0].ix) {
        const p = particle * 3;
        if (rest[p + 1] > 0.42 || Math.sign(rest[p]) !== side
            || Math.sign(rest[p + 2]) !== Math.sign(rest[tip + 2])) continue;
        x[p] = standing[p] + delta.x;
        x[p + 1] = standing[p + 1] + delta.y;
        x[p + 2] = standing[p + 2] + delta.z;
      }
    }
    for (let i = 1; i < indices.length; i++) {
      const t = i / (indices.length - 1);
      const u = 1 - t;
      if (steeringTentacle) {
        point.copy(start).multiplyScalar(u ** 3)
          .addScaledVector(middle, 3 * u * u * t)
          .addScaledVector(curl, 3 * u * t * t)
          .addScaledVector(end, t ** 3);
      } else {
        point.copy(start).multiplyScalar(u * u)
          .addScaledVector(middle, 2 * t * u)
          .addScaledVector(end, t * t);
      }
      point.toArray(x, indices[i] * 3);
    }
  }

  const seated = x.slice();
  x.set(standing);
  return (isNew) => {
    x.set(isNew ? seated : standing);
    plush.body.update(0);
    plush.cloth?.update(0);
    plush.gloves?.update(0);
    plush.wingFx?.update();
    if (plush.racquet) plush.racquet.visible = !isNew;
  };
}


// Build the same models in the turntable and in the opt-in race preview.
export function buildLookdevKart(kind, alt, original, { animateWheels = false } = {}) {
  const spec = LOOKDEV_KARTS.find(({ id }) => RACERS[id].kart === kind);
  const skin = alt ? alternateLivery(kind, spec) : spec;
  const length = new THREE.Box3().setFromObject(original.group).getSize(new THREE.Vector3()).z * 0.7;
  const group = new THREE.Group();
  const body = new THREE.Group();
  const seat = new THREE.Group();
  group.add(body);
  const ink = livery(skin);
  const wheels = chassis(body, ink, length, animateWheels);
  shell(body, skin, kind, ink, length);
  mergeStatic(body);
  body.add(seat);
  const plush = { ...seating, y: spec.seatY ?? seating.y };
  const parts = kind === 'ballmachine'
    ? { barrel: new THREE.Vector3(0, 0.84, -length / 2) }
    : { hydraulics: kind === 'lowrider' };
  const exhaust = [new THREE.Vector3(0.57, 0.26, -length / 2)];
  return { id: kind, group, body, seat, plush, parts, exhaust, wheels, detail: [] };
}

function alternateLivery(kind, spec) {
  const { body, trim, hub } = SKIN[kind][1];
  return { ...spec, paint: body, stripe: trim, hub };
}
