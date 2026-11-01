'use strict';
const crypto = require('node:crypto');
const { GoogleGenAI } = require('@google/genai');

const THINK_MS = 75_000, ANSWER_MS = 5_000;
const LETTERS = 'ABCDEFGIJLMNOPRSTUV'.split('');
const CATEGORIES = ['Animal', 'Lugar', 'Comida', 'Cor', 'Objeto', 'Nome'];
const lexicon = {
  animal: 'abelha aguia alce anta aranha arara avestruz baleia barata bode boi borboleta bufalo cachorro camaleao camelo canario capivara caranguejo carneiro cavalo cobra coelho coruja crocodilo cutia elefante ema escorpiao foca formiga galinha galo gato gaviao girafa golfinho gorila grilo hipopotamo hiena iguana jacare jaguar javali jiboia lagarta lagartixa lagarto leao lebre leopardo lobo lontra macaco mariposa morcego mosca mosquito mula onca ornitorrinco ovelha panda pantera papagaio pato peixe pinguim pirarucu polvo porco preguiça raposa rato rinoceronte sapo sucuri serpente tamandua tatu tigre toupeira tubarao urso vaca vespa zebra'.split(' '),
  pais: ['afeganistao','africa do sul','albania','alemanha','andorra','angola','arabia saudita','argelia','armenia','australia','austria','bahamas','bangladesh','barbados','belgica','belize','benin','bolivia','botsuana','brasil','bulgaria','camaroes','canada','catar','chile','china','chipre','colombia','congo','coreia do sul','coreia do norte','costa rica','croacia','cuba','dinamarca','egito','emirados arabes unidos','equador','eslovaquia','eslovenia','espanha','estados unidos','estonia','etiopia','filipinas','finlandia','franca','gana','georgia','grecia','guatemala','guine','haiti','honduras','hungria','india','indonesia','ira','iraque','irlanda','islandia','israel','italia','jamaica','japao','jordania','kuwait','libano','liberia','libia','luxemburgo','madagascar','malasia','maldivas','mali','malta','marrocos','mexico','mocambique','monaco','mongolia','namibia','nepal','nicaragua','nigeria','noruega','nova zelandia','oma','panama','paraguai','peru','polonia','portugal','quenia','reino unido','republica dominicana','romenia','russia','senegal','servia','singapura','siria','somalia','sudao','suecia','suica','tailandia','taiwan','tanzania','timor leste','togo','tunisia','turquia','ucrania','uganda','uruguai','uzbequistao','venezuela','vietna','zambia','zimbabue'],
  lugar: 'aeroporto academia acougue adega aquario armazem avenida banco bar biblioteca bosque cafeteria campo canteiro casa castelo catedral cinema circo clube colegio condominio consultorio creche delegacia deserto escola escritorio estadio estacao fazenda feira farmacia floresta garagem hospital hotel igreja jardim laboratorio lago lanchonete livraria loja mercado mercearia montanha motel museu padaria parque patio praia praca predio restaurante rio rua sala salao supermercado teatro templo universidade vila zoologico'.split(' '),
  cidade: ['londres','lisboa','liverpool','las vegas','los angeles','leiria','limeira','londrina','mogi das cruzes','marilia','manaus','maceio','marraquexe','marrakech','nova york','natal','niteroi','osasco','paris','porto','recife','roma','rio de janeiro','salvador','santos','sao paulo','sao jose dos campos','toquio','teresina','uberlândia','veneza','vitoria','washington','zurique'],
  comida: 'abacate abacaxi acai arroz acaraje almôndega almondega banana batata bolo brigadeiro broa carne coxinha chocolate churros canjica cenoura empada esfiha feijao frango feijoada goiabada hamburguer iogurte lasanha leite lentilha limao macarrao mandioca manga maracuja mel melancia mingau milho nhoque omelete pao panqueca pastel peixe pizza pipoca pudim queijo quibe quindim risoto rabanada salada sanduiche sopa sorvete tapioca tomate torta uva vatapa vitamina waffle'.split(' ').concat(['arroz doce','batata frita','doce de leite']),
  cor: 'amarelo azul anil branco bege bordô bordo caramelo castanho ciano cinza coral creme dourado fucsia grafite grená grena indigo jade laranja lavanda lilas magenta marrom mostarda nude ocre oliva ouro prata preto rosa roxo rubi salmao turquesa verde vermelho violeta vinho'.split(' ').concat(['azul marinho','azul claro']),
  objeto: 'agulha alicate almofada anel armario bolsa bola boneca boneco balde balanca bicicleta bota caderno cadeira cama caneca caneta capacete carro chave chinelo cobertor colher computador copo cortina dado escada espelho faca fogao garfo geladeira janela oculos saco lanterna lapis livro mala martelo mesa microfone mochila moeda monitor oculos panela papel pente prato quadro radio relogio sapato sofa telefone tesoura teclado travesseiro vaso violao xicara'.split(' ').concat(['guarda chuva']),
  nome: 'ana alice amanda andre antonio arthur beatriz bruna bruno bianca caio camila carla carlos carolina clara daniel davi diego eduarda emilia felipe fernanda flavia gabriel gabi gustavo guilherme helena henrique isabela joao julia juliana kaique kaike karina laura larissa leonardo leticia lucas luiza maria mariana mariany marcos marina mateus matheus miguel nathalia natalia nicole osvaldo orlando olivia paulo pedro rafael raquel renata ricardo roberto samuel sofia thiago valentina vitoria yasmin'.split(' ')
};
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
const cmd = value => norm(value).replace(/[!?.]+$/g,'').trim();
const startsGame = text => /^(?:bot[,!:]?\s+)?(?:jogar\s+)?(?:stop|adedonha|adedanha)$/i.test(cmd(text)) && /\bbot\b/.test(cmd(text));
const endGame = text => /^bot\s+encerrar\s+jogo$/i.test(cmd(text));
const scoreCommand = text => /^bot\s+(?:stop\s+)?(?:placar|pontuacao|pontos|ranking)$/i.test(cmd(text));
const rulesCommand = text => /^bot\s+(?:(?:stop|adedonha|adedanha)\s+)?(?:regras|ajuda)$/i.test(cmd(text));
const stopCommand = text => startsGame(text) || endGame(text) || scoreCommand(text) || rulesCommand(text);
const activeState = state => ['thinking','collecting','scoring'].includes(state);
// Answers follow Animal, Lugar, Comida, Cor, Objeto, Nome.
// Empty slots and unfinished submissions are accepted and score only for valid cells.
// Named fields can be submitted in any order; plain comma-separated fields use positional order.
const parseAnswers = text => {
  const raw = String(text || '').trim().replace(/^bot[,!:]?\s*/i,'').trim();
  if (!raw || raw.length > 600) return null;
  const parts = raw.split(/[,;\n]/).map(x => x.trim());
  if (parts.length > CATEGORIES.length || parts.some(x => x.length > 65)) return null;
  const labels=['animal','lugar','comida','cor','objeto','nome'];
  const labelRE=/^(animal|lugar|comida|cor|objeto|nome)\s*[:=]\s*/i;
  const isLabelled=parts.some(x => labelRE.test(norm(x)));
  if (parts.length===1 && !isLabelled) return null; // Never mistake normal group chat for STOP.
  const answers=Array(CATEGORIES.length).fill('');
  if (isLabelled) {
    for(const part of parts) {
      if(!part) continue;
      const m=norm(part).match(labelRE);
      if(!m) return null;
      answers[labels.indexOf(m[1])]=part.replace(labelRE,'').trim();
    }
    return answers.some(Boolean)?answers:null;
  }
  // Six positions or explicit empty commas have unambiguous category slots.
  if (parts.length===CATEGORIES.length || (raw.includes(',') && parts.some(x=>!x))) {
    parts.forEach((part,i)=>{answers[i]=part;});
    return answers.some(Boolean)?answers:null;
  }
  const words=parts.filter(Boolean);
  if(words.length<2) return null;
  // Match each item to its most likely category, even if a category was skipped.
  // Strong dictionary hits beat original position; unknown terms keep positional order.
  let best=null;
  const search=(index,used,mapping,score)=>{
    if(index===words.length) {
      if(!best||score>best.score) best={mapping:[...mapping],score};
      return;
    }
    const value=words[index];
    const matches=CATEGORIES.map((_,cat)=>cached(cat,value));
    const known=matches.some(Boolean);
    for(let cat=0;cat<CATEGORIES.length;cat++) {
      if(used&(1<<cat))continue;
      const weight=(matches[cat]?30:(known?-30:0))-Math.abs(cat-index)*0.4;
      // Preserve ascending order in ambiguous answers.
      const inversions=mapping.filter(previous=>previous>cat).length;
      search(index+1,used|(1<<cat),[...mapping,cat],score+weight-inversions*0.5);
    }
  };
  search(0,0,[],0);
  best.mapping.forEach((cat,i)=>{answers[cat]=words[i];});
  return answers;
};

