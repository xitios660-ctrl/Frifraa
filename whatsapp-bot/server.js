'use strict';
const express = require('express');
const crypto = require('node:crypto');
const path = require('node:path');
const { MongoClient } = require('mongodb');
const QRCode = require('qrcode');
const pino = require('pino');
const baileys = require('@whiskeysockets/baileys');
const { createAuthStore } = require('./auth-store');
const { reply, shouldWebSearch } = require('./reply');
const { getWeatherReply } = require('./weather');
const { createStopGame } = require('./stop-game');
const { createBlackjack } = require('./blackjack');
const { createSecretSanta, rosterFromJSON } = require('./secret-santa');
const { createSantaChat } = require('./santa-chat');
const { IMAGE_MODEL, DAILY_IMAGE_LIMIT, parseImageRequest, reserveImage, generateImage, imageErrorMessage } = require('./image');

const makeWASocket = baileys.default || baileys.makeWASocket;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const MONGODB_URI = process.env.MONGODB_URI || '';
const DB_NAME = process.env.MONGODB_DB || 'bomba_party_whatsapp';
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const GROUP_INVITE_CODE = String(process.env.WHATSAPP_GROUP_INVITE_CODE || '').trim();
const PRIMARY_GROUP_PROTECTION = process.env.PRIMARY_GROUP_ID || '120363433794510714@g.us';
const SECRET_SANTA_INVITE_CODE = String(process.env.SECRET_SANTA_GROUP_INVITE_CODE || '').trim();
if (ADMIN_PASSWORD.length < 8) throw new Error('Defina ADMIN_PASSWORD de ao menos 8 caracteres no Render (16 ou mais recomendado).');
if (!MONGODB_URI || SESSION_SECRET.length < 24) throw new Error('Defina MONGODB_URI e SESSION_SECRET no Render.');
if (DB_NAME !== 'bomba_party_whatsapp') throw new Error('Somente o banco separado bomba_party_whatsapp é permitido.');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '260kb', strict: true }));
app.use((req, res, next) => {
  res.set('X-Frame-Options', 'DENY');
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Cache-Control', 'no-store');
  res.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  next();
});

