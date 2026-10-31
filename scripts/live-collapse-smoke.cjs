const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BOMBA_BASE||'http://127.0.0.1:3200';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
 const pages=[],errors=[];
 try{
  for(let i=0;i<4;i++){
   const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
   await context.addInitScript(()=>{const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='state')window.latestState=m;});}};});
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base);await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));
   await page.locator(`#entryCharacters [data-skin-index="${i}"]`).click();await page.click('#createBtn');
   await page.locator('#roomPanel').waitFor({state:'visible'});
  }
  await pages[0].click('#startBtn');await pages[0].waitForFunction(()=>window.latestState?.phase==='playing');
  const first=await pages[0].evaluate(()=>window.latestState),host=first.players.find(p=>p.slot===0),guest=first.players.find(p=>p.slot===1);
  const targets=first.powerups.filter(p=>Math.abs(p.x-guest.x)+Math.abs(p.y-guest.y)<=2);
  assert.equal(targets.length,2);assert.ok(first.collapse.startsAt-first.serverTime>88000);
  assert.equal(first.players.length,4);assert.ok(first.players.every(p=>!p.bot));
  await pages[1].locator('#touchBomb').dispatchEvent('pointerdown',{pointerId:91,pointerType:'touch'});
  for(const page of pages)await page.waitForFunction(targets=>targets.every(p=>!window.latestState.powerups.some(q=>q.x===p.x&&q.y===p.y)),targets);
  console.log('PASS: four mobile clients joined; real bomb fire destroyed both exposed powers for everyone. Waiting for the unmodified 90s timer.');
  await pages[0].waitForFunction(()=>window.latestState?.collapse?.falling?.length>0,{},{timeout:105000,polling:20});
  console.log('PASS: server announced falling walls before impact.');
  for(const page of pages)await page.waitForFunction(id=>window.latestState.board[1][1]===1&&!window.latestState.players.find(p=>p.id===id).alive,host.id,{timeout:10000});
  await pages[0].waitForFunction(()=>document.querySelector('#overlayText').textContent.includes('BEBER'));
  await pages[0].click('#watchBtn');await pages[0].waitForFunction(()=>document.body.classList.contains('spectating'));
  assert.deepEqual(errors,[]);
  console.log('PASS: actual 90s closure synchronized across four clients; wall impact eliminates the host, preserves drinking message and spectator; no JS errors.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
