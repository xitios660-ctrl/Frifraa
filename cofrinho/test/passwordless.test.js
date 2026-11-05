'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createWalletStore}=require('../wallet-store');
const {createApp,publicState}=require('../server');

function fakeDatabase(){
 const accounts=new Map(),sessions=new Map();
 return{
  collection(name){
   if(name==='wallet_accounts')return{
    async updateOne(filter,update){if(!accounts.has(filter._id))accounts.set(filter._id,{_id:filter._id,...update.$setOnInsert});},
    async findOne(filter){return accounts.get(filter._id)||null;}
   };
   if(name==='wallet_sessions')return{
    async createIndex(){return 'expiresAt_1';},
    async insertOne(doc){sessions.set(doc._id,doc);},
    async findOne(filter){const value=sessions.get(filter._id);return value?.expiresAt>filter.expiresAt.$gt?value:null;},
    async deleteOne(filter){sessions.delete(filter._id);}
   };
   if(name==='cofrinhos')return{async findOne(){return null;}};
   throw new Error('Unexpected collection: '+name);
  }
 };
}

test('opens each wallet by character without a password and keeps sessions separate',async()=>{
 const database=fakeDatabase(),wallet=createWalletStore(async()=>database);
 const mary=await wallet.login('mary'),kaique=await wallet.login('kaique');
 assert.equal((await wallet.get(mary.token)).character,'mary');
 assert.equal((await wallet.get(kaique.token)).character,'kaique');
 await assert.rejects(wallet.login('other'),error=>error.status===400);
 await wallet.logout(mary.token);
 await assert.rejects(wallet.get(mary.token),error=>error.status===401);
});

test('HTTP deposit and wallet entry accept no PIN or administrative password',async()=>{
 const database=fakeDatabase(),wallets=createWalletStore(async()=>database);
 const saved=new Map();
 const store={
  async getAll(){return ['mary','kaique','jheniffer','gustavo'].map(character=>publicState(character,[...(saved.get(character)||[])]));},
  async setMarked(character,amount,marked){const values=saved.get(character)||new Set();marked?values.add(amount):values.delete(amount);saved.set(character,values);return publicState(character,[...values]);}
 };
 const server=createApp(store,wallets).listen(0,'127.0.0.1');
 await new Promise(resolve=>server.once('listening',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(url,data)=>fetch(base+url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
 try{
  const login=await post('/api/wallet/login',{character:'mary'});assert.equal(login.status,200);
  assert.match(login.headers.get('set-cookie'),/HttpOnly/);
  assert.equal((await post('/api/deposit',{character:'kaique',amount:10,marked:true})).status,200);
  assert.equal((await post('/api/wallet/admin/pin',{character:'mary'})).status,404);
  assert.equal((await post('/api/wallet/admin/verify',{})).status,404);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
