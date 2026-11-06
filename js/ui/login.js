// Login with the household account. Errors come from `account` as Portuguese messages.
import { mount, bindActions } from './dom.js';

// ctx: { account }. After a successful login, account.onUser moves the app on.
export function render(ctx, root) {
  mount(root, `<div class="lock">
    <h1>Finanças</h1>
    <div class="sub">Entra com a conta da casa.</div>
    <form class="authform" novalidate>
      <label class="card field"><span>Email</span>
        <input type="email" name="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false"></label>
      <label class="card field"><span>Palavra-passe</span>
        <input type="password" name="password" autocomplete="current-password"></label>
      <div class="error" role="alert"></div>
      <button class="btn" type="submit">Entrar</button>
      <button class="forgot" type="button" data-act="reset">Esqueci-me da palavra-passe</button>
    </form>
  </div>`);
  const form = root.querySelector('form');
  const msg = form.querySelector('.error');
  const submit = form.querySelector('button[type="submit"]');
  const say = (text, ok = false) => { msg.textContent = text; msg.classList.toggle('ok', ok); };

  form.addEventListener('submit', async e => {
    e.preventDefault();
    say('');
    submit.disabled = true;
    try {
      await ctx.account.login(form.email.value, form.password.value);
    } catch (e2) {
      say(e2.message);
    } finally {
      submit.disabled = false;
    }
  });

  bindActions(form, {
    reset: async () => {
      const email = form.email.value.trim();
      if (!email) { say('Escreve o teu email.'); return; }
      say('');
      try {
        await ctx.account.resetPassword(email);
        say('Enviámos um email para repores a palavra-passe.', true);
      } catch (e2) {
        say(e2.message);
      }
    },
  });
}
