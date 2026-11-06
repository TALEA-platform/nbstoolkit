/**
 * Nightly sync script — run by GitHub Actions (every night, or right away with
 * "Pubblica ora" in the Sheet's TALEA menu).
 *
 * Rebuilds caseStudies.json from the approved rows of the Google Sheet, which
 * is the source of truth, and copies the images uploaded with the form (saved
 * in Drive) to public/images/cs_<id>.<ext>.
 *
 * Logic:
 *   - Approved rows → included in JSON
 *   - Denied / pending / deleted rows → not included
 *
 * Safety checks (the run fails and nothing is written):
 *   - the same id on two approved rows
 *   - more than max(3, 10%) of the current cases would disappear, unless
 *     ALLOW_MASS_REMOVAL=true (option of the manual workflow run)
 *   - the Sheet answers with an error or with no approved rows
 * Values that are not filter options are only reported (warnings).
 *
 * Environment:
 *   SHEET_EXPORT_URL + SHEET_EXPORT_KEY  Apps Script web app URL + secret key
 *                                        (POST { action: "export" }); preferred
 *   GOOGLE_SHEET_CSV_URL                 old "Publish to web" CSV; used only
 *                                        when the two above are not set
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const { parseOtherDetails } = require('./other-details');

const CASE_STUDIES_PATH = path.resolve(__dirname, '../src/data/caseStudies.json');
const IMAGES_DIR = path.resolve(__dirname, '../public/images');
const FILTER_CONFIG_PATH = path.resolve(__dirname, '../src/data/filterConfig.js');
const SHEET_CSV_URL = process.env.GOOGLE_SHEET_CSV_URL;
const EXPORT_URL = process.env.SHEET_EXPORT_URL;
const EXPORT_KEY = process.env.SHEET_EXPORT_KEY;
const ALLOW_MASS_REMOVAL = process.env.ALLOW_MASS_REMOVAL === 'true';
const IMAGE_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

function fetchURL(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'TALEA-Sync/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchURL(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      // Decode once at the end: decoding each chunk turned a character split
      // between two chunks into "��" (a few letters changed every night)
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

/**
 * Parse CSV handling multi-line quoted fields (RFC 4180).
 * Cannot split by \n first — a quoted value may contain newlines.
 */
function parseCSV(csv) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];

    if (inQuotes) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false; // end of quoted field
        }
      } else {
        field += ch; // include everything inside quotes (including \n)
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        // Skip \r in \r\n
        if (ch === '\r' && csv[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }
  // Last field / last row
  if (field || row.length > 0) {
    row.push(field);
    if (row.length > 1 || row[0] !== '') rows.push(row);
  }

  if (rows.length < 2) return [];

  const headers = rows[0].map(h => h.trim());
  const result = [];
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (values[idx] || '').trim();
    });
    result.push(obj);
  }
  return result;
}

