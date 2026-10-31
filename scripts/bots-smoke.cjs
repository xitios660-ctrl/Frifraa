const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BOMBA_BASE||'http://127.0.0.1:3060';
async function until(fn,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){if(fn())return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timeout waiting for bot activity');}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
 try{
  const page=await browser.newPage({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  const states=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('websocket',ws=>ws.on('framereceived',e=>{try{const m=JSON.parse(e.payload);if(m.type==='state')states.push(m);}catch{}}));
  await page.goto(base);await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));
  await page.fill('#nameInput','Gustavo');await page.click('#createBtn');
  await page.locator('#roomPanel').waitFor({state:'visible'});
  await page.click('#startBtn');
  await until(()=>states.some(s=>s.phase==='countdown'));
  const start=states.find(s=>s.phase==='countdown');
  assert.equal(start.players.length,4);assert.equal(start.players.filter(p=>p.bot).length,3);
  assert.equal(start.players.find(p=>!p.bot).skin,'Gustavo');
  const botIds=new Set(start.players.filter(p=>p.bot).map(p=>p.id));
  await until(()=>states.some(s=>s.phase==='playing'&&s.players.some(p=>p.bot&&Math.hypot(p.x-start.players.find(a=>a.id===p.id).x,p.y-start.players.find(a=>a.id===p.id).y)>.2)));
  await until(()=>states.some(s=>s.bombs.some(b=>botIds.has(b.ownerId))));
  await until(()=>states.some(s=>s.flames.length>0));
  assert.equal(await page.locator('.hud-player').count(),4);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/bomba-bots.png'});
  await page.locator('#exitGameBtn').evaluate(button=>button.click());
  await page.locator('#homePanel').waitFor({state:'visible'});
  await page.click('#createBtn');await page.locator('#roomPanel').waitFor({state:'visible'});
  await until(()=>states.at(-1)?.phase==='lobby'&&states.at(-1)?.players.length===1);
  assert.ok(states.at(-1).players.every(p=>!p.bot));
  console.log('PASS: one human + three bots, movement, bot bombs, shared explosions, four skins, last-human cleanup, no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
