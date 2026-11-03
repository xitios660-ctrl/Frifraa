'use strict';
const CHARACTERS=['mary','kaique','jheniffer','gustavo'];
const UPGRADES={bomb2:{bombs:2},bomb3:{bombs:3},fire2:{range:2},fire3:{range:3},speed2:{speedLevel:2},speed3:{speedLevel:3},life2:{lives:2},shield:{shield:1}};
function benefits(wallet,skinIndex){
 const result={bombs:1,range:1,speedLevel:1,lives:1,shield:0};
 if(!wallet||wallet.character!==CHARACTERS[skinIndex])return result;
 for(const id of wallet.equipped||[])if(wallet.owned?.includes(id))for(const[key,value]of Object.entries(UPGRADES[id]||{}))result[key]=Math.max(result[key],value);
 return result;
}
function cookie(req){return(req.headers.cookie||'').split(';').find(v=>v.trim().startsWith('bp_wallet='))?.trim().slice(10)||'';}
function createIntegration(clients,{url=process.env.COFRINHO_URL||'https://cofrinho-bomba-party.onrender.com',key=process.env.WALLET_SERVICE_KEY}={}){
 async function request(path,token,body,address){
  if(!key)throw Object.assign(new Error('A carteira ainda não está configurada. O jogo continua disponível.'),{status:503});
  const response=await fetch(`${url}${path}`,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json','x-wallet-service':key,...(token?{authorization:`Bearer ${token}`} :{}),...(address?{'x-wallet-address':address}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000),redirect:'error'});
  const data=await response.json();
  if(!response.ok)throw Object.assign(new Error(data.error||'Carteira indisponível.'),{status:response.status});
  return data;
 }
 async function loadPlayer(p){
  if(!p.ws.walletToken)return null;
  const wallet=await request('/api/wallet',p.ws.walletToken);
  return wallet.character===CHARACTERS[p.skinIndex]?wallet:null;
 }
 async function handle(req,res){
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(!pathname.startsWith('/api/wallet')&&pathname!=='/api/shop/catalog')return false;
  const json=(status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(data));};
  try{
   if(!['GET','POST'].includes(req.method))throw Object.assign(new Error('Método inválido.'),{status:405});
   if(req.method==='POST'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)throw Object.assign(new Error('Origem não autorizada.'),{status:403});
   let body;
   if(req.method==='POST'){
    if(!req.headers['content-type']?.startsWith('application/json'))throw Object.assign(new Error('Envie JSON.'),{status:415});
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>2048)throw Object.assign(new Error('Pedido muito grande.'),{status:413});}
    try{body=JSON.parse(raw);}catch{throw Object.assign(new Error('JSON inválido.'),{status:400});}
    if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(new Error('Pedido inválido.'),{status:400});
   }
   const token=cookie(req),secure=req.headers['x-forwarded-proto']==='https'||req.socket.encrypted;
   const setCookie=value=>`bp_wallet=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value?2592000:0}${secure?'; Secure':''}`;
   if(pathname==='/api/wallet/login'&&req.method==='POST'){
    const address=(req.headers['x-forwarded-for']||req.socket.remoteAddress||'').split(',').at(-1).trim();
    const result=await request(pathname,null,{character:body.character,pin:body.pin},address);
    json(200,{character:result.character},{'set-cookie':setCookie(result.token)});return true;
   }
   if(pathname==='/api/wallet/link'&&req.method==='POST'){
    const ws=[...clients].find(ws=>ws.playerId===body.playerId&&ws.walletLink===body.walletLink);
    if(!ws)throw Object.assign(new Error('Reconecte ao jogo para vincular a carteira.'),{status:403});
    const wallet=await request('/api/wallet',token);
    ws.walletToken=token;ws.walletCharacter=wallet.character;
    json(200,wallet);return true;
   }
   if(pathname==='/api/wallet/logout'&&req.method==='POST'){
    await request(pathname,token,{});
    for(const ws of clients)if(ws.walletToken===token){ws.walletToken=null;ws.walletCharacter=null;}
    json(200,{ok:true},{'set-cookie':setCookie('')});return true;
   }
   const allowed=(req.method==='GET'&&['/api/wallet','/api/shop/catalog'].includes(pathname))||(req.method==='POST'&&['/api/wallet/purchase','/api/wallet/equip'].includes(pathname));
   if(!allowed)throw Object.assign(new Error('Rota não encontrada.'),{status:404});
   const payload=pathname.endsWith('/purchase')?{itemId:body.itemId,requestId:body.requestId}:pathname.endsWith('/equip')?{equipped:body.equipped}:undefined;
   json(200,await request(pathname,token,payload));
  }catch(error){json(error.status||503,{error:error.status?error.message:'Não foi possível consultar o cofrinho. Tente novamente.'});}
  return true;
 }
 return{handle,loadPlayer,request};
}
module.exports={createIntegration,benefits,CHARACTERS};
