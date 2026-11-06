// Keypad with 6 dots, as in the mockup's lock screen. The code is checked at the 6th digit.
import { esc, mount } from './dom.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];

// onComplete(pin) → Promise<string|null>: a string is shown as an error and the dots clear.
// `actions` is extra HTML placed under the keypad (the caller binds its buttons).
export function pinPad(root, { title, subtitle = '', actions = '', onComplete }) {
  mount(root, `<div class="lock">
    <h1>${esc(title)}</h1>
    <div class="sub" aria-live="polite">${esc(subtitle)}</div>
    <div class="dots">${'<i></i>'.repeat(6)}</div>
    <div class="pad">${KEYS.map(k => k === '' ? '<span></span>'
      : k === 'del' ? '<button class="x" data-act="pin-del" aria-label="Apagar">Apagar</button>'
      : `<button data-act="pin" data-v="${k}">${k}</button>`).join('')}</div>
    ${actions ? `<div class="lockacts">${actions}</div>` : ''}
  </div>`);
  const el = root.querySelector('.lock');
  const subEl = el.querySelector('.sub');
  const dotsEl = el.querySelector('.dots');
  const dots = [...dotsEl.children];
  const buttons = [...el.querySelectorAll('.pad button')];

  let entry = '';
  let busy = false;
  let frozen = false;
  let blockedUntil = 0;
  let timer = 0;
  let defaultSub = subtitle;

  const showDots = () => dots.forEach((d, i) => d.classList.toggle('f', i < entry.length));
  const showSub = (msg, err = false) => { subEl.textContent = msg; subEl.classList.toggle('err', err); };
  const blocked = () => blockedUntil > Date.now();

  async function complete() {
    busy = true;
    await new Promise(r => setTimeout(r, 150)); // let the 6th dot show
    let result = null;
    try {
      result = await onComplete(entry);
    } catch (e) {
      result = e?.message || 'Ocorreu um erro inesperado. Tenta de novo.';
    }
    entry = '';
    showDots();
    if (typeof result === 'string') {
      showSub(result, true);
      dotsEl.classList.remove('shake');
      void dotsEl.offsetWidth; // restart the animation
      dotsEl.classList.add('shake');
    }
    busy = false;
  }

  function press(key) {
    if (busy || frozen || blocked()) return;
    if (key === 'del') { entry = entry.slice(0, -1); showDots(); return; }
    if (entry.length >= 6) return;
    if (!entry) { showSub(defaultSub); dotsEl.classList.remove('shake'); }
    entry += key;
    showDots();
    if (entry.length === 6) complete();
  }

  el.querySelector('.pad').addEventListener('click', e => {
    const b = e.target.closest('button[data-act]');
    if (b) press(b.dataset.act === 'pin-del' ? 'del' : b.dataset.v);
  });
  // A physical keyboard (the Mac) works too. The listener goes away with the screen.
  const onKey = e => {
    if (!el.isConnected) { document.removeEventListener('keydown', onKey); return; }
    if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('del');
  };
  document.addEventListener('keydown', onKey);

  function tick() {
    clearTimeout(timer);
    if (!el.isConnected) return;
    const left = Math.ceil((blockedUntil - Date.now()) / 1000);
    if (left > 0) {
      showSub(`Tenta de novo daqui a ${left} s`, true);
      timer = setTimeout(tick, Math.min(1000, blockedUntil - Date.now()));
    } else {
      blockedUntil = 0;
      buttons.forEach(b => { b.disabled = false; });
      showSub(defaultSub);
    }
  }

  return {
    el,
    // Disables the keys and counts down; the keys come back at the end.
    setBlocked(seconds) {
      entry = '';
      showDots();
      blockedUntil = Date.now() + seconds * 1000;
      buttons.forEach(b => { b.disabled = true; });
      tick();
    },
    // New default subtitle (shown now unless blocked).
    setSub(text) {
      defaultSub = text;
      if (!blocked()) showSub(text);
    },
    // Ignores every key from now on (the caller is moving to another screen).
    freeze() { frozen = true; },
  };
}

// Asks for a new code twice. Resolves with the code when both match.
export function askNewPin(root, { title, actions = '' }) {
  const FIRST = 'Cria um código de 6 algarismos';
  const AGAIN = 'Escreve o código outra vez';
  return new Promise(resolve => {
    let first = null;
    const pad = pinPad(root, {
      title, subtitle: FIRST, actions,
      async onComplete(pin) {
        if (first === null) {
          first = pin;
          pad.setSub(AGAIN);
          return null;
        }
        if (pin !== first) {
          first = null;
          pad.setSub(FIRST);
          return 'Os códigos não coincidem. Tenta de novo.';
        }
        pad.freeze();
        resolve(pin);
        return null;
      },
    });
  });
}
