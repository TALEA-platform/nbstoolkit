/**
 * One-time initialization script.
 *
 * Reads all existing case studies from caseStudies.json, optionally uploads
 * their images to imgbb, and generates a CSV file ready to import into
 * the Google Sheet.
 *
 * Usage:
 *   node scripts/init-sheet.js
 *
 * Optional environment variable:
 *   IMGBB_API_KEY — if set, local images will be uploaded to imgbb
 *                   and the resulting URLs will be included in the CSV
 *
 * After running:
 *   1. Open the generated file: scripts/init-data.csv
 *   2. In Google Sheets, go to File > Import > Upload > select init-data.csv
 *   3. Choose "Replace current sheet" or import into the "Submissions" sheet
 *   4. Verify all rows have status = "approved" and correct data
 *   5. You can now delete the init-data.csv file
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');

const CASE_STUDIES_PATH = path.resolve(__dirname, '../src/data/caseStudies.json');
const IMAGES_DIR = path.resolve(__dirname, '../public/images');
const OUTPUT_CSV = path.resolve(__dirname, 'init-data.csv');
const IMGBB_API_KEY = process.env.IMGBB_API_KEY || '';

// Same headers as google-apps-script.js
const HEADERS = [
  'id', 'status', 'submitted_at', 'title', 'city', 'country', 'year',
  'latitude', 'longitude', 'size', 'climate_zone', 'talea_application',
  'designer', 'promoter', 'description',
  'physical_innovation', 'social_innovation', 'digital_innovation',
  'has_physical_innovation', 'has_social_innovation', 'has_digital_innovation',
  'a1_urban_scale', 'a2_urban_area', 'a3_1_buildings', 'a3_2_open_spaces',
  'a3_3_infrastructures', 'a4_ownership', 'a5_management', 'a6_uses', 'a7_other',
  'b1_physical', 'b2_regulations', 'b3_uses_management', 'b4_public_opinion',
  'b5_synergy', 'b6_social_opportunities',
  'c1_1_design', 'c1_2_funding', 'c1_3_management', 'c2_actors', 'c3_goals', 'c4_services', 'c5_impacts',
  'd1_plants', 'd2_paving', 'd3_water', 'd4_roof_facade', 'd5_furnishings', 'd6_urban_spaces',
  'image_url', 'sources',
];

// Known image extensions per study ID
const PNG_IDS = [1,2,3,4,5,6,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,39,40,43];

function getLocalImagePath(studyId) {
  const ext = PNG_IDS.includes(studyId) ? 'png' : 'jpg';
  const p = path.join(IMAGES_DIR, `cs_${studyId}.${ext}`);
  return fs.existsSync(p) ? p : null;
}

/**
 * Convert image to JPEG buffer using sharp, then upload to imgbb.
 * Returns the hosted URL or null.
 */
async function uploadToImgbb(filePath, name) {
  if (!IMGBB_API_KEY) return null;

  // Convert to JPEG (quality 85) to reduce file size
  const jpegBuffer = await sharp(filePath)
    .jpeg({ quality: 85 })
    .toBuffer();
  const base64 = jpegBuffer.toString('base64');

  return new Promise((resolve) => {
    const postData = `key=${IMGBB_API_KEY}&image=${encodeURIComponent(base64)}&name=${encodeURIComponent(name)}`;

    const req = https.request({
      hostname: 'api.imgbb.com',
      path: '/1/upload',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.success && json.data && json.data.url) {
            resolve(json.data.url);
          } else {
            console.warn(`  imgbb upload failed for ${name}:`, json.error?.message || 'unknown error');
            resolve(null);
          }
        } catch {
          console.warn(`  imgbb response parse error for ${name}`);
          resolve(null);
        }
      });
    });
    req.on('error', (err) => {
      console.warn(`  imgbb request error for ${name}:`, err.message);
      resolve(null);
    });
    req.write(postData);
    req.end();
  });
}

// Strip trailing whitespace/newlines from values to keep CSV clean
function cleanValue(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\r\n]+$/g, '').trim();
}

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = cleanValue(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function arrayToString(arr) {
  if (!Array.isArray(arr)) return '';
  return arr.join(', ');
}

function taleaAppToString(obj) {
  if (!obj || typeof obj !== 'object') return '';
  return Object.keys(obj).filter(k => obj[k]).map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(', ');
}

async function main() {
  const studies = JSON.parse(fs.readFileSync(CASE_STUDIES_PATH, 'utf-8'));
  console.log(`Loaded ${studies.length} studies from caseStudies.json`);

  if (IMGBB_API_KEY) {
    console.log('IMGBB_API_KEY set — will upload local images to imgbb');
  } else {
    console.log('No IMGBB_API_KEY — image_url column will be empty for local images');
  }

  const csvLines = [HEADERS.map(escapeCSV).join(',')];

  for (const study of studies) {
    // Upload image to imgbb if configured
    let imageUrl = study.image_url || '';
    if (!imageUrl && IMGBB_API_KEY) {
      const localPath = getLocalImagePath(study.id);
      if (localPath) {
        console.log(`  Uploading image for #${study.id} "${study.title}"...`);
        const url = await uploadToImgbb(localPath, `talea_cs_${study.id}`);
        if (url) {
          imageUrl = url;
          console.log(`    → ${url}`);
        }
      }
    }

    const arrayFields = [
      'a1_urban_scale', 'a2_urban_area', 'a3_1_buildings', 'a3_2_open_spaces',
      'a3_3_infrastructures', 'a4_ownership', 'a5_management', 'a6_uses', 'a7_other',
      'b1_physical', 'b2_regulations', 'b3_uses_management', 'b4_public_opinion',
      'b5_synergy', 'b6_social_opportunities',
      'c1_1_design', 'c1_2_funding', 'c1_3_management', 'c2_actors', 'c3_goals', 'c4_services',
      'd1_plants', 'd2_paving', 'd3_water', 'd4_roof_facade', 'd5_furnishings', 'd6_urban_spaces',
    ];

    const row = HEADERS.map(h => {
      switch (h) {
        case 'id': return study.id;
        case 'status': return 'approved';
        case 'submitted_at': return new Date().toISOString();
        case 'talea_application': return taleaAppToString(study.talea_application);
        case 'image_url': return imageUrl;
        case 'has_physical_innovation':
        case 'has_social_innovation':
        case 'has_digital_innovation':
          return study[h] ? 'true' : 'false';
        default:
          if (arrayFields.includes(h)) return arrayToString(study[h]);
          return study[h] || '';
      }
    });

    csvLines.push(row.map(escapeCSV).join(','));
  }

  fs.writeFileSync(OUTPUT_CSV, csvLines.join('\n') + '\n', 'utf-8');
  console.log(`\nGenerated ${OUTPUT_CSV}`);
  console.log(`${studies.length} rows + header written.`);
  console.log('\nNext steps:');
  console.log('  1. Open your Google Sheet');
  console.log('  2. File > Import > Upload > select scripts/init-data.csv');
  console.log('  3. Choose "Replace current sheet" for the Submissions sheet');
  console.log('  4. Verify all rows show status = "approved"');
}

main().catch(err => {
  console.error('Init failed:', err);
  process.exit(1);
});
