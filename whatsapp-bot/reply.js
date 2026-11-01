'use strict';
const { GoogleGenAI } = require('@google/genai');
const URLS = Object.freeze({
  jogo: 'https://bomberman-i7lu.onrender.com/',
  cofrinho: 'https://cofrinho-bomba-party.onrender.com/',
  tv: 'https://saimo-tv.pages.dev/movies'
});
const SYSTEM = [
  'Você é o assistente virtual oficial da turma Bomba Party. Converse em português brasileiro de forma amigável, breve, natural e clara. Identifique-se como bot/assistente virtual quando perguntado; jamais finja ser uma pessoa.',
  'SEU ÚNICO ESCOPO: (1) Bomba Party, jogo online de arena de bombas para até quatro pessoas; (2) Cofrinho Party, desafio digital de 200 depósitos individuais por Mary, Kaique, Jheniffer e Gustavo; (3) Saimo TV, cujo link de filmes é informado abaixo.',
  'Links oficiais exatos: Bomba Party ' + URLS.jogo + ' | Cofrinho Party ' + URLS.cofrinho + ' | Saimo TV ' + URLS.tv,
  'No Cofrinho os botões de R$1 até R$200 somam R$20.100 por participante. A marcação no site é um registro, NÃO transfere dinheiro. Não afirme conhecer valores registrados ou contas individuais sem consultá-los.',
  'Não faça alegações sobre catálogo, filmes disponíveis, preços, permissões de exibição ou funcionalidade interna do Saimo TV; indique o link para consulta.',
  'Não invente funcionalidades do jogo. Pode explicar como entrar no site, selecionar personagem, chamar amigos e jogar na arena de bombas.',
  'Se perguntarem fora desses três temas, responda gentilmente que ajuda somente com Bomba Party, Cofrinho e Saimo TV. Não responda dúvidas médicas, políticas, pessoais, financeiras ou outras fora do escopo.',
  'Não peça senha, CPF, dados bancários nem códigos do WhatsApp. Não envie propaganda, cobranças nem mensagens sem que a pessoa entre em contato.',
  'Mensagens preferencialmente entre 1 e 4 frases. Não use blocos longos. Até 700 caracteres por resposta. Se ajudar, use um emoji discreto, nunca vários por frase.'
].join('\n');
function fallback(text) {
  const q = (text || '').toLowerCase();
  if (/\b(tv|filme|filmes|saimo|assistir|série|series)\b/i.test(q)) return '📺 Você pode acessar a Saimo TV por aqui: ' + URLS.tv + '\nPosso te ajudar com o link e o acesso ao site.';
  if (/\b(cofrinho|guardar|depósito|deposito|poupar|dinheiro|economia)\b/i.test(q)) return '🐷 O Cofrinho Party é um desafio de 200 depósitos por pessoa, de R$ 1 a R$ 200. Marque no site os valores que já guardou: ' + URLS.cofrinho;
  if (/\b(bomba|bomber|jogo|jogar|arena|personagem|partida)\b/i.test(q)) return '💣 Bomba Party é uma arena online para até quatro amigos. Entre, escolha o personagem e jogue por aqui: ' + URLS.jogo;
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|menu|ajuda|links|link|eai|e aí)[!?. ]*$/i.test(q.trim())) return 'Oi! 😊 Sou o assistente virtual da turma. Posso ajudar com Bomba Party 💣, Cofrinho 🐷 e Saimo TV 📺. Quer o link de qual deles?';
  return 'Sou o assistente virtual da turma e posso ajudar apenas com Bomba Party 💣, Cofrinho Party 🐷 e Saimo TV 📺. Sobre qual deles você quer conversar?';
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
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function reply({ key, text, history = [], model = 'gemini-3.5-flash-lite' }) {
  const ranking = await liveRanking(text);
  if (ranking) return ranking;
  if (!key) return fallback(text);
  const ai = new GoogleGenAI({ apiKey: key });
  const context = history.slice(-6).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: String(m.text || '').slice(0, 650) }]
  }));
  const contents = [...context, { role: 'user', parts: [{ text: String(text).slice(0, 850) }] }];
  const models = [...new Set([model, 'gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.8-flash'])].slice(0, 3);
  let lastError;
  for (let i = 0; i < models.length; i++) {
    try {
      const result = await ai.models.generateContent({
        model: models[i],
        contents,
        config: { systemInstruction: SYSTEM, maxOutputTokens: 700, thinkingConfig: { thinkingLevel: 'low' } }
      });
      const answer = String(result.text || '').trim();
      if (answer) return answer.slice(0, 700);
      return fallback(text);
    } catch (err) {
      lastError = err;
      if (!isTemporaryModelError(err)) throw err;
      console.warn('[gemini] Modelo indisponível:', models[i], '- tentando alternativa, tentativa', i + 1);
      if (i < models.length - 1) await pause(500 * (i + 1));
    }
  }
  throw lastError || new Error('Gemini temporariamente indisponível');
}

module.exports = { URLS, SYSTEM, fallback, reply };
