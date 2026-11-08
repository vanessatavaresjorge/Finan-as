// Categories screen in demo mode: categories (create, duplicate, delete with and without moves,
// last of a type), backup export/import, Mudar código, profiles (rename, new), escaped icons.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { demoData } from '../../js/demo-data.js';
import { monthModel } from '../../js/logic/stats.js';
import { buildBackup, INVALID_BACKUP } from '../../js/backup.js';
import { formatEur, todayISO, addMonths } from '../../js/logic/format.js';
import { SHOTS, waitFor } from './helpers.mjs';

const PHONE = { width: 390, height: 844 };
const today = todayISO();
const ym = today.slice(0, 7);
const nb = s => String(s).replace(/ /g, ' ');
const text = sel => `document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`;
const rowsOf = sect => `[...document.querySelectorAll('.sect')].find(s => s.querySelector('h3')?.textContent === ${JSON.stringify(sect)})`;
const names = sect => `[...${rowsOf(sect)}.querySelectorAll('.catrow > span:first-child')].map(e => e.textContent.trim())`;
const rowBtn = (sect, name, act) => `[...${rowsOf(sect)}.querySelectorAll('.catrow')].find(r => r.querySelector('span')?.textContent.includes(${JSON.stringify(name)})).querySelector('[data-act="${act}"]').click()`;
const btnText = label => `[...document.querySelectorAll('.scroll .btn')].find(b => b.textContent.trim().startsWith(${JSON.stringify(label)}))`;
const toast = text('.toast');

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  await chrome.goto(`${server.url}/?demo=1&unlock=a#/categorias`);
  await waitFor(chrome, `!!${rowsOf('Saídas')}`);
  const typePin = async pin => {
    await waitFor(chrome, `document.querySelectorAll('.lock .dots i').length === 6 && document.querySelectorAll('.lock .dots i.f').length === 0`);
    for (const d of pin) await chrome.click(`.pad button[data-v="${d}"]`);
  };
  const sub = () => chrome.eval(text('.lock .sub'));
  const backToCats = () => waitFor(chrome, `!!${rowsOf('Saídas')}`);

  // ---- Layout ----
  assert.equal(await chrome.eval(text('.scroll .title')), 'Categorias');
  assert.equal(await chrome.eval(`document.querySelector('.tabs button.on')?.textContent`), 'Categorias');
  assert.deepEqual(await chrome.eval(`[...document.querySelectorAll('.sect h3')].map(h => h.textContent)`),
    ['Saídas', 'Entradas', 'Perfis', 'Cópia de segurança e conta']);
  assert.deepEqual(await chrome.eval(names('Entradas')), ['💼Salário', '💶Outros']);
  assert.ok((await chrome.eval(names('Saídas'))).includes('📈Investimentospoupança'));
  assert.equal(await chrome.eval(`${rowsOf('Saídas')}.querySelector('.tag.grp:not(.muted)').textContent`), 'poupança');
  assert.equal(await chrome.eval(`getComputedStyle(${rowsOf('Saídas')}.querySelector('.tag.grp:not(.muted)')).color`), 'rgb(31, 122, 90)');
  assert.deepEqual(await chrome.eval(names('Perfis')), ['PPerfil Aaberto', 'PPerfil B']);
  assert.deepEqual(await chrome.eval(`[...document.querySelectorAll('.scroll .btn')].map(b => b.textContent.trim())`),
    ['Exportar cópia', 'Importar cópia', 'Mudar código de Perfil A'], 'em demonstração não há Terminar sessão');
  assert.equal(await chrome.eval(`document.body.textContent.includes('Conta da casa')`), false);
  await chrome.screenshot(`${SHOTS}/cats-screen.png`, PHONE);

  // ---- New category Ginásio 🏋️, savings ----
  await chrome.eval(`${rowsOf('Saídas')}.querySelector('[data-act="newcat"]').click()`);
  await waitFor(chrome, `!!document.querySelector('#catname')`);
  assert.equal(await chrome.eval(text('.sheet .title')), 'Nova categoria de saída');
  await chrome.type('#catname', 'Ginásio');
  await chrome.click('.emojis button[data-v="🏋️"]');
  await chrome.click('[data-act="group"][data-g="poupanca"]');
  await chrome.click('[data-act="sheet-save"]');
  await waitFor(chrome, `!document.querySelector('.shade') && ${names('Saídas')}.includes('🏋️Ginásiopoupança')`);

  // ---- Duplicate name ----
  await chrome.eval(`${rowsOf('Saídas')}.querySelector('[data-act="newcat"]').click()`);
  await waitFor(chrome, `!!document.querySelector('#catname')`);
  await chrome.type('#catname', 'carro');
  await chrome.click('[data-act="sheet-save"]');
  assert.equal(await chrome.eval(text('.sheet .error')), 'Já existe uma categoria com esse nome.');
  await chrome.click('.sheet [data-act="sheet-cancel"]');

  // ---- Editar opens the sheet with name and icon ----
  await chrome.eval(rowBtn('Saídas', 'Ginásio', 'editcat'));
  await waitFor(chrome, `document.querySelector('#catname')?.value === 'Ginásio'`);
  assert.equal(await chrome.eval(text('.sheet .title')), 'Editar categoria');
  assert.equal(await chrome.eval(text('.namein .e')), '🏋️');
  await chrome.click('.sheet [data-act="sheet-cancel"]');

  // ---- Icons from an imported backup are escaped (list and edit sheet) ----
  const bad = '<img src=x onerror="window.__xss=1">';
  await chrome.eval(`__demo.store.addCategory({ name: 'Estranha', type: 'out', icon: ${JSON.stringify(bad)}, savings: false })`);
  await waitFor(chrome, `${names('Saídas')}.some(n => n.includes('Estranha'))`);
  await chrome.eval(rowBtn('Saídas', 'Estranha', 'editcat'));
  await waitFor(chrome, `!!document.querySelector('#catname')`);
  assert.equal(await chrome.eval(text('.namein .e')), bad);
  assert.equal(await chrome.eval(`document.querySelectorAll('#app img').length`), 0);
  await chrome.click('.sheet [data-act="sheet-cancel"]');
  // ---- Delete without moves: simple confirmation ----
  await chrome.eval(rowBtn('Saídas', 'Estranha', 'delcat'));
  await waitFor(chrome, `!!document.querySelector('.shade [data-act="sheet-ok"]')`);
  assert.equal(await chrome.eval(text('.sheet .title')), 'Eliminar a categoria "Estranha"? Desaparece para todos os perfis.');
  await chrome.click('.shade [data-act="sheet-ok"]');
  await waitFor(chrome, `!document.querySelector('.shade') && !${names('Saídas')}.some(n => n.includes('Estranha'))`);
  assert.equal(await chrome.eval(`window.__xss ?? null`), null);

  // ---- Delete Carro (has moves) → Lazer ----
  const data = demoData(today);
  const carroCount = data.moves.filter(m => m.categoryId === 'carro').length;
  await chrome.eval(rowBtn('Saídas', 'Carro', 'delcat'));
  await waitFor(chrome, `!!document.querySelector('.sheet .chips')`);
  assert.equal(await chrome.eval(text('.sheet .title')), 'Eliminar 🚗 Carro');
  assert.equal(await chrome.eval(text('.sheet p')), `Esta categoria tem ${carroCount} movimentos. Para onde os queres passar?`);
  const chips = await chrome.eval(`[...document.querySelectorAll('.sheet .chip')].map(c => c.textContent.trim())`);
  assert.ok(chips.includes('🎬Lazer') && !chips.includes('🚗Carro') && !chips.includes('💼Salário'));
  await chrome.screenshot(`${SHOTS}/cats-delete-sheet.png`, PHONE);
  await chrome.eval(`[...document.querySelectorAll('.sheet .chip')].find(c => c.textContent.includes('Lazer')).click()`);
  await waitFor(chrome, `!document.querySelector('.shade') && !${names('Saídas')}.includes('🚗Carro')`);
  // the month with Perfil A's Carro move now shows it under Lazer
  const carroMove = data.moves.find(m => m.categoryId === 'carro' && m.profileId === 'a');
  const cym = carroMove.date.slice(0, 7);
  for (const m of data.moves) if (m.categoryId === 'carro') m.categoryId = 'lazer';
  const lazer = monthModel({ ...data, ym: cym, view: 'a' }).categories.find(c => c.id === 'lazer');
  await chrome.eval(`location.hash = '#/mes/${cym}'`);
  await waitFor(chrome, `!!document.querySelector('.card.list')`);
  const lazerRow = await chrome.eval(`[...document.querySelectorAll('.card.list .row')].find(r => r.textContent.includes('Lazer'))?.querySelector('b.num').textContent`);
  assert.equal(nb(lazerRow), nb(formatEur(lazer.cents)));
  assert.equal(await chrome.eval(`document.querySelector('.card.list').textContent.includes('Carro')`), false);
  await chrome.eval(`document.querySelector('.tabs button[data-v="categorias"]').click()`);
  await backToCats();

  // ---- Outros (has moves) → Salário, then Salário is the last income category ----
  await chrome.eval(rowBtn('Entradas', 'Outros', 'delcat'));
  await waitFor(chrome, `!!document.querySelector('.sheet .chips')`);
  await chrome.eval(`[...document.querySelectorAll('.sheet .chip')].find(c => c.textContent.includes('Salário')).click()`);
  await waitFor(chrome, `!document.querySelector('.shade') && ${names('Entradas')}.length === 1`);
  await chrome.eval(rowBtn('Entradas', 'Salário', 'delcat'));
  await waitFor(chrome, `!!document.querySelector('.toast')`);
  assert.equal(await chrome.eval(toast), 'Não podes eliminar a última categoria de entradas.');
  assert.equal(await chrome.eval(`document.querySelectorAll('.shade').length`), 0);
  assert.deepEqual(await chrome.eval(names('Entradas')), ['💼Salário']);

  // ---- Export: no touch screen (the Mac) downloads, even when the browser could share ----
  assert.equal(await chrome.eval(`navigator.maxTouchPoints`), 0);
  await chrome.eval(`navigator.canShare = () => true; window.__shared = 0;
    navigator.share = async () => { window.__shared++; }; window.__dl = null;
    HTMLAnchorElement.prototype.click = function () {
      const name = this.download;
      fetch(this.href).then(r => r.text()).then(t => { window.__dl = { name, text: t }; });
    }`);
  await chrome.eval(`${btnText('Exportar cópia')}.click()`);
  await waitFor(chrome, `!!window.__dl`);
  const dl = await chrome.eval(`window.__dl`);
  assert.equal(await chrome.eval(`window.__shared`), 0, 'no Mac não abre a folha de partilha');
  assert.match(dl.name, /^financas-copia-\d{4}-\d{2}-\d{2}\.json$/);
  assert.equal(dl.name, `financas-copia-${today}.json`);
  const exported = JSON.parse(dl.text);
  assert.equal(exported.format, 1);
  assert.ok(!dl.text.includes('pinHash') && !dl.text.includes('pinSalt'));
  assert.ok(exported.categories.some(c => c.name === 'Ginásio' && c.savings === true));
  assert.equal(exported.moves.length, await chrome.eval(`__demo.store.getState().moves.length`));

  // ---- Import: a valid file without this month's moves ----
  const fresh = demoData(today);
  fresh.moves = fresh.moves.filter(m => !m.date.startsWith(ym));
  const goodFile = path.join(SHOTS, 'cats-import-ok.json');
  writeFileSync(goodFile, JSON.stringify(buildBackup(fresh)));
  const badFile = path.join(SHOTS, 'cats-import-bad.json');
  writeFileSync(badFile, '{"format":2,"profiles":[]}');
  assert.equal(await chrome.eval(`document.querySelector('input[type="file"]').accept`), 'application/json,.json');
  await chrome.setFile('input[type="file"]', goodFile);
  await waitFor(chrome, `!!document.querySelector('.shade [data-act="sheet-ok"]')`);
  assert.equal(await chrome.eval(text('.sheet .title')),
    `A cópia tem ${fresh.moves.length} movimentos. Importar substitui todos os dados atuais, em todos os aparelhos.`);
  assert.equal(await chrome.eval(text('.shade [data-act="sheet-ok"]')), 'Importar');
  await chrome.screenshot(`${SHOTS}/cats-import-confirm.png`, PHONE);
  // a slow import: Importar is busy and a second file is ignored
  await chrome.eval(`window.__realReplace = __demo.store.replaceAll; window.__release = null;
    __demo.store.replaceAll = data => new Promise(r => { window.__release = r; }).then(() => window.__realReplace(data))`);
  await chrome.eval(`document.querySelector('.toast')?.remove()`);
  await chrome.click('.shade [data-act="sheet-ok"]');
  await waitFor(chrome, `!!window.__release`);
  assert.deepEqual(await chrome.eval(`(b => [b.disabled, b.textContent])(document.querySelector('[data-act="import"]'))`), [true, 'A importar…']);
  await chrome.setFile('input[type="file"]', goodFile);
  await new Promise(r => setTimeout(r, 300));
  assert.equal(await chrome.eval(`document.querySelectorAll('.shade').length`), 0, 'outra importação é ignorada');
  await chrome.eval(`window.__release(); __demo.store.replaceAll = window.__realReplace`);
  await waitFor(chrome, `!document.querySelector('.shade') && __demo.store.getState().moves.length === ${fresh.moves.length}`);
  await waitFor(chrome, `document.querySelector('.toast')?.textContent === 'Cópia importada.'`);
  assert.deepEqual(await chrome.eval(`(b => [b.disabled, b.textContent])(document.querySelector('[data-act="import"]'))`), [false, 'Importar cópia']);
  assert.deepEqual(await chrome.eval(names('Entradas')), ['💼Salário', '💶Outros'], 'as categorias voltam às da cópia');
  // pins of existing profiles are kept
  assert.equal(await chrome.eval(`__demo.store.getState().profiles.every(p => p.pinIter === 100000)`), true);
  await chrome.eval(`location.hash = '#/mes/${ym}'`);
  await waitFor(chrome, `!!document.querySelector('.card.empty')`);
  assert.equal(await chrome.eval(text('.card.empty')), 'Ainda não há movimentos neste mês. Toca em + para registar o primeiro.');
  await chrome.eval(`document.querySelector('.tabs button[data-v="categorias"]').click()`);
  await backToCats();

  // ---- Import: an invalid file changes nothing ----
  const before = await chrome.eval(`JSON.stringify(__demo.store.getState())`);
  await chrome.eval(`document.querySelector('.toast')?.remove()`);
  await chrome.setFile('input[type="file"]', badFile);
  await waitFor(chrome, `!!document.querySelector('.toast')`);
  assert.equal(await chrome.eval(toast), INVALID_BACKUP);
  assert.equal(await chrome.eval(`document.querySelectorAll('.shade').length`), 0);
  assert.equal(await chrome.eval(`JSON.stringify(__demo.store.getState())`), before);

  // ---- Mudar código: wrong current code counts as a failure, then 111111 → 333333 twice ----
  await chrome.eval(`${btnText('Mudar código')}.click()`);
  await waitFor(chrome, `document.querySelectorAll('.lock .dots i').length === 6`);
  assert.equal(await chrome.eval(text('.lock h1')), 'Perfil A');
  assert.equal(await sub(), 'Introduz o código atual');
  await chrome.screenshot(`${SHOTS}/cats-change-code.png`, PHONE);
  await typePin('999999');
  await waitFor(chrome, `document.querySelector('.lock .sub.err')?.textContent === 'Código errado. Restam 4 tentativas.'`);
  assert.equal(await chrome.eval(`JSON.parse(localStorage.getItem('fin.lock.a')).fails`), 1);
  await typePin('111111');
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '') === 'Cria um código de 6 algarismos'`);
  assert.equal(await chrome.eval(`JSON.parse(localStorage.getItem('fin.lock.a')).fails`), 0);
  await typePin('333333');
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '') === 'Escreve o código outra vez'`);
  await typePin('333333');
  await backToCats();
  // Cancelar leaves the code as it was
  await chrome.eval(`${btnText('Mudar código')}.click()`);
  await waitFor(chrome, `!!document.querySelector('.lockacts [data-act="cancel"]')`);
  await chrome.click('.lockacts [data-act="cancel"]');
  await backToCats();
  // relock (more than a minute away) and unlock with the new code
  await chrome.eval(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'))`);
  await chrome.eval(`(() => { const real = Date.now; Date.now = () => real.call(Date) + 61000;
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange')); Date.now = real; })()`);
  await waitFor(chrome, `!document.querySelector('.tabs') && document.querySelectorAll('.lock .dots i').length === 6`);
  await typePin('111111');
  await waitFor(chrome, `document.querySelector('.lock .sub.err')?.textContent.startsWith('Código errado.')`);
  await typePin('333333');
  await backToCats();

  // ---- Lockout: 5 wrong current codes block the pad ----
  await chrome.eval(`${btnText('Mudar código')}.click()`);
  for (let i = 0; i < 5; i++) {
    await typePin('999999');
    await waitFor(chrome, `document.querySelector('.lock .sub.err')`);
  }
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '').includes('Tenta de novo daqui a')`);
  assert.equal(await chrome.eval(`[...document.querySelectorAll('.pad button')].every(b => b.disabled)`), true);
  await chrome.click('.lockacts [data-act="cancel"]');
  await backToCats();
  await chrome.eval(`${btnText('Mudar código')}.click()`);
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '').includes('Tenta de novo daqui a')`);
  await chrome.click('.lockacts [data-act="cancel"]');
  await backToCats();
  await chrome.eval(`localStorage.removeItem('fin.lock.a')`);

  // ---- Renomear Perfil B → Perfil C ----
  await chrome.eval(rowBtn('Perfis', 'Perfil B', 'renprof'));
  await waitFor(chrome, `!!document.querySelector('#profname')`);
  assert.equal(await chrome.eval(`document.querySelector('#profname').value`), 'Perfil B');
  await chrome.type('#profname', '   ');
  await chrome.click('.sheet [data-act="sheet-save"]');
  assert.equal(await chrome.eval(text('.sheet .error')), 'Escreve um nome.');
  await chrome.type('#profname', 'perfil a');
  await chrome.click('.sheet [data-act="sheet-save"]');
  assert.equal(await chrome.eval(text('.sheet .error')), 'Já existe um perfil com esse nome.');
  await chrome.type('#profname', 'x'.repeat(31));
  await chrome.click('.sheet [data-act="sheet-save"]');
  assert.equal(await chrome.eval(text('.sheet .error')), 'O nome pode ter no máximo 30 caracteres.');
  await chrome.type('#profname', 'Perfil C');
  await chrome.screenshot(`${SHOTS}/cats-rename.png`, PHONE);
  await chrome.click('.sheet [data-act="sheet-save"]');
  await waitFor(chrome, `!document.querySelector('.shade') && ${names('Perfis')}.includes('PPerfil C')`);
  await chrome.eval(`location.hash = '#/mes/${addMonths(ym, -1)}/casa'`);
  await waitFor(chrome, `document.querySelector('.seg button.on')?.textContent === 'Casa'`);
  assert.ok((await chrome.eval(`document.querySelector('.scroll').textContent`)).includes('Perfil C'));
  assert.ok(!(await chrome.eval(`document.querySelector('.scroll').textContent`)).includes('Perfil B'));
  await chrome.eval(`document.querySelector('.tabs button[data-v="categorias"]').click()`);
  await backToCats();

  // ---- + Novo perfil: name, then the code twice ----
  await chrome.eval(`${rowsOf('Perfis')}.querySelector('[data-act="newprof"]').click()`);
  await waitFor(chrome, `!!document.querySelector('#profname')`);
  assert.equal(await chrome.eval(text('.sheet .title')), 'Novo perfil');
  await chrome.type('#profname', 'Perfil D');
  await chrome.click('.sheet [data-act="sheet-save"]');
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '') === 'Cria um código de 6 algarismos'`);
  assert.equal(await chrome.eval(text('.lock h1')), 'Perfil D');
  await typePin('444444');
  await typePin('444444');
  await backToCats();
  assert.deepEqual(await chrome.eval(names('Perfis')), ['PPerfil Aaberto', 'PPerfil C', 'PPerfil D']);
  assert.equal(await chrome.eval(`__demo.store.getState().profiles.find(p => p.name === 'Perfil D').pinIter`), 100000);
  await chrome.screenshot(`${SHOTS}/cats-profiles.png`, { width: 390, height: 1800 });

  // ---- Import of a copy without the open profile → profile picker ----
  const other = demoData(today);
  other.profiles = [{ id: 'z', name: 'Perfil Z' }];
  other.moves = other.moves.filter(m => m.profileId === 'a').map(m => ({ ...m, profileId: 'z' }));
  const otherFile = path.join(SHOTS, 'cats-import-other.json');
  writeFileSync(otherFile, JSON.stringify(buildBackup(other)));
  await chrome.setFile('input[type="file"]', otherFile);
  await waitFor(chrome, `!!document.querySelector('.shade [data-act="sheet-ok"]')`);
  await chrome.click('.shade [data-act="sheet-ok"]');
  await waitFor(chrome, `!!document.querySelector('.profs')`);
  assert.deepEqual(await chrome.eval(`[...document.querySelectorAll('.profs .prof')].map(b => b.textContent.trim().slice(1))`), ['Perfil Z']);

  // ---- Terminar sessão (fake account): forgets the last profile, then wipes the local data ----
  await chrome.eval(`(async () => {
    const m = await import('/js/ui/categories.js');
    const root = document.createElement('main');
    root.className = 'screen'; root.id = 't-out';
    document.getElementById('app').replaceChildren(root);
    window.__out = [];
    m.render({ store: __demo.store, profileId: 'z', demo: false, showError: msg => __out.push(['error', msg]),
      device: { setLastProfile: id => __out.push(['last', id]) },
      account: { currentEmail: () => 'casa@example.com', logout: async () => __out.push('logout'),
        logoutAndWipe: async () => __out.push('wipe') } }, root);
  })()`);
  await chrome.click('#t-out [data-act="logout"]');
  await waitFor(chrome, `!!document.querySelector('.shade [data-act="sheet-ok"]')`);
  await chrome.click('.shade [data-act="sheet-ok"]');
  await waitFor(chrome, `__out.length >= 2`);
  assert.deepEqual(await chrome.eval(`__out`), [['last', null], 'wipe']);

  assert.deepEqual(chrome.pageErrors(), []);
  console.log('ok   categories');
  code = 0;
} catch (e) {
  console.error('FAIL categories\n    ', e.stack || e.message);
  if (chrome) for (const err of chrome.pageErrors()) console.error('PAGE ERROR', err);
} finally {
  await chrome?.close();
  await server?.close();
}
process.exit(code);
