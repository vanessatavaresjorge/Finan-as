// Opening balance form in Categorias > Perfis (demo, phone and wide).
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { demoData } from '../../js/demo-data.js';
import { monthModel } from '../../js/logic/stats.js';
import { formatEur, todayISO, addMonths } from '../../js/logic/format.js';
import { SHOTS, waitFor } from './helpers.mjs';

const today = todayISO();
const ym = today.slice(0, 7);
const data = demoData(today);
const nb = s => String(s).replace(/ /g, ' ');
const pt = iso => iso.split('-').reverse().join('/');
const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return todayISO(d); })();
const text = sel => `document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`;
const ROW = `document.querySelector('.openrow')`;
const rowText = () => `${ROW}?.querySelector('.ov')?.textContent ?? ''`;
const rowBtn = `${ROW}?.querySelector('button')?.textContent ?? ''`;
const setField = (sel, v) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); el.value = ${JSON.stringify(v)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`;

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  const open = async (u, hash, w, h, ready) => {
    await chrome.setViewport(w, h);
    await chrome.goto(`${server.url}/?demo=1&unlock=${u}&t=${Math.random()}#${hash}`);
    await waitFor(chrome, `!!document.querySelector('${ready}')`);
  };
  const openSheet = async () => {
    await chrome.eval(`${ROW}.querySelector('button').click()`);
    await waitFor(chrome, `!!document.querySelector('.sheet.side #opval')`);
  };
  const closed = () => waitFor(chrome, `!document.querySelector('.shade')`);

  for (const [label, w, h] of [['phone', 390, 844], ['wide', 1280, 800]]) {
    // ---- Profile A: has an opening balance ----
    await open('a', '/categorias', w, h, '.openrow');
    assert.equal(await chrome.eval(`document.querySelectorAll('.openrow').length`), 1, 'only the open profile');
    assert.equal(nb(await chrome.eval(rowText())), `${nb(formatEur(150000))} em ${pt(data.profiles[0].openingDate)}`);
    assert.equal(await chrome.eval(rowBtn), 'Alterar');
    assert.equal(await chrome.eval(text('.openrow .ol')), 'Saldo inicial');
    assert.equal(await chrome.eval(`[...document.querySelectorAll('.sect')].find(s => s.querySelector('h3').textContent === 'Perfis').querySelectorAll('.catrow > span:first-child').length`), 2);

    await openSheet();
    assert.equal(await chrome.eval(`document.querySelector('#opval').value`), '1500,00');
    assert.equal(await chrome.eval(`document.querySelector('#opval').getAttribute('inputmode')`), 'decimal');
    assert.equal(await chrome.eval(`document.querySelector('#opdate').value`), data.profiles[0].openingDate);
    assert.equal(await chrome.eval(`document.querySelector('#opdate').max`), today);
    assert.equal(await chrome.eval(`[...document.querySelectorAll('.sheet .btn')].map(b => b.textContent.trim()).join('|')`), 'Guardar|Cancelar|Remover saldo inicial');
    assert.equal(await chrome.eval(`document.querySelector('.sheet').classList.contains('side')`), true);
    if (label === 'wide') {
      assert.equal(await chrome.eval(`Math.round(document.querySelector('.sheet').getBoundingClientRect().right)`), 1280, 'right drawer');
      assert.equal(await chrome.eval(`Math.round(document.querySelector('.sheet').getBoundingClientRect().width)`), 420);
    } else {
      assert.equal(await chrome.eval(`Math.round(document.querySelector('.sheet').getBoundingClientRect().bottom)`), h, 'bottom sheet');
    }
    await chrome.screenshot(`${SHOTS}/opening-${label}-sheet.png`, { width: w, height: h });

    // errors
    await chrome.eval(setField('#opval', ''));
    await chrome.click('[data-act="sheet-save"]');
    assert.equal(await chrome.eval(text('.sheet .error')), 'Escreve um valor, por exemplo 1 200,00 ou −50,00.');
    await chrome.eval(setField('#opval', '12,345'));
    await chrome.click('[data-act="sheet-save"]');
    assert.equal(await chrome.eval(text('.sheet .error')), 'Escreve um valor, por exemplo 1 200,00 ou −50,00.');
    await chrome.eval(setField('#opval', '10'));
    await chrome.eval(setField('#opdate', tomorrow));
    await chrome.click('[data-act="sheet-save"]');
    assert.equal(await chrome.eval(text('.sheet .error')), 'A data não pode ser depois de hoje.');
    await chrome.eval(setField('#opdate', ''));
    await chrome.click('[data-act="sheet-save"]');
    assert.equal(await chrome.eval(text('.sheet .error')), 'Escolhe uma data.');
    await chrome.screenshot(`${SHOTS}/opening-${label}-error.png`, { width: w, height: h });

    // typed values survive a store update
    await chrome.eval(setField('#opval', '-50'));
    await chrome.eval(setField('#opdate', today));
    await chrome.eval(`window.__demo.store.addMove({ profileId: 'a', type: 'out', cents: 100, date: ${JSON.stringify(today)}, categoryId: window.__demo.store.getState().categories.find(c => c.type === 'out').id, note: '' })`);
    await new Promise(r => setTimeout(r, 300));
    assert.equal(await chrome.eval(`document.querySelector('#opval').value`), '-50');
    assert.equal(await chrome.eval(`document.querySelector('#opdate').value`), today);

    // save -50 today
    await chrome.click('[data-act="sheet-save"]');
    await closed();
    const a = await chrome.eval(`window.__demo.store.getState().profiles.find(p => p.id === 'a')`);
    assert.equal(a.openingCents, -5000);
    assert.equal(a.openingDate, today);
    assert.equal(nb(await chrome.eval(rowText())), `${nb(formatEur(-5000))} em ${pt(today)}`);
    assert.equal(await chrome.eval(`${ROW}.querySelector('.ov').classList.contains('neg')`), true);
    // reopen: prefilled with the minus sign (U+2212)
    await openSheet();
    assert.equal(await chrome.eval(`document.querySelector('#opval').value`), '−50,00');
    await chrome.click('.sheet [data-act="sheet-cancel"]');
    await closed();
    // the month card follows
    await chrome.eval(`location.hash = '#/mes/${ym}'`);
    await waitFor(chrome, `!!document.querySelector('${label === 'phone' ? '.balcard' : '.kpis'}')`);
    const st = await chrome.eval(`JSON.stringify(window.__demo.store.getState())`);
    const s = JSON.parse(st);
    const exp = monthModel({ ...s, ym, view: 'a' }).balance.total;
    const sel = label === 'phone' ? '.balcard > b' : '.kpis .kpi:nth-child(5) b';
    assert.equal(nb((await chrome.eval(text(sel))).trim()), nb(formatEur(exp)));
    // updated from "another device" while on the month screen
    await chrome.eval(`window.__demo.store.updateProfile('a', { openingCents: 777700, openingDate: ${JSON.stringify(today)} })`);
    const exp2 = monthModel({ ...JSON.parse(await chrome.eval(`JSON.stringify(window.__demo.store.getState())`)), ym, view: 'a' }).balance.total;
    await waitFor(chrome, `${text(sel)}.trim().replace(/\\u00a0/g, ' ') === ${JSON.stringify(nb(formatEur(exp2)))}`);

    // ---- Remove ----
    await open('a', '/categorias', w, h, '.openrow');
    await openSheet();
    await chrome.eval(`[...document.querySelectorAll('.sheet .btn')].find(b => b.textContent.trim() === 'Remover saldo inicial').click()`);
    await waitFor(chrome, `document.querySelectorAll('.shade').length === 2`);
    assert.equal(await chrome.eval(`[...document.querySelectorAll('.shade .title')].pop().textContent`), 'Remover o saldo inicial?');
    await chrome.eval(`[...document.querySelectorAll('.shade')].pop().querySelector('[data-act="sheet-ok"]').click()`);
    await closed();
    const a2 = await chrome.eval(`window.__demo.store.getState().profiles.find(p => p.id === 'a')`);
    assert.equal(a2.openingCents ?? null, null);
    assert.equal(a2.openingDate ?? null, null);
    assert.equal(await chrome.eval(rowText()), 'Não indicado');
    assert.equal(await chrome.eval(rowBtn), 'Indicar');

    // ---- Profile B: none; sheet defaults to today, no Remover ----
    await open('b', '/categorias', w, h, '.openrow');
    assert.equal(await chrome.eval(rowText()), 'Não indicado');
    assert.equal(await chrome.eval(rowBtn), 'Indicar');
    assert.equal(await chrome.eval(`document.querySelectorAll('.openrow').length`), 1);
    await openSheet();
    assert.equal(await chrome.eval(`document.querySelector('#opval').value`), '');
    assert.equal(await chrome.eval(`document.querySelector('#opdate').value`), today);
    assert.equal(await chrome.eval(`[...document.querySelectorAll('.sheet .btn')].map(b => b.textContent.trim()).join('|')`), 'Guardar|Cancelar');
    await chrome.eval(setField('#opval', '1 200,00'));
    await chrome.eval(`document.querySelector('#opval').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
    await closed();
    const b = await chrome.eval(`window.__demo.store.getState().profiles.find(p => p.id === 'b')`);
    assert.equal(b.openingCents, 120000);
    assert.equal(b.openingDate, today);
    assert.equal(nb(await chrome.eval(rowText())), `${nb(formatEur(120000))} em ${pt(today)}`);
    assert.equal(await chrome.eval(`document.documentElement.scrollWidth <= innerWidth`), true);
  }

  assert.deepEqual(await chrome.pageErrors(), []);
  console.log('opening.ui: ok');
  code = 0;
} catch (e) {
  console.error(e);
} finally {
  await chrome?.close();
  await server?.close();
  process.exit(code);
}
