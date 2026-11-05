'use strict';
const crypto=require('node:crypto');
const {CATALOG,equipment,walletView}=require('./catalog');
const PEOPLE=['mary','kaique','jheniffer','gustavo'];
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const fail=(message,status)=>Object.assign(new Error(message),{status});
function createWalletStore(database,{prefix=''}={}){
 if(!/^(qa_[a-f0-9]{16}_)?$/.test(prefix))throw new Error('Prefixo de verificação inválido.');
 let indexes;
 async function db(){
  const source=await database(),value={collection:name=>source.collection(prefix+name)};
  indexes??=value.collection('wallet_sessions').createIndex({expiresAt:1},{expireAfterSeconds:0}).catch(error=>{indexes=null;throw error;});
  await indexes;return value;
 }
 async function session(token){
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw fail('Escolha seu personagem para abrir a carteira.',401);
  const d=await db(),s=await d.collection('wallet_sessions').findOne({_id:hash(token),expiresAt:{$gt:new Date()}});
  if(!s)throw fail('Sua sessão expirou. Entre novamente.',401);
  const account=await d.collection('wallet_accounts').findOne({_id:s.character});
  if(!account||account.version!==s.version)throw fail('Sua sessão expirou. Escolha o personagem novamente.',401);
  return{d,character:s.character};
 }
 return{
   async login(character){
    if(!PEOPLE.includes(character))throw fail('Escolha um personagem válido.',400);
    const d=await db(),accounts=d.collection('wallet_accounts'),time=Date.now();
    // No password or PIN: the selected character is the wallet identity.
    // Keep existing account versions so balances and earlier sessions survive.
    await accounts.updateOne({_id:character},{$setOnInsert:{version:1,createdAt:new Date()}},{upsert:true});
    const account=await accounts.findOne({_id:character});
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
