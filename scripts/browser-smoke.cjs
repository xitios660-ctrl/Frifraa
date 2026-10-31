const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
const pages=[],errors=[];
try {
for(let i=0;i<4;i++) {
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
 await context.addInitScript(({latency}) => {
   if(latency) {
     const NativeSocket=window.WebSocket;
     window.WebSocket=class extends NativeSocket {
       send(data) {
         this.sendAt=Math.max(this.sendAt||0,performance.now()+latency+Math.random()*40);
         setTimeout(()=>{if(this.readyState===NativeSocket.OPEN)super.send(data);},this.sendAt-performance.now());
       }
       addEventListener(type,listener,options) {
         if(type!=='message') return super.addEventListener(type,listener,options);
         return super.addEventListener(type,event=>{
           this.receiveAt=Math.max(this.receiveAt||0,performance.now()+latency+Math.random()*40);
           setTimeout(()=>listener.call(this,event),this.receiveAt-performance.now());
         },options);
       }
     };
   }
   window.sentDirections=[];
   const send=window.WebSocket.prototype.send;
   window.WebSocket.prototype.send=function(data){try{const m=JSON.parse(data);if(m.type==='input'){window.sentDirections.push(...m.steps);if(window.sentDirections.length>500)window.sentDirections.splice(0,250);}}catch{}return send.call(this,data);};
   window.playerPoints=[];
   const ellipse=CanvasRenderingContext2D.prototype.ellipse;
   CanvasRenderingContext2D.prototype.ellipse=function(...args) {
     if(this.canvas.id==='arena' && args[2]===17 && args[3]===7) {
       const transform=this.getTransform();window.playerPoints.push({x:args[0],y:args[1],cameraX:-transform.e,cameraY:-transform.f,time:performance.now()});
       if(window.playerPoints.length>2000) window.playerPoints.shift();
     }
     return ellipse.apply(this,args);
   };
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
 },{latency:Number(process.env.BOMBA_LATENCY)||0});
 const page=await context.newPage();pages.push(page);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.BOMBA_BASE || 'http://127.0.0.1:3000');
 await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));
 await page.fill('#nameInput',['Mary','Kaique','Jheniffer','Gustavo'][i]);
 assert.equal(await page.locator('#codeInput').count(),0);
 await page.click('#createBtn');
 await page.waitForSelector('#roomPanel:not([hidden])');
}
assert.equal(await pages[3].locator('.skin-choice.selected > span').textContent(),'GUSTAVO');
const animated=await pages[0].evaluate(()=>{
 const canvas=document.createElement('canvas');canvas.width=160;canvas.height=160;
 const ctx=canvas.getContext('2d');
 function fingerprint(draw,time){ctx.clearRect(0,0,160,160);draw(time);const data=ctx.getImageData(0,0,160,160).data;let value=0;for(let i=0;i<data.length;i++)value=(value*31+data[i])>>>0;return value;}
 const bomb={x:1,y:1,placedAt:1000,explodeAt:3250};
 const crate={x:1,y:1,kind:'crate',startedAt:1000,expiresAt:1650};
 return {bomb:fingerprint(t=>BombaEffects.bomb(ctx,bomb,t),1200)!==fingerprint(t=>BombaEffects.bomb(ctx,bomb,t),2900),
 debris:fingerprint(t=>BombaEffects.debris(ctx,crate,t),1100)!==fingerprint(t=>BombaEffects.debris(ctx,crate,t),1500)};
});
assert.ok(animated.bomb&&animated.debris,'bomb and destruction frames must animate');

