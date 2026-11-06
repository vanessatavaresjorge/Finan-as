// Runs the shared store contract against Firestore with the automatic-test account.
// Usage: node tests/browser/run-store.mjs
import { readFileSync } from 'node:fs';
import { startServer } from './serve.mjs';
import { launch } from './chrome.mjs';

const TIMEOUT_MS = 240000;

const account = JSON.parse(readFileSync(new URL('./.test-account.json', import.meta.url), 'utf8'));
const hash = encodeURIComponent(JSON.stringify({ email: account.email, password: account.password }));

let server, chrome, code = 1;
try {
  server = await startServer();
  chrome = await launch();
  await chrome.expose('setOffline', offline => chrome.setOffline(offline));
  await chrome.goto(`${server.url}/tests/browser/store.html#${hash}`);
  const result = await Promise.race([
    server.results,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`Sem resultado em ${TIMEOUT_MS / 1000} s`)), TIMEOUT_MS)),
  ]);
  for (const name of result.passed) console.log(`ok   ${name}`);
  for (const f of result.failed) console.log(`FAIL ${f.name}\n     ${f.error}`);
  const errors = chrome.pageErrors();
  for (const e of errors) console.log(`PAGE ERROR ${e}`);
  console.log(`\n${result.passed.length} passed, ${result.failed.length} failed, ${errors.length} page errors`);
  code = result.failed.length || errors.length ? 1 : 0;
} catch (e) {
  console.error('Erro:', e.message);
} finally {
  await chrome?.close();
  await server?.close();
}
process.exit(code);
