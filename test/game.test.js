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
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' }, stdio: 'ignore'
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

test('serve página, skins personalizadas e endpoint de saúde', async () => {
  const [page, health, manifest, icon, sw, mary, kaique, jheniffer] = await Promise.all([
    fetch(BASE), fetch(`${BASE}/health`), fetch(`${BASE}/manifest.webmanifest`),
    fetch(`${BASE}/icon-192.png`), fetch(`${BASE}/sw.js`), fetch(`${BASE}/skins/mary.webp`),
    fetch(`${BASE}/skins/kaique.webp`), fetch(`${BASE}/skins/jheniffer.webp`)
  ]);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Bomba Party · Arena Online/);
  assert.equal((await health.json()).ok, true);
  for (const name of ['mary','kaique','jheniffer']) {
    const atlas = await fetch(`${BASE}/skins/${name}-walk-v1.png`);
    assert.equal(atlas.status, 200);
    assert.match(atlas.headers.get('content-type'), /image\/png/);
    assert.ok((await atlas.arrayBuffer()).byteLength > 1000);
  }
  assert.equal(manifest.status, 200);
  assert.equal((await manifest.json()).display, 'standalone');
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get('content-type'), /image\/png/);
  assert.equal(sw.status, 200);
  for (const skin of [mary, kaique, jheniffer]) {
    assert.equal(skin.status, 200);
    assert.match(skin.headers.get('content-type'), /image\/webp/);
    assert.ok((await skin.arrayBuffer()).byteLength > 1000);
  }
});

test('limita a sala a quatro pessoas e inicia uma partida real', async () => {
  const p1 = await client();
  write(p1, { type: 'create', name: 'Mary' });
  const joined = await message(p1, m => m.type === 'joined');
  assert.match(joined.code, /^[A-Z2-9]{5}$/);
  const code = joined.code;

  const others = [];
  const names = ['Jheniffer', 'Kaique', 'Gustavo'];
  for (let n = 2; n <= 4; n++) {
    const p = await client();
    others.push(p);
    write(p, { type: 'join', code, name: names[n - 2] });
    await message(p, m => m.type === 'joined');
  }
  const lobby = await message(p1, m => m.type === 'state' && m.players.length === 4);
  assert.equal(lobby.players.length, 4);
  assert.equal(lobby.players.find(p => p.name === 'Mary').skinIndex, 0);
  assert.equal(lobby.players.find(p => p.name === 'Jheniffer').skinIndex, 2);
  assert.equal(lobby.players.find(p => p.name === 'Kaique').skinIndex, 1);
  assert.equal(lobby.players.find(p => p.name === 'Gustavo').skinIndex, 3);

  write(others[0], { type: 'skin', skinIndex: 0 });
  const deniedSkin = await message(others[0], m => m.type === 'error' && /já foi escolhido/.test(m.message));
  assert.match(deniedSkin.message, /outro jogador/);

  const p5 = await client();
  write(p5, { type: 'join', code, name: 'Excesso' });
  const rejected = await message(p5, m => m.type === 'error');
  assert.match(rejected.message, /cheia/);

  write(p5, { type: 'create', name: 'Outra sala' });
  await message(p5, m => m.type === 'error' && /Já existe uma sala/.test(m.message));

  write(p1, { type: 'start' });
  await message(p1, m => m.type === 'state' && m.phase === 'countdown');
  await message(p1, m => m.type === 'state' && m.phase === 'playing');
  write(p1, { type: 'bomb' });
  const withBomb = await message(p1, m => m.type === 'state' && m.bombs.length > 0);
  assert.equal(withBomb.bombs.length, 1);
  assert.equal(withBomb.board.length, 13);
  assert.equal(withBomb.board[0].length, 15);
  assert.deepEqual(withBomb.players.map(p => p.skin).sort(), ['Jheniffer', 'Kaique', 'Mary', 'Solar']);
  const firstOut = await message(p1, m => m.type === 'state' && m.players.find(p => p.name === 'Mary')?.place === 4);
  assert.equal(firstOut.players.find(p => p.name === 'Mary').alive, false);
  assert.equal(firstOut.participantsAtStart, 4);
  assert.equal((await (await fetch(`${BASE}/health`)).json()).rooms, 1);

  // The remaining clients see the same authoritative positions and explosions.
  write(others[0], { type: 'move', x: -1, y: 0 });
  const moving = await message(others[0], m => m.type === 'state' && m.phase === 'playing' && m.players.some(p => p.name === 'Jheniffer' && !Number.isInteger(p.x)));
  const moved = moving.players.find(p => p.name === 'Jheniffer');
  assert.ok(moved.x < 13 && moved.x > 12);
  write(others[0], { type: 'move', x: 0, y: 0 });
  for (const p of others.slice(0, 2)) write(p, { type: 'bomb' });
  const finished = await message(p1, m => m.type === 'state' && m.phase === 'finished');
  assert.equal(finished.players.filter(p => p.alive).length, 1);
  assert.equal(finished.players.find(p => p.alive).place, 1);
  for (const p of others) await message(p, m => m.type === 'state' && m.phase === 'finished' && m.winnerId === finished.winnerId);
  write(p1, { type: 'start' });
  await waitUntil(() => p1.messages.filter(m => m.type === 'state' && m.phase === 'countdown').length > 1);
  const restart = p1.messages.filter(m => m.type === 'state' && m.phase === 'countdown').at(-1);
  assert.ok(restart.players.every(p => p.alive && p.place === null));

  // Simula a página recarregando: desconexões não podem apagar a sala na hora.
  for (const p of [p1, ...others]) p.close();
  await waitUntil(async () => (await (await fetch(`${BASE}/health`)).json()).players === 1);
  const returning = await client();
  write(returning, { type: 'join', code, name: 'Mary' });
  await message(returning, m => m.type === 'joined' && m.code === code);
  const restored = await message(returning, m => m.type === 'state' && m.phase === 'lobby');
  assert.equal(restored.hostId, restored.players[0].id);
  assert.equal(restored.players[0].skin, 'Mary');
  write(returning, { type: 'leave' });
  await message(returning, m => m.type === 'left');
  assert.equal((await (await fetch(`${BASE}/health`)).json()).rooms, 0);
});
