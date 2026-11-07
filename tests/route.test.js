import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeHash } from '../js/logic/route.js';

test('routes', () => {
  assert.deepEqual(parseRoute('', '2026-11-06'), {name:'mes', ym:'2026-11', casa:false});
  assert.deepEqual(parseRoute('#/mes/2026-10/casa', '2026-11-06'), {name:'mes', ym:'2026-10', casa:true});
  assert.deepEqual(parseRoute('#/ano/2026/poupanca/casa', '2026-11-06'), {name:'ano', year:2026, mode:'poupanca', casa:true});
  assert.deepEqual(parseRoute('#/editar/xyz', '2026-11-06'), {name:'editar', moveId:'xyz', casa:false});
  assert.deepEqual(parseRoute('#/lixo', '2026-11-06'), {name:'mes', ym:'2026-11', casa:false});
  for (const h of ['#/mes/2026-10/casa','#/mes/2026-10/cat/carro','#/ano/2026/poupanca','#/categorias'])
    assert.equal(routeHash(parseRoute(h, '2026-11-06')), h);
});

test('more routes', () => {
  const t = '2026-11-06';
  assert.deepEqual(parseRoute('#/mes/2026-10/cat/carro', t), {name:'cat', ym:'2026-10', catId:'carro', casa:false});
  assert.deepEqual(parseRoute('#/mes/2026-10/entradas', t), {name:'entradas', ym:'2026-10', casa:false});
  assert.deepEqual(parseRoute('#/ano/2025', t), {name:'ano', year:2025, mode:'gastos', casa:false});
  assert.deepEqual(parseRoute('#/ano/2025/casa', t), {name:'ano', year:2025, mode:'gastos', casa:true});
  assert.deepEqual(parseRoute('#/categorias', t), {name:'categorias', casa:false});
  assert.deepEqual(parseRoute('#/registar', t), {name:'registar', casa:false});
  // invalid months, years and extra segments fall back to the current month
  for (const bad of ['#/mes/2026-13', '#/mes/2026-1', '#/ano/26', '#/mes/2026-10/xyz', '#/categorias/x', '#/editar/', '#/mes/2026-10/cat/'])
    assert.deepEqual(parseRoute(bad, t), {name:'mes', ym:'2026-11', casa:false}, bad);
  // ids with special characters survive the round trip
  const r = {name:'editar', moveId:'a b/ç', casa:false};
  assert.deepEqual(parseRoute(routeHash(r), t), r);
  for (const h of ['#/mes/2026-10','#/mes/2026-10/entradas','#/ano/2026','#/ano/2026/casa','#/ano/2026/poupanca/casa','#/registar','#/editar/xyz'])
    assert.equal(routeHash(parseRoute(h, t)), h);
});

test('export route (wide screens only)', () => {
  const t = '2026-11-06';
  assert.deepEqual(parseRoute('#/exportar', t), {name:'exportar', casa:false});
  assert.equal(routeHash({name:'exportar', casa:false}), '#/exportar');
  assert.equal(routeHash(parseRoute('#/exportar', t)), '#/exportar');
  for (const bad of ['#/exportar/x', '#/exportar/casa'])
    assert.deepEqual(parseRoute(bad, t), {name:'mes', ym:'2026-11', casa:false}, bad);
});
