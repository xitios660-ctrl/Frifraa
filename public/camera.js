(function(root){
 const clamp=(v,max)=>Math.max(0,Math.min(max,v));
 function follow(previous,target,view,world,dt){
  const maxX=Math.max(0,world.width-view.width),maxY=Math.max(0,world.height-view.height);
  if(!previous)return{x:clamp(target.x-view.width/2,maxX),y:clamp(target.y-view.height/2,maxY)};
  let x=previous.x,y=previous.y;
  const left=view.width*.38,right=view.width*.62,top=view.height*.38,bottom=view.height*.62;
  const desiredX=target.x-x<left?target.x-left:target.x-x>right?target.x-right:x;
  const desiredY=target.y-y<top?target.y-top:target.y-y>bottom?target.y-bottom:y;
  const blend=1-Math.exp(-Math.max(0,Math.min(.05,dt))*14);
  x+=(clamp(desiredX,maxX)-x)*blend;y+=(clamp(desiredY,maxY)-y)*blend;
  return{x:clamp(x,maxX),y:clamp(y,maxY)};
 }
 const api={follow};if(typeof module!=='undefined')module.exports=api;else root.BombaCamera=api;
})(typeof window!=='undefined'?window:globalThis);
