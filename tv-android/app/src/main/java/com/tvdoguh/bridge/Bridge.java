package com.tvdoguh.bridge;
import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.media.AudioManager;
import android.content.Context;
import android.view.Gravity;
import android.widget.TextView;
import org.json.JSONObject;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.io.*;
public class Bridge extends Activity {
 final String BASE="https://tv-do-guh-bridge.onrender.com";
 String id,secret; TextView view; volatile boolean active=true;
 JSONObject post(String route,JSONObject data)throws Exception{
  HttpsURLConnection c=(HttpsURLConnection)new URL(BASE+route).openConnection();
  c.setRequestMethod("POST");c.setDoOutput(true);c.setConnectTimeout(10000);c.setReadTimeout(10000);
  c.setRequestProperty("Content-Type","application/json");
  try(OutputStream out=c.getOutputStream()){out.write(data.toString().getBytes("UTF-8"));}
  try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
   byte[] buf=new byte[4096];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);
   return new JSONObject(out.toString("UTF-8"));
  }finally{c.disconnect();}
 }
 void show(String s){runOnUiThread(()->view.setText(s));}
 @Override public void onCreate(Bundle b){super.onCreate(b);view=new TextView(this);view.setTextSize(24);view.setGravity(Gravity.CENTER);setContentView(view);
  show("TV DO GUH AI\nConectando...");new Thread(()->{
   try{JSONObject r=post("/device/register",new JSONObject());id=r.getString("id");secret=r.getString("secret");
    show("TV DO GUH AI\n\nDigite este código no site:\n"+r.getString("code")+"\n\nDeixe este aplicativo aberto.");
    while(active){try{JSONObject p=post("/device/poll",new JSONObject().put("id",id).put("secret",secret));
      if(p.optBoolean("paired"))show("TV DO GUH AI\n\nConectado!\nMantenha este aplicativo aberto.");
      String cmd=p.optString("command","");if(!cmd.isEmpty()&&!cmd.equals("null"))runOnUiThread(()->execute(cmd));
     }catch(Exception e){show("Conexão indisponível. Tentando novamente...");}
     Thread.sleep(2000);
    }
   }catch(Exception e){show("Falha ao conectar. Verifique o Wi-Fi e reabra o aplicativo.");}
  }).start();
 }
 void execute(String c){
  AudioManager audio=(AudioManager)getSystemService(Context.AUDIO_SERVICE);
  switch(c){
   case "VOLUME_UP":audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,AudioManager.ADJUST_RAISE,AudioManager.FLAG_SHOW_UI);break;
   case "VOLUME_DOWN":audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,AudioManager.ADJUST_LOWER,AudioManager.FLAG_SHOW_UI);break;
   case "MUTE":audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,AudioManager.ADJUST_TOGGLE_MUTE,AudioManager.FLAG_SHOW_UI);break;
   case "YOUTUBE":launch("com.google.android.youtube.tv");break;
   case "NETFLIX":launch("com.netflix.ninja");break;
   case "HOME":startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME));break;
   case "BACK":onBackPressed();break;
  }
 }
 void launch(String pkg){Intent i=getPackageManager().getLaunchIntentForPackage(pkg);if(i!=null)startActivity(i);}
 @Override protected void onDestroy(){active=false;super.onDestroy();}
}