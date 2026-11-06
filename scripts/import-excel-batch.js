/**
 * Import a batch of case studies from TALEA factsheet Excel files.
 *
 * The factsheets use the same template as the original abacus (one sheet per
 * case, sheet name = case id). Unlike scripts/extract-excel.js, checklists are
 * read by matching option *labels*, not fixed row numbers, so a row inserted
 * by an author does not shift every following answer.
 *
 * A batch folder (e.g. data-source/nbs-51-78/) holds a corrections.js with the
 * source files and the manual decisions (size, climate, coordinates, typo
 * fixes), each with a reason.
 *
 * Usage:
 *   node scripts/import-excel-batch.js data-source/nbs-51-78            # dry run
 *   node scripts/import-excel-batch.js data-source/nbs-51-78 --write    # + caseStudies.json
 *   node scripts/import-excel-batch.js data-source/nbs-51-78 --images   # + public/images/cs_<id>.jpg
 *
 * Always writes, inside the batch folder:
 *   sheet-rows.csv  rows to append to the Google Sheet (status = approved)
 *   CHANGES.md      every value changed during import (raw → final, reason),
 *                   free texts next to the options (→ other_details), image
 *                   credits, warnings
 *
 * The Google Sheet stays the source of truth: the nightly sync rebuilds
 * caseStudies.json from it, so the rows in sheet-rows.csv must be added to the
 * Sheet or they will disappear at the next sync. --write only updates the local
 * JSON (built with the same rowToStudy() as the sync) to preview the result.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { rowToStudy, ARRAY_FIELDS } = require('./sync-approved');
const { buildOtherDetails, formatOtherDetails } = require('./other-details');
const { githubImageUrl } = require('./image-links');

const ROOT = path.resolve(__dirname, '..');
const CASE_STUDIES_PATH = path.join(ROOT, 'src/data/caseStudies.json');
const FILTER_CONFIG_PATH = path.join(ROOT, 'src/data/filterConfig.js');
const IMAGES_DIR = path.join(ROOT, 'public/images');

// Main pictures are saved as JPG, at most 1600 px on the longer side: in the
// factsheets they are PNG up to 2560 px and 9 MB, too heavy for the website.
const IMAGE_MAX_SIDE = 1600;
const JPEG_QUALITY = 82;

async function saveAsJpeg(data, dest) {
  const sharp = require('sharp'); // devDependency: only needed with --images
  const info = await sharp(data)
    .resize({ width: IMAGE_MAX_SIDE, height: IMAGE_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }) // transparent areas → white (JPG has no transparency)
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(dest);
  return info;
}

// Same column order as HEADERS in google-apps-script.js (image_drive is only
// for the images uploaded with the form)
const SHEET_HEADERS = [
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
  'other_details', 'image_github', 'image_credits', 'sources',
];

// Template labels containing commas: the Sheet stores arrays as comma-separated
// text, so these are saved with the slash versions already used in the data.
const LABEL_TO_VALUE = {
  'Green area (park, garden)': 'Green area (park / garden)',
  'Slow mobility (walking, bike, bus)': 'Slow mobility (walking / bike / bus)',
  'Educational, leisure and cultural uses': 'Educational - leisure and cultural uses',
  'Green spaces in infrastructures (underpasses, viaducts)': 'Green spaces in infrastructures (underpasses / viaducts)',
  'Other (specify)': 'Other',
};

const OTHER = 'Other (specify)';

// Checklists: label column, checkbox column, expected first row, template labels
const BLOCKS = [
  ['a1_urban_scale', 2, 8, 57, ['Territorial', 'Metropolitan', 'Urban', 'District', 'Urban block', 'Single space or building', OTHER]],
  ['a2_urban_area', 2, 8, 66, ['Historical centre', 'Consolidated city', 'Peripheral area', 'Rural area', OTHER]],
  ['a3_1_buildings', 3, 8, 74, ['Building / pavilion', 'Building complex', 'Building façade', 'Rooftop', OTHER]],
  ['a3_2_open_spaces', 3, 8, 81, ['Courtyard', 'Entrance area', 'Game field', 'Green area (park, garden)', 'Open paved space',
    'Parking area', 'Service yard or technical area', 'Square', 'Residual space or widening', 'Waterfront', OTHER]],
  ['a3_3_infrastructures', 3, 8, 94, ['Carriageway', 'Cycle lane (dedicated)', 'Cycle lane with sidewalk',
    'Disused railway or similar', 'Drainage channel / urban ditch', 'Footpath', 'Overpass or viaduct',
    'Pedestrian street', 'Road interchange or ramp', 'Sidewalk', 'Sidewalk on commercial axis',
    'Traffic island', 'Tramway trackbed', 'Underpass', OTHER]],
  ['a4_ownership', 11, 17, 57, ['Public', 'Private', 'Mixed (public/private)', OTHER]],
  ['a5_management', 11, 17, 63, ['Public', 'Private', 'Mixed (public/private)', "Citizens' committee",
    'Neighbourhood', 'Association', OTHER]],
  ['a6_uses', 11, 17, 72, ['Commercial', 'Cultural', 'Educational', 'Events', 'Multifunctional',
    'Outdoor activities', 'Performance', 'Recreational', 'Refreshment point', 'Residential',
    'Slow mobility (walking, bike, bus)', 'Social', 'Sports', 'Temporary use', 'Unconventional use',
    'Vegetable garden', OTHER]],
  ['a7_other', 11, 17, 91, ['Abandoned / underused area', 'In-between space', 'Neighbourhood space', OTHER]],
  ['b1_physical', 2, 8, 114, ['Aerial cables / power lines', 'Critical slopes / steep gradients',
    'Existing large tree or plant roots', 'High levels of soil pollution', 'Impermeable or rigidly paved soil',
    'Limited technical accessibility', 'Narrow spaces / complex morphologies', 'Subsurface utilities', OTHER]],
  ['b2_regulations', 2, 8, 125, ['Architectural barrier regulations', 'Building codes and technical standards',
    'Flood risk / hydrogeological constraint', 'Heritage/archaeological constraint',
    'Landscape protection constraint', 'Public property rules / easements', 'Urban safety/surveillance rules', OTHER]],
  ['b3_uses_management', 2, 8, 135, ['Commercial buildings/services', 'Consolidated use / uses',
    'Digital infrastructure', 'Functional equipment', 'Green/blue infrastructure',
    'Maintenance assigned to third parties', 'Mobility infrastructure/hubs', 'Public cultural buildings/services',
    'Public art and/or monuments', 'Sensitive signage', 'Use conflicts', 'Vulnerable or sensitive users', OTHER]],
  ['b4_public_opinion', 2, 8, 150, ['Collective memory / identity belonging', 'Fear of decay / improper use',
    'Perception of the space as "private"', 'Rejection or distrust of greenery', OTHER]],
  ['b5_synergy', 2, 8, 157, ['Existing regeneration projects', 'Municipal or metropolitan plans',
    'Ongoing public or private investments', OTHER]],
  ['b6_social_opportunities', 11, 17, 114, ['Civic participation', 'Community building / social cohesion',
    'Cultural and intercultural exchange', 'Educational opportunities', 'Health promotion / active lifestyles',
    'Inclusion', 'Intergenerational exchange', 'Safety and perception of security', 'Universal accessibility',
    'Volunteering and active citizenship', 'Well-being', OTHER]],
  ['c1_1_design', 3, 8, 174, ['Co-design', 'Community engagement', 'Cultural promotion', 'Open call/ competition',
    'Public consultation', 'Research project', 'Self-build', 'Social innovation', 'Spontaneous intervention',
    'Workshop', OTHER]],
  ['c1_2_funding', 3, 8, 187, ['Crowdfunding', 'Participatory budget', 'Partnership', 'Private funding',
    'Public funding', OTHER]],
  ['c1_3_management', 3, 8, 195, ['Collaboration agreement', 'Public', 'Private', OTHER]],
  ['c2_actors', 2, 8, 201, ['Age groups', 'Artists', 'Associations', 'Citizens', 'Committees', 'Cultural centres',
    'Designers', 'Entrepreneurs', 'Facilitators', 'Foundations', 'Groups of citizens', 'Local Association',
    'Neighbourhood councils', 'Non-profit organizations', 'Public institutions', 'Research centres', 'Residents',
    'Shopkeepers', 'Students', 'Universities', 'Volunteers', 'Vulnerable individuals', OTHER]],
  ['c3_goals', 11, 17, 173, ['Accessibility', 'Biodiversity', 'Care', 'Climate change mitigation',
    'Environmental sustainability', 'Intergenerational collaboration', 'Knowledge', 'Liveability',
    'New connections', 'New perception', 'New production', 'Re-activation', 'Re-appropriation', 'Resilience',
    'Safety', 'Sense of community', 'Social inclusion', 'Transformation', 'Urban regeneration', 'Valorisation', OTHER]],
  ['c4_services', 11, 17, 196, ['Access free to water', 'Areas for meeting residents', 'Areas with shade/cool spots',
    'Benches/rest areas', 'Care and maintenance services', 'Educational, leisure and cultural uses',
    'Monitoring and warning systems', 'Online maps / informative materials', 'Wi-fi connection']],
  ['d1_plants', 2, 17, 231, ['Dense hedges', 'Ecological corridors - Pollinator-friendly gardens', 'Flower beds',
    'Linear hedges', 'Row of trees', 'Rows / tree lines', 'Shading tree groups / tree clusters', 'Shrub patches',
    'Single tree']],
  ['d2_paving', 2, 17, 241, ['Depaving', 'Permeable paving']],
  ['d3_water', 2, 17, 244, ['Artificial wetlands', 'Bioretention areas', 'Detention basins',
    'Filter trenches / strips / drains', 'Floodable park', 'Fountains', 'Ground-level fountain', 'Green channels',
    'Mist sprayers', 'Rain garden', 'Rain plaza', 'Reopened canals', 'Urban wetlands', 'Vegetated ditches',
    'Water blades', 'Water mirror']],
  ['d4_roof_facade', 2, 17, 261, ['Climbing structures on walls or nets', 'Extensive green roofs', 'Green walls',
    'Intensive green roofs', 'Vegetal sunshades']],
  ['d5_furnishings', 2, 17, 267, ['Green integrated furnishings', 'Green mobile covers', 'Green rigid covers',
    'Green shelters', 'Prefabricated green modules', 'Vegetated awnings']],
  ['d6_urban_spaces', 2, 17, 274, ['Community gardens', 'Green spaces in infrastructures (underpasses, viaducts)',
    'Micro parks', 'Multifunctional green spaces', 'Urban gardens']],
];

// Texts that mean "nothing to declare" in the innovation fields
const NONE_TEXT = /^(none( identified)?|no|n\/a|-)?\.?$/i;

// ---------------------------------------------------------------------------
// Cell helpers (1-indexed rows/cols)
// ---------------------------------------------------------------------------

function cell(ws, r, c) {
  const v = ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
  if (!v || v.t === 'e') return null; // '#VALUE!' = in-cell picture
  return v.v;
}

function text(ws, r, c) {
  const v = cell(ws, r, c);
  if (v === null || typeof v === 'boolean') return '';
  const s = String(v);
  return /^\s*xx\s*$/i.test(s) ? '' : s; // "xx" = untouched template placeholder
}

const norm = s => String(s || '')
  .replace(/[‘’`]/g, "'").replace(/[“”]/g, '"')
  .replace(/\s+/g, ' ').trim().toLowerCase();

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

function readChecklist(ws, tmpl, [key, labelCol, boxCol, start, labels], log) {
  const values = [];
  const matched = new Set();
  let cursor = start - 2;

  for (const label of labels) {
    let row = null;
    for (let r = cursor; r <= cursor + 5; r++) {
      if (norm(cell(ws, r, labelCol)) === norm(label)) { row = r; break; }
    }
    if (row === null) {
      log.warnings.push(`${key}: opzione "${label}" non trovata nel foglio (considerata non selezionata)`);
      continue;
    }
    matched.add(row);
    cursor = row + 1;
    const checked = cell(ws, row, boxCol) === true;
    if (checked) values.push(LABEL_TO_VALUE[label] || label);

    // Free text written next to the option (e.g. the "Other (specify)" answer)
    const notes = [];
    for (let c = labelCol + 1; c < boxCol; c++) {
      const t = text(ws, row, c).trim();
      if (t && !(tmpl && norm(cell(tmpl, row, c)) === norm(t))) notes.push(t);
    }
    if (notes.length) log.notes.push({ key, option: LABEL_TO_VALUE[label] || label, checked, text: notes.join(' · ') });
  }

  // Rows added by the author inside the block (label not in the template)
  const rows = [...matched];
  if (rows.length) {
    for (let r = Math.min(...rows); r <= Math.max(...rows); r++) {
      if (matched.has(r)) continue;
      const box = cell(ws, r, boxCol);
      if (typeof box !== 'boolean') continue;
      log.extraOptions.push({ key, label: text(ws, r, labelCol).trim(), checked: box });
    }
  }
  return { values, lastRow: rows.length ? Math.max(...rows) : start };
}

function firstText(ws, r, fromCol, toCol, exclude) {
  for (let c = fromCol; c <= toCol; c++) {
    const t = text(ws, r, c).trim();
    if (t && !exclude.includes(norm(t))) return t;
  }
  return '';
}

function extractSheet(ws, tmpl, id) {
  const log = { warnings: [], notes: [], extraOptions: [] };
  const raw = {
    id,
    title: text(ws, 1, 2),
    city: text(ws, 3, 3),
    country: text(ws, 4, 3),
    year: String(cell(ws, 5, 3) ?? ''),
    designer: text(ws, 6, 3),
    promoter: text(ws, 7, 3),
    image_credits: text(ws, 22, 1),
    description: text(ws, 24, 1),
    size: firstText(ws, 35, 2, 9, ['size']),
    climate_zone: firstText(ws, 35, 11, 17, ['climate zone']),
    physical_innovation: text(ws, 38, 1),
    social_innovation: text(ws, 43, 1),
    digital_innovation: text(ws, 48, 1),
    social_checkbox: cell(ws, 42, 17),
    digital_checkbox: cell(ws, 47, 17),
    talea: {
      Nodal: cell(ws, 31, 1) === true,
      Linear: cell(ws, 31, 7) === true,
      Fragmented: cell(ws, 31, 13) === true, // template label: "Diffuse"
    },
    c5_impacts: norm(cell(ws, 206, 10)) === 'c5 impacts' ? text(ws, 207, 10) : '',
  };
  if (!raw.c5_impacts) log.warnings.push('C5 Impacts non trovato in (207,10)');

  let lastRow = 0;
  for (const block of BLOCKS) {
    const res = readChecklist(ws, tmpl, block, log);
    raw[block[0]] = res.values;
    lastRow = res.lastRow;
  }

  // Sources: first text in column A after the last D6 option
  raw.sources = '';
  for (let r = lastRow + 1; r <= lastRow + 8; r++) {
    const t = text(ws, r, 1).trim();
    if (t) { raw.sources = t; break; }
  }
  if (!raw.sources) log.warnings.push('Fonti (sources) mancanti');
  return { raw, log };
}

// ---------------------------------------------------------------------------
// In-cell pictures (Excel "Place in cell"): sheet cell vm → richData → media
// ---------------------------------------------------------------------------

function extractMainImages(file, wantedSheets) {
  const zip = XLSX.CFB.read(fs.readFileSync(file), { type: 'buffer' });
  // CFB lists zip entries as "Root Entry/xl/…"
  const entries = new Map(zip.FullPaths.map((p, i) => [p.replace(/^Root Entry\//, ''), zip.FileIndex[i]]));
  const read = p => {
    const e = entries.get(p);
    return e && e.content ? Buffer.from(e.content) : null;
  };
  const xml = p => (read(p) || Buffer.alloc(0)).toString('utf8');
  const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w:]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));

  const rels = Object.fromEntries([...xml('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)]
    .map(m => attrs(m[0])).map(a => [a.Id, a.Target]));
  const metadata = xml('xl/metadata.xml');
  const futureBlock = (metadata.match(/<futureMetadata\b[^>]*name="XLRICHVALUE"[^>]*>([\s\S]*?)<\/futureMetadata>/) || [])[1] || '';
  const rvbByBk = [...futureBlock.matchAll(/<bk>([\s\S]*?)<\/bk>/g)]
    .map(m => Number((m[1].match(/rvb\b[^>]*\bi="(\d+)"/) || [])[1]));
  const valueBlock = (metadata.match(/<valueMetadata\b[^>]*>([\s\S]*?)<\/valueMetadata>/) || [])[1] || '';
  const vmToRv = [...valueBlock.matchAll(/<rc\b[^>]*\bv="(\d+)"/g)].map(m => rvbByBk[Number(m[1])]);
  const rvToRel = [...xml('xl/richData/rdrichvalue.xml').matchAll(/<rv\b[^>]*>\s*<v>(\d+)<\/v>/g)].map(m => Number(m[1]));
  const relIds = [...xml('xl/richData/richValueRel.xml').matchAll(/<rel\b[^>]*r:id="([^"]+)"/g)].map(m => m[1]);
  const relTargets = Object.fromEntries([...xml('xl/richData/_rels/richValueRel.xml.rels').matchAll(/<Relationship\b[^>]*>/g)]
    .map(m => attrs(m[0])).map(a => [a.Id, a.Target]));

  const out = {};
  for (const m of xml('xl/workbook.xml').matchAll(/<sheet\b[^>]*>/g)) {
    const a = attrs(m[0]);
    if (!wantedSheets.includes(a.name)) continue;
    const target = rels[a['r:id']].replace(/^\/?(xl\/)?/, 'xl/');
    const sheetXml = xml(target);
    const c = [...sheetXml.matchAll(/<c\b[^>]*\br="([A-C]9)"[^>]*>/g)].map(x => attrs(x[0])).find(x => x.vm);
    if (!c) continue;
    const rv = vmToRv[Number(c.vm) - 1];
    const media = relTargets[relIds[rvToRel[rv]]];
    if (!media) continue;
    const mediaPath = 'xl/' + media.replace(/^(\.\.\/)+/, '');
    out[a.name] = { cell: c.r, media: mediaPath, data: read(mediaPath) };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers for output
// ---------------------------------------------------------------------------

function loadFilterOptions() {
  const src = fs.readFileSync(FILTER_CONFIG_PATH, 'utf8').replace(/export const /g, 'const ');
  // eslint-disable-next-line no-new-func
  return new Function(`${src}; return FILTER_CATEGORIES;`)();
}

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** "Image Credits: Frank Sperling" -> "Frank Sperling" */
function cleanCredits(s) {
  return String(s || '').replace(/^\s*image\s+credits?\s*:\s*/i, '').replace(/\s+/g, ' ').trim();
}

