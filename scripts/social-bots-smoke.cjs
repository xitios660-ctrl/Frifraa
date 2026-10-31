const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
 try{
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
   const Native=WebSocket;window.states=[];window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='joined')window.myId=m.playerId;if(m.type==='state'){window.latestState=m;window.states.push(m);}});}};
   window.bubbleLines=[];const draw=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(this.canvas.id==='arena'&&/^[💬💭]/u.test(String(text)))window.bubbleLines.push(String(text));return draw.call(this,text,...args);};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.BOMBA_BASE||'http://127.0.0.1:3280');await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));
  await page.locator('#entryCharacters [data-skin-index="3"]').click();await page.click('#createBtn');await page.locator('#roomPanel').waitFor({state:'visible'});await page.click('#startBtn');
  await page.waitForFunction(()=>window.latestState?.phase==='playing');await page.waitForFunction(()=>window.latestState.players.filter(p=>p.bot&&p.botSpeech?.text).length===3);
  const first=await page.evaluate(()=>window.latestState);assert.equal(first.botAI.provider,'local');assert.equal(first.players.filter(p=>p.bot).length,3);
  assert.ok(first.powerups.some(p=>p.type==='push'));assert.ok(!first.powerups.some(p=>p.type==='maxrange'));
  await page.locator('#touchBomb').dispatchEvent('pointerdown',{pointerId:54,pointerType:'touch'});await page.waitForFunction(()=>document.querySelector('#watchBtn').hidden===false);await page.click('#watchBtn');
  await page.waitForFunction(()=>window.bubbleLines.length>0);await page.screenshot({path:'/tmp/bomba-bot-balloons-mobile.png'});
  await page.waitForFunction(()=>window.states.some(s=>s.players.some(p=>p.bot&&p.botAllyId)),null,{timeout:24000});
  const activity=await page.evaluate(()=>({lines:window.bubbleLines.length,messages:new Set(window.states.flatMap(s=>s.players.filter(p=>p.bot&&p.botSpeech).map(p=>p.botSpeech.text))).size,relations:window.states.some(s=>s.players.some(p=>p.botAllyId))}));
  assert.ok(activity.lines>3);assert.ok(activity.messages>2);assert.ok(activity.relations);assert.deepEqual(errors,[]);
  console.log('PASS: one human + three autonomous bot minds, visible mobile speech balloons, changing intentions, friendship, shared server state and spectator; no Grok calls without credentials; no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
