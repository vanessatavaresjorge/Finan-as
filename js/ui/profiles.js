// Profile picker ("Quem está a usar?") and creation of the first profile of the account.
import { hashPin } from '../pin.js';
import { askNewPin } from './pinpad.js';
import { esc, mount, bindActions } from './dom.js';

// ctx: { store, openLock(pid) }
export function renderPicker(ctx, root) {
  const { profiles } = ctx.store.getState();
  mount(root, `<div class="lock">
    <h1>Quem está a usar?</h1>
    <div class="sub">Escolhe o teu perfil.</div>
    <div class="profs">${profiles.map(p => `<button class="card prof" data-act="pick" data-v="${esc(p.id)}">
      <span class="av">${esc(Array.from(p.name.trim())[0]?.toUpperCase() ?? '?')}</span>${esc(p.name)}</button>`).join('')}</div>
  </div>`);
  bindActions(root.querySelector('.profs'), { pick: el => ctx.openLock(el.dataset.v) });
}

// ctx: { store, unlock(pid) }. Name, then the code twice; then the profile and the default categories.
export function renderFirst(ctx, root) {
  mount(root, `<div class="lock">
    <h1>Criar o primeiro perfil</h1>
    <div class="sub">Cada pessoa da casa tem o seu perfil e o seu código.</div>
    <form class="authform" novalidate>
      <label class="card namein"><input name="pname" maxlength="30" placeholder="Nome do perfil" autocomplete="off"></label>
      <div class="error" role="alert"></div>
      <button class="btn" type="submit">Continuar</button>
    </form>
  </div>`);
  const form = root.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const name = form.elements.pname.value.trim();
    if (!name) { form.querySelector('.error').textContent = 'Escreve o nome do perfil.'; return; }
    const pin = await askNewPin(root, { title: name });
    try {
      const id = ctx.store.addProfile({ name, ...(await hashPin(pin)) });
      ctx.store.seedDefaults();
      ctx.unlock(id);
    } catch (e2) {
      ctx.showError?.(e2.message);
      renderFirst(ctx, root);
    }
  });
}
