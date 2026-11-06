/**
 * Tests of google-apps-script.js (pure functions only, no Google services)
 * and a dry run of the final Google Sheet update with the real data:
 *
 *   current Sheet (cases 1–50 as they are today)
 *     → apply data-source/existing-1-50/sheet-patch.csv   (planPatch)
 *     → import data-source/nbs-51-78/sheet-rows.csv       (planImport)
 *     → export for the sync                               (buildExport)
 *     → rowToStudy() of scripts/sync-approved.js
 *   must give exactly src/data/caseStudies.json; then the sync itself is run
 *   against a simulated web app (export, images, safety checks).
 *
 * Usage: node scripts/test-apps-script.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const { parseCSV, rowToStudy, ARRAY_FIELDS } = require('./sync-approved');
const { formatOtherDetails } = require('./other-details');

const ROOT = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(ROOT, 'google-apps-script.js'), 'utf8');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(`${code}\nthis.__c = { HEADERS, LISTS, PRIVATE_COLUMNS, FIELDS_WITH_OTHER, SNAPSHOT_CHUNK };`, ctx);
const G = ctx;
const C = ctx.__c;

// Values created inside the vm have another Array prototype: compare plain copies
const plain = x => JSON.parse(JSON.stringify(x));

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n${err.stack}`);
    process.exitCode = 1;
  }
}

// ---- Fixtures: the Submissions tab as it is today (51 columns, see REPORT-DATI §6):
// the columns up to d6_urban_spaces, then image_url (imgbb) and sources
const CURRENT_HEADERS = C.HEADERS.slice(0, C.HEADERS.indexOf('other_details')).concat(['image_url', 'sources']);
const json = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/caseStudies.json'), 'utf8'));
const patch = parseCSV(fs.readFileSync(path.join(ROOT, 'data-source/existing-1-50/sheet-patch.csv'), 'utf8'));

/** caseStudies.json entry → Sheet row object (strings, booleans as in the Sheet) */
function studyToSheetRecord(s) {
  const r = { id: String(s.id), status: 'approved', submitted_at: '2026-03-10T14:02:39.26' };
  for (const h of C.HEADERS) {
    if (h in r) continue;
    const v = s[h];
    if (h === 'talea_application') r[h] = Object.keys(v || {}).filter(k => v[k]).map(k => k[0].toUpperCase() + k.slice(1)).join(', ');
    else if (h === 'other_details') r[h] = formatOtherDetails(v, ARRAY_FIELDS);
    else if (Array.isArray(v)) r[h] = v.join(', ');
    else if (typeof v === 'boolean') r[h] = v ? 'TRUE' : 'FALSE';
    else r[h] = v === undefined ? '' : String(v);
  }
  return r;
}

// Cases 1–50 with the values they have in the Sheet before the patch
const currentRecords = json.filter(s => s.id <= 50).map(s => {
  const r = studyToSheetRecord(s);
  for (const p of patch.filter(x => Number(x.id) === s.id)) r[p.column] = p.current_value;
  r.image_url = `https://i.ibb.co/x/talea-cs-${s.id}.jpg`; // old column, not exported any more
  return r;
});
currentRecords.push({ id: '51', status: 'denied', submitted_at: '2026-03-11T07:12:24.783Z', title: 'TEST SUBMISSION' });

console.log('google-apps-script.js');

test('lists are generated from filterConfig', () => {
  assert.deepStrictEqual(plain(C.LISTS.size), ['Small', 'Medium', 'Large']);
  assert.ok(C.LISTS.a3_3_infrastructures.includes('Underpass'));
  assert.ok(C.FIELDS_WITH_OTHER.includes('c3_goals'));
  assert.ok(!C.FIELDS_WITH_OTHER.includes('d1_plants'));
});

test('neutralizeFormula keeps formulas as text, numbers as numbers', () => {
  assert.strictEqual(G.neutralizeFormula('=IMPORTXML("x")'), '\'=IMPORTXML("x")');
  assert.strictEqual(G.neutralizeFormula('- first impact'), "'- first impact");
  assert.strictEqual(G.neutralizeFormula('@me'), "'@me");
  assert.strictEqual(G.neutralizeFormula('-33.86'), '-33.86');
  assert.strictEqual(G.neutralizeFormula('Milan'), 'Milan');
  assert.strictEqual(G.neutralizeFormula(true), true);
});

test('missing columns are inserted in place, nothing else moves', () => {
  const { plan, headers } = G.planMissingColumns(CURRENT_HEADERS);
  // image_url (obsolete) stays where it is until Configura deletes it
  const expected = plain(C.HEADERS);
  expected.splice(expected.indexOf('sources'), 0, 'image_url');
  assert.deepStrictEqual(plain(headers), expected);
  assert.deepStrictEqual(plain(plan.map(p => `${p.header}>${p.after}`)), [
    'other_details>d6_urban_spaces', 'image_drive>other_details', 'image_github>image_drive', 'image_credits>image_github',
    'checks>sources', 'changed_fields>checks', 'review_notes>changed_fields', 'submitter_name>review_notes', 'submitter_email>submitter_name',
  ]);
  assert.strictEqual(G.planMissingColumns(C.HEADERS).plan.length, 0);
  // unknown extra columns of the sheet stay where they are
  assert.deepStrictEqual(plain(G.planMissingColumns(['id', 'my_notes', 'status']).headers).slice(0, 3), ['id', 'my_notes', 'status']);
});

