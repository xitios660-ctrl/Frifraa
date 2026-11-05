package com.tvdoguh.bridge;

import android.app.*;
import android.content.*;
import android.graphics.*;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.Image;
import android.media.ImageReader;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.*;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import java.io.ByteArrayOutputStream;

/** User-authorized projection. Only explicitly requested still images leave the TV. */
public class ProjectionService extends Service {
 private static volatile ProjectionService instance;
 private final Object lock=new Object();
 private MediaProjection projection;
 private VirtualDisplay display;
 private ImageReader reader;
 private Image latest;
 private HandlerThread frames;
 private final Handler main=new Handler(Looper.getMainLooper());
 private long until;
 private final Runnable expiry=()->stopSelf();
 public static boolean available(){ProjectionService s=instance;return s!=null && SystemClock.elapsedRealtime()<s.until && s.projection!=null;}
 public static String capture()throws Exception{
  ProjectionService s=instance;if(s==null||!available())throw new IllegalStateException("Autorize Compartilhar tela Android 9 na TV");
  Bitmap bitmap=null;
  try{
   synchronized(s.lock){
    if(!available()||s.latest==null)throw new IllegalStateException("Ainda não há imagem da TV. Aguarde e tente novamente.");
    Image image=s.latest;Image.Plane plane=image.getPlanes()[0];
    java.nio.ByteBuffer packed=FramePixels.packedRgba(plane.getBuffer(),image.getWidth(),image.getHeight(),plane.getPixelStride(),plane.getRowStride());
    bitmap=Bitmap.createBitmap(image.getWidth(),image.getHeight(),Bitmap.Config.ARGB_8888);bitmap.copyPixelsFromBuffer(packed);
   }
   ByteArrayOutputStream out=new ByteArrayOutputStream();bitmap.compress(Bitmap.CompressFormat.JPEG,55,out);
   if(out.size()>220000)throw new IllegalStateException("Captura muito grande");
   return android.util.Base64.encodeToString(out.toByteArray(),android.util.Base64.NO_WRAP);
  }finally{if(bitmap!=null)bitmap.recycle();}
 }
 @Override public void onCreate(){super.onCreate();}
 @Override public int onStartCommand(Intent intent,int flags,int id){
  if(intent==null||"STOP".equals(intent.getAction())){stopSelf();return START_NOT_STICKY;}
  if(projection!=null)return START_NOT_STICKY;
  NotificationManager notifications=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
  notifications.createNotificationChannel(new NotificationChannel("screen","Compartilhamento de tela",NotificationManager.IMPORTANCE_LOW));
  Intent stop=new Intent(this,ProjectionService.class).setAction("STOP");
  PendingIntent pending=PendingIntent.getService(this,0,stop,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
  Notification notification=new Notification.Builder(this,"screen").setSmallIcon(android.R.drawable.ic_menu_camera).setContentTitle("TV DO GUH AI: tela compartilhada").setContentText("Capturas autorizadas por até 10 minutos. Toque para parar.").setContentIntent(pending).addAction(new Notification.Action.Builder(null,"Parar",pending).build()).setOngoing(true).build();
  try{
   if(Build.VERSION.SDK_INT>=29)startForeground(13,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);else startForeground(13,notification);
   Intent consent=intent.getParcelableExtra("consent");
   if(consent==null||intent.getIntExtra("result",Activity.RESULT_CANCELED)!=Activity.RESULT_OK)throw new IllegalStateException();
   MediaProjectionManager manager=(MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE);
   projection=manager.getMediaProjection(Activity.RESULT_OK,consent);
   projection.registerCallback(new MediaProjection.Callback(){@Override public void onStop(){stopSelf();}},main);
   DisplayMetrics metrics=new DisplayMetrics();((WindowManager)getSystemService(WINDOW_SERVICE)).getDefaultDisplay().getRealMetrics(metrics);
   int width=Math.min(960,metrics.widthPixels),height=Math.max(1,metrics.heightPixels*width/Math.max(1,metrics.widthPixels));
   frames=new HandlerThread("tv-screen-frames");frames.start();
   reader=ImageReader.newInstance(width,height,PixelFormat.RGBA_8888,3);
   reader.setOnImageAvailableListener(source->{synchronized(lock){try{Image fresh=source.acquireLatestImage();if(fresh!=null){if(latest!=null)latest.close();latest=fresh;}}catch(IllegalStateException ignored){}}},new Handler(frames.getLooper()));
   display=projection.createVirtualDisplay("TV DO GUH capture",width,height,metrics.densityDpi,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,reader.getSurface(),null,main);
   until=SystemClock.elapsedRealtime()+600000;instance=this;
   getSharedPreferences("bridge",MODE_PRIVATE).edit().putLong("visualUntil",System.currentTimeMillis()+600000).putString("projectionStatus","Compartilhamento Android autorizado. Solicite uma captura no iPhone.").apply();
   main.postDelayed(expiry,600000);
  }catch(Exception e){getSharedPreferences("bridge",MODE_PRIVATE).edit().putString("projectionStatus","A TCL recusou iniciar compartilhamento ("+e.getClass().getSimpleName()+").").apply();stopSelf();}
  return START_NOT_STICKY;
 }
 @Override public void onDestroy(){
  if(instance==this)instance=null;main.removeCallbacks(expiry);
  if(display!=null)display.release();
  synchronized(lock){if(latest!=null){latest.close();latest=null;}if(reader!=null){reader.close();reader=null;}}
  if(projection!=null){projection.stop();projection=null;}if(frames!=null)frames.quitSafely();
  getSharedPreferences("bridge",MODE_PRIVATE).edit().putLong("visualUntil",0).apply();stopForeground(true);super.onDestroy();
 }
 @Override public IBinder onBind(Intent intent){return null;}
}
