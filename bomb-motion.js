'use strict';
const physics=require('./public/physics');
const STEP_MS=100;
function occupies(b,x,y){return b.x===x&&b.y===y||b.slide?.fromX===x&&b.slide?.fromY===y;}
function clear(room,b,x,y){
 return room.board[y]?.[x]===0&&!room.bombs.some(other=>other!==b&&occupies(other,x,y))&&
  ![...room.players.values()].some(p=>p.alive&&physics.overlaps(p,{x,y}));
}
function step(room,b,t){
 const dx=b.rolling.x,dy=b.rolling.y,x=b.x+dx,y=b.y+dy;
 if(b.rolling.steps===0||b.explodeAt<=t+STEP_MS||!clear(room,b,x,y)){b.rolling=null;b.slide=null;return false;}
 if(Number.isInteger(b.rolling.steps))b.rolling.steps--;
 b.slide={fromX:b.x,fromY:b.y,startedAt:t,endsAt:t+STEP_MS};b.x=x;b.y=y;b.passThrough=[];
 return true;
}
function tryKick(room,p,direction,t){
 if(!(p.kick||p.push)||!p.alive||!Number.isInteger(p.x)||!Number.isInteger(p.y))return false;
 const {x:dx,y:dy}=direction;if(Math.abs(dx)+Math.abs(dy)!==1)return false;
 const b=room.bombs.find(b=>b.x===p.x+dx&&b.y===p.y+dy&&!b.rolling&&!b.passThrough?.includes(p.id));
 if(!b||[...room.players.values()].some(other=>other.alive&&physics.overlaps(other,b)))return false;
 b.rolling=p.kick?{x:dx,y:dy}:{x:dx,y:dy,steps:1};
 if(!step(room,b,t))return false;
 room.effects.push({kind:p.kick?'kick':'push',x:p.x+dx,y:p.y+dy,startedAt:t,expiresAt:t+260});
 return true;
}
function update(room,t){
 for(const b of room.bombs){
  if(!b.rolling||b.slide&&t<b.slide.endsAt)continue;
  // Resume from the last completed house; never skip unchecked houses after a pause.
  step(room,b,t);
 }
}
function projected(room,b,t){
 const result=[{x:b.x,y:b.y,at:t}];if(!b.rolling||b.rolling.steps===0)return result;
 let x=b.x,y=b.y,at=b.slide?.endsAt||t;
 for(let i=0;i<64;i++){
  const nx=x+b.rolling.x,ny=y+b.rolling.y;if(at+STEP_MS>=b.explodeAt||!clear(room,b,nx,ny))break;
  x=nx;y=ny;at+=STEP_MS;result.push({x,y,at});
 }
 return result;
}
module.exports={STEP_MS,occupies,tryKick,update,projected};
