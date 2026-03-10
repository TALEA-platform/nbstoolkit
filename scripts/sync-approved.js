/**
 * Nightly sync script — run by GitHub Actions.
 *
 * Fetches the Google Sheet as CSV, rebuilds caseStudies.json from approved rows.
 * After the one-time init (init-sheet.js), the sheet is the source of truth.
 *
 * Logic:
 *   - Approved rows → included in JSON
 *   - Denied rows → excluded from JSON (stay in sheet for records)
 *   - Deleted rows → excluded from JSON (they're simply gone)
 *
 * Required environment variable:
 *   GOOGLE_SHEET_CSV_URL — the "Publish to web" CSV URL of the Submissions sheet
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const CASE_STUDIES_PATH = path.resolve(__dirname, '../src/data/caseStudies.json');
const SHEET_CSV_URL = process.env.GOOGLE_SHEET_CSV_URL;

if (!SHEET_CSV_URL) {
  console.log('GOOGLE_SHEET_CSV_URL not set — skipping sync.');
  process.exit(0);
}

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
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
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
  const latitude = parseCoordinateValue(row.latitude, 'latitude');
  const longitude = parseCoordinateValue(row.longitude, 'longitude');
  if (latitude !== null && longitude !== null) {
    study.latitude = formatCoordinateValue(latitude);
    study.longitude = formatCoordinateValue(longitude);
  }

  // Image URL
  const imageUrl = (row.image_url || '').trim();
  if (imageUrl && imageUrl.startsWith('http')) {
    study.image_url = imageUrl;
  }

  // TALEA application → object with boolean keys
  const taleaTypes = toArray(row.talea_application);
  if (taleaTypes.length > 0) {
    study.talea_application = {};
    for (const t of taleaTypes) {
      study.talea_application[t.toLowerCase()] = true;
    }
  }

  // Array fields
  const arrayFields = [
    'a1_urban_scale', 'a2_urban_area', 'a3_1_buildings', 'a3_2_open_spaces',
    'a3_3_infrastructures', 'a4_ownership', 'a5_management', 'a6_uses', 'a7_other',
    'b1_physical', 'b2_regulations', 'b3_uses_management', 'b4_public_opinion',
    'b5_synergy', 'b6_social_opportunities',
    'c1_1_design', 'c1_2_funding', 'c1_3_management', 'c2_actors', 'c3_goals', 'c4_services',
    'd1_plants', 'd2_paving', 'd3_water', 'd4_roof_facade', 'd5_furnishings', 'd6_urban_spaces',
  ];
  for (const f of arrayFields) {
    study[f] = toArray(row[f]);
  }

  return study;
}

async function main() {
  console.log('Fetching Google Sheet CSV...');
  const csv = await fetchURL(SHEET_CSV_URL);
  const rows = parseCSV(csv);
  console.log(`Parsed ${rows.length} total rows from sheet.`);

  if (rows.length === 0) {
    console.log('Sheet is empty — keeping existing caseStudies.json unchanged.');
    return;
  }

  // Separate by status
  const approved = rows.filter(r => (r.status || '').toLowerCase() === 'approved');
  const denied = rows.filter(r => (r.status || '').toLowerCase() === 'denied');
  const pending = rows.filter(r => (r.status || '').toLowerCase() === 'pending');
  console.log(`Status: ${approved.length} approved, ${denied.length} denied, ${pending.length} pending`);

  if (approved.length === 0) {
    console.log('No approved rows found. If the sheet has not been initialized yet, run init-sheet.js first.');
    return;
  }

  // Track used IDs to avoid collisions
  const usedIds = new Set();
  const studies = [];

  // First pass: studies with explicit IDs from the sheet
  for (const row of approved) {
    if (row.id && !isNaN(parseInt(row.id, 10))) {
      const study = rowToStudy(row, 0);
      usedIds.add(study.id);
      studies.push(study);
    }
  }

  // Second pass: assign new IDs to rows without one
  let nextId = usedIds.size > 0 ? Math.max(...usedIds) + 1 : 1;
  for (const row of approved) {
    if (!row.id || isNaN(parseInt(row.id, 10))) {
      while (usedIds.has(nextId)) nextId++;
      const study = rowToStudy(row, nextId);
      usedIds.add(nextId);
      studies.push(study);
      nextId++;
    }
  }

  // Sort by ID for consistency
  studies.sort((a, b) => a.id - b.id);

  // Load existing to report diff
  const existing = JSON.parse(fs.readFileSync(CASE_STUDIES_PATH, 'utf-8'));
  const existingIds = new Set(existing.map(s => s.id));
  const newIds = new Set(studies.map(s => s.id));
  const added = studies.filter(s => !existingIds.has(s.id));
  const removed = existing.filter(s => !newIds.has(s.id));

  if (added.length > 0) {
    console.log(`Adding ${added.length} new studies:`);
    for (const s of added) console.log(`  + #${s.id}: "${s.title}"`);
  }
  if (removed.length > 0) {
    console.log(`Removing ${removed.length} studies (denied or deleted from sheet):`);
    for (const s of removed) console.log(`  - #${s.id}: "${s.title}"`);
  }
  if (added.length === 0 && removed.length === 0) {
    // Check for content updates
    console.log('No additions or removals. Updating content from sheet.');
  }

  // Write the rebuilt JSON
  fs.writeFileSync(CASE_STUDIES_PATH, JSON.stringify(studies, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${studies.length} total studies to caseStudies.json.`);
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
