'use strict';

const path = require('node:path');
const express = require('express');
const { MongoClient } = require('mongodb');

const PEOPLE = Object.freeze(['mary', 'kaique', 'jheniffer', 'gustavo']);
const TARGET = 20100;
const MAX_AMOUNT = 200;
const crypto = require('node:crypto');
// In-game coins reflect marked Cofrinho amounts; they do not verify bank payments.
const STORE_ITEMS = Object.freeze({
  bomb: Object.freeze({label:'Bomba extra',cost:10,max:3}),
  range: Object.freeze({label:'Fogo +1',cost:10,max:4}),
  speed: Object.freeze({label:'Velocidade +1',cost:15,max:2}),
  life: Object.freeze({label:'Vida inicial +1',cost:20,max:2}),
  shield: Object.freeze({label:'Escudo inicial',cost:25,max:1}),
  kick: Object.freeze({label:'Luva de chute',cost:20,max:1}),
  push: Object.freeze({label:'Empurrar bomba',cost:20,max:1})
});
function walletView(character,doc={}){
  const saved=publicState(character,doc.saved||[]);
  const spent=Math.max(0,Number.isInteger(doc.spentCoins)?doc.spentCoins:0);
  const upgrades=Object.fromEntries(Object.keys(STORE_ITEMS).map(k=>[k,Math.max(0,Number(doc.upgrades?.[k]||0))]));
  return {character,earned:saved.total,spent,balance:Math.max(0,saved.total-spent),
    upgrades,catalog:STORE_ITEMS,recentPurchases:(doc.coinPurchases||[]).slice(-8).reverse()};
}
function validGameKey(req){
  const configured=process.env.BOMBERMAN_GAME_KEY;
  const received=req.get('x-bomberman-game-key')||'';
  if(!configured||!received)return false;
  const a=Buffer.from(received),b=Buffer.from(configured);
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}


function publicState(character, saved = []) {
  const valid = [...new Set(saved.filter(v => Number.isInteger(v) && v >= 1 && v <= MAX_AMOUNT))].sort((a, b) => a - b);
  const total = valid.reduce((sum, amount) => sum + amount, 0);
  return { character, saved: valid, total, count: valid.length, remaining: TARGET - total, percentage: Math.round(valid.length * 100 / MAX_AMOUNT) };
}

