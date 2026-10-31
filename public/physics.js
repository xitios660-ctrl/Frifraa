/* Shared deterministic movement; positions are tile centres. */
(function(root) {
  function move(p, direction, dt, board, bombs) {
    const dx = direction.x, dy = direction.y;
    if (!dx && !dy) return;
    const distance = Math.min(dt, .05) * 1000 / p.speed;
    const radius = .28;
    function blocked(x, y) {
      for (const ox of [-radius, radius]) for (const oy of [-radius, radius]) {
        const tx = Math.floor(x + ox + .5), ty = Math.floor(y + oy + .5);
        if (board[ty]?.[tx] !== 0) return true;
        if (bombs.some(b => b.x === tx && b.y === ty && !(Math.abs(p.x-b.x)<.78 && Math.abs(p.y-b.y)<.78 && Math.hypot(x-b.x,y-b.y) >= Math.hypot(p.x-b.x,p.y-b.y)))) return true;
      }
      return false;
    }
    // Guide turns to corridor centres, without cutting through solid corners.
    let x = p.x, y = p.y;
    if (dx && Math.abs(y-Math.round(y)) < .22) y = Math.round(y);
    if (dy && Math.abs(x-Math.round(x)) < .22) x = Math.round(x);
    const steps = Math.ceil(distance/.04);
    for (let i=0;i<steps;i++) {
      const nx=x+dx*distance/steps, ny=y+dy*distance/steps;
      if (blocked(nx,ny)) break;
      x=nx; y=ny;
    }
    p.x=x; p.y=y;
    p.facing = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';
  }
  const api={move};
  if (typeof module !== 'undefined') module.exports=api;
  else root.BombaPhysics=api;
})(typeof window !== 'undefined' ? window : globalThis);
