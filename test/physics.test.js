const test = require('node:test');
const assert = require('node:assert/strict');
const {move} = require('../public/physics');
const board = Array.from({length:7},(_,y)=>Array.from({length:7},(_,x)=>x===0||y===0||x===6||y===6?1:0));
test('movimento fracionário, velocidade independente da frequência e colisão',()=>{
 const a={x:1,y:1,speed:170}, b={...a};
 for(let i=0;i<60;i++) move(a,{x:1,y:0},1/60,board,[]);
 for(let i=0;i<120;i++) move(b,{x:1,y:0},1/120,board,[]);
 assert.ok(Math.abs(a.x-b.x)<.04);
 assert.ok(a.x<=5.00001 && a.x>4.95);
 move(b,{x:0,y:1},1/60,board,[]);
 assert.equal(b.facing,'down');
});
test('bomba permite sair, mas bloqueia o retorno',()=>{
 const p={id:'p',x:2,y:2,speed:170}, bombs=[{x:2,y:2,passThrough:['p']}];
 for(let i=0;i<20;i++) move(p,{x:1,y:0},1/60,board,bombs);
 assert.ok(p.x>3);
 for(let i=0;i<30;i++) move(p,{x:-1,y:0},1/60,board,bombs);
 assert.ok(p.x>=2.99999);
});

test('turns into corridors from an off-centre position without snapping through walls',()=>{
 const map=board.map(row=>[...row]);map[2][2]=1;
 const p={id:'p',x:1.4,y:1,speed:170};
 for(let i=0;i<35;i++) {
   const before={...p};move(p,{x:0,y:1},1/60,map,[]);
   assert.ok(Math.hypot(p.x-before.x,p.y-before.y)<=1000/170/60+.00001);
   assert.ok(require('../public/physics').canOccupy(p,p.x,p.y,map,[]));
 }
 assert.ok(p.y>2.5 && p.x<=1.00001);
});
test('new bomb can be exited in either direction even when placed off centre',()=>{
 for(const [x,y,dx,dy] of [[2.4,2,-1,0],[1.6,2,1,0],[2,2.4,0,-1],[2,1.6,0,1]]) {
   const p={id:'p',x,y,speed:170},bombs=[{x:2,y:2,passThrough:['p']}];
   for(let i=0;i<30;i++) move(p,{x:dx,y:dy},1/60,board,bombs);
   assert.ok(!bombs[0].passThrough.includes('p'));
   const escaped={...p};
   for(let i=0;i<30;i++) move(p,{x:-dx,y:-dy},1/60,board,bombs);
   assert.ok(Math.abs(p.x-2)>=.99999 || Math.abs(p.y-2)>=.99999);
   assert.ok(Math.hypot(escaped.x-2,escaped.y-2)>.99999);
 }
});
test('other players cannot walk through a bomb, and a removed bomb immediately frees the path',()=>{
 const p={id:'other',x:1,y:2,speed:170},bombs=[{x:2,y:2,passThrough:['owner']}];
 for(let i=0;i<20;i++) move(p,{x:1,y:0},1/60,board,bombs);
 assert.ok(p.x<=1.00001);
 for(let i=0;i<20;i++) move(p,{x:1,y:0},1/60,board,[]);
 assert.ok(p.x>2.5);
});
test('half-tile corner turns find the free lane rather than trapping against the nearest blocked lane',()=>{
 for(const offset of [1.49,1.5,1.51,1.6,1.7,1.75]){
  const map=board.map(row=>[...row]);map[2][2]=1;
  const p={id:'p',x:offset,y:1,speed:170};
  for(let i=0;i<50;i++)move(p,{x:0,y:1},1/60,map,[]);
  assert.ok(p.y>3,`stuck at offset ${offset}`);
 }
});
test('a character can circle a solid block repeatedly without clipping, snapping or getting stuck',()=>{
 const map=board.map(row=>[...row]);map[2][2]=1;
 const p={id:'p',x:1,y:1,speed:170};
 for(let lap=0;lap<12;lap++)for(const [target,dir] of [[{x:3,y:1},{x:1,y:0}],[{x:3,y:3},{x:0,y:1}],[{x:1,y:3},{x:-1,y:0}],[{x:1,y:1},{x:0,y:-1}]]){
  let steps=0;
  while(Math.hypot(p.x-target.x,p.y-target.y)>.00001&&steps++<100){
   const before={...p},distance=Math.abs(dir.x?target.x-p.x:target.y-p.y);
   move(p,dir,Math.min(1/60,distance*p.speed/1000),map,[]);
   assert.ok(require('../public/physics').canOccupy(p,p.x,p.y,map,[]));
   assert.ok(Math.hypot(p.x-before.x,p.y-before.y)<=1000/170/60+.00001);
  }
  assert.ok(steps<100,'character got stuck circling a block');
 }
});
test('bomb-pass crosses bombs while preserving wall collision',()=>{
 const p={id:'p',x:1,y:2,speed:170,bombPass:true},bombs=[{x:2,y:2,passThrough:[]}];
 for(let i=0;i<25;i++)move(p,{x:1,y:0},1/60,board,bombs);
 assert.ok(p.x>3);
 for(let i=0;i<60;i++)move(p,{x:1,y:0},1/60,board,bombs);
 assert.ok(p.x<=5.00001);
});
