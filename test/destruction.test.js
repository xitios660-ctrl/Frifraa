const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
test('authoritative explosion destroys crates, creates impact/debris events and expires them',()=>{
 const script=`
 const {newRoom,tick}=require('./server');
 const ws={playerId:'test',readyState:1,send(){}};
 const room=newRoom('TESTA',ws,'Mary');
 room.board=Array.from({length:13},(_,y)=>Array.from({length:15},(_,x)=>x===0||y===0||x===14||y===12?1:0));
 room.board[3][4]=2;room.board[2][3]=1;
 room.phase='playing';room.participantsAtStart=1;
 room.bombs=[{x:3,y:3,range:2,ownerId:'test',explodeAt:0}];
 tick();
 const result={cell:room.board[3][4],kinds:room.effects.map(e=>e.kind),flames:room.flames};
 room.effects.forEach(e=>e.expiresAt=0);tick();result.remainingEffects=room.effects.length;
 console.log('RESULT:'+JSON.stringify(result));process.kill(process.pid,'SIGTERM');
 `;
 const child=spawnSync(process.execPath,['-e',script],{cwd:require('node:path').join(__dirname,'..'),env:{...process.env,PORT:String(45000+Math.floor(Math.random()*1000))},encoding:'utf8',timeout:5000});
 assert.equal(child.status,0,child.stderr);
 const result=JSON.parse(child.stdout.split('\n').find(line=>line.startsWith('RESULT:')).slice(7));
 assert.equal(result.cell,0);
 assert.ok(result.kinds.includes('crate'));
 assert.ok(result.kinds.includes('wall'));
 assert.ok(result.flames.some(f=>f.x===4&&f.y===3));
 assert.ok(!result.flames.some(f=>f.x===5&&f.y===3));
 assert.ok(result.flames.every(f=>f.expiresAt-f.startedAt===500));
 assert.equal(result.remainingEffects,0);
});
