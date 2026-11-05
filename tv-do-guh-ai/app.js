'use strict';
const api='https://tv-do-guh-bridge.onrender.com';
const statusView=document.getElementById('status');
let token=null,online=false,pending=new Set(),checking=false;
const shotIds=new Set(),diagnosticIds=new Set();let shotTimer,diagnosticTimer,currentDiagnostic=null;
const supportResults=new Map();let supportTimer,previousSupportActive=false;
function clearSupport(){clearTimeout(supportTimer);previousSupportActive=false;document.getElementById("support-status").textContent="Assistência desconectada.";}
function logAction(text){const item=document.createElement('li');item.textContent=new Date().toLocaleTimeString()+' — '+text;const list=document.getElementById('actions');list.prepend(item);while(list.children.length>20)list.lastElementChild.remove();}
function clearDiagnostic(){clearTimeout(diagnosticTimer);currentDiagnostic=null;document.getElementById('diagnostic-apps').replaceChildren();document.getElementById('diagnostic-status').textContent='Nenhum relatório disponível. Gere um diagnóstico atual.';}
function bytes(n){return Number.isFinite(n)?(n/1073741824>=1?(n/1073741824).toFixed(2)+' GB':(n/1048576).toFixed(1)+' MB'):'não medido';}
async function showDiagnostic(id){const session=token;try{
 const d=await request('/diagnostic');if(token!==session)return;if(d.id!==id)throw Error('Relatório não corresponde à solicitação');clearDiagnostic();currentDiagnostic=d.report;const r=d.report;
 let note='Armazenamento livre: '+bytes(r.storageFree)+' de '+bytes(r.storageTotal)+'. RAM disponível: '+bytes(r.ramAvailable)+' de '+bytes(r.ramTotal)+'. Android '+r.android+'. ';
 if(r.storageTotal>0 && r.storageFree/r.storageTotal<0.1)note+='Pouco espaço livre: revise apps que não usa. ';
 if(r.lowMemory)note+='O Android sinalizou pouca RAM disponível. ';
 note+=r.usageAccess?'Tamanhos fornecidos pelo Android. Cache já está incluído em dados.':'Sem Acesso ao uso: tamanhos de apps e cache não foram medidos.';
 if(r.partial)note+=' Lista parcial ('+r.apps.length+' de '+r.visibleCount+' apps visíveis).';
 document.getElementById('diagnostic-status').textContent=note;
 const list=document.getElementById('diagnostic-apps');
 for(const app of [...r.apps].sort((a,b)=>(b.totalBytes??-1)-(a.totalBytes??-1))){
  const card=document.createElement('section'),title=document.createElement('h3'),detail=document.createElement('p');title.textContent=app.label;detail.textContent=app.package+' · '+(app.system?'Sistema':'Instalado')+' · Total: '+bytes(app.totalBytes)+' · Dados: '+bytes(app.dataBytes)+' · Cache (incluído nos dados): '+bytes(app.cacheBytes);card.append(title,detail);
  if(!app.self){const settings=document.createElement('button');settings.textContent='Abrir detalhes / limpar cache na TV';settings.dataset.cmd='APP_SETTINGS';settings.disabled=!online;settings.onclick=()=>send('APP_SETTINGS',{package:app.package});card.append(settings);
   if(!app.system){const remove=document.createElement('button');remove.textContent='Solicitar desinstalação';remove.dataset.cmd='REQUEST_UNINSTALL';remove.disabled=!online;remove.onclick=()=>{if(window.confirm('Solicitar desinstalação de '+app.label+'? Isso pode apagar dados, contas e downloads desse app. Confirme também na tela oficial da TV.'))send('REQUEST_UNINSTALL',{package:app.package,confirmed:true});};card.append(remove);}
  }list.append(card);
 }
 diagnosticTimer=setTimeout(clearDiagnostic,d.expiresIn*1000);
 }catch(e){document.getElementById('diagnostic-status').textContent=e.message;}}

