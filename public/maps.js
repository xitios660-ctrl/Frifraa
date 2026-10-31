(function(root){
 const WIDTH=31,HEIGHT=21;
 const SPAWNS=[{x:1,y:1},{x:WIDTH-2,y:1},{x:1,y:HEIGHT-2},{x:WIDTH-2,y:HEIGHT-2}];
 const DEFS={
  classic:{name:'Arena Clássica',density:.50,floor:['#26203d','#2c2444'],wall:'#544579',light:'#8473ab',dark:'#382e58',crate:'#cf7b70',trim:'#a95c67'},
  jungle:{name:'Ruínas da Selva',density:.42,floor:['#183a32','#20453a'],wall:'#547562',light:'#9dc28a',dark:'#294b3d',crate:'#bb925b',trim:'#7c633c'},
  ice:{name:'Palácio de Gelo',density:.34,floor:['#203f59','#284c65'],wall:'#73a7bd',light:'#d1f8ff',dark:'#3d718f',crate:'#9b99c4',trim:'#666b98'},
  factory:{name:'Fábrica Neon',density:.38,floor:['#242a3c','#2d3449'],wall:'#56657d',light:'#77e0cf',dark:'#303d55',crate:'#dbab56',trim:'#8b683a'}
 };
 function create(id='classic',random=Math.random){
  const def=DEFS[id]||DEFS.classic;
  const board=Array.from({length:HEIGHT},(_,y)=>Array.from({length:WIDTH},(_,x)=>{
   const border=!x||!y||x===WIDTH-1||y===HEIGHT-1;
   const wall=id==='jungle'?([2,3].includes(x%6)&&[2,3].includes(y%6)):
    id==='ice'?(x%6===3&&y%4===2):id==='factory'?((x%6===0&&y%6!==3)||(y%6===0&&x%6!==3)):(x%2===0&&y%2===0);
   return border||wall?1:random()<def.density?2:0;
  }));
  for(const {x,y} of SPAWNS)for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]])for(let step=0;step<=3;step++){
   const nx=x+dx*step,ny=y+dy*step;
   if(board[ny]?.[nx]!==undefined&&board[ny][nx]!==1)board[ny][nx]=0;
  }
  return board;
 }
 const api={WIDTH,HEIGHT,SPAWNS,DEFS,create};
 if(typeof module!=='undefined')module.exports=api;else root.BombaMaps=api;
})(typeof window!=='undefined'?window:globalThis);
