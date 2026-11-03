'use strict';
// Bomba Party coins are arcade credits based on marked Cofrinho entries,
// NOT a payment provider, transaction confirmation or redeemable currency.
const CHARACTERS=['mary','kaique','jheniffer','gustavo'];
const CHARACTER_BY_SKIN=Object.freeze(CHARACTERS);
const UPGRADE_IDS=new Set(['bomb','range','speed','life','shield','kick','push']);
function characterForSkin(index){return Number.isInteger(index)&&index>=0&&index<CHARACTERS.length?CHARACTERS[index]:null}
function starterFor(wallet){
 const u=wallet?.upgrades||{};
 const clamp=(name,max)=>Math.max(0,Math.min(max,Number.isInteger(u[name])?u[name]:0));
 return {bomb:clamp('bomb',3),range:clamp('range',4),speed:clamp('speed',2),
  life:clamp('life',2),shield:clamp('shield',1),kick:clamp('kick',1),push:clamp('push',1)};
}
function createCoinShop({
 endpoint=process.env.COFRINHO_GAME_URL||'https://cofrinho-bomba-party.onrender.com',
 secret=process.env.COFRINHO_GAME_KEY||''
}={}){
 const ready=()=>Boolean(secret && /^https:\/\//.test(endpoint));
 const call=async(path,body)=>{
  if(!ready())throw new Error('Loja indisponível: conexão segura com o Cofrinho não configurada.');
  const url=endpoint.replace(/\/$/,'')+path;
  const headers={'x-bomberman-game-key':secret,accept:'application/json'};
  if(body!==undefined)headers['content-type']='application/json';
  const res=await fetch(url,{method:body===undefined?'GET':'POST',headers,
    ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(25000)});
  let data;
  try{data=await res.json()}catch{throw new Error('O Cofrinho não retornou uma resposta válida.')}
  if(!res.ok)throw new Error(String(data.error||'Falha ao consultar o Cofrinho.').slice(0,180));
  return data;
 };
 return {
  enabled:ready,
  getWallet:character=>{if(!CHARACTERS.includes(character))throw new Error('Personagem inválido.');return call('/api/game-wallet/'+character)},
  purchase:(character,upgrade,purchaseId)=>{
   if(!CHARACTERS.includes(character)||!UPGRADE_IDS.has(upgrade))throw new Error('Melhoria inválida.');
   return call('/api/game-wallet/purchase',{character,upgrade,purchaseId});
  }
 };
}
module.exports={CHARACTER_BY_SKIN,characterForSkin,starterFor,createCoinShop};
