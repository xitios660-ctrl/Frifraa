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
const IDS=new Set(CATALOG.map(item=>item.id));
function equipment(owned,equipped){
 if(!Array.isArray(equipped)||equipped.length>CATALOG.length||equipped.some(id=>!IDS.has(id)||!owned.includes(id))||new Set(equipped).size!==equipped.length)throw Object.assign(new Error('Equipe apenas melhorias que você possui.'),{status:400});
 const groups=equipped.map(id=>CATALOG.find(item=>item.id===id).group);
 if(new Set(groups).size!==groups.length)throw Object.assign(new Error('Escolha somente um nível por tipo de melhoria.'),{status:400});
 return equipped;
}
function walletView(record,character){
 const earned=[...new Set(record?.saved||[])].filter(n=>Number.isInteger(n)&&n>=1&&n<=200).reduce((a,b)=>a+b,0);
 const history=record?.wallet?.purchases||[],spent=history.reduce((sum,p)=>sum+p.price,0),owned=history.map(p=>p.itemId);
 const equipped=(record?.wallet?.equipped||[]).filter(id=>owned.includes(id)&&IDS.has(id));
 return{character,realTotal:earned,earned,spent,available:Math.max(0,earned-spent),deficit:Math.max(0,spent-earned),owned,equipped,history,catalog:CATALOG};
}
module.exports={CATALOG,equipment,walletView};
