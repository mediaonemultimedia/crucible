import * as THREE from 'three/webgpu';
import { canvasTex, mesh, srand } from './geo.js';

export function clayMaterial() {
  const color = canvasTex(512, 512, (g, w, h) => {
    const random = srand(72037);
    const shade = g.createLinearGradient(0, 0, w, 0);
    for (const [u, ink] of [[0,'#a74724'],[0.08,'#ff6a30'],[0.30,'#ff8942'],[0.60,'#ff9349'],[0.90,'#fb762e'],[1,'#a74724']]) {
      shade.addColorStop(u, ink);
    }
    g.fillStyle = shade; g.fillRect(0,0,w,h);
    for (let i=0;i<10000;i++) {
      g.fillStyle = i % 2 ? '#ffd18a50' : '#79332131';
      const x=random()*w,y=random()*h;
      g.fillRect(x,y,0.8+random()*2.4,0.8+random()*2.4);
    }
    for (let i=0;i<90;i++) {
      const x=16+random()*(w-32), y=random()*h;
      g.strokeStyle = i%2 ? '#ffd59d22' : '#49251824';
      g.beginPath(); g.moveTo(x,y); g.quadraticCurveTo(x+5, y+12, x+1, y+35); g.stroke();
    }
    for (const x of [12,w-17]) {
      g.fillStyle='#e2c89c';
      g.fillRect(x,0,5,h);
      g.fillStyle='#fef0c228';
      g.fillRect(x+5,0,2,h);
    }
  }, { repeat: [1,1] });
  color.anisotropy = 4;
  return new THREE.MeshStandardMaterial({ map:color, side:THREE.DoubleSide, roughness:0.91 });
}

function crowdMap() {
  return canvasTex(1024, 288, (g,w,h) => {
    const rnd = srand(14018);
    const coats = ['#eb4f5d','#f17a4a','#5379b2','#ffe47c','#65b662','#278388','#fff4d5','#5fc6b3','#a681c6'];
    const faces = ['#f1c391','#c68962','#7a503f','#e8af84','#e5d3b0'];
    g.fillStyle='#1c3440';g.fillRect(0,0,w,h);
    for(let row=0;row<6;row++){
      const base=row*48;
      const step=g.createLinearGradient(0,base,0,base+48);
      step.addColorStop(0,'#18292e');step.addColorStop(0.22,'#223c42');step.addColorStop(1,'#42594e');
      g.fillStyle=step;g.fillRect(0,base,w,48);
      for(let x=17;x<w;x+=22){
        if (x % 176 < 12 || rnd()<0.11) continue;
        const u=x+(rnd()-0.5)*6, y=base+27+(rnd()-0.5)*9;
        const coat=coats[Math.floor(rnd()*coats.length)], face=faces[Math.floor(rnd()*faces.length)];
        g.fillStyle='#182b3290';g.beginPath();g.ellipse(u+2,y+9,10,5,0,0,Math.PI*2);g.fill();
        g.fillStyle=coat;g.beginPath();g.ellipse(u,y+4,8.4,8.2,0,0,Math.PI*2);g.fill();
        g.fillStyle=face;g.beginPath();g.ellipse(u,y-4,5.2,5.5,0,0,Math.PI*2);g.fill();
        g.fillStyle=coat;g.fillRect(u-5.3,y-9,10.8,3.0);
        if(rnd()>0.82){g.fillStyle='#f6e6bf';g.fillRect(u-8,y-16,17,8);g.fillStyle=coat;g.fillRect(u-6,y-14,13,4);}
      }
      g.fillStyle='#75847a';g.fillRect(0,base+45,w,2);
    }
  });
}

function skyMap() {
  return canvasTex(1024, 256, (g,w,h) => {
    const random=srand(774);
    const horizon=g.createLinearGradient(0,0,0,h);
    horizon.addColorStop(0,'#275dbe');horizon.addColorStop(0.35,'#4e9edf');
    horizon.addColorStop(0.48,'#90d9f0');horizon.addColorStop(0.57,'#ffe2b2');horizon.addColorStop(1,'#b6a189');
    g.fillStyle=horizon;g.fillRect(0,0,w,h);
    for(let i=0;i<21;i++){
      const x=random()*w,y=63+random()*54,r=13+random()*40;
      g.fillStyle=i%3?'#ffefd1a6':'#b5d1d2b5';
      for (const dx of [-w,0,w]) {
        g.beginPath();g.ellipse(x+dx,y,r,r*0.12,0,0,Math.PI*2);g.fill();
        g.beginPath();g.ellipse(x+dx-r*.37,y+2,r*.64,r*.13,0,0,Math.PI*2);g.fill();
      }
    }
    for (const [ink, height, amplitude] of [['#6ba58a',128,4.6],['#358d7a',132,3.8]]) {
      g.fillStyle=ink;g.beginPath();g.moveTo(0,h);
      for(let x=0;x<=w;x+=8) {
        const u=x/w*Math.PI*2;
        g.lineTo(x,height+Math.sin(u*7)*amplitude+Math.cos(u*3)*amplitude);
      }
      g.lineTo(w,h);g.fill();
    }
  });
}

