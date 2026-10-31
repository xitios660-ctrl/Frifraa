'use strict';

const path = require('node:path');
const express = require('express');
const { MongoClient } = require('mongodb');

const PEOPLE = Object.freeze(['mary', 'kaique', 'jheniffer', 'gustavo']);
const TARGET = 20100;
const MAX_AMOUNT = 200;

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
    async close() { if (client) await client.close(); }
  };
}

function createApp(store = createMongoStore()) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2kb', strict: true }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  app.get('/api/health', (_req, res) => res.json({ service: 'cofrinho-bomba-party', status: 'up' }));

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
    res.status(err.status || 500).json({ error: err.status === 503 ? err.message : 'Não foi possível salvar. Tente novamente; a marcação não foi confirmada.' });
  });
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const server = createApp().listen(port, '0.0.0.0', () => console.log(`Cofrinho Bomba Party no porto ${port}`));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

module.exports = { PEOPLE, TARGET, publicState, createMongoStore, createApp };
