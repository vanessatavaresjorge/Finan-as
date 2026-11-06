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

  return { totals, split, categories: cats, moves: list };
}
