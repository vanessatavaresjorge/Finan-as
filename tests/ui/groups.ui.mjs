// Group choice (Necessidade / Desejo / Poupança) in the category sheet and tags in Categorias,
// phone and wide, demo mode.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { todayISO, addMonths } from '../../js/logic/format.js';
import { SHOTS, waitFor } from './helpers.mjs';

const ym = addMonths(todayISO().slice(0, 7), -8); // the demo month with a Carro move
const text = sel => `document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`;
const outRow = name => `[...[...document.querySelectorAll('.sect')].find(s => s.querySelector('h3')?.textContent === 'Saídas').querySelectorAll('.catrow')].find(r => r.querySelector('span')?.textContent.includes(${JSON.stringify(name)}))`;
const tagOf = name => `${outRow(name)}.querySelector('.tag')?.textContent ?? null`;
const cat = id => `__demo.store.getState().categories.find(c => c.id === ${JSON.stringify(id)})`;
const opt = g => `.sheet .seg button[data-g="${g}"]`;
const selected = `[...document.querySelectorAll('.sheet .seg button.on')].map(b => b.dataset.g)`;

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();

  for (const [label, w, h] of [['phone', 390, 844], ['wide', 1280, 800]]) {
    await chrome.setViewport(w, h);
    await chrome.goto(`${server.url}/?demo=1&unlock=a&t=${label}#/categorias`);
    await waitFor(chrome, `!!document.querySelector('.catrow')`);

    // ---- Tags ----
    assert.equal(await chrome.eval(tagOf('Carro')), 'necessidade');
    assert.equal(await chrome.eval(tagOf('Restaurantes')), 'desejo');
    assert.equal(await chrome.eval(tagOf('Investimentos')), 'poupança');
    assert.equal(await chrome.eval(`getComputedStyle(${outRow('Investimentos')}.querySelector('.tag')).color`), 'rgb(31, 122, 90)');
    assert.notEqual(await chrome.eval(`getComputedStyle(${outRow('Carro')}.querySelector('.tag')).color`), 'rgb(31, 122, 90)');
    assert.equal(await chrome.eval(`!!document.querySelector('.sect:nth-of-type(2) .catrow .tag.grp')`), false, 'sem tag nas entradas');
    await chrome.screenshot(`${SHOTS}/groups-list-${label}.png`, { width: w, height: h });

    // ---- New out category: group required ----
    await chrome.eval(`document.querySelector('[data-act="newcat"][data-v="out"]').click()`);
    await waitFor(chrome, `!!document.querySelector('#catname')`);
    assert.equal(await chrome.eval(`document.querySelectorAll('.sheet .seg button').length`), 3);
    assert.deepEqual(await chrome.eval(`[...document.querySelectorAll('.sheet .seg button')].map(b => b.textContent.trim())`), ['Necessidade', 'Desejo', 'Poupança']);
    assert.equal(await chrome.eval(`!!document.querySelector('.sheet .seg.grpseg')`), true);
    assert.deepEqual(await chrome.eval(selected), []);
    await chrome.type('#catname', `Teste ${label}`);
    await chrome.click('[data-act="sheet-save"]');
    assert.equal(await chrome.eval(text('.sheet .error')), 'Escolhe o grupo.');
    assert.equal(await chrome.eval(`!!document.querySelector('.sheet')`), true);
    await chrome.click(opt('desejo'));
    assert.deepEqual(await chrome.eval(selected), ['desejo']);
    assert.equal(await chrome.eval(`document.querySelector('${opt('desejo')}').getAttribute('aria-checked')`), 'true');
    assert.equal(await chrome.eval(text('.sheet .error')), '', 'o erro some ao escolher');
    await chrome.screenshot(`${SHOTS}/groups-sheet-${label}.png`, { width: w, height: h });
    await chrome.click('[data-act="sheet-save"]');
    await waitFor(chrome, `!document.querySelector('.sheet')`);
    assert.deepEqual(await chrome.eval(`(c => [c.group, c.savings])(__demo.store.getState().categories.find(c => c.name === 'Teste ${label}'))`), ['desejo', false]);

    // ---- Edit Investimentos: preselected Poupança; saving keeps group and savings ----
    await chrome.eval(`${outRow('Investimentos')}.querySelector('[data-act="editcat"]').click()`);
    await waitFor(chrome, `!!document.querySelector('#catname')`);
    assert.deepEqual(await chrome.eval(selected), ['poupanca']);
    await chrome.click('[data-act="sheet-save"]');
    await waitFor(chrome, `!document.querySelector('.sheet')`);
    assert.deepEqual(await chrome.eval(`(c => [c.group, c.savings])(${cat('inv')})`), ['poupanca', true]);

    // ---- Focus 4: rename only; the automatic group is saved explicitly ----
    await chrome.eval(`__demo.store.updateCategory('restaurantes', { group: null })`);
    await chrome.eval(`${outRow('Restaurantes')}.querySelector('[data-act="editcat"]').click()`);
    await waitFor(chrome, `!!document.querySelector('#catname')`);
    assert.deepEqual(await chrome.eval(selected), ['desejo']);
    await chrome.type('#catname', `Restaurantes ${label}`);
    await chrome.click('[data-act="sheet-save"]');
    await waitFor(chrome, `!document.querySelector('.sheet')`);
    assert.deepEqual(await chrome.eval(`(c => [c.name, c.group, c.savings])(${cat('restaurantes')})`), [`Restaurantes ${label}`, 'desejo', false]);

    // ---- Keyboard: arrow keys move the choice, Tab reaches it ----
    await chrome.eval(`document.querySelector('[data-act="newcat"][data-v="out"]').click()`);
    await waitFor(chrome, `!!document.querySelector('#catname')`);
    assert.equal(await chrome.eval(`document.querySelector('.sheet .seg').getAttribute('role')`), 'radiogroup');
    assert.equal(await chrome.eval(`[...document.querySelectorAll('.sheet .seg button')].every(b => b.tagName === 'BUTTON' && b.getAttribute('role') === 'radio')`), true);
    assert.equal(await chrome.eval(`document.querySelector('.sheet .seg button:not([tabindex="-1"])') !== null`), true);
    await chrome.eval(`document.querySelector('${opt('necessidade')}').focus()`);
    await chrome.eval(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
    assert.deepEqual(await chrome.eval(selected), ['desejo']);
    await chrome.click('.sheet [data-act="sheet-cancel"]');

    // ---- Changing Carro to Desejo keeps its bar red and the savings rate ----
    await chrome.goto(`${server.url}/?demo=1&unlock=a&t=m${label}#/mes/${ym}`);
    await waitFor(chrome, `!!document.querySelector('[data-cat="carro"] .bar i')`);
    const snap = () => chrome.eval(`({ bar: getComputedStyle(document.querySelector('[data-cat="carro"] .bar i')).backgroundColor, rate: [...document.querySelectorAll('.label')].find(e => e.textContent.startsWith('Taxa de poupança')).parentElement.textContent })`);
    const before = await snap();
    await chrome.goto(`${server.url}/?demo=1&unlock=a&t=c${label}#/categorias`);
    await waitFor(chrome, `!!document.querySelector('.catrow')`);
    await chrome.eval(`${outRow('Carro')}.querySelector('[data-act="editcat"]').click()`);
    await waitFor(chrome, `!!document.querySelector('#catname')`);
    await chrome.click(opt('desejo'));
    await chrome.click('[data-act="sheet-save"]');
    await waitFor(chrome, `!document.querySelector('.sheet')`);
    assert.equal(await chrome.eval(tagOf('Carro')), 'desejo');
    await chrome.eval(`location.hash = '#/mes/${ym}'`);
    await waitFor(chrome, `!!document.querySelector('[data-cat="carro"] .bar i')`);
    assert.deepEqual(await snap(), before);
    assert.equal(before.bar, 'rgb(196, 61, 47)', 'barra vermelha');

    // ---- + Nova from the register form also needs the group ----
    await chrome.goto(`${server.url}/?demo=1&unlock=a&t=f${label}#/registar`);
    await waitFor(chrome, `!!document.querySelector('#chips .chip.new')`);
    await chrome.click('#chips .chip.new');
    await waitFor(chrome, `!!document.querySelector('#catname')`);
    await chrome.type('#catname', 'Via nova');
    await chrome.click('[data-act="sheet-save"]');
    assert.equal(await chrome.eval(text('.sheet .error')), 'Escolhe o grupo.');
    await chrome.click(opt('poupanca'));
    await chrome.click('[data-act="sheet-save"]');
    await waitFor(chrome, `!document.querySelector('.sheet')`);
    assert.deepEqual(await chrome.eval(`(c => [c.group, c.savings])(__demo.store.getState().categories.find(c => c.name === 'Via nova'))`), ['poupanca', true]);

    if (w >= 1024) assert.equal(await chrome.eval(`document.scrollingElement.scrollWidth <= innerWidth`), true);
  }

  assert.deepEqual(chrome.pageErrors(), []);
  console.log('ok   groups');
  code = 0;
} catch (e) {
  console.error('FAIL groups\n    ', e.stack || e.message);
  if (chrome) for (const err of chrome.pageErrors()) console.error('PAGE ERROR', err);
} finally {
  await chrome?.close();
  await server?.close();
}
process.exit(code);
