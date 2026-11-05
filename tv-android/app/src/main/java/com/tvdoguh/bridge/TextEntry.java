package com.tvdoguh.bridge;

import android.accessibilityservice.AccessibilityService;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.Handler;
import android.view.accessibility.AccessibilityNodeInfo;
import java.util.List;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Explicit search entry, no raw key injection or arbitrary UI scripting. */
final class TextEntry {
 private static String text(AccessibilityNodeInfo node){return node.getText()!=null?node.getText().toString():node.getContentDescription()!=null?node.getContentDescription().toString():"";}
 private static AccessibilityNodeInfo find(AccessibilityNodeInfo node,String label,int[] budget){
  if(node==null||--budget[0]<0)return null;
  if(TextPlan.normalize(text(node)).equals(label)&&node.isVisibleToUser())return node;
  for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo found=find(node.getChild(i),label,budget);if(found!=null)return found;}
  return null;
 }
 private static AccessibilityNodeInfo key(AccessibilityNodeInfo node,String label){return find(node,TextPlan.normalize(label),new int[]{1500});}
 private static AccessibilityNodeInfo keyboard(AccessibilityNodeInfo root){
  AccessibilityNodeInfo clear=key(root,"limpar");
  for(AccessibilityNodeInfo n=clear;n!=null;n=n.getParent()){
   if(key(n,"a")!=null&&key(n,"f")!=null&&key(n,"m")!=null&&key(n,"s")!=null&&key(n,"9")!=null&&key(n,"espaço")!=null)return n;
  }return null;
 }
 private static boolean click(AccessibilityNodeInfo node){
  for(AccessibilityNodeInfo n=node;n!=null;n=n.getParent()){
   if(n.isPassword())return false;
   if(n.isClickable()){
    if(n.isFocusable()&&!n.performAction(AccessibilityNodeInfo.ACTION_FOCUS))return false;
    return n.performAction(AccessibilityNodeInfo.ACTION_CLICK);
   }
  }return false;
 }
 static void start(AccessibilityService service,Handler handler,String mode,String value,BooleanSupplier active,Consumer<String> done){
  if(!active.getAsBoolean()){done.accept("Digitação cancelada");return;}
  if(value==null||value.isEmpty()||value.length()>80){done.accept("Texto deve ter de 1 a 80 caracteres");return;}
  AccessibilityNodeInfo root=service.getRootInActiveWindow();
  if(root==null){done.accept("Sem janela acessível para digitar");return;}
  String owner=String.valueOf(root.getPackageName());
  if(mode.equals("TYPE_TEXT")){
   AccessibilityNodeInfo field=root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
   if(field==null||!field.isEditable()||field.isPassword()){done.accept("Campo atual não permite inserção direta. No teclado do Saimo, use SAIMO_TEXT.");return;}
   Bundle args=new Bundle();args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,value);
   if(!field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT,args)){done.accept("Android recusou inserir texto no campo");return;}
   handler.postDelayed(()->{
    AccessibilityNodeInfo current=service.getRootInActiveWindow();
    if(!active.getAsBoolean()||current==null||!owner.equals(String.valueOf(current.getPackageName()))||!field.refresh()||!value.contentEquals(field.getText()==null?"":field.getText()))done.accept("Texto enviado, mas não foi possível confirmar o conteúdo do campo");
    else done.accept(null);
   },100);return;
  }
  if(!owner.equals("br.com.saimo.tv")||keyboard(root)==null){done.accept("Abra o teclado de busca do Saimo antes de enviar o nome completo");return;}
  final List<String> plan;
  try{plan=TextPlan.saimo(value);}catch(IllegalArgumentException e){done.accept(e.getMessage());return;}
  String normalized=TextPlan.normalize(value);
  handler.post(new Runnable(){int index=0;
   @Override public void run(){try{
    AccessibilityNodeInfo current=service.getRootInActiveWindow();
    if(!active.getAsBoolean()||current==null||!owner.equals(String.valueOf(current.getPackageName()))){done.accept("Digitação interrompida: a janela mudou");return;}
    AccessibilityNodeInfo grid=keyboard(current);
    if(grid==null){done.accept("Digitação interrompida: teclado não está mais visível");return;}
    if(index==plan.size()){
     AccessibilityNodeInfo a=key(grid,"a"),f=key(grid,"f");Rect ra=new Rect(),rf=new Rect();a.getBoundsInScreen(ra);f.getBoundsInScreen(rf);
     for(AccessibilityNodeInfo match:current.findAccessibilityNodeInfosByText(normalized)){
      Rect box=new Rect();match.getBoundsInScreen(box);
      if(TextPlan.normalize(text(match)).equals(normalized)&&box.bottom<=ra.top&&box.centerX()>=ra.left&&box.centerX()<=rf.right){done.accept(null);return;}
     }
     done.accept("Teclas enviadas; texto final não pôde ser confirmado pela acessibilidade");return;
    }
    String label=plan.get(index);AccessibilityNodeInfo target=key(grid,label);
    if(target==null||!click(target)){done.accept("Digitação interrompida: tecla esperada indisponível");return;}
    index++;handler.postDelayed(this,90);
   }catch(Exception e){done.accept("Digitação interrompida pelo Android");}}
  });
 }
}
