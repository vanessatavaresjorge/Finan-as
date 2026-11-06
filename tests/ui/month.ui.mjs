// Month screen in demo mode: profile view, Casa view, detail views, edge cases.
// Expected numbers come from the same demo data and monthModel, computed here in Node.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { demoData } from '../../js/demo-data.js';
import { monthModel } from '../../js/logic/stats.js';
import { formatEur, todayISO, addMonths } from '../../js/logic/format.js';
import { SHOTS, waitFor } from './helpers.mjs';

const PHONE = { width: 390, height: 844 };
const today = todayISO();
const ym = today.slice(0, 7);
const data = demoData(today);
const model = view => monthModel({ ...data, ym, view });
const A = model('a');
const nb = s => s.replace(/ /g, ' ');
const q = (sel, fn) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? (${fn}) : null; })()`;
const text = sel => q(sel, 'el.textContent');
const catNames = `[...document.querySelectorAll('.card.list:not(.all) .row .top > span:first-child')].map(e => e.textContent.replace(/\\s*\\d+%$/, '').trim())`;

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  await chrome.goto(`${server.url}/?demo=1&unlock=a#/mes/${ym}`);
  await waitFor(chrome, `!!document.querySelector('.big')`);

  // ---- Profile view ----
  assert.equal(nb(await chrome.eval(text('.big'))), nb(formatEur(A.totals.out)));
  assert.equal(nb(await chrome.eval(q('.pair .in', 'el.textContent'))), nb(formatEur(A.totals.inn)));
  assert.deepEqual(await chrome.eval(catNames), A.categories.map(c => `${c.icon}${c.name}`));
  const invIdx = A.categories.findIndex(c => c.id === 'inv');
  assert.ok(invIdx >= 0, 'o perfil A tem Investimentos neste mês');
  const bg = i => `getComputedStyle(document.querySelectorAll('.bar i')[${i}]).backgroundColor`;
  assert.equal(await chrome.eval(bg(invIdx)), 'rgb(31, 122, 90)');
  const normal = A.categories.findIndex(c => !c.savings);
  assert.equal(await chrome.eval(bg(normal)), 'rgb(196, 61, 47)');
  assert.equal(await chrome.eval(text('.sech span')), String(A.moves.length));
  assert.equal(await chrome.eval(`document.querySelectorAll('.card.list.all .row').length`), A.moves.length);
  assert.match(await chrome.eval(text('.savecard p')), /^Poupaste .* dos .* que entraram/);
  assert.equal(await chrome.eval(`document.querySelectorAll('.vseg button').length`), 2);
  assert.equal(await chrome.eval(`document.querySelector('.tabs button.on').textContent`), 'Mês');
  await chrome.screenshot(`${SHOTS}/month-profile.png`, PHONE);

  // category row -> detail -> back; Entrou -> entradas -> edit
  await chrome.click(`[data-act="detail"]`);
  await waitFor(chrome, `location.hash.includes('/cat/')`);
  assert.ok(await chrome.eval(`!!document.querySelector('.back')`));
  await chrome.screenshot(`${SHOTS}/month-cat.png`, PHONE);
  await chrome.click('.back');
  await waitFor(chrome, `location.hash === '#/mes/${ym}'`);
  await chrome.click('.pair button.card');
  await waitFor(chrome, `location.hash === '#/mes/${ym}/entradas'`);
  assert.equal(nb(await chrome.eval(text('.big'))), nb(formatEur(A.totals.inn)));
  await chrome.click('.row.mv');
  await waitFor(chrome, `location.hash.startsWith('#/editar/')`);

  // arrows and segment
  await chrome.goto(`${server.url}/?demo=1&unlock=a&t=2#/mes/${ym}`);
  await waitFor(chrome, `!!document.querySelector('.big')`);
  await chrome.click('[data-act="prev"]');
  await waitFor(chrome, `location.hash === '#/mes/${addMonths(ym, -1)}'`);
  await chrome.click('[data-act="next"]');
  await waitFor(chrome, `location.hash === '#/mes/${ym}'`);

  // ---- Casa ----
  await chrome.click('.vseg button:last-child');
  await waitFor(chrome, `location.hash === '#/mes/${ym}/casa'`);
  await waitFor(chrome, `!!document.querySelector('.split')`);
  const split = await chrome.eval(text('.split'));
  assert.ok(split.includes('Perfil A') && split.includes('Perfil B'));
  assert.equal(await chrome.eval(`document.querySelector('.sech')`), null);
  const bNotes = data.moves.filter(m => m.profileId === 'b' && m.note).map(m => m.note);
  const page = await chrome.eval(`document.body.textContent`);
  for (const n of bNotes) assert.ok(!page.includes(n), `nota do perfil B visível: ${n}`);
  await chrome.click('.card.list .row');
  assert.equal(await chrome.eval(`location.hash`), `#/mes/${ym}/casa`);
  assert.equal(await chrome.eval(`document.querySelectorAll('[data-act="detail"]').length`), 0);
  await chrome.screenshot(`${SHOTS}/month-casa.png`, PHONE);

  // ---- Unknown category (deleted on another device) ----
  await chrome.goto(`${server.url}/?demo=1&unlock=a&t=3#/mes/${ym}`);
  await waitFor(chrome, `!!document.querySelector('.big')`);
  await chrome.eval(`__demo.store.addMove({ profileId: 'a', type: 'out', cents: 1234, categoryId: 'apagada', date: '${today}', note: '' })`);
  await waitFor(chrome, `document.body.textContent.includes('❔') && document.body.textContent.includes('Sem categoria')`);
  assert.deepEqual(await chrome.pageErrors(), []);

  // ---- Negative month (Perfil B, 4 months ago): no "incluindo" part ----
  const negYm = addMonths(ym, -4);
  const B4 = monthModel({ ...data, ym: negYm, view: 'b' }).totals;
  assert.ok(B4.saved < 0 && B4.inv > 0, 'o perfil B gasta mais do que entrou e tem poupança neste mês');
  await chrome.goto(`${server.url}/?demo=1&unlock=b&t=4#/mes/${negYm}`);
  await waitFor(chrome, `!!document.querySelector('.savecard p')`);
  assert.equal(nb(await chrome.eval(text('.savecard p'))), nb(`Gastaste mais ${formatEur(-B4.saved)} do que entrou.`));

  // ---- Empty future month ----
  await chrome.goto(`${server.url}/?demo=1&unlock=a&t=5#/mes/${ym}`);
  await waitFor(chrome, `!!document.querySelector('.big')`);
  const future = addMonths(ym, 3);
  await chrome.eval(`location.hash = '#/mes/${future}'`);
  await waitFor(chrome, `document.body.textContent.includes('Ainda não há movimentos neste mês. Toca em + para registar o primeiro.')`);
  assert.equal(await chrome.eval(text('.savecard .hd b')), '—');
  assert.ok((await chrome.eval(text('.savecard'))).includes('Sem entradas neste mês'));
  assert.equal(nb(await chrome.eval(text('.big'))), nb(formatEur(0)));
  assert.equal(await chrome.eval(`document.querySelector('.sech')`), null);
  assert.deepEqual(await chrome.pageErrors(), []);

  console.log('month.ui: ok');
  code = 0;
} catch (e) {
  console.error(e);
} finally {
  await chrome?.close();
  await server?.close();
  process.exit(code);
}
