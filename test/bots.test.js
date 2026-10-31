const test=require('node:test');
const assert=require('node:assert/strict');
const ai=require('../bots');
const physics=require('../public/physics');
function fixture(){
 const board=Array.from({length:7},(_,y)=>Array.from({length:7},(_,x)=>!x||!y||x===6||y===6?1:0));
 const p={id:'bot',x:2,y:3,speed:170,range:2,bombs:1,activeBombs:0,alive:true};
 return {p,room:{board,bombs:[],flames:[],powerups:new Map(),players:new Map([[p.id,p]])}};
}
test('bot plants a useful bomb only when an escape path exists, then runs to safety',()=>{
 const {room,p}=fixture();room.board[3][3]=2;
 const action=ai.decide(room,p,1000);
 assert.equal(action.bomb,true);assert.ok(action.path.length>=2);
 function putBomb(){p.activeBombs++;room.bombs.push({x:Math.round(p.x),y:Math.round(p.y),range:2,explodeAt:3250,passThrough:[p.id]});}
 for(let i=0;i<90;i++){
  const before={x:p.x,y:p.y};ai.update(room,p,1000+i*1000/60,1/60,putBomb);
  assert.ok(physics.canOccupy(p,p.x,p.y,room.board,room.bombs));
  assert.ok(Math.hypot(p.x-before.x,p.y-before.y)<=1000/170/60+.00001);
 }
 assert.equal(room.bombs.length,1);
 assert.ok(!ai.blast(room.board,room.bombs[0]).some(c=>Math.abs(p.x-c.x)<.72&&Math.abs(p.y-c.y)<.72));
});
test('bot refuses a bomb that would trap it in a dead-end corridor',()=>{
 const {room,p}=fixture();room.board=room.board.map(row=>row.map(()=>1));
 for(let x=1;x<=5;x++)room.board[3][x]=0;
 room.board[3][4]=2;p.x=3;
 assert.equal(ai.decide(room,p,1000).bomb,false);
});
test('bot danger prediction accounts for chains and active flames',()=>{
 const {room}=fixture();
 room.bombs=[{x:1,y:3,range:3,explodeAt:2000},{x:3,y:3,range:2,explodeAt:5000}];
 room.flames=[{x:4,y:4,expiresAt:1500}];
 const danger=ai.dangerMap(room);
 assert.ok(danger.get('3,4').some(d=>d.start===2000));
 assert.ok(danger.get('4,4').some(d=>d.start===0&&d.end===1500));
});
test('bot approaches opponents on an open map instead of standing still',()=>{
 const {room,p}=fixture();room.players.set('human',{id:'human',x:5,y:3,alive:true});
 const action=ai.decide(room,p,1000);
 assert.ok(action.path.length>0);
 assert.equal(action.path[0].x,3);
});
