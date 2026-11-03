'use strict';
const { GoogleGenAI } = require('@google/genai');
const URLS = Object.freeze({
  jogo: 'https://bomberman-i7lu.onrender.com/',
  cofrinho: 'https://cofrinho-bomba-party.onrender.com/',
  tv: 'https://saimo-tv.pages.dev/movies'
});
const SYSTEM = [
  'Você é o Bot, um assistente de IA amigável no grupo de WhatsApp de Mary, Kaike, Gustavo e Jhenife. Converse em português brasileiro de modo leve, espontâneo e acolhedor. Adapte-se à conversa, tenha humor quando apropriado e varie sua forma de responder. Seja transparente de que é uma IA quando perguntarem; nunca finja ser uma pessoa real.',
  'Pode conversar sobre qualquer assunto cotidiano e responder perguntas gerais, curiosidades, ideias, estudos e conversas da turma. Também conhece: (1) Bomba Party, jogo online de arena de bombas para até quatro pessoas; (2) Cofrinho Party, desafio digital de 200 depósitos individuais por Mary, Kaique, Jheniffer e Gustavo; (3) Saimo TV, cujo link aparece abaixo.',
  'Links oficiais exatos: Bomba Party ' + URLS.jogo + ' | Cofrinho Party ' + URLS.cofrinho + ' | Saimo TV ' + URLS.tv,
  'No Cofrinho os botões de R$1 até R$200 somam R$20.100 por participante. A marcação no site é um registro, NÃO transfere dinheiro. Não afirme conhecer valores registrados ou contas individuais sem consultá-los.',
  'Não faça alegações sobre catálogo, filmes disponíveis, preços, permissões de exibição ou funcionalidade interna do Saimo TV; indique o link para consulta.',
  'Não invente funcionalidades do jogo. Pode explicar como entrar no site, selecionar personagem, chamar amigos e jogar na arena de bombas.',
  'Você pode responder assuntos gerais e, quando a busca do Google estiver habilitada, pesquisar fatos atuais, lançamentos, preços, acontecimentos, curiosidades e notícias. Sempre diferencie resultados pesquisados de memória; não invente fontes, datas, identidade ou verificações. Se não tiver busca disponível, admita a limitação. Para saúde, direito e dinheiro, ofereça orientação geral cuidadosa.',
  'Se a mensagem indicar Nome do participante confirmado pelo WhatsApp, você pode usar esse nome com naturalidade. Se indicar identidade não confirmada, não adivinhe quem escreveu com base no nome de exibição e não atribua dados pessoais a alguém sem prova. Quando perguntarem quem está falando, responda só com o nome confirmado, senão explique que não deu para verificar.',
  'Não peça senha, CPF, dados bancários nem códigos do WhatsApp. Não envie propaganda, cobranças nem mensagens sem que a pessoa entre em contato.',
  'Converse como em um grupo de amigos: responda ao ponto, não envie automaticamente os links, não use saudação ou introdução idêntica a cada mensagem. Prefira 1 a 4 frases, até 700 caracteres, e emojis discretos. Se houver diálogo anterior, use o contexto. Não responda com mensagens em massa.'
].join('\n');
function fallback(text) {
  const q = (text || '').toLowerCase();
  if (/\b(tv|filme|filmes|saimo|assistir|série|series)\b/i.test(q)) return '📺 Você pode acessar a Saimo TV por aqui: ' + URLS.tv + '\nPosso te ajudar com o link e o acesso ao site.';
  if (/\b(cofrinho|guardar|depósito|deposito|poupar|dinheiro|economia)\b/i.test(q)) return '🐷 O Cofrinho Party é um desafio de 200 depósitos por pessoa, de R$ 1 a R$ 200. Marque no site os valores que já guardou: ' + URLS.cofrinho;
  if (/\b(bomba|bomber|jogo|jogar|arena|personagem|partida)\b/i.test(q)) return '💣 Bomba Party é uma arena online para até quatro amigos. Entre, escolha o personagem e jogue por aqui: ' + URLS.jogo;
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|menu|ajuda|links|link|eai|e aí)[!?. ]*$/i.test(q.trim())) return 'Opa, tô aqui! 😄 Como posso ajudar vocês?';
  return 'Tive um probleminha para pensar na resposta agora 😅. Pode me perguntar de novo daqui a pouco?';
}

