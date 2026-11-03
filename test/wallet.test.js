'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {benefits,createIntegration}=require('../wallet-integration');
test('round advantages require ownership, optional equipment and the authenticated skin; repeated unlocks never stack',()=>{
 const defaults={bombs:1,range:1,speedLevel:1,lives:1,shield:0};assert.deepEqual(benefits(null,0),defaults);
 const wallet={character:'mary',owned:['bomb2','bomb3','fire2','fire3','speed2','speed3','life2','shield'],equipped:['bomb2','fire2','speed2','life2','shield']};
 assert.deepEqual(benefits(wallet,0),{bombs:2,range:2,speedLevel:2,lives:2,shield:1});assert.deepEqual(benefits(wallet,1),defaults);
 wallet.equipped=['bomb3','fire3','speed3','bomb3','life2'];assert.deepEqual(benefits(wallet,0),{bombs:3,range:3,speedLevel:3,lives:2,shield:0});
 wallet.equipped=[];assert.deepEqual(benefits(wallet,0),defaults);wallet.equipped=['forged','bomb2'];wallet.owned=[];assert.deepEqual(benefits(wallet,0),defaults);
});
test('game wallet gateway uses HttpOnly sessions, strips browser prices and identity, validates origins and privately binds each WebSocket',async()=>{
 const records=[],upstream=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):undefined;records.push({url:req.url,headers:req.headers,body});
  res.setHeader('content-type','application/json');res.end(JSON.stringify(req.url.endsWith('/login')?{token:'f'.repeat(64),character:'mary'}:{character:'mary',owned:['bomb2'],equipped:['bomb2']}));
 });upstream.listen(0,'127.0.0.1');await new Promise(resolve=>upstream.once('listening',resolve));
 const ws={playerId:'socket-id',walletLink:'private-link'},gateway=createIntegration(new Set([ws]),{url:`http://127.0.0.1:${upstream.address().port}`,key:'service-private'});
 const server=http.createServer((req,res)=>gateway.handle(req,res));server.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
 const base=`http://127.0.0.1:${server.address().port}`,post=(path,body,headers={})=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 try{
  const login=await post('/api/wallet/login',{character:'mary',pin:'12345678'});assert.equal(login.status,200);assert.ok(login.headers.get('set-cookie').includes('HttpOnly'));assert.equal((await login.json()).token,undefined);
  const cookie=login.headers.get('set-cookie').split(';')[0];
  assert.equal((await post('/api/wallet/link',{playerId:'socket-id',walletLink:'forged'},{cookie})).status,403);
  assert.equal((await post('/api/wallet/link',{playerId:'socket-id',walletLink:'private-link'},{cookie})).status,200);assert.equal(ws.walletToken,'f'.repeat(64));assert.equal(ws.walletCharacter,'mary');
  await post('/api/wallet/purchase',{itemId:'bomb2',requestId:'abcdef0123456789',price:-100,character:'gustavo',earned:1000},{cookie});
  const forwarded=records.at(-1);assert.deepEqual(forwarded.body,{itemId:'bomb2',requestId:'abcdef0123456789'});assert.equal(forwarded.headers['x-wallet-service'],'service-private');assert.equal(forwarded.headers.authorization,'Bearer '+'f'.repeat(64));
  assert.equal((await post('/api/wallet/equip',{equipped:[]},{cookie,origin:'https://evil.example'})).status,403);
  assert.equal((await post('/api/wallet/admin/pin',{character:'gustavo',pin:'12345678'},{cookie})).status,404);
  assert.equal((await gateway.loadPlayer({ws,skinIndex:1})),null);
  assert.equal((await gateway.loadPlayer({ws,skinIndex:0})).character,'mary');
 }finally{await Promise.all([new Promise(resolve=>server.close(resolve)),new Promise(resolve=>upstream.close(resolve))]);}
});
