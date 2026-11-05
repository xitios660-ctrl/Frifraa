package com.tvdoguh.bridge;
import android.app.Activity;
import android.os.Bundle;
import android.widget.TextView;
import android.view.Gravity;
public class MainActivity extends Activity {
 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  TextView view=new TextView(this);
  view.setText("TV DO GUH AI\n\nAplicativo inicial instalado.\nO controle remoto ainda não está ativado.\nNenhum comando externo será executado sem pareamento seguro.");
  view.setGravity(Gravity.CENTER); view.setTextSize(22); setContentView(view);
 }
}