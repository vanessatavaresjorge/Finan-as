import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildXlsx } from '../js/xlsx.js';

const tmp = fs.mkdtempSync(os.tmpdir() + '/xlsx-');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
let n = 0;
function write(bytes) { const f = path.join(tmp, `t${n++}.xlsx`); fs.writeFileSync(f, bytes); return f; }
function unzipTo(f) { const d = path.join(tmp, `d${n++}`); execFileSync('unzip', ['-q', f, '-d', d]); return d; }
function xmlFilesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter(e => e.isFile() && /\.(xml|rels)$/.test(e.name))
    .map(e => path.join(e.parentPath ?? e.path, e.name));
}
function part(bytes, name) { return execFileSync('unzip', ['-p', write(bytes), name]).toString(); }

const sheets = [
  { name: 'Totais', columns: [{header:'Mês',type:'month'},{header:'Perfil',type:'string'},{header:'Categoria',type:'string'},{header:'Valor (€)',type:'number'}],
    rows: [['2026-11','Ana','Casa & Jardim <x> "y" 🏠', 363.15], ['2026-01','Rui','Carro', 20]] },
  { name: 'Resumo', columns: [{header:'Mês',type:'month'},{header:'Taxa de poupança',type:'percent'}], rows: [['2026-11',0.55],['2026-12',null]] },
];

test('zip is valid and has every part', () => {
  const f = write(buildXlsx(sheets));
  execFileSync('unzip', ['-tq', f]);
  const list = execFileSync('unzip', ['-Z1', f]).toString().split('\n');
  for (const p of ['[Content_Types].xml','_rels/.rels','docProps/app.xml','docProps/core.xml','xl/workbook.xml','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/worksheets/sheet1.xml','xl/worksheets/sheet2.xml'])
    assert.ok(list.includes(p), p);
});

test('every XML part is well-formed', () => {
  const f = write(buildXlsx(sheets)); const dir = unzipTo(f);
  const files = xmlFilesUnder(dir);
  assert.ok(files.length >= 9, String(files.length));
  for (const x of files) execFileSync('xmllint', ['--noout', x]);
});

test('cells: names escaped, numbers numeric, months as serials, null percent empty', () => {
  const s1 = part(buildXlsx(sheets), 'xl/worksheets/sheet1.xml');
  assert.ok(s1.includes('Casa &amp; Jardim &lt;x&gt; &quot;y&quot; 🏠'));
  assert.match(s1, /<c r="D2"[^>]*><v>363\.15<\/v>/);
  assert.match(s1, /<c r="A2"[^>]*><v>46327<\/v>/);
  assert.match(s1, /<autoFilter ref="A1:D3"\/>/);
  const s2 = part(buildXlsx(sheets), 'xl/worksheets/sheet2.xml');
  assert.match(s2, /<c r="B2"[^>]*><v>0\.55<\/v>/);
  assert.ok(!/<c r="B3"[^>]*><v>/.test(s2));
  assert.ok(part(buildXlsx(sheets), 'xl/workbook.xml').includes('name="Resumo"'));
});

test('header bold, first row frozen, widths, invalid XML chars removed', () => {
  const bytes = buildXlsx([{ name: 'A', columns: [{header:'x',type:'string',width:30},{header:"it's",type:'string'}], rows: [['a\u0001b￾c', null]] }]);
  const s = part(bytes, 'xl/worksheets/sheet1.xml');
  assert.match(s, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.match(s, /<col min="1" max="1" width="30" customWidth="1"\/>/);
  assert.match(s, /<col min="2" max="2" width="14" customWidth="1"\/>/);
  assert.ok(s.includes('it&apos;s'));
  assert.ok(s.includes('<t xml:space="preserve">abc</t>'));
  const styles = part(bytes, 'xl/styles.xml');
  assert.match(styles, /<b\/>/);
  assert.match(styles, /formatCode="mmm yyyy"/);
  assert.match(styles, /formatCode="#,##0.00"/);
  assert.match(part(bytes, 'xl/workbook.xml'), /_xlnm\._FilterDatabase/);
});

test('month serials', () => {
  const s = part(buildXlsx([{ name: 'M', columns: [{header:'m',type:'month'}], rows: [['1900-03'],['2026-01']] }]), 'xl/worksheets/sheet1.xml');
  assert.match(s, /<c r="A2"[^>]*><v>61<\/v>/);
  assert.match(s, /<c r="A3"[^>]*><v>46023<\/v>/);
});

test('sheet names made safe for Excel', () => {
  const wb = part(buildXlsx([
    { name: 'a/b:c*?[x]\\', columns: [{header:'h',type:'string'}], rows: [] },
    { name: 'Totais', columns: [{header:'h',type:'string'}], rows: [] },
    { name: 'totais', columns: [{header:'h',type:'string'}], rows: [] },
    { name: 'x'.repeat(40), columns: [{header:'h',type:'string'}], rows: [] },
    { name: "'q'", columns: [{header:'h',type:'string'}], rows: [] },
  ]), 'xl/workbook.xml');
  const names = [...wb.matchAll(/<sheet name="([^"]*)"/g)].map(m => m[1]);
  assert.deepEqual(names, ['a b c   x', 'Totais', 'totais 2', 'x'.repeat(31), 'q']);
});
