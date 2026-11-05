package com.tvdoguh.bridge;

import org.junit.Test;
import java.nio.ByteBuffer;
import static org.junit.Assert.*;

public class FramePixelsTest {
 @Test public void removesRowPaddingWithoutReadingMissingLastRowPadding(){
  byte[] source=new byte[20];for(int i=0;i<source.length;i++)source[i]=(byte)i;
  ByteBuffer input=ByteBuffer.wrap(source);input.position(3);
  ByteBuffer packed=FramePixels.packedRgba(input,2,2,4,12);
  byte[] actual=new byte[16];packed.get(actual);
  assertArrayEquals(new byte[]{0,1,2,3,4,5,6,7,12,13,14,15,16,17,18,19},actual);
  assertEquals(3,input.position());
 }
 @Test(expected=IllegalArgumentException.class) public void rejectsUnsupportedPixelLayout(){FramePixels.packedRgba(ByteBuffer.allocate(16),2,2,2,8);}
 @Test(expected=java.nio.BufferUnderflowException.class) public void rejectsTruncatedFrame(){FramePixels.packedRgba(ByteBuffer.allocate(19),2,2,4,12);}
}
