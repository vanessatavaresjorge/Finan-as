// Month screen (routes mes, cat, entradas): totals, savings rate, categories and movements.
import { formatEur, formatPct, shortDate, monthTitle, addMonths, todayISO } from '../logic/format.js';
import { parseRoute } from '../logic/route.js';
import { monthModel, yearModel, categoryOf } from '../logic/stats.js';
import { esc, mount, bindActions, viewSeg } from './dom.js';
import { barChart, euroTick } from './chart.js';

const eur = formatEur;

const splitLine = (parts, extra = '') =>
  `<div class="split${extra}">${parts.map(p => `${esc(p.name)} ${p.text}`).join(' · ')}</div>`;
const savedTxt = s => (s.rate === null ? '—' : `${eur(s.saved)} (${formatPct(s.rate)})`);

function moveRow(m) {
  return `<button class="row mv" data-act="edit" data-id="${esc(m.id)}">
    <div class="top"><span><span class="ic">${esc(m.icon)}</span><span class="txt">${esc(m.note || m.categoryName)}<small>${esc(shortDate(m.date))} · ${esc(m.categoryName)}</small></span></span>
    <b class="num ${m.type === 'in' ? 'pos' : ''}">${m.type === 'in' ? '+' : '−'}${eur(m.cents)}</b></div></button>`;
}

// The sentence under the savings rate (base spec rules), shared by the phone and wide layouts.
function savePhrase(t) {
  if (t.rate === null) return { text: 'Sem entradas neste mês', negative: false };
  if (t.saved < 0) return { text: `Gastaste mais ${eur(-t.saved)} do que entrou.`, negative: true };
  const inv = t.inv > 0 ? `, incluindo ${eur(t.inv)} em categorias de poupança` : '';
  return { text: `Poupaste ${eur(t.saved)} dos ${eur(t.inn)} que entraram${inv}.`, negative: false };
}
const meterWidth = t => Math.max(0, Math.min(1, t.rate ?? 0)) * 100;

function saveCard(t, split) {
  const rows = split ? splitLine(split.map(p => ({ name: p.name, text: savedTxt(p) }))) : '';
  const ph = savePhrase(t);
  if (t.rate === null) {
    return `<div class="card savecard"><div class="hd"><span class="label">Taxa de poupança${split ? ' da casa' : ''}</span><b class="num">—</b></div>
      <div class="meter"><i style="width:0%"></i></div><p>${ph.text}</p>${rows}</div>`;
  }
  return `<div class="card savecard">
    <div class="hd"><span class="label">Taxa de poupança${split ? ' da casa' : ''}</span><b class="num ${t.rate < 0 ? 'neg' : ''}">${formatPct(t.rate)}</b></div>
    <div class="meter"><i style="width:${meterWidth(t)}%"></i></div>
    ${split ? rows : `<p${ph.negative ? ' style="color:var(--danger)"' : ''}>${ph.text}</p>`}
  </div>`;
}

function catRow(c, casa, ym) {
  const inner = `<div class="top"><span><span class="ic">${esc(c.icon)}</span>${esc(c.name)}<span class="pct">${c.pct}%</span></span><b class="num">${eur(c.cents)}</b></div>
    <div class="bar"><i class="${c.savings ? 'sav' : ''}" style="width:${c.barPct}%"></i></div>
    ${casa ? splitLine(c.split.map(p => ({ name: p.name, text: eur(p.cents) })), ' indent') : ''}`;
  return casa ? `<div class="row">${inner}</div>`
    : `<button class="row" data-act="detail" data-cat="${esc(c.id)}">${inner}</button>`;
}

