/* Cross-branch integration, real temporary MongoDB and four browser players.
 * COFRINHO_PROJECT points to the existing cofrinho worktree's /cofrinho folder.
 * No production database or credentials are used by this script. */
const assert=require('node:assert/strict'),path=require('node:path');
const {spawn}=require('node:child_process'),{chromium}=require('playwright');
const cofrinho=process.env.COFRINHO_PROJECT||path.resolve(__dirname,'../../Frifraa-cofrinho/cofrinho');
const {MongoMemoryServer}=require(path.join(cofrinho,'node_modules/mongodb-memory-server'));
const {MongoClient}=require(path.join(cofrinho,'node_modules/mongodb'));
const {createApp,createMongoStore}=require(path.join(cofrinho,'server'));
const {createWalletStore}=require(path.join(cofrinho,'wallet-store'));
(async()=>{
 let mongo,store,backend,game,browser;const errors=[],pages=[];const port=39300+Math.floor(Math.random()*500),base=`http://127.0.0.1:${port}`;
 try{
  process.env.NODE_ENV='test';process.env.WALLET_SERVICE_KEY='integration-service-key-for-tests-only';
  mongo=await MongoMemoryServer.create();store=createMongoStore({uri:mongo.getUri()});const wallet=createWalletStore(()=>store.database());
  await wallet.setPin('mary','12345678');await store.setMarked('mary',200,true);
  backend=createApp(store,wallet).listen(0,'127.0.0.1');await new Promise(resolve=>backend.once('listening',resolve));
  const bank=`http://127.0.0.1:${backend.address().port}`;
  game=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:String(port),COFRINHO_URL:bank,BOT_AI_PROVIDER:'local'},stdio:['ignore','pipe','pipe']});
  let logs='';game.stdout.on('data',d=>logs+=d);game.stderr.on('data',d=>logs+=d);
  for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,50));}
  browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
  for(let i=0;i<4;i++){
   const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
   await context.addInitScript(()=>{const Native=WebSocket;window.WebSocket=class extends Native{constructor(...args){super(...args);this.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.type==='state')window.latestState=m;if(m.type==='joined')window.myId=m.playerId;});}};});
   const page=await context.newPage();pages.push(page);page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.waitForFunction(()=>document.querySelector('#serverDot').classList.contains('live'));
   if(i===0){
    await page.locator('.wallet-open').first().click();await page.locator('.wallet-login').waitFor({state:'visible'});await page.selectOption('.wallet-login select','mary');await page.fill('.wallet-login input','12345678');await page.click('.wallet-login button[type=submit]');await page.locator('.wallet-account').waitFor({state:'visible'});
    for(const id of ['bomb2','fire2','speed2','life2','shield']){
     await page.click(`[data-item-id=${id}] button`);await page.waitForFunction(id=>document.querySelector(`[data-item-id=${id}] button`)?.dataset.action==='equip',id);
     await page.click(`[data-item-id=${id}] button`);await page.waitForFunction(id=>document.querySelector(`[data-item-id=${id}] button`)?.getAttribute('aria-pressed')==='true',id);
    }
    assert.match(await page.locator('.wallet-balances').innerText(),/100/);assert.equal(await page.locator('.wallet-history li').count(),5);
    await page.locator('#walletDialog').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'/tmp/bomba-wallet-landscape.png'});
    await page.setViewportSize({width:390,height:844});await page.locator('#walletDialog').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'/tmp/bomba-wallet-portrait.png'});
    assert.ok(await page.locator('#walletDialog').evaluate(el=>el.scrollWidth<=el.clientWidth+2));await page.setViewportSize({width:844,height:390});await page.click('.wallet-close');
   }
   await page.locator(`#entryCharacters [data-skin-index="${i}"]`).click();await page.click('#createBtn');await page.locator('#roomPanel').waitFor({state:'visible'});
  }
  const host=pages[0];await host.waitForTimeout(1200);assert.equal(await host.evaluate(()=>latestState.phase),'lobby');assert.equal(await host.evaluate(()=>latestState.players.length),4);
  // Another device updates a real deposit in the temporary Mongo database.
  const bankContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const bankPage=await bankContext.newPage();bankPage.on('pageerror',error=>errors.push(error.message));await bankPage.goto(bank);
  await bankPage.locator('.wallet-open').click();await bankPage.fill('.wallet-login input','12345678');await bankPage.click('.wallet-login button[type=submit]');await bankPage.locator('.wallet-account').waitFor({state:'visible'});await bankPage.click('.wallet-close');await bankPage.locator('[data-amount="5"]').click();await bankPage.waitForFunction(()=>document.querySelector('[data-amount="5"]').classList.contains('done'));
  await host.evaluate(()=>window.BombaWallet.refresh());await host.locator('.wallet-open').first().click();await host.waitForFunction(()=>document.querySelector('.wallet-balances').textContent.includes('105'));await host.click('.wallet-close');
  await host.click('#startBtn');for(const page of pages)await page.waitForFunction(()=>window.latestState?.phase==='playing');
  const snapshots=await Promise.all(pages.map(page=>page.evaluate(()=>latestState.players.map(p=>({skin:p.skin,lives:p.lives,range:p.range,bombs:p.bombs,speedLevel:p.speedLevel,shield:p.shield})))));
  for(const snapshot of snapshots)assert.deepEqual(snapshot,snapshots[0]);const mary=snapshots[0].find(p=>p.skin==='Mary');assert.deepEqual(mary,{skin:'Mary',lives:2,range:2,bombs:2,speedLevel:2,shield:1});for(const other of snapshots[0].filter(p=>p.skin!=='Mary')){assert.equal(other.lives,1);assert.equal(other.range,1);assert.equal(other.speedLevel,1);}
  assert.equal((await store.getAll()).find(p=>p.character==='mary').total,205);
  // Reload the banking service and Mongo client; the same cookie and purchases survive.
  await new Promise(resolve=>backend.close(resolve));await store.close();store=createMongoStore({uri:mongo.getUri()});backend=createApp(store).listen(Number(new URL(bank).port),'127.0.0.1');await new Promise(resolve=>backend.once('listening',resolve));await bankPage.reload();await bankPage.locator('.wallet-open').click();await bankPage.locator('.wallet-account').waitFor({state:'visible'});assert.equal(await bankPage.locator('.wallet-history li').count(),5);assert.match(await bankPage.locator('.wallet-balances').innerText(),/105/);
  assert.deepEqual(errors,[]);assert.ok(!/Unhandled|Error:/.test(logs),logs);
  console.log('PASS: real MongoDB; five permanent unlocks and optional equipment; protected wallet; mobile portrait/landscape; cross-device deposits; four synchronized players; purchased initial stats; free defaults; banking restart persistence; no browser errors.');
 }finally{await browser?.close();game?.kill('SIGTERM');if(backend)await new Promise(resolve=>backend.close(resolve));await store?.close();await mongo?.stop();}
})().catch(error=>{console.error(error);process.exit(1);});
