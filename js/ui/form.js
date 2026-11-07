// Register / edit a movement. Keeps what was typed while data arrives from the other device:
// the form is built once and only the category chips are refreshed on store updates.
import { parseCents, validateAmount, centsToInput, todayISO } from '../logic/format.js';
import { sortCategories } from '../logic/categories.js';
import { esc, mount, bindActions } from './dom.js';
import { confirmSheet } from './dialog.js';
import { openCategorySheet } from './catsheet.js';

export const keepOnUpdate = true;

const monthOf = date => ({ name: 'mes', ym: date.slice(0, 7), casa: false });

export function render(ctx, root) {
  const { store, route } = ctx;
  const editing = route.name === 'editar';
  let move = null;
  if (editing) {
    move = store.getState().moves.find(m => m.id === route.moveId);
    // a movement of another profile (or one that is gone) cannot be edited
    if (!move || move.profileId !== ctx.profileId) { ctx.replace({ name: 'mes', ym: todayISO().slice(0, 7), casa: false }); return; }
  }

  const f = move
    ? { type: move.type, catId: move.categoryId }
    : { type: 'out', catId: null };
  const profile = store.getState().profiles.find(p => p.id === ctx.profileId);
  let busy = false;

  mount(root, `<div class="scroll">
    ${editing ? '<button class="back" data-act="back">‹ Voltar</button>' : ''}
    <div class="label" style="margin-bottom:8px">${editing ? 'A editar' : 'A registar'} no perfil de <b style="color:var(--text)">${esc(profile?.name ?? '')}</b></div>
    <div class="seg">
      <button type="button" data-act="type" data-v="out">Saída</button>
      <button type="button" data-act="type" data-v="in">Entrada</button>
    </div>
    <div class="amount"><input id="amt" inputmode="decimal" placeholder="0,00" value="${move ? esc(centsToInput(move.cents)) : ''}" autocomplete="off" aria-label="Valor"><span>€</span></div>
    <div class="label">Categoria</div>
    <div class="chips" id="chips"></div>
    <label class="card field">Data<input id="date" type="date" value="${move ? esc(move.date) : todayISO()}"></label>
    <label class="card field">Nota<input id="note" placeholder="Opcional" value="${move ? esc(move.note) : ''}" maxlength="60" autocomplete="off"></label>
    <div class="error" role="alert"></div>
    <button type="button" class="btn" data-act="save">${editing ? 'Guardar alterações' : 'Guardar'}</button>
    ${editing ? '<button type="button" class="btn ghost" data-act="del">Apagar movimento</button>' : ''}
  </div>`);

  const $ = sel => root.querySelector(sel);
  const errBox = $('.error');
  const saveBtn = $('[data-act="save"]');

  function drawType() {
    for (const b of root.querySelectorAll('.seg button')) b.classList.toggle('on', b.dataset.v === f.type);
  }
  function drawChips() {
    const cats = store.getState().categories;
    if (f.catId && !cats.some(c => c.id === f.catId && c.type === f.type)) f.catId = null;
    $('#chips').innerHTML = sortCategories(cats, f.type).map(c =>
      `<button type="button" class="chip${c.id === f.catId ? ' on' : ''}" data-act="pick" data-cat="${esc(c.id)}"><span class="e">${esc(c.icon)}</span>${esc(c.name)}</button>`).join('')
      + '<button type="button" class="chip new" data-act="newcat">+ Nova</button>';
  }
  drawType();
  drawChips();

  // Store updates: refresh only the chips (a new category shows up), never the typed fields.
  const unsubscribe = store.subscribe(() => {
    if (!root.isConnected) { unsubscribe?.(); return; }
    drawChips();
  });

  const clearError = () => { errBox.textContent = ''; };
  root.addEventListener('input', clearError);

  // After saving or deleting: on a wide window the drawer closes over the screen behind it;
  // on the phone the month of the movement opens.
  const done = month => { if (!ctx.closeForm()) ctx.go(month); };

  async function save() {
    if (busy) return;
    const text = $('#amt').value;
    const parsed = parseCents(text);
    let problem = parsed === null && text.trim() ? 'Valor inválido. Usa por exemplo 12,50.' : validateAmount(parsed);
    if (!problem && !f.catId) problem = 'Escolhe uma categoria.';
    if (problem) { errBox.textContent = problem; return; }
    const date = $('#date').value || todayISO();
    const fields = { type: f.type, cents: parsed, categoryId: f.catId, date, note: $('#note').value.trim() };
    busy = true;
    saveBtn.disabled = true;
    try {
      if (editing) await store.updateMove(move.id, fields);
      else await store.addMove({ ...fields, profileId: ctx.profileId });
    } catch (e) {
      errBox.textContent = e?.message || 'Não foi possível guardar. Tenta outra vez.';
      busy = false;
      saveBtn.disabled = false;
      return;
    }
    unsubscribe();
    done(monthOf(date));
  }

  async function del() {
    if (busy) return;
    const ok = await confirmSheet({ message: 'Apagar este movimento?', ok: 'Apagar', danger: true });
    if (!ok || busy) return;
    busy = true;
    try {
      await store.deleteMove(move.id);
    } catch (e) {
      errBox.textContent = e?.message || 'Não foi possível apagar. Tenta outra vez.';
      busy = false;
      return;
    }
    unsubscribe();
    done(monthOf(move.date));
  }

  async function newCat() {
    const id = await openCategorySheet(ctx, { type: f.type });
    if (id && root.isConnected) { f.catId = id; clearError(); drawChips(); }
  }

  bindActions(root, {
    back: () => ctx.go(monthOf(move.date)),
    type: el => {
      if (f.type === el.dataset.v) return;
      f.type = el.dataset.v;
      f.catId = null; // a category of the other type no longer applies
      clearError();
      drawType();
      drawChips();
    },
    pick: el => { f.catId = el.dataset.cat; clearError(); drawChips(); },
    newcat: newCat,
    save,
    del,
  });
}
