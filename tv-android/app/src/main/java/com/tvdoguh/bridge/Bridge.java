package com.tvdoguh.bridge;

import org.json.JSONObject;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.io.*;

final class Bridge {
 static final String BASE="https://tv-do-guh-bridge.onrender.com";
 static class AuthException extends IOException {}
 static JSONObject post(String route,JSONObject data)throws Exception {
  HttpsURLConnection c=(HttpsURLConnection)new URL(BASE+route).openConnection();
  try {
   c.setRequestMethod("POST");c.setDoOutput(true);c.setConnectTimeout(15000);c.setReadTimeout(15000);
   c.setRequestProperty("Content-Type","application/json");
   try(OutputStream out=c.getOutputStream()){out.write(data.toString().getBytes("UTF-8"));}
   if(c.getResponseCode()==401)throw new AuthException();
   if(c.getResponseCode()>=400)throw new IOException("HTTP "+c.getResponseCode());
   try(InputStream in=c.getInputStream();ByteArrayOutputStream out=new ByteArrayOutputStream()){
    byte[] buf=new byte[4096];int n;while((n=in.read(buf))!=-1){if(out.size()+n>65536)throw new IOException("Resposta excessiva");out.write(buf,0,n);}
    return new JSONObject(out.toString("UTF-8"));
   }
  } finally {c.disconnect();}
 }
}
