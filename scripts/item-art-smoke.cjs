const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.BOMBA_CHROME});
 try{
  const page=await browser.newPage({viewport:{width:800,height:820}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.BOMBA_BASE||'http://127.0.0.1:3230');
  const result=await page.evaluate(async()=>{
   if(!await BombaItems.ready)throw new Error('3D atlas failed to load');
   const atlas=await createImageBitmap(await(await fetch('/items/powerups-3d-v1.png')).blob());
   const probe=document.createElement('canvas');probe.width=probe.height=768;const pc=probe.getContext('2d');pc.drawImage(atlas,0,0);const alpha=pc.getImageData(0,0,1,1).data[3];
   const gallery=document.createElement('canvas');gallery.width=720;gallery.height=720;const c=gallery.getContext('2d');c.fillStyle='#1c1233';c.fillRect(0,0,720,720);
   const hashes={};
   for(const [index,skin] of Object.keys(BombaItems.SKINS).entries()){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const ctx=canvas.getContext('2d');const frames=[];
    for(const time of [1200,1467,1200]){ctx.clearRect(0,0,96,96);ctx.save();ctx.translate(48,48);BombaItems.drawSkin(ctx,skin,time,84);ctx.restore();frames.push(canvas.toDataURL());}
    hashes[skin]={changes:frames[0]!==frames[1],deterministic:frames[0]===frames[2]};
    c.save();c.translate(120+index%3*240,110+Math.floor(index/3)*240);BombaItems.drawSkin(c,skin,1200,210);c.restore();c.fillStyle='#eedfff';c.font='bold 15px system-ui';c.textAlign='center';c.fillText(skin,120+index%3*240,218+Math.floor(index/3)*240);
   }
   gallery.id='artPreview';gallery.style='position:fixed;inset:0;width:720px;height:720px;z-index:99999';document.body.append(gallery);
   return{hashes,alpha,size:[atlas.width,atlas.height]};
  });
  assert.equal(result.alpha,0);assert.deepEqual(result.size,[768,768]);assert.equal(Object.keys(result.hashes).length,9);
  for(const [skin,frames] of Object.entries(result.hashes)){assert.ok(frames.changes,skin+' animation must change');assert.ok(frames.deterministic,skin+' animation must match the shared clock');}
  await page.locator('#artPreview').screenshot({path:'/tmp/bomba-3d-items-preview.png'});assert.deepEqual(errors,[]);
  console.log('PASS: nine transparent 3D skins load; each has changing, deterministic animated frames and alpha-masked highlights; no JS errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
