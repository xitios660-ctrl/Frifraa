'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const WIDTH = 15;
const HEIGHT = 13;
const PORT = Number(process.env.PORT) || 3000;
const TICK_MS = 1000 / 60;
const physics = require('./public/physics');
const COLORS = ['#ac82ff', '#ff6e96', '#55dcff', '#ffd36f'];
const SKINS = ['Mary', 'Kaique', 'Jheniffer', 'Solar'];
const SPAWNS = [
  { x: 1, y: 1 },
  { x: WIDTH - 2, y: 1 },
  { x: 1, y: HEIGHT - 2 },
  { x: WIDTH - 2, y: HEIGHT - 2 }
];
const rooms = new Map();
const clients = new Set();
const PUBLIC = path.join(__dirname, 'public');

function now() { return Date.now(); }
function tileKey(x, y) { return `${x},${y}`; }
function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 5 }, () => chars[crypto.randomInt(chars.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function send(ws, message) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}
function error(ws, message) { send(ws, { type: 'error', message }); }
function safeName(input) {
  return String(input || 'Jogador').replace(/[<>\x00-\x1f]/g, '').trim().slice(0, 18) || 'Jogador';
}
function preferredSkin(name) {
  const normalized = safeName(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/^(mary|mariany|maryane)(\b|\s)/.test(normalized)) return 0;
  if (/^kaique(\b|\s)/.test(normalized)) return 1;
  if (/^(jheniffer|jhenifer|jhen|jhe)(\b|\s)/.test(normalized)) return 2;
  return null;
}
function availableSkin(room, name) {
  const occupied = new Set([...room.players.values()].map(p => p.skinIndex));
  const desired = preferredSkin(name);
  if (desired !== null && !occupied.has(desired)) return desired;
  return [0, 1, 2, 3].find(index => !occupied.has(index));
}
function newPlayer(ws, name, slot, skinIndex) {
  return {
    id: ws.playerId,
    ws,
    slot,
    name: safeName(name),
    skinIndex,
    color: COLORS[skinIndex],
    skin: SKINS[skinIndex],
    x: SPAWNS[slot].x,
    y: SPAWNS[slot].y,
    alive: true,
    bombs: 1,
    activeBombs: 0,
    range: 2,
    speed: 170,
    lastMove: 0,
    motion: { x: 0, y: 0 },
    kills: 0,
    place: null
  };
}
function newRoom(code, ws, name) {
  const room = {
    code,
    hostId: ws.playerId,
    phase: 'lobby',
    players: new Map(),
    board: null,
    bombs: [],
    flames: [],
    powerups: new Map(),
    countdownUntil: 0,
    winnerId: null,
    participantsAtStart: 0,
    eliminatedCount: 0,
    lastBroadcast: 0,
    lastActivity: now()
  };
  room.players.set(ws.playerId, newPlayer(ws, name, 0, availableSkin(room, name)));
  rooms.set(code, room);
  ws.roomCode = code;
  return room;
}
function playerView(p) {
  return {
    id: p.id, name: p.name, slot: p.slot, skinIndex: p.skinIndex, color: p.color, skin: p.skin,
    x: p.x, y: p.y, motion: p.motion, facing: p.facing, alive: p.alive, bombs: p.bombs,
    range: p.range, speed: p.speed, kills: p.kills, place: p.place
  };
}
function stateFor(room) {
  return {
    type: 'state',
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    players: [...room.players.values()].map(playerView),
    board: room.board,
    bombs: room.bombs.map(b => ({ x: b.x, y: b.y, passThrough: b.passThrough, fuse: Math.max(0, b.explodeAt - now()) })),
    flames: room.flames.map(f => ({ x: f.x, y: f.y })),
    powerups: [...room.powerups.entries()].map(([key, type]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, type };
    }),
    countdown: room.phase === 'countdown' ? Math.ceil(Math.max(0, room.countdownUntil - now()) / 1000) : 0,
    winnerId: room.winnerId,
    participantsAtStart: room.participantsAtStart,
    width: WIDTH,
    height: HEIGHT
  };
}
function broadcast(room) {
  const payload = JSON.stringify(stateFor(room));
  for (const p of room.players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(payload);
  }
  room.lastBroadcast = now();
}
function leaveRoom(ws, allowReconnect = false) {
  if (!ws.roomCode) return;
  const room = rooms.get(ws.roomCode);
  ws.roomCode = null;
  if (!room) return;
  room.players.delete(ws.playerId);
  room.lastActivity = now();
  if (room.players.size === 0) {
    if (allowReconnect) {
      // Conservar a sala por um curto período permite recarregar o app sem
      // perder o convite, inclusive se o anfitrião estava sozinho.
      room.phase = 'lobby';
      room.board = null;
      room.lastEmptyAt = now();
      return;
    }
    rooms.delete(room.code);
    return;
  }
  if (!room.players.has(room.hostId)) room.hostId = room.players.keys().next().value;
  if (room.phase === 'countdown' && room.players.size === 0) room.phase = 'lobby';
  if (room.phase === 'playing') checkWinner(room);
  broadcast(room);
}
function getRoom(ws) { return ws.roomCode && rooms.get(ws.roomCode); }
function makeBoard() {
  const board = Array.from({ length: HEIGHT }, (_, y) =>
    Array.from({ length: WIDTH }, (_, x) => {
      if (x === 0 || y === 0 || x === WIDTH - 1 || y === HEIGHT - 1 || (x % 2 === 0 && y % 2 === 0)) return 1;
      return Math.random() < 0.64 ? 2 : 0;
    })
  );
  for (const { x, y } of SPAWNS) {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (board[y + dy]?.[x + dx] !== undefined && board[y + dy][x + dx] !== 1) board[y + dy][x + dx] = 0;
    }
  }
  return board;
}
function startGame(room) {
  room.lastTick = now();
  room.board = makeBoard();
  room.bombs = [];
  room.flames = [];
  room.powerups.clear();
  room.winnerId = null;
  room.phase = 'countdown';
  room.countdownUntil = now() + 3000;
  room.participantsAtStart = room.players.size;
  room.eliminatedCount = 0;
  for (const p of room.players.values()) {
    const pos = SPAWNS[p.slot];
    Object.assign(p, {
      x: pos.x, y: pos.y, facing: 'down', alive: true, bombs: 1, activeBombs: 0,
      range: 2, speed: 170, lastMove: 0, motion: { x: 0, y: 0 }, kills: 0, place: null
    });
  }
  broadcast(room);
}
function movePlayers(room, t) {
  const dt = Math.min(.05, Math.max(0, (t - (room.lastTick || t)) / 1000));
  room.lastTick = t;
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    if (t - (p.lastInput || 0) > 1200) p.motion = { x: 0, y: 0 };
    physics.move(p, p.motion, dt, room.board, room.bombs);
    const key = tileKey(Math.round(p.x), Math.round(p.y));
    const bonus = room.powerups.get(key);
    if (bonus) {
      if (bonus === 'range') p.range = Math.min(6, p.range + 1);
      if (bonus === 'bomb') p.bombs = Math.min(5, p.bombs + 1);
      if (bonus === 'speed') p.speed = Math.max(100, p.speed - 20);
      room.powerups.delete(key);
      send(p.ws, { type: 'pickup', bonus });
    }
  }
}
function putBomb(room, player) {
  if (room.phase !== 'playing' || !player.alive || player.activeBombs >= player.bombs) return;
  if (room.bombs.some(b => b.x === Math.round(player.x) && b.y === Math.round(player.y))) return;
  room.bombs.push({
    x: Math.round(player.x), y: Math.round(player.y), ownerId: player.id,
    range: player.range, explodeAt: now() + 2250,
    passThrough: [...room.players.values()].filter(p => p.alive && physics.overlaps(p, {x:Math.round(player.x),y:Math.round(player.y)})).map(p => p.id)
  });
  player.activeBombs++;
  broadcast(room);
}
function explodeBomb(room, bomb, t) {
  const index = room.bombs.indexOf(bomb);
  if (index < 0) return;
  room.bombs.splice(index, 1);
  const owner = room.players.get(bomb.ownerId);
  if (owner) owner.activeBombs = Math.max(0, owner.activeBombs - 1);
  const tiles = [{ x: bomb.x, y: bomb.y }];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let step = 1; step <= bomb.range; step++) {
      const x = bomb.x + dx * step;
      const y = bomb.y + dy * step;
      const cell = room.board[y]?.[x];
      if (cell === undefined || cell === 1) break;
      tiles.push({ x, y });
      if (cell === 2) {
        room.board[y][x] = 0;
        if (Math.random() < 0.25) {
          const types = ['range', 'range', 'bomb', 'speed'];
          room.powerups.set(tileKey(x, y), types[crypto.randomInt(types.length)]);
        }
        break;
      }
    }
  }
  for (const { x, y } of tiles) {
    room.flames.push({ x, y, expiresAt: t + 500, ownerId: bomb.ownerId });
    for (const chained of room.bombs) {
      if (chained.x === x && chained.y === y) chained.explodeAt = t;
    }
  }
}
function applyFlames(room) {
  const eliminated = [];
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    const flame = room.flames.find(f => Math.abs(f.x - p.x) < .72 && Math.abs(f.y - p.y) < .72);
    if (flame) eliminated.push({ player: p, flame });
  }
  // Quem sai primeiro fica em último; eliminações no mesmo tick empatam.
  const place = room.participantsAtStart - room.eliminatedCount;
  for (const { player, flame } of eliminated) {
    player.alive = false;
    player.place = place;
    player.motion = { x: 0, y: 0 };
    const owner = room.players.get(flame.ownerId);
    if (owner && owner.id !== player.id) owner.kills++;
  }
  room.eliminatedCount += eliminated.length;
}
function checkWinner(room) {
  if (room.phase !== 'playing') return;
  const alive = [...room.players.values()].filter(p => p.alive);
  if (room.participantsAtStart === 1 && alive.length > 0) return; // treino solo
  if (alive.length <= 1) {
    room.phase = 'finished';
    room.winnerId = alive[0]?.id || null;
    if (alive.length === 1) alive[0].place = 1;
    broadcast(room);
  }
}
function tick() {
  const t = now();
  for (const room of rooms.values()) {
    if (room.phase === 'countdown' && t >= room.countdownUntil) {
      room.phase = 'playing';
      broadcast(room);
    }
    if (room.phase === 'playing') {
      movePlayers(room, t);
      room.flames = room.flames.filter(f => f.expiresAt > t);
      while (true) {
        const due = room.bombs.find(b => b.explodeAt <= t);
        if (!due) break;
        explodeBomb(room, due, t);
      }
      applyFlames(room);
      checkWinner(room);
    }
    if (t - room.lastBroadcast >= 33 && (room.phase === 'playing' || room.phase === 'countdown')) broadcast(room);
  }
}
function onMessage(ws, raw) {
  if (raw.length > 1024) return error(ws, 'Mensagem muito grande.');
  let message;
  try { message = JSON.parse(String(raw)); } catch { return; }
  if (!message || typeof message !== 'object') return;
  if (message.type === 'create') {
    for (const [code, room] of rooms) {
      if (room.players.size === 0) rooms.delete(code);
    }
    if (rooms.size > (ws.roomCode ? 1 : 0)) return error(ws, 'Já existe uma sala. Entre pelo convite enviado pela Mary.');
    leaveRoom(ws);
    const code = randomCode();
    const room = newRoom(code, ws, message.name);
    send(ws, { type: 'joined', code, playerId: ws.playerId });
    broadcast(room);
    return;
  }
  if (message.type === 'join') {
    const code = String(message.code || '').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 5);
    const room = rooms.get(code);
    if (!room) return error(ws, 'Essa sala não existe mais. Peça um novo convite.');
    if (ws.roomCode === code) return broadcast(room);
    if (room.phase !== 'lobby') return error(ws, 'A partida já começou. Aguarde uma nova sala.');
    if (room.players.size >= 4) return error(ws, 'Sala cheia! Máximo de quatro jogadores.');
    leaveRoom(ws);
    if (room.players.size === 0) room.hostId = ws.playerId;
    const slot = [0, 1, 2, 3].find(n => ![...room.players.values()].some(p => p.slot === n));
    room.players.set(ws.playerId, newPlayer(ws, message.name, slot, availableSkin(room, message.name)));
    ws.roomCode = code;
    room.lastActivity = now();
    send(ws, { type: 'joined', code, playerId: ws.playerId });
    broadcast(room);
    return;
  }
  const room = getRoom(ws);
  if (!room) return;
  const player = room.players.get(ws.playerId);
  if (!player) return;
  if (message.type === 'leave') {
    leaveRoom(ws);
    send(ws, { type: 'left' });
  } else if (message.type === 'skin') {
    if (room.phase !== 'lobby') return error(ws, 'Só é possível trocar de personagem antes da partida.');
    const skinIndex = Number(message.skinIndex);
    if (!Number.isInteger(skinIndex) || skinIndex < 0 || skinIndex >= SKINS.length) return;
    if ([...room.players.values()].some(p => p.id !== player.id && p.skinIndex === skinIndex)) {
      return error(ws, 'Esse personagem já foi escolhido por outro jogador.');
    }
    player.skinIndex = skinIndex;
    player.skin = SKINS[skinIndex];
    player.color = COLORS[skinIndex];
    broadcast(room);
  } else if (message.type === 'start') {
    if (room.hostId !== ws.playerId) return error(ws, 'Apenas o anfitrião pode iniciar.');
    if (room.phase !== 'lobby' && room.phase !== 'finished') return;
    startGame(room);
  } else if (message.type === 'move') {
    const x = Number(message.x), y = Number(message.y);
    if (room.phase !== 'playing' || !player.alive) return;
    if (![ -1, 0, 1 ].includes(x) || ![ -1, 0, 1 ].includes(y) || Math.abs(x) + Math.abs(y) > 1) return;
    player.motion = { x, y };
    player.lastInput = now();
  } else if (message.type === 'bomb') {
    putBomb(room, player);
  }
}

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/animation.js': ['animation.js', 'text/javascript; charset=utf-8'],
  '/skins/mary-walk-v1.png': ['skins/mary-walk-v1.png', 'image/png'],
  '/skins/kaique-walk-v1.png': ['skins/kaique-walk-v1.png', 'image/png'],
  '/skins/jheniffer-walk-v1.png': ['skins/jheniffer-walk-v1.png', 'image/png'],
  '/physics.js': ['physics.js', 'text/javascript; charset=utf-8'],
  '/game.js': ['game.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/icon-192.png': ['icon-192.png', 'image/png'],
  '/icon-512.png': ['icon-512.png', 'image/png'],
  '/icon-180.png': ['icon-180.png', 'image/png'],
  '/skins/mary.webp': ['skins/mary.webp', 'image/webp'],
  '/skins/kaique.webp': ['skins/kaique.webp', 'image/webp'],
  '/skins/jheniffer.webp': ['skins/jheniffer.webp', 'image/webp']
};
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: clients.size }));
  }
  const url = new URL(req.url, 'http://localhost');
  const entry = FILES[url.pathname];
  if (!entry || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Não encontrado');
  }
  const [file, contentType] = entry;
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': ['index.html', 'sw.js', 'manifest.webmanifest', 'game.js', 'physics.js', 'animation.js', 'styles.css'].includes(file) ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(path.join(PUBLIC, file)).on('error', () => res.destroy()).pipe(res);
});
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });
wss.on('connection', ws => {
  ws.playerId = crypto.randomUUID();
  ws.roomCode = null;
  ws.isAlive = true;
  clients.add(ws);
  send(ws, { type: 'hello', playerId: ws.playerId });
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => onMessage(ws, raw));
  ws.on('close', () => { leaveRoom(ws, true); clients.delete(ws); });
  ws.on('error', () => { leaveRoom(ws, true); clients.delete(ws); });
});
const heartbeat = setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
const staleRoomCleanup = setInterval(() => {
  for (const [code, room] of rooms) {
    if (room.players.size === 0 && now() - (room.lastEmptyAt || room.lastActivity) > 90000) rooms.delete(code);
  }
}, 10000);
const gameLoop = setInterval(tick, TICK_MS);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Arena pronta na porta ${PORT}`);
});
function shutdown() {
  clearInterval(heartbeat);
  clearInterval(staleRoomCleanup);
  clearInterval(gameLoop);
  for (const ws of clients) ws.close(1001, 'Reiniciando servidor');
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = { server, rooms, newRoom, makeBoard, onMessage, tick, WIDTH, HEIGHT, SPAWNS };