export function buildCentreCourtStadium(world) {
  const {root}=world;
  const seats=new THREE.MeshBasicMaterial({map:crowdMap(),side:THREE.DoubleSide});
  const sky=new THREE.MeshBasicMaterial({map:skyMap(),side:THREE.BackSide,depthWrite:false});
  const dome=mesh(new THREE.SphereGeometry(810,48,24),sky,0,0,0,root);
  dome.renderOrder=-20;
  dome.userData.noShadow=true;
  const steel=new THREE.MeshStandardMaterial({color:'#24675c',roughness:0.64});
  const stone=new THREE.MeshStandardMaterial({color:'#dfc9a4',roughness:0.91});
  const trim=new THREE.MeshStandardMaterial({color:'#e2c493',roughness:0.68});
  const lamps=new THREE.MeshBasicMaterial({color:'#fff0bf'});
  const box=(parent,mat,x,y,z,w,h,d)=>mesh(new THREE.BoxGeometry(w,h,d),mat,x,y,z,parent);
  const flags=[];
  for (const [x,z,angle,span] of [[0,-188,0,544],[-293,3,Math.PI/2,386],[293,3,-Math.PI/2,386]]) {
    const stand=new THREE.Group();
    stand.position.set(x,0,z);stand.rotation.y=angle;root.add(stand);
    // One painted strip follows each set of sloped bleachers. The stair
    // breaks, rails and roof give it real depth from the chase camera.
    for(let i=0;i<4;i++){
      const cx=((i-1.5)/4)*span, width=span/4-3;
      box(stand,stone,cx,2,8,width,4,12);
      const deck=mesh(new THREE.PlaneGeometry(width,39),seats,cx,16,-0.5,stand);
      deck.rotation.x=-0.60;
      for(let r=0;r<6;r++){
        box(stand,steel,cx,5.3+3.63*r,15-r*5.25,width,0.42,0.42);
      }
      const roof=box(stand,steel,cx,33,-14,width,1.8,13);
      roof.rotation.x=-0.11;
      box(stand,trim,cx,32.4,-7.5,width,0.45,0.65);
      for (const side of [-1,1]) {
        box(stand,steel,cx+side*(width/2-0.8),17,-11,0.85,34,0.85);
        box(stand,trim,cx+side*width*.31,35,-13,0.22,5,0.22);
        const p=stand.localToWorld(new THREE.Vector3(cx+side*width*.31,36.8,-13));
        flags.push({ p,angle,phase:flags.length*0.91 });
      }
    }
    for (const side of [-1,1]) {
      const cx=side*span*.34;
      box(stand,steel,cx,25,-17,1.75,50,1.75);
      box(stand,steel,cx,50,-16,15,6,2.0);
      for (let i=0;i<4;i++) for(let j=0;j<2;j++)
        box(stand,lamps,cx+(i-1.5)*3.2,48.65+j*2.65,-14.91,2.65,2.0,0.30);
    }
  }
  const colors=['#e1f15f','#ff644c','#fff1cf','#49c4af'];
  const flagGeometry=new THREE.PlaneGeometry(6.4,3.2,3,1);
  const flagPos=flagGeometry.attributes.position;
  for (let i=0;i<flagPos.count;i++) {
    const x=flagPos.getX(i)+3.2;
    flagPos.setXYZ(i,x,flagPos.getY(i)*(1-x*.075),Math.sin(x*.85)*0.32);
  }
  flagGeometry.computeVertexNormals();
  const pennants=new THREE.InstancedMesh(flagGeometry,
    new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),flags.length);
  pennants.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pennants.frustumCulled=false;
  root.add(pennants);
  flags.forEach((_,i)=>pennants.setColorAt(i,new THREE.Color(colors[i%colors.length])));
  const pose=new THREE.Object3D();
  world.animateStadium=(time)=>{
    flags.forEach(({p,angle,phase},i)=>{
      pose.position.copy(p);
      pose.rotation.set(0,angle+Math.sin(time*2.75+phase)*0.31,Math.sin(time*3.4+phase)*0.07);
      pose.scale.x=0.90+0.10*Math.sin(time*3.1+phase);
      pose.updateMatrix();
      pennants.setMatrixAt(i,pose.matrix);
    });
    pennants.instanceMatrix.needsUpdate=true;
  };
  world.animateStadium(0);
}

