const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
 try{
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
   const Native=WebSocket;window.states=[];window.geminiBots={};window.geminiPlans={};window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='state'){window.latestState=m;window.states.push(m);for(const p of m.players)if(p.botSpeech?.source==='gemini'){window.geminiBots[p.id]=p.botSpeech.text;window.geminiPlans[p.id]=p.botPlan;}}});}};
   window.lines=[];const draw=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){if(this.canvas.id==='arena')window.lines.push(String(text));return draw.call(this,text,...args);};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.BOMBA_BASE||'https://bomberman-i7lu.onrender.com');await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));
  await page.locator('#entryCharacters [data-skin-index="3"]').click();await page.click('#createBtn');await page.locator('#roomPanel').waitFor({state:'visible'});await page.click('#startBtn');
  await page.waitForFunction(()=>window.latestState?.phase==='playing');const baseline=await page.evaluate(()=>window.latestState.botAI.requestsToday);assert.equal(await page.evaluate(()=>window.latestState.botAI.provider),'gemini');
  await page.waitForFunction(()=>Object.keys(window.geminiBots).length===3,null,{timeout:25000});
  await page.locator('#touchBomb').dispatchEvent('pointerdown',{pointerId:63,pointerType:'touch'});
  await page.waitForFunction(()=>document.querySelector('#watchBtn').hidden===false);await page.click('#watchBtn');
  let visible=false;
  for(let i=0;i<4&&!visible;i++){
   await page.waitForTimeout(120);visible=await page.evaluate(()=>Object.values(window.geminiBots).some(text=>window.lines.some(line=>line.includes(text.split(' ').slice(0,3).join(' ')))));
   if(!visible)await page.click('#spectateBtn');
  }
  assert.ok(visible,'a real Gemini message must be drawn in a speech bubble');
  const result=await page.evaluate(()=>({bots:Object.keys(window.geminiBots).length,api:window.latestState.botAI,plans:window.geminiPlans,states:window.states}));
  for(const plan of Object.values(result.plans)){assert.equal(plan.source,'gemini');assert.ok(['auto','hold','attack','break'].includes(plan.bombMode));}
  for(const state of result.states){const living=state.players.filter(p=>p.alive);for(let i=0;i<living.length;i++)for(let j=i+1;j<living.length;j++)assert.ok(Math.abs(living[i].x-living[j].x)>=.999999||Math.abs(living[i].y-living[j].y)>=.999999,'players must not overlap');}
  assert.ok(result.api.successfulReplies>=3);assert.equal(result.api.model,'gemini-3.1-flash-lite');assert.ok(result.api.requestsToday-baseline<=4);assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/bomba-gemini-live-mobile.png'});
  console.log('PASS: three independent bots received real Gemini replies; movement/bomb policies accepted from Gemini; no shared squares; messages drawn on mobile; spectator and game remain responsive; server request limits enforced; no JS errors');
 }catch(error){
  let diagnostic={};try{const page=browser.contexts()[0]?.pages()[0];if(page)diagnostic=await page.evaluate(()=>({bots:window.geminiBots,plans:window.geminiPlans,api:window.latestState?.botAI,players:window.latestState?.players.map(p=>({id:p.id,name:p.name,alive:p.alive,source:p.botSpeech?.source}))}));}catch{}
  console.log('GEMINI DIAGNOSTICS',JSON.stringify(diagnostic));throw error;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
