const test=require('node:test');
const assert=require('node:assert/strict');
const maps=require('../public/maps');
const camera=require('../public/camera');
test('all four larger maps have safe spawns, closed borders and connected navigable layouts',()=>{
 const layouts=new Set();
 for(const id of Object.keys(maps.DEFS)){
  const board=maps.create(id,()=>.99);
  assert.equal(board.length,21);assert.equal(board[0].length,31);
  assert.ok(board[0].every(c=>c===1)&&board.at(-1).every(c=>c===1));
  assert.ok(board.every(row=>row[0]===1&&row.at(-1)===1));
  for(const p of maps.SPAWNS)assert.equal(board[p.y][p.x],0);
  const visited=new Set(['1,1']),queue=[{x:1,y:1}];
  for(let i=0;i<queue.length;i++)for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const x=queue[i].x+dx,y=queue[i].y+dy,k=`${x},${y}`;
   if(board[y]?.[x]===0&&!visited.has(k)){visited.add(k);queue.push({x,y});}
  }
  assert.equal(visited.size,board.flat().filter(c=>c===0).length,`${id} has an isolated area`);
  layouts.add(JSON.stringify(board));
 }
 assert.equal(layouts.size,4);
});
test('camera follows across the larger map, stays inside its edges and leaves the centre quiet',()=>{
 const view={width:720,height:624},world={width:31*48,height:21*48};
 let c=camera.follow(null,{x:72,y:72},view,world,1/60);assert.deepEqual(c,{x:0,y:0});
 for(let i=0;i<200;i++)c=camera.follow(c,{x:1000,y:700},view,world,1/60);
 assert.ok(c.x>400&&c.y>200);assert.ok(c.x<=world.width-view.width&&c.y<=world.height-view.height);
 const stable=camera.follow(c,{x:c.x+360,y:c.y+312},view,world,1/60);assert.deepEqual(stable,c);
 for(let i=0;i<200;i++)c=camera.follow(c,{x:world.width,y:world.height},view,world,1/60);
 assert.ok(Math.abs(c.x-(world.width-view.width))<.01);
 assert.ok(Math.abs(c.y-(world.height-view.height))<.01);
});
