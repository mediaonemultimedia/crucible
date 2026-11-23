import * as THREE from 'three/webgpu';
import { canvasTex, mat, mesh, rbox } from './geo.js';

const navy = '#12388c';
const red = '#ed2537';
const cream = '#fff9e8';
const blue = '#1572ed';
const gold = '#ffba12';

const panels = [
  { title: 'FLUFFED AND FURIOUS', note: 'THE PILLOW FORT GRAND PRIX', base: navy, ink: cream },
  { title: 'PIT TUNNEL', note: 'KEEP TO THE TAPE', base: cream, ink: navy },
  { title: 'BANISTER', note: 'HOLD YOUR LINE', base: red, ink: cream },
  { title: 'SOCK DRAWER', note: 'THREAD THE GAPS', base: gold, ink: navy },
];

function panelAtlas() {
  return canvasTex(512, 512, (g, w) => {
    for (const [i, panel] of panels.entries()) {
      const y = i * 128;
      g.fillStyle = panel.base;
      g.fillRect(0, y, w, 128);
      g.fillStyle = panel.ink;
      for (const x of [12, w - 24]) {
        for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) {
          if ((r + c) % 2) g.fillRect(x + c * 6, y + 31 + r * 16, 6, 16);
        }
      }
      g.strokeStyle = panel.ink;
      g.lineWidth = 2;
      g.setLineDash([6, 5]);
      g.strokeRect(32, y + 10, w - 64, 108);
      g.setLineDash([]);
      g.textAlign = 'center';
      g.font = '900 49px "Bolster Display", sans-serif';
      g.fillText(panel.title, w / 2, y + 65, w - 96);
      g.font = '700 18px sans-serif';
      g.fillText(panel.note, w / 2, y + 96);
    }
  });
}

function sign(parent, material, panel, width, height, x, y, z) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.attributes.uv;
  for (let j = 0; j < uv.count; j++) {
    uv.setY(j, (3 - panel + (uv.getY(j) * 126 + 1) / 128) / 4);
  }
  const label = mesh(geometry, material, x, y, z, parent);
  label.userData.noShadow = true;
  return label;
}

// Landmarks sit beyond the collision envelope or above chase-camera height.
export function dressLanding(world) {
  const { T, root } = world;
  const signMat = new THREE.MeshBasicMaterial({ map: panelAtlas() });
  const cardboard = mat('#b17426', { roughness: 0.86 });
  const painted = [red, cream, blue, gold].map((color) => mat(color, { roughness: 0.76 }));
  const sections = new Map();
  for (let k = 0; k < T.N; k++) {
    const tag = T.def.points[T.sec[k]].tag;
    if (!sections.has(tag)) sections.set(tag, []);
    sections.get(tag).push(k);
  }
  const anchor = (tag, position) => {
    const samples = sections.get(tag);
    return samples[Math.round((samples.length - 1) * position)];
  };
  const place = (k) => {
    const group = new THREE.Group();
    group.position.set(T.x[k], T.y[k], T.z[k]);
    group.rotation.y = Math.atan2(T.tx[k], T.tz[k]) + Math.PI;
    root.add(group);
    return group;
  };

  // Cardboard gantry assembled from painted blocks, with cloth pennants below.
  const gate = (k, panel, height) => {
    const group = place(k);
    const half = T.w[k] + T.m[k] + 3.6;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        mesh(rbox(3.2, height / 4, 3.4, 0.22, 1), painted[(i + panel) % 4],
          side * half, height * (i + 0.5) / 4, 0, group);
      }
    }
    mesh(rbox(half * 2 + 3.2, 4.5, 1.6, 0.26, 1), cardboard, 0, height + 2.0, 0, group);
    sign(group, signMat, panel, half * 2 - 2, 4.4, 0, height + 2.0, 0.84);
    sign(group, signMat, panel, half * 2 - 2, 4.4, 0, height + 2.0, -0.84).rotation.y = Math.PI;
    for (let i = -6; i <= 6; i++) {
      const pennant = mesh(new THREE.ConeGeometry(0.62, 1.8, 3), painted[(i + 8) % 4],
        i * 1.8, height - 0.75 + Math.abs(i) * 0.04, 0.8, group);
      pennant.rotation.z = Math.PI;
    }
  };

  gate(anchor('duvet', 0.27), 0, 15);
  gate(anchor('banister', 0.24), 2, 12);

  const pit = anchor('underbed', 0.12);
  const pitGroup = place(pit);
  const pitEdge = T.w[pit] + T.m[pit] + 6.8;
  sign(pitGroup, signMat, 1, 11, 3.4, -pitEdge, 4.9, 0.55);
  mesh(rbox(11.2, 3.6, 0.9, 0.14, 1), cardboard, -pitEdge, 4.9, 0, pitGroup);
  for (let i = 0; i < 6; i++) {
    const k = anchor('underbed', (i + 0.5) / 6);
    const marker = place(k);
    for (const side of [-1, 1]) {
      const edge = T.w[k] + T.m[k] + 2.2;
      mesh(rbox(1.2, 0.55, 2.8, 0.07, 1), painted[i % 2 ? 1 : 2],
        side * edge, 0.3, 0, marker);
    }
  }

  const drawer = anchor('drawer', 0.34);
  const marker = place(drawer);
  const edge = T.w[drawer] + T.m[drawer] + 8;
  mesh(rbox(13.4, 4.5, 1, 0.2, 1), cardboard, edge, 6.8, 0, marker);
  sign(marker, signMat, 3, 13.2, 4.3, edge, 6.8, 0.55);
}
