import test from 'node:test';
import assert from 'node:assert/strict';
import { validRange, monthsInRange, exportData, exportFileName } from '../js/logic/export.js';
import { categories, profiles, moves, mv } from './fixture.js';

test('validRange', () => { assert.equal(validRange('2026-01','2026-11'), true); assert.equal(validRange('2026-11','2026-11'), true); assert.equal(validRange('2026-12','2026-01'), false); });
test('monthsInRange crosses years', () => assert.deepEqual(monthsInRange('2025-11','2026-02'), ['2025-11','2025-12','2026-01','2026-02']));
test('totals per month, profile and category, both profiles, no zero rows', () => {
  const { totals } = exportData({ moves, categories, profiles, from: '2026-11', to: '2026-11' });
  assert.deepEqual(totals, [
    { ym:'2026-11', profile:'Ana', type:'Saída',   category:'Carro',         savings:'Não', cents:30000 },
    { ym:'2026-11', profile:'Ana', type:'Saída',   category:'Investimentos', savings:'Sim', cents:50000 },
    { ym:'2026-11', profile:'Ana', type:'Entrada', category:'Salário',       savings:'Não', cents:200000 },
    { ym:'2026-11', profile:'Rui', type:'Saída',   category:'Carro',         savings:'Não', cents:20000 },
    { ym:'2026-11', profile:'Rui', type:'Entrada', category:'Salário',       savings:'Não', cents:100000 },
  ]);
});
test('range respected and summary includes empty months', () => {
  const { totals, summary } = exportData({ moves, categories, profiles, from: '2026-09', to: '2026-12' });
  assert.ok(totals.every(r => r.ym >= '2026-09' && r.ym <= '2026-12'));
  assert.equal(summary.length, 8);
  assert.deepEqual(summary.find(s => s.ym === '2026-12' && s.profile === 'Ana'), { ym:'2026-12', profile:'Ana', inn:0, out:0, saved:0, rate:null, balance:119000 });
  assert.deepEqual(summary.find(s => s.ym === '2026-11' && s.profile === 'Ana'), { ym:'2026-11', profile:'Ana', inn:200000, out:80000, saved:170000, rate:0.85, balance:119000 });
});
test('orphan category and no notes', () => {
  const extra = [...moves, mv('a','out',700,'apagada','2026-11-20','nota-secreta')];
  const data = exportData({ moves: extra, categories, profiles, from:'2026-11', to:'2026-11' });
  assert.ok(data.totals.some(r => r.category === 'Sem categoria' && r.cents === 700));
  assert.ok(!JSON.stringify(data).includes('nota-secreta') && !JSON.stringify(data).includes('pneus'));
});
test('moves of unknown profiles are ignored', () => {
  const extra = [...moves, mv('zz','out',999,'carro','2026-11-20')];
  const { totals } = exportData({ moves: extra, categories, profiles, from:'2026-11', to:'2026-11' });
  assert.ok(!totals.some(r => r.cents === 999));
});
test('file name', () => assert.equal(exportFileName('2025-03','2026-11'), 'financas-2025-03-a-2026-11.xlsx'));
test('summary balance: opening date respected, null before it', () => {
  const ps = [{ ...profiles[0], openingCents: 100000, openingDate: '2026-10-31' }, profiles[1]];
  const { summary } = exportData({ moves, categories, profiles: ps, from: '2026-10', to: '2026-11' });
  const get = (ym, n) => summary.find(s => s.ym === ym && s.profile === n).balance;
  assert.equal(get('2026-10', 'Ana'), 100000);
  assert.equal(get('2026-11', 'Ana'), 100000 + 200000 - 30000 - 50000);
  assert.equal(get('2026-11', 'Rui'), 80000);
  const early = exportData({ moves, categories, profiles: ps, from: '2026-09', to: '2026-09' }).summary;
  assert.equal(early.find(s => s.profile === 'Ana').balance, null);
});