function clearShot(){clearTimeout(shotTimer);document.getElementById("shot").removeAttribute("src");document.getElementById("shot").hidden=true;}
async function showShot(id){const requestedToken=token;try{const s=await request("/screenshot");if(token!==requestedToken)return;if(s.id!==id)throw Error("Captura não corresponde ao pedido");clearShot();const img=document.getElementById("shot");img.src=s.image;img.hidden=false;document.getElementById("shot-status").textContent="Captura recebida. Salve e envie neste chat se quiser minha análise.";shotTimer=setTimeout(clearShot,s.expiresIn*1000);}catch(e){document.getElementById("shot-status").textContent=e.message;}}
try{token=sessionStorage.getItem('tvtoken');}catch{}
function store(){try{if(token)sessionStorage.setItem('tvtoken',token);else sessionStorage.removeItem('tvtoken');}catch{}}
function message(text){statusView.textContent=text;}
function controls(){document.querySelectorAll('[data-cmd]').forEach(b=>b.disabled=!token||!online);}
async function request(path,body){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
 try{
  const headers={};if(body!==undefined)headers['Content-Type']='application/json';if(token)headers.Authorization='Bearer '+token;
  const r=await fetch(api+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal,cache:'no-store'});
  const data=await r.json();if(!r.ok){if(r.status===401){token=null;online=false;store();controls();clearShot();clearDiagnostic();clearSupport();}throw Error(data.error||'Erro HTTP '+r.status);}return data;
 }finally{clearTimeout(timer);}
}
async function check(){
 if(!token||checking)return;checking=true;
 try{const s=await request('/status');if(s.supportActive){document.getElementById('support-status').textContent='Assistência conectada por mais '+s.supportExpiresIn+' segundos. Você pode revogar a qualquer momento.';}else if(previousSupportActive){document.getElementById('support-status').textContent='Assistência encerrada ou expirada.';}previousSupportActive=!!s.supportActive;for(const [id,r] of Object.entries(s.results)){if(r.actor==='support'&&supportResults.get(id)!==r.state){supportResults.set(id,r.state);logAction('Assistência: '+r.command+' — '+(r.message||r.state));}}while(supportResults.size>100)supportResults.delete(supportResults.keys().next().value);online=s.online;controls();if(currentDiagnostic && !s.diagnosticAllowed)clearDiagnostic();
  if(!online)message('TV sem conexão. Verifique internet e Acessibilidade na TCL.');
  else if(!pending.size)message('TV conectada. Pronta para comandos.');
  for(const id of pending){const r=s.results[id];if(r&&r.state!=='queued'){pending.delete(id);logAction((r.state==='executed'?'Confirmado pelo Android: ':'Falhou: ')+(r.message||r.state));if(diagnosticIds.delete(id)){if(r.state==='executed')await showDiagnostic(id);else document.getElementById('diagnostic-status').textContent=r.message;}if(shotIds.delete(id)){if(r.state==='executed')await showShot(id);else document.getElementById('shot-status').textContent=r.message;}message(r.state==='executed'?(r.message||'TV confirmou: ação aceita pela API Android.'):'A TV não executou: '+r.message);}}
 }catch(e){online=false;controls();message('Conexão: '+e.message);}finally{checking=false;}
}
document.getElementById('pair').onclick=async()=>{
 const code=document.getElementById('code').value.trim();if(!/^\d{6}$/.test(code)){message('Digite os seis números exibidos na TV.');return;}
 const button=document.getElementById('pair');button.disabled=true;message('Conectando… O servidor pode levar alguns segundos para iniciar.');
 try{const r=await request('/pair',{code});token=r.token;store();pending.clear();await check();}catch(e){message('Não foi possível parear: '+e.message);}finally{button.disabled=false;}
};
document.getElementById('unpair').onclick=async()=>{if(!token)return;try{await request('/unpair',{});token=null;online=false;store();pending.clear();clearShot();clearDiagnostic();clearSupport();controls();message('Desconectado. Gere um novo código na TCL.');}catch(e){message(e.message);}};
async function send(command,details={}){if(!token||!online){message('Primeiro pareie e conecte a TV.');return;}try{const r=await request('/command',{...details,command});pending.add(r.id);logAction('Solicitado: '+command+(details.package?' ('+details.package+')':''));if(command==='DIAGNOSE'){diagnosticIds.add(r.id);clearDiagnostic();document.getElementById('diagnostic-status').textContent='Aguardando dados reais do Android…';}if(command==='SCREENSHOT'){shotIds.add(r.id);clearShot();document.getElementById('shot-status').textContent='Aguardando captura autorizada na TV…';}message('Comando na fila. Aguardando confirmação da TV…');}catch(e){message('Falha: '+e.message);}}
document.querySelectorAll('[data-cmd]').forEach(b=>b.onclick=()=>send(b.dataset.cmd));
function interpret(text){const s=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();const rules=[[/limp|pesad|lenta|lentidao|diagnost|analis|espaco/,'DIAGNOSE'],[/youtube/,'YOUTUBE'],[/netflix/,'NETFLIX'],[/aument|volume\s*\+/,'VOLUME_UP'],[/diminu|baixar volume|volume\s*-/,'VOLUME_DOWN'],[/silenci|mudo/,'MUTE'],[/paus|reproduz|play/,'PLAY_PAUSE'],[/inicio|home|tela inicial/,'HOME'],[/voltar|volte/,'BACK'],[/cima/,'UP'],[/baixo/,'DOWN'],[/esquerda/,'LEFT'],[/direita/,'RIGHT'],[/^(ok|confirmar|confirme)$/,'OK']];return (rules.find(([pattern])=>pattern.test(s))||[])[1];}
document.getElementById('send').onclick=()=>{const cmd=interpret(document.getElementById('voice').value);if(cmd)send(cmd);else message('Comando não reconhecido. Use um dos botões do controle.');};
document.getElementById('mic').onclick=()=>{
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){message('Use o microfone do teclado do iPhone no campo de texto.');return;}
 const r=new SR();r.lang='pt-BR';r.onresult=e=>{document.getElementById('voice').value=e.results[0][0].transcript;message('Texto reconhecido. Toque em Enviar para executar.');};r.onerror=()=>message('Não foi possível reconhecer a fala. Use o teclado.');try{r.start();}catch{message('Microfone indisponível. Use o teclado.');}
};
controls();check();setInterval(()=>{if(!document.hidden)check();},1800);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});

