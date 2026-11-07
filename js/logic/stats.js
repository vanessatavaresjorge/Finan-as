import { balanceAt, houseBalance } from './balance.js';
import { todayISO } from './format.js';

export function categoryOf(categories, id, type = 'out') {
  return categories.find(c => c.id === id)
    || { id, name: 'Sem categoria', icon: '❔', type, savings: false };
}

export function periodStats(moves, categories, prefix, pred = () => true) {
  let inn = 0, out = 0, inv = 0;
  for (const m of moves) {
    if (!m.date.startsWith(prefix) || !pred(m)) continue;
    if (m.type === 'in') inn += m.cents;
    else {
      out += m.cents;
      if (categoryOf(categories, m.categoryId, m.type).savings) inv += m.cents;
    }
  }
  const saved = inn - out + inv;
  return { inn, out, inv, saved, rate: inn > 0 ? saved / inn : null };
}

function balanceModel(moves, profiles, view, ym) {
  if (view === 'casa') {
    const h = houseBalance(moves, profiles, ym);
    return { total: h.total, split: h.split, hasOpening: profiles.length > 0 && profiles.every(p => Number.isInteger(p.openingCents) && !!p.openingDate) };
  }
  const p = profiles.find(x => x.id === view);
  return { total: p ? balanceAt(moves, p, ym) : null, split: null, hasOpening: !!p && Number.isInteger(p.openingCents) && !!p.openingDate };
}

export function monthModel({ moves, categories, profiles, ym, view }) {
  const casa = view === 'casa';
  const inView = m => casa || m.profileId === view;
  const s = periodStats(moves, categories, ym, inView);
  const totals = { ...s, left: s.inn - s.out };

  const split = casa ? profiles.map(p => {
    const t = periodStats(moves, categories, ym, m => m.profileId === p.id);
    return { profileId: p.id, name: p.name, inn: t.inn, out: t.out, left: t.inn - t.out, saved: t.saved, rate: t.rate };
  }) : null;

  const monthMoves = moves.filter(m => m.date.startsWith(ym) && inView(m));
  const byCat = new Map();
  for (const m of monthMoves) {
    if (m.type !== 'out') continue;
    const e = byCat.get(m.categoryId) || { cents: 0, byProfile: {} };
    e.cents += m.cents;
    e.byProfile[m.profileId] = (e.byProfile[m.profileId] || 0) + m.cents;
    byCat.set(m.categoryId, e);
  }
  const rows = [...byCat].sort((a, b) => b[1].cents - a[1].cents);
  const largest = rows.length ? rows[0][1].cents : 0;
  const cats = rows.map(([id, e]) => {
    const c = categoryOf(categories, id);
    return {
      id, name: c.name, icon: c.icon, savings: c.savings, cents: e.cents,
      pct: Math.round(e.cents / totals.out * 100),
      barPct: e.cents / largest * 100,
      split: casa ? profiles.map(p => ({ name: p.name, cents: e.byProfile[p.id] || 0 })) : null,
    };
  });

  const list = casa ? null : monthMoves
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .map(m => {
      const c = categoryOf(categories, m.categoryId, m.type);
      return { id: m.id, type: m.type, cents: m.cents, date: m.date, note: m.note,
        categoryId: m.categoryId, icon: c.icon, categoryName: c.name };
    });

  return { totals, split, categories: cats, moves: list, balance: balanceModel(moves, profiles, view, ym) };
}

export function niceScale(maxCents) {
  const max = Math.max(maxCents / 100, 1), raw = max / 3;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * p).find(s => s >= raw);
  const top = Math.ceil(max / step) * step;
  return { step: Math.round(step * 100), top: Math.round(top * 100) };
}

export function percentScale(rates) {
  const pct = rates.filter(r => r !== null && r !== undefined).map(r => Math.round(r * 1e8) / 1e6);
  const hi = pct.length ? Math.max(...pct) : 0;
  const lo = pct.length ? Math.min(...pct) : 0;
  return {
    min: Math.min(0, Math.floor(lo / 50) * 50),
    max: Math.max(100, Math.ceil(hi / 50) * 50),
    step: 50,
  };
}

export function yearModel({ moves, categories, profiles, year, view, mode, filter = 'all', today = todayISO() }) {
  const casa = view === 'casa';
  const inView = m => casa || m.profileId === view;
  const yp = `${year}-`;
  const mp = i => `${year}-${String(i + 1).padStart(2, '0')}`;
  const idx = [...Array(12).keys()];
  const nowYm = today.slice(0, 7);
  const balance = balanceModel(moves, profiles, view, nowYm.startsWith(yp) ? nowYm : `${year}-12`);

  if (mode === 'poupanca') {
    const stats = (prefix, pred) => periodStats(moves, categories, prefix, pred);
    const months = idx.map(i => {
      const s = stats(mp(i), inView);
      return s.rate === null ? null : { saved: s.saved, rate: s.rate };
    });
    const y = stats(yp, inView);
    let best = null;
    months.forEach((m, month) => { if (m && (!best || m.rate > best.rate)) best = { month, rate: m.rate }; });
    const person = (prefix, p) => {
      const s = stats(prefix, m => m.profileId === p.id);
      return { name: p.name, saved: s.saved, rate: s.rate };
    };
    return {
      balance, rate: y.rate, saved: y.saved, inn: y.inn, inv: y.inv, best, months,
      split: casa ? profiles.map(p => person(yp, p)) : null,
      monthSplit: casa ? idx.map(i => profiles.map(p => person(mp(i), p))) : null,
      scale: percentScale(months.map(m => m && m.rate)),
    };
  }

  const okCat = m => filter === 'all' || m.categoryId === filter;
  const out = (prefix, pred) =>
    periodStats(moves, categories, prefix, m => m.type === 'out' && okCat(m) && pred(m)).out;
  const months = idx.map(i => out(mp(i), inView));
  const total = months.reduce((a, b) => a + b, 0);
  const active = months.filter(c => c > 0).length;
  let highest = null;
  months.forEach((cents, month) => { if (cents > 0 && (!highest || cents > highest.cents)) highest = { month, cents }; });
  const person = (prefix, p) => ({ name: p.name, cents: out(prefix, m => m.profileId === p.id) });
  return {
    balance, total, average: active ? total / active : null, highest, months,
    split: casa ? profiles.map(p => person(yp, p)) : null,
    monthSplit: casa ? idx.map(i => profiles.map(p => person(mp(i), p))) : null,
    scale: niceScale(Math.max(0, ...months)),
  };
}
