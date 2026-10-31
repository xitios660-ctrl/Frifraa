const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
const pages=[],errors=[];
try {
for(let i=0;i<4;i++) {
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
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
 assert.equal(await page.locator('.hud-player').count(),4);
 assert.ok(await page.locator('#joystick').isVisible());
 assert.ok(await page.locator('#touchBomb').isVisible());
 const sizes=await page.locator('#arena').boundingBox();assert.ok(sizes.width>200 && sizes.height<=390);
}
await pages[0].keyboard.down('ArrowRight');await pages[0].waitForTimeout(250);await pages[0].keyboard.up('ArrowRight');
await pages[0].locator('#touchBomb').dispatchEvent('pointerdown',{pointerId:2});
await pages[0].waitForTimeout(2600);
await pages[0].screenshot({path:'/tmp/bomba-party-mobile.png'});
await pages[0].setViewportSize({width:390,height:844});
await pages[0].locator('#rotateOverlay').waitFor({state:'visible'});
assert.deepEqual(errors,[]);
console.log('PASS: four browser clients, mobile landscape controls, bomb, portrait warning, no JS errors');
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
