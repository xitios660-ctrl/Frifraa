'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const COMMANDS = new Set(['UP','DOWN','LEFT','RIGHT','OK','HOME','BACK','VOLUME_UP','VOLUME_DOWN','MUTE','YOUTUBE','NETFLIX','PLAY_PAUSE','SCREENSHOT','DIAGNOSE','STORAGE_SETTINGS','APP_SETTINGS','REQUEST_UNINSTALL']);
function diagnosticReport(value){
 if(!value || typeof value!=='object'||!Array.isArray(value.apps)||value.apps.length>100)return null;
 const result={};
 for(const key of ['capturedAt','storageTotal','storageFree','ramTotal','ramAvailable','visibleCount']){
  if(!Number.isSafeInteger(value[key])||value[key]<0)return null;result[key]=value[key];
 }
 if(result.storageFree>result.storageTotal||result.ramAvailable>result.ramTotal)return null;
 result.usageAccess=value.usageAccess===true;result.lowMemory=value.lowMemory===true;result.partial=value.partial===true;result.android=String(value.android||'').slice(0,30);result.apps=[];
 const seen=new Set();
 for(const app of value.apps){
  if(!app || typeof app.package!=='string'||!/^([A-Za-z][A-Za-z0-9_]*\.)+[A-Za-z0-9_]+$/.test(app.package)||app.package.length>200||seen.has(app.package)||typeof app.label!=='string')return null;
  seen.add(app.package);const row={package:app.package,label:app.label.slice(0,100),system:app.system===true,self:app.self===true};
  if(result.usageAccess && app.totalBytes!==undefined){
   for(const key of ['appBytes','dataBytes','cacheBytes','totalBytes']){if(!Number.isSafeInteger(app[key])||app[key]<0)return null;row[key]=app[key];}
   if(row.totalBytes!==row.appBytes+row.dataBytes||row.cacheBytes>row.dataBytes)return null;
  }
  result.apps.push(row);
 }
 return result;
}
const random = () => crypto.randomBytes(32).toString('hex');
const hash = value => crypto.createHash('sha256').update(String(value)).digest('hex');
function createServer({now = Date.now, pairTTL = 600000, sessionTTL = 86400000} = {}) {
 const devices = new Map(), sessions = new Map(), limits = new Map(), invitations = new Map();
 function prune() {
  const t=now();
  for(const [key,v] of invitations)if(v.expires<=t||!devices.has(v.id))invitations.delete(key);
  for(const d of devices.values()){if(d.screenshot && d.screenshot.expires<=t)d.screenshot=null;if(d.diagnostic && d.diagnostic.expires<=t)d.diagnostic=null;}
  for(const [id,d] of devices) if(t-d.last>sessionTTL) devices.delete(id);
  for(const [key,s] of sessions) if(s.expires<=t || !devices.has(s.id)) sessions.delete(key);
  for(const [key,l] of limits) if(l.until<=t) limits.delete(key);
 }
 const server=http.createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'https://tv-do-guh-ai.onrender.com','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));};
  try {
   prune();
   if(req.method==='OPTIONS')return reply(204,{});
   if(req.url==='/health' && req.method==='GET')return reply(200,{ok:true,version:'1.3.0',storage:'memory',restartRequiresPairing:true});
   if(req.headers.origin && req.headers.origin!=='https://tv-do-guh-ai.onrender.com')return reply(403,{error:'Origem não permitida'});
   // Use the socket peer, never an untrusted forwarded address, for the global
   // registration, pairing and support-redemption budgets.
   if(req.url==='/pair'||req.url==='/device/register'||req.url==='/support/redeem') {
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
    if(req.url==='/device/revoke'){d.diagnostic=null;d.screenshot=null;devices.delete(body.id);return reply(200,{ok:true});}
    if(req.url==='/device/ack') {
     if(!d.pending || d.pending.id!==body.commandId)return reply(409,{error:'Comando não pendente'});
     if(body.diagnostic!==undefined && body.image!==undefined)return reply(400,{error:'Envie apenas um tipo de diagnóstico'});
     if(body.diagnostic!==undefined){
      const report=diagnosticReport(body.diagnostic);
      if(d.pending.command!=='DIAGNOSE'||!d.diagnosticAllowed||body.ok!==true||!report)return reply(400,{error:'Diagnóstico inválido ou não autorizado'});
      const reportId=body.commandId;d.diagnostic={id:reportId,report,expires:now()+600000};
      const timer=setTimeout(()=>{if(d.diagnostic && d.diagnostic.id===reportId)d.diagnostic=null;},600000);timer.unref();
     }
     if(body.image!==undefined){
      if(d.pending.command!=='SCREENSHOT'||!d.screenshotAllowed||body.ok!==true||typeof body.image!=='string'||body.image.length>300000||!/^\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(body.image))return reply(400,{error:'Captura inválida ou não autorizada'});
      const shot={image:body.image,id:body.commandId,expires:now()+60000};d.screenshot=shot;
      const shotId=body.commandId;const timer=setTimeout(()=>{if(d.screenshot && d.screenshot.id===shotId)d.screenshot=null;},60000);timer.unref();
     }
     d.results.set(body.commandId,{...d.results.get(body.commandId),state:body.ok===true?'executed':'failed',message:String(body.message||'').slice(0,160)});d.pending=null;
     return reply(200,{ok:true});
    }
    if(req.url==='/device/poll') {
     d.diagnosticAllowed=body.diagnosticAllowed===true;if(!d.diagnosticAllowed)d.diagnostic=null;
     d.screenshotAllowed=body.screenshotAllowed===true;if(!d.screenshotAllowed)d.screenshot=null;
     if(d.pending && now()-d.pending.sent>15000){d.results.set(d.pending.id,{...d.results.get(d.pending.id),state:'failed',message:'TV não confirmou a execução'});d.pending=null;}
     let command=null;
     if(!d.pending)while(d.queue.length){const c=d.queue.shift();if(!sessions.has(c.sessionKey)){d.results.set(c.id,{...d.results.get(c.id),state:'failed',message:'Acesso expirado ou revogado antes da entrega'});continue;}if(now()-c.created>10000){d.results.set(c.id,{...d.results.get(c.id),state:'failed',message:'Comando expirou'});continue;}command={id:c.id,command:c.command,...(c.package?{package:c.package,confirmed:c.confirmed}:{})};d.pending={id:c.id,command:c.command,sent:now()};break;}
     return reply(200,{paired:d.paired,expired:!d.paired&&now()>=d.expires,command});
    }
   }
   if(req.url==='/pair' && req.method==='POST') {
    if(typeof body.code!=='string'||!/^\d{6}$/.test(body.code))return reply(400,{error:'Digite seis números'});
    const found=[...devices].find(([,d])=>d.code===body.code && now()<d.expires && !d.paired);
    if(!found)return reply(404,{error:'Código inválido, usado ou expirado'});
    const [id,d]=found;d.paired=true;d.code=null;const token=random();sessions.set(hash(token),{id,expires:now()+sessionTTL});return reply(200,{token,expiresIn:sessionTTL/1000});
   }
   if(req.url==='/support/redeem' && req.method==='POST'){
    if(typeof body.code!=='string')return reply(400,{error:'Código de assistência obrigatório'});
    const key=hash(body.code.replace(/-/g,'').trim().toUpperCase()),invite=invitations.get(key);
    if(!invite)return reply(404,{error:'Código inválido, usado ou expirado'});
    invitations.delete(key);const token=random();const expires=now()+300000;sessions.set(hash(token),{id:invite.id,expires,role:'support'});
    return reply(200,{token,expiresIn:300,scope:'temporary-support',instructions:'Somente durante atendimento ativo. Capturas e diagnósticos exigem autorização na TV. Não confirmar ações destrutivas; não há permissão de desinstalação.'});
   }
   const token=/^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization||'');
   const s=token && sessions.get(hash(token[1])),d=s&&devices.get(s.id);
   if(req.url==='/support' && req.method==='POST'){
    if(!d)return reply(401,{error:'Pareamento necessário'});
    if(s.role==='support')return reply(403,{error:'Somente o iPhone pode conceder ou revogar assistência'});
    if(!['create','cancel'].includes(body.action))return reply(400,{error:'Ação inválida'});
    for(const [key,value] of sessions)if(value.id===s.id&&value.role==='support')sessions.delete(key);
    for(const [key,value] of invitations)if(value.id===s.id)invitations.delete(key);
    if(body.action==='cancel')return reply(200,{ok:true});
    if(now()-d.last>=15000)return reply(409,{error:'TV desconectada'});
    const code=crypto.randomBytes(6).toString('hex').toUpperCase();invitations.set(hash(code),{id:s.id,expires:now()+300000});
    return reply(200,{code,expiresIn:300});
   }
   if(req.url==='/status' && req.method==='GET') {
    if(!d)return reply(401,{error:'Pareie novamente'});
    return reply(200,{online:now()-d.last<15000,supportActive:[...sessions.values()].some(value=>value.id===s.id&&value.role==='support'),supportExpiresIn:Math.max(0,...[...sessions.values()].filter(value=>value.id===s.id&&value.role==='support').map(value=>Math.ceil((value.expires-now())/1000))),screenshotAllowed:!!d.screenshotAllowed,diagnosticAllowed:!!d.diagnosticAllowed,results:Object.fromEntries(d.results)});
   }
   if(req.url==='/diagnostic'){
    if(!d)return reply(401,{error:'Pareamento necessário'});
    if(req.method==='POST'){d.diagnostic=null;return reply(200,{ok:true});}
    if(req.method==='GET'){
     if(!d.diagnostic)return reply(404,{error:'Diagnóstico indisponível ou expirado'});
     return reply(200,{...d.diagnostic,expiresIn:Math.max(0,Math.floor((d.diagnostic.expires-now())/1000))});
    }
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
    if(!d)return reply(401,{error:'Pareie novamente'});if(s.role==='support')return reply(403,{error:'Somente o iPhone pode desconectar a TV'});d.diagnostic=null;d.screenshot=null;devices.delete(s.id);return reply(200,{ok:true});
   }
   if(req.url==='/command' && req.method==='POST') {
    if(!d)return reply(401,{error:'Pareamento necessário'});
    if(now()-d.last>=15000)return reply(409,{error:'TV desconectada'});
    if(s.role==='support' && body.command==='REQUEST_UNINSTALL')return reply(403,{error:'Assistência não pode solicitar desinstalações'});
    if(!COMMANDS.has(body.command))return reply(400,{error:'Comando inválido'});
    if(['DIAGNOSE','APP_SETTINGS','REQUEST_UNINSTALL'].includes(body.command) && !d.diagnosticAllowed)return reply(403,{error:'Autorize diagnóstico de apps na TV por dez minutos'});
    if(body.command==='DIAGNOSE'){
     if(d.lastDiagnostic!==undefined && now()-d.lastDiagnostic<5000)return reply(429,{error:'Aguarde cinco segundos entre diagnósticos'});
     d.lastDiagnostic=now();d.diagnostic=null;
    }
    if(['APP_SETTINGS','REQUEST_UNINSTALL'].includes(body.command)){
     const app=d.diagnostic && d.diagnostic.report.apps.find(a=>a.package===body.package);
     if(!app || app.self)return reply(400,{error:'Escolha um app do diagnóstico atual'});
     if(body.command==='REQUEST_UNINSTALL' && (app.system||body.confirmed!==true))return reply(403,{error:'Confirmação necessária; apps do sistema são protegidos'});
    }
    if(body.command==='SCREENSHOT'){
     if(!d.screenshotAllowed)return reply(403,{error:'Autorize capturas na TV; no Android 9 use Teste Android 9: compartilhar tela'});
     if(d.lastShot!==undefined && now()-d.lastShot<5000)return reply(429,{error:'Aguarde cinco segundos entre capturas'});
     d.lastShot=now();d.screenshot=null;
    }
    if(d.queue.length>=10)return reply(429,{error:'Aguarde a execução dos comandos'});
    const id=random();d.queue.push({id,command:body.command,created:now(),sessionKey:hash(token[1]),...(['APP_SETTINGS','REQUEST_UNINSTALL'].includes(body.command)?{package:body.package,confirmed:body.confirmed===true}:{})});d.results.set(id,{state:'queued',command:body.command,actor:s.role==='support'?'support':'iphone'});
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
