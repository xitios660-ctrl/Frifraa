'use strict';
const tactics=require('./bots');
const crypto=require('node:crypto');
const providers=require('./bot-providers');
const GOALS=new Set(['attack','collect','break','protect']);
const clean=text=>String(text||'').replace(/[<>\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().slice(0,90);
function createController(options={}){
 const requested=options.provider??(options.enabled===true?'grok':process.env.BOT_AI_PROVIDER||'local');
 const provider=['grok','gemini'].includes(requested)?requested:'local';
 const apiKey=options.apiKey??(provider==='gemini'?process.env.GEMINI_API_KEY:process.env.XAI_API_KEY);
 const enabled=options.enabled??provider!=='local';
 const model=options.model||(provider==='gemini'?process.env.GEMINI_MODEL||'gemini-3.1-flash-lite':process.env.XAI_MODEL||'grok-4.7');
 const fetchImpl=options.fetchImpl||globalThis.fetch;
 const timeoutMs=options.timeoutMs||(provider==='gemini'?6000:2500),intervalMs=options.intervalMs||(provider==='gemini'?60000:10000),maxCalls=options.maxCalls||(provider==='gemini'?4:12);
 const budget=providers.createBudget({perMinute:provider==='gemini'?4:12,perDay:provider==='gemini'?60:200});
 let remoteState=enabled&&apiKey?'ready':'local',pauseUntil=0,successfulReplies=0,lastSuccessAt=null;
 function status(){return{provider:enabled&&apiKey?provider:'local',configured:!!apiKey,enabled:!!enabled,state:remoteState,model:enabled&&apiKey?model:null,successfulReplies,lastSuccessAt,...budget.status()};}
 function remember(mind,event){mind.memory.push(clean(event));if(mind.memory.length>6)mind.memory.shift();}
 function say(room,p,text,t,kind='think',toId=null,source='local',force=false){
  text=clean(text);if(!text)return;
  const m=p.botMind;if(!m)return;
  if(!force&&p.botSpeech?.until>t&&(p.botSpeech.text===text||t-(m.spokeAt||0)<2200))return;
  p.botSpeech={text,kind:kind==='say'?'say':'think',toId,source,until:t+5200};m.spokeAt=t;
  if(kind==='say'){
   room.botChat??=[];room.botChat.push({fromId:p.id,toId,text,at:t});if(room.botChat.length>8)room.botChat.shift();
  }
 }
 function ensure(room,p,t){
  if(p.botMind)return p.botMind;
  p.botMind={personality:['ousado','estrategista','colecionador','protetor'][p.slot%4],goal:'collect',targetId:null,allyId:null,relations:{},memory:[],seenBombs:new Set(),nextObserve:0,nextPlan:0,nextCall:t+p.slot*600,calls:0,spokeAt:0};
  return p.botMind;
 }
 function cancelPlayer(p){const pending=p.botMind?.pending;if(pending){pending.cancelled=true;pending.abort();}}
 function cancelRoom(room){for(const p of room.players.values())cancelPlayer(p);}
 function reset(room,t){cancelRoom(room);room.botRoundToken=crypto.randomUUID();room.botChat=[];for(const p of room.players.values())if(p.bot){p.botMind=null;p.botSpeech=null;p.botIntent=null;ensure(room,p,t);}}
 function friendship(room,p,id,t){
  const m=p.botMind,friend=room.players.get(id);
  if(!friend?.alive||id===p.id||[...room.players.values()].filter(o=>o.alive).length<3)return false;
  m.allyId=id;m.relations[id]=Math.max(25,m.relations[id]||0);remember(m,`Trégua com ${friend.name}.`);
  if(friend.bot){const fm=ensure(room,friend,t);if(!fm.allyId&&(fm.relations[p.id]||0)>=0){fm.allyId=p.id;fm.relations[p.id]=25;say(room,friend,`${p.name.replace(/^Bot /,'')}, combinado!`,t,'say',p.id);}}
  return true;
 }
 function observe(room,p,t){
  const m=p.botMind,alive=[...room.players.values()].filter(o=>o.alive);
  if(m.allyId&&(!room.players.get(m.allyId)?.alive||alive.length<=2)){
   m.allyId=null;m.goal='attack';say(room,p,'Agora é cada um por si!',t,'say',null,'local',true);
  }
  for(const b of room.bombs){
   if(!b.id||b.ownerId===p.id||m.seenBombs.has(b.id)||!tactics.blast(room.board,b).some(c=>Math.abs(c.x-p.x)<1&&Math.abs(c.y-p.y)<1))continue;
   m.seenBombs.add(b.id);if(m.seenBombs.size>80)m.seenBombs.delete(m.seenBombs.values().next().value);
   const owner=room.players.get(b.ownerId);if(!owner)continue;
   m.relations[owner.id]=(m.relations[owner.id]||0)-45;m.targetId=owner.id;
   remember(m,`${owner.name} me ameaçou com uma bomba.`);
   if(m.allyId===owner.id){m.allyId=null;say(room,p,`${owner.name.replace(/^Bot /,'')}, acabou a trégua!`,t,'say',owner.id,'local',true);}
  }
  if(p.botIntent==='escape')say(room,p,'Preciso sair dessa explosão!',t);
  else if(p.botIntent==='bomb')say(room,p,'Bomba no caminho! Sai daí!',t,'say');
 }
 function localPlan(room,p,t){
  const m=p.botMind,alive=[...room.players.values()].filter(o=>o.alive&&o.id!==p.id);
  const candidates=alive.filter(o=>o.id!==m.allyId);
  candidates.sort((a,b)=>((m.relations[a.id]||0)-(m.relations[b.id]||0))||((Math.abs(a.x-p.x)+Math.abs(a.y-p.y))-(Math.abs(b.x-p.x)+Math.abs(b.y-p.y))));
  m.targetId=candidates[0]?.id||null;
  const goodItems=[...room.powerups.values()].some(type=>type!=='curse');
  m.goal=p.bombs<2&&goodItems?'collect':m.personality==='colecionador'&&goodItems?'collect':m.personality==='protetor'&&m.allyId?'protect':m.personality==='estrategista'&&p.range<4?'break':'attack';
  if(t-(m.createdAt??=t)>11000&&!m.allyId&&alive.length>=2){
   const friend=alive.filter(o=>(m.relations[o.id]||0)>=0).sort((a,b)=>Math.abs(a.x-p.x)+Math.abs(a.y-p.y)-Math.abs(b.x-p.x)-Math.abs(b.y-p.y))[0];
   if(friend&&friendship(room,p,friend.id,t))say(room,p,`${friend.name.replace(/^Bot /,'')}, vamos de trégua?`,t,'say',friend.id,'local',true);
  }
  const target=room.players.get(m.targetId);
  const text=m.goal==='collect'?'Vou buscar um poder.':m.goal==='break'?'Vou abrir esse caminho.':m.goal==='protect'?'Vou cobrir meu parceiro.':target?`${target.name.replace(/^Bot /,'')}, vou te alcançar!`:'Vou procurar uma saída.';
  say(room,p,text,t,m.goal==='attack'?'say':'think',m.goal==='attack'?target?.id:null);
 }
 function snapshot(room,p,t){
  const m=p.botMind;
  return{you:{id:p.id,name:p.name,personality:m.personality,x:p.x,y:p.y,bombs:p.bombs,range:p.range,goal:m.goal,targetId:m.targetId,allyId:m.allyId},
   players:[...room.players.values()].map(o=>({id:o.id,name:o.name,bot:!!o.bot,alive:o.alive,x:Math.round(o.x),y:Math.round(o.y),range:o.range,kills:o.kills,relation:m.relations[o.id]||0})),
   board:room.board.map(row=>row.join('')).join('\n'),legend:'0=livre,1=parede,2=caixa',
   bombs:room.bombs.map(b=>({x:b.x,y:b.y,ownerId:b.ownerId,range:b.range,remainingMs:Math.max(0,b.explodeAt-t)})),
   items:[...room.powerups].slice(0,20).map(([tile,type])=>({tile,type})),
   closureInMs:room.collapse?Math.max(0,room.collapse.startsAt-t):null,memory:[...m.memory],conversation:(room.botChat||[]).slice(-5).map(({fromId,toId,text})=>({fromId,toId,text}))};
 }
 function applyPlan(room,p,raw,t){
  if(!raw||typeof raw!=='object'||!GOALS.has(raw.goal))return false;
  const m=p.botMind,valid=id=>id!==p.id&&room.players.get(id)?.alive;
  m.goal=raw.goal;m.targetId=valid(raw.targetId)?raw.targetId:null;
  if(raw.relation==='friend'&&valid(raw.relationId))friendship(room,p,raw.relationId,t);
  if(raw.relation==='rival'&&valid(raw.relationId)){m.relations[raw.relationId]=-60;m.targetId=raw.relationId;if(m.allyId===raw.relationId)m.allyId=null;}
  if(m.targetId===m.allyId)m.targetId=null;
  if(m.goal==='protect'&&!m.allyId)m.goal='attack';
  remember(m,`Plano ${m.goal}${m.targetId?` contra ${room.players.get(m.targetId).name}`:''}.`);
  say(room,p,raw.message,t,raw.kind,valid(raw.toId)?raw.toId:null,provider,true);return true;
 }
 async function request(room,p,t){
  const m=p.botMind,token=room.botRoundToken,abort=new AbortController();m.pending=abort;m.calls++;m.nextCall=t+intervalMs;
  const timer=setTimeout(()=>abort.abort(),timeoutMs);
  try{
   const spec=providers.buildRequest(provider,apiKey,model,snapshot(room,p,t));
   const response=await fetchImpl(spec.url,{method:'POST',signal:abort.signal,headers:spec.headers,body:JSON.stringify(spec.body)});
   if(!response.ok){remoteState=response.status===401||response.status===403?'auth-error':response.status===402?'credits-required':response.status===429?'rate-limited':response.status===404?'model-unavailable':'unavailable';pauseUntil=Date.now()+(response.status===429?60000:30000);return;}
   const plan=providers.parseResponse(provider,await response.json());
   if(room.phase!=='playing'||room.botRoundToken!==token||room.players.get(p.id)!==p||!p.alive||p.botMind!==m)return;
   if(applyPlan(room,p,plan,Date.now())){m.remoteUntil=Date.now()+intervalMs+3000;remoteState='ready';successfulReplies++;lastSuccessAt=Date.now();}
  }catch{if(!abort.cancelled&&(!abort.signal.aborted||room.phase==='playing')){remoteState=abort.signal.aborted?'timeout':'unavailable';pauseUntil=Date.now()+30000;}}
  finally{clearTimeout(timer);if(p.botMind===m)m.pending=null;}
 }
 function tick(room,t){
  for(const p of room.players.values()){
   if(!p.bot||!p.alive)continue;
   const m=ensure(room,p,t);
   if(t>=m.nextObserve){observe(room,p,t);m.nextObserve=t+400;}
   if(t>=m.nextPlan&&!(m.remoteUntil>t)){localPlan(room,p,t);m.nextPlan=t+4500;}
   if(enabled&&apiKey&&!m.pending&&m.calls<maxCalls&&t>=m.nextCall&&t>=pauseUntil){
    const limit=budget.take(t);if(limit){if(remoteState!=='rate-limited')remoteState=limit;m.nextCall=t+1000;}else void request(room,p,t);
   }
  }
 }
 return{status,reset,cancelPlayer,cancelRoom,tick,ensure,say,applyPlan,snapshot,friendship};
}
module.exports={createController};
