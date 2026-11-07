// Categories screen (route categorias): Saídas and Entradas, profiles, backup, code change, sign-out.
// Sheets live in #app (outside the screen), so a store update never closes them. While a keypad
// is shown in the screen (Mudar código, + Novo perfil), store updates do not re-render it.
import { deletionPlan, sortCategories, validateProfileName } from '../logic/categories.js';
import { buildBackup, parseBackup, backupFileName, INVALID_BACKUP } from '../backup.js';
import { hashPin, verifyPin, lockoutState, registerFailure, registerSuccess, MAX_FAILS } from '../pin.js';
import { openCategorySheet } from './catsheet.js';
import { openOpeningSheet } from './opening.js';
import { hasOpening } from '../logic/balance.js';
import { formatEur } from '../logic/format.js';
import { confirmSheet } from './dialog.js';
import { pinPad, askNewPin } from './pinpad.js';
import { esc, h, mount, bindActions } from './dom.js';
import { signOutBlocked, PENDING_MSG } from '../logic/signout.js';

// Live binding read by main.js: true while a keypad flow is on screen.
export let keepOnUpdate = false;
// True from choosing a file until the import ends: Importar is disabled and other attempts are ignored.
let importing = false;
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

const CANCEL = '<button class="forgot" data-act="cancel">Cancelar</button>';
const initial = name => Array.from(String(name).trim())[0]?.toUpperCase() ?? '?';
const toast = (ctx, msg) => ctx.showError?.(msg);

function catSection(categories, type, title) {
  return `<div class="sect"><h3>${title}</h3><div class="card" style="padding:0 14px">
    ${sortCategories(categories, type).map(c => `<div class="catrow"><span><span class="ic">${esc(c.icon)}</span>${esc(c.name)}${c.savings ? '<span class="tag">poupança</span>' : ''}</span><span class="acts">
      <button data-act="editcat" data-cat="${esc(c.id)}">Editar</button><button class="del" data-act="delcat" data-cat="${esc(c.id)}">Eliminar</button></span></div>`).join('')}
    <div class="catrow" style="border:0"><button class="addcat" data-act="newcat" data-v="${type}">+ Nova categoria</button></div></div></div>`;
}

const ptDate = iso => iso.split('-').reverse().join('/');
function openingRow(p) {
  const has = hasOpening(p);
  return `<div class="openrow"><span class="ol">Saldo inicial</span><span class="ov${has && p.openingCents < 0 ? ' neg' : ''}">${has ? `<span class="nw">${esc(formatEur(p.openingCents))}</span> <span class="nw">em ${esc(ptDate(p.openingDate))}</span>` : 'Não indicado'}</span>
    <button data-act="opening">${has ? 'Alterar' : 'Indicar'}</button></div>`;
}

function view(ctx) {
  const state = ctx.store.getState();
  const me = state.profiles.find(p => p.id === ctx.profileId);
  const email = !ctx.demo ? ctx.account?.currentEmail?.() : null;
  return `<div class="scroll">
    <div class="title" style="font-size:22px">Categorias</div>
    <p class="label" style="margin-top:4px">As categorias são comuns a todos os perfis.</p>
    <div class="ccols"><div class="ccol">
    ${catSection(state.categories, 'out', 'Saídas')}${catSection(state.categories, 'in', 'Entradas')}
    </div><div class="ccol">
    <div class="sect"><h3>Perfis</h3><div class="card" style="padding:0 14px">
      ${state.profiles.map(p => `<div class="catrow"><span><span class="av sm">${esc(initial(p.name))}</span>${esc(p.name)}${p.id === ctx.profileId ? '<span class="tag here">aberto</span>' : ''}</span><span class="acts"><button data-act="renprof" data-v="${esc(p.id)}">Renomear</button></span></div>${p.id === ctx.profileId ? openingRow(p) : ''}`).join('')}
      <div class="catrow" style="border:0"><button class="addcat" data-act="newprof">+ Novo perfil</button></div></div></div>
    <div class="sect"><h3>Cópia de segurança e conta</h3>
      <button class="btn plain" data-act="export">Exportar cópia</button>
      <button class="btn plain" data-act="import"${importing ? ' disabled' : ''}>${importing ? 'A importar…' : 'Importar cópia'}</button>
      <input type="file" accept="application/json,.json" hidden>
      <button class="btn plain" data-act="code">Mudar código de ${esc(me?.name ?? '')}</button>
      ${ctx.demo && !ctx.showSignOut ? '' : `<button class="btn plain" data-act="logout">Terminar sessão</button>
      <p class="label" style="text-align:center;margin-top:8px">Conta da casa: ${esc(email ?? '')}</p>`}
    </div>
    </div></div>
  </div>`;
}

