/* Shared collision rules: tile centres, one-tile square footprint, swept steps. */
(function(root) {
  const RADIUS = .5;
  const EPSILON = .000001;
  function overlaps(p, b) {
    return Math.abs(p.x-b.x) < .5+RADIUS-EPSILON && Math.abs(p.y-b.y) < .5+RADIUS-EPSILON;
  }
  function canOccupy(p, x, y, board, bombs) {
    for (const ox of [-RADIUS+EPSILON,RADIUS-EPSILON]) {
      for (const oy of [-RADIUS+EPSILON,RADIUS-EPSILON]) {
        const tx=Math.floor(x+ox+.5),ty=Math.floor(y+oy+.5);
        if(board[ty]?.[tx]!==0) return false;
        if(bombs.some(b=>b.x===tx && b.y===ty && !p.bombPass && !b.passThrough?.includes(p.id))) return false;
      }
    }
    return true;
  }
  function revokePassage(p,bombs) {
    for(const b of bombs) {
      if(b.passThrough?.includes(p.id) && !overlaps(p,b)) b.passThrough=b.passThrough.filter(id=>id!==p.id);
    }
  }
  function move(p,direction,dt,board,bombs,onStep) {
    revokePassage(p,bombs);
    const dx=direction.x,dy=direction.y;
    if(!dx && !dy) return;
    p.facing=dx<0?'left':dx>0?'right':dy<0?'up':'down';
    const distance=Math.max(0,Math.min(dt,.05))*1000/p.speed;
    const steps=Math.ceil(distance/.025);
    const step=distance/steps;
    for(let i=0;i<steps;i++) {
      const nx=p.x+dx*step,ny=p.y+dy*step;
      if(canOccupy(p,nx,ny,board,bombs)) {p.x=nx;p.y=ny;}
      else {
        // Land exactly against the blocking face, instead of leaving a fractional gap.
        const beforeX=p.x,beforeY=p.y;
        let low=0,high=step;
        for(let search=0;search<20;search++){
          const middle=(low+high)/2;
          if(canOccupy(p,beforeX+dx*middle,beforeY+dy*middle,board,bombs))low=middle;else high=middle;
        }
        p.x=beforeX+dx*low;p.y=beforeY+dy*low;
        const remaining=Math.max(0,step-low);
        // Ease into an open corridor instead of snapping or catching on its corner.
        const perpendicular=dx?p.y:p.x;
        const centres=[...new Set([Math.floor(perpendicular),Math.ceil(perpendicular)])]
          .sort((a,b)=>Math.abs(a-perpendicular)-Math.abs(b-perpendicular));
        for(const centre of centres) {
          const offset=centre-perpendicular;
          if(Math.abs(offset)<=.001||Math.abs(offset)>1-EPSILON)continue;
          if(!canOccupy(p,dx?nx:centre,dx?centre:ny,board,bombs))continue;
          const slide=Math.sign(offset)*Math.min(Math.abs(offset),remaining);
          const sx=p.x+(dy?slide:0),sy=p.y+(dx?slide:0);
          if(canOccupy(p,sx,sy,board,bombs)){p.x=sx;p.y=sy;break;}
        }
      }
      revokePassage(p,bombs);
      if(onStep)onStep(p.x,p.y);
    }
  }
  function flameShapes(f,tiles) {
    const shapes=[{x:f.x,y:f.y,hx:18/48,hy:18/48,r:10/48}];
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(tiles.has(`${f.x+dx},${f.y+dy}`)) {
      shapes.push({x:f.x+dx*.25,y:f.y+dy*.25,hx:dx?.25:13/48,hy:dy?.25:13/48,r:5/48});
    }
    return shapes;
  }
  function touchesFlame(p,f,tiles,shapes) {
    // Damage stays inside the drawn body; hair, labels and the outer glow are decorative.
    const x=p.x,y=p.y+1/48;
    return (shapes||flameShapes(f,tiles)).some(s=>{
      const dx=Math.max(0,Math.abs(x-s.x)-12/48-(s.hx-s.r));
      const dy=Math.max(0,Math.abs(y-s.y)-22/48-(s.hy-s.r));
      return dx*dx+dy*dy<=s.r*s.r+EPSILON;
    });
  }
  const api={move,canOccupy,overlaps,flameShapes,touchesFlame,RADIUS};
  if(typeof module!=='undefined') module.exports=api;
  else root.BombaPhysics=api;
})(typeof window!=='undefined'?window:globalThis);
