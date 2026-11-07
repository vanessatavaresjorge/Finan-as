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
    withMove({date:'2026-02-30'}), withMove({profileId:'nope'}),
    withMove({type: m0.type === 'out' ? 'in' : 'out'}), withMove({categoryId:''}), withMove({note:5}), withMove({createdAt:'x'}), withMove({id:''}),
    JSON.stringify({...good, moves:[m0, m0]}),
    JSON.stringify({...good, categories: good.categories.filter(c => c.type === 'out')}),
    JSON.stringify({...good, categories: [...good.categories, {...good.categories[0]}]}),
    JSON.stringify({...good, categories: good.categories.map((c,i) => i ? c : {...c, savings:'no'})}),
    JSON.stringify({...good, profiles: [good.profiles[0], good.profiles[0]]}),
    JSON.stringify({...good, profiles: [{id:'a', name:''}]}) ];
  for (const t of bad) assert.deepEqual(parseBackup(t), {ok:false, error:INVALID_BACKUP});
});
test('move with deleted category is kept', () => {
  const good = buildBackup(data);
  const orphan = {...good.moves[0], id:'orf', categoryId:'apagada'};
  const r = parseBackup(JSON.stringify({...good, moves:[...good.moves, orphan]}));
  assert.equal(r.ok, true); assert.deepEqual(r.data.moves.at(-1), orphan);
});
test('extra fields are dropped', () => {
  const good = buildBackup(data);
  const r = parseBackup(JSON.stringify({...good, x:1, moves: good.moves.map(m => ({...m, extra:1}))}));
  assert.equal(r.ok, true); assert.deepEqual(r.data.moves, data.moves);
});
test('import keeps existing codes', () => {
  const merged = mergeProfilesForImport([{id:'a',name:'Ana',pinHash:'h',pinSalt:'s',pinIter:1},{id:'b',name:'Rui',pinHash:'x',pinSalt:'y',pinIter:1}],
                                        [{id:'a',name:'Ana M'},{id:'c',name:'Novo'}]);
  assert.deepEqual(merged, [{id:'a',name:'Ana M',pinHash:'h',pinSalt:'s',pinIter:1,openingCents:null,openingDate:null},{id:'c',name:'Novo',pinHash:null,pinSalt:null,pinIter:null,openingCents:null,openingDate:null}]);
});
test('file name', () => assert.equal(backupFileName(new Date(2026, 10, 6)), 'financas-copia-2026-11-06.json'));
test('auth messages', () => {
  assert.equal(authMessage('auth/invalid-credential'), 'Email ou palavra-passe errados.');
  assert.equal(authMessage('auth/wrong-password'), 'Email ou palavra-passe errados.');
  assert.equal(authMessage('unavailable'), 'Sem ligação ao servidor. As alterações são enviadas quando a ligação voltar.');
  assert.equal(authMessage('auth/missing-email'), 'Escreve o teu email.');
  assert.equal(authMessage('xyz'), 'Ocorreu um erro inesperado. Tenta de novo.');
});
test('auth messages: record gone', () => {
  assert.equal(authMessage('not-found'), 'Este registo já não existe.');
});
test('refuses ids Firestore cannot store', () => {
  const good = buildBackup(data);
  const m0 = good.moves[0];
  const c0 = good.categories[0];
  const badIds = ['a/b', '.', '..', '__x__', 'x'.repeat(65), 'a b', 'é'];
  for (const id of badIds) {
    const cases = [
      {...good, profiles: [...good.profiles, {id, name:'Outro'}]},
      {...good, categories: [...good.categories, {...c0, id, name:'Outra'}]},
      {...good, moves: [...good.moves, {...m0, id}]},
      {...good, moves: [...good.moves, {...m0, id:'novo', categoryId:id}]},
    ];
    for (const c of cases) assert.deepEqual(parseBackup(JSON.stringify(c)), {ok:false, error:INVALID_BACKUP}, id);
  }
});
test('accepts the id formats the app creates', async () => {
  const { demoData } = await import('../js/demo-data.js');
  const { DEFAULT_CATEGORIES } = await import('../js/logic/categories.js');
  const demo = demoData('2026-11-06');
  const ids = ['a', 'via-verde', 'demo-0001', crypto.randomUUID(), 'Xy3kP9qL2mN8vB4cR6tW', 'x'.repeat(64), 'a_b'];
  const good = buildBackup(data);
  for (const id of ids) {
    const r = parseBackup(JSON.stringify({...good,
      profiles: [...good.profiles, {id: `p${id}`.slice(0, 64), name:'Outro'}],
      categories: [...good.categories, {...good.categories[0], id, name:'Outra'}],
      moves: [...good.moves, {...good.moves.find(m => m.categoryId === good.categories[0].id), id, categoryId:id}]}));
    assert.equal(r.ok, true, id);
  }
  assert.equal(parseBackup(JSON.stringify(buildBackup(demo))).ok, true);
  assert.equal(parseBackup(JSON.stringify(buildBackup({...data, categories: DEFAULT_CATEGORIES}))).ok, true);
});

const withOpen = { ...data, profiles: [{ ...data.profiles[0], openingCents: -5000, openingDate: '2026-10-31' }, data.profiles[1]] };
test('opening balance round trip; pins never exported', () => {
  const b = buildBackup(withOpen);
  assert.deepEqual(b.profiles[0], { id:'a', name:'Ana', openingCents:-5000, openingDate:'2026-10-31' });
  assert.deepEqual(b.profiles[1], { id:'b', name:'Rui' });
  const r = parseBackup(JSON.stringify(b));
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.profiles, b.profiles);
});
test('old backup without opening fields parses', () => {
  const r = parseBackup(JSON.stringify(buildBackup(data)));
  assert.equal(r.ok, true); assert.deepEqual(r.data.profiles[0], { id:'a', name:'Ana' });
});
test('invalid opening fields refused', () => {
  const good = buildBackup(data);
  const withP = (patch) => JSON.stringify({ ...good, profiles: [{ ...good.profiles[0], ...patch }, good.profiles[1]] });
  for (const patch of [{ openingCents: 100 }, { openingDate: '2026-10-31' }, { openingCents: 1.5, openingDate: '2026-10-31' },
    { openingCents: 1000000000, openingDate: '2026-10-31' }, { openingCents: -1000000000, openingDate: '2026-10-31' },
    { openingCents: '5', openingDate: '2026-10-31' }, { openingCents: 5, openingDate: '2026-02-30' }, { openingCents: 5, openingDate: null }]) {
    assert.equal(parseBackup(withP(patch)).ok, false, JSON.stringify(patch));
  }
  assert.equal(parseBackup(withP({ openingCents: 999999999, openingDate: '2026-10-31' })).ok, true);
});
test('import: opening comes from incoming, pins kept (old backup clears opening)', () => {
  const existing = [{ id:'a', name:'Ana', pinHash:'h', pinSalt:'s', pinIter:1, openingCents:100, openingDate:'2026-10-31' }];
  assert.deepEqual(mergeProfilesForImport(existing, [{ id:'a', name:'Ana' }]),
    [{ id:'a', name:'Ana', pinHash:'h', pinSalt:'s', pinIter:1, openingCents:null, openingDate:null }]);
  assert.deepEqual(mergeProfilesForImport(existing, [{ id:'a', name:'Ana', openingCents:-7, openingDate:'2026-11-01' }]),
    [{ id:'a', name:'Ana', pinHash:'h', pinSalt:'s', pinIter:1, openingCents:-7, openingDate:'2026-11-01' }]);
});
