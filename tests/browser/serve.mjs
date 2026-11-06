// Static server for browser tests. Serves financas/ and accepts POST /__result.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

export function startServer(port = 8642) {
  let resolveResults;
  const results = new Promise(r => { resolveResults = r; });

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'POST' && url.pathname === '/__result') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          resolveResults(JSON.parse(body));
          res.writeHead(204).end();
        } catch {
          res.writeHead(400).end('bad json');
        }
      });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }

    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400).end('bad url'); return; }
    // never serve dotfiles or dot-folders (e.g. tests/browser/.test-account.json, .git)
    if (rel.split('/').some(seg => seg.startsWith('.'))) { res.writeHead(404).end('not found'); return; }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(ROOT, '.' + rel);
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    }
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, 'localhost', () => {
      resolve({
        url: `http://localhost:${port}`,
        results,
        close: () => new Promise(r => { server.closeAllConnections?.(); server.close(() => r()); }),
      });
    });
  });
}
