// Small DOM helpers shared by every screen.
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
