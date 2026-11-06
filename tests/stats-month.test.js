import test from 'node:test';
import assert from 'node:assert/strict';
import { periodStats, monthModel } from '../js/logic/stats.js';
import { categories, profiles, moves, mv } from './fixture.js';

test('periodStats counts savings categories as saved', () => {
  assert.deepEqual(periodStats(moves, categories, '2026-11', m => m.profileId === 'a'),
    {inn:200000, out:80000, inv:50000, saved:170000, rate:0.85});
});
test('profile view', () => {
  const m = monthModel({moves, categories, profiles, ym:'2026-11', view:'a'});
  assert.equal(m.split, null);
  assert.deepEqual(m.categories.map(c => [c.id, c.cents, c.pct, c.barPct, c.savings]), [['inv',50000,63,100,true],['carro',30000,38,60,false]]);
  assert.deepEqual(m.moves.map(x => x.date), ['2026-11-10','2026-11-03','2026-11-01']);
  assert.ok(!JSON.stringify(m).includes('segredo-b'));
});
test('casa view sums profiles and hides movements and notes', () => {
  const m = monthModel({moves, categories, profiles, ym:'2026-11', view:'casa'});
  assert.equal(m.totals.out, 100000); assert.equal(m.totals.saved, 250000);
  assert.deepEqual(m.split.map(s => [s.name, s.left, s.saved, s.rate]), [['Ana',120000,170000,0.85],['Rui',80000,80000,0.8]]);
  assert.deepEqual(m.categories.find(c => c.id === 'carro').split, [{name:'Ana',cents:30000},{name:'Rui',cents:20000}]);
  assert.equal(m.moves, null);
  const json = JSON.stringify(m); assert.ok(!json.includes('pneus') && !json.includes('segredo-b'));
});
test('profile without income has no rate in casa split', () => {
  const m = monthModel({moves: moves.filter(x => !(x.profileId === 'b' && x.type === 'in')), categories, profiles, ym:'2026-11', view:'casa'});
  assert.equal(m.split[1].rate, null);
});
test('empty month', () => {
  const m = monthModel({moves, categories, profiles, ym:'2027-01', view:'a'});
  assert.deepEqual([m.totals.out, m.totals.rate, m.categories.length, m.moves.length], [0, null, 0, 0]);
});
test('unknown category is shown as Sem categoria', () => {
  const m = monthModel({moves:[mv('a','out',500,'apagada','2026-11-05')], categories, profiles, ym:'2026-11', view:'a'});
  assert.deepEqual([m.categories[0].name, m.categories[0].icon, m.moves[0].categoryName], ['Sem categoria','❔','Sem categoria']);
});
