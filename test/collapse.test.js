const test=require('node:test');
const assert=require('node:assert/strict');
const collapse=require('../collapse');
const maps=require('../public/maps');
const physics=require('../public/physics');
const bots=require('../bots');
function room(){
 const board=Array.from({length:7},(_,y)=>Array.from({length:9},(_,x)=>!x||!y||x===8||y===6?1:0));
 return{board,players:new Map(),powerups:new Map(),pendingPowerups:[],effects:[],bombs:[],flames:[],participantsAtStart:4,eliminatedCount:0,collapse:collapse.create(board,1000)};
}
test('spiral closes each traversable or destructible cell once, from perimeter to centre, on all four maps',()=>{
 for(const id of Object.keys(maps.DEFS)){
  const board=maps.create(id),path=collapse.spiral(board),keys=path.map(c=>`${c.x},${c.y}`);
  assert.equal(keys.length,new Set(keys).size);
  assert.deepEqual(path[0],{x:1,y:1});assert.deepEqual(path[1],{x:2,y:1});
  assert.equal(path.length,board.flat().filter(cell=>cell!==1).length);
  for(const c of path)assert.notEqual(board[c.y][c.x],1);
  const last=path.at(-1);assert.ok(Math.abs(last.x-(maps.WIDTH-1)/2)<=1||Math.abs(last.y-(maps.HEIGHT-1)/2)<=1);
 }
});
test('timer begins after countdown, warns before landing and applies each wall once at its deadline',()=>{
 const r=room(),start=r.collapse.startsAt;
 assert.equal(start,91000);collapse.update(r,start-1);assert.equal(r.board[1][1],0);
 const v=collapse.view(r.collapse,start-600);assert.equal(v.falling.length,1);assert.equal(v.falling[0].landsAt,start);
 collapse.update(r,start);assert.equal(r.board[1][1],1);assert.equal(r.collapse.index,1);
 assert.equal(physics.canOccupy({id:'p'},1,1,r.board,[]),false);
 collapse.update(r,start);assert.equal(r.collapse.index,1);
 collapse.update(r,start+350);assert.equal(r.board[1][2],1);assert.equal(r.collapse.index,2);
});
test('falling walls crush intersecting players despite shields and remove bombs, flames and items',()=>{
 const r=room(),p={id:'p',x:1.25,y:1,alive:true,shield:1,activeBombs:1,inputQueue:[{}]},safe={id:'s',x:2,y:1,alive:true};
 r.players.set('p',p);r.players.set('s',safe);r.powerups.set('1,1','shield');r.pendingPowerups=[{x:1,y:1}];
 r.bombs=[{x:1,y:1,ownerId:'p'}];r.flames=[{x:1,y:1}];
 collapse.update(r,r.collapse.startsAt);
 assert.equal(p.alive,false);assert.equal(p.place,4);assert.equal(safe.alive,true);assert.equal(p.activeBombs,0);
 assert.equal(r.bombs.length,0);assert.equal(r.flames.length,0);assert.equal(r.powerups.size,0);assert.equal(r.pendingPowerups.length,0);
 collapse.update(r,r.collapse.startsAt+1e6);assert.equal(r.collapse.index,r.collapse.path.length);
 assert.equal(safe.alive,false);assert.ok(r.board.flat().every(cell=>cell===1));
});
test('bots treat announced falling walls as permanent future hazards and escape them',()=>{
 const r=room(),p={id:'b',x:1,y:1,alive:true,speed:170,bombs:1,range:2,activeBombs:0};r.players.set('b',p);
 const t=r.collapse.startsAt-800,danger=bots.dangerMap(r);
 assert.equal(danger.get('1,1')[0].end,Infinity);
 const action=bots.decide(r,p,t);assert.equal(action.bomb,false);assert.ok(action.path.length>0);assert.notDeepEqual(action.path[0],{x:1,y:1});
});
