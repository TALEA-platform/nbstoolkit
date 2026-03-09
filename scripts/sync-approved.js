/**
 * Nightly sync script — run by GitHub Actions.
 *
 * Fetches the Google Sheet as CSV, finds rows marked "approved",
 * and merges new entries into src/data/caseStudies.json.
 * Images are stored as URLs (not downloaded) — imageMap.js reads them at runtime.
 *
 * Required environment variable:
 *   GOOGLE_SHEET_CSV_URL — the "Publish to web" CSV URL of the Submissions sheet
 *     (File > Share > Publish to web > Submissions sheet > CSV > Publish)
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
      // Follow redirects (Google Sheets may redirect)
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

function parseCSV(csv) {
  const lines = csv.split('\n');
  if (lines.length < 2) return [];

  // Parse header row
  const headers = parseCSVLine(lines[0]);

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = (values[idx] || '').trim();
    });
    rows.push(obj);
  }
  return rows;
}

// Simple CSV line parser that handles quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// Convert comma-separated string to array, filtering empty
function toArray(str) {
  if (!str) return [];
  return str.split(',').map(s => s.trim()).filter(Boolean);
}

// Convert a sheet row into a caseStudies.json entry
function rowToStudy(row, id) {
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
    has_social_innovation: !!(row.social_innovation || '').trim(),
    has_digital_innovation: !!(row.digital_innovation || '').trim(),
  };

  // Coordinates
  if (row.latitude) study.latitude = row.latitude;
  if (row.longitude) study.longitude = row.longitude;

  // Image URL (hosted externally, displayed via imageMap.js)
  const imageUrl = (row.image_url || '').trim();
  if (imageUrl && imageUrl.startsWith('http')) {
    study.image_url = imageUrl;
  }

  // TALEA application
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
    'd1_plants', 'd2_paving', 'd3_water', 'd4_roof_facade', 'd5_furnishings', 'd6_urban_spaces',
    'c1_1_design', 'c1_2_funding', 'c1_3_management', 'c2_actors', 'c3_goals', 'c4_services',
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

  // Filter for approved entries
  const approved = rows.filter(r => (r.status || '').toLowerCase() === 'approved');
  console.log(`Found ${approved.length} approved submissions.`);

  if (approved.length === 0) {
    console.log('No approved submissions to sync.');
    return;
  }

  // Load existing case studies
  const existing = JSON.parse(fs.readFileSync(CASE_STUDIES_PATH, 'utf-8'));
  const existingTitles = new Set(existing.map(s => s.title.toLowerCase()));
  let maxId = Math.max(...existing.map(s => s.id));

  // Find new entries (by title match to avoid duplicates)
  let added = 0;
  for (const row of approved) {
    const title = (row.title || '').trim();
    if (!title || existingTitles.has(title.toLowerCase())) {
      continue;
    }
    maxId++;
    const study = rowToStudy(row, maxId);
    existing.push(study);
    existingTitles.add(title.toLowerCase());
    added++;
    console.log(`  + Added #${maxId}: "${title}"${study.image_url ? ' (with image)' : ''}`);
  }

  if (added === 0) {
    console.log('All approved submissions already exist in caseStudies.json.');
    return;
  }

  // Write back
  fs.writeFileSync(CASE_STUDIES_PATH, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
  console.log(`Wrote ${existing.length} total studies (${added} new) to caseStudies.json.`);
}

main().catch(err => {
  console.error('Sync failed:', err);
  process.exit(1);
});
