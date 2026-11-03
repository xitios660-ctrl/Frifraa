'use strict';
const $=id=>document.getElementById(id);
const NAMES=['Mary','Kaique','Jheniffer','Gustavo'];
const COLORS=['#f59ec7','#91c4f4','#c6a2fd','#f9cb8b'];
const AVATARS={
 Mary:'https://raw.githubusercontent.com/xitios660-ctrl/Frifraa/cofrinho/cofrinho/public/mary.webp',
 Kaique:'https://raw.githubusercontent.com/xitios660-ctrl/Frifraa/cofrinho/cofrinho/public/kaique.webp',
 Jheniffer:'https://raw.githubusercontent.com/xitios660-ctrl/Frifraa/cofrinho/cofrinho/public/jheniffer.webp',
 Gustavo:'https://raw.githubusercontent.com/xitios660-ctrl/Frifraa/cofrinho/cofrinho/public/gustavo.webp'
};
const EMOJI={start:'💵',chance:'✨',tax:'🧾',jail:'🚔',free:'🌿',gotojail:'⛓️',station:'🚊',property:'🏠'};
const FACE=['','⚀','⚁','⚂','⚃','⚄','⚅'];
const GRID=Array.from({length:24},(_,i)=>{
 if(i<=6)return [6,6-i];
 if(i<=12)return [12-i,0];
 if(i<=18)return [0,i-12];
 return [i-18,6];
});
let ws=null,room=null,me=null,token=null,selected=null,focusedTile=null;
let pendingSend=null,retry=0,ping=null,toastTimer=null;
let firstState=true;
const number=v=>Math.round(Number(v)||0).toLocaleString('pt-BR');
const cash=v=>'R$ '+number(v);
const safeText=s=>String(s??'');
const joinLink=c=>location.origin+'/?room='+encodeURIComponent(c);
const storageKey=c=>'bancodaturma3d:'+c;
function notify(msg,timeout=3700){
 $('toast').textContent=msg;$('toast').classList.add('show');
 clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),timeout);
}
const profile=n=>AVATARS[n]||'';
function characters(){
 const el=$('characters');el.replaceChildren();
 for(const name of NAMES){
  const b=document.createElement('button');b.type='button';b.className='character';b.dataset.name=name;
  const img=document.createElement('img');img.src=profile(name);img.alt='Personagem '+name;img.loading='lazy';
  const label=document.createElement('span');label.textContent=name;
  b.append(img,label);
  b.addEventListener('click',()=>{
   selected=name;
   for(const c of el.querySelectorAll('.character'))c.classList.toggle('selected',c.dataset.name===selected);
   refreshButtons();
  });
  el.append(b);
 }
}
function refreshButtons(){
 $('create').disabled=!selected||!ws||ws.readyState!==1;
 $('join').disabled=!selected||$('room-input').value.trim().length!==6||!ws||ws.readyState!==1;
}
function send(msg){
 if(!ws||ws.readyState!==1){notify('Sem conexão com o servidor. Reconectando…');return false}
 ws.send(JSON.stringify(msg));return true;
}
function create(){
 if(!selected)return;
 pendingSend={type:'create',name:selected};send(pendingSend);
}
function join(){
 if(!selected)return;
 const c=$('room-input').value.trim().toUpperCase();
 if(c.length!==6)return notify('Digite o código de 6 caracteres.');
 pendingSend={type:'join',room:c,name:selected};send(pendingSend);
}
function resumeFromLocal(){
 const params=new URLSearchParams(location.search);
 const code=params.get('room')?.trim().toUpperCase();
 if(code){$('room-input').value=code;refreshButtons()}
 const known=code&&JSON.parse(localStorage.getItem(storageKey(code))||'null');
 if(known?.token && known?.room)return {type:'resume',room:known.room,token:known.token};
 return null;
}
function autoResume(){
 if(room && token)return send({type:'resume',room,token});
 const resume=resumeFromLocal();
 if(resume)return send(resume);
 return false;
}
function connect(){
 if(ws&&[WebSocket.OPEN,WebSocket.CONNECTING].includes(ws.readyState))return;
 const protocol=location.protocol==='https:'?'wss:':'ws:';
 ws=new WebSocket(protocol+'//'+location.host);
 $('connection').textContent='● Conectando…';$('connection').className='connection';
 ws.addEventListener('open',()=>{
  retry=0;$('connection').className='connection online';$('connection').textContent='● ONLINE';
  refreshButtons();
  if(!autoResume()&&pendingSend)send(pendingSend);
 });
 ws.addEventListener('close',()=>{
  $('connection').className='connection offline';$('connection').textContent='● RECONEXÃO';
  refreshButtons();
  if(retry<7 && room)notify('Conexão caiu. Tentando voltar à sala…');
  retry=Math.min(retry+1,8);setTimeout(connect,Math.min(15000,750*Math.pow(2,retry)));
 });
 ws.addEventListener('error',()=>{});
 ws.addEventListener('message',event=>{
  let data;try{data=JSON.parse(event.data)}catch{return}
  if(data.type==='error'){notify(data.message||'Erro inesperado.');return}
  if(data.type==='notice'){notify(data.message);return}
  if(data.type==='joined'){
   room=data.room;me=data.me;token=data.token;pendingSend=null;
   history.replaceState(null,'',joinLink(room));
   localStorage.setItem(storageKey(room),JSON.stringify({room,token,me}));
   $('welcome').classList.add('hidden');$('game').classList.remove('hidden');
   $('room-code').textContent=room;
   firstState=true;notify('Bem-vindo(a) à sala '+room+'! ✨');
  }
  if(data.type==='state'){room=data.state.code;me=data.me;render(data.state)}
 });
}
function el(tag,cls,txt){const node=document.createElement(tag);if(cls)node.className=cls;if(txt!==undefined)node.textContent=txt;return node}
function showState(state){
 $('welcome').classList.add('hidden');$('game').classList.remove('hidden');
 $('room-code').textContent=state.code;
 $('lobby-banner').classList.toggle('hidden',state.phase!=='lobby');
 $('start-game').disabled=state.players.length<2||state.hostId!==me;
 $('restart').classList.toggle('hidden',!(state.phase==='finished'&&state.hostId===me));
 const current=state.players[state.turn],mine=state.players.find(p=>p.id===me);
 $('turn-img').src=profile(current?.name);
 $('turn-name').textContent=state.phase==='finished'?(state.players.find(p=>p.id===state.winner)?.name||'Fim'):current?.name||'Aguardando…';
 $('turn-label').textContent=state.phase==='finished'?'🏆 PARTIDA ENCERRADA':state.phase==='lobby'?'⏳ SALA DE ESPERA':current?.id===me?'● SUA VEZ!':'● VEZ DO JOGADOR';
 $('turn-hint').textContent=state.phase==='finished'?'Confira o vencedor':state.phase==='lobby'?'Convide seus amigos':current?.id===me?'Faça sua jogada':'Acompanhe a partida';
 if(!focusedTile || !state.tiles[focusedTile])focusedTile=(state.pending?.tileId??current?.pos??0);
 const message=state.history.at(-1)?.text || 'Aguardando os participantes';
 $('board-caption').textContent=message.length>100?message.slice(0,98)+'…':message;
 drawBoard(state);
 drawPlayers(state);
 drawActions(state,current,mine);
 drawProperty(state,mine);
 drawHistory(state);
}
let previousRoll='';
function animateDice(dice){
 if(!dice)return;
 const key=room+':'+dice.join('-');
 if(previousRoll===key)return;
 previousRoll=key;
 for(const [idx,value] of dice.entries()){
  const d=$(idx===0?'die-a':'die-b');
  d.textContent=FACE[value]||'⚀';d.classList.remove('rolling');void d.offsetWidth;d.classList.add('rolling');
 }
}
function drawBoard(state){
 const board=$('board');
 for(const node of board.querySelectorAll('.tile'))node.remove();
 const players=state.players;
 for(const t of state.tiles){
  const [row,col]=GRID[t.id];
  const cell=el('button','tile'+(t.kind!=='property'&&t.kind!=='station'?' special':''),'');
  cell.type='button';cell.style.gridColumn=String(col+1);cell.style.gridRow=String(row+1);
  cell.style.setProperty('--tilecolor',t.color);
  cell.style.setProperty('--owner','#796889');
  cell.setAttribute('aria-label',t.name+(t.price?' '+cash(t.price):''));
  if(focusedTile===t.id)cell.classList.add('selected');
  const color=el('div','top-color');cell.append(color);
  const name=el('strong','',t.name);cell.append(name);
  if(t.kind==='property'||t.kind==='station')cell.append(el('small','',cash(t.price)));
  else cell.append(el('span','tile-symbol',EMOJI[t.kind]||'◆'));
  const owner=state.owned[t.id];
  if(owner){
   const oPlayer=players.find(p=>p.id===owner.player);
   cell.style.setProperty('--owner',COLORS[oPlayer?.color??0]);
   const strip=el('div','owner-line');cell.append(strip);
   if(owner.houses>0)cell.append(el('span','house-pips','▰'.repeat(owner.houses)));
   if(owner.mortgaged)cell.style.opacity='.48';
  }
  const inside=players.filter(p=>!p.bankrupt&&p.pos===t.id);
  if(inside.length){
   const pawnArea=el('div','pawns');
   inside.forEach(p=>{
    const pawn=el('div','pawn');pawn.style.setProperty('--pc',COLORS[p.color]);
    const img=el('img');img.src=profile(p.name);img.alt=p.name;
    pawn.title=p.name;pawn.append(img);pawnArea.append(pawn);
   });
   cell.append(pawnArea);
  }
  cell.addEventListener('click',()=>{focusedTile=t.id;drawProperty(state,players.find(p=>p.id===me));board.querySelectorAll('.tile').forEach(node=>node.classList.remove('selected'));cell.classList.add('selected')});
  board.append(cell);
 }
 animateDice(state.lastDice);
}
function drawPlayers(state){
 const panel=$('players');panel.replaceChildren();
 for(const p of state.players){
  const card=el('div','player-card');
  if(state.phase==='playing'&&state.players[state.turn]?.id===p.id)card.classList.add('active');
  if(p.id===me)card.classList.add('mine');
  if(p.bankrupt)card.classList.add('bankrupt');
  const img=el('img');img.src=profile(p.name);img.alt='';
  const text=el('div');text.style.minWidth='0';
  text.append(el('strong','',p.name),el('b','',cash(p.money)),el('small','',p.bankrupt?'FALIDO':(p.connected?'● Online':'◌ Offline')+' · 💎 '+cash(p.worth)));
  card.append(img,text);panel.append(card);
 }
 for(let i=state.players.length;i<4;i++)panel.append(el('div','player-card','✨ Vaga disponível'));
}
function control(label,action,cls='secondary',extra={}) {
 const button=el('button','btn '+cls,label);
 button.addEventListener('click',()=>{
  if(extra.confirm && !confirm(extra.confirm))return;
  send({type:'action',action,...extra});
 });
 return button;
}
function drawActions(s,current,mine){
 const target=$('action-buttons');target.replaceChildren();
 const myTurn=mine && s.phase==='playing'&&current?.id===me;
 const message=$('action-info');
 if(s.phase==='lobby'){
  message.textContent='Estamos esperando os jogadores. Compartilhe o link e prepare a diversão!';
  return;
 }
 if(s.phase==='finished'){
  const winner=s.players.find(p=>p.id===s.winner);
  message.textContent='🏆 '+(winner?.name||'A turma')+' venceu! Patrimônio final: '+cash(winner?.worth||0)+'.';
  return;
 }
 if(!myTurn){message.textContent='Acompanhe a rodada: '+current.name+' está jogando. Seu dinheiro e seus terrenos aparecem no painel acima.';return}
 if(s.stage==='roll'){
  message.textContent=mine.jail?'Você está na prisão e perderá uma rodada. Role para cumprir a penalidade.':'Sua vez! Clique para lançar os dados e avançar pelo tabuleiro.';
  target.append(control('🎲 LANÇAR DADOS','roll','primary'));return;
 }
 if(s.stage==='buy'){
  const tile=s.tiles[s.pending.tileId];
  message.textContent='🏡 Você caiu em '+tile.name+'. Preço: '+cash(tile.price)+'. Aluguel base: '+cash(tile.rent)+'. Comprar?';
  const yes=control('🏠 COMPRAR '+cash(tile.price),'buy','primary');yes.disabled=mine.money<tile.price;target.append(yes);
  target.append(control('PASSAR','pass','secondary'));return;
 }
 if(s.stage==='done'){
  message.textContent='Jogada concluída. Você pode melhorar seus terrenos ou passar a vez para a próxima pessoa.';
  target.append(control('↪ ENCERRAR TURNO','end','primary'));
  target.append(control('☠️ DESISTIR','surrender','secondary',{confirm:'Tem certeza que quer desistir da partida?'}));return;
 }
 message.textContent='Aguarde…';
}
function drawProperty(s,mine){
 const panel=$('property-panel');panel.replaceChildren();
 const t=s.tiles[focusedTile];
 if(!t){panel.append(el('p','muted','Selecione uma casa.'));return}
 const header=el('div','prop-title');
 const sw=el('span','prop-swatch');sw.style.background=t.color;
 header.append(sw,el('strong','',t.name));panel.append(header);
 const owner=s.owned[t.id],o=s.players.find(p=>p.id===owner?.player);
 const own=owner&&owner.player===me;
 const box=el('div','prop-stats');
 for(const [label,val] of [
  ['Tipo',({property:'Terreno',station:'Estação',tax:'Imposto',start:'Partida',jail:'Prisão',gotojail:'Vá para a prisão',chance:'Surpresa',free:'Praça livre'})[t.kind]],
  ['Preço',t.price?cash(t.price):'—'],
  ['Aluguel',owner?.mortgaged?'Hipotecado':t.rent?cash(Math.round(t.rent*Math.pow(2,owner?.houses||0))):'—'],
  ['Dono',o?.name||'Banco'],
  ...(t.upgrade?[['Construções',(owner?.houses||0)+' / 3'],['Próxima casa',cash(t.upgrade)]]:[])
 ]){
  const stat=el('div','prop-stat');stat.append(el('small','',label),el('b','',val||'—'));box.append(stat);
 }
 panel.append(box);
 if(own && s.phase==='playing' && s.players[s.turn]?.id===me){
  const actions=el('div','prop-actions');
  if(t.upgrade&&!owner.mortgaged){
   const upgrade=control('🔨 CONSTRUIR','upgrade','secondary',{tileId:t.id});
   upgrade.disabled=owner.houses>=3||mine.money<t.upgrade;
   actions.append(upgrade);
  }
  if(!owner.mortgaged){
   const mortgage=control('💰 HIPOTECAR','mortgage','secondary',{tileId:t.id});
   mortgage.disabled=!!owner.houses;actions.append(mortgage);
  }else{
   const redeeem=control('↻ QUITAR HIPOTECA','redeem','secondary',{tileId:t.id});
   redeeem.disabled=mine.money<Math.round(t.price*.60);actions.append(redeeem);
  }
  panel.append(actions);
 }else panel.append(el('div','muted',t.kind==='property'?'Compre e construa para aumentar o aluguel.':'Toque em outras casas para explorar o tabuleiro.'));
}
function drawHistory(s){
 const h=$('history');h.replaceChildren();
 for(const entry of [...s.history].reverse())h.append(el('div','event',entry.text));
}
function render(s){showState(s);if(firstState){firstState=false;setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),100)}}
function copyLink(){
 const url=joinLink(room);
 if(navigator.clipboard?.writeText)navigator.clipboard.writeText(url).then(()=>notify('Link copiado! Mande no grupo 📲')).catch(()=>window.prompt('Copie o link:',url));
 else window.prompt('Copie o link:',url);
}
function init(){
 characters();
 $('room-input').addEventListener('input',()=>{const input=$('room-input');input.value=input.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);refreshButtons()});
 $('create').addEventListener('click',create);
 $('join').addEventListener('click',join);
 $('copy-link').addEventListener('click',copyLink);
 $('start-game').addEventListener('click',()=>send({type:'start'}));
 $('restart').addEventListener('click',()=>send({type:'restart'}));
 $('rules').addEventListener('click',()=>$('rules-modal').classList.remove('hidden'));
 $('close-rules').addEventListener('click',()=>$('rules-modal').classList.add('hidden'));
 $('got-it').addEventListener('click',()=>$('rules-modal').classList.add('hidden'));
 $('rules-modal').addEventListener('click',e=>{if(e.target===$('rules-modal'))$('rules-modal').classList.add('hidden')});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')$('rules-modal').classList.add('hidden')});
 const qs=new URLSearchParams(location.search),c=qs.get('room');
 if(c){$('room-input').value=c.toUpperCase().slice(0,6)}
 connect();
}
document.addEventListener('DOMContentLoaded',init);
