// Boot flow, routing and re-render. Firebase is loaded only outside demo mode.
import { todayISO } from './logic/format.js';
import { parseRoute, routeHash } from './logic/route.js';
import { createDeviceState } from './device-state.js';
import { createMemoryStore } from './store-memory.js';
import { demoData } from './demo-data.js';
import { hashPin } from './pin.js';
import { esc, h, mount, bindActions } from './ui/dom.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const DEMO = ['localhost', '127.0.0.1'].includes(location.hostname) && params.get('demo') === '1';
const DEMO_PIN = '111111';

// Placeholder screens until Tasks 10-14 replace them. Each screen: render(ctx, root), optional keepOnUpdate.
const placeholder = title => ({
  render(ctx, root) {
    mount(root, `<div class="scroll"><div class="title">${esc(title)}</div>
      <p class="label" style="margin-top:6px">${esc(ctx.route.name)} · ${esc(routeHash(ctx.route))}</p></div>`);
  },
});
const SCREENS = {
  mes: placeholder('Mês'),
  cat: placeholder('Categoria do mês'),
  entradas: placeholder('Entradas do mês'),
  ano: placeholder('Ano'),
  categorias: placeholder('Categorias'),
  registar: placeholder('Registar movimento'),
  editar: placeholder('Editar movimento'),
};
const TAB_OF = { mes: 'mes', cat: 'mes', entradas: 'mes', ano: 'ano', categorias: 'categorias' };

const S = {
  stage: 'loading', // loading | login | first-profile | pick | lock | app
  store: null,
  unsubscribe: null,
  device: null,
  account: null,
  profileId: null,
  route: parseRoute(location.hash, todayISO()),
  lastYm: todayISO().slice(0, 7),
  lastCasa: false,
  screen: null,
  shell: null,
};

// ---------- Messages ----------
let toastTimer = 0;
function showError(message) {
  document.querySelector('.toast')?.remove();
  clearTimeout(toastTimer);
  const el = h(`<div class="toast" role="alert">${esc(message)}</div>`).firstElementChild;
  el.addEventListener('click', () => el.remove());
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), 5000);
}

// ---------- Before the app: login, profiles, lock (Task 10 replaces these placeholders) ----------
const STAGE_TEXT = {
  loading: ['A carregar…', ''],
  login: ['Entrar', 'Conta da casa'],
  'first-profile': ['Criar o primeiro perfil', ''],
  pick: ['Quem está a usar?', ''],
  lock: ['Bloqueado', 'Introduz o teu código'],
};
function renderStage() {
  S.shell = null;
  S.screen = null;
  const [title, sub] = STAGE_TEXT[S.stage];
  mount(app, `<div class="lock"><h1>${esc(title)}</h1><div class="sub">${esc(sub)}</div></div>`);
}

function decideStage(state) {
  const exists = id => id && state.profiles.some(p => p.id === id);
  const unlockId = DEMO ? params.get('unlock') : null;
  if (!state.profiles.length) S.stage = 'first-profile';
  else if (exists(unlockId)) return unlock(unlockId);
  else if (exists(S.device.lastProfile())) { S.stage = 'lock'; S.profileId = S.device.lastProfile(); }
  else S.stage = 'pick';
  renderStage();
}

function unlock(profileId) {
  S.profileId = profileId;
  S.device.setLastProfile(profileId);
  S.stage = 'app';
  buildShell();
  renderScreen();
}

function onState(state) {
  if (!state.ready) return;
  if (S.stage === 'app') {
    if (!state.profiles.some(p => p.id === S.profileId)) { S.profileId = null; decideStage(state); return; }
    if (!S.screen?.keepOnUpdate) rerender();
  } else if (S.stage === 'loading' || S.stage === 'first-profile') {
    decideStage(state);
  }
}

