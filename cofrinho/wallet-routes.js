'use strict';
const crypto=require('node:crypto');
const {CATALOG}=require('./catalog');
function equal(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length>=32&&x.length===y.length&&crypto.timingSafeEqual(x,y);}
function cookie(req){const value=(req.headers.cookie||'').split(';').find(c=>c.trim().startsWith('bp_wallet='));return value?.trim().slice(10)||'';}
function token(req){return req.headers.authorization?.replace(/^Bearer /,'')||cookie(req);}
function installWallet(app,wallet,{serviceKey=process.env.WALLET_SERVICE_KEY,adminKey=process.env.WALLET_ADMIN_KEY}={}){
 const run=handler=>async(req,res,next)=>{try{await handler(req,res);}catch(error){next(error);}};
 const adminAttempts=new Map();
 app.get('/api/shop/catalog',(_req,res)=>res.json({catalog:CATALOG}));
 app.post('/api/wallet/admin/pin',run(async(req,res)=>{
  const address=req.ip,t=Date.now(),entry=adminAttempts.get(address)||{count:0,until:t+900000};
  if(entry.until<t){entry.count=0;entry.until=t+900000;}
  entry.count++;adminAttempts.set(address,entry);
  if(adminAttempts.size>2000)for(const[k,v]of adminAttempts)if(v.until<t)adminAttempts.delete(k);
  if(entry.count>5)return res.status(429).json({error:'Aguarde 15 minutos antes de tentar novamente.'});
  if(!equal(req.headers['x-wallet-admin'],adminKey))return res.status(403).json({error:'Chave do administrador inválida.'});
  const result=await wallet.setPin(req.body.character,req.body.pin);adminAttempts.delete(address);res.json(result);
 }));
 app.post('/api/wallet/login',run(async(req,res)=>{
  const internal=equal(req.headers['x-wallet-service'],serviceKey);
  const result=await wallet.login(req.body.character,req.body.pin,internal?req.headers['x-wallet-address']||req.ip:req.ip);
  if(!internal)res.cookie('bp_wallet',result.token,{httpOnly:true,secure:process.env.NODE_ENV!=='test',sameSite:'strict',maxAge:30*86400000,path:'/'});
  res.json(internal?result:{character:result.character});
 }));
 app.post('/api/wallet/logout',run(async(req,res)=>{await wallet.logout(token(req));res.clearCookie('bp_wallet',{path:'/'});res.json({ok:true});}));
 app.get('/api/wallet',run(async(req,res)=>res.json(await wallet.get(token(req)))));
 app.post('/api/wallet/purchase',run(async(req,res)=>res.json(await wallet.purchase(token(req),req.body.itemId,req.body.requestId))));
 app.post('/api/wallet/equip',run(async(req,res)=>res.json(await wallet.equip(token(req),req.body.equipped))));
 return{token,async authorizeDeposit(req){const character=await wallet.identity(token(req));if(character!==req.body.character)throw Object.assign(new Error('Entre com o PIN desse personagem para alterar seus depósitos.'),{status:403});}};
}
module.exports={installWallet,cookie,equal};
