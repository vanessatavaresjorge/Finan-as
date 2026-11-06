import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEur, formatPct, parseCents, validateAmount, centsToInput, todayISO, shortDate, monthTitle, addMonths } from '../js/logic/format.js';

const S = ' ';
test('formatEur', () => {
  assert.equal(formatEur(134300), `1${S}343,00${S}€`);
  assert.equal(formatEur(5), `0,05${S}€`);
  assert.equal(formatEur(-1200), `−12,00${S}€`);
  assert.equal(formatEur(999999999), `9${S}999${S}999,99${S}€`);
});
test('formatPct', () => {
  assert.equal(formatPct(0.553), '55%'); assert.equal(formatPct(-0.12), '−12%'); assert.equal(formatPct(null), '—');
});
test('parseCents accepts common ways of typing', () => {
  for (const [t, c] of [['12,5',1250],['12,50',1250],['12.5',1250],['1 234,56',123456],['1.234,56',123456],[' 7 € ',700],['0,05',5],['12',1200]])
    assert.equal(parseCents(t), c, t);
});
test('parseCents refuses malformed input', () => {
  for (const t of ['', 'abc', '12,505', '-5', '1,2,3', '12,', '1.234']) assert.equal(parseCents(t), null, t);
});
test('validateAmount', () => {
  assert.equal(validateAmount(null), 'Escreve um valor maior que zero.');
  assert.equal(validateAmount(0), 'Escreve um valor maior que zero.');
  assert.equal(validateAmount(1000000000), `O valor máximo é ${formatEur(999999999)}.`);
  assert.equal(validateAmount(999999999), null);
});
test('centsToInput', () => assert.equal(centsToInput(1250), '12,50'));
test('todayISO uses the local date', () => {
  assert.equal(todayISO(new Date(2026, 10, 6, 0, 30)), '2026-11-06');
  assert.equal(todayISO(new Date(2026, 10, 5, 23, 59)), '2026-11-05');
});
test('dates', () => {
  assert.equal(shortDate('2026-11-05'), '5 nov');
  assert.equal(monthTitle('2026-11'), 'Novembro 2026');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addMonths('2026-12', 1), '2027-01');
});
