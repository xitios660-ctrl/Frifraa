const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createServer}=require('../server');
async function setup(t,options={}){const server=createServer(options);await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 return async(path,body,token)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()};};}
test('pair, authenticate, deliver every supported command, acknowledge, revoke',async t=>{
 const req=await setup(t);const d=await req('/device/register',{});
 assert.match(d.code,/^\d{6}$/);assert.equal((await req('/command',{command:'HOME'})).status,401);
 assert.equal((await req('/device/poll',{id:d.id,secret:'wrong'})).status,401);
 const p=await req('/pair',{code:d.code});assert.equal(p.status,200);
 assert.equal((await req('/pair',{code:d.code})).status,404);
 for(const command of ['UP','DOWN','LEFT','RIGHT','OK','HOME','BACK','VOLUME_UP','VOLUME_DOWN','MUTE','YOUTUBE','NETFLIX','PLAY_PAUSE']){
  const c=await req('/command',{command},p.token);assert.equal(c.status,202);
  const poll=await req('/device/poll',d);assert.deepEqual(poll.command,{id:c.id,command});
  assert.equal((await req('/device/poll',d)).command,null,'never repeat actions');
  await req('/device/ack',{...d,commandId:c.id,ok:true});
  assert.equal((await req('/status',undefined,p.token)).results[c.id].state,'executed');
 }
 assert.equal((await req('/command',{command:'SHELL'},p.token)).status,400);
 await req('/unpair',{},p.token);assert.equal((await req('/status',undefined,p.token)).status,401);
});
test('polling does not extend the pairing expiry',async t=>{let clock=1000;const req=await setup(t,{now:()=>clock,pairTTL:1000});const d=await req('/device/register',{});clock+=900;await req('/device/poll',d);clock+=101;assert.equal((await req('/pair',{code:d.code})).status,404);});
test('offline devices and stale queues never execute old actions',async t=>{let clock=1000;const req=await setup(t,{now:()=>clock});const d=await req('/device/register',{}),p=await req('/pair',{code:d.code});const c=await req('/command',{command:'HOME'},p.token);clock+=11000;assert.equal((await req('/device/poll',d)).command,null);assert.equal((await req('/status',undefined,p.token)).results[c.id].state,'failed');clock+=16000;assert.equal((await req('/command',{command:'HOME'},p.token)).status,409);});
test('bounded pairing attempts and strict input validation',async t=>{const req=await setup(t);assert.equal((await req('/pair',{code:123456})).status,400);assert.equal((await req('/pair',null)).status,400);for(let i=0;i<28;i++)await req('/pair',{code:'000000'});assert.equal((await req('/pair',{code:'000000'})).status,429);});