await pages[0].selectOption('#mapSelect','ice');
await pages[1].waitForFunction(()=>document.querySelector('#mapSelect').value==='ice');
assert.ok(await pages[1].locator('#mapSelect').isDisabled());
await pages[0].click('#startBtn');
await pages[0].locator('#gamePanel').waitFor({state:'visible'});
await pages[0].waitForFunction(()=>document.querySelector('#roundStatus').textContent==='PARTIDA EM ANDAMENTO');
for(const page of pages) {
 await page.locator('#gamePanel').waitFor({state:'visible'});
 await page.locator('#joystick').waitFor({state:'visible'});
 assert.equal(await page.locator('.hud-player').count(),4);
 assert.ok(await page.locator('#joystick').isVisible());
 assert.ok(await page.locator('#touchBomb').isVisible());
 const sizes=await page.locator('#arena').boundingBox();assert.ok(sizes.width>200 && sizes.height<=390);
}
await pages[0].waitForFunction(()=>new Set(window.skinDraws.map(d=>d.src)).size===4);
await pages[3].bringToFront();
await pages[3].waitForFunction(()=>window.playerPoints.some(p=>p.cameraX>100&&p.cameraY>100));
for (const [direction,row] of [['ArrowRight',2],['ArrowLeft',1],['ArrowDown',0],['ArrowUp',3]]) {
 await pages[3].evaluate(()=>{window.skinDraws=[];});
 await pages[3].keyboard.down(direction);
 await pages[3].waitForFunction(row=>window.skinDraws.some(d=>d.src.includes('gustavo-walk') && d.row===row),row);
 await pages[3].keyboard.up(direction);
}
await pages[0].bringToFront();
const stick=await pages[0].locator('#joystick').boundingBox();
const cx=stick.x+stick.width/2,cy=stick.y+stick.height/2;
await pages[0].mouse.move(cx+stick.width*.23,cy+stick.height*.22);await pages[0].mouse.down();
await pages[0].waitForTimeout(120);await pages[0].evaluate(()=>{window.sentDirections=[];});
await pages[0].mouse.move(cx+stick.width*.22,cy+stick.height*.23);await pages[0].waitForTimeout(150);
const stable=await pages[0].evaluate(()=>window.sentDirections.filter(d=>d.x||d.y));
assert.ok(stable.length>2&&stable.every(d=>d.x===1&&d.y===0),'diagonal thumb jitter must not flip direction');
await pages[0].mouse.move(cx+stick.width*.05,cy+stick.height*.32);await pages[0].waitForTimeout(150);
assert.ok(await pages[0].evaluate(()=>window.sentDirections.some(d=>d.x===0&&d.y===1)),'intentional joystick turn must remain responsive');
await pages[0].evaluate(()=>window.dispatchEvent(new Event('blur')));
assert.ok(!(await pages[0].locator('#joystick').evaluate(node=>node.classList.contains('active'))),'losing focus must release the joystick');
await pages[0].mouse.up();
await pages[0].mouse.move(cx+stick.width*.3,cy);await pages[0].mouse.down();
assert.ok(await pages[0].locator('#joystick').evaluate(node=>node.classList.contains('active')),'joystick must accept a new touch after focus loss');
await pages[0].mouse.up();
for (const [direction,row] of [['ArrowRight',2],['ArrowLeft',1],['ArrowDown',0],['ArrowUp',3]]) {
 await pages[0].evaluate(()=>{window.skinDraws=[];});
 await pages[0].keyboard.down(direction);
 await pages[0].waitForFunction(row=>window.skinDraws.some(d=>d.src.includes('mary-walk') && d.row===row),row);
 await pages[0].waitForTimeout(160);
 await pages[0].keyboard.up(direction);
}
await pages[0].evaluate(()=>{window.playerPoints=[];});
await pages[0].keyboard.down('ArrowRight');
await pages[0].waitForTimeout(1500);
await pages[0].keyboard.up('ArrowRight');
const points=await pages[0].evaluate(()=>window.playerPoints);
assert.ok(points.length>15);
for(let i=1;i<points.length;i++) {
 assert.ok(points[i].x>=points[i-1].x-.5,'holding right must not rubber-band backwards');
 const distance=Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y);
 const limit=Math.max(10,1000/170*1.5*48*Math.min(.05,(points[i].time-points[i-1].time)/1000)+2);
 assert.ok(distance<=limit,`visible teleport: ${distance.toFixed(2)} px`);
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
console.log('PASS: one room without codes, large scrolling arena/map selection, animated bombs/debris, four browser clients, mobile landscape controls, bomb, portrait warning, four sprite sheets, four directions, idle animation, music playback/mute/resume, stable joystick, no teleports or reverse corrections, no JS errors');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
