(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const itemLegend=[...document.querySelectorAll('[data-item-skin]')].map(canvas=>({canvas,ctx:canvas.getContext('2d'),skin:canvas.dataset.itemSkin}));
  const canvas = $('arena');
  const ctx = canvas.getContext('2d');
  const SIZE = 48;
  const COLOR = ['#ac82ff', '#ff6e96', '#55dcff', '#ffd36f'];
  const SKIN_ICONS = ['💙', '👓', '🌸', '😎'];
  const SKIN_LABELS = ['MARY', 'KAIQUE', 'JHENIFFER', 'GUSTAVO'];
  const SPRITE_URLS = ['/skins/mary.webp', '/skins/kaique.webp', '/skins/jheniffer.webp', '/skins/gustavo-walk-v1.png'];
  const sprites = SPRITE_URLS.map(src => {
    if (!src) return null;
    const picture = new Image();
    picture.src = src;
    return picture;
  });
  const walkAtlases = ['mary','kaique','jheniffer','gustavo'].map(name => {
    const atlas = new Image();
    atlas.addEventListener('load',()=>BombaAnimation.prepareAtlas(atlas));
    atlas.src = `/skins/${name}-walk-v1.png`; return atlas;
  });
  const storedRoomKey = 'bomba-party-active-room';
  let savedRoom = (() => {
    try { return JSON.parse(sessionStorage.getItem(storedRoomKey)); } catch { return null; }
  })();
  let selectedSkin=Number(localStorage.getItem('arena-skin')||0);
  if(!Number.isInteger(selectedSkin)||selectedSkin<0||selectedSkin>3)selectedSkin=0;
  if(savedRoom&&!Number.isInteger(savedRoom.skinIndex)&&typeof savedRoom.name==='string'){const old=SKIN_LABELS.indexOf(savedRoom.name.toUpperCase());if(old>=0){savedRoom.skinIndex=old;selectedSkin=old;}}
  let selectionLocked=false;
  let roomAvailability={phase:'lobby',taken:[]};
  localStorage.removeItem('bomba-party-pin');

  let socket = null;
  let meId = null;
  let currentCode = null;
  let state = null;
  let soundOn = true;
  let musicStep = 0;
  let nextMusicTime = 0;
  const musicVoices = new Set();
  let lastFrame = 0;
  let frameDt = 1 / 60;
  let localPlayer = null;
  let prediction = null;
  let inputAccumulator = 0;
  const snapshotHistory = [];
  let rosterKey = '';
  let stateReceivedAt=0;
  let camera=null;
  let arenaPalette=BombaMaps.DEFS.classic;
  let minimapKey='';
  const minimap=document.createElement('canvas');
  let audioCtx = null;
  let disconnected = false;
  let entering = false;
  let toastTimer;
  let lastPhase = null;
  let lastBombCount=0;
  let lastKickTime=0;
  let flameSoundActive = false;
  let deferredInstallPrompt = null;
  let penaltyNotified = false;
  let watching=false;
  let spectatingId=null;
  let triedAutoFullscreen = false;
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
  function renderEntryCharacters(){
    const busy=['countdown','playing'].includes(roomAvailability.phase);
    const taken=roomAvailability.taken;
    const preferred=Number(localStorage.getItem('arena-skin'));
    if(!currentCode&&!selectionLocked&&Number.isInteger(preferred)&&preferred>=0&&preferred<4&&!taken.includes(preferred))selectedSkin=preferred;
    if(!currentCode&&!selectionLocked&&taken.includes(selectedSkin)){const free=[0,1,2,3].find(i=>!taken.includes(i));if(free!==undefined)selectedSkin=free;}
    const picker=$('entryCharacters');picker.replaceChildren();
    for(let index=0;index<4;index++){
      const option=document.createElement('button');option.type='button';option.className=`skin-choice${selectedSkin===index?' selected':''}`;
      option.dataset.skinIndex=index;option.disabled=busy||taken.includes(index);
      option.setAttribute('aria-pressed',String(selectedSkin===index));option.append(makeAvatar(index));
      const label=document.createElement('span');label.textContent=SKIN_LABELS[index];option.append(label);
      if(taken.includes(index)){const tag=document.createElement('small');tag.textContent='EM USO';option.append(tag);}
      option.addEventListener('click',()=>{selectedSkin=index;selectionLocked=true;localStorage.setItem('arena-skin',index);renderEntryCharacters();});
      picker.append(option);
    }
    const connected=socket?.readyState===WebSocket.OPEN;
    $('createBtn').disabled=!connected||busy||taken.includes(selectedSkin)||taken.length>=4;
    $('createBtn').textContent=`Entrar com ${SKIN_LABELS[selectedSkin]} →`;
    $('entryStatus').textContent=!connected?'Conectando à sala...':busy?'Partida em andamento. Aguarde a próxima rodada.':taken.length===4?'Sala cheia. Aguarde um personagem ficar livre.':taken.includes(selectedSkin)?'Este personagem está em uso. Escolha outro personagem livre.':'Escolha um personagem livre e entre na mesma sala da turma.';
  }
  function enterAsSelected(){
    selectionLocked=true;
    localStorage.setItem('arena-skin',selectedSkin);
    entering=safeSend({type:'enter',skinIndex:selectedSkin});
  }
  function connect() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}/ws`);
    socket.addEventListener('open', () => {
      $('serverDot').classList.add('live');
      $('serverText').textContent = 'Servidor online';
      if ((disconnected && currentCode) || savedRoom?.code) {
        if(Number.isInteger(savedRoom?.skinIndex))selectedSkin=savedRoom.skinIndex;
        enterAsSelected();
      }
      disconnected = false;renderEntryCharacters();
    });
    socket.addEventListener('close', () => {
      $('serverDot').classList.remove('live');
      $('serverText').textContent = 'Reconectando...';
      disconnected = true;renderEntryCharacters();
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
    if(msg.type==='availability'){roomAvailability=msg;renderEntryCharacters();return;}
    if (msg.type === 'hello') {
      meId = msg.playerId;
      return;
    }
    if (msg.type === 'error') {
      toast(msg.message || 'Não foi possível completar a ação.');
      if (!currentCode && savedRoom?.code) {
        sessionStorage.removeItem(storedRoomKey);
        savedRoom = null;
      }
      if (entering) {entering=false;leave(false);}
      else if (disconnected && currentCode) leave(false);
      return;
    }
    if (msg.type === 'joined') {
      entering=false;
      currentCode = msg.code;
      meId = msg.playerId;
      state = null;
      displayPositions.clear();
      lastPhase = null;
      if(Number.isInteger(msg.skinIndex))selectedSkin=msg.skinIndex;
      localStorage.setItem('arena-skin',selectedSkin);
      savedRoom = { code: currentCode, skinIndex:selectedSkin };
      sessionStorage.setItem(storedRoomKey, JSON.stringify(savedRoom));
      history.replaceState(null, '', location.pathname);
      // Algumas plataformas permitem abrir a tela cheia sem outro toque;
      // no iPhone a versão instalada já funciona sem barras do navegador.
      if (!triedAutoFullscreen) requestImmersive();
      toast('Você entrou na sala!');
      return;
    }
    if (msg.type === 'left') {
      leave(false);
      return;
    }
    if(msg.type==='shield'){if(soundOn)beep(880,.18,'triangle');toast('🛡 Seu escudo absorveu a explosão!');return;}
    if (msg.type === 'pickup') {
      if (soundOn) beep(msg.bonus==='curse'?145:670,.12,msg.bonus==='curse'?'sawtooth':'triangle');
      const labels = { range: '🔥 Alcance aumentado!', bomb: '💣 Bomba extra!', speed: '⚡ Mais velocidade!', shield:'🛡 Escudo: protege de uma explosão!', bombpass:'👻 Você pode atravessar bombas!', pierce:'◆ Suas bombas atravessam caixas!', maxrange:'✹ Chamas com alcance máximo!',curse:'💀 Caveira! Lentidão por 6 segundos.',kick:'🥊 Luva! Encoste andando para chutar bombas.' };
      toast(labels[msg.bonus] || 'Poder recebido!');
      return;
    }
    if (msg.type === 'state') {
      const own=msg.players.find(p=>p.id===meId);if(own&&own.skinIndex!==selectedSkin){selectedSkin=own.skinIndex;localStorage.setItem('arena-skin',selectedSkin);if(savedRoom){savedRoom.skinIndex=selectedSkin;sessionStorage.setItem(storedRoomKey,JSON.stringify(savedRoom));}}
      if (currentCode && msg.code !== currentCode) return;
      currentCode = msg.code;
      const previousPhase=state?.phase;
      state = msg;
      stateReceivedAt=performance.now();
      const authoritative = msg.players.find(p => p.id === meId);
      if(authoritative) {
        if(msg.phase!=='playing'||previousPhase!=='playing'||!prediction) {
          prediction=BombaNetcode.create(authoritative,msg.board,msg.bombs);
          inputAccumulator=0;localPlayer=prediction.player;
          if(previousPhase!==msg.phase) {displayPositions.clear();snapshotHistory.length=0;camera=null;}
        } else localPlayer=BombaNetcode.acknowledge(prediction,authoritative,msg.board,msg.bombs);
      }
      snapshotHistory.push({time:performance.now(),players:msg.players});
      if(snapshotHistory.length>30) snapshotHistory.shift();
      updateUi();
    }
  }
  function show(panel) {
    for (const id of ['homePanel', 'roomPanel', 'gamePanel']) $(id).hidden = id !== panel;
    document.body.classList.toggle('play-mode', panel === 'gamePanel');
    updateOrientationPrompt();
  }
  function updateOrientationPrompt() {
    const onPhone = matchMedia('(pointer: coarse)').matches;
    $('rotateOverlay').hidden = !(onPhone && !$('gamePanel').hidden && matchMedia('(orientation: portrait)').matches);
  }
  function requestImmersive() {
    if (soundOn) beep(440, .04);
    triedAutoFullscreen = true;
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    try {
      Promise.resolve(document.documentElement.requestFullscreen({ navigationUI: 'hide' }))
        .then(() => window.screen.orientation?.lock?.('landscape'))
        .catch(() => { /* tela cheia depende das permissões do navegador */ });
    } catch { /* Safari no iPhone usa o modo app da tela inicial */ }
  }
  function leave(notifyServer = true) {
    if (notifyServer && currentCode) safeSend({ type: 'leave' });
    currentCode = null;
    state = null;
    prediction = null;inputAccumulator=0;snapshotHistory.length=0;
    lastPhase = null;
    displayPositions.clear();
    heldKeys.clear();
    resetJoystick();
    lastDirection = '0,0';
    penaltyNotified = false;watching=false;spectatingId=null;document.body.classList.remove('spectating','eliminated');
    sessionStorage.removeItem(storedRoomKey);
    savedRoom = null;
    history.replaceState(null, '', location.pathname);
    $('soundLabel').textContent = soundOn ? 'LIGADO' : 'SOM';
  show('homePanel');
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  function getSkinIndex(p) { return Number.isInteger(p.skinIndex) ? p.skinIndex : p.slot; }
  function makeAvatar(skinIndex) {
    const avatar = document.createElement('div');
    avatar.className = `player-avatar skin-${skinIndex}`;
    avatar.style.background = `${COLOR[skinIndex]}24`;
    if (SPRITE_URLS[skinIndex]) {
      const picture = document.createElement('img');
      picture.src = SPRITE_URLS[skinIndex];
      picture.alt = '';
      if(skinIndex===3) {
        // Show the neutral front cell of Gustavo's sheet as the lobby portrait.
        avatar.style.position='relative';
        Object.assign(picture.style,{position:'absolute',width:'400%',height:'400%',maxWidth:'none',objectFit:'fill',left:'-100%',top:'0'});
      }
      avatar.append(picture);
    } else avatar.textContent = SKIN_ICONS[skinIndex];
    avatar.title = `Skin ${SKIN_LABELS[skinIndex]}`;
    return avatar;
  }
  function makePlayerRow(p, roomMode) {
    const row = document.createElement('div');
    row.className = roomMode === 'lobby' ? 'lobby-row' : 'game-player';
    if (!p.alive && roomMode !== 'lobby') row.classList.add('eliminated');
    row.append(makeAvatar(getSkinIndex(p)));
    const info = document.createElement('div');
    info.className = 'player-info';
    const name = document.createElement('div');
    name.className = 'player-name';
    name.textContent = p.name + (p.id === meId ? ' (você)' : '');
    const skin = document.createElement('div');
    skin.className = 'skin-label';
    skin.textContent = `SKIN ${p.skin || SKIN_LABELS[getSkinIndex(p)]}`;
    info.append(name, skin);
    row.append(info);
    const role = document.createElement('span');
    role.className = 'player-role';
    role.textContent = roomMode === 'lobby' ? (p.id === state.hostId ? 'ANFITRIÃO' : 'PRONTO') : (p.place ? `${p.place}º LUGAR` : (p.alive ? 'VIVO' : 'FORA'));
    row.append(role);
    return row;
  }
  function updatePlayers() {
    const key=JSON.stringify([state.code,state.phase,state.hostId,meId,state.players.map(p=>[p.id,p.name,p.slot,p.skinIndex,p.color,p.alive,p.place,p.bot])]);
    if(key===rosterKey) return;
    rosterKey=key;
    const lobby = $('lobbyPlayers');
    const sidebar = $('gamePlayers');
    lobby.replaceChildren();
    sidebar.replaceChildren();
    const ordered = [...state.players].sort((a, b) => a.slot - b.slot);
    for (const p of ordered) {
      lobby.append(makePlayerRow(p, 'lobby'));
      sidebar.append(makePlayerRow(p, 'game'));
    }
    const mobileHud = $('mobileHud');
    mobileHud.replaceChildren();
    for (const p of ordered) {
      const chip = document.createElement('div');
      chip.className = `hud-player ${p.alive ? '' : 'hud-out'}`;
      chip.style.setProperty('--skin-color', p.color);
      chip.textContent = `${p.bot?'🤖':SKIN_ICONS[getSkinIndex(p)]} ${p.name.slice(0, 10)}`;
      mobileHud.append(chip);
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
    updateSkinPicker();
  }
  function updateSkinPicker() {
    const picker = $('skinPicker');
    picker.hidden = state.phase !== 'lobby';
    if (picker.hidden) return;
    picker.replaceChildren();
    const mine = state.players.find(p => p.id === meId);
    for (let index = 0; index < 4; index++) {
      const occupiedBy = state.players.find(p => p.id !== meId && getSkinIndex(p) === index);
      const selected = mine && getSkinIndex(mine) === index;
      const option = document.createElement('button');
      option.type = 'button';
      option.className = `skin-choice${selected ? ' selected' : ''}`;
      option.disabled = !!occupiedBy;
      option.setAttribute('aria-pressed', String(!!selected));
      option.title = occupiedBy ? `Escolhida por ${occupiedBy.name}` : `Escolher ${SKIN_LABELS[index]}`;
      option.append(makeAvatar(index));
      const label = document.createElement('span');
      label.textContent = SKIN_LABELS[index];
      option.append(label);
      if (occupiedBy) {
        const taken = document.createElement('small');
        taken.textContent = 'EM USO';
        option.append(taken);
      }
      option.addEventListener('click', () => safeSend({ type: 'skin', skinIndex: index }));
      picker.append(option);
    }
  }
  function updateUi() {
    if (!state) return;
    $('mapSelect').disabled=state.hostId!==meId;
    if($('mapSelect').value!==state.mapChoice)$('mapSelect').value=state.mapChoice||'rotation';
    $('playerCount').textContent = `${state.players.length} / 4`;
    const isHost = state.hostId === meId;
    const me = state.players.find(p => p.id === meId);
    const survivors=state.players.filter(p=>p.alive&&p.id!==meId);
    const canWatch=!!me&&!me.alive&&state.phase==='playing'&&survivors.length>0;
    if(!canWatch){watching=false;spectatingId=null;}
    else if(!survivors.some(p=>p.id===spectatingId)){spectatingId=survivors[0].id;if(watching)camera=null;}
    const observed=survivors.find(p=>p.id===spectatingId);
    $('spectateBtn').hidden=!canWatch;
    $('spectateBtn').textContent=watching?`👁 ${observed?.name||'Jogador'} ↻`:'👁 TELAR';
    $('watchBtn').hidden=!canWatch;
    document.body.classList.toggle('spectating',watching);
    document.body.classList.toggle('eliminated',!!me&&!me.alive);

    $('startBtn').disabled = !isHost;
    const missingBots=Math.max(0,4-state.players.filter(p=>!p.bot).length);
    $('startBtn').textContent=isHost?`Iniciar partida${missingBots?` · +${missingBots} ${missingBots===1?'bot':'bots'}`:''} ▶`:'Aguardando anfitrião';
    $('hostHint').textContent = isHost ? 'A sala aguarda você tocar em Iniciar. Convide seus amigos; só então os bots completam as vagas.' : 'Aguardando o anfitrião iniciar a partida.';
    updatePlayers();

    if (state.phase === 'lobby') {
      show('roomPanel');
    } else {
      show('gamePanel');
      const overlay = $('roundOverlay');
      const repeat = $('playAgainBtn');
      repeat.hidden = true;
      if (state.phase === 'countdown') {
        penaltyNotified = false;watching=false;spectatingId=null;
        overlay.hidden = false;
        $('overlayIcon').textContent = '⚡';
        $('overlayTitle').textContent = String(state.countdown || 'JÁ!');
        $('overlayText').textContent = 'Prepare seus dedos!';
        $('roundStatus').textContent = 'PREPARANDO ARENA';
      } else if (state.phase === 'playing') {
        overlay.hidden = false;
        if(me&&!me.alive){
          showDeathMessage(me);
          overlay.hidden=watching;
        }else overlay.hidden=true;
        $('roundStatus').textContent=watching?`TELANDO: ${observed?.name||'Jogador'}`:'PARTIDA EM ANDAMENTO';
      } else if (state.phase === 'finished') {
        overlay.hidden = false;
        const winner = state.players.find(p => p.id === state.winnerId);
        if (me&&!me.alive) showDeathMessage(me);
        else {
          $('overlayIcon').textContent = winner ? '🏆' : '💥';
          $('overlayTitle').textContent = winner?.id === meId ? 'VOCÊ VENCEU!' : (winner ? `${winner.name} VENCEU!` : 'EMPATE!');
          $('overlayText').textContent = isHost ? 'Pronto para mais uma? Reúna sua turma para a revanche.' : 'Aguarde o anfitrião começar a revanche.';
        }
        repeat.hidden = !isHost;
        $('roundStatus').textContent = 'FIM DA PARTIDA';
      }
    }
    if (lastPhase !== state.phase) {
      if (lastPhase === 'countdown' && state.phase === 'playing') syncDirection();
      if (soundOn && state.phase === 'playing') beep(520, .12, 'triangle');
      if (soundOn && state.phase === 'finished') fanfare(state.winnerId === meId);
      lastPhase = state.phase;
    }
    if (soundOn && state.phase === 'playing') {
      const kick=state.effects?.filter(e=>e.kind==='kick').at(-1);
      if(kick&&kick.startedAt>lastKickTime){beep(160,.08,'square');lastKickTime=kick.startedAt;}
      if (state.flames.length && !flameSoundActive) beep(90, .28, 'sawtooth');
      flameSoundActive = state.flames.length > 0;
      if (state.bombs.length>lastBombCount) beep(220,.06,'square');
      lastBombCount=state.bombs.length;
    }
  }
  function showDeathMessage(me) {
    $('overlayIcon').textContent = '🍻';
    $('overlayTitle').textContent = 'VISH, SE FODEU!';
    const place=me?.place?` Você ficou em ${me.place}º lugar.`:'';
    const winner=state.phase==='finished'?state.players.find(p=>p.id===state.winnerId):null;
    $('overlayText').textContent=`VAI TER QUE BEBER! 😂${place}${winner?` ${winner.name} venceu.`:''}`;
    if (!penaltyNotified) {
      penaltyNotified = true;heldKeys.clear();resetJoystick();lastDirection='0,0';
      if (soundOn) beep(165, .35, 'sawtooth');
      if (navigator.vibrate) navigator.vibrate([100, 60, 100]);
    }
  }
  // Enter the one shared room on the same gesture that unlocks audio/fullscreen.
  $('createBtn').addEventListener('click', () => {requestImmersive();enterAsSelected();});
  function watchNext(){
    if(!state||state.phase!=='playing'||state.players.find(p=>p.id===meId)?.alive)return;
    const alive=state.players.filter(p=>p.alive&&p.id!==meId);
    if(!alive.length)return;
    const index=alive.findIndex(p=>p.id===spectatingId);
    spectatingId=alive[watching?(index+1)%alive.length:Math.max(0,index)].id;
    watching=true;camera=null;
    heldKeys.clear();touchDirection=null;lastDirection='0,0';
    updateUi();
  }
  $('watchBtn').addEventListener('click',watchNext);
  $('spectateBtn').addEventListener('click',watchNext);
  $('mapSelect').addEventListener('change',()=>safeSend({type:'map',mapId:$('mapSelect').value}));
  $('startBtn').addEventListener('click', () => {
    requestImmersive();
    safeSend({ type: 'start' });
  });
  $('playAgainBtn').addEventListener('click', () => {
    requestImmersive();
    safeSend({ type: 'start' });
  });
  $('fullscreenBtn').addEventListener('click', requestImmersive);
  $('rotateFullscreenBtn').addEventListener('click', requestImmersive);
  $('leaveBtn').addEventListener('click', () => leave());
  $('exitGameBtn').addEventListener('click', () => leave());
  $('shareBtn').addEventListener('click', async () => {
    const link = `${location.origin}/`;
    try {
      await navigator.clipboard.writeText(link);
      toast('Link copiado! Envie para seus amigos.');
    } catch {
      toast(`Abra o jogo neste endereço: ${location.origin}`);
    }
  });

  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (matchMedia('(pointer: coarse)').matches && !installed) {
    $('installCard').hidden = false;
    $('installInstructions').textContent = /iPhone|iPad|iPod/i.test(navigator.userAgent)
      ? 'No Safari, toque em Compartilhar e depois em “Adicionar à Tela de Início”.'
      : 'Instale o Bomba Party na tela inicial para abrir sem a barra do navegador.';
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $('installCard').hidden = false;
    $('installBtn').hidden = false;
  });
  $('installBtn').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('installBtn').hidden = true;
  });
  window.addEventListener('appinstalled', () => { $('installCard').hidden = true; });
  window.addEventListener('resize', updateOrientationPrompt);
  window.addEventListener('orientationchange', updateOrientationPrompt);
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }

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
    else { stopMusic(); audioCtx?.suspend(); }
  });

  function fanfare(won) {
    (won ? [523,659,784,1047] : [392,349,294,196]).forEach((f,i) => setTimeout(() => { if(soundOn) beep(f,.23,'square'); },i*180));
  }
  function unlockAudio() {
    if (!soundOn || document.hidden) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state !== 'running') audioCtx.resume().catch(()=>{});
    } catch { /* The next user gesture can retry audio. */ }
  }
  document.addEventListener('pointerdown', unlockAudio, {capture:true,passive:true});
  document.addEventListener('keydown', unlockAudio, {capture:true});
  function stopMusic() {
    for(const voice of musicVoices) { try { voice.stop(); } catch {} }
    musicVoices.clear();nextMusicTime=0;musicStep=0;
  }
  function musicTone(note,start,duration,volume,type='triangle') {
    const voice=audioCtx.createOscillator(),gain=audioCtx.createGain();
    voice.type=type;voice.frequency.value=440*2**((note-69)/12);
    gain.gain.setValueAtTime(0,start);
    gain.gain.linearRampToValueAtTime(volume,start+.008);
    gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
    voice.connect(gain).connect(audioCtx.destination);
    musicVoices.add(voice);
    voice.onended=()=>{musicVoices.delete(voice);voice.disconnect();gain.disconnect();};
    voice.start(start);voice.stop(start+duration+.01);
  }
  // Original four-bar arcade tune. Schedule ahead on the audio clock for steady rhythm.
  setInterval(() => {
    if (!soundOn || document.hidden || audioCtx?.state !== 'running' || state?.phase !== 'playing') {
      if(nextMusicTime) stopMusic();
      return;
    }
    if(!nextMusicTime || nextMusicTime<audioCtx.currentTime-.2) nextMusicTime=audioCtx.currentTime+.035;
    const melody=[76,79,81,79,76,74,72,74,76,0,79,76,74,72,74,79,
      76,81,84,81,79,76,74,76,81,0,79,76,74,76,79,81,
      77,81,84,81,79,77,76,74,77,0,81,77,76,74,72,74,
      79,83,86,83,81,79,77,74,79,0,77,74,72,74,76,79];
    while(nextMusicTime<audioCtx.currentTime+.12) {
      const step=musicStep%64,root=[48,45,41,43][Math.floor(step/16)];
      if(melody[step]) musicTone(melody[step],nextMusicTime,.14,.025,'square');
      if(step%4===0) musicTone(root+(step%8===4?7:0),nextMusicTime,.23,.065);
      if(step%16===0) for(const interval of (step===16?[12,15,19]:[12,16,19])) musicTone(root+interval,nextMusicTime,.65,.012);
      if(step%4===0) musicTone(step%8===4?45:33,nextMusicTime,.055,.055,'triangle');
      nextMusicTime+=60/132/4;musicStep++;
    }
  },25);
  function flushInputs() {
    if(!prediction||socket?.readyState!==WebSocket.OPEN||!isPlaying()) return;
    while(prediction.outbound.length) {
      const steps=prediction.outbound.splice(0,8);
      socket.send(JSON.stringify({type:'input',steps}));
    }
  }
  function sendBomb() {flushInputs();safeSend({type:'bomb'});}
  setInterval(flushInputs,33);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { stopMusic(); heldKeys.clear(); resetJoystick(); lastDirection = '0,0'; flushInputs(); audioCtx?.suspend(); }
    else if (soundOn) audioCtx?.resume();
  });
  const keyToDirection = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0]
  };
  function isPlaying() { return state && state.phase === 'playing' && currentCode && state.players.some(p=>p.id===meId&&p.alive); }
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
    flushInputs();
  }
  document.addEventListener('keydown', event => {
    if (/input|textarea/i.test(event.target.tagName)) return;
    if (keyToDirection[event.code]) {
      event.preventDefault();
      heldKeys.add(event.code);
      syncDirection();
    } else if (event.code === 'Space' && isPlaying()) {
      event.preventDefault();
      if (!event.repeat) sendBomb();
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
    resetJoystick();
    syncDirection();
  });
  const joystickController=BombaJoystick.create($('joystick'),$('joystickKnob'),direction=>{
    touchDirection=direction[0]||direction[1]?direction:null;
    syncDirection();
  },{enabled:()=>!!currentCode&&['countdown','playing'].includes(state?.phase)&&state.players.some(p=>p.id===meId&&p.alive)});
  function resetJoystick(){joystickController.reset();touchDirection=null;}
  $('touchBomb').addEventListener('pointerdown', event => {
    event.preventDefault();
    if (isPlaying()) {
      if (soundOn) beep(240,.06,'square');
      sendBomb();
      if (navigator.vibrate) navigator.vibrate(20);
    }
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
    rectangle(x, y, SIZE, SIZE, arenaPalette.floor[(ix+iy)&1]);
    rectangle(x + 4, y + 4, SIZE - 8, 1, '#ffffff08');
    if ((ix * 11 + iy * 13) % 9 === 0) {
      circle(x + 12, y + 35, 2, '#5f4e80');
      circle(x + 37, y + 15, 1.5, '#5f4e80');
    }
  }
  function drawWall(x, y, time) {
    rectangle(x, y, SIZE, SIZE, '#1a1730');
    roundRect(x + 2, y + 2, SIZE - 4, SIZE - 5, 6, '#61518c');
    roundRect(x + 4, y + 4, SIZE - 8, SIZE - 10, 5, arenaPalette.wall);
    rectangle(x + 7, y + 7, SIZE - 14, 3, arenaPalette.light);
    rectangle(x + 7, y + SIZE - 11, SIZE - 14, 3, arenaPalette.dark);
    rectangle(x + 23, y + 14, 2, 17, '#382f5a');
    const shine=((time/30+x+y)%300)/300;
    if(shine<.12) rectangle(x+7+shine*220,y+7,6,2,'#c5b0e5');
  }
  function drawCrate(x, y, time) {
    roundRect(x + 3, y + 4, 42, 40, 5, '#a85b69');
    roundRect(x + 5, y + 5, 38, 34, 4, arenaPalette.crate);
    rectangle(x + 11, y + 7, 26, 29, arenaPalette.trim);
    rectangle(x + 21, y + 7, 5, 29, '#e19a83');
    ctx.strokeStyle = '#e5ac8b';
    ctx.lineWidth = 4;
    ctx.beginPath();ctx.moveTo(x + 13, y + 11);ctx.lineTo(x + 35, y + 33);ctx.moveTo(x + 35, y + 11);ctx.lineTo(x + 13, y + 33);ctx.stroke();
    rectangle(x + 8, y + 8, 5, 5, '#f9d69d');
    rectangle(x + 35, y + 8, 5, 5, '#f9d69d');
    if(Math.sin(time/700+x+y)>.92) rectangle(x+8,y+8,5,2,'#fff1c1');
  }
  function drawPlayer(p, time, worldTime) {
    const position = p.id===meId && localPlayer && state.phase==='playing'
      ? localPlayer : BombaNetcode.remotePosition(snapshotHistory,p.id,performance.now()-80) || p;
    const previous=displayPositions.get(p.id);
    const point=BombaNetcode.displayPoint(previous,position,frameDt,p.speed);
    displayPositions.set(p.id,point);
    const x=point.x*SIZE+24, y=point.y*SIZE+21;
    point.pose = BombaAnimation.advance(point.pose, {x:point.x,y:point.y,facing:position.facing || p.facing}, frameDt);
    if (!p.alive) return;
    const skinIndex = getSkinIndex(p);
    ctx.save();
    if((p.invulnerableUntil||0)>worldTime)ctx.globalAlpha=.55+.35*Math.sin(worldTime/65);
    if((p.slowedUntil||0)>worldTime){ctx.strokeStyle='#c58aff';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y+20,19,6,0,0,Math.PI*2);ctx.stroke();}
    if(p.shield){ctx.strokeStyle='#9cddff';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y+3,23,23,0,0,Math.PI*2);ctx.stroke();}
    ctx.fillStyle = '#09071688';ctx.beginPath();ctx.ellipse(x,y+22,14,5,0,0,Math.PI*2);ctx.fill();
    if (!BombaAnimation.drawAtlas(ctx,walkAtlases[skinIndex],skinIndex,point.pose,x,y)) {
      // Keep the existing personal image visible while the atlas loads or if it fails.
      const sprite=sprites[skinIndex];
      if(sprite?.complete && sprite.naturalWidth) {
        if(skinIndex===3) BombaAnimation.drawAtlas(ctx,sprite,skinIndex,point.pose,x,y);
        else ctx.drawImage(sprite,x-22,y-18,44,44);
      }
      else { ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(x,y,14,0,Math.PI*2);ctx.fill(); }
    }
    ctx.restore();
    if(p.id===meId) {
      ctx.strokeStyle='#fff4aa';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(x,y+23,17,7,0,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle='#fff1a6';ctx.textAlign='center';ctx.font='900 11px sans-serif';ctx.fillText('VOCÊ',x,y-24);
    }
  }
  function drawMapHud(view,me,worldTime){
    const key=state.mapId+state.board.map(row=>row.join('')).join('');
    if(key!==minimapKey){
      minimapKey=key;minimap.width=state.width*4;minimap.height=state.height*4;
      const mapCtx=minimap.getContext('2d');
      for(let y=0;y<state.height;y++)for(let x=0;x<state.width;x++){
        mapCtx.fillStyle=state.board[y][x]===1?arenaPalette.light:state.board[y][x]===2?arenaPalette.crate:arenaPalette.floor[0];mapCtx.fillRect(x*4,y*4,4,4);
      }
    }
    const x=canvas.width-minimap.width-12;
    const local=displayPositions.get(me?.id)||me;
    const y=local&&local.y*SIZE+24-view.y>canvas.height/2?(watching?64:10):canvas.height-minimap.height-28;
    roundRect(x-5,y-5,minimap.width+10,minimap.height+26,5,'#090719d9');
    ctx.drawImage(minimap,x,y);
    ctx.strokeStyle='#ffffffa0';ctx.lineWidth=1;ctx.strokeRect(x+view.x/SIZE*4,y+view.y/SIZE*4,canvas.width/SIZE*4,canvas.height/SIZE*4);
    for(const p of state.players)if(p.alive)circle(x+(p.x+.5)*4,y+(p.y+.5)*4,p.id===me?.id?2.7:2,p.id===me?.id?'#fff':p.color);
    for(const tile of state.collapse?.falling||[])rectangle(x+tile.x*4,y+tile.y*4,4,4,'#ff9463');
    ctx.textAlign='left';ctx.textBaseline='middle';ctx.font='bold 10px system-ui';ctx.fillStyle='#eaddff';ctx.fillText(state.mapName||'Arena',x+2,y+minimap.height+10);
    if(me){
      const powers=[`🔥 ${me.range}`,`💣 ${me.bombs}`,`⚡ ${Math.round(170/me.speed*100)}%`];
      if(me.kick)powers.push('🥊 Chute');if(me.slowedUntil>worldTime)powers.push(`💀 ${Math.ceil((me.slowedUntil-worldTime)/1000)}s`);
      if(me.shield)powers.push('🛡 Escudo');if(me.bombPass)powers.push('👻 Passa-bomba');if(me.piercing)powers.push('◆ Perfurante');
      roundRect(8,canvas.height-34,Math.min(x-18,450),26,6,'#100c25d9');ctx.fillStyle='#fff0b1';ctx.font='bold 12px system-ui';ctx.fillText(powers.join('  '),16,canvas.height-20);
    }
  }
  function drawCollapseTimer(worldTime){
    const collapse=state.collapse;if(!collapse)return;
    const seconds=Math.ceil(Math.max(0,collapse.startsAt-worldTime)/1000);
    const label=seconds?`ARENA FECHA EM ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'CUIDADO! ARENA FECHANDO';
    const timer=$('collapseTimer');timer.textContent=label;timer.classList.toggle('urgent',seconds<=10);
    ctx.save();ctx.font='bold 13px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    const width=ctx.measureText(label).width+28;
    roundRect((canvas.width-width)/2,54,width,30,8,seconds<=10?'#6c2533eb':'#130e2dec');
    ctx.fillStyle=seconds<=10?'#ffe39a':'#e9deff';ctx.fillText(label,canvas.width/2,69);ctx.restore();
  }
  function drawEmpty() {
    ctx.fillStyle = '#1a1430';ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#544177';ctx.textAlign = 'center';ctx.font = '900 27px system-ui';
    ctx.fillText('AGUARDANDO A ARENA...', canvas.width / 2, canvas.height / 2);
  }
  function draw(time) {
    requestAnimationFrame(draw);
    frameDt = Math.min(.05, (time - (lastFrame || time)) / 1000);
    lastFrame = time;
    if (localPlayer && isPlaying() && state.players.find(p=>p.id===meId)?.alive) {
      const [x,y] = lastDirection.split(',').map(Number);
      inputAccumulator+=frameDt;
      while(inputAccumulator>=BombaNetcode.STEP) {
        BombaNetcode.advance(prediction,{x,y});inputAccumulator-=BombaNetcode.STEP;
      }
      localPlayer=prediction.player;
    }
    for(const entry of itemLegend)if(entry.canvas.offsetParent){entry.ctx.clearRect(0,0,80,80);entry.ctx.save();entry.ctx.translate(40,40);BombaItems.drawSkin(entry.ctx,entry.skin,time,74);entry.ctx.restore();}
    if (!state?.board || $('gamePanel').hidden) return;
    const worldTime=(state.serverTime||Date.now())+(performance.now()-stateReceivedAt);
    arenaPalette=BombaMaps.DEFS[state.mapId]||BombaMaps.DEFS.classic;
    const me=state.players.find(p=>p.id===meId);
    const target=state.players.find(p=>p.id===spectatingId&&p.alive)||state.players.find(p=>p.alive);
    const focus=me?.alive?(displayPositions.get(meId)||localPlayer||me):(target&&(displayPositions.get(target.id)||target))||me;
    if(focus)camera=BombaCamera.follow(camera,{x:focus.x*SIZE+24,y:focus.y*SIZE+24},{width:canvas.width,height:canvas.height},{width:state.width*SIZE,height:state.height*SIZE},frameDt);
    const view=camera||{x:0,y:0};
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.save();ctx.translate(-view.x,-view.y);
    const firstX=Math.max(0,Math.floor(view.x/SIZE)),firstY=Math.max(0,Math.floor(view.y/SIZE));
    const lastX=Math.min(state.width,Math.ceil((view.x+canvas.width)/SIZE));
    const lastY=Math.min(state.height,Math.ceil((view.y+canvas.height)/SIZE));
    for(let y=firstY;y<lastY;y++)for(let x=firstX;x<lastX;x++){
      const px=x*SIZE,py=y*SIZE;
      drawFloor(px,py,x,y);
      if(state.board[y][x]===1)drawWall(px,py,worldTime);
      else if(state.board[y][x]===2)drawCrate(px,py,worldTime);
    }
    for(const p of state.powerups||[])BombaItems.draw(ctx,p,worldTime);
    for(const b of state.bombs||[])BombaEffects.bomb(ctx,b,worldTime);
    const flameTiles=new Set((state.flames||[]).filter(f=>f.expiresAt>worldTime).map(f=>`${f.x},${f.y}`));
    for(const f of state.flames||[])BombaEffects.flame(ctx,f,worldTime,flameTiles);
    for(const effect of state.effects||[])BombaEffects.debris(ctx,effect,worldTime);
    for(const p of [...(state.players||[])].sort((a,b)=>a.y-b.y||a.slot-b.slot))drawPlayer(p,time,worldTime);
    for(const tile of state.collapse?.falling||[])BombaEffects.fallingWall(ctx,tile,worldTime,arenaPalette);
    ctx.restore();
    drawMapHud(view,watching?target||me:me,worldTime);
    drawCollapseTimer(worldTime);

  }

  $('soundLabel').textContent = soundOn ? 'LIGADO' : 'SOM';
  renderEntryCharacters();
  show('homePanel');
  drawEmpty();
  connect();
  requestAnimationFrame(draw);
})();
