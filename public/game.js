(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const canvas = $('arena');
  const ctx = canvas.getContext('2d');
  const SIZE = 48;
  const COLOR = ['#ac82ff', '#ff6e96', '#55dcff', '#ffd36f'];
  const params = new URLSearchParams(location.search);
  const prefill = (params.get('sala') || '').replace(/[^a-z0-9]/gi, '').slice(0, 5).toUpperCase();
  const nameInput = $('nameInput');
  const codeInput = $('codeInput');
  codeInput.value = prefill;
  nameInput.value = localStorage.getItem('arena-name') || '';

  let socket = null;
  let meId = null;
  let currentCode = null;
  let state = null;
  let soundOn = false;
  let audioCtx = null;
  let disconnected = false;
  let toastTimer;
  let lastPhase = null;
  let lastSoundKey = '';
  const heldKeys = new Set();
  let touchDirection = null;
  let lastDirection = '0,0';
  const displayPositions = new Map();

  function safeSend(data) {
    if (socket?.readyState !== WebSocket.OPEN) {
      toast('Aguarde a conexão com o servidor.');
      return false;
    }
    socket.send(JSON.stringify(data));
    return true;
  }
  function toast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
  }
  function getName() {
    const name = nameInput.value.trim().slice(0, 18) || 'Jogador';
    localStorage.setItem('arena-name', name);
    return name;
  }
  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.addEventListener('open', () => {
      $('serverDot').classList.add('live');
      $('serverText').textContent = 'Servidor online';
      if (disconnected && currentCode) {
        safeSend({ type: 'join', code: currentCode, name: getName() });
      }
      disconnected = false;
    });
    socket.addEventListener('close', () => {
      $('serverDot').classList.remove('live');
      $('serverText').textContent = 'Reconectando...';
      disconnected = true;
      toast('Conexão perdida. Tentando reconectar...');
      setTimeout(connect, 1800);
    });
    socket.addEventListener('error', () => {});
    socket.addEventListener('message', event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      handleMessage(msg);
    });
  }
  function handleMessage(msg) {
    if (msg.type === 'hello') {
      meId = msg.playerId;
      return;
    }
    if (msg.type === 'error') {
      toast(msg.message || 'Não foi possível completar a ação.');
      if (disconnected && currentCode) leave(false);
      return;
    }
    if (msg.type === 'joined') {
      currentCode = msg.code;
      meId = msg.playerId;
      state = null;
      displayPositions.clear();
      lastPhase = null;
      history.replaceState(null, '', `${location.pathname}?sala=${currentCode}`);
      toast('Você entrou na sala!');
      return;
    }
    if (msg.type === 'left') {
      leave(false);
      return;
    }
    if (msg.type === 'pickup') {
      if (soundOn) beep(670, .12, 'triangle');
      const labels = { range: '🔥 Alcance aumentado!', bomb: '💣 Bomba extra!', speed: '⚡ Mais velocidade!' };
      toast(labels[msg.bonus] || 'Poder recebido!');
      return;
    }
    if (msg.type === 'state') {
      if (currentCode && msg.code !== currentCode) return;
      currentCode = msg.code;
      state = msg;
      updateUi();
    }
  }
  function show(panel) {
    for (const id of ['homePanel', 'roomPanel', 'gamePanel']) $(id).hidden = id !== panel;
  }
  function leave(notifyServer = true) {
    if (notifyServer && currentCode) safeSend({ type: 'leave' });
    currentCode = null;
    state = null;
    lastPhase = null;
    displayPositions.clear();
    heldKeys.clear();
    touchDirection = null;
    lastDirection = '0,0';
    history.replaceState(null, '', location.pathname);
    show('homePanel');
  }
  function makeAvatar(slot) {
    const avatar = document.createElement('div');
    avatar.className = 'player-avatar';
    avatar.style.background = COLOR[slot];
    avatar.textContent = '●';
    return avatar;
  }
  function makePlayerRow(p, roomMode) {
    const row = document.createElement('div');
    row.className = roomMode === 'lobby' ? 'lobby-row' : 'game-player';
    if (!p.alive && roomMode !== 'lobby') row.classList.add('eliminated');
    row.append(makeAvatar(p.slot));
    const name = document.createElement('div');
    name.className = 'player-name';
    name.textContent = p.name + (p.id === meId ? ' (você)' : '');
    row.append(name);
    const role = document.createElement('span');
    role.className = 'player-role';
    role.textContent = roomMode === 'lobby' ? (p.id === state.hostId ? 'ANFITRIÃO' : 'PRONTO') : (p.alive ? 'VIVO' : 'FORA');
    row.append(role);
    return row;
  }
  function updatePlayers() {
    const lobby = $('lobbyPlayers');
    const sidebar = $('gamePlayers');
    lobby.replaceChildren();
    sidebar.replaceChildren();
    const ordered = [...state.players].sort((a, b) => a.slot - b.slot);
    for (const p of ordered) {
      lobby.append(makePlayerRow(p, 'lobby'));
      sidebar.append(makePlayerRow(p, 'game'));
    }
    for (let i = ordered.length; i < 4; i++) {
      const empty = document.createElement('div');
      empty.className = 'lobby-row empty';
      const avatar = document.createElement('div');
      avatar.className = 'player-avatar';
      avatar.textContent = '+';
      const label = document.createElement('div');
      label.className = 'player-name';
      label.textContent = 'Aguardando jogador...';
      empty.append(avatar, label);
      lobby.append(empty);
    }
  }
  function updateUi() {
    if (!state) return;
    $('roomCode').textContent = currentCode;
    $('gameCode').textContent = currentCode;
    $('playerCount').textContent = `${state.players.length} / 4`;
    const isHost = state.hostId === meId;
    $('startBtn').disabled = !isHost;
    $('startBtn').textContent = 'Iniciar partida ▶';
    $('hostHint').textContent = isHost ? 'Você é o anfitrião. Pode iniciar com 1 a 4 pessoas.' : 'Aguardando o anfitrião iniciar a partida.';
    updatePlayers();

    if (state.phase === 'lobby') {
      show('roomPanel');
    } else {
      show('gamePanel');
      const overlay = $('roundOverlay');
      const repeat = $('playAgainBtn');
      repeat.hidden = true;
      if (state.phase === 'countdown') {
        overlay.hidden = false;
        $('overlayIcon').textContent = '⚡';
        $('overlayTitle').textContent = String(state.countdown || 'JÁ!');
        $('overlayText').textContent = 'Prepare seus dedos!';
        $('roundStatus').textContent = 'PREPARANDO ARENA';
      } else if (state.phase === 'playing') {
        overlay.hidden = false;
        const me = state.players.find(p => p.id === meId);
        if (me && !me.alive) {
          $('overlayIcon').textContent = '💥';
          $('overlayTitle').textContent = 'VOCÊ EXPLODIU!';
          $('overlayText').textContent = 'Acompanhe os sobreviventes até o fim.';
        } else {
          overlay.hidden = true;
        }
        $('roundStatus').textContent = 'PARTIDA EM ANDAMENTO';
      } else if (state.phase === 'finished') {
        overlay.hidden = false;
        const winner = state.players.find(p => p.id === state.winnerId);
        $('overlayIcon').textContent = winner ? '🏆' : '💥';
        $('overlayTitle').textContent = winner?.id === meId ? 'VOCÊ VENCEU!' : (winner ? `${winner.name} VENCEU!` : 'EMPATE!');
        $('overlayText').textContent = isHost ? 'Pronto para mais uma? Reúna sua turma para a revanche.' : 'Aguarde o anfitrião começar a revanche.';
        repeat.hidden = !isHost;
        $('roundStatus').textContent = 'FIM DA PARTIDA';
      }
    }
    if (lastPhase !== state.phase) {
      if (lastPhase === 'countdown' && state.phase === 'playing') syncDirection();
      if (soundOn && state.phase === 'playing') beep(520, .12, 'triangle');
      lastPhase = state.phase;
    }
    if (soundOn && state.phase === 'playing') {
      const key = state.bombs.map(b => `${b.x},${b.y}`).join('|');
      if (lastSoundKey && key.length < lastSoundKey.length && state.flames.length > 0) beep(120, .16, 'sawtooth');
      lastSoundKey = key;
    }
  }
  function joinFromInput() {
    const code = codeInput.value.replace(/[^a-z0-9]/gi, '').slice(0, 5).toUpperCase();
    if (code.length !== 5) return toast('Digite o código de cinco caracteres da sala.');
    safeSend({ type: 'join', code, name: getName() });
  }
  $('createBtn').addEventListener('click', () => safeSend({ type: 'create', name: getName() }));
  $('joinBtn').addEventListener('click', joinFromInput);
  codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') joinFromInput(); });
  nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') $('createBtn').click(); });
  $('startBtn').addEventListener('click', () => safeSend({ type: 'start' }));
  $('playAgainBtn').addEventListener('click', () => safeSend({ type: 'start' }));
  $('leaveBtn').addEventListener('click', () => leave());
  $('exitGameBtn').addEventListener('click', () => leave());
  $('shareBtn').addEventListener('click', async () => {
    const link = `${location.origin}/?sala=${currentCode}`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiado! Envie para seus amigos.');
    } catch {
      toast(`Copie o código da sala: ${currentCode}`);
    }
  });

  function beep(freq, duration, type = 'sine') {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const o = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, audioCtx.currentTime);
      o.frequency.exponentialRampToValueAtTime(Math.max(60, freq * .5), audioCtx.currentTime + duration);
      gain.gain.setValueAtTime(.11, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
      o.connect(gain).connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + duration);
    } catch { /* som opcional */ }
  }
  $('soundBtn').addEventListener('click', () => {
    soundOn = !soundOn;
    $('soundLabel').textContent = soundOn ? 'LIGADO' : 'SOM';
    if (soundOn) beep(660, .12);
  });

  const keyToDirection = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0]
  };
  function isPlaying() { return state && state.phase === 'playing' && currentCode; }
  function syncDirection() {
    let dir = touchDirection;
    if (!dir) {
      for (const key of [...heldKeys].reverse()) {
        if (keyToDirection[key]) { dir = keyToDirection[key]; break; }
      }
    }
    dir = dir || [0, 0];
    const key = dir.join(',');
    if (key === lastDirection || !isPlaying()) return;
    lastDirection = key;
    safeSend({ type: 'move', x: dir[0], y: dir[1] });
  }
  document.addEventListener('keydown', event => {
    if (/input|textarea/i.test(event.target.tagName)) return;
    if (keyToDirection[event.code]) {
      event.preventDefault();
      heldKeys.add(event.code);
      syncDirection();
    } else if (event.code === 'Space' && isPlaying()) {
      event.preventDefault();
      if (!event.repeat) safeSend({ type: 'bomb' });
    }
  });
  document.addEventListener('keyup', event => {
    if (keyToDirection[event.code]) {
      event.preventDefault();
      heldKeys.delete(event.code);
      syncDirection();
    }
  });
  window.addEventListener('blur', () => {
    heldKeys.clear();
    touchDirection = null;
    syncDirection();
  });
  for (const button of document.querySelectorAll('.ctrl')) {
    const direction = [Number(button.dataset.dx), Number(button.dataset.dy)];
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      touchDirection = direction;
      button.classList.add('pressed');
      syncDirection();
    });
    const end = () => {
      touchDirection = null;
      button.classList.remove('pressed');
      syncDirection();
    };
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('lostpointercapture', end);
  }
  $('touchBomb').addEventListener('pointerdown', event => {
    event.preventDefault();
    if (isPlaying()) safeSend({ type: 'bomb' });
  });

  function rectangle(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
  function roundRect(x, y, w, h, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  }
  function circle(x, y, radius, color) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  function drawFloor(x, y, ix, iy) {
    rectangle(x, y, SIZE, SIZE, ((ix + iy) & 1) ? '#26203d' : '#2c2444');
    rectangle(x + 4, y + 4, SIZE - 8, 1, '#ffffff08');
    if ((ix * 11 + iy * 13) % 9 === 0) {
      circle(x + 12, y + 35, 2, '#5f4e80');
      circle(x + 37, y + 15, 1.5, '#5f4e80');
    }
  }
  function drawWall(x, y) {
    rectangle(x, y, SIZE, SIZE, '#1a1730');
    roundRect(x + 2, y + 2, SIZE - 4, SIZE - 5, 6, '#61518c');
    roundRect(x + 4, y + 4, SIZE - 8, SIZE - 10, 5, '#544579');
    rectangle(x + 7, y + 7, SIZE - 14, 3, '#8473ab');
    rectangle(x + 7, y + SIZE - 11, SIZE - 14, 3, '#382e58');
    rectangle(x + 23, y + 14, 2, 17, '#382f5a');
  }
  function drawCrate(x, y) {
    roundRect(x + 3, y + 4, 42, 40, 5, '#a85b69');
    roundRect(x + 5, y + 5, 38, 34, 4, '#cf7b70');
    rectangle(x + 11, y + 7, 26, 29, '#a95c67');
    rectangle(x + 21, y + 7, 5, 29, '#e19a83');
    ctx.strokeStyle = '#e5ac8b';
    ctx.lineWidth = 4;
    ctx.beginPath();ctx.moveTo(x + 13, y + 11);ctx.lineTo(x + 35, y + 33);ctx.moveTo(x + 35, y + 11);ctx.lineTo(x + 13, y + 33);ctx.stroke();
    rectangle(x + 8, y + 8, 5, 5, '#f9d69d');
    rectangle(x + 35, y + 8, 5, 5, '#f9d69d');
  }
  function drawPowerup(p, time) {
    const x = p.x * SIZE + 24, y = p.y * SIZE + 25 + Math.sin(time / 230 + p.x) * 2;
    const color = p.type === 'range' ? '#ffbb73' : p.type === 'bomb' ? '#c29aff' : '#72f0e1';
    circle(x, y + 3, 18, '#140f29');
    roundRect(x - 14, y - 14, 28, 28, 7, color);
    circle(x - 6, y - 6, 3, '#ffffff99');
    ctx.fillStyle = '#31203f';
    ctx.font = '1000 20px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.type === 'range' ? '✹' : p.type === 'bomb' ? '+' : '»', x, y + 1);
  }
  function drawBomb(b, time) {
    const x = b.x * SIZE + 24, y = b.y * SIZE + 27;
    const pulse = .95 + .07 * Math.sin(time / 85);
    const radius = 18 * pulse;
    circle(x, y + 4, radius + 3, '#07071188');
    circle(x, y, radius, b.fuse < 600 ? '#f65f91' : '#1b1538');
    circle(x - 6, y - 6, 5, b.fuse < 600 ? '#ffc4d9' : '#7f72b2');
    rectangle(x - 4, y - radius - 5, 8, 8, '#bba5d5');
    rectangle(x - 1, y - radius - 12, 5, 8, '#ffd97a');
    if (b.fuse < 900) circle(x + 11, y + 11, 3, '#f8e59e');
  }
  function drawFlame(f, time) {
    const x = f.x * SIZE + 24, y = f.y * SIZE + 24;
    const wobble = 1 + Math.sin(time / 90 + f.x * 7) * .075;
    ctx.save();ctx.translate(x, y);ctx.scale(wobble, wobble);
    ctx.shadowBlur = 24;ctx.shadowColor = '#ff8653';
    roundRect(-20, -20, 40, 40, 12, '#ff684f');
    ctx.shadowBlur = 0;
    roundRect(-14, -14, 28, 28, 8, '#ffd071');
    roundRect(-6, -6, 12, 12, 4, '#fff2c4');
    ctx.restore();
  }
  function drawPlayer(p, time) {
    const targetX = p.x * SIZE + 24, targetY = p.y * SIZE + 21;
    let point = displayPositions.get(p.id);
    if (!point) { point = { x: targetX, y: targetY }; displayPositions.set(p.id, point); }
    point.x += (targetX - point.x) * .32;
    point.y += (targetY - point.y) * .32;
    const x = point.x, y = point.y + Math.sin(time / 160 + p.slot) * 1.4;
    if (!p.alive) return;
    const color = p.color;
    circle(x, y + 22, 16, '#09071688');
    roundRect(x - 12, y + 8, 24, 18, 8, color);
    roundRect(x - 15, y - 20, 30, 34, 11, color);
    roundRect(x - 19, y - 11, 6, 18, 3, color);
    roundRect(x + 13, y - 11, 6, 18, 3, color);
    roundRect(x - 10, y - 11, 20, 16, 7, '#faf5ff');
    circle(x - 5, y - 3, 2.5, '#2b213e');
    circle(x + 5, y - 3, 2.5, '#2b213e');
    roundRect(x - 4, y - 25, 8, 8, 3, '#f6f3ff');
    circle(x - 7, y - 15, 4, '#ffffff8a');
    if (p.id === meId) {
      ctx.strokeStyle = '#fffbd4';ctx.lineWidth = 2;
      ctx.beginPath();ctx.arc(x, y - 3, 23, 0, Math.PI * 2);ctx.stroke();
      ctx.fillStyle = '#fff1a6';ctx.textAlign = 'center';ctx.font = '900 11px sans-serif';
      ctx.fillText('VOCÊ', x, y - 33);
    }
  }
  function drawEmpty() {
    ctx.fillStyle = '#1a1430';ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#544177';ctx.textAlign = 'center';ctx.font = '900 27px system-ui';
    ctx.fillText('AGUARDANDO A ARENA...', canvas.width / 2, canvas.height / 2);
  }
  function draw(time) {
    requestAnimationFrame(draw);
    if (!state?.board || $('gamePanel').hidden) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const px = x * SIZE, py = y * SIZE;
        drawFloor(px, py, x, y);
        if (state.board[y][x] === 1) drawWall(px, py);
        else if (state.board[y][x] === 2) drawCrate(px, py);
      }
    }
    for (const p of state.powerups || []) drawPowerup(p, time);
    for (const b of state.bombs || []) drawBomb(b, time);
    for (const f of state.flames || []) drawFlame(f, time);
    for (const p of state.players || []) drawPlayer(p, time);
  }

  show('homePanel');
  drawEmpty();
  connect();
  requestAnimationFrame(draw);
})();
