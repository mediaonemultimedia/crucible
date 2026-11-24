import * as THREE from 'three/webgpu';
import { canvasTex, mesh } from './geo.js';
import { locateGlobal, rightX, rightZ, sceneryClearsRoad } from '../race/track.js';

const LOOKS = {
  hockey: {
    dark:'#102855', accent:'#4de3ff', pop:'#ff4769', paper:'#f7faff',
    title:'RINK 88', note:'OVERTIME • ICE CIRCUIT', shortcut:'PENALTY BOX JUMP', second:'UNDER THE FLYOVER',
    font:'105px Bungee, sans-serif', main:[-18,41,-163,101],
  },
  park: {
    dark:'#004e62', accent:'#ffe748', pop:'#ff704c', paper:'#fff7d4',
    title:'Rubberta’s Rapids', note:'CIRCUITO DAS ÁGUAS', shortcut:'THE FLUME', second:'SPLASH JUMP',
    font:'102px "Bolster Display", sans-serif', main:[-8,42,-185,101],
  },
  dojo: {
    dark:'#311643', accent:'#ffb94d', pop:'#f85876', paper:'#fff1d3',
    title:'Midnight Dojo', note:'SUMAURA’S MOON GATE', shortcut:'ROOFTOP CROSSOVER', second:'LANTERN COURTYARD',
    font:'italic bold 120px Georgia, serif', main:[-6,41,-176,90],
  },
};

function emblem(g,id,x,y,L) {
  g.save();g.translate(x,y);
  g.fillStyle=L.accent;
  if (id==='hockey') {
    g.beginPath();g.moveTo(-66,-58);g.lineTo(66,-58);g.lineTo(61,27);g.lineTo(0,65);g.lineTo(-61,27);g.closePath();g.fill();
    g.fillStyle=L.dark;g.font='52px Bungee, sans-serif';g.textAlign='center';g.fillText('88',0,14);
  } else if (id==='park') {
    g.beginPath();g.arc(0,0,60,0,Math.PI*2);g.fill();
    g.strokeStyle=L.dark;g.lineWidth=8;g.lineCap='round';
    for(const dy of [-16,2,20]){
      g.beginPath();g.moveTo(-38,dy);
      g.bezierCurveTo(-15,dy-23,1,dy+20,35,dy-4);g.stroke();
    }
  } else {
    g.beginPath();g.arc(0,0,57,0,Math.PI*2);g.fill();
    g.fillStyle=L.dark;g.beginPath();g.arc(24,-18,47,0,Math.PI*2);g.fill();
    g.strokeStyle=L.pop;g.lineWidth=5;g.strokeRect(-67,-66,134,132);
  }
  g.restore();
}

function makeAtlas(id,L) {
  return canvasTex(1024,1024,g=>{
    const type='700 35px "Bolster Condensed", sans-serif';
    for (const [n,title] of [L.title,L.shortcut,L.second].entries()) {
      const y=n*336;
      g.fillStyle=L.dark;g.fillRect(0,y,1024,320);
      g.strokeStyle=L.accent;g.lineWidth=4;g.strokeRect(15,y+15,994,290);
      g.fillStyle=L.pop;g.fillRect(0,y,1024,9);
      if(id==='hockey'){
        g.fillStyle=L.pop;g.fillRect(23,y+34,13,252);
        g.fillStyle=L.accent;g.fillRect(40,y+34,5,252);
      } else if(id==='park'){
        g.fillStyle=L.pop;g.beginPath();g.moveTo(775,y+24);g.lineTo(999,y+24);g.lineTo(999,y+296);g.lineTo(835,y+296);g.closePath();g.fill();
      } else {
        g.strokeStyle=L.pop;g.lineWidth=2;
        g.strokeRect(26,y+26,972,268);
      }
      g.textAlign='left';
      g.fillStyle=L.accent;g.font=type;g.fillText(L.note,74,y+84,690);
      g.fillStyle=L.paper;g.font=n===0?L.font:'700 94px "Bolster Condensed", sans-serif';
      g.fillText(title,70,y+207,710);
      g.strokeStyle=L.accent;g.lineWidth=3;
      g.beginPath();g.moveTo(74,y+239);g.lineTo(715,y+239);g.stroke();
      emblem(g,id,886,y+160,L);
    }
  });
}

export function buildTrackBranding(world) {
  const {root,T}=world, id=T.def.id, L=LOOKS[id];
  if(!L) return;
  const sign=new THREE.MeshBasicMaterial({map:makeAtlas(id,L),side:THREE.DoubleSide});
  const frame=new THREE.MeshStandardMaterial({color:L.accent,roughness:0.75});
  const support=new THREE.MeshStandardMaterial({color:L.dark,roughness:0.76});
  sign.map.anisotropy=4;
  const place=(cell,x,y,z,w,angle=0)=>{
    const group=new THREE.Group();group.position.set(x,y,z);group.rotation.y=angle;root.add(group);
    const h=w*320/1024;
    const trim=mesh(new THREE.BoxGeometry(w+0.7,h+0.7,0.84),frame,0,0,0,group);
    trim.userData.noShadow=true;
    const geometry=new THREE.PlaneGeometry(w,h),uv=geometry.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setY(i,1-(cell*336+319-uv.getY(i)*318)/1024);
    for(const side of [-1,1]){
      const face=mesh(geometry,sign,0,0,0.45*side,group);
      face.rotation.y=side===1?0:Math.PI;face.userData.noShadow=true;
      const height=y-h/2;
      const upright=mesh(new THREE.BoxGeometry(0.9,height,0.9),support,side*w*.35,-h/2-height/2,0,group);
      upright.userData.noShadow=true;
    }
  };
  place(0,...L.main);
  // Signs flank the road and face approaching racers. Search a short stretch
  // for clearance from both layers before placing a ground-supported panel.
  const start=locateGlobal(T,T.def.start[0],T.def.start[2],T.def.start[1]);
  for(const [cell,distance,side] of [[0,98,1],[1,355,-1],[2,810,1]]){
    const width=cell===0?28:22;
    for(let q=0;q<68;q+=4){
      const k=(start+distance+q)%T.N;
      const shift=T.w[k]+T.m[k]+width/2+3;
      const x=T.x[k]+rightX(T,k)*shift*side, z=T.z[k]+rightZ(T,k)*shift*side;
      const angle=Math.atan2(T.tx[k],T.tz[k])+Math.PI-0.30*side, y=T.y[k]+8.5;
      if(!sceneryClearsRoad(T,x,z,width/2+0.4,0.5,angle,0,y+width*0.16)) continue;
      place(cell,x,y,z,width,angle);
      break;
    }
  }
}
