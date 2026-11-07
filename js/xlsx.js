// Builds a small .xlsx file (a ZIP of XML parts, stored without compression) with no libraries.
// Runs in browsers and in Node: only TextEncoder, Uint8Array and DataView.
// buildXlsx([{name, columns:[{header, type:'string'|'number'|'month'|'percent', width?}], rows:[[...]]}]) → Uint8Array

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_PKG_R = 'http://schemas.openxmlformats.org/package/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// Style indexes in cellXfs (see stylesXml).
const STYLE = { header: 1, month: 2, number: 3, percent: 4 };

// Characters XML 1.0 does not allow (control chars, lone surrogates, U+FFFE/U+FFFF) are dropped.
const INVALID = /[^\t\n\r\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu;
function esc(s) {
  return String(s).replace(INVALID, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s;
  return s;
}

// 'YYYY-MM' → Excel serial (days since 1899-12-30) of the 1st of that month.
function monthSerial(ym) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym));
  if (!m) return null;
  return Math.round((Date.UTC(+m[1], +m[2] - 1, 1) - Date.UTC(1899, 11, 30)) / 86400000);
}

function cell(ref, type, value) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'string') return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
  const v = type === 'month' ? monthSerial(value) : value;
  if (typeof v !== 'number' || !Number.isFinite(v)) return '';
  return `<c r="${ref}" s="${STYLE[type]}"><v>${v}</v></c>`;
}

// Excel refuses sheet names over 31 chars, with []:*?/\ , empty, or repeated.
function sheetNames(sheets) {
  const used = new Set();
  return sheets.map((s, i) => {
    const base = String(s.name ?? '').replace(INVALID, '').replace(/[[\]:*?/\\]/g, ' ').trim().replace(/^'+|'+$/g, '').trim().slice(0, 31) || `Folha ${i + 1}`;
    let name = base;
    for (let k = 2; used.has(name.toLowerCase()); k++) name = `${base.slice(0, 31 - String(k).length - 1)} ${k}`;
    used.add(name.toLowerCase());
    return name;
  });
}

function sheetXml(sheet) {
  const cols = sheet.columns;
  const last = colName(Math.max(cols.length, 1) - 1);
  const range = `A1:${last}${sheet.rows.length + 1}`;
  const header = `<row r="1">${cols.map((c, i) =>
    `<c r="${colName(i)}1" s="${STYLE.header}" t="inlineStr"><is><t xml:space="preserve">${esc(c.header)}</t></is></c>`).join('')}</row>`;
  const body = sheet.rows.map((row, r) =>
    `<row r="${r + 2}">${cols.map((c, i) => cell(`${colName(i)}${r + 2}`, c.type, row[i])).join('')}</row>`).join('');
  const widths = cols.map((c, i) =>
    `<col min="${i + 1}" max="${i + 1}" width="${Number(c.width) > 0 ? Number(c.width) : 14}" customWidth="1"/>`).join('');
  return HEAD + `<worksheet xmlns="${NS}" xmlns:r="${NS_R}">` +
    `<dimension ref="${range}"/>` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '<selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (widths ? `<cols>${widths}</cols>` : '') +
    `<sheetData>${header}${body}</sheetData>` +
    `<autoFilter ref="${range}"/>` +
    '<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '</worksheet>';
}