export function render(ctx, root) {
  keepOnUpdate = false;
  mount(root, view(ctx));
  const fileInput = root.querySelector('input[type="file"]');
  fileInput.addEventListener('change', () => importFile(ctx, fileInput));
  bindActions(root, {
    newcat: el => openCategorySheet(ctx, { type: el.dataset.v }),
    editcat: el => {
      const category = ctx.store.getState().categories.find(c => c.id === el.dataset.cat);
      if (category) openCategorySheet(ctx, { category });
    },
    delcat: el => deleteCategory(ctx, el.dataset.cat),
    opening: () => {
      const p = ctx.store.getState().profiles.find(x => x.id === ctx.profileId);
      if (p) openOpeningSheet(ctx, p);
    },
    renprof: el => renameProfile(ctx, el.dataset.v),
    newprof: () => newProfile(ctx, root),
    export: () => exportBackup(ctx),
    import: () => { if (!importing) fileInput.click(); },
    code: () => changeCode(ctx, root),
    logout: () => logout(ctx),
  });
}

// Back to the list after a keypad flow (only if this screen is still the one shown).
function backToList(ctx, root) {
  keepOnUpdate = false;
  if (root.isConnected) ctx.rerender();
}

// ---------- Categories ----------
async function deleteCategory(ctx, catId) {
  const { categories, moves } = ctx.store.getState();
  const cat = categories.find(c => c.id === catId);
  if (!cat) return;
  const plan = deletionPlan(catId, categories, moves);
  if (!plan.allowed) { toast(ctx, plan.reason); return; }
  let target = null;
  if (plan.moveCount === 0) {
    const ok = await confirmSheet({
      message: `Eliminar a categoria "${cat.name}"? Desaparece para todos os perfis.`, ok: 'Eliminar', danger: true,
    });
    if (!ok) return;
  } else {
    target = await pickTarget(cat, plan);
    if (!target) return;
  }
  try {
    await ctx.store.deleteCategory(catId, target);
  } catch (e) {
    toast(ctx, e?.message || 'Não foi possível eliminar. Tenta outra vez.');
  }
}

// Sheet asking where the moves go. Resolves with the chosen category id, or null.
function pickTarget(cat, plan) {
  const n = plan.moveCount;
  return openSheet(`<div class="title">Eliminar ${esc(cat.icon)} ${esc(cat.name)}</div>
    <p>Esta categoria tem ${n} ${n === 1 ? 'movimento' : 'movimentos'}. Para onde os queres passar?</p>
    <div class="chips">${plan.targets.map(o => `<button type="button" class="chip" data-act="move-to" data-cat="${esc(o.id)}"><span class="e">${esc(o.icon)}</span>${esc(o.name)}</button>`).join('')}</div>
    <button type="button" class="btn plain" data-act="sheet-cancel">Cancelar</button>`,
  (act, el, done) => { if (act === 'move-to') done(el.dataset.cat); });
}

