package com.tvdoguh.bridge;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.View;
import android.view.KeyEvent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.os.Handler;
import android.os.Looper;
import org.json.JSONObject;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public class RemoteService extends AccessibilityService {
 static volatile boolean connected=false;
 private volatile boolean running;
 private Thread worker;
 private final java.util.concurrent.ExecutorService screenshots=java.util.concurrent.Executors.newSingleThreadExecutor();
 private SharedPreferences prefs;
 private final Handler main=new Handler(Looper.getMainLooper());
 private void status(String s){prefs.edit().putString("status",s).apply();}
 @Override protected void onServiceConnected(){
  if(running)return;connected=true;running=true;prefs=getSharedPreferences("bridge",MODE_PRIVATE);
  worker=new Thread(()->{
   JSONObject ack=null;
   while(running){boolean failed=false;try{
    String id=prefs.getString("id",""),secret=prefs.getString("secret","");
    if(prefs.getBoolean("reset",false)){
     if(!id.isEmpty())Bridge.post("/device/revoke",new JSONObject().put("id",id).put("secret",secret));
     stopService(new Intent(this,ProjectionService.class));prefs.edit().clear().apply();id="";ack=null;
    }
    if(id.isEmpty()){
     JSONObject r=Bridge.post("/device/register",new JSONObject());id=r.getString("id");secret=r.getString("secret");
     prefs.edit().putString("id",id).putString("secret",secret).putString("code",r.getString("code")).putLong("expires",System.currentTimeMillis()+r.getLong("expiresIn")*1000).putBoolean("paired",false).apply();
    }
    JSONObject auth=new JSONObject().put("id",id).put("secret",secret).put("screenshotAllowed",visualAllowed()).put("diagnosticAllowed",diagnosticAllowed()).put("waitMs",10000);
    if(ack!=null){if(ack.has("diagnostic")&&!diagnosticAllowed()){ack.remove("diagnostic");ack.put("ok",false).put("message","Autorização de diagnóstico encerrada");}if(ack.has("image")&&!visualAllowed()){ack.remove("image");ack.put("ok",false).put("message","Autorização de captura encerrada");}try{Bridge.post("/device/ack",ack);}catch(Bridge.AuthException e){throw e;}catch(Exception ignored){/* Poll never re-executes an unacknowledged command. */}ack=null;}
    JSONObject response=Bridge.post("/device/poll",auth);
    prefs.edit().putBoolean("paired",response.optBoolean("paired")).apply();status("Servidor conectado.");
    JSONObject cmd=response.optJSONObject("command");
    if(cmd!=null){
     CountDownLatch latch=new CountDownLatch(1);String[] result={"Tempo de execução excedido"};
     String[] image={null};JSONObject report=null;
     if(cmd.optString("command").equals("DIAGNOSE")){
      try{if(!diagnosticAllowed())result[0]="Autorize o diagnóstico de apps na TV";else{report=Diagnostics.collect(this);result[0]=null;}}catch(Exception e){result[0]="Não foi possível ler o diagnóstico Android";}
     }else{
     boolean typing=cmd.optString("command").equals("TYPE_TEXT")||cmd.optString("command").equals("SAIMO_TEXT");
     long typingDeadline=android.os.SystemClock.elapsedRealtime()+11000;
     if(typing){main.post(()->TextEntry.start(this,main,cmd.optString("command"),cmd.optString("text"),()->running&&android.os.SystemClock.elapsedRealtime()<typingDeadline,error->{result[0]=error;latch.countDown();}));}
     else main.post(()->{try{if(running && cmd.optString("command").equals("SCREENSHOT")){if(ProjectionService.available()){result[0]=null;main.postDelayed(()->{try{screenshots.execute(()->{try{if(!visualAllowed())throw new IllegalStateException();image[0]=ProjectionService.capture();result[0]=null;}catch(Exception e){result[0]=e.getMessage()==null?"Falha na captura Android":e.getMessage();}finally{latch.countDown();}});}catch(RuntimeException e){result[0]="Serviço de captura encerrado";latch.countDown();}},200);return;}if(android.os.Build.VERSION.SDK_INT<30){result[0]="Capturas exigem Android 11+";return;}capture(result,image,latch);return;}if(running)result[0]=execute(cmd);}catch(Exception e){result[0]="Android recusou a ação";}finally{if(!cmd.optString("command").equals("SCREENSHOT")||result[0]!=null)latch.countDown();}});
     if(!latch.await(typing?12:5,TimeUnit.SECONDS))result[0]="Captura ou execução excedeu o prazo";
     }
     ack=new JSONObject().put("id",id).put("secret",secret).put("commandId",cmd.getString("id")).put("ok",result[0]==null).put("message",result[0]==null?successMessage(cmd.optString("command")):result[0]);
     if(result[0]==null && report!=null && diagnosticAllowed())ack.put("diagnostic",report);
     if(result[0]==null && image[0]!=null && visualAllowed())ack.put("image",image[0]);
    }
   }catch(Bridge.AuthException e){failed=true;stopService(new Intent(this,ProjectionService.class));prefs.edit().clear().apply();ack=null;status("Servidor reiniciou ou sessão revogada. Gere novo pareamento.");}
    catch(Exception e){failed=true;status("Sem conexão. Reconectando automaticamente…");}
    try{Thread.sleep(failed?1500:0);}catch(InterruptedException e){break;}
   }
  },"tv-bridge");worker.start();
 }
 private boolean diagnosticAllowed(){return prefs.getLong("diagnosticUntil",0)>System.currentTimeMillis();}
 private boolean visualAllowed(){return (android.os.Build.VERSION.SDK_INT>=30 || ProjectionService.available()) && prefs.getLong("visualUntil",0)>System.currentTimeMillis();}
 @android.annotation.TargetApi(30)
 private void capture(String[] result,String[] image,CountDownLatch latch){
  if(android.os.Build.VERSION.SDK_INT<30 || !visualAllowed()){result[0]="Autorize diagnóstico visual na TV; requer Android 11+";return;}
  result[0]=null;
  takeScreenshot(android.view.Display.DEFAULT_DISPLAY,screenshots,new TakeScreenshotCallback(){
   @Override public void onSuccess(ScreenshotResult shot){
    android.hardware.HardwareBuffer buffer=shot.getHardwareBuffer();
    android.graphics.Bitmap hardware=null,software=null,scaled=null;
    try{
     if(!running||!visualAllowed())throw new IllegalStateException();
     hardware=android.graphics.Bitmap.wrapHardwareBuffer(buffer,shot.getColorSpace());
     if(hardware==null)throw new IllegalStateException();
     software=hardware.copy(android.graphics.Bitmap.Config.ARGB_8888,false);
     int width=Math.min(960,software.getWidth()),height=Math.max(1,software.getHeight()*width/software.getWidth());
     scaled=android.graphics.Bitmap.createScaledBitmap(software,width,height,true);
     java.io.ByteArrayOutputStream out=new java.io.ByteArrayOutputStream();scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG,55,out);
     if(out.size()>220000)throw new IllegalStateException();
     image[0]=android.util.Base64.encodeToString(out.toByteArray(),android.util.Base64.NO_WRAP);
    }catch(Exception e){result[0]="Não foi possível preparar a captura";}
    finally{if(scaled!=null&&scaled!=software)scaled.recycle();if(software!=null)software.recycle();if(hardware!=null)hardware.recycle();buffer.close();latch.countDown();}
   }
   @Override public void onFailure(int code){result[0]="Android bloqueou a captura (código "+code+"). Conteúdo protegido pode não permitir imagens.";latch.countDown();}
  });
 }
 private String successMessage(String command){
  switch(command){
   case "TYPE_TEXT":case "SAIMO_TEXT":return "Nome completo inserido e conferido no campo de busca";
   case "DIAGNOSE":return "Diagnóstico coletado; nada foi apagado";
   case "APP_SETTINGS":return "Solicitação de abrir detalhes aceita; limpeza não realizada";
   case "REQUEST_UNINSTALL":return "Tela de desinstalação solicitada; confirme na TCL e atualize o diagnóstico";
   case "STORAGE_SETTINGS":return "Solicitação de abrir armazenamento aceita pelo Android";
   default:return "Ação aceita pela API Android";
  }
 }
 private String execute(JSONObject command){
  String c=command.optString("command");
  AudioManager audio=(AudioManager)getSystemService(AUDIO_SERVICE);
  switch(c){
   case "STORAGE_SETTINGS":startActivity(new Intent(android.provider.Settings.ACTION_INTERNAL_STORAGE_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));return null;
   case "APP_SETTINGS":case "REQUEST_UNINSTALL":
    if(!diagnosticAllowed())return "Autorize diagnóstico de apps na TV";
    if(c.equals("REQUEST_UNINSTALL")&&!command.optBoolean("confirmed"))return "Confirme a solicitação no iPhone";
    return Diagnostics.openApp(this,command.optString("package"),c.equals("REQUEST_UNINSTALL"));
   case "HOME":return performGlobalAction(GLOBAL_ACTION_HOME)?null:"Início indisponível";
   case "BACK":return performGlobalAction(GLOBAL_ACTION_BACK)?null:"Voltar indisponível";
   case "VOLUME_UP":case "VOLUME_DOWN":case "MUTE":
    if(audio.isVolumeFixed())return "Volume fixo nesta saída de áudio";
    audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,c.equals("MUTE")?AudioManager.ADJUST_TOGGLE_MUTE:c.equals("VOLUME_UP")?AudioManager.ADJUST_RAISE:AudioManager.ADJUST_LOWER,AudioManager.FLAG_SHOW_UI);return null;
   case "OPEN_APP":if(!Diagnostics.packages(this).contains(command.optString("package")))return "Aplicativo não encontrado";return launch(command.optString("package"));
   case "YOUTUBE":return launch("com.google.android.youtube.tv");
   case "NETFLIX":return launch("com.netflix.ninja");
   case "PLAY_PAUSE":
    audio.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_DOWN,KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE));
    audio.dispatchMediaKeyEvent(new KeyEvent(KeyEvent.ACTION_UP,KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE));return null;
   default:return navigate(c);
  }
 }
 private String launch(String pkg){Intent i=getPackageManager().getLeanbackLaunchIntentForPackage(pkg);if(i==null)i=getPackageManager().getLaunchIntentForPackage(pkg);if(i==null)return "Aplicativo não instalado ou indisponível";i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);startActivity(i);return null;}
 private String navigate(String cmd){
  AccessibilityNodeInfo root=getRootInActiveWindow();if(root==null)return "App não expõe elementos acessíveis";
  AccessibilityNodeInfo focus=root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
  if(focus==null)focus=root.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY);
  if(focus==null)return "Sem foco acessível. Use o controle físico para iniciar a navegação.";
  if(cmd.equals("OK")){
   for(AccessibilityNodeInfo n=focus;n!=null;n=n.getParent())if(n.isClickable()&&n.performAction(AccessibilityNodeInfo.ACTION_CLICK))return null;
   return "Este elemento não aceita clique acessível";
  }
  int direction;
  switch(cmd){case "UP":direction=View.FOCUS_UP;break;case "DOWN":direction=View.FOCUS_DOWN;break;case "LEFT":direction=View.FOCUS_LEFT;break;case "RIGHT":direction=View.FOCUS_RIGHT;break;default:return "Comando não suportado";}
  AccessibilityNodeInfo next=focus.focusSearch(direction);
  return next!=null&&next.performAction(AccessibilityNodeInfo.ACTION_FOCUS)?null:"Sem elemento acessível nessa direção";
 }
 @Override public void onAccessibilityEvent(AccessibilityEvent e){}
 @Override public void onInterrupt(){}
 @Override public void onDestroy(){running=false;connected=false;main.removeCallbacksAndMessages(null);if(worker!=null)worker.interrupt();stopService(new Intent(this,ProjectionService.class));screenshots.shutdownNow();super.onDestroy();}
}
