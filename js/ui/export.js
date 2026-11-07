// Exportar Excel screen (wide layout only): totals per month, person and category, as an .xlsx.
import { todayISO, MONTHS } from '../logic/format.js';
import { exportData, exportFileName, validRange } from '../logic/export.js';
import { buildXlsx } from '../xlsx.js';
import { esc, mount, bindActions } from './dom.js';

// Store updates do not re-render it: the chosen range stays (the download reads the data when clicked).
export const keepOnUpdate = true;

const MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const cap = s => s[0].toUpperCase() + s.slice(1);
const ERR = 'O mês de início tem de ser antes do mês de fim.';
const EMPTY = 'Não há movimentos neste intervalo.';

function picker(id, label, ym, years) {
  const [y, m] = ym.split('-');
  const months = MONTHS.map((n, i) => {
    const v = String(i + 1).padStart(2, '0');
    return `<option value="${v}"${v === m ? ' selected' : ''}>${esc(cap(n))}</option>`;
  }).join('');
  const ys = years.map(v => `<option value="${v}"${String(v) === y ? ' selected' : ''}>${v}</option>`).join('');
  return `<div class="expick"><span>${label}</span><select id="${id}-m" aria-label="${label}, mês">${months}</select><select id="${id}-y" aria-label="${label}, ano">${ys}</select></div>`;
}

function build(state, from, to) {
  const { totals, summary } = exportData({ moves: state.moves, categories: state.categories, profiles: state.profiles, from, to });
  const bytes = buildXlsx([
    {
      name: 'Totais',
      columns: [
        { header: 'Mês', width: 12, type: 'month' }, { header: 'Perfil', width: 14, type: 'string' }, { header: 'Tipo', width: 10, type: 'string' },
        { header: 'Categoria', width: 22, type: 'string' }, { header: 'Conta como poupança', width: 20, type: 'string' }, { header: 'Valor (€)', width: 14, type: 'number' },
      ],
      rows: totals.map(r => [r.ym, r.profile, r.type, r.category, r.savings, r.cents / 100]),
    },
    {
      name: 'Resumo',
      columns: [
        { header: 'Mês', width: 12, type: 'month' }, { header: 'Perfil', width: 14, type: 'string' }, { header: 'Entrou', width: 14, type: 'number' },
        { header: 'Saiu', width: 14, type: 'number' }, { header: 'Poupado', width: 14, type: 'number' }, { header: 'Taxa de poupança', width: 18, type: 'percent' },
        { header: 'Em conta no fim do mês', width: 22, type: 'number' },
      ],
      rows: summary.map(r => [r.ym, r.profile, r.inn / 100, r.out / 100, r.saved / 100, r.rate, r.balance === null ? null : r.balance / 100]),
    },
  ]);
  return { bytes, empty: totals.length === 0 };
}

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: MIME }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function render(ctx, root) {
  const state = ctx.store.getState();
  const today = todayISO();
  const cur = Number(today.slice(0, 4));
  const first = state.moves.length ? Number(state.moves.map(m => m.date).sort()[0].slice(0, 4)) : cur;
  const years = [];
  for (let y = Math.min(first, cur); y <= cur + 1; y++) years.push(y);
  const from0 = `${cur}-01`, to0 = today.slice(0, 7);

  mount(root, `<div class="scroll wexport"><div class="title">Exportar Excel</div>
    <div class="card excard">
      <h3 class="extitle">Período</h3>
      <div class="exrow">${picker('ex-from', 'De', from0, years)}${picker('ex-to', 'Até', to0, years)}</div>
      <p class="exerr" role="alert" hidden>${ERR}</p>
      <p class="exinfo">Totais por mês, pessoa e categoria dos dois perfis, sem notas nem movimentos individuais.</p>
      <button class="btn exbtn" data-act="download">Descarregar Excel</button>
      <p class="exinfo exempty" hidden>${EMPTY}</p>
    </div></div>`);

  const get = id => `${root.querySelector(`#${id}-y`).value}-${root.querySelector(`#${id}-m`).value}`;
  const btn = root.querySelector('[data-act="download"]');
  const err = root.querySelector('.exerr');
  const empty = root.querySelector('.exempty');
  const sync = () => {
    const ok = validRange(get('ex-from'), get('ex-to'));
    btn.disabled = !ok;
    if (ok) err.setAttribute('hidden', ''); else err.removeAttribute('hidden');
    empty.setAttribute('hidden', '');
  };
  let busy = false;
  root.addEventListener('change', sync);
  sync();

  bindActions(root, {
    download: () => {
      if (busy) return;
      busy = true;
      setTimeout(() => { busy = false; }, 800);
      const from = get('ex-from'), to = get('ex-to');
      if (!validRange(from, to)) return;
      const { bytes, empty: none } = build(ctx.store.getState(), from, to);
      download(bytes, exportFileName(from, to));
      if (none) empty.removeAttribute('hidden');
    },
  });
}
