// Wide month dashboard (window >= 1024 px) in demo mode: KPI cards, categories, year chart,
// movements table and its filter, Casa view, and a narrow wide window with a long category name.
// Expected numbers come from the same demo data and monthModel, computed here in Node.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { demoData } from '../../js/demo-data.js';
import { monthModel } from '../../js/logic/stats.js';
import { formatEur, formatPct, todayISO, centsToInput, monthTitle } from '../../js/logic/format.js';
import { SHOTS, waitFor } from './helpers.mjs';

const today = todayISO();
const ym = today.slice(0, 7);
const mIdx = Number(ym.slice(5, 7)) - 1;
const data = demoData(today);
const A = monthModel({ ...data, ym, view: 'a' });
const nb = s => s.replace(/ /g, ' ');
const all = (sel, fn = 'e.textContent') => `[...document.querySelectorAll(${JSON.stringify(sel)})].map(e => ${fn})`;
const kpis = all('.kpis .kpi > b.num');
const rowsCat = all('table.movs tbody tr td:nth-child(2)', 'e.textContent.trim()');

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  await chrome.setViewport(1280, 800);
  await chrome.goto(`${server.url}/?demo=1&unlock=a#/mes/${ym}`);
  await waitFor(chrome, `!!document.querySelector('.kpis')`);

  // ---- KPI cards ----
  const t = A.totals;
  assert.deepEqual((await chrome.eval(kpis)).map(nb),
    [formatEur(t.out), formatEur(t.inn), formatEur(t.left), formatPct(t.rate)].map(nb));
  assert.deepEqual(await chrome.eval(all('.kpis .kpi > .label')), ['Saiu', 'Entrou', 'Sobrou', 'Taxa de poupança']);
  // compact KPI row; the savings phrase is a full-width line under it, fully readable
  const kpiH = await chrome.eval(all('.kpis .kpi', 'e.getBoundingClientRect().height'));
  assert.ok(kpiH.length === 4 && kpiH.every(h => h <= 110), `cartões altos: ${kpiH}`);
  assert.match(await chrome.eval(`document.querySelector('.kpiphrase').textContent`), /^Poupaste .* dos .* que entraram/);
  assert.equal(await chrome.eval(`(() => { const e = document.querySelector('.kpiphrase'); const r = e.getBoundingClientRect();
    return getComputedStyle(e).display !== 'none' && r.height > 0 && r.bottom <= innerHeight && e.scrollWidth <= e.clientWidth; })()`), true);
  assert.ok(await chrome.eval(`!!document.querySelector('.kpis .meter i')`));
  // top bar: month navigation and the profile | Casa segment
  assert.equal(await chrome.eval(`document.querySelector('.wtop .title').textContent`), monthTitle(ym));
  assert.equal(await chrome.eval(`document.querySelectorAll('.wtop .seg button').length`), 2);

  // ---- Categories (order of the model) ----
  assert.deepEqual(await chrome.eval(all('.wcats .row .nm', 'e.textContent.trim()')), A.categories.map(c => c.name));

  // ---- Chart: 12 slots, this month selected ----
  assert.equal(await chrome.eval(`document.querySelector('.wchart .ct').textContent`), `Saídas em ${ym.slice(0, 4)}`);
  assert.equal(await chrome.eval(`document.querySelectorAll('.wchart .cols [data-month]').length`), 12);
  assert.equal(await chrome.eval(`document.querySelector('.wchart .cols .sel').dataset.month`), String(mIdx));
  const widths = await chrome.eval(all('.wchart .cols i', 'e.getBoundingClientRect().width'));
  assert.ok(widths.length > 0 && widths.every(w => w <= 18.01), `barras largas: ${widths}`);
  const chartH = await chrome.eval(`document.querySelector('.wchart .chart').getBoundingClientRect().height`);
  assert.ok(chartH >= 200, `gráfico baixo: ${chartH}`);

  // ---- Movements table ----
  assert.deepEqual(await chrome.eval(all('table.movs thead th', 'e.textContent.trim()')), ['Data', 'Categoria', 'Nota', 'Valor']);
  assert.equal(await chrome.eval(`document.querySelectorAll('table.movs tbody tr').length`), A.moves.length);
  assert.equal(await chrome.eval(`document.scrollingElement.scrollWidth <= innerWidth`), true);
  await chrome.screenshot(`${SHOTS}/wide-month.png`, { width: 1280, height: 800 });

  // ---- Scroll memory: kept while filtering the same month, dropped after leaving the month ----
  const scroller = `document.querySelector('.screen > .scroll')`;
  await chrome.eval(`${scroller}.scrollTop = 120`);
  await waitFor(chrome, `${scroller}.scrollTop === 120`);
  await chrome.click(`.wcats [data-cat="combustivel"]`);
  await waitFor(chrome, `location.hash === '#/mes/${ym}/cat/combustivel' && !!document.querySelector('.movfilter')`);
  // same position (or the lowest one, when the filtered page is shorter)
  assert.ok(await chrome.eval(`(e => Math.abs(e.scrollTop - Math.min(120, e.scrollHeight - e.clientHeight)) <= 1)(${scroller})`), 'o filtro mantém a posição');
  await chrome.click('.movfilter .link');
  await waitFor(chrome, `location.hash === '#/mes/${ym}' && !document.querySelector('.movfilter')`);
  await chrome.eval(`${scroller}.scrollTop = 120`);
  await waitFor(chrome, `${scroller}.scrollTop === 120`);
  await chrome.eval(`location.hash = '#/ano/${ym.slice(0, 4)}'`);
  await waitFor(chrome, `!!document.querySelector('.chartcard')`);
  await chrome.eval(`location.hash = '#/mes/${ym}'`);
  await waitFor(chrome, `!!document.querySelector('.kpis')`);
  assert.equal(await chrome.eval(`${scroller}.scrollTop`), 0, 'depois do Ano o mês abre no topo');

  // ---- Filter: category row -> table filtered, chip and ‹ Voltar ----
  const sup = A.moves.filter(m => m.categoryId === 'supermercado');
  await chrome.click(`.wcats [data-cat="supermercado"]`);
  await waitFor(chrome, `location.hash === '#/mes/${ym}/cat/supermercado' && !!document.querySelector('.movfilter')`);
  const supRows = await chrome.eval(rowsCat);
  assert.equal(supRows.length, sup.length);
  assert.ok(supRows.every(s => s.includes('Supermercado')), `linhas: ${supRows}`);
  assert.match(await chrome.eval(`document.querySelector('.movfilter .chip').textContent`), /Supermercado ×/);
  assert.ok(await chrome.eval(`!!document.querySelector('.kpis')`), 'o painel continua visível com o filtro');
  await chrome.screenshot(`${SHOTS}/wide-month-filter.png`, { width: 1280, height: 800 });
  await chrome.click('.movfilter .link');
  await waitFor(chrome, `location.hash === '#/mes/${ym}' && !document.querySelector('.movfilter')`);
  assert.equal(await chrome.eval(`document.querySelectorAll('table.movs tbody tr').length`), A.moves.length);

  // chip also removes the filter; Entrou filters on income
  await chrome.click('.kpis [data-act="entradas"]');
  await waitFor(chrome, `location.hash === '#/mes/${ym}/entradas' && !!document.querySelector('.movfilter')`);
  assert.equal(await chrome.eval(`document.querySelectorAll('table.movs tbody tr').length`), A.moves.filter(m => m.type === 'in').length);
  assert.match(await chrome.eval(`document.querySelector('.movfilter .chip').textContent`), /Entradas ×/);
  await chrome.click('.movfilter .chip');
  await waitFor(chrome, `location.hash === '#/mes/${ym}' && !document.querySelector('.movfilter')`);

  // Back in the browser removes the filter
  await chrome.click(`.wcats [data-cat="supermercado"]`);
  await waitFor(chrome, `location.hash === '#/mes/${ym}/cat/supermercado'`);
  await chrome.eval('history.back()');
  await waitFor(chrome, `location.hash === '#/mes/${ym}' && !document.querySelector('.movfilter')`);

  // ---- Chart bar opens that month ----
  if (mIdx > 0) {
    const prevYm = `${ym.slice(0, 4)}-${String(mIdx).padStart(2, '0')}`;
    await chrome.click(`.wchart .cols [data-month="${mIdx - 1}"]`);
    await waitFor(chrome, `location.hash === '#/mes/${prevYm}'`);
    await chrome.eval('history.back()');
    await waitFor(chrome, `location.hash === '#/mes/${ym}' && !!document.querySelector('table.movs')`);
  }

  // ---- Table row opens the edit drawer with that move ----
  const first = A.moves[0];
  await chrome.click('table.movs tbody tr');
  await waitFor(chrome, `!!document.querySelector('.drawer #amt')`);
  assert.equal(await chrome.eval(`location.hash`), `#/editar/${first.id}`);
  assert.equal(await chrome.eval(`document.querySelector('.drawer #amt').value`), centsToInput(first.cents));
  await chrome.eval(`document.querySelector('[data-act="drawer-cancel"]').click()`);
  await waitFor(chrome, `!document.querySelector('.drawer')`);

  // ---- Casa: no table, no notes of the other profile, split lines ----
  await chrome.goto(`${server.url}/?demo=1&unlock=a&t=2#/mes/${ym}/casa`);
  await waitFor(chrome, `!!document.querySelector('.kpis')`);
  assert.equal(await chrome.eval(`document.querySelector('table.movs')`), null);
  const bNotes = [...new Set(data.moves.filter(m => m.profileId === 'b' && m.note).map(m => m.note))];
  const page = await chrome.eval(`document.body.textContent`);
  for (const n of bNotes) assert.ok(!page.includes(n), `nota do perfil B visível: ${n}`);
  const saiuSplit = await chrome.eval(`document.querySelector('.kpis .kpi .split').textContent`);
  assert.ok(saiuSplit.includes('Perfil A') && saiuSplit.includes('Perfil B'), saiuSplit);
  assert.ok(await chrome.eval(`!!document.querySelector('.wcats .row .split')`));
  assert.equal(await chrome.eval(`document.querySelectorAll('.wcats [data-act], .kpis [data-act]').length`), 0);
  await chrome.click('.wcats .row');
  assert.equal(await chrome.eval(`location.hash`), `#/mes/${ym}/casa`);
  await chrome.screenshot(`${SHOTS}/wide-month-casa.png`, { width: 1280, height: 800 });

  // ---- Review Focus 5: 1024 px, a very long category name ----
  await chrome.setViewport(1024, 768);
  await chrome.goto(`${server.url}/?demo=1&unlock=a&t=3#/mes/${ym}`);
  await waitFor(chrome, `!!document.querySelector('.kpis')`);
  const long = 'x'.repeat(60);
  await chrome.eval(`(() => {
    const s = __demo.store;
    const id = s.addCategory({ name: ${JSON.stringify(long)}, type: 'out', icon: '🧪', savings: false });
    s.addMove({ profileId: 'a', type: 'out', cents: 5000000, categoryId: id, date: '${today}', note: ${JSON.stringify('n'.repeat(60))} });
  })()`);
  await waitFor(chrome, `document.body.textContent.includes(${JSON.stringify(long)})`);
  assert.equal(await chrome.eval(`document.scrollingElement.scrollWidth <= innerWidth`), true);
  assert.equal(await chrome.eval(`[...document.querySelectorAll('.screen, .scroll, .wmonth')].every(e => e.scrollWidth <= e.clientWidth)`), true);
  const ell = await chrome.eval(`[...document.querySelectorAll('.wcats .nm, table.movs td')].filter(e => e.textContent.includes(${JSON.stringify(long)})).map(e => getComputedStyle(e).textOverflow + ':' + (e.scrollWidth > e.clientWidth))`);
  assert.ok(ell.length >= 2, `elementos com o nome: ${ell}`);
  assert.ok(ell.every(s => s === 'ellipsis:true'), `sem reticências: ${ell}`);
  await chrome.screenshot(`${SHOTS}/wide-month-1024.png`, { width: 1024, height: 768 });

  assert.deepEqual(await chrome.pageErrors(), []);
  console.log('wide-month.ui: ok');
  code = 0;
} catch (e) {
  console.error(e);
} finally {
  await chrome?.close();
  await server?.close();
  process.exit(code);
}
