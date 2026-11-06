/**
 * Apply documented corrections to case studies that already exist in the
 * Google Sheet (e.g. the original 50).
 *
 * A patch folder (e.g. data-source/existing-1-50/) holds a corrections.js:
 *   - imageCredits.from: Excel file whose sheets ("1", "2", …) have the
 *     "Image Credits: …" line in cell A22 → fills the new image_credits column
 *   - imageCredits.overrides: { id: [credits, reason] } to fix typos
 *   - otherDetails.from: same kind of Excel → texts written next to the
 *     options ("Other (specify)") fill the new other_details column
 *     (template: a file with the empty "Factsheet" sheet, to skip the
 *     template's example texts; fixes: { id: { "column": [text, reason] } })
 *   - fields: { id: { column: { from, to, reason } } }
 *   - githubImages: { fromId, toId } → link to the image in public/images
 *     in the new image_github column (Sheet only, not in caseStudies.json)
 *   - coordinates: { id: [lat, lng, place] } → latitude / longitude, written
 *     as the nightly sync writes them (formatCoordinateValue)
 *
 * The list of changes depends only on corrections.js (not on the current
 * JSON), so the generated files stay the same however many times it runs.
 *
 * Usage:
 *   node scripts/patch-existing-cases.js data-source/existing-1-50           # dry run
 *   node scripts/patch-existing-cases.js data-source/existing-1-50 --write   # + caseStudies.json
 *
 * Always writes, inside the patch folder:
 *   sheet-patch.csv  one row per cell to change in the Google Sheet
 *                    (id, column, current value, new value, reason)
 *   CHANGES.md       the same changes, grouped by case
 *
 * The Google Sheet stays the source of truth: the same changes must be made
 * there, or the nightly sync will undo them. --write only updates the local
 * JSON to preview the result.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { cleanCredits, text, extractSheet } = require('./import-excel-batch');
const { ARRAY_FIELDS } = require('./sync-approved');
const { buildOtherDetails, formatOtherDetails, parseOtherDetails } = require('./other-details');
const { localImageFile, githubImageUrl } = require('./image-links');
const { formatCoordinateValue } = require('./sync-approved');

const ROOT = path.resolve(__dirname, '..');
const CASE_STUDIES_PATH = path.join(ROOT, 'src/data/caseStudies.json');

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const md = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ↵ ');

// Columns that did not exist in the Google Sheet before these patches
const NEW_COLUMNS = ['image_credits', 'other_details', 'image_github'];
// Columns of the Google Sheet only: never written to caseStudies.json
const SHEET_ONLY_COLUMNS = ['image_github'];

/** JSON value → the text stored in the Google Sheet cell */
function sheetValue(column, value) {
  if (column === 'other_details') return formatOtherDetails(value, ARRAY_FIELDS);
  return value ?? '';
}

/** Google Sheet text → JSON value (as rowToStudy() in sync-approved.js does) */
function jsonValue(column, value) {
  if (column === 'other_details') return parseOtherDetails(value, ARRAY_FIELDS).details;
  return value;
}

// Where a new key goes, as in rowToStudy() in sync-approved.js: after the first of these keys the study has
const INSERT_AFTER = {
  latitude: ['sources', 'c5_impacts', 'has_digital_innovation'],
  longitude: ['latitude'],
  image_credits: ['longitude', 'sources', 'c5_impacts', 'has_digital_innovation'],
};

/** Set study[key] keeping the key order produced by rowToStudy() in sync-approved.js */
function setField(study, key, value) {
  const after = (INSERT_AFTER[key] || []).find(k => k in study);
  if (key in study || !after) return { ...study, [key]: value };
  const out = {};
  for (const [k, v] of Object.entries(study)) {
    out[k] = v;
    if (k === after) out[key] = value;
  }
  return out;
}

