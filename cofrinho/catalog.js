'use strict';
// The catalog is authoritative. No price or benefit is accepted from a browser.
const CATALOG=Object.freeze([
 {id:'bomb2',name:'Bomba extra',price:10,group:'bombs',level:2,icon:'💣',skin:'techbomb',benefit:'Começa com 2 bombas'},
 {id:'fire2',name:'Fogo nível 2',price:15,group:'range',level:2,icon:'🔥',skin:'flame',benefit:'Alcance inicial de 2 blocos'},
 {id:'speed2',name:'Velocidade nível 2',price:20,group:'speedLevel',level:2,icon:'⚡',skin:'skate',benefit:'Começa na velocidade 2 de 3'},
 {id:'life2',name:'Vida extra',price:25,group:'lives',level:2,icon:'❤️',skin:'heart',benefit:'Começa com 2 vidas'},
 {id:'shield',name:'Escudo',price:30,group:'shield',level:1,icon:'🛡️',skin:'tanks',benefit:'Absorve uma explosão'},
 {id:'bomb3',name:'Arsenal nível 3',price:40,group:'bombs',level:3,icon:'💣',skin:'techbomb',benefit:'Começa com 3 bombas'},
 {id:'fire3',name:'Fogo nível 3',price:45,group:'range',level:3,icon:'🔥',skin:'goldflame',benefit:'Alcance inicial de 3 blocos'},
 {id:'speed3',name:'Velocidade nível 3',price:50,group:'speedLevel',level:3,icon:'⚡',skin:'skate',benefit:'Começa na velocidade máxima: 3'}
]);
// Older deployments sold incremental tiers. Preserve those unlocks and their
// accounting without silently granting them again or charging for them twice.
const LEGACY=[
 {id:'legacy-bomb4',name:'Arsenal anterior · 4 bombas',group:'bombs',level:4,icon:'💣',skin:'techbomb',benefit:'Compra anterior preservada'},
 {id:'legacy-fire4',name:'Fogo anterior · nível 4',group:'range',level:4,icon:'🔥',skin:'flame',benefit:'Compra anterior preservada'},
 {id:'legacy-fire5',name:'Fogo anterior · nível 5',group:'range',level:5,icon:'🔥',skin:'goldflame',benefit:'Compra anterior preservada'},
 {id:'legacy-life3',name:'Vidas anteriores · 3 vidas',group:'lives',level:3,icon:'❤️',skin:'heart',benefit:'Compra anterior preservada'},
 {id:'legacy-kick',name:'Luva comprada anteriormente',group:'kick',level:1,icon:'🥊',skin:'glove',benefit:'Começa com chute de bombas'},
 {id:'legacy-push',name:'Empurrão comprado anteriormente',group:'push',level:1,icon:'🌈',skin:'rainbow',benefit:'Começa com empurrão de bombas'}
].map(item=>({...item,price:0}));
const ALL_ITEMS=[...CATALOG,...LEGACY],IDS=new Set(ALL_ITEMS.map(item=>item.id));
function legacyOwned(record){
 const u=record?.upgrades||{},ids=[];
 for(const[key,tiers]of Object.entries({bomb:['bomb2','bomb3','legacy-bomb4'],range:['fire2','fire3','legacy-fire4','legacy-fire5'],speed:['speed2','speed3'],life:['life2','legacy-life3'],shield:['shield'],kick:['legacy-kick'],push:['legacy-push']}))for(let i=0;i<Math.min(Number(u[key])||0,tiers.length);i++)ids.push(tiers[i]);
 return ids;
}
function equipment(owned,equipped){
 if(!Array.isArray(equipped)||equipped.length>ALL_ITEMS.length||equipped.some(id=>!IDS.has(id)||!owned.includes(id))||new Set(equipped).size!==equipped.length)throw Object.assign(new Error('Equipe apenas melhorias que você possui.'),{status:400});
 const groups=equipped.map(id=>ALL_ITEMS.find(item=>item.id===id).group);
 if(new Set(groups).size!==groups.length)throw Object.assign(new Error('Escolha somente um nível por tipo de melhoria.'),{status:400});
 return equipped;
}
function walletView(record,character){
 const earned=[...new Set(record?.saved||[])].filter(n=>Number.isInteger(n)&&n>=1&&n<=200).reduce((a,b)=>a+b,0);
 const purchases=record?.wallet?.purchases||[],oldSpent=Math.max(0,Number.isInteger(record?.spentCoins)?record.spentCoins:0);
 const oldHistory=(record?.coinPurchases||[]).map(p=>({itemId:`anterior:${p.upgrade}`,label:`Compra anterior: ${p.upgrade} · nível ${p.level||1}`,price:p.cost,requestId:p.id,at:p.at}));
 const history=[...oldHistory,...purchases],spent=oldSpent+purchases.reduce((sum,p)=>sum+p.price,0),owned=[...new Set([...legacyOwned(record),...purchases.map(p=>p.itemId)])];
 const equipped=(record?.wallet?.equipped||[]).filter(id=>owned.includes(id)&&IDS.has(id));
 return{character,realTotal:earned,earned,spent,available:Math.max(0,earned-spent),deficit:Math.max(0,spent-earned),owned,equipped,history,catalog:[...CATALOG,...LEGACY.filter(item=>owned.includes(item.id))]};
}
module.exports={CATALOG,equipment,walletView};
