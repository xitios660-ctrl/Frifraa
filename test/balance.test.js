const test=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../game-rules');
const motion=require('../bomb-motion');
const physics=require('../public/physics');
const {spawnSync}=require('node:child_process');
test('gold flame is one percent of revealed items and much rarer than regular flame',()=>{
 const counts={};for(let roll=0;roll<100;roll++){const type=rules.drop(roll);counts[type]=(counts[type]||0)+1;}
 assert.equal(counts.maxrange,1);assert.equal(counts.range,26);assert.equal(counts.bomb,22);assert.equal(counts.push,8);assert.equal(counts.bombpass,undefined);
});
test('rainbow pushes exactly one house, without walking through the bomb or renewing its fuse',()=>{
 const board=Array.from({length:5},(_,y)=>Array.from({length:8},(_,x)=>!x||!y||x===7||y===4?1:0));
 const p={id:'p',x:1,y:1,push:true,kick:false,alive:true,bombPass:true,speed:170};
 const bomb={x:2,y:1,explodeAt:4000,passThrough:[]},room={board,players:new Map([['p',p]]),bombs:[bomb],effects:[]};
 assert.ok(motion.tryKick(room,p,{x:1,y:0},1000));assert.equal(bomb.x,3);
 assert.equal(physics.canOccupy(p,2,1,board,[bomb]),false);
 motion.update(room,1100);assert.equal(bomb.rolling,null);assert.equal(bomb.x,3);motion.update(room,2000);assert.equal(bomb.x,3);assert.equal(bomb.explodeAt,4000);
 assert.equal(physics.canOccupy(p,2,1,board,[bomb]),true);assert.equal(physics.canOccupy(p,3,1,board,[bomb]),false);
});
test('bomb capacity and fire keep growing, gold adds five even above eight, and speed stops at a modest cap',()=>{
 const script=`const assert=require('node:assert/strict');let time=100000;Date.now=()=>time;
 const {newRoom,tick,onMessage}=require('./server');const ws={playerId:'p',readyState:0,send(){}};
 const r=newRoom('TESTA',ws,'Mary'),p=r.players.get('p');onMessage(ws,JSON.stringify({type:'start'}));
 assert.equal([...r.powerups.values()].includes('maxrange'),false);for(const [id,o]of r.players)if(id!==p.id)r.players.delete(id);
 r.phase='playing';r.participantsAtStart=1;r.lastTick=time;
 const pick=type=>{r.powerups.set('1,1',type);time+=17;tick();};
 for(let i=0;i<40;i++){pick('range');pick('bomb');pick('speed');}
 assert.equal(p.range,41);assert.equal(p.bombs,41);assert.equal(p.baseSpeed,150);assert.equal(p.speed,150);
 pick('maxrange');assert.equal(p.range,46);pick('maxrange');assert.equal(p.range,51);
 pick('push');assert.equal(p.push,true);assert.equal(p.bombPass,undefined);
 pick('curse');assert.equal(p.push,true);assert.equal(p.speed,240);assert.equal(p.bombPass,undefined);
 time+=6000;tick();assert.equal(p.speed,150);console.log('PASS');process.kill(process.pid,'SIGTERM');`;
 const result=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,PORT:'46323'},encoding:'utf8',timeout:5000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS/);
});