function monthView(ctx, ym, casa) {
  const state = ctx.store.getState();
  const view = casa ? 'casa' : ctx.profileId;
  const model = monthModel({ ...state, ym, view });
  const { totals: t, split } = model;
  const sp = fn => (split ? splitLine(split.map(p => ({ name: p.name, text: fn(p) }))) : '');
  const seg = viewSeg(state.profiles, ctx.profileId, casa);
  const noMoves = casa ? t.inn === 0 && t.out === 0 && !model.categories.length : !model.moves.length;
  let list;
  if (noMoves) {
    list = `<div class="card empty" style="margin-top:18px">Ainda não há movimentos neste mês.${casa ? '' : ' Toca em <b>+</b> para registar o primeiro.'}</div>`;
  } else if (!model.categories.length) {
    list = '<div class="card empty" style="margin-top:18px">Ainda não há saídas neste mês.</div>';
  } else {
    list = `<div class="card list">${model.categories.map(c => catRow(c, casa, ym)).join('')}</div>`;
  }
  const entrou = `<span class="label">Entrou</span>${casa ? '' : '<span class="chev">›</span>'}<b class="num in">${eur(t.inn)}</b>${sp(p => eur(p.inn))}`;
  return `<div class="scroll">
    ${state.pending ? '<div class="label sync" role="status">A sincronizar…</div>' : ''}
    ${seg}
    <div class="monthnav"><button data-act="prev" aria-label="Mês anterior">‹</button><span class="title">${esc(monthTitle(ym))}</span><button data-act="next" aria-label="Mês seguinte">›</button></div>
    <div style="margin-top:14px"><div class="label">${casa ? 'Saiu este mês · Casa' : 'Saiu este mês'}</div><div class="big num">${eur(t.out)}</div>${sp(p => eur(p.out))}</div>
    <div class="pair">
      ${casa ? `<div class="card">${entrou}</div>` : `<button class="card" data-act="entradas">${entrou}</button>`}
      <div class="card"><span class="label">Sobrou</span><b class="num"${t.left < 0 ? ' style="color:var(--danger)"' : ''}>${eur(t.left)}</b>${sp(p => eur(p.left))}</div>
    </div>
    ${saveCard(t, split)}
    ${list}
    ${!casa && model.moves.length ? `<div class="sech"><h3>Movimentos</h3><span>${model.moves.length}</span></div>
    <div class="card list all">${model.moves.map(moveRow).join('')}</div>` : ''}
  </div>`;
}

// ---------- Wide window: dashboard with KPI cards, categories | year chart, movements table ----------

// Compact card: rate and meter (and, in Casa, each person's saving). The phrase goes under the row.
function wideSaveKpi(t, split) {
  return `<div class="card kpi"><span class="label">Taxa de poupança</span><b class="num${t.rate !== null && t.rate < 0 ? ' neg' : ''}">${formatPct(t.rate)}</b>
    <div class="meter"><i style="width:${meterWidth(t)}%"></i></div>
    ${split ? splitLine(split.map(p => ({ name: p.name, text: savedTxt(p) }))) : ''}</div>`;
}

// Full-width line under the KPI row. In Casa the per-person lines replace it, except with no income.
function widePhrase(t, split) {
  if (split && t.rate !== null) return '';
  const ph = savePhrase(t);
  return `<p class="kpiphrase${ph.negative ? ' neg' : ''}">${ph.text}</p>`;
}

function wideCatRow(c, casa, on) {
  const inner = `<div class="top"><span class="nmw"><span class="ic">${esc(c.icon)}</span><span class="nm">${esc(c.name)}</span><span class="pct">${c.pct}%</span></span><b class="num">${eur(c.cents)}</b></div>
    <div class="bar"><i class="${c.savings ? 'sav' : ''}" style="width:${c.barPct}%"></i></div>
    ${casa ? splitLine(c.split.map(p => ({ name: p.name, text: eur(p.cents) })), ' indent') : ''}`;
  return casa ? `<div class="row">${inner}</div>`
    : `<button class="row${on ? ' on' : ''}" data-act="detail" data-cat="${esc(c.id)}"${on ? ' aria-pressed="true"' : ''}>${inner}</button>`;
}

function movRow(m) {
  const isIn = m.type === 'in';
  return `<tr data-act="edit" data-id="${esc(m.id)}" tabindex="0">
    <td class="d">${esc(shortDate(m.date))}</td>
    <td class="c"><span class="ic">${esc(m.icon)}</span>${esc(m.categoryName)}</td>
    <td class="n">${esc(m.note)}</td>
    <td class="v num${isIn ? ' pos' : ''}">${isIn ? '+' : '−'}${eur(m.cents)}</td></tr>`;
}

