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
 private SharedPreferences prefs;
 private final Handler main=new Handler(Looper.getMainLooper());
 private void status(String s){prefs.edit().putString("status",s).apply();}
 @Override protected void onServiceConnected(){
  if(running)return;connected=true;running=true;prefs=getSharedPreferences("bridge",MODE_PRIVATE);
  worker=new Thread(()->{
   JSONObject ack=null;
   while(running){try{
    String id=prefs.getString("id",""),secret=prefs.getString("secret","");
    if(prefs.getBoolean("reset",false)){
     if(!id.isEmpty())Bridge.post("/device/revoke",new JSONObject().put("id",id).put("secret",secret));
     prefs.edit().clear().apply();id="";ack=null;
    }
    if(id.isEmpty()){
     JSONObject r=Bridge.post("/device/register",new JSONObject());id=r.getString("id");secret=r.getString("secret");
     prefs.edit().putString("id",id).putString("secret",secret).putString("code",r.getString("code")).putLong("expires",System.currentTimeMillis()+r.getLong("expiresIn")*1000).putBoolean("paired",false).apply();
    }
    JSONObject auth=new JSONObject().put("id",id).put("secret",secret);
    if(ack!=null){try{Bridge.post("/device/ack",ack);}catch(Bridge.AuthException e){throw e;}catch(Exception ignored){/* Poll never re-executes an unacknowledged command. */}ack=null;}
    JSONObject response=Bridge.post("/device/poll",auth);
    prefs.edit().putBoolean("paired",response.optBoolean("paired")).apply();status("Servidor conectado.");
    JSONObject cmd=response.optJSONObject("command");
    if(cmd!=null){
     CountDownLatch latch=new CountDownLatch(1);String[] result={"Tempo de execução excedido"};
     main.post(()->{try{if(running)result[0]=execute(cmd.optString("command"));}catch(Exception e){result[0]="Android recusou a ação";}finally{latch.countDown();}});
     latch.await(5,TimeUnit.SECONDS);
     ack=new JSONObject().put("id",id).put("secret",secret).put("commandId",cmd.getString("id")).put("ok",result[0]==null).put("message",result[0]==null?"Ação aceita pela API Android":result[0]);
    }
   }catch(Bridge.AuthException e){prefs.edit().clear().apply();ack=null;status("Servidor reiniciou ou sessão revogada. Gere novo pareamento.");}
    catch(Exception e){status("Sem conexão. Reconectando automaticamente…");}
    try{Thread.sleep(1200);}catch(InterruptedException e){break;}
   }
  },"tv-bridge");worker.start();
 }
 private String execute(String c){
  AudioManager audio=(AudioManager)getSystemService(AUDIO_SERVICE);
  switch(c){
   case "HOME":return performGlobalAction(GLOBAL_ACTION_HOME)?null:"Início indisponível";
   case "BACK":return performGlobalAction(GLOBAL_ACTION_BACK)?null:"Voltar indisponível";
   case "VOLUME_UP":case "VOLUME_DOWN":case "MUTE":
    if(audio.isVolumeFixed())return "Volume fixo nesta saída de áudio";
    audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,c.equals("MUTE")?AudioManager.ADJUST_TOGGLE_MUTE:c.equals("VOLUME_UP")?AudioManager.ADJUST_RAISE:AudioManager.ADJUST_LOWER,AudioManager.FLAG_SHOW_UI);return null;
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
 @Override public void onDestroy(){running=false;connected=false;if(worker!=null)worker.interrupt();super.onDestroy();}
}
