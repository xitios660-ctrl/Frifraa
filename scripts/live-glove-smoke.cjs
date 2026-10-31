const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});const pages=[],errors=[];
 try{
  for(let i=0;i<4;i++){
   const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
   await context.addInitScript(()=>{const Native=WebSocket;window.states=[];window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='state'){window.latestState=m;window.states.push(m);}});}};});
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.BOMBA_BASE||'http://127.0.0.1:3250');
   await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));await page.locator(`#entryCharacters [data-skin-index="${i}"]`).click();await page.click('#createBtn');await page.locator('#roomPanel').waitFor({state:'visible'});
  }
  await pages[0].selectOption('#mapSelect','classic');await pages[0].click('#startBtn');await pages[1].waitForFunction(()=>window.latestState?.phase==='playing');
  const first=await pages[1].evaluate(()=>window.latestState);const glove=first.powerups.find(p=>p.type==='kick');assert.ok(glove);const guest=first.players.find(p=>p.y===glove.y&&Math.abs(p.x-glove.x)===2),actor=pages[guest.slot];const toward=guest.x===1?'ArrowRight':'ArrowLeft',back=guest.x===1?'ArrowLeft':'ArrowRight';
  assert.ok(first.powerups.some(p=>p.type==='curse'&&p.skin==='skull'));assert.ok(first.powerups.some(p=>p.type==='kick'&&p.skin==='glove'));
  await actor.keyboard.down(toward);await actor.waitForFunction(id=>window.latestState.players.find(p=>p.id===id).kick,guest.id);await actor.keyboard.up(toward);
  await actor.waitForTimeout(120);await actor.locator('#touchBomb').dispatchEvent('pointerdown',{pointerId:88,pointerType:'touch'});
  await actor.waitForFunction(id=>window.latestState.bombs.some(b=>b.ownerId===id),guest.id);
  const bomb=await actor.evaluate(id=>window.latestState.bombs.find(b=>b.ownerId===id),guest.id);assert.ok(Math.abs(bomb.x-guest.x)<=3&&bomb.x!==guest.x);
  await actor.keyboard.down(back);await actor.waitForFunction(([id,x])=>window.latestState.players.find(p=>p.id===id).x===x,[guest.id,guest.x]);await actor.keyboard.up(back);
  await actor.keyboard.down(toward);await actor.waitForFunction(id=>window.states.some(s=>s.bombs.some(b=>b.id===id&&b.rolling)),bomb.id);await actor.keyboard.up(toward);
  for(const page of pages){await page.waitForFunction(id=>window.states.some(s=>s.bombs.some(b=>b.id===id&&b.rolling)),bomb.id);const samples=await page.evaluate(id=>window.states.flatMap(s=>s.bombs.filter(b=>b.id===id)),bomb.id);assert.ok(samples.every(b=>b.ownerId===guest.id&&b.explodeAt===bomb.explodeAt));}
  assert.deepEqual(errors,[]);console.log('PASS: published game has distinct skull/glove items; real glove pickup and own-bomb kick synchronize across four mobile clients, retaining owner/fuse; no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
