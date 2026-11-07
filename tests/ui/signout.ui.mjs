// Sign-out guard in demo mode (button shown with &signout=1, pending simulated with __demo.setPending).
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { waitFor } from './helpers.mjs';

const MSG = 'Há alterações por enviar. Liga-te à internet e espera que terminem antes de terminar a sessão.';
const text = sel => `document.querySelector(${JSON.stringify(sel)})?.textContent ?? ''`;
const click = `[...document.querySelectorAll('.scroll .btn')].find(b => b.textContent.trim() === 'Terminar sessão').click()`;

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  await chrome.goto(`${server.url}/?demo=1&unlock=a&signout=1#/categorias`);
  await waitFor(chrome, `!!document.querySelector('[data-act="logout"]') && !!window.__demo?.setPending`);

  // Pending: no sheet, message shown, same screen.
  await chrome.eval(`window.__demo.setPending(true)`);
  await waitFor(chrome, `!!document.querySelector('[data-act="logout"]')`);
  await chrome.eval(click);
  await waitFor(chrome, `${text('.toast')} !== ''`);
  assert.equal(await chrome.eval(text('.toast')), MSG);
  assert.equal(await chrome.eval(`!!document.querySelector('.sheet, .overlay, .scrim, dialog')`), false, 'sem folha de confirmação');
  assert.equal(await chrome.eval(text('.scroll .title')), 'Categorias');

  // Not pending: the confirm sheet appears.
  await chrome.eval(`window.__demo.setPending(false); document.querySelector('.toast')?.remove()`);
  await chrome.eval(click);
  await waitFor(chrome, `document.body.textContent.includes('Terminar sessão neste aparelho?')`);
  assert.equal(await chrome.eval(text('.toast')), '');

  assert.deepEqual(chrome.pageErrors(), []);
  console.log('ok   signout');
  code = 0;
} catch (e) {
  console.error('FAIL signout\n    ', e.stack || e.message);
} finally {
  if (chrome) for (const err of chrome.pageErrors()) console.error('PAGE ERROR', err);
  await chrome?.close();
  await server?.close();
}
process.exit(code);
