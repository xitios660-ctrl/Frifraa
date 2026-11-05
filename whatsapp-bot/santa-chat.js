'use strict';
const BOT_WORD=/(^|[^\p{L}\p{N}_])bot(?=$|[^\p{L}\p{N}_])/iu;
const RESTRICTED=/(?:quem\s+(?:me|eu|[a-zà-ú]+)\s+(?:tirou|tirei)|quem\s+(?:tirou|pegou)\s+(?:quem|a\s+quem)|lista\s+(?:completa|dos\s+pares)|revel[ae]\s+(?:os\s+)?(?:pares|sorteados)|quem\s+tirou\s+quem|nome\s+do\s+meu\s+amigo\s+secreto)/i;
const PERSONAL=/(?:quem\s+eu\s+tirei|quem\s+me\s+caiu|meu\s+sorteado)/i;
const SYSTEM=[
  'Você é um Bot de WhatsApp alegre, inteligente e útil, criado pelo Gustavo para conversar com o grupo do Amigo Secreto.',
  'Converse em português brasileiro de forma natural, respeitosa, carinhosa e com humor leve. Responda dúvidas gerais, brincadeiras, ideias de presentes, curiosidades, histórias e assuntos do dia a dia. Prefira 1 a 4 frases, sem frases de abertura repetitivas.',
  'Este é um grupo diferente do grupo de Bomberman, STOP e Blackjack. NÃO mencione detalhes de outros grupos nem use dados de suas conversas. Você não precisa inserir links de jogos em suas respostas.',
  'Segredo absoluto: NÃO revele, adivinhe nem fabrique os pares do sorteio. NUNCA revele quem tirou outra pessoa, mesmo que alguém peça ou insista. Você NÃO recebe o mapa de pares. Para saber quem a pessoa tirou, oriente-a a escrever "presente" no privado do Bot; nunca responda esse pedido no grupo.',
  'A dinâmica: Gustavo inicia com "bot começa o sorteio"; os convidados digitam "EU" para entrar em silêncio ou "bot eu" para confirmação. Ao final, cada participante recebe o sorteado no privado, diz os presentes que gostaria de ganhar e o Bot encaminha as ideias somente para quem o tirou, em segredo.',
  'No grupo só deve responder mensagens que contenham a palavra independente "bot". Pode responder pessoas do grupo mesmo que não estejam na lista de inscritos, mas não as inscreva nem revele dados restritos.',
  'Não diga que consultou o histórico de pagamentos, sorteios ou mensagens privadas. Não invente resultados do sorteio, preços ou fatos atuais. Se não souber, admita.',
  'Não solicite senhas, códigos de verificação, CPF ou dados bancários.'
].join('\n');
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const restrict=s=>{
 const t=normalize(s);
 return RESTRICTED.test(t)||PERSONAL.test(t)||
  /(quem\s+ficou\s+com\s+quem|mostrar\s+todos\s+os\s+sorteados|revelar\s+o\s+sorteio)/.test(t);
};
function localResponse(text){
 const q=normalize(text).replace(/(^|[^\p{L}\p{N}_])bot(?=$|[^\p{L}\p{N}_])/giu,' ').trim();
 if(/(me ajuda|ajud[aá]|idei[as]|escolh|sugest|dica|compr|dar|ganh|present)/i.test(q) &&
    /(presen|ganh|compr|idei|escolh|ajud|sugest|dica)/i.test(q))
   return '🎁 Bora escolher! Até R$ 30: chocolates, caneca ou meias divertidas. Até R$ 70: livro, kit de autocuidado ou fone simples. Até R$ 120: perfume, mochila ou acessório. Me fala o orçamento e o que a pessoa gosta que eu afino as ideias! 💜';
 if(/burro|burra|lerdo|lento|nao funciona|nao responde|cade voce|caiu|travou|bug/i.test(q))
   return '😂 Essa foi merecida! O Google deu uma engasgada na minha IA, mas eu continuo aqui. Me manda uma pergunta ou me pede ideias de presentes e vou tentar resolver sem enrolação. 🎄';
 if(/^(?:bom dia|boa tarde|boa noite|oi|ola|e ai|eai|fala|tudo bem)[!?.\s]*$/i.test(q))
   return 'Oiii, pessoal! 🎄💜 Tô por aqui. Contem comigo para ajudar com o Natal, presentes e brincadeiras!';
 if(/piada|faz rir|engracad|me anima/i.test(q))
   return '🎄 Por que o Papai Noel não usa elevador? Porque ele prefere descer pela chaminé! 😅 Tem que respeitar o humor natalino duvidoso.';
 if(/quem (e|criou)|quem te fez|se apresenta|se apresente|sobre voce/i.test(q))
   return '🤖 Fui criado pelo Gustavo para animar a turma e organizar o Amigo Secreto com sigilo! Posso ajudar com presentes, perguntas e brincadeiras. 🎁';
 if(/amigo secreto|sorteio|inscricao|participar|como funciona/i.test(q))
   return '🎁 Gustavo abre as inscrições com *bot começa o sorteio*. Quem participa manda *EU*. Quando o sorteio acontecer, o nome chega só no privado. Depois cada pessoa manda suas ideias de presentes e eu encaminho para quem a tirou, em segredo. 🤫';
 if(/natal|ceia|decorac|familia/i.test(q))
   return '🎄 Para entrar no clima: um amigo secreto com valor combinado, comidas que todo mundo goste e uma lembrança especial para a família. O que vocês estão planejando para o Natal?';
 if(/obrigad|valeu|brigad/i.test(q))
   return 'Imagina! 💜 Tô aqui pra ajudar, mesmo que às vezes os servidores precisem de um puxão de orelha. 🤖';
 if(/^(?:sim|nao|ok|kkkk+|rsrs+|haha+|beleza)$/i.test(q))
   return '😂 Tô acompanhando! Se precisarem de uma mãozinha com o Natal ou com os presentes, é só chamar.';
 return '🤖 Estou com uma instabilidade temporária na IA para perguntas abertas. O sorteio continua funcionando! Se for sobre presentes, me diga para quem é e qual o orçamento que consigo sugerir opções. 🎁';
}

