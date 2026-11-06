// Sets VERSION in sw.js to a hash of every precached app file. Run before each deploy: npm run bump
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SW = path.join(root, 'sw.js');

export function listedFiles(swSource) {
  const m = swSource.match(/^const FILES = \[([\s\S]*?)\];/m);
  if (!m) throw new Error('sw.js needs a top-level const FILES = [...]');
  return [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1].replace(/^\.\//, ''));
}

export function computeVersion(swSource = readFileSync(SW, 'utf8')) {
  const hash = createHash('sha256');
  for (const f of listedFiles(swSource)) hash.update(readFileSync(path.join(root, f)));
  return hash.digest('hex').slice(0, 12);
}

export function currentVersion(swSource) {
  return swSource.match(/^const VERSION = '([^']*)';/m)?.[1];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const src = readFileSync(SW, 'utf8');
  const version = computeVersion(src);
  writeFileSync(SW, src.replace(/^const VERSION = '[^']*';/m, `const VERSION = '${version}';`));
  console.log(`VERSION ${version}`);
}
