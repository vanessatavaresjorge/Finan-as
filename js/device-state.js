// Per-device state (last profile, lockout counters) over localStorage.
export function createDeviceState(storage = globalThis.localStorage) {
  const read = (key) => {
    try {
      const raw = storage.getItem(key);
      return raw == null ? null : JSON.parse(raw);
    } catch {
      return null;
    }
  };
  // A full or unavailable storage must never block unlocking.
  const write = (fn) => {
    try { fn(); } catch { /* ignore */ }
  };
  return {
    lastProfile() {
      const v = read('fin.lastProfile');
      return typeof v === 'string' ? v : null;
    },
    setLastProfile(id) {
      write(() => {
        if (id == null) storage.removeItem('fin.lastProfile');
        else storage.setItem('fin.lastProfile', JSON.stringify(id));
      });
    },
    lock(pid) {
      const v = read(`fin.lock.${pid}`);
      return v && typeof v === 'object' ? v : null;
    },
    setLock(pid, rec) {
      write(() => storage.setItem(`fin.lock.${pid}`, JSON.stringify(rec)));
    },
  };
}
