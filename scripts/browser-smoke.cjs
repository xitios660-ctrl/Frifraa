const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
const pages=[],errors=[];
try {
for(let i=0;i<4;i++) {
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 await context.addInitScript(() => {
   window.audioContexts=[];window.audioStarts=[];
   const Base=window.AudioContext;
   if(Base) window.AudioContext=class extends Base {
     constructor(...args){super(...args);window.audioContexts.push(this);}
     createOscillator(){
       const voice=super.createOscillator(),start=voice.start.bind(voice);
       voice.start=(time)=>{window.audioStarts.push({frequency:voice.frequency.value,type:voice.type,time,now:this.currentTime});return start(time);};
       return voice;
     }
   };
   window.skinDraws=[];
   const original=CanvasRenderingContext2D.prototype.drawImage;
   CanvasRenderingContext2D.prototype.drawImage=function(image,...args) {
     if(args.length===8 && image.src?.includes('-walk-v1.png')) {
       window.skinDraws.push({src:image.src,x:args[0],y:args[1],w:args[2],h:args[3],row:Math.floor(args[1]/image.naturalHeight*4),frame:Math.floor(args[0]/image.naturalWidth*4)});
       if(window.skinDraws.length>300) window.skinDraws.shift();
     }
     return original.call(this,image,...args);
   };
 });
 const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.BOMBA_BASE || 'http://127.0.0.1:3000');
 await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));
 await page.fill('#nameInput',['Mary','Kaique','Jheniffer','Solar'][i]);
 if(!i) await page.click('#createBtn');
 else { await page.fill('#codeInput',await pages[0].locator('#roomCode').textContent());await page.click('#joinBtn'); }
 await page.waitForSelector('#roomPanel:not([hidden])');
}
await pages[0].click('#startBtn');
await pages[0].waitForFunction(()=>document.querySelector('#roundStatus').textContent==='PARTIDA EM ANDAMENTO');
for(const page of pages) {
 await page.locator('#gamePanel').waitFor({state:'visible'});
 await page.locator('#joystick').waitFor({state:'visible'});
 assert.equal(await page.locator('.hud-player').count(),4);
 assert.ok(await page.locator('#joystick').isVisible());
 assert.ok(await page.locator('#touchBomb').isVisible());
 const sizes=await page.locator('#arena').boundingBox();assert.ok(sizes.width>200 && sizes.height<=390);
}
await pages[0].waitForFunction(()=>new Set(window.skinDraws.map(d=>d.src)).size===3);
for (const [direction,row] of [['ArrowRight',2],['ArrowLeft',1],['ArrowDown',0],['ArrowUp',3]]) {
 await pages[0].evaluate(()=>{window.skinDraws=[];});
 await pages[0].keyboard.down(direction);
 await pages[0].waitForFunction(row=>window.skinDraws.some(d=>d.src.includes('mary-walk') && d.row===row),row);
 await pages[0].waitForTimeout(160);
 await pages[0].keyboard.up(direction);
}
await pages[0].waitForTimeout(650);
await pages[0].evaluate(()=>{window.skinDraws=[];});
await pages[0].waitForTimeout(150);
const idleFrames=await pages[0].evaluate(()=>window.skinDraws.filter(d=>d.src.includes('mary-walk')).map(d=>d.frame));
assert.ok(idleFrames.length>2 && idleFrames.every(frame=>frame===1),'walking must settle to neutral on release');
await pages[0].bringToFront();
await pages[0].waitForFunction(()=>window.audioContexts.some(c=>c.state==='running') && window.audioStarts.some(n=>n.time-n.now>.01));
await pages[0].click('#soundBtn');
await pages[0].waitForFunction(()=>window.audioContexts.every(c=>c.state==='suspended'));
const mutedCount=await pages[0].evaluate(()=>window.audioStarts.length);
await pages[0].waitForTimeout(220);
assert.equal(await pages[0].evaluate(()=>window.audioStarts.length),mutedCount,'mute must stop the music');
await pages[0].click('#soundBtn');
await pages[0].waitForFunction(()=>window.audioContexts.some(c=>c.state==='running'));
await pages[0].locator('#touchBomb').dispatchEvent('pointerdown',{pointerId:2});
await pages[0].waitForTimeout(2600);
await pages[0].screenshot({path:'/tmp/bomba-party-mobile.png'});
await pages[0].setViewportSize({width:390,height:844});
await pages[0].locator('#rotateOverlay').waitFor({state:'visible'});
assert.deepEqual(errors,[]);
console.log('PASS: four browser clients, mobile landscape controls, bomb, portrait warning, three sprite sheets, four directions, idle animation, music playback/mute/resume, no JS errors');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