function workbookXml(sheets, names) {
  const list = names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('');
  const filters = sheets.map((s, i) => {
    const last = colName(Math.max(s.columns.length, 1) - 1);
    const quoted = `'${names[i].replace(/'/g, "''")}'`;
    return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${esc(`${quoted}!$A$1:$${last}$${s.rows.length + 1}`)}</definedName>`;
  }).join('');
  return HEAD + `<workbook xmlns="${NS}" xmlns:r="${NS_R}">` +
    '<bookViews><workbookView activeTab="0"/></bookViews>' +
    `<sheets>${list}</sheets>` +
    (filters ? `<definedNames>${filters}</definedNames>` : '') +
    '</workbook>';
}

const STYLES = HEAD + `<styleSheet xmlns="${NS}">` +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="mmm yyyy"/><numFmt numFmtId="165" formatCode="#,##0.00"/></numFmts>' +
  '<fonts count="2"><font><sz val="12"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="12"/><name val="Calibri"/><family val="2"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="5">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="9" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function contentTypes(n) {
  const sheets = Array.from({ length: n }, (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
  return HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheets +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
    '</Types>';
}

const ROOT_RELS = HEAD + `<Relationships xmlns="${NS_PKG_R}">` +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
  '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
  '</Relationships>';

function workbookRels(n) {
  const sheets = Array.from({ length: n }, (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="${NS_R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('');
  return HEAD + `<Relationships xmlns="${NS_PKG_R}">${sheets}` +
    `<Relationship Id="rId${n + 1}" Type="${NS_R}/styles" Target="styles.xml"/></Relationships>`;
}

const APP = HEAD + '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" ' +
  'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Finanças</Application></Properties>';
const CORE = HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
  'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ' +
  'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
  '<dc:creator>Finanças</dc:creator></cp:coreProperties>';

// ---- ZIP (stored, no compression) ----

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

const DOS_TIME = 0;                          // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1;    // 1980-01-01
const UTF8_FLAG = 0x0800;

function zip(files) {
  const enc = new TextEncoder();
  const entries = files.map(([name, text]) => {
    const nameBytes = enc.encode(name), data = enc.encode(text);
    return { nameBytes, data, crc: crc32(data) };
  });
  const localSize = entries.reduce((s, e) => s + 30 + e.nameBytes.length + e.data.length, 0);
  const centralSize = entries.reduce((s, e) => s + 46 + e.nameBytes.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const dv = new DataView(out.buffer);
  let p = 0;
  const offsets = [];
  for (const e of entries) {
    offsets.push(p);
    dv.setUint32(p, 0x04034b50, true); dv.setUint16(p + 4, 20, true); dv.setUint16(p + 6, UTF8_FLAG, true);
    dv.setUint16(p + 8, 0, true); dv.setUint16(p + 10, DOS_TIME, true); dv.setUint16(p + 12, DOS_DATE, true);
    dv.setUint32(p + 14, e.crc, true); dv.setUint32(p + 18, e.data.length, true); dv.setUint32(p + 22, e.data.length, true);
    dv.setUint16(p + 26, e.nameBytes.length, true); dv.setUint16(p + 28, 0, true);
    out.set(e.nameBytes, p + 30); p += 30 + e.nameBytes.length;
    out.set(e.data, p); p += e.data.length;
  }
  const centralStart = p;
  entries.forEach((e, i) => {
    dv.setUint32(p, 0x02014b50, true); dv.setUint16(p + 4, 20, true); dv.setUint16(p + 6, 20, true);
    dv.setUint16(p + 8, UTF8_FLAG, true); dv.setUint16(p + 10, 0, true);
    dv.setUint16(p + 12, DOS_TIME, true); dv.setUint16(p + 14, DOS_DATE, true);
    dv.setUint32(p + 16, e.crc, true); dv.setUint32(p + 20, e.data.length, true); dv.setUint32(p + 24, e.data.length, true);
    dv.setUint16(p + 28, e.nameBytes.length, true); dv.setUint16(p + 30, 0, true); dv.setUint16(p + 32, 0, true);
    dv.setUint16(p + 34, 0, true); dv.setUint16(p + 36, 0, true); dv.setUint32(p + 38, 0, true);
    dv.setUint32(p + 42, offsets[i], true);
    out.set(e.nameBytes, p + 46); p += 46 + e.nameBytes.length;
  });
  dv.setUint32(p, 0x06054b50, true); dv.setUint16(p + 4, 0, true); dv.setUint16(p + 6, 0, true);
  dv.setUint16(p + 8, entries.length, true); dv.setUint16(p + 10, entries.length, true);
  dv.setUint32(p + 12, centralSize, true); dv.setUint32(p + 16, centralStart, true); dv.setUint16(p + 20, 0, true);
  return out;
}

export function buildXlsx(sheets) {
  const names = sheetNames(sheets);
  return zip([
    ['[Content_Types].xml', contentTypes(sheets.length)],
    ['_rels/.rels', ROOT_RELS],
    ['docProps/app.xml', APP],
    ['docProps/core.xml', CORE],
    ['xl/workbook.xml', workbookXml(sheets, names)],
    ['xl/_rels/workbook.xml.rels', workbookRels(sheets.length)],
    ['xl/styles.xml', STYLES],
    ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s)]),
  ]);
}
