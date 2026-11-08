// 50/30/20 card on Mês and Ano (phone and wide) in demo mode.
// Expected numbers come from the same demo data and models, computed here in Node.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { demoData } from '../../js/demo-data.js';
import { monthModel, yearModel } from '../../js/logic/stats.js';
import { TARGETS } from '../../js/logic/groups.js';
import { todayISO, addMonths } from '../../js/logic/format.js';
import { SHOTS, waitFor } from './helpers.mjs';

const today = todayISO();
const ym = today.slice(0, 7);
const year = Number(ym.slice(0, 4));
const futureYm = addMonths(ym, 24);
const futureYear = year + 2;
const data = demoData(today);
const mRule = (m, view) => monthModel({ ...data, ym: m, view }).rule;
const yRule = (y, view) => yearModel({ ...data, year: y, view, mode: 'gastos', filter: 'all' }).rule;
const OK = 'rgb(31, 122, 90)', BAD = 'rgb(163, 54, 31)';
const KEYS = [['necessidade', 'nec', 'Necessidades'], ['desejo', 'des', 'Desejos'], ['poupanca', 'pou', 'Poupança']];
const within = (g, pct) => (g === 'poupanca' ? pct >= TARGETS[g] : pct <= TARGETS[g]);
const nb = s => s.replace(/ /g, ' ');

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  const open = async (u, hash, w, h, ready) => {
    await chrome.setViewport(w, h);
    await chrome.goto(`${server.url}/?demo=1&unlock=${u}&t=${Math.random()}#${hash}`);
    await waitFor(chrome, `!!document.querySelector('${ready}')`);
  };
  // Reads the rows of the first rule card (scope narrows where to look).
  const rows = scope => chrome.eval(`[...document.querySelectorAll(${JSON.stringify(scope + ' .rulecard .rrow')})].map(r => {
    const bar = r.querySelector('.rbar').getBoundingClientRect(), mk = r.querySelector('.rmark').getBoundingClientRect();
    return { g: r.dataset.g, name: r.querySelector('.rname').textContent, pct: r.querySelector('.rpct').textContent,
      color: getComputedStyle(r.querySelector('.rpct')).color, meta: r.querySelector('.rmeta').textContent,
      fill: getComputedStyle(r.querySelector('.rbar i')).backgroundColor, fillW: r.querySelector('.rbar i').getBoundingClientRect().width,
      barW: bar.width, markX: mk.left + mk.width / 2 - bar.left, split: r.querySelector('.split')?.textContent ?? null };
  })`);
  const checkRows = (got, rule, label, casa) => {
    assert.equal(got.length, 3, label);
    KEYS.forEach(([g, k, name], i) => {
      const r = got[i], pct = rule.totals.pct[k];
      assert.equal(r.name, name, label);
      assert.equal(r.pct, `${pct}%`, label);
      assert.equal(r.meta, `meta ${TARGETS[g]}%`, label);
      const col = within(g, pct) ? OK : BAD;
      assert.equal(r.color, col, `${label} ${g} color`);
      assert.equal(r.fill, col, `${label} ${g} fill`);
      assert.ok(Math.abs(r.fillW - r.barW * Math.max(0, Math.min(100, pct)) / 100) <= 2, `${label} ${g} fill width`);
      assert.ok(Math.abs(r.markX - r.barW * TARGETS[g] / 100) <= 2, `${label} ${g} marker ${r.markX}/${r.barW}`);
      if (casa) {
        const want = rule.split.map(p => `${p.name} ${p.pct === null ? '—' : p.pct[k] + '%'}`).join(' · ');
        assert.equal(nb(r.split), nb(want), `${label} split`);
      } else assert.equal(r.split, null, `${label} no split`);
    });
  };
  const noScroll = () => chrome.eval(`[...document.querySelectorAll('.scroll, body')].every(e => e.scrollWidth <= e.clientWidth)`);

  // ---- Phone Mês: profile A ----
  await open('a', `/mes/${ym}`, 390, 844, '.rulecard');
  assert.equal(await chrome.eval(`document.querySelector('.rulecard .rtitle').textContent`), '50/30/20');
  assert.equal(await chrome.eval(`document.querySelector('.savecard').nextElementSibling === document.querySelector('.rulecard')`), true, 'below the savings card');
  checkRows(await rows('.scroll'), mRule(ym, 'a'), 'phone a', false);
  await chrome.screenshot(`${SHOTS}/rule-phone-a.png`, { width: 390, height: 844 });
  // ---- Phone Mês: Casa ----
  await open('a', `/mes/${ym}/casa`, 390, 844, '.rulecard');
  checkRows(await rows('.scroll'), mRule(ym, 'casa'), 'phone casa', true);
  await chrome.screenshot(`${SHOTS}/rule-phone-casa.png`, { width: 390, height: 844 });
  // ---- Phone Mês: empty future month ----
  await open('a', `/mes/${futureYm}`, 390, 844, '.rulecard');
  assert.equal(await chrome.eval(`document.querySelector('.rulecard .rnone').textContent`), '—');
  assert.equal(await chrome.eval(`document.querySelector('.rulecard .rempty').textContent`), 'Ainda não há movimentos neste mês.');
  assert.equal(await chrome.eval(`document.querySelectorAll('.rulecard .rrow').length`), 0);
  await chrome.screenshot(`${SHOTS}/rule-phone-empty.png`, { width: 390, height: 844 });

  // ---- Wide Mês ----
  await open('a', `/mes/${ym}`, 1280, 800, '.wmonth .rulecard');
  assert.equal(await chrome.eval(`document.querySelectorAll('.wmonth .kpis .kpi').length`), 5, 'KPI row unchanged');
  assert.equal(await chrome.eval(`!!document.querySelector('.kpis .rulecard')`), false);
  assert.equal(await chrome.eval(`document.querySelector('.rulecard').compareDocumentPosition(document.querySelector('.wmid')) & Node.DOCUMENT_POSITION_FOLLOWING`) > 0, true, 'strip above categories');
  checkRows(await rows('.wmonth'), mRule(ym, 'a'), 'wide a', false);
  const xs = await chrome.eval(`[...document.querySelectorAll('.wmonth .rulecard .rrow')].map(r => Math.round(r.getBoundingClientRect().left))`);
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2], `three columns side by side: ${xs}`);
  const w = await chrome.eval(`[document.querySelector('.rulecard').getBoundingClientRect().width, document.querySelector('.kpis').getBoundingClientRect().width]`);
  assert.ok(Math.abs(w[0] - w[1]) <= 2, `full width ${w}`);
  await chrome.screenshot(`${SHOTS}/rule-wide-a.png`, { width: 1280, height: 800 });
  await open('a', `/mes/${ym}/casa`, 1280, 800, '.wmonth .rulecard');
  checkRows(await rows('.wmonth'), mRule(ym, 'casa'), 'wide casa', true);
  await chrome.screenshot(`${SHOTS}/rule-wide-casa.png`, { width: 1280, height: 800 });
  await open('a', `/mes/${futureYm}`, 1280, 800, '.wmonth .rulecard');
  assert.equal(await chrome.eval(`document.querySelector('.rulecard .rempty').textContent`), 'Ainda não há movimentos neste mês.');
  for (const [u, hash] of [['a', `/mes/${ym}`], ['b', `/mes/${ym}`], ['a', `/mes/${ym}/casa`], ['a', `/mes/${futureYm}`]]) {
    await open(u, hash, 1024, 768, '.wmonth .rulecard');
    assert.equal(await noScroll(), true, `1024 ${u} ${hash}`);
    assert.equal(await chrome.eval(`[...document.querySelectorAll('.rulecard, .rulecard .rrow')].every(e => e.scrollWidth <= e.clientWidth + 1)`), true, `1024 overflow ${hash}`);
  }
  await open('a', `/mes/${ym}/casa`, 1024, 768, '.wmonth .rulecard');
  await chrome.screenshot(`${SHOTS}/rule-wide-1024.png`, { width: 1024, height: 768 });

  // ---- Ano: phone and wide, Gastos and Poupança, profile and Casa ----
  for (const [w, h, scope] of [[390, 844, '.scroll'], [1280, 800, '.wyear']]) {
    for (const [hash, view, casa] of [[`/ano/${year}`, 'a', false], [`/ano/${year}/poupanca`, 'a', false], [`/ano/${year}/casa`, 'casa', true], [`/ano/${year}/poupanca/casa`, 'casa', true]]) {
      await open('a', hash, w, h, '.rulecard');
      checkRows(await rows(scope), yRule(year, view), `ano ${w} ${hash}`, casa);
      assert.equal(await chrome.eval(`document.querySelector('.rulecard .rtitle').textContent`), '50/30/20');
    }
    if (w > 1000) {
      await open('a', `/ano/${year}`, w, h, '.rulecard');
      assert.equal(await chrome.eval(`document.querySelector('.wymid').compareDocumentPosition(document.querySelector('.rulecard')) & Node.DOCUMENT_POSITION_FOLLOWING`) > 0, true, 'wide year: strip after chart row');
      assert.equal(await chrome.eval(`[...document.querySelectorAll('.yrow')].every(r => r.getBoundingClientRect().bottom <= innerHeight)`), true, 'rows above the fold');
    }
    await open('a', `/ano/${futureYear}`, w, h, '.rulecard');
    assert.equal(await chrome.eval(`document.querySelector('.rulecard .rnone').textContent`), '—');
    assert.equal(await chrome.eval(`document.querySelector('.rulecard .rempty').textContent`), 'Ainda não há movimentos neste ano.');
    await open('a', `/ano/${year}/casa`, w, h, '.rulecard');
    await chrome.screenshot(`${SHOTS}/rule-year-${w}.png`, { width: w, height: h });
    assert.equal(await noScroll(), true, `year ${w} no scroll`);
  }
  await open('a', `/ano/${year}/casa`, 1024, 768, '.rulecard');
  assert.equal(await noScroll(), true, 'year 1024');

  // ---- Outside-target colours: first demo month (profile B) where any group misses its target ----
  const bad = Array.from({ length: 12 }, (_, i) => addMonths(ym, -i)).find(m => {
    const p = mRule(m, 'b').totals.pct;
    return p && KEYS.some(([g, k]) => !within(g, p[k]));
  });
  assert.ok(bad, 'demo has a month outside target');
  for (const [w, h, scope, sel] of [[390, 844, '.scroll', '.rulecard'], [1280, 800, '.wmonth', '.wmonth .rulecard']]) {
    await open('b', `/mes/${bad}`, w, h, sel);
    checkRows(await rows(scope), mRule(bad, 'b'), `outside ${w}`, false);
  }
  await chrome.screenshot(`${SHOTS}/rule-wide-outside.png`, { width: 1280, height: 800 });

  assert.deepEqual(await chrome.pageErrors(), []);
  console.log('rule.ui: ok');
  code = 0;
} catch (e) {
  console.error(e);
} finally {
  await chrome?.close();
  await server?.close();
  process.exit(code);
}