const secretBytes = Buffer.from(SESSION_SECRET);
const passwordHash = crypto.createHash('sha256').update(ADMIN_PASSWORD).digest();
function sign(value) { return crypto.createHmac('sha256', secretBytes).update(value).digest('base64url'); }
function authCookie() {
  const payload = Buffer.from(JSON.stringify({ t: Date.now(), nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
  return payload + '.' + sign(payload);
}
function authorized(req) {
  const match = (req.headers.cookie || '').match(/(?:^|;\s*)bpwa=([^;]+)/);
  if (!match) return false;
  const token = match[1];
  const sep = token.lastIndexOf('.');
  if (sep === -1) return false;
  const payload = token.slice(0, sep);
  const sig = Buffer.from(token.slice(sep + 1));
  const wanted = Buffer.from(sign(payload));
  if (sig.length !== wanted.length || !crypto.timingSafeEqual(sig, wanted)) return false;
  try {
    const t = JSON.parse(Buffer.from(payload, 'base64url').toString()).t;
    return Number.isFinite(t) && t <= Date.now() && Date.now() - t < 7 * 86400000;
  } catch { return false; }
}
function verifyPassword(guess) {
  const hash = crypto.createHash('sha256').update(String(guess || '')).digest();
  return crypto.timingSafeEqual(hash, passwordHash);
}
function guard(req, res, next) { if (!authorized(req)) return res.status(401).json({ error: 'Entre com a senha do painel.' }); next(); }
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const origin = req.get('origin');
    if (origin) {
      try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: 'Origem não permitida.' }); }
      catch { return res.status(403).json({ error: 'Origem não permitida.' }); }
    }
  }
  next();
});
const loginAttempts = new Map();
app.post('/api/login', (req, res) => {
  const addr = req.ip;
  const item = loginAttempts.get(addr) || { n: 0, until: 0 };
  if (item.until > Date.now()) return res.status(429).json({ error: 'Muitas tentativas. Tente em alguns minutos.' });
  if (!verifyPassword(req.body && req.body.password)) {
    item.n++; if (item.n >= 8) { item.until = Date.now() + 15 * 60 * 1000; item.n = 0; }
    loginAttempts.set(addr, item);
    return res.status(401).json({ error: 'Senha incorreta.' });
  }
  loginAttempts.delete(addr);
  res.setHeader('Set-Cookie', 'bpwa=' + authCookie() + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800');
  res.json({ ok: true });
});
app.get('/api/me', (req, res) => res.json({ loggedIn: authorized(req) }));
app.post('/api/logout', guard, (_req, res) => {
  res.setHeader('Set-Cookie', 'bpwa=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

const status = { phase: 'iniciando', connected: false, qr: null, lastError: '', since: null, received: 0, sent: 0, profileName: 'Pendente', profilePhoto: 'Pendente' };
let client, db, authStore, sock, reconnectTimer, launching = false, stopGame = null, blackjack = null, secretSanta = null, santaChat = null, gameClock = null;
let botEnabled = true, imagesEnabled = false, geminiKey = '', selectedGroupId = '', ready = false, stopping = false;
const history = new Map();
const queues = new Map();
const counters = new Map();
const lastMessageAt = new Map();
let lastImageRequestAt = 0;
let imagesSent = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const MAX_WEB_SEARCH_PROMPTS_PER_DAY = 30;
async function allowWebSearch(groupId) {
  // Budget prompts, not raw Google queries; one prompt may invoke multiple searches.
  const id = groupId + ':' + new Date().toISOString().slice(0,10);
  try {
    const updated = await db.collection('web_search_usage').findOneAndUpdate(
      {_id:id, count:{$lt:MAX_WEB_SEARCH_PROMPTS_PER_DAY}},
      {$inc:{count:1},$setOnInsert:{createdAt:new Date()}},
      {upsert:true,returnDocument:'after'}
    );
    return !!updated;
  } catch(e) {
    if(e?.code===11000) return false;
    console.warn('[busca] Não foi possível reservar pesquisa:',String(e.message).slice(0,100));
    return false;
  }
}
function extractText(msg) {
  let m = msg && msg.message;
  for (let i = 0; i < 3 && m; i++) {
    if (m.ephemeralMessage) m = m.ephemeralMessage.message;
    else if (m.viewOnceMessage) m = m.viewOnceMessage.message;
    else if (m.documentWithCaptionMessage) m = m.documentWithCaptionMessage.message;
    else break;
  }
  return (m && (m.conversation || (m.extendedTextMessage && m.extendedTextMessage.text) || (m.imageMessage && m.imageMessage.caption))) || '';
}
function isSelectedGroup(jid) { return typeof jid === 'string' && jid.endsWith('@g.us') && !!selectedGroupId && jid === selectedGroupId; }
function shouldAnswerGroupMessage(text) {
  // "bot" must be a separate word, regardless of case. No unsolicited replies.
  return /(^|[^\p{L}\p{N}_])bot(?=$|[^\p{L}\p{N}_])/iu.test(String(text || ''));
}
function rateAllowed(jid) {
  const now = Date.now();
  const prev = counters.get(jid) || [];
  const inDay = prev.filter(t => now - t < 86400000);
  const in15Min = inDay.filter(t => now - t < 15 * 60000);
  if (inDay.length >= 50 || in15Min.length >= 12) return false;
  if (now - (lastMessageAt.get(jid) || 0) < 1000) return false;
  inDay.push(now); counters.set(jid, inDay);
  lastMessageAt.set(jid, now);
  if (counters.size > 500) { counters.clear(); lastMessageAt.clear(); }
  return true;
}
const normalizedJid = value => typeof value === 'string' ? value.replace(/:\d+(?=@)/,'') : '';
function participantJids(message) {
  return [...new Set([
    message?.key?.participantAlt, message?.key?.participantPn, message?.key?.participant,
    message?.participantAlt, message?.participantPn, message?.participant
  ].map(normalizedJid).filter(j=>/^\d+@(lid|s\.whatsapp\.net)$/.test(j)))];
}
const e164 = jid => /^\d+@s\.whatsapp\.net$/.test(jid)
  ? '+' + (jid.split('@')[0].startsWith('55') ? jid.split('@')[0] : '55'+jid.split('@')[0]) : '';
let lastGroupIdentitySync = 0;
const verifiedSenderCache = new Map();
const santaIdentityCache = new Map();
async function syncKnownGroupIdentities(socket, groupId) {
  if (!socket || !groupId || !db) return;
  let group;
  try { group=await socket.groupMetadata(groupId); }
  catch(err) { console.warn('[identidade] Metadados não disponíveis:',String(err.message).slice(0,90)); return; }
  const contacts=await db.collection('group_contacts').find({groupId}).toArray();
  const members=group?.participants||[];
  const mapping=socket.signalRepository?.lidMapping;
  let count=0;
  for (const contact of contacts) {
    const pn=String(contact.phoneE164||'').replace(/\D/g,'')+'@s.whatsapp.net';
    if(!/^\d+@s\.whatsapp\.net$/.test(pn)) continue;
    const matched=members.find(p=>[p.id,p.phoneNumber,p.pn,p.participantAlt]
      .some(j=>normalizedJid(j)===pn));
    const aliases=new Set([pn]);
    if(matched) for(const alias of [matched.id,matched.lid,matched.phoneNumber,matched.pn])
      if(/^\d+@(lid|s\.whatsapp\.net)$/.test(normalizedJid(alias))) aliases.add(normalizedJid(alias));
    try {
      const lid=await mapping?.getLIDForPN?.(pn);
      if(/^\d+@lid$/.test(normalizedJid(lid))) aliases.add(normalizedJid(lid));
    } catch(_) { /* No verified LID mapping yet. */ }
    // Only contacts backed by a phone number supplied for this group can claim an alias.
    const ids=[...aliases];
    await db.collection('group_contacts').updateOne({_id:contact._id,groupId},
      {$addToSet:{jids:{$each:ids}},$set:{identityCheckedAt:new Date()}});
    count++;
  }
  lastGroupIdentitySync=Date.now();
  console.log('[identidade] Contatos verificados contra o grupo:',count);
}
async function getVerifiedGroupSender(message, groupId) {
  const raw=participantJids(message);
  if(!raw.length) return {name:null,jids:[]};
  const cacheId=groupId+':'+raw.slice().sort().join(':');
  const prior=verifiedSenderCache.get(cacheId);
  if(prior && prior.expiresAt>Date.now())return prior.identity;
  const candidates=await resolveStopSenderJids(raw,groupId);
  const jids=[...new Set([...raw,...candidates].map(normalizedJid).filter(Boolean))];
  const phoneNumbers=jids.map(e164).filter(Boolean);
  const filter={$or:[
    ...(phoneNumbers.length?[{phoneE164:{$in:phoneNumbers}}]:[]),
    {jids:{$in:jids}}
  ]};
  const lookup=()=>db.collection('group_contacts').find({groupId,...filter},
    {projection:{name:1,phoneE164:1,jids:1},limit:2}).toArray();
  let found=await lookup();
  if(found.length!==1 && Date.now()-lastGroupIdentitySync>120000) {
    await syncKnownGroupIdentities(sock,groupId);
    found=await lookup();
  }
  if(found.length!==1) return {name:null,jids};
  const entry=found[0];
  const known=new Set(entry.jids||[]);
  for(const jid of jids) known.add(jid);
  const missing=jids.filter(jid=>!(entry.jids||[]).includes(jid));
  if(missing.length)await db.collection('group_contacts').updateOne({_id:entry._id,groupId},
    {$addToSet:{jids:{$each:missing}}});
  const identity={name:entry.name,jids:[...known],phoneE164:entry.phoneE164};
  verifiedSenderCache.set(cacheId,{identity,expiresAt:Date.now()+45000});
  if(verifiedSenderCache.size>80)verifiedSenderCache.clear();
  return identity;
}
async function resolveSantaIdentity({jids,groupId,phones}) {
  if(!sock||!Array.isArray(jids)||!Array.isArray(phones))return null;
  const aliases=[...new Set(jids.map(normalizedJid).filter(j=>/^\d+@(lid|s\.whatsapp\.net)$/.test(j)))];
  if(!aliases.length)return null;
  const cacheKey=groupId+':'+aliases.slice().sort().join(':');
  const prior=santaIdentityCache.get(cacheKey);
  if(prior&&prior.until>Date.now())return prior.member;
  const allowed=new Set(phones.map(x=>String(x).replace(/\D/g,'')));
  // Resolve the WhatsApp sender via signed PN/LID mappings, never by pushName.
  const candidateSet=new Set(aliases);
  const mapping=sock.signalRepository?.lidMapping;
  for(const lid of aliases.filter(j=>j.endsWith('@lid'))){
    try {
      const pn=normalizedJid(await mapping?.getPNForLID?.(lid));
      if(pn.endsWith('@s.whatsapp.net'))candidateSet.add(pn);
    }catch{}
  }
  if(groupId&&![...candidateSet].some(x=>x.endsWith('@s.whatsapp.net'))){
    try{
      const meta=await sock.groupMetadata(groupId);
      for(const p of meta.participants||[]){
        const ids=[p.id,p.lid,p.phoneNumber,p.pn,p.participantAlt].map(normalizedJid);
        if(ids.some(j=>candidateSet.has(j)))for(const val of ids)if(val)candidateSet.add(val);
      }
    }catch(e){console.warn('[santa] Não foi possível consultar identidades do grupo.')}
  }
  let matches=phones.filter(phone=>candidateSet.has(phone+'@s.whatsapp.net'));
  if(matches.length===0){
    // A verified LID-to-phone lookup is also sufficient for private chats.
    for(const phone of allowed){
      try{
        const lid=normalizedJid(await mapping?.getLIDForPN?.(phone+'@s.whatsapp.net'));
        if(lid.endsWith('@lid')&&candidateSet.has(lid))matches.push(phone);
      }catch{}
    }
  }
  if(matches.length!==1)return null;
  const phone=matches[0];
  const member={phone,aliases:[...candidateSet].filter(j=>j===phone+'@s.whatsapp.net'||aliases.includes(j))};
  santaIdentityCache.set(cacheKey,{member,until:Date.now()+60000});
  if(santaIdentityCache.size>120)santaIdentityCache.clear();
  return member;
}

function asksOwnIdentity(text) {
  const q=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /\b(quem sou eu|quem ta falando|quem esta falando|sabe quem eu sou|qual e meu nome|me reconhece|quem esta te chamando)\b/.test(q);
}
async function resolveStopSenderJids(jids, groupId) {
  const out=new Set((Array.isArray(jids)?jids:[]).filter(x=>typeof x==='string'));
  if([...out].some(x=>x.endsWith('@s.whatsapp.net'))) return [...out];
  const lids=[...out].filter(x=>x.endsWith('@lid'));
  if(!lids.length || !sock) return [...out];
  // Baileys uses LID identifiers for some WhatsApp group senders.
  const store=sock.signalRepository?.lidMapping;
  for(const lid of lids) {
    try {
      const pn=await store?.getPNForLID?.(lid);
      if(typeof pn==='string' && pn.endsWith('@s.whatsapp.net')) out.add(pn);
    } catch (_) { /* Continue with group metadata when mapping is unavailable. */ }
  }
  if([...out].some(x=>x.endsWith('@s.whatsapp.net'))) return [...out];
  try {
    const group=await sock.groupMetadata(groupId);
    for(const participant of group.participants || []) {
      const aliases=[participant.id,participant.lid,participant.phoneNumber,participant.pn]
        .filter(x=>typeof x==='string');
      if(aliases.some(x=>out.has(x))) aliases.forEach(x=>out.add(x));
    }
  } catch(e) {
    console.warn('[stop] Metadados dos participantes indisponíveis:',String(e.message).slice(0,90));
  }
  return [...out];
}

async function handleMessage(message) {
  if (!ready || !status.connected || !botEnabled || !sock) return;
  const jid = message.key && message.key.remoteJid;
  if (!isSelectedGroup(jid) || message.key.fromMe || !message.key.id) return;
  const text = extractText(message).trim().slice(0, 1200);
  if (!text) return;
  const sentAt = Number(message.messageTimestamp || 0);
  if (sentAt && Math.abs(Date.now() / 1000 - sentAt) > 600) return;
  const messageId = jid + ':' + message.key.id;
  const seen = await db.collection('whatsapp_seen').updateOne(
    { _id: messageId }, { $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  if (!seen.upsertedCount) return;
  const identity = await getVerifiedGroupSender(message, jid).catch(() => ({name:null,jids:participantJids(message)}));
  const authorName = identity.name;
  if (blackjack) {
    const handledBlackjack = await blackjack.handle({text,identity});
    if (handledBlackjack) {status.received++;return;}
  }
  if (stopGame) {
    const senderJids = identity.jids;
    const handled = await stopGame.handle({
      text, senderJids, senderName: authorName, displayName: message.pushName || '',
      resolveSenderJids: jids => resolveStopSenderJids(jids, jid)
    });
    if (handled) { status.received++; return; }
  }
  const senderRateId=jid+':'+(participantJids(message)[0]||'unknown');
  if (!shouldAnswerGroupMessage(text) || !rateAllowed(senderRateId)) return;
  status.received++;
  const socket = sock;
  const oldHistory = history.get(jid) || [];
  if (asksOwnIdentity(text)) {
    const response = authorName ? 'Pelo WhatsApp, quem me chamou foi ' + authorName + '. 😊' :
      'Ainda não consegui confirmar seu nome pelo identificador do WhatsApp. Não vou adivinhar. 😊';
    void socket.sendPresenceUpdate('composing', jid).catch(()=>{});
    if (sock === socket && isSelectedGroup(jid) && status.connected)
      await socket.sendMessage(jid,{text:response});
    await socket.sendPresenceUpdate('paused', jid).catch(()=>{});
    status.sent++;
    return;
  }
  // Weather comes from a free live-data provider; never consumes Gemini quota.
  const weatherReply = await getWeatherReply(text);
  if (weatherReply) {
    try {
      void socket.sendPresenceUpdate('composing', jid).catch(() => {});
      if (!botEnabled || !status.connected || !isSelectedGroup(jid) || socket !== sock) return;
      await socket.sendMessage(jid,{text:weatherReply});
      status.sent++;
      history.set(jid, [...oldHistory, {role:'user',text,authorName}, {role:'assistant',text:weatherReply}].slice(-8));
    } finally { await socket.sendPresenceUpdate('paused', jid).catch(() => {}); }
    return;
  }
  const imageRequest = parseImageRequest(text);
  if (imageRequest) {
    const socket = sock;
    let resultMessage = '';
    if (!imagesEnabled) {
      resultMessage = 'Posso criar imagens também! 🎨 O administrador precisa ativar essa função no painel, pois a API Gemini cobra por imagem.';
    } else if (imageRequest.needsDetail) {
      resultMessage = 'Me conta como você quer a imagem: assunto, estilo, cores e formato. 🎨';
    } else if (!geminiKey) {
      resultMessage = 'Preciso da chave Gemini configurada no painel para criar imagens. 🎨';
    } else if (Date.now() - lastImageRequestAt < 120000) {
      resultMessage = 'Para evitar pedidos demais, espere uns 2 minutinhos antes da próxima imagem, tá? 🎨';
    } else {
      try {
        const allowed = await reserveImage(db, jid);
        if (!allowed) {
          resultMessage = 'O grupo já usou as ' + DAILY_IMAGE_LIMIT + ' tentativas de imagem de hoje. Amanhã tem mais! 🎨';
        } else {
          lastImageRequestAt = Date.now();
          await socket.sendPresenceUpdate('composing', jid).catch(() => {});
          const generated = await generateImage({ key: geminiKey, request: imageRequest });
          if (!botEnabled || !imagesEnabled || !status.connected || !isSelectedGroup(jid) || socket !== sock) return;
          await socket.sendMessage(jid, { image: generated.buffer, mimetype: generated.mimetype, caption: '🎨 Prontinho! Imagem criada com o Gemini.' });
          status.sent++;
          imagesSent++;
          history.set(jid, [...oldHistory, { role: 'user', text }, { role: 'assistant', text: '[Imagem gerada e enviada ao grupo]' }].slice(-6));
          return;
        }
      } catch (error) {
        console.error('[gemini-image] Falha:', String(error.message || error).slice(0, 120));
        resultMessage = imageErrorMessage(error);
      } finally {
        await socket.sendPresenceUpdate('paused', jid).catch(() => {});
      }
    }
    if (resultMessage && botEnabled && status.connected && isSelectedGroup(jid) && socket === sock) {
      await socket.sendMessage(jid, { text: resultMessage });
      status.sent++;
    }
    return;
  }
  let answer;
  const responseStarted=Date.now();
  void socket.sendPresenceUpdate('composing',jid).catch(()=>{});
  const webSearch = shouldWebSearch(text) ? await allowWebSearch(jid) : false;
  try { answer = await reply({ key: geminiKey, model: MODEL, text, history: oldHistory, authorName, useWebSearch: webSearch }); }
  catch (error) {
    const msg=String(error?.message||error);
    const statusCode=Number(error?.status||error?.code||(msg.match(/"code"\s*:\s*(\d+)/)||[])[1]);
    console.error('[gemini] Resposta indisponível:', msg.slice(0,150));
    if (statusCode===429 || /quota|RESOURCE_EXHAUSTED|rate limit/i.test(msg)) {
      answer='⚠️ O limite de uso do Gemini dessa conta foi atingido. Não consigo responder essa pergunta agora, mas o clima e o STOP continuam disponíveis. Tenta mais tarde! 🤖';
    } else if (statusCode===401 || statusCode===403 || /API_KEY_INVALID/i.test(msg)) {
      answer='A chave do Gemini está com problema de autorização. O administrador precisa conferir a configuração no painel. 🔑';
    } else {
      answer=await reply({key:'',text});
    }
  }
  if (!botEnabled || !status.connected || !isSelectedGroup(jid) || socket !== sock || !answer) return;
  try {
    // The Gemini call already took time: don't add a fake typing delay.
    if (!botEnabled || !status.connected || !isSelectedGroup(jid) || socket !== sock) return;
    await socket.sendMessage(jid, { text: answer });
    status.sent++;
    const elapsed=Date.now()-responseStarted;
    console.log('[latency] Resposta do Bot: '+elapsed+'ms'+(webSearch?' (com busca)':''));
    history.set(jid, [...oldHistory, { role: 'user', text, authorName }, { role: 'assistant', text: answer }].slice(-8));
    if (history.size > 200) history.clear();
  } finally { await socket.sendPresenceUpdate('paused', jid).catch(() => {}); }
}
async function handleSecretSantaGroupMessage(message) {
  if(!ready||!status.connected||!botEnabled||!secretSanta||!sock)return;
  const groupId=message.key?.remoteJid;
  if(!secretSanta.mightHandleGroup(groupId,extractText(message)))return;
  if(message.key.fromMe||!message.key.id)return;
  const text=extractText(message).trim().slice(0,650);
  if(!text)return;
  const sentAt=Number(message.messageTimestamp||0);
  if(sentAt&&Math.abs(Date.now()/1000-sentAt)>600)return;
  const seen=await db.collection('whatsapp_seen').updateOne(
    {_id:'santa:'+groupId+':'+message.key.id},{$setOnInsert:{createdAt:new Date()}},{upsert:true});
  if(!seen.upsertedCount)return;
  const handled=await secretSanta.groupMessage({
    groupId,text,jids:participantJids(message)
  });
  if(handled){status.received++;return;}
  if(!santaChat?.canChat(text))return;
  const senderKey=groupId+':santa:'+(participantJids(message)[0]||'unknown');
  if(!rateAllowed(senderKey))return;
  const authorName=await secretSanta.verifiedName(participantJids(message),groupId).catch(()=>null);
  const socket=sock;
  if(socket && status.connected)void socket.sendPresenceUpdate('composing',groupId).catch(()=>{});
  const started=Date.now();
  try {
    const replied=await santaChat.handle({groupId,text,authorName});
    if(replied){
      status.received++;
      console.log('[santa-chat] Resposta enviada em '+(Date.now()-started)+'ms');
    }
  }finally {
    if(socket===sock)void socket.sendPresenceUpdate('paused',groupId).catch(()=>{});
  }
}
async function handlePrivateMessage(msg) {
  if(!ready||!status.connected||!botEnabled||!sock)return;
  const jid=normalizedJid(msg.key?.remoteJid);
  if(!/^\d+@(lid|s\.whatsapp\.net)$/.test(jid)||msg.key?.fromMe||!msg.key?.id)return;
  const text=extractText(msg).trim().slice(0,550);
  if(!text)return;
  const sentAt=Number(msg.messageTimestamp||0);
  if(sentAt&&Math.abs(Date.now()/1000-sentAt)>600)return;
  const seen=await db.collection('whatsapp_seen').updateOne(
    {_id:'private:'+jid+':'+msg.key.id},{$setOnInsert:{createdAt:new Date()}},{upsert:true});
  if(!seen.upsertedCount)return;
  // Only resolve identities for Blackjack if a Blackjack round is active.
  // Otherwise private gift suggestions go straight to Secret Santa, with no old-group lookup.
  if(blackjack && selectedGroupId && await blackjack.isRunning()) {
    const identityMessage={key:{participant:jid,participantAlt:normalizedJid(msg.key.remoteJidAlt)},participant:jid};
    const identity=await getVerifiedGroupSender(identityMessage,selectedGroupId)
      .catch(()=>({name:null,jids:[jid]}));
    if(identity?.phoneE164){
      const handled=await blackjack.handlePrivate({text,identity,remoteJid:jid});
      if(handled){status.received++;return;}
    }
  }
  if(secretSanta){
    const handled=await secretSanta.privateMessage({text,
      jids:[jid,normalizedJid(msg.key.remoteJidAlt)].filter(Boolean)});
    if(handled)status.received++;
  }
}


function queueContact(msg) {
  const jid=msg.key&&msg.key.remoteJid;
  const oldGroup=isSelectedGroup(jid);
  const santaGroup=!oldGroup&&secretSanta?.mightHandleGroup(jid,extractText(msg));
  const privateChat=typeof jid==='string'&&/^\d+@(lid|s\.whatsapp\.net)$/.test(jid);
  if(!oldGroup&&!santaGroup&&!privateChat)return;
  const sender=oldGroup||santaGroup?participantJids(msg).slice().sort()[0]||'unknown':'';
  const queueKey=privateChat?jid:jid+':'+sender;
  const receivedAt=Date.now();
  const prior=queues.get(queueKey)||Promise.resolve();
  const next=prior.catch(()=>{}).then(async()=>{
    const waited=Date.now()-receivedAt;
    if(waited>=1500)console.warn('[latency] Fila WhatsApp aguardou '+waited+'ms');
    if(oldGroup)return handleMessage(msg);
    if(santaGroup)return handleSecretSantaGroupMessage(msg);
    return handlePrivateMessage(msg);
  });
  queues.set(queueKey,next);
  next.catch(e=>console.error('[whatsapp] Mensagem não processada:',String(e.message).slice(0,130))).finally(()=>{
    if(queues.get(queueKey)===next)queues.delete(queueKey);
  });
}
// Secret Santa's invite is NEVER written to the legacy group setting.
async function activateSantaInvitedGroup(socket) {
  if(!secretSanta||!SECRET_SANTA_INVITE_CODE||!status.connected||socket!==sock||stopping)return;
  try {
    if(!/^[a-zA-Z0-9_-]{12,90}$/.test(SECRET_SANTA_INVITE_CODE))
      throw new Error('Código de convite do Amigo Secreto inválido.');
    const invitation=await socket.groupGetInviteInfo(SECRET_SANTA_INVITE_CODE);
    const target=String(invitation?.id||'');
    if(!/^\d+(?:-\d+)?@g\.us$/.test(target))
      throw new Error('O WhatsApp não retornou um grupo válido para o Amigo Secreto.');
    if(target===selectedGroupId||target===PRIMARY_GROUP_PROTECTION)
      throw new Error('O convite do Amigo Secreto aponta para o grupo original.');
    const memberships=await socket.groupFetchAllParticipating();
    if(!memberships||!Object.prototype.hasOwnProperty.call(memberships,target))
      throw new Error('O Bot ainda não aparece como participante do grupo do Amigo Secreto.');
    await secretSanta.bindVerifiedInvite(target);
    console.log('[santa] Grupo do convite confirmado e vinculado, sem alterar o grupo original.');
  }catch(e){
    console.warn('[santa] Não vinculou o convite: '+String(e.message).slice(0,150));
  }
}
function scheduleReconnect(delay = 4500) {
  if (stopping || reconnectTimer) return;
  reconnectTimer = setTimeout(() => { reconnectTimer = null; startWhatsApp().catch(e => console.error('[whatsapp] Reconexão:', e.message)); }, delay);
}
async function activateInvitedGroup(socket) {
  if (!GROUP_INVITE_CODE || !status.connected || socket !== sock || stopping) return;
  try {
    if (!/^[a-zA-Z0-9_-]{12,90}$/.test(GROUP_INVITE_CODE)) throw new Error('O código do convite do grupo é inválido.');
    const invitation = await socket.groupGetInviteInfo(GROUP_INVITE_CODE);
    const target = String(invitation && invitation.id || '');
    if (!/^\d+(?:-\d+)?@g\.us$/.test(target)) throw new Error('Não foi possível identificar o grupo pelo convite.');
    let participating = await socket.groupFetchAllParticipating();
    if (!participating || !Object.prototype.hasOwnProperty.call(participating, target)) {
      console.log('[grupo] Tentando entrar no grupo informado pelo administrador.');
      const accepted = await socket.groupAcceptInvite(GROUP_INVITE_CODE);
      // An admin-approved group can return a pending request, not membership.
      if (accepted && accepted !== target) console.warn('[grupo] Convite enviado; verificando entrada.');
      for (let attempt = 0; attempt < 3; attempt++) {
        await sleep(2000);
        if (socket !== sock || !status.connected) return;
        participating = await socket.groupFetchAllParticipating();
        if (participating && Object.prototype.hasOwnProperty.call(participating, target)) break;
      }
      if (!participating || !Object.prototype.hasOwnProperty.call(participating, target)) {
        status.lastError = 'A entrada no grupo está pendente de aprovação. O Bot permanece em silêncio.';
        console.warn('[grupo] Aguardando participação confirmada no grupo.');
        return;
      }
    }
    if (socket !== sock || !status.connected || stopping) return;
    await db.collection('settings').updateOne(
      { _id: 'bot' }, { $set: { groupId: target, groupUpdatedAt: new Date() } }, { upsert: true }
    );
    selectedGroupId = target;
    stopGame?.setGroupId(target);
    blackjack?.setGroupId(target);
    syncKnownGroupIdentities(socket,target).catch(error=>console.warn('[identidade] Sincronização:',String(error.message).slice(0,100)));
    history.clear();
    queues.clear();
    status.lastError = '';
    console.log('[grupo] Grupo autorizado conectado; respostas restritas à palavra bot.');
  } catch (error) {
    selectedGroupId = '';
    status.lastError = 'Não foi possível entrar no grupo do convite. Verifique o link e as permissões do grupo.';
    console.error('[grupo] Falha ao entrar:', String(error.message || error).slice(0, 160));
  }
}

async function startWhatsApp() {
  if (launching || stopping || !ready) return;
  launching = true;
  const previous = sock;
  try {
    if (previous) { previous.ev.removeAllListeners('connection.update'); previous.ev.removeAllListeners('messages.upsert'); previous.ev.removeAllListeners('creds.update'); try { previous.ws.close(); } catch {} }
    const auth = await authStore.initialize();
    status.phase = 'conectando';
    status.connected = false;
    status.qr = null;
    const socket = makeWASocket({
      auth: auth.state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: true,
      getMessage: async () => undefined
    });
    sock = socket;
    socket.ev.on('creds.update', () => auth.saveCreds().catch(error => {
      console.error('[whatsapp] Falha ao salvar sessão:', error.message);
      status.lastError = 'Falha ao salvar a sessão do WhatsApp.';
    }));
    socket.ev.on('messages.upsert', update => {
      if (update.type !== 'notify' || !Array.isArray(update.messages)) return;
      for (const msg of update.messages) queueContact(msg);
    });
    socket.ev.on('connection.update', async update => {
      if (socket !== sock || stopping) return;
      if (update.qr) {
        status.qr = update.qr;
        status.phase = 'aguardando-qr';
        status.connected = false;
      }
      if (update.connection === 'open') {
        status.qr = null;
        status.phase = 'conectado';
        status.connected = true;
        status.since = new Date().toISOString();
        status.lastError = '';
        await socket.sendPresenceUpdate('available').catch(() => {});
        activateInvitedGroup(socket).catch(error => console.error('[grupo] Vinculação:', String(error.message).slice(0, 100)));
        activateSantaInvitedGroup(socket).catch(error=>console.error('[santa] Vinculação:',String(error.message).slice(0,100)));
        applyBotName(socket).catch(error => console.error('[perfil] Nome:', String(error.message).slice(0, 90)));
      }
      if (update.connection === 'close') {
        status.connected = false;
        status.qr = null;
        const code = update.lastDisconnect && update.lastDisconnect.error && update.lastDisconnect.error.output && update.lastDisconnect.error.output.statusCode;
        const loggedOut = code === (baileys.DisconnectReason && baileys.DisconnectReason.loggedOut) || code === 401;
        status.phase = loggedOut ? 'desvinculado' : 'reconectando';
        status.lastError = loggedOut ? 'O WhatsApp desvinculou a sessão. Gere um QR Code novo no painel.' : 'Conexão interrompida; tentando reconectar.';
        if (!loggedOut) scheduleReconnect();
      }
    });
  } catch (error) {
    status.phase = 'erro';
    status.lastError = 'Não foi possível iniciar o WhatsApp.';
    console.error('[whatsapp] Início:', error.message);
    scheduleReconnect(12000);
  } finally { launching = false; }
}
app.get('/api/health', (_req, res) => res.status(ready ? 200 : 503).json({ service: 'bomba-party-whatsapp', ready }));
app.get('/api/status', guard, (_req, res) => res.json({
  phase: status.phase, connected: status.connected, since: status.since,
  lastError: status.lastError, received: status.received, sent: status.sent,
  botEnabled, geminiConfigured: !!geminiKey, model: MODEL, groupOnly: true, selectedGroupId, profileName: status.profileName, profilePhoto: status.profilePhoto,
  imagesEnabled, imageModel: IMAGE_MODEL, dailyImageLimit: DAILY_IMAGE_LIMIT, imagesSent
}));
async function applyBotName(socket) {
  if (!socket || !socket.user || !socket.user.id) return;
  const saved = await db.collection('settings').findOne({ _id: 'whatsapp_profile' });
  if (saved && saved.name === 'Bot') { status.profileName = 'Bot'; return; }
  await socket.updateProfileName('Bot');
  await db.collection('settings').updateOne({ _id: 'whatsapp_profile' }, { $set: { name: 'Bot', updatedAt: new Date() } }, { upsert: true });
  status.profileName = 'Bot';
  console.log('[perfil] Nome da conta WhatsApp atualizado para Bot.');
}
app.post('/api/profile', guard, async (req, res) => {
  if (!status.connected || !sock || !sock.user || !sock.user.id) return res.status(409).json({ error: 'Conecte o WhatsApp antes de editar o perfil.' });
  const socket = sock;
  try {
    await applyBotName(socket);
    let imageChanged = false;
    if (req.body && req.body.avatar) {
      const image = String(req.body.avatar);
      if (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(image)) return res.status(400).json({ error: 'Envie uma imagem JPEG válida.' });
      const bytes = Buffer.from(image.split(',')[1], 'base64');
      if (bytes.length < 1000 || bytes.length > 150000 || bytes[0] !== 255 || bytes[1] !== 216) return res.status(400).json({ error: 'A imagem deve ser JPEG e ter no máximo 150 KB.' });
      const jid = baileys.jidNormalizedUser ? baileys.jidNormalizedUser(socket.user.id) : socket.user.id;
      await socket.updateProfilePicture(jid, bytes);
      await db.collection('settings').updateOne({ _id: 'whatsapp_profile' }, { $set: { photoUpdatedAt: new Date() } }, { upsert: true });
      imageChanged = true;
      status.profilePhoto = 'Aplicada';
      console.log('[perfil] Foto de perfil alterada na conta WhatsApp.');
    }
    res.json({ ok: true, name: 'Bot', imageChanged });
  } catch (error) {
    console.error('[perfil] Não foi possível atualizar:', String(error.message).slice(0, 120));
    res.status(502).json({ error: 'O WhatsApp não aceitou a atualização do perfil. Tente novamente.' });
  }
});

app.get('/api/groups', guard, async (_req, res) => {
  if (!status.connected || !sock) return res.status(409).json({ error: 'Conecte o WhatsApp para ver os grupos.' });
  try {
    const joined = await sock.groupFetchAllParticipating();
    const groups = Object.values(joined || {}).filter(g => g && typeof g.id === 'string' && g.id.endsWith('@g.us')).map(g => ({
      id: g.id, name: String(g.subject || 'Grupo sem nome').slice(0, 100),
      members: Array.isArray(g.participants) ? g.participants.length : null
    })).sort((a,b) => a.name.localeCompare(b.name, 'pt-BR'));
    return res.json({ groups, selectedGroupId, inviteManaged: !!GROUP_INVITE_CODE });
  } catch (e) {
    console.error('[grupos] Consulta indisponível:', String(e.message).slice(0, 100));
    return res.status(502).json({ error: 'Não foi possível listar os grupos. Tente atualizar.' });
  }
});
app.get('/api/qr', guard, async (_req, res) => {
  if (!status.qr) return res.json({ available: false, phase: status.phase });
  try { return res.json({ available: true, image: await QRCode.toDataURL(status.qr, { margin: 2, width: 450, errorCorrectionLevel: 'M' }) }); }
  catch { return res.status(500).json({ error: 'Não foi possível gerar QR Code.' }); }
});
app.post('/api/settings', guard, async (req, res) => {
  try {
    const update = {};
    if ('enabled' in req.body) {
      if (typeof req.body.enabled !== 'boolean') return res.status(400).json({ error: 'Estado inválido.' });
      update.enabled = req.body.enabled;
    }
    if ('groupId' in req.body) {
      const groupId = req.body.groupId;
      if (typeof groupId !== 'string' || (groupId && (!/^\d+(?:-\d+)?@g\.us$/.test(groupId) || groupId.length > 120))) {
        return res.status(400).json({ error: 'Grupo do WhatsApp inválido.' });
      }
      if (GROUP_INVITE_CODE) return res.status(409).json({ error: 'O grupo já está fixado pelo convite configurado no Render; não é possível alterar aqui.' });
      if (groupId) {
        if (!status.connected || !sock) return res.status(409).json({ error: 'Conecte o WhatsApp antes de escolher o grupo.' });
        const groups = await sock.groupFetchAllParticipating();
        if (!Object.hasOwn(groups || {}, groupId)) return res.status(400).json({ error: 'Esse grupo não pertence ao WhatsApp conectado.' });
      }
      update.groupId = groupId;
    }
    if ('imagesEnabled' in req.body) {
      if (typeof req.body.imagesEnabled !== 'boolean') return res.status(400).json({ error: 'Estado da geração de imagens inválido.' });
      update.imagesEnabled = req.body.imagesEnabled;
    }
    if ('geminiKey' in req.body) {
      const value = String(req.body.geminiKey || '').trim();
      if (value && (value.length < 15 || value.length > 500)) return res.status(400).json({ error: 'Chave Gemini inválida.' });
      if (value) update.geminiKey = authStore.codec.encrypt(value);
    }
    if (!Object.keys(update).length) return res.status(400).json({ error: 'Nenhuma configuração informada.' });
    await db.collection('settings').updateOne({ _id: 'bot' }, { $set: update }, { upsert: true });
    if ('enabled' in update) botEnabled = update.enabled;
    if ('imagesEnabled' in update) imagesEnabled = update.imagesEnabled;
    if ('groupId' in update) { selectedGroupId = update.groupId; stopGame?.setGroupId(selectedGroupId); blackjack?.setGroupId(selectedGroupId); history.clear(); queues.clear(); verifiedSenderCache.clear(); santaIdentityCache.clear(); }
    if ('geminiKey' in update) geminiKey = String(req.body.geminiKey).trim();
    return res.json({ ok: true, botEnabled, geminiConfigured: !!geminiKey, selectedGroupId, imagesEnabled });
  } catch (error) {
    console.error('[settings]', error.message);
    return res.status(500).json({ error: 'Não foi possível salvar a configuração.' });
  }
});
app.post('/api/test', guard, async (req, res) => {
  const text = String(req.body && req.body.text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Digite uma mensagem.' });
  try {
    const answer = await reply({ key: geminiKey, model: MODEL, text });
    res.json({ answer, usingGemini: !!geminiKey });
  } catch (error) {
    console.error('[test Gemini]', String(error.message).slice(0, 150));
    res.status(502).json({ error: 'Não foi possível consultar o Gemini. Confira a chave e a cota da API.' });
  }
});
app.post('/api/reconnect', guard, (_req, res) => {
  if (status.phase === 'desvinculado') return res.status(409).json({ error: 'Sessão desvinculada. Use Gerar novo QR Code.' });
  status.phase = 'reconectando';
  scheduleReconnect(100);
  res.json({ ok: true });
});
app.post('/api/reset-session', guard, async (req, res) => {
  if (!req.body || req.body.confirm !== 'NOVO QR') return res.status(400).json({ error: 'Confirmação necessária.' });
  botEnabled = false;
  try {
    if (sock) { try { sock.ev.removeAllListeners('connection.update'); sock.ev.removeAllListeners('messages.upsert'); sock.ev.removeAllListeners('creds.update'); sock.ws.close(); } catch {} }
    sock = null;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    await db.collection('whatsapp_auth').deleteMany({});
    history.clear(); queues.clear(); counters.clear(); lastMessageAt.clear(); verifiedSenderCache.clear(); santaIdentityCache.clear();
    status.qr = null; status.connected = false; status.phase = 'conectando';
    await db.collection('settings').updateOne({ _id: 'bot' }, { $set: { enabled: true } }, { upsert: true });
    botEnabled = true;
    startWhatsApp().catch(error => console.error('[whatsapp] reset:', error.message));
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: 'Não foi possível criar nova sessão.' }); }
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, _req, res, _next) => { console.error('[server]', err.message); res.status(500).json({ error: 'Erro interno.' }); });

async function main() {
  client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 11000, maxPoolSize: 8, retryWrites: true });
  await client.connect();
  db = client.db(DB_NAME);
  await db.command({ ping: 1 });
  await db.collection('whatsapp_seen').createIndex({ createdAt: 1 }, { expireAfterSeconds: 7 * 86400 });
  authStore = createAuthStore(db, SESSION_SECRET);
  const record = await db.collection('settings').findOne({ _id: 'bot' });
  botEnabled = typeof record?.enabled === 'boolean' ? record.enabled : true;
  imagesEnabled = typeof record?.imagesEnabled === 'boolean' ? record.imagesEnabled : false;
  selectedGroupId = !GROUP_INVITE_CODE && typeof record?.groupId === 'string' && record.groupId.endsWith('@g.us') ? record.groupId : '';
  if (record && record.geminiKey) try { geminiKey = authStore.codec.decrypt(record.geminiKey); } catch { console.error('[settings] Chave Gemini indisponível; recadastre-a.'); }
  if (!geminiKey && process.env.GEMINI_API_KEY) geminiKey = process.env.GEMINI_API_KEY.trim();
  // The Secret Santa group is deliberately independent of the legacy bot group.
  const santaRoster=rosterFromJSON(process.env.SECRET_SANTA_PARTICIPANTS||'[]');
  if(santaRoster.length>=3) {
    secretSanta=createSecretSanta({
      db,roster:santaRoster,adminPhone:process.env.SECRET_SANTA_ADMIN_PHONE||'',
      isOriginalGroup:groupId=>groupId===selectedGroupId||groupId===PRIMARY_GROUP_PROTECTION,
      strictInviteGroup:!!SECRET_SANTA_INVITE_CODE,
      resolveIdentity:resolveSantaIdentity,
      isActive:()=>botEnabled&&status.connected&&!!sock,
      sendGroup:async(groupId,text)=>{
        if(!sock||!botEnabled||!status.connected||!secretSanta?.isBoundGroup(groupId))return;
        const socket=sock;
        await socket.sendMessage(groupId,{text});
        if(socket===sock)status.sent++;
      },
      sendPrivate:async (recipient,text)=>{
        if(!sock||!botEnabled||!status.connected||!secretSanta?.getBoundGroup())throw new Error('Bot offline');
        const phone=String(recipient?.phone||'').replace(/\D/g,'');
        if(!santaRoster.some(p=>p.phone===phone))throw new Error('Destinatário não autorizado');
        const pn=phone+'@s.whatsapp.net',socket=sock;
        let verifiedLid=null;
        try{
          const lid=normalizedJid(await socket.signalRepository?.lidMapping?.getLIDForPN?.(pn));
          if(/^\d+@lid$/.test(lid))verifiedLid=lid;
        }catch{}
        const candidates=[...new Set([verifiedLid,pn].filter(Boolean))];
        let failure;
        for(const to of candidates) {
          try{
            const sent=await socket.sendMessage(to,{text});
            if(!sent?.key?.id)throw new Error('WhatsApp não aceitou o envio');
            status.sent++;return {messageId:sent.key.id,jid:to};
          }catch(e){failure=e}
        }
        throw failure||new Error('Não foi possível enviar a mensagem privada');
      }
    });
    await secretSanta.init();
    santaChat=createSantaChat({
      db,
      isActive:()=>botEnabled&&status.connected&&!!sock,
      reply:({text,history,authorName,systemInstruction,disableRanking})=>{
        if(!geminiKey)throw new Error('IA temporariamente sem configuração');
        return reply({key:geminiKey,model:MODEL,text,history,authorName,systemInstruction,
          disableRanking,useWebSearch:false});
      },
      sendGroup:async(groupId,text)=>{
        if(!sock||!botEnabled||!status.connected||!secretSanta?.isBoundGroup(groupId))return;
        const current=sock;
        const sent=await current.sendMessage(groupId,{text});
        if(current===sock&&sent?.key?.id)status.sent++;
      }
    });
    console.log('[santa] Amigo Secreto preparado: '+secretSanta.rosterCount()+' convidados; grupo independente, chat com memória separada.');
  }
  stopGame = createStopGame({
    db,
    groupId: selectedGroupId || null,
    getGeminiKey: () => geminiKey,
    isActive: () => botEnabled && status.connected && isSelectedGroup(selectedGroupId),
    send: async ({text, mentions = []}) => {
      if (!sock || !botEnabled || !isSelectedGroup(selectedGroupId) || !status.connected) return;
      const socket = sock;
      try {
        void socket.sendPresenceUpdate('composing', selectedGroupId).catch(() => {});
        if (!botEnabled || !status.connected || socket !== sock || !isSelectedGroup(selectedGroupId)) return;
        await socket.sendMessage(selectedGroupId,{text,mentions});
        status.sent++;
      } finally {
        await socket.sendPresenceUpdate('paused', selectedGroupId).catch(() => {});
      }
    }
  });
  blackjack = createBlackjack({
    db,
    getGroup: () => selectedGroupId,
    isActive: () => botEnabled && status.connected && isSelectedGroup(selectedGroupId),
    sendGroup: async ({text,mentions=[]}) => {
      if(!sock || !botEnabled || !isSelectedGroup(selectedGroupId) || !status.connected)return;
      const socket=sock;
      try {
        void socket.sendPresenceUpdate('composing',selectedGroupId).catch(()=>{});
        if(socket!==sock || !botEnabled || !status.connected || !isSelectedGroup(selectedGroupId))return;
        await socket.sendMessage(selectedGroupId,{text,mentions});
        status.sent++;
      }finally {await socket.sendPresenceUpdate('paused',selectedGroupId).catch(()=>{});}
    },
    sendPrivate: async (recipient,content) => {
      if(!sock || !botEnabled || !status.connected || !isSelectedGroup(selectedGroupId))throw Error('WhatsApp offline');
      const socket=sock;
      if(!socket.user)throw Error('WhatsApp sem sessão');
      const candidates=[...(recipient?.jids||[]).filter(j=>typeof j==='string' && j.endsWith('@lid')),
        recipient?.jid,...(recipient?.jids||[])].filter(j=>typeof j==='string' &&
          /^\d+@(lid|s\.whatsapp\.net)$/.test(j));
      const unique=[...new Set(candidates)];
      if(!unique.length)throw Error('Nenhum destino privado confirmado para este participante');
      let lastError=null;
      for(const to of unique){
        try {
          const result=await socket.sendMessage(to,content);
          if(!result?.key?.id)throw Error('WhatsApp não confirmou o envio da mensagem');
          status.sent++;
          console.log('[blackjack] Carta encaminhada ao WhatsApp via '+to.split('@')[1]);
          return {jid:to,messageId:result.key.id};
        } catch(error) {
          lastError=error;
          console.warn('[blackjack] Falha no encaminhamento privado ('+to.split('@')[1]+'): '+String(error.message).slice(0,100));
        }
      }
      throw lastError||new Error('Não foi possível encaminhar a mensagem privada');
    }
  });
  gameClock = setInterval(() => {
    stopGame?.tick().catch(e => console.error('[stop] Timer:',e.message));
    blackjack?.tick().catch(e => console.error('[blackjack] Timer:',e.message));
    secretSanta?.tick().catch(e => console.error('[santa] Timer:',String(e.message).slice(0,100)));
  },1000);
  ready = true;
  console.log('[bot] MongoDB conectado; configurações e sessão persistidas.');
  await startWhatsApp();
}
const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, '0.0.0.0', () => console.log('[bot] Painel na porta ' + port));
main().catch(error => { console.error('[bot] Não foi possível iniciar:', error.message); status.phase = 'erro'; status.lastError = 'Banco de dados indisponível.'; });
process.on('SIGTERM', () => {
  stopping = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (gameClock) clearInterval(gameClock);
  server.close(() => { if (client) client.close().catch(() => {}); });
});
