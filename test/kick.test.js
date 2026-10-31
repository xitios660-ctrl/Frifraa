const test=require('node:test');
const assert=require('node:assert/strict');
const motion=require('../bomb-motion');
const physics=require('../public/physics');
const ai=require('../bots');
function fixture(){
 const board=Array.from({length:7},(_,y)=>Array.from({length:11},(_,x)=>!x||!y||x===10||y===6?1:0));
 const p={id:'p',x:2,y:3,alive:true,kick:true,speed:170};
 const bomb={id:'b',x:3,y:3,ownerId:'other',placedAt:0,explodeAt:3250,range:2,passThrough:[]};
 return{p,bomb,room:{board,bombs:[bomb],players:new Map([[p.id,p]]),effects:[],flames:[],powerups:new Map()}};
}
test('glove kicks a bomb smoothly along a corridor without resetting its fuse or owner',()=>{
 const {p,bomb,room}=fixture();assert.equal(motion.tryKick(room,p,{x:1,y:0},1000),true);
 assert.deepEqual(bomb.rolling,{x:1,y:0});assert.deepEqual(bomb.slide,{fromX:3,fromY:3,startedAt:1000,endsAt:1100});
 assert.equal(bomb.x,4);assert.equal(bomb.explodeAt,3250);assert.equal(bomb.ownerId,'other');
 assert.equal(physics.canOccupy(p,3,3,room.board,room.bombs),false,'origin remains occupied during the slide');
 assert.equal(physics.canOccupy(p,4,3,room.board,room.bombs),false,'destination is reserved against crossing players');
 motion.update(room,1099);assert.equal(bomb.x,4);motion.update(room,1100);assert.equal(bomb.x,5);
 assert.equal(physics.canOccupy(p,3,3,room.board,room.bombs),true);
 for(let t=1200;t<=1900;t+=100)motion.update(room,t);
 assert.equal(bomb.x,9);assert.equal(bomb.rolling,null);assert.equal(bomb.slide,null);
 assert.equal(bomb.explodeAt,3250);
});
test('kick respects walls, crates, other bombs, sliding reservations and player footprints',()=>{
 for(const obstacle of ['wall','crate','bomb','moving-bomb','player','rider']){
  const {p,bomb,room}=fixture();
  if(obstacle==='wall')room.board[3][4]=1;
  if(obstacle==='crate')room.board[3][4]=2;
  if(obstacle==='bomb')room.bombs.push({x:4,y:3});
  if(obstacle==='moving-bomb')room.bombs.push({x:5,y:3,slide:{fromX:4,fromY:3}});
  if(obstacle==='rider')room.players.set('other',{id:'other',x:3,y:3,alive:true});
  if(obstacle==='player')room.players.set('other',{id:'other',x:4.7,y:3,alive:true});
  assert.equal(motion.tryKick(room,p,{x:1,y:0},1000),false,obstacle);assert.equal(bomb.x,3);assert.ok(!bomb.rolling);
 }
});
test('players without the glove, off-centre turns, pass-through and expiring bombs cannot initiate kicks',()=>{
 for(const mode of ['no-glove','off-centre','fuse','standing-on-bomb']){
  const {p,bomb,room}=fixture();
  if(mode==='no-glove')p.kick=false;if(mode==='off-centre')p.x=2.1;
  if(mode==='fuse')bomb.explodeAt=1099;if(mode==='standing-on-bomb')bomb.passThrough=['p'];
  assert.equal(motion.tryKick(room,p,{x:1,y:0},1000),false,mode);assert.equal(bomb.x,3);
 }
});
test('rolls stop before approaching players, preserve free houses and do not skip obstacles after a stalled tick',()=>{
 const {p,bomb,room}=fixture();motion.tryKick(room,p,{x:1,y:0},1000);
 room.players.set('q',{id:'q',x:5,y:3,alive:true});motion.update(room,1100);
 assert.equal(bomb.x,4);assert.equal(bomb.rolling,null);assert.equal(bomb.slide,null);
 assert.equal(physics.canOccupy(p,3,3,room.board,room.bombs),true);
 room.players.delete('q');motion.tryKick(room,{...p,x:3},{x:1,y:0},1200);
 room.board[3][6]=2;motion.update(room,2000);assert.equal(bomb.x,5);assert.equal(bomb.rolling,null);
});
test('bots anticipate rolling bomb corridors and their future blast instead of pursuing them',()=>{
 const {p,bomb,room}=fixture();motion.tryKick(room,p,{x:1,y:0},1000);
 const projected=motion.projected(room,bomb,1000);assert.ok(projected.some(c=>c.x===9));
 const danger=ai.dangerMap(room,room.bombs,1000);assert.ok(danger.has('4,3'));assert.ok(danger.has('9,3')); 
});

test('rolling artwork interpolates continuously between houses without changing bomb collision coordinates',()=>{
 const {bombPoint}=require('../public/effects');const b={x:5,y:3,slide:{fromX:4,fromY:3,startedAt:1000,endsAt:1100}};
 assert.deepEqual(bombPoint(b,1000),{x:4,y:3});assert.deepEqual(bombPoint(b,1050),{x:4.5,y:3});assert.deepEqual(bombPoint(b,1200),{x:5,y:3});
 assert.equal(b.x,5);
});

test('glove starts legal rolls in all four cardinal directions',()=>{
 for(const [x,y] of [[1,0],[-1,0],[0,1],[0,-1]]){
  const {p,bomb,room}=fixture();p.x=5;p.y=3;bomb.x=p.x+x;bomb.y=p.y+y;
  assert.equal(motion.tryKick(room,p,{x,y},1000),true);assert.equal(bomb.x,p.x+2*x);assert.equal(bomb.y,p.y+2*y);
 }
});
