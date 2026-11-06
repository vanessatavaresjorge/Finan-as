// tests/browser/store.html erases the account it runs with: it must refuse to run unless the page
// is on this computer (localhost / 127.0.0.1) and the account is a test account (@financas.test).
// Never signs in: the accounts below do not exist and the refusal happens before Firebase loads.
import assert from 'node:assert/strict';
import { startServer } from '../browser/serve.mjs';
import { launch } from '../browser/chrome.mjs';

const REFUSED = 'Recusado: estes testes apagam os dados da conta; só correm em localhost com uma conta @financas.test.';
const hashOf = email => encodeURIComponent(JSON.stringify({ email, password: 'nao-interessa' }));

let chrome, code = 1;
try {
  chrome = await launch();
  const cases = [
    ['conta que não é de teste', 'localhost', 'casa@example.com'],
    ['endereço que não é localhost', 'localhost.', 'nao-existe@financas.test'],
  ];
  let port = 8650;
  for (const [name, host, email] of cases) {
    const server = await startServer(++port);
    try {
      await chrome.goto(`http://${host}:${port}/tests/browser/store.html#${hashOf(email)}`);
      const result = await Promise.race([server.results,
        new Promise((_, rej) => setTimeout(() => rej(new Error(`sem resultado: ${name}`)), 10000))]);
      assert.deepEqual(result, { passed: [], failed: [{ name: 'setup', error: REFUSED }] }, name);
      assert.equal(await chrome.eval(`document.getElementById('log').textContent`), REFUSED, name);
    } finally { await server.close(); }
  }
  console.log('ok   store-guard');
  code = 0;
} catch (e) {
  console.error('FAIL store-guard\n    ', e.stack || e.message);
} finally {
  await chrome?.close();
}
process.exit(code);
