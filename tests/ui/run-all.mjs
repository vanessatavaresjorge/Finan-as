// Runs every tests/ui/*.ui.mjs one after the other. Exit code 1 if any fails.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = readdirSync(dir).filter(f => f.endsWith('.ui.mjs')).sort();
const failed = [];
for (const f of files) {
  console.log(`\n# ${f}`);
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed.push(f);
}
console.log(`\n${files.length - failed.length} passed, ${failed.length} failed${failed.length ? ': ' + failed.join(', ') : ''}`);
process.exit(failed.length ? 1 : 0);
