/* Decorative animation follows authoritative world timestamps. Collision tiles never move. */
(function(root){
  const physics=typeof module!=='undefined'?require('./physics'):root.BombaPhysics;
  const SIZE=48,TAU=Math.PI*2;
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  function progress(effect,time){return clamp((time-effect.startedAt)/(effect.expiresAt-effect.startedAt));}
  function round(ctx,x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
  function circle(ctx,x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();}
  function bombFrame(b,time){
    const age=Math.max(0,time-b.placedAt),remaining=Math.max(0,b.explodeAt-time);
    const urgency=1-clamp(remaining/2250);
    return {age,remaining,urgency,scale:Math.min(1,age/110)*(.98+.065*Math.sin(age/(110-urgency*60)))};
  }
  function bomb(ctx,b,time){
    const frame=bombFrame(b,time),x=b.x*SIZE+24,y=b.y*SIZE+27;
    ctx.save();ctx.translate(x,y);
    ctx.fillStyle='#05051288';ctx.beginPath();ctx.ellipse(0,8,21,9,0,0,TAU);ctx.fill();
    ctx.scale(frame.scale,frame.scale);
    const flash=b.piercing||frame.remaining<700 && Math.sin(frame.age/45)>.15;
    const gradient=ctx.createRadialGradient(-7,-8,1,0,0,21);
    gradient.addColorStop(0,flash?'#ffc0aa':'#9c87cb');
    gradient.addColorStop(.32,flash?'#e85962':'#493b6b');gradient.addColorStop(1,flash?'#6b203f':'#130e28');
    circle(ctx,0,0,19,gradient);circle(ctx,-7,-8,4,'#ffffff6b');
    round(ctx,-5,-22,10,8,2,'#bda1c9');
    const fuse=1-frame.urgency,sx=3+14*fuse,sy=-22-12*fuse;
    ctx.strokeStyle='#ffe2a0';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(1,-21);ctx.quadraticCurveTo(3,-37,sx,sy);ctx.stroke();
    circle(ctx,sx,sy,3+Math.sin(time/24),'#fff4a9');
    for(let i=0;i<6;i++) {
      const angle=i*TAU/6+time/95,distance=5+(Math.sin(time/35+i)+1)*3;
      ctx.strokeStyle=i%2?'#ff975b':'#ffeeb3';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(sx+Math.cos(angle)*3,sy+Math.sin(angle)*3);
      ctx.lineTo(sx+Math.cos(angle)*distance,sy+Math.sin(angle)*distance);ctx.stroke();
    }
    ctx.restore();
  }
  function flame(ctx,f,time,tiles){
    if(time>=f.expiresAt) return;
    const age=time-f.startedAt,alpha=clamp((f.expiresAt-time)/100);
    const x=f.x*SIZE+24,y=f.y*SIZE+24;
    ctx.save();ctx.translate(x,y);ctx.globalAlpha=alpha;
    circle(ctx,0,0,25,'#ff6a3430');
    for(const s of physics.flameShapes(f,tiles))round(ctx,(s.x-f.x-s.hx)*SIZE,(s.y-f.y-s.hy)*SIZE,s.hx*2*SIZE,s.hy*2*SIZE,s.r*SIZE,'#fa5d39');
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(tiles.has(`${f.x+dx},${f.y+dy}`))round(ctx,dx?Math.min(0,dx*24):-7,dy?Math.min(0,dy*24):-7,dx?24:14,dy?24:14,3,'#ffcd5d');
    round(ctx,-12,-12,24,24,8,'#ffcd5d');
    round(ctx,-6,-6,12,12,4,'#fff5bf');
    for(let i=0;i<4;i++) {
      const a=i*TAU/4+age/140;
      circle(ctx,Math.cos(a)*13,Math.sin(a)*13,2+Math.sin(age/25+i),'#fff5bf');
    }
    ctx.restore();
  }
  function debris(ctx,e,time){
    if(time<e.startedAt||time>=e.expiresAt) return;
    const p=progress(e,time),x=e.x*SIZE+24,y=e.y*SIZE+24;
    ctx.save();ctx.globalAlpha=1-p;
    if(e.kind==='crate') {
      for(let i=0;i<12;i++) {
        const a=i*2.399+e.x*.7+e.y,speed=22+(i%4)*13;
        const dx=Math.cos(a)*speed*p,dy=Math.sin(a)*speed*p+45*p*p;
        ctx.save();ctx.translate(x+dx,y+dy);ctx.rotate(a+p*6);
        round(ctx,-3,-2,6+(i%3),4,1,i%2?'#eab18a':'#a35c69');ctx.restore();
      }
    } else if(e.kind==='wall') {
      ctx.strokeStyle='#ffe4a8';ctx.lineWidth=3*(1-p);ctx.strokeRect(e.x*SIZE+3,e.y*SIZE+3,42,41);
      for(let i=0;i<4;i++) circle(ctx,x+Math.cos(i*TAU/4)*18,y+Math.sin(i*TAU/4)*18,3*(1-p),'#ffd995');
    } else if(e.kind==='itemBurn') {
      circle(ctx,x,y-14*p,18*(1-p),'#ff983f');circle(ctx,x,y-14*p,9*(1-p),'#fff0af');
      for(let i=0;i<8;i++){const a=i*TAU/8;circle(ctx,x+Math.cos(a)*22*p,y+Math.sin(a)*18*p-20*p,3*(1-p),'#ffc967');}
    } else if(e.kind==='slam') {
      for(let i=0;i<10;i++){const a=i*TAU/10;circle(ctx,x+Math.cos(a)*30*p,y+15+Math.sin(a)*12*p,5*(1-p),'#c6b3ad');}
      ctx.strokeStyle='#ffce7e';ctx.lineWidth=2*(1-p);ctx.strokeRect(x-23-p*6,y-23-p*6,46+p*12,46+p*12);
    } else if(e.kind==='pickup') {
      ctx.strokeStyle='#fff3a2';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,10+p*22,0,TAU);ctx.stroke();
      for(let i=0;i<6;i++) circle(ctx,x+Math.cos(i*TAU/6)*(8+p*22),y-p*24+Math.sin(i*TAU/6)*(8+p*22),2,'#fff3a2');
    }
    ctx.restore();
  }
  function fallingWall(ctx,tile,time,palette){
    if(time<tile.startedAt||time>=tile.landsAt)return;
    const x=tile.x*SIZE,y=tile.y*SIZE,remaining=tile.landsAt-time;
    const fall=clamp(1-remaining/420),lift=180*(1-fall*fall);
    ctx.save();
    ctx.fillStyle=`rgba(255,100,70,${.2+.2*Math.sin(time/55)})`;ctx.fillRect(x+1,y+1,46,46);
    ctx.strokeStyle='#ffd49c';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.strokeRect(x+3,y+3,42,42);ctx.setLineDash([]);
    ctx.beginPath();ctx.moveTo(x+14,y+14);ctx.lineTo(x+34,y+34);ctx.moveTo(x+34,y+14);ctx.lineTo(x+14,y+34);ctx.stroke();
    ctx.fillStyle='#08051788';ctx.beginPath();ctx.ellipse(x+24,y+31,12+fall*11,5+fall*9,0,0,TAU);ctx.fill();
    if(remaining<=420){
      const py=y-lift;ctx.globalAlpha=.5+.5*fall;
      round(ctx,x+2,py+2,44,44,5,'#1d182b');round(ctx,x+4,py+3,40,36,4,palette.wall);
      round(ctx,x+7,py+5,34,5,2,palette.light);round(ctx,x+7,py+32,34,5,2,palette.dark);
      ctx.strokeStyle='#ffce7e';ctx.lineWidth=2;ctx.strokeRect(x+10,py+12,28,16);
      ctx.strokeStyle='#fff0bd';ctx.beginPath();ctx.moveTo(x+20,py+14);ctx.lineTo(x+20,py+26);ctx.moveTo(x+28,py+14);ctx.lineTo(x+28,py+26);ctx.stroke();
    }
    ctx.restore();
  }
  const api={bombFrame,progress,bomb,flame,debris,fallingWall};
  if(typeof module!=='undefined')module.exports=api;else root.BombaEffects=api;
})(typeof window!=='undefined'?window:globalThis);
