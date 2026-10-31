'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');

const maps=require('./public/maps');
const {WIDTH,HEIGHT,SPAWNS}=maps;
const PORT = Number(process.env.PORT) || 3000;
const TICK_MS = 1000 / 60;
const physics = require('./public/physics');
const {STEP} = require('./public/netcode');
const bots=require('./bots');
const collapse=require('./collapse');
const itemArt=require('./public/items');
const COLORS = ['#ac82ff', '#ff6e96', '#55dcff', '#ffd36f'];
const SKINS = ['Mary', 'Kaique', 'Jheniffer', 'Gustavo'];
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
  if (/^gustavo(\b|\s)/.test(normalized)) return 3;
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
    speed: 170, shield:0, invulnerableUntil:0, bombPass:false, piercing:false,
    lastMove: 0,
    inputQueue: [], inputBudget: 0, ack: 0, lastQueuedSeq: 0, usingInputs: false,
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
    mapChoice:'rotation', mapId:'classic', roundIndex:0,
    bombs: [],
    flames: [],
    effects: [],
    powerups: new Map(), pendingPowerups:[], collapse:null,
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
    id: p.id, name: p.name, bot:!!p.bot, slot: p.slot, skinIndex: p.skinIndex, color: p.color, skin: p.skin,
    x: p.x, y: p.y, ack: p.ack, motion: p.motion, facing: p.facing, alive: p.alive, bombs: p.bombs,
    range: p.range, speed: p.speed, shield:p.shield, invulnerableUntil:p.invulnerableUntil, bombPass:p.bombPass, piercing:p.piercing, kills: p.kills, place: p.place
  };
}
function stateFor(room) {
  return {
    type: 'state',
    serverTime: now(), mapChoice:room.mapChoice, mapId:room.mapId, mapName:maps.DEFS[room.mapId].name,
    effects: room.effects, collapse:collapse.view(room.collapse,now()),
    code: room.code,
    hostId: room.hostId,
    phase: room.phase,
    players: [...room.players.values()].map(playerView),
    board: room.board,
    bombs: room.bombs.map(b => ({ id:b.id, piercing:b.piercing, ownerId:b.ownerId, placedAt:b.placedAt, explodeAt:b.explodeAt, x: b.x, y: b.y, passThrough: b.passThrough, fuse: Math.max(0, b.explodeAt - now()) })),
    flames: room.flames.map(f => ({ x: f.x, y: f.y, startedAt:f.startedAt, expiresAt:f.expiresAt })),
    powerups: [...room.powerups.entries()].map(([key, type]) => {
      const [x, y] = key.split(',').map(Number);
      return { x, y, type, skin:itemArt.selectSkin(type,x,y,room.roundIndex) };
    }),
    countdown: room.phase === 'countdown' ? Math.ceil(Math.max(0, room.countdownUntil - now()) / 1000) : 0,
    winnerId: room.winnerId,
    participantsAtStart: room.participantsAtStart,
    width: WIDTH,
    height: HEIGHT
  };
}
function availability(){
  const room=rooms.values().next().value;
  return {type:'availability',phase:room?.phase||'lobby',taken:room?[...room.players.values()].filter(p=>!p.bot).map(p=>p.skinIndex):[]};
}
let lastAvailability='';
function broadcastAvailability(){
  const payload=JSON.stringify(availability());if(payload===lastAvailability)return;
  lastAvailability=payload;for(const ws of clients)if(ws.readyState===WebSocket.OPEN)ws.send(payload);
}
function broadcast(room) {
  const payload = JSON.stringify(stateFor(room));
  for (const p of room.players.values()) {
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(payload);
  }
  room.lastBroadcast = now();
  broadcastAvailability();
}
function leaveRoom(ws, allowReconnect = false) {
  if (!ws.roomCode) return;
  const room = rooms.get(ws.roomCode);
  ws.roomCode = null;
  if (!room) return;
  room.players.delete(ws.playerId);
  if(![...room.players.values()].some(p=>!p.bot)) removeBots(room);
  room.lastActivity = now();
  if (room.players.size === 0) {
    if (allowReconnect) {
      // Conservar a sala por um curto período permite recarregar o app sem
      // perder o convite, inclusive se o anfitrião estava sozinho.
      room.phase = 'lobby';
      room.board = null;
      room.lastEmptyAt = now();
      broadcastAvailability();
      return;
    }
    rooms.delete(room.code);
    broadcastAvailability();
    return;
  }
  if (!room.players.has(room.hostId)) room.hostId = [...room.players.values()].find(p=>!p.bot)?.id;
  if (room.phase === 'countdown' && room.players.size === 0) room.phase = 'lobby';
  if (room.phase === 'playing') checkWinner(room);
  broadcast(room);
}
function getRoom(ws) { return ws.roomCode && rooms.get(ws.roomCode); }
function makeBoard(id='classic'){return maps.create(id);}
function removeBots(room) {
  for(const [id,p] of room.players) if(p.bot) room.players.delete(id);
}
function fillBots(room) {
  removeBots(room);
  for(let slot=0;slot<4;slot++) {
    if([...room.players.values()].some(p=>p.slot===slot))continue;
    const skin=availableSkin(room,'Bot');
    const ws={playerId:crypto.randomUUID(),readyState:WebSocket.CLOSED,send(){}};
    const p=newPlayer(ws,`Bot ${SKINS[skin]}`,slot,skin);p.bot=true;
    room.players.set(p.id,p);
  }
}
function startGame(room) {
  fillBots(room);
  room.lastTick = now();
  const ids=Object.keys(maps.DEFS);
  room.mapId=room.mapChoice==='rotation'?ids[room.roundIndex%ids.length]:room.mapChoice;
  room.roundIndex++;
  room.board = makeBoard(room.mapId);
  room.bombs = [];
  room.flames = [];
  room.effects = [];
  room.powerups.clear();
  room.pendingPowerups=[];
  const special=['shield','bombpass','pierce','maxrange'];
  for(let slot=0;slot<4;slot++){const p=SPAWNS[slot],dx=p.x===1?2:-2,dy=p.y===1?2:-2;room.powerups.set(tileKey(p.x+dx,p.y),special[(slot+room.roundIndex-1)%4]);room.powerups.set(tileKey(p.x,p.y+dy),'speed');}
  room.winnerId = null;
  room.phase = 'countdown';
  room.countdownUntil = now() + 3000;
  room.collapse=collapse.create(room.board,room.countdownUntil);
  room.participantsAtStart = room.players.size;
  room.eliminatedCount = 0;
  for (const p of room.players.values()) {
    const pos = SPAWNS[p.slot];
    Object.assign(p, {
      x: pos.x, y: pos.y, facing: 'down', alive: true, bombs: 1, activeBombs: 0,
      range: 2, speed: 170, shield:0, invulnerableUntil:0, bombPass:false, piercing:false, lastMove: 0, inputQueue: [], inputBudget: 0, ack: 0, lastQueuedSeq: 0, usingInputs: false, motion: { x: 0, y: 0 }, kills: 0, place: null, botTarget:null, botThinkAt:0, botCooldown:0, botStall:0
    });
  }
  broadcast(room);
}
function movePlayers(room, t) {
  const dt = Math.min(.05, Math.max(0, (t - (room.lastTick || t)) / 1000));
  room.lastTick = t;
  const liveFlames=room.flames.filter(f=>f.expiresAt>t);
  const tiles=new Set(liveFlames.map(f=>tileKey(f.x,f.y)));
  const hazards=liveFlames.map(flame=>({flame,shapes:physics.flameShapes(flame,tiles)}));
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    p.flameContact=null;
    const contact=hazards.length?(x,y)=>{if(!p.flameContact)p.flameContact=hazards.find(h=>physics.touchesFlame({x,y},h.flame,tiles,h.shapes))?.flame;}:undefined;
    if(p.bot) {
      bots.update(room,p,t,dt,putBomb,contact);
    } else if(p.usingInputs) {
      p.inputBudget=Math.min(.1,p.inputBudget+dt);
      while(p.inputQueue.length) {
        const command=p.inputQueue[0];
        if(command.type==='bomb') {p.inputQueue.shift();putBomb(room,p);continue;}
        if(p.inputBudget+1e-9<STEP) break;
        p.inputQueue.shift();p.inputBudget-=STEP;p.motion={x:command.x,y:command.y};
        physics.move(p,p.motion,STEP,room.board,room.bombs,contact);p.ack=command.seq;
      }
    } else {
      if (t - (p.lastInput || 0) > 1200) p.motion = { x: 0, y: 0 };
      physics.move(p, p.motion, dt, room.board, room.bombs,contact);
    }
    const key = tileKey(Math.round(p.x), Math.round(p.y));
    const bonus = room.powerups.get(key);
    if (bonus) {
      if (bonus === 'range') p.range = Math.min(8, p.range + 1);
      if (bonus === 'maxrange') p.range=8;
      if (bonus === 'shield') p.shield=1;
      if (bonus === 'bombpass') p.bombPass=true;
      if (bonus === 'pierce') p.piercing=true;
      if (bonus === 'bomb') p.bombs = Math.min(5, p.bombs + 1);
      if (bonus === 'speed') p.speed = Math.max(100, p.speed - 20);
      room.effects.push({kind:'pickup',x:Math.round(p.x),y:Math.round(p.y),startedAt:t,expiresAt:t+600});
      room.powerups.delete(key);
      send(p.ws, { type: 'pickup', bonus });
    }
  }
}
function putBomb(room, player) {
  if (room.phase !== 'playing' || !player.alive || player.activeBombs >= player.bombs) return;
  if (room.bombs.some(b => b.x === Math.round(player.x) && b.y === Math.round(player.y))) return;
  room.bombs.push({
    id:crypto.randomUUID(), placedAt:now(),
    x: Math.round(player.x), y: Math.round(player.y), ownerId: player.id,
    range: player.range, piercing:player.piercing, explodeAt: now() + 2250,
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
      if (cell === undefined) break;
      if (cell === 1) {room.effects.push({kind:'wall',x,y,startedAt:t,expiresAt:t+360});break;}
      tiles.push({ x, y });
      if (cell === 2) {
        room.board[y][x] = 0;
        room.effects.push({kind:'crate',x,y,startedAt:t,expiresAt:t+650});
        if (Math.random() < 0.25) {
          const types = ['range', 'range', 'bomb', 'bomb', 'speed','shield','bombpass','pierce','maxrange'];
          room.pendingPowerups.push({x,y,type:types[crypto.randomInt(types.length)],readyAt:t+500});
        }
        if(!bomb.piercing)break;
      }
    }
  }
  for (const { x, y } of tiles) {
    if(room.powerups.delete(tileKey(x,y)))room.effects.push({kind:'itemBurn',x,y,startedAt:t,expiresAt:t+420});
    room.flames.push({ x, y, startedAt:t, expiresAt: t + 500, ownerId: bomb.ownerId });
    for (const chained of room.bombs) {
      if (chained.x === x && chained.y === y) chained.explodeAt = t;
    }
  }
}
function updatePowerups(room,t){
  for(const f of room.flames)if(f.expiresAt>t&&room.powerups.delete(tileKey(f.x,f.y)))room.effects.push({kind:'itemBurn',x:f.x,y:f.y,startedAt:t,expiresAt:t+420});
  room.pendingPowerups=room.pendingPowerups.filter(p=>{
    if(room.board[p.y]?.[p.x]!==0)return false;
    if(p.readyAt>t||room.flames.some(f=>f.x===p.x&&f.y===p.y&&f.expiresAt>t))return true;
    room.powerups.set(tileKey(p.x,p.y),p.type);return false;
  });
}
function applyFlames(room) {
  const eliminated = [];
  const tiles=new Set(room.flames.map(f=>tileKey(f.x,f.y)));
  const hazards=room.flames.map(flame=>({flame,shapes:physics.flameShapes(flame,tiles)}));
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    const flame=(p.flameContact&&p.flameContact.expiresAt>now()?p.flameContact:null)||hazards.find(h=>physics.touchesFlame(p,h.flame,tiles,h.shapes))?.flame;
    if(flame && (p.invulnerableUntil||0)<=now()){
      if(p.shield){p.shield=0;p.invulnerableUntil=now()+1400;room.effects.push({kind:'pickup',x:Math.round(p.x),y:Math.round(p.y),startedAt:now(),expiresAt:now()+600});send(p.ws,{type:'shield'});}
      else eliminated.push({player:p,flame});
    }
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
    room.effects=room.effects.filter(e=>e.expiresAt>t);
    if (room.phase === 'countdown' && t >= room.countdownUntil) {
      room.phase = 'playing';
      broadcast(room);
    }
    if (room.phase === 'playing') {
      collapse.update(room,t);
      updatePowerups(room,t);
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
  if(['enter','create','join'].includes(message.type)){
    let room=rooms.values().next().value;
    if(room&&ws.roomCode===room.code){send(ws,{type:'joined',code:room.code,playerId:ws.playerId,skinIndex:room.players.get(ws.playerId)?.skinIndex});broadcast(room);return;}
    if(room&&(room.phase==='playing'||room.phase==='countdown'))return error(ws,'A partida está em andamento. Aguarde a próxima rodada para escolher seu personagem.');
    if(room)removeBots(room);
    if(room&&room.players.size>=4)return error(ws,'Sala cheia: quatro jogadores conectados. Aguarde uma vaga.');
    const explicit=Object.hasOwn(message,'skinIndex');
    if(explicit&&(!Number.isInteger(message.skinIndex)||message.skinIndex<0||message.skinIndex>=4))return error(ws,'Escolha um dos quatro personagens.');
    const skinIndex=explicit?message.skinIndex:room?availableSkin(room,message.name):preferredSkin(message.name)??0;
    if(room&&[...room.players.values()].some(p=>p.skinIndex===skinIndex))return error(ws,'Esse personagem já está em uso. Escolha outro personagem livre.');
    if(!room)room=newRoom(randomCode(),ws,SKINS[skinIndex]);
    else{
      leaveRoom(ws);
      if(room.players.size===0)room.hostId=ws.playerId;
      const slot=[0,1,2,3].find(n=>![...room.players.values()].some(p=>p.slot===n));
      room.players.set(ws.playerId,newPlayer(ws,SKINS[skinIndex],slot,skinIndex));
      ws.roomCode=room.code;room.lastActivity=now();
    }
    send(ws,{type:'joined',code:room.code,playerId:ws.playerId,skinIndex});broadcast(room);return;
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
    player.name = SKINS[skinIndex];
    player.skinIndex = skinIndex;
    player.skin = SKINS[skinIndex];
    player.color = COLORS[skinIndex];
    broadcast(room);
  } else if(message.type==='map'){
    if(room.hostId!==ws.playerId)return error(ws,'Só o anfitrião escolhe o mapa.');
    if(!['lobby','finished'].includes(room.phase))return;
    if(message.mapId!=='rotation'&&!Object.hasOwn(maps.DEFS,message.mapId))return;
    room.mapChoice=message.mapId;broadcast(room);
  } else if (message.type === 'start') {
    if (room.hostId !== ws.playerId) return error(ws, 'Apenas o anfitrião pode iniciar.');
    if (room.phase !== 'lobby' && room.phase !== 'finished') return;
    startGame(room);
  } else if (message.type === 'input') {
    if(room.phase!=='playing'||!player.alive||!Array.isArray(message.steps)||message.steps.length>8) return;
    let previous=player.lastQueuedSeq;
    for(const command of message.steps) {
      if(!command||!Number.isSafeInteger(command.seq)||command.seq!==previous+1 ||
         ![-1,0,1].includes(command.x)||![-1,0,1].includes(command.y)||Math.abs(command.x)+Math.abs(command.y)>1) return;
      previous=command.seq;
    }
    if(player.inputQueue.length+message.steps.length>128) return;
    player.usingInputs=true;player.lastInput=now();player.lastQueuedSeq=previous;
    player.inputQueue.push(...message.steps.map(({seq,x,y})=>({seq,x,y})));
  } else if (message.type === 'move') {
    if(player.usingInputs) return;
    const x = Number(message.x), y = Number(message.y);
    if (room.phase !== 'playing' || !player.alive) return;
    if (![ -1, 0, 1 ].includes(x) || ![ -1, 0, 1 ].includes(y) || Math.abs(x) + Math.abs(y) > 1) return;
    player.motion = { x, y };
    player.lastInput = now();
  } else if (message.type === 'bomb') {
    if(player.usingInputs) {
      if(room.phase==='playing' && player.alive && player.inputQueue.filter(c=>c.type==='bomb').length<player.bombs) player.inputQueue.push({type:'bomb'});
    } else putBomb(room, player);
  }
}

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/maps.js': ['maps.js', 'text/javascript; charset=utf-8'],
  '/camera.js': ['camera.js', 'text/javascript; charset=utf-8'],
  '/items.js': ['items.js', 'text/javascript; charset=utf-8'],
  '/items/powerups-3d-v1.png': ['items/powerups-3d-v1.png', 'image/png'],
  '/effects.js': ['effects.js', 'text/javascript; charset=utf-8'],
  '/animation.js': ['animation.js', 'text/javascript; charset=utf-8'],
  '/skins/gustavo-walk-v1.png': ['skins/gustavo-walk-v1.png', 'image/png'],
  '/skins/mary-walk-v1.png': ['skins/mary-walk-v1.png', 'image/png'],
  '/skins/kaique-walk-v1.png': ['skins/kaique-walk-v1.png', 'image/png'],
  '/skins/jheniffer-walk-v1.png': ['skins/jheniffer-walk-v1.png', 'image/png'],
  '/joystick.js': ['joystick.js', 'text/javascript; charset=utf-8'],
  '/netcode.js': ['netcode.js', 'text/javascript; charset=utf-8'],
  '/physics.js': ['physics.js', 'text/javascript; charset=utf-8'],
  '/game.js': ['game.js', 'text/javascript; charset=utf-8'],
  '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/sw.js': ['sw.js', 'text/javascript; charset=utf-8'],
  '/icons/party-four-v1-180.png': ['icons/party-four-v1-180.png', 'image/png'],
  '/icons/party-four-v1-192.png': ['icons/party-four-v1-192.png', 'image/png'],
  '/icons/party-four-v1-512.png': ['icons/party-four-v1-512.png', 'image/png'],
  '/icons/party-four-v1-1024.png': ['icons/party-four-v1-1024.png', 'image/png'],
  '/icon.svg': ['icon.svg', 'image/svg+xml'],
  '/icon-192.png': ['icons/party-four-v1-192.png', 'image/png'],
  '/icon-512.png': ['icons/party-four-v1-512.png', 'image/png'],
  '/icon-180.png': ['icons/party-four-v1-180.png', 'image/png'],
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
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': ['index.html', 'sw.js', 'manifest.webmanifest', 'game.js', 'physics.js', 'animation.js', 'effects.js', 'maps.js', 'camera.js', 'netcode.js', 'joystick.js', 'items.js', 'styles.css'].includes(file) ? 'no-cache' : 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
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
  send(ws,availability());
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