test('all 77 cases pass validation (except the known TALEA gap of #73)', () => {
  const problems = json.map(s => [s.id, G.validateRecord(studyToSheetRecord(s), {})]).filter(([, p]) => p.length);
  assert.deepStrictEqual(problems.map(([id, p]) => `${id}: ${p.join('; ')}`), ['73: manca talea_application']);
});

test('validation finds wrong values', () => {
  const r = Object.assign(studyToSheetRecord(json[0]), {
    size: 'Huge', a2_urban_area: 'Peripheral area, Moon base, Other', status: 'live',
    latitude: '200', longitude: 'abc', other_details: 'a2_urban_area: ok\nwrong line', submitter_email: 'nope',
  });
  const p = G.validateRecord(r, {});
  assert.ok(p.some(x => x.startsWith('size: "Huge"')));
  assert.ok(p.some(x => x.includes('"Moon base"')));
  assert.ok(!p.some(x => x.includes('"Other"')), 'Other is allowed in A2');
  assert.ok(p.some(x => x.startsWith('status')));
  assert.ok(p.includes('coordinate non valide'));
  assert.ok(p.some(x => x.includes('wrong line')));
  assert.ok(p.includes('submitter_email non valida'));
  assert.ok(G.validateRecord({ title: 'x' }, { submit: true }).includes('manca submitter_email'));
});

test('submissions cannot set status, id or private columns', () => {
  const { record } = G.buildSubmissionRecord({
    id: '5', status: 'approved', checks: '', image_drive: 'abc', image_github: 'x', changed_fields: 'title', title: ' Park ', has_social_innovation: 'true',
    submitter_email: 'a@b.it', submitter_name: 'Ann', unknown: 'x', description: 'x'.repeat(30000),
  });
  assert.strictEqual(record.id, undefined);
  assert.strictEqual(record.status, undefined);
  assert.strictEqual(record.image_drive, undefined);
  assert.strictEqual(record.image_github, undefined);
  assert.strictEqual(record.changed_fields, undefined);
  assert.strictEqual(record.unknown, undefined);
  assert.strictEqual(record.title, 'Park');
  assert.strictEqual(record.has_social_innovation, true);
  assert.strictEqual(record.submitter_email, 'a@b.it');
  assert.strictEqual(record.description.length, 20000);
});

test('trusted users: email + personal code', () => {
  const list = [['Uff@Comune.it', 'Ufficio', 'k7x', ''], ['free@x.org', 'Libero', '', '']];
  assert.strictEqual(G.isTrusted('uff@comune.it', 'k7x', list), true);
  assert.strictEqual(G.isTrusted('uff@comune.it', 'wrong', list), false);
  assert.strictEqual(G.isTrusted('uff@comune.it', '', list), false);
  assert.strictEqual(G.isTrusted('free@x.org', '', list), true);
  assert.strictEqual(G.isTrusted('other@x.org', 'k7x', list), false);
});

test('rate limit counts the last 24 hours, trusted users excluded from the total', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  const rows = [
    { submitted_at: '2026-11-06T10:00:00Z', submitter_email: 'a@x.it' },
    { submitted_at: '2026-11-06T09:00:00Z', submitter_email: 'A@x.it' },
    { submitted_at: '2026-11-04T09:00:00Z', submitter_email: 'a@x.it' },
    { submitted_at: new Date('2026-11-06T11:00:00Z'), submitter_email: 'trusted@x.it' },
    { submitted_at: '2026-03-10T14:02:39.26', submitter_email: '' },
  ];
  const r = G.countRecent(rows, 'a@x.it', now, { 'trusted@x.it': true });
  assert.strictEqual(r.byEmail, 2);
  assert.strictEqual(r.total, 2);
});

