'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {WebSocketServer,WebSocket}=require('ws');
const {MongoClient}=require('mongodb');

const PORT=Number(process.env.PORT)||3000;
const PUBLIC=path.join(__dirname,'public');
const NAMES=['Mary','Kaique','Jheniffer','Gustavo'];
const START_MONEY=1500;
const MAX_PLAYERS=4;
const TILE_DATA=[
 ['start','PARTIDA',0,'#caa5ff'],
 ['property','Vila Lilás',80,'#b58bff'],
 ['chance','SURPRESA',0,'#fed29b'],
 ['property','Centro Verde',100,'#56ce9d'],
 ['tax','IMPOSTO',100,'#ff9e8a'],
 ['property','Av. do Sol',120,'#ffbe76'],
 ['jail','VISITA À PRISÃO',0,'#c6b4ff'],
 ['property','Bairro Azul',140,'#7ecbff'],
 ['chance','SURPRESA',0,'#fed29b'],
 ['property','Lago Cristal',160,'#6cbff7'],
 ['station','ESTAÇÃO',180,'#d4b58a'],
 ['property','Jardim Rosa',200,'#fb97d1'],
 ['free','PRAÇA LIVRE',0,'#a8f0d8'],
 ['property','Arco-Íris',210,'#b1a1ff'],
 ['chance','SURPRESA',0,'#fed29b'],
 ['property','Parque Estelar',230,'#b896ff'],
 ['tax','TAXA MUNICIPAL',150,'#ff9e8a'],
 ['property','Praia da Lua',250,'#7cdeee'],
 ['gotojail','VÁ À PRISÃO',0,'#d9a4fe'],
 ['property','Mirante Neon',260,'#f7ab7c'],
 ['chance','SURPRESA',0,'#fed29b'],
 ['property','Praça Dourada',280,'#ecc779'],
 ['station','METRÔ CENTRAL',300,'#d4b58a'],
 ['property','Vila Imperial',320,'#ef9eaa']
];
const PROPS=new Set(['property','station']);
const TILES=TILE_DATA.map(([kind,name,price,color],id)=>({id,kind,name,price,color,
 rent:kind==='station'?Math.round(price*.30):Math.round(price*.16),
 upgrade:kind==='property'?Math.round(price*.55):0}));
const rooms=new Map();
const peers=new Map();
let mongo=null,collection=null;
let starting=Date.now();

const id=()=>crypto.randomUUID();
const code=()=>{
 let key; do{key=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(key));return key;
};
const rand=(n)=>crypto.randomInt(n);
const dice=()=>[rand(6)+1,rand(6)+1];
const record=(room,description)=>{room.history.push({at:Date.now(),text:String(description).slice(0,260)});room.history=room.history.slice(-65)};
const player=(room,pid)=>room.players.find(p=>p.id===pid);
const seatActive=(p)=>p&&!p.bankrupt;
const alive=(room)=>room.players.filter(seatActive);
const current=(room)=>room.players[room.turn];
const propsFor=(room,pid)=>Object.entries(room.owned).filter(([,o])=>o.player===pid).map(([i])=>Number(i));
const buildingCost=(tile)=>tile.upgrade;
const propertyValue=(room,pid)=>propsFor(room,pid).reduce((sum,i)=>{
 const o=room.owned[i],t=TILES[i];
 return sum+Math.round(t.price/2)+Math.round((o.houses||0)*t.upgrade/2);
},0);
const worth=(room,p)=>p.money+propertyValue(room,p.id);

