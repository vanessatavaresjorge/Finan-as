// Wide "Exportar Excel" screen in demo mode: defaults, invalid range, real download checked with unzip.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { demoData } from '../../js/demo-data.js';
import { todayISO } from '../../js/logic/format.js';
import { monthsInRange } from '../../js/logic/export.js';
import { SHOTS, waitFor } from './helpers.mjs';

const today = todayISO();
const year = today.slice(0, 4);
const curYm = today.slice(0, 7);
const data = demoData(today);
const firstYm = data.moves.map(m => m.date.slice(0, 7)).sort()[0];
const notes = [...new Set(data.moves.map(m => m.note).filter(Boolean))];
assert.ok(notes.length > 0);

const pick = (id, v) => `(() => { const s = document.getElementById(${JSON.stringify(id)}); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event('change', { bubbles: true })); })()`;
const setRange = async (from, to) => {
  await chrome.eval(pick('ex-from-m', from.slice(5)));
  await chrome.eval(pick('ex-from-y', from.slice(0, 4)));
  await chrome.eval(pick('ex-to-m', to.slice(5)));
  await chrome.eval(pick('ex-to-y', to.slice(0, 4)));
};
const unzip = (args) => spawnSync('/usr/bin/unzip', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  await chrome.setViewport(1280, 800);
  await chrome.goto(`${server.url}/?demo=1&unlock=a&t=1#/exportar`);
  await waitFor(chrome, `!!document.querySelector('.wexport')`);
  assert.equal(await chrome.eval(`document.querySelector('.wexport .title').textContent`), 'Exportar Excel');

  // defaults: January of this year -> this month
  const vals = await chrome.eval(`['ex-from-m','ex-from-y','ex-to-m','ex-to-y'].map(i => document.getElementById(i).value)`);
  assert.deepEqual(vals, ['01', year, curYm.slice(5), year]);
  assert.equal(await chrome.eval(`document.querySelector('[data-act="download"]').disabled`), false);

  // invalid range
  await setRange(`${year}-12`, `${year}-01`);
  await waitFor(chrome, `document.querySelector('[data-act="download"]').disabled`);
  assert.equal(await chrome.eval(`document.querySelector('.wexport .exerr').textContent`), 'O mês de início tem de ser antes do mês de fim.');

  // valid range covering the demo data; capture the download
  await setRange(firstYm, curYm);
  await waitFor(chrome, `!document.querySelector('[data-act="download"]').disabled`);
  assert.equal(await chrome.eval(`document.querySelector('.wexport .exerr').hidden`), true);
  await chrome.screenshot(`${SHOTS}/wide-export.png`, { width: 1280, height: 800 });
  await chrome.eval(`(() => {
    window.__dl = null;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.download) { const name = this.download; window.__dl = fetch(this.href).then(r => r.arrayBuffer()).then(b => {
        let s = ''; const u = new Uint8Array(b); for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode(...u.subarray(i, i + 8192));
        return { name, b64: btoa(s) }; }); return; }
      return orig.call(this);
    };
  })()`);
  await chrome.click('[data-act="download"]');
  await waitFor(chrome, `window.__dl !== null`);
  const dl = await chrome.eval(`window.__dl`);
  assert.match(dl.name, /^financas-\d{4}-\d{2}-a-\d{4}-\d{2}\.xlsx$/);
  assert.equal(dl.name, `financas-${firstYm}-a-${curYm}.xlsx`);
  const file = path.join(SHOTS, dl.name);
  writeFileSync(file, Buffer.from(dl.b64, 'base64'));
  assert.equal(unzip(['-tq', file]).status, 0);
  const sheet1 = unzip(['-p', file, 'xl/worksheets/sheet1.xml']).stdout;
  const sheet2 = unzip(['-p', file, 'xl/worksheets/sheet2.xml']).stdout;
  const rows1 = sheet1.split('<row ');
  assert.ok(rows1[2].includes('>Perfil A<'), 'primeira linha de dados: Perfil A');
  const rows2 = sheet2.match(/<row /g).length;
  assert.equal(rows2, 1 + monthsInRange(firstYm, curYm).length * 2);
  const all = unzip(['-p', file]).stdout;
  for (const n of notes) assert.ok(!all.includes(n.replace(/&/g, '&amp;')), `nota no ficheiro: ${n}`);
  assert.equal(await chrome.eval(`document.querySelector('.wexport .exerr').hidden`), true);

  // narrow: redirect, no export UI
  await chrome.setViewport(390, 800);
  await chrome.goto(`${server.url}/?demo=1&unlock=a&t=2#/exportar`);
  await waitFor(chrome, `location.hash.startsWith('#/mes/')`);
  assert.equal(await chrome.eval(`document.querySelectorAll('.wexport, [data-act="download"]').length`), 0);

  assert.deepEqual(await chrome.pageErrors(), []);
  console.log('wide-export.ui: ok');
  code = 0;
} catch (e) {
  console.error(e);
} finally {
  await chrome?.close();
  await server?.close();
  process.exit(code);
}
