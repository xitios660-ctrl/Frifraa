const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
test('powers change gameplay, shield absorbs one hit, piercing stops at walls, and round reset clears powers',()=>{
 const script=`
 const assert=require('node:assert/strict');let time=100000;Date.now=()=>time;
 const {newRoom,onMessage,tick}=require('./server');
 const ws={playerId:'human',readyState:0,send(){}};const room=newRoom('TESTA',ws,'Gustavo');
 onMessage(ws,JSON.stringify({type:'map',mapId:'ice'}));
 const guest={playerId:'guest',readyState:0,send(){}};onMessage(guest,JSON.stringify({type:'enter',name:'Kaique'}));
 onMessage(guest,JSON.stringify({type:'map',mapId:'factory'}));assert.equal(room.mapChoice,'ice');
 onMessage(ws,JSON.stringify({type:'start'}));
 assert.equal(room.mapId,'ice');const p=room.players.get('human');
 for(const [id,other] of room.players)if(id!==p.id)room.players.delete(id);
 room.participantsAtStart=1;room.phase='playing';room.lastTick=time;
 for(const bonus of ['range','bomb','speed','maxrange','shield','bombpass','pierce']){
  room.powerups.set('1,1',bonus);time+=17;tick();
 }
 assert.equal(p.range,8);assert.equal(p.bombs,2);assert.equal(p.speed,150);
 assert.equal(p.shield,1);assert.equal(p.bombPass,true);assert.equal(p.piercing,true);
 room.board=Array.from({length:7},(_,y)=>Array.from({length:9},(_,x)=>!x||!y||x===8||y===6?1:0));
 room.board[3][3]=2;room.board[3][5]=2;room.board[3][6]=1;
 room.bombs=[{x:2,y:3,range:5,piercing:true,ownerId:p.id,explodeAt:time}];time+=17;tick();
 assert.equal(room.board[3][3],0);assert.equal(room.board[3][5],0);assert.equal(room.board[3][6],1);
 assert.ok(room.flames.some(f=>f.x===5&&f.y===3));assert.ok(!room.flames.some(f=>f.x===6&&f.y===3));
 room.flames=[{x:1,y:1,ownerId:p.id,startedAt:time,expiresAt:time+5000}];time+=17;tick();
 assert.ok(p.alive);assert.equal(p.shield,0);time+=500;tick();assert.ok(p.alive);
 time+=1500;tick();assert.equal(p.alive,false);
 room.phase='finished';onMessage(ws,JSON.stringify({type:'start'}));
 assert.equal(p.alive,true);assert.equal(p.range,2);assert.equal(p.bombPass,false);assert.equal(p.piercing,false);assert.equal(p.shield,0);
 const selected=new Set();
 onMessage(ws,JSON.stringify({type:'map',mapId:'rotation'}));
 for(let i=0;i<4;i++){room.phase='finished';onMessage(ws,JSON.stringify({type:'map',mapId:'rotation'}));onMessage(ws,JSON.stringify({type:'start'}));selected.add(room.mapId);}
 assert.equal(selected.size,4);
 console.log('PASS');process.kill(process.pid,'SIGTERM');
 `;
 const child=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,PORT:String(47000+Math.floor(Math.random()*1000))},encoding:'utf8',timeout:5000});
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/PASS/);
});
