// Four real mobile clients; fixture setup remains local to this process.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
process.env.PORT=process.env.BOMBA_TEST_PORT||'3240';
const {rooms,tick}=require('../server');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
 const pages=[],errors=[];
 try{
  for(let i=0;i<4;i++){
   const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
   await context.addInitScript(({latency})=>{
    const Native=WebSocket;window.states=[];window.WebSocket=class extends Native{send(data){if(latency)setTimeout(()=>{if(this.readyState===Native.OPEN)super.send(data);},latency);else super.send(data);}addEventListener(type,listener,options){if(type==='message'&&latency)return super.addEventListener(type,e=>setTimeout(()=>listener.call(this,e),latency),options);return super.addEventListener(type,listener,options);}constructor(...args){super(...args);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='state'){window.latestState=m;window.states.push(m);}});}};
    window.bombFrames=[];window.addEventListener('DOMContentLoaded',()=>{const draw=BombaEffects.bomb;BombaEffects.bomb=(c,b,t)=>{if(b.slide)window.bombFrames.push(BombaEffects.bombPoint(b,t));return draw(c,b,t);};});
   },{latency:Number(process.env.BOMBA_LATENCY)||0});
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(`http://127.0.0.1:${process.env.PORT}`);await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));
   await page.locator(`#entryCharacters [data-skin-index="${i}"]`).click();await page.click('#createBtn');await page.locator('#roomPanel').waitFor({state:'visible'});
  }
  await pages[0].click('#startBtn');await pages[0].waitForFunction(()=>window.latestState?.phase==='playing');
  const r=rooms.values().next().value,host=r.players.get(r.hostId),other=[...r.players.values()].find(p=>p.slot===1);
  for(let x=1;x<=12;x++)r.board[1][x]=0;r.board[1][9]=2;r.powerups.clear();r.powerups.set('2,1','kick');r.powerups.set('5,1','curse');
  const fuse=Date.now()+2250;r.bombs.push({id:'kick-fixture',x:3,y:1,ownerId:other.id,range:1,placedAt:Date.now(),explodeAt:fuse,passThrough:[]});other.activeBombs=1;tick();
  await pages[0].keyboard.down('ArrowRight');
  for(const page of pages)await page.waitForFunction(id=>window.latestState.players.find(p=>p.id===id).kick,host.id);
  for(const page of pages)await page.waitForFunction(()=>window.latestState.bombs.some(b=>b.id==='kick-fixture'&&b.rolling));
  for(const page of pages)await page.waitForFunction(id=>window.latestState.players.find(p=>p.id===id).slowedUntil>window.latestState.serverTime,host.id);
  await pages[0].keyboard.up('ArrowRight');
  assert.equal(host.kick,true);assert.equal(host.speed,272);assert.equal(host.bombPass,false);assert.equal(host.piercing,false);
  for(const page of pages){const samples=await page.evaluate(()=>window.states.flatMap(s=>s.bombs.filter(b=>b.id==='kick-fixture')));assert.ok(samples.some(b=>b.rolling));assert.ok(samples.every(b=>b.explodeAt===fuse&&b.ownerId===other.id&&b.x<=8));}
  await pages[0].screenshot({path:'/tmp/bomba-skull-glove-mobile.png'});
  for(const page of pages)await page.waitForFunction(()=>window.bombFrames.length>5);
  const frames=await pages[0].evaluate(()=>window.bombFrames);assert.ok(frames.some(p=>p.x%1>.05&&p.x%1<.95),'bomb must render positions between houses');assert.ok(frames.every(p=>p.y===1));
  for(const page of pages)await page.waitForFunction(()=>!window.latestState.bombs.some(b=>b.id==='kick-fixture'));
  assert.equal(other.activeBombs,0);assert.equal(r.board[1][9],0);assert.ok(host.alive);
  for(const page of pages)await page.waitForFunction(id=>{const p=window.latestState.players.find(p=>p.id===id);return p.speed===170&&p.slowedUntil<=window.latestState.serverTime;},host.id,{timeout:12000});
  assert.deepEqual(errors,[]);
  console.log('PASS: four real mobile clients share glove pickup, kick/rolling animation, obstacle stop, unchanged fuse/owner, explosion, skull slowdown and six-second recovery; no JS errors');
 }finally{await browser.close();}
})().then(()=>process.kill(process.pid,'SIGTERM')).catch(e=>{console.error(e);process.exit(1)});
