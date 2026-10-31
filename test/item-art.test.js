const test=require('node:test');
const assert=require('node:assert/strict');
const art=require('../public/items');
test('nine reference skins each have their own effect',()=>{
 assert.equal(Object.keys(art.SKINS).length,9);assert.equal(Object.keys(art.DEFS).length,9);
 const selected=new Set();for(const type of Object.keys(art.DEFS))for(let x=0;x<2;x++)selected.add(art.selectSkin(type,x,0));
 assert.equal(selected.size,9);for(const skin of selected)assert.ok(art.SKINS[skin]);
 assert.equal(art.selectSkin('push',2,3,1),art.selectSkin('push',2,3,1));
 assert.equal(art.selectSkin('curse',2,2,1),'skull');assert.equal(art.selectSkin('kick',2,3,1),'glove');
});
test('all nine animations are deterministic, change over time and keep their volume bounded',()=>{
 for(const skin of Object.keys(art.SKINS)){
  const a=art.frame({x:1,y:3,skin},1000);assert.deepEqual(a,art.frame({x:1,y:3,skin},1000));
  assert.notDeepEqual(a,art.frame({x:1,y:3,skin},1433));
  for(let time=0;time<20000;time+=31){const f=art.frame({x:1,y:3,skin},time);assert.ok(f.sx>=.9&&f.sx<=1.1);assert.ok(f.sy>=.95&&f.sy<=1.1);assert.ok(Math.abs(f.bob)<=3.5);assert.ok(f.light>=0&&f.light<16);}
 }
 assert.notEqual(art.frame({skin:'glove'},1477).sx,art.frame({skin:'heart'},1477).sx);
});
