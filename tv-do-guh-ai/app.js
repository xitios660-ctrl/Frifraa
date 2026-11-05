'use strict';
const api='https://tv-do-guh-bridge.onrender.com';
const statusView=document.getElementById('status');
let token=null,online=false,pending=new Set(),checking=false;
const shotIds=new Set();let shotTimer;
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
  const data=await r.json();if(!r.ok){if(r.status===401){token=null;online=false;store();controls();clearShot();}throw Error(data.error||'Erro HTTP '+r.status);}return data;
 }finally{clearTimeout(timer);}
}
async function check(){
 if(!token||checking)return;checking=true;
 try{const s=await request('/status');online=s.online;controls();
  if(!online)message('TV sem conexão. Verifique internet e Acessibilidade na TCL.');
  else if(!pending.size)message('TV conectada. Pronta para comandos.');
  for(const id of pending){const r=s.results[id];if(r&&r.state!=='queued'){pending.delete(id);if(shotIds.delete(id)){if(r.state==='executed')await showShot(id);else document.getElementById('shot-status').textContent=r.message;}message(r.state==='executed'?'TV confirmou: ação aceita pela API Android.':'A TV não executou: '+r.message);}}
 }catch(e){online=false;controls();message('Conexão: '+e.message);}finally{checking=false;}
}
document.getElementById('pair').onclick=async()=>{
 const code=document.getElementById('code').value.trim();if(!/^\d{6}$/.test(code)){message('Digite os seis números exibidos na TV.');return;}
 const button=document.getElementById('pair');button.disabled=true;message('Conectando… O servidor pode levar alguns segundos para iniciar.');
 try{const r=await request('/pair',{code});token=r.token;store();pending.clear();await check();}catch(e){message('Não foi possível parear: '+e.message);}finally{button.disabled=false;}
};
document.getElementById('unpair').onclick=async()=>{if(!token)return;try{await request('/unpair',{});token=null;online=false;store();pending.clear();clearShot();controls();message('Desconectado. Gere um novo código na TCL.');}catch(e){message(e.message);}};
async function send(command){if(!token||!online){message('Primeiro pareie e conecte a TV.');return;}try{const r=await request('/command',{command});pending.add(r.id);if(command==='SCREENSHOT'){shotIds.add(r.id);clearShot();document.getElementById('shot-status').textContent='Aguardando captura autorizada na TV…';}message('Comando na fila. Aguardando confirmação da TV…');}catch(e){message('Falha: '+e.message);}}
document.querySelectorAll('[data-cmd]').forEach(b=>b.onclick=()=>send(b.dataset.cmd));
function interpret(text){const s=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();const rules=[[/youtube/,'YOUTUBE'],[/netflix/,'NETFLIX'],[/aument|volume\s*\+/,'VOLUME_UP'],[/diminu|baixar volume|volume\s*-/,'VOLUME_DOWN'],[/silenci|mudo/,'MUTE'],[/paus|reproduz|play/,'PLAY_PAUSE'],[/inicio|home|tela inicial/,'HOME'],[/voltar|volte/,'BACK'],[/cima/,'UP'],[/baixo/,'DOWN'],[/esquerda/,'LEFT'],[/direita/,'RIGHT'],[/^(ok|confirmar|confirme)$/,'OK']];return (rules.find(([pattern])=>pattern.test(s))||[])[1];}
document.getElementById('send').onclick=()=>{const cmd=interpret(document.getElementById('voice').value);if(cmd)send(cmd);else message('Comando não reconhecido. Use um dos botões do controle.');};
document.getElementById('mic').onclick=()=>{
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){message('Use o microfone do teclado do iPhone no campo de texto.');return;}
 const r=new SR();r.lang='pt-BR';r.onresult=e=>{document.getElementById('voice').value=e.results[0][0].transcript;message('Texto reconhecido. Toque em Enviar para executar.');};r.onerror=()=>message('Não foi possível reconhecer a fala. Use o teclado.');try{r.start();}catch{message('Microfone indisponível. Use o teclado.');}
};
controls();check();setInterval(()=>{if(!document.hidden)check();},1800);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});

document.getElementById("clear-shot").onclick=async()=>{clearShot();try{if(token)await request("/screenshot",{});document.getElementById("shot-status").textContent="Captura apagada.";}catch(e){document.getElementById("shot-status").textContent=e.message;}};
