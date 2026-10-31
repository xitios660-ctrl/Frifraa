'use strict';
const physics=require('./public/physics');
const DELAY=90000,INTERVAL=350,WARNING=900;
// Walk the entire interior clockwise, skipping permanent pillars, ending at the centre.
function spiral(board){
 const cells=[];
 let left=1,top=1,right=board[0].length-2,bottom=board.length-2;
 const add=(x,y)=>{if(board[y][x]!==1)cells.push({x,y});};
 while(left<=right&&top<=bottom){
  for(let x=left;x<=right;x++)add(x,top);top++;
  for(let y=top;y<=bottom;y++)add(right,y);right--;
  if(top<=bottom){for(let x=right;x>=left;x--)add(x,bottom);bottom--;}
  if(left<=right){for(let y=bottom;y>=top;y--)add(left,y);left++;}
 }
 return cells;
}
function create(board,roundStartsAt){return{startsAt:roundStartsAt+DELAY,index:0,path:spiral(board)};}
function view(c,t){
 if(!c)return null;
 const falling=[];
 for(let i=c.index;i<c.path.length;i++){
  const landsAt=c.startsAt+i*INTERVAL;if(landsAt-WARNING>t)break;
  falling.push({...c.path[i],startedAt:landsAt-WARNING,landsAt});
 }
 return{startsAt:c.startsAt,interval:INTERVAL,closed:c.index,total:c.path.length,falling};
}
function update(room,t){
 const c=room.collapse;if(!c)return;
 const eliminated=new Set();
 while(c.index<c.path.length&&t>=c.startsAt+c.index*INTERVAL){
  const tile=c.path[c.index++],key=`${tile.x},${tile.y}`;
  room.board[tile.y][tile.x]=1;room.powerups.delete(key);
  room.pendingPowerups=room.pendingPowerups?.filter(p=>p.x!==tile.x||p.y!==tile.y)||[];
  room.flames=room.flames.filter(f=>f.x!==tile.x||f.y!==tile.y);
  room.bombs=room.bombs.filter(b=>{
   if(!(b.x===tile.x&&b.y===tile.y||b.slide?.fromX===tile.x&&b.slide?.fromY===tile.y))return true;
   const owner=room.players.get(b.ownerId);if(owner)owner.activeBombs=Math.max(0,owner.activeBombs-1);return false;
  });
  for(const p of room.players.values())if(p.alive&&physics.overlaps(p,tile))eliminated.add(p);
  room.effects.push({kind:'slam',...tile,startedAt:t,expiresAt:t+450});
 }
 const place=room.participantsAtStart-room.eliminatedCount;
 for(const p of eliminated){p.alive=false;p.place=place;p.motion={x:0,y:0};p.inputQueue=[];}
 room.eliminatedCount+=eliminated.size;
}
module.exports={DELAY,INTERVAL,WARNING,spiral,create,view,update};
