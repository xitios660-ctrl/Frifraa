const test=require('node:test');
const assert=require('node:assert/strict');
const joystick=require('../public/joystick');
function event(target,type,props={}){const e=new Event(type,{cancelable:true});Object.assign(e,props);target.dispatchEvent(e);}
function fixture(failCapture=false){
 const win=new EventTarget();win.document=new EventTarget();win.document.hidden=false;
 const pad=new EventTarget(),knob={style:{},getBoundingClientRect:()=>({width:46,height:46})},classes=new Set();
 pad.classList={add:name=>classes.add(name),remove:name=>classes.delete(name)};
 pad.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});
 pad.setPointerCapture=()=>{if(failCapture)throw new Error('capture unavailable');};pad.hasPointerCapture=()=>false;
 const changes=[];const controller=joystick.create(pad,knob,d=>changes.push(d),{window:win});
 const down=(id=1,x=85,y=50)=>event(pad,'pointerdown',{pointerId:id,pointerType:'touch',clientX:x,clientY:y,button:0});
 const move=(id,x,y,type='touch',buttons=1)=>event(win,'pointermove',{pointerId:id,pointerType:type,clientX:x,clientY:y,buttons});
 return{win,pad,knob,changes,controller,classes,down,move};
}
test('joystick keeps control after capture loss and releases outside the pad',()=>{
 const f=fixture();f.down();assert.deepEqual(f.changes.at(-1),[1,0]);
 event(f.pad,'lostpointercapture',{pointerId:1});assert.deepEqual(f.changes.at(-1),[1,0]);
 f.move(1,-100,50);assert.deepEqual(f.changes.at(-1),[-1,0]);
 event(f.win,'pointerup',{pointerId:1});assert.deepEqual(f.changes.at(-1),[0,0]);
 assert.equal(f.knob.style.transform,'translate(0,0)');assert.equal(f.classes.has('active'),false);
 f.controller.destroy();
});
test('bomb finger and unrelated pointer releases cannot steal the movement finger',()=>{
 const f=fixture();f.down(10);f.down(20,50,15);
 event(f.win,'pointerup',{pointerId:20});assert.deepEqual(f.changes.at(-1),[1,0]);
 f.move(20,50,15);assert.deepEqual(f.changes.at(-1),[1,0]);
 f.move(10,50,10);assert.deepEqual(f.changes.at(-1),[0,-1]);
 event(f.win,'pointercancel',{pointerId:10});assert.deepEqual(f.changes.at(-1),[0,0]);
 f.down(21);assert.deepEqual(f.changes.at(-1),[1,0]);f.controller.destroy();
});
test('failed pointer capture and Safari touch moves with buttons=0 still work',()=>{
 const f=fixture(true);f.down(4);f.move(4,50,90,'touch',0);
 assert.deepEqual(f.changes.at(-1),[0,1]);event(f.win,'pointerup',{pointerId:4});
 assert.deepEqual(f.changes.at(-1),[0,0]);f.controller.destroy();
});
test('focus, visibility, orientation and page exit release the gesture and accept a new one',()=>{
 const f=fixture();
 for(const type of ['blur','orientationchange','pagehide']){f.down();event(f.win,type);assert.deepEqual(f.changes.at(-1),[0,0]);}
 f.down();f.win.document.hidden=true;event(f.win.document,'visibilitychange');assert.deepEqual(f.changes.at(-1),[0,0]);
 f.win.document.hidden=false;f.down();f.move(1,50,15);assert.deepEqual(f.changes.at(-1),[0,-1]);f.controller.destroy();
});
test('neutral zone and diagonal hysteresis do not chatter, while deliberate turns and reversals respond',()=>{
 let state=joystick.resolve(25,24,null,false,50);assert.deepEqual(state.direction,[1,0]);
 for(let i=0;i<100;i++){state=joystick.resolve(24,25,state.axis,state.engaged,50);assert.deepEqual(state.direction,[1,0]);}
 state=joystick.resolve(3,35,state.axis,state.engaged,50);assert.deepEqual(state.direction,[0,1]);
 state=joystick.resolve(0,-35,state.axis,state.engaged,50);assert.deepEqual(state.direction,[0,-1]);
 state=joystick.resolve(0,8,state.axis,state.engaged,50);assert.equal(state.engaged,true);
 state=joystick.resolve(0,5,state.axis,state.engaged,50);assert.equal(state.engaged,false);
 state=joystick.resolve(0,8,state.axis,state.engaged,50);assert.equal(state.engaged,false);
});
test('knob stays inside its base and browser resize does not change the gesture direction',()=>{
 const f=fixture();f.down();f.move(1,1000,50);
 const x=Number(f.knob.style.transform.match(/translate\(([^p]+)/)[1]);assert.ok(x<=24);
 f.pad.getBoundingClientRect=()=>({left:200,top:50,width:100,height:100});event(f.win,'resize');
 assert.deepEqual(f.changes.at(-1),[1,0]);f.controller.destroy();
});
