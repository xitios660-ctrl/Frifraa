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
test('screenshots require TV opt-in, authenticated paired access and expire after 60 seconds',async t=>{
 let clock=1000;const req=await setup(t,{now:()=>clock});const d=await req('/device/register',{}),p=await req('/pair',{code:d.code});
 assert.equal((await req('/command',{command:'SCREENSHOT'},p.token)).status,403);
 await req('/device/poll',{...d,screenshotAllowed:true});
 const c=await req('/command',{command:'SCREENSHOT'},p.token);assert.equal(c.status,202);
 await req('/device/poll',{...d,screenshotAllowed:true});
 assert.equal((await req('/device/ack',{...d,commandId:c.id,ok:true,image:'<svg>unsafe</svg>'})).status,400);
 const image='/9j/2Q==';assert.equal((await req('/device/ack',{...d,commandId:c.id,ok:true,image})).status,200);
 assert.equal((await req('/screenshot')).status,401);
 const other=await req('/device/register',{}),otherSession=await req('/pair',{code:other.code});assert.equal((await req('/screenshot',undefined,otherSession.token)).status,404);
 assert.equal((await req('/screenshot',undefined,p.token)).image,'data:image/jpeg;base64,'+image);
 clock+=60001;assert.equal((await req('/screenshot',undefined,p.token)).status,404);
});
test('captures are cleared by TV withdrawal and cannot accompany ordinary command acknowledgements',async t=>{
 const req=await setup(t);const d=await req('/device/register',{}),p=await req('/pair',{code:d.code});
 await req('/device/poll',{...d,screenshotAllowed:true});const c=await req('/command',{command:'HOME'},p.token);await req('/device/poll',{...d,screenshotAllowed:true});
 assert.equal((await req('/device/ack',{...d,commandId:c.id,ok:true,image:'/9j/2Q=='})).status,400);await req('/device/ack',{...d,commandId:c.id,ok:true});
 const shot=await req('/command',{command:'SCREENSHOT'},p.token);await req('/device/poll',{...d,screenshotAllowed:true});await req('/device/ack',{...d,commandId:shot.id,ok:true,image:'/9j/2Q=='});
 await req('/device/poll',{...d,screenshotAllowed:false});assert.equal((await req('/screenshot',undefined,p.token)).status,404);
 assert.equal((await req('/command',{command:'SCREENSHOT'},p.token)).status,403);
});
function reportFixture(){return {capturedAt:1000,storageTotal:10000,storageFree:1000,ramTotal:5000,ramAvailable:1000,visibleCount:3,android:'12',usageAccess:true,apps:[{package:'com.example.test',label:'Test <script>',system:false,self:false,appBytes:200,dataBytes:100,cacheBytes:20,totalBytes:300},{package:'com.example.system',label:'Sistema',system:true},{package:'com.tvdoguh.bridge',label:'Bridge',self:true}]};}
test('diagnostic permission, isolated reports and explicit uninstall targeting',async t=>{
 const req=await setup(t);const d=await req('/device/register',{}),p=await req('/pair',{code:d.code});
 assert.equal((await req('/command',{command:'DIAGNOSE'},p.token)).status,403);
 await req('/device/poll',{...d,diagnosticAllowed:true});const c=await req('/command',{command:'DIAGNOSE'},p.token);await req('/device/poll',{...d,diagnosticAllowed:true});
 const bad=reportFixture();bad.apps[0].totalBytes=999;assert.equal((await req('/device/ack',{...d,commandId:c.id,ok:true,diagnostic:bad})).status,400);
 assert.equal((await req('/device/ack',{...d,commandId:c.id,ok:true,diagnostic:reportFixture()})).status,200);
 assert.equal((await req('/diagnostic')).status,401);assert.equal((await req('/diagnostic',undefined,p.token)).report.apps[0].cacheBytes,20);
 const other=await req('/device/register',{}),o=await req('/pair',{code:other.code});assert.equal((await req('/diagnostic',undefined,o.token)).status,404);
 assert.equal((await req('/command',{command:'REQUEST_UNINSTALL',package:'com.example.test'},p.token)).status,403);
 assert.equal((await req('/command',{command:'REQUEST_UNINSTALL',package:'com.example.system',confirmed:true},p.token)).status,403);
 assert.equal((await req('/command',{command:'APP_SETTINGS',package:'com.not.in.report'},p.token)).status,400);
 assert.equal((await req('/command',{command:'REQUEST_UNINSTALL',package:'com.tvdoguh.bridge',confirmed:true},p.token)).status,400);
 const remove=await req('/command',{command:'REQUEST_UNINSTALL',package:'com.example.test',confirmed:true},p.token);assert.equal(remove.status,202);
 assert.deepEqual((await req('/device/poll',{...d,diagnosticAllowed:true})).command,{id:remove.id,command:'REQUEST_UNINSTALL',package:'com.example.test',confirmed:true});
 await req('/device/poll',{...d,diagnosticAllowed:false});assert.equal((await req('/diagnostic',undefined,p.token)).status,404);
});
test('diagnostic reports expire; unknown app sizes remain unknown',async t=>{
 let clock=1000;const req=await setup(t,{now:()=>clock});const d=await req('/device/register',{}),p=await req('/pair',{code:d.code});await req('/device/poll',{...d,diagnosticAllowed:true});const c=await req('/command',{command:'DIAGNOSE'},p.token);await req('/device/poll',{...d,diagnosticAllowed:true});
 const report=reportFixture();report.usageAccess=false;await req('/device/ack',{...d,commandId:c.id,ok:true,diagnostic:report});assert.equal((await req('/diagnostic',undefined,p.token)).report.apps[0].totalBytes,undefined);
 clock+=600001;assert.equal((await req('/diagnostic',undefined,p.token)).status,404);
});
test('persistent support is single-use, visible to owner, restricted, revocable and discards undelivered commands',async t=>{
 let clock=1000;const req=await setup(t,{now:()=>clock});const d=await req('/device/register',{}),p=await req('/pair',{code:d.code});
 assert.equal((await req('/support',{action:'create'})).status,401);
 const invite=await req('/support',{action:'create'},p.token);assert.match(invite.code,/^[A-F0-9]{12}$/);
 const support=await req('/support/redeem',{code:invite.code});assert.equal(support.expiresIn,null);assert.equal(support.persistent,true);
 assert.equal((await req('/support/redeem',{code:invite.code})).status,404);
 assert.equal((await req('/status',undefined,p.token)).supportActive,true);
 assert.equal((await req('/support',{action:'create'},support.token)).status,403);
 assert.equal((await req('/unpair',{},support.token)).status,403);
 assert.equal((await req('/command',{command:'REQUEST_UNINSTALL',package:'com.example.test',confirmed:true},support.token)).status,403);
 const c=await req('/command',{command:'HOME'},support.token);assert.equal(c.status,202);
 assert.equal((await req('/status',undefined,p.token)).results[c.id].actor,'support');
 await req('/support',{action:'cancel'},p.token);assert.equal((await req('/status',undefined,support.token)).status,401);
 assert.equal((await req('/device/poll',d)).command,null);assert.equal((await req('/status',undefined,p.token)).results[c.id].state,'failed');
 const next=await req('/support',{action:'create'},p.token),access=await req('/support/redeem',{code:next.code});clock+=300001;
 assert.equal((await req('/status',undefined,access.token)).status,200);
 const expired=await req('/support',{action:'create'},p.token); // Device is offline; no new invitation.
 assert.equal(expired.status,409);
});
test('support invitation expiry and replacing a code revoke previous invitations and sessions',async t=>{
 let clock=1000;const req=await setup(t,{now:()=>clock});const d=await req('/device/register',{}),p=await req('/pair',{code:d.code});
 const a=await req('/support',{action:'create'},p.token),b=await req('/support',{action:'create'},p.token);assert.equal((await req('/support/redeem',{code:a.code})).status,404);
 const s=await req('/support/redeem',{code:b.code});await req('/support',{action:'create'},p.token);assert.equal((await req('/status',undefined,s.token)).status,401);
 const c=await req('/support',{action:'create'},p.token);clock+=300001;assert.equal((await req('/support/redeem',{code:c.code})).status,404);
});
test('long-poll wakes immediately; action plus observation returns image and real action acknowledgement',async t=>{
 const req=await setup(t);const d=await req('/device/register',{}),p=await req('/pair',{code:d.code});
 const polling=req('/device/poll',{...d,screenshotAllowed:true,waitMs:10000});await new Promise(r=>setTimeout(r,30));
 const start=Date.now(),queued=await req('/command',{command:'OPEN_APP',package:'br.com.saimo.tv',observe:true},p.token);
 const poll=await polling;assert.equal(poll.command.command,'OPEN_APP');assert.equal(poll.command.package,'br.com.saimo.tv');assert.ok(Date.now()-start<2000,'wake instead of waiting for idle timer');
 const waiting=req('/wait',{id:queued.observationId,timeoutMs:10000},p.token);await new Promise(r=>setTimeout(r,20));
 await req('/device/ack',{...d,commandId:queued.id,ok:true});
 assert.equal((await req('/device/poll',{...d,screenshotAllowed:true})).command.id,queued.observationId);
 await req('/device/ack',{...d,commandId:queued.observationId,ok:true,image:'/9j/2Q=='});
 const observed=await waiting;assert.equal(observed.image,'data:image/jpeg;base64,/9j/2Q==');assert.equal(observed.actionResult.state,'executed');assert.equal(observed.result.state,'executed');
 assert.equal((await req('/command',{command:'OPEN_APP',package:'../unsafe'},p.token)).status,400);
});
test('a failed action skips the observation and never reports a screenshot as success',async t=>{
 const req=await setup(t);const d=await req('/device/register',{}),p=await req('/pair',{code:d.code});await req('/device/poll',{...d,screenshotAllowed:true});
 const c=await req('/command',{command:'HOME',observe:true},p.token);await req('/device/poll',{...d,screenshotAllowed:true});await req('/device/ack',{...d,commandId:c.id,ok:false,message:'Recusado'});
 assert.equal((await req('/device/poll',{...d,screenshotAllowed:true})).command,null);
 const observed=await req('/wait',{id:c.observationId},p.token);assert.equal(observed.result.state,'failed');assert.equal(observed.image,undefined);assert.equal(observed.actionResult.state,'failed');
});
test('revocation cancels an open result wait without leaking data',async t=>{
 const req=await setup(t);const d=await req('/device/register',{}),p=await req('/pair',{code:d.code}),invite=await req('/support',{action:'create'},p.token),s=await req('/support/redeem',{code:invite.code});
 const c=await req('/command',{command:'HOME'},s.token),wait=req('/wait',{id:c.id,timeoutMs:10000},s.token);await new Promise(r=>setTimeout(r,20));await req('/support',{action:'cancel'},p.token);assert.equal((await wait).status,401);
});
test('identity persistence survives process restart and time advance; file contains hashes, no raw credentials',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tv-state-'));const storePath=path.join(dir,'identities.json');let clock=1000,server;
 t.after(async()=>{if(server)await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
 async function start(){server=createServer({storePath,now:()=>clock});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;return async(path,body,token)=>{const r=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,...await r.json()};};}
 let req=await start();const d=await req('/device/register',{}),p=await req('/pair',{code:d.code}),invite=await req('/support',{action:'create'},p.token),s=await req('/support/redeem',{code:invite.code});
 const disk=fs.readFileSync(storePath,'utf8');assert.equal(disk.includes(d.secret),false);assert.equal(disk.includes(p.token),false);assert.equal(disk.includes(s.token),false);assert.equal(fs.statSync(storePath).mode&0o777,0o600);
 await new Promise(r=>server.close(r));server=null;clock+=365*86400000;req=await start();assert.equal((await req('/status',undefined,p.token)).status,200);assert.equal((await req('/status',undefined,s.token)).status,200);
 await req('/support',{action:'cancel'},p.token);assert.equal((await req('/status',undefined,s.token)).status,401);
});
test('full search text travels as one command and is absent from status/history; validation rejects controls',async t=>{
 const req=await setup(t);const d=await req('/device/register',{}),p=await req('/pair',{code:d.code});await req('/device/poll',{...d,screenshotAllowed:true});
 for(const text of ['',null,'a\nb','a'.repeat(81)])assert.equal((await req('/command',{command:'SAIMO_TEXT',text},p.token)).status,400);
 const c=await req('/command',{command:'SAIMO_TEXT',text:'Os Simpsons',observe:true},p.token);
 const poll=await req('/device/poll',{...d,screenshotAllowed:true});assert.equal(poll.command.text,'Os Simpsons');assert.equal(poll.command.command,'SAIMO_TEXT');
 assert.equal(JSON.stringify(await req('/status',undefined,p.token)).includes('Os Simpsons'),false);
 await req('/device/ack',{...d,commandId:c.id,ok:true});assert.equal((await req('/device/poll',{...d,screenshotAllowed:true})).command.id,c.observationId);
});
test('observation freshness starts after a longer text operation finishes',async t=>{
 let clock=1000;const req=await setup(t,{now:()=>clock});const d=await req('/device/register',{}),p=await req('/pair',{code:d.code});await req('/device/poll',{...d,screenshotAllowed:true});
 const c=await req('/command',{command:'TYPE_TEXT',text:'Os Simpsons',observe:true},p.token);await req('/device/poll',{...d,screenshotAllowed:true});clock+=11000;
 await req('/device/ack',{...d,commandId:c.id,ok:true});assert.equal((await req('/device/poll',{...d,screenshotAllowed:true})).command.id,c.observationId);
});
