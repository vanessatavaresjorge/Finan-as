// Confirmation bottom sheet, styled like the mockup's delete sheet.
import { esc, h } from './dom.js';

export function confirmSheet({ message, ok, danger = false }) {
  return new Promise(resolve => {
    const host = document.getElementById('app') ?? document.body;
    const shade = h(`<div class="shade" data-act="sheet-cancel"><div class="sheet" role="dialog" aria-modal="true">
      <div class="title">${esc(message)}</div>
      <button class="btn${danger ? ' danger' : ''}" data-act="sheet-ok">${esc(ok)}</button>
      <button class="btn plain" data-act="sheet-cancel">Cancelar</button>
    </div></div>`).firstElementChild;
    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      document.removeEventListener('keydown', onKey);
      shade.remove();
      resolve(value);
    };
    // If the screen is rebuilt under the sheet (relock, sign-out), it counts as Cancelar.
    const observer = new MutationObserver(() => { if (!shade.isConnected) done(false); });
    const onKey = e => { if (e.key === 'Escape') done(false); };
    shade.addEventListener('click', e => {
      e.stopPropagation();
      const el = e.target.closest('[data-act]');
      // a tap on the sheet itself (not a button) closes nothing
      if (el?.dataset.act === 'sheet-ok') done(true);
      else if (el?.dataset.act === 'sheet-cancel' && (el !== shade || e.target === shade)) done(false);
    });
    document.addEventListener('keydown', onKey);
    host.append(shade);
    observer.observe(host, { childList: true });
  });
}
