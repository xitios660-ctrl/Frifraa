/* Distance-driven walking, shared by portraits and Solar. No network state changes. */
(function(root) {
  const layouts = new WeakMap();
  const directions = { down: 0, left: 1, right: 2, up: 3 };
  function advance(previous, position, dt) {
    const pose = previous || { x: position.x, y: position.y, phase: 0, weight: 0, facing: 'down' };
    const distance = Math.hypot(position.x - pose.x, position.y - pose.y);
    const walking = distance > .0005 && distance < 1.5;
    if (distance >= 1.5) { pose.phase = 0; pose.weight = 0; }
    if (walking) pose.phase = (pose.phase + distance / 1.6 * Math.PI * 2) % (Math.PI * 2);
    pose.weight += ((walking ? 1 : 0) - pose.weight) * (1 - Math.exp(-dt * 24));
    if (pose.weight < .015) pose.weight = 0;
    pose.facing = Object.hasOwn(directions, position.facing) ? position.facing : pose.facing;
    pose.frame = walking || pose.weight > .15 ? Math.floor(pose.phase / (Math.PI * 2) * 4) % 4 : 1;
    pose.x = position.x; pose.y = position.y;
    return pose;
  }
  function prepareAtlas(atlas) {
    // Measure opaque artwork once; keep every frame centred on a common foot baseline.
    const canvas = document.createElement('canvas');
    canvas.width = atlas.naturalWidth; canvas.height = atlas.naturalHeight;
    const context = canvas.getContext('2d', {willReadFrequently:true});
    context.drawImage(atlas,0,0);
    const {data} = context.getImageData(0,0,canvas.width,canvas.height);
    const frames=[];
    for(let row=0;row<4;row++) for(let col=0;col<4;col++) {
      const x0=Math.round(col*canvas.width/4),x1=Math.round((col+1)*canvas.width/4);
      const y0=Math.round(row*canvas.height/4),y1=Math.round((row+1)*canvas.height/4);
      const width=x1-x0,height=y1-y0;
      const visited=new Uint8Array(width*height),queue=new Int32Array(width*height);
      let largest=0,left=canvas.width,top=canvas.height,right=-1,bottom=-1;
      // Ignore tiny fragments from a neighbouring drawing at the grid boundary.
      for(let seed=0;seed<visited.length;seed++) {
        if(visited[seed]) continue;
        const sx=seed%width,sy=Math.floor(seed/width);
        if(data[((y0+sy)*canvas.width+x0+sx)*4+3]<100) continue;
        let head=0,tail=1,l=x1,r=x0,t=y1,b=y0;
        queue[0]=seed;visited[seed]=1;
        while(head<tail) {
          const pixel=queue[head++],px=pixel%width,py=Math.floor(pixel/width);
          l=Math.min(l,x0+px);r=Math.max(r,x0+px);t=Math.min(t,y0+py);b=Math.max(b,y0+py);
          for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
            const nx=px+dx,ny=py+dy;
            if(nx<0||ny<0||nx>=width||ny>=height) continue;
            const next=ny*width+nx;
            if(visited[next]||data[((y0+ny)*canvas.width+x0+nx)*4+3]<100) continue;
            visited[next]=1;queue[tail++]=next;
          }
        }
        if(tail>largest) { largest=tail;left=l;right=r;top=t;bottom=b; }
      }
      if(right<left) return; // Incomplete atlas: retain the regular-grid fallback.
      frames.push({x:left,y:top,w:right-left+1,h:bottom-top+1});
    }
    layouts.set(atlas,{frames,scale:44/Math.max(...frames.map(f=>Math.max(f.w,f.h)))});
  }
  function drawAtlas(ctx, atlas, skin, pose, x, y) {
    if (!atlas?.complete || !atlas.naturalWidth) return false;
    const w = atlas.naturalWidth / 4, h = atlas.naturalHeight / 4;
    const row = directions[pose.facing];
    const layout=layouts.get(atlas);
    const frame=layout?.frames[row*4+pose.frame];
    ctx.save();ctx.translate(x,y);
    // Mary's generated profile row faces right; mirror that row for a true left view.
    if(skin===0 && pose.facing==='left') ctx.scale(-1,1);
    if(frame) {
      const width=frame.w*layout.scale,height=frame.h*layout.scale;
      ctx.drawImage(atlas,frame.x,frame.y,frame.w,frame.h,-width/2,26-height,width,height);
    } else ctx.drawImage(atlas,pose.frame*w,row*h,w,h,-22,-18,44,44);
    ctx.restore();
    return true;
  }
  function drawSolar(ctx, pose, x, y) {
    const step = Math.sin(pose.phase) * pose.weight;
    const side = pose.facing === 'left' || pose.facing === 'right';
    ctx.save(); ctx.translate(x,y);
    if (pose.facing === 'left') ctx.scale(-1,1);
    const rect = (x,y,w,h,color,r=4) => { ctx.fillStyle=color; ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill(); };
    // Cape trails behind; feet and hands alternate rather than moving the whole image.
    ctx.fillStyle='#f78f48';ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(-17-step,24);ctx.lineTo(17-step,24);ctx.lineTo(10,0);ctx.fill();
    rect(-12,17-Math.max(0,step)*3,10,10,'#ffe6a3');
    rect(2,17-Math.max(0,-step)*3,10,10,'#ffe6a3');
    rect(-11,4,22,17,'#ffd36f',7);
    rect(-17,3+step*3,7,15,'#eeb445');rect(10,3-step*3,7,15,'#ffda81');
    rect(-15,-22,30,32,'#ffd36f',10);
    if (pose.facing !== 'up') {
      rect(side?0:-10,-12,side?12:20,15,'#fff7e5',6);
      rect(side?7:-6,-7,3,7,'#302138',1);
      if(!side) rect(4,-7,3,7,'#302138',1);
    } else { rect(-10,-16,20,17,'#efb84a',7); }
    ctx.fillStyle='#ffb73f';ctx.beginPath();ctx.moveTo(-16,-18);ctx.lineTo(-15,-35);ctx.lineTo(-6,-25);ctx.lineTo(0,-39);ctx.lineTo(6,-25);ctx.lineTo(15,-35);ctx.lineTo(16,-18);ctx.fill();
    rect(-12,-22,24,4,'#fff1a5',1);
    ctx.restore();
  }
  const api = { advance, prepareAtlas, drawAtlas, drawSolar };
  if (typeof module !== 'undefined') module.exports = api;
  else root.BombaAnimation = api;
})(typeof window !== 'undefined' ? window : globalThis);
