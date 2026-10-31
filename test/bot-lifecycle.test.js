const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
test('explicit host opt-in gives 1–4 humans exactly four participants; rematches free bot slots and the last human cleans up',()=>{
 const script=`
 const assert=require('node:assert/strict');
 const {newRoom,onMessage,rooms}=require('./server');
 function ws(id){return{playerId:id,readyState:1,send(){}};}
 for(let humans=1;humans<=4;humans++){
  const sockets=Array.from({length:humans},(_,i)=>ws(humans+'-'+i));
  const room=newRoom('TESTA',sockets[0],'Mary');
  for(const socket of sockets.slice(1))onMessage(socket,JSON.stringify({type:'enter',name:'Amigo'}));
  for(const socket of sockets.slice(1))onMessage(socket,JSON.stringify({type:'start'}));
  assert.equal(room.phase,'lobby');assert.equal(room.players.size,humans);
  assert.ok([...room.players.values()].every(p=>!p.bot));
  onMessage(sockets[0],JSON.stringify({type:'bot-settings',enabled:true}));
  assert.equal(room.phase,'lobby');
  onMessage(sockets[0],JSON.stringify({type:'start'}));
  assert.equal(room.players.size,4);
  assert.equal([...room.players.values()].filter(p=>p.bot).length,4-humans);
  assert.equal(new Set([...room.players.values()].map(p=>p.slot)).size,4);
  assert.equal(new Set([...room.players.values()].map(p=>p.skinIndex)).size,4);
  assert.equal(room.hostId,sockets[0].playerId);
  room.phase='finished';
  if(humans<4){
   const guest=ws('guest-'+humans);onMessage(guest,JSON.stringify({type:'enter',name:'Gustavo'}));
   assert.ok(room.players.has(guest.playerId));assert.equal([...room.players.values()].filter(p=>p.bot).length,0);
   sockets.push(guest);
  }
  onMessage(sockets[0],JSON.stringify({type:'start'}));assert.equal(room.players.size,4);
  for(const socket of sockets){onMessage(socket,JSON.stringify({type:'leave'}));if(room.players.size)assert.ok(!room.players.get(room.hostId).bot);}
  assert.equal(rooms.size,0);
 }
 console.log('PASS');process.kill(process.pid,'SIGTERM');
 `;
 const child=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,PORT:String(46000+Math.floor(Math.random()*1000))},encoding:'utf8',timeout:5000});
 assert.equal(child.status,0,child.stderr);assert.match(child.stdout,/PASS/);
});
