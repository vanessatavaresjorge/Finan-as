// Firestore store: same interface and semantics as store-memory.js.
// Writes are not awaited: Firestore applies them to the local cache at once (the
// listeners below see them immediately) and sends them when there is a connection.
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, getDocsFromServer,
} from 'https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js';
import { DEFAULT_CATEGORIES, nextOrder } from './logic/categories.js';
import { mergeProfilesForImport } from './backup.js';
import { authMessage } from './logic/messages.js';

const GONE = 'Este registo já não existe.';
const PICK = 'Escolhe para onde passar os movimentos.';
const OFFLINE = 'Precisas de internet para importar.';
const COLS = ['profiles', 'categories', 'moves'];
const CHUNK = 450;
const clone = x => structuredClone(x);

// Document data: everything except `id` (the doc id) and undefined values (Firestore refuses them).
function fieldsOf(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (k !== 'id' && v !== undefined) out[k] = v;
  return out;
}

export function createFirestoreStore(db, uid, onError = () => {}) {
  const col = name => collection(db, 'users', uid, name);
  const ref = (name, id) => doc(db, 'users', uid, name, id);
  const report = e => onError(authMessage(e?.code));

  const data = { profiles: [], categories: [], moves: [] };
  const seen = { profiles: false, categories: false, moves: false };
  const pendingIn = { profiles: false, categories: false, moves: false };
  let categoriesFromServer = false;
  let seedWanted = false;
  let nextLocalOrder = 0;
  // Ids added here that no snapshot has shown yet, so an update right after an add works.
  const created = new Set();
  const subs = new Set();

  const snapshot = () => ({
    profiles: clone(data.profiles),
    categories: clone(data.categories).sort((a, b) => a.order - b.order),
    moves: clone(data.moves),
    pending: COLS.some(c => pendingIn[c]),
    ready: COLS.every(c => seen[c]),
  });
  const notify = () => { const s = snapshot(); for (const fn of [...subs]) fn(s); };

  const must = (name, id) => {
    if (!created.has(id) && !data[name].some(x => x.id === id)) throw new Error(GONE);
  };

  // Commits every chunk right away (not one after the other), so offline each chunk
  // still applies to the local cache at once. Resolves when all are committed.
  const commitChunks = ops => {
    const commits = [];
    for (let i = 0; i < ops.length; i += CHUNK) {
      const batch = writeBatch(db);
      for (const op of ops.slice(i, i + CHUNK)) op(batch);
      commits.push(batch.commit());
    }
    return Promise.all(commits);
  };

  // Seeds only when the server confirms the categories are empty: an empty local
  // cache (first opening offline) must never overwrite categories already in the account.
  function maybeSeed() {
    if (!seedWanted || !seen.categories || !categoriesFromServer) return;
    seedWanted = false;
    if (data.categories.length) return;
    for (const c of DEFAULT_CATEGORIES) setDoc(ref('categories', c.id), fieldsOf(c)).catch(report);
  }

  const unsubs = COLS.map(name => onSnapshot(col(name), { includeMetadataChanges: true }, snap => {
    data[name] = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    for (const d of snap.docs) created.delete(d.id);
    seen[name] = true;
    pendingIn[name] = snap.metadata.hasPendingWrites;
    if (name === 'categories') {
      categoriesFromServer = !snap.metadata.fromCache;
      maybeSeed();
    }
    notify();
  }, report));

  const add = (name, fields) => {
    const r = doc(col(name));
    created.add(r.id);
    setDoc(r, fieldsOf(fields)).catch(report);
    return r.id;
  };
  const update = (name, id, patch) => {
    must(name, id);
    const fields = fieldsOf(patch);
    if (Object.keys(fields).length) updateDoc(ref(name, id), fields).catch(report);
  };

  return {
    subscribe(fn) {
      subs.add(fn);
      fn(snapshot());
      return () => subs.delete(fn);
    },
    getState: snapshot,

    addMove(fields) {
      return add('moves', { ...fields, createdAt: Date.now() });
    },
    updateMove(id, patch) { update('moves', id, patch); },
    deleteMove(id) {
      must('moves', id);
      created.delete(id);
      deleteDoc(ref('moves', id)).catch(report);
    },

    addCategory(fields) {
      const order = fields.order ?? Math.max(nextOrder(data.categories), nextLocalOrder);
      nextLocalOrder = Math.max(nextLocalOrder, order + 1);
      return add('categories', { ...fields, order });
    },
    updateCategory(id, patch) { update('categories', id, patch); },
    deleteCategory(id, targetId) {
      must('categories', id);
      const using = data.moves.filter(m => m.categoryId === id);
      if (targetId == null) {
        if (using.length) throw new Error(PICK);
      } else if (targetId === id || !data.categories.some(c => c.id === targetId)) {
        throw new Error(PICK);
      }
      const ops = using.map(m => b => b.update(ref('moves', m.id), { categoryId: targetId }));
      ops.push(b => b.delete(ref('categories', id)));
      created.delete(id);
      commitChunks(ops).catch(report);
    },

    addProfile({ name, pinHash, pinSalt, pinIter }) {
      return add('profiles', { name, pinHash: pinHash ?? null, pinSalt: pinSalt ?? null, pinIter: pinIter ?? null });
    },
    updateProfile(id, patch) { update('profiles', id, patch); },

    seedDefaults() {
      seedWanted = true;
      maybeSeed();
    },

    async replaceAll(input) {
      if (!navigator.onLine) throw new Error(OFFLINE);
      const asError = e => new Error(authMessage(e?.code));
      let server;
      try {
        server = await Promise.all(COLS.map(name => getDocsFromServer(col(name))));
      } catch (e) { throw asError(e); }
      const existing = Object.fromEntries(COLS.map((name, i) =>
        [name, server[i].docs.map(d => ({ ...d.data(), id: d.id }))]));
      const next = {
        profiles: mergeProfilesForImport(existing.profiles, input.profiles ?? []),
        categories: input.categories ?? [],
        moves: input.moves ?? [],
      };
      const ops = [];
      for (const name of COLS) {
        const keep = new Set(next[name].map(x => x.id));
        // also local writes not yet on the server
        const old = new Set([...existing[name], ...data[name]].map(x => x.id));
        for (const id of old) if (!keep.has(id)) ops.push(b => b.delete(ref(name, id)));
        for (const item of next[name]) ops.push(b => b.set(ref(name, item.id), fieldsOf(item)));
      }
      try {
        await commitChunks(ops);
      } catch (e) { throw asError(e); }
    },

    stop() {
      for (const u of unsubs) u();
      subs.clear();
    },
  };
}