const md = s => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ↵ ');
const short = (s, n = 90) => { const t = md(s); return t.length > n ? t.slice(0, n) + '…' : t; };

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const batchDir = path.resolve(process.argv[2] || '');
  const write = process.argv.includes('--write');
  const images = process.argv.includes('--images');
  if (!process.argv[2] || !fs.existsSync(path.join(batchDir, 'corrections.js'))) {
    console.error('Usage: node scripts/import-excel-batch.js <batch-folder with corrections.js> [--write] [--images]');
    process.exit(1);
  }
  const cfg = require(path.join(batchDir, 'corrections.js'));
  const exclude = cfg.exclude || {};
  const filterOptions = loadFilterOptions();
  const importDate = new Date().toISOString().slice(0, 10);

  // corrections.js is keyed by the Excel sheet number; ids are assigned below
  const sheets = [];
  let template = null;
  for (const rel of cfg.sources) {
    const file = path.resolve(batchDir, rel);
    console.log(`Reading ${path.basename(file)}…`);
    const wb = XLSX.readFile(file);
    if (wb.Sheets.Factsheet) template = wb.Sheets.Factsheet;
    const sheetNames = wb.SheetNames.filter(n => /^\d+$/.test(n));
    // Read always (the image_github link needs the extension); written only with --images
    const pics = extractMainImages(file, sheetNames);
    for (const name of sheetNames) {
      sheets.push({ sheet: Number(name), ws: wb.Sheets[name], file: path.basename(file), picture: pics[name] });
    }
  }
  sheets.sort((a, b) => a.sheet - b.sheet);
  const firstSheet = sheets[0].sheet;
  const lastSheet = sheets[sheets.length - 1].sheet;
  const excluded = sheets.filter(s => exclude[s.sheet]);
  const included = sheets.filter(s => !exclude[s.sheet]);
  // renumber: ids stay consecutive after excluding sheets (sheet 67 → id 66 …)
  included.forEach((s, i) => { s.id = cfg.renumber ? firstSheet + i : s.sheet; });

  const cases = included.map(s => {
    const { raw, log } = extractSheet(s.ws, template, s.id);
    return { ...s, raw, log };
  });

  const rows = [];
  const studies = [];
  const changeLog = [];
  const pictures = []; // written as JPG with --images

  for (const { sheet, id, raw, log, file, picture } of cases) {
    const changes = []; // [field, from, to, reason]
    const final = { ...raw };

    if (id !== sheet) {
      changes.push(['id', `${sheet} (n. foglio)`, String(id),
        `Rinumerazione dopo l'esclusione del foglio ${Object.keys(exclude).join(', ')}: gli id restano consecutivi.`]);
    }

    // 1) Automatic clean-up: surrounding/double spaces in short fields
    for (const f of ['title', 'city', 'country', 'year', 'designer', 'promoter']) {
      const cleaned = final[f].replace(/\s+/g, ' ').trim();
      if (cleaned !== final[f]) {
        changes.push([f, final[f], cleaned, 'Spazi iniziali/finali o doppi rimossi (automatico).']);
        final[f] = cleaned;
      }
    }
    for (const f of ['description', 'physical_innovation', 'social_innovation', 'digital_innovation', 'c5_impacts', 'sources']) {
      final[f] = final[f].trim();
    }
    // "Image Credits: X" → "X" (rule applied to every case, see CHANGES.md header)
    final.image_credits = cleanCredits(raw.image_credits);

    // 2) Manual field corrections
    for (const [f, [value, reason]] of Object.entries((cfg.fields || {})[sheet] || {})) {
      const next = typeof value === 'function' ? value(final[f]) : value;
      if (next !== final[f]) {
        changes.push([f, final[f], next, reason]);
        final[f] = next;
      }
    }

    // 2b) Options ticked by decision (e.g. "Other" with its text written but
    //     the box left unticked): { sheet: { column: [[options], reason] } }
    for (const [key, [options, reason]] of Object.entries((cfg.tickOptions || {})[sheet] || {})) {
      const missing = options.filter(o => !final[key].includes(o));
      if (!missing.length) continue;
      const before = final[key].join(', ') || '(nessuna)';
      final[key] = final[key].concat(missing);
      changes.push([key, before, final[key].join(', '), reason]);
    }

    // 3) Size / climate decisions
    for (const [f, table] of [['size', cfg.size], ['climate_zone', cfg.climate]]) {
      const decision = (table || {})[sheet];
      if (!decision) {
        log.warnings.push(`${f}: nessuna decisione in corrections.js (valore grezzo "${final[f]}")`);
        continue;
      }
      if (decision[0] !== final[f]) changes.push([f, final[f] || '(vuoto)', decision[0], decision[1]]);
      final[f] = decision[0];
    }

    // 4) Innovation flags. The new factsheets have no (or unticked) social /
    //    digital checkboxes, so the flag is derived from the text. No text is added.
    const hasText = t => !!t && !NONE_TEXT.test(t.trim());
    final.has_physical_innovation = hasText(final.physical_innovation);
    final.has_social_innovation = hasText(final.social_innovation);
    final.has_digital_innovation = hasText(final.digital_innovation);
    for (const [kind, checkbox] of [['social', raw.social_checkbox], ['digital', raw.digital_checkbox]]) {
      const flag = final[`has_${kind}_innovation`];
      const box = checkbox === null ? 'assente' : String(checkbox).toUpperCase();
      if (checkbox !== flag) {
        changes.push([`has_${kind}_innovation`, `checkbox ${box}`, String(flag),
          flag ? 'Ricavato dal testo (descrizione presente).' : 'Ricavato dal testo (vuoto o "None").']);
      }
    }

    // 5) Label normalisation applied by readChecklist (log once per value)
    for (const [label, value] of Object.entries(LABEL_TO_VALUE)) {
      if (label === OTHER) continue;
      for (const [key] of BLOCKS) {
        if (final[key].includes(value)) {
          changes.push([key, label, value, 'Virgole sostituite: nel Google Sheet le liste sono separate da virgole (automatico).']);
        }
      }
    }

    // 6) Coordinates
    const coord = (cfg.coordinates || {})[sheet];
    if (coord) changes.push(['latitude, longitude', '(non presenti)', `${coord[0]}, ${coord[1]}`, coord[2]]);
    else log.warnings.push('Coordinate mancanti in corrections.js');

    // 7) Free texts next to the options ("Other (specify)") → other_details
    const notes = log.notes.map(n => ({ ...n, checked: final[n.key].includes(n.option) }));
    const other = buildOtherDetails(notes, (cfg.otherDetails || {})[sheet]);
    changes.push(...other.changes);
    log.warnings.push(...other.warnings);
    final.other_details = other.details;

    // 8) Values not in filterConfig
    for (const [key] of BLOCKS) {
      const allowed = (filterOptions[key] || {}).options || [];
      for (const v of final[key]) {
        // "Other" is a valid answer; its free text is in other_details
        if (v !== 'Other' && !allowed.includes(v)) log.warnings.push(`${key}: "${v}" non è tra le opzioni dei filtri (filterConfig.js)`);
      }
    }
    for (const key of ['size', 'climate_zone']) {
      if (!filterOptions[key].options.includes(final[key])) log.warnings.push(`${key}: "${final[key]}" non ammesso`);
    }
    const talea = Object.keys(final.talea).filter(k => final.talea[k]);
    if (!talea.length) log.warnings.push('TALEA application: nessuna casella selezionata (Nodal / Linear / Diffuse)');

    // Sheet row (strings, as the published CSV would give them)
    const row = {
      id: String(id),
      status: 'approved',
      submitted_at: importDate,
      title: final.title,
      city: final.city,
      country: final.country,
      year: final.year,
      latitude: coord ? String(coord[0]) : '',
      longitude: coord ? String(coord[1]) : '',
      size: final.size,
      climate_zone: final.climate_zone,
      talea_application: talea.join(', '),
      designer: final.designer,
      promoter: final.promoter,
      description: final.description,
      physical_innovation: final.physical_innovation,
      social_innovation: final.social_innovation,
      digital_innovation: final.digital_innovation,
      has_physical_innovation: final.has_physical_innovation ? 'TRUE' : 'FALSE',
      has_social_innovation: final.has_social_innovation ? 'TRUE' : 'FALSE',
      has_digital_innovation: final.has_digital_innovation ? 'TRUE' : 'FALSE',
      c5_impacts: final.c5_impacts,
      other_details: formatOtherDetails(final.other_details, ARRAY_FIELDS),
      image_github: '',
      image_credits: final.image_credits,
      sources: final.sources,
    };
    for (const [key] of BLOCKS) row[key] = final[key].join(', ');
    rows.push(row);
    studies.push(rowToStudy(row, id));

    // Picture (always cs_<id>.jpg, see saveAsJpeg)
    let pictureInfo = 'nessuna immagine trovata nella cella A9–C9';
    if (picture && picture.data) {
      const ext = path.extname(picture.media).toLowerCase().replace('.jpeg', '.jpg');
      const file = `cs_${id}.jpg`;
      pictureInfo = `${picture.cell} → public/images/${file} (originale ${ext.slice(1).toUpperCase()} di ${(picture.data.length / 1e6).toFixed(1)} MB, `
        + `salvata in JPG di massimo ${IMAGE_MAX_SIDE} px)`;
      row.image_github = githubImageUrl(file);
      pictures.push({ id, data: picture.data, file });
    } else {
      log.warnings.push('Immagine principale non trovata');
    }

    changeLog.push({ sheet, id, file, raw, final, changes, log, pictureInfo });
  }

  // ids of this batch's range that are no longer produced (e.g. after an
  // exclusion + renumbering): stale outputs of a previous run
  const producedIds = new Set(cases.map(c => c.id));
  const staleIds = [];
  for (let n = firstSheet; n <= lastSheet; n++) if (!producedIds.has(n)) staleIds.push(n);

  if (images) {
    // Stale ids, and other formats of the pictures written now (e.g. an older cs_51.png)
    const written = new Map(pictures.map(p => [p.id, p.file]));
    for (const f of fs.readdirSync(IMAGES_DIR)) {
      const m = f.match(/^cs_(\d+)\./);
      if (!m) continue;
      const id = Number(m[1]);
      if (staleIds.includes(id) || (written.has(id) && written.get(id) !== f)) {
        fs.unlinkSync(path.join(IMAGES_DIR, f));
        console.log(`Removed ${f}`);
      }
    }
    let before = 0;
    let after = 0;
    for (const p of pictures) {
      const info = await saveAsJpeg(p.data, path.join(IMAGES_DIR, p.file));
      before += p.data.length;
      after += info.size;
    }
    console.log(`Images: ${pictures.length} written as JPG, ${(before / 1e6).toFixed(1)} MB → ${(after / 1e6).toFixed(1)} MB`);
  }

  // ---- sheet-rows.csv ----
  const csv = [SHEET_HEADERS.join(',')]
    .concat(rows.map(r => SHEET_HEADERS.map(h => csvCell(r[h])).join(',')))
    .join('\r\n') + '\r\n';
  fs.writeFileSync(path.join(batchDir, 'sheet-rows.csv'), csv, 'utf8');

  // ---- CHANGES.md ----
  const totalWarnings = changeLog.reduce((n, c) => n + c.log.warnings.length, 0);
  const out = [];
  out.push(`# Modifiche di import — fogli ${firstSheet}–${lastSheet} → casi ${cases[0].id}–${cases[cases.length - 1].id}`);
  out.push('');
  out.push(`> File generato da \`scripts/import-excel-batch.js\` il ${importDate}. Non modificarlo a mano: cambia \`corrections.js\` e rilancia lo script.`);
  out.push('> Il registro ragionato di tutte le modifiche ai dati è in `../REPORT-DATI.md`.');
  out.push('');
  out.push(`Casi importati: **${cases.length}** · modifiche registrate: **${changeLog.reduce((n, c) => n + c.changes.length, 0)}** · avvisi: **${totalWarnings}**`);
  out.push('');
  out.push('Regole applicate a tutti i casi e non ripetute sotto:');
  out.push('');
  out.push('- testi lunghi (descrizione, innovazioni, impatti, fonti): solo spazi iniziali e finali rimossi;');
  out.push('- crediti immagine: tolto il prefisso "Image Credits:" (resta solo autore o fonte);');
  out.push('- segnaposto `xx` lasciato dal template: considerato campo vuoto;');
  out.push('- testi scritti accanto alle opzioni (di solito "Other (specify)"): salvati nella colonna `other_details` e mostrati accanto all\'opzione; i filtri non cambiano.');
  out.push('');
  if (excluded.length) {
    out.push('## Fogli esclusi');
    out.push('');
    for (const s of excluded) {
      out.push(`- **Foglio ${s.sheet}** (*${s.file}*): ${md(exclude[s.sheet])}`);
    }
    out.push('');
  }
  for (const c of changeLog) {
    out.push(`## ${c.id} — ${md(c.final.title)}`);
    out.push('');
    out.push(`${md(c.final.city)}, ${md(c.final.country)} · foglio Excel \`${c.sheet}\` di *${c.file}*`);
    out.push('');
    out.push(`- **Immagine:** ${c.pictureInfo}`);
    out.push(`- **Crediti immagine:** ${md(c.final.image_credits) || '—'}`);
    out.push(`- **TALEA application:** ${Object.keys(c.final.talea).filter(k => c.final.talea[k]).join(', ') || '— (nessuna)'}`);
    out.push('');
    if (c.changes.length) {
      out.push('| Campo | Valore nella scheda | Valore importato | Motivo |');
      out.push('|---|---|---|---|');
      for (const [f, from, to, why] of c.changes) out.push(`| ${f} | ${short(from)} | ${short(to)} | ${md(why)} |`);
      out.push('');
    }
    const details = Object.entries(c.final.other_details);
    if (details.length) {
      out.push('**Testi accanto alle opzioni** (colonna `other_details`, valori finali):');
      out.push('');
      for (const [field, byOption] of details) {
        for (const [option, t] of Object.entries(byOption)) {
          const checked = c.final[field].includes(option);
          out.push(`- \`${field}\` · ${md(option)} ${checked ? '☑' : '☐ (non spuntata)'} — “${md(t)}”`);
        }
      }
      out.push('');
    }
    if (c.log.extraOptions.length) {
      out.push('**Opzioni aggiunte dall\'autore, non presenti nel template** (non importate):');
      out.push('');
      for (const e of c.log.extraOptions) out.push(`- \`${e.key}\` · “${md(e.label)}” ${e.checked ? '☑ spuntata' : '☐'}`);
      out.push('');
    }
    if (c.log.warnings.length) {
      out.push('**Avvisi:**');
      out.push('');
      for (const w of c.log.warnings) out.push(`- ⚠️ ${md(w)}`);
      out.push('');
    }
  }
  fs.writeFileSync(path.join(batchDir, 'CHANGES.md'), out.join('\n'), 'utf8');

  // ---- caseStudies.json (preview of what the sync will produce) ----
  if (write) {
    const existing = JSON.parse(fs.readFileSync(CASE_STUDIES_PATH, 'utf8'));
    const byId = new Map(existing.map(s => [s.id, s]));
    for (const id of staleIds) {
      if (byId.delete(id)) console.log(`Removed stale study #${id} from caseStudies.json`);
    }
    for (const s of studies) byId.set(s.id, s);
    const merged = [...byId.values()].sort((a, b) => a.id - b.id);
    fs.writeFileSync(CASE_STUDIES_PATH, JSON.stringify(merged, null, 2) + '\n', 'utf8');
    console.log(`caseStudies.json: ${existing.length} → ${merged.length} studies`);
  }

  console.log(`Cases: ${cases.length} (excluded sheets: ${excluded.map(s => s.sheet).join(', ') || 'none'}) · warnings: ${totalWarnings}`);
  console.log(`Wrote ${path.relative(ROOT, path.join(batchDir, 'sheet-rows.csv'))} and CHANGES.md`);
}

module.exports = { extractSheet, cleanCredits, text, BLOCKS, LABEL_TO_VALUE };

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
