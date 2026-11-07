// Hash routes <-> route objects. Unknown or malformed hashes open the current month.
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const YEAR = /^\d{4}$/;

const dec = s => { try { return decodeURIComponent(s); } catch { return null; } };

export function parseRoute(hash, today) {
  const fallback = { name: 'mes', ym: today.slice(0, 7), casa: false };
  const parts = String(hash ?? '').replace(/^#\/?/, '').split('/');
  const casa = parts.length > 1 && parts[parts.length - 1] === 'casa';
  if (casa) parts.pop();
  const [head, a, b, c, ...rest] = parts;

  if (head === 'mes' && YM.test(a ?? '')) {
    if (b === undefined) return { name: 'mes', ym: a, casa };
    if (b === 'entradas' && c === undefined) return { name: 'entradas', ym: a, casa };
    if (b === 'cat' && c && !rest.length) {
      const catId = dec(c);
      if (catId) return { name: 'cat', ym: a, catId, casa };
    }
    return fallback;
  }
  if (head === 'ano' && YEAR.test(a ?? '')) {
    if (b === undefined) return { name: 'ano', year: Number(a), mode: 'gastos', casa };
    if (b === 'poupanca' && c === undefined) return { name: 'ano', year: Number(a), mode: 'poupanca', casa };
    return fallback;
  }
  if (casa) return fallback;
  if ((head === 'categorias' || head === 'registar' || head === 'exportar') && a === undefined) return { name: head, casa: false };
  if (head === 'editar' && a && b === undefined) {
    const moveId = dec(a);
    if (moveId) return { name: 'editar', moveId, casa: false };
  }
  return fallback;
}

export function routeHash(route) {
  const casa = route.casa ? '/casa' : '';
  switch (route.name) {
    case 'cat': return `#/mes/${route.ym}/cat/${encodeURIComponent(route.catId)}${casa}`;
    case 'entradas': return `#/mes/${route.ym}/entradas${casa}`;
    case 'ano': return `#/ano/${route.year}${route.mode === 'poupanca' ? '/poupanca' : ''}${casa}`;
    case 'categorias': return '#/categorias';
    case 'registar': return '#/registar';
    case 'exportar': return '#/exportar';
    case 'editar': return `#/editar/${encodeURIComponent(route.moveId)}`;
    default: return `#/mes/${route.ym}${casa}`;
  }
}