// ---------- Sheets ----------
// Generic bottom sheet in #app. onAct(act, el, done, shade) handles every data-act but sheet-cancel.
// A rebuild of #app under it (relock, sign-out) counts as Cancelar.
function openSheet(inner, onAct, { onOpen } = {}) {
  return new Promise(resolve => {
    const host = document.getElementById('app') ?? document.body;
    const shade = h(`<div class="shade" data-act="sheet-cancel"><div class="sheet" role="dialog" aria-modal="true">${inner}</div></div>`).firstElementChild;
    let settled = false;
    const done = value => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      document.removeEventListener('keydown', onKey);
      shade.remove();
      resolve(value);
    };
    const observer = new MutationObserver(() => { if (!shade.isConnected) done(null); });
    const onKey = e => { if (e.key === 'Escape') done(null); };
    shade.addEventListener('click', e => {
      e.stopPropagation();
      const el = e.target.closest('[data-act]');
      if (!el) return;
      if (el.dataset.act === 'sheet-cancel') { if (el !== shade || e.target === shade) done(null); }
      else onAct(el.dataset.act, el, done, shade);
    });
    document.addEventListener('keydown', onKey);
    host.append(shade);
    observer.observe(host, { childList: true });
    onOpen?.(shade, done);
  });
}

// Asks for a profile name. Resolves with the trimmed name, or null.
function askProfileName(ctx, { title, value = '', editingId = null }) {
  let input, errBox;
  const save = done => {
    const problem = validateProfileName(input.value, ctx.store.getState().profiles, editingId);
    if (problem) { errBox.textContent = problem; return; }
    done(input.value.trim());
  };
  return openSheet(`<div class="title">${esc(title)}</div>
    <div class="card namein"><input id="profname" placeholder="Nome do perfil" value="${esc(value)}" maxlength="30" autocomplete="off"></div>
    <div class="error" role="alert"></div>
    <button type="button" class="btn" data-act="sheet-save" style="margin-top:6px">Guardar</button>
    <button type="button" class="btn plain" data-act="sheet-cancel">Cancelar</button>`,
  (act, el, done) => { if (act === 'sheet-save') save(done); },
  { onOpen(shade, done) {
    input = shade.querySelector('#profname');
    errBox = shade.querySelector('.error');
    input.addEventListener('input', () => { errBox.textContent = ''; });
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); save(done); } });
    input.focus();
  } });
}

// ---------- Profiles ----------
async function renameProfile(ctx, pid) {
  const p = ctx.store.getState().profiles.find(x => x.id === pid);
  if (!p) return;
  const name = await askProfileName(ctx, { title: 'Renomear perfil', value: p.name, editingId: pid });
  if (name === null || name === p.name) return;
  try {
    await ctx.store.updateProfile(pid, { name });
  } catch (e) {
    toast(ctx, e?.message || 'Não foi possível guardar. Tenta outra vez.');
  }
}

async function newProfile(ctx, root) {
  const name = await askProfileName(ctx, { title: 'Novo perfil' });
  if (name === null || !root.isConnected) return;
  keepOnUpdate = true;
  const pinDone = askNewPin(root, { title: name, actions: CANCEL });
  bindActions(root.querySelector('.lockacts'), { cancel: () => backToList(ctx, root) });
  const pin = await pinDone;
  if (!root.isConnected) return;
  try {
    // The name may have been taken on the other device in the meantime.
    const problem = validateProfileName(name, ctx.store.getState().profiles);
    if (problem) throw new Error(problem);
    await ctx.store.addProfile({ name, ...(await hashPin(pin)) });
  } catch (e) {
    toast(ctx, e?.message || 'Não foi possível guardar. Tenta outra vez.');
  }
  backToList(ctx, root);
}

