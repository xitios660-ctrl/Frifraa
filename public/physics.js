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
  const ALIGN_EPSILON=1e-5;
  function canonical(value){return Math.abs(value-Math.round(value))<ALIGN_EPSILON?Math.round(value):value;}
  function move(p,direction,dt,board,bombs,onStep) {
    p.x=canonical(p.x);p.y=canonical(p.y);revokePassage(p,bombs);
    const dx=direction.x,dy=direction.y;
    if(!dx&&!dy)return;
    p.facing=dx<0?'left':dx>0?'right':dy<0?'up':'down';
    let budget=Math.max(0,Math.min(dt,.05))*1000/p.speed;
    const free=(x,y)=>canOccupy(p,x,y,board,bombs);
    function travel(axis,target,amount){
      const origin=p[axis],distance=Math.abs(target-origin),length=Math.min(distance,amount);
      if(length<1e-12)return 0;
      const sign=Math.sign(target-origin),steps=Math.ceil(length/.025);
      for(let i=1;i<=steps;i++){
        const next=i===steps&&length>=distance-1e-12?target:origin+sign*length*i/steps;
        const x=axis==='x'?next:p.x,y=axis==='y'?next:p.y;
        if(!free(x,y))break;
        p[axis]=next;
        p.facing=axis==='x'?(sign<0?'left':'right'):(sign<0?'up':'down');
        revokePassage(p,bombs);if(onStep)onStep(p.x,p.y);
      }
      return Math.abs(p[axis]-origin);
    }
    for(let iteration=0;iteration<12&&budget>1e-10;iteration++){
      p.x=canonical(p.x);p.y=canonical(p.y);
      const alignedX=Number.isInteger(p.x),alignedY=Number.isInteger(p.y);
      // Recovery for older snapshots: approach a legal lane without jumping across a block.
      if(!alignedX&&!alignedY){
        const axis=dx?'y':'x',value=p[axis];
        const centres=[Math.floor(value),Math.ceil(value)].sort((a,b)=>Math.abs(a-value)-Math.abs(b-value));
        const target=centres.find(c=>free(axis==='x'?c:p.x,axis==='y'?c:p.y));
        if(target===undefined)break;
        const distance=Math.abs(target-value);
        if(!free(p.x,p.y)&&distance<.001&&distance<=budget){
          p[axis]=target;budget-=distance;revokePassage(p,bombs);if(onStep)onStep(p.x,p.y);continue;
        }
        const available=Math.min(distance,budget);
        const spent=travel(axis,target,budget);budget-=spent;
        if(spent<available-1e-9||spent<1e-10)break;
        continue;
      }
      const requestedAxis=dx?'x':'y';
      const segmentAxis=!alignedX?'x':!alignedY?'y':null;
      let axis=requestedAxis,target;
      if(segmentAxis&&segmentAxis!==requestedAxis){
        // Buffer the turn at the nearest reachable junction with an open exit.
        axis=segmentAxis;
        const value=p[axis];
        const centres=[Math.floor(value),Math.ceil(value)].sort((a,b)=>Math.abs(a-value)-Math.abs(b-value));
        target=centres.find(c=>{
          const x=axis==='x'?c:p.x,y=axis==='y'?c:p.y;
          return free(x,y)&&free(x+dx,y+dy);
        });
        if(target===undefined)break;
      }else{
        const sign=dx||dy,value=p[axis];
        target=Number.isInteger(value)?value+sign:sign>0?Math.ceil(value):Math.floor(value);
        if(!free(axis==='x'?target:p.x,axis==='y'?target:p.y))break;
      }
      const distance=Math.abs(target-p[axis]),available=Math.min(distance,budget);
      const spent=travel(axis,target,budget);budget-=spent;
      if(spent<available-1e-9||spent<1e-10)break;
    }
    p.x=canonical(p.x);p.y=canonical(p.y);revokePassage(p,bombs);
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
