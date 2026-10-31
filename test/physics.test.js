const test = require('node:test');
const assert = require('node:assert/strict');
const {move} = require('../public/physics');
const board = Array.from({length:7},(_,y)=>Array.from({length:7},(_,x)=>x===0||y===0||x===6||y===6?1:0));
test('movimento fracionário, velocidade independente da frequência e colisão',()=>{
 const a={x:1,y:1,speed:170}, b={...a};
 for(let i=0;i<60;i++) move(a,{x:1,y:0},1/60,board,[]);
 for(let i=0;i<120;i++) move(b,{x:1,y:0},1/120,board,[]);
 assert.ok(Math.abs(a.x-b.x)<.04);
 assert.ok(a.x<=5.25 && a.x>5);
 move(b,{x:0,y:1},1/60,board,[]);
 assert.equal(b.facing,'down');
});
test('bomba permite sair, mas bloqueia o retorno',()=>{
 const p={id:'p',x:2,y:2,speed:170}, bombs=[{x:2,y:2,passThrough:['p']}];
 for(let i=0;i<20;i++) move(p,{x:1,y:0},1/60,board,bombs);
 assert.ok(p.x>3);
 for(let i=0;i<30;i++) move(p,{x:-1,y:0},1/60,board,bombs);
 assert.ok(p.x>=2.75);
});

test('turns into corridors from an off-centre position without snapping through walls',()=>{
 const map=board.map(row=>[...row]);map[2][2]=1;
 const p={id:'p',x:1.4,y:1,speed:170};
 for(let i=0;i<35;i++) {
   const before={...p};move(p,{x:0,y:1},1/60,map,[]);
   assert.ok(Math.hypot(p.x-before.x,p.y-before.y)<=1000/170/60+.00001);
   assert.ok(require('../public/physics').canOccupy(p,p.x,p.y,map,[]));
 }
 assert.ok(p.y>2.5 && p.x<=1.25);
});
test('new bomb can be exited in either direction even when placed off centre',()=>{
 for(const [x,y,dx,dy] of [[2.4,2,-1,0],[1.6,2,1,0],[2,2.4,0,-1],[2,1.6,0,1]]) {
   const p={id:'p',x,y,speed:170},bombs=[{x:2,y:2,passThrough:['p']}];
   for(let i=0;i<30;i++) move(p,{x:dx,y:dy},1/60,board,bombs);
   assert.ok(!bombs[0].passThrough.includes('p'));
   const escaped={...p};
   for(let i=0;i<30;i++) move(p,{x:-dx,y:-dy},1/60,board,bombs);
   assert.ok(Math.abs(p.x-2)>=.75 || Math.abs(p.y-2)>=.75);
   assert.ok(Math.hypot(escaped.x-2,escaped.y-2)>.75);
 }
});
test('other players cannot walk through a bomb, and a removed bomb immediately frees the path',()=>{
 const p={id:'other',x:1,y:2,speed:170},bombs=[{x:2,y:2,passThrough:['owner']}];
 for(let i=0;i<20;i++) move(p,{x:1,y:0},1/60,board,bombs);
 assert.ok(p.x<=1.25);
 for(let i=0;i<20;i++) move(p,{x:1,y:0},1/60,board,[]);
 assert.ok(p.x>2.5);
});
