// Shell smoke test in demo mode: tabs, + button, touch-action, routing.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { SHOTS, waitFor } from './helpers.mjs';

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  await chrome.goto(`${server.url}/?demo=1&unlock=a#/mes/2026-11`);
  await waitFor(chrome, `!!document.querySelector('.tabs')`);

  assert.deepEqual(await chrome.eval(`[...document.querySelectorAll('.tabs button')].map(b => b.textContent.trim())`),
    ['Mês', 'Ano', 'Categorias']);
  assert.equal(await chrome.eval(`document.querySelector('.tabs button.on').textContent`), 'Mês');
  const fabVisible = `(() => { const f = document.querySelector('.fab'); return !!f && getComputedStyle(f).display !== 'none' && f.getBoundingClientRect().width > 0; })()`;
  assert.equal(await chrome.eval(fabVisible), true, 'FAB visível');
  assert.equal(await chrome.eval(`getComputedStyle(document.querySelector('button')).touchAction`), 'manipulation');
  assert.equal(await chrome.eval(`getComputedStyle(document.getElementById('app')).backgroundColor`), 'rgb(247, 242, 234)');
  assert.equal(await chrome.eval(`getComputedStyle(document.querySelector('.fab')).backgroundColor`), 'rgb(95, 107, 46)');
  assert.equal(await chrome.eval(`window.__demo.store.getState().profiles.every(p => p.pinHash && p.pinSalt && p.pinIter === 100000)`), true);
  // demo mode never loads Firebase
  assert.equal(await chrome.eval(`performance.getEntriesByType('resource').some(e => /gstatic|firebase/.test(e.name))`), false);
  await chrome.screenshot(`${SHOTS}/shell-mes.png`, { width: 390, height: 844 });

  // the + button opens the form route and hides itself
  await chrome.click('.fab');
  await waitFor(chrome, `location.hash === '#/registar'`);
  assert.equal(await chrome.eval(fabVisible), false, 'FAB escondido em #/registar');

  // Ano opens the year of the month last shown; Mês returns to that month
  await chrome.eval(`location.hash = '#/mes/2025-07/casa'`);
  await waitFor(chrome, `document.querySelector('.tabs button.on')?.textContent === 'Mês'`);
  assert.equal(await chrome.eval(fabVisible), true);
  await chrome.click('.tabs button[data-v="ano"]');
  await waitFor(chrome, `location.hash === '#/ano/2025/casa'`);
  assert.equal(await chrome.eval(`document.querySelector('.tabs button.on').textContent`), 'Ano');
  await chrome.click('.tabs button[data-v="categorias"]');
  await waitFor(chrome, `location.hash === '#/categorias'`);
  await chrome.click('.tabs button[data-v="mes"]');
  await waitFor(chrome, `location.hash === '#/mes/2025-07/casa'`);

  // Mac width: centred column of at most 480px
  await chrome.screenshot(`${SHOTS}/shell-mac.png`, { width: 1000, height: 700 });
  assert.equal(await chrome.eval(`document.getElementById('app').getBoundingClientRect().width`), 480);

  // confirm sheet resolves with the button pressed
  const sheet = `import('/js/ui/dialog.js').then(m => { window.__ans = m.confirmSheet({ message: 'Apagar este movimento?', ok: 'Apagar', danger: true }); })`;
  await chrome.eval(sheet);
  assert.equal(await chrome.eval(`document.querySelector('.sheet .btn.danger').textContent`), 'Apagar');
  await chrome.screenshot(`${SHOTS}/shell-sheet.png`, { width: 390, height: 844 });
  await chrome.click('.sheet .btn.danger');
  assert.equal(await chrome.eval(`window.__ans`), true);
  await chrome.eval(sheet);
  await chrome.click('.sheet .btn.plain');
  assert.equal(await chrome.eval(`window.__ans`), false);
  assert.equal(await chrome.eval(`document.querySelectorAll('.shade').length`), 0);


  assert.deepEqual(chrome.pageErrors(), []);
  console.log('ok   shell');
  code = 0;
} catch (e) {
  console.error('FAIL shell\n    ', e.stack || e.message);
  if (chrome) for (const err of chrome.pageErrors()) console.error('PAGE ERROR', err);
} finally {
  await chrome?.close();
  await server?.close();
}
process.exit(code);
