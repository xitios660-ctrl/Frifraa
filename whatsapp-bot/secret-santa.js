'use strict';
const crypto=require('node:crypto');

const START=/^bot\s+(?:come[cç]a|comecar|comece|inicia|iniciar)\s+(?:o\s+)?sorteio[!?.\s]*$/i;
const DRAW=/^bot\s+(?:sortear(?:\s+agora)?|finalizar(?:\s+inscri[cç][oõ]es)?|encerrar\s+inscri[cç][oõ]es)[!?.\s]*$/i;
const STATUS=/^bot\s+(?:status(?:\s+do)?\s+sorteio|lista\s+do\s+sorteio|participantes(?:\s+do\s+sorteio)?)[!?.\s]*$/i;
const HELP=/^bot\s+(?:regras(?:\s+do)?\s+amigo\s+secreto|ajuda\s+sorteio)[!?.\s]*$/i;
const PRESENT=/^bot\s+(?:se\s+apresenta|se\s+apresente|apresente-se|apresenta(?:r)?|apresentacao|quem\s+e\s+voce|fala\s+de\s+voce)[!?.\s]*$/i;
const JOIN=/^(?:bot\s+)?(?:eu|eu\s+quero|eu\s+vou|eu\s+participo|eu\s+topo|to\s+dentro|t[oô]\s+dentro|quero\s+participar)[!?.\s]*$/i;
const WISH_HELP=/^(?:(?:bot\s+)?(?:presente|meu\s+sorteado|quem\s+eu\s+tirei|minhas\s+ideias|ajuda\s+presente|sugest[oõ]es)|oi|ol[aá])[!?.\s]*$/i;
const WISH_REMOVE=/^(?:bot\s+)?(?:apagar\s+ideias|remover\s+ideias)[!?.\s]*$/i;
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const asPhone=x=>String(x||'').replace(/\D/g,'');
const validPhone=x=>/^55\d{10,11}$/.test(asPhone(x));
const phoneJid=p=>p+'@s.whatsapp.net';
const activePhase=p=>['registration','drawing','drawn'].includes(p);
const validGroup=s=>/^\d+(?:-\d+)?@g\.us$/.test(String(s||''));
const time=()=>new Date();
const delay=ms=>new Promise(ok=>setTimeout(ok,ms));

