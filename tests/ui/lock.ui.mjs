// Login, profiles and lock screen in demo mode: picker, wrong codes, lockout that survives
// reload, unlock, profile without code (Review Focus 5), relock, login and first profile.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { SHOTS, waitFor } from './helpers.mjs';

const PHONE = { width: 390, height: 844 };
const text = sel => `document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`;

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  // a new query each time, so going to it is a real reload (same URL + hash would only scroll)
  let loads = 0;
  const reload = () => chrome.goto(`${server.url}/?demo=1&n=${++loads}#/mes/2026-11`);

  // Types a code on the keypad inside `scope`, after the pad is ready for a new code.
  const typePin = async (pin, scope = '#app') => {
    await waitFor(chrome, `document.querySelectorAll('${scope} .dots i.f').length === 0`);
    for (const d of pin) await chrome.click(`${scope} .pad button[data-v="${d}"]`);
  };
  const pickProfile = async name => {
    await waitFor(chrome, `!!document.querySelector('.profs')`);
    await chrome.eval(`[...document.querySelectorAll('.profs .prof')].find(b => b.textContent.includes(${JSON.stringify(name)})).click()`);
    await waitFor(chrome, `document.querySelectorAll('.lock .dots i').length === 6`);
  };
  const sub = () => chrome.eval(text('.lock .sub'));

  // ---- Picker: new device, no last profile ----
  await reload();
  await waitFor(chrome, `!!document.querySelector('.profs')`);
  assert.equal(await chrome.eval(text('.lock h1')), 'Quem está a usar?');
  assert.deepEqual(await chrome.eval(`[...document.querySelectorAll('.profs .prof')].map(b => b.textContent.trim().slice(1))`),
    ['Perfil A', 'Perfil B']);
  await chrome.screenshot(`${SHOTS}/lock-picker.png`, PHONE);
  await pickProfile('Perfil A');
  assert.equal(await chrome.eval(text('.lock h1')), 'Perfil A');
  assert.equal(await sub(), 'Introduz o teu código');
  assert.deepEqual(await chrome.eval(`[...document.querySelectorAll('.pad button')].map(b => b.textContent.trim())`),
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Apagar']);

  // delete removes the last digit
  await chrome.click('.pad button[data-v="1"]');
  await chrome.click('.pad button[data-v="2"]');
  assert.equal(await chrome.eval(`document.querySelectorAll('.dots i.f').length`), 2);
  await chrome.click('.pad button[data-act="pin-del"]');
  assert.equal(await chrome.eval(`document.querySelectorAll('.dots i.f').length`), 1);
  await chrome.click('.pad button[data-act="pin-del"]');

  // ---- Wrong code ----
  await typePin('111112');
  await waitFor(chrome, `document.querySelector('.lock .sub.err')?.textContent.startsWith('Código errado.')`);
  await chrome.screenshot(`${SHOTS}/lock-wrong.png`, PHONE);

  // ---- 5 wrong codes → wait, keys disabled ----
  for (let i = 2; i <= 5; i++) {
    await typePin('111112');
    if (i < 5) await waitFor(chrome, `document.querySelector('.lock .sub.err')?.textContent.includes('Restam ${5 - i}') || document.querySelector('.lock .sub.err')?.textContent.includes('Resta ${5 - i}')`);
  }
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '').includes('Tenta de novo daqui a')`);
  assert.match(await sub(), /^Tenta de novo daqui a \d+ s$/);
  assert.equal(await chrome.eval(`[...document.querySelectorAll('.pad button')].every(b => b.disabled)`), true);
  await chrome.screenshot(`${SHOTS}/lock-blocked.png`, PHONE);
  // typing while blocked does nothing
  await chrome.eval(`document.querySelector('.pad button[data-v="1"]').disabled = false`);
  await chrome.click('.pad button[data-v="1"]');
  assert.equal(await chrome.eval(`document.querySelectorAll('.dots i.f').length`), 0);

  // ---- Reload: still blocked ----
  await reload();
  await pickProfile('Perfil A');
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '').includes('Tenta de novo daqui a')`);
  assert.equal(await chrome.eval(`[...document.querySelectorAll('.pad button')].every(b => b.disabled)`), true);

  // ---- Lock reset, right code → month screen, last profile remembered ----
  await chrome.eval(`localStorage.removeItem('fin.lock.a')`);
  await reload();
  await pickProfile('Perfil A');
  await typePin('111111');
  await waitFor(chrome, `!!document.querySelector('.tabs')`);
  assert.equal(await chrome.eval(`location.hash`), '#/mes/2026-11');
  assert.equal(await chrome.eval(`JSON.parse(localStorage.getItem('fin.lastProfile'))`), 'a');

  // reload opens the lock of Perfil A directly, with Trocar perfil
  await reload();
  await waitFor(chrome, `document.querySelectorAll('.lock .dots i').length === 6`);
  assert.equal(await chrome.eval(text('.lock h1')), 'Perfil A');
  assert.deepEqual(await chrome.eval(`[...document.querySelectorAll('.lockacts button')].map(b => b.textContent.trim())`),
    ['Esqueci-me do código', 'Trocar perfil']);
  assert.equal(await chrome.eval(`getComputedStyle(document.querySelector('.pad button')).touchAction`), 'manipulation');
  await chrome.screenshot(`${SHOTS}/lock-screen.png`, PHONE);

  // Trocar perfil while the right code is being checked: the abandoned profile stays locked
  await chrome.eval(`(() => {
    for (let i = 0; i < 6; i++) document.querySelector('.pad button[data-v="1"]').click();
    document.querySelector('.lockacts button[data-act="switch"]').click();
  })()`);
  await waitFor(chrome, `!!document.querySelector('.profs')`);
  await new Promise(r => setTimeout(r, 1500));
  assert.equal(await chrome.eval(`!!document.querySelector('.tabs')`), false, 'não abre o perfil abandonado');
  assert.equal(await chrome.eval(`!!document.querySelector('.profs')`), true);
  await pickProfile('Perfil A');

  // ---- Review Focus 5: a profile without code asks to create one ----
  await chrome.eval(`__demo.store.updateProfile('b', { pinHash: null, pinSalt: null, pinIter: null })`);
  await chrome.click('.lockacts button[data-act="switch"]');
  await pickProfile('Perfil B');
  assert.equal(await chrome.eval(text('.lock h1')), 'Perfil B');
  assert.equal(await sub(), 'Cria um código de 6 algarismos');
  await chrome.screenshot(`${SHOTS}/lock-create.png`, PHONE);
  await typePin('222222');
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '') === 'Escreve o código outra vez'`);
  await typePin('222223'); // mismatch restarts
  await waitFor(chrome, `document.querySelector('.lock .sub.err')?.textContent === 'Os códigos não coincidem. Tenta de novo.'`);
  await typePin('222222');
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '') === 'Escreve o código outra vez'`);
  await typePin('222222');
  await waitFor(chrome, `!!document.querySelector('.tabs')`);
  assert.equal(await chrome.eval(`JSON.parse(localStorage.getItem('fin.lastProfile'))`), 'b');
  assert.equal(await chrome.eval(`__demo.store.getState().profiles.find(p => p.id === 'b').pinIter`), 100000);

  // ---- Relock: short absence keeps the app; long absence locks, closes the sheet, keeps the route ----
  const hide = `Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'))`;
  const show = ms => `(() => { const real = Date.now; window.__realNow ??= real;
    Date.now = () => window.__realNow.call(Date) + ${ms};
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange')); })()`;
  await chrome.eval(`location.hash = '#/ano/2026'`);
  await waitFor(chrome, `document.querySelector('.tabs button.on')?.textContent === 'Ano'`);
  const cover = `(() => { const c = document.querySelector('body > .cover'); if (!c) return null;
    const r = c.getBoundingClientRect(); const s = getComputedStyle(c);
    return [r.width === innerWidth && r.height === innerHeight, s.backgroundColor, Number(s.zIndex) > 10, c.textContent]; })()`;
  await chrome.eval(hide);
  // app switcher: a plain cream cover with no data hides the screen
  assert.deepEqual(await chrome.eval(cover), [true, 'rgb(247, 242, 234)', true, '']);
  await chrome.screenshot(`${SHOTS}/lock-cover.png`, PHONE);
  await chrome.eval(show(30000));
  assert.equal(await chrome.eval(`!!document.querySelector('.tabs')`), true, 'menos de 1 minuto: não bloqueia');
  assert.equal(await chrome.eval(cover), null, 'a capa sai ao voltar');
  await chrome.eval(`import('/js/ui/dialog.js').then(m => { window.__ans = m.confirmSheet({ message: 'Apagar este movimento?', ok: 'Apagar', danger: true }); })`);
  await chrome.eval(`Date.now = window.__realNow`);
  await chrome.eval(hide);
  await chrome.eval(show(61000));
  await waitFor(chrome, `document.querySelectorAll('.lock .dots i').length === 6`);
  assert.equal(await chrome.eval(text('.lock h1')), 'Perfil B');
  assert.equal(await chrome.eval(`document.querySelectorAll('.shade').length`), 0);
  assert.equal(await chrome.eval(`window.__ans`), false, 'a folha aberta fecha com "não"');
  assert.equal(await chrome.eval(cover), null, 'o bloqueio substitui a capa');
  await chrome.eval(`Date.now = window.__realNow`);
  await typePin('222222');
  await waitFor(chrome, `!!document.querySelector('.tabs')`);
  assert.equal(await chrome.eval(`location.hash`), '#/ano/2026');
  assert.equal(await chrome.eval(`document.querySelector('.tabs button.on')?.textContent`), 'Ano');

  // ---- Lock screen follows store updates: code removed elsewhere → create a code ----
  await chrome.eval(hide);
  await chrome.eval(show(61000));
  await chrome.eval(`Date.now = window.__realNow`);
  await waitFor(chrome, `document.querySelectorAll('.lock .dots i').length === 6`);
  assert.equal(await sub(), 'Introduz o teu código');
  await chrome.eval(`__demo.store.updateProfile('b', { pinHash: null, pinSalt: null, pinIter: null })`);
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '') === 'Cria um código de 6 algarismos'`);

  // ---- Forgot code: email + password, then a new code ----
  await chrome.click('.lockacts button[data-act="switch"]');
  await pickProfile('Perfil A');
  await chrome.click('.lockacts button[data-act="forgot"]');
  await waitFor(chrome, `!!document.querySelector('.lock input[type="email"]')`);
  assert.equal(await chrome.eval(text('.lock h1')), 'Esqueci-me do código');
  await chrome.screenshot(`${SHOTS}/lock-forgot.png`, PHONE);
  await chrome.type('.lock input[type="email"]', 'casa@example.com');
  await chrome.type('.lock input[type="password"]', 'qualquer');
  await chrome.click('.lock form button[type="submit"]');
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '') === 'Cria um código de 6 algarismos'`);
  await typePin('333333');
  await typePin('333333');
  await waitFor(chrome, `!!document.querySelector('.tabs')`);

  // ---- Login screen (fake account) ----
  await chrome.eval(`(async () => {
    const m = await import('/js/ui/login.js');
    const root = document.createElement('main');
    root.className = 'screen'; root.id = 't-login';
    document.getElementById('app').replaceChildren(root);
    window.__calls = [];
    m.render({ account: {
      login: async (e, p) => { __calls.push(['login', e, p]); throw new Error('Email ou palavra-passe errados.'); },
      resetPassword: async e => { __calls.push(['reset', e]); },
    } }, root);
  })()`);
  assert.equal(await chrome.eval(text('#t-login h1')), 'Finanças');
  assert.equal(await chrome.eval(text('#t-login button[type="submit"]')), 'Entrar');
  await chrome.click('#t-login [data-act="reset"]');
  assert.equal(await chrome.eval(text('#t-login .error')), 'Escreve o teu email.');
  await chrome.type('#t-login input[type="email"]', 'casa@example.com');
  await chrome.click('#t-login [data-act="reset"]');
  await waitFor(chrome, `document.querySelector('#t-login .error')?.textContent === 'Enviámos um email para repores a palavra-passe.'`);
  await chrome.type('#t-login input[type="password"]', 'errada');
  await chrome.click('#t-login button[type="submit"]');
  await waitFor(chrome, `document.querySelector('#t-login .error')?.textContent === 'Email ou palavra-passe errados.'`);
  assert.deepEqual(await chrome.eval(`__calls`), [['reset', 'casa@example.com'], ['login', 'casa@example.com', 'errada']]);
  await chrome.screenshot(`${SHOTS}/lock-login.png`, PHONE);

  // ---- First profile: name, code twice, then profile + default categories ----
  await chrome.eval(`(async () => {
    const m = await import('/js/ui/profiles.js');
    const { createMemoryStore } = await import('/js/store-memory.js');
    const root = document.createElement('main');
    root.className = 'screen'; root.id = 't-first';
    document.getElementById('app').replaceChildren(root);
    window.__first = createMemoryStore({});
    m.renderFirst({ store: __first, unlock: id => { window.__firstId = id; } }, root);
  })()`);
  await chrome.click('#t-first form button[type="submit"]');
  assert.equal(await chrome.eval(text('#t-first .error')), 'Escreve um nome.');
  // same rules as the categories screen: a name already taken (on the other device) is refused
  await chrome.eval(`__first.addProfile({ name: 'Ana', pinHash: null, pinSalt: null, pinIter: null })`);
  await chrome.type('#t-first input', ' ana ');
  await chrome.click('#t-first form button[type="submit"]');
  assert.equal(await chrome.eval(text('#t-first .error')), 'Já existe um perfil com esse nome.');
  await chrome.eval(`(() => { const s = __first.getState(); __first.replaceAll({ profiles: [], categories: s.categories, moves: [] }); })()`);
  await chrome.eval(`document.querySelector('#t-first input').value = ''`);
  await chrome.type('#t-first input', 'Ana');
  await chrome.click('#t-first form button[type="submit"]');
  await waitFor(chrome, `(document.querySelector('#t-first .lock .sub')?.textContent ?? '') === 'Cria um código de 6 algarismos'`);
  await typePin('444444', '#t-first');
  await typePin('444444', '#t-first');
  await waitFor(chrome, `!!window.__firstId`);
  assert.deepEqual(await chrome.eval(`(() => { const s = __first.getState(); return [s.profiles.length, s.profiles[0].name, s.profiles[0].id === __firstId, s.profiles[0].pinIter, s.categories.length > 0]; })()`),
    [1, 'Ana', true, 100000, true]);

  // ---- Data that never loads: message with Tentar de novo / Terminar sessão ----
  await chrome.goto(`${server.url}/?demo=1&stall=1&loadms=300`);
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '') === 'Não foi possível carregar os dados. Verifica a ligação à internet.'`);
  assert.deepEqual(await chrome.eval(`[...document.querySelectorAll('.lock button')].map(b => b.textContent.trim())`),
    ['Tentar de novo', 'Terminar sessão']);
  await chrome.screenshot(`${SHOTS}/lock-loadfail.png`, PHONE);
  // Terminar sessão here also forgets the last profile of this device
  await chrome.eval(`localStorage.setItem('fin.lastProfile', JSON.stringify('a'))`);
  await chrome.click('.lock [data-act="logout"]');
  await waitFor(chrome, `localStorage.getItem('fin.lastProfile') === null`);

  // ---- Offline with an empty local cache: never offer to create the first profile ----
  await chrome.goto(`${server.url}/?demo=1&stall=cache&loadms=300`);
  await waitFor(chrome, `(document.querySelector('.lock .sub')?.textContent ?? '') === 'Não foi possível carregar os dados. Verifica a ligação à internet.'`);
  assert.equal(await chrome.eval(`document.body.textContent.includes('Criar o primeiro perfil')`), false);
  // the server then confirms there are no profiles: now the first profile is asked for
  await chrome.eval(`__stub.confirm()`);
  await waitFor(chrome, `(document.querySelector('.lock h1')?.textContent ?? '') === 'Criar o primeiro perfil'`);

  assert.deepEqual(chrome.pageErrors(), []);
  console.log('ok   lock');
  code = 0;
} catch (e) {
  console.error('FAIL lock\n    ', e.stack || e.message);
  if (chrome) for (const err of chrome.pageErrors()) console.error('PAGE ERROR', err);
} finally {
  await chrome?.close();
  await server?.close();
}
process.exit(code);
