// Month screen (routes mes, cat, entradas): totals, savings rate, categories and movements.
import { formatEur, formatPct, shortDate, monthTitle, addMonths } from '../logic/format.js';
import { monthModel, categoryOf } from '../logic/stats.js';
import { esc, mount, bindActions } from './dom.js';

const eur = formatEur;

const splitLine = (parts, extra = '') =>
  `<div class="split${extra}">${parts.map(p => `${esc(p.name)} ${p.text}`).join(' · ')}</div>`;
const savedTxt = s => (s.rate === null ? '—' : `${eur(s.saved)} (${formatPct(s.rate)})`);

function moveRow(m) {
  return `<button class="row mv" data-act="edit" data-id="${esc(m.id)}">
    <div class="top"><span><span class="ic">${esc(m.icon)}</span><span class="txt">${esc(m.note || m.categoryName)}<small>${esc(shortDate(m.date))} · ${esc(m.categoryName)}</small></span></span>
    <b class="num ${m.type === 'in' ? 'pos' : ''}">${m.type === 'in' ? '+' : '−'}${eur(m.cents)}</b></div></button>`;
}

function saveCard(t, split) {
  const rows = split ? splitLine(split.map(p => ({ name: p.name, text: savedTxt(p) }))) : '';
  if (t.rate === null) {
    return `<div class="card savecard"><div class="hd"><span class="label">Taxa de poupança${split ? ' da casa' : ''}</span><b class="num">—</b></div>
      <div class="meter"><i style="width:0%"></i></div><p>Sem entradas neste mês</p>${rows}</div>`;
  }
  const width = Math.max(0, Math.min(1, t.rate)) * 100;
  const phrase = t.saved >= 0
    ? `Poupaste ${eur(t.saved)} dos ${eur(t.inn)} que entraram`
    : `Gastaste mais ${eur(-t.saved)} do que entrou`;
  return `<div class="card savecard">
    <div class="hd"><span class="label">Taxa de poupança${split ? ' da casa' : ''}</span><b class="num ${t.rate < 0 ? 'neg' : ''}">${formatPct(t.rate)}</b></div>
    <div class="meter"><i style="width:${width}%"></i></div>
    ${split ? rows : `<p${t.rate < 0 ? ' style="color:var(--danger)"' : ''}>${phrase}${t.saved >= 0 && t.inv > 0 ? `, incluindo ${eur(t.inv)} em categorias de poupança` : ''}.</p>`}
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
  const me = state.profiles.find(p => p.id === ctx.profileId);
  const seg = state.profiles.length > 1
    ? `<div class="seg vseg"><button class="${casa ? '' : 'on'}" data-act="view" data-v="me">${esc(me?.name ?? '')}</button><button class="${casa ? 'on' : ''}" data-act="view" data-v="casa">Casa</button></div>`
    : '';
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
  mount(root, detail ? detailView(ctx, route) : monthView(ctx, route.ym, casa));

  const mes = (ym, c) => ctx.go({ name: 'mes', ym, casa: c });
  bindActions(root, {
    prev: () => mes(addMonths(route.ym, -1), casa),
    next: () => mes(addMonths(route.ym, 1), casa),
    view: el => mes(route.ym, el.dataset.v === 'casa'),
    back: () => mes(route.ym, false),
    detail: el => ctx.go({ name: 'cat', ym: route.ym, catId: el.dataset.cat, casa: false }),
    entradas: () => ctx.go({ name: 'entradas', ym: route.ym, casa: false }),
    edit: el => ctx.go({ name: 'editar', moveId: el.dataset.id, casa: false }),
  });
}
