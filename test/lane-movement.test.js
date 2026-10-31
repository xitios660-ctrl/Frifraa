const test=require('node:test');
const assert=require('node:assert/strict');
const physics=require('../public/physics');
const maps=require('../public/maps');
const net=require('../public/netcode');
function random(seed){return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/2**32;};}
test('tiny alignment errors beside a block recover instead of permanently trapping the player',()=>{
 const board=Array.from({length:7},(_,y)=>Array.from({length:7},(_,x)=>!x||!y||x===6||y===6||x===2&&y===2?1:0));
 for(const error of [.000002,.00002,.0002,.0009,-.000002,-.00002,-.0002,-.0009]){
  for(const axis of ['x','y']){
   const p={id:'p',x:1,y:1,speed:170};p[axis==='x'?'y':'x']+=error;
   const direction=axis==='x'?{x:1,y:0}:{x:0,y:1};
   for(let i=0;i<100;i++)physics.move(p,direction,1/60,board,[]);
   assert.ok(p[axis]>4.99,`stuck moving ${axis} with error ${error}`);
   assert.equal(p[axis==='x'?'y':'x'],1);
  }
 }
});
test('16,000 rapid direction changes across all maps preserve legal, centre-line movement',()=>{
 const rng=random(48117),directions=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:0,y:0}];
 for(const id of Object.keys(maps.DEFS)){
  const board=maps.create(id,rng),p={id:'p',x:1,y:1,speed:170};
  for(let frame=0;frame<4000;frame++){
   const before={...p},direction=directions[Math.floor(rng()*directions.length)];
   physics.move(p,direction,1/60,board,[]);
   assert.ok(physics.canOccupy(p,p.x,p.y,board,[]),`${id}: wall penetration`);
   assert.ok(Number.isInteger(p.x)||Number.isInteger(p.y),`${id}: left the corridor centre-line`);
   assert.ok(Math.hypot(p.x-before.x,p.y-before.y)<=1000/170/60+.00002,`${id}: position jumped`);
   if(Number.isInteger(before.x)&&Number.isInteger(before.y)&&(direction.x||direction.y)&&physics.canOccupy(before,before.x+direction.x,before.y+direction.y,board,[])){
    assert.ok(Math.hypot(p.x-before.x,p.y-before.y)>.01,`${id}: failed to enter an open neighbour`);
   }
  }
 }
});
test('blocked turns stay responsive to reversal and free turns at partial-cell positions',()=>{
 const board=maps.create('classic',()=>.99);
 for(let offset=.02;offset<.99;offset+=.02){
  const p={id:'p',x:1+offset,y:1,speed:170};
  for(let i=0;i<30;i++)physics.move(p,{x:0,y:1},1/60,board,[]);
  assert.ok(p.y>2,`turn stuck at offset ${offset}`);
  for(let i=0;i<40;i++)physics.move(p,{x:0,y:-1},1/60,board,[]);
  assert.ok(p.y<1.01);
 }
});
test('rapid reversals replay identically with delayed acknowledgements near walls and bombs',()=>{
 const board=maps.create('classic',()=>.99),rng=random(4);
 const p={id:'p',x:1,y:1,speed:170,ack:0};
 const bombs=[{x:1,y:1,passThrough:['p']}];
 const model=net.create(p,board,bombs),server={...p},serverBombs=JSON.parse(JSON.stringify(bombs));
 const packets=[],snapshots=[],dirs=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}];
 const expected={...p},expectedBombs=JSON.parse(JSON.stringify(bombs));
 for(let frame=0;frame<800;frame++){
  const direction=dirs[Math.floor(rng()*4)];net.advance(model,direction);
  physics.move(expected,direction,net.STEP,board,expectedBombs);
  packets.push({at:frame+10,command:model.outbound.shift()});
  while(packets[0]?.at<=frame){const {command}=packets.shift();physics.move(server,command,net.STEP,board,serverBombs);server.ack=command.seq;}
  if(frame%2===0)snapshots.push({at:frame+10,p:{...server},bombs:JSON.parse(JSON.stringify(serverBombs))});
  while(snapshots[0]?.at<=frame){const snapshot=snapshots.shift();net.acknowledge(model,snapshot.p,board,snapshot.bombs);}
  assert.ok(Math.hypot(model.player.x-expected.x,model.player.y-expected.y)<1e-8);
 }
});
test('render interpolation follows a corner instead of drawing diagonally through its block',()=>{
 const board=Array.from({length:7},(_,y)=>Array.from({length:7},(_,x)=>!x||!y||x===6||y===6||x===2&&y===2?1:0));
 const history=[{time:100,players:[{id:'p',x:2.8,y:1}]},{time:200,players:[{id:'p',x:3,y:1.2}]}];
 for(let time=100;time<=200;time++){
  const p=net.remotePosition(history,'p',time);
  assert.ok(physics.canOccupy(p,p.x,p.y,board,[]));
  assert.ok(Number.isInteger(p.x)||Number.isInteger(p.y));
 }
 let point={x:2.8,y:1};
 for(let frame=0;frame<10;frame++){
  point=net.displayPoint(point,{x:3,y:1.2},1/60,170);
  assert.ok(physics.canOccupy(point,point.x,point.y,board,[]));
  assert.ok(Number.isInteger(point.x)||Number.isInteger(point.y));
 }
});
test('every open junction on every map accepts buffered turns from both segment orientations',()=>{
 let turns=0;
 for(const id of Object.keys(maps.DEFS)){
  const board=maps.create(id,()=>.99);
  for(let y=1;y<maps.HEIGHT-1;y++)for(let x=1;x<maps.WIDTH-1;x++)for(const horizontal of [true,false]){
   const end={x:x+(horizontal?1:0),y:y+(horizontal?0:1)};
   if(board[y]?.[x]!==0||board[end.y]?.[end.x]!==0)continue;
   for(const sign of [-1,1]){
    const dir=horizontal?{x:0,y:sign}:{x:sign,y:0};
    if(board[y+dir.y]?.[x+dir.x]!==0&&board[end.y+dir.y]?.[end.x+dir.x]!==0)continue;
    for(const offset of [.01,.3,.5,.8,.99]){
     const p={id:'p',x:x+(horizontal?offset:0),y:y+(horizontal?0:offset),speed:170};
     const initial=horizontal?p.y:p.x;
     let progress=0;
     for(let frame=0;frame<60&&progress<.9;frame++){
      physics.move(p,dir,1/60,board,[]);
      assert.ok(physics.canOccupy(p,p.x,p.y,board,[]));
      progress=((horizontal?p.y:p.x)-initial)*sign;
     }
     assert.ok(progress>=.9,`${id}: junction ${x},${y}, offset ${offset}, turn ${dir.x},${dir.y} stuck`);
     turns++;
    }
   }
  }
 }
 assert.ok(turns>10000);
});
