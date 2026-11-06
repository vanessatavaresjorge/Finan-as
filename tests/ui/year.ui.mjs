// Year screen in demo mode: Gastos, filter, bar selection, Poupança, Casa.
// Expected numbers come from the same demo data and yearModel, computed here in Node.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { demoData } from '../../js/demo-data.js';
import { yearModel } from '../../js/logic/stats.js';
import { formatEur, formatPct, todayISO } from '../../js/logic/format.js';
import { SHOTS, waitFor } from './helpers.mjs';

const PHONE = { width: 390, height: 844 };
const today = todayISO();
const year = Number(today.slice(0, 4));
const data = demoData(today);
const model = (view, mode = 'gastos', filter = 'all', y = year) => yearModel({ ...data, year: y, view, mode, filter });
const nb = s => s.replace(/ /g, ' ');
const q = (sel, fn) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? (${fn}) : null; })()`;
const text = sel => q(sel, 'el.textContent');
const bg = i => `getComputedStyle(document.querySelectorAll('.cols button')[${i}].querySelector('i')).backgroundColor`;
const rowsText = `[...document.querySelectorAll('.yrow')].map(r => r.textContent)`;

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  const open = async (hash, n) => {
    await chrome.goto(`${server.url}/?demo=1&unlock=${n.u}&t=${n.t}#${hash}`);
    await waitFor(chrome, `!!document.querySelector('.chart')`);
  };

  // ---- Gastos ----
  const A = model('a');
  await open(`/ano/${year}`, { u: 'a', t: 1 });
  assert.equal(await chrome.eval(`document.querySelector('.tabs button.on').textContent`), 'Ano');
  assert.equal(await chrome.eval(`document.querySelectorAll('.cols button').length`), 12);
  const cur = Number(today.slice(5, 7)) - 1;
  assert.equal(await chrome.eval(bg(cur)), 'rgb(95, 107, 46)');
  const other = A.months.findIndex((c, i) => i !== cur && c > 0);
  assert.equal(await chrome.eval(bg(other)), 'rgb(169, 155, 137)');
  const widths = await chrome.eval(`[...document.querySelectorAll('.cols i')].map(i => i.getBoundingClientRect().width)`);
  assert.ok(widths.length > 0 && widths.every(w => w <= 18.01), `barras largas: ${widths}`);
  assert.equal(nb(await chrome.eval(text('.big'))), nb(formatEur(A.total)));
  const pair = await chrome.eval(`[...document.querySelectorAll('.pair .card')].map(c => c.textContent)`);
  assert.equal(nb(pair[0]), nb(`Média por mês${formatEur(Math.round(A.average))}`));
  assert.ok(pair[1].startsWith('Mês mais alto'));
  assert.equal(await chrome.eval(`document.querySelectorAll('.fchips .chip').length`), 1 + data.categories.filter(c => c.type === 'out').length);
  assert.equal(await chrome.eval(`document.querySelectorAll('.gl').length >= 3`), true);
  await chrome.screenshot(`${SHOTS}/year-gastos.png`, PHONE);

  // filter
  const S = model('a', 'gastos', 'supermercado');
  assert.notEqual(S.total, A.total);
  await chrome.click(`[data-act="filter"][data-v="supermercado"]`);
  await waitFor(chrome, `document.querySelector('.big').textContent === ${JSON.stringify(formatEur(S.total))}`);
  assert.ok((await chrome.eval(text('.label'))).length > 0);
  assert.ok((await chrome.eval(`document.body.textContent`)).includes('Supermercado'));
  assert.equal(await chrome.eval(`document.querySelector('.chip.on').textContent`), '🛒Supermercado');
  const rows = await chrome.eval(rowsText);
  assert.equal(rows.length, 12);
  assert.equal(nb(rows[other]), nb(`${'Janeiro Fevereiro Março Abril Maio Junho Julho Agosto Setembro Outubro Novembro Dezembro'.split(' ')[other]}${S.months[other] ? formatEur(S.months[other]) : '—'}`));
  assert.equal(await chrome.eval(`document.querySelectorAll('.cols i').length`), S.months.filter(c => c > 0).length);
  await chrome.click(`[data-act="filter"][data-v="all"]`);
  await waitFor(chrome, `document.querySelector('.big').textContent === ${JSON.stringify(formatEur(A.total))}`);

  // bar -> readout -> Ver mês
  await chrome.click('.cols button:nth-child(3)');
  await waitFor(chrome, `document.querySelector('.readout .label').textContent.toLowerCase().includes('março')`);
  assert.equal(nb(await chrome.eval(text('.readout b'))), nb(formatEur(A.months[2])));
  assert.equal(await chrome.eval(bg(2)), 'rgb(95, 107, 46)');
  await chrome.click('.readout button');
  await waitFor(chrome, `location.hash === '#/mes/${year}-03'`);

  // year arrows and list rows
  await open(`/ano/${year}`, { u: 'a', t: 2 });
  await chrome.click('[data-act="prev"]');
  await waitFor(chrome, `location.hash === '#/ano/${year - 1}'`);
  await waitFor(chrome, `document.querySelector('.title').textContent === '${year - 1}'`);
  // past year selects December
  assert.equal(await chrome.eval(`document.querySelector('.cols button.sel').dataset.v`), '11');
  await chrome.click('.yrow:nth-child(2)');
  await waitFor(chrome, `location.hash === '#/mes/${year - 1}-02'`);

  // ---- Poupança (profile B has a negative month) ----
  const B = model('b', 'poupanca');
  const neg = B.months.findIndex(m => m && m.rate < 0);
  assert.ok(neg >= 0, 'o perfil B tem um mês negativo');
  await open(`/ano/${year}/poupanca`, { u: 'b', t: 3 });
  assert.equal(nb(await chrome.eval(text('.big'))), nb(formatPct(B.rate)));
  assert.equal(await chrome.eval(`document.querySelectorAll('.yrow').length`), 12);
  assert.ok((await chrome.eval(`document.body.textContent`)).includes(`Foi para categorias de poupança: ${formatEur(B.inv)}`));
  assert.equal(await chrome.eval(`document.querySelectorAll('.fchips').length`), 0);
  assert.equal(await chrome.eval(`document.querySelectorAll('.cols i.negb').length`), B.months.filter(m => m && m.rate < 0).length);
  // negative bar hangs below the zero line
  const below = await chrome.eval(`(() => { const z = document.querySelector('.gl.base').getBoundingClientRect().top; const r = document.querySelector('.cols i.negb').getBoundingClientRect(); return r.top >= z - 1; })()`);
  assert.equal(below, true);
  const labels = await chrome.eval(`[...document.querySelectorAll('.gl span')].map(s => s.textContent)`);
  assert.ok(labels.some(l => l.startsWith('−')), `escala sem negativos: ${labels}`);
  await chrome.click(`.cols button:nth-child(${neg + 1})`);
  await waitFor(chrome, `document.querySelector('.cols button.sel').dataset.v === '${neg}'`);
  assert.equal(await chrome.eval(text('.readout b')), formatPct(B.months[neg].rate));
  assert.ok((await chrome.eval(text('.readout .label'))).includes('acima do que entrou'));
  await chrome.screenshot(`${SHOTS}/year-poupanca.png`, PHONE);
  // selected month survives the Gastos/Poupança switch
  await chrome.click('[data-act="mode"][data-v="gastos"]');
  await waitFor(chrome, `location.hash === '#/ano/${year}'`);
  await waitFor(chrome, `!!document.querySelector('.fchips')`);
  assert.equal(await chrome.eval(`document.querySelector('.cols button.sel').dataset.v`), String(neg));

  // a month without income shows a dash (next year has no data)
  await open(`/ano/${year + 1}/poupanca`, { u: 'a', t: 4 });
  assert.equal(await chrome.eval(text('.big')), '—');
  assert.ok((await chrome.eval(rowsText)).every(r => r.endsWith('—')));
  assert.equal(await chrome.eval(`document.querySelectorAll('.cols i').length`), 0);
  assert.equal(await chrome.eval(`document.querySelector('.cols button.sel').dataset.v`), '0');

  // ---- Casa ----
  await open(`/ano/${year}/casa`, { u: 'a', t: 5 });
  const C = model('casa');
  assert.equal(nb(await chrome.eval(text('.big'))), nb(formatEur(C.total)));
  const rowSplits = await chrome.eval(`[...document.querySelectorAll('.yrow')].filter(r => r.querySelector('.split')).map(r => r.querySelector('.split').textContent)`);
  assert.equal(rowSplits.length, C.months.filter(c => c > 0).length);
  assert.ok(rowSplits.every(s => s.includes('Perfil A') && s.includes('Perfil B')));
  const ro = await chrome.eval(text('.readout .split'));
  assert.ok(ro.includes('Perfil A') && ro.includes('Perfil B'));
  assert.ok((await chrome.eval(text('.big + .split'))).includes('Perfil B'));
  await chrome.screenshot(`${SHOTS}/year-casa.png`, PHONE);
  await chrome.click('.readout button');
  await waitFor(chrome, `location.hash === '#/mes/${today.slice(0, 7)}/casa'`);

  assert.deepEqual(await chrome.pageErrors(), []);
  console.log('year.ui: ok');
  code = 0;
} catch (e) {
  console.error(e);
} finally {
  await chrome?.close();
  await server?.close();
  process.exit(code);
}
