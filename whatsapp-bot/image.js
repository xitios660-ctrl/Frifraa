'use strict';
const { GoogleGenAI } = require('@google/genai');

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-lite-image';
const DAILY_IMAGE_LIMIT = 4;

function parseImageRequest(text) {
  const original = String(text || '').trim().slice(0, 1200);
  const normalized = original.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const imageTerm = /\b(imagem|imagens|foto|fotografia|arte|ilustracao|desenho|logo|logotipo|banner|cartaz|poster|figurinha|avatar|capa)\b/i;
  const action = /\b(cria|crie|criar|gera|gere|gerar|faca|faz|fazer|desenha|desenhe|desenhar|produz|produza|produzir|monta|monte|montar|quero|pode|consegue)\b/i;
  // "bot, desenha um gato" is also clearly an image request.
  if (!(imageTerm.test(normalized) && action.test(normalized)) && !/\b(desenha|desenhe|desenhar)\b/i.test(normalized)) return null;
  const prompt = original.replace(/(^|[^\p{L}\p{N}_])bot(?=$|[^\p{L}\p{N}_])/giu, '$1').trim().replace(/^[,:.!?\s-]+/, '').slice(0, 1100);
  if (prompt.length < 5) return { needsDetail: true };
  let aspectRatio = '1:1';
  if (/\b(9\s*:\s*16|vertical|story|stories|status|tela de celular)\b/i.test(normalized)) aspectRatio = '9:16';
  else if (/\b(16\s*:\s*9|horizontal|paisagem|widescreen|youtube)\b/i.test(normalized)) aspectRatio = '16:9';
  else if (/\b(4\s*:\s*5|feed do instagram)\b/i.test(normalized)) aspectRatio = '4:5';
  else if (/\b(3\s*:\s*2)\b/i.test(normalized)) aspectRatio = '3:2';
  else if (/\b(2\s*:\s*3)\b/i.test(normalized)) aspectRatio = '2:3';
  return { prompt, aspectRatio };
}

async function reserveImage(db, groupId) {
  const day = new Date().toISOString().slice(0, 10);
  const id = groupId + ':' + day;
  try {
    const result = await db.collection('image_usage').findOneAndUpdate(
      { _id: id, count: { $lt: DAILY_IMAGE_LIMIT } },
      { $inc: { count: 1 }, $setOnInsert: { createdAt: new Date() } },
      { upsert: true, returnDocument: 'after' }
    );
    return !!result;
  } catch (error) {
    // MongoDB's unique _id rejects the upsert once the limit is reached.
    if (error && error.code === 11000) return false;
    throw error;
  }
}

async function generateImage({ key, request }) {
  if (!key) throw Object.assign(new Error('GEMINI_KEY_REQUIRED'), { publicCode: 'key' });
  const ai = new GoogleGenAI({ apiKey: key });
  const result = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: 'Gere UMA imagem original seguindo com fidelidade os detalhes visuais solicitados. Preserve estilo, cores, pessoas descritas, texto desejado e cenário na medida do possível. Pedido: ' + request.prompt,
    config: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: request.aspectRatio, imageSize: '1K' } }
  });
  const parts = result?.candidates?.[0]?.content?.parts || [];
  const image = parts.find(part => part?.inlineData?.data && /^image\/(png|jpeg|webp)$/i.test(part.inlineData.mimeType || ''));
  if (!image) throw Object.assign(new Error('NO_IMAGE_RETURNED'), { publicCode: 'unavailable' });
  const buffer = Buffer.from(image.inlineData.data, 'base64');
  if (buffer.length < 1000 || buffer.length > 15 * 1024 * 1024) throw Object.assign(new Error('IMAGE_SIZE_UNSUPPORTED'), { publicCode: 'unavailable' });
  return { buffer, mimetype: image.inlineData.mimeType };
}

function imageErrorMessage(error) {
  if (error?.publicCode === 'key') return 'Ainda preciso de uma chave Gemini configurada para criar imagens. 🎨';
  const msg = String(error?.message || '');
  const code = Number(error?.status || error?.code || (msg.match(/"code"\s*:\s*(\d+)/) || [])[1]);
  if (code === 402 || code === 403 || /billing|paid tier|payment|PERMISSION_DENIED/i.test(msg))
    return 'Para criar imagens, é necessário ativar o faturamento do projeto Gemini no Google AI Studio. Os modelos de imagem não têm nível gratuito na API.';
  if (code === 429) return 'O limite de imagens da API Gemini foi atingido. Vamos tentar mais tarde? 🎨';
  if ([500, 502, 503, 504].includes(code)) return 'O Gemini está ocupado com as imagens agora. Pode tentar novamente em alguns minutos?';
  if (error?.publicCode === 'unavailable') return 'Dessa vez o Gemini não retornou uma imagem. Tente reformular o pedido, por favor. 🎨';
  return 'Não consegui gerar essa imagem agora. Tenta mudar o pedido um pouquinho?';
}

module.exports = { IMAGE_MODEL, DAILY_IMAGE_LIMIT, parseImageRequest, reserveImage, generateImage, imageErrorMessage };
