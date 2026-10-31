const test=require('node:test');
const assert=require('node:assert/strict');
const effects=require('../public/effects');
test('bomb animation uses shared placement/fuse time, with a bounded pulse',()=>{
 const bomb={placedAt:1000,explodeAt:3250};
 assert.equal(effects.bombFrame(bomb,1000).scale,0);
 assert.equal(effects.bombFrame(bomb,2000).remaining,1250);
 assert.ok(effects.bombFrame(bomb,3100).urgency>.9);
 for(let t=1100;t<3400;t+=16) {
  const frame=effects.bombFrame(bomb,t);
  assert.ok(frame.scale>.9 && frame.scale<1.05);
  assert.ok(frame.remaining>=0);
 }
});
test('destruction effects and flames expire instead of repeating after the round',()=>{
 const effect={startedAt:1000,expiresAt:1650};
 assert.equal(effects.progress(effect,900),0);
 assert.equal(effects.progress(effect,1325),.5);
 assert.equal(effects.progress(effect,1800),1);
 const ctx=new Proxy({},{get(){throw new Error('expired effect must not draw')}});
 effects.flame(ctx,{startedAt:1000,expiresAt:1500},1501,new Set());
 effects.debris(ctx,{...effect,kind:'crate'},1651);
});
