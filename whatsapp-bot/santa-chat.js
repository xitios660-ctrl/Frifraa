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
   answer=/^(?:bot\s+)?(?:oi|ola|bom\s+dia|boa\s+tarde|boa\s+noite)[!?.\s]*$/i.test(normalize(input))
    ?'Oi, turma! 🎄 Tô aqui! O que vamos aprontar hoje?'
    :'🎄 Minha IA está demorando um pouquinho agora. Continuo aqui para o Amigo Secreto! Podem tentar me perguntar novamente em instantes. 🤖';
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
module.exports={createSantaChat,SYSTEM,restrict};
