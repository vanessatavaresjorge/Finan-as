// Lock screen of one profile: code, wrong-code lockout, Trocar perfil, Esqueci-me do código.
// A profile without a code (imported from a backup, interrupted creation) asks to create one.
import { hashPin, verifyPin, lockoutState, registerFailure, registerSuccess, MAX_FAILS } from '../pin.js';
import { pinPad, askNewPin } from './pinpad.js';
import { mount, bindActions } from './dom.js';

export const hasPin = p => !!(p && p.pinHash && p.pinSalt && p.pinIter);
const profileOf = (ctx, pid) => ctx.store.getState().profiles.find(p => p.id === pid);

// ctx: { store, device, account, demo, unlock(pid), pick(), showError(msg) }
export function render(ctx, root, profileId) {
  const state = ctx.store.getState();
  const profile = state.profiles.find(p => p.id === profileId);
  if (!profile) { ctx.pick(); return; }
  const switchBtn = state.profiles.length > 1 ? '<button class="forgot" data-act="switch">Trocar perfil</button>' : '';

  if (!hasPin(profile)) {
    createCode(ctx, root, profile, switchBtn);
    return;
  }

  const pad = pinPad(root, {
    title: profile.name,
    subtitle: 'Introduz o teu código',
    actions: `<button class="forgot" data-act="forgot">Esqueci-me do código</button>${switchBtn}`,
    async onComplete(pin) {
      const wait = lockoutState(ctx.device.lock(profileId), Date.now());
      if (wait.blocked) { pad.setBlocked(wait.waitSeconds); return null; }
      if (await verifyPin(pin, profileOf(ctx, profileId))) {
        pad.freeze();
        // Trocar perfil was tapped during the check: never open the abandoned profile.
        if (!pad.el.isConnected) return null;
        ctx.device.setLock(profileId, registerSuccess());
        ctx.unlock(profileId);
        return null;
      }
      const rec = registerFailure(ctx.device.lock(profileId), Date.now());
      ctx.device.setLock(profileId, rec);
      const now = lockoutState(rec, Date.now());
      if (now.blocked) { pad.setBlocked(now.waitSeconds); return null; }
      const left = MAX_FAILS - rec.fails;
      return `Código errado. ${left === 1 ? 'Resta 1 tentativa' : `Restam ${left} tentativas`}.`;
    },
  });
  const wait = lockoutState(ctx.device.lock(profileId), Date.now());
  if (wait.blocked) pad.setBlocked(wait.waitSeconds);
  bindActions(pad.el.querySelector('.lockacts'), {
    switch: () => ctx.pick(),
    forgot: () => forgot(ctx, root, profile),
  });
}

async function createCode(ctx, root, profile, actions) {
  const done = askNewPin(root, { title: profile.name, actions });
  const acts = root.querySelector('.lockacts');
  if (acts) bindActions(acts, { switch: () => ctx.pick() });
  await saveNewPin(ctx, profile.id, await done);
}

async function saveNewPin(ctx, pid, pin) {
  try {
    ctx.store.updateProfile(pid, await hashPin(pin));
  } catch (e) {
    ctx.showError(e.message);
    ctx.pick();
    return;
  }
  ctx.device.setLock(pid, registerSuccess());
  ctx.unlock(pid);
}

// Email and password of the household account, then a new code for this profile.
function forgot(ctx, root, profile) {
  mount(root, `<div class="lock">
    <h1>Esqueci-me do código</h1>
    <div class="sub">Escreve o email e a palavra-passe da conta da casa.</div>
    <form class="authform" novalidate>
      <label class="card field"><span>Email</span>
        <input type="email" name="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false"></label>
      <label class="card field"><span>Palavra-passe</span>
        <input type="password" name="password" autocomplete="current-password"></label>
      <div class="error" role="alert"></div>
      <button class="btn" type="submit">Continuar</button>
      <button class="btn plain" type="button" data-act="back">Cancelar</button>
    </form>
  </div>`);
  const form = root.querySelector('form');
  const err = form.querySelector('.error');
  const submit = form.querySelector('button[type="submit"]');
  bindActions(form, { back: () => render(ctx, root, profile.id) });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    err.textContent = '';
    submit.disabled = true;
    try {
      // In demo mode there is no account: any input is accepted.
      if (!ctx.demo) await ctx.account.reauth(form.email.value, form.password.value);
    } catch (e2) {
      err.textContent = e2.message;
      submit.disabled = false;
      return;
    }
    const pin = await askNewPin(root, { title: profile.name });
    await saveNewPin(ctx, profile.id, pin);
  });
}
