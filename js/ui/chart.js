// Year bar chart shared by the Ano screen and the wide month: 12 bars (≤ 18 px, 4 px top radius),
// grid lines with scale labels and month initials. The selected bar is olive, the others dim.
import { MONTHS, MONTH_INITIALS } from '../logic/format.js';
import { esc } from './dom.js';

const NBSP = ' ';
const MINUS = '−';
const grp = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);

// Scale label in euros, without the € sign: "1 500", "−250", "12,50".
export const euroTick = cents => {
  const e = Math.abs(cents) / 100;
  const t = Number.isInteger(e) ? grp(e) : e.toFixed(2).replace('.', ',');
  return (cents < 0 ? MINUS : '') + t;
};

function bar(v, lo, hi) {
  if (v === null || v === 0) return '';
  const span = hi - lo;
  const zero = -lo / span * 100;
  const height = Math.abs(v) / span * 100;
  return v > 0 ? `<i style="bottom:${zero}%;height:${height}%"></i>`
    : `<i class="negb" style="bottom:${zero - height}%;height:${height}%"></i>`;
}

// values: 12 numbers or null (no data); selected: month index 0-11;
// scale: { min, max, step, tick: v => scale label }; format(v, i): the bar's spoken value;
// label: the chart's accessible name; onSelectAttr: the bars' data-act (default "sel").
// Bars carry data-month (and data-v, the same index, as the Ano screen has always had).
export function barChart({ values, selected, scale, format, label = '', onSelectAttr = 'sel' }) {
  const { min: lo, max: hi, step, tick } = scale;
  const span = hi - lo;
  const grid = [];
  for (let v = lo; v <= hi; v += step) grid.push(v);
  return `<div class="chart" role="img" aria-label="${esc(label)}">
        ${grid.map(v => `<div class="gl ${v === 0 ? 'base' : ''}" style="bottom:${(v - lo) / span * 100}%"><span>${tick(v)}</span></div>`).join('')}
        <div class="cols">${values.map((v, i) => `<button class="${i === selected ? 'sel' : ''}" data-act="${esc(onSelectAttr)}" data-month="${i}" data-v="${i}" aria-label="${MONTHS[i]}: ${format(v, i)}">${bar(v, lo, hi)}</button>`).join('')}</div>
      </div>
      <div class="mlabels">${MONTH_INITIALS.map((n, i) => `<span class="${i === selected ? 'sel' : ''}">${n}</span>`).join('')}</div>`;
}
