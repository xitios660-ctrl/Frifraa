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
async function reply({ key, text, history = [], model = 'gemini-3.8-flash' }) {
  if (!key) return fallback(text);
  const ai = new GoogleGenAI({ apiKey: key });
  const context = history.slice(-6).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text.slice(0, 650) }] }));
  const result = await ai.models.generateContent({
    model,
    contents: [...context, { role: 'user', parts: [{ text: String(text).slice(0, 850) }] }],
    config: { systemInstruction: SYSTEM, temperature: 0.45, maxOutputTokens: 700, thinkingConfig: { thinkingLevel: 'low' } }
  });
  return String(result.text || fallback(text)).trim().slice(0, 1100);
}
module.exports = { URLS, SYSTEM, fallback, reply };
