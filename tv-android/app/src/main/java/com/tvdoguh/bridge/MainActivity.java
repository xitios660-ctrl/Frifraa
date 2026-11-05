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
 private final Handler handler=new Handler(android.os.Looper.getMainLooper());
 private TextView status;
 private final Runnable refresh=new Runnable(){public void run(){
  SharedPreferences p=getSharedPreferences("bridge",MODE_PRIVATE);
  String text="TV DO GUH AI\n\n";
  if(!RemoteService.connected)text+="1. Ative TV DO GUH AI em Acessibilidade abaixo.\nUse o controle físico da TCL nesta etapa.";
  else if(p.getBoolean("paired",false))text+="Pareado com seu iPhone.\nO controle continua ao abrir outros aplicativos.";
  else {String code=p.getString("code","");long left=(p.getLong("expires",0)-System.currentTimeMillis())/1000;
   text+=code.isEmpty()?"Conectando ao servidor…":left>0?"No iPhone, acesse:\ntv-do-guh-ai.onrender.com\n\nCódigo: "+code+"\nExpira em "+left+" segundos.":"Código expirado. Gere outro abaixo.";
  }
  if(p.getLong("visualUntil",0)>System.currentTimeMillis())text+="\nDiagnóstico visual autorizado por "+((p.getLong("visualUntil",0)-System.currentTimeMillis())/1000)+" s";
  text+="\n\n"+p.getString("status","");status.setText(text);handler.postDelayed(this,1000);
 }};
 @Override public void onCreate(Bundle state){super.onCreate(state);
  LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(40,24,40,24);layout.setGravity(Gravity.CENTER);
  status=new TextView(this);status.setTextSize(23);status.setGravity(Gravity.CENTER);
  layout.addView(status,new LinearLayout.LayoutParams(-1,0,1));
  Button settings=new Button(this);settings.setText("Ativar controle em Acessibilidade");settings.setOnClickListener(v->startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));layout.addView(settings);
  Button reset=new Button(this);reset.setText("Desconectar iPhone / gerar novo código");reset.setOnClickListener(v->{getSharedPreferences("bridge",MODE_PRIVATE).edit().putBoolean("reset",true).apply();});layout.addView(reset);
  Button visual=new Button(this);visual.setText("Diagnóstico visual: permitir por 10 min / desligar");visual.setOnClickListener(v->{
   SharedPreferences p=getSharedPreferences("bridge",MODE_PRIVATE);
   if(p.getLong("visualUntil",0)>System.currentTimeMillis()){p.edit().putLong("visualUntil",0).apply();Toast.makeText(this,"Capturas desativadas",Toast.LENGTH_LONG).show();return;}
   if(android.os.Build.VERSION.SDK_INT<30){Toast.makeText(this,"Capturas exigem Android 11 ou superior",Toast.LENGTH_LONG).show();return;}
   new android.app.AlertDialog.Builder(this).setTitle("Compartilhar capturas da tela?").setMessage("Durante 10 minutos, seu iPhone pareado poderá solicitar fotos da tela da TV. Elas podem conter dados pessoais. Cada imagem passa pelo servidor, fica disponível por até 60 segundos e só aparece no iPhone pareado. Não há vídeo ao vivo nem acesso automático pelo ChatGPT. Você pode salvar a imagem e enviá-la no chat. Toque neste botão novamente para desligar.").setNegativeButton("Cancelar",null).setPositiveButton("Permitir 10 minutos",(dialog,which)->p.edit().putLong("visualUntil",System.currentTimeMillis()+600000).apply()).show();
  });layout.addView(visual);
  TextView note=new TextView(this);note.setText("Autorize somente seu iPhone. Não compartilhe o código.\nNavegação depende dos elementos acessíveis de cada app. Desative o serviço para encerrar o controle.");note.setGravity(Gravity.CENTER);layout.addView(note);setContentView(layout);
 }
 @Override protected void onResume(){super.onResume();handler.post(refresh);}
 @Override protected void onPause(){handler.removeCallbacks(refresh);super.onPause();}
}
