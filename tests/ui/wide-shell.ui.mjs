// Wide shell (window >= 1024 px) in demo mode: sidebar, register drawer, resize while typing,
// category sheet as a right drawer, and the phone layout back below 1024 px.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { SHOTS, waitFor } from './helpers.mjs';

const shown = sel => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0; })()`;
const display = sel => `getComputedStyle(document.querySelector(${JSON.stringify(sel)})).display`;
const val = sel => `document.querySelector(${JSON.stringify(sel)})?.value`;
const chipBy = name => `[...document.querySelectorAll('#chips .chip')].find(b => b.textContent.includes(${JSON.stringify(name)}))`;
const esc = `(document.activeElement || document.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`;
const monthTitle = `document.querySelector('.screen')?.textContent.includes('Novembro 2026')`;

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  await chrome.setViewport(1280, 800);
  await chrome.goto(`${server.url}/?demo=1&unlock=a#/mes/2026-11`);
  await waitFor(chrome, `!!document.querySelector('.sidebar')`);

  // ---- Sidebar instead of tabs and + button ----
  assert.equal(await chrome.eval(shown('.sidebar')), true);
  assert.deepEqual(await chrome.eval(`[...document.querySelectorAll('.sidebar .nav')].map(b => b.textContent.trim())`),
    ['Mês', 'Ano', 'Categorias', 'Exportar Excel']);
  assert.equal(await chrome.eval(`document.querySelector('.sidebar .nav.on').textContent`), 'Mês');
  assert.match(await chrome.eval(`document.querySelector('.sidebar .who').textContent`), /^Perfil: \S/);
  assert.equal(await chrome.eval(`document.querySelector('.sidebar .add').textContent.trim()`), '+ Registar');
  assert.equal(await chrome.eval(display('.tabs')), 'none');
  assert.equal(await chrome.eval(display('.fab')), 'none');
  assert.equal(await chrome.eval(`document.body.classList.contains('wide')`), true);
  assert.equal(await chrome.eval(`getComputedStyle(document.querySelector('.sidebar')).width`), '200px');
  assert.ok(await chrome.eval(`document.querySelector('.screen').getBoundingClientRect().width`) <= 1400);
  assert.equal(await chrome.eval(monthTitle), true);
  await chrome.screenshot(`${SHOTS}/wide-shell.png`, { width: 1280, height: 800 });

  // ---- Sidebar navigation: Ano opens the year of the month shown; Exportar Excel has its own screen ----
  await chrome.eval(`location.hash = '#/mes/2025-07'`);
  await waitFor(chrome, `document.querySelector('.screen')?.textContent.includes('2025')`);
  await chrome.click('.sidebar .nav[data-v="ano"]');
  await waitFor(chrome, `location.hash === '#/ano/2025'`);
  assert.equal(await chrome.eval(`document.querySelector('.sidebar .nav.on').textContent`), 'Ano');
  await chrome.click('.sidebar .nav[data-v="exportar"]');
  await waitFor(chrome, `location.hash === '#/exportar'`);
  assert.equal(await chrome.eval(`document.querySelector('.sidebar .nav.on').textContent`), 'Exportar Excel');
  assert.equal(await chrome.eval(`document.querySelector('.screen').textContent.includes('Exportar Excel')`), true);
  await chrome.click('.sidebar .nav[data-v="mes"]');
  await waitFor(chrome, `location.hash === '#/mes/2025-07'`);
  await chrome.eval(`location.hash = '#/mes/2026-11'`);
  await waitFor(chrome, monthTitle);

  // ---- + Registar opens the drawer over the month; Esc closes it ----
  await chrome.click('.sidebar .add');
  await waitFor(chrome, `location.hash === '#/registar' && !!document.querySelector('.drawer #amt')`);
  assert.equal(await chrome.eval(shown('.drawer')), true);
  assert.equal(await chrome.eval(`document.querySelector('.drawer').getAttribute('role')`), 'dialog');
  assert.equal(await chrome.eval(`document.querySelector('.drawer .drawer-hd .title').textContent`), 'Registar movimento');
  assert.equal(await chrome.eval(monthTitle), true, 'o mês continua por trás');
  assert.equal(await chrome.eval(`document.querySelector('.drawer').getBoundingClientRect().width`), 420);
  await chrome.screenshot(`${SHOTS}/wide-drawer.png`, { width: 1280, height: 800 });
  await chrome.eval(esc);
  await waitFor(chrome, `location.hash === '#/mes/2026-11' && !document.querySelector('.drawer')`);
  assert.equal(await chrome.eval(`!!document.querySelector('.backdrop')`), false);

  // backdrop click = Cancelar
  await chrome.click('.sidebar .add');
  await waitFor(chrome, `!!document.querySelector('.drawer #amt')`);
  await chrome.click('.backdrop');
  await waitFor(chrome, `location.hash === '#/mes/2026-11' && !document.querySelector('.drawer')`);

  // ---- Review Focus 4: #/registar opened directly -> drawer over the current month ----
  const today = await chrome.eval(`new Date().toLocaleDateString('sv-SE')`);
  const ym = today.slice(0, 7);
  await chrome.goto(`${server.url}/?demo=1&unlock=a&n=2#/registar`);
  await waitFor(chrome, `!!document.querySelector('.drawer #amt')`);
  assert.equal(await chrome.eval(`document.querySelector('.sidebar .nav.on').textContent`), 'Mês');
  assert.equal(await chrome.eval(`!!document.querySelector(':scope #app > main.screen .monthnav')`), true, 'mês atual por trás');
  await chrome.click('.drawer [data-act="drawer-cancel"]');
  await waitFor(chrome, `location.hash === '#/mes/${ym}' && !document.querySelector('.drawer')`);

  // editar opened directly: same, with the edit title
  const mine = await chrome.eval(`__demo.store.getState().moves.find(m => m.profileId === 'a').id`);
  await chrome.goto(`${server.url}/?demo=1&unlock=a&n=3#/editar/${encodeURIComponent(mine)}`);
  await waitFor(chrome, `!!document.querySelector('.drawer #amt')`);
  assert.equal(await chrome.eval(`document.querySelector('.drawer .drawer-hd .title').textContent`), 'Editar movimento');
  assert.equal(await chrome.eval(`!!document.querySelector('#app > main.screen .monthnav')`), true);
  await chrome.eval(esc);
  await waitFor(chrome, `location.hash === '#/mes/${ym}' && !document.querySelector('.drawer')`);

  // ---- Save from the drawer: drawer closes, the month behind shows it ----
  await chrome.click('.sidebar .add');
  await waitFor(chrome, `!!document.querySelector('.drawer #amt')`);
  await chrome.type('#amt', '4,2');
  await chrome.eval(`${chipBy('Carro')}.click()`);
  await chrome.type('#note', 'pelo painel');
  await chrome.click('.drawer [data-act="save"]');
  await waitFor(chrome, `location.hash === '#/mes/${ym}' && !document.querySelector('.drawer')`);
  assert.equal(await chrome.eval(`__demo.store.getState().moves.some(m => m.note === 'pelo painel' && m.cents === 420)`), true);

  // ---- Review Focus 1: resize across 1024 px while typing ----
  await chrome.click('.sidebar .add');
  await waitFor(chrome, `!!document.querySelector('.drawer #amt')`);
  await chrome.type('#amt', '33,3');
  await chrome.eval(`${chipBy('Supermercado')}.click()`);
  await chrome.type('#date', '2026-10-15');
  await chrome.type('#note', 'a escrever');
  const typed = `[${val('#amt')}, document.querySelector('#chips .chip.on')?.textContent.trim(), ${val('#date')}, ${val('#note')}]`;
  const expected = ['33,3', '🛒Supermercado', '2026-10-15', 'a escrever'];
  await chrome.setViewport(800, 800);
  await waitFor(chrome, `!document.body.classList.contains('wide')`);
  assert.equal(await chrome.eval(`!!document.querySelector('.drawer') || !!document.querySelector('.sidebar')`), false);
  assert.equal(await chrome.eval(`!!document.querySelector('#app > main.screen #amt')`), true, 'formulário no ecrã');
  assert.deepEqual(await chrome.eval(typed), expected);
  assert.equal(await chrome.eval(`location.hash`), '#/registar');
  // a store update while narrow keeps the values too
  await chrome.eval(`__demo.store.addMove({ profileId: 'b', type: 'out', cents: 500, categoryId: 'carro', date: '2026-11-02', note: 'outro aparelho' })`);
  assert.deepEqual(await chrome.eval(typed), expected);
  await chrome.setViewport(1280, 800);
  await waitFor(chrome, `!!document.querySelector('.drawer #amt')`);
  assert.deepEqual(await chrome.eval(typed), expected);
  assert.equal(await chrome.eval(`!!document.querySelector('#app > main.screen .monthnav')`), true);
  await chrome.eval(esc);
  await waitFor(chrome, `!document.querySelector('.drawer')`);

  // ---- Category sheet: right drawer on wide; confirm sheet centred ----
  await chrome.click('.sidebar .nav[data-v="categorias"]');
  await waitFor(chrome, `location.hash === '#/categorias' && !!document.querySelector('.addcat')`);
  await chrome.click('.addcat[data-act="newcat"]');
  await waitFor(chrome, `!!document.querySelector('.sheet.side #catname')`);
  assert.deepEqual(await chrome.eval(`(r => [r.right === innerWidth, r.width, r.top, r.bottom === innerHeight])(document.querySelector('.sheet.side').getBoundingClientRect())`),
    [true, 420, 0, true]);
  await chrome.screenshot(`${SHOTS}/wide-catsheet.png`, { width: 1280, height: 800 });
  // Esc closes the sheet only
  await chrome.eval(esc);
  await waitFor(chrome, `!document.querySelector('.sheet')`);
  assert.equal(await chrome.eval(`location.hash`), '#/categorias');
  await chrome.eval(`import('/js/ui/dialog.js').then(m => { m.confirmSheet({ message: 'Teste?', ok: 'Sim' }); })`);
  await waitFor(chrome, `!!document.querySelector('.shade .sheet')`);
  assert.deepEqual(await chrome.eval(`(r => [r.width <= 440, Math.round(r.left + r.width / 2) === Math.round(innerWidth / 2), r.bottom < innerHeight])(document.querySelector('.sheet').getBoundingClientRect())`),
    [true, true, true]);
  await chrome.click('.sheet .btn.plain');

  // Esc inside the drawer while a category sheet is open closes only the sheet
  await chrome.click('.sidebar .add');
  await waitFor(chrome, `!!document.querySelector('.drawer #amt')`);
  await chrome.type('#amt', '9');
  await chrome.click('#chips .chip.new');
  await waitFor(chrome, `!!document.querySelector('.sheet.side')`);
  await chrome.eval(esc);
  await waitFor(chrome, `!document.querySelector('.sheet')`);
  assert.equal(await chrome.eval(`!!document.querySelector('.drawer') && location.hash`), '#/registar');
  assert.equal(await chrome.eval(val('#amt')), '9');
  await chrome.eval(esc);
  await waitFor(chrome, `!document.querySelector('.drawer')`);

  // ---- Narrow: exportar falls back to the month; phone layout unchanged ----
  await chrome.setViewport(390, 844);
  await waitFor(chrome, `!document.body.classList.contains('wide')`);
  await chrome.eval(`location.hash = '#/exportar'`);
  await waitFor(chrome, `location.hash === '#/mes/${ym}'`);
  assert.equal(await chrome.eval(`!!document.querySelector('.sidebar')`), false);
  assert.equal(await chrome.eval(shown('.tabs')), true);
  assert.equal(await chrome.eval(shown('.fab')), true);
  assert.equal(await chrome.eval(`document.getElementById('app').getBoundingClientRect().width`), 390);
  await chrome.screenshot(`${SHOTS}/wide-shell-narrow.png`, { width: 390, height: 844 });

  assert.deepEqual(chrome.pageErrors(), []);
  console.log('ok   wide-shell');
  code = 0;
} catch (e) {
  console.error('FAIL wide-shell\n    ', e.stack || e.message);
  if (chrome) for (const err of chrome.pageErrors()) console.error('PAGE ERROR', err);
} finally {
  await chrome?.close();
  await server?.close();
}
process.exit(code);
