'use strict';

// Weather requests work independently of Gemini and its daily API quota.
// Data: Open-Meteo (CC BY 4.0), free for non-commercial use, with attribution.
const BASE = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const MOGI = { name: 'Mogi das Cruzes', latitude: -23.523, longitude: -46.188, timezone: 'America/Sao_Paulo' };
const conditions = [
  [0,'céu limpo ☀️'],[1,'predominantemente ensolarado 🌤️'],[2,'parcialmente nublado ⛅'],
  [3,'nublado ☁️'],[45,'neblina 🌫️'],[48,'neblina 🌫️'],
  [51,'garoa leve 🌦️'],[53,'garoa 🌦️'],[55,'garoa forte 🌧️'],
  [56,'garoa congelante'],[57,'garoa congelante'],
  [61,'chuva fraca 🌧️'],[63,'chuva 🌧️'],[65,'chuva forte 🌧️'],
  [66,'chuva congelante'],[67,'chuva congelante'],
  [71,'neve fraca ❄️'],[73,'neve ❄️'],[75,'neve forte ❄️'],[77,'grãos de neve ❄️'],
  [80,'pancadas leves de chuva 🌦️'],[81,'pancadas de chuva 🌧️'],[82,'pancadas fortes de chuva ⛈️'],
  [85,'pancadas de neve'],[86,'neve forte'],[95,'trovoadas ⛈️'],[96,'tempestade com granizo ⛈️'],[99,'tempestade com granizo ⛈️']
];
const condition = code => (conditions.find(item=>item[0]===Number(code))||[0,'condições variáveis'])[1];
const fmt = (value, unit = '') => Number.isFinite(value) ? Math.round(value) + unit : 'indisponível';
const rawWeatherWords = /\b(clima|previs[aã]o do tempo|temperatura|chuva|chover|chovendo|chove|esfriar|esquentar|faz frio|faz calor|tempo (?:em|na|no|de|para|hoje|amanh[aã]|agora|a[ií]))\b/i;
function isWeatherQuestion(text) {
  const plain = String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /(?:clima|previsao do tempo|temperatura|chuva|chover|chovendo|chove|faz frio|faz calor|tempo (?:em|na|no|de|para|hoje|amanha|agora|ai))/.test(plain)
    && !/^(?:bot[, ]*)?(?:quanto tempo|faz tempo|ha quanto tempo)\b/.test(plain);
}
function locationFrom(text) {
  const clean = String(text||'').replace(/(^|[^\p{L}\p{N}_])bot(?=$|[^\p{L}\p{N}_])/giu,' ').trim();
  if(/\bmogi(?:\s+das\s+cruzes)?\b/i.test(clean)) return MOGI;
  const match=clean.match(/(?:clima|temperatura|chuva|chover|tempo|previs[aã]o)[\s\S]{0,65}?\b(?:em|de|para|na|no)\s+([a-zÀ-ÿ][a-zÀ-ÿ' -]{2,50})/i);
  if(!match) return MOGI;
  const name=match[1].replace(/\b(?:hoje|agora|amanh[aã]|depois|neste|nessa|essa|esse|vai|faz|est[aá]|t[aá]|pra|por|favor)\b[\s\S]*$/i,'').trim().replace(/\s+$/,'');
  return name.length>2 && name.length<48 ? { name } : MOGI;
}
async function getJSON(url) {
  const res=await fetch(url,{method:'GET',headers:{accept:'application/json'},signal:AbortSignal.timeout(9000)});
  if(!res.ok) throw new Error('weather HTTP '+res.status);
  return res.json();
}
async function coords(location) {
  if(Number.isFinite(location.latitude)) return location;
  const qs=new URLSearchParams({name:location.name,count:'6',language:'pt',format:'json'});
  const data=await getJSON(GEOCODE+'?'+qs);
  const results=Array.isArray(data.results)?data.results:[];
  const candidates=results.filter(r=>Number.isFinite(r.latitude)&&Number.isFinite(r.longitude));
  if(!candidates.length) return null;
  const wantedBR=/[, ](?:brasil|br|s[aã]o paulo)\b/i.test(location.name);
  const selected= wantedBR ? candidates.find(r=>r.country_code==='BR')||candidates[0] : candidates[0];
  return {name:selected.name+(selected.admin1?', '+selected.admin1:''),latitude:selected.latitude,longitude:selected.longitude,timezone:selected.timezone||'auto'};
}
async function getWeatherReply(text) {
  if(!isWeatherQuestion(text)) return null;
  const location=locationFrom(text);
  try {
    const city=await coords(location);
    if(!city) return 'Não encontrei essa cidade para consultar o clima. Tenta escrever o nome completo? 🌤️';
    const args=new URLSearchParams({
      latitude:String(city.latitude),longitude:String(city.longitude),timezone:city.timezone||'auto',forecast_days:'4',
      current:'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m',
      daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
    });
    const data=await getJSON(BASE+'?'+args);
    if(!Number.isFinite(data.current?.temperature_2m)) throw new Error('weather current missing');
    const plain=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const tomorrow=/\bamanha\b/.test(plain);
    const day=data.daily||{};
    const today=String(data.current.time||'').slice(0,10);
    const todayIndex=Array.isArray(day.time)?day.time.indexOf(today):0;
    const targetIndex=Math.max(0,todayIndex)+(tomorrow?1:0);
    const high=day.temperature_2m_max?.[targetIndex];
    const low=day.temperature_2m_min?.[targetIndex];
    const rain=day.precipitation_probability_max?.[targetIndex];
    const headline=tomorrow?'🌤️ *Previsão para amanhã em '+city.name+'*':
      '🌤️ *Clima agora em '+city.name+'*';
    const details=tomorrow
      ? condition(day.weather_code?.[targetIndex])+'. Mínima '+fmt(low,'°C')+' e máxima '+fmt(high,'°C')+'.'
      : fmt(data.current.temperature_2m,'°C')+' e '+condition(data.current.weather_code)+'. Sensação de '+fmt(data.current.apparent_temperature,'°C')+'.';
    const extra=Number.isFinite(rain)?'\n☔ Chance máxima de chuva '+(tomorrow?'amanhã':'hoje')+': '+fmt(rain,'%')+'.':'';
    const temps=!tomorrow && Number.isFinite(high)&&Number.isFinite(low)?'\n🌡️ Hoje: '+fmt(low,'°C')+' a '+fmt(high,'°C')+'.':'';
    return (headline+'\n'+details+temps+extra+'\nFonte: Open-Meteo (previsão, pode mudar).').slice(0,650);
  } catch(e) {
    console.warn('[weather] Consulta indisponível:',String(e?.message||e).slice(0,110));
    return 'Não consegui atualizar o clima de '+location.name+' agora. 🌦️ Confira a previsão em https://open-meteo.com/ .';
  }
}
module.exports={isWeatherQuestion,locationFrom,getWeatherReply};
