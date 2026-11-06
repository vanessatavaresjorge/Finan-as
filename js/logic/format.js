const NBSP = ' ';
const MINUS = '−';
const MAX_CENTS = 999999999;

export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MONTH_INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export function formatEur(cents) {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const euros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const dec = String(abs % 100).padStart(2, '0');
  return `${neg ? MINUS : ''}${euros},${dec}${NBSP}€`;
}

export function formatPct(rate) {
  if (rate === null || rate === undefined || Number.isNaN(rate)) return '—';
  const n = Math.round(rate * 100);
  return `${n < 0 ? MINUS : ''}${Math.abs(n)}%`;
}

export function parseCents(text) {
  let t = String(text ?? '').replace(/[\s €]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (t.includes('.') && !/^\d+\.\d{1,2}$/.test(t)) return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
}

export function validateAmount(cents) {
  if (cents === null || cents === undefined || !(cents > 0)) return 'Escreve um valor maior que zero.';
  if (cents > MAX_CENTS) return `O valor máximo é ${formatEur(MAX_CENTS)}.`;
  return null;
}

export function centsToInput(cents) {
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, '0')}`;
}

export function todayISO(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function shortDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function monthTitle(ym) {
  const [y, m] = ym.split('-').map(Number);
  const name = MONTHS[m - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${y}`;
}

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}