function toArray(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

function getAxisLimit(axis) {
  return axis === 'latitude' ? 90 : 180;
}

function isValidCoordinateNumber(value, axis) {
  return Number.isFinite(value) && Math.abs(value) <= getAxisLimit(axis);
}

function parseDecimalCoordinate(raw) {
  let value = String(raw).replace(/[−–—]/g, '-').replace(/\s+/g, '');

  if (value.includes(',') && value.includes('.')) {
    if (value.lastIndexOf(',') > value.lastIndexOf('.')) {
      value = value.replace(/\./g, '').replace(',', '.');
    } else {
      value = value.replace(/,/g, '');
    }
  } else if (value.includes(',')) {
    value = value.replace(',', '.');
  }

  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDmsCoordinate(raw, sign) {
  const match = String(raw).match(/^([+-])?\s*(\d{1,3})\D+(\d{1,2})(?:\D+(\d{1,2}(?:[.,]\d+)?))?\s*$/);
  if (!match) {
    return null;
  }

  const degrees = Number(match[2]);
  const minutes = Number(match[3]);
  const seconds = Number((match[4] || '0').replace(',', '.'));

  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
    return null;
  }

  const decimal = degrees + (minutes / 60) + (seconds / 3600);
  return decimal * sign;
}

function parseCoordinateValue(value, axis) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return isValidCoordinateNumber(value, axis) ? value : null;
  }

  const normalized = String(value).trim().replace(/[−–—]/g, '-');
  if (!normalized) {
    return null;
  }

  const sign = normalized.startsWith('-') || /[SW]/i.test(normalized) ? -1 : 1;
  const withoutCompass = normalized.replace(/[NSEW]/gi, '').trim();

  const decimal = parseDecimalCoordinate(withoutCompass);
  if (decimal !== null) {
    const signedDecimal = withoutCompass.startsWith('-') ? decimal : Math.abs(decimal) * sign;
    if (isValidCoordinateNumber(signedDecimal, axis)) {
      return signedDecimal;
    }
  }

  const dms = parseDmsCoordinate(withoutCompass, sign);
  if (dms !== null && isValidCoordinateNumber(dms, axis)) {
    return dms;
  }

  return null;
}

function formatCoordinateValue(value) {
  return value.toFixed(6).replace(/\.?0+$/, '');
}

function getNormalizedCoordinatePair(latitudeValue, longitudeValue) {
  const latitude = parseCoordinateValue(latitudeValue, 'latitude');
  const longitude = parseCoordinateValue(longitudeValue, 'longitude');

  if (latitude !== null && longitude !== null) {
    return { lat: latitude, lng: longitude, swapped: false };
  }

  const swappedLatitude = parseCoordinateValue(longitudeValue, 'latitude');
  const swappedLongitude = parseCoordinateValue(latitudeValue, 'longitude');

  if (swappedLatitude !== null && swappedLongitude !== null) {
    return { lat: swappedLatitude, lng: swappedLongitude, swapped: true };
  }

  return null;
}

// Multiple-choice columns: comma-separated in the Sheet, arrays in the JSON
const ARRAY_FIELDS = [
  'a1_urban_scale', 'a2_urban_area', 'a3_1_buildings', 'a3_2_open_spaces',
  'a3_3_infrastructures', 'a4_ownership', 'a5_management', 'a6_uses', 'a7_other',
  'b1_physical', 'b2_regulations', 'b3_uses_management', 'b4_public_opinion',
  'b5_synergy', 'b6_social_opportunities',
  'c1_1_design', 'c1_2_funding', 'c1_3_management', 'c2_actors', 'c3_goals', 'c4_services',
  'd1_plants', 'd2_paving', 'd3_water', 'd4_roof_facade', 'd5_furnishings', 'd6_urban_spaces',
];

/**
 * Convert a sheet row into a caseStudies.json entry.
 */
