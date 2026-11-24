import * as THREE from 'three/webgpu';
import { canvasTex, mesh, srand } from './geo.js';

export function clayMaterial() {
  const color = canvasTex(512, 512, (g, w, h) => {
    const random = srand(72037);
    const shade = g.createLinearGradient(0, 0, w, 0);
    for (const [u, ink] of [[0,'#743b2b'],[0.08,'#a55232'],[0.30,'#be683d'],[0.60,'#c16b42'],[0.90,'#ae5d39'],[1,'#743b2b']]) {
      shade.addColorStop(u, ink);
    }
    g.fillStyle = shade; g.fillRect(0,0,w,h);
    for (let i=0;i<10000;i++) {
      g.fillStyle = i % 2 ? '#f4ad6764' : '#59291449';
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
    const coats = ['#b0354a','#c65f32','#475d7e','#e6c973','#477253','#355565','#dbc9a7','#648e90','#786487'];
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
    horizon.addColorStop(0,'#376b93');horizon.addColorStop(0.35,'#548bab');
    horizon.addColorStop(0.48,'#9dc0c8');horizon.addColorStop(0.57,'#f6d4a6');horizon.addColorStop(1,'#b6a189');
    g.fillStyle=horizon;g.fillRect(0,0,w,h);
    for(let i=0;i<21;i++){
      const x=random()*w,y=63+random()*54,r=13+random()*40;
      g.fillStyle=i%3?'#ffefd1a6':'#b5d1d2b5';
      for (const dx of [-w,0,w]) {
        g.beginPath();g.ellipse(x+dx,y,r,r*0.12,0,0,Math.PI*2);g.fill();
        g.beginPath();g.ellipse(x+dx-r*.37,y+2,r*.64,r*.13,0,0,Math.PI*2);g.fill();
      }
    }
    for (const [ink, height, amplitude] of [['#719383',128,4.6],['#547d6b',132,3.8]]) {
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
  const steel=new THREE.MeshStandardMaterial({color:'#274851',roughness:0.64});
  const stone=new THREE.MeshStandardMaterial({color:'#b6a58c',roughness:0.91});
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
  const colors=['#f4cc73','#ff734f','#d8eee6','#5ea592'];
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
