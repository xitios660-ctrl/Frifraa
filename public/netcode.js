/* Fixed-step input prediction with acknowledgements; no blending stale authority into live input. */
(function(root) {
  const physics=typeof module!=='undefined'?require('./physics'):root.BombaPhysics;
  const STEP=1/60,MAX_PENDING=120;
  function worldBombs(bombs){return bombs.map(b=>({...b,passThrough:[...(b.passThrough||[])]}));}
  function create(player,board,bombs=[]) {
    return {player:{...player},board,bombs:worldBombs(bombs),pending:[],outbound:[],sequence:0};
  }
  function advance(model,direction) {
    if(model.pending.length>=MAX_PENDING) return false;
    const command={seq:++model.sequence,x:direction.x,y:direction.y};
    physics.move(model.player,command,STEP,model.board,model.bombs);
    model.pending.push(command);model.outbound.push(command);
    return true;
  }
  function acknowledge(model,player,board,bombs) {
    model.pending=model.pending.filter(command=>command.seq>(player.ack||0));
    model.board=board;model.bombs=worldBombs(bombs);model.player={...player};
    for(const command of model.pending) physics.move(model.player,command,STEP,board,model.bombs);
    return model.player;
  }
  function lanePoint(a,b,amount){
    const dx=b.x-a.x,dy=b.y-a.y;
    if(Math.abs(dx)<1e-9||Math.abs(dy)<1e-9)return{x:a.x+dx*amount,y:a.y+dy*amount};
    const horizontalFirst=Number.isInteger(a.y)&&Number.isInteger(b.x);
    const corner=horizontalFirst?{x:b.x,y:a.y}:{x:a.x,y:b.y};
    const first=Math.abs(corner.x-a.x)+Math.abs(corner.y-a.y);
    const second=Math.abs(b.x-corner.x)+Math.abs(b.y-corner.y);
    const travel=(first+second)*amount;
    if(travel<=first&&first)return{x:a.x+(corner.x-a.x)*travel/first,y:a.y+(corner.y-a.y)*travel/first};
    const fraction=second?Math.max(0,Math.min(1,(travel-first)/second)):1;
    return{x:corner.x+(b.x-corner.x)*fraction,y:corner.y+(b.y-corner.y)*fraction};
  }
  function displayPoint(point,target,dt,speed) {
    if(!point)return{...target};
    const distance=Math.abs(target.x-point.x)+Math.abs(target.y-point.y);
    const limit=Math.max(8,1000/speed*1.5)*Math.min(.05,Math.max(0,dt));
    return{...point,...lanePoint(point,target,distance?Math.min(1,limit/distance):1)};
  }
  function remotePosition(history,id,time) {
    let before=history[0],after=history.at(-1);
    for(const snapshot of history) {
      if(snapshot.time<=time) before=snapshot;
      if(snapshot.time>=time) {after=snapshot;break;}
    }
    const a=before?.players.find(p=>p.id===id),b=after?.players.find(p=>p.id===id);
    if(!a||!b) return b||a;
    const amount=Math.max(0,Math.min(1,(time-before.time)/(after.time-before.time||1)));
    return {...b,...lanePoint(a,b,amount)};
  }
  const api={STEP,MAX_PENDING,create,advance,acknowledge,displayPoint,remotePosition};
  if(typeof module!=='undefined') module.exports=api;
  else root.BombaNetcode=api;
})(typeof window!=='undefined'?window:globalThis);
