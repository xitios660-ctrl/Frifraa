'use strict';
// Meaning-based STOP answer assignment. An answer's position is only a last-resort tie-breaker.
const CATEGORIES=['Animal','Lugar','Comida','Cor','Objeto','Nome'];
const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/\s+/g,' ');
const extraWords={
  0:'dinossauro lula veado cachorro capivara vaca tatu cobra gato cachorro gorila galinha girafa javali veado barata pernilongo gambá borboleta arara rato raposa boi lobo leao mico veado',
  1:'vivara dinamarca lisboa londres sao paulo rio de janeiro salvador campinas taubate sorocaba osasco guarulhos guaruja suzano atibaia los angeles nova york brasil argentina venezuela peru vietna alemanha portugal shopping farmacia escola supermercado rua pracinha parque bairro jardim rodoviaria restaurante',
  2:'doritos estrogonofe estrogonoffe lasanha limonada leite doce salgadinho chocolate morango ovo arroz banana batata churrasco sanduiche feijoada coxinha salada sorvete sushi hot dog',
  3:'vermelho verde vinho violeta dourado bege branco preto azul rosa roxo amarelo cinza marrom prata lilas turquesa anil',
  4:'vara lente luva escova tenis oculos lousa telefone sapato escada dado dinamite pente vaso vestido ventilador vassoura vidro violao bolsa saco',
  5:'vera vinicius vitor vitoria vanderson valeria vanessa luan denis dandara estevan elaine elisa eduardo fernando juliana fernanda gabriela rafael luana daniel'
};
const extra=Object.fromEntries(Object.entries(extraWords).map(([k,s])=>[Number(k),new Set(s.split(' ').map(normalize))]));
for(const [cat,items] of [[1,['são paulo','rio de janeiro','los angeles','nova york']],[2,['hot dog']]])
  for(const w of items)extra[cat].add(normalize(w));
const validCats=(word,existing)=>CATEGORIES.map((_,i)=>i).filter(i=>extra[i]?.has(normalize(word))||existing(i,word));

function parseSubmission(text){
  const raw=String(text||'').trim().replace(/^bot[,!:]?\s*/i,'');
  if(!raw||raw.length>600)return null;
  const parts=raw.split(/[,;\n]/).map(x=>x.trim());
  if(parts.length>9||parts.some(x=>x.length>65))return null;
  const labels=['animal','lugar','comida','cor','objeto','nome'];
  const label=/^(animal|lugar|comida|cor|objeto|nome)\s*[:=]\s*/i;
  const labelled=parts.some(x=>label.test(normalize(x)));
  if(parts.filter(Boolean).length<2&&!labelled)return null;
  const entries=[];
  for(let i=0;i<parts.length;i++){
    if(!parts[i])continue;
    let word=parts[i],preferred=null;
    const match=normalize(word).match(label);
    if(labelled){
      if(!match)return null;
      preferred=labels.indexOf(match[1]);
      word=word.replace(label,'').trim();
    }
    if(!word)continue;
    entries.push({word,preferred});
  }
  if(!entries.length)return null;
  return entries;
}
function assignEntries(entries,existing,model={}) {
  const items=entries.map((x,i)=>{
    const word=String(x.word||'').trim();
    const found=validCats(word,existing);
    const grounded=model[i];
    const certified=grounded && Array.isArray(grounded.categories)
      ? grounded.categories.filter(v=>Number.isInteger(v)&&v>=0&&v<6) : null;
    return {word,preferred:Number.isInteger(x.preferred)?x.preferred:null,found,
      accepted:certified===null?found:certified,certified};
  });
  let best={weight:-Infinity,picks:[]};
  function search(i,used,score,picks){
    if(i===items.length){
      if(score>best.weight)best={weight:score,picks:[...picks]};
      return;
    }
    const it=items[i];
    // Omit words that cannot fit into one of the six categories.
    search(i+1,used,score,[...picks,-1]);
    const options=it.preferred!==null?[it.preferred]:CATEGORIES.map((_,i)=>i);
    for(const cat of options){
      if(used&(1<<cat))continue;
      if(it.certified!==null && !it.certified.includes(cat))continue;
      const positive=it.accepted.includes(cat);
      const knownElsewhere=it.accepted.length>0;
      if(knownElsewhere&&!positive)continue;
      const weight=positive?1000:(it.certified!==null?-999:1);
      const bias=(5-cat)*0.015-Math.abs(i-cat)*0.015;
      search(i+1,used|(1<<cat),score+weight+bias,[...picks,cat]);
    }
  }
  search(0,0,0,[]);
  const words=Array(6).fill('');
  const verified=Array(6).fill(null),unverified=Array(6).fill(false),extras=[];
  for(let i=0;i<items.length;i++){
    const item=items[i],cat=best.picks[i];
    if(cat===-1||cat===undefined){extras.push(item.word);continue;}
    words[cat]=item.word;
    if(item.certified!==null)verified[cat]=item.certified.includes(cat);
    else if(!item.found.includes(cat))unverified[cat]=true;
  }
  return {words,verified,unverified,extras};
}
module.exports={CATEGORIES,normalize,parseSubmission,assignEntries,validCats};
