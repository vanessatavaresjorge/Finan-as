import { categoryOf, periodStats, ruleModel } from './stats.js';
import { GROUP_LABELS } from './groups.js';
import { balanceAt } from './balance.js';
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
        const key = `${m.type}\u0000${c.name}\u0000${m.type === 'out' ? GROUP_LABELS[c.group] : ''}`;
        byKey.set(key, (byKey.get(key) || 0) + m.cents);
      }
      const rows = [...byKey].filter(([, cents]) => cents !== 0).map(([key, cents]) => {
        const [type, category, group] = key.split('\u0000');
        return { type, category, group, cents };
      });
      rows.sort((a, b) => (a.type === b.type ? 0 : a.type === 'out' ? -1 : 1)
        || a.category.localeCompare(b.category, 'pt-PT'));
      for (const r of rows) {
        totals.push({
          ym, profile: p.name, type: r.type === 'out' ? 'Saída' : 'Entrada',
          category: r.category, group: r.group, cents: r.cents,
        });
      }
      const s = periodStats(moves, categories, ym, m => m.profileId === p.id);
      const pct = ruleModel(moves, categories, ym, m => m.profileId === p.id).pct;
      summary.push({ ym, profile: p.name, inn: s.inn, out: s.out, saved: s.saved, rate: s.rate, balance: balanceAt(moves, p, ym),
        nec: pct ? pct.nec : null, des: pct ? pct.des : null, pou: pct ? pct.pou : null });
    }
  }
  return { totals, summary };
}

export function exportFileName(from, to) { return `financas-${from}-a-${to}.xlsx`; }
