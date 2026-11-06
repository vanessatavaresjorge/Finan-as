// Shared bits for the UI smoke tests.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Screenshots go outside the project: $SHOTS_DIR if set, else a temp folder.
export const SHOTS = process.env.SHOTS_DIR || path.join(tmpdir(), 'financas-shots');
mkdirSync(SHOTS, { recursive: true });

// Polls a page expression until it is truthy.
export async function waitFor(chrome, js, ms = 10000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await chrome.eval(js)) return;
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error(`Esperei demasiado por: ${js}`);
}