// ---------- Mudar código: current code (same lockout as the lock screen), then the new one twice ----------
function changeCode(ctx, root) {
  const pid = ctx.profileId;
  const profile = () => ctx.store.getState().profiles.find(p => p.id === pid);
  if (!profile()) return;
  const name = profile().name;
  keepOnUpdate = true;
  const pad = pinPad(root, {
    title: name,
    subtitle: 'Introduz o código atual',
    actions: CANCEL,
    async onComplete(pin) {
      const wait = lockoutState(ctx.device.lock(pid), Date.now());
      if (wait.blocked) { pad.setBlocked(wait.waitSeconds); return null; }
      if (await verifyPin(pin, profile())) {
        pad.freeze();
        ctx.device.setLock(pid, registerSuccess());
        askNew();
        return null;
      }
      const rec = registerFailure(ctx.device.lock(pid), Date.now());
      ctx.device.setLock(pid, rec);
      const now = lockoutState(rec, Date.now());
      if (now.blocked) { pad.setBlocked(now.waitSeconds); return null; }
      const left = MAX_FAILS - rec.fails;
      return `Código errado. ${left === 1 ? 'Resta 1 tentativa' : `Restam ${left} tentativas`}.`;
    },
  });
  const wait = lockoutState(ctx.device.lock(pid), Date.now());
  if (wait.blocked) pad.setBlocked(wait.waitSeconds);
  bindActions(pad.el.querySelector('.lockacts'), { cancel: () => backToList(ctx, root) });

  async function askNew() {
    if (!root.isConnected) return;
    const pinDone = askNewPin(root, { title: name, actions: CANCEL });
    bindActions(root.querySelector('.lockacts'), { cancel: () => backToList(ctx, root) });
    const pin = await pinDone;
    if (!root.isConnected) return;
    try {
      await ctx.store.updateProfile(pid, await hashPin(pin));
      toast(ctx, 'Código alterado.');
    } catch (e) {
      toast(ctx, e?.message || 'Não foi possível guardar. Tenta outra vez.');
    }
    backToList(ctx, root);
  }
}

// ---------- Backup ----------
async function exportBackup(ctx) {
  const name = backupFileName();
  const text = JSON.stringify(buildBackup(ctx.store.getState()), null, 2);
  const file = new File([text], name, { type: 'application/json' });
  // Share sheet on the iPhone; the Mac (no touch) downloads the file, even if it could share.
  if (navigator.maxTouchPoints > 0 && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e?.name !== 'AbortError') toast(ctx, 'Não foi possível partilhar a cópia. Tenta outra vez.');
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function importFile(ctx, input) {
  const file = input.files?.[0];
  input.value = ''; // the same file can be chosen again
  if (!file || importing) return;
  const showBusy = on => {
    importing = on;
    const btn = document.querySelector('main.screen [data-act="import"]');
    if (btn) { btn.disabled = on; btn.textContent = on ? 'A importar…' : 'Importar cópia'; }
  };
  showBusy(true);
  try {
    let parsed = null;
    if (file.size <= MAX_BACKUP_BYTES) {
      try { parsed = parseBackup(await file.text()); } catch { parsed = null; }
    }
    if (!parsed?.ok) { toast(ctx, INVALID_BACKUP); return; }
    const n = parsed.moveCount;
    const ok = await confirmSheet({
      message: `A cópia tem ${n} ${n === 1 ? 'movimento' : 'movimentos'}. Importar substitui todos os dados atuais, em todos os aparelhos.`,
      ok: 'Importar', danger: true,
    });
    if (!ok) return;
    try {
      // If the open profile is not in the copy, main.js sends the user to the profile picker.
      await ctx.store.replaceAll(parsed.data);
      toast(ctx, 'Cópia importada.');
    } catch (e) {
      toast(ctx, e?.message || 'Não foi possível importar. Tenta outra vez.');
    }
  } finally {
    // The screen may have been re-rendered meanwhile, so the button is looked up again.
    showBusy(false);
  }
}

// ---------- Sign-out ----------
async function logout(ctx) {
  if (signOutBlocked(ctx.store)) { toast(ctx, PENDING_MSG); return; }
  const ok = await confirmSheet({ message: 'Terminar sessão neste aparelho?', ok: 'Terminar sessão' });
  if (!ok) return;
  try {
    ctx.device.setLastProfile(null);
    // Signs out, clears this device's copy of the data and reloads the page.
    await ctx.account.logoutAndWipe();
  } catch (e) {
    toast(ctx, e?.message || 'Não foi possível terminar a sessão. Tenta outra vez.');
  }
}
