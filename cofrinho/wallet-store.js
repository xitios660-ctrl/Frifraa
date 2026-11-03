'use strict';
const crypto=require('node:crypto');
const {promisify}=require('node:util');
const scrypt=promisify(crypto.scrypt);
const {CATALOG,equipment,walletView}=require('./catalog');
const PEOPLE=['mary','kaique','jheniffer','gustavo'];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(message,status)=>Object.assign(new Error(message),{status});
function createWalletStore(database,{prefix=''}={}){
 if(!/^(qa_[a-f0-9]{16}_)?$/.test(prefix))throw new Error('Prefixo de verificação inválido.');
 let indexes;
 async function db(){
  const source=await database(),value={collection:name=>source.collection(prefix+name)};
  indexes??=Promise.all(['wallet_sessions','wallet_login_limits'].map(name=>value.collection(name).createIndex({expiresAt:1},{expireAfterSeconds:0}))).catch(error=>{indexes=null;throw error;});
  await indexes;return value;
 }
 async function session(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fail('Entre com o PIN do seu personagem.',401);
  const d=await db(),s=await d.collection('wallet_sessions').findOne({_id:hash(token),expiresAt:{$gt:new Date()}});
  if(!s)throw fail('Sua sessão expirou. Entre novamente.',401);
  const account=await d.collection('wallet_accounts').findOne({_id:s.character});
  if(!account||account.version!==s.version)throw fail('O PIN foi atualizado. Entre novamente.',401);
  return{d,character:s.character};
 }
 return{
  async bootstrap(pins){
   const d=await db();
   for(const character of PEOPLE){
    const pin=pins[character];if(typeof pin!=='string'||!/^\d{8,12}$/.test(pin))continue;
    const salt=crypto.randomBytes(16).toString('hex'),digest=(await scrypt(pin,salt,64)).toString('hex');
    // A deployment must never reset an existing PIN or its session version.
    await d.collection('wallet_accounts').updateOne({_id:character},{$setOnInsert:{salt,digest,version:1,createdAt:new Date()}},{upsert:true});
   }
  },
  async setPin(character,pin){
   if(!PEOPLE.includes(character)||typeof pin!=='string'||!/^\d{8,12}$/.test(pin))throw fail('Use um personagem válido e um PIN com 8 a 12 números.',400);
   const d=await db(),salt=crypto.randomBytes(16).toString('hex'),digest=(await scrypt(pin,salt,64)).toString('hex');
   await d.collection('wallet_accounts').updateOne({_id:character},{$set:{salt,digest,updatedAt:new Date()},$inc:{version:1}},{upsert:true});
   return{ok:true,character};
  },
  async login(character,pin,address){
   if(!PEOPLE.includes(character)||typeof pin!=='string'||pin.length>12)throw fail('Personagem ou PIN inválido.',401);
   const d=await db(),limits=d.collection('wallet_login_limits'),key=hash(`${character}:${address}`),time=Date.now();
   // One document per character/address; the increment is atomic across instances.
   const windowExpired={$lt:[{$ifNull:['$until',0]},time]};
   const attempt=await limits.findOneAndUpdate({_id:key},[{$set:{
    attempts:{$cond:[windowExpired,1,{$add:[{$ifNull:['$attempts',0]},1]}]},
    until:{$cond:[windowExpired,time+900000,'$until']},
    expiresAt:new Date(time+900000)
   }}],{upsert:true,returnDocument:'after'});
   if(attempt.attempts>5)throw fail('Muitas tentativas. Aguarde 15 minutos.',429);
   const account=await d.collection('wallet_accounts').findOne({_id:character});
   const actual=await scrypt(pin,account?.salt||'bomba-party-dummy-salt',64);
   if(!account||!crypto.timingSafeEqual(actual,Buffer.from(account.digest,'hex')))throw fail('Personagem ou PIN inválido. Peça seu PIN ao administrador.',401);
   await limits.deleteOne({_id:key});
   const token=crypto.randomBytes(32).toString('hex');
   await d.collection('wallet_sessions').insertOne({_id:hash(token),character,version:account.version,expiresAt:new Date(time+30*86400000)});
   return{token,character};
  },
  async logout(token){if(token)await(await db()).collection('wallet_sessions').deleteOne({_id:hash(token)});},
  async identity(token){return(await session(token)).character;},
  async get(token){const{d,character}=await session(token);return walletView(await d.collection('cofrinhos').findOne({_id:character}),character);},
  async purchase(token,itemId,requestId){
   const item=CATALOG.find(item=>item.id===itemId);
   if(!item||typeof requestId!=='string'||!/^[a-zA-Z0-9-]{16,80}$/.test(requestId))throw fail('Compra inválida.',400);
   const{d,character}=await session(token),records=d.collection('cofrinhos');
   const existing=walletView(await records.findOne({_id:character}),character);
   const replay=existing.history.find(p=>p.requestId===requestId);
   if(replay?.itemId===itemId)return existing;
   if(replay)throw fail('Identificador de compra já utilizado.',409);
   if(existing.owned.includes(itemId))throw fail('Essa melhoria já está comprada.',409);
   // Deposits, spending, ownership and audit entry live in the SAME document.
   // This conditional write serializes with existing deposit updates: no stale
   // balance read, no browser-supplied price, no multi-document transaction gap.
   const saved={$setIntersection:[{$ifNull:['$saved',[]]},Array.from({length:200},(_,i)=>i+1)]};
   const spent={$add:[{$max:[0,{$ifNull:['$spentCoins',0]}]},{$sum:{$map:{input:{$ifNull:['$wallet.purchases',[]]},as:'p',in:'$$p.price'}}}]};
   const result=await records.updateOne({_id:character,'wallet.purchases.itemId':{$ne:itemId},'wallet.purchases.requestId':{$ne:requestId},$expr:{$gte:[{$subtract:[{$sum:saved},spent]},item.price]}},{$push:{'wallet.purchases':{itemId,price:item.price,requestId,at:new Date()}},$set:{'wallet.updatedAt':new Date()}});
   const view=walletView(await records.findOne({_id:character}),character);
   if(!result.modifiedCount){
    const previous=view.history.find(p=>p.requestId===requestId);
    if(previous&&previous.itemId===itemId)return view;
    if(view.owned.includes(itemId))throw fail('Essa melhoria já está comprada.',409);
    if(previous)throw fail('Identificador de compra já utilizado.',409);
    throw fail('Moedas insuficientes. Nenhum depósito foi alterado.',409);
   }
   return view;
  },
  async equip(token,items){
   const{d,character}=await session(token),records=d.collection('cofrinhos'),view=walletView(await records.findOne({_id:character}),character);
   equipment(view.owned,items);
   await records.updateOne({_id:character},{$set:{'wallet.equipped':items,'wallet.updatedAt':new Date()}},{upsert:true});
   return walletView(await records.findOne({_id:character}),character);
  }
 };
}
module.exports={createWalletStore};
