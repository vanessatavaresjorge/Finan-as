import { DEFAULT_CATEGORIES, nextOrder } from './logic/categories.js';
import { mergeProfilesForImport } from './backup.js';

const GONE = 'Este registo já não existe.';
const clone = x => structuredClone(x);

// options.simulatePending (demo only) adds setPending(bool) to fake queued, unsent changes.
export function createMemoryStore(initial = {}, onError = () => {}, options = {}) {
  let profiles = clone(initial.profiles ?? []);
  let categories = clone(initial.categories ?? []);
  let moves = clone(initial.moves ?? []);
  const subs = new Set();
  let pending = false;

  const snapshot = () => ({
    profiles: clone(profiles),
    categories: clone(categories).sort((a, b) => a.order - b.order),
    moves: clone(moves),
    pending,
    ready: true,
  });
  const notify = () => { for (const fn of [...subs]) fn(snapshot()); };
  const find = (list, id) => {
    const item = list.find(x => x.id === id);
    if (!item) throw new Error(GONE);
    return item;
  };
  const patchItem = (list, id, patch) => { Object.assign(find(list, id), clone(patch), { id }); notify(); };

  return {
    ...(options.simulatePending ? { setPending(v) { pending = !!v; notify(); } } : {}),
    subscribe(fn) {
      subs.add(fn);
      fn(snapshot());
      return () => subs.delete(fn);
    },
    getState: snapshot,

    addMove(fields) {
      const id = crypto.randomUUID();
      moves.push({ ...clone(fields), id, createdAt: Date.now() });
      notify();
      return id;
    },
    updateMove(id, patch) { patchItem(moves, id, patch); },
    deleteMove(id) {
      find(moves, id);
      moves = moves.filter(m => m.id !== id);
      notify();
    },

    addCategory(fields) {
      const id = crypto.randomUUID();
      categories.push({ ...clone(fields), id, order: fields.order ?? nextOrder(categories) });
      notify();
      return id;
    },
    updateCategory(id, patch) { patchItem(categories, id, patch); },
    deleteCategory(id, targetId) {
      find(categories, id);
      const pick = 'Escolhe para onde passar os movimentos.';
      if (targetId == null) {
        if (moves.some(m => m.categoryId === id)) throw new Error(pick);
      } else {
        if (targetId === id || !categories.some(c => c.id === targetId)) throw new Error(pick);
        for (const m of moves) if (m.categoryId === id) m.categoryId = targetId;
      }
      categories = categories.filter(c => c.id !== id);
      notify();
    },

    addProfile({ name, pinHash, pinSalt, pinIter }) {
      const id = crypto.randomUUID();
      profiles.push({ id, name, pinHash, pinSalt, pinIter });
      notify();
      return id;
    },
    updateProfile(id, patch) { patchItem(profiles, id, patch); },

    seedDefaults() {
      if (categories.length) return;
      categories = clone(DEFAULT_CATEGORIES);
      notify();
    },

    async replaceAll(data) {
      profiles = mergeProfilesForImport(profiles, data.profiles);
      categories = clone(data.categories);
      moves = clone(data.moves);
      notify();
    },

    stop() { subs.clear(); },
  };
}
