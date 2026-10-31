/* Shared collision rules: tile centres, a compact square footprint, swept steps. */
(function(root) {
  const RADIUS = .25;
  const EPSILON = .000001;
  function overlaps(p, b) {
    return Math.abs(p.x-b.x) < .5+RADIUS-EPSILON && Math.abs(p.y-b.y) < .5+RADIUS-EPSILON;
  }
  function canOccupy(p, x, y, board, bombs) {
    for (const ox of [-RADIUS+EPSILON,RADIUS-EPSILON]) {
      for (const oy of [-RADIUS+EPSILON,RADIUS-EPSILON]) {
        const tx=Math.floor(x+ox+.5),ty=Math.floor(y+oy+.5);
        if(board[ty]?.[tx]!==0) return false;
        if(bombs.some(b=>b.x===tx && b.y===ty && !b.passThrough?.includes(p.id))) return false;
      }
    }
    return true;
  }
  function revokePassage(p,bombs) {
    for(const b of bombs) {
      if(b.passThrough?.includes(p.id) && !overlaps(p,b)) b.passThrough=b.passThrough.filter(id=>id!==p.id);
    }
  }
  function move(p,direction,dt,board,bombs) {
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
        // Ease into an open corridor instead of snapping or catching on its corner.
        const centre=Math.round(dx?p.y:p.x);
        const offset=centre-(dx?p.y:p.x);
        if(Math.abs(offset)>.001 && Math.abs(offset)<=.48 &&
           canOccupy(p,dx?nx:centre,dx?centre:ny,board,bombs)) {
          const slide=Math.sign(offset)*Math.min(Math.abs(offset),step);
          const sx=p.x+(dy?slide:0),sy=p.y+(dx?slide:0);
          if(canOccupy(p,sx,sy,board,bombs)){p.x=sx;p.y=sy;}
        }
      }
      revokePassage(p,bombs);
    }
  }
  function reconcile(p,authoritative,board,bombs) {
    const gap=Math.hypot(p.x-authoritative.x,p.y-authoritative.y);
    const x=p.x+(authoritative.x-p.x)*.25,y=p.y+(authoritative.y-p.y)*.25;
    const localValid=canOccupy(p,p.x,p.y,board,bombs);
    const serverValid=canOccupy(p,authoritative.x,authoritative.y,board,bombs);
    if((gap>.8 || !localValid) && serverValid) {p.x=authoritative.x;p.y=authoritative.y;}
    else if(canOccupy(p,x,y,board,bombs)) {p.x=x;p.y=y;}
    // A delayed snapshot must not pull a player back into a bomb they already exited.
    p.speed=authoritative.speed;
  }
  const api={move,canOccupy,overlaps,reconcile};
  if(typeof module!=='undefined') module.exports=api;
  else root.BombaPhysics=api;
})(typeof window!=='undefined'?window:globalThis);
