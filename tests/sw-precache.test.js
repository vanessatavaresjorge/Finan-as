// Every app file must be in sw.js's precache list, so a module added later is not forgotten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeVersion, currentVersion } from '../tools/bump-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]);
}

test('sw.js precaches every app file', () => {
  const src = readFileSync(path.join(root, 'sw.js'), 'utf8');
  const m = src.match(/^const FILES = \[([\s\S]*?)\];/m);
  assert.ok(m, 'sw.js needs a top-level const FILES = [...]');
  const listed = new Set([...m[1].matchAll(/'([^']+)'/g)].map(x => x[1].replace(/^\.\//, '')));
  const needed = [
    'index.html', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-512.png',
    ...walk('js'), ...walk('css'),
  ];
  const missing = needed.filter(f => !listed.has(f));
  assert.deepEqual(missing, []);
  for (const f of listed) assert.ok(needed.includes(f), `${f} listed but not an app file`);
});

test('sw.js never touches Firestore or Auth traffic', () => {
  const src = readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.match(src, /req\.method !== 'GET'\) return/);
  assert.doesNotMatch(src, /firestore\.googleapis|identitytoolkit|securetoken/);
});

test('sw.js VERSION matches the app files', () => {
  const src = readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.equal(currentVersion(src), computeVersion(src),
    'sw.js VERSION is out of date: run node tools/bump-version.mjs (npm run bump)');
});
