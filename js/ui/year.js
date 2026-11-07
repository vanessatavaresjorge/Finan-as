// Year screen (route ano): spending or savings per month, chart, and the month-by-month list.
import { formatEur, formatPct, todayISO, MONTHS } from '../logic/format.js';
import { yearModel } from '../logic/stats.js';
import { esc, mount, bindActions } from './dom.js';
import { barChart, euroTick } from './chart.js';

const eur = formatEur;
const MINUS = '−';
const cap = s => s[0].toUpperCase() + s.slice(1);

// UI state (selected bar, filter) lives here, not in the route. It is dropped when the
// profile or the year changes, and kept across re-renders and the Gastos/Poupança switch.
let ui = { profileId: null, year: null, sel: 0, filter: 'all' };

function defaultSel(year) {
  const today = todayISO();
  const cur = Number(today.slice(0, 4));
  if (year === cur) return Number(today.slice(5, 7)) - 1;
  return year < cur ? 11 : 0;
}

function syncState(profileId, year) {
  if (ui.profileId !== profileId) ui = { profileId, year, sel: defaultSel(year), filter: 'all' };
  else if (ui.year !== year) ui = { ...ui, year, sel: defaultSel(year) };
}

const splitLine = parts =>
  `<div class="split">${parts.map(p => `${esc(p.name)} ${p.text}`).join(' · ')}</div>`;
const savedTxt = s => (s.rate === null ? '—' : `${eur(s.saved)} (${formatPct(s.rate)})`);
// Colour by what is shown: a rate that displays as 0% is not negative.
const isNeg = rate => rate !== null && Math.round(rate * 100) < 0;
const DANGER = ' style="color:var(--danger)"';
const pctTick = p => (p < 0 ? MINUS : '') + Math.abs(p) + '%';

// Everything that differs between Gastos and Poupança, in one shape the page below can use.
function describe(model, route, casa, sel, categories) {
  const { year } = route;
  const where = casa ? ' · Casa' : '';
  if (route.mode === 'poupanca') {
    const rates = model.months.map(m => (m ? m.rate * 100 : null));
    const { min, max, step } = model.scale;
        const ms = model.months[sel];
    const sub = !ms ? 'Sem entradas' : ms.saved >= 0 ? `${eur(ms.saved)} poupados` : `${eur(-ms.saved)} acima do que entrou`;
    const mSplit = i => (casa ? splitLine(model.monthSplit[i].map(p => ({ name: p.name, text: savedTxt(p) }))) : '');
    return {
      head: `<div style="margin-top:16px"><div class="label">Taxa de poupança em ${year}${where}</div>
          <div class="big num"${isNeg(model.rate) ? DANGER : ''}>${formatPct(model.rate)}</div>
          ${casa ? splitLine(model.split.map(p => ({ name: p.name, text: savedTxt(p) }))) : ''}</div>
        <div class="pair"><div class="card"><span class="label">Poupaste</span><b class="num"${model.saved < 0 ? ' style="color:var(--danger)"' : ''}>${eur(model.saved)}</b></div>
        <div class="card"><span class="label">Mês com mais poupança</span><b>${model.best ? cap(MONTHS[model.best.month]) : '—'}</b></div></div>
        ${model.inv > 0 ? `<p class="label" style="margin-top:10px">Foi para categorias de poupança: ${eur(model.inv)}</p>` : ''}`,
      values: rates, lo: min, hi: max, step, tick: pctTick, chartName: 'Taxa de poupança',
      fmt: i => (rates[i] === null ? '—' : formatPct(model.months[i].rate)),
      readStyle: ms && isNeg(ms.rate) ? DANGER : '', readSub: sub, readSplit: mSplit(sel), unit: 'poupado · taxa',
      listVal: i => (rates[i] === null ? '<b class="none">—</b>'
        : `<span class="rv"><span><span class="label" style="margin-right:10px">${eur(model.months[i].saved)}</span><b class="num"${isNeg(model.months[i].rate) ? DANGER : ''}>${formatPct(model.months[i].rate)}</b></span>${mSplit(i)}</span>`),
    };
  }
  const fc = ui.filter === 'all' ? null : categories.find(c => c.id === ui.filter);
  const chips = [`<button class="chip ${fc ? '' : 'on'}" data-act="filter" data-v="all">Todas</button>`]
    .concat(categories.map(c => `<button class="chip ${fc?.id === c.id ? 'on' : ''}" data-act="filter" data-v="${esc(c.id)}"><span class="e">${esc(c.icon)}</span>${esc(c.name)}</button>`)).join('');
  const mSplit = i => (casa ? splitLine(model.monthSplit[i].map(p => ({ name: p.name, text: eur(p.cents) }))) : '');
  return {
    head: `<div style="margin-top:16px"><div class="label">Saiu em ${year}${where}${fc ? ` · ${esc(fc.icon)} ${esc(fc.name)}` : ''}</div>
        <div class="big num">${eur(model.total)}</div>
        ${casa ? splitLine(model.split.map(p => ({ name: p.name, text: eur(p.cents) }))) : ''}</div>
      <div class="pair"><div class="card"><span class="label">Média por mês</span><b class="num">${model.average === null ? '—' : eur(Math.round(model.average))}</b></div>
      <div class="card"><span class="label">Mês mais alto</span><b>${model.highest ? cap(MONTHS[model.highest.month]) : '—'}</b></div></div>
      <div class="fchips">${chips}</div>`,
    values: model.months, lo: 0, hi: model.scale.top, step: model.scale.step, tick: euroTick, chartName: 'Saídas',
    fmt: i => eur(model.months[i]),
    readStyle: '', readSub: '', readSplit: mSplit(sel), unit: 'em euros',
    listVal: i => (model.months[i] > 0
      ? `<span class="rv"><b class="num">${eur(model.months[i])}</b>${mSplit(i)}</span>` : '<b class="none">—</b>'),
  };
}

