import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup, mergeProfilesForImport, backupFileName, INVALID_BACKUP } from '../js/backup.js';
import { authMessage } from '../js/logic/messages.js';
import { categories, moves, profiles } from './fixture.js';

const data = { profiles: profiles.map(p => ({...p, pinHash:'h', pinSalt:'s', pinIter:100000})), categories, moves };
test('export leaves codes out', () => {
  const b = buildBackup(data, new Date('2026-11-06T10:00:00Z'));
  assert.equal(b.format, 1); assert.deepEqual(b.profiles, [{id:'a',name:'Ana'},{id:'b',name:'Rui'}]);
  assert.ok(!JSON.stringify(b).includes('pinHash'));
});
test('round trip', () => {
  const r = parseBackup(JSON.stringify(buildBackup(data)));
  assert.equal(r.ok, true); assert.equal(r.moveCount, data.moves.length); assert.deepEqual(r.data.moves, data.moves);
  assert.deepEqual(r.data.categories, data.categories);
});
test('refuses invalid files', () => {
  const good = buildBackup(data);
  const m0 = good.moves[0];
  const withMove = (patch) => JSON.stringify({...good, moves:[{...m0, ...patch}]});
  const bad = [ 'not json', 'null', '[]', JSON.stringify({...good, format:2}),
    withMove({cents:0}), withMove({cents:1.5}), withMove({cents:1000000000}), withMove({date:'2026-13-01'}),
    withMove({date:'2026-02-30'}), withMove({categoryId:'nope'}), withMove({profileId:'nope'}),
    withMove({type:'out'}), withMove({note:5}), withMove({createdAt:'x'}), withMove({id:''}),
    JSON.stringify({...good, moves:[m0, m0]}),
    JSON.stringify({...good, categories: good.categories.filter(c => c.type === 'out')}),
    JSON.stringify({...good, categories: [...good.categories, {...good.categories[0]}]}),
    JSON.stringify({...good, categories: good.categories.map((c,i) => i ? c : {...c, savings:'no'})}),
    JSON.stringify({...good, profiles: [good.profiles[0], good.profiles[0]]}),
    JSON.stringify({...good, profiles: [{id:'a', name:''}]}) ];
  for (const t of bad) assert.deepEqual(parseBackup(t), {ok:false, error:INVALID_BACKUP});
});
test('extra fields are dropped', () => {
  const good = buildBackup(data);
  const r = parseBackup(JSON.stringify({...good, x:1, moves: good.moves.map(m => ({...m, extra:1}))}));
  assert.equal(r.ok, true); assert.deepEqual(r.data.moves, data.moves);
});
test('import keeps existing codes', () => {
  const merged = mergeProfilesForImport([{id:'a',name:'Ana',pinHash:'h',pinSalt:'s',pinIter:1},{id:'b',name:'Rui',pinHash:'x',pinSalt:'y',pinIter:1}],
                                        [{id:'a',name:'Ana M'},{id:'c',name:'Novo'}]);
  assert.deepEqual(merged, [{id:'a',name:'Ana M',pinHash:'h',pinSalt:'s',pinIter:1},{id:'c',name:'Novo',pinHash:null,pinSalt:null,pinIter:null}]);
});
test('file name', () => assert.equal(backupFileName(new Date(2026, 10, 6)), 'financas-copia-2026-11-06.json'));
test('auth messages', () => {
  assert.equal(authMessage('auth/invalid-credential'), 'Email ou palavra-passe errados.');
  assert.equal(authMessage('auth/wrong-password'), 'Email ou palavra-passe errados.');
  assert.equal(authMessage('unavailable'), 'Sem ligação ao servidor. As alterações são enviadas quando a ligação voltar.');
  assert.equal(authMessage('auth/missing-email'), 'Escreve o teu email.');
  assert.equal(authMessage('xyz'), 'Ocorreu um erro inesperado. Tenta de novo.');
});
