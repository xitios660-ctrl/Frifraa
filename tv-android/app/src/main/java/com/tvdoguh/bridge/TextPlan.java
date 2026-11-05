package com.tvdoguh.bridge;

import java.text.Normalizer;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

final class TextPlan {
 static String normalize(String text){return Normalizer.normalize(text,Normalizer.Form.NFD).replaceAll("\\p{M}+","").toLowerCase(Locale.ROOT).trim().replaceAll("\\s+"," ");}
 static List<String> saimo(String text){
  String normalized=normalize(text);
  if(normalized.isEmpty()||normalized.length()>40||!normalized.matches("[a-z0-9 ]+"))throw new IllegalArgumentException("Use até 40 letras, números e espaços no teclado Saimo");
  List<String> plan=new ArrayList<>();plan.add("limpar");
  for(char c:normalized.toCharArray())plan.add(c==' '?"espaço":String.valueOf(c));
  return plan;
 }
}
