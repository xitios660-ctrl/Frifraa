const test = require('node:test');
const assert = require('node:assert/strict');
const {move} = require('../public/physics');
const board = Array.from({length:7},(_,y)=>Array.from({length:7},(_,x)=>x===0||y===0||x===6||y===6?1:0));
test('movimento fracionário, velocidade independente da frequência e colisão',()=>{
 const a={x:1,y:1,speed:170}, b={...a};
 for(let i=0;i<60;i++) move(a,{x:1,y:0},1/60,board,[]);
 for(let i=0;i<120;i++) move(b,{x:1,y:0},1/120,board,[]);
 assert.ok(Math.abs(a.x-b.x)<.04);
 assert.ok(a.x<=5.22 && a.x>5);
 move(b,{x:0,y:1},1/60,board,[]);
 assert.equal(b.facing,'down');
});
test('bomba permite sair, mas bloqueia o retorno',()=>{
 const p={x:2,y:2,speed:170}, bombs=[{x:2,y:2}];
 for(let i=0;i<20;i++) move(p,{x:1,y:0},1/60,board,bombs);
 assert.ok(p.x>3);
 for(let i=0;i<30;i++) move(p,{x:-1,y:0},1/60,board,bombs);
 assert.ok(p.x>=2.78);
});
