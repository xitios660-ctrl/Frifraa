'use strict';
const physics=require('./public/physics');
const {INTERVAL}=require('./collapse');
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]];
const key=(x,y)=>`${x},${y}`;
function blast(board,bomb){
 const cells=[{x:bomb.x,y:bomb.y}];
 for(const [dx,dy] of DIRECTIONS) for(let i=1;i<=bomb.range;i++) {
  const x=bomb.x+dx*i,y=bomb.y+dy*i,cell=board[y]?.[x];
  if(cell===undefined||cell===1)break;
  cells.push({x,y});if(cell===2&&!bomb.piercing)break;
 }
 return cells;
}
function dangerMap(room,bombs=room.bombs){
 const danger=new Map(),times=bombs.map(b=>b.explodeAt),blasts=bombs.map(b=>blast(room.board,b));
 for(let pass=0;pass<bombs.length;pass++) {
  let changed=false;
  for(let i=0;i<bombs.length;i++) for(let j=0;j<bombs.length;j++) {
   if(times[j]>times[i]&&blasts[i].some(c=>c.x===bombs[j].x&&c.y===bombs[j].y)){times[j]=times[i];changed=true;}
  }
  if(!changed)break;
 }
 function add(x,y,start,end){const k=key(x,y);if(!danger.has(k))danger.set(k,[]);danger.get(k).push({start,end});}
 blasts.forEach((cells,i)=>cells.forEach(c=>add(c.x,c.y,times[i],times[i]+500)));
 for(const f of room.flames)add(f.x,f.y,0,f.expiresAt);
 if(room.collapse){const c=room.collapse;for(let i=c.index;i<c.path.length;i++){const cell=c.path[i];add(cell.x,cell.y,c.startsAt+i*INTERVAL,Infinity);}}
 return danger;
}
function route(room,p,t,bombs=room.bombs,escape=false){
 const danger=dangerMap(room,bombs),start={x:Math.round(p.x),y:Math.round(p.y),path:[]};
 const queue=[start],visited=new Set([key(start.x,start.y)]);
 const blocked=new Set((p.bombPass?[]:bombs).map(b=>key(b.x,b.y)));
 let best=null,bestScore=-Infinity;
 const unsafe=(x,y,from,to)=>(danger.get(key(x,y))||[]).some(d=>d.start<=to&&d.end>=from);
 for(let index=0;index<queue.length;index++) {
  const node=queue[index],arrival=t+node.path.length*p.speed;
  if(!unsafe(node.x,node.y,arrival,Math.max(arrival+600,t+2850))) {
   if(escape)return node.path;
   let score=-node.path.length*.25;
   if(room.powerups.has(key(node.x,node.y)))score+=16;
   for(const [dx,dy] of DIRECTIONS)if(room.board[node.y+dy]?.[node.x+dx]===2)score+=5;
   const opponents=[...room.players.values()].filter(other=>other.alive&&other.id!==p.id);
   if(opponents.length)score-=Math.min(...opponents.map(other=>Math.abs(other.x-node.x)+Math.abs(other.y-node.y)))*.4;
   if(score>bestScore){bestScore=score;best=node.path;}
  }
  for(const [dx,dy] of DIRECTIONS){
   const x=node.x+dx,y=node.y+dy,k=key(x,y);
   if(visited.has(k)||room.board[y]?.[x]!==0||blocked.has(k))continue;
   // Include the time spent crossing the tile, with a margin for turning.
   if(unsafe(x,y,arrival,arrival+p.speed+150))continue;
   visited.add(k);queue.push({x,y,path:[...node.path,{x,y}]});
  }
 }
 return best;
}
function decide(room,p,t){
 const danger=dangerMap(room),x=Math.round(p.x),y=Math.round(p.y);
 const threatened=(danger.get(key(x,y))||[]).some(d=>d.end>t&&d.start<t+2850);
 if(threatened)return {path:route(room,p,t,room.bombs,true)||[],bomb:false};
 const hypothetical={x,y,range:p.range,piercing:p.piercing,explodeAt:t+2250};
 const hits=blast(room.board,hypothetical);
 const useful=hits.some(c=>room.board[c.y]?.[c.x]===2||[...room.players.values()].some(other=>other.id!==p.id&&other.alive&&Math.round(other.x)===c.x&&Math.round(other.y)===c.y));
 if(useful&&p.activeBombs<p.bombs&&t>=(p.botCooldown||0)&&!room.bombs.some(b=>b.x===x&&b.y===y)) {
  const escape=route(room,p,t,[...room.bombs,hypothetical],true);
  if(escape?.length)return {path:escape,bomb:true};
 }
 return {path:route(room,p,t)||[],bomb:false};
}
function update(room,p,t,dt,putBomb,onStep){
 const centred=Math.abs(p.x-Math.round(p.x))<.005&&Math.abs(p.y-Math.round(p.y))<.005;
 if(centred&&(!p.botTarget||t>=(p.botThinkAt||0))){
  const action=decide(room,p,t);p.botTarget=action.path[0]||null;p.botThinkAt=t+120;
  if(action.bomb){putBomb(room,p);p.botCooldown=t+1000;}
 }
 const target=p.botTarget;
 if(!target){p.motion={x:0,y:0};return;}
 const dx=target.x-p.x,dy=target.y-p.y;
 const direction=Math.abs(dx)>.005?{x:Math.sign(dx),y:0}:{x:0,y:Math.sign(dy)};
 const remaining=Math.abs(direction.x?dx:dy);
 const before={x:p.x,y:p.y};
 p.motion=direction;
 physics.move(p,direction,Math.min(dt,remaining*p.speed/1000),room.board,room.bombs,onStep);
 if(Math.hypot(p.x-target.x,p.y-target.y)<.005)p.botTarget=null;
 if(Math.hypot(p.x-before.x,p.y-before.y)<.00001){
  p.botStall=(p.botStall||0)+dt;
  if(p.botStall>.25){p.botTarget={x:Math.round(p.x),y:Math.round(p.y)};p.botThinkAt=0;p.botStall=0;}
 }else p.botStall=0;
}
module.exports={blast,dangerMap,route,decide,update};
