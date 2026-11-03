// Local-only authoritative fixture: no debug endpoint is added to production.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
process.env.PORT=process.env.BOMBA_TEST_PORT||'3440';
const {rooms,tick}=require('../server');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME}),pages=[],errors=[];
 try{
  for(let i=0;i<4;i++){
   const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});await context.addInitScript(()=>{const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.type==='state')window.latestState=data;});}};});
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${process.env.PORT}`);await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));await page.locator(`#entryCharacters [data-skin-index="${i}"]`).click();await page.click('#createBtn');await page.locator('#roomPanel').waitFor({state:'visible'});
  }
  const host=pages[0];await host.click('#startBtn');await host.waitForFunction(()=>latestState.phase==='playing');
  const r=rooms.values().next().value,p=r.players.get(r.hostId),victim=[...r.players.values()][1];r.powerups.clear();r.board=r.board.map((row,y)=>row.map((_,x)=>!x||!y||x===30||y===20?1:0));
  victim.x=6;victim.y=3;r.board[3][4]=2;r.bombs=[{id:'cover',x:2,y:3,range:8,piercing:true,explodeAt:Date.now(),ownerId:p.id,passThrough:[]},{id:'chain',x:3,y:3,range:8,piercing:true,explodeAt:Date.now()+10000,ownerId:p.id,passThrough:[]}];tick();
  for(const page of pages)await page.waitForFunction(id=>latestState.players.find(p=>p.id===id).alive&&latestState.board[3][4]===0&&latestState.flames.some(f=>f.x===4&&f.y===3)&&!latestState.flames.some(f=>f.y===3&&f.x>4),victim.id);
  await host.waitForTimeout(550);r.flames=[];
  r.powerups.set(`${Math.round(p.x)},${Math.round(p.y)}`,'life');tick();for(const page of pages)await page.waitForFunction(id=>latestState.players.find(p=>p.id===id).lives===2,p.id);
  const before=p.ack;r.flames=[{x:Math.round(p.x),y:Math.round(p.y),startedAt:Date.now(),expiresAt:Date.now()+500,ownerId:victim.id}];tick();
  for(const page of pages)await page.waitForFunction(id=>{const p=latestState.players.find(p=>p.id===id);return p.lives===1&&p.alive&&p.invulnerableUntil>latestState.serverTime;},p.id);
  await host.bringToFront();const origin=p.x;await host.keyboard.down('ArrowRight');await host.waitForFunction(({id,x})=>latestState.players.find(p=>p.id===id).x>x+.2,{id:p.id,x:origin});await host.keyboard.up('ArrowRight');assert.ok(p.ack>before,'numbered movement must continue after respawn');
  p.invulnerableUntil=0;r.flames=[{x:Math.round(p.x),y:Math.round(p.y),startedAt:Date.now(),expiresAt:Date.now()+500,ownerId:victim.id}];tick();for(const page of pages)await page.waitForFunction(id=>{const p=latestState.players.find(p=>p.id===id);return p.lives===0&&!p.alive;},p.id);
  await host.locator('#watchBtn').waitFor({state:'visible'});assert.match(await host.locator('#overlayTitle').innerText(),/VISH/);await host.click('#watchBtn');await host.waitForTimeout(150);assert.deepEqual(errors,[]);
  console.log('PASS: four mobile clients share crate-protected chain explosions, hearts, life counters, safe respawn, protection, continued input sequences, final elimination, drink message and spectating; no browser errors.');
 }catch(error){const r=rooms.values().next().value,p=r?.players.get(r.hostId);console.log('RESPAWN DEBUG',JSON.stringify({player:p?{x:p.x,y:p.y,alive:p.alive,lives:p.lives,ack:p.ack,lastQueuedSeq:p.lastQueuedSeq,inputQueue:p.inputQueue.slice(0,3),usingInputs:p.usingInputs}:null,errors}));throw error;}finally{await browser.close();}
})().then(()=>process.kill(process.pid,'SIGTERM')).catch(error=>{console.error(error);process.exit(1);});
