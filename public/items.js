/* Original vector item art. Shared clock drives bobbing, sparks and icon motion. */
(function(root){
 const TAU=Math.PI*2;
 const DEFS={range:{color:'#ff9558',name:'Alcance'},bomb:{color:'#bb9aff',name:'Bomba extra'},speed:{color:'#65ebd2',name:'Velocidade'},shield:{color:'#79caff',name:'Escudo'},bombpass:{color:'#d1b5ff',name:'Passa-bomba'},pierce:{color:'#ff7ca6',name:'Perfurante'},maxrange:{color:'#ffe275',name:'Chama máxima'}};
 function circle(c,x,y,r,color){c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();}
 function shape(c,points,fill,stroke){c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1.4;c.stroke();}}
 function rect(c,x,y,w,h,r,color){c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();}
 function frame(item,time){const age=time/1000+item.x*.73+item.y*.31;return{bob:Math.sin(age*3.4)*2.4,tilt:Math.sin(age*2.5)*.055,pulse:.5+.5*Math.sin(age*4),phase:age};}
 function fire(c,x,y,scale,t){
  c.save();c.translate(x,y);c.scale(scale,scale);
  shape(c,[[-10,10],[-12,2],[-7,-5],[-5,1],[0,-14],[4,-6],[5,-10],[11,0],[10,9],[5,13],[-5,13]],'#ff6c35','#ffe092');
  shape(c,[[-5,9],[-4,3],[0,-3],[3,3],[5,9],[0,12]],'#ffe786');circle(c,0,8,2.5,'#fff8d0');
  circle(c,Math.sin(t*5)*6,-17-(t*11%6),1.6,'#ffe786');c.restore();
 }
 function icon(c,type,t){
  if(type==='range')fire(c,0,0,1,t);
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
  }else if(type==='bombpass'){
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
 function draw(c,item,time){
  const def=DEFS[item.type];if(!def)return;
  const f=frame(item,time),x=item.x*48+24,y=item.y*48+24;
  c.save();c.translate(x,y);c.fillStyle='#08051b66';c.beginPath();c.ellipse(0,17,14-f.bob*.6,5,0,0,TAU);c.fill();
  c.translate(0,f.bob);c.rotate(f.tilt);
  const glow=c.createRadialGradient(0,0,5,0,0,25);glow.addColorStop(0,def.color+'55');glow.addColorStop(1,def.color+'00');circle(c,0,0,25,glow);
  rect(c,-20,-20,40,40,10,'#18132c');rect(c,-18,-18,36,35,8,def.color);rect(c,-16,-16,32,30,6,'#322541');
  c.globalAlpha=.45;rect(c,-14,-15,27,2,1,'#ffffff');c.globalAlpha=1;
  icon(c,item.type,f.phase);
  const a=f.phase*1.5;circle(c,Math.cos(a)*22,Math.sin(a)*22,1.4,def.color);c.restore();
 }
 const api={DEFS,frame,icon,draw};if(typeof module!=='undefined')module.exports=api;else root.BombaItems=api;
})(typeof window!=='undefined'?window:globalThis);
