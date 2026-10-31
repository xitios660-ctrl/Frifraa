const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
test('skull lasts six seconds, refreshes, preserves speed upgrades and resets with the glove on rematch',()=>{
 const script=`
 const assert=require('node:assert/strict');let time=100000;Date.now=()=>time;
 const {newRoom,tick,onMessage}=require('./server');const packets=[];const ws={playerId:'p',readyState:1,send(data){packets.push(JSON.parse(data));}};
 const r=newRoom('TESTA',ws,'Mary'),p=r.players.get('p');r.board=Array.from({length:9},(_,y)=>Array.from({length:11},(_,x)=>!x||!y||x===10||y===8?1:0));r.phase='playing';r.participantsAtStart=1;r.lastTick=time;
 const pickup=type=>{r.powerups.set('1,1',type);time+=17;tick();};
 pickup('speed');assert.equal(p.speed,150);pickup('curse');assert.equal(p.speed,240);assert.equal(p.slowedUntil,time+6000);
 time+=3000;tick();assert.equal(p.speed,240);pickup('speed');assert.equal(p.baseSpeed,130);assert.equal(p.speed,208);
 pickup('curse');const end=p.slowedUntil;time=end-1;tick();assert.equal(p.speed,208);time=end;tick();assert.equal(p.speed,130);
 pickup('kick');assert.equal(p.kick,true);assert.equal(p.bombPass,false);assert.equal(p.piercing,false);
 time+=34;tick();const state=packets.filter(p=>p.type==='state').at(-1);assert.equal(state.players[0].kick,true);assert.equal(state.players[0].speed,130);
 r.phase='finished';onMessage(ws,JSON.stringify({type:'start'}));assert.equal(p.kick,false);assert.equal(p.slowedUntil,0);assert.equal(p.speed,170);
 assert.ok([...r.powerups.values()].includes('curse'));assert.ok([...r.powerups.values()].includes('kick'));
 console.log('PASS');process.kill(process.pid,'SIGTERM');`;
 const child=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,PORT:'46321'},encoding:'utf8',timeout:5000});
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/PASS/);
});

test('moving bombs keep chain reactions and falling-wall removal authoritative',()=>{
 const script=`
 const assert=require('node:assert/strict');let time=100000;Date.now=()=>time;
 const {newRoom,tick}=require('./server'),motion=require('./bomb-motion'),collapse=require('./collapse');
 const ws={playerId:'p',readyState:0,send(){}};const r=newRoom('TESTA',ws,'Mary'),p=r.players.get('p');
 r.board=Array.from({length:9},(_,y)=>Array.from({length:13},(_,x)=>!x||!y||x===12||y===8?1:0));r.phase='playing';r.participantsAtStart=1;r.lastTick=time;
 p.x=2;p.y=3;p.kick=true;p.activeBombs=2;
 const b={x:3,y:3,id:'rolling',ownerId:'p',placedAt:time,explodeAt:time+2250,range:1,passThrough:[]};
 r.bombs=[b];assert.ok(motion.tryKick(r,p,{x:1,y:0},time));assert.equal(b.x,4);
 r.bombs.push({x:3,y:1,id:'chain',ownerId:'p',placedAt:time,explodeAt:time,range:2,passThrough:[]});tick();
 assert.equal(r.bombs.length,0);assert.equal(p.activeBombs,0);assert.ok(r.flames.some(f=>f.x===4&&f.y===3));
 r.flames=[];r.phase='playing';p.alive=true;p.x=2;p.y=3;p.activeBombs=1;
 const second={...b,x:3,y:3,explodeAt:time+2250,rolling:null,slide:null};r.bombs=[second];assert.ok(motion.tryKick(r,p,{x:1,y:0},time));
 r.collapse={startsAt:time,index:0,path:[{x:3,y:3}]};collapse.update(r,time);
 assert.equal(r.bombs.length,0);assert.equal(p.activeBombs,0);assert.equal(r.board[3][3],1);
 r.collapse=null;r.board[3][3]=0;r.flames=[{x:4,y:3,startedAt:time,expiresAt:time+500}];p.activeBombs=1;
 const third={...b,x:3,y:3,explodeAt:time+2250,rolling:null,slide:null};r.bombs=[third];assert.ok(motion.tryKick(r,p,{x:1,y:0},time));tick();
 assert.equal(r.bombs.length,0);assert.equal(p.activeBombs,0,'rolling into active fire immediately detonates');
 console.log('PASS');process.kill(process.pid,'SIGTERM');`;
 const child=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,PORT:'46322'},encoding:'utf8',timeout:5000});
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/PASS/);
});
