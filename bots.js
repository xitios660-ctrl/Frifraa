'use strict';
const physics=require('./public/physics');
const {INTERVAL}=require('./collapse');
const bombMotion=require('./bomb-motion');
const DIRECTIONS=[[1,0],[-1,0],[0,1],[0,-1]];
const key=(x,y)=>`${x},${y}`;
function blast(board,bomb){
 const cells=[{x:bomb.x,y:bomb.y}];
 for(const [dx,dy] of DIRECTIONS) for(let i=1;i<=bomb.range;i++) {
  const x=bomb.x+dx*i,y=bomb.y+dy*i,cell=board[y]?.[x];
  if(cell===undefined||cell===1)break;
  cells.push({x,y});if(cell===2)break;
 }
 return cells;
}
function dangerMap(room,bombs=room.bombs,t=Date.now()){
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
 for(const b of bombs)if(b.rolling){
  for(const cell of bombMotion.projected(room,b,t)){
   add(cell.x,cell.y,0,b.explodeAt+500);
   for(const hit of blast(room.board,{...b,x:cell.x,y:cell.y}))add(hit.x,hit.y,b.explodeAt,b.explodeAt+500);
  }
 }
 for(const f of room.flames)add(f.x,f.y,0,f.expiresAt);
 if(room.collapse){const c=room.collapse;for(let i=c.index;i<c.path.length;i++){const cell=c.path[i];add(cell.x,cell.y,c.startsAt+i*INTERVAL,Infinity);}}
 return danger;
}
function route(room,p,t,bombs=room.bombs,escape=false){
 const people=[...room.players.values()];
 const danger=dangerMap(room,bombs,t),start={x:Math.round(p.x),y:Math.round(p.y),path:[]};
 const queue=[start],visited=new Set([key(start.x,start.y)]);
 const blocked=new Set(bombs.flatMap(b=>[key(b.x,b.y),...(b.slide?[key(b.slide.fromX,b.slide.fromY)]:[])]));
 let best=null,bestScore=-Infinity;
 const destination=p.botMind?.directiveUntil>t?p.botMind.destination:null;
 const unsafe=(x,y,from,to)=>(danger.get(key(x,y))||[]).some(d=>d.start<=to&&d.end>=from);
 for(let index=0;index<queue.length;index++) {
  const node=queue[index],arrival=t+node.path.length*p.speed;
  if(!unsafe(node.x,node.y,arrival,Math.max(arrival+600,t+2850))) {
   if(escape)return node.path;
   if(destination&&node.x===destination.x&&node.y===destination.y)return node.path;
   let score=-node.path.length*.25;
   score-=(p.botRecent||[]).filter(cell=>cell===key(node.x,node.y)).length*12;
   if(destination)score-=100*(Math.abs(node.x-destination.x)+Math.abs(node.y-destination.y));
   if(!node.path.length&&(p.botIdleFor||0)>.85)score-=100;
   if(room.powerups.has(key(node.x,node.y)))score+=room.powerups.get(key(node.x,node.y))==='curse'?-40:p.botMind?.goal==='collect'?26:16;
   for(const [dx,dy] of DIRECTIONS)if(room.board[node.y+dy]?.[node.x+dx]===2)score+=p.botMind?.goal==='break'?9:5;
   let opponents=[...room.players.values()].filter(other=>other.alive&&other.id!==p.id&&other.id!==p.botMind?.allyId);
   const target=opponents.find(o=>o.id===p.botMind?.targetId);if(target)opponents=[target];
   const ally=room.players.get(p.botMind?.allyId);
   if(p.botMind?.goal==='protect'&&ally?.alive)score-=Math.abs(ally.x-node.x)*.7+Math.abs(ally.y-node.y)*.7;
   if(opponents.length)score-=Math.min(...opponents.map(other=>Math.abs(other.x-node.x)+Math.abs(other.y-node.y)))*(p.botMind?.goal==='attack'?1.1:.4);
   if(score>bestScore){bestScore=score;best=node.path;}
  }
  for(const [dx,dy] of DIRECTIONS){
   const x=node.x+dx,y=node.y+dy,k=key(x,y);
   if(visited.has(k)||room.board[y]?.[x]!==0||blocked.has(k)||!physics.canOccupy(p,x,y,room.board,bombs,people))continue;
   // Include the time spent crossing the tile, with a margin for turning.
   if(unsafe(x,y,arrival,arrival+p.speed+150))continue;
   visited.add(k);queue.push({x,y,path:[...node.path,{x,y}]});
  }
 }
 return best;
}
function decide(room,p,t){
 const danger=dangerMap(room,room.bombs,t),x=Math.round(p.x),y=Math.round(p.y);
 const threatened=(danger.get(key(x,y))||[]).some(d=>d.end>t&&d.start<t+2850);
 if(threatened)return {path:route(room,p,t,room.bombs,true)||[],bomb:false,intent:'escape'};
 const hypothetical={x,y,range:p.range,piercing:p.piercing,explodeAt:t+2250};
 const hits=blast(room.board,hypothetical);
 const hitsCrate=hits.some(c=>room.board[c.y]?.[c.x]===2);
 const hitsEnemy=hits.some(c=>[...room.players.values()].some(other=>other.id!==p.id&&other.id!==p.botMind?.allyId&&other.alive&&Math.round(other.x)===c.x&&Math.round(other.y)===c.y));
 const mode=p.botMind?.directiveUntil>t?p.botMind.bombMode:'auto';
 const useful=mode==='hold'?false:mode==='attack'?hitsEnemy:mode==='break'?hitsCrate:hitsCrate||hitsEnemy;
 const ally=room.players.get(p.botMind?.allyId),friendlyFire=ally?.alive&&hits.some(c=>physics.overlaps(ally,c));
 if(useful&&!friendlyFire&&p.activeBombs<p.bombs&&t>=(p.botCooldown||0)&&!room.bombs.some(b=>b.x===x&&b.y===y)) {
  const escape=route(room,p,t,[...room.bombs,hypothetical],true);
  if(escape?.length)return {path:escape,bomb:true,intent:'bomb'};
 }
 return {path:route(room,p,t)||[],bomb:false,intent:p.botMind?.goal||'attack'};
}
function rememberHouse(p){if(!Number.isInteger(p.x)||!Number.isInteger(p.y))return;p.botRecent??=[];const cell=key(p.x,p.y);if(p.botRecent.at(-1)!==cell){p.botRecent.push(cell);if(p.botRecent.length>12)p.botRecent.shift();}}
function update(room,p,t,dt,putBomb,onStep,beforeMove){
 rememberHouse(p);
 const centred=Math.abs(p.x-Math.round(p.x))<.005&&Math.abs(p.y-Math.round(p.y))<.005;
 if(centred&&(!p.botTarget||t>=(p.botThinkAt||0))&&t>=(p.botReplanAt||0)){
  if(p.botMind?.destination){const d=p.botMind.destination;if(t>=p.botMind.directiveUntil||Math.round(p.x)===d.x&&Math.round(p.y)===d.y||!physics.canOccupy(p,d.x,d.y,room.board,room.bombs,[...room.players.values()])||(p.botIdleFor||0)>1.1)p.botMind.destination=null;}
  const action=decide(room,p,t);p.botIntent=action.intent;p.botTarget=action.path[0]||null;p.botThinkAt=t+120;p.botReplanAt=action.path.length?0:t+140;
  if(action.bomb){putBomb(room,p);p.botCooldown=t+1000;}
 }
 const target=p.botTarget;
 if(!target){p.motion={x:0,y:0};p.botIdleFor=(p.botIdleFor||0)+dt;p.moveTarget=null;return;}
 const dx=target.x-p.x,dy=target.y-p.y;
 const direction=Math.abs(dx)>.005?{x:Math.sign(dx),y:0}:{x:0,y:Math.sign(dy)};
 const remaining=Math.abs(direction.x?dx:dy);
 const before={x:p.x,y:p.y};
 p.motion=direction;
 if(beforeMove)beforeMove(direction);
 physics.move(p,direction,Math.min(dt,remaining*p.speed/1000),room.board,room.bombs,onStep,[...room.players.values()]);
 rememberHouse(p);
 if(Math.hypot(p.x-target.x,p.y-target.y)<.005)p.botTarget=null;
 if(Math.hypot(p.x-before.x,p.y-before.y)<.00001){
  p.botStall=(p.botStall||0)+dt;p.botIdleFor=(p.botIdleFor||0)+dt;
  if(p.botStall>.25){
   if(centred)p.botTarget=null;
   else p.botTarget=[{x:Math.floor(p.x),y:Math.round(p.y)},{x:Math.ceil(p.x),y:Math.round(p.y)},{x:Math.round(p.x),y:Math.floor(p.y)},{x:Math.round(p.x),y:Math.ceil(p.y)}].filter(c=>physics.canOccupy(p,c.x,c.y,room.board,room.bombs,[...room.players.values()])).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0]||p.botTarget;
   p.botThinkAt=0;p.botReplanAt=0;p.botStall=0;
  }
 }else{p.botStall=0;p.botIdleFor=0;}
}
module.exports={blast,dangerMap,route,decide,update};
