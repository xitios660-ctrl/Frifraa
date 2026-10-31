const test=require('node:test');
const assert=require('node:assert/strict');
const {buildRequest,parseResponse,createBudget}=require('../bot-providers');
const {createController}=require('../bot-minds');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function room(){const players=new Map();for(let i=0;i<4;i++)players.set('p'+i,{id:'p'+i,name:i?'Bot '+i:'Mary',bot:i>0,slot:i,x:i+1,y:1,alive:true,bombs:1,range:2,speed:170});return{phase:'playing',players,board:[[1,1,1,1,1,1],[1,0,0,0,0,1],[1,1,1,1,1,1]],bombs:[],flames:[],powerups:new Map()};}
const plan=id=>({goal:'attack',targetId:'p0',relation:'none',relationId:null,kind:'say',toId:'p0',message:id+', vou ganhar!'});
test('Gemini keeps the credential in a server-side header, uses JSON schema and ignores thought parts',()=>{
 const spec=buildRequest('gemini','test-secret','gemini-3.1-flash-lite',{you:{id:'p1'}});
 assert.ok(spec.url.endsWith('gemini-3.1-flash-lite:generateContent'));assert.equal(spec.headers['x-goog-api-key'],'test-secret');assert.ok(!spec.url.includes('test-secret'));assert.ok(!JSON.stringify(spec.body).includes('test-secret'));assert.equal(spec.body.generationConfig.responseMimeType,'application/json');
 assert.equal(spec.body.generationConfig.responseJsonSchema.additionalProperties,false);
 const value=plan('p1');assert.deepEqual(parseResponse('gemini',{candidates:[{content:{parts:[{thought:true,text:'private reasoning'},{text:JSON.stringify(value)}]}}]}),value);
 assert.throws(()=>parseResponse('gemini',{candidates:[]}));
});
test('shared budgets cap minute/day usage across bots, room resets and UTC day rollover',()=>{
 const b=createBudget({perMinute:3,perDay:4}),t=Date.UTC(2026,9,31,10);
 for(let i=0;i<3;i++)assert.equal(b.take(t+i),null);assert.equal(b.take(t+30000),'minute-limit');assert.equal(b.take(t+60003),null);assert.equal(b.take(t+120000),'daily-limit');assert.equal(b.status().requestsToday,4);
 assert.equal(b.take(t+86400000),null);assert.equal(b.status().requestsToday,1);
});
test('three Gemini bots send independent memories and apply their own successful replies',async()=>{
 const r=room(),requests=[];const ai=createController({provider:'gemini',apiKey:'test-secret',fetchImpl:async(url,options)=>{
  const body=JSON.parse(options.body),context=JSON.parse(body.contents[0].parts[0].text);requests.push(context);
  return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(plan(context.you.id))}]}}]})};
 }});
 ai.reset(r,1000);r.players.get('p1').botMind.memory.push('only-bot-one');ai.tick(r,3000);await flush();
 assert.equal(requests.length,3);assert.equal(new Set(requests.map(p=>p.you.id)).size,3);assert.equal(requests.filter(p=>p.memory.includes('only-bot-one')).length,1);
 for(const p of r.players.values())if(p.bot){assert.equal(p.botSpeech.source,'gemini');assert.equal(p.botMind.targetId,'p0');assert.ok(p.botSpeech.text.includes(p.id));}
 assert.equal(ai.status().successfulReplies,3);assert.equal(ai.status().outcomes.httpErrors,0);assert.equal(ai.status().provider,'gemini');assert.equal(ai.status().model,'gemini-3.1-flash-lite');assert.equal(ai.status().requestsToday,3);
});
test('a new round does not reset the shared API allowance, and exhausted allowance leaves local play running',async()=>{
 const r=room();let requests=0;const ai=createController({provider:'gemini',apiKey:'test-secret',fetchImpl:async()=>{requests++;return{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(plan('p1'))}]}}]})};}});
 ai.reset(r,1000);ai.tick(r,3000);await flush();assert.equal(requests,3);
 ai.reset(r,4000);ai.tick(r,6000);await flush();ai.tick(r,8000);await flush();assert.equal(requests,4);assert.equal(ai.status().state,'minute-limit');assert.ok([...r.players.values()].filter(p=>p.bot).every(p=>p.botSpeech?.text));
});
test('Gemini quota errors keep the local controller active without trying another provider or paid model',async()=>{
 const r=room();const requests=[];const ai=createController({provider:'gemini',apiKey:'test-secret',fetchImpl:async url=>{requests.push(url);return{ok:false,status:429};}});
 ai.reset(r,1000);ai.tick(r,3000);await flush();assert.equal(ai.status().state,'rate-limited');assert.equal(ai.status().successfulReplies,0);assert.equal(ai.status().outcomes.httpErrors,3);assert.equal(ai.status().lastHttpStatus,429);
 assert.ok(requests.every(url=>url.includes('generativelanguage.googleapis.com')&&url.includes('gemini-3.1-flash-lite')));assert.ok([...r.players.values()].filter(p=>p.bot).every(p=>p.botSpeech.source==='local'));
});