function rowToStudy(row, fallbackId) {
  const id = row.id ? parseInt(row.id, 10) : fallbackId;

  const study = {
    id,
    title: row.title || '',
    city: row.city || '',
    country: row.country || '',
    year: row.year || '',
    size: row.size || '',
    climate_zone: row.climate_zone || '',
    designer: row.designer || '',
    promoter: row.promoter || '',
    description: row.description || '',
    physical_innovation: row.physical_innovation || '',
    social_innovation: row.social_innovation || '',
    digital_innovation: row.digital_innovation || '',
    has_physical_innovation: (row.has_physical_innovation || '').toLowerCase() === 'true',
    has_social_innovation: (row.has_social_innovation || '').toLowerCase() === 'true',
    has_digital_innovation: (row.has_digital_innovation || '').toLowerCase() === 'true',
  };

  // C5 impacts
  if (row.c5_impacts) study.c5_impacts = row.c5_impacts;

  // Sources
  if (row.sources) study.sources = row.sources;

  // Coordinates
  const coordinates = getNormalizedCoordinatePair(row.latitude, row.longitude);
  if (coordinates) {
    study.latitude = formatCoordinateValue(coordinates.lat);
    study.longitude = formatCoordinateValue(coordinates.lng);
  }

  // Image credits (author / source of the picture, shown under the image)
  if (row.image_credits) study.image_credits = row.image_credits;

  // TALEA application → object with boolean keys
  const taleaTypes = toArray(row.talea_application);
  if (taleaTypes.length > 0) {
    study.talea_application = {};
    for (const t of taleaTypes) {
      study.talea_application[t.toLowerCase()] = true;
    }
  }

  // Array fields
  for (const f of ARRAY_FIELDS) {
    study[f] = toArray(row[f]);
  }

  // Free texts next to the options ("Other: Industrial area"), see other-details.js
  const { details, invalid } = parseOtherDetails(row.other_details, ARRAY_FIELDS);
  if (Object.keys(details).length > 0) study.other_details = details;
  for (const line of invalid) {
    console.warn(`  ! #${id} other_details: line ignored (expected "column: text" or "column [Option]: text"): "${line}"`);
  }

  return study;
}

/** POST to the Apps Script web app (it answers with a redirect, which fetch follows) */
async function postToSheet(body) {
  const res = await fetch(EXPORT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, key: EXPORT_KEY }),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Sheet web app answered HTTP ${res.status}`);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Sheet web app did not answer with JSON (is the deployment up to date?)');
  }
  if (data.result !== 'success') throw new Error(`Sheet web app error: ${data.code || data.message || 'unknown'}`);
  return data;
}

/** Approved rows of the Sheet as { column: text }, or null when not configured */
async function fetchApprovedRows() {
  if (EXPORT_URL && EXPORT_KEY) {
    const data = await postToSheet({ action: 'export' });
    console.log(`Export from the Sheet web app: ${data.rows.length} approved rows.`);
    return data.rows;
  }
  if (SHEET_CSV_URL) {
    const rows = parseCSV(await fetchURL(SHEET_CSV_URL));
    const approved = rows.filter(r => (r.status || '').toLowerCase() === 'approved');
    console.log(`Published CSV (old method): ${rows.length} rows, ${approved.length} approved.`);
    return approved;
  }
  return null;
}

function loadFilterConfig() {
  const src = fs.readFileSync(FILTER_CONFIG_PATH, 'utf8').replace(/export const /g, 'const ');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return { FILTER_CATEGORIES, FIELDS_WITH_OTHER };`)();
}

/** Values the website filters do not know (reported, not blocking) */
function findUnknownValues(study, config) {
  const out = [];
  for (const [key, cat] of Object.entries(config.FILTER_CATEGORIES)) {
    if (cat.type === 'value' && study[key] && !cat.options.includes(study[key])) {
      out.push(`${key}: "${study[key]}"`);
    }
    if (cat.type === 'array') {
      const allowed = config.FIELDS_WITH_OTHER.includes(key) ? cat.options.concat('Other') : cat.options;
      for (const v of study[key] || []) if (!allowed.includes(v)) out.push(`${key}: "${v}"`);
    }
  }
  return out;
}

function hasLocalImage(id) {
  if (!fs.existsSync(IMAGES_DIR)) return false;
  const re = new RegExp(`^cs_${id}\\.(png|jpe?g|webp|avif)$`, 'i');
  return fs.readdirSync(IMAGES_DIR).some(f => re.test(f));
}

