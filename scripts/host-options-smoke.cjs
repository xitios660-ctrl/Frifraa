const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME}),pages=[],errors=[];
 try{
  for(const skin of [3,0]){
   const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
   await context.addInitScript(()=>{const Native=WebSocket;window.protocolErrors=[];window.WebSocket=class extends Native{constructor(...args){super(...args);window.testSocket=this;this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='state')window.latestState=m;if(m.type==='error')window.protocolErrors.push(m.message);});}};});
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.BOMBA_BASE||'http://127.0.0.1:3320');await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));
   await page.locator(`#entryCharacters [data-skin-index="${skin}"]`).click();await page.click('#createBtn');await page.locator('#roomPanel').waitFor({state:'visible'});
  }
  const [host,guest]=pages;assert.ok(!await host.locator('#botsToggle').isChecked());assert.ok(await guest.locator('#botsToggle').isDisabled());assert.ok(await guest.locator('#startBtn').isDisabled());
  await guest.evaluate(()=>{testSocket.send(JSON.stringify({type:'bot-settings',enabled:true}));testSocket.send(JSON.stringify({type:'start'}));});await guest.waitForFunction(()=>window.protocolErrors.length===2);
  await host.waitForTimeout(3500);assert.equal(await host.evaluate(()=>window.latestState.phase),'lobby');assert.equal(await host.evaluate(()=>window.latestState.players.length),2);
  await host.locator('#botsToggle').check();await guest.waitForFunction(()=>document.querySelector('#botsToggle').checked);await host.waitForTimeout(3500);
  assert.equal(await host.evaluate(()=>window.latestState.phase),'lobby');assert.equal(await host.evaluate(()=>window.latestState.players.filter(p=>p.bot).length),0);
  await host.screenshot({path:'/tmp/bomba-host-options-mobile.png'});
  await host.locator('#botsToggle').uncheck();await guest.waitForFunction(()=>!document.querySelector('#botsToggle').checked);await host.click('#startBtn');
  for(const page of pages)await page.waitForFunction(()=>window.latestState.phase==='playing');assert.equal(await host.evaluate(()=>window.latestState.players.length),2);assert.ok(await host.evaluate(()=>window.latestState.players.every(p=>!p.bot)));
  await guest.locator('#touchBomb').dispatchEvent('pointerdown',{pointerId:98,pointerType:'touch'});await host.waitForFunction(()=>window.latestState.phase==='finished');
  await host.locator('#rematchBotsOption').waitFor({state:'visible'});assert.ok(!await host.locator('#rematchBotsToggle').isChecked());assert.ok(await guest.locator('#rematchBotsOption').isHidden());
  await host.waitForTimeout(3500);assert.equal(await host.evaluate(()=>window.latestState.phase),'finished');
  await host.locator('#rematchBotsToggle').check();await guest.waitForFunction(()=>window.latestState.botsEnabled);assert.equal(await host.evaluate(()=>window.latestState.phase),'finished');
  await host.click('#playAgainBtn');for(const page of pages)await page.waitForFunction(()=>window.latestState.phase==='countdown'&&window.latestState.players.filter(p=>p.bot).length===2);
  assert.equal(await host.evaluate(()=>window.latestState.players.length),4);assert.deepEqual(errors,[]);
  console.log('PASS: bots off by default; host-only choice/start; idle lobby and opt-in never auto-start; two-human game without bots; manual rematch with optional bots; mobile controls and no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
