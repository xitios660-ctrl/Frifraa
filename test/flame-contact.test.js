const test=require('node:test');
const assert=require('node:assert/strict');
const physics=require('../public/physics');
const f={x:0,y:0},tiles=new Set(['0,0']);
test('damage requires contact with the solid flame, not nearby glow or a square corner',()=>{
 assert.equal(physics.touchesFlame({x:0,y:0},f,tiles),true);
 assert.equal(physics.touchesFlame({x:.61,y:0},f,tiles),true);
 assert.equal(physics.touchesFlame({x:.7,y:0},f,tiles),false,'only decorative glow reaches this body');
 assert.equal(physics.touchesFlame({x:.65,y:.7},f,tiles),false,'rounded corner does not touch the body');
 assert.equal(physics.touchesFlame({x:.58,y:.7},f,tiles),true,'actual rounded corner touches the body');
 assert.equal(physics.touchesFlame({x:1,y:0},f,tiles),false);
 assert.equal(physics.touchesFlame({x:0,y:1},f,tiles),false);
 assert.equal(physics.touchesFlame({x:1,y:1},f,tiles),false);
});
test('connected fire arms use the same geometry as the drawn flames',()=>{
 const connected=new Set(['0,0','1,0']);
 assert.equal(physics.flameShapes(f,connected).length,2);
 assert.equal(physics.touchesFlame({x:.74,y:0},f,tiles),false);
 assert.equal(physics.touchesFlame({x:.74,y:0},f,connected),true);
});
test('one-tile footprint cannot partially enter a wall or a neighbouring occupied bomb tile',()=>{
 const board=Array.from({length:5},()=>Array(5).fill(0));board[2][2]=1;
 const p={id:'p',x:1,y:2,speed:170};
 assert.equal(physics.canOccupy(p,1,2,board,[]),true);
 assert.equal(physics.canOccupy(p,1.01,2,board,[]),false);
 assert.equal(physics.canOccupy(p,1,1,board,[{x:2,y:1}]),true);
 assert.equal(physics.canOccupy(p,1.01,1,board,[{x:2,y:1}]),false);
 assert.equal(physics.RADIUS*2,1);
});
test('movement contact callbacks cover the full swept path rather than just the final point',()=>{
 const board=Array.from({length:5},()=>Array(6).fill(0));
 const p={id:'p',x:1,y:1,speed:100};const trail=[];
 physics.move(p,{x:1,y:0},.05,board,[],(x,y)=>trail.push({x,y}));
 assert.ok(trail.length>=20);
 assert.ok(trail.some(p=>p.x>=1.2&&p.x<=1.3));
 assert.ok(Math.abs(trail.at(-1).x-1.5)<.00001);
});
