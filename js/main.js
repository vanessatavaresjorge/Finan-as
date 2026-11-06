// Boot flow, routing and re-render. Firebase is loaded only outside demo mode.
import { todayISO } from './logic/format.js';
import { parseRoute, routeHash } from './logic/route.js';
import { createDeviceState } from './device-state.js';
import { createMemoryStore } from './store-memory.js';
import { demoData } from './demo-data.js';
import { hashPin, shouldRelock } from './pin.js';
import { esc, h, mount, bindActions } from './ui/dom.js';
import * as loginScreen from './ui/login.js';
import * as profilesScreen from './ui/profiles.js';
import * as lockScreen from './ui/lock.js';
import * as formScreen from './ui/form.js';
import * as monthScreen from './ui/month.js';
import * as yearScreen from './ui/year.js';
import * as categoriesScreen from './ui/categories.js';

const app = document.getElementById('app');
const params = new URLSearchParams(location.search);
const DEMO = ['localhost', '127.0.0.1'].includes(location.hostname) && params.get('demo') === '1';
const DEMO_PIN = '111111';
// How long to wait for the data before offering Tentar de novo (demo tests may shorten it).
const LOAD_MS = DEMO && Number(params.get('loadms')) > 0 ? Number(params.get('loadms')) : 15000;

// Each screen: render(ctx, root), optional keepOnUpdate (store updates do not re-render it).
const SCREENS = {
  mes: monthScreen,
  cat: monthScreen,
  entradas: monthScreen,
  ano: yearScreen,
  categorias: categoriesScreen,
  registar: formScreen,
  editar: formScreen,
};
const TAB_OF = { mes: 'mes', cat: 'mes', entradas: 'mes', ano: 'ano', categorias: 'categorias' };

