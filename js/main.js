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
import { signOutBlocked, PENDING_MSG } from './logic/signout.js';
import * as categoriesScreen from './ui/categories.js';
import * as exportScreen from './ui/export.js';
import { isWide, onWideChange } from './ui/layout.js';

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
  exportar: exportScreen,
};
const TAB_OF = { mes: 'mes', cat: 'mes', entradas: 'mes', ano: 'ano', categorias: 'categorias', exportar: 'exportar' };
// On a wide window these routes open in the drawer, over the last other route.
const isForm = route => route.name === 'registar' || route.name === 'editar';
const currentMonth = () => ({ name: 'mes', ym: todayISO().slice(0, 7), casa: false });

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
  wide: isWide(),
  bgRoute: null, // last route that is not a form: shown behind the drawer on a wide window
  formRoot: null,
  drawerFromBg: false, // root of the open register/edit form, moved (not re-rendered) on resize
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
  S.formRoot = null;
  app.classList.remove('has-side');
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
      if (signOutBlocked(S.store)) { showError(PENDING_MSG); return; }
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

// ---------- App shell: screen, + button, tabs (and, on a wide window, sidebar and drawer) ----------
function buildShell() {
  const side = S.wide ? `<nav class="sidebar">
      <b class="brand">Finanças</b>
      <button class="nav" data-act="shell-tab" data-v="mes">Mês</button>
      <button class="nav" data-act="shell-tab" data-v="ano">Ano</button>
      <button class="nav" data-act="shell-tab" data-v="categorias">Categorias</button>
      <button class="nav" data-act="shell-tab" data-v="exportar">Exportar Excel</button>
      <div class="grow"></div>
      <div class="who"></div>
      <button class="btn add" data-act="shell-add">+ Registar</button>
    </nav>` : '';
  mount(app, `${side}<main class="screen"></main>
    <button class="fab" data-act="shell-add" aria-label="Registar movimento">+</button>
    <nav class="tabs">
      <button data-act="shell-tab" data-v="mes">Mês</button>
      <button data-act="shell-tab" data-v="ano">Ano</button>
      <button data-act="shell-tab" data-v="categorias">Categorias</button>
    </nav>`);
  app.classList.toggle('has-side', S.wide);
  const sidebar = app.querySelector('.sidebar');
  S.shell = {
    fab: app.querySelector('.fab'),
    tabs: [...app.querySelectorAll('.tabs button'), ...app.querySelectorAll('.sidebar .nav')],
    who: sidebar?.querySelector('.who') ?? null,
  };
  bindActions(app.querySelector('.tabs'), { 'shell-tab': el => openTab(el.dataset.v) });
  bindActions(S.shell.fab, { 'shell-add': () => go({ name: 'registar', casa: false }) });
  if (sidebar) bindActions(sidebar, {
    'shell-tab': el => openTab(el.dataset.v),
    'shell-add': () => go({ name: 'registar', casa: false }),
  });
}

function openTab(tab) {
  if (tab === 'mes') go({ name: 'mes', ym: S.lastYm, casa: S.lastCasa });
  else if (tab === 'ano') go({ name: 'ano', year: Number(S.lastYm.slice(0, 4)), mode: 'gastos', casa: S.lastCasa });
  else if (tab === 'exportar') go({ name: 'exportar', casa: false });
  else go({ name: 'categorias', casa: false });
}

function makeCtx(route = S.route) {
  return {
    store: S.store, device: S.device, account: S.account, profileId: S.profileId,
    route, go, rerender, demo: DEMO, showError, wide: S.wide,
    // Demo only: lets the UI test show Terminar sessão.
    showSignOut: DEMO && params.get('signout') === '1',
  };
}

const backgroundRoute = () => S.bgRoute ?? currentMonth();
const drawerOpen = () => !!app.querySelector(':scope > .drawer');

// Marks the open tab, hides the + button on the form, shows the open profile in the sidebar.
function drawShell(shown) {
  for (const b of S.shell.tabs) b.classList.toggle('on', b.dataset.v === TAB_OF[shown.name]);
  S.shell.fab.hidden = isForm(S.route);
  if (S.shell.who) {
    const p = S.store.getState().profiles.find(x => x.id === S.profileId);
    S.shell.who.textContent = `Perfil: ${p?.name ?? ''}`;
  }
}

// Renders `route` in a fresh screen root (listeners a screen binds on it never pile up).
function paint(route, keepScroll) {
  const old = app.querySelector(':scope > main.screen');
  const scrollTop = keepScroll ? old.querySelector('.scroll')?.scrollTop ?? 0 : 0;
  const root = document.createElement('main');
  root.className = 'screen';
  old.replaceWith(root);
  const screen = SCREENS[route.name];
  screen.render(makeCtx(route), root);
  if (scrollTop) { const sc = root.querySelector('.scroll'); if (sc) sc.scrollTop = scrollTop; }
  return { screen, root };
}