const PERSONS = Object.freeze({ mary: 'Mary', kaique: 'Kaique', jheniffer: 'Jheniffer', gustavo: 'Gustavo' });
const currency = amount => 'R$ ' + amount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function isRankingQuestion(value) {
  const q = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const asksLeader = /ranking|classificacao|placar|quem.*(frente|ganhando|lider|guardou mais|juntou mais|mais dinheiro)|mais.*(depositou|guardou|juntou)|primeiro lugar|lideranca/.test(q);
  const mentionsCofrinho = /porquinho|cofrinho|deposit|guardou|poupanca|ranking|placar/.test(q);
  return asksLeader && mentionsCofrinho;
}
async function liveRanking(text) {
  if (!isRankingQuestion(text)) return null;
  try {
    const res = await fetch(URLS.cofrinho + 'api/state', {
      method: 'GET',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error('Cofrinho status ' + res.status);
    const body = await res.json();
    if (!Array.isArray(body.people)) throw new Error('Cofrinho: resposta inválida');
    const people = Object.entries(PERSONS).map(([id, name]) => {
      const record = body.people.find(p => p.character === id);
      if (!record || !Number.isFinite(record.total) || !Number.isInteger(record.count)) throw new Error('Placar incompleto');
      return { name, total: record.total, count: record.count };
    }).sort((a, b) => b.total - a.total || b.count - a.count);
    const winners = people.filter(p => p.total === people[0].total);
    if (winners.length === 4 && people[0].total === 0)
      return 'Por enquanto, todo mundo está empatado no Cofrinho: ninguém marcou depósito ainda. 🐷';
    if (winners.length > 1)
      return 'Por enquanto, estão empatados na liderança do Cofrinho: ' + winners.map(p => p.name).join(', ') + ', com ' + currency(winners[0].total) + ' cada. 🐷';
    return 'Quem tá na frente no Cofrinho agora é ' + people[0].name + ', com ' + currency(people[0].total) + ' registrados (' + people[0].count + ' depósitos). 🐷 Veja a turma: ' + URLS.cofrinho;
  } catch {
    return 'Não consegui consultar o placar do Cofrinho agora. Dá para conferir os valores atualizados aqui: ' + URLS.cofrinho;
  }
}
function isTemporaryModelError(err) {
  const message = String(err?.message || '');
  const code = Number(err?.status || err?.code || (message.match(/"code"\s*:\s*(\d+)/) || [])[1]);
  return [404, 429, 500, 502, 503, 504].includes(code) || /\b(UNAVAILABLE|RESOURCE_EXHAUSTED)\b/i.test(message);
}
function shouldWebSearch(text) {
  const q=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/(^|[^\p{L}\p{N}_])bot(?=$|[^\p{L}\p{N}_])/giu,' ').trim();
  if (!q || /^(oi|ola|ola tudo bem|eai|bom dia|boa tarde|boa noite|obrigad[oa]|valeu|tchau|conta uma piada|me anima|fala comigo)[!? .]*$/.test(q)) return false;
  // Google Search is slower. Use it only for current facts or an explicit web request.
  return /(?:pesquis|procura|busca|internet|google|site|notici|ultim|recent|atualiz|agora|hoje|amanha|ontem|semana|mes passado|202[6-9]|preco|quanto custa|cotacao|dolar|clima|temperatura|previsao|evento|resultado (?:da|de|do) (?:eleicao|jogo|votacao)|lancamento|quem ganhou (?:a|o) (?:eleicao|jogo|premio)|quem venceu (?:o|a) (?:jogo|partida|eleicao))/.test(q);
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let cachedAi=null,cachedKey=null;
function clientFor(key){
  if(!cachedAi || cachedKey!==key){cachedAi=new GoogleGenAI({apiKey:key});cachedKey=key;}
  return cachedAi;
}
async function bounded(promise,timeoutMs){
  let timer;
  const expired=new Promise((_,reject)=>{
    timer=setTimeout(()=>reject(Object.assign(new Error('Tempo limite da consulta ao Gemini'),{status:504})),timeoutMs);
  });
  try{return await Promise.race([promise,expired]);}
  finally{clearTimeout(timer);}
}
async function reply({ key, text, history = [], model = 'gemini-3.5-flash-lite', authorName = null, useWebSearch = false }) {
  const ranking = await liveRanking(text);
  if (ranking) return ranking;
  if (!key) return fallback(text);
  const ai = clientFor(key);
  const context = history.slice(-6).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.text || '').slice(0, 650) }]
  }));
  const contents = [...context, { role: 'user', parts: [{ text: (authorName ? 'Participante confirmado pelo WhatsApp: ' + authorName + '. ' : 'Participante não identificado com segurança pelo WhatsApp. ') + 'Mensagem: ' + String(text).slice(0, 850) }] }];
  // Prefer Flash-Lite for conversational speed; keep a single stronger fallback.
  const models=[...new Set([model,'gemini-3.5-flash-lite','gemini-3.8-flash'])].slice(0,2);
  const startedAt=Date.now();
  const TOTAL_BUDGET_MS=13500;
  let lastError;
  for (let i = 0; i < models.length; i++) {
    try {
      const remaining=TOTAL_BUDGET_MS-(Date.now()-startedAt);
      if(remaining<2000)break;
      const result = await bounded(ai.models.generateContent({
        model: models[i],
        contents,
        config: { systemInstruction: SYSTEM, maxOutputTokens: 680, thinkingConfig: { thinkingLevel: 'low' }, ...(useWebSearch ? { tools: [{ googleSearch: {} }] } : {}) }
      }),Math.min(9500,remaining));
      const answer = String(result.text || '').trim();
      if (answer) {
        const pages = useWebSearch ? (result.candidates?.[0]?.groundingMetadata?.groundingChunks || [])
          .map(chunk => chunk.web)
          .filter(web => web && typeof web.uri === 'string' && /^https:\/\//i.test(web.uri))
          .filter((web,i,array) => array.findIndex(other=>other.uri===web.uri)===i)
          .slice(0,2) : [];
        const urls = pages.length ? '\n\n🔎 Fontes: ' + pages.map(web=>web.uri).join(' • ') : '';
        return answer.slice(0, Math.max(400, 1100-urls.length)) + urls;
      }
      return fallback(text);
    } catch (err) {
      lastError = err;
      const msg=String(err?.message||err);
      const code=Number(err?.status||err?.code||(msg.match(/"code"\s*:\s*(\d+)/)||[])[1]);
      // Quota errors are generally account-wide; retrying only delays the answer.
      if(code===429||/RESOURCE_EXHAUSTED|quota|rate limit/i.test(msg))throw err;
      if(!isTemporaryModelError(err))throw err;
      console.warn('[gemini] Modelo indisponível:',models[i],'·',Math.round(Date.now()-startedAt)+'ms');
      if(i<models.length-1 && Date.now()-startedAt<TOTAL_BUDGET_MS-2000)await pause(150);
    }
  }
  throw lastError || new Error('Gemini temporariamente indisponível');
}

module.exports = { URLS, SYSTEM, fallback, reply, shouldWebSearch };
