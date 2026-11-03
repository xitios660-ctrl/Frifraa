'use strict';
// Owner-only integration verification. All writes target random QA collections
// inside bomba_party_cofrinho; the four real deposit records are read only.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createWalletStore}=require('./wallet-store');
async function verifyWallet(database){
 const d=await database();if(d.databaseName!=='bomba_party_cofrinho')throw new Error('Banco de verificação não autorizado.');
 const prefix=`qa_${crypto.randomBytes(8).toString('hex')}_`,names=['cofrinhos','wallet_accounts','wallet_sessions','wallet_login_limits'];
 const records=d.collection(prefix+'cofrinhos'),store=createWalletStore(database,{prefix}),checks=[];
 const deposits=async()=>JSON.stringify(await d.collection('cofrinhos').find({_id:{$in:['mary','kaique','jheniffer','gustavo']}},{projection:{saved:1}}).sort({_id:1}).toArray());
 const before=await deposits();
 try{
  await records.insertOne({_id:'mary',saved:[10]});await store.setPin('mary','12345678');
  const {token}=await store.login('mary','12345678','integration');
  let w=await store.get(token);assert.equal(w.realTotal,10);assert.equal(w.earned,10);assert.equal(w.available,10);checks.push('R$ 10 = 10 moedas');
  await assert.rejects(store.get('a'.repeat(64)),e=>e.status===401);checks.push('Sessão forjada recusada');
  const requestId=crypto.randomUUID();const attempts=await Promise.all(Array.from({length:16},()=>store.purchase(token,'bomb2',requestId)));
  for(const view of attempts){assert.equal(view.available,0);assert.equal(view.spent,10);assert.equal(view.history.length,1);}
  w=await store.get(token);assert.deepEqual(w.owned,['bomb2']);assert.deepEqual((await records.findOne({_id:'mary'})).saved,[10]);checks.push('16 compras simultâneas idempotentes: um débito, depósitos intactos');
  await assert.rejects(store.purchase(token,'bomb2',crypto.randomUUID()),e=>e.status===409);await assert.rejects(store.purchase(token,'fire2',crypto.randomUUID()),e=>e.status===409);checks.push('Compra duplicada e saldo insuficiente recusados');
  await assert.rejects(store.equip(token,['fire3']),e=>e.status===400);await store.equip(token,['bomb2']);checks.push('Equipar somente melhorias próprias');
  const restarted=createWalletStore(database,{prefix});w=await restarted.get(token);assert.deepEqual(w.equipped,['bomb2']);assert.equal(w.history.length,1);checks.push('Saldo, sessão, compra e equipamento persistidos no MongoDB');
  await records.updateOne({_id:'mary'},{$pull:{saved:10}});w=await restarted.get(token);assert.equal(w.available,0);assert.equal(w.deficit,10);assert.equal(w.spent,10);assert.equal(w.history.length,1);assert.deepEqual(w.owned,['bomb2']);checks.push('Desmarcar depósito preserva compras e impede saldo disponível negativo');
  await records.updateOne({_id:'mary'},{$addToSet:{saved:200}});
  const concurrent=await Promise.allSettled(Array.from({length:16},(_,i)=>store.purchase(token,i%2?'fire3':'speed3',crypto.randomUUID())));
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,2);w=await store.get(token);assert.equal(w.history.length,3);assert.equal(w.spent,105);assert.equal(w.available,95);checks.push('Compras concorrentes de itens diferentes não duplicam gastos');
  await store.setPin('mary','87654321');await assert.rejects(store.get(token),e=>e.status===401);checks.push('Troca de PIN invalida sessões antigas');
  assert.equal(await deposits(),before);checks.push('Depósitos reais preservados integralmente');
  return{ok:true,checks,depositHash:crypto.createHash('sha256').update(before).digest('hex')};
 }finally{for(const name of names)await d.collection(prefix+name).drop().catch(e=>{if(e.code!==26)throw e;});}
}
module.exports={verifyWallet};
