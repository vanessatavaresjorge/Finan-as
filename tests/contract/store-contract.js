// Shared store cases: run in Node (memory store) and in the browser (Firestore store).
// No imports: only the `assert` object passed in (equal, deepEqual, ok).

export function waitFor(store, predicate, ms = 10000) {
  return new Promise((resolve, reject) => {
    let done = false;
    let unsub = () => {};
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); unsub(); fn(v); };
    const timer = setTimeout(
      () => finish(reject, new Error(`waitFor: o estado esperado não chegou em ${ms} ms`)), ms);
    const check = state => { if (predicate(state)) finish(resolve, state); };
    unsub = store.subscribe(check);
    if (done) unsub();
    else check(store.getState());
  });
}

const byId = (list, id) => list.find(x => x.id === id);
const sortById = list => [...list].sort((a, b) => (a.id < b.id ? -1 : 1));
const mvFields = (profileId, categoryId, cents, date = '2026-11-02') =>
  ({ profileId, type: 'out', cents, categoryId, date, note: '' });

export const CASES = [
  { name: 'seedDefaults on empty store writes 10 categories, and only once',
    run: async (store, assert) => {
      store.seedDefaults();
      await waitFor(store, s => s.categories.length === 10);
      store.seedDefaults();
      await new Promise(r => setTimeout(r, 50));
      const s = await waitFor(store, st => st.categories.length === 10);
      assert.equal(s.categories[0].id, 'carro');
      assert.equal(s.categories[9].id, 'outros');
    } },

  { name: 'addMove, updateMove and deleteMove',
    run: async (store, assert) => {
      const p = store.addProfile({ name: 'Ana', pinHash: null, pinSalt: null, pinIter: null });
      const id = store.addMove(mvFields(p, 'carro', 1500));
      const s1 = await waitFor(store, s => byId(s.moves, id));
      const m = byId(s1.moves, id);
      assert.equal(typeof m.createdAt, 'number');
      assert.equal(m.cents, 1500);
      store.updateMove(id, { cents: 2500 });
      await waitFor(store, s => byId(s.moves, id)?.cents === 2500);
      store.deleteMove(id);
      await waitFor(store, s => !byId(s.moves, id));
    } },

  { name: 'addCategory assigns the next order; updateCategory edits',
    run: async (store, assert) => {
      const a = store.addCategory({ name: 'A', type: 'out', icon: '🚗', savings: false });
      const b = store.addCategory({ name: 'B', type: 'in', icon: '💼', savings: false });
      const s = await waitFor(store, st => st.categories.length === 2);
      assert.deepEqual(s.categories.map(c => c.id), [a, b]);
      assert.ok(s.categories[1].order > s.categories[0].order);
      store.updateCategory(a, { name: 'A2', savings: true });
      await waitFor(store, st => byId(st.categories, a)?.name === 'A2' && byId(st.categories, a).savings === true);
    } },

  { name: 'deleteCategory moves every profile\'s moves to the target',
    run: async (store, assert) => {
      store.seedDefaults();
      await waitFor(store, s => s.categories.length === 10);
      const pa = store.addProfile({ name: 'Ana', pinHash: null, pinSalt: null, pinIter: null });
      const pb = store.addProfile({ name: 'Rui', pinHash: null, pinSalt: null, pinIter: null });
      const ids = [
        store.addMove(mvFields(pa, 'carro', 100)),
        store.addMove(mvFields(pb, 'carro', 200)),
        store.addMove(mvFields(pa, 'saude', 300)),
      ];
      await waitFor(store, s => s.moves.length === 3);
      store.deleteCategory('carro', 'lazer');
      const s = await waitFor(store, st => !byId(st.categories, 'carro')
        && byId(st.moves, ids[0])?.categoryId === 'lazer' && byId(st.moves, ids[1])?.categoryId === 'lazer');
      assert.equal(byId(s.moves, ids[2]).categoryId, 'saude');
    } },

  { name: 'deleteCategory without target throws when moves use it',
    run: async (store, assert) => {
      store.seedDefaults();
      await waitFor(store, s => s.categories.length === 10);
      const p = store.addProfile({ name: 'Ana', pinHash: null, pinSalt: null, pinIter: null });
      store.addMove(mvFields(p, 'carro', 100));
      await waitFor(store, s => s.moves.length === 1);
      let msg = null;
      try { store.deleteCategory('carro', null); } catch (e) { msg = e.message; }
      assert.equal(msg, 'Escolhe para onde passar os movimentos.');
      store.deleteCategory('lazer', null);
      await waitFor(store, s => !byId(s.categories, 'lazer'));
    } },

  { name: 'deleteCategory refuses a target that is itself or does not exist',
    run: async (store, assert) => {
      store.seedDefaults();
      await waitFor(store, s => s.categories.length === 10);
      const p = store.addProfile({ name: 'Ana', pinHash: null, pinSalt: null, pinIter: null });
      const id = store.addMove(mvFields(p, 'carro', 100));
      await waitFor(store, s => byId(s.moves, id));
      const thrown = fn => { try { fn(); } catch (e) { return e.message; } return null; };
      const msg = 'Escolhe para onde passar os movimentos.';
      assert.equal(thrown(() => store.deleteCategory('carro', 'carro')), msg);
      assert.equal(thrown(() => store.deleteCategory('carro', 'nope')), msg);
      const s = store.getState();
      assert.ok(byId(s.categories, 'carro'));
      assert.equal(byId(s.moves, id).categoryId, 'carro');
    } },

  { name: 'addProfile and updateProfile rename',
    run: async (store, assert) => {
      const id = store.addProfile({ name: 'Ana', pinHash: 'h', pinSalt: 's', pinIter: 100000 });
      const s = await waitFor(store, st => byId(st.profiles, id));
      assert.equal(byId(s.profiles, id).pinHash, 'h');
      store.updateProfile(id, { name: 'Ana B' });
      const s2 = await waitFor(store, st => byId(st.profiles, id)?.name === 'Ana B');
      assert.equal(byId(s2.profiles, id).pinSalt, 's');
    } },

  { name: 'replaceAll replaces data and keeps pin of profiles with the same id',
    run: async (store, assert) => {
      const keep = store.addProfile({ name: 'Ana', pinHash: 'h', pinSalt: 's', pinIter: 100000 });
      const gone = store.addProfile({ name: 'Sai', pinHash: 'x', pinSalt: 'y', pinIter: 1 });
      store.addCategory({ name: 'Velha', type: 'out', icon: '🚗', savings: false });
      await waitFor(store, s => s.profiles.length === 2 && s.categories.length === 1);
      const cats = [
        { id: 'c1', name: 'Um', type: 'out', icon: '🚗', savings: false, order: 0 },
        { id: 'c2', name: 'Dois', type: 'in', icon: '💼', savings: false, order: 1 }];
      const moves = [
        { id: 'm1', profileId: keep, type: 'out', cents: 500, categoryId: 'c1', date: '2026-11-01', note: 'a', createdAt: 1 },
        { id: 'm2', profileId: 'novo', type: 'in', cents: 900, categoryId: 'c2', date: '2026-11-02', note: '', createdAt: 2 }];
      await store.replaceAll({
        profiles: [{ id: keep, name: 'Ana Nova' }, { id: 'novo', name: 'Rui' }],
        categories: cats, moves });
      const s = await waitFor(store, st => byId(st.profiles, 'novo') && !byId(st.profiles, gone)
        && byId(st.profiles, keep)?.name === 'Ana Nova'
        && st.categories.length === 2 && byId(st.categories, 'c1') && byId(st.categories, 'c2')
        && st.moves.length === 2 && byId(st.moves, 'm1') && byId(st.moves, 'm2'));
      assert.deepEqual(s.categories, cats);
      assert.deepEqual(sortById(s.moves), moves);
      const p = byId(s.profiles, keep);
      assert.equal(p.name, 'Ana Nova');
      assert.equal(p.pinHash, 'h');
      assert.equal(byId(s.profiles, 'novo').pinHash, null);
    } },

  { name: 'mutations on a missing id throw',
    run: async (store, assert) => {
      const msg = 'Este registo já não existe.';
      const thrown = fn => { try { fn(); } catch (e) { return e.message; } return null; };
      assert.equal(thrown(() => store.updateMove('nope', { cents: 1 })), msg);
      assert.equal(thrown(() => store.deleteMove('nope')), msg);
      assert.equal(thrown(() => store.updateCategory('nope', { name: 'x' })), msg);
      assert.equal(thrown(() => store.updateProfile('nope', { name: 'x' })), msg);
    } },

  { name: 'subscribe notifies after mutations, reports ready, and unsubscribes',
    run: async (store, assert) => {
      const states = [];
      const unsub = store.subscribe(s => states.push(s));
      await waitFor(store, s => s.ready === true);
      const before = states.length;
      store.addProfile({ name: 'Ana', pinHash: null, pinSalt: null, pinIter: null });
      await waitFor(store, s => s.profiles.length === 1);
      assert.ok(states.length > before);
      assert.equal(states[states.length - 1].profiles.length, 1);
      unsub();
      const n = states.length;
      store.addProfile({ name: 'Rui', pinHash: null, pinSalt: null, pinIter: null });
      await waitFor(store, s => s.profiles.length === 2);
      assert.equal(states.length, n);
    } },
];
