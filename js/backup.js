import { todayISO } from './logic/format.js';
import { hasOpening } from './logic/balance.js';
import { GROUPS, groupOf, withGroup } from './logic/groups.js';

export const INVALID_BACKUP = 'Este ficheiro não é uma cópia de segurança válida desta app.';

export function buildBackup({ profiles, categories, moves }, now = new Date()) {
  return {
    format: 1,
    exportedAt: now.toISOString(),
    profiles: profiles.map((p) => (hasOpening(p)
      ? { id: p.id, name: p.name, openingCents: p.openingCents, openingDate: p.openingDate }
      : { id: p.id, name: p.name })),
    categories: categories.map(c => (c.type === 'out' ? withGroup(c) : c)),
    moves,
  };
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
// Ids become Firestore document ids: no '/', '.', '..' or reserved '__x__' names.
const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) && !/^__.*__$/.test(v);

function isRealDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function validate(raw) {
  if (!isObj(raw) || raw.format !== 1) return null;
  if (!Array.isArray(raw.profiles) || !Array.isArray(raw.categories) || !Array.isArray(raw.moves)) return null;

  const profiles = [];
  const profileIds = new Set();
  for (const p of raw.profiles) {
    if (!isObj(p) || !isId(p.id) || !isStr(p.name) || profileIds.has(p.id)) return null;
    profileIds.add(p.id);
    const hasC = p.openingCents != null, hasD = p.openingDate != null;
    if (hasC !== hasD) return null;
    if (hasC && (!Number.isInteger(p.openingCents) || Math.abs(p.openingCents) > 999999999 || !isRealDate(p.openingDate))) return null;
    profiles.push(hasC ? { id: p.id, name: p.name, openingCents: p.openingCents, openingDate: p.openingDate } : { id: p.id, name: p.name });
  }

  const categories = [];
  const catType = new Map();
  for (const c of raw.categories) {
    if (!isObj(c) || !isId(c.id) || !isStr(c.name) || !isStr(c.icon) || catType.has(c.id)) return null;
    if (c.type !== 'out' && c.type !== 'in') return null;
    if (typeof c.savings !== 'boolean' || !Number.isFinite(c.order)) return null;
    if (c.group !== undefined && (c.type !== 'out' || !GROUPS.includes(c.group))) return null;
    catType.set(c.id, c.type);
    const cat = { id: c.id, name: c.name, type: c.type, icon: c.icon, savings: c.savings, order: c.order };
    if (c.group !== undefined) cat.group = c.group;
    categories.push(cat);
  }
  const types = new Set(catType.values());
  if (!types.has('out') || !types.has('in')) return null;

  const moves = [];
  const moveIds = new Set();
  for (const m of raw.moves) {
    if (!isObj(m) || !isId(m.id) || moveIds.has(m.id)) return null;
    if (!profileIds.has(m.profileId) || !isId(m.categoryId)) return null;
    // A move may reference a deleted category (shown as "Sem categoria"); only check type when known.
    if (catType.has(m.categoryId) && m.type !== catType.get(m.categoryId)) return null;
    if (m.type !== 'out' && m.type !== 'in') return null;
    if (!Number.isInteger(m.cents) || m.cents < 1 || m.cents > 999999999) return null;
    if (!isRealDate(m.date) || typeof m.note !== 'string' || !Number.isFinite(m.createdAt)) return null;
    moveIds.add(m.id);
    moves.push({ id: m.id, profileId: m.profileId, type: m.type, cents: m.cents, categoryId: m.categoryId,
                 date: m.date, note: m.note, createdAt: m.createdAt });
  }
  return { profiles, categories, moves };
}

export function parseBackup(text) {
  try {
    const data = validate(JSON.parse(text));
    if (data) return { ok: true, data, moveCount: data.moves.length };
  } catch { /* fall through */ }
  return { ok: false, error: INVALID_BACKUP };
}

export function mergeProfilesForImport(existing, incoming) {
  return incoming.map(({ id, name, openingCents, openingDate }) => {
    const old = existing.find((p) => p.id === id);
    return {
      id, name,
      pinHash: old ? old.pinHash : null,
      pinSalt: old ? old.pinSalt : null,
      pinIter: old ? old.pinIter : null,
      openingCents: openingCents ?? null,
      openingDate: openingDate ?? null,
    };
  });
}

export function backupFileName(now = new Date()) {
  return `financas-copia-${todayISO(now)}.json`;
}