function freshRoom(hostName) {
 const key=code(),owner={id:id(),name:hostName,money:START_MONEY,pos:0,jail:0,bankrupt:false,color:NAMES.indexOf(hostName),lastSeen:Date.now()};
 const room={code:key,hostId:owner.id,phase:'lobby',createdAt:Date.now(),updatedAt:Date.now(),
  players:[owner],owned:{},turn:0,turnCount:0,stage:'roll',pending:null,lastDice:null,
  history:[],maxTurns:150,winner:null,revision:1};
 record(room,hostName+' criou a sala.');
 rooms.set(key,room);
 return room;
}
function safe(room) {
 const {code,phase,createdAt,revision,turn,stage,pending,lastDice,winner,turnCount,maxTurns}=room;
 return{code,phase,createdAt,revision,turn,stage,pending,lastDice,winner,turnCount,maxTurns,tiles:TILES,
  players:room.players.map(p=>({id:p.id,name:p.name,money:p.money,pos:p.pos,jail:p.jail,bankrupt:p.bankrupt,color:p.color,connected:!![...peers.keys()].find(ws=>peers.get(ws)?.pid===p.id && peers.get(ws)?.room===code && ws.readyState===WebSocket.OPEN),worth:worth(room,p)})),
  owned:room.owned,history:room.history.slice(-20),hostId:room.hostId};
}
function send(ws,payload){if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify(payload))}
function broadcast(room) {
 const state=safe(room);
 for(const [ws,peer] of peers)if(peer.room===room.code)send(ws,{type:'state',state,me:peer.pid});
}
async function persist(room) {
 room.revision++;room.updatedAt=Date.now();
 if(collection)try{await collection.replaceOne({_id:room.code},{_id:room.code,...room},{upsert:true})}
 catch(e){console.error('[database] Save:',e.message.slice(0,130))}
 broadcast(room);
}
function throwGame(msg){const e=new Error(msg);e.game=true;throw e}
function check(room,pid,requireTurn=true){
 if(room.phase!=='playing')throwGame('A partida ainda não começou.');
 const p=player(room,pid);
 if(!p||p.bankrupt)throwGame('Você não está participando desta partida.');
 if(requireTurn && current(room)?.id!==pid)throwGame('Espere sua vez!');
 return p;
}
function canOwn(tile){return tile && PROPS.has(tile.kind)}
function nextTurn(room){
 const max=room.players.length;
 if(!alive(room).length){room.phase='finished';return}
 for(let a=1;a<=max;a++){
  const next=(room.turn+a)%max;
  if(seatActive(room.players[next])){room.turn=next;break}
 }
 room.stage='roll';room.pending=null;room.lastDice=null;room.turnCount++;
 if(alive(room).length===1||room.turnCount>=room.maxTurns){
  const remaining=alive(room).sort((a,b)=>worth(room,b)-worth(room,a));
  room.phase='finished';room.winner=remaining[0]?.id||null;
  record(room,'🏆 Fim da partida! Vencedor(a): '+(remaining[0]?.name||'sem vencedor')+'.');
 }else record(room,'Agora é a vez de '+current(room).name+'.');
}
function liquidation(room,p,needed){
 const indices=propsFor(room,p.id);
 for(const i of indices){
  if(p.money>=needed)break;
  const state=room.owned[i],tile=TILES[i];
  if(state.houses){p.money+=Math.round((tile.upgrade||0)*state.houses/2);state.houses=0}
 }
 for(const i of indices){
  if(p.money>=needed)break;
  const state=room.owned[i];if(state.mortgaged)continue;
  p.money+=Math.round(TILES[i].price/2);state.mortgaged=true;
 }
}
function settle(room,p,amount,to=null,reason='Pagamento'){
 amount=Math.max(0,Math.round(amount));
 if(!amount)return;
 liquidation(room,p,amount);
 const paid=Math.min(p.money,amount);
 p.money-=paid;
 if(to)to.money+=paid;
 record(room,p.name+' pagou R$ '+paid+' por '+reason+'.');
 if(paid<amount){
  p.bankrupt=true;p.money=0;
  for(const i of propsFor(room,p.id)){
   if(to){room.owned[i]={...room.owned[i],player:to.id,houses:0,mortgaged:false}}
   else delete room.owned[i];
  }
  record(room,'💥 '+p.name+' faliu e saiu da partida.');
 }
}
function landing(room,p,depth=0){
 if(p.bankrupt || depth>3){room.stage='done';return}
 const tile=TILES[p.pos];
 if(canOwn(tile)){
  const own=room.owned[tile.id];
  if(!own){room.pending={tileId:tile.id,pid:p.id};room.stage='buy';record(room,p.name+' chegou em '+tile.name+'. Comprar por R$ '+tile.price+'?');return}
  if(own.player!==p.id && !own.mortgaged){
   const owner=player(room,own.player);
   if(owner && !owner.bankrupt){
    const rent=Math.round(tile.rent*Math.pow(2,own.houses||0));
    settle(room,p,rent,owner,'aluguel de '+tile.name);
    record(room,'🏠 Aluguel de '+tile.name+': R$ '+rent+'.');
   }
  }
  room.stage='done';return;
 }
 if(tile.kind==='tax'){settle(room,p,tile.price,null,tile.name);room.stage='done';return}
 if(tile.kind==='gotojail'){p.pos=6;p.jail=1;record(room,p.name+' foi parar na prisão!');room.stage='done';return}
 if(tile.kind==='chance'){
  const cards=[
   {label:'Bônus da turma: receba R$ 150!',pay:150},
   {label:'Encontrou dinheiro na rua: receba R$ 70!',pay:70},
   {label:'Conta inesperada: pague R$ 90.',pay:-90},
   {label:'Seu vídeo viralizou: receba R$ 120!',pay:120},
   {label:'Reforma urgente: pague R$ 60.',pay:-60},
   {label:'Avance 3 casas!',move:3},
   {label:'Volte 2 casas!',move:-2},
   {label:'Vá para a PARTIDA e receba R$ 200!',go:0},
   {label:'Seus amigos te deram R$ 50!',pay:50}
  ];
  const card=cards[rand(cards.length)];
  record(room,'✨ '+p.name+': '+card.label);
  if(card.pay>0)p.money+=card.pay;
  else if(card.pay<0)settle(room,p,-card.pay,null,'carta surpresa');
  if(Number.isInteger(card.go)){p.pos=card.go;p.money+=200}
  if(card.move){const dest=(p.pos+card.move+TILES.length)%TILES.length;if(card.move>0 && dest<p.pos)p.money+=200;p.pos=dest}
  if(card.move||Number.isInteger(card.go))return landing(room,p,depth+1);
 }
 if(tile.kind==='free')record(room,'🌿 '+p.name+' descansou na Praça Livre.');
 room.stage='done';
}
function rollAction(room,p){
 if(room.stage!=='roll')throwGame('Resolva a jogada atual antes de lançar novamente.');
 const ds=dice();room.lastDice=ds;
 if(p.jail){p.jail=0;room.stage='done';record(room,p.name+' saiu da prisão após perder o turno.');return}
 const steps=ds[0]+ds[1],newPos=p.pos+steps;
 if(newPos>=TILES.length){p.money+=200;record(room,'💸 '+p.name+' passou pela partida e ganhou R$ 200.')}
 p.pos=newPos%TILES.length;
 record(room,'🎲 '+p.name+' tirou '+ds.join(' + ')+' e avançou '+steps+' casas.');
 landing(room,p);
}
function act(room,pid,msg){
 const action=String(msg.action||'');
 const p=check(room,pid,action!=='details');
 if(action==='roll'){rollAction(room,p);return}
 if(action==='buy'||action==='pass'){
  if(room.stage!=='buy'||room.pending?.pid!==pid)throwGame('Não há propriedade para decidir.');
  const tile=TILES[room.pending.tileId];
  if(action==='buy'){
   if(p.money<tile.price)throwGame('Você não tem dinheiro suficiente.');
   p.money-=tile.price;room.owned[tile.id]={player:pid,houses:0,mortgaged:false};
   record(room,'🏡 '+p.name+' comprou '+tile.name+' por R$ '+tile.price+'.');
  }else record(room,p.name+' não comprou '+tile.name+'.');
  room.pending=null;room.stage='done';return;
 }
 if(action==='upgrade'){
  const i=Number(msg.tileId),tile=TILES[i],o=room.owned[i];
  if(!o||o.player!==pid||!tile||!tile.upgrade||o.mortgaged)throwGame('Não é possível melhorar essa propriedade.');
  if(o.houses>=3)throwGame('Limite de 3 casas atingido.');
  if(p.money<tile.upgrade)throwGame('Saldo insuficiente para melhorar.');
  p.money-=tile.upgrade;o.houses++;record(room,'🔨 '+p.name+' construiu em '+tile.name+' ('+o.houses+'/3).');return;
 }
 if(action==='mortgage'||action==='redeem'){
  const i=Number(msg.tileId),tile=TILES[i],o=room.owned[i];
  if(!o||o.player!==pid||!tile)throwGame('Você não é dono dessa propriedade.');
  if(action==='mortgage'){
   if(o.mortgaged||o.houses)throwGame('Retire as casas antes de hipotecar.');
   o.mortgaged=true;p.money+=Math.round(tile.price/2);
   record(room,p.name+' hipotecou '+tile.name+'.');
  }else{
   const cost=Math.round(tile.price*.60);
   if(!o.mortgaged||p.money<cost)throwGame('Não pode quitar essa hipoteca agora.');
   p.money-=cost;o.mortgaged=false;record(room,p.name+' quitou a hipoteca de '+tile.name+'.');
  }return;
 }
 if(action==='end'){
  if(room.stage!=='done')throwGame('Role os dados e resolva a casa primeiro.');
  nextTurn(room);return;
 }
 if(action==='surrender'){
  p.bankrupt=true;p.money=0;
  for(const i of propsFor(room,pid))delete room.owned[i];
  record(room,p.name+' desistiu da partida.');
  nextTurn(room);return;
 }
 throwGame('Ação desconhecida.');
}
const staticSend=(res,status,body,type='application/json; charset=utf-8')=>{
 res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
 res.end(body);
};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname==='/api/health')return staticSend(res,200,JSON.stringify({ok:true,rooms:rooms.size,storage:collection?'mongodb':'memory'}));
 if(u.pathname==='/api/tiles')return staticSend(res,200,JSON.stringify(TILES));
 let file=u.pathname==='/c'?'index.html':u.pathname==='/index.html'||u.pathname==='/'?'index.html':u.pathname.slice(1);
 if(!/^(index\.html|app\.js|styles\.css|favicon\.svg)$/.test(file))return staticSend(res,404,'Not found','text/plain');
 const filepath=path.join(PUBLIC,file);
 fs.readFile(filepath,(err,content)=>{
  if(err)return staticSend(res,404,'Not found','text/plain');
  const ext=path.extname(file),type=ext==='.js'?'text/javascript; charset=utf-8':ext==='.css'?'text/css; charset=utf-8':ext==='.svg'?'image/svg+xml':'text/html; charset=utf-8';
  staticSend(res,200,content,type);
 });
});
const wss=new WebSocketServer({server,maxPayload:16384,perMessageDeflate:false});
wss.on('connection',ws=>{
 let strikes=0;
 ws.isAlive=true;
 ws.on('pong',()=>{ws.isAlive=true});
 ws.on('close',()=>{
  peers.delete(ws);
  for(const room of rooms.values())if(room.players.some(p=>peers.get(ws)?.room===room.code))broadcast(room);
 });
 ws.on('message',async raw=>{
  if(ws.readyState!==WebSocket.OPEN)return;
  let msg;
  try{msg=JSON.parse(String(raw))}catch{send(ws,{type:'error',message:'Mensagem inválida.'});return}
  try{
   if(!msg || typeof msg!=='object')throwGame('Mensagem inválida.');
   if(msg.type==='create'||msg.type==='join'||msg.type==='resume'){
    const selected=String(msg.name||'').trim();
    let room,p;
    if(msg.type==='create'){
     if(!NAMES.includes(selected))throwGame('Escolha um personagem da turma.');
     room=freshRoom(selected);p=room.players[0];
    }else{
     const roomCode=String(msg.room||'').trim().toUpperCase();
     room=rooms.get(roomCode);
     if(!room)throwGame('Sala não encontrada. Crie uma nova sala.');
     if(msg.type==='resume'){
      const token=String(msg.token||'');
      p=room.players.find(x=>x.token===token && token.length>=32);
      if(!p)throwGame('Sessão expirada. Entre novamente ou crie outra sala.');
     }else{
      if(room.phase!=='lobby')throwGame('A partida já começou. Só quem entrou pode se reconectar.');
      if(!NAMES.includes(selected)||room.players.some(x=>x.name===selected))throwGame('Personagem já ocupado ou inválido.');
      if(room.players.length>=MAX_PLAYERS)throwGame('Sala cheia.');
      p={id:id(),name:selected,money:START_MONEY,pos:0,jail:0,bankrupt:false,color:NAMES.indexOf(selected),lastSeen:Date.now()};
      room.players.push(p);record(room,selected+' entrou na sala.');
     }
    }
    if(!p.token)p.token=crypto.randomBytes(24).toString('hex');
    for(const [other,session] of peers)if(session.pid===p.id){send(other,{type:'notice',message:'Sua sessão foi aberta em outro dispositivo.'});peers.delete(other);other.close();}
    peers.set(ws,{room:room.code,pid:p.id});
    p.lastSeen=Date.now();
    send(ws,{type:'joined',room:room.code,token:p.token,me:p.id});
    await persist(room);return;
   }
   const peer=peers.get(ws);
   if(!peer)throwGame('Entre em uma sala primeiro.');
   const room=rooms.get(peer.room);
   if(!room)throwGame('A sala não está mais disponível.');
   if(room._locked)throwGame('Aguarde a ação anterior terminar.');
   room._locked=true;
   try{
    if(msg.type==='start'){
     if(peer.pid!==room.hostId)throwGame('Somente quem criou a sala pode começar.');
     if(room.phase!=='lobby'||room.players.length<2)throwGame('É preciso ter de 2 a 4 participantes.');
     room.phase='playing';room.turn=0;room.turnCount=0;room.stage='roll';room.pending=null;room.lastDice=null;room.owned={};room.winner=null;
     room.players.forEach(p=>{p.pos=0;p.money=START_MONEY;p.jail=0;p.bankrupt=false});
     record(room,'✨ A partida começou! Mary, Kaique, Jheniffer e Gustavo disputam a cidade.');
     await persist(room);
    }else if(msg.type==='restart'){
     if(peer.pid!==room.hostId)throwGame('Somente o anfitrião pode reiniciar.');
     if(room.phase!=='finished')throwGame('A partida ainda está acontecendo.');
     room.phase='lobby';room.owned={};room.winner=null;room.history=[];room.stage='roll';
     room.players.forEach(p=>{p.money=START_MONEY;p.pos=0;p.bankrupt=false;p.jail=0});
     record(room,'Nova partida preparada.');
     await persist(room);
    }else if(msg.type==='action'){
     act(room,peer.pid,msg);
     await persist(room);
    }else if(msg.type==='ping'){send(ws,{type:'pong'});}
    else throwGame('Ação não reconhecida.');
   }finally{room._locked=false}
  }catch(e){send(ws,{type:'error',message:e.game?e.message:'Não foi possível executar a jogada.'});if(!e.game)console.error('[game]',e.stack?.slice(0,900))}
 });
});
const keepAlive=setInterval(()=>{
 for(const ws of wss.clients){
  if(!ws.isAlive){ws.terminate();continue}
  ws.isAlive=false;ws.ping();
 }
 const now=Date.now();
 for(const [key,room] of rooms)if(now-room.updatedAt>36*3600_000 && ![...peers.values()].some(p=>p.room===key))rooms.delete(key);
},30000);
async function start(){
 if(process.env.MONGODB_URI){
  try{
   mongo=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:7000});
   await mongo.connect();
   collection=mongo.db('banco_da_turma_3d').collection('rooms');
   const stored=await collection.find({updatedAt:{$gt:Date.now()-36*3600_000}}).limit(250).toArray();
   for(const r of stored){delete r._id;rooms.set(r.code,r)}
   console.log('[mongodb] Salas recuperadas:',stored.length);
  }catch(e){console.error('[mongodb] Não conectado:',e.message);collection=null}
 }else console.warn('[storage] MONGODB_URI não definido. Salas em memória até reinício do serviço.');
 server.listen(PORT,'0.0.0.0',()=>console.log('[banco-3d] Online na porta '+PORT));
}
start();
process.on('SIGTERM',()=>{clearInterval(keepAlive);server.close();for(const s of wss.clients)s.close();mongo?.close().catch(()=>{})});