function page(ctx, route, casa) {
  const state = ctx.store.getState();
  const { year } = route;
  const view = casa ? 'casa' : ctx.profileId;
  const outCats = state.categories.filter(c => c.type === 'out').sort((a, b) => a.order - b.order);
  if (ui.filter !== 'all' && !outCats.some(c => c.id === ui.filter)) ui.filter = 'all';
  const model = yearModel({ ...state, year, view, mode: route.mode, filter: ui.filter });
  const sel = ui.sel;
  const d = describe(model, route, casa, sel, outCats);
  const me = state.profiles.find(p => p.id === ctx.profileId);
  const isSave = route.mode === 'poupanca';

  const seg = state.profiles.length > 1
    ? `<div class="seg vseg"><button class="${casa ? '' : 'on'}" data-act="view" data-v="me">${esc(me?.name ?? '')}</button><button class="${casa ? 'on' : ''}" data-act="view" data-v="casa">Casa</button></div>`
    : '';
  return `<div class="scroll">
    ${state.pending ? '<div class="label sync" role="status">A sincronizar…</div>' : ''}
    ${seg}
    <div class="monthnav"><button data-act="prev" aria-label="Ano anterior">‹</button><span class="title">${year}</span><button data-act="next" aria-label="Ano seguinte">›</button></div>
    <div class="seg yseg"><button class="${isSave ? '' : 'on'}" data-act="mode" data-v="gastos">Gastos</button><button class="${isSave ? 'on' : ''}" data-act="mode" data-v="poupanca">Poupança</button></div>
    ${d.head}
    <div class="card chartcard">
      <div class="readout">
        <div><span class="label">${cap(MONTHS[sel])} ${year}${d.readSub ? ' · ' + d.readSub : ''}</span><b class="num"${d.readStyle}>${d.fmt(sel)}</b>${d.readSplit}</div>
        <button data-act="open" data-v="${sel}">Ver mês ›</button>
      </div>
      ${barChart({ values: d.values, selected: sel, scale: { min: d.lo, max: d.hi, step: d.step, tick: d.tick },
        format: (v, i) => d.fmt(i), label: `${d.chartName} por mês em ${year}` })}
    </div>
    <div class="sech"><h3>Mês a mês</h3><span>${d.unit}</span></div>
    <div class="card list all">${MONTHS.map((n, i) => `<button class="yrow ${i === sel ? 'sel' : ''}" data-act="open" data-v="${i}"><span>${cap(n)}</span>${d.listVal(i)}</button>`).join('')}</div>
  </div>`;
}

export function render(ctx, root) {
  const { route } = ctx;
  const casa = route.casa && ctx.store.getState().profiles.length > 1;
  syncState(ctx.profileId, route.year);

  // Selecting a bar or a filter redraws in place, keeping both scroll positions.
  const draw = () => {
    const top = root.querySelector('.scroll')?.scrollTop ?? 0;
    const chips = root.querySelector('.fchips')?.scrollLeft ?? 0;
    mount(root, page(ctx, route, casa));
    const sc = root.querySelector('.scroll');
    if (sc) sc.scrollTop = top;
    const fc = root.querySelector('.fchips');
    if (fc) fc.scrollLeft = chips;
  };
  draw();

  const year = y => ctx.go({ name: 'ano', year: y, mode: route.mode, casa });
  bindActions(root, {
    prev: () => year(route.year - 1),
    next: () => year(route.year + 1),
    view: el => ctx.go({ name: 'ano', year: route.year, mode: route.mode, casa: el.dataset.v === 'casa' }),
    mode: el => ctx.go({ name: 'ano', year: route.year, mode: el.dataset.v, casa }),
    sel: el => { ui.sel = Number(el.dataset.month); draw(); },
    filter: el => { ui.filter = el.dataset.v; draw(); },
    open: el => ctx.go({ name: 'mes', ym: `${route.year}-${String(Number(el.dataset.v) + 1).padStart(2, '0')}`, casa }),
  });
}
