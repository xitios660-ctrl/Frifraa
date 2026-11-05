package com.tvdoguh.bridge;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.content.Intent;
import android.content.SharedPreferences;
import android.provider.Settings;
import android.view.Gravity;
import android.widget.*;

public class MainActivity extends Activity {
 private final Handler handler=new Handler();
 private TextView status;
 private final Runnable refresh=new Runnable(){public void run(){
  SharedPreferences p=getSharedPreferences("bridge",MODE_PRIVATE);
  String text="TV DO GUH AI\n\n";
  if(!RemoteService.connected)text+="1. Ative TV DO GUH AI em Acessibilidade abaixo.\nUse o controle físico da TCL nesta etapa.";
  else if(p.getBoolean("paired",false))text+="Pareado com seu iPhone.\nO controle continua ao abrir outros aplicativos.";
  else {String code=p.getString("code","");long left=(p.getLong("expires",0)-System.currentTimeMillis())/1000;
   text+=code.isEmpty()?"Conectando ao servidor…":left>0?"No iPhone, acesse:\ntv-do-guh-ai.onrender.com\n\nCódigo: "+code+"\nExpira em "+left+" segundos.":"Código expirado. Gere outro abaixo.";
  }
  text+="\n\n"+p.getString("status","");status.setText(text);handler.postDelayed(this,1000);
 }};
 @Override public void onCreate(Bundle state){super.onCreate(state);
  LinearLayout layout=new LinearLayout(this);layout.setOrientation(1);layout.setPadding(40,24,40,24);layout.setGravity(Gravity.CENTER);
  status=new TextView(this);status.setTextSize(23);status.setGravity(Gravity.CENTER);
  layout.addView(status,new LinearLayout.LayoutParams(-1,0,1));
  Button settings=new Button(this);settings.setText("Ativar controle em Acessibilidade");settings.setOnClickListener(v->startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));layout.addView(settings);
  Button reset=new Button(this);reset.setText("Desconectar iPhone / gerar novo código");reset.setOnClickListener(v->{getSharedPreferences("bridge",MODE_PRIVATE).edit().putBoolean("reset",true).apply();});layout.addView(reset);
  TextView note=new TextView(this);note.setText("Autorize somente seu iPhone. Não compartilhe o código.\nNavegação depende dos elementos acessíveis de cada app. Desative o serviço para encerrar o controle.");note.setGravity(Gravity.CENTER);layout.addView(note);setContentView(layout);
 }
 @Override protected void onResume(){super.onResume();handler.post(refresh);}
 @Override protected void onPause(){handler.removeCallbacks(refresh);super.onPause();}
}
