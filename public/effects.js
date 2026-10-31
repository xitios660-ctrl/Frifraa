/* Decorative animation follows authoritative world timestamps. Collision tiles never move. */
(function(root){
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
    const flash=frame.remaining<700 && Math.sin(frame.age/45)>.15;
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
    const spread=17+Math.sin(age/35+f.x+f.y)*2;
    circle(ctx,0,0,25,'#ff6a3430');
    round(ctx,-spread,-spread,spread*2,spread*2,11,'#fa5d39');
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      if(tiles.has(`${f.x+dx},${f.y+dy}`)) {
        round(ctx,dx?Math.min(0,dx*25):-13,dy?Math.min(0,dy*25):-13,dx?25:26,dy?25:26,5,'#fa5d39');
        round(ctx,dx?Math.min(0,dx*25):-7,dy?Math.min(0,dy*25):-7,dx?25:14,dy?25:14,3,'#ffcd5d');
      }
    }
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
    } else if(e.kind==='pickup') {
      ctx.strokeStyle='#fff3a2';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,10+p*22,0,TAU);ctx.stroke();
      for(let i=0;i<6;i++) circle(ctx,x+Math.cos(i*TAU/6)*(8+p*22),y-p*24+Math.sin(i*TAU/6)*(8+p*22),2,'#fff3a2');
    }
    ctx.restore();
  }
  const api={bombFrame,progress,bomb,flame,debris};
  if(typeof module!=='undefined')module.exports=api;else root.BombaEffects=api;
})(typeof window!=='undefined'?window:globalThis);