function main() {
  const dir = path.resolve(process.argv[2] || '');
  const write = process.argv.includes('--write');
  if (!process.argv[2] || !fs.existsSync(path.join(dir, 'corrections.js'))) {
    console.error('Usage: node scripts/patch-existing-cases.js <folder with corrections.js> [--write]');
    process.exit(1);
  }
  const cfg = require(path.join(dir, 'corrections.js'));
  let studies = JSON.parse(fs.readFileSync(CASE_STUDIES_PATH, 'utf8'));
  const byId = new Map(studies.map(s => [s.id, s]));

  const changes = []; // { id, column, from, to, reason }
  const warnings = [];

  const workbooks = new Map();
  const readWorkbook = rel => {
    const file = path.resolve(dir, rel);
    if (!workbooks.has(file)) workbooks.set(file, XLSX.readFile(file));
    return workbooks.get(file);
  };

  // 1) Image credits from the source Excel (cell A22 of each case sheet)
  if (cfg.imageCredits) {
    const overrides = cfg.imageCredits.overrides || {};
    const wb = readWorkbook(cfg.imageCredits.from);
    for (const name of wb.SheetNames.filter(n => /^\d+$/.test(n))) {
      const id = Number(name);
      if (!byId.has(id)) { warnings.push(`Foglio ${name}: nessun caso con id ${id} nel dataset`); continue; }
      const raw = text(wb.Sheets[name], 22, 1);
      if (!cleanCredits(raw)) { warnings.push(`Caso ${id}: crediti immagine assenti nella scheda`); continue; }
      const [to, reason] = overrides[id] || [cleanCredits(raw),
        'Crediti presi dalla scheda Excel originale (cella A22), senza il prefisso "Image Credits:".'];
      changes.push({ id, column: 'image_credits', from: '', to, reason, raw });
    }
  }

  // 2) Free texts next to the options ("Other (specify)") → other_details
  if (cfg.otherDetails) {
    const fixes = cfg.otherDetails.fixes || {};
    const wb = readWorkbook(cfg.otherDetails.from);
    const tmpl = cfg.otherDetails.template ? readWorkbook(cfg.otherDetails.template).Sheets.Factsheet : null;
    if (!tmpl) warnings.push('otherDetails: template senza foglio "Factsheet": i testi di esempio del template non vengono riconosciuti');
    for (const name of wb.SheetNames.filter(n => /^\d+$/.test(n))) {
      const id = Number(name);
      if (!byId.has(id)) continue; // already reported above
      const { log } = extractSheet(wb.Sheets[name], tmpl, id);
      const other = buildOtherDetails(log.notes, fixes[id]);
      warnings.push(...other.warnings.map(w => `Caso ${id}, ${w}`));
      const to = formatOtherDetails(other.details, ARRAY_FIELDS);
      if (!to) continue;
      const cleaning = other.changes.map(([label, from, , why]) => `${label.replace('other_details · ', '')} "${from}": ${why}`);
      const reason = 'Testi scritti accanto a "Other (specify)" nella scheda Excel originale.'
        + (cleaning.length ? ` ${cleaning.join(' ')}` : '');
      changes.push({ id, column: 'other_details', from: '', to, reason });
    }
  }

  // 3) Manual corrections
  for (const [idKey, fields] of Object.entries(cfg.fields || {})) {
    const id = Number(idKey);
    if (!byId.has(id)) { warnings.push(`Correzione per il caso ${id}, che non esiste nel dataset`); continue; }
    for (const [column, { from, to, reason }] of Object.entries(fields)) {
      changes.push({ id, column, from, to, reason });
    }
  }

  // 4) Links to the images on GitHub (new image_github column of the Sheet)
  if (cfg.githubImages) {
    const { fromId, toId } = cfg.githubImages;
    for (const id of [...byId.keys()].filter(n => n >= fromId && n <= toId)) {
      const to = githubImageUrl(localImageFile(id));
      if (!to) { warnings.push(`Caso ${id}: nessuna immagine in public/images`); continue; }
      changes.push({ id, column: 'image_github', from: '', to,
        reason: "Link all'immagine del caso nella repo GitHub (public/images), da cui la mostra il sito. Sostituisce il vecchio link imgbb (colonna image_url, eliminata)." });
    }
  }

  // 5) Coordinates that the website kept in a table in the code
  for (const [idKey, [lat, lng, place]] of Object.entries(cfg.coordinates || {})) {
    const id = Number(idKey);
    if (!byId.has(id)) { warnings.push(`Coordinate per il caso ${id}, che non esiste nel dataset`); continue; }
    const reason = `Coordinate che il sito usava già per la mappa (tabella nel codice src/data/cityCoordinates.js, eliminata): ${place}.`;
    changes.push({ id, column: 'latitude', from: '', to: formatCoordinateValue(lat), reason });
    changes.push({ id, column: 'longitude', from: '', to: formatCoordinateValue(lng), reason });
  }

  changes.sort((a, b) => a.id - b.id || a.column.localeCompare(b.column));

  // State of each change in the local JSON
  for (const c of changes) {
    if (SHEET_ONLY_COLUMNS.includes(c.column)) { c.state = 'solo Sheet'; continue; }
    const current = sheetValue(c.column, byId.get(c.id)[c.column]);
    if (current === c.to) c.state = 'applicata';
    else if (current === c.from) c.state = 'da applicare';
    else {
      c.state = 'valore inatteso';
      warnings.push(`Caso ${c.id}, ${c.column}: il valore attuale "${current}" non è né quello atteso ("${c.from}") né quello nuovo`);
    }
  }

  // ---- sheet-patch.csv ----
  const header = ['id', 'column', 'current_value', 'new_value', 'reason'];
  const csv = [header.join(',')]
    .concat(changes.map(c => [c.id, c.column, c.from, c.to, c.reason].map(csvCell).join(',')))
    .join('\r\n') + '\r\n';
  fs.writeFileSync(path.join(dir, 'sheet-patch.csv'), csv, 'utf8');

  // ---- CHANGES.md ----
  const date = new Date().toISOString().slice(0, 10);
  const out = [];
  out.push(`# Modifiche ai casi esistenti — ${path.basename(dir)}`);
  out.push('');
  out.push(`> File generato da \`scripts/patch-existing-cases.js\` il ${date}. Non modificarlo a mano: cambia \`corrections.js\` e rilancia lo script.`);
  out.push('> Il registro ragionato di tutte le modifiche ai dati è in `../REPORT-DATI.md`.');
  out.push('> Le stesse modifiche sono in `sheet-patch.csv`, da riportare nel Google Sheet.');
  out.push('');
  out.push(`Modifiche: **${changes.length}** su **${new Set(changes.map(c => c.id)).size}** casi · avvisi: **${warnings.length}**`);
  out.push('');
  out.push('| Caso | Titolo | Colonna | Valore attuale nel Google Sheet | Nuovo valore | Motivo |');
  out.push('|---|---|---|---|---|---|');
  for (const c of changes) {
    const from = c.from ? md(c.from) : (NEW_COLUMNS.includes(c.column) ? '(colonna nuova)' : '(vuoto)');
    out.push(`| ${c.id} | ${md(byId.get(c.id).title)} | ${c.column} | ${from} | ${md(c.to)} | ${md(c.reason)} |`);
  }
  out.push('');
  if (warnings.length) {
    out.push('**Avvisi:**');
    out.push('');
    for (const w of warnings) out.push(`- ⚠️ ${md(w)}`);
    out.push('');
  }
  fs.writeFileSync(path.join(dir, 'CHANGES.md'), out.join('\n'), 'utf8');

  if (write) {
    studies = studies.map(s => changes.filter(c => c.id === s.id && !SHEET_ONLY_COLUMNS.includes(c.column)).reduce((acc, c) => setField(acc, c.column, jsonValue(c.column, c.to)), s));
    fs.writeFileSync(CASE_STUDIES_PATH, JSON.stringify(studies, null, 2) + '\n', 'utf8');
    console.log(`caseStudies.json: ${changes.filter(c => !['applicata', 'solo Sheet'].includes(c.state)).length} changes applied`);
  }
  const pending = changes.filter(c => c.state === 'da applicare').length;
  console.log(`Changes: ${changes.length} (pending in local JSON before this run: ${pending}) · warnings: ${warnings.length}`);
  console.log(`Wrote ${path.relative(ROOT, path.join(dir, 'sheet-patch.csv'))} and CHANGES.md`);
}

main();