function openDrawer(route, formRoot) {
  let drawer = app.querySelector(':scope > .drawer');
  if (!drawer) {
    // The backdrop only blocks the screen behind: the drawer closes with Cancelar, Esc or saving.
    const frag = h(`<div class="backdrop"></div>
      <aside class="drawer" role="dialog" aria-modal="true">
        <div class="drawer-hd"><span class="title"></span><button type="button" data-act="drawer-cancel">Cancelar</button></div>
      </aside>`);
    const aside = frag.children[1];
    bindActions(aside.querySelector('.drawer-hd'), { 'drawer-cancel': cancelDrawer });
    // sheets already open (a category sheet) stay above the drawer
    app.querySelector(':scope > .shade') ? app.insertBefore(frag, app.querySelector(':scope > .shade')) : app.append(frag);
    drawer = aside;
  }
  const title = route.name === 'editar' ? 'Editar movimento' : 'Registar movimento';
  drawer.querySelector('.title').textContent = title;
  drawer.setAttribute('aria-label', title);
  const old = drawer.querySelector(':scope > .screen');
  if (old !== formRoot) old ? old.replaceWith(formRoot) : drawer.append(formRoot);
}

function closeDrawer() {
  for (const el of app.querySelectorAll(':scope > .drawer, :scope > .backdrop')) el.remove();
}

// Opened from the screen behind in this session: going back removes the form from the history, so
// Back never reopens an empty drawer. Otherwise (bookmark, reload) the form entry is replaced.
function cancelDrawer() {
  if (S.drawerFromBg) history.back();
  else location.replace(routeHash(backgroundRoute()));
}

// Esc closes the drawer (a sheet open over it handles Esc itself and closes first).
function onKey(e) {
  if (e.key !== 'Escape' || S.stage !== 'app' || !drawerOpen() || app.querySelector(':scope > .shade')) return;
  cancelDrawer();
}

// reuseForm: the root of a form already typed in (window resized), moved instead of re-rendered.
function renderScreen({ keepScroll = false, reuseForm = null } = {}) {
  if (S.stage !== 'app' || !S.shell) return;
  const r = S.route;
  // Exportar Excel exists only on a wide window.
  if (r.name === 'exportar' && !S.wide) { location.replace(routeHash(currentMonth())); return; }
  const form = isForm(r);
  if (form && S.wide) {
    const bg = backgroundRoute();
    drawShell(bg);
    S.screen = paint(bg, keepScroll).screen;
    let root = reuseForm;
    if (!root) {
      root = document.createElement('main');
      root.className = 'screen';
    }
    openDrawer(r, root);
    if (!reuseForm) formScreen.render(makeCtx(r), root);
    S.formRoot = root;
    return;
  }
  closeDrawer();
  drawShell(r);
  if (reuseForm) {
    app.querySelector(':scope > main.screen').replaceWith(reuseForm);
    S.screen = formScreen;
    S.formRoot = reuseForm;
    return;
  }
  const { screen, root } = paint(r, keepScroll);
  S.screen = screen;
  S.formRoot = form ? root : null;
}

// Store updates and screens asking to be redrawn. With the drawer open only the screen behind it
// is redrawn: the form keeps what was typed.
function rerender() {
  if (S.stage === 'app' && S.shell && drawerOpen()) {
    const bg = backgroundRoute();
    drawShell(bg);
    S.screen = paint(bg, true).screen;
  } else renderScreen({ keepScroll: true });
}

function go(route) {
  const hash = routeHash(route);
  if (location.hash === hash) onRoute();
  else location.hash = hash;
}

function onRoute() {
  const prev = S.route;
  S.route = parseRoute(location.hash, todayISO());
  // true when the previous history entry is the route shown behind the drawer
  if (isForm(S.route)) S.drawerFromBg = !isForm(prev) && prev === S.bgRoute;
  remember(S.route);
  renderScreen();
}

// The Mês and Ano tabs go back to the month (and Casa view) last shown; the drawer opens over the
// last route that is not a form.
function remember(route) {
  if (!isForm(route)) S.bgRoute = route;
  if (route.ym) { S.lastYm = route.ym; S.lastCasa = route.casa; }
  else if (route.name === 'ano') S.lastCasa = route.casa;
}

// The window crossed 1024 px: rebuild the shell for the new layout. Other screens are redrawn;
// an open form is moved as it is, so what was typed survives. Open sheets stay open.
function onWide(wide) {
  S.wide = wide;
  document.body.classList.toggle('wide', wide);
  if (S.stage !== 'app' || !S.shell) return;
  const form = isForm(S.route) && S.formRoot?.isConnected ? S.formRoot : null;
  const sheets = [...app.querySelectorAll(':scope > .shade')];
  buildShell();
  app.append(...sheets);
  renderScreen({ reuseForm: form });
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
  document.addEventListener('keydown', onKey);
  document.body.classList.toggle('wide', S.wide);
  onWideChange(onWide);
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
    const store = createMemoryStore(data, showError, { simulatePending: true });
    window.__demo = { store, setPending: v => store.setPending(v) };
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