function createMongoStore({ uri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB || 'bomba_party_cofrinho' } = {}) {
  let connecting;
  let client;
  const unavailable = () => Object.assign(new Error('MongoDB do cofrinho ainda não foi conectado. Nenhum depósito foi marcado.'), { status: 503 });

  async function collection() {
    if (!uri) throw unavailable();
    if (dbName === 'ganoh_production') throw Object.assign(new Error('Banco da Ganoh bloqueado por segurança.'), { status: 503 });
    if (!connecting) {
      connecting = (async () => {
        client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 6500, retryWrites: true });
        await client.connect();
        await client.db(dbName).command({ ping: 1 });
        return client.db(dbName).collection('cofrinhos');
      })().catch(async error => {
        connecting = null;
        if (client) await client.close().catch(() => {});
        throw Object.assign(new Error('Conexão com o MongoDB indisponível. Tente novamente; nenhum valor foi marcado.'), { status: 503, cause: error });
      });
    }
    return connecting;
  }

  return {
    async getAll() {
      const db = await collection();
      const records = await db.find({ _id: { $in: PEOPLE } }).toArray();
      return PEOPLE.map(character => publicState(character, records.find(item => item._id === character)?.saved || []));
    },
    async setMarked(character, amount, marked) {
      const db = await collection();
      if (marked) {
        await db.updateOne(
          { _id: character },
          { $addToSet: { saved: amount }, $set: { updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );
      } else {
        await db.updateOne({ _id: character }, { $pull: { saved: amount }, $set: { updatedAt: new Date() } });
      }
      const current = await db.findOne({ _id: character });
      return publicState(character, current?.saved || []);
    },
    async getWallet(character) {
      const db=await collection();
      const doc=await db.findOne({_id:character});
      return walletView(character,doc||{});
    },
    async purchase(character,upgrade,purchaseId) {
      const db=await collection(),item=STORE_ITEMS[upgrade];
      if(!PEOPLE.includes(character)||!item)throw Object.assign(new Error('Personagem ou melhoria inválidos.'),{status:400});
      if(!/^[a-zA-Z0-9-]{12,70}$/.test(String(purchaseId||'')))throw Object.assign(new Error('Identificador da compra inválido.'),{status:400});
      for(let retry=0;retry<7;retry++){
        const doc=await db.findOne({_id:character})||{_id:character};
        if((doc.coinPurchases||[]).some(p=>p.id===purchaseId))return walletView(character,doc);
        const wallet=walletView(character,doc);
        if(wallet.upgrades[upgrade]>=item.max)throw Object.assign(new Error('Essa melhoria já está no máximo.'),{status:409});
        if(wallet.balance<item.cost)throw Object.assign(new Error('Moedas insuficientes. Confira o saldo do Cofrinho.'),{status:409});
        const version=doc.coinsVersion;
        const filter={_id:character,coinsVersion:version===undefined?{$exists:false}:version};
        const result=await db.updateOne(filter,{
          $inc:{spentCoins:item.cost,coinsVersion:1,['upgrades.'+upgrade]:1},
          $push:{coinPurchases:{$each:[{id:purchaseId,upgrade,cost:item.cost,
            level:wallet.upgrades[upgrade]+1,at:new Date()}],$slice:-120}},
          $set:{coinsUpdatedAt:new Date()},
          $setOnInsert:{createdAt:new Date(),saved:[]}
        },{upsert:false});
        if(result.modifiedCount)return this.getWallet(character);
        // The character record may not exist yet; initialize a zero-balance record.
        if(!doc.saved) {
          await db.updateOne({_id:character},{$setOnInsert:{saved:[],spentCoins:0,
            coinsVersion:0,upgrades:{},createdAt:new Date()}},{upsert:true}).catch(()=>{});
        }
      }
      throw Object.assign(new Error('Compra concorrente. Tente novamente.'),{status:409});
    },
    async close() { if (client) await client.close(); }
  };
}

function createApp(store = createMongoStore()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2kb', strict: true }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.get('/api/health', (_req, res) => res.json({ service: 'cofrinho-bomba-party', status: 'up' }));
  app.get('/api/game-wallet/:character', async (req,res,next)=>{
    if(!validGameKey(req))return res.status(403).json({error:'Acesso restrito ao servidor do Bomberman.'});
    if(!PEOPLE.includes(req.params.character))return res.status(400).json({error:'Personagem inválido.'});
    try{res.json(await store.getWallet(req.params.character));}catch(e){next(e)}
  });
  app.post('/api/game-wallet/purchase',async(req,res,next)=>{
    if(!validGameKey(req))return res.status(403).json({error:'Acesso restrito ao servidor do Bomberman.'});
    const {character,upgrade,purchaseId}=req.body||{};
    try{res.json(await store.purchase(character,upgrade,purchaseId));}
    catch(e){next(e)}
  });

  app.get('/api/state', async (_req, res, next) => {
    try { res.json({ target: TARGET, people: await store.getAll() }); }
    catch (error) { next(error); }
  });

  app.post('/api/deposit', async (req, res, next) => {
    const { character, amount, marked } = req.body || {};
    if (!PEOPLE.includes(character) || !Number.isInteger(amount) || amount < 1 || amount > MAX_AMOUNT || typeof marked !== 'boolean') {
      return res.status(400).json({ error: 'Informe personagem válido, valor inteiro entre 1 e 200 e se foi guardado.' });
    }
    try { return res.json({ target: TARGET, person: await store.setMarked(character, amount, marked) }); }
    catch (error) { return next(error); }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
  app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: 0 }));
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.use((err, _req, res, _next) => {
    if (res.headersSent) return;
    if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'JSON inválido.' });
    console.error('[cofrinho]', err.message);
    res.status(err.status || 500).json({ error: [400,403,409,503].includes(err.status) ? err.message : 'Não foi possível salvar. Tente novamente; a marcação não foi confirmada.' });
  });
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const store = createMongoStore();
  const server = createApp(store).listen(port, '0.0.0.0', () => {
    console.log(`Cofrinho Bomba Party no porto ${port}`);
    store.getAll().then(people => {
      console.log(`[cofrinho] MongoDB conectado e consulta realizada para ${people.length} cofrinhos.`);
    }).catch(() => {
      console.error('[cofrinho] MongoDB ainda indisponível; depósitos continuam bloqueados.');
    });
  });
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

module.exports = { PEOPLE, TARGET, publicState, walletView, STORE_ITEMS, createMongoStore, createApp };