document.getElementById("clear-shot").onclick=async()=>{clearShot();try{if(token)await request("/screenshot",{});document.getElementById("shot-status").textContent="Captura apagada.";}catch(e){document.getElementById("shot-status").textContent=e.message;}};

document.getElementById('clear-diagnostic').onclick=async()=>{clearDiagnostic();try{if(token)await request('/diagnostic',{});}catch(e){message(e.message);}};
document.getElementById('copy-diagnostic').onclick=async()=>{if(!currentDiagnostic){message('Primeiro gere um diagnóstico da TV.');return;}const text='Diagnóstico TV DO GUH AI — '+new Date().toISOString()+'\n'+JSON.stringify(currentDiagnostic,null,2);try{await navigator.clipboard.writeText(text);message('Diagnóstico copiado. Cole aqui no chat para análise.');}catch{const field=document.createElement('textarea');field.value=text;field.setAttribute('aria-label','Relatório para copiar');document.getElementById('diagnostic-apps').prepend(field);field.focus();field.select();message('Selecione e copie o relatório para enviar no chat.');}};

document.getElementById('support-create').onclick=async()=>{if(!token){message('Primeiro pareie a TV.');return;}if(!window.confirm('Permitir controle temporário por cinco minutos a quem receber o código? Compartilhe somente nesta conversa. As capturas e o diagnóstico também precisam de autorização na TV.'))return;try{const r=await request('/support',{action:'create'});clearTimeout(supportTimer);document.getElementById('support-status').textContent='Código de assistência: '+r.code+' — envie neste chat. Válido por cinco minutos, uso único. O acesso após resgate dura cinco minutos.';supportTimer=setTimeout(()=>{if(!previousSupportActive)document.getElementById('support-status').textContent='Código expirado. Gere outro se precisar.';},r.expiresIn*1000);}catch(e){message(e.message);}};
document.getElementById('support-cancel').onclick=async()=>{try{await request('/support',{action:'cancel'});clearTimeout(supportTimer);document.getElementById('support-status').textContent='Assistência revogada. Códigos e acessos anteriores não funcionam mais.';}catch(e){message(e.message);}};
