import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, GROUP_LABELS, TARGETS, groupOf, withGroup } from '../js/logic/groups.js';
import { ruleModel, categoryOf, periodStats } from '../js/logic/stats.js';
import { categories as base, moves as baseMoves, mv } from './fixture.js';

const cats = [...base, { id:'restaurantes', name:'Restaurantes', type:'out', icon:'🍽️', savings:false, order:3 }];
const ms = [...baseMoves, mv('a','out',20000,'restaurantes','2026-11-12')];

test('constants', () => {
  assert.deepEqual(GROUPS, ['necessidade','desejo','poupanca']);
  assert.deepEqual(GROUP_LABELS, { necessidade:'Necessidade', desejo:'Desejo', poupanca:'Poupança' });
  assert.deepEqual(TARGETS, { necessidade:50, desejo:30, poupanca:20 });
});
test('groupOf automatic rule and stored group', () => {
  assert.equal(groupOf({ id:'x', type:'out', savings:true }), 'poupanca');
  assert.equal(groupOf({ id:'restaurantes', type:'out', savings:false }), 'desejo');
  assert.equal(groupOf({ id:'lazer', type:'out' }), 'desejo');
  assert.equal(groupOf({ id:'carro', type:'out', savings:false }), 'necessidade');
  assert.equal(groupOf({ id:'meu', type:'out', savings:false }), 'necessidade');
  assert.equal(groupOf({ id:'restaurantes', type:'out', group:'necessidade' }), 'necessidade');
  assert.equal(groupOf({ id:'x', type:'out', group:'invalido', savings:true }), 'poupanca');
  assert.deepEqual(withGroup({ id:'x', type:'out', savings:false, group:'poupanca' }).savings, true);
  assert.equal(withGroup({ id:'x', type:'out', savings:true, group:'desejo' }).savings, false);
  const inc = withGroup({ id:'salario', type:'in', savings:false });
  assert.equal(inc.savings, false); assert.ok(!('group' in inc));
});
test('rule with leftover', () => {
  assert.deepEqual(ruleModel(ms, cats, '2026-11', m => m.profileId === 'a'),
    { nec:30000, des:20000, pou:150000, total:200000, pct:{ nec:15, des:10, pou:75 } });
});
test('rule spending more than income', () => {
  const x = [mv('c','in',10000,'salario','2026-05-01'), mv('c','out',12000,'carro','2026-05-02'), mv('c','out',1000,'inv','2026-05-03')];
  const r = ruleModel(x, cats, '2026-05');
  assert.deepEqual(r.pct, { nec:92, des:0, pou:8 }); assert.equal(r.total, 13000); assert.equal(r.pou, 1000);
});
test('rule empty period', () => {
  const r = ruleModel(ms, cats, '2030-01');
  assert.equal(r.pct, null); assert.equal(r.total, 0);
});
test('rounded parts may sum to 99, never NaN', () => {
  const x = [mv('c','out',100,'carro','2026-06-01'), mv('c','out',100,'restaurantes','2026-06-02'), mv('c','out',100,'inv','2026-06-03')];
  assert.deepEqual(ruleModel(x, cats, '2026-06').pct, { nec:33, des:33, pou:33 });
});
test('orphan category counts as necessidade', () => {
  const x = [mv('c','out',500,'apagada','2026-07-01')];
  assert.equal(categoryOf(cats, 'apagada').group, 'necessidade');
  assert.deepEqual(ruleModel(x, cats, '2026-07'), { nec:500, des:0, pou:0, total:500, pct:{ nec:100, des:0, pou:0 } });
});
test('savings rate unchanged for an old savings category', () => {
  const old = base;
  const grouped = base.map(c => c.id === 'inv' ? { ...c, group:'poupanca' } : c);
  const a = periodStats(baseMoves, old, '2026-11', m => m.profileId === 'a');
  assert.deepEqual(a, periodStats(baseMoves, grouped, '2026-11', m => m.profileId === 'a'));
  assert.equal(a.rate, 0.85);
  assert.equal(categoryOf(old, 'inv').group, 'poupanca');
});
