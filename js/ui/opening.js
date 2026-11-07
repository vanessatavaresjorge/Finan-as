// Sheet to set, change or remove a profile's opening balance. Lives in #app (outside the screen),
// so a store update that re-renders the screen never tears it down or erases what was typed.
import { parseSignedCents, validateOpening, hasOpening } from '../logic/balance.js';
import { centsToInput, todayISO } from '../logic/format.js';
import { confirmSheet } from './dialog.js';
import { esc, h } from './dom.js';

export function openOpeningSheet(ctx, profile) {
  return new Promise(resolve => {
    const host = document.getElementById('app') ?? document.body;
    const today = todayISO();
    const has = hasOpening(profile);
    const prefill = has ? `${profile.openingCents < 0 ? '−' : ''}${centsToInput(Math.abs(profile.openingCents))}` : '';
    const date = has && profile.openingDate <= today ? profile.openingDate : today;
    let busy = false;

    const shade = h(`<div class="shade" data-act="sheet-cancel"><div class="sheet side" role="dialog" aria-modal="true">
      <div class="title">Saldo inicial</div>
      <label class="label" for="opval" style="margin-top:14px;display:block">Valor</label>
      <div class="card namein" style="margin-top:6px"><input id="opval" inputmode="decimal" placeholder="1 200,00" value="${esc(prefill)}" autocomplete="off"></div>
      <label class="label" for="opdate" style="margin-top:14px;display:block">Data</label>
      <div class="card namein" style="margin-top:6px"><input id="opdate" type="date" value="${esc(date)}" max="${today}"></div>
      <div class="error" role="alert"></div>
      <button type="button" class="btn" data-act="sheet-save" style="margin-top:6px">Guardar</button>
      <button type="button" class="btn plain" data-act="sheet-cancel">Cancelar</button>
      ${has ? '<button type="button" class="btn plain danger-text" data-act="sheet-remove">Remover saldo inicial</button>' : ''}
    </div></div>`).firstElementChild;

    const valInput = shade.querySelector('#opval');
    const dateInput = shade.querySelector('#opdate');
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
    const observer = new MutationObserver(() => { if (!shade.isConnected && !settled) done(false); });
    // The confirmation sheet handles its own Escape; ignore it while that one is on top.
    const onKey = e => { if (e.key === 'Escape' && !busy && host.querySelectorAll('.shade').length === 1) done(false); };

    async function write(patch) {
      busy = true;
      saveBtn.disabled = true;
      try {
        await ctx.store.updateProfile(profile.id, patch);
        done(true);
      } catch (e) {
        errBox.textContent = e?.message || 'Não foi possível guardar. Tenta outra vez.';
        busy = false;
        saveBtn.disabled = false;
      }
    }

    function save() {
      if (busy) return;
      const cents = parseSignedCents(valInput.value);
      const day = dateInput.value;
      // An empty date would read as "in the future" in validateOpening, so it gets its own message.
      const problem = validateOpening({ cents, date: day || today }, today) ?? (day ? null : 'Escolhe uma data.');
      if (problem) { errBox.textContent = problem; return; }
      write({ openingCents: cents, openingDate: day });
    }

    async function remove() {
      if (busy) return;
      const ok = await confirmSheet({ message: 'Remover o saldo inicial?', ok: 'Remover', danger: true });
      if (ok && !settled) write({ openingCents: null, openingDate: null });
    }

    shade.addEventListener('click', e => {
      e.stopPropagation();
      const el = e.target.closest('[data-act]');
      if (!el) return;
      const act = el.dataset.act;
      if (act === 'sheet-cancel') { if (el !== shade || e.target === shade) done(false); }
      else if (act === 'sheet-save') save();
      else if (act === 'sheet-remove') remove();
    });
    for (const i of [valInput, dateInput]) i.addEventListener('input', () => { errBox.textContent = ''; });
    valInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    document.addEventListener('keydown', onKey);
    host.append(shade);
    observer.observe(host, { childList: true });
    valInput.focus();
  });
}
