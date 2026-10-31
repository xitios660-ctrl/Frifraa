const test=require('node:test');
const assert=require('node:assert/strict');
const physics=require('../public/physics');
const net=require('../public/netcode');
const bots=require('../bots');
const {createController}=require('../bot-minds');
const board=()=>Array.from({length:9},(_,y)=>Array.from({length:11},(_,x)=>!x||!y||x===10||y===8?1:0));
const player=(id,x,y)=>({id,x,y,alive:true,speed:170,range:2,bombs:1,activeBombs:10,kills:0});
function separate(players){for(let i=0;i<players.length;i++)for(let j=i+1;j<players.length;j++)if(players[i].alive&&players[j].alive){assert.equal(physics.overlaps(players[i],players[j]),false,`overlap: ${players[i].id}/${players[j].id}`);assert.notEqual(`${Math.round(players[i].x)},${Math.round(players[i].y)}`,`${Math.round(players[j].x)},${Math.round(players[j].y)}`);}}
test('head-on movement, crossing paths and a contested destination cannot stack living players',()=>{
 for(const positions of [[[1,3],[5,3]],[[1,3],[3,1]],[[1,3],[3,3]]]){
  const players=positions.map(([x,y],i)=>player('p'+i,x,y)),map=board();
  for(let frame=0;frame<180;frame++){
   physics.move(players[0],{x:1,y:0},1/60,map,[],undefined,players);
   physics.move(players[1],positions[1][1]===1?{x:0,y:1}:{x:-1,y:0},1/60,map,[],undefined,players);separate(players);
  }
 }
});
test('a walking player reserves its next house and an eliminated player releases it',()=>{
 const map=board(),a=player('a',1,3),b=player('b',2,1),players=[a,b];
 physics.move(a,{x:1,y:0},1/60,map,[],undefined,players);assert.deepEqual(a.moveTarget,{x:2,y:3});
 assert.equal(physics.canOccupy(b,2,3,map,[],players),false);a.alive=false;assert.equal(physics.canOccupy(b,2,3,map,[],players),true);
});
test('random movement of four people never overlaps bodies or enters walls over 20,000 inputs',()=>{
 const map=board(),players=[player('a',1,1),player('b',9,1),player('c',1,7),player('d',9,7)];
 let seed=12345;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const dirs=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1},{x:0,y:0}];
 for(let i=0;i<20000;i++){const p=players[i%4];physics.move(p,dirs[random()%5],1/60,map,[],undefined,players);separate(players);assert.ok(physics.canOccupy(p,p.x,p.y,map,[],players));}
});
test('client prediction and acknowledgement replay respect the same occupied house as the server',()=>{
 const map=board(),server={...player('a',1,3),ack:0},other=player('b',5,3),model=net.create(server,map,[],[server,other]);
 const packets=[];
 for(let frame=0;frame<180;frame++){
  net.advance(model,{x:1,y:0});packets.push({at:frame+12,command:model.outbound.shift()});
  while(packets[0]?.at<=frame){const {command}=packets.shift();physics.move(server,command,net.STEP,map,[],undefined,[server,other]);server.ack=command.seq;}
  if(frame%3===0)net.acknowledge(model,server,map,[],[server,other]);
  assert.ok(model.player.x<=4);assert.equal(physics.overlaps(model.player,other),false);
 }
 assert.equal(server.x,4);assert.equal(model.player.x,4);
});
test('bots route around an occupied corridor and obey an AI destination and bomb policy',()=>{
 const map=board(),p=player('a',1,3),human=player('b',3,3),r={board:map,players:new Map([[p.id,p],[human.id,human]]),bombs:[],flames:[],powerups:new Map()};
 p.bot=true;p.botMind={goal:'collect',destination:{x:6,y:3},directiveUntil:100000,bombMode:'hold'};
 const path=bots.route(r,p,1000);assert.deepEqual(path.at(-1),{x:6,y:3});assert.ok(path.some(c=>c.y!==3));assert.ok(path.every(c=>!physics.playerBlocked(p,c.x,c.y,[human])));
 let reached=false;for(let i=0;i<360;i++){bots.update(r,p,1000+i*1000/60,1/60,()=>assert.fail('AI hold must prevent bomb placement'));separate([p,human]);if(p.x===6&&p.y===3)reached=true;}
 assert.ok(reached,'bot must reach the AI-selected destination');assert.notEqual(p.x,human.x);
});
test('a bot with no useful bomb placement leaves an idle square when a safe route exists',()=>{
 const map=board(),p=player('a',2,3),human=player('b',6,3),r={board:map,players:new Map([[p.id,p],[human.id,human]]),bombs:[],flames:[],powerups:new Map()};
 map[3][1]=2;map[2][2]=2;map[4][2]=2;p.bot=true;p.botMind={goal:'break'};
 const positions=new Set();for(let i=0;i<300;i++){bots.update(r,p,1000+i*1000/60,1/60,()=>{});positions.add(`${Math.round(p.x)},${Math.round(p.y)}`);separate([p,human]);}
 assert.ok(positions.size>=3,`bot remained idle: ${[...positions]}`);
});
test('remote instructions cannot select a wall, a person or a reserved destination',()=>{
 const map=board(),p=player('a',1,1),q=player('b',5,3);q.moveTarget={x:5,y:4};p.bot=true;p.slot=1;
 const r={phase:'playing',board:map,players:new Map([[p.id,p],[q.id,q]]),bombs:[],flames:[],powerups:new Map()},ai=createController({provider:'gemini',enabled:false});ai.reset(r,1000);
 for(const destination of [{x:0,y:0},{x:5,y:3},{x:5,y:4},{x:2.2,y:2}]){ai.applyPlan(r,p,{goal:'attack',destination,bombMode:'hold'},1100);assert.equal(p.botMind.destination,null);}
 ai.applyPlan(r,p,{goal:'attack',destination:{x:7,y:5},bombMode:'attack'},1200);assert.deepEqual(p.botMind.destination,{x:7,y:5});assert.equal(p.botMind.bombMode,'attack');assert.equal(p.botMind.planSource,'gemini');
});
test('four autonomous bots cannot pile up even when all AI plans select the same destination',()=>{
 const map=board(),players=[player('a',1,1),player('b',9,1),player('c',1,7),player('d',9,7)];
 for(const p of players){p.bot=true;p.botMind={goal:'collect',destination:{x:5,y:4},directiveUntil:100000,bombMode:'hold'};}
 const r={board:map,players:new Map(players.map(p=>[p.id,p])),bombs:[],flames:[],powerups:new Map()};
 const visited=players.map(()=>new Set());
 for(let frame=0;frame<800;frame++)for(let i=0;i<4;i++){bots.update(r,players[i],1000+frame*1000/60,1/60,()=>{});visited[i].add(`${Math.round(players[i].x)},${Math.round(players[i].y)}`);separate(players);}
 for(const cells of visited)assert.ok(cells.size>3,'each bot should make progress');
});
test('AI bomb policy actually controls whether the bot places a useful bomb',()=>{
 const map=board(),p=player('a',3,3),q=player('b',7,3),r={board:map,players:new Map([[p.id,p],[q.id,q]]),bombs:[],flames:[],powerups:new Map()};
 p.activeBombs=0;p.botMind={goal:'attack',bombMode:'hold',directiveUntil:10000};map[2][3]=2;
 assert.equal(bots.decide(r,p,1000).bomb,false);
 p.botMind.bombMode='break';assert.equal(bots.decide(r,p,1000).bomb,true);
 p.botMind.bombMode='attack';assert.equal(bots.decide(r,p,1000).bomb,false);
 q.x=5;assert.equal(bots.decide(r,p,1000).bomb,true);
});
