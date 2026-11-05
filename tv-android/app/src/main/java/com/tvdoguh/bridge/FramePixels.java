package com.tvdoguh.bridge;

import java.nio.ByteBuffer;

final class FramePixels {
 static ByteBuffer packedRgba(ByteBuffer input,int width,int height,int pixelStride,int rowStride){
  if(width<=0||height<=0||pixelStride!=4||rowStride<width*4)throw new IllegalArgumentException("Formato de captura não suportado");
  int rowBytes=Math.multiplyExact(width,4);
  ByteBuffer source=input.duplicate(),packed=ByteBuffer.allocate(Math.multiplyExact(rowBytes,height));
  byte[] row=new byte[rowBytes];
  for(int y=0;y<height;y++){source.position(Math.multiplyExact(y,rowStride));source.get(row);packed.put(row);}
  packed.position(0);return packed;
 }
}
