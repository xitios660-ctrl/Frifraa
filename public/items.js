/* Glossy 3D artwork with deterministic per-skin animation and animated lighting. */
(function(root){
 const TAU=Math.PI*2;
 const SKINS={rainbow:{cell:0,color:'#db7bff'},techbomb:{cell:1,color:'#5cdbff'},flame:{cell:2,color:'#ffb346'},skate:{cell:3,color:'#68e9ff'},skull:{cell:4,color:'#ffcd60'},tanks:{cell:5,color:'#ffb950'},glove:{cell:6,color:'#ff8655'},goldflame:{cell:7,color:'#ffe46d'},heart:{cell:8,color:'#ff6481'}};
 const variants={};
 const defaults={life:'heart',range:'flame',bomb:'techbomb',speed:'skate',shield:'heart',push:'rainbow',pierce:'tanks',maxrange:'goldflame',curse:'skull',kick:'glove'};
 function selectSkin(type,x,y,round=0){const choices=variants[type];return choices?choices[Math.abs(x+y+round)%choices.length]:defaults[type];}
 const tiles={},shine={};let loaded=false;
 function prepare(image){
  for(const [id,skin] of Object.entries(SKINS)){
   const tile=root.document.createElement('canvas');tile.width=tile.height=96;
   tile.getContext('2d').drawImage(image,skin.cell%3*256,Math.floor(skin.cell/3)*256,256,256,0,0,96,96);tiles[id]=tile;shine[id]=[];
   for(let i=0;i<16;i++){
    const mask=root.document.createElement('canvas');mask.width=mask.height=96;const c=mask.getContext('2d');c.drawImage(tile,0,0);c.globalCompositeOperation='source-in';
    const x=-35+i*11,g=c.createLinearGradient(x-14,0,x+14,12);g.addColorStop(0,'#ffffff00');g.addColorStop(.5,'#ffffffae');g.addColorStop(1,'#ffffff00');c.fillStyle=g;c.fillRect(0,0,96,96);shine[id].push(mask);
   }
  }
  loaded=true;
 }
 const ready=typeof root.Image==='function'?new Promise(resolve=>{const image=new root.Image();image.onload=()=>{prepare(image);resolve(true);};image.onerror=()=>resolve(false);image.src='/items/powerups-3d-v1.png';}):Promise.resolve(false);
 const DEFS={life:{color:'#ff456e',name:'Vida extra +1'},range:{color:'#ff9558',name:'Alcance'},bomb:{color:'#bb9aff',name:'Bomba extra'},speed:{color:'#65ebd2',name:'Velocidade'},shield:{color:'#79caff',name:'Escudo'},push:{color:'#d1b5ff',name:'Empurrar bomba'},pierce:{color:'#ff7ca6',name:'Perfurante'},maxrange:{color:'#ffe275',name:'Fogo +5 · raro'},curse:{color:'#c48aff',name:'Caveira · lentidão por 6s'},kick:{color:'#ff8655',name:'Luva · chutar bombas'}};
 function circle(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();}
 function shape(c,points,fill,stroke){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.4;c.stroke();}}
 function rect(c,x,y,w,h,r,color){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
 function frame(item,time){
  const age=time/1000+(item.x||0)*.73+(item.y||0)*.31,skin=item.skin||defaults[item.type]||'techbomb';
  let bob=Math.sin(age*3.4)*1.8,tilt=Math.sin(age*2.5)*.055,yaw=Math.sin(age*2)*.22,sx=1,sy=1,x=0;
  if(skin==='skate'){x=Math.sin(age*5)*1.3;tilt=Math.sin(age*5)*.09;}
  if(skin==='glove'){const punch=Math.pow(Math.max(0,Math.sin(age*3)),6);sx+=punch*.09;sy+=punch*.05;bob-=punch*1.5;}
  if(skin==='heart'){const beat=Math.pow(Math.max(0,Math.sin(age*5)),8);sx+=beat*.08;sy+=beat*.08;}
  if(skin==='flame'){sy+=Math.sin(age*9)*.04;tilt=Math.sin(age*4)*.06;}
  if(skin==='goldflame')yaw=Math.sin(age*2.5)*.4;
  if(skin==='skull'){tilt=Math.sin(age*2)*.11;bob=Math.sin(age*2.4)*2;}
  return{skin,bob,tilt,yaw,sx:sx*Math.cos(yaw),sy,x,pulse:.5+.5*Math.sin(age*4),phase:age,light:Math.floor((age*.65%1)*16)};
 }
 function fire(c,x,y,scale,t){
  c.save();c.translate(x,y);c.scale(scale,scale);
  shape(c,[[-10,10],[-12,2],[-7,-5],[-5,1],[0,-14],[4,-6],[5,-10],[11,0],[10,9],[5,13],[-5,13]],'#ff6c35','#ffe092');
  shape(c,[[-5,9],[-4,3],[0,-3],[3,3],[5,9],[0,12]],'#ffe786');circle(c,0,8,2.5,'#fff8d0');
  circle(c,Math.sin(t*5)*6,-17-(t*11%6),1.6,'#ffe786');c.restore();
 }
 function icon(c,type,t){
  if(type==='life'){
   c.save();c.translate(0,Math.sin(t*5)*1.2);c.scale(1.05,1.05);
   c.shadowColor='#ff406b';c.shadowBlur=8;
   shape(c,[[-14,-7],[-12,-14],[-4,-15],[0,-10],[4,-15],[12,-14],[14,-7],[12,0],[0,14],[-12,0]],'#fb4e77','#fff2c8');
   c.shadowBlur=0;c.font='bold 14px sans-serif';c.textAlign='center';c.textBaseline='middle';
   c.fillStyle='#fff6e8';c.fillText('+',0,-4);
   c.restore();
  }else if(type==='curse'){circle(c,0,0,13,'#eee3ff');circle(c,-5,-2,3,'#43304f');circle(c,5,-2,3,'#43304f');rect(c,-6,10,12,5,1,'#eee3ff');}
  else if(type==='kick'){circle(c,0,-2,13,'#ff7744');rect(c,-8,9,16,7,2,'#ffb751');}
  else if(type==='range')fire(c,0,0,1,t);
  else if(type==='bomb'){
   const g=c.createRadialGradient(-5,-4,1,0,2,12);g.addColorStop(0,'#9a80c1');g.addColorStop(1,'#211933');circle(c,-2,3,11,g);circle(c,-6,-2,2.5,'#ffffff7a');
   rect(c,-5,-10,7,5,1,'#aa96cc');c.strokeStyle='#ffeab3';c.lineWidth=2;c.beginPath();c.moveTo(-1,-10);c.quadraticCurveTo(0,-18,7,-13);c.stroke();circle(c,7,-13,2+Math.sin(t*12)*.5,'#fff1a4');
   rect(c,5,1,11,4,1,'#fff4bc');rect(c,8.5,-2.5,4,11,1,'#fff4bc');
  }else if(type==='speed'){
   c.save();c.rotate(Math.sin(t*7)*.13);shape(c,[[-8,-12],[4,-12],[2,2],[12,4],[14,10],[10,13],[-9,13],[-11,9],[-7,1]],'#5fefc9','#dcfff3');
   rect(c,-10,9,23,4,1,'#fff3cb');for(let i=0;i<3;i++)rect(c,-7,-7+i*4,9,1.5,1,'#1c7e85');c.restore();
   for(let i=0;i<3;i++)rect(c,-17-(t*14+i*3)%5,-5+i*5,5,1.5,1,'#a0ffed');
  }else if(type==='shield'){
   shape(c,[[0,-15],[13,-10],[11,5],[6,12],[0,16],[-6,12],[-11,5],[-13,-10]],'#408ae0','#c7f4ff');
   shape(c,[[0,-11],[9,-7],[7,4],[0,11],[-7,4],[-9,-7]],'#83dcfa');
   c.save();c.rotate(Math.sin(t*3)*.1);shape(c,[[0,-7],[2,-1],[7,0],[2,2],[0,8],[-2,2],[-7,0],[-2,-1]],'#f3ffff');c.restore();
  }else if(type==='push'){
   c.save();c.translate(0,Math.sin(t*5));c.globalAlpha=.85+.15*Math.sin(t*4);
   c.fillStyle='#eee3ff';c.strokeStyle='#b393ee';c.lineWidth=1.5;c.beginPath();c.moveTo(-12,14);c.lineTo(-12,-2);c.bezierCurveTo(-12,-19,12,-19,12,-2);c.lineTo(12,14);c.lineTo(6,10);c.lineTo(0,14);c.lineTo(-6,10);c.closePath();c.fill();c.stroke();
   circle(c,-4,-2,2.5,'#533b7b');circle(c,5,-2,2.5,'#533b7b');circle(c,1,5,1.8,'#9e78c1');c.restore();
   for(const x of [-17,16])circle(c,x,Math.sin(t*5+x)*7,1.6,'#e4ccff');
  }else if(type==='pierce'){
   c.save();c.rotate(-Math.PI/4);shape(c,[[-8,9],[-8,-4],[0,-16],[8,-4],[8,9]],'#ef7199','#ffe3c7');
   for(let i=0;i<4;i++)rect(c,-6,-4+i*4,12,1.8,1,i%2?'#ffe2ac':'#923c70');rect(c,-10,9,20,5,2,'#5a365c');c.restore();
   for(let i=0;i<3;i++)circle(c,13+Math.sin(t*9+i)*3,-12+i*4,1,'#ffebb5');
  }else if(type==='maxrange'){
   for(let i=0;i<8;i++){const a=i*TAU/8+t*.6;c.save();c.rotate(a);rect(c,14,-1,3+Math.sin(t*5+i)*1.5,2,1,'#ffe99a');c.restore();}
   fire(c,0,0,.85,t);shape(c,[[-11,-12],[-10,-19],[-5,-15],[0,-21],[5,-15],[10,-19],[11,-12]],'#ffe46c','#fff8c7');
  }
 }
 function accents(c,skin,t,color){
  if(skin==='flame'||skin==='tanks'){
   for(let i=0;i<3;i++){const a=(t*.85+i/3)%1;circle(c,Math.sin(i*2+t)*9,-8-a*14,1.4*(1-a),i%2?'#fff0a4':color);}
  }else if(skin==='skate'){
   for(let i=0;i<3;i++){c.globalAlpha=.65*(1-(t*1.8+i/3)%1);rect(c,-22,-3+i*5,5,1,1,color);}c.globalAlpha=1;
  }else if(skin==='glove'){
   const hit=Math.pow(Math.max(0,Math.sin(t*3)),6);c.globalAlpha=hit;
   for(let i=0;i<3;i++){c.save();c.rotate(-.5+i*.5);rect(c,18,-1,4,1.5,1,'#ffe4ad');c.restore();}c.globalAlpha=1;
  }else if(skin==='heart'){
   const age=(t*.75)%1;c.globalAlpha=(1-age)*.8;const x=12+Math.sin(t)*2,y=-5-age*15;
   circle(c,x-1,y,1.7,color);circle(c,x+1,y,1.7,color);shape(c,[[x-2.5,y],[x+2.5,y],[x,y+4]],color);c.globalAlpha=1;
  }else if(skin==='techbomb'){
   c.globalAlpha=.2+.35*(.5+.5*Math.sin(t*5));circle(c,-5,-3,4,'#84f6ff');c.globalAlpha=1;
  }else if(skin==='skull'){
   c.globalAlpha=.3+.5*(.5+.5*Math.sin(t*3));for(const x of [-6,6])circle(c,x,-3,1.7,'#ffc75e');c.globalAlpha=1;
  }else{
   for(let i=0;i<3;i++){const a=t*1.7+i*TAU/3,x=Math.cos(a)*20,y=Math.sin(a)*10;c.globalAlpha=.3+.4*(.5+.5*Math.sin(a));circle(c,x,y,1.2,i%2?'#fff0bb':color);}c.globalAlpha=1;
  }
 }
 function drawSkin(c,skin,time,size=44,seed={x:0,y:0}){
  if(!loaded||!SKINS[skin])return false;
  const f=frame({...seed,skin},time),color=SKINS[skin].color;
  c.save();c.scale(size/44,size/44);c.translate(f.x,f.bob);c.rotate(f.tilt);
  // A small perspective turn preserves readable silhouettes; the highlight moves over alpha-masked artwork.
  c.transform(f.sx,Math.sin(f.yaw)*.12,Math.sin(f.yaw)*.08,f.sy,0,0);
  c.drawImage(tiles[skin],-22,-22,44,44);c.globalAlpha=.3;c.drawImage(shine[skin][f.light],-22,-22,44,44);c.globalAlpha=1;
  accents(c,skin,f.phase,color);c.restore();return true;
 }
 function draw(c,item,time){
  const def=DEFS[item.type];if(!def)return;
  const skin=item.skin||defaults[item.type],f=frame({...item,skin},time),x=item.x*48+24,y=item.y*48+24;
  c.save();c.beginPath();c.rect(item.x*48,item.y*48,48,48);c.clip();c.translate(x,y);
  c.fillStyle='#08051b66';c.beginPath();c.ellipse(0,18,13-f.bob*.5,4.5,0,0,TAU);c.fill();
  const color=SKINS[skin]?.color||def.color,glow=c.createRadialGradient(0,0,3,0,0,23);glow.addColorStop(0,color+'36');glow.addColorStop(1,color+'00');circle(c,0,0,23,glow);
  if(item.type==='life'||!drawSkin(c,skin,time,44,item)){c.translate(0,f.bob);icon(c,item.type,f.phase);}
  c.restore();
 }
 const api={DEFS,SKINS,defaults,variants,selectSkin,frame,icon,draw,drawSkin,ready,hasArt:()=>loaded};if(typeof module!=='undefined')module.exports=api;else root.BombaItems=api;
})(typeof window!=='undefined'?window:globalThis);
