import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore } from '../js/store-memory.js';
import { CASES } from './contract/store-contract.js';

for (const c of CASES) test(c.name, () => c.run(createMemoryStore(), assert));

test('getState returns copies that cannot corrupt the store', () => {
  const store = createMemoryStore();
  store.seedDefaults();
  store.getState().categories[0].name = 'X';
  store.getState().categories.pop();
  assert.equal(store.getState().categories.length, 10);
  assert.equal(store.getState().categories[0].name, 'Carro');
});

test('initial data is loaded', () => {
  const store = createMemoryStore({ profiles: [{ id: 'a', name: 'Ana', pinHash: null, pinSalt: null, pinIter: null }] });
  assert.equal(store.getState().profiles.length, 1);
  assert.equal(store.getState().ready, true);
  assert.equal(store.getState().pending, false);
});