test('image data URLs', () => {
  const img = G.parseImageDataUrl('data:image/png;base64,iVBORw0KGgo=');
  assert.strictEqual(img.ext, 'png');
  assert.strictEqual(img.bytes, 9);
  assert.strictEqual(G.parseImageDataUrl('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.strictEqual(G.parseImageDataUrl('https://example.com/a.png'), null);
});

test('cells as text, the same in every locale', () => {
  assert.strictEqual(G.cellText(true, 'VERO'), 'TRUE');
  assert.strictEqual(G.cellText(false, 'FALSO'), 'FALSE');
  assert.strictEqual(G.cellText(45.4861, '45,486100'), '45.4861');
  assert.strictEqual(G.cellText(2015, '2015'), '2015');
  assert.strictEqual(G.cellText(vm.runInContext("new Date('2026-03-10T14:02:39Z')", ctx), '10/03/2026 15:02'), '10/03/2026 15:02');
  assert.strictEqual(G.cellText('=not a formula', '=not a formula'), '=not a formula');
  assert.deepStrictEqual(plain(G.textRows([[true, 1.5, 'x']], [['VERO', '1,5', 'x']])), [['TRUE', '1.5', 'x']]);
});

test('image links: Drive id from any link, GitHub path like the sync', () => {
  const id = '1AbC-dEf_GhIjKlMnOp';
  assert.strictEqual(G.driveFileId(G.driveFileUrl(id)), id);
  assert.strictEqual(G.driveFileId(`https://drive.google.com/file/d/${id}/view?usp=drivesdk`), id);
  assert.strictEqual(G.driveFileId(`https://drive.google.com/open?id=${id}`), id);
  assert.strictEqual(G.driveFileId(id), id);
  assert.strictEqual(G.driveFileId('not a link'), '');
  assert.strictEqual(G.driveFileId(''), '');
  assert.strictEqual(G.githubImageUrl(78, 'jpg'), 'https://github.com/TALEA-platform/nbstoolkit/blob/main/public/images/cs_78.jpg');
  // same link as scripts/image-links.js (used for cases 1–77)
  assert.strictEqual(G.githubImageUrl(78, 'jpg'), require('./image-links').githubImageUrl('cs_78.jpg'));
});

test('import turns TRUE/FALSE texts into real booleans', () => {
  const plan = G.planImport(['id', 'title', 'has_social_innovation', 'has_digital_innovation', 'has_physical_innovation'], [],
    ['id', 'title', 'has_social_innovation', 'has_digital_innovation'], [['90', 'X', 'TRUE', 'false']]);
  assert.deepStrictEqual(plain(plan.append), [['90', 'X', true, false, '']]);
});

test('plain-text columns: everything but id and the checkboxes', () => {
  const runs = plain(G.textColumnRuns(['id', 'status', 'title', 'latitude', 'has_social_innovation', 'has_digital_innovation', 'description', '', 'sources']));
  assert.deepStrictEqual(runs, [{ start: 1, length: 3 }, { start: 6, length: 1 }, { start: 8, length: 1 }]);
  const calls = [];
  const sheet = { getRange: (r, c, nr, nc) => ({ setNumberFormat: f => calls.push([r, c, nr, nc, f]) }) };
  G.setTextFormat(sheet, ['id', 'title', 'latitude', 'has_social_innovation', 'sources'], 5, 2);
  assert.deepStrictEqual(calls, [[5, 2, 2, 2, '@'], [5, 5, 2, 1, '@']]);
});

test('Scheda: edits in column B → values for Submissions, read-only rows and formulas refused', () => {
  const rows = plain(G.cardRows(C.HEADERS));
  const at = column => 3 + rows.findIndex(r => r.column === column); // row of the Scheda
  const groupRow = 3 + rows.findIndex(r => r.group && r.group.name === 'Informazioni');
  const plan = plain(G.planCardEdit(C.HEADERS, [
    { row: at('city'), value: 'Vienna', display: 'Vienna', formula: '' },
    { row: at('latitude'), value: 44.4949, display: '44,4949', formula: '' }, // pasted with its number format
    { row: at('has_social_innovation'), value: true, display: 'VERO', formula: '' },
    { row: at('has_digital_innovation'), value: 'vero', display: 'vero', formula: '' },
    { row: at('size'), value: '', display: '', formula: '' }, // cleared: allowed, "checks" reports it
    { row: at('status'), value: 'approved', display: 'approved', formula: '' },
    { row: at('id'), value: '99', display: '99', formula: '' },
    { row: at('image_github'), value: 'x', display: 'x', formula: '' },
    { row: at('description'), value: 2, display: '2', formula: '=1+1' },
    { row: groupRow, value: 'x', display: 'x', formula: '' },
    { row: 3 + rows.length, value: 'my note', display: 'my note', formula: '' }, // below the card
  ]));
  assert.deepStrictEqual(plan.writes, [
    { column: 'city', value: 'Vienna' },
    { column: 'latitude', value: '44.4949' },
    { column: 'has_social_innovation', value: true },
    { column: 'has_digital_innovation', value: true },
    { column: 'size', value: '' },
    { column: 'status', value: 'approved' },
  ]);
  assert.deepStrictEqual(plan.refused.map(x => x.label), ['ID', 'Immagine (GitHub)', 'Descrizione', 'Informazioni']);
  assert.match(plan.refused[2].reason, /formule/);
  const bad = plain(G.planCardEdit(C.HEADERS, [{ row: at('status'), value: 'maybe', display: 'maybe', formula: '' }]));
  assert.deepStrictEqual([bad.writes, bad.refused.length], [[], 1]);

  // What the card shows: real true/false for the checkboxes, formulas kept as text
  assert.strictEqual(G.cardCellValue('has_physical_innovation', 'TRUE'), true);
  assert.strictEqual(G.cardCellValue('has_physical_innovation', ''), false);
  assert.strictEqual(G.cardCellValue('title', '=1+1'), "'=1+1");
  assert.strictEqual(G.cardCellValue('latitude', '44.4949'), '44.4949');
  // Plain-text format on every row of column B but the three checkboxes (one range call per run)
  const runs = plain(G.runsOf(rows, r => !['has_physical_innovation', 'has_social_innovation', 'has_digital_innovation'].includes(r.column)));
  assert.strictEqual(runs.length, 2);
  assert.strictEqual(runs[0].length + runs[1].length, rows.length - 3);
  // Dropdowns, checkboxes and read-only rows are the same in Submissions and in the Scheda
  assert.match(G.columnNote('a2_urban_area'), /Scegli i valori/);
  assert.match(G.columnNote('latitude'), /^Informazioni — Latitudine/);
});

test('import refuses values that the CSV import turned into dates or times', () => {
  const when = vm.runInContext('new Date(Date.UTC(2026, 2, 10, 14, 2, 44))', ctx);
  const time = vm.runInContext('new Date(1899, 11, 30, 126, 29)', ctx);
  const plan = G.planImport(['id', 'submitted_at', 'latitude', 'title'], [], ['id', 'submitted_at', 'latitude', 'title'],
    [['90', when, time, 'X'], ['91', when, '44.4949', 'Y']]);
  assert.deepStrictEqual(plain(plan.converted), [{ id: '90', column: 'latitude' }]);
  assert.deepStrictEqual(plain(plan.append[1]), ['91', '2026-03-10T14:02:44.000Z', '44.4949', 'Y']);
});

test('change tracking: snapshots, differences, changed fields', () => {
  const headers = ['id', 'status', 'title', 'checks', 'changed_fields', 'description', 'image_github', 'my_notes'];
  const original = G.trackedRecord(headers, ['7', 'pending', 'Park', 'manca city', '', 'Line 1\r\nLine 2', '', 'x']);
  assert.deepStrictEqual(plain(original), { id: '7', status: 'pending', title: 'Park', description: 'Line 1\nLine 2', image_github: '' });
  const now = Object.assign({}, original, { status: 'approved', title: 'Green park', image_github: 'https://github.com/x' });
  assert.deepStrictEqual(plain(G.diffRecords(original, now)).map(d => d.column), ['status', 'title', 'image_github']);
  assert.deepStrictEqual(plain(G.changedFields(original, now)), ['title']);
  // TRUE/true and trailing spaces are not changes; columns missing from the row now are not compared
  assert.deepStrictEqual(plain(G.diffRecords({ id: '7', has_social_innovation: 'true', title: 'A ' }, { id: '7', has_social_innovation: 'TRUE', title: 'A' })), []);
  assert.deepStrictEqual(plain(G.diffRecords({ id: '7', designer: 'Ann' }, { id: '7' })), []);
  // a new column (empty) is not a change
  assert.deepStrictEqual(plain(G.diffRecords({ id: '7' }, { id: '7', image_github: '' })), []);

  const cells = G.encodeSnapshot(original);
  assert.strictEqual(cells.length, 1);
  assert.ok(cells[0].startsWith('~'));
  assert.deepStrictEqual(plain(G.decodeSnapshot(cells.concat(['', '']))), plain(original));
  assert.strictEqual(G.decodeSnapshot(['', '']), null);
  assert.strictEqual(G.decodeSnapshot(['~{broken']), null);
  // long rows go over more cells, never more than a cell can hold; emoji are not cut in half
  const long = { id: '8', description: 'x'.repeat(C.SNAPSHOT_CHUNK - 18) + '🌳'.repeat(30), c5_impacts: 'é'.repeat(60000) };
  const parts = G.encodeSnapshot(long);
  assert.ok(parts.length >= 3);
  assert.ok(parts.every(p => p.length <= 50000 && p.startsWith('~')));
  assert.ok(parts.every(p => !/[\uD800-\uDBFF]$/.test(p)));
  assert.deepStrictEqual(plain(G.decodeSnapshot(parts)), long);
});

test('notification email: every filled field, escaped, readable on a phone', () => {
  const html = G.proposalHtml({
    id: 79, title: 'Park <script>', city: 'Milan', country: 'Italy', year: '2024', checks: 'manca size',
    description: 'Line 1\nLine 2 & more', has_social_innovation: true, has_digital_innovation: false,
    image_drive: 'https://drive.google.com/file/d/1AbC-dEf_GhIjKlMnOp/view', image_github: 'https://github.com/x',
    submitter_email: 'a@b.it', a2_urban_area: 'Peripheral area, Other',
  }, 'https://docs.google.com/spreadsheets/d/x/edit#gid=0&range=A80');
  assert.ok(html.includes('#79 — Park &lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('Line 1<br>Line 2 &amp; more'));
  assert.ok(html.includes('Da controllare') && html.includes('manca size'));
  assert.ok(html.includes('Apri la riga nello Sheet') && html.includes('range=A80'));
  assert.ok(html.includes('Apri l\'immagine') && !html.includes('github.com/x'));
  assert.ok(html.includes('Social (sì/no)') && !html.includes('Digital (sì/no)'));
  assert.ok(html.includes('A2 Urban Area') && html.includes('Peripheral area, Other'));
  assert.ok(html.includes('max-width:680px'));
  assert.ok(G.proposalHtml({ id: 1, title: 'A' }, '').includes('Nessun problema'));
});

// ---- Change tracking on a simulated spreadsheet ------------------------------
// A small in-memory stand-in for the SpreadsheetApp calls used by trackRows().
// Display values imitate an Italian Sheet (VERO, 45,48) to check that the
// comparison does not depend on the locale.

function fakeSpreadsheet(tabs) {
  const textCols = [];
  const ss = { tabs: {}, textCols, getSheetByName: name => ss.tabs[name] || null };
  for (const [name, rows] of Object.entries(tabs)) {
    const data = rows.map(r => r.slice());
    let maxRows = Math.max(data.length, 50);
    let maxCols = 26;
    const cell = (r, c) => (data[r - 1] && data[r - 1][c - 1] !== undefined ? data[r - 1][c - 1] : '');
    const filled = v => v !== '' && v !== null && v !== undefined;
    const show = v => (typeof v === 'boolean' ? (v ? 'VERO' : 'FALSO') : typeof v === 'number' ? String(v).replace('.', ',') : v instanceof Date || (v && v.getTime) ? '06/11/2026' : String(v));
    ss.tabs[name] = {
      data,
      getName: () => name,
      getParent: () => ss,
      getLastRow: () => { for (let r = data.length; r >= 1; r--) if ((data[r - 1] || []).some(filled)) return r; return 0; },
      getLastColumn: () => Math.max(0, ...data.map(row => { for (let c = row.length; c >= 1; c--) if (filled(row[c - 1])) return c; return 0; })),
      getMaxRows: () => maxRows,
      getMaxColumns: () => maxCols,
      insertRowsAfter: (after, n) => { maxRows += n; },
      insertColumnsAfter: (after, n) => { maxCols += n; },
      getRange: (r, c, nr = 1, nc = 1) => {
        if (r < 1 || c < 1 || r + nr - 1 > maxRows || c + nc - 1 > maxCols) throw new Error(`range out of bounds ${r},${c},${nr},${nc}`);
        const grid = () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => cell(r + i, c + j)));
        const set = vals => vals.forEach((row, i) => row.forEach((v, j) => {
          while (data.length < r + i) data.push([]);
          data[r + i - 1][c + j - 1] = v;
        }));
        const range = {
          getValues: grid,
          getDisplayValues: () => grid().map(row => row.map(show)),
          setValues: set,
          setValue: v => set([[v]]),
          setRichTextValues: vals => set(vals.map(row => row.map(x => x.text))),
          // the Registro values must be plain text before they are written
          setNumberFormat: f => { textCols.push([name, c, nc, f]); return range; },
        };
        return range;
      },
    };
  }
  return ss;
}

G.SpreadsheetApp = {
  newRichTextValue: () => {
    let text = '';
    const b = { setText: t => { text = t; return b; }, setLinkUrl: () => b, build: () => ({ text }) };
    return b;
  },
};

test('change tracking on a sheet: start, edits, id change, deleted and replaced rows, long texts', () => {
  const headers = ['id', 'status', 'title', 'latitude', 'has_social_innovation', 'description', 'checks', 'changed_fields', 'review_notes'];
  const ss = fakeSpreadsheet({
    Submissions: [headers,
      [1, 'approved', 'Park', 45.4861, true, '=not a formula', '', '', ''],
      [2, 'pending', 'Square', '', false, 'Text', 'manca city', '', 'note']],
    'Registro modifiche': [['data', 'utente', 'id', 'titolo', 'campo', 'prima', 'dopo', 'origine']],
    'Originali (interno)': [['id', 'riga']],
    'Ultima versione (interno)': [['id', 'riga']],
  });
  const sheet = ss.tabs.Submissions;
  const log = ss.tabs['Registro modifiche'].data;
  const lines = from => log.slice(from).map(r => [r[2], r[4], r[5], r[6], r[7], r[1]].map(String).join(' | '));
  const changedOf = row => sheet.data[row - 1][headers.indexOf('changed_fields')];

  // Configura: the rows as they are become the original version, one line in the Registro
  G.reconcileTracking(sheet, headers, 'Configura');
  assert.deepStrictEqual(lines(1), [' | (inizio del registro) |  | 2 righe registrate come versione originale | Configura | —']);
  assert.strictEqual(ss.tabs['Originali (interno)'].data.length, 3);
  // Values that look like formulas are written as they are
  assert.ok(ss.tabs['Originali (interno)'].data.some(r => String(r[1]).includes('=not a formula')));
  // Locale: VERO / 45,4861 on screen, but compared as TRUE / 45.4861
  assert.ok(String(ss.tabs['Originali (interno)'].data[1][1]).includes('"has_social_innovation":"TRUE"'));
  assert.ok(String(ss.tabs['Originali (interno)'].data[1][1]).includes('"latitude":"45.4861"'));

  // nothing changed → nothing written
  G.reconcileTracking(sheet, headers, 'Controllo completo');
  assert.strictEqual(log.length, 2);

  // An edit in the Sheet (checks and review_notes are not tracked)
  sheet.data[2][1] = 'approved';
  sheet.data[2][2] = 'Square =1';
  sheet.data[2][6] = '';
  sheet.data[2][8] = 'other note';
  G.trackRows(sheet, headers, [3], 'Modifica nello Sheet', { user: 'me@x.it' });
  assert.deepStrictEqual(lines(2), [
    '2 | status | pending | approved | Modifica nello Sheet | me@x.it',
    '2 | title | Square | Square =1 | Modifica nello Sheet | me@x.it',
  ]);
  assert.strictEqual(changedOf(3), 'title'); // status is not a change of the content
  assert.strictEqual(changedOf(2), '');

  // Back to the original title: the row is no longer "changed"
  sheet.data[2][2] = 'Square';
  G.trackRows(sheet, headers, [3], 'Modifica nello Sheet', { user: '' });
  assert.deepStrictEqual(lines(4), ['2 | title | Square =1 | Square | Modifica nello Sheet | —']);
  assert.strictEqual(changedOf(3), '');

  // Id typed over another one: the history follows the row
  sheet.data[2][0] = 5;
  G.trackRows(sheet, headers, [3], 'Modifica nello Sheet', { renamed: { from: '2', to: '5' }, user: '' });
  assert.deepStrictEqual(lines(5), ['5 | id | 2 | 5 | Modifica nello Sheet | —']);
  assert.strictEqual(changedOf(3), 'id');
  assert.deepStrictEqual(ss.tabs['Ultima versione (interno)'].data.slice(1).map(r => r[0]).filter(Boolean).sort(), ['1', '5']);

  // Row 1 deleted by hand: found by the next check
  sheet.data.splice(1, 1);
  G.reconcileTracking(sheet, headers, 'Controllo completo');
  assert.deepStrictEqual(lines(6), ['1 | (riga rimossa) |  | nessuna riga ha più questo id | Controllo completo | —']);

  // A new proposal gets id 1 again: a new history, not a change of the old row
  sheet.data.push([1, 'pending', 'New', '', false, '', '', '', '']);
  G.trackRows(sheet, headers, [3], 'Modulo del sito', { fresh: true, user: 'a@b.it' });
  assert.deepStrictEqual(lines(7), ['1 | (nuova riga) |  |  | Modulo del sito | a@b.it']);
  assert.strictEqual(changedOf(3), '');

  // Long texts are kept whole, over more cells
  const long = 'Lorem ipsum 🌳 '.repeat(5000);
  sheet.data[2][5] = long;
  G.trackRows(sheet, headers, [3], 'Modifica nello Sheet', { user: '' });
  assert.strictEqual(log[log.length - 1][6], long);
  const lastRow = ss.tabs['Ultima versione (interno)'].data.find(r => String(r[0]) === '1');
  assert.ok(lastRow.filter(v => String(v).startsWith('~')).length >= 2);
  assert.strictEqual(G.decodeSnapshot(lastRow.slice(1)).description, long);
  assert.strictEqual(changedOf(3), 'description');

  // Same id on two rows: not tracked until fixed (checks reports it)
  const before = log.length;
  sheet.data.push([5, 'pending', 'Copy', '', false, '', '', '', '']);
  G.trackRows(sheet, headers, [2, 3, 4], 'Modifica nello Sheet', { user: '' });
  assert.strictEqual(log.length, before);

  // Every value written to the Registro (columns B–H) was made plain text first
  assert.ok(ss.textCols.length > 0 && ss.textCols.every(t => t[0] === 'Registro modifiche' && t[1] === 2 && t[2] === 7 && t[3] === '@'));

  // Before Configura (no hidden tabs) nothing happens
  const bare = fakeSpreadsheet({ Submissions: [headers, [1, 'pending', 'X', '', false, '', '', '', '']] });
  G.trackRows(bare.tabs.Submissions, headers, [2], 'Modifica nello Sheet', { user: '' });
  assert.strictEqual(bare.tabs.Submissions.data[1][7], '');
});

// ---- Final update, simulated -----------------------------------------------

const asRow = (headers, r) => headers.map(h => (r[h] === undefined ? '' : r[h]));
let sheetHeaders = plain(G.planMissingColumns(CURRENT_HEADERS).headers);
let sheetRows = currentRecords.map(r => asRow(sheetHeaders, r));

test('patch: 207 cells to change (57 + 50 GitHub links + 100 coordinates), the second run finds them done', () => {
  // Configura has deleted the obsolete image_url column
  const col = sheetHeaders.indexOf('image_url');
  sheetHeaders = sheetHeaders.filter((h, i) => i !== col);
  sheetRows = sheetRows.map(r => r.filter((v, i) => i !== col));
  assert.deepStrictEqual(sheetHeaders, plain(C.HEADERS));
  const plan = G.planPatch(sheetHeaders, sheetRows, patch);
  const byAction = a => plan.filter(p => p.action === a).length;
  assert.strictEqual(byAction('apply'), 207, JSON.stringify(plan.filter(p => p.action !== 'apply').slice(0, 3)));
  assert.strictEqual(plan.filter(p => p.column === 'image_github').length, 50);
  for (const p of plan) sheetRows[p.rowIndex][p.colIndex] = G.neutralizeFormula(String(p.next));
  const again = G.planPatch(sheetHeaders, sheetRows, patch);
  assert.strictEqual(again.filter(p => p.action === 'done').length, 207);
  // a cell changed by hand in the meantime is not overwritten
  const changed = sheetRows.map(r => r.slice());
  changed[44][sheetHeaders.indexOf('city')] = 'Wien';
  const p45 = G.planPatch(sheetHeaders, changed, patch).find(p => p.id === '45' && p.column === 'city');
  assert.strictEqual(p45.action, 'skip');
});

test('import: id 51 collides with the TEST SUBMISSION row (must be removed first)', () => {
  const csv = parseCSV(fs.readFileSync(path.join(ROOT, 'data-source/nbs-51-78/sheet-rows.csv'), 'utf8'));
  const importHeaders = Object.keys(csv[0]);
  const importRows = csv.map(r => importHeaders.map(h => r[h]));
  const ids = sheetRows.map(r => r[sheetHeaders.indexOf('id')]);
  const blocked = G.planImport(sheetHeaders, ids, importHeaders, importRows);
  assert.deepStrictEqual(plain(blocked.skipped.map(s => s.id)), ['51']);
  assert.strictEqual(blocked.append.length, 26);

  // after deleting the test row
  sheetRows = sheetRows.filter(r => r[sheetHeaders.indexOf('title')] !== 'TEST SUBMISSION');
  const plan = G.planImport(sheetHeaders, sheetRows.map(r => r[sheetHeaders.indexOf('id')]), importHeaders, importRows);
  assert.strictEqual(plan.append.length, 27);
  assert.deepStrictEqual(plain(plan.ignoredColumns), []);
  sheetRows = sheetRows.concat(plain(plan.append));
});

let exportedRows = [];
test('export + sync rebuild exactly caseStudies.json (77 cases)', () => {
  // display values: what getDisplayValues() returns ('\'' prefix is not part of the value)
  const display = sheetRows.map(r => r.map(v => (typeof v === 'string' && v.startsWith("'") ? v.slice(1) : G.toText(v))));
  const out = G.buildExport(sheetHeaders, display);
  assert.ok(!out.columns.includes('submitter_email') && !out.columns.includes('checks') && !out.columns.includes('changed_fields'));
  assert.ok(out.columns.includes('image_drive') && out.columns.includes('image_github') && !out.columns.includes('image_url'));
  // every case has the link to its image on GitHub
  const { localImageFile, githubImageUrl } = require('./image-links');
  assert.deepStrictEqual(out.rows.filter(r => r.image_github !== githubImageUrl(localImageFile(r.id))).map(r => r.id), []);
  const studies = out.rows.map(r => rowToStudy(r, 0));
  assert.strictEqual(studies.length, 77);
  const diffs = studies.filter(s => JSON.stringify(s) !== JSON.stringify(json.find(j => j.id === s.id))).map(s => s.id);
  assert.deepStrictEqual(diffs, []);
  exportedRows = plain(out.rows);
});

// ---- sync-approved.js against a simulated web app ---------------------------
// Like Google: POST → 302 → GET of the answer. It runs in a temporary copy of
// the folders the sync uses, so the real files are never touched.

const http = require('http');
const os = require('os');
const { execFile } = require('child_process');
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function startFakeWebApp(getRows) {
  const answers = [];
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url.startsWith('/answer/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(answers[Number(req.url.split('/')[2])]);
    }
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const data = JSON.parse(body);
      let out;
      if (data.key !== 'test-key') out = { result: 'error', code: 'unauthorized' };
      else if (data.action === 'export') out = { result: 'success', rows: getRows() };
      else if (data.action === 'image' && G.driveFileId(data.file) === 'drive-file-78') out = { result: 'success', mimeType: 'image/png', base64: PNG };
      else out = { result: 'error', code: 'not_found' };
      answers.push(JSON.stringify(out));
      res.writeHead(302, { Location: `/answer/${answers.length - 1}` });
      res.end();
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'talea-sync-'));
  for (const d of ['scripts', 'src/data', 'public/images']) fs.mkdirSync(path.join(dir, d), { recursive: true });
  for (const f of ['scripts/sync-approved.js', 'scripts/other-details.js', 'src/data/caseStudies.json', 'src/data/filterConfig.js']) {
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  for (const s of json) fs.writeFileSync(path.join(dir, `public/images/cs_${s.id}.png`), '');
  return dir;
}

function runSync(dir, url, extraEnv = {}) {
  const env = { ...process.env, SHEET_EXPORT_URL: url, SHEET_EXPORT_KEY: 'test-key', ALLOW_MASS_REMOVAL: '', GOOGLE_SHEET_CSV_URL: '', ...extraEnv };
  return new Promise(resolve => {
    execFile(process.execPath, [path.join(dir, 'scripts/sync-approved.js')], { env }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, out: stdout + stderr });
    });
  });
}

