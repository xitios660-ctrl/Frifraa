'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
test('one life and short fire for all four skins and bots; hearts, respawn protection, speed levels and immutable crate cover',()=>{
 const script=`
 const assert=require('node:assert/strict');let time=100000;Date.now=()=>time;
 const {newRoom,onMessage,tick,rooms}=require('./server');
 const setup=(name='Mary')=>{rooms.clear();const ws={playerId:'p',readyState:0,send(){}};const r=newRoom('QA',ws,name);onMessage(ws,JSON.stringify({type:'start'}));r.phase='playing';r.participantsAtStart=1;r.collapse=null;r.lastTick=time;r.board=Array.from({length:21},(_,y)=>Array.from({length:31},(_,x)=>!x||!y||x===30||y===20?1:0));r.powerups.clear();return{r,p:r.players.get('p'),ws};};
 for(const name of ['Mary','Kaique','Jheniffer','Gustavo']){const {p}=setup(name);assert.equal(p.lives,1);assert.equal(p.range,1);assert.equal(p.speedLevel,1);}
 const {r,p,ws}=setup();
 onMessage(ws,JSON.stringify({type:'bot-settings',enabled:true}));r.phase='finished';onMessage(ws,JSON.stringify({type:'bot-settings',enabled:true}));onMessage(ws,JSON.stringify({type:'start'}));assert.equal(r.players.size,4);for(const bot of r.players.values()){assert.equal(bot.lives,1);assert.equal(bot.range,1);assert.equal(bot.speedLevel,1);}
 for(const[id]of r.players)if(id!==p.id)r.players.delete(id);r.phase='playing';r.participantsAtStart=1;r.collapse=null;r.powerups.clear();
 const pickup=type=>{r.powerups.set('1,1',type);time+=17;tick();};
 pickup('life');assert.equal(p.lives,2);for(let i=0;i<10;i++)pickup('life');assert.equal(p.lives,5);
 pickup('speed');assert.equal(p.speedLevel,2);assert.equal(p.speed,160);pickup('speed');assert.equal(p.speedLevel,3);assert.equal(p.speed,150);for(let i=0;i<20;i++)pickup('speed');assert.equal(p.speedLevel,3);assert.equal(p.speed,150);
 p.lives=2;r.flames=[{x:1,y:1,startedAt:time,expiresAt:time+500,ownerId:'enemy'}];time+=17;tick();assert.equal(p.lives,1);assert.equal(p.alive,true);assert.ok(p.invulnerableUntil>time);assert.equal(r.board[Math.round(p.y)][Math.round(p.x)],0);assert.ok(!r.flames.some(f=>f.x===p.x&&f.y===p.y));
 r.flames.push({x:p.x,y:p.y,startedAt:time,expiresAt:time+5000,ownerId:'enemy'});time+=17;tick();assert.equal(p.lives,1);time=p.invulnerableUntil+1;tick();assert.equal(p.lives,0);assert.equal(p.alive,false);
 const fixture=setup();const q=fixture.r,player=fixture.p;player.x=6;player.y=3;
 q.board[3][4]=2;q.board[3][9]=2;
 q.bombs=[{id:'a',x:2,y:3,range:9,piercing:true,ownerId:'enemy',explodeAt:time},{id:'b',x:3,y:3,range:9,piercing:true,ownerId:'enemy',explodeAt:time+9999}];time+=17;tick();
 assert.equal(q.board[3][4],0);assert.equal(q.board[3][9],2);assert.equal(q.bombs.length,0);assert.equal(player.alive,true);assert.ok(q.flames.some(f=>f.x===4&&f.y===3));assert.ok(!q.flames.some(f=>f.y===3&&f.x>=5));assert.ok(q.flames.every(f=>f.expiresAt-f.startedAt===500));
 time+=499;tick();assert.ok(q.flames.some(f=>f.x===4&&f.y===3));time+=1;tick();assert.equal(q.flames.length,0);
 // Invulnerability protects against fire, but never leaves a body inside a
 // falling solid tile. A surviving life respawns in a genuinely free house.
 const c=setup();c.p.lives=2;c.p.invulnerableUntil=time+10000;c.r.collapse={startsAt:time,index:0,path:[{x:1,y:1}]};tick();assert.equal(c.p.lives,1);assert.equal(c.p.alive,true);assert.equal(c.r.board[Math.round(c.p.y)][Math.round(c.p.x)],0);
 const n=setup();n.p.lives=2;n.p.usingInputs=true;n.p.lastQueuedSeq=10;n.p.ack=3;n.p.inputQueue=[{seq:10,x:0,y:0}];n.r.lastTick=time;
 n.r.flames=[{x:1,y:1,startedAt:time,expiresAt:time+500,ownerId:'enemy'}];time+=1;tick();assert.equal(n.p.lives,1);assert.equal(n.p.ack,10);assert.equal(n.p.inputQueue.length,0);
 onMessage(n.ws,JSON.stringify({type:'input',epoch:0,steps:[{seq:11,x:1,y:0}]}));assert.equal(n.p.inputQueue.length,0,'commands from before death cannot enter the new input stream');
 onMessage(n.ws,JSON.stringify({type:'input',epoch:n.p.inputEpoch,steps:[{seq:11,x:1,y:0}]}));time+=17;tick();assert.equal(n.p.ack,11,'input continues after respawn instead of freezing on reused sequence numbers');
 console.log('PASS');process.kill(process.pid,'SIGTERM');`;
 const child=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,PORT:'46903'},encoding:'utf8',timeout:8000});
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/PASS/);
});
