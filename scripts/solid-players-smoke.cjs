// Controlled spawn layout exists only in this test process; production maps/spawns are untouched.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const physics=require('../public/physics');
const maps=require('../public/maps');
const positions=[{x:5,y:3},{x:7,y:3},{x:6,y:2},{x:6,y:4}];positions.forEach((p,i)=>Object.assign(maps.SPAWNS[i],p));
maps.create=()=>Array.from({length:maps.HEIGHT},(_,y)=>Array.from({length:maps.WIDTH},(_,x)=>!x||!y||x===maps.WIDTH-1||y===maps.HEIGHT-1?1:0));
process.env.PORT=process.env.BOMBA_TEST_PORT||'3300';const {rooms}=require('../server');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME}),pages=[],errors=[];
 try{
  for(let i=0;i<4;i++){
   const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
   await context.addInitScript(({latency})=>{
    const Native=WebSocket;window.states=[];window.WebSocket=class extends Native{
     send(data){if(latency)setTimeout(()=>{if(this.readyState===Native.OPEN)super.send(data);},latency);else super.send(data);}
     addEventListener(type,fn,opts){if(type==='message'&&latency)return super.addEventListener(type,e=>setTimeout(()=>fn.call(this,e),latency),opts);return super.addEventListener(type,fn,opts);}
     constructor(...args){super(...args);this.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.type==='state'){window.latestState=m;window.states.push(m);}});}
    };
   },{latency:Number(process.env.BOMBA_LATENCY)||0});
   const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${process.env.PORT}`);
   await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));await page.locator(`#entryCharacters [data-skin-index="${i}"]`).click();await page.click('#createBtn');await page.locator('#roomPanel').waitFor({state:'visible'});
  }
  await pages[0].click('#startBtn');rooms.values().next().value.powerups.clear();
  for(const page of pages)await page.waitForFunction(()=>window.latestState?.phase==='playing');
  const directions=['ArrowRight','ArrowLeft','ArrowDown','ArrowUp'];
  for(let i=0;i<4;i++)await pages[i].keyboard.down(directions[i]);await pages[0].waitForTimeout(1000);for(let i=0;i<4;i++)await pages[i].keyboard.up(directions[i]);
  const r=rooms.values().next().value;
  for(const page of pages){const states=await page.evaluate(()=>window.states.filter(s=>s.phase==='playing'));assert.ok(states.length>12);for(const s of states)for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
   assert.equal(physics.overlaps(s.players[i],s.players[j]),false);assert.notEqual(`${Math.round(s.players[i].x)},${Math.round(s.players[i].y)}`,`${Math.round(s.players[j].x)},${Math.round(s.players[j].y)}`);
  }}
  const winner=[...r.players.values()].find(p=>p.x===6&&p.y===3);assert.ok(winner,'one player should claim the contested square');
  const index=winner.slot,back=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'][index];await pages[index].keyboard.down(back);await pages[index].waitForTimeout(500);await pages[index].keyboard.up(back);
  assert.deepEqual(errors,[]);console.log('PASS: four real mobile clients contest one house without shared cells or body overlap; client/server collision, blocked movement and retreat work with network delay; no JS errors');
 }finally{await browser.close();}
})().then(()=>process.kill(process.pid,'SIGTERM')).catch(e=>{console.error(e);process.exit(1)});