async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n${err.stack}`);
    process.exitCode = 1;
  }
}

async function syncTests() {
  let rows = () => exportedRows;
  const server = await startFakeWebApp(() => rows());
  const url = `http://127.0.0.1:${server.address().port}/exec`;
  const dir = makeSandbox();
  const jsonPath = path.join(dir, 'src/data/caseStudies.json');
  const original = fs.readFileSync(jsonPath, 'utf8');
  try {
    await asyncTest('sync: same data → caseStudies.json unchanged, no images', async () => {
      const r = await runSync(dir, url);
      assert.strictEqual(r.code, 0, r.out);
      assert.strictEqual(fs.readFileSync(jsonPath, 'utf8'), original);
      assert.match(r.out, /0 added, 0 removed, 0 new images/);
    });

    await asyncTest('sync: new approved case with a Drive image → added, image copied', async () => {
      const extra = { ...exportedRows[0], id: '78', title: 'New case', image_drive: G.driveFileUrl('drive-file-78'), image_github: '', other_details: '' };
      rows = () => exportedRows.concat(extra);
      const r = await runSync(dir, url);
      assert.strictEqual(r.code, 0, r.out);
      assert.ok(JSON.parse(fs.readFileSync(jsonPath, 'utf8')).some(s => s.id === 78));
      assert.strictEqual(fs.readFileSync(path.join(dir, 'public/images/cs_78.png')).toString('base64'), PNG);
      assert.match(r.out, /1 added, 0 removed, 1 new images/);
      fs.writeFileSync(jsonPath, original);
    });

    await asyncTest('sync: value unknown to the filters → warning only', async () => {
      rows = () => exportedRows.map(r => (r.id === '3' ? { ...r, size: 'Huge' } : r));
      const r = await runSync(dir, url);
      assert.strictEqual(r.code, 0, r.out);
      assert.match(r.out, /#3 values that are not filter options: size: "Huge"/);
      fs.writeFileSync(jsonPath, original);
    });

    await asyncTest('sync: same id twice → fails, nothing written', async () => {
      rows = () => exportedRows.concat({ ...exportedRows[5] });
      const r = await runSync(dir, url);
      assert.notStrictEqual(r.code, 0);
      assert.match(r.out, /Same id on more than one approved row: 6/);
      assert.strictEqual(fs.readFileSync(jsonPath, 'utf8'), original);
    });

    await asyncTest('sync: many cases missing → fails unless ALLOW_MASS_REMOVAL', async () => {
      rows = () => exportedRows.slice(0, 60);
      const blocked = await runSync(dir, url);
      assert.notStrictEqual(blocked.code, 0);
      assert.match(blocked.out, /17 cases would be removed \(limit 8\)/);
      assert.strictEqual(fs.readFileSync(jsonPath, 'utf8'), original);
      const allowed = await runSync(dir, url, { ALLOW_MASS_REMOVAL: 'true' });
      assert.strictEqual(allowed.code, 0, allowed.out);
      assert.strictEqual(JSON.parse(fs.readFileSync(jsonPath, 'utf8')).length, 60);
      fs.writeFileSync(jsonPath, original);
    });

    await asyncTest('sync: wrong key or empty Sheet → fails, nothing written', async () => {
      rows = () => exportedRows;
      const wrongKey = await runSync(dir, url, { SHEET_EXPORT_KEY: 'nope' });
      assert.notStrictEqual(wrongKey.code, 0);
      assert.match(wrongKey.out, /unauthorized/);
      rows = () => [];
      const empty = await runSync(dir, url);
      assert.notStrictEqual(empty.code, 0);
      assert.strictEqual(fs.readFileSync(jsonPath, 'utf8'), original);
    });
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

syncTests().then(() => {
  console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
});
