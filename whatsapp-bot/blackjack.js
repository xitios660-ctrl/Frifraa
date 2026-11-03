'use strict';
const crypto = require('node:crypto');

const SIGNUP_MS = 10_000;
const TURN_MS = 45_000;
const MAX_PLAYERS = 4;
const clean = s => String(s||'').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[!?.,]+$/,'').trim();
const isStart = s => /^(?:bot\s+)(?:jogar\s+)?(?:blackjack|black jack|21|vinte e um)$/.test(clean(s));
const isRules = s => /^bot\s+(?:regras\s+(?:do\s+)?)?(?:blackjack|black jack|21)\s+regras$/.test(clean(s)) ||
                       /^bot\s+regras\s+(?:do\s+)?(?:blackjack|black jack|21)$/.test(clean(s));
const isStatus = s => /^bot\s+(?:blackjack|black jack|21)\s+(?:status|placar|mesa)$/.test(clean(s));
const isCancel = s => /^bot\s+(?:encerrar|cancelar|parar)\s+(?:blackjack|black jack|21)$/.test(clean(s));
const isStopStart = s => /^bot\s+(?:jogar\s+)?(?:stop|adedonha|adedanha)$/.test(clean(s));
const isJoin = s => /^(eu|eu quero|eu vou|eu jogo|to dentro|tô dentro|participo|quero jogar)$/.test(clean(s));
const isHit = s => /^(?:bot\s+)?(?:carta|mais|mais carta|pedir carta|quero carta|quero mais|quero mais uma|outra|outra carta|manda carta|manda mais uma|me da uma carta|me de uma carta|comprar|puxar|mais uma|hit|sim)$/.test(clean(s));
const isStand = s => /^(?:bot\s+)?(?:parar|parou|paro|passar|passo|passei|parei|vou parar|quero parar|nao quero mais|nao|sem mais cartas|plantar|stand|chega|chega de carta|ficar|fico|manter|segurar|to bem|estou bem)$/.test(clean(s));
const isHand = s => /^(?:bot\s+)?(?:cartas|minhas cartas|minha mao|ver cartas|ver mao|mostra as cartas|mostra minhas cartas|quais sao minhas cartas|me manda minhas cartas)$/.test(clean(s));
const active = phase => ['signup','dealing','playing','finishing'].includes(phase);
const faces = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const suits = ['♠️','♥️','♦️','♣️'];
const freshDeck = () => {
  const deck=[];
  for(const suit of suits)for(const face of faces)deck.push({face,suit});
  for(let i=deck.length-1;i>0;i--){
    const k=crypto.randomInt(i+1);
    [deck[i],deck[k]]=[deck[k],deck[i]];
  }
  return deck;
};
const value=cards=>{
  let total=0,aces=0;
  for(const c of cards){if(c.face==='A'){total+=11;aces++}else if(['J','Q','K'].includes(c.face))total+=10;else total+=Number(c.face)}
  while(total>21 && aces){total-=10;aces--}
  return total;
};
const natural=cards=>cards.length===2 && value(cards)===21;
const cardText=cards=>cards.map(c=>c.face+c.suit).join('  ');
const nextPending = (players,start=0) => players.findIndex((p,i)=>i>=start && p.status==='pending');
const mention=p=>p?.jid||'';
const labeled=p=>p?.jid ? '@'+p.jid.split('@')[0] : p.name;
const now=()=>new Date();
const phoneJid = phone => {
  const digits=String(phone||'').replace(/\D/g,'');
  return /^55\d{10,11}$/.test(digits)?digits+'@s.whatsapp.net':'';
};

