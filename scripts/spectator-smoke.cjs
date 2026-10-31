const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BOMBA_BASE||'http://127.0.0.1:3100';
async function until(fn,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){if(fn())return;await new Promise(r=>setTimeout(r,40));}throw new Error('Timeout waiting for match state');}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
 const pages=[],states=[],errors=[];
 try{
  for(let i=0;i<4;i++){
   const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
   await context.addInitScript(()=>{
    const Native=window.WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);window.testSocket=this;}};
    const translate=CanvasRenderingContext2D.prototype.translate;
    CanvasRenderingContext2D.prototype.translate=function(x,y){if(this.canvas.id==='arena'&&x<=0&&y<=0&&this.getTransform().e===0&&this.getTransform().f===0)window.cameraView={x:-x,y:-y};return translate.call(this,x,y);};
   });
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
   page.on('websocket',ws=>ws.on('framereceived',e=>{try{const m=JSON.parse(e.payload);if(m.type==='state')states.push(m);}catch{}}));
   await page.goto(base);await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));
   await page.locator(`#entryCharacters [data-skin-index="${i}"]`).click();await page.click('#createBtn');await page.locator('#roomPanel').waitFor({state:'visible'});
   if(i===1){
    await page.evaluate(()=>window.testSocket.send(JSON.stringify({type:'start'})));
    await page.waitForTimeout(3600);
    assert.ok(states.every(s=>s.phase==='lobby'),'room must wait for host, even beyond the countdown duration');
    assert.ok(states.at(-1).players.every(p=>!p.bot));
    assert.ok(await page.locator('#startBtn').isDisabled());
   }
  }
  await pages[0].click('#startBtn');await until(()=>states.some(s=>s.phase==='playing'));
  const initial=states.find(s=>s.phase==='countdown');assert.equal(initial.players.length,4);assert.ok(initial.players.every(p=>!p.bot));
  await pages[1].locator('#touchBomb').dispatchEvent('pointerdown',{pointerId:2});
  await until(()=>states.some(s=>s.players.find(p=>p.name==='Kaique')?.place===4));
  await pages[1].locator('#watchBtn').waitFor({state:'visible'});
  assert.match(await pages[1].locator('#overlayText').textContent(),/VAI TER QUE BEBER/);
  await pages[1].click('#watchBtn');
  await pages[1].waitForFunction(()=>document.querySelector('#spectateBtn').textContent.includes('Mary'));
  await pages[0].locator('#touchBomb').dispatchEvent('pointerdown',{pointerId:3});
  await until(()=>states.some(s=>s.players.find(p=>p.name==='Mary')?.place===3));
  await pages[1].waitForFunction(()=>document.querySelector('#spectateBtn').textContent.includes('Jheniffer'));
  await pages[0].locator('#watchBtn').waitFor({state:'visible'});
  assert.match(await pages[0].locator('#overlayText').textContent(),/VAI TER QUE BEBER/);
  await pages[0].screenshot({path:'/tmp/bomba-death-message.png'});
  await pages[0].click('#watchBtn');await pages[0].locator('#roundOverlay').waitFor({state:'hidden'});
  const first=await pages[0].locator('#spectateBtn').textContent();assert.match(first,/Jheniffer/);
  await pages[0].click('#spectateBtn');await pages[0].waitForFunction(()=>document.querySelector('#spectateBtn').textContent.includes('Gustavo'));
  await pages[0].waitForFunction(()=>window.cameraView?.x>600&&window.cameraView?.y>300);
  assert.ok(!(await pages[0].locator('#joystick').isVisible()));
  await pages[0].screenshot({path:'/tmp/bomba-spectator.png'});
  await pages[3].locator('#touchBomb').dispatchEvent('pointerdown',{pointerId:4});
  await pages[0].waitForFunction(()=>document.querySelector('#roundStatus').textContent==='FIM DA PARTIDA');
  await pages[0].waitForTimeout(1200);
  assert.equal(states.at(-1).phase,'finished','rematch must also wait for the host');
  assert.ok(!(await pages[0].locator('#spectateBtn').isVisible()));
  await pages[0].click('#playAgainBtn');
  await pages[0].waitForFunction(()=>document.querySelector('#roundStatus').textContent==='PREPARANDO ARENA');
  await pages[0].waitForFunction(()=>window.cameraView?.x<1&&window.cameraView?.y<1);
  assert.ok(await pages[0].locator('#joystick').isVisible());
  assert.ok(!(await pages[0].locator('#watchBtn').isVisible()));

  assert.deepEqual(errors,[]);
  console.log('PASS: lobby waits, guests cannot start, humans join before host starts, all deaths show drinking message, spectator button switches survivors and camera, no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
