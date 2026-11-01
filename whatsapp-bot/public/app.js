'use strict';
const $ = id => document.getElementById(id);
let authorized = false;
let busyQR = false;
let polling = false;
const phaseNames = { iniciando: 'Inicializando', conectando: 'Conectando', 'aguardando-qr': 'Aguardando QR', conectado: 'Conectado', reconectando: 'Reconectando', desvinculado: 'Desvinculado', erro: 'Erro' };
async function request(url, options={}) {
  const res = await fetch(url,{ credentials:'same-origin', cache:'no-store',...options, headers: options.body ? { 'Content-Type':'application/json' } : {} });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.error || 'Não foi possível completar a operação.');
  return data;
}
const body = data => JSON.stringify(data);
function note(id, text, type='') {
  const element=$(id);
  element.className='notice'+(type?' '+type:'');
  element.textContent=text;
}
function setAuth(loggedIn) {
  authorized=loggedIn;
  $('login').hidden=loggedIn;
  $('dashboard').hidden=!loggedIn;
  $('phase').textContent=loggedIn?'Verificando WhatsApp':'Painel protegido';
  if(loggedIn) refresh();
}
async function checkLogin() {
  try { const x=await request('/api/me');setAuth(!!x.loggedIn); }
  catch {setAuth(false);}
}
$('loginForm').addEventListener('submit', async e=>{
  e.preventDefault();
  const btn=e.target.querySelector('button');
  btn.disabled=true;
  try {
    await request('/api/login',{method:'POST',body:body({password:$('password').value})});
    $('password').value='';
    setAuth(true);
  } catch(error){note('loginStatus',error.message,'error');}
  finally{btn.disabled=false;}
});
$('logout').addEventListener('click',async()=>{
  try{await request('/api/logout',{method:'POST',body:'{}'});}catch{}
  setAuth(false);
});
async function refresh(){
  if(!authorized||polling)return;
  polling=true;
  try{
    const status=await request('/api/status');
    $('phase').textContent=phaseNames[status.phase]||status.phase;
    $('dot').classList.toggle('ok',status.connected);
    $('received').textContent=status.received;
    $('sent').textContent=status.sent;
    $('enabled').checked=!!status.botEnabled;
    $('keyStatus').textContent=status.geminiConfigured?'✅ Chave Gemini cadastrada. Modelo: '+status.model:'⚠️ Chave não cadastrada. Respostas automáticas limitadas a links.';
    if(status.connected){note('banner','✅ WhatsApp conectado! O robô está '+(status.botEnabled?'ativo.':'pausado.'),'ok');}
    else if(status.phase==='desvinculado'){note('banner','⚠️ O WhatsApp desvinculou a sessão. Toque em Novo QR Code para conectar novamente.','error');}
    else note('banner','WhatsApp: '+(phaseNames[status.phase]||status.phase)+'. '+(status.lastError||'Aguardando conexão…'));
    $('waSignal').textContent=status.connected?'✅ Conectado ao WhatsApp. Não é preciso ler o QR novamente.':(status.lastError||'Aguardando o QR Code de conexão…');
    await loadQR(status.connected);
  }catch(error){
    if(error.message.includes('senha')||error.message.includes('Entre')){setAuth(false);return;}
    note('banner',error.message,'error');
  }finally{polling=false;}
}
async function loadQR(connected){
  if(busyQR)return;
  busyQR=true;
  try{
    const result=await request('/api/qr');
    const wrap=$('qrWrap');
    if(connected){wrap.replaceChildren();const text=document.createElement('div');text.textContent='✅ WhatsApp conectado';wrap.append(text);}
    else if(result.available&&result.image){const img=document.createElement('img');img.alt='QR Code para vincular WhatsApp';img.src=result.image;wrap.replaceChildren(img);}
    else{wrap.replaceChildren();const text=document.createElement('div');text.textContent=result.phase==='desvinculado'?'Use Novo QR Code':'QR Code em preparação…';wrap.append(text);}
  }catch{}finally{busyQR=false;}
}
$('saveKey').addEventListener('click',async()=>{
  const key=$('geminiKey').value.trim();
  if(!key)return note('banner','Cole uma chave Gemini para salvar.','error');
  const btn=$('saveKey');btn.disabled=true;
  try{
    await request('/api/settings',{method:'POST',body:body({geminiKey:key})});
    $('geminiKey').value='';
    note('banner','✅ Chave salva criptografada no MongoDB.','ok');
    await refresh();
  }catch(error){note('banner',error.message,'error');}finally{btn.disabled=false;}
});
$('enabled').addEventListener('change',async e=>{
  const enabled=e.target.checked;
  try{await request('/api/settings',{method:'POST',body:body({enabled})});note('banner',enabled?'✅ Atendimento automático ligado.':'⏸️ Atendimento pausado.','ok');}
  catch(error){note('banner',error.message,'error');await refresh();}
});
$('testBtn').addEventListener('click',async()=>{
  const btn=$('testBtn');btn.disabled=true;
  note('testAnswer','Consultando o assistente…');
  try{
    const result=await request('/api/test',{method:'POST',body:body({text:$('testText').value})});
    note('testAnswer',result.answer+(result.usingGemini?'':'\n(Resposta de orientação: configure Gemini para IA.)'),'ok');
  }catch(error){note('testAnswer',error.message,'error');}finally{btn.disabled=false;}
});
$('reconnect').addEventListener('click',async()=>{
  try{await request('/api/reconnect',{method:'POST',body:'{}'});note('banner','↻ Tentativa de reconexão solicitada.');await refresh();}
  catch(error){note('banner',error.message,'error');}
});
$('reset').addEventListener('click',async()=>{
  const confirmation=window.prompt('Isto apaga apenas a sessão WhatsApp do bot e solicita um novo QR Code. Digite NOVO QR para confirmar:');
  if(confirmation!=='NOVO QR')return;
  const btn=$('reset');btn.disabled=true;
  try{await request('/api/reset-session',{method:'POST',body:body({confirm:'NOVO QR'})});note('banner','Nova sessão iniciada. Aguarde o QR Code.','ok');await refresh();}
  catch(error){note('banner',error.message,'error');}finally{btn.disabled=false;}
});
checkLogin();
setInterval(()=>{if(authorized)refresh();},6500);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authorized)refresh();});
