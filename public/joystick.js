/* One owner per gesture. Window listeners keep the drag alive if browser capture is lost. */
(function(root){
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 function resolve(dx,dy,axis,engaged,radius){
  const distance=Math.hypot(dx,dy),start=clamp(radius*.23,8,14),stop=clamp(radius*.14,5,9);
  if(distance<(engaged?stop:start))return{axis:null,engaged:false,direction:[0,0]};
  if(!axis)axis=Math.abs(dx)>=Math.abs(dy)?'x':'y';
  if(axis==='x'&&Math.abs(dy)>Math.abs(dx)*1.25)axis='y';
  else if(axis==='y'&&Math.abs(dx)>Math.abs(dy)*1.25)axis='x';
  return{axis,engaged:true,direction:axis==='x'?[Math.sign(dx),0]:[0,Math.sign(dy)]};
 }
 function create(element,knob,onChange,options={}){
  const win=options.window||root;
  let active=null,axis=null,engaged=false,last=[0,0],origin=null,point=null;
  const subscriptions=[];
  function listen(target,type,fn,opts){target.addEventListener(type,fn,opts);subscriptions.push(()=>target.removeEventListener(type,fn,opts));}
  function emit(direction){if(direction[0]===last[0]&&direction[1]===last[1])return;last=direction;onChange(direction);}
  function render(){
   if(!active||!point)return;
   const rect=element.getBoundingClientRect(),size=knob.getBoundingClientRect();
   const dx=point.x-origin.x,dy=point.y-origin.y,distance=Math.hypot(dx,dy);
   const travel=Math.max(8,(Math.min(rect.width,rect.height)-Math.max(size.width,size.height))/2-3);
   const scale=distance?Math.min(travel,distance)/distance:0;
   knob.style.transform=`translate(${dx*scale}px, ${dy*scale}px)`;
   const next=resolve(dx,dy,axis,engaged,Math.min(rect.width,rect.height)/2);
   axis=next.axis;engaged=next.engaged;emit(next.direction);
  }
  function reset(){
   const prior=active;active=null;axis=null;engaged=false;origin=null;point=null;
   if(prior){try{if(element.hasPointerCapture(prior.id))element.releasePointerCapture(prior.id);}catch{}}
   element.classList.remove('active');knob.style.transform='translate(0,0)';emit([0,0]);
  }
  function down(event){
   if(active||options.enabled&&!options.enabled())return;
   if(event.pointerType==='mouse'&&event.button!==0)return;
   if(event.cancelable)event.preventDefault();
   const rect=element.getBoundingClientRect();origin={x:rect.left+rect.width/2,y:rect.top+rect.height/2};
   active={id:event.pointerId,type:event.pointerType};point={x:event.clientX,y:event.clientY};
   axis=null;engaged=false;element.classList.add('active');
   try{element.setPointerCapture(event.pointerId);}catch{/* Window tracking remains active. */}
   render();
  }
  function move(event){
   if(!active||event.pointerId!==active.id)return;
   if(event.pointerType==='mouse'&&event.buttons===0){reset();return;}
   if(event.cancelable)event.preventDefault();
   point={x:event.clientX,y:event.clientY};render();
  }
  function end(event){if(active&&event.pointerId===active.id)reset();}
  listen(element,'pointerdown',down,{passive:false});
  listen(win,'pointermove',move,{capture:true,passive:false});
  listen(win,'pointerup',end,true);listen(win,'pointercancel',end,true);
  // lostpointercapture alone does not mean the finger was released, especially on iOS.
  listen(win,'blur',reset);listen(win,'pagehide',reset);listen(win,'orientationchange',reset);
  if(win.document)listen(win.document,'visibilitychange',()=>{if(win.document.hidden)reset();});
  listen(win,'resize',render);
  listen(element,'contextmenu',event=>{if(event.cancelable)event.preventDefault();});
  return{reset,destroy(){reset();for(const remove of subscriptions)remove();}};
 }
 const api={resolve,create};if(typeof module!=='undefined')module.exports=api;else root.BombaJoystick=api;
})(typeof window!=='undefined'?window:globalThis);
