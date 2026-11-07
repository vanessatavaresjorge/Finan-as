// Wide year and categories (window >= 1024 px) in demo mode: chart filling its card, 12 rows
// visible, readout and Ver mês, Poupança with a negative month, two-column categories, drawer.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { demoData } from '../../js/demo-data.js';
import { yearModel } from '../../js/logic/stats.js';
import { formatPct, todayISO } from '../../js/logic/format.js';
import { SHOTS, waitFor } from './helpers.mjs';

const today = todayISO();
const year = Number(today.slice(0, 4));
const data = demoData(today);
const B = yearModel({ ...data, year, view: 'b', mode: 'poupanca', filter: 'all' });
const nb = s => String(s).replace(/ /g, ' ');
const rect = sel => `(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height }; })()`;
const sectCard = t => `(() => { const r = [...document.querySelectorAll('.sect')].find(s => s.querySelector('h3')?.textContent === ${JSON.stringify(t)}).getBoundingClientRect(); return { top: r.top, left: r.left, right: r.right }; })()`;

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  await chrome.setViewport(1280, 800);
  await chrome.goto(`${server.url}/?demo=1&unlock=a&t=1#/ano/${year}`);
  await waitFor(chrome, `!!document.querySelector('.wyear .chartcard')`);

  // ---- Year, Gastos ----
  assert.ok(await chrome.eval(`document.body.classList.contains('wide')`));
  assert.equal(await chrome.eval(`document.querySelectorAll('.wyear .kpis .kpi').length`), 3);
  assert.equal(await chrome.eval(`document.querySelectorAll('.wyear .wtop .yseg button, .wyear .wtop .vseg button').length`), 4);
  assert.ok(await chrome.eval(`!!document.querySelector('.wyear .fchips')`));
  const mid = await chrome.eval(rect('.wymid'));
  const card = await chrome.eval(rect('.chartcard'));
  assert.ok(card.height >= 0.6 * mid.height, `cartão do gráfico baixo: ${card.height} de ${mid.height}`);
  const plot = await chrome.eval(rect('.chartcard .chart'));
  const tall = await chrome.eval(`Math.max(...[...document.querySelectorAll('.chartcard .cols i')].map(i => i.getBoundingClientRect().height))`);
  assert.ok(tall >= 0.5 * plot.height, `barra mais alta: ${tall} de ${plot.height}`);
  assert.ok(plot.height >= 250, `área do gráfico: ${plot.height}`);
  assert.equal(await chrome.eval(`document.querySelectorAll('.wymonths .yrow').length`), 12);
  const bottoms = await chrome.eval(`[...document.querySelectorAll('.yrow')].map(r => r.getBoundingClientRect().bottom)`);
  assert.ok(bottoms.every(b => b <= 800), `linhas fora da janela: ${bottoms}`);
  const cw = await chrome.eval(`document.querySelector('.chartcard').getBoundingClientRect().width`);
  const lw = await chrome.eval(`document.querySelector('.wymonths').getBoundingClientRect().width`);
  assert.ok(cw > 1.5 * lw, `proporção 2:1: ${cw} / ${lw}`);
  await chrome.click(`.chartcard .cols [data-month="2"]`);
  await waitFor(chrome, `document.querySelector('.readout .label').textContent.toLowerCase().includes('março')`);
  assert.ok(await chrome.eval(`!!document.querySelector('.readout [data-act="open"]')`));
  assert.equal(await chrome.eval(`document.scrollingElement.scrollWidth <= innerWidth`), true);
  await chrome.screenshot(`${SHOTS}/wide-year.png`, { width: 1280, height: 800 });
  await chrome.click('.readout [data-act="open"]');
  await waitFor(chrome, `location.hash === '#/mes/${year}-03'`);

  // ---- Year, Poupança, profile B: the negative month in brick ----
  const neg = B.months.findIndex(m => m && m.rate < 0);
  assert.ok(neg >= 0);
  await chrome.goto(`${server.url}/?demo=1&unlock=b&t=2#/ano/${year}/poupanca`);
  await waitFor(chrome, `!!document.querySelector('.wyear .chartcard')`);
  assert.equal(await chrome.eval(`document.querySelectorAll('.wyear .fchips').length`), 0);
  assert.equal(await chrome.eval(`document.querySelectorAll('.cols i.negb').length`), B.months.filter(m => m && m.rate < 0).length);
  assert.equal(await chrome.eval(`getComputedStyle(document.querySelector('.cols i.negb')).backgroundColor`), 'rgb(163, 54, 31)');
  assert.equal(nb(await chrome.eval(`document.querySelector('.wyear .kpis .kpi > b').textContent`)), nb(formatPct(B.rate)));
  await chrome.click(`.chartcard .cols [data-month="${neg}"]`);
  await waitFor(chrome, `document.querySelector('.cols button.sel').dataset.v === '${neg}'`);
  assert.equal(await chrome.eval(`getComputedStyle(document.querySelector('.readout b')).color`), 'rgb(163, 54, 31)');
  await chrome.screenshot(`${SHOTS}/wide-year-poupanca.png`, { width: 1280, height: 800 });

  // ---- Casa still shows the split ----
  await chrome.goto(`${server.url}/?demo=1&unlock=a&t=3#/ano/${year}/casa`);
  await waitFor(chrome, `!!document.querySelector('.wyear .chartcard')`);
  assert.ok(await chrome.eval(`!!document.querySelector('.wyear .kpis .split')`));
  assert.ok(await chrome.eval(`!!document.querySelector('.wymonths .yrow .split')`));

  // ---- Categories: two columns ----
  await chrome.goto(`${server.url}/?demo=1&unlock=a&t=4#/categorias`);
  await waitFor(chrome, `!!document.querySelector('.ccols')`);
  const saidas = await chrome.eval(sectCard('Saídas'));
  const perfis = await chrome.eval(sectCard('Perfis'));
  const entradas = await chrome.eval(sectCard('Entradas'));
  assert.ok(perfis.left > saidas.right - 1, `Perfis ${perfis.left} / Saídas ${saidas.right}`);
  assert.ok(entradas.left < perfis.left && entradas.top > saidas.top, 'Entradas por baixo de Saídas');
  assert.equal(await chrome.eval(`document.scrollingElement.scrollWidth <= innerWidth`), true);
  await chrome.screenshot(`${SHOTS}/wide-categories.png`, { width: 1280, height: 800 });
  await chrome.eval(`document.querySelector('[data-act="editcat"]').click()`);
  await waitFor(chrome, `!!document.querySelector('.sheet.side')`);
  await chrome.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);

  // ---- Narrow: no wide class, unchanged structure ----
  await chrome.setViewport(390, 844);
  await chrome.goto(`${server.url}/?demo=1&unlock=a&t=5#/ano/${year}`);
  await waitFor(chrome, `!!document.querySelector('.chartcard')`);
  assert.equal(await chrome.eval(`document.body.classList.contains('wide') || !!document.querySelector('.wyear')`), false);
  await chrome.goto(`${server.url}/?demo=1&unlock=a&t=6#/categorias`);
  await waitFor(chrome, `!!document.querySelector('.sect')`);
  assert.equal(await chrome.eval(`document.body.classList.contains('wide')`), false);

  assert.deepEqual(await chrome.pageErrors(), []);
  console.log('wide-year-cats.ui: ok');
  code = 0;
} catch (e) {
  console.error(e);
} finally {
  await chrome?.close();
  await server?.close();
  process.exit(code);
}
