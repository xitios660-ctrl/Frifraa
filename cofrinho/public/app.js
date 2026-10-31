'use strict';

const NAMES = { mary: 'Mary', kaique: 'Kaique', jheniffer: 'Jheniffer', gustavo: 'Gustavo' };
const EMOJIS = { mary: '💜', kaique: '👓', jheniffer: '🌸', gustavo: '😎' };
const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const people = new Map(Object.keys(NAMES).map(name => [name, { character: name, saved: [], total: 0, remaining: 20100, count: 0, percentage: 0 }]));
const savedButtons = new Map();
let selected = new URLSearchParams(location.search).get('person');
if (!NAMES[selected]) selected = 'mary';
let networkBusy = false;
let initialized = false;
let feedbackTimeout;

const el = id => document.getElementById(id);

function setStatus(message, type = 'info') {
  const banner = el('status');
  banner.textContent = message;
  banner.className = `status-banner ${type}`;
  if (feedbackTimeout) clearTimeout(feedbackTimeout);
  if (type === 'success') feedbackTimeout = setTimeout(() => { banner.className = 'status-banner hidden'; }, 4200);
}

function buildGrid() {
  const frag = document.createDocumentFragment();
  for (let amount = 1; amount <= 200; amount++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'deposit-button';
    btn.textContent = amount;
    btn.dataset.amount = amount;
    btn.setAttribute('aria-label', `Marcar depósito de ${MONEY.format(amount)}`);
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => deposit(amount));
    savedButtons.set(amount, btn);
    frag.append(btn);
  }
  el('depositGrid').append(frag);
}

function render() {
  document.querySelectorAll('[data-person]').forEach(button => {
    const active = button.dataset.person === selected;
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  for (const [name, state] of people) {
    const counter = document.querySelector(`[data-character-count="${name}"]`);
    const bar = document.querySelector(`[data-character-bar="${name}"]`);
    if (counter) counter.textContent = `${state.count} / 200 depósitos`;
    if (bar) bar.style.width = `${state.percentage}%`;
  }

  const item = people.get(selected);
  el('cofrinho-title').textContent = NAMES[selected];
  el('personIcon').textContent = EMOJIS[selected];
  el('savedAmount').textContent = MONEY.format(item.total);
  el('missingAmount').textContent = MONEY.format(item.remaining);
  el('depositCount').innerHTML = `${item.count} <em>/ 200</em>`;
  el('percentageText').textContent = `${item.percentage}% do desafio`;
  el('percentProgress').textContent = `${item.percentage}%`;
  el('progressFill').style.width = `${item.percentage}%`;
  el('remainingCount').textContent = 200 - item.count;
  const savedSet = new Set(item.saved);
  for (const [amount, button] of savedButtons) {
    const done = savedSet.has(amount);
    button.classList.toggle('done', done);
    button.setAttribute('aria-pressed', String(done));
    button.setAttribute('aria-label', `${MONEY.format(amount)}: ${done ? 'já guardado, tocar para desmarcar' : 'não guardado, tocar para marcar'}`);
  }
}

async function fetchJSON(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || 'Não foi possível conectar com o banco de dados.');
  return json;
}

async function refresh({ quiet = false } = {}) {
  if (networkBusy) return;
  try {
    const data = await fetchJSON('/api/state');
    for (const state of data.people) if (people.has(state.character)) people.set(state.character, state);
    initialized = true;
    el('syncState').classList.remove('offline');
    el('syncLabel').textContent = 'DADOS SALVOS ONLINE';
    render();
    if (!quiet) setStatus('✅ Banco conectado. Todas as marcações são salvas e compartilhadas entre os celulares.', 'success');
  } catch (err) {
    el('syncState').classList.add('offline');
    el('syncLabel').textContent = 'AGUARDANDO BANCO';
    if (!quiet || !initialized) setStatus(`⚠️ ${err.message} Nenhum depósito será marcado sem confirmação do servidor.`, 'error');
  }
}

async function deposit(amount) {
  if (networkBusy) return;
  if (!initialized) return setStatus('⚠️ Aguarde a conexão do banco antes de marcar um valor.', 'error');
  const character = selected;
  const isMarked = people.get(character).saved.includes(amount);
  if (isMarked && !window.confirm(`Desmarcar o depósito de ${MONEY.format(amount)} do cofrinho de ${NAMES[character]}?`)) return;
  const button = savedButtons.get(amount);
  networkBusy = true;
  button.classList.add('saving');
  button.disabled = true;
  setStatus(`⏳ ${isMarked ? 'Desmarcando' : 'Salvando'} ${MONEY.format(amount)} no cofrinho de ${NAMES[character]}...`);
  try {
    const data = await fetchJSON('/api/deposit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character, amount, marked: !isMarked }) });
    people.set(character, data.person);
    render();
    setStatus(isMarked ? `↩️ ${MONEY.format(amount)} desmarcado do cofrinho de ${NAMES[character]}.` : `🎉 ${MONEY.format(amount)} guardado no cofrinho de ${NAMES[character]}!`, 'success');
    if (data.person.count === 200) setStatus(`🏆 PARABÉNS, ${NAMES[character].toUpperCase()}! VOCÊ COMPLETOU OS 200 DEPÓSITOS!`, 'success');
  } catch (err) {
    setStatus(`❌ Não foi salvo: ${err.message} O botão continua como estava.`, 'error');
  } finally {
    button.classList.remove('saving');
    button.disabled = false;
    networkBusy = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  buildGrid();
  document.querySelectorAll('[data-person]').forEach(button => button.addEventListener('click', () => {
    if (networkBusy) return;
    selected = button.dataset.person;
    history.replaceState({}, '', `${location.pathname}?person=${selected}`);
    render();
  }));
  render();
  refresh();
  setInterval(() => refresh({ quiet: true }), 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh({ quiet: true }); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
});
