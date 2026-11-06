import test from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, DEFAULT_CATEGORIES, validateCategory, deletionPlan, nextOrder, sortCategories } from '../js/logic/categories.js';

test('icons', () => { assert.equal(ICONS.length, 54); assert.equal(new Set(ICONS).size, 54); });
test('defaults', () => {
  assert.deepEqual(DEFAULT_CATEGORIES.filter(c => c.type === 'out').map(c => c.name),
    ['Carro','Combustível','Restaurantes','Supermercado','Saúde','Beleza','Lazer','Via Verde']);
  assert.deepEqual(DEFAULT_CATEGORIES.filter(c => c.type === 'in').map(c => c.icon), ['💼','💶']);
  assert.ok(DEFAULT_CATEGORIES.every(c => c.savings === false));
  assert.deepEqual(DEFAULT_CATEGORIES.map(c => c.order), [0,1,2,3,4,5,6,7,8,9]);
  assert.deepEqual(DEFAULT_CATEGORIES.map(c => c.id),
    ['carro','combustivel','restaurantes','supermercado','saude','beleza','lazer','via-verde','salario','outros']);
});
const cats = [{id:'carro',name:'Carro',type:'out',icon:'🚗',savings:false,order:0},
              {id:'lazer',name:'Lazer',type:'out',icon:'🎬',savings:false,order:1},
              {id:'salario',name:'Salário',type:'in',icon:'💼',savings:false,order:2}];
test('validateCategory', () => {
  assert.equal(validateCategory({name:'  ',type:'out',icon:'🚗'}, cats), 'Escreve um nome.');
  assert.equal(validateCategory({name:'carro ',type:'out',icon:'🚗'}, cats), 'Já existe uma categoria com esse nome.');
  assert.equal(validateCategory({name:'Carro',type:'in',icon:'🚗'}, cats), null);
  assert.equal(validateCategory({name:'Carro',type:'out',icon:'🚗'}, cats, 'carro'), null);
  assert.equal(validateCategory({name:'x'.repeat(31),type:'out',icon:'🚗'}, cats), 'O nome pode ter no máximo 30 caracteres.');
  assert.equal(validateCategory({name:'Casa',type:'out',icon:''}, cats), 'Escolhe um símbolo.');
});
test('deletionPlan', () => {
  assert.deepEqual(deletionPlan('salario', cats, []), {allowed:false, reason:'Não podes eliminar a última categoria de entradas.'});
  const moves = [{categoryId:'carro',profileId:'a'},{categoryId:'carro',profileId:'b'},{categoryId:'lazer',profileId:'a'}];
  const p = deletionPlan('carro', cats, moves);
  assert.equal(p.allowed, true); assert.equal(p.moveCount, 2); assert.deepEqual(p.targets.map(c => c.id), ['lazer']);
});
test('deletionPlan last out', () => {
  const one = [cats[0], cats[2]];
  assert.deepEqual(deletionPlan('carro', one, []), {allowed:false, reason:'Não podes eliminar a última categoria de saídas.'});
});
test('nextOrder', () => { assert.equal(nextOrder(cats), 3); assert.equal(nextOrder([]), 0); });
test('sortCategories', () => {
  const mixed = [cats[1], cats[2], cats[0]];
  assert.deepEqual(sortCategories(mixed, 'out').map(c => c.id), ['carro','lazer']);
});
test('profile names', async () => {
  const { validateProfileName } = await import('../js/logic/categories.js');
  const profiles = [{id:'a', name:'Ana'}];
  assert.equal(validateProfileName('  ', profiles), 'Escreve um nome.');
  assert.equal(validateProfileName('x'.repeat(31), profiles), 'O nome pode ter no máximo 30 caracteres.');
  assert.equal(validateProfileName(' ana ', profiles), 'Já existe um perfil com esse nome.');
  assert.equal(validateProfileName('Ana', profiles, 'a'), null);
  assert.equal(validateProfileName('Rui', profiles), null);
});
