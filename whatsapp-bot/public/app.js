'use strict';
const $=id=>document.getElementById(id);
const PHASES={'iniciando':'Iniciando','conectando':'Conectando','aguardando-qr':'Aguardando QR','conectado':'Conectado','reconectando':'Reconectando','desvinculado':'Desvinculado','erro':'Verificar conexão'};
let authorized=false,loading=false,qrBusy=false,previousQR='',lastPhase='';
async function api(path,options={}){
  const headers=options.body?{'Content-Type':'application/json'}:{};
  const controller=new AbortController();
  const id=setTimeout(()=>controller.abort(),14000);
  try{
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...options,headers,signal:controller.signal});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.error||'Erro de conexão.'),{status:response.status});
    return data;
  }finally{clearTimeout(id)}
}
function uiAuthorized(value){
  authorized=value;
  $('connectPanel').hidden=!value;
  $('accessNotice').hidden=value;
  if(!value){
    $('phase').textContent='Acesso privado';
    $('dot').classList.remove('ok');
  }
}
function notice(text,style=''){
  $('banner').textContent=text;
  $('banner').className='notice'+(style?' '+style:'');
}
function qrMessage(message,success=false){
  const div=document.createElement('div');
  div.className=success?'qr-connected':'qr-loading';
  const sym=document.createElement('span');sym.className='big-symbol';sym.textContent=success?'✅':'📱';
  const text=document.createElement('span');text.textContent=message;
  div.append(sym,text);$('qrWrap').replaceChildren(div);
}
async function refreshQR(connected,phase){
  if(qrBusy)return;
  qrBusy=true;
  try {
    if(connected){previousQR='';qrMessage('WhatsApp conectado! QR Code não é necessário.',true);return}
    const qr=await api('/api/qr');
    if(qr.available&&qr.image){
      if(qr.image===previousQR)return;
      previousQR=qr.image;
      const image=document.createElement('img');
      image.alt='QR Code temporário para vincular o WhatsApp pelo Baileys';
      image.src=qr.image;
      image.width=345;image.height=345;
      $('qrWrap').replaceChildren(image);
    }else{
      previousQR='';
      qrMessage(phase==='desvinculado'?'Sessão desvinculada. Gere um novo QR Code.':'Aguardando o QR Code do Baileys…');
    }
  }catch(e){if(e.status===401){uiAuthorized(false);return}qrMessage('Não consegui carregar o QR. Vou tentar novamente.')}
  finally{qrBusy=false}
}
async function refresh(){
  if(!authorized||loading)return;
  loading=true;
  try{
    const state=await api('/api/status');
    $('phase').textContent=PHASES[state.phase]||state.phase||'Verificando';
    $('dot').classList.toggle('ok',!!state.connected);
    if(state.connected){
      notice('✅ WhatsApp conectado. A sessão está salva e o Bot pode atender aos grupos.','ok');
    }else if(state.phase==='desvinculado'){
      notice('⚠️ O WhatsApp desvinculou o Bot. Use Gerar novo QR Code para conectar novamente.','warn');
    }else{
      notice((PHASES[state.phase]||'Conferindo a conexão')+'. '+(state.lastError||'O Bot está tentando se conectar.'),'');
    }
    $('reset').hidden=state.phase!=='desvinculado';
    $('lastCheck').textContent='Última verificação: '+new Date().toLocaleTimeString('pt-BR');
    lastPhase=state.phase;
    await refreshQR(!!state.connected,state.phase);
  }catch(e){
    if(e.status===401){uiAuthorized(false);$('accessError').textContent='O acesso privado expirou. Abra novamente seu link privado.';return}
    notice('Não foi possível consultar o servidor. Tentando reconectar automaticamente…','warn');
    $('phase').textContent='Sem resposta';
    $('dot').classList.remove('ok');
  }finally{loading=false}
}
async function initialize(){
  // The access code remains inside the URL fragment, never in server URL logs.
  const fragment=location.hash;
  const match=fragment.match(/(?:^#|[&#])acesso=([A-Za-z0-9_-]{40,150})(?:&|$)/);
  if(fragment)history.replaceState(null,'',location.pathname+location.search);
  if(match){
    $('phase').textContent='Validando link';
    try {
      await api('/api/activate',{method:'POST',body:JSON.stringify({token:match[1]})});
      uiAuthorized(true);
      await refresh();
      return;
    }catch(e){
      uiAuthorized(false);
      $('accessError').textContent='Este link privado não foi reconhecido ou expirou. Solicite o link atualizado.';
      return;
    }
  }
  try{
    const session=await api('/api/me');
    uiAuthorized(!!session.loggedIn);
    if(authorized)await refresh();
  }catch{uiAuthorized(false)}
}
$('reconnect').addEventListener('click',async()=>{
  const button=$('reconnect');button.disabled=true;
  try {
    const state=await api('/api/status');
    if(!state.connected && state.phase!=='desvinculado'){
      await api('/api/reconnect',{method:'POST',body:'{}'});
      notice('↻ Reconexão solicitada. Aguardando o Baileys…');
    }
    await refresh();
  }catch(e){notice(e.message||'Não foi possível reconectar.','warn')}
  finally{button.disabled=false}
});
$('reset').addEventListener('click',async()=>{
  if(!confirm('Isso apagará a sessão atual do WhatsApp do Bot. Deseja gerar um QR Code novo?'))return;
  const button=$('reset');button.disabled=true;
  try{
    await api('/api/reset-session',{method:'POST',body:JSON.stringify({confirm:'NOVO QR'})});
    notice('Novo QR Code solicitado. Aguarde alguns instantes.');
    previousQR='';await refresh();
  }catch(e){notice(e.message||'Não foi possível gerar novo QR.','warn')}
  finally{button.disabled=false}
});
// Each foreground tab sends periodic requests to help the Render service stay awake.
setInterval(()=>{if(authorized)void refresh();else void fetch('/api/health',{cache:'no-store'}).catch(()=>{})},25000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&authorized)void refresh()});
window.addEventListener('online',()=>{if(authorized)void refresh()});
void initialize();
