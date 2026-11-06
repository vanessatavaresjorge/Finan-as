import test from 'node:test';
import assert from 'node:assert/strict';
import { niceScale, percentScale, yearModel } from '../js/logic/stats.js';
import { categories, profiles, moves, mv } from './fixture.js';

test('niceScale', () => {
  assert.deepEqual(niceScale(150000), {step:50000, top:150000});
  assert.deepEqual(niceScale(0), {step:50, top:100});
});
test('percentScale', () => {
  assert.deepEqual(percentScale([0.55, 0.87, null]), {min:0, max:100, step:50});
  assert.deepEqual(percentScale([-0.2, 0.5]), {min:-50, max:100, step:50});
});
test('gastos for one profile', () => {
  const y = yearModel({moves, categories, profiles, year:2026, view:'a', mode:'gastos', filter:'all'});
  assert.equal(y.months[9], 1000); assert.equal(y.months[10], 80000); assert.equal(y.total, 81000);
  assert.equal(y.average, 40500); assert.deepEqual(y.highest, {month:10, cents:80000}); assert.equal(y.split, null);
});
test('gastos filter without spending', () => {
  const y = yearModel({moves, categories, profiles, year:2026, view:'a', mode:'gastos', filter:'salario-inexistente'});
  assert.deepEqual([y.total, y.average, y.highest], [0, null, null]);
});
test('poupanca with a negative month', () => {
  const extra = [...moves, mv('a','in',10000,'salario','2026-03-01'), mv('a','out',12000,'carro','2026-03-02')];
  const y = yearModel({moves:extra, categories, profiles, year:2026, view:'a', mode:'poupanca'});
  assert.equal(y.months[0], null); assert.equal(y.months[2].rate, -0.2); assert.deepEqual(y.best, {month:10, rate:0.85});
  assert.equal(y.scale.min, -50);
});
test('casa year has per-person split and no notes', () => {
  const y = yearModel({moves, categories, profiles, year:2026, view:'casa', mode:'poupanca'});
  assert.deepEqual(y.monthSplit[10], [{name:'Ana',saved:170000,rate:0.85},{name:'Rui',saved:80000,rate:0.8}]);
  assert.ok(!JSON.stringify(y).includes('pneus'));
});
