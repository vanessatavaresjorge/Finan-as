// Wide drawer in demo mode: saving or deleting closes it over the screen behind (filter and Ano kept,
// no history loop), double Esc / Cancelar go back one step only, focus on the amount, a foreign id
// redirects without a new history entry, and the export range survives store updates.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { todayISO } from '../../js/logic/format.js';
import { SHOTS, waitFor } from './helpers.mjs';

const today = todayISO();
const ym = today.slice(0, 7);
const year = today.slice(0, 4);
const chipBy = name => `[...document.querySelectorAll('#chips .chip')].find(b => b.textContent.includes(${JSON.stringify(name)}))`;
const esc = `(document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`;
const settle = () => new Promise(r => setTimeout(r, 400));
const filtered = `#/mes/${ym}/cat/supermercado`;

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  await chrome.setViewport(1280, 800);
  await chrome.goto(`${server.url}/?demo=1&unlock=a#/ano/${year}`);
  await waitFor(chrome, `!!document.querySelector('.sidebar')`);

  // ---- Save from a filtered table: filter kept, new move in the table, Back does not reopen the drawer ----
  await chrome.eval(`location.hash = '${filtered}'`);
  await waitFor(chrome, `!!document.querySelector('.movfilter')`);
  await chrome.click('.sidebar .add');
  await waitFor(chrome, `location.hash === '#/registar' && !!document.querySelector('.drawer #amt')`);
  assert.equal(await chrome.eval(`document.activeElement?.id`), 'amt', 'foco no valor');
  await chrome.type('#amt', '7,7');
  await chrome.eval(`${chipBy('Supermercado')}.click()`);
  await chrome.type('#note', 'no filtro');
  await chrome.click('.drawer [data-act="save"]');
  await waitFor(chrome, `location.hash === '${filtered}' && !document.querySelector('.drawer')`);
  assert.equal(await chrome.eval(`!!document.querySelector('.movfilter')`), true);
  assert.equal(await chrome.eval(`[...document.querySelectorAll('table.movs tbody tr')].some(r => r.textContent.includes('no filtro'))`), true);
  await chrome.eval(`history.back()`);
  await waitFor(chrome, `location.hash === '#/ano/${year}'`);
  await settle();
  assert.equal(await chrome.eval(`location.hash === '#/ano/${year}' && !document.querySelector('.drawer')`), true);

  // ---- Save from Ano returns to Ano ----
  await chrome.click('.sidebar .add');
  await waitFor(chrome, `!!document.querySelector('.drawer #amt')`);
  await chrome.type('#amt', '3');
  await chrome.eval(`${chipBy('Carro')}.click()`);
  await chrome.click('.drawer [data-act="save"]');
  await waitFor(chrome, `!document.querySelector('.drawer')`);
  assert.equal(await chrome.eval(`location.hash`), `#/ano/${year}`);
  assert.equal(await chrome.eval(`document.querySelector('.sidebar .nav.on').textContent`), 'Ano');

  // ---- Delete from the drawer: Back never loops into an edit route ----
  await chrome.eval(`location.hash = '#/mes/${ym}'`);
  await waitFor(chrome, `!!document.querySelector('table.movs tbody tr')`);
  await chrome.click('table.movs tbody tr');
  await waitFor(chrome, `location.hash.startsWith('#/editar/') && !!document.querySelector('.drawer #amt')`);
  assert.notEqual(await chrome.eval(`document.activeElement?.id`), 'amt', 'a editar: sem foco especial');
  const delId = await chrome.eval(`decodeURIComponent(location.hash.slice('#/editar/'.length))`);
  await chrome.click('.drawer [data-act="del"]');
  await waitFor(chrome, `!!document.querySelector('.shade [data-act="sheet-ok"]')`);
  await chrome.click('.shade [data-act="sheet-ok"]');
  await waitFor(chrome, `location.hash === '#/mes/${ym}' && !document.querySelector('.drawer')`);
  assert.equal(await chrome.eval(`__demo.store.getState().moves.some(m => m.id === ${JSON.stringify(delId)})`), false);
  await chrome.eval(`history.back()`);
  await waitFor(chrome, `location.hash === '#/ano/${year}'`);
  await settle();
  assert.equal(await chrome.eval(`location.hash`), `#/ano/${year}`, 'sem voltar a editar');
  assert.equal(await chrome.eval(`!!document.querySelector('.drawer')`), false);

  // ---- Double Esc / double Cancelar: back one step only ----
  await chrome.eval(`location.hash = '#/mes/${ym}'`);
  await waitFor(chrome, `!!document.querySelector('table.movs')`);
  await chrome.click('.sidebar .add');
  await waitFor(chrome, `!!document.querySelector('.drawer #amt')`);
  await chrome.eval(`${esc}; ${esc}`);
  await waitFor(chrome, `!document.querySelector('.drawer')`);
  await settle();
  assert.equal(await chrome.eval(`location.hash`), `#/mes/${ym}`, 'duas vezes Esc');
  await chrome.click('.sidebar .add');
  await waitFor(chrome, `!!document.querySelector('.drawer #amt')`);
  await chrome.eval(`(b => { b.click(); b.click(); })(document.querySelector('[data-act="drawer-cancel"]'))`);
  await waitFor(chrome, `!document.querySelector('.drawer')`);
  await settle();
  assert.equal(await chrome.eval(`location.hash`), `#/mes/${ym}`, 'duas vezes Cancelar');

  // ---- A move of the other profile: redirect replaces the entry (both layouts) ----
  const other = await chrome.eval(`__demo.store.getState().moves.find(m => m.profileId === 'b').id`);
  for (const [w, h] of [[1280, 800], [390, 844]]) {
    await chrome.setViewport(w, h);
    await waitFor(chrome, `document.body.classList.contains('wide') === ${w >= 1024}`);
    // fresh entries, so no forward entry is left to be dropped
    await chrome.eval(`location.hash = '#/categorias'`);
    await waitFor(chrome, `location.hash === '#/categorias'`);
    await chrome.eval(`location.hash = '#/ano/${year}'`);
    await waitFor(chrome, `location.hash === '#/ano/${year}'`);
    const len = await chrome.eval(`history.length`);
    await chrome.eval(`location.hash = '#/editar/${encodeURIComponent(other)}'`);
    await waitFor(chrome, `location.hash === '#/mes/${ym}'`);
    assert.equal(await chrome.eval(`history.length`), len + 1, `sem entrada extra (${w})`);
    await chrome.eval(`history.back()`);
    await waitFor(chrome, `location.hash === '#/ano/${year}'`);
  }

  // ---- Phone: saving still opens the month of the move; no special focus ----
  await chrome.click('.fab');
  await waitFor(chrome, `!!document.querySelector('#amt')`);
  await chrome.type('#amt', '2');
  await chrome.eval(`${chipBy('Carro')}.click()`);
  await chrome.click('[data-act="save"]');
  await waitFor(chrome, `location.hash === '#/mes/${ym}'`);

  // ---- Export: the chosen range survives store updates ----
  await chrome.setViewport(1280, 800);
  await waitFor(chrome, `document.body.classList.contains('wide')`);
  await chrome.click('.sidebar .nav[data-v="exportar"]');
  await waitFor(chrome, `!!document.querySelector('.wexport')`);
  const pick = (id, v) => `(s => { s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change', { bubbles: true })); })(document.getElementById(${JSON.stringify(id)}))`;
  const prevYear = String(Number(year) - 1);
  await chrome.eval(`${pick('ex-from-m', '03')}; ${pick('ex-from-y', prevYear)}; ${pick('ex-to-m', '02')}`);
  const range = `['ex-from-m','ex-from-y','ex-to-m','ex-to-y'].map(i => document.getElementById(i).value)`;
  const chosen = ['03', prevYear, '02', year];
  assert.deepEqual(await chrome.eval(range), chosen);
  await chrome.eval(`__demo.store.addMove({ profileId: 'b', type: 'out', cents: 100, categoryId: 'carro', date: '${today}', note: '' })`);
  await settle();
  assert.deepEqual(await chrome.eval(range), chosen, 'intervalo mantido');
  await chrome.screenshot(`${SHOTS}/wide-drawer-export.png`, { width: 1280, height: 800 });

  assert.deepEqual(chrome.pageErrors(), []);
  console.log('ok   wide-drawer');
  code = 0;
} catch (e) {
  console.error('FAIL wide-drawer\n    ', e.stack || e.message);
  if (chrome) for (const err of chrome.pageErrors()) console.error('PAGE ERROR', err);
} finally {
  await chrome?.close();
  await server?.close();
}
process.exit(code);
