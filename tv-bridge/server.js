'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const COMMANDS = new Set(['UP','DOWN','LEFT','RIGHT','OK','HOME','BACK','VOLUME_UP','VOLUME_DOWN','MUTE','YOUTUBE','NETFLIX','PLAY_PAUSE','SCREENSHOT']);
const random = () => crypto.randomBytes(32).toString('hex');
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
function createServer({now = Date.now, pairTTL = 600000, sessionTTL = 86400000} = {}) {
 const devices = new Map(), sessions = new Map(), limits = new Map();
 function prune() {
  const t=now();
  for(const d of devices.values())if(d.screenshot && d.screenshot.expires<=t)d.screenshot=null;
  for(const [id,d] of devices) if(t-d.last>sessionTTL) devices.delete(id);
  for(const [key,s] of sessions) if(s.expires<=t || !devices.has(s.id)) sessions.delete(key);
  for(const [key,l] of limits) if(l.until<=t) limits.delete(key);
 }
 const server=http.createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'https://tv-do-guh-ai.onrender.com','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try {
   prune();
   if(req.method==='OPTIONS')return reply(204,{});
   if(req.url==='/health' && req.method==='GET')return reply(200,{ok:true,version:'1.1.0',storage:'memory',restartRequiresPairing:true});
   if(req.headers.origin && req.headers.origin!=='https://tv-do-guh-ai.onrender.com')return reply(403,{error:'Origem não permitida'});
   // Use the socket peer, never an untrusted forwarded address, for the global
   // registration/pairing budget. Per-code and per-token budgets apply as well.
   if(req.url==='/pair'||req.url==='/device/register') {
    const key=req.url+':'+req.socket.remoteAddress;
    const l=limits.get(key)||{count:0,until:now()+60000};limits.set(key,l);
    if(++l.count>30)return reply(429,{error:'Muitas tentativas. Aguarde um minuto.'});
   }
   let body={};
   if(req.method==='POST') {
    let size=0,chunks=[];
    for await(const chunk of req){size+=chunk.length;if(size>(req.url==='/device/ack'?350000:4096)){reply(413,{error:'Corpo muito grande'});req.resume();return;}chunks.push(chunk);}
    try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'JSON inválido'});}
    if(!body || typeof body!=='object' || Array.isArray(body))return reply(400,{error:'Objeto JSON obrigatório'});
   }
   if(req.url==='/device/register' && req.method==='POST') {
    if(devices.size>=1000)return reply(503,{error:'Capacidade atingida'});
    const id=random(),secret=random();let code;
    do{code=String(crypto.randomInt(100000,1000000));}while([...devices.values()].some(d=>d.code===code));
    devices.set(id,{secret:hash(secret),code,expires:now()+pairTTL,last:now(),paired:false,queue:[],results:new Map(),pending:null});
    return reply(200,{id,secret,code,expiresIn:pairTTL/1000});
   }
   if(req.url.startsWith('/device/') && req.method==='POST') {
    const d=devices.get(body.id);
    if(!d||d.secret!==hash(body.secret))return reply(401,{error:'Dispositivo não autenticado'});
    d.last=now();
    if(req.url==='/device/revoke'){devices.delete(body.id);return reply(200,{ok:true});}
    if(req.url==='/device/ack') {
     if(!d.pending || d.pending.id!==body.commandId)return reply(409,{error:'Comando não pendente'});
     if(body.image!==undefined){
      if(d.pending.command!=='SCREENSHOT'||!d.screenshotAllowed||body.ok!==true||typeof body.image!=='string'||body.image.length>300000||!/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(body.image))return reply(400,{error:'Captura inválida ou não autorizada'});
      const shot={image:body.image,id:body.commandId,expires:now()+60000};d.screenshot=shot;
      const shotId=body.commandId;const timer=setTimeout(()=>{if(d.screenshot && d.screenshot.id===shotId)d.screenshot=null;},60000);timer.unref();
     }
     d.results.set(body.commandId,{state:body.ok===true?'executed':'failed',message:String(body.message||'').slice(0,160)});d.pending=null;
     return reply(200,{ok:true});
    }
    if(req.url==='/device/poll') {
     d.screenshotAllowed=body.screenshotAllowed===true;if(!d.screenshotAllowed)d.screenshot=null;
     if(d.pending && now()-d.pending.sent>15000){d.results.set(d.pending.id,{state:'failed',message:'TV não confirmou a execução'});d.pending=null;}
     let command=null;
     if(!d.pending)while(d.queue.length){const c=d.queue.shift();if(now()-c.created>10000){d.results.set(c.id,{state:'failed',message:'Comando expirou'});continue;}command={id:c.id,command:c.command};d.pending={id:c.id,command:c.command,sent:now()};break;}
     return reply(200,{paired:d.paired,expired:!d.paired&&now()>=d.expires,command});
    }
   }
   if(req.url==='/pair' && req.method==='POST') {
    if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))return reply(400,{error:'Digite seis números'});
    const found=[...devices].find(([,d])=>d.code===body.code && now()<d.expires && !d.paired);
    if(!found)return reply(404,{error:'Código inválido, usado ou expirado'});
    const [id,d]=found;d.paired=true;d.code=null;const token=random();sessions.set(hash(token),{id,expires:now()+sessionTTL});return reply(200,{token,expiresIn:sessionTTL/1000});
   }
   const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'');
   const s=token && sessions.get(hash(token[1])),d=s&&devices.get(s.id);
   if(req.url==='/status' && req.method==='GET') {
    if(!d)return reply(401,{error:'Pareie novamente'});
    return reply(200,{online:now()-d.last<15000,screenshotAllowed:!!d.screenshotAllowed,results:Object.fromEntries(d.results)});
   }
   if(req.url==='/screenshot') {
    if(!d)return reply(401,{error:'Pareamento necessário'});
    if(req.method==='POST'){d.screenshot=null;return reply(200,{ok:true});}
    if(req.method==='GET'){
     if(!d.screenshot)return reply(404,{error:'Captura indisponível ou expirada'});
     return reply(200,{id:d.screenshot.id,image:'data:image/jpeg;base64,'+d.screenshot.image,expiresIn:Math.max(0,Math.floor((d.screenshot.expires-now())/1000))});
    }
   }
   if(req.url==='/unpair' && req.method==='POST') {
    if(!d)return reply(401,{error:'Pareie novamente'});devices.delete(s.id);return reply(200,{ok:true});
   }
   if(req.url==='/command' && req.method==='POST') {
    if(!d)return reply(401,{error:'Pareamento necessário'});
    if(now()-d.last>=15000)return reply(409,{error:'TV desconectada'});
    if(!COMMANDS.has(body.command))return reply(400,{error:'Comando inválido'});
    if(body.command==='SCREENSHOT'){
     if(!d.screenshotAllowed)return reply(403,{error:'Ative o diagnóstico visual na TV (Android 11 ou superior)'});
     if(d.lastShot!==undefined && now()-d.lastShot<5000)return reply(429,{error:'Aguarde cinco segundos entre capturas'});
     d.lastShot=now();d.screenshot=null;
    }
    if(d.queue.length>=10)return reply(429,{error:'Aguarde a execução dos comandos'});
    const id=random();d.queue.push({id,command:body.command,created:now()});d.results.set(id,{state:'queued'});
    while(d.results.size>50)d.results.delete(d.results.keys().next().value);
    return reply(202,{id,state:'queued'});
   }
   return reply(404,{error:'Rota não encontrada'});
  }catch(e){if(!res.headersSent)reply(500,{error:'Erro interno'});else res.end();}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 return server;
}
if(require.main===module)createServer().listen(Number(process.env.PORT)||3000,'0.0.0.0');
module.exports={createServer};
