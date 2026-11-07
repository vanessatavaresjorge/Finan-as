// Generic demo data (demo mode only): two profiles and the 12 months up to `today`.
// Always the same for the same `today` (seeded generator). Notes are plain generic words.
import { DEFAULT_CATEGORIES, nextOrder } from './logic/categories.js';
import { addMonths } from './logic/format.js';
import { lastDay } from './logic/balance.js';

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoData(today) {
  const rnd = seeded(20261106);
  const categories = DEFAULT_CATEGORIES.map(c => ({ ...c }));
  categories.push({ id: 'inv', name: 'Investimentos', type: 'out', icon: '📈', savings: true, order: nextOrder(categories) });
  const profiles = [
    { id: 'a', name: 'Perfil A', pinHash: null, pinSalt: null, pinIter: null,
      openingCents: 150000, openingDate: lastDay(addMonths(today.slice(0, 7), -12)) },
    { id: 'b', name: 'Perfil B', pinHash: null, pinSalt: null, pinIter: null },
  ];

  const moves = [];
  const thisYm = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));

  for (let i = 11; i >= 0; i--) {
    const ym = addMonths(thisYm, -i);
    const lastDay = i === 0 ? Math.min(28, todayDay) : 28;
    const day = () => String(1 + Math.floor(rnd() * lastDay)).padStart(2, '0');
    const euros = (lo, hi) => Math.round((lo + rnd() * (hi - lo)) * 100);
    const add = (profileId, type, cents, categoryId, date, note = '') => {
      const n = moves.length;
      moves.push({
        id: `demo-${String(n + 1).padStart(4, '0')}`, profileId, type, cents, categoryId, date, note,
        createdAt: Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 12) + n,
      });
    };
    const out = (pid, cat, lo, hi, note = '') => add(pid, 'out', euros(lo, hi), cat, `${ym}-${day()}`, note);
    const month = Number(ym.slice(5, 7));

    // Perfil A
    add('a', 'in', 210000, 'salario', `${ym}-01`, 'Ordenado');
    if (month === 7) add('a', 'in', 210000, 'outros', `${ym}-${day()}`, 'Subsídio de férias');
    for (let k = 0; k < 4; k++) out('a', 'supermercado', 45, 120, k === 0 ? 'Compras da semana' : '');
    out('a', 'combustivel', 50, 75); out('a', 'combustivel', 50, 75);
    for (let k = 0; k < 2 + (i % 2); k++) out('a', 'restaurantes', 15, 60, k === 0 ? 'Almoço' : 'Jantar');
    if (i % 4 === 1) out('a', 'saude', 30, 90, 'Consulta');
    if (i % 2 === 0) out('a', 'beleza', 25, 45, 'Cabeleireiro');
    out('a', 'lazer', 15, 60, 'Cinema');
    out('a', 'via-verde', 8, 22, 'Portagens'); out('a', 'via-verde', 8, 22);
    if (i === 8) out('a', 'carro', 380, 420, 'Revisão');
    add('a', 'out', 20000, 'inv', `${ym}-${day()}`, 'Poupança mensal');

    // Perfil B
    add('b', 'in', 165000, 'salario', `${ym}-01`, 'Ordenado');
    for (let k = 0; k < 3; k++) out('b', 'supermercado', 35, 90);
    out('b', 'combustivel', 55, 85); out('b', 'combustivel', 55, 85);
    for (let k = 0; k < 2 + (i % 3); k++) out('b', 'restaurantes', 12, 45, k === 0 ? 'Almoço' : '');
    out('b', 'lazer', 25, 90, i === 6 ? 'Concerto' : 'Ginásio');
    if (i % 3 === 0) out('b', 'saude', 15, 40, 'Farmácia');
    if (i % 3 === 2) out('b', 'beleza', 15, 30);
    out('b', 'via-verde', 6, 18); out('b', 'via-verde', 6, 18);
    if (i % 3 === 1) add('b', 'out', 15000, 'inv', `${ym}-${day()}`, 'Fundo');
    // A month where Perfil B spends more than it earns (negative savings).
    if (i === 4) out('b', 'carro', 1400, 1600, 'Reparação');
  }

  return { profiles, categories, moves };
}
