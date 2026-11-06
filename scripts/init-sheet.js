/**
 * One-time initialization of a new Google Sheet.
 *
 * Reads all case studies from caseStudies.json and writes scripts/init-data.csv,
 * with the public columns of google-apps-script.js (same order) and status
 * "approved". Images stay in the repo (public/images): the image_github column
 * holds the link to each file.
 *
 * Usage:
 *   node scripts/init-sheet.js
 *
 * After running (see Administrator_Setup_guide.md, 2.8):
 *   1. In the Sheet: File > Import > Upload > scripts/init-data.csv,
 *      "Insert new sheet(s)"
 *   2. TALEA > Strumenti > Importa righe da un tab… (name of the new tab)
 *   3. Delete the imported tab and scripts/init-data.csv
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { formatOtherDetails } = require('./other-details');
const { ARRAY_FIELDS } = require('./sync-approved');
const { localImageFile, githubImageUrl } = require('./image-links');

const ROOT = path.resolve(__dirname, '..');
const CASE_STUDIES_PATH = path.join(ROOT, 'src/data/caseStudies.json');
const OUTPUT_CSV = path.join(__dirname, 'init-data.csv');

// Columns of the Sheet, read from google-apps-script.js so they never drift
function sheetColumns() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(`${fs.readFileSync(path.join(ROOT, 'google-apps-script.js'), 'utf8')}
    this.__c = { HEADERS, PRIVATE_COLUMNS };`, ctx);
  const { HEADERS, PRIVATE_COLUMNS } = ctx.__c;
  // image_drive is only for the images uploaded with the form
  return HEADERS.filter(h => !PRIVATE_COLUMNS.includes(h) && h !== 'image_drive');
}

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value).replace(/[\r\n]+$/g, '').trim();
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function taleaAppToString(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return Object.keys(obj).filter(k => obj[k]).map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(', ');
}

function main() {
  const studies = JSON.parse(fs.readFileSync(CASE_STUDIES_PATH, 'utf-8'));
  const headers = sheetColumns();
  const now = new Date().toISOString();
  const lines = [headers.map(escapeCSV).join(',')];

  for (const study of studies) {
    const row = headers.map(h => {
      switch (h) {
        case 'id': return study.id;
        case 'status': return 'approved';
        case 'submitted_at': return now;
        case 'talea_application': return taleaAppToString(study.talea_application);
        case 'other_details': return formatOtherDetails(study.other_details, ARRAY_FIELDS);
        case 'image_github': return githubImageUrl(localImageFile(study.id));
        case 'has_physical_innovation':
        case 'has_social_innovation':
        case 'has_digital_innovation':
          return study[h] ? 'TRUE' : 'FALSE';
        default:
          if (ARRAY_FIELDS.includes(h)) return (study[h] || []).join(', ');
          return study[h] ?? '';
      }
    });
    lines.push(row.map(escapeCSV).join(','));
  }

  fs.writeFileSync(OUTPUT_CSV, lines.join('\n') + '\n', 'utf-8');
  const noImage = studies.filter(s => !localImageFile(s.id)).map(s => s.id);
  console.log(`Wrote ${path.relative(ROOT, OUTPUT_CSV)}: ${studies.length} rows, ${headers.length} columns.`);
  if (noImage.length) console.log(`No image in public/images for: ${noImage.join(', ')}`);
}

main();