function rosterFromJSON(raw) {
  let list;
  try{list=JSON.parse(raw||'[]')}catch{return []}
  if(!Array.isArray(list))return [];
  const output=[],taken=new Set();
  for(const item of list) {
    const phone=asPhone(item.phone),name=String(item.name||'').trim().slice(0,55);
    if(!validPhone(phone)||!name||taken.has(phone))return [];
    taken.add(phone);output.push({phone,name});
  }
  return output;
}
// Sattolo produces one cycle: no participant draws themselves or forms a
// reciprocal pair when at least three people are enrolled.
function drawCycle(people,randomInt=crypto.randomInt) {
  if(!Array.isArray(people)||people.length<3)throw new Error('Mínimo 3 participantes.');
  const shuffled=people.map(p=>p.phone);
  for(let i=shuffled.length-1;i>0;i--) {
    const j=randomInt(i);
    [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
  }
  const assignments={};
  for(let i=0;i<people.length;i++)assignments[people[i].phone]=shuffled[i];
  if(Object.entries(assignments).some(([giver,receiver])=>giver===receiver))throw new Error('Sorteio inválido');
  return assignments;
}
function createSecretSanta({db, roster=[],adminPhone='',isOriginalGroup,resolveIdentity,
  sendGroup,sendPrivate,isActive,strictInviteGroup=false,logger=console}) {
  const list=roster.map(p=>({phone:asPhone(p.phone),name:p.name})).filter(p=>validPhone(p.phone)&&p.name);
  if(list.length<3||new Set(list.map(p=>p.phone)).size!==list.length)throw new Error('Lista privada do amigo secreto não configurada.');
  const names=new Map(list.map(p=>[p.phone,p.name]));
  const admin=asPhone(adminPhone);
  if(!names.has(admin))throw new Error('O responsável não consta na lista.');
  const col=db.collection('secret_santa_games'), settings=db.collection('secret_santa_settings');
  let bound=null,busy=false;
  const isActivation=text=>START.test(normalize(text));
  const isBoundGroup=jid=>validGroup(jid)&&bound===jid;
  const mightHandleGroup=(jid,text)=>validGroup(jid)&&!isOriginalGroup(jid)&&
    (isBoundGroup(jid)||(!bound&&!strictInviteGroup&&isActivation(text)));
  const publicSend=(gid,text)=>isActive()?sendGroup(gid,text):Promise.resolve();
  const find=()=>bound?col.findOne({_id:bound}):null;
  const personFor=phone=>({phone,name:names.get(phone)||''});
  async function init() {
    const item=await settings.findOne({_id:'bound_santa_group'});
    if(validGroup(item?.groupId)&&!isOriginalGroup(item.groupId))bound=item.groupId;
  }
  // Only bind to a JID independently verified against the supplied invite
  // and the WhatsApp account's actual participating groups.
  async function bindVerifiedInvite(groupId) {
    if(!validGroup(groupId)||isOriginalGroup(groupId))throw new Error('Grupo do Amigo Secreto inválido.');
    if(bound && bound!==groupId)throw new Error('O Amigo Secreto já está vinculado a outro grupo.');
    if(!bound) {
      try {
        await settings.insertOne({_id:'bound_santa_group',groupId,verifiedInvite:true,createdAt:time()});
      } catch(err) {
        if(err.code!==11000)throw err;
        const existing=await settings.findOne({_id:'bound_santa_group'});
        if(existing?.groupId!==groupId)throw new Error('Vinculação já existente a outro grupo.');
      }
      bound=groupId;
    }
    return groupId;
  }
  async function identity(raw,groupId) {
    const details=await resolveIdentity({jids:raw,groupId,phones:list.map(p=>p.phone)});
    const phone=asPhone(details?.phone);
    return names.has(phone)?{...personFor(phone),aliases:Array.isArray(details?.aliases)?details.aliases:[]}:null;
  }
  async function bindGroup(groupId,who) {
    if(bound&&bound!==groupId)return false;
    if(who?.phone!==admin)return false;
    if(!bound) {
      try{await settings.insertOne({_id:'bound_santa_group',groupId,createdAt:time()});}
      catch(e){
        if(e?.code!==11000)throw e;
        const previous=await settings.findOne({_id:'bound_santa_group'});
        if(previous?.groupId!==groupId)return false;
      }
      bound=groupId;
    }
    return true;
  }
  async function start(groupId,who) {
    if(!await bindGroup(groupId,who))return;
    const current=await find();
    if(activePhase(current?.phase)) {
      const msg=current.phase==='registration'
        ? '🎁 As inscrições já estão abertas! Digitem *EU*: vou registrar em silêncio. Para confirmar, usem *bot status sorteio*. Quando todos entrarem, eu sorteio automaticamente; ou Gustavo pode escrever *bot sortear agora*.'
        : '🔒 Esse Amigo Secreto já foi sorteado. Não vou refazer nem trocar os pares sem um novo evento.';
      await publicSend(groupId,msg);return;
    }
    const round={gameId:crypto.randomUUID(),phase:'registration',participants:[],
      eligible:list.map(p=>p.phone),assignments:{},wishes:{},outbox:{},
      createdAt:time(),updatedAt:time()};
    const result=await col.updateOne({_id:groupId,phase:{$nin:['registration','drawing','drawn']}},
      {$set:round,$setOnInsert:{_id:groupId}},{upsert:!current});
    if(!result.modifiedCount&&!result.upsertedCount)return;
    await publicSend(groupId,'🎄🎁 *AMIGO SECRETO DA TURMA!* 🎁🎄\n\n✨ *Inscrições abertas!* Quem vai participar, escreva *EU* aqui no grupo. Vou registrar sem responder, porque só falo no grupo quando me chamam com *bot*. Sem pressa.\n\n👥 Convidados: '+list.map(p=>p.name).join(' • ')+'.\n\n🎲 Assim que todos os '+list.length+' confirmarem, o sorteio acontece! Se forem menos, Gustavo pode encerrar com *bot sortear agora* (mínimo 3).\n\n🤫 O resultado é enviado *exclusivamente no privado*. Depois eu pergunto seus desejos e os entrego anonimamente para quem tirou você. Ninguém vê os pares no grupo!');
  }
  async function join(groupId,who,publicReply=false){
    const game=await find();
    if(!game||game.phase!=='registration')return;
    if(!who){return}
    if(game.participants.some(p=>p.phone===who.phone))return;
    const result=await col.updateOne({_id:groupId,gameId:game.gameId,phase:'registration',
      'participants.phone':{$ne:who.phone}},{$push:{participants:{phone:who.phone,name:who.name,joinedAt:time(),
      aliases:who.aliases.slice(0,4)}},$set:{updatedAt:time()}});
    if(!result.modifiedCount)return;
    const updated=await find();
    if(publicReply)await publicSend(groupId,'✅ *'+who.name+'* entrou no Amigo Secreto! 🎁  *'+updated.participants.length+'/'+list.length+'* confirmados.');
    if(updated.participants.length===list.length)await draw(groupId,admin,true,false);
  }
  async function draw(groupId,requester,automatic=false,announce=true){
    if(!automatic&&requester?.phone!==admin)return;
    const current=await find();
    if(current?.phase!=='registration')return;
    if((current.participants||[]).length<3) {
      await publicSend(groupId,'🎁 Precisamos de pelo menos *3 pessoas* para o sorteio. Aguardem mais participantes!');
      return;
    }
    const reserved=await col.updateOne({_id:groupId,gameId:current.gameId,phase:'registration',
      'participants.2':{$exists:true}},{$set:{phase:'drawing',updatedAt:time()}});
    if(!reserved.modifiedCount)return;
    const game=await find();
    const matches=drawCycle(game.participants);
    const outbox={};
    for(const p of game.participants)outbox[p.phone]={state:'pending',tries:0,nextTryAt:0};
    await col.updateOne({_id:groupId,gameId:game.gameId,phase:'drawing'},
      {$set:{phase:'drawn',assignments:matches,outbox,drawnAt:time(),updatedAt:time()}});
    if(announce)await publicSend(groupId,'🎲✨ *O SORTEIO FOI REALIZADO!* 🎄\n\n🤫 Nada de nomes sorteados aqui! Vou entregar cada resultado *no privado* e pedir a lista de desejos.\n\n💌 Se não receber, abra minha conversa privada e envie *presente*. Guarde segredo! 🎁');
  }
  async function groupMessage({groupId,text,jids}) {
    if(!mightHandleGroup(groupId,text))return false;
    const msg=normalize(text);
    const isStart=START.test(msg),isJoin=JOIN.test(msg),isDraw=DRAW.test(msg);
    const isStatus=STATUS.test(msg),isHelp=HELP.test(msg),isPresent=PRESENT.test(msg);
    if(!isStart&&!isJoin&&!isDraw&&!isStatus&&!isHelp&&!isPresent)return false;
    const who=await identity(jids,groupId);
    if(!bound) {
      if(isStart&&who?.phone===admin)await start(groupId,who);
      return !!(isStart&&who?.phone===admin);
    }
    if(groupId!==bound)return false;
    if(isPresent) {
      if(who?.phone===admin) await publicSend(groupId,
        '🎄🤖 *PRAZER, TURMA! EU SOU O BOT DO AMIGO SECRETO!* 🎁✨\n\n'+
        'Fui criado pelo *Gustavo* para deixar o nosso Amigo Secreto mais divertido e, principalmente, *misterioso*! 🤫\n\n'+
        '🎅 *Como vai funcionar?*\n'+
        '🎁 Gustavo escreve *bot começa o sorteio* e abre as inscrições.\n'+
        '🙋 Quem quiser participar responde *EU*. Eu anoto em silêncio; se quiser confirmação, mande *bot eu*.\n'+
        '🎲 Quando todos entrarem, sorteio sem ninguém tirar a si mesmo. Gustavo também pode finalizar com *bot sortear agora*.\n'+
        '💌 Mando no *privado* o nome de quem cada pessoa tirou. Esse segredo fica entre nós!\n'+
        '🎀 Depois pergunto o que cada um gostaria de ganhar e envio as ideias *só para quem tirou a pessoa*, sem contar quem foi!\n\n'+
        '🔐 Não misturo este grupo com outros jogos nem revelo os pares aqui. E no grupo só respondo quando me chamarem com *bot*.\n\n'+
        '✨ Preparados? Que comece a magia! 🎄💜');
      return true;
    }
    if(isStart){if(who?.phone===admin)await start(groupId,who);return true}
    if(isJoin){await join(groupId,who,/^bot\s+/i.test(msg));return true}
    if(isDraw){await draw(groupId,who);return true}
    if(isHelp){
      await publicSend(groupId,'🎄 *AMIGO SECRETO*\nEscreva *EU* para entrar em silêncio quando as inscrições estiverem abertas, ou *bot eu* para receber confirmação.\nGustavo pode usar *bot sortear agora* quando houver pelo menos 3 pessoas.\nDepois de sorteado, o Bot envia o nome apenas no privado. Em resposta, diga o que gostaria de ganhar e eu envio as ideias a quem tirou você, sem revelar quem foi.\n*bot status sorteio*: acompanha somente os números.');
      return true;
    }
    if(isStatus){
      const g=await find();
      if(!g){await publicSend(groupId,'Ainda não iniciamos o Amigo Secreto.');return true}
      if(g.phase==='registration'){
        const participants=(g.participants||[]).map(p=>p.name);
        await publicSend(groupId,'🎁 *INSCRIÇÕES* ('+participants.length+'/'+list.length+')\n✅ '+(participants.join(' • ')||'Aguardando o primeiro EU')+'\n📝 Faltam: '+list.filter(p=>!g.participants.some(e=>e.phone===p.phone)).map(p=>p.name).join(' • '));
      }else{
        const total=(g.participants||[]).length;
        const handed=Object.values(g.outbox||{}).filter(p=>p.state==='sent').length;
        const ideas=Object.values(g.wishes||{}).filter(w=>w?.text).length;
        await publicSend(groupId,'🎁 *SORTEIO EM SIGILO* 🤫\n👥 Participantes: '+total+
          '\n📩 Resultados enviados ao WhatsApp: '+handed+'/'+total+
          '\n💡 Listas de desejos recebidas: '+ideas+'/'+total+
          '\nNenhum nome sorteado será publicado no grupo.');
      }
      return true;
    }
    return true;
  }
  async function privateMessage({text,jids}) {
    if(!bound||!isActive())return false;
    const game=await find();
    if(!game||game.phase!=='drawn')return false;
    const who=await identity(jids,bound);
    if(!who||!game.participants.some(p=>p.phone===who.phone))return false;
    const normalized=normalize(text);
    if(!normalized||normalized.length>700)return false;
    const gifteePhone=game.assignments?.[who.phone];
    if(!gifteePhone||!names.has(gifteePhone))return false;
    if(WISH_HELP.test(normalized)||/^bot\s+presente\b/.test(normalized)){
      await sendPrivate(who,'🎁 *Seu amigo secreto é: '+names.get(gifteePhone)+'!* 🤫\n\nEste nome é só seu. Não conte no grupo!\n\n💝 *E você, o que gostaria de receber?*\nResponda aqui com suas ideias (ex.: perfume, livro, chocolate, maquiagem). Se mudar de ideia, mande uma lista nova. Eu encaminho para quem tirou você sem dizer quem foi. ✨');
      await col.updateOne({_id:bound,gameId:game.gameId},
        {$set:{['outbox.'+who.phone+'.state']:'sent',['outbox.'+who.phone+'.sentAt']:time()}});
      return true;
    }
    if(WISH_REMOVE.test(normalized)){
      await col.updateOne({_id:bound,gameId:game.gameId,phase:'drawn'},
        {$unset:{['wishes.'+who.phone]:''},$set:{updatedAt:time()}});
      await sendPrivate(who,'🧹 Apaguei sua lista de desejos. Quando quiser, mande uma nova. 🎁');
      return true;
    }
    if(/^(?:carta|mais carta|parar|stop|bot\s+stop|eu|bot\s+.*)$/i.test(normalized))return false;
    const cleaned=String(text).trim().replace(/^(?:ideias?|desejos?|quero\s+ganhar|gostaria\s+de\s+receber)\s*[:=-]\s*/i,'').trim();
    if(cleaned.length<3||cleaned.length>450){
      await sendPrivate(who,'🎁 Me conte em até 450 caracteres o que gostaria de receber. Pode mandar mais de uma ideia!');
      return true;
    }
    const old=game.wishes?.[who.phone];
    if(old?.text===cleaned){
      await sendPrivate(who,'🎁 Suas ideias já estão guardadas! Quando quiser mudar, mande uma lista diferente.');
      return true;
    }
    await col.updateOne({_id:bound,gameId:game.gameId,phase:'drawn'},
      {$set:{['wishes.'+who.phone]:{text:cleaned,version:(old?.version||0)+1,
        updatedAt:time(),forwardedVersion:old?.forwardedVersion||0},updatedAt:time()}});
    await sendPrivate(who,'💝 Anotado! Suas ideias foram salvas. Vou mandar a dica *só para quem tirou você*, sem revelar quem é. 🤫✨');
    return true;
  }
  async function deliverMatch(game) {
    const pending=game.participants.find(p=>{
      const delivery=game.outbox?.[p.phone];
      return delivery && delivery.state!=='sent' && delivery.state!=='sending' &&
        (delivery.nextTryAt||0)<=Date.now() && (delivery.tries||0)<5;
    });
    if(!pending)return false;
    const path='outbox.'+pending.phone;
    const locked=await col.updateOne({_id:bound,gameId:game.gameId,phase:'drawn',
      [path+'.state']:{$in:['pending','failed']},[path+'.tries']:{$lt:5}},
      {$set:{[path+'.state']:'sending',[path+'.sendingAt']:time()}});
    if(!locked.modifiedCount)return false;
    const target=game.assignments[pending.phone];
    if(!names.has(target))return false;
    try{
      await sendPrivate(pending,'🎄🎁 *O SEU AMIGO SECRETO É…*\n\n🥁🥁🥁\n\n💝 *'+names.get(target)+'* 💝\n\n🤫 Guardou bem? É segredo! Não revele a ninguém.\n\n💌 *Agora sua vez:* o que você gostaria de receber? Responda aqui com uma ou mais ideias. Vou mandar sua lista *anonimamente para quem tirou você*, sem revelar a identidade dessa pessoa. ✨');
      await col.updateOne({_id:bound,gameId:game.gameId,[path+'.state']:'sending'},
        {$set:{[path+'.state']:'sent',[path+'.sentAt']:time()}});
    }catch(err){
      const tries=(game.outbox?.[pending.phone]?.tries||0)+1;
      await col.updateOne({_id:bound,gameId:game.gameId,[path+'.state']:'sending'},
        {$set:{[path+'.state']:'failed',[path+'.nextTryAt']:Date.now()+Math.min(300000,30000*tries)},$inc:{[path+'.tries']:1}});
      logger.warn('[santa] Falha no envio privado do sorteio (sem nomes nem dados): '+String(err?.message||err).slice(0,90));
    }
    return true;
  }
  async function forwardWish(game) {
    for(const [recipient,wish] of Object.entries(game.wishes||{})) {
      if(!wish?.text||wish.forwardedVersion>=wish.version)continue;
      if((wish.retryAfter||0)>Date.now())continue;
      if(wish.sendingVersion===wish.version) {
        const since=new Date(wish.sendingAt||0).getTime();
        if(Date.now()-since<45000)continue;
        await col.updateOne({_id:bound,gameId:game.gameId,['wishes.'+recipient+'.sendingVersion']:wish.version},
          {$unset:{['wishes.'+recipient+'.sendingVersion']:''}});
        continue;
      }
      const giver=game.participants.find(p=>game.assignments?.[p.phone]===recipient);
      if(!giver)continue;
      if(game.outbox?.[giver.phone]?.state!=='sent')continue;
      const field='wishes.'+recipient;
      const locked=await col.updateOne({_id:bound,gameId:game.gameId,phase:'drawn',
        [field+'.version']:wish.version,[field+'.sendingVersion']:{$ne:wish.version}},
        {$set:{[field+'.sendingVersion']:wish.version,[field+'.sendingAt']:time()}});
      if(!locked.modifiedCount)continue;
      try {
        await sendPrivate(giver,'💌🎁 *DICA DO SEU AMIGO SECRETO*\n\n✨ *'+names.get(recipient)+'* gostaria de ganhar:\n\n“'+wish.text+'”\n\n🤫 Essa dica foi encaminhada em segredo. *Não revele que você tirou essa pessoa!*');
        await col.updateOne({_id:bound,gameId:game.gameId,[field+'.version']:wish.version},
          {$set:{[field+'.forwardedVersion']:wish.version,[field+'.retryAfter']:0},$unset:{[field+'.sendingVersion']:''}});
      }catch(err){
        await col.updateOne({_id:bound,gameId:game.gameId,[field+'.version']:wish.version},
          {$unset:{[field+'.sendingVersion']:''},$set:{[field+'.retryAfter']:Date.now()+40000}});
        logger.warn('[santa] Falha na entrega de lista de desejos (sem conteúdo): '+String(err?.message||err).slice(0,80));
      }
      return true;
    }
    return false;
  }
  async function tick(){
    if(busy||!bound||!isActive())return;
    busy=true;
    try{
      const game=await find();
      if(game?.phase!=='drawn')return;
      const stale=game.participants.filter(p=>game.outbox?.[p.phone]?.state==='sending' &&
        Date.now()-new Date(game.outbox[p.phone].sendingAt||0).getTime()>45000);
      for(const p of stale)await col.updateOne({_id:bound,gameId:game.gameId,
        ['outbox.'+p.phone+'.state']:'sending'},{$set:{['outbox.'+p.phone+'.state']:'failed'}});
      const result=await deliverMatch(game);
      if(!result)await forwardWish(game);
    }catch(e){logger.error('[santa] Erro interno do sorteio: '+String(e?.message||e).slice(0,120))}
    finally{busy=false}
  }
  return {init,bindVerifiedInvite,mightHandleGroup,isActivation,isBoundGroup,groupMessage,privateMessage,tick,
    rosterCount:()=>list.length,getBoundGroup:()=>bound};
}
module.exports={createSecretSanta,rosterFromJSON,drawCycle};
