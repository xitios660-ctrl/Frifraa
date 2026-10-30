'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { WebSocket } = require('ws');

const PORT = 37590 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}`;
let child;
const sockets = [];

async function waitUntil(fn, timeout = 6000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await fn();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Tempo esgotado aguardando evento');
}
async function client() {
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/ws');
  ws.messages = [];
  ws.on('message', data => {
    try { ws.messages.push(JSON.parse(String(data))); } catch { /* ignore */ }
  });
  sockets.push(ws);
  await waitUntil(() => ws.messages.find(m => m.type === 'hello'));
  return ws;
}
function write(ws, data) { ws.send(JSON.stringify(data)); }
function message(ws, predicate) { return waitUntil(() => ws.messages.find(predicate)); }

test.before(async () => {
  child = spawn(process.execPath, ['server.js'], {
    cwd: require('node:path').join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test', GAME_PIN: 'PARTY123' }, stdio: 'ignore'
  });
  await waitUntil(async () => {
    try {
      const response = await fetch(`${BASE}/health`);
      return response.ok;
    } catch { return false; }
  });
});
test.after(async () => {
  for (const ws of sockets) ws.close();
  child?.kill('SIGTERM');
});

test('serve página e endpoint de saúde', async () => {
  const [page, health, manifest, icon, sw] = await Promise.all([
    fetch(BASE), fetch(`${BASE}/health`), fetch(`${BASE}/manifest.webmanifest`),
    fetch(`${BASE}/icon-192.png`), fetch(`${BASE}/sw.js`)
  ]);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Bomba Party · Arena Online/);
  assert.equal((await health.json()).ok, true);
  assert.equal(manifest.status, 200);
  assert.equal((await manifest.json()).display, 'standalone');
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get('content-type'), /image\/png/);
  assert.equal(sw.status, 200);
});

test('limita a sala a quatro pessoas e inicia uma partida real', async () => {
  const intruder = await client();
  write(intruder, { type: 'create', name: 'Intruso', pin: 'ERRADA' });
  await message(intruder, m => m.type === 'error' && /Senha privada incorreta/.test(m.message));

  const p1 = await client();
  write(p1, { type: 'create', name: 'Mary', pin: 'PARTY123' });
  const joined = await message(p1, m => m.type === 'joined');
  assert.match(joined.code, /^[A-Z2-9]{5}$/);
  const code = joined.code;

  const others = [];
  for (let n = 2; n <= 4; n++) {
    const p = await client();
    others.push(p);
    write(p, { type: 'join', code, name: `Jogador${n}`, pin: 'PARTY123' });
    await message(p, m => m.type === 'joined');
  }
  const lobby = await message(p1, m => m.type === 'state' && m.players.length === 4);
  assert.equal(lobby.players.length, 4);

  const p5 = await client();
  write(p5, { type: 'join', code, name: 'Excesso', pin: 'PARTY123' });
  const rejected = await message(p5, m => m.type === 'error');
  assert.match(rejected.message, /cheia/);

  write(p5, { type: 'create', name: 'Outra sala', pin: 'PARTY123' });
  await message(p5, m => m.type === 'error' && /Já existe uma sala/.test(m.message));

  write(p1, { type: 'start' });
  await message(p1, m => m.type === 'state' && m.phase === 'countdown');
  await message(p1, m => m.type === 'state' && m.phase === 'playing');
  write(p1, { type: 'bomb' });
  const withBomb = await message(p1, m => m.type === 'state' && m.bombs.length > 0);
  assert.equal(withBomb.bombs.length, 1);
  assert.equal(withBomb.board.length, 13);
  assert.equal(withBomb.board[0].length, 15);
  assert.deepEqual(withBomb.players.map(p => p.skin).sort(), ['Cyber', 'Mística', 'Rubi', 'Solar']);
  const firstOut = await message(p1, m => m.type === 'state' && m.players.find(p => p.name === 'Mary')?.place === 4);
  assert.equal(firstOut.players.find(p => p.name === 'Mary').alive, false);
  assert.equal(firstOut.participantsAtStart, 4);
  assert.equal((await (await fetch(`${BASE}/health`)).json()).rooms, 1);
});
