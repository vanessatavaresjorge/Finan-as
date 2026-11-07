import { categoryOf, periodStats } from './stats.js';
import { addMonths } from './format.js';

export function validRange(from, to) { return from <= to; }

export function monthsInRange(from, to) {
  const list = [];
  for (let ym = from; ym <= to; ym = addMonths(ym, 1)) list.push(ym);
  return list;
}

export function exportData({ moves, categories, profiles, from, to }) {
  const months = monthsInRange(from, to);
  const totals = [], summary = [];
  for (const ym of months) {
    for (const p of profiles) {
      const mine = moves.filter(m => m.profileId === p.id && m.date.startsWith(ym));
      const byKey = new Map();
      for (const m of mine) {
        const c = categoryOf(categories, m.categoryId, m.type);
        const key = `${m.type}\u0000${c.name}\u0000${m.type === 'out' && c.savings ? 1 : 0}`;
        byKey.set(key, (byKey.get(key) || 0) + m.cents);
      }
      const rows = [...byKey].filter(([, cents]) => cents !== 0).map(([key, cents]) => {
        const [type, category, sav] = key.split('\u0000');
        return { type, category, sav, cents };
      });
      rows.sort((a, b) => (a.type === b.type ? 0 : a.type === 'out' ? -1 : 1)
        || a.category.localeCompare(b.category, 'pt-PT'));
      for (const r of rows) {
        totals.push({
          ym, profile: p.name, type: r.type === 'out' ? 'Saída' : 'Entrada',
          category: r.category, savings: r.sav === '1' ? 'Sim' : 'Não', cents: r.cents,
        });
      }
      const s = periodStats(moves, categories, ym, m => m.profileId === p.id);
      summary.push({ ym, profile: p.name, inn: s.inn, out: s.out, saved: s.saved, rate: s.rate });
    }
  }
  return { totals, summary };
}

export function exportFileName(from, to) { return `financas-${from}-a-${to}.xlsx`; }
