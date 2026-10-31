const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
test('server spares a nearby player, eliminates on actual flame contact and catches a swept crossing',()=>{
 const script=`
 const assert=require('node:assert/strict');let time=100000;Date.now=()=>time;
 const {newRoom,tick}=require('./server');const ws={playerId:'p',readyState:0,send(){}};
 const room=newRoom('TESTA',ws,'Mary'),p=room.players.get('p');
 room.board=Array.from({length:7},(_,y)=>Array.from({length:12},(_,x)=>!x||!y||x===11||y===6?1:0));
 room.phase='playing';room.participantsAtStart=1;room.lastTick=time;
 room.flames=[{x:2,y:2,startedAt:time,expiresAt:time+1000,ownerId:'p'}];
 p.x=2.7;p.y=2;time+=17;tick();assert.equal(p.alive,true,'proximity and glow cannot kill');
 p.x=2.61;time+=17;tick();assert.equal(p.alive,false,'solid fire contact must kill');
 room.phase='playing';p.alive=true;p.place=null;p.x=1;p.y=3;p.speed=10;p.motion={x:1,y:0};p.lastInput=time;
 room.lastTick=time;room.flames=[{x:3,y:3,startedAt:time,expiresAt:time+1000,ownerId:'p'}];
 time+=50;tick();assert.ok(p.x>4);assert.equal(p.alive,false,'crossing fire cannot skip contact between endpoints');
 console.log('PASS');process.kill(process.pid,'SIGTERM');
 `;
 const child=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,PORT:String(49000+Math.floor(Math.random()*1000))},encoding:'utf8',timeout:5000});
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/PASS/);
});
