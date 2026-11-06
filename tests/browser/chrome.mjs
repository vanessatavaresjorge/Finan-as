// Minimal headless Chrome driver over the DevTools protocol (Node's global WebSocket).
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const STARTUP_MS = 20000;
const COMMAND_MS = 60000;

const alive = new Set();
process.on('exit', () => { for (const p of alive) { try { p.kill('SIGKILL'); } catch { /* gone */ } } });

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const waiting = new Map();
    const listeners = new Set();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && waiting.has(msg.id)) {
        const w = waiting.get(msg.id);
        waiting.delete(msg.id);
        clearTimeout(w.timer);
        if (msg.error) w.reject(new Error(`${w.method}: ${msg.error.message}`));
        else w.resolve(msg.result);
      } else if (msg.method) {
        for (const fn of [...listeners]) fn(msg);
      }
    });
    ws.addEventListener('close', () => {
      for (const w of waiting.values()) { clearTimeout(w.timer); w.reject(new Error(`${w.method}: ligação ao Chrome fechada`)); }
      waiting.clear();
    });
    ws.addEventListener('error', () => reject(new Error('Não foi possível ligar ao Chrome.')));
    ws.addEventListener('open', () => resolve({
      send(method, params = {}) {
        const id = nextId++;
        return new Promise((res, rej) => {
          const timer = setTimeout(() => {
            waiting.delete(id);
            rej(new Error(`${method}: sem resposta em ${COMMAND_MS} ms`));
          }, COMMAND_MS);
          waiting.set(id, { resolve: res, reject: rej, timer, method });
          ws.send(JSON.stringify({ id, method, params }));
        });
      },
      on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      close() { try { ws.close(); } catch { /* ignore */ } },
    }));
  });
}

function waitForDevtoolsUrl(proc) {
  return new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => done(reject, new Error('O Chrome não arrancou a tempo.')), STARTUP_MS);
    const onData = chunk => {
      buf += chunk;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) done(resolve, m[1]);
    };
    const onExit = code => done(reject, new Error(`O Chrome terminou ao arrancar (código ${code}).`));
    function done(fn, v) {
      clearTimeout(timer);
      proc.stderr.off('data', onData);
      proc.off('exit', onExit);
      proc.stderr.resume(); // keep draining stderr so Chrome never blocks on a full pipe
      fn(v);
    }
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', onData);
    proc.once('exit', onExit);
  });
}

export async function launch() {
  const userDir = mkdtempSync(path.join(process.env.TMPDIR || tmpdir(), 'financas-chrome-'));
  const proc = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDir}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync', '--mute-audio',
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  alive.add(proc);
  const exited = new Promise(r => proc.once('exit', r));
  proc.once('exit', () => alive.delete(proc));

  let browser = null;
  let page = null;
  let closed = false;
  async function close() {
    if (closed) return;
    closed = true;
    try { if (browser) await Promise.race([browser.send('Browser.close'), new Promise(r => setTimeout(r, 2000))]); } catch { /* ignore */ }
    page?.close();
    browser?.close();
    if (proc.exitCode === null && proc.signalCode === null) {
      const killer = setTimeout(() => { try { proc.kill('SIGKILL'); } catch { /* gone */ } }, 3000);
      try { proc.kill('SIGTERM'); } catch { /* gone */ }
      await exited;
      clearTimeout(killer);
    }
    try { rmSync(userDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }

  try {
    const browserUrl = await waitForDevtoolsUrl(proc);
    browser = await connect(browserUrl);
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const host = new URL(browserUrl).host;
    page = await connect(`ws://${host}/devtools/page/${targetId}`);

    const errors = [];
    page.on(msg => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        errors.push(d.exception?.description || d.text || 'erro desconhecido');
      }
    });
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('DOM.enable');

    const waitEvent = (name, ms = COMMAND_MS) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => { off(); reject(new Error(`${name}: não aconteceu em ${ms} ms`)); }, ms);
      const off = page.on(msg => { if (msg.method === name) { clearTimeout(timer); off(); resolve(msg.params); } });
    });

    async function evaluate(js) {
      const r = await page.send('Runtime.evaluate', { expression: js, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        const d = r.exceptionDetails;
        throw new Error(d.exception?.description || d.exception?.value || d.text || 'erro na página');
      }
      return r.result.value;
    }

    return {
      async goto(url) {
        const loaded = waitEvent('Page.loadEventFired');
        const r = await page.send('Page.navigate', { url });
        if (r.errorText) { loaded.catch(() => {}); throw new Error(`Não foi possível abrir a página: ${r.errorText}`); }
        await loaded;
      },
      eval: evaluate,
      click(selector) {
        return evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) throw new Error('Elemento não encontrado: ' + ${JSON.stringify(selector)});
          el.click();
        })()`);
      },
      type(selector, text) {
        return evaluate(`(() => {
          const el = document.querySelector(${JSON.stringify(selector)});
          if (!el) throw new Error('Elemento não encontrado: ' + ${JSON.stringify(selector)});
          el.focus();
          el.value = ${JSON.stringify(text)};
          el.dispatchEvent(new Event('input', { bubbles: true }));
        })()`);
      },
      async setFile(selector, filePath) {
        const { root } = await page.send('DOM.getDocument', { depth: 0 });
        const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector });
        if (!nodeId) throw new Error(`Elemento não encontrado: ${selector}`);
        await page.send('DOM.setFileInputFiles', { nodeId, files: [path.resolve(filePath)] });
      },
      async screenshot(file, { width = 500, height = 1000 } = {}) {
        await page.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
        const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(file, Buffer.from(data, 'base64'));
      },
      pageErrors: () => [...errors],
      close,
    };
  } catch (e) {
    await close();
    throw e;
  }
}
