// Register / edit form and category sheet in demo mode. The month screen is still a placeholder
// (Task 12), so saving and deleting are checked through the hash and the store contents.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { SHOTS, waitFor } from './helpers.mjs';

const PHONE = { width: 390, height: 844 };
const text = sel => `document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`;
const val = sel => `document.querySelector(${JSON.stringify(sel)})?.value`;
const chips = `[...document.querySelectorAll('#chips .chip:not(.new)')].map(b => b.textContent.trim())`;
const chipBy = name => `[...document.querySelectorAll('#chips .chip')].find(b => b.textContent.includes(${JSON.stringify(name)}))`;
const OTHER = `__demo.store.addMove({ profileId: 'b', type: 'out', cents: 500, categoryId: 'carro', date: '2026-11-02', note: 'outro aparelho' })`;

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  await chrome.goto(`${server.url}/?demo=1&unlock=a#/registar`);
  await waitFor(chrome, `!!document.querySelector('#amt')`);

  // ---- Layout and defaults ----
  assert.equal(await chrome.eval(`document.querySelector('.seg button.on').textContent`), 'Saída');
  assert.equal(await chrome.eval(val('#date')), new Date().toLocaleDateString('sv-SE'));
  assert.equal(await chrome.eval(`document.querySelector('#amt').inputMode`), 'decimal');
  assert.equal(await chrome.eval(`document.querySelector('.tabs button.on')?.textContent ?? null`), null);
  assert.equal(await chrome.eval(`document.querySelector('.fab').hidden`), true);
  assert.equal(await chrome.eval(`${chips}.some(t => t.includes('Salário'))`), false);
  await chrome.screenshot(`${SHOTS}/form-new.png`, PHONE);

  // ---- Validation keeps the form ----
  await chrome.click('[data-act="save"]');
  assert.equal(await chrome.eval(text('.error')), 'Escreve um valor maior que zero.');
  assert.equal(await chrome.eval(`location.hash`), '#/registar');
  await chrome.type('#amt', '12,');
  await chrome.click('[data-act="save"]');
  assert.equal(await chrome.eval(text('.error')), 'Valor inválido. Usa por exemplo 12,50.');
  await chrome.type('#amt', '12,5');
  await chrome.click('[data-act="save"]');
  assert.equal(await chrome.eval(text('.error')), 'Escolhe uma categoria.');
  assert.equal(await chrome.eval(val('#amt')), '12,5');

  // ---- Entrada shows only income chips; switching clears the chosen category ----
  await chrome.eval(`${chipBy('Supermercado')}.click()`);
  await chrome.eval(`document.querySelector('.seg button[data-v="in"]').click()`);
  assert.deepEqual(await chrome.eval(chips), ['💼Salário', '💶Outros']);
  assert.equal(await chrome.eval(`document.querySelectorAll('#chips .chip.on').length`), 0);
  await chrome.screenshot(`${SHOTS}/form-in.png`, PHONE);
  await chrome.eval(`document.querySelector('.seg button[data-v="out"]').click()`);
  assert.equal(await chrome.eval(`document.querySelectorAll('#chips .chip.on').length`), 0, 'a categoria de saída não volta sozinha');

  // ---- Save: 12,5 € Supermercado ----
  await chrome.eval(`${chipBy('Supermercado')}.click()`);
  await chrome.type('#note', '  teste  ');
  await chrome.screenshot(`${SHOTS}/form-filled.png`, PHONE);
  await chrome.click('[data-act="save"]');
  const today = await chrome.eval(`new Date().toLocaleDateString('sv-SE')`);
  await waitFor(chrome, `location.hash === '#/mes/${today.slice(0, 7)}'`);
  const mv = await chrome.eval(`__demo.store.getState().moves.find(m => m.note === 'teste')`);
  assert.deepEqual({ ...mv, id: 0, createdAt: 0 },
    { id: 0, profileId: 'a', type: 'out', cents: 1250, categoryId: 'supermercado', date: today, note: 'teste', createdAt: 0 });

  // ---- Review Focus 4: data from the other device while typing ----
  await chrome.eval(`location.hash = '#/registar'`);
  await waitFor(chrome, `!!document.querySelector('#amt')`);
  await chrome.type('#amt', '33,3');
  await chrome.type('#note', 'a escrever');
  await chrome.eval(OTHER);
  assert.equal(await chrome.eval(val('#amt')), '33,3');
  assert.equal(await chrome.eval(val('#note')), 'a escrever');
  await chrome.click('#chips .chip.new');
  await waitFor(chrome, `!!document.querySelector('.sheet #catname')`);
  assert.equal(await chrome.eval(text('.sheet .title')), 'Nova categoria de saída');
  assert.equal(await chrome.eval(`document.querySelectorAll('.emojis button').length`), 54);
  assert.equal(await chrome.eval(`!!document.querySelector('.sheet .switch')`), true);
  await chrome.type('#catname', 'Ginásio');
  await chrome.eval(OTHER);
  await chrome.eval(`__demo.store.addCategory({ name: 'Outra', type: 'out', icon: '⭐', savings: false })`);
  assert.equal(await chrome.eval(val('#catname')), 'Ginásio');
  assert.equal(await chrome.eval(`document.querySelectorAll('.sheet').length`), 1);
  assert.equal(await chrome.eval(val('#amt')), '33,3');
  await chrome.screenshot(`${SHOTS}/catsheet-new.png`, PHONE);
  // sheet validation, verbatim
  await chrome.type('#catname', 'Carro');
  await chrome.click('[data-act="sheet-save"]');
  assert.equal(await chrome.eval(text('.sheet .error')), 'Já existe uma categoria com esse nome.');
  await chrome.type('#catname', 'Ginásio');
  await chrome.eval(`document.querySelector('.emojis button[data-v="🏋️"]').click()`);
  await chrome.click('.sheet [data-act="toggle-sav"]');
  await chrome.click('[data-act="sheet-save"]');
  await waitFor(chrome, `!document.querySelector('.sheet')`);
  assert.equal(await chrome.eval(`document.querySelector('#chips .chip.on')?.textContent.trim()`), '🏋️Ginásio');
  assert.equal(await chrome.eval(`__demo.store.getState().categories.find(c => c.name === 'Ginásio').savings`), true);
  assert.equal(await chrome.eval(val('#amt')), '33,3');
  assert.equal(await chrome.eval(val('#note')), 'a escrever');
  // Cancelar creates nothing
  const before = await chrome.eval(`__demo.store.getState().categories.length`);
  await chrome.click('#chips .chip.new');
  await chrome.type('#catname', 'Descartada');
  await chrome.click('.sheet [data-act="sheet-cancel"]');
  assert.equal(await chrome.eval(`!document.querySelector('.sheet') && __demo.store.getState().categories.length`), before);
  // Entrada sheet has no savings switch
  await chrome.eval(`document.querySelector('.seg button[data-v="in"]').click()`);
  await chrome.click('#chips .chip.new');
  assert.equal(await chrome.eval(text('.sheet .title')), 'Nova categoria de entrada');
  assert.equal(await chrome.eval(`!!document.querySelector('.sheet .switch')`), false);
  await chrome.click('.sheet [data-act="sheet-cancel"]');

  // ---- Edit: value shown as 12,50; the type of the category does not change ----
  await chrome.eval(`location.hash = '#/editar/${mv.id}'`);
  await waitFor(chrome, `!!document.querySelector('#amt')`);
  assert.equal(await chrome.eval(val('#amt')), '12,50');
  assert.equal(await chrome.eval(val('#note')), 'teste');
  assert.equal(await chrome.eval(`document.querySelector('#chips .chip.on')?.textContent.trim()`), '🛒Supermercado');
  assert.equal(await chrome.eval(text('[data-act="del"]')), 'Apagar movimento');
  await chrome.screenshot(`${SHOTS}/form-edit.png`, PHONE);
  await chrome.type('#amt', '20');
  await chrome.type('#date', '2026-12-05'); // future dates are allowed
  await chrome.click('[data-act="save"]');
  await waitFor(chrome, `location.hash === '#/mes/2026-12'`);
  assert.deepEqual(await chrome.eval(`(m => [m.cents, m.date, m.profileId])(__demo.store.getState().moves.find(m => m.id === '${mv.id}'))`),
    [2000, '2026-12-05', 'a']);

  // ---- Apagar: confirm sheet, Cancelar keeps, Apagar removes ----
  await chrome.eval(`location.hash = '#/editar/${mv.id}'`);
  await waitFor(chrome, `!!document.querySelector('#amt')`);
  await chrome.click('[data-act="del"]');
  await waitFor(chrome, `!!document.querySelector('.shade .sheet')`);
  assert.equal(await chrome.eval(text('.shade .title')), 'Apagar este movimento?');
  await chrome.click('.shade [data-act="sheet-cancel"]');
  assert.equal(await chrome.eval(`__demo.store.getState().moves.some(m => m.id === '${mv.id}')`), true);
  await chrome.click('[data-act="del"]');
  await waitFor(chrome, `!!document.querySelector('.shade .sheet')`);
  await chrome.click('.shade [data-act="sheet-ok"]');
  await waitFor(chrome, `location.hash === '#/mes/2026-12'`);
  assert.equal(await chrome.eval(`__demo.store.getState().moves.some(m => m.id === '${mv.id}')`), false);

  // ---- Another profile's movement cannot be edited ----
  const foreign = await chrome.eval(`__demo.store.getState().moves.find(m => m.profileId === 'b').id`);
  await chrome.eval(`location.hash = '#/editar/${foreign}'`);
  await waitFor(chrome, `location.hash === '#/mes/${today.slice(0, 7)}'`);
  assert.equal(await chrome.eval(`!!document.querySelector('#amt')`), false);

  // ---- Store error: shown under the button, form kept ----
  await chrome.eval(`location.hash = '#/registar'`);
  await waitFor(chrome, `!!document.querySelector('#amt')`);
  await chrome.eval(`window.__add = __demo.store.addMove; __demo.store.addMove = () => { throw new Error('Sem ligação.'); }`);
  await chrome.type('#amt', '7 €');
  await chrome.type('#note', 'mantém');
  await chrome.eval(`${chipBy('Carro')}.click()`);
  await chrome.click('[data-act="save"]');
  await waitFor(chrome, `document.querySelector('.error')?.textContent === 'Sem ligação.'`);
  assert.equal(await chrome.eval(val('#amt')), '7 €');
  assert.equal(await chrome.eval(val('#note')), 'mantém');
  assert.equal(await chrome.eval(`document.querySelector('#chips .chip.on')?.textContent.trim()`), '🚗Carro');
  assert.equal(await chrome.eval(`document.querySelector('[data-act="save"]').disabled`), false);
  await chrome.eval(`__demo.store.addMove = window.__add`);

  // ---- Category sheet in edit mode: type fixed, savings only for out ----
  await chrome.eval(`(async () => {
    const m = await import('/js/ui/catsheet.js');
    const cat = __demo.store.getState().categories.find(c => c.id === 'salario');
    window.__ed = m.openCategorySheet({ store: __demo.store }, { type: 'out', category: cat });
  })()`);
  await waitFor(chrome, `!!document.querySelector('.sheet #catname')`);
  assert.equal(await chrome.eval(text('.sheet .title')), 'Editar categoria');
  assert.equal(await chrome.eval(val('#catname')), 'Salário');
  assert.equal(await chrome.eval(`!!document.querySelector('.sheet .switch')`), false);
  await chrome.type('#catname', 'Ordenado');
  await chrome.click('[data-act="sheet-save"]');
  assert.equal(await chrome.eval(`window.__ed`), 'salario');
  assert.deepEqual(await chrome.eval(`(c => [c.name, c.type])(__demo.store.getState().categories.find(c => c.id === 'salario'))`), ['Ordenado', 'in']);

  assert.deepEqual(chrome.pageErrors(), []);
  console.log('ok   form');
  code = 0;
} catch (e) {
  console.error('FAIL form\n    ', e.stack || e.message);
  if (chrome) for (const err of chrome.pageErrors()) console.error('PAGE ERROR', err);
} finally {
  await chrome?.close();
  await server?.close();
}
process.exit(code);
