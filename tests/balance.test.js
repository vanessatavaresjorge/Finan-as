import test from 'node:test';
import assert from 'node:assert/strict';
import { lastDay, balanceAt, houseBalance, parseSignedCents, validateOpening } from '../js/logic/balance.js';
import { mv } from './fixture.js';

const A = { id:'a', name:'Ana', openingCents: 100000, openingDate: '2026-10-31' };
const B = { id:'b', name:'Rui' };
const ms = [
  mv('a','in', 200000,'salario','2026-10-30'),
  mv('a','out', 5000,'carro',  '2026-10-31'),
  mv('a','out',30000,'carro',  '2026-11-03'),
  mv('a','out',50000,'inv',    '2026-11-10'),
  mv('a','in', 200000,'salario','2026-11-30'),
  mv('a','out',10000,'carro',  '2027-01-05'),
  mv('b','in', 100000,'salario','2026-11-02'), mv('b','out',20000,'carro','2026-11-04'),
];
test('lastDay', () => {
  assert.equal(lastDay('2026-11'), '2026-11-30');
  assert.equal(lastDay('2028-02'), '2028-02-29');
  assert.equal(lastDay('2026-12'), '2026-12-31');
});
test('balance with opening', () => {
  assert.equal(balanceAt(ms, A, '2026-09'), null);
  assert.equal(balanceAt(ms, A, '2026-10'), 100000);
  assert.equal(balanceAt(ms, A, '2026-11'), 220000);
  assert.equal(balanceAt(ms, A, '2026-12'), 220000);
  assert.equal(balanceAt(ms, A, '2027-01'), 210000);
});
test('balance without opening starts at zero', () => {
  assert.equal(balanceAt(ms, B, '2026-10'), 0);
  assert.equal(balanceAt(ms, B, '2026-11'), 80000);
});
test('house balance', () => {
  assert.deepEqual(houseBalance(ms, [A, B], '2026-11'), { total: 300000, split: [{name:'Ana',cents:220000},{name:'Rui',cents:80000}] });
  assert.deepEqual(houseBalance(ms, [A, B], '2026-09'), { total: 0, split: [{name:'Ana',cents:null},{name:'Rui',cents:0}] });
  assert.deepEqual(houseBalance(ms, [A], '2026-09'), { total: null, split: [{name:'Ana',cents:null}] });
});
test('parseSignedCents', () => {
  for (const [t, c] of [['-50',-5000],['−50,00',-5000],['1 200,00',120000],['0',0]]) assert.equal(parseSignedCents(t), c, t);
  for (const t of ['50-','--5','','abc','-','1000000000']) assert.equal(parseSignedCents(t), null, t);
});
test('validateOpening', () => {
  assert.equal(validateOpening({cents:null, date:'2026-11-01'}, '2026-11-07'), 'Escreve um valor, por exemplo 1 200,00 ou −50,00.');
  assert.equal(validateOpening({cents:100, date:'2026-11-08'}, '2026-11-07'), 'A data não pode ser depois de hoje.');
  assert.equal(validateOpening({cents:-100, date:'2026-11-07'}, '2026-11-07'), null);
});
