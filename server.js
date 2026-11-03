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
const bombMotion=require('./bomb-motion');
const rules=require('./game-rules');
const botMinds=require('./bot-minds').createController();
const COLORS = ['#ac82ff', '#ff6e96', '#55dcff', '#ffd36f'];
const SKINS = ['Mary', 'Kaique', 'Jheniffer', 'Gustavo'];
const START_LIVES = 3;
const MAX_LIVES = 5;
const RESPAWN_INVULNERABLE_MS = 2800;
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
    lives: START_LIVES,
    collectedPowerups: [],
    bombs: 1,
    activeBombs: 0,
    range: 2,
    speed: 170, baseSpeed:170, slowedUntil:0, kick:false, shield:0, invulnerableUntil:0, push:false, piercing:false,
    lastMove: 0,
    inputQueue: [], inputBudget: 0, ack: 0, lastQueuedSeq: 0, usingInputs: false,
    motion: { x: 0, y: 0 }, moveTarget:null,
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
    mapChoice:'rotation', mapId:'classic', roundIndex:0, botsEnabled:false,
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
    id: p.id, name: p.name, bot:!!p.bot, botSpeech:p.botSpeech?.until>now()?p.botSpeech:null, botAllyId:p.botMind?.allyId||null, botPlan:p.bot?{source:p.botMind?.planSource||'local',goal:p.botMind?.goal||'collect',destination:p.botMind?.destination||null,bombMode:p.botMind?.bombMode||'auto'}:null, slot: p.slot, skinIndex: p.skinIndex, color: p.color, skin: p.skin,
    x: p.x, y: p.y, ack: p.ack, motion: p.motion, moveTarget:p.moveTarget, facing: p.facing, alive: p.alive, lives:p.lives??START_LIVES, maxLives:MAX_LIVES, bombs: p.bombs,
    range: p.range, speed: p.speed, slowedUntil:p.slowedUntil, kick:p.kick, shield:p.shield, invulnerableUntil:p.invulnerableUntil, push:p.push, piercing:p.piercing, kills: p.kills, place: p.place
  };
}
function stateFor(room) {
  return {
    type: 'state',
    serverTime: now(), botAI:botMinds.status(), mapChoice:room.mapChoice, mapId:room.mapId, mapName:maps.DEFS[room.mapId].name,
    effects: room.effects, collapse:collapse.view(room.collapse,now()),
    code: room.code,
    hostId: room.hostId,
    botsEnabled:!!room.botsEnabled,
    phase: room.phase,
    players: [...room.players.values()].map(playerView),
    board: room.board,
    bombs: room.bombs.map(b => ({ id:b.id, piercing:b.piercing, ownerId:b.ownerId, placedAt:b.placedAt, explodeAt:b.explodeAt, slide:b.slide, rolling:b.rolling, x: b.x, y: b.y, passThrough: b.passThrough, fuse: Math.max(0, b.explodeAt - now()) })),
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
      room.botsEnabled=false;
      room.board = null;
      room.lastEmptyAt = now();
      broadcastAvailability();
      return;
    }
    rooms.delete(room.code);
    broadcastAvailability();
    return;
  }
  if (!room.players.has(room.hostId)){room.hostId = [...room.players.values()].find(p=>!p.bot)?.id;room.botsEnabled=false;}
  if (room.phase === 'countdown' && room.players.size === 0) room.phase = 'lobby';
  if (room.phase === 'playing') checkWinner(room);
  broadcast(room);
}
function getRoom(ws) { return ws.roomCode && rooms.get(ws.roomCode); }
function makeBoard(id='classic'){return maps.create(id);}
function removeBots(room) {
  for(const [id,p] of room.players) if(p.bot){botMinds.cancelPlayer(p);room.players.delete(id);}
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
  if(room.botsEnabled)fillBots(room);else removeBots(room);
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
  const special=['shield','push','pierce','range'];
  for(let slot=0;slot<4;slot++){const p=SPAWNS[slot],dx=p.x===1?2:-2,dy=p.y===1?2:-2;room.powerups.set(tileKey(p.x+dx,p.y),slot===room.roundIndex%4?'kick':special[(slot+room.roundIndex-1)%special.length]);room.powerups.set(tileKey(p.x,p.y+dy),slot===(room.roundIndex+1)%4?'push':'speed');}
  const centre={x:Math.floor(WIDTH/2),y:Math.floor(HEIGHT/2)};
  const curseCell=room.board.flatMap((row,y)=>row.flatMap((cell,x)=>cell===0?[{x,y}]:[])).sort((a,b)=>(Math.abs(a.x-centre.x)+Math.abs(a.y-centre.y))-(Math.abs(b.x-centre.x)+Math.abs(b.y-centre.y)))[0];
  if(curseCell)room.powerups.set(tileKey(curseCell.x,curseCell.y),'curse');
  // Guarantee two discoverable extra lives each round, plus rare crate hearts.
  const freeHeartCells=room.board.flatMap((row,y)=>row.flatMap((cell,x)=>
    cell===0&&!room.powerups.has(tileKey(x,y))&&SPAWNS.every(p=>Math.abs(p.x-x)+Math.abs(p.y-y)>3)?[{x,y}]:[]));
  freeHeartCells.sort((a,b)=>
    (Math.abs(a.x-WIDTH/3)+Math.abs(a.y-HEIGHT/3))-(Math.abs(b.x-WIDTH/3)+Math.abs(b.y-HEIGHT/3)));
  for(const cell of [freeHeartCells[0],...freeHeartCells.slice().reverse().slice(0,1)]) {
    if(cell && !room.powerups.has(tileKey(cell.x,cell.y)))room.powerups.set(tileKey(cell.x,cell.y),'life');
  }
  room.winnerId = null;
  room.phase = 'countdown';
  room.countdownUntil = now() + 3000;
  room.collapse=collapse.create(room.board,room.countdownUntil);
  room.participantsAtStart = room.players.size;
  room.eliminatedCount = 0;
  for (const p of room.players.values()) {
    const pos = SPAWNS[p.slot];
    Object.assign(p, {
      x: pos.x, y: pos.y, facing: 'down', alive: true, lives:START_LIVES, collectedPowerups:[], bombs: 1, activeBombs: 0,
      range: 2, speed: 170, baseSpeed:170, slowedUntil:0, kick:false, shield:0, invulnerableUntil:0, push:false, piercing:false, lastMove: 0, inputQueue: [], inputBudget: 0, ack: 0, lastQueuedSeq: 0, usingInputs: false, motion: { x: 0, y: 0 }, moveTarget:null, kills: 0, place: null, botTarget:null, botThinkAt:0, botCooldown:0, botStall:0, botIdleFor:0, botReplanAt:0, botRecent:[]
    });
  }
  botMinds.reset(room,now());
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
    p.baseSpeed??=p.speed;
    p.speed=p.baseSpeed*((p.slowedUntil||0)>t?1.6:1);
    p.flameContact=null;
    const contact=hazards.length?(x,y)=>{if(!p.flameContact)p.flameContact=hazards.find(h=>physics.touchesFlame({x,y},h.flame,tiles,h.shapes))?.flame;}:undefined;
    if(p.bot) {
      bots.update(room,p,t,dt,putBomb,contact,direction=>bombMotion.tryKick(room,p,direction,t));
    } else if(p.usingInputs) {
      p.inputBudget=Math.min(.1,p.inputBudget+dt);
      while(p.inputQueue.length) {
        const command=p.inputQueue[0];
        if(command.type==='bomb') {p.inputQueue.shift();putBomb(room,p);continue;}
        if(p.inputBudget+1e-9<STEP) break;
        p.inputQueue.shift();p.inputBudget-=STEP;p.motion={x:command.x,y:command.y};
        bombMotion.tryKick(room,p,p.motion,t);physics.move(p,p.motion,STEP,room.board,room.bombs,contact,[...room.players.values()]);p.ack=command.seq;
      }
    } else {
      if (t - (p.lastInput || 0) > 1200) p.motion = { x: 0, y: 0 };
      bombMotion.tryKick(room,p,p.motion,t);physics.move(p, p.motion, dt, room.board, room.bombs,contact,[...room.players.values()]);
    }
    const key = tileKey(Math.round(p.x), Math.round(p.y));
    const bonus = room.powerups.get(key);
    if (bonus) {
      const previous={shield:p.shield,push:p.push,piercing:p.piercing,kick:p.kick,baseSpeed:p.baseSpeed};
      if (bonus === 'range') p.range += 1;
      if (bonus === 'maxrange') p.range+=5;
      if (bonus === 'shield') p.shield=1;
      if (bonus === 'push'||bonus==='bombpass') p.push=true;
      if (bonus === 'pierce') p.piercing=true;
      if (bonus === 'bomb') p.bombs += 1;
      if (bonus === 'speed') p.baseSpeed = Math.max(rules.MIN_SPEED,p.baseSpeed-rules.SPEED_GAIN);
      if (bonus === 'curse') p.slowedUntil=t+6000;
      if (bonus === 'kick') p.kick=true;
      if (bonus === 'life')p.lives=Math.min(MAX_LIVES,(p.lives??START_LIVES)+1);
      if (['range','maxrange','bomb'].includes(bonus) ||
        (bonus==='speed'&&p.baseSpeed<previous.baseSpeed) ||
        (bonus==='shield'&&!previous.shield) ||
        (['push','bombpass'].includes(bonus)&&!previous.push) ||
        (bonus==='pierce'&&!previous.piercing) ||
        (bonus==='kick'&&!previous.kick)) {
        (p.collectedPowerups??=[]).push(bonus);
      }
      p.speed=p.baseSpeed*(p.slowedUntil>t?1.6:1);
      room.effects.push({kind:'pickup',x:Math.round(p.x),y:Math.round(p.y),startedAt:t,expiresAt:t+600});
      room.powerups.delete(key);
      send(p.ws, { type: 'pickup', bonus, lives:p.lives, atSpeedLimit:bonus==='speed'&&p.baseSpeed<=rules.MIN_SPEED });
    }
  }
}
function putBomb(room, player) {
  if (room.phase !== 'playing' || !player.alive || player.activeBombs >= player.bombs) return;
  if (room.bombs.some(b => bombMotion.occupies(b,Math.round(player.x),Math.round(player.y)))) return;
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
          room.pendingPowerups.push({x,y,type:rules.drop(),readyAt:t+500});
        }
        if(!bomb.piercing)break;
      }
    }
  }
  for (const { x, y } of tiles) {
    if(room.powerups.delete(tileKey(x,y)))room.effects.push({kind:'itemBurn',x,y,startedAt:t,expiresAt:t+420});
    room.flames.push({ x, y, startedAt:t, expiresAt: t + 500, ownerId: bomb.ownerId });
    for (const chained of room.bombs) {
      if (bombMotion.occupies(chained,x,y)) chained.explodeAt = t;
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

function clearCollectedPowerups(p){
  const collected=Array.isArray(p.collectedPowerups)?p.collectedPowerups.slice():[];
  p.collectedPowerups=[];
  p.bombs=1;p.range=2;p.baseSpeed=rules.BASE_SPEED;p.speed=rules.BASE_SPEED;
  p.slowedUntil=0;p.kick=false;p.shield=0;p.push=false;p.piercing=false;
  return collected;
}
function dropCollectedPowerups(room,p,t){
  const items=clearCollectedPowerups(p);
  if(!items.length)return;
  const x=Math.round(p.x),y=Math.round(p.y);
  const occupied=new Set([
    ...room.powerups.keys(),
    ...room.pendingPowerups.map(v=>tileKey(v.x,v.y))
  ]);
  const candidates=[];
  for(let dy=-HEIGHT;dy<=HEIGHT;dy++)for(let dx=-WIDTH;dx<=WIDTH;dx++){
    const px=x+dx,py=y+dy;
    if(room.board[py]?.[px]!==0 || occupied.has(tileKey(px,py)) ||
      room.bombs.some(b=>bombMotion.occupies(b,px,py)))continue;
    const distance=Math.abs(dx)+Math.abs(dy);
    if(distance>10)continue;
    candidates.push({x:px,y:py,distance});
  }
  candidates.sort((a,b)=>a.distance-b.distance || a.y-b.y || a.x-b.x);
  for(let i=0;i<Math.min(items.length,candidates.length);i++){
    const spot=candidates[i];
    room.pendingPowerups.push({x:spot.x,y:spot.y,type:items[i],readyAt:t+750});
  }
  room.effects.push({kind:'itemDrop',x,y,startedAt:t,expiresAt:t+850});
}
function chooseRespawnTile(room,p){
  const origin=SPAWNS[p.slot];
  const choices=[];
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
    if(room.board[y]?.[x]!==0)continue;
    if(room.bombs.some(b=>bombMotion.occupies(b,x,y)))continue;
    if([...room.players.values()].some(other=>other.id!==p.id&&other.alive&&Math.abs(other.x-x)<1&&Math.abs(other.y-y)<1))continue;
    if(room.flames.some(f=>f.x===x&&f.y===y&&f.expiresAt>now()))continue;
    choices.push({x,y,distance:Math.abs(x-origin.x)+Math.abs(y-origin.y)});
  }
  choices.sort((a,b)=>a.distance-b.distance);
  return choices[0]||{x:p.x,y:p.y};
}
function loseLife(room,p,flame,t){
  const oldLives=p.lives??START_LIVES;
  p.lives=Math.max(0,oldLives-1);
  dropCollectedPowerups(room,p,t);
  p.motion={x:0,y:0};p.moveTarget=null;p.inputQueue=[];p.inputBudget=0;
  const owner=room.players.get(flame.ownerId);
  if(owner&&owner.id!==p.id)owner.kills++;
  room.effects.push({kind:'lifeLost',x:Math.round(p.x),y:Math.round(p.y),startedAt:t,expiresAt:t+1000});
  if(p.lives>0){
    const respawn=chooseRespawnTile(room,p);
    p.x=respawn.x;p.y=respawn.y;p.invulnerableUntil=t+RESPAWN_INVULNERABLE_MS;
    send(p.ws,{type:'lifeLost',lives:p.lives});
    return false;
  }
  p.alive=false;p.invulnerableUntil=0;
  send(p.ws,{type:'lifeLost',lives:0});
  return true;
}

function applyFlames(room) {
  const eliminated = [];
  const tiles=new Set(room.flames.map(f=>tileKey(f.x,f.y)));
  const hazards=room.flames.map(flame=>({flame,shapes:physics.flameShapes(flame,tiles)}));
  for (const p of room.players.values()) {
    if (!p.alive) continue;
    const flame=(p.flameContact&&p.flameContact.expiresAt>now()?p.flameContact:null)||hazards.find(h=>physics.touchesFlame(p,h.flame,tiles,h.shapes))?.flame;
    if(flame && (p.invulnerableUntil||0)<=now()){
      if(p.shield){p.shield=0;p.collectedPowerups=(p.collectedPowerups||[]).filter(item=>item!=='shield');p.invulnerableUntil=now()+1400;room.effects.push({kind:'pickup',x:Math.round(p.x),y:Math.round(p.y),startedAt:now(),expiresAt:now()+600});send(p.ws,{type:'shield'});}
      else eliminated.push({player:p,flame});
    }
  }
  // Each explosion removes just one life. Only zero lives eliminates a player.
  const place=room.participantsAtStart-room.eliminatedCount;
  let totalEliminated=0;
  for(const {player,flame} of eliminated) {
    if(loseLife(room,player,flame,now())) {
      player.place=place;
      totalEliminated++;
    }
  }
  room.eliminatedCount+=totalEliminated;
}
function checkWinner(room) {
  if (room.phase !== 'playing') return;
  const alive = [...room.players.values()].filter(p => p.alive);
  if (room.participantsAtStart === 1 && alive.length > 0) return; // treino solo
  if (alive.length <= 1) {
    room.phase = 'finished';
    botMinds.cancelRoom(room);
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
      bombMotion.update(room,t);
      updatePowerups(room,t);
      botMinds.tick(room,t);
      movePlayers(room, t);
      room.flames = room.flames.filter(f => f.expiresAt > t);
      for(const b of room.bombs)if(room.flames.some(f=>bombMotion.occupies(b,f.x,f.y)))b.explodeAt=t;
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
  } else if(message.type==='bot-settings'){
    if(room.hostId!==ws.playerId)return error(ws,'Só o anfitrião escolhe se a partida terá bots.');
    if(!['lobby','finished'].includes(room.phase))return error(ws,'Escolha os bots antes de iniciar a próxima partida.');
    if(typeof message.enabled!=='boolean')return;
    room.botsEnabled=message.enabled;broadcast(room);
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
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: clients.size, botAI:botMinds.status() }));
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
