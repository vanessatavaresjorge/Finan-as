import test from 'node:test';
import assert from 'node:assert/strict';
import { demoData } from '../js/demo-data.js';
import { DEFAULT_CATEGORIES } from '../js/logic/categories.js';
import { addMonths } from '../js/logic/format.js';

const today = '2026-11-06';

test('demo data: profiles and categories', () => {
  const d = demoData(today);
  assert.deepEqual(d.profiles.map(p => [p.id, p.name]), [['a', 'Perfil A'], ['b', 'Perfil B']]);
  for (const p of d.profiles) assert.deepEqual([p.pinHash, p.pinSalt, p.pinIter], [null, null, null]);
  for (const c of DEFAULT_CATEGORIES) assert.ok(d.categories.some(x => x.id === c.id));
  const inv = d.categories.find(c => c.id === 'inv');
  assert.deepEqual({ ...inv, order: 0 }, { id: 'inv', name: 'Investimentos', type: 'out', icon: '📈', savings: true, order: 0 });
  assert.equal(new Set(d.categories.map(c => c.order)).size, d.categories.length);
});

test('demo data: deterministic, 12 months up to today, valid moves', () => {
  const d = demoData(today);
  assert.deepEqual(demoData(today), d);
  const cats = new Map(d.categories.map(c => [c.id, c]));
  const months = Array.from({ length: 12 }, (_, i) => addMonths('2026-11', i - 11));
  assert.equal(new Set(d.moves.map(m => m.id)).size, d.moves.length);
  for (const m of d.moves) {
    assert.ok(['a', 'b'].includes(m.profileId));
    assert.ok(Number.isInteger(m.cents) && m.cents > 0);
    assert.equal(cats.get(m.categoryId).type, m.type);
    assert.match(m.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(m.date <= today && months.includes(m.date.slice(0, 7)), m.date);
    assert.equal(typeof m.note, 'string');
    assert.ok(Number.isInteger(m.createdAt));
  }
  for (const pid of ['a', 'b']) for (const ym of months) {
    const mine = d.moves.filter(m => m.profileId === pid && m.date.startsWith(ym));
    assert.ok(mine.some(m => m.categoryId === 'salario'), `${pid} ${ym} salário`);
  }
  const outUsed = new Set(d.moves.filter(m => m.type === 'out').map(m => m.categoryId));
  assert.ok([...cats.values()].filter(c => c.type === 'out').every(c => outUsed.has(c.id)));
  assert.ok(d.moves.some(m => m.categoryId === 'inv'));
  // profile B spends more than it earns in at least one month
  const negative = months.some(ym => {
    const mine = d.moves.filter(m => m.profileId === 'b' && m.date.startsWith(ym));
    const sum = t => mine.filter(m => m.type === t).reduce((s, m) => s + m.cents, 0);
    return sum('out') > sum('in');
  });
  assert.ok(negative);
});

test('demo data: other dates', () => {
  const d = demoData('2027-01-01');
  assert.ok(d.moves.every(m => m.date <= '2027-01-01' && m.date >= '2026-02-01'));
  assert.ok(d.moves.some(m => m.date === '2027-01-01'));
});