// ---------- App shell: screen, + button, tabs ----------
function buildShell() {
  mount(app, `<main class="screen"></main>
    <button class="fab" data-act="shell-add" aria-label="Registar movimento">+</button>
    <nav class="tabs">
      <button data-act="shell-tab" data-v="mes">Mês</button>
      <button data-act="shell-tab" data-v="ano">Ano</button>
      <button data-act="shell-tab" data-v="categorias">Categorias</button>
    </nav>`);
  S.shell = { fab: app.querySelector('.fab'), tabs: [...app.querySelectorAll('.tabs button')] };
  bindActions(app.querySelector('.tabs'), { 'shell-tab': el => openTab(el.dataset.v) });
  bindActions(S.shell.fab, { 'shell-add': () => go({ name: 'registar', casa: false }) });
}

function openTab(tab) {
  if (tab === 'mes') go({ name: 'mes', ym: S.lastYm, casa: S.lastCasa });
  else if (tab === 'ano') go({ name: 'ano', year: Number(S.lastYm.slice(0, 4)), mode: 'gastos', casa: S.lastCasa });
  else go({ name: 'categorias', casa: false });
}

function makeCtx() {
  return {
    store: S.store, device: S.device, account: S.account, profileId: S.profileId,
    route: S.route, go, rerender, demo: DEMO,
  };
}

// Every render gets a fresh root, so listeners a screen binds on it never pile up.
function renderScreen({ keepScroll = false } = {}) {
  if (S.stage !== 'app' || !S.shell) return;
  const r = S.route;
  for (const b of S.shell.tabs) b.classList.toggle('on', b.dataset.v === TAB_OF[r.name]);
  S.shell.fab.hidden = r.name === 'registar' || r.name === 'editar';
  const old = app.querySelector('main.screen');
  const scrollTop = keepScroll ? old.querySelector('.scroll')?.scrollTop ?? 0 : 0;
  const root = document.createElement('main');
  root.className = 'screen';
  old.replaceWith(root);
  S.screen = SCREENS[r.name];
  S.screen.render(makeCtx(), root);
  if (scrollTop) { const sc = root.querySelector('.scroll'); if (sc) sc.scrollTop = scrollTop; }
}

function rerender() { renderScreen({ keepScroll: true }); }

function go(route) {
  const hash = routeHash(route);
  if (location.hash === hash) onRoute();
  else location.hash = hash;
}

function onRoute() {
  S.route = parseRoute(location.hash, todayISO());
  remember(S.route);
  renderScreen();
}

// The Mês and Ano tabs go back to the month (and Casa view) last shown.
function remember(route) {
  if (route.ym) { S.lastYm = route.ym; S.lastCasa = route.casa; }
  else if (route.name === 'ano') S.lastCasa = route.casa;
}

// ---------- Boot ----------
function memoryStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: k => { m.delete(k); },
  };
}

function useStore(store) {
  S.unsubscribe?.();
  S.store?.stop?.();
  S.store = store;
  S.unsubscribe = store ? store.subscribe(onState) : null;
}

async function boot() {
  navigator.storage?.persist?.().catch(() => {});
  window.addEventListener('hashchange', onRoute);
  remember(S.route);
  renderStage();

  if (DEMO) {
    S.device = createDeviceState(memoryStorage());
    const data = demoData(todayISO());
    for (const p of data.profiles) Object.assign(p, await hashPin(DEMO_PIN));
    const store = createMemoryStore(data, showError);
    window.__demo = { store };
    useStore(store);
    return;
  }

  S.device = createDeviceState();
  const [{ db }, account, { createFirestoreStore }] = await Promise.all([
    import('./firebase.js'), import('./account.js'), import('./store-firestore.js'),
  ]);
  S.account = account;
  account.onUser(user => {
    S.profileId = null;
    if (!user) {
      useStore(null);
      S.stage = 'login';
      renderStage();
      return;
    }
    S.stage = 'loading';
    renderStage();
    useStore(createFirestoreStore(db, user.uid, showError));
  });
}

boot().catch(e => {
  console.error(e);
  showError('Não foi possível abrir a app. Verifica a ligação à internet e tenta outra vez.');
});
