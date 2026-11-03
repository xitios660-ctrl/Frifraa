const test=require('node:test');
const assert=require('node:assert/strict');
const net=require('../public/netcode');
const physics=require('../public/physics');
const board=Array.from({length:13},(_,y)=>Array.from({length:15},(_,x)=>x===0||y===0||x===14||y===12?1:0));
function copyBombs(bombs){return bombs.map(b=>({...b,passThrough:[...(b.passThrough||[])]}));}
function simulation(latency) {
  const player={id:'p',x:3.4,y:3,speed:170,ack:0};
  const bombs=[{x:3,y:3,passThrough:['p']}];
  const model=net.create(player,board,bombs),server={...player},expected={...player};
  const expectedBombs=copyBombs(bombs),serverBombs=copyBombs(bombs);
  const commands=[],snapshots=[];
  let sentAt=0,deliveredAt=0,maxError=0;
  for(let frame=0;frame<240;frame++) {
    const direction=frame<50?{x:-1,y:0}:frame<100?{x:0,y:1}:frame<150?{x:1,y:0}:frame<190?{x:0,y:-1}:{x:0,y:0};
    net.advance(model,direction);physics.move(expected,direction,net.STEP,board,expectedBombs);
    const command=model.outbound.shift();
    sentAt=Math.max(sentAt,frame+latency+frame%4);
    commands.push({at:sentAt,command});
    while(commands[0]?.at<=frame) {
      const {command}=commands.shift();physics.move(server,command,net.STEP,board,serverBombs);server.ack=command.seq;
    }
    if(frame%2===0) {
      deliveredAt=Math.max(deliveredAt,frame+latency+(frame%5));
      snapshots.push({at:deliveredAt,player:{...server},bombs:copyBombs(serverBombs)});
    }
    while(snapshots[0]?.at<=frame) {
      const snapshot=snapshots.shift();net.acknowledge(model,snapshot.player,board,snapshot.bombs);
    }
    maxError=Math.max(maxError,Math.hypot(model.player.x-expected.x,model.player.y-expected.y));
  }
  return maxError;
}
test('acknowledged input replay stays exact with 200, 400 and 800 ms round-trip delay and jitter',()=>{
  for(const latency of [6,12,24]) assert.ok(simulation(latency)<1e-8);
});
test('displayed corrections have a speed limit, with no frame that teleports',()=>{
  const point={x:1,y:1};const next=net.displayPoint(point,{x:8,y:8},1/60,170);
  assert.ok(Math.hypot(next.x-point.x,next.y-point.y)<=1000/170*1.5/60+1e-8);
});
test('a long disconnection caps prediction instead of letting it drift indefinitely',()=>{
  const model=net.create({id:'p',x:1,y:1,speed:170},board);
  for(let i=0;i<300;i++) net.advance(model,{x:1,y:0});
  assert.equal(model.pending.length,net.MAX_PENDING);
  assert.equal(model.sequence,net.MAX_PENDING);
});
test('recreated prediction after respawn continues the acknowledged sequence instead of sending rejected old inputs',()=>{
 const model=net.create({id:'p',x:1,y:1,speed:170,ack:137},board);
 net.advance(model,{x:1,y:0});assert.equal(model.outbound[0].seq,138);
});
test('remote players are interpolated between received snapshots',()=>{
  const history=[{time:100,players:[{id:'p',x:1,y:2}]},{time:200,players:[{id:'p',x:2,y:2}]}];
  assert.equal(net.remotePosition(history,'p',150).x,1.5);
  assert.equal(net.remotePosition(history,'p',250).x,2);
});
