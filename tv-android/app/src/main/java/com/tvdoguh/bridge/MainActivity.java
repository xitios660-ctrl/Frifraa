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
 private static final int SCREEN_CONSENT=901;
 private final Runnable refresh=new Runnable(){public void run(){
  SharedPreferences p=getSharedPreferences("bridge",MODE_PRIVATE);
  String text="TV DO GUH AI\n\n";
  if(!RemoteService.connected)text+="1. Ative TV DO GUH AI em Acessibilidade abaixo.\nUse o controle físico da TCL nesta etapa.";
  else if(p.getBoolean("paired",false))text+="Pareado com seu iPhone.\nO controle continua ao abrir outros aplicativos.";
  else {String code=p.getString("code","");long left=(p.getLong("expires",0)-System.currentTimeMillis())/1000;
   text+=code.isEmpty()?"Conectando ao servidor…":left>0?"No iPhone, acesse:\ntv-do-guh-ai.onrender.com\n\nCódigo: "+code+"\nExpira em "+left+" segundos.":"Código expirado. Gere outro abaixo.";
  }
  if(p.getLong("visualUntil",0)>System.currentTimeMillis())text+="\nDiagnóstico visual autorizado até desligar";
  if(p.getLong("diagnosticUntil",0)>System.currentTimeMillis())text+="\nDiagnóstico de apps autorizado";
  text+="\n"+p.getString("projectionStatus","");
  text+="\n\n"+p.getString("status","");status.setText(text);handler.postDelayed(this,1000);
 }};
 @Override public void onCreate(Bundle state){super.onCreate(state);
  LinearLayout layout=new LinearLayout(this);layout.setOrientation(LinearLayout.VERTICAL);layout.setPadding(40,24,40,24);layout.setGravity(Gravity.CENTER);
  status=new TextView(this);status.setTextSize(19);status.setGravity(Gravity.CENTER);
  layout.addView(status,new LinearLayout.LayoutParams(-1,-2));
  Button settings=new Button(this);settings.setText("Ativar controle em Acessibilidade");settings.setOnClickListener(v->startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));layout.addView(settings);
  Button reset=new Button(this);reset.setText("Desconectar iPhone / gerar novo código");reset.setOnClickListener(v->{getSharedPreferences("bridge",MODE_PRIVATE).edit().putBoolean("reset",true).apply();});layout.addView(reset);
  Button visual=new Button(this);visual.setText("Diagnóstico visual: permitir até desligar");visual.setOnClickListener(v->{
   SharedPreferences p=getSharedPreferences("bridge",MODE_PRIVATE);
   if(p.getLong("visualUntil",0)>System.currentTimeMillis()){p.edit().putLong("visualUntil",0).apply();stopService(new Intent(this,ProjectionService.class));Toast.makeText(this,"Capturas desativadas",Toast.LENGTH_LONG).show();return;}
   if(android.os.Build.VERSION.SDK_INT<30){startProjectionConsent();return;}
   new android.app.AlertDialog.Builder(this).setTitle("Compartilhar capturas da tela?").setMessage("Até você desligar, seu iPhone pareado e a assistência autorizada poderão solicitar fotos da tela da TV. Elas podem conter dados pessoais. Cada imagem passa pelo servidor, fica disponível por até 60 segundos e pode ser consultada pelo iPhone pareado e pela assistência autorizada. Não há vídeo ao vivo nem acesso automático pelo ChatGPT. Você pode salvar a imagem e enviá-la no chat. Toque neste botão novamente para desligar.").setNegativeButton("Cancelar",null).setPositiveButton("Permitir até desligar",(dialog,which)->p.edit().putLong("visualUntil",Long.MAX_VALUE).apply()).show();
  });layout.addView(visual);
  Button projection=new Button(this);projection.setText("Teste Android 9: compartilhar tela / parar");projection.setOnClickListener(v->{if(ProjectionService.available()){stopService(new Intent(this,ProjectionService.class));return;}startProjectionConsent();});layout.addView(projection);
  Button diagnostics=new Button(this);diagnostics.setText("Diagnóstico de apps: permitir até desligar");diagnostics.setOnClickListener(v->{
   SharedPreferences p=getSharedPreferences("bridge",MODE_PRIVATE);
   if(p.getLong("diagnosticUntil",0)>System.currentTimeMillis()){p.edit().putLong("diagnosticUntil",0).apply();return;}
   new android.app.AlertDialog.Builder(this).setTitle("Compartilhar diagnóstico com seu iPhone?").setMessage("Até você desligar, o iPhone pareado poderá consultar espaço livre, RAM disponível e apps visíveis ao Android. Com Acesso ao uso opcional, também poderá consultar tamanhos de apps, dados e cache. O relatório passa pelo servidor e expira em dez minutos. Nada é apagado automaticamente. Desinstalação e limpeza de dados devem ser confirmadas na interface oficial da TV.").setNegativeButton("Cancelar",null).setPositiveButton("Permitir",(dialog,which)->p.edit().putLong("diagnosticUntil",Long.MAX_VALUE).apply()).show();
  });layout.addView(diagnostics);
  Button usage=new Button(this);usage.setText("Opcional: acesso ao uso para medir apps e cache");usage.setOnClickListener(v->{try{startActivity(new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));}catch(Exception e){Toast.makeText(this,"A TCL não disponibilizou Acesso ao uso",Toast.LENGTH_LONG).show();}});layout.addView(usage);
  TextView note=new TextView(this);note.setText("Autorize somente seu iPhone. Não compartilhe o código.\nNavegação depende dos elementos acessíveis de cada app. Desative o serviço para encerrar o controle.");note.setGravity(Gravity.CENTER);layout.addView(note);ScrollView scroll=new ScrollView(this);scroll.setFillViewport(true);scroll.addView(layout);setContentView(scroll);
 }
 private void startProjectionConsent(){
  new android.app.AlertDialog.Builder(this).setTitle("Autorizar teste de compartilhamento?").setMessage("A tela pode conter dados pessoais. Até você desligar, seu iPhone pareado e a assistência temporária autorizada poderão solicitar capturas. Não há envio contínuo de vídeo. Cada imagem fica no servidor por até 60 segundos. O Android apresentará uma segunda autorização. Você pode parar aqui ou pela notificação. Conteúdos protegidos podem não aparecer.").setNegativeButton("Cancelar",null).setPositiveButton("Continuar",(dialog,which)->{
   try{android.media.projection.MediaProjectionManager manager=(android.media.projection.MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE);startActivityForResult(manager.createScreenCaptureIntent(),SCREEN_CONSENT);}catch(Exception e){getSharedPreferences("bridge",MODE_PRIVATE).edit().putString("projectionStatus","A TCL não disponibilizou a autorização de compartilhamento.").apply();}
  }).show();
 }
 @Override protected void onActivityResult(int request,int result,Intent data){super.onActivityResult(request,result,data);
  if(request!=SCREEN_CONSENT)return;
  if(result!=RESULT_OK||data==null){getSharedPreferences("bridge",MODE_PRIVATE).edit().putString("projectionStatus","Compartilhamento não autorizado no Android.").apply();return;}
  try{startForegroundService(new Intent(this,ProjectionService.class).putExtra("result",result).putExtra("consent",data));}catch(Exception e){getSharedPreferences("bridge",MODE_PRIVATE).edit().putString("projectionStatus","Android recusou iniciar o serviço de compartilhamento.").apply();}
 }
 @Override protected void onResume(){super.onResume();handler.post(refresh);}
 @Override protected void onPause(){handler.removeCallbacks(refresh);super.onPause();}
}