function createBlackjack({db,getGroup,sendGroup,sendPrivate,isActive}) {
  const col=db.collection('blackjack_games');
  let busy=false;
  let groupId=null;
  const gid=()=>groupId||getGroup();
  const say=async(text,mentions=[])=>{if(isActive() && gid())await sendGroup({text,mentions})};
  const dbGame=()=>gid()?col.findOne({_id:gid()}):null;
  async function persist(game, fields, filter={}) {
    const query={_id:gid(),gameId:game.gameId,version:game.version,...filter};
    const change={$set:{...fields,updatedAt:now()},$inc:{version:1}};
    const result=await col.updateOne(query,change);
    return !!result.modifiedCount;
  }
  async function begin() {
    const stop = await db.collection('stop_games').findOne({_id:gid()},{projection:{status:1}});
    if(['thinking','collecting','scoring','intermission'].includes(stop?.status)){
      await say('🎲 O STOP está rolando! Termine com *bot encerrar jogo* antes de começar o Blackjack.');
      return;
    }
    const old=await dbGame();
    if(active(old?.phase)){await say('🎴 Já temos um Blackjack acontecendo!');return;}
    const game={gameId:crypto.randomUUID(),version:0,phase:'signup',signupDeadline:Date.now()+SIGNUP_MS+4000,
      players:[],dealer:[],deck:[],turnIndex:-1,updatedAt:now(),createdAt:now()};
    const result=await col.updateOne({_id:gid(),phase:{$nin:['signup','dealing','playing','finishing']}},
      {$set:game,$setOnInsert:{_id:gid()}},{upsert:!old});
    if(!result.modifiedCount&&!result.upsertedCount){await say('Já existe Blackjack em andamento.');return;}
    await say('🎴 *BLACKJACK (21)!*\nQuem vai participar? Escreva *EU* em até *10 segundos*! ⏱️\nDepois mando 2 cartas no privado. No grupo, cada um escolhe *carta* ou *parar*.');
    await col.updateOne({_id:gid(),gameId:game.gameId,phase:'signup'},
      {$set:{signupDeadline:Date.now()+SIGNUP_MS,updatedAt:now()}});
  }
  async function join(identity) {
    const game=await dbGame();
    if(!game||game.phase!=='signup')return false;
    if(Date.now()>game.signupDeadline)return true;
    if(!identity?.name || !identity?.phoneE164){
      await say('Não consegui confirmar seu número para mandar as cartas no privado. Confira sua identificação no WhatsApp.');
      return true;
    }
    const jid=phoneJid(identity.phoneE164);
    if(!jid){await say('Não encontrei um WhatsApp válido para mandar as cartas no privado.');return true;}
    if(game.players.some(p=>p.id===identity.phoneE164))return true;
    if(game.players.length>=MAX_PLAYERS){await say('🎴 A mesa já está cheia!');return true;}
    const player={id:identity.phoneE164,name:identity.name,jid,jids:(identity.jids||[]).filter(x=>typeof x==='string' && /^\d+@(lid|s\.whatsapp\.net)$/.test(x)),hand:[],status:'waiting',dmStatus:'pending'};
    const result=await col.updateOne({_id:gid(),gameId:game.gameId,phase:'signup',signupDeadline:{$gte:Date.now()},
      'players.id':{$ne:player.id},'players.7':{$exists:false}},{$push:{players:player},$inc:{version:1},$set:{updatedAt:now()}});
    if(result.modifiedCount)await say('✅ '+player.name+' entrou! ('+(game.players.length+1)+' jogador(es))');
    return true;
  }
  function current(g) {
    return g.phase==='playing' && g.turnIndex>=0 ? g.players[g.turnIndex] : null;
  }
  async function askTurn(game) {
    const p=current(game); if(!p)return;
    await say('🎴 Vez de '+labeled(p)+'. Quer *carta* ou *parar*? (45s)',[mention(p)].filter(Boolean));
    await col.updateOne({_id:gid(),gameId:game.gameId,phase:'playing',turnIndex:game.turnIndex},
      {$set:{turnDeadline:Date.now()+TURN_MS,updatedAt:now()}});

  }
  async function sendHand(p, extra='', directJid=null) {
    return sendPrivate({...p,...(directJid?{jid:directJid,jids:[directJid]}:{})},{text:'🎴 *Seu Blackjack*\nSuas cartas: '+cardText(p.hand)+'\nTotal: *'+value(p.hand)+'*'+extra+
      '\n\nResponda *carta* ou *parar* no GRUPO quando chegar sua vez.'});
  }
  async function deal(game) {
    const cards=freshDeck();
    const players=game.players.map(p=>({...p,hand:[cards.pop(),cards.pop()],status:'pending',dmStatus:'pending'}));
    const dealer=[cards.pop(),cards.pop()];
    for(const p of players)if(natural(p.hand))p.status='blackjack';
    const changed=await persist(game,{phase:'dealing',players,dealer,deck:cards,turnIndex:-1,deliveryDeadline:Date.now()+25000,updatedAt:now()},{phase:'signup'});
    if(changed)await say('🃏 Inscrições encerradas! Distribuindo 2 cartas no privado…');
  }
  async function distribute(game) {
    const pending=game.players.find(p=>p.dmStatus==='pending');
    if(pending) {
      let delivered=false, dmReceipt=null;
      try {
        dmReceipt=await sendHand(pending,natural(pending.hand)?'\n✨ Blackjack natural! Você já tem 21.':'');
        delivered=true;
      } catch(e) {
        console.warn('[blackjack] Privado não entregue para '+pending.name+': '+String(e.message).slice(0,100));
      }
      // Atomic replacement of one field; failed deliveries cannot take part in the game.
      const index=game.players.findIndex(p=>p.id===pending.id);
      await col.updateOne({_id:gid(),gameId:game.gameId,phase:'dealing',
        ['players.'+index+'.dmStatus']:'pending'},
      {$set:{['players.'+index+'.dmStatus']:delivered?'sent':'failed',
        ...(delivered?{['players.'+index+'.dmJid']:dmReceipt?.jid||pending.jid}:{}),updatedAt:now()},$inc:{version:1}});
      if(!delivered)await say('⚠️ Não consegui iniciar o privado com '+pending.name+'. Abra a conversa com o Bot e envie *cartas* em até 25 segundos para recuperar sua mão.');
      return;
    }
    const missed=game.players.filter(p=>p.dmStatus==='failed');
    if(missed.length && Date.now()<(game.deliveryDeadline||0))return;
    if(missed.length) {
      await col.updateOne({_id:gid(),gameId:game.gameId,phase:'dealing'},
        {$set:{players:game.players.map(p=>p.dmStatus==='failed'?{...p,status:'unavailable',dmStatus:'skipped'}:p),updatedAt:now()},$inc:{version:1}});
      await say('⚠️ Os jogadores que não conseguiram abrir o privado ficarão fora desta mão.');
      return;
    }
    const index=nextPending(game.players);
    if(!game.players.some(p=>p.dmStatus==='sent')){
      const changed=await persist(game,{phase:'cancelled',completedAt:now()},{phase:'dealing'});
      if(changed)await say('Não consegui entregar as cartas no privado. Blackjack cancelado; os participantes precisam aceitar mensagens do Bot.');
      return;
    }
    const changed=await persist(game,{phase:index===-1?'finishing':'playing',turnIndex:index,turnDeadline:Date.now()+TURN_MS+5000,finishAfter:Date.now()+3000},{phase:'dealing'});
    if(changed) {
      await say('🎴 Tentei enviar as cartas no privado! Se não chegaram, abra a conversa com o *Bot* e escreva *cartas*. Minha carta visível: *'+cardText([game.dealer[0]])+'* (a outra está escondida).');
      if(index!==-1)await askTurn({...game,phase:'playing',turnIndex:index});
    }
  }
  function dealerDraw(game) {
    const deck=[...game.deck],hand=[...game.dealer];
    while(value(hand)<17 && deck.length)hand.push(deck.pop());
    return {deck,hand};
  }
  async function settle(game) {
    const {deck,hand}=dealerDraw(game);
    const dealerTotal=value(hand);
    const dealerBJ=natural(hand);
    const results=game.players.filter(p=>p.dmStatus==='sent').map(p=>{
      const total=value(p.hand);
      let outcome='perdeu';
      if(total>21)outcome='passou de 21';
      else if(natural(p.hand) && !dealerBJ)outcome='ganhou';
      else if(dealerBJ && !natural(p.hand))outcome='perdeu';
      else if(dealerTotal>21 || total>dealerTotal)outcome='ganhou';
      else if(total===dealerTotal)outcome='empatou';
      return {name:p.name,jid:p.jid,total,outcome,hand:p.hand};
    });
    const changed=await persist(game,{phase:'completed',dealer:hand,deck,results,completedAt:now()},{phase:'finishing'});
    if(!changed)return;
    const wins=results.filter(x=>x.outcome==='ganhou');
    const mentions=wins.map(x=>x.jid);
    const lines=results.map(r=>(r.outcome==='ganhou'?'🏆 ':r.outcome==='empatou'?'🤝 ':'❌ ')+
      r.name+': *'+r.total+'* — '+r.outcome);
    await say('🏁 *FIM DO BLACKJACK!*\n🤖 Bot: '+cardText(hand)+' = *'+dealerTotal+'*'+(dealerTotal>21?' (estourou)':'')+
      '\n\n'+(lines.join('\n')||'Sem jogadores.')+
      '\n\n'+(wins.length?'🎉 Vencedores: '+wins.map(x=>x.jid?'@'+x.jid.split('@')[0]:x.name).join(', '):
        'Sem vencedores desta vez!'),mentions);
  }
  async function action(text, identity) {
    const game=await dbGame();
    if(!game||game.phase!=='playing')return false;
    const player=current(game);
    if(!player)return true;
    const sender=identity?.phoneE164;
    if(!sender || sender!==player.id){
      // This is an in-game action, so do not let someone steal the turn.
      await say('⏳ Agora é a vez de '+labeled(player)+'.',[mention(player)].filter(Boolean));
      return true;
    }
    const hit=isHit(text);
    const players=game.players.map(p=>({...p,hand:[...p.hand]}));
    const deck=[...game.deck];
    const mine=players[game.turnIndex];
    if(hit) {
      const card=deck.pop();
      if(!card){await say('O baralho acabou; vamos encerrar a rodada.');return true;}
      mine.hand.push(card);
      const points=value(mine.hand);
      if(points>21)mine.status='bust';
      else if(points===21)mine.status='stand';
      const next=mine.status==='pending'?game.turnIndex:nextPending(players,game.turnIndex+1);
      const phase=next===-1?'finishing':'playing';
      const changed=await persist(game,{players,deck,turnIndex:next,phase,turnDeadline:Date.now()+TURN_MS+5000,finishAfter:Date.now()+3000},{phase:'playing',turnIndex:game.turnIndex});
      if(!changed)return true;
      try{await sendHand(mine,'\n➕ Nova carta: '+cardText([card]));}
      catch(e){await say('⚠️ '+mine.name+', não consegui mandar sua nova carta no privado. Verifique a conversa com o Bot.');}
      if(points>21)await say('😵 Vish, '+mine.name+' passou de 21! Estourou com *'+points+'*.');
      else if(points===21)await say('🎯 '+mine.name+' chegou a *21*!');
      else await say('🃏 '+mine.name+' recebeu mais uma carta no privado.');
      if(phase==='playing')await askTurn({...game,players,turnIndex:next,phase}); else await say('🃏 Todo mundo jogou! Vou revelar minhas cartas…');
    } else {
      mine.status='stand';
      const next=nextPending(players,game.turnIndex+1);
      const phase=next===-1?'finishing':'playing';
      const changed=await persist(game,{players,turnIndex:next,phase,turnDeadline:Date.now()+TURN_MS+5000,finishAfter:Date.now()+3000},{phase:'playing',turnIndex:game.turnIndex});
      if(!changed)return true;
      await say('✋ '+mine.name+' parou.'); 
      if(phase==='playing')await askTurn({...game,players,turnIndex:next,phase});else await say('🃏 Todo mundo jogou! Vou revelar minhas cartas…');
    }
    return true;
  }
  async function handle({text,identity}) {
    if(!gid())return false;
    const t=clean(text);
    if(isStart(t)){await begin();return true;}
    if(isRules(t)){await say('🎴 *Blackjack:* quem quiser jogar escreve *eu* em 10s. Cada um recebe 2 cartas no privado. Na sua vez, diga *carta* ou *parar* no grupo. Ás vale 1 ou 11; J/Q/K valem 10. Passou de 21, perdeu. O Bot compra até ter pelo menos 17. Sem apostas.');return true;}
    if(isStatus(t)){
      const g=await dbGame();
      await say(!g||!active(g.phase)?'Sem Blackjack ativo. Comece com *bot blackjack*.':
        '🎴 Blackjack: '+(g.phase==='signup'?'inscrições abertas':g.phase==='dealing'?'enviando cartas':'em andamento')+
        '. Jogadores: '+g.players.map(p=>p.name).join(', ')+'.');
      return true;
    }
    if(isCancel(t)){
      const g=await dbGame();
      if(!g||!active(g.phase)){await say('Não tem Blackjack ativo.');return true;}
      const changed=await persist(g,{phase:'cancelled',completedAt:now()});
      if(changed)await say('🛑 Blackjack cancelado. Uma nova partida pode começar com *bot blackjack*.');
      return true;
    }
    const g=await dbGame();
    if(isStopStart(t) && active(g?.phase)){
      await say('🎴 Primeiro termina o Blackjack! Use *bot encerrar blackjack* se quiser cancelar.');
      return true;
    }
    if(!active(g?.phase))return false;
    if(g.phase==='signup' && isJoin(t))return join(identity);
    if(g.phase==='playing' && (isHit(t)||isStand(t)))return action(t,identity);
    if(isHand(t)){
      const p=g.players.find(x=>x.id===identity?.phoneE164);
      if(p?.dmStatus==='sent'){
        try { await sendHand(p); await say('📩 Reenviei suas cartas no privado.'); }
        catch(e){await say('Não consegui enviar suas cartas no privado. Abra a conversa com o Bot e tente novamente.');}
      }
      return true;
    }
    return false;
  }
  async function handlePrivate({text,identity,remoteJid}) {
    const game=await dbGame();
    if(!game || !active(game.phase))return false;
    const command=clean(text);
    if(!(isHand(command)||isHit(command)||isStand(command)||/^(oi|ola|iniciar)$/.test(command)))return false;
    const candidates=[remoteJid,...(identity?.jids||[])].filter(Boolean);
    const participant=game.players.find(p=>
      (identity?.phoneE164 && p.id===identity.phoneE164) ||
      p.jid===remoteJid ||
      (p.jids||[]).some(j=>candidates.includes(j))
    );
    if(!participant)return false;
    const respond=async message=>sendPrivate({...participant,jid:remoteJid,jids:[remoteJid]},{text:message});
    if(game.phase==='signup'){
      await respond('🎴 Você está inscrito(a)! Aguarde os 10 segundos de inscrição. Depois envio suas cartas aqui.');
      return true;
    }
    if(game.phase==='dealing'){
      if(participant.hand?.length===2) {
        await sendHand(participant,'',remoteJid);
        const index=game.players.findIndex(p=>p.id===participant.id);
        await col.updateOne({_id:gid(),gameId:game.gameId,phase:'dealing'},
          {$set:{['players.'+index+'.dmStatus']:'sent',['players.'+index+'.status']:natural(participant.hand)?'blackjack':'pending',
            ['players.'+index+'.dmJid']:remoteJid,updatedAt:now()},$inc:{version:1}});
      } else await respond('🎴 Aguarde mais um instante. Estou embaralhando as cartas.');
      return true;
    }
    if(isHand(command)){
      await sendHand(participant,'',remoteJid);
      return true;
    }
    if(game.phase==='playing' && game.players[game.turnIndex]?.id===participant.id) {
      await action(command,{phoneE164:participant.id});
      return true;
    }
    await respond('🎴 Ainda não é sua vez ou a partida está terminando. Suas cartas: '+cardText(participant.hand)+' (total *'+value(participant.hand)+'*).');
    return true;
  }

  async function tick() {
    if(busy || !isActive() || !gid())return;
    busy=true;
    try {
      const g=await dbGame();
      if(!g)return;
      if(g.phase==='signup' && Date.now()>=g.signupDeadline) {
        if(!g.players.length){
          const changed=await persist(g,{phase:'cancelled',completedAt:now()},{phase:'signup'});
          if(changed)await say('⏰ Ninguém entrou no Blackjack. Partida cancelada.');
        }else await deal(g);
      }else if(g.phase==='dealing')await distribute(g);
      else if(g.phase==='playing' && Number.isFinite(g.turnDeadline) && Date.now()>=g.turnDeadline) {
        const player=current(g);
        if(player) {
          await say('⏰ Acabou o tempo de '+player.name+'! Vou considerar *parar*.');
          await action('parar',{phoneE164:player.id});
        }
      }
      else if(g.phase==='finishing' && (!g.finishAfter || Date.now()>=g.finishAfter))await settle(g);
    }catch(err){console.error('[blackjack] Erro na rodada:',String(err.stack||err).slice(0,450))}
    finally{busy=false}
  }
  return {handle,handlePrivate,tick,isRunning:async()=>{const g=await dbGame();return active(g?.phase)},setGroupId:id=>{groupId=id},_internals:{value,natural,freshDeck}};
}
module.exports={createBlackjack,value,natural,freshDeck,isStart,isHit,isStand,isJoin};
