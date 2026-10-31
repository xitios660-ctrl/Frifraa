// Real four-client session against the existing server, with time advanced only in this local process.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
process.env.PORT=process.env.BOMBA_TEST_PORT||'3190';
const realNow=Date.now;let simulated=null;Date.now=()=>simulated??realNow();
const {rooms,tick}=require('../server');
const items=require('../public/items');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
 const pages=[],errors=[];
 try{
  for(let i=0;i<4;i++){
   const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
   await context.addInitScript(()=>{
    const Native=WebSocket;
    window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='state')window.latestState=m;});}};
    window.itemDraws=new Set();window.fallingDraws=0;
    window.addEventListener('DOMContentLoaded',()=>{
     const draw=BombaItems.draw;BombaItems.draw=(c,p,t)=>{window.itemDraws.add(p.type);return draw(c,p,t);};
     const fall=BombaEffects.fallingWall;BombaEffects.fallingWall=(...args)=>{window.fallingDraws++;return fall(...args);};
    });
   });
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${process.env.PORT}`);
   await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));
   await page.locator(`#entryCharacters [data-skin-index="${i}"]`).click();await page.click('#createBtn');
   await page.locator('#roomPanel').waitFor({state:'visible'});
  }
  await pages[0].click('#startBtn');await pages[0].waitForFunction(()=>window.latestState?.phase==='playing');
  const r=rooms.values().next().value;assert.equal(r.players.size,4);assert.ok([...r.players.values()].every(p=>!p.bot));
  const startsAt=r.collapse.startsAt;
  for(const page of pages)await page.waitForFunction(t=>window.latestState?.collapse?.startsAt===t,startsAt);
  // Place every existing power in a visible corridor without adding production-only debug endpoints.
  Object.keys(items.DEFS).forEach((type,i)=>{r.board[3][3+i]=0;r.powerups.set(`${3+i},3`,type);});
  tick();await pages[0].waitForFunction(()=>window.itemDraws.size===7);
  await pages[0].screenshot({path:'/tmp/bomba-items-mobile.png'});
  simulated=startsAt-350;tick();
  for(const page of pages)await page.waitForFunction(()=>window.latestState?.collapse?.falling?.length>0);
  await pages[0].waitForFunction(()=>window.fallingDraws>2);
  await pages[0].screenshot({path:'/tmp/bomba-collapse-mobile.png'});
  assert.equal(r.board[1][1],0,'warning must not block movement before landing');
  simulated=startsAt+5;tick();
  for(const page of pages)await page.waitForFunction(()=>window.latestState.board[1][1]===1&&window.latestState.players.find(p=>p.slot===0).alive===false);
  assert.equal(r.players.get(r.hostId).place,4);
  await pages[0].waitForFunction(()=>document.querySelector('#overlayText').textContent.includes('BEBER'));
  await pages[0].click('#watchBtn');await pages[0].waitForFunction(()=>document.body.classList.contains('spectating'));
  // A fire destroys one of the newly illustrated powers for all clients.
  r.bombs.push({x:3,y:3,range:0,ownerId:r.hostId,explodeAt:Date.now()});simulated+=34;tick();
  for(const page of pages)await page.waitForFunction(()=>!window.latestState.powerups.some(p=>p.x===3&&p.y===3));
  assert.deepEqual(errors,[]);
  console.log('PASS: four real mobile clients share the 90s timer, warning, falling-wall collision/death/ranking, spectator and item burn; all seven original item illustrations render; no JS errors');
 }finally{await browser.close();}
})().then(()=>process.kill(process.pid,'SIGTERM')).catch(e=>{console.error(e);process.exit(1)});