function movesCard(state, model, route) {
  const isIn = route.name === 'entradas';
  const filtered = isIn || route.name === 'cat';
  const moves = !filtered ? model.moves
    : model.moves.filter(m => (isIn ? m.type === 'in' : m.categoryId === route.catId));
  let chip = '';
  if (filtered) {
    const c = isIn ? null : categoryOf(state.categories, route.catId);
    chip = `<div class="movfilter"><button class="chip on" data-act="unfilter" aria-label="Remover filtro">${isIn ? 'Entradas' : `${esc(c.icon)} ${esc(c.name)}`} ×</button>
      <button class="link" data-act="unfilter">‹ Voltar</button></div>`;
  }
  const body = moves.length ? moves.map(movRow).join('')
    : `<tr class="none"><td colspan="4">Sem movimentos neste mês.</td></tr>`;
  return `${chip}<div class="card wmovs">
    <div class="ct">Movimentos <span>${moves.length}</span></div>
    <table class="movs">
      <colgroup><col class="d"><col class="c"><col class="n"><col class="v"></colgroup>
      <thead><tr><th>Data</th><th>Categoria</th><th>Nota</th><th class="v">Valor</th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
}

function wideView(ctx, route, casa) {
  const state = ctx.store.getState();
  const { ym } = route;
  const view = casa ? 'casa' : ctx.profileId;
  const model = monthModel({ ...state, ym, view });
  const { totals: t, split } = model;
  const sp = fn => (split ? splitLine(split.map(p => ({ name: p.name, text: fn(p) }))) : '');
  const isIn = route.name === 'entradas';
  const catOn = route.name === 'cat' ? route.catId : null;

  const year = Number(ym.slice(0, 4));
  const mIdx = Number(ym.slice(5, 7)) - 1;
  const ymodel = yearModel({ ...state, year, view, mode: 'gastos', filter: 'all' });
  const chart = barChart({
    values: ymodel.months, selected: mIdx,
    scale: { min: 0, max: ymodel.scale.top, step: ymodel.scale.step, tick: euroTick },
    format: v => eur(v), label: `Saídas por mês em ${year}`, onSelectAttr: 'month',
  });

  const noMoves = casa ? t.inn === 0 && t.out === 0 && !model.categories.length : !model.moves.length;
  let cats;
  if (noMoves) {
    cats = `<div class="empty">Ainda não há movimentos neste mês.${casa ? '' : ' Carrega em <b>+ Registar</b> para registar o primeiro.'}</div>`;
  } else if (!model.categories.length) {
    cats = '<div class="empty">Ainda não há saídas neste mês.</div>';
  } else {
    cats = `<div class="list">${model.categories.map(c => wideCatRow(c, casa, c.id === catOn)).join('')}</div>`;
  }

  const entrou = `<span class="label">Entrou</span><b class="num in">${eur(t.inn)}</b>${sp(p => eur(p.inn))}`;
  return `<div class="scroll"><div class="wmonth">
    ${state.pending ? '<div class="label sync" role="status">A sincronizar…</div>' : ''}
    <div class="wtop">
      <div class="monthnav"><button data-act="prev" aria-label="Mês anterior">‹</button><span class="title">${esc(monthTitle(ym))}</span><button data-act="next" aria-label="Mês seguinte">›</button></div>
      ${viewSeg(state.profiles, ctx.profileId, casa)}
    </div>
    <div class="kpis">
      <div class="card kpi"><span class="label">Saiu</span><b class="num">${eur(t.out)}</b>${sp(p => eur(p.out))}</div>
      ${casa ? `<div class="card kpi">${entrou}</div>`
        : `<button class="card kpi${isIn ? ' on' : ''}" data-act="entradas"${isIn ? ' aria-pressed="true"' : ''}>${entrou}</button>`}
      <div class="card kpi"><span class="label">Sobrou</span><b class="num${t.left < 0 ? ' neg' : ''}">${eur(t.left)}</b>${sp(p => eur(p.left))}</div>
      ${wideSaveKpi(t, split)}
    </div>
    ${widePhrase(t, split)}
    <div class="wmid">
      <div class="card wcats"><div class="ct">Categorias</div>${cats}</div>
      <div class="card wchart"><div class="ct">Saídas em ${year}</div>${chart}</div>
    </div>
    ${casa || noMoves ? '' : movesCard(state, model, route)}
  </div></div>`;
}

// Scroll position of the wide month, so filtering the table (a new route) does not jump to the top.
// Only kept between mes/cat/entradas of the same month and view (the key), and while the register
// or edit drawer is open over it. Leaving for any other screen clears it.
let wideScroll = { key: null, top: 0 };
const KEEPS_SCROLL = new Set(['mes', 'cat', 'entradas', 'registar', 'editar']);
window.addEventListener('hashchange', () => {
  if (!KEEPS_SCROLL.has(parseRoute(location.hash, todayISO()).name)) wideScroll = { key: null, top: 0 };
});

function detailView(ctx, route) {
  const state = ctx.store.getState();
  const { ym } = route;
  const isIn = route.name === 'entradas';
  const model = monthModel({ ...state, ym, view: ctx.profileId });
  const moves = model.moves.filter(m => (isIn ? m.type === 'in' : m.categoryId === route.catId));
  const total = moves.reduce((a, m) => a + m.cents, 0);
  const c = isIn ? null : categoryOf(state.categories, route.catId);
  const [y, mo] = ym.split('-');
  const month = monthTitle(ym).replace(/ \d+$/, '').toLowerCase();
  return `<div class="scroll">
    <button class="back" data-act="back">‹ Mês</button>
    <div class="label">${isIn ? 'Entradas' : `${esc(c.icon)} ${esc(c.name)}`} · ${esc(month)} ${y}</div>
    <div class="big num"${isIn ? ' style="color:var(--in)"' : ''}>${eur(total)}</div>
    ${moves.length ? `<div class="card list">${moves.map(moveRow).join('')}</div>` : '<div class="card empty" style="margin-top:18px">Sem movimentos neste mês.</div>'}
  </div>`;
}

export function render(ctx, root) {
  const { route } = ctx;
  const profiles = ctx.store.getState().profiles;
  const detail = route.name === 'cat' || route.name === 'entradas';
  // Detail lists belong to one profile; reached with /casa they show the Casa month instead.
  if (detail && route.casa) { ctx.go({ name: 'mes', ym: route.ym, casa: true }); return; }
  const casa = route.casa && profiles.length > 1;
  if (ctx.wide) renderWide(ctx, root, route, casa);
  else mount(root, detail ? detailView(ctx, route) : monthView(ctx, route.ym, casa));

  const mes = (ym, c) => ctx.go({ name: 'mes', ym, casa: c });
  bindActions(root, {
    prev: () => mes(addMonths(route.ym, -1), casa),
    next: () => mes(addMonths(route.ym, 1), casa),
    view: el => mes(route.ym, el.dataset.v === 'casa'),
    back: () => mes(route.ym, false),
    // On a wide window a second click on the active filter removes it.
    detail: el => (el.classList.contains('on') ? mes(route.ym, false)
      : ctx.go({ name: 'cat', ym: route.ym, catId: el.dataset.cat, casa: false })),
    entradas: el => (el.classList.contains('on') ? mes(route.ym, false)
      : ctx.go({ name: 'entradas', ym: route.ym, casa: false })),
    edit: el => ctx.go({ name: 'editar', moveId: el.dataset.id, casa: false }),
    unfilter: () => mes(route.ym, false),
    month: el => mes(`${route.ym.slice(0, 4)}-${String(Number(el.dataset.month) + 1).padStart(2, '0')}`, casa),
  });
}

function renderWide(ctx, root, route, casa) {
  mount(root, wideView(ctx, route, casa));
  const sc = root.querySelector('.scroll');
  // Same month and view as the last wide render (filter on or off, a redraw): keep the scroll.
  const key = `${ctx.profileId}|${route.ym}|${casa}`;
  if (wideScroll.key === key) sc.scrollTop = wideScroll.top;
  wideScroll = { key, top: sc.scrollTop };
  const save = () => { wideScroll = { key, top: sc.scrollTop }; };
  sc.addEventListener('scroll', save, { passive: true });
  // also on every click, before the action navigates (a scroll event may still be pending)
  root.addEventListener('click', save, true);
  // With a filter, bring the table into view if it is below the window.
  const filter = root.querySelector('.movfilter');
  if (filter && filter.getBoundingClientRect().top > sc.getBoundingClientRect().bottom - 80) {
    filter.scrollIntoView({ block: 'start' });
  }
  // Table rows are focusable: Enter opens the move, as a click does.
  root.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches?.('tr[data-act="edit"]')) e.target.click();
  });
}
