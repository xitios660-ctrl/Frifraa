const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BOMBA_BASE||'http://127.0.0.1:3160';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
 try{
  const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  await context.addInitScript(()=>{
   window.commands=[];window.bombCommands=0;const send=WebSocket.prototype.send;
   WebSocket.prototype.send=function(data){try{const m=JSON.parse(data);if(m.type==='input')window.commands.push(...m.steps);if(m.type==='bomb')window.bombCommands++;}catch{}return send.call(this,data);};
   window.addEventListener('pointerdown',e=>{if(e.target.closest?.('#joystick'))window.joyPointer=e.pointerId;},true);
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));
  await page.locator('#entryCharacters [data-skin-index="3"]').click();await page.click('#createBtn');
  await page.locator('#roomPanel').waitFor({state:'visible'});await page.click('#startBtn');
  await page.locator('#gamePanel').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#roundStatus').textContent==='PARTIDA EM ANDAMENTO');
  const pad=await page.locator('#joystick').boundingBox(),bomb=await page.locator('#touchBomb').boundingBox();
  const cx=pad.x+pad.width/2,cy=pad.y+pad.height/2;
  const touch=(id,x,y)=>({id,x,y,radiusX:2,radiusY:2,force:1});
  const cdp=await context.newCDPSession(page);
  const dispatch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  async function direction(x,y){await page.waitForFunction(([x,y])=>window.commands.at(-1)?.x===x&&window.commands.at(-1)?.y===y,[x,y]);}
  let finger=touch(11,cx+pad.width*.3,cy);
  await dispatch('touchStart',[finger]);await direction(1,0);
  await page.evaluate(()=>{const pad=document.querySelector('#joystick');if(pad.hasPointerCapture(window.joyPointer))pad.releasePointerCapture(window.joyPointer);});
  finger=touch(11,pad.x+pad.width+55,cy);await dispatch('touchMove',[finger]);await direction(1,0);
  assert.ok(await page.locator('#joystick').evaluate(e=>e.classList.contains('active')),'capture loss must not release a held finger');
  const bombFinger=touch(22,bomb.x+bomb.width/2,bomb.y+bomb.height/2);
  await dispatch('touchStart',[finger,bombFinger]);await page.waitForFunction(()=>window.bombCommands===1);await dispatch('touchEnd',[bombFinger]);
  assert.ok(await page.locator('#joystick').evaluate(e=>e.classList.contains('active')),'bomb touch must not stop movement');
  finger=touch(11,cx,cy-pad.height);await dispatch('touchMove',[finger]);await direction(0,-1);
  await dispatch('touchEnd',[]);await direction(0,0);
  assert.ok(!(await page.locator('#joystick').evaluate(e=>e.classList.contains('active'))));
  finger=touch(33,cx-pad.width*.3,cy);await dispatch('touchStart',[finger]);await direction(-1,0);
  await dispatch('touchCancel',[]);await direction(0,0);
  // Capture can fail on a browser; window tracking must still end the gesture cleanly.
  await page.evaluate(()=>{document.querySelector('#joystick').setPointerCapture=()=>{throw new Error('simulated capture failure');};});
  finger=touch(44,cx+pad.width*.3,cy);await dispatch('touchStart',[finger]);await direction(1,0);
  finger=touch(44,pad.x+pad.width+50,cy);await dispatch('touchMove',[finger]);await direction(1,0);
  await dispatch('touchEnd',[]);await direction(0,0);
  assert.deepEqual(errors,[]);
  console.log('PASS: touch dragging outside, capture loss/failure, simultaneous bomb finger, release, cancel and immediate new gesture; no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
