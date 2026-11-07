import { parseCents } from './format.js';

const MAX_CENTS = 999999999;

export function lastDay(ym) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${ym}-${String(d).padStart(2, '0')}`;
}

export const hasOpening = p => Number.isInteger(p.openingCents) && !!p.openingDate;

export function balanceAt(moves, profile, ym) {
  const end = lastDay(ym);
  const opening = hasOpening(profile);
  if (opening && end < profile.openingDate) return null;
  let sum = opening ? profile.openingCents : 0;
  for (const m of moves) {
    if (m.profileId !== profile.id || m.date > end) continue;
    if (opening && m.date <= profile.openingDate) continue;
    sum += m.type === 'in' ? m.cents : -m.cents;
  }
  return sum;
}

export function houseBalance(moves, profiles, ym) {
  const split = profiles.map(p => ({ name: p.name, cents: balanceAt(moves, p, ym) }));
  const have = split.filter(s => s.cents !== null);
  return { total: have.length ? have.reduce((a, s) => a + s.cents, 0) : null, split };
}

export function parseSignedCents(text) {
  const t = String(text ?? '').trim();
  const neg = t.startsWith('-') || t.startsWith('−');
  const c = parseCents(neg ? t.slice(1) : t);
  if (c === null || c > MAX_CENTS) return null;
  return neg ? (c === 0 ? 0 : -c) : c;
}

export function validateOpening({ cents, date }, today) {
  if (cents === null || cents === undefined || !Number.isInteger(cents) || Math.abs(cents) > MAX_CENTS) {
    return 'Escreve um valor, por exemplo 1 200,00 ou −50,00.';
  }
  if (!date || date > today) return 'A data não pode ser depois de hoje.';
  return null;
}
