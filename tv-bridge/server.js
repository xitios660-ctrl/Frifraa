const http=require('http'),crypto=require('crypto');
const devices=new Map(), sessions=new Map();
const json=(res,status,obj)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','access-control-allow-origin':'https://tv-do-guh-ai.onrender.com','access-control-allow-headers':'content-type,authorization','access-control-allow-methods':'GET,POST,OPTIONS','cache-control':'no-store'});res.end(JSON.stringify(obj));};
const random=()=>crypto.randomBytes(24).toString('hex');
function prune(){for(const [k,v] of devices){if(Date.now()-v.last>86400000)devices.delete(k)}for(const [k,v] of sessions){if(!devices.has(v.id))sessions.delete(k)}}
const server=http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS')return json(res,200,{});
 if(req.url==='/health')return json(res,200,{ok:true});
 let body={};if(req.method==='POST'){let s='';for await(const chunk of req){s+=chunk;if(s.length>2048)return json(res,413,{error:'large'})}try{body=JSON.parse(s)}catch{return json(res,400,{error:'json'})}}
 prune();
 if(req.url==='/device/register'&&req.method==='POST'){const id=random(),secret=random(),code=String(crypto.randomInt(100000,1000000));devices.set(id,{secret,code,last:Date.now(),paired:false,queue:[]});return json(res,200,{id,secret,code,expiresIn:600})}
 if(req.url==='/device/poll'&&req.method==='POST'){const d=devices.get(body.id);if(!d||d.secret!==body.secret)return json(res,401,{error:'auth'});d.last=Date.now();const command=d.queue.shift()||null;return json(res,200,{paired:d.paired,command})}
 if(req.url==='/pair'&&req.method==='POST'){const d=[...devices].find(([id,v])=>v.code===String(body.code)&&Date.now()-v.last<600000&&!v.paired);if(!d)return json(res,404,{error:'Código inválido ou expirado'});d[1].paired=true;d[1].code=null;const token=random();sessions.set(token,{id:d[0]});return json(res,200,{token})}
 if(req.url==='/command'&&req.method==='POST'){const token=(req.headers.authorization||'').replace(/^Bearer /,'');const s=sessions.get(token),d=s&&devices.get(s.id);if(!d||!d.paired)return json(res,401,{error:'pareamento necessário'});const allowed=['HOME','BACK','VOLUME_UP','VOLUME_DOWN','MUTE','YOUTUBE','NETFLIX','PLAY_PAUSE'];if(!allowed.includes(body.command))return json(res,400,{error:'comando inválido'});if(d.queue.length>=20)return json(res,429,{error:'fila cheia'});d.queue.push(body.command);return json(res,200,{queued:true})}
 return json(res,404,{error:'not found'});
});
server.listen(process.env.PORT||3000);