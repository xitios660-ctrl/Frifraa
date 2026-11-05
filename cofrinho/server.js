'use strict';

const path = require('node:path');
const express = require('express');
const { MongoClient } = require('mongodb');
const {createWalletStore}=require('./wallet-store');
const {installWallet}=require('./wallet-routes');

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
  const value=require('./catalog').walletView(doc,character);
  return {...value,balance:value.available,upgrades:doc.upgrades||{},recentPurchases:value.history.slice(-8).reverse()};
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
    if (dbName !== 'bomba_party_cofrinho') throw Object.assign(new Error('Somente o banco bomba_party_cofrinho é permitido.'), { status: 503 });
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
    async database(){await collection();return client.db(dbName);},
    async getAll() {
      const db = await collection();
      const records = await db.find({ _id: { $in: PEOPLE } }).toArray();
      return PEOPLE.map(character => {
        const doc=records.find(item=>item._id===character)||{};
        const coins=walletView(character,doc);
        return {...publicState(character,doc.saved||[]),
          coins:coins.balance,coinsEarned:coins.earned,coinsSpent:coins.spent};
      });
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
      const coins=walletView(character,current||{});
      return {...publicState(character,current?.saved||[]),
        coins:coins.balance,coinsEarned:coins.earned,coinsSpent:coins.spent};
    },
    async getWallet(character) {
      const db=await collection();
      const doc=await db.findOne({_id:character});
      return walletView(character,doc||{});
    },
    async close() { if (client) await client.close(); }
  };
}

function createApp(store = createMongoStore(),wallet = createWalletStore(()=>store.database())) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy',1);
  app.use(express.json({ limit: '2kb', strict: true }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api',(req,res,next)=>{
    if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==`${req.protocol}://${req.get('host')}`)return res.status(403).json({error:'Origem não autorizada.'});
    next();
  });
  installWallet(app,wallet);

  app.get('/api/health', (_req, res) => res.json({ service: 'cofrinho-bomba-party', status: 'up' }));
  // The old skin-only bridge is retired: a service key alone never identifies
  // the owner of a personal wallet. Keep the URL with an explicit upgrade error.
  app.all('/api/game-wallet/:operation', (_req,res)=>res.status(410).json({error:'A loja está disponível em Minha Carteira. Atualize o aplicativo.'}));

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
    if(!err.status)console.error('[cofrinho] Falha interna ao processar operação.');
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Não foi possível salvar. Tente novamente; a operação não foi confirmada.' });
  });
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const store = createMongoStore();
  const wallet=createWalletStore(()=>store.database());
  const server = createApp(store,wallet).listen(port, '0.0.0.0', () => {
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
