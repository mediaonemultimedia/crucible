import * as THREE from 'three/webgpu';
import { canvasTex, mesh, srand } from './geo.js';
import { sceneryClearsRoad } from '../race/track.js';

const PALETTES = {
  landing: ['#e4313b', '#ffba24', '#177acf', '#f7e6c1'],
  laundry: ['#154c33', '#ed793b', '#d9ee43', '#f6e8cf'],
  hockey: ['#143364', '#eb3c63', '#5ee3f4', '#e7f4ff'],
  park: ['#095e67', '#f05d36', '#ffce42', '#d3fbcc'],
  dojo: ['#372244', '#a72c47', '#ffa946', '#f4d485'],
};

function decalAtlas(colors) {
  return canvasTex(512, 256, (g) => {
    const labels = ['FLUFF CO.', 'DOWN FEATHER', 'PIT CREW', 'RACE CLUB'];
    for (let i = 0; i < 4; i++) {
      const x = 256 * (i % 2), y = 128 * (i >> 1);
      g.fillStyle = colors[0]; g.fillRect(x, y, 256, 128);
      g.strokeStyle = colors[1 + i % 3]; g.lineWidth = 7; g.strokeRect(x + 8, y + 8, 240, 112);
      g.font = '28px "Archivo Black", sans-serif';
      g.textAlign = 'center';
      g.lineJoin = 'round';
      g.lineWidth = 5;
      g.strokeStyle = '#15142f';
      g.strokeText(labels[i], x + 128, y + 62, 208);
      g.fillStyle = colors[3];
      g.fillText(labels[i], x + 128, y + 62, 208);
      g.font = '700 15px "Barlow Condensed", sans-serif';
      g.fillText('FLUFFED & FURIOUS', x + 128, y + 90);
      for (let j = 0; j < 8; j++) {
        g.fillStyle = colors[(j + i) % 4];
        g.fillRect(x + 32 + j * 24, y + 105, 19, 5);
      }
    }
  });
}

export function dressCourse(world) {
  const { T, root } = world;
  const id = T.def.id;
  const colors = PALETTES[id];
  if (!colors) return;
  const paint = colors.map(color => new THREE.MeshStandardMaterial({ color, roughness: 0.66 }));
  const badge = new THREE.MeshBasicMaterial({ map: decalAtlas(colors), side: THREE.DoubleSide });
  const rng = srand(16181);
  const add = (geo, mat, x, y, z) => {
    const obj = mesh(geo, mat, x, y, z, root);
    obj.userData.noShadow = true;
    return obj;
  };
  const box = (m, x, y, z, w, h, d) => add(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  const cyl = (m, x, y, z, a, b, h, n = 10) => add(new THREE.CylinderGeometry(a, b, h, n), m, x, y, z);
  const safe = (x,z,hx,hz,top) => sceneryClearsRoad(T, x,z,hx,hz,0,0,top);
  const panel = (x,y,z,w,h,i,rotation = 0) => {
    const g = new THREE.PlaneGeometry(w,h), uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) {
      uv.setXY(k, (i % 2 + 0.006 + uv.getX(k) * 0.988) / 2,
        (1 - (i >> 1) + 0.006 + uv.getY(k) * 0.988) / 2);
    }
    add(g,badge,x,y,z).rotation.y = rotation;
  };
  const kiosk = (x,z,i) => {
    if (!safe(x,z,12,7,18)) return;
    box(paint[0],x,4.2,z,21,8.4,11);
    box(paint[1],x,9.3,z,23,1.8,13);
    box(paint[3],x,4.5,z+5.55,15,4.2,0.18);
    panel(x,13.8,z,21,7.6,i);
    for (const side of [-1,1]) {
      box(paint[2],x+side*8.5,5,z+5.7,0.6,7.2,0.4);
      box(paint[3],x+side*7.7,10.25,z,4.8,0.13,13);
    }
  };
  if (id === 'landing') {
    // Poster-sized decals sit inside the existing walls, above the furniture.
    for (const [x,y,z,w,h,i,rot] of [[42,49,-110.7,30,15,0,0],[195,68,-110.7,36,18,1,0],
      [357,75,110.7,34,16,2,Math.PI],[411,58,-39,34,17,3,-Math.PI/2]]) panel(x,y,z,w,h,i,rot);
    return;
  }

  const sites = [[-263,-113],[-255,127],[-84,181],[31,177],[278,93],[268,-124],[-26,-138]];
  for (const [i,[x,z]] of sites.entries()) {
    if (id === 'dojo') {
      if (!safe(x,z,6,6,18)) continue;
      cyl(paint[0],x,5.3,z,0.75,1,10.6);
      cyl(paint[1],x,12.1,z,2.2,2.2,4.1,8);
      cyl(paint[3],x,12,z,2.29,2.29,2.5,8);
      cyl(paint[0],x,14.4,z,0.5,2.8,1.6,8);
      box(paint[0],x,0.6,z,5,1.2,5);
    } else if (id === 'park') {
      if (!safe(x,z,11,11,30)) continue;
      const h = 15 + 9 * rng();
      cyl(paint[0],x,h/2,z,0.55,0.95,h);
      const can = add(new THREE.ConeGeometry(11,4,13),paint[i%2+1],x,h,z);
      can.rotation.z = (rng()-0.5)*0.2;
      for (let a = 0; a < 7; a++) {
        const angle = a*Math.PI*2/7;
        cyl(paint[3],x+Math.cos(angle)*8,h-1.7,z+Math.sin(angle)*8,1.05,1.05,0.35,6);
      }
      panel(x,h-5,z+2,13,4.8,i%4);
    } else kiosk(x,z,i%4);
  }
  // Distant landmarks use a few shared materials, then merge with the world.
  for (const [i,x] of [-236,-148,-55,50,153,245].entries()) {
    const z = -213;
    if (!safe(x,z,14,9,49)) continue;
    if (id === 'dojo') {
      const height = 13 + (i % 3) * 5;
      cyl(paint[0], x,height/2,z,1.1,1.6,height);
      for (let layer = 0; layer < 3; layer++) cyl(paint[1],x,height+layer*4,z,3-layer*0.6,12-layer*2,4,4);
    } else {
      box(paint[0],x,18,z,2.6,36,2.6);
      box(paint[3],x,36,z,12,4.4,3.5);
      for (let j = -1; j <= 1; j++) box(paint[(i%2)+1],x+j*3.3,36,z+1.85,2.65,2.42,0.22);
    }
  }
}