function draw(used) {
  const remain = LETTERS.filter(x => !used.includes(x));
  return remain[crypto.randomInt(remain.length || LETTERS.length)] || LETTERS[crypto.randomInt(LETTERS.length)];
}
const phone = jid => { const m=String(jid || '').match(/^(\d+)@s\.whatsapp\.net$/); return m ? '+' + (m[1].startsWith('55') ? m[1] : '55' + m[1]) : ''; };
const mentioned = person => person.phone ? person.phone.replace(/\D/g,'') + '@s.whatsapp.net' : '';
const letterValid = (text,letter) => norm(text).charAt(0) === letter.toLowerCase();
const cached = (cat,word) => {
  const value=norm(word);
  if(cat===0) return lexicon.animal.includes(value);
  if(cat===1) return lexicon.pais.includes(value) || lexicon.lugar.includes(value) || lexicon.cidade.some(place=>norm(place)===value);
  return (lexicon[['animal','lugar','comida','cor','objeto','nome'][cat]] || []).some(item=>norm(item)===value);
};
const nowDate = () => new Date().toISOString();
function formatScores(people) {
  const sorted=[...people].sort((a,b)=>b.total-a.total || a.name.localeCompare(b.name,'pt-BR'));
  return sorted.map((p,i)=> (i+1)+'º '+p.name+': *'+p.total+' pontos*').join('\n');
}
function beginMessage(game) {
  return '🎲 *STOP — RODADA '+game.round+'*\n🔤 Letra: *'+game.letter+'*\n📝 Categorias na ordem: *Animal, Lugar, Comida, Cor, Objeto, Nome*\n⏳ *75 segundos* para pensar e responder.\nPodem mandar as respostas por vírgulas *ou uma por linha*, sem precisar preencher todas as categorias. Com M: *macaco, Marrocos, macarrão, marrom, martelo, Maria*. Respostas incompletas também valem! Ex.: *macaco, Marrocos,* vale *2 pontos* se ambos estiverem corretos. Cada acerto vale *1 ponto*, mesmo repetido. Lugar vale qualquer país, cidade ou lugar real.\nEu vou mandar *PRONTO* ao fim do tempo e dar só mais *5 segundos* para quem não enviou. Respostas não precisam ter “bot”.\n🏁 A partida só termina quando alguém disser *bot encerrar jogo*.';
}
async function checkWords(rows, letter, key) {
  const output=new Map();
  const pending=[];
  for(const row of rows) {
    if(!row.word) output.set(row.id,{valid:false,reason:'em branco'});
    else if(!letterValid(row.word,letter)) output.set(row.id,{valid:false,reason:'letra errada'});
    else if(cached(row.cat,row.word)) output.set(row.id,{valid:true,reason:'confirmado'});
    else pending.push(row);
  }
  if(pending.length && key) {
    const ai=new GoogleGenAI({apiKey:key});
    const prompt='Você é juiz de STOP. Cheque se estes termos realmente existem, se começam com a letra '+letter+' e se pertencem à categoria: Animal (espécie/animal real), Lugar (qualquer país, cidade, região ou tipo de lugar físico real, como Londres, Marrocos, mercado), Comida (alimento real), Cor (cor existente), Objeto (objeto real), Nome (nome próprio de pessoa existente). Não invente fatos nem valide termos ambíguos que não se encaixem. Se tiver dúvida, use valid=false. Devolva SOMENTE JSON {"results":[{"id":0,"valid":true}]}, com exatamente um objeto por item. Entrada: '+JSON.stringify(pending.map(x=>({id:x.id,category:CATEGORIES[x.cat],answer:x.word})));
    for(const model of ['gemini-3.5-flash-lite','gemini-3.8-flash','gemini-3.6-flash']) {
      try {
        const response=await ai.models.generateContent({model,contents:prompt,config:{responseMimeType:'application/json',temperature:0,maxOutputTokens:1100}});
        const parsed=JSON.parse(String(response.text||'{}'));
        if(!Array.isArray(parsed.results)) continue;
        for(const row of pending) {
          const item=parsed.results.find(x=>x.id===row.id);
          if(typeof item?.valid==='boolean') output.set(row.id,{valid:item.valid,reason:'avaliado pela IA'});
        }
        break;
      } catch(e) { console.warn('[stop] Validador IA indisponível:',String(e.message).slice(0,100)); }
    }
  }
  for(const row of pending) if(!output.has(row.id)) output.set(row.id,{valid:false,unverified:true,reason:'não foi possível confirmar'});
  return output;
}
function createStopGame({db,groupId,send,getGeminiKey,isActive}) {
  const collection=db.collection('stop_games');
  const peopleCol=db.collection('group_contacts');
  let running=false;
  const output=async (text,mentions=[]) => { if(isActive()) await send({text,mentions}); };
  const players=async () => {
    const saved=await peopleCol.find({groupId},{projection:{name:1,phoneE164:1}}).toArray();
    return saved.map(p=>({id:p.phoneE164,name:p.name,phone:p.phoneE164,total:0})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  };
  async function choosePlayer(sender, knownName, game) {
    const num=phone(sender);
    let person=num && game.scores.find(p=>p.phone===num);
    if(!person && knownName) person=game.scores.find(p=>norm(p.name)===norm(knownName));
    return person;
  }
  async function start() {
    const current=await collection.findOne({_id:groupId});
    if(current && activeState(current.status)) { await output('Já tem um STOP em andamento! 🎮 Para ver os pontos: *bot placar*.'); return; }
    const scores=await players();
    if(scores.length===0) { await output('Ainda não encontrei os participantes cadastrados para esse grupo.'); return; }
    const letter=draw([]);
    const game={gameId:crypto.randomUUID(),status:'thinking',round:1,letter,used:[letter],deadline:Date.now()+THINK_MS,
      answers:[],scores,history:[],endRequested:false,updatedAt:nowDate()};
    const result=await collection.updateOne({_id:groupId,status:{$nin:['thinking','collecting','scoring']}},{$set:game,$setOnInsert:{_id:groupId}},{upsert:!current});
    if(result.matchedCount||result.upsertedCount) await output('🎉 *Partida iniciada!* A pontuação ficará salva até *bot encerrar jogo*.\n\n'+beginMessage(game));
    else await output('Já existe um jogo em andamento.');
  }
  async function stop(game) {
    if(!game || !activeState(game.status)) { await output('Não há partida em andamento. Para começar: *bot stop*.');return; }
    await collection.updateOne({_id:groupId,gameId:game.gameId,status:{$in:['thinking','collecting','scoring']}},{$set:{endRequested:true,deadline:Date.now(),updatedAt:nowDate()}});
    await output('🏁 *Encerramento solicitado!* Estou fechando as respostas desta rodada e calculando o resultado final.');
    await tick();
  }
  async function handle({text,sender,senderName}) {
    const msg=String(text||'').trim();
    if(rulesCommand(msg)) {
      await output('📖 *REGRAS DO STOP*\nCada rodada sorteia uma letra e usa a ordem *Animal, Lugar, Comida, Cor, Objeto, Nome*. Lugar aceita qualquer país, cidade ou lugar de verdade. São 75 segundos e apenas 5 depois de *PRONTO*. Respondam com vírgulas ou uma palavra por linha, mesmo sem preencher todas as categorias. Ex. com M: *macaco, Marrocos,* vale pelos dois acertos. Em branco vale 0, mas os outros acertos pontuam.\n✅ Cada resposta certa vale *1 ponto*, mesmo se outro participante repetir. Resposta errada ou em branco vale *0*.\n🎯 As rodadas continuam até *bot encerrar jogo*, que mostra o placar e marca o vencedor. Para iniciar: *bot stop*.');
      return true;
    }
    if(scoreCommand(msg)) {
      const g=await collection.findOne({_id:groupId});
      await output(g ? '🏆 *PLACAR DO STOP*\n'+formatScores(g.scores)+'\nRodada: '+g.round+' • '+(g.status==='complete'?'Encerrada':'em andamento')
        : 'Ainda não há STOP. Envie *bot stop*.');
      return true;
    }
    if(endGame(msg)) { await stop(await collection.findOne({_id:groupId}));return true; }
    if(startsGame(msg)) { await start();return true; }
    if(/\bbot\b/i.test(norm(msg))) return false;
    const g=await collection.findOne({_id:groupId});
    if(!g || !['thinking','collecting'].includes(g.status)) return false;
    const words=parseAnswers(msg);
    if(!words) return false;
    // Late submissions never count; do not use the message's original timestamp.
    if(Date.now()>g.deadline) return true;
    const person=await choosePlayer(sender,senderName,g);
    if(!person) { await output('Não consegui identificar quem enviou essas respostas. Use sua conta cadastrada no grupo, por favor.');return true; }
    if(g.answers.some(x=>x.id===person.id)) { await output('✅ '+person.name+', suas respostas já foram recebidas nesta rodada.');return true; }
    const updated=await collection.updateOne(
      {_id:groupId,gameId:g.gameId,round:g.round,status:{$in:['thinking','collecting']},deadline:{$gte:Date.now()},'answers.id':{$ne:person.id}},
      {$push:{answers:{id:person.id,name:person.name,words,receivedAt:nowDate()}},$set:{updatedAt:nowDate()}}
    );
    if(updated.modifiedCount) await output('✅ Respostas de '+person.name+' registradas! Vou conferir quando o tempo terminar.');
    return true;
  }
  async function score(game) {
    const rows=[];
    for(const answer of game.answers) for(let cat=0;cat<CATEGORIES.length;cat++) rows.push({id:rows.length,owner:answer.id,cat,word:answer.words[cat]});
    const valid=await checkWords(rows,game.letter,getGeminiKey());
    const scores=game.scores.map(p=>({...p}));
    const details=[];
    for(const answer of game.answers) {
      const person=scores.find(p=>p.id===answer.id);
      if(!person) continue;
      const cells=[];
      for(const row of rows.filter(r=>r.owner===answer.id)) {
        const check=valid.get(row.id);
        const points=check?.valid ? 1 : 0;
        person.total+=points;
        cells.push(CATEGORIES[row.cat]+': '+row.word+' ('+points+(check?.unverified?' ⚠️ não confirmada':'')+')');
      }
      details.push('• '+person.name+': '+cells.join(' | '));
    }
    const result={round:game.round,letter:game.letter,details,closedAt:nowDate()};
    const latest=await collection.findOne({_id:groupId,gameId:game.gameId},{projection:{endRequested:1}});
    const completed=!!(game.endRequested || latest?.endRequested);
    const nextLetter=completed ? game.letter : draw(game.used);
    const nextUsed=completed ? game.used : game.used.length>=LETTERS.length ? [nextLetter] : [...game.used,nextLetter];
    const next={
      scores,history:[...(game.history||[]).slice(-59),result],
      answers:[],updatedAt:nowDate(),scoreLeaseUntil:null,
      status:completed?'complete':'thinking',
      round:completed?game.round:game.round+1,
      letter:nextLetter,used:nextUsed,deadline:completed?null:Date.now()+THINK_MS
    };
    const written=await collection.updateOne({_id:groupId,gameId:game.gameId,status:'scoring'},{$set:next});
    if(!written.modifiedCount) return;
    const notes=details.length?details.join('\n'):'Ninguém enviou respostas nesta rodada.';
    if(completed) await final(scores,game.round);
    else {
      await output('📋 *RESULTADOS — RODADA '+game.round+' (letra '+game.letter+')*\n'+notes+'\n\n🏆 *PLACAR ACUMULADO*\n'+formatScores(scores));
      await output(beginMessage({...game,...next}));
    }
  }
  async function final(scores,rounds) {
    if(!scores?.length) { await output('🏁 Jogo encerrado, sem pontuação registrada.');return; }
    const highest=Math.max(...scores.map(p=>p.total));
    if(highest===0) { await output('🏁 *FIM DO STOP — '+rounds+' rodadas!*\n\n🏆 *PLACAR FINAL ACUMULADO*\n'+formatScores(scores)+'\n\nNinguém marcou pontos nesta partida, então ficou sem vencedor.');return; }
    const winners=scores.filter(p=>p.total===highest);
    const mentions=winners.map(mentioned).filter(Boolean);
    const tagged=winners.map(p=>p.phone?'@'+p.phone.replace(/\D/g,''):p.name).join(' e ');
    await output('🏁 *FIM DO JOGO STOP!* Foram '+rounds+' rodadas.\n\n🏆 *PLACAR FINAL ACUMULADO*\n'+formatScores(scores)+'\n\n'+
      (winners.length===1?'🥇 *VENCEDOR(A):* ':'🥇 *EMPATE ENTRE:* ')+tagged+' — *'+highest+' pontos*! 🎉', mentions);
  }
  async function tick() {
    if(running || !isActive()) return;
    running=true;
    try {
      let g=await collection.findOne({_id:groupId});
      if(!g || !activeState(g.status)) return;
      if(g.status==='thinking' && g.deadline<=Date.now() && !g.endRequested) {
        const changed=await collection.updateOne({_id:groupId,gameId:g.gameId,status:'thinking'},{$set:{status:'collecting',deadline:Date.now()+ANSWER_MS,updatedAt:nowDate()}});
        if(changed.modifiedCount) await output('📣 *PRONTO!* ⏳ Quem ainda não respondeu tem apenas *5 segundos*! Pode enviar respostas incompletas; cada acerto válido vale ponto.');
        return;
      }
      if(g.status==='collecting' && g.deadline>Date.now() && !g.endRequested) return;
      if(g.status==='thinking' && g.deadline>Date.now() && !g.endRequested) return;
      if(g.status==='collecting'||g.status==='thinking') {
        const transitioned=await collection.updateOne({_id:groupId,gameId:g.gameId,status:g.status},{$set:{status:'scoring',scoreLeaseUntil:Date.now()+60000,updatedAt:nowDate()}});
        if(!transitioned.modifiedCount) return;
        g=await collection.findOne({_id:groupId});
      } else if (g.status==='scoring') {
        // Safely take over scoring after restart or timeout.
        const claimed=await collection.updateOne({_id:groupId,gameId:g.gameId,status:'scoring',scoreLeaseUntil:{$lte:Date.now()}},
          {$set:{scoreLeaseUntil:Date.now()+60000}});
        if(!claimed.modifiedCount) return;
        g=await collection.findOne({_id:groupId});
      }
      if(g?.status==='scoring') await score(g);
    } catch(error) { console.error('[stop] Problema no relógio/placar:',String(error.stack||error).slice(0,350)); }
    finally {running=false;}
  }
  return {handle,tick,setGroupId(next) { groupId=next; }};
}
module.exports={createStopGame,parseAnswers,startsGame,endGame,stopCommand,letterValid,knownValid:cached};
