package com.tvdoguh.bridge;

import android.app.ActivityManager;
import android.app.AppOpsManager;
import android.app.usage.StorageStats;
import android.app.usage.StorageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Environment;
import android.os.StatFs;
import android.os.SystemClock;
import android.os.storage.StorageManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.TreeSet;

final class Diagnostics {
 static boolean usageAllowed(Context context){
  AppOpsManager ops=(AppOpsManager)context.getSystemService(Context.APP_OPS_SERVICE);
  return ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS,android.os.Process.myUid(),context.getPackageName())==AppOpsManager.MODE_ALLOWED;
 }
 static TreeSet<String> packages(Context context){
  TreeSet<String> result=new TreeSet<>();
  for(String category:new String[]{Intent.CATEGORY_LEANBACK_LAUNCHER,Intent.CATEGORY_LAUNCHER}){
   Intent i=new Intent(Intent.ACTION_MAIN).addCategory(category);
   for(ResolveInfo info:context.getPackageManager().queryIntentActivities(i,0))if(info.activityInfo!=null)result.add(info.activityInfo.packageName);
  }
  return result;
 }
 static JSONObject collect(Context context)throws Exception {
  StatFs disk=new StatFs(Environment.getDataDirectory().getAbsolutePath());
  ActivityManager.MemoryInfo memory=new ActivityManager.MemoryInfo();((ActivityManager)context.getSystemService(Context.ACTIVITY_SERVICE)).getMemoryInfo(memory);
  boolean usage=usageAllowed(context);long deadline=SystemClock.elapsedRealtime()+4000;
  JSONObject report=new JSONObject().put("capturedAt",System.currentTimeMillis()).put("storageTotal",disk.getTotalBytes()).put("storageFree",disk.getAvailableBytes()).put("ramTotal",memory.totalMem).put("ramAvailable",memory.availMem).put("lowMemory",memory.lowMemory).put("usageAccess",usage).put("android",android.os.Build.VERSION.RELEASE);
  JSONArray apps=new JSONArray();TreeSet<String> visible=packages(context);PackageManager pm=context.getPackageManager();
  for(String pkg:visible){
   if(apps.length()>=100||SystemClock.elapsedRealtime()>deadline)break;
   try{
    ApplicationInfo app=pm.getApplicationInfo(pkg,0);
    String label=String.valueOf(pm.getApplicationLabel(app));if(label.length()>100)label=label.substring(0,100);
    JSONObject row=new JSONObject().put("package",pkg).put("label",label).put("system",(app.flags&ApplicationInfo.FLAG_SYSTEM)!=0).put("self",pkg.equals(context.getPackageName()));
    if(usage){try{
     StorageStats stats=((StorageStatsManager)context.getSystemService(Context.STORAGE_STATS_SERVICE)).queryStatsForPackage(StorageManager.UUID_DEFAULT,pkg,android.os.Process.myUserHandle());
     // Android dataBytes already includes cache. Do not count cache twice.
     row.put("appBytes",stats.getAppBytes()).put("dataBytes",stats.getDataBytes()).put("cacheBytes",stats.getCacheBytes()).put("totalBytes",stats.getAppBytes()+stats.getDataBytes());
    }catch(Exception e){row.put("sizeUnavailable",true);}}
    apps.put(row);
   }catch(PackageManager.NameNotFoundException ignored){}
  }
  return report.put("apps",apps).put("partial",apps.length()<visible.size()).put("visibleCount",visible.size());
 }
 static String openApp(Context context,String pkg,boolean uninstall){
  if(!packages(context).contains(pkg)||pkg.equals(context.getPackageName()))return "App não disponível para esta ação";
  try{
   ApplicationInfo app=context.getPackageManager().getApplicationInfo(pkg,0);
   if(uninstall && (app.flags&ApplicationInfo.FLAG_SYSTEM)!=0)return "Não removemos apps do sistema";
   Intent intent=new Intent(uninstall?Intent.ACTION_DELETE:android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:"+pkg));
   intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);context.startActivity(intent);return null;
  }catch(Exception e){return "A TCL não disponibilizou essa tela de configurações";}
 }
}
