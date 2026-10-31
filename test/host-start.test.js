const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
test('only the host chooses bots and starts; defaults, idle lobby, rematch and host transfer stay manual',()=>{
 const script=`
 const assert=require('node:assert/strict');let time=100000;Date.now=()=>time;
 const {newRoom,onMessage,tick,rooms}=require('./server');
 const ws=id=>({playerId:id,readyState:1,messages:[],send(raw){this.messages.push(JSON.parse(raw));}});
 const host=ws('host'),guest=ws('guest');const r=newRoom('TESTA',host,'Mary');
 assert.equal(r.botsEnabled,false);time+=15000;tick();assert.equal(r.phase,'lobby');assert.equal(r.players.size,1);
 onMessage(guest,JSON.stringify({type:'enter',skinIndex:1}));
 onMessage(guest,JSON.stringify({type:'bot-settings',enabled:true}));onMessage(guest,JSON.stringify({type:'start'}));
 assert.equal(r.botsEnabled,false);assert.equal(r.phase,'lobby');assert.equal(r.players.size,2);assert.equal(guest.messages.filter(m=>m.type==='error').length,2);
 onMessage(host,JSON.stringify({type:'bot-settings',enabled:'true'}));assert.equal(r.botsEnabled,false);
 onMessage(host,JSON.stringify({type:'bot-settings',enabled:true}));time+=15000;tick();assert.equal(r.phase,'lobby');assert.equal(r.players.size,2);
 onMessage(host,JSON.stringify({type:'start'}));assert.equal(r.phase,'countdown');assert.equal(r.players.size,4);assert.equal([...r.players.values()].filter(p=>p.bot).length,2);
 onMessage(host,JSON.stringify({type:'bot-settings',enabled:false}));assert.equal(r.botsEnabled,true,'cannot change a running round');
 r.phase='finished';onMessage(host,JSON.stringify({type:'bot-settings',enabled:false}));time+=30000;tick();assert.equal(r.phase,'finished','no automatic rematch');
 onMessage(host,JSON.stringify({type:'start',botsEnabled:true}));assert.equal(r.players.size,2);assert.ok([...r.players.values()].every(p=>!p.bot));assert.equal(r.participantsAtStart,2);
 r.phase='finished';onMessage(host,JSON.stringify({type:'bot-settings',enabled:true}));onMessage(host,JSON.stringify({type:'leave'}));
 assert.equal(r.hostId,guest.playerId);assert.equal(r.botsEnabled,false,'new host must opt in for themselves');
 onMessage(guest,JSON.stringify({type:'start'}));assert.equal(r.players.size,1);assert.equal(r.participantsAtStart,1);time+=3100;tick();assert.equal(r.phase,'playing','solo training without bots');
 time+=10000;tick();assert.equal(r.phase,'playing');onMessage(guest,JSON.stringify({type:'leave'}));assert.equal(rooms.size,0);
 console.log('PASS');process.kill(process.pid,'SIGTERM');`;
 const result=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,PORT:'46324'},encoding:'utf8',timeout:5000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS/);
});
