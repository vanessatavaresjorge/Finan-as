// Bottom sheet to create or edit a category. Lives in #app (outside the screen), so a store update
// that re-renders the screen never tears it down or erases what was typed.
import { ICONS, validateCategory } from '../logic/categories.js';
import { esc, h } from './dom.js';

export function openCategorySheet(ctx, { type, category = null }) {
  return new Promise(resolve => {
    const host = document.getElementById('app') ?? document.body;
    const editing = category?.id ?? null;
    const kind = category ? category.type : type; // editing never changes the type
    let icon = category ? category.icon : ICONS[0];
    let savings = !!category?.savings;
    let busy = false;

    const shade = h(`<div class="shade" data-act="sheet-cancel"><div class="sheet" role="dialog" aria-modal="true">
      <div class="title">${editing ? 'Editar categoria' : `Nova categoria de ${kind === 'out' ? 'saída' : 'entrada'}`}</div>
      <div class="card namein"><span class="e">${esc(icon)}</span><input id="catname" placeholder="Nome" value="${esc(category?.name ?? '')}" maxlength="30" autocomplete="off"></div>
      <div class="label" style="margin-top:16px">Símbolo</div>
      <div class="emojis">${ICONS.map(e => `<button type="button" class="${e === icon ? 'on' : ''}" data-act="icon" data-v="${esc(e)}">${esc(e)}</button>`).join('')}</div>
      ${kind === 'out' ? `<button type="button" class="card switch" data-act="toggle-sav" role="switch" aria-checked="${savings}"><span>Conta como poupança<small>Para investimentos ou dinheiro posto de parte. Continua a contar no que saiu, mas entra na taxa de poupança.</small></span><span class="tog ${savings ? 'on' : ''}"></span></button>` : ''}
      <div class="error" role="alert"></div>
      <button type="button" class="btn" data-act="sheet-save" style="margin-top:6px">Guardar</button>
      <button type="button" class="btn plain" data-act="sheet-cancel">Cancelar</button>
    </div></div>`).firstElementChild;

    const input = shade.querySelector('#catname');
    const errBox = shade.querySelector('.error');
    const saveBtn = shade.querySelector('[data-act="sheet-save"]');

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
    const observer = new MutationObserver(() => { if (!shade.isConnected) done(null); });
    const onKey = e => { if (e.key === 'Escape') done(null); };

    async function save() {
      if (busy) return;
      const state = ctx.store.getState();
      const draft = { name: input.value.trim(), type: kind, icon };
      const problem = validateCategory(draft, state.categories, editing);
      if (problem) { errBox.textContent = problem; return; }
      busy = true;
      saveBtn.disabled = true;
      try {
        const sav = kind === 'out' && savings;
        if (editing) {
          await ctx.store.updateCategory(editing, { name: draft.name, icon, savings: sav });
          done(editing);
        } else {
          done(await ctx.store.addCategory({ name: draft.name, type: kind, icon, savings: sav }));
        }
      } catch (e) {
        errBox.textContent = e?.message || 'Não foi possível guardar. Tenta outra vez.';
        busy = false;
        saveBtn.disabled = false;
      }
    }

    shade.addEventListener('click', e => {
      e.stopPropagation();
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      if (act === 'sheet-cancel') { if (el !== shade || e.target === shade) done(null); }
      else if (act === 'sheet-save') save();
      else if (act === 'icon') {
        icon = el.dataset.v;
        for (const b of shade.querySelectorAll('.emojis button')) b.classList.toggle('on', b === el);
        shade.querySelector('.namein .e').textContent = icon;
      } else if (act === 'toggle-sav') {
        savings = !savings;
        el.setAttribute('aria-checked', String(savings));
        el.querySelector('.tog').classList.toggle('on', savings);
      }
    });
    input.addEventListener('input', () => { errBox.textContent = ''; });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    document.addEventListener('keydown', onKey);
    host.append(shade);
    observer.observe(host, { childList: true });
    if (!editing) input.focus();
  });
}
