'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {MongoMemoryServer}=require('mongodb-memory-server');
const {MongoClient}=require('mongodb');
const {createApp,createMongoStore}=require('../server');
const {createWalletStore}=require('../wallet-store');
const {verifyWallet}=require('../wallet-verification');
let mongo,client,d;
test.before(async()=>{mongo=await MongoMemoryServer.create();client=new MongoClient(mongo.getUri());await client.connect();d=client.db('bomba_party_cofrinho');});
test.after(async()=>{await client?.close();await mongo?.stop();});
test('real MongoDB verifies balances, atomic concurrent purchases, ownership, persistence, revocation and original deposit preservation',async()=>{
 await d.collection('cofrinhos').insertOne({_id:'gustavo',saved:[1,2,3],legacyData:'preserve'});
 const before=await d.collection('cofrinhos').findOne({_id:'gustavo'});
 const result=await verifyWallet(async()=>d);assert.equal(result.ok,true);assert.equal(result.checks.length,10);
 assert.deepEqual(await d.collection('cofrinhos').findOne({_id:'gustavo'}),before);
 assert.ok(!(await d.listCollections().toArray()).some(c=>c.name.startsWith('qa_')));
});
test('authenticated HTTP API derives character from session, protects deposits, applies server prices and persists across server/client restarts',async()=>{
 process.env.NODE_ENV='test';process.env.WALLET_SERVICE_KEY='s'.repeat(64);process.env.WALLET_ADMIN_KEY='a'.repeat(64);
 let store=createMongoStore({uri:mongo.getUri()}),wallet=createWalletStore(()=>store.database());
 let server=createApp(store,wallet).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 let base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 try{
  assert.equal((await post('/api/deposit',{character:'mary',amount:10,marked:true})).status,401);
  assert.equal((await post('/api/wallet/admin/pin',{character:'mary',pin:'12345678'},{'x-wallet-admin':'bad'})).status,403);
  assert.equal((await post('/api/wallet/admin/pin',{character:'mary',pin:'12345678'},{'x-wallet-admin':process.env.WALLET_ADMIN_KEY})).status,200);
  const login=await post('/api/wallet/login',{character:'mary',pin:'12345678'});assert.equal(login.status,200);assert.ok(login.headers.get('set-cookie').includes('HttpOnly'));assert.equal((await login.json()).token,undefined);
  const cookies={cookie:login.headers.get('set-cookie').split(';')[0]};
  assert.equal((await post('/api/deposit',{character:'kaique',amount:200,marked:true},cookies)).status,403);
  assert.equal((await post('/api/deposit',{character:'mary',amount:10,marked:true},cookies)).status,200);
  assert.equal((await post('/api/deposit',{character:'mary',amount:200,marked:true},{...cookies,origin:'https://evil.example'})).status,403);
  let response=await post('/api/wallet/purchase',{itemId:'bomb2',requestId:crypto.randomUUID(),price:-999,character:'kaique',earned:9999},cookies);assert.equal(response.status,200);let view=await response.json();assert.equal(view.character,'mary');assert.equal(view.available,0);assert.equal(view.spent,10);
  response=await post('/api/wallet/equip',{equipped:['bomb2']},cookies);assert.equal(response.status,200);
  await new Promise(resolve=>server.close(resolve));await store.close();
  store=createMongoStore({uri:mongo.getUri()});wallet=createWalletStore(()=>store.database());server=createApp(store,wallet).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base=`http://127.0.0.1:${server.address().port}`;
  view=await(await fetch(base+'/api/wallet',{headers:cookies})).json();assert.equal(view.available,0);assert.equal(view.spent,10);assert.deepEqual(view.equipped,['bomb2']);assert.equal(view.history.length,1);
  const state=await(await fetch(base+'/api/state')).json();assert.deepEqual(state.people.find(p=>p.character==='mary').saved,[10]);
  assert.equal((await post('/api/wallet/logout',{},cookies)).status,200);assert.equal((await fetch(base+'/api/wallet',{headers:cookies})).status,401);
 }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});
test('per-character brute-force limits persist in MongoDB',async()=>{
 const store=createWalletStore(async()=>d);await store.setPin('kaique','12345678');
 for(let i=0;i<5;i++)await assert.rejects(store.login('kaique','00000000','rate-test'),e=>e.status===401);
 const restarted=createWalletStore(async()=>d);await assert.rejects(restarted.login('kaique','12345678','rate-test'),e=>e.status===429);
 await assert.rejects(restarted.login('outro','12345678','rate-test'),e=>e.status===401);
});
test('connections reject every database except bomba_party_cofrinho',async()=>{
 const wrong=createMongoStore({uri:mongo.getUri(),dbName:'another_project'});await assert.rejects(wrong.getAll(),e=>e.status===503);await wrong.close();
});
test('bootstrap PINs are unique per character and never replace an existing credential on deployment',async()=>{
 const store=createWalletStore(async()=>d);await store.bootstrap({jheniffer:'12345678'});const {token}=await store.login('jheniffer','12345678','bootstrap');
 await store.bootstrap({jheniffer:'87654321'});assert.equal((await store.get(token)).character,'jheniffer');await assert.rejects(store.login('jheniffer','87654321','bootstrap'),e=>e.status===401);
});
test('prior coin-shop spending, historical purchases and unlock tiers survive without double credit or a second charge',async()=>{
 const store=createWalletStore(async()=>d);await d.collection('cofrinhos').insertOne({_id:'jheniffer',saved:[100],spentCoins:35,upgrades:{bomb:1,kick:1},coinPurchases:[{id:'previous-purchase-id',upgrade:'bomb',cost:10,level:1,at:new Date()}]});
 const {token}=await store.login('jheniffer','12345678','legacy');let view=await store.get(token);assert.equal(view.spent,35);assert.equal(view.available,65);assert.ok(view.owned.includes('bomb2'));assert.ok(view.owned.includes('legacy-kick'));assert.equal(view.history[0].price,10);
 await assert.rejects(store.purchase(token,'bomb2',crypto.randomUUID()),e=>e.status===409);await store.equip(token,['bomb2','legacy-kick']);await store.purchase(token,'fire2',crypto.randomUUID());view=await store.get(token);assert.equal(view.spent,50);assert.equal(view.available,50);assert.deepEqual(view.equipped,['bomb2','legacy-kick']);assert.equal((await d.collection('cofrinhos').findOne({_id:'jheniffer'})).spentCoins,35);
});
