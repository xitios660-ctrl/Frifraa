const test=require('node:test');
const assert=require('node:assert/strict');
const {createController}=require('../bot-minds');
const tactics=require('../bots');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(){
 const players=new Map();for(let i=0;i<4;i++)players.set('p'+i,{id:'p'+i,name:i?'Bot '+i:'Mary',bot:i>0,slot:i,x:1+i,y:1,alive:true,bombs:1,range:2,speed:170,activeBombs:0});
 return{phase:'playing',players,board:Array.from({length:7},(_,y)=>Array.from({length:9},(_,x)=>!x||!y||x===8||y===6?1:0)),powerups:new Map([['6,3','bomb']]),flames:[],bombs:[],effects:[]};
}
test('each local bot has its own plan, memory and visible speech; no key means no external calls',()=>{
 const room=fixture();let calls=0;const ai=createController({apiKey:'',enabled:true,fetchImpl:()=>{calls++;}});ai.reset(room,1000);ai.tick(room,1200);
 const bots=[...room.players.values()].filter(p=>p.bot);assert.equal(new Set(bots.map(p=>p.botMind)).size,3);assert.ok(bots.every(p=>p.botSpeech?.text&&p.botSpeech.source==='local'));
 bots[0].botMind.memory.push('only-one');assert.ok(!bots[1].botMind.memory.includes('only-one'));assert.equal(calls,0);assert.equal(ai.status().provider,'local');
});
test('friendships affect blast decisions, betrayal ends them, and final allies resume the duel',()=>{
 const room=fixture(),p=room.players.get('p1'),friend=room.players.get('p0');p.x=3;p.y=3;friend.x=4;friend.y=3;
 room.board[2][3]=2;const ai=createController({enabled:false});ai.reset(room,1000);ai.friendship(room,p,friend.id,1000);
 assert.equal(p.botMind.allyId,friend.id);assert.equal(tactics.decide(room,p,1000).bomb,false,'do not deliberately bomb an ally');
 room.bombs=[{id:'betrayal',ownerId:friend.id,x:4,y:3,range:2,explodeAt:3000}];ai.tick(room,1200);
 assert.equal(p.botMind.allyId,null);assert.ok(p.botMind.relations[friend.id]<0);assert.ok(p.botSpeech.text.includes('trégua'));
 room.bombs=[];ai.friendship(room,p,friend.id,1400);for(const o of room.players.values())if(o.id!==p.id&&o.id!==friend.id)o.alive=false;
 ai.tick(room,2000);assert.equal(p.botMind.allyId,null);assert.equal(p.botMind.goal,'attack');
});
test('Grok receives separate bounded contexts for each bot and its plans change that bot only',async()=>{
 const room=fixture(),requests=[];
 const ai=createController({enabled:true,apiKey:'test-only',maxCalls:1,fetchImpl:async(url,options)=>{
  assert.equal(url,'https://api.x.ai/v1/chat/completions');const body=JSON.parse(options.body),state=JSON.parse(body.messages[1].content);requests.push(state);
  return{ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({goal:'attack',targetId:'p0',relation:'none',kind:'say',toId:'p0',message:state.you.name+', vou ganhar!'})}}]})};
 }});
 ai.reset(room,1000);room.players.get('p1').botMind.memory.push('private-bot-1');ai.tick(room,3000);await flush();
 assert.equal(requests.length,3);assert.equal(new Set(requests.map(s=>s.you.id)).size,3);
 assert.equal(requests.filter(s=>s.memory.includes('private-bot-1')).length,1);
 for(const p of room.players.values())if(p.bot){assert.equal(p.botMind.targetId,'p0');assert.equal(p.botSpeech.source,'grok');}
 ai.tick(room,99999);await flush();assert.equal(requests.length,3,'per-bot request cap');
});
test('invalid IDs and unsafe text cannot grant powers, target self or inject markup',()=>{
 const room=fixture(),ai=createController({enabled:false});ai.reset(room,1000);const p=room.players.get('p1');
 assert.ok(ai.applyPlan(room,p,{goal:'protect',targetId:p.id,relation:'friend',relationId:'absent',message:'<script> hi\nthere',kind:'say',kick:true},1100));
 assert.equal(p.botMind.targetId,null);assert.equal(p.botMind.allyId,null);assert.equal(p.kick,undefined);assert.equal(p.botMind.goal,'attack');assert.ok(!p.botSpeech.text.includes('<'));
 assert.equal(ai.applyPlan(room,p,{goal:'walk-through-bomb'},1200),false);
});
test('slow responses do not block play; errors fall back and a completed old round cannot overwrite a new mind',async()=>{
 const room=fixture();let complete;
 const ai=createController({enabled:true,apiKey:'test-only',fetchImpl:()=>new Promise(resolve=>{complete=resolve;})});
 ai.reset(room,1000);ai.tick(room,1700);const p=room.players.get('p1'),old=p.botMind;assert.ok(old.pending);assert.ok(p.botSpeech.text);
 ai.reset(room,1800);complete({ok:true,json:async()=>({choices:[{message:{content:'{"goal":"attack","message":"stale"}'}}]})});await flush();
 assert.notEqual(p.botMind,old);assert.notEqual(p.botSpeech?.text,'stale');ai.cancelRoom(room);
 const failed=createController({enabled:true,apiKey:'test-only',fetchImpl:async()=>({ok:false,status:429})});failed.reset(room,1000);failed.tick(room,3000);await flush();
 assert.equal(failed.status().state,'rate-limited');assert.ok(p.botSpeech.text);assert.equal(p.botSpeech.source,'local');
});