function createSantaChat({db,reply,sendGroup,isActive,logger=console}){
 const collection=db.collection('secret_santa_conversations');
 const canChat=(text)=>BOT_WORD.test(String(text||''));
 async function handle({groupId,text,authorName}){
  if(!canChat(text)||!isActive())return false;
  const input=String(text||'').trim().slice(0,650);
  if(restrict(input)){
   await sendGroup(groupId,'🤫 O sorteio é secreto! Não vou mostrar pares aqui. Se você participa, me chama *no privado* e manda *presente* para consultar quem tirou. 🎁');
   return true;
  }
  let history=[];
  try {
   const previous=await collection.findOne({_id:groupId});
   history=Array.isArray(previous?.messages)?previous.messages.slice(-10):[];
  }catch(e){logger.warn('[santa-chat] Histórico indisponível: '+String(e.message).slice(0,80))}
  let answer;
  try {
   answer=await reply({text:input,authorName:authorName||null,history,
    systemInstruction:SYSTEM,disableRanking:true});
  }catch(error){
   const e=String(error?.message||error);
   logger.warn('[santa-chat] IA indisponível: '+e.slice(0,85));
   answer=localResponse(input);
  }
  if(!isActive()||!answer)return true;
  await sendGroup(groupId,String(answer).slice(0,1150));
  try{
   await collection.updateOne({_id:groupId},{
    $push:{messages:{$each:[
      {role:'user',authorName:authorName||'Participante',text:input,at:new Date()},
      {role:'assistant',text:String(answer).slice(0,1150),at:new Date()}
    ],$slice:-16}},
    $set:{updatedAt:new Date()}
   },{upsert:true});
  }catch(e){logger.warn('[santa-chat] Não salvou histórico: '+String(e.message).slice(0,85))}
  return true;
 }
 return{handle,canChat};
}
module.exports={createSantaChat,SYSTEM,restrict,localResponse};