const S = {
  stage: 'loading', // loading | load-failed | login | first-profile | pick | lock | app
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
  stageKey: null, // what the login/profile/lock screen shown depends on (re-render when it changes)
  loadTimer: 0,
  hiddenAt: null,
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

// ---------- Before the app: login, profiles, lock ----------
function stageKey(state) {
  if (!state) return null;
  if (S.stage === 'pick') return JSON.stringify(state.profiles.map(p => [p.id, p.name]));
  if (S.stage === 'lock') {
    const p = state.profiles.find(x => x.id === S.profileId);
    return JSON.stringify([!!p, p?.name, lockScreen.hasPin(p), state.profiles.length > 1]);
  }
  return null;
}

function stageCtx() {
  return {
    store: S.store, device: S.device, account: S.account, demo: DEMO, showError,
    unlock, openLock, pick: showPicker,
  };
}

// Every stage gets a fresh root, so listeners never pile up.
function renderStage() {
  S.shell = null;
  S.screen = null;
  const root = document.createElement('main');
  root.className = 'screen';
  app.replaceChildren(root);
  S.stageKey = stageKey(S.store?.getState());
  const ctx = stageCtx();
  if (S.stage === 'login') loginScreen.render(ctx, root);
  else if (S.stage === 'first-profile') profilesScreen.renderFirst(ctx, root);
  else if (S.stage === 'pick') profilesScreen.renderPicker(ctx, root);
  else if (S.stage === 'lock') lockScreen.render(ctx, root, S.profileId);
  else if (S.stage === 'load-failed') renderLoadFailed(root);
  else mount(root, '<div class="lock"><h1>A carregar…</h1><div class="sub"></div></div>');
}

function renderLoadFailed(root) {
  mount(root, `<div class="lock"><h1>Finanças</h1>
    <div class="sub err">Não foi possível carregar os dados. Verifica a ligação à internet.</div>
    <div class="authform">
      <button class="btn" data-act="retry">Tentar de novo</button>
      <button class="btn plain" data-act="logout">Terminar sessão</button>
    </div></div>`);
  bindActions(root, {
    retry: () => location.reload(),
    logout: () => {
      S.device?.setLastProfile(null);
      // Signs out, clears this device's copy of the data and reloads the page.
      if (S.account) S.account.logoutAndWipe().catch(e => showError(e.message));
      else location.reload();
    },
  });
}

function startLoadTimer() {
  clearTimeout(S.loadTimer);
  S.loadTimer = setTimeout(() => {
    if (S.stage !== 'loading') return;
    S.stage = 'load-failed';
    renderStage();
  }, LOAD_MS);
}

function showPicker() {
  S.stage = 'pick';
  S.profileId = null;
  renderStage();
}

function openLock(profileId) {
  S.stage = 'lock';
  S.profileId = profileId;
  renderStage();
}

function decideStage(state) {
  const exists = id => id && state.profiles.some(p => p.id === id);
  const unlockId = DEMO ? params.get('unlock') : null;
  if (!state.profiles.length) { S.stage = 'first-profile'; S.profileId = null; }
  else if (exists(unlockId)) return unlock(unlockId);
  else if (exists(S.device.lastProfile())) { S.stage = 'lock'; S.profileId = S.device.lastProfile(); }
  else { S.stage = 'pick'; S.profileId = null; }
  renderStage();
}

// Opens the app on the route that was open (or asked for) before the lock.
function unlock(profileId) {
  S.profileId = profileId;
  S.device.setLastProfile(profileId);
  S.stage = 'app';
  buildShell();
  renderScreen();
}

function onState(state) {
  if (!state.ready) return;
  // No profiles in the local cache only (offline): never offer to create the first profile, which
  // would add a profile to an account that already has some. Wait for the server; the load timer
  // shows the load-failed message. (The memory store has no such flag.)
  if (!state.profiles.length && state.profilesConfirmed === false && S.stage !== 'first-profile') {
    if (S.stage === 'loading' || S.stage === 'load-failed') return;
    S.stage = 'loading';
    S.profileId = null;
    renderStage();
    startLoadTimer();
    return;
  }
  clearTimeout(S.loadTimer);
  if (S.stage === 'app') {
    if (!state.profiles.some(p => p.id === S.profileId)) { S.profileId = null; decideStage(state); return; }
    if (!S.screen?.keepOnUpdate) rerender();
  } else if (S.stage === 'loading' || S.stage === 'load-failed') {
    decideStage(state);
  } else if (S.stage === 'first-profile') {
    if (state.profiles.length) decideStage(state);
  } else if (S.stage === 'pick' || S.stage === 'lock') {
    // The profile being opened may disappear or lose its code on another device.
    if (!state.profiles.length) { S.stage = 'first-profile'; S.profileId = null; renderStage(); }
    else if (S.stage === 'lock' && !state.profiles.some(p => p.id === S.profileId)) showPicker();
    else if (stageKey(state) !== S.stageKey) renderStage();
  }
}

// Back after more than a minute in another app or with the screen off: lock again.
// Open sheets and forms close; the route stays, so unlocking returns to it.
// While hidden in the app, a plain cover hides the data from the app switcher.
function onVisibility() {
  if (document.visibilityState === 'hidden') {
    S.hiddenAt = Date.now();
    if (S.stage === 'app' && !document.querySelector('body > .cover')) {
      const cover = document.createElement('div');
      cover.className = 'cover';
      cover.setAttribute('aria-hidden', 'true');
      document.body.append(cover);
    }
    return;
  }
  const hiddenAt = S.hiddenAt;
  S.hiddenAt = null;
  if (S.stage === 'app' && shouldRelock(hiddenAt, Date.now())) {
    document.activeElement?.blur?.();
    for (const el of document.querySelectorAll('.shade')) el.remove();
    openLock(S.profileId);
  }
  // The lock screen (or the app, after a short absence) is in place: drop the cover.
  for (const el of document.querySelectorAll('body > .cover')) el.remove();
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
    route: S.route, go, rerender, demo: DEMO, showError,
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
function useStore(store) {
  S.unsubscribe?.();
  S.store?.stop?.();
  S.store = store;
  S.unsubscribe = store ? store.subscribe(onState) : null;
}

async function boot() {
  navigator.storage?.persist?.().catch(() => {});
  window.addEventListener('hashchange', onRoute);
  document.addEventListener('visibilitychange', onVisibility);
  remember(S.route);
  renderStage();

  if (DEMO) {
    S.device = createDeviceState();
    const stall = params.get('stall');
    if (stall === '1' || stall === 'cache') {
      // tests: data that never arrives (1), or an empty local cache the server has not confirmed (cache)
      let state = { profiles: [], categories: [], moves: [], pending: false, ready: stall === 'cache', profilesConfirmed: false };
      const subs = new Set();
      window.__stub = { confirm() { state = { ...state, profilesConfirmed: true }; for (const fn of subs) fn(state); } };
      useStore({ subscribe: fn => { subs.add(fn); fn(state); return () => subs.delete(fn); }, getState: () => state });
      startLoadTimer();
      return;
    }
    const data = demoData(todayISO());
    for (const p of data.profiles) Object.assign(p, await hashPin(DEMO_PIN));
    const store = createMemoryStore(data, showError);
    window.__demo = { store };
    useStore(store);
    return;
  }

  // Installable app: keeps the app files so it opens without internet (never in demo mode).
  navigator.serviceWorker?.register('sw.js').catch(() => {});

  S.device = createDeviceState();
  const [{ db }, account, { createFirestoreStore }] = await Promise.all([
    import('./firebase.js'), import('./account.js'), import('./store-firestore.js'),
  ]);
  S.account = account;
  account.onUser(user => {
    S.profileId = null;
    clearTimeout(S.loadTimer);
    if (!user) {
      useStore(null);
      S.stage = 'login';
      renderStage();
      return;
    }
    S.stage = 'loading';
    renderStage();
    startLoadTimer();
    useStore(createFirestoreStore(db, user.uid, showError));
  });
}

boot().catch(e => {
  console.error(e);
  showError('Não foi possível abrir a app. Verifica a ligação à internet e tenta outra vez.');
});
