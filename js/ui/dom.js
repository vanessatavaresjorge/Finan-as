// Small DOM helpers shared by every screen.
import { formatEur } from '../logic/format.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

// Profile | Casa segment at the top of Mês and Ano (only with more than one profile).
export function viewSeg(profiles, profileId, casa) {
  if (profiles.length < 2) return '';
  const me = profiles.find(p => p.id === profileId);
  return `<div class="seg vseg"><button class="${casa ? '' : 'on'}" data-act="view" data-v="me">${esc(me?.name ?? '')}</button><button class="${casa ? 'on' : ''}" data-act="view" data-v="casa">Casa</button></div>`;
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  return t.content;
}

export function mount(el, html) {
  el.replaceChildren(h(html));
  return el;
}

// One click listener on `root`; calls handlers[el.dataset.act](el, event) for the nearest [data-act].
export function bindActions(root, handlers) {
  const onClick = event => {
    const el = event.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = handlers[el.dataset.act];
    if (fn) fn(el, event);
  };
  root.addEventListener('click', onClick);
  return () => root.removeEventListener('click', onClick);
}

// ---------- Account balance pieces (Mês and Ano, phone and wide) ----------
export const BALANCE_HINT = 'Indica o saldo inicial em Categorias para o saldo ficar certo.';

export const balanceValue = b => (b.total === null ? '—' : formatEur(b.total));
export const balanceNeg = b => b.total !== null && b.total < 0;

// Casa: each person's balance ("—" for none), names and amounts only.
export function balanceSplit(b) {
  if (!b.split) return '';
  return `<div class="split">${b.split.map(p => `${esc(p.name)} ${p.cents === null ? '—' : formatEur(p.cents)}`).join(' · ')}</div>`;
}

// Hint only in a profile view that has no opening balance.
export const balanceHint = (b, casa) => (!casa && !b.hasOpening ? `<p class="balhint">${BALANCE_HINT}</p>` : '');
