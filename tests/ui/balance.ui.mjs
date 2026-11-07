// Account balance on Mês and Ano (phone and wide) in demo mode.
// Expected numbers come from the same demo data and models, computed here in Node.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { demoData } from '../../js/demo-data.js';
import { monthModel, yearModel } from '../../js/logic/stats.js';
import { formatEur, todayISO, addMonths } from '../../js/logic/format.js';
import { lastDay } from '../../js/logic/balance.js';
import { SHOTS, waitFor } from './helpers.mjs';

const today = todayISO();
const ym = today.slice(0, 7);
const year = Number(ym.slice(0, 4));
const prevYm = addMonths(ym, -1);
const data = demoData(today);
const mb = (m, view) => monthModel({ ...data, ym: m, view }).balance;
const yb = (y, view) => yearModel({ ...data, year: y, view, mode: 'gastos', filter: 'all' }).balance;
const nb = s => s.replace(/ /g, ' ');
const HINT = 'Indica o saldo inicial em Categorias para o saldo ficar certo.';
const q = (sel, fn) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); return el ? (${fn}) : null; })()`;
const text = sel => q(sel, 'el.textContent');

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  const open = async (u, hash, w, h, ready) => {
    await chrome.setViewport(w, h);
    await chrome.goto(`${server.url}/?demo=1&unlock=${u}&t=${Math.random()}#${hash}`);
    await waitFor(chrome, `!!document.querySelector('${ready}')`);
  };
  const balText = async () => nb((await chrome.eval(text('.balcard > b'))).trim());

  // ---- Phone, profile A: current month ----
  await open('a', `/mes/${ym}`, 390, 844, '.balcard');
  assert.equal(await chrome.eval(text('.balcard .label')), 'Em conta (fim do mês)');
  assert.equal(await balText(), nb(formatEur(mb(ym, 'a').total)));
  assert.equal(await chrome.eval(`document.querySelector('.balcard').tagName`), 'DIV');
  assert.equal(await chrome.eval(`!!document.querySelector('.balcard .balhint')`), false);
  assert.equal(await chrome.eval(`document.documentElement.scrollWidth <= innerWidth`), true);
  await chrome.screenshot(`${SHOTS}/balance-phone-a.png`, { width: 390, height: 844 });

  // previous month
  await open('a', `/mes/${prevYm}`, 390, 844, '.balcard');
  assert.equal(await chrome.eval(text('.balcard .label')), 'Em conta no fim do mês');
  assert.equal(await balText(), nb(formatEur(mb(prevYm, 'a').total)));

  // ---- Phone, profile B: no opening balance, hint ----
  await open('b', `/mes/${ym}`, 390, 844, '.balcard');
  assert.equal(await balText(), nb(formatEur(mb(ym, 'b').total)));
  assert.equal(await chrome.eval(text('.balcard .balhint')), HINT);
  await chrome.screenshot(`${SHOTS}/balance-phone-b.png`, { width: 390, height: 844 });

  // ---- Phone, Casa: split with both names, no hint ----
  await open('a', `/mes/${ym}/casa`, 390, 844, '.balcard');
  const casa = mb(ym, 'casa');
  assert.equal(await balText(), nb(formatEur(casa.total)));
  const split = nb(await chrome.eval(text('.balcard .split')));
  for (const p of casa.split) assert.ok(split.includes(`${p.name} ${nb(formatEur(p.cents))}`), split);
  assert.equal(await chrome.eval(`!!document.querySelector('.balcard .balhint')`), false);
  await chrome.screenshot(`${SHOTS}/balance-phone-casa.png`, { width: 390, height: 844 });

  // ---- Phone Ano: current and last year ----
  await open('a', `/ano/${year}`, 390, 844, '.balcard');
  assert.equal(await chrome.eval(text('.balcard .label')), `Em conta no fim de ${year}`);
  assert.equal(await balText(), nb(formatEur(yb(year, 'a').total)));
  await open('a', `/ano/${year - 1}`, 390, 844, '.balcard');
  assert.equal(await chrome.eval(text('.balcard .label')), `Em conta no fim de ${year - 1}`);
  assert.equal(await balText(), nb(formatEur(yb(year - 1, 'a').total)));
  await open('a', `/ano/${year}/poupanca`, 390, 844, '.balcard');
  assert.equal(await balText(), nb(formatEur(yb(year, 'a').total)));
  // Ano hint: only the profile without an opening balance, never Casa
  const hintCount = `document.querySelectorAll('.balcard .balhint').length`;
  assert.equal(await chrome.eval(hintCount), 0);
  await open('b', `/ano/${year}`, 390, 844, '.balcard');
  assert.equal(await chrome.eval(text('.balcard .balhint')), HINT);
  await open('b', `/ano/${year}/poupanca`, 390, 844, '.balcard');
  assert.equal(await chrome.eval(text('.balcard .balhint')), HINT);
  await open('a', `/ano/${year}/poupanca`, 390, 844, '.balcard');
  assert.equal(await chrome.eval(hintCount), 0);
  await open('a', `/ano/${year}/casa`, 390, 844, '.balcard');
  assert.equal(await balText(), nb(formatEur(yb(year, 'casa').total)));
  assert.ok((await chrome.eval(text('.balcard .split'))).includes('Perfil B'));
  await chrome.screenshot(`${SHOTS}/balance-phone-year.png`, { width: 390, height: 844 });

  // ---- Wide month ----
  await open('a', `/mes/${ym}`, 1280, 800, '.kpis');
  assert.equal(await chrome.eval(`document.querySelectorAll('.kpis .kpi').length`), 5);
  assert.equal(await chrome.eval(`document.querySelectorAll('.kpis .kpi')[4].querySelector('.label').textContent`), 'Em conta (fim do mês)');
  assert.equal(nb(await chrome.eval(`document.querySelectorAll('.kpis .kpi')[4].querySelector('b').textContent`)), nb(formatEur(mb(ym, 'a').total)));
  const hs = await chrome.eval(`[...document.querySelectorAll('.kpis .kpi')].map(e => e.getBoundingClientRect().height)`);
  assert.ok(hs.every(h => h <= 110), `cartões altos: ${hs}`);
  await chrome.screenshot(`${SHOTS}/balance-wide-a.png`, { width: 1280, height: 800 });
  await open('b', `/mes/${ym}`, 1280, 800, '.kpis');
  assert.equal(await chrome.eval(`[...document.querySelectorAll('.kpiphrase')].map(e => e.textContent).includes(${JSON.stringify(HINT)})`), true);
  assert.equal(await chrome.eval(`!!document.querySelector('.kpis .balhint')`), false);
  const hsB = await chrome.eval(`[...document.querySelectorAll('.kpis .kpi')].map(e => e.getBoundingClientRect().height)`);
  assert.ok(hsB.every(h => h <= 110), `cartões altos (hint): ${hsB}`);
  await chrome.screenshot(`${SHOTS}/balance-wide-b.png`, { width: 1280, height: 800 });
  await open('a', `/mes/${ym}/casa`, 1280, 800, '.kpis');
  const wsplit = nb(await chrome.eval(`document.querySelectorAll('.kpis .kpi')[4].querySelector('.split').textContent`));
  for (const p of casa.split) assert.ok(wsplit.includes(`${p.name} ${nb(formatEur(p.cents))}`), wsplit);
  // (Casa cards are taller than 110 px already today: each carries a two-line split)
  await chrome.screenshot(`${SHOTS}/balance-wide-casa.png`, { width: 1280, height: 800 });

  // ---- 1024 px: no horizontal scroll ----
  for (const [u, hash, sel] of [['a', `/mes/${ym}`, '.kpis'], ['b', `/mes/${ym}`, '.kpis'], ['a', `/mes/${ym}/casa`, '.kpis'], ['a', `/ano/${year}/casa`, '.kpis']]) {
    await open(u, hash, 1024, 768, sel);
    assert.equal(await chrome.eval(`[...document.querySelectorAll('.scroll, body')].every(e => e.scrollWidth <= e.clientWidth)`), true, `${u} ${hash}`);
    assert.equal(await chrome.eval(`[...document.querySelectorAll('.kpis .kpi')].every(e => e.scrollWidth <= e.clientWidth + 1)`), true, `kpi overflow ${u} ${hash}`);
  }
  await open('b', `/mes/${ym}`, 1024, 768, '.kpis');
  await chrome.screenshot(`${SHOTS}/balance-wide-1024.png`, { width: 1024, height: 768 });

  // ---- Wide Ano ----
  const wideHint = `[...document.querySelectorAll('.wyear .kpiphrase')].map(e => e.textContent).includes(${JSON.stringify(HINT)})`;
  for (const [u, h, want] of [['b', `/ano/${year}`, true], ['b', `/ano/${year}/poupanca`, true], ['a', `/ano/${year}`, false], ['a', `/ano/${year}/casa`, false]]) {
    await open(u, h, 1280, 800, '.wyear .kpis');
    assert.equal(await chrome.eval(wideHint), want, `${u} ${h}`);
    assert.equal(await chrome.eval(`!!document.querySelector('.wyear .kpis .balhint')`), false);
  }
  await open('a', `/ano/${year}`, 1280, 800, '.kpis');
  assert.equal(await chrome.eval(`document.querySelectorAll('.wyear .kpis .kpi').length`), 4);
  assert.equal(await chrome.eval(`document.querySelectorAll('.wyear .kpis .kpi')[3].querySelector('.label').textContent`), `Em conta no fim de ${year}`);
  assert.equal(nb(await chrome.eval(`document.querySelectorAll('.wyear .kpis .kpi')[3].querySelector('b').textContent`)), nb(formatEur(yb(year, 'a').total)));
  await open('a', `/ano/${year - 1}/poupanca`, 1280, 800, '.kpis');
  assert.equal(nb(await chrome.eval(`document.querySelectorAll('.wyear .kpis .kpi')[3].querySelector('b').textContent`)), nb(formatEur(yb(year - 1, 'a').total)));
  await open('a', `/ano/${year}/casa`, 1280, 800, '.kpis');
  assert.ok((await chrome.eval(`document.querySelectorAll('.wyear .kpis .kpi')[3].querySelector('.split').textContent`)).includes('Perfil B'));
  await chrome.screenshot(`${SHOTS}/balance-wide-year.png`, { width: 1280, height: 800 });

  // ---- Negative balance: "−" in brick ----
  await open('a', `/mes/${ym}`, 390, 844, '.balcard');
  await chrome.eval(`window.__demo.store.updateProfile('a', { openingCents: -90000000, openingDate: ${JSON.stringify(lastDay(addMonths(ym, -12)))} })`);
  await waitFor(chrome, `document.querySelector('.balcard > b').textContent.trim().startsWith('−')`);
  assert.equal(await chrome.eval(q('.balcard > b', 'getComputedStyle(el).color')), 'rgb(163, 54, 31)');
  await open('a', `/mes/${ym}`, 1280, 800, '.kpis');
  await chrome.eval(`window.__demo.store.updateProfile('a', { openingCents: -90000000, openingDate: ${JSON.stringify(lastDay(addMonths(ym, -12)))} })`);
  await waitFor(chrome, `document.querySelectorAll('.kpis .kpi')[4].querySelector('b').textContent.trim().startsWith('−')`);
  assert.equal(await chrome.eval(`getComputedStyle(document.querySelectorAll('.kpis .kpi')[4].querySelector('b')).color`), 'rgb(163, 54, 31)');

  assert.deepEqual(await chrome.pageErrors(), []);
  console.log('balance.ui: ok');
  code = 0;
} catch (e) {
  console.error(e);
} finally {
  await chrome?.close();
  await server?.close();
  process.exit(code);
}