/** Copy the images uploaded with the form (Drive) for cases without a local image */
async function downloadImages(studies, rowsById) {
  if (!EXPORT_URL || !EXPORT_KEY) return 0;
  let count = 0;
  for (const study of studies) {
    // image_drive: link (or id) of the file in the Sheet's Drive folder
    const file = ((rowsById.get(study.id) || {}).image_drive || '').trim();
    if (!file || hasLocalImage(study.id)) continue;
    try {
      const img = await postToSheet({ action: 'image', file });
      const ext = IMAGE_EXT[img.mimeType];
      if (!ext) throw new Error(`unsupported type ${img.mimeType}`);
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
      fs.writeFileSync(path.join(IMAGES_DIR, `cs_${study.id}.${ext}`), Buffer.from(img.base64, 'base64'));
      console.log(`  + image cs_${study.id}.${ext}`);
      count++;
    } catch (err) {
      console.warn(`::warning::Image of #${study.id} not downloaded: ${err.message}`);
    }
  }
  return count;
}

async function main() {
  const rows = await fetchApprovedRows();
  if (!rows) {
    console.log('SHEET_EXPORT_URL + SHEET_EXPORT_KEY (or GOOGLE_SHEET_CSV_URL) not set — skipping sync.');
    return;
  }
  if (rows.length === 0) {
    throw new Error('The Sheet returned no approved rows: caseStudies.json left unchanged.');
  }

  // Explicit ids must be unique
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    const id = parseInt(row.id, 10);
    if (isNaN(id)) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size) {
    throw new Error(`Same id on more than one approved row: ${[...duplicates].join(', ')}. Fix the Sheet; nothing was written.`);
  }

  // Rows without an id get the next free one
  const studies = [];
  const rowsById = new Map();
  let nextId = seen.size > 0 ? Math.max(...seen) + 1 : 1;
  for (const row of rows) {
    if (!(row.title || '').trim()) {
      console.warn(`::warning::Approved row without a title skipped (id "${row.id || ''}").`);
      continue;
    }
    let id = parseInt(row.id, 10);
    if (isNaN(id)) {
      while (seen.has(nextId)) nextId++;
      id = nextId;
      seen.add(id);
    }
    studies.push(rowToStudy({ ...row, id: String(id) }, id));
    rowsById.set(id, row);
  }
  studies.sort((a, b) => a.id - b.id);

  // Values the filters do not know
  const config = loadFilterConfig();
  for (const s of studies) {
    const unknown = findUnknownValues(s, config);
    if (unknown.length) console.warn(`::warning::#${s.id} values that are not filter options: ${unknown.join('; ')}`);
  }

  // Compare with the current JSON
  const existing = JSON.parse(fs.readFileSync(CASE_STUDIES_PATH, 'utf-8'));
  const existingIds = new Set(existing.map(s => s.id));
  const newIds = new Set(studies.map(s => s.id));
  const added = studies.filter(s => !existingIds.has(s.id));
  const removed = existing.filter(s => !newIds.has(s.id));

  const maxRemovals = Math.max(3, Math.ceil(existing.length * 0.1));
  if (removed.length > maxRemovals && !ALLOW_MASS_REMOVAL) {
    throw new Error(`${removed.length} cases would be removed (limit ${maxRemovals}): `
      + `${removed.map(s => `#${s.id}`).join(', ')}. If this is intended, run the workflow by hand `
      + 'with "allow_mass_removal" ticked. Nothing was written.');
  }

  for (const s of added) console.log(`  + #${s.id}: "${s.title}"`);
  for (const s of removed) console.log(`  - #${s.id}: "${s.title}"`);
  if (!added.length && !removed.length) console.log('No additions or removals. Updating content from sheet.');

  const images = await downloadImages(studies, rowsById);

  fs.writeFileSync(CASE_STUDIES_PATH, JSON.stringify(studies, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${studies.length} studies to caseStudies.json `
    + `(${added.length} added, ${removed.length} removed, ${images} new images).`);
}

// Exported so other scripts (e.g. import-excel-batch.js) build studies with
// exactly the same row → JSON conversion used by the nightly sync.
module.exports = { rowToStudy, parseCSV, toArray, ARRAY_FIELDS, formatCoordinateValue };

if (require.main === module) {
  main().catch(err => {
    console.error('Sync failed:', err);
    process.exit(1);
  });
}
