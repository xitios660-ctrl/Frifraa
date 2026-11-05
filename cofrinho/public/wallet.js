/* Shared game/cofrinho wallet. No player password or PIN is required. */
(()=>{
 'use strict';
 const NAMES={mary:'Mary',kaique:'Kaique',jheniffer:'Jheniffer',gustavo:'Gustavo'};
 const cofrinho=document.body.dataset.wallet==='cofrinho';
 let wallet=null,connection=null,busy=false,catalog=[],poll=null,revision=0;
 const requests=new Map();
 const button=document.createElement('button');button.type='button';button.className='wallet-open';button.textContent='🪙 Minha Carteira';
 (document.querySelector('.topbar-right')||document.querySelector('header')||document.body).append(button);
 if(!cofrinho&&!document.querySelector('#openCoinShop')){const lobby=document.querySelector('#startBtn')?.parentElement;if(lobby){const copy=button.cloneNode(true);copy.classList.add('wallet-lobby');copy.onclick=()=>open();lobby.append(copy);}}
 const dialog=document.createElement('dialog');dialog.id='walletDialog';dialog.className='wallet-dialog';
 dialog.innerHTML=`<div class="wallet-head"><div><small>BOMBA PARTY · CLUBE DOS QUATRO</small><h2>Minha Carteira <span>🪙</span></h2></div><button type="button" class="wallet-close" aria-label="Fechar carteira">✕</button></div>
 <p class="wallet-note">R$ 1 registrado = 1 moeda. Comprar poderes nunca retira dinheiro do cofrinho.</p>
 <p class="wallet-status" role="status" aria-live="polite"></p>
 <form class="wallet-login"><label>Seu personagem<select name="character" aria-label="Personagem da carteira"></select></label><button type="submit">Abrir carteira</button><p>Sem senha: escolha um personagem para consultar moedas e melhorias.</p></form>
 <section class="wallet-account" hidden><div class="wallet-person"><h3></h3><button type="button" class="wallet-logout">Trocar personagem</button></div><div class="wallet-balances"></div><p class="wallet-deficit" hidden></p><h3>Loja de melhorias</h3><p>Desbloqueie uma vez, use nas próximas partidas. Escolha o que equipar; um nível por tipo. Mudanças valem na próxima rodada.</p><div class="wallet-catalog"></div><h3>Histórico de compras</h3><ol class="wallet-history"></ol></section>`;
 document.body.append(dialog);
 for(const select of dialog.querySelectorAll('select'))for(const[id,name]of Object.entries(NAMES)){const option=document.createElement('option');option.value=id;option.textContent=name;select.append(option);}
 const $=selector=>dialog.querySelector(selector);
 const status=(text,error=false)=>{$('.wallet-status').textContent=text;$('.wallet-status').classList.toggle('wallet-error',error);};
 const fmt=n=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:0}).format(n);
 async function api(path,body,headers={}){
  const response=await fetch(path,{cache:'no-store',credentials:'same-origin',headers:{'content-type':'application/json',...headers},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Não foi possível completar a operação.'),{status:response.status});return data;
 }
 async function link(){if(!cofrinho&&connection&&wallet)await api('/api/wallet/link',connection);}
 function render(){
  $('.wallet-login').hidden=!!wallet;$('.wallet-account').hidden=!wallet;
  button.textContent=wallet?`🪙 ${fmt(wallet.available)} · ${NAMES[wallet.character]}`:'🪙 Minha Carteira';
  const summary=document.querySelector('#coinWalletSummary');if(summary)summary.textContent=wallet?`🪙 ${NAMES[wallet.character]} · ${fmt(wallet.available)} moedas disponíveis`:'🪙 Escolha seu personagem para consultar moedas';
  if(!wallet)return;
  $('.wallet-person h3').textContent=`${NAMES[wallet.character]} · Carteira pessoal`;
  const balances=$('.wallet-balances');balances.replaceChildren();
  for(const[label,value]of [['Registrado no cofrinho',`R$ ${fmt(wallet.realTotal)}`],['Moedas conquistadas',fmt(wallet.earned)],['Moedas gastas',fmt(wallet.spent)],['Moedas disponíveis',fmt(wallet.available)]]){const box=document.createElement('div'),title=document.createElement('span'),amount=document.createElement('strong');title.textContent=label;amount.textContent=value;box.append(title,amount);balances.append(box);}
  $('.wallet-deficit').hidden=!wallet.deficit;$('.wallet-deficit').textContent=`Depósitos desmarcados: faltam ${fmt(wallet.deficit)} moedas para cobrir compras anteriores. Seu histórico e melhorias foram preservados. O saldo para novas compras é zero.`;
  const grid=$('.wallet-catalog');grid.replaceChildren();
  for(const item of wallet.catalog||catalog){
   const card=document.createElement('article');card.className='wallet-item';card.dataset.itemId=item.id;
   const art=document.createElement('canvas');art.width=art.height=88;art.dataset.skin=item.skin;art.setAttribute('aria-hidden','true');
   const title=document.createElement('h4');title.textContent=item.name;const benefit=document.createElement('p');benefit.textContent=item.benefit;
   const price=document.createElement('strong');price.textContent=`🪙 ${item.price}`;
   const action=document.createElement('button');action.type='button';const owned=wallet.owned.includes(item.id),equipped=wallet.equipped.includes(item.id);
   action.textContent=owned?(equipped?'✓ Equipada · retirar':'Equipar'):'Desbloquear';action.disabled=busy||(!owned&&wallet.available<item.price);action.dataset.action=owned?'equip':'purchase';action.setAttribute('aria-label',`${action.textContent}: ${item.name}`);if(owned)action.setAttribute('aria-pressed',String(equipped));
   action.addEventListener('click',()=>mutate(async()=>{
    if(owned){const sameGroup=new Set(wallet.catalog.filter(entry=>entry.group===item.group).map(entry=>entry.id));const equippedItems=wallet.equipped.filter(id=>!sameGroup.has(id));if(!equipped)equippedItems.push(item.id);wallet=await api('/api/wallet/equip',{equipped:equippedItems});status('Equipamento salvo. Será aplicado na próxima partida.');}
    else{if(!requests.has(item.id))requests.set(item.id,crypto.randomUUID());wallet=await api('/api/wallet/purchase',{itemId:item.id,requestId:requests.get(item.id)});status('🪙 Melhoria desbloqueada! Toque em Equipar para usá-la.');}
    await link();
   }));card.append(art,title,benefit,price,action);grid.append(card);
  }
  const history=$('.wallet-history');history.replaceChildren();
  for(const purchase of wallet.history.slice().reverse()){const row=document.createElement('li');row.textContent=`${wallet.catalog.find(item=>item.id===purchase.itemId)?.name||purchase.label||purchase.itemId} · ${purchase.price} moedas · ${new Date(purchase.at).toLocaleString('pt-BR')}`;history.append(row);}
  if(!wallet.history.length){const row=document.createElement('li');row.textContent='Nenhuma compra ainda. Todos podem jogar e coletar poderes gratuitamente.';history.append(row);}
 }
 async function mutate(fn){if(busy)return;busy=true;revision++;render();try{await fn();window.dispatchEvent(new Event('bomba-wallet-changed'));}catch(error){status(error.message,true);}finally{busy=false;render();}}
 async function refresh(quiet=false){if(busy)return;const current=revision;try{const fresh=await api('/api/wallet');if(busy||current!==revision)return;wallet=fresh;await link();if(busy||current!==revision)return;render();if(!quiet)status('Carteira sincronizada. Suas compras ficam salvas online.');}catch(error){if(busy||current!==revision)return;if(error.status===401){wallet=null;render();if(!quiet)status('Escolha seu personagem para abrir a carteira.');}else if(!quiet)status(error.message,true);}}
 async function selectCharacter(character){if(!NAMES[character])throw new Error('Personagem inválido.');await api('/api/wallet/login',{character});wallet=await api('/api/wallet');await link();render();}
 async function open(character){if(!character&&!cofrinho)character=Object.keys(NAMES)[Number(localStorage.getItem('arena-skin')||0)];if(NAMES[character])$('.wallet-login select').value=character;if(!dialog.open)dialog.showModal();if(NAMES[character]&&wallet?.character!==character)await mutate(async()=>{await selectCharacter(character);status('Carteira aberta sem senha.');});else await refresh();}
 for(const id of ['openCoinShop','openCoinShopFinished'])document.getElementById(id)?.addEventListener('click',()=>open());
 button.onclick=()=>open();$('.wallet-close').onclick=()=>dialog.close();
 $('.wallet-login').onsubmit=event=>{event.preventDefault();const character=event.currentTarget.elements.character.value;mutate(async()=>{await selectCharacter(character);status('Carteira aberta sem senha.');});};
 $('.wallet-logout').onclick=()=>mutate(async()=>{await api('/api/wallet/logout',{});wallet=null;status('Escolha outro personagem.');});
 window.addEventListener('bomba-wallet-connection',event=>{connection=event.detail;refresh(true);});
 window.addEventListener('bomba-round',event=>{if(['countdown','playing'].includes(event.detail.phase)&&dialog.open)dialog.close();});
 window.addEventListener('focus',()=>refresh(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
 poll=setInterval(()=>{if(!document.hidden)refresh(true);},15000);
 function animate(time){if(dialog.open&&!document.hidden)for(const canvas of dialog.querySelectorAll('.wallet-item canvas')){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,88,88);ctx.save();ctx.translate(44,44);if(!window.BombaItems?.drawSkin(ctx,canvas.dataset.skin,time,72)){ctx.font='46px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('🪙',0,0);}ctx.restore();}requestAnimationFrame(animate);}
 requestAnimationFrame(animate);window.BombaWallet={open,get identity(){return wallet?.character||null;},refresh:()=>refresh(true)};
 if(cofrinho)refresh(true);
})();
