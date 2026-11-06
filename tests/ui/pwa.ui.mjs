// Installable-app smoke test (not demo): service worker, offline reload, manifest.
// Only shows the login screen; it never logs in and never writes anything.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';
import { waitFor } from './helpers.mjs';

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  await chrome.goto(`${server.url}/`);
  await waitFor(chrome, `!!document.querySelector('form, .authform, .lock')`, 20000);

  await waitFor(chrome, `navigator.serviceWorker.getRegistration().then(r => !!r?.active)`, 20000);
  await waitFor(chrome, `caches.keys().then(k => k.includes('financas-v1'))`, 20000);
  // wait until the app files are saved
  await waitFor(chrome, `caches.open('financas-v1').then(c => c.keys()).then(k => k.length >= 31)`, 30000);

  const manifest = await chrome.eval(`(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const r = await fetch(link.href);
    return r.ok ? await r.json() : null;
  })()`);
  assert.equal(manifest.name, 'Finanças');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, './');
  assert.equal(await chrome.eval(`document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href')`), 'icons/icon-180.png');

  // offline: reload still renders the login screen from the saved files
  await chrome.setOffline(true);
  await chrome.goto(`${server.url}/`);
  await waitFor(chrome, `!!document.querySelector('input[type="password"], input[type="email"]')`, 20000);
  assert.equal(await chrome.eval(`document.querySelector('h1')?.textContent`), 'Finanças');
  assert.deepEqual(chrome.pageErrors(), []);
  await chrome.setOffline(false);
  console.log('pwa ok');
  code = 0;
} catch (e) {
  console.error(e);
} finally {
  await chrome?.close();
  await server?.close();
  process.exit(code);
}