export function buildTournamentSigns(root) {
  const evergreen = '#083b38', aubergine = '#342149';
  const ivory = '#fff6dc', lime = '#dcf164', coral = '#ff664f';
  const atlas = canvasTex(1024, 1024, (g) => {
    const text = (copy, x, y, font, color, width = 900) => {
      g.font = font; g.fillStyle = color; g.fillText(copy, x, y, width);
    };
    const sans = '"Bolster Condensed", sans-serif';
    const ball = (x, y, radius) => {
      g.fillStyle = lime; g.beginPath(); g.arc(x, y, radius, 0, Math.PI * 2); g.fill();
      g.save(); g.translate(x, y); g.rotate(-0.64);
      g.strokeStyle = evergreen; g.lineWidth = radius * 0.1;
      for (const side of [-1, 1]) {
        g.beginPath(); g.moveTo(side * radius * 0.55, -radius * 0.81);
        g.quadraticCurveTo(-side * radius * 0.06, 0, side * radius * 0.55, radius * 0.81);
        g.stroke();
      }
      g.restore();
    };
    const frame = (y, bg, stripe) => {
      g.fillStyle = bg; g.fillRect(0, y, 1024, 320);
      g.strokeStyle = stripe; g.lineWidth = 4; g.strokeRect(19, y + 17, 986, 286);
      g.fillStyle = stripe; g.fillRect(0, y, 1024, 8);
    };
    g.textBaseline = 'alphabetic';
    frame(0, evergreen, lime);
    text('JOHNNY DEUCE INVITATIONAL', 58, 82, `700 39px ${sans}`, lime, 680);
    text('Centre Court', 52, 207, 'italic bold 125px Georgia, serif', ivory, 746);
    g.fillStyle = lime; g.fillRect(57, 240, 647, 3);
    text('EXHIBITION  •  CLAY COURT', 57, 281, `700 26px ${sans}`, ivory);
    ball(882, 160, 64);
    g.strokeStyle = ivory; g.lineWidth = 2.5;
    g.strokeRect(800, 69, 166, 182);
    g.beginPath(); g.moveTo(800, 159); g.lineTo(966, 159); g.stroke();

    frame(336, evergreen, lime);
    g.fillStyle = lime; g.fillRect(19, 357, 986, 58);
    text('EXHIBITION SCORE', 54, 399, `700 36px ${sans}`, evergreen);
    g.fillStyle = '#18564d'; g.fillRect(41, 454, 942, 79); g.fillRect(41, 545, 942, 70);
    text('JOHNNY DEUCE', 65, 512, `700 51px ${sans}`, ivory);
    text('SEBAS PERRA', 65, 598, `700 51px ${sans}`, ivory);
    g.fillStyle = '#eaefc566'; g.fillRect(750, 454, 2, 161);
    text('40', 799, 512, 'bold 62px monospace', lime);
    text('30', 799, 598, 'bold 62px monospace', ivory);

    frame(672, aubergine, coral);
    g.fillStyle = coral;
    g.beginPath(); g.moveTo(708, 680); g.lineTo(1018, 680); g.lineTo(1018, 984); g.lineTo(872, 984); g.fill();
    text('OFFICIAL TOURNAMENT PARTNER', 56, 749, `700 34px ${sans}`, '#ff9b81');
    text('Seb’s Lucha Club', 51, 879, 'italic bold 96px Georgia, serif', ivory, 770);
    g.fillStyle = '#ff9783'; g.fillRect(55, 926, 641, 3);
    ball(908, 880, 35);
  });
  atlas.anisotropy = 4;
  const print = new THREE.MeshBasicMaterial({ map: atlas, side: THREE.DoubleSide });
  const rim = new THREE.MeshStandardMaterial({ color: '#ebd5a2', roughness: 0.67 });
  const post = new THREE.MeshStandardMaterial({ color: '#145951', roughness: 0.76 });
  for (const [cell, x, y, z, width] of [[0, 60, 34, -161, 83], [1, 173, 19, -149, 48], [2, -145, 24, -145, 57]]) {
    const height = width * 320 / 1024;
    mesh(new THREE.BoxGeometry(width + 1.4, height + 1.4, 1.4), rim, x, y, z, root);
    const sign = new THREE.PlaneGeometry(width, height);
    const uv = sign.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - (cell * 336 + 319 - uv.getY(i) * 318) / 1024);
    const flat = mesh(sign, print, x, y, z + 0.73, root);
    flat.userData.noShadow = true;
    for (const side of [-1, 1]) {
      const supportHeight = y - height / 2;
      mesh(new THREE.BoxGeometry(1.25, supportHeight, 1.3), post, x + width * 0.37 * side, supportHeight / 2, z, root);
    }
  }
}
