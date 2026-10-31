const test = require('node:test');
const assert = require('node:assert/strict');
const { advance, drawAtlas } = require('../public/animation');

test('walking follows distance and settles when blocked, even with held input', () => {
  let pose = advance(null,{x:1,y:1,facing:'right'},1/60);
  for(let i=1;i<=60;i++) pose=advance(pose,{x:1+i/60,y:1,facing:'right'},1/60);
  const phase=pose.phase;
  assert.ok(pose.weight>.95);
  for(let i=0;i<60;i++) pose=advance(pose,{x:2,y:1,facing:'up'},1/60);
  assert.equal(pose.phase,phase);
  assert.equal(pose.weight,0);
  assert.equal(pose.frame,1);
  assert.equal(pose.facing,'up');
});
test('walking cadence depends on distance rather than display refresh rate', () => {
  function walk(hz) {
    let pose=advance(null,{x:0,y:0,facing:'left'},1/hz);
    for(let i=1;i<=hz;i++) pose=advance(pose,{x:i/hz,y:0,facing:'left'},1/hz);
    return pose;
  }
  assert.ok(Math.abs(walk(60).phase-walk(120).phase)<1e-10);
});
test('four directions select different atlas rows; missing artwork has a fallback', () => {
  const calls=[],ctx={save(){},restore(){},translate(){},scale(){},drawImage:(...args)=>calls.push(args)};
  const atlas={complete:true,naturalWidth:1024,naturalHeight:1024};
  for(const facing of ['down','left','right','up']) {
    assert.ok(drawAtlas(ctx,atlas,0,{frame:2,facing},0,0));
  }
  assert.deepEqual(calls.map(args=>args[2]),[0,256,512,768]);
  assert.ok(calls.every(args=>args[1]===512 && args[3]===256 && args[4]===256));
  assert.equal(drawAtlas(ctx,{complete:false},0,{frame:1,facing:'down'},0,0),false);
});
