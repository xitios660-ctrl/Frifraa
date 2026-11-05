'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, publicState, TARGET } = require('../server');

test('a soma de R$ 1 a R$ 200 é R$ 20.100', () => {
  const completed = publicState('mary', Array.from({ length: 200 }, (_, i) => i + 1));
  assert.equal(TARGET, 20100);
  assert.deepEqual({ count: completed.count, total: completed.total, percentage: completed.percentage, remaining: completed.remaining }, { count: 200, total: 20100, percentage: 100, remaining: 0 });
});

test('duplicatas e valores inválidos não contam duas vezes', () => {
  assert.deepEqual(publicState('mary', [5, 5, 3, 201, -1, 3.5]).saved, [3, 5]);
});

test('salvamentos e remoções permanecem independentes por personagem', async () => {
  const database = new Map();
  const store = {
    async getAll() { return ['mary', 'kaique', 'jheniffer', 'gustavo'].map(c => publicState(c, [...(database.get(c) || [])])); },
    async setMarked(person, amount, marked) {
      const set = database.get(person) || new Set();
      marked ? set.add(amount) : set.delete(amount);
      database.set(person, set);
      return publicState(person, [...set]);
    }
  };
  const server = createApp(store,{}).listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const url = `http://127.0.0.1:${server.address().port}`;
    const send = (character, amount, marked) => fetch(`${url}/api/deposit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character, amount, marked }) });
    assert.equal((await send('mary', 200, true)).status, 200);
    assert.equal((await send('kaique', 1, true)).status, 200);
    assert.equal((await send('mary', 200, true)).status, 200);
    let data = await (await fetch(`${url}/api/state`)).json();
    assert.equal(data.people.find(v => v.character === 'mary').total, 200);
    assert.equal(data.people.find(v => v.character === 'kaique').total, 1);
    assert.equal(data.people.find(v => v.character === 'gustavo').total, 0);
    assert.equal((await send('mary', 200, false)).status, 200);
    data = await (await fetch(`${url}/api/state`)).json();
    assert.equal(data.people.find(v => v.character === 'mary').total, 0);
    assert.equal(data.people.find(v => v.character === 'kaique').total, 1);
    assert.equal((await send('mary', 201, true)).status, 400);
    assert.equal((await send('outro', 3, true)).status, 400);
    assert.equal((await send('mary', 1.5, true)).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
