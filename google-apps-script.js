/**
 * TALEA NBS Toolkit — Google Apps Script of the "Talea Abacus Updates" Sheet.
 *
 * Paste this whole file in the Sheet: Estensioni → Apps Script (one file,
 * replacing the old code). Setup and daily use are described in
 * Administrator_Setup_guide.md.
 *
 * What it does:
 *   - doPost: receives the submissions of the web form (status always
 *     "pending", id assigned here, spam limits, image saved in Drive)
 *   - POST { action: "export" | "image", key }: approved rows and images for
 *     the nightly sync (scripts/sync-approved.js), protected by a secret key
 *     sent in the body (never in the URL)
 *   - "TALEA" menu: choose values, card view, validation, approve / deny,
 *     publish now, import rows, apply corrections, setup
 *
 * Tabs: Submissions (data), Impostazioni (settings), Utenti fidati (no spam
 * limits), Liste (allowed values, generated), Scheda (one row, vertical, with
 * the original values), Registro modifiche (who changed what, when). Two
 * hidden tabs keep the original and the last seen version of each row.
 *
 * Secrets live in the Script Properties (Impostazioni progetto → Proprietà
 * script), never in this file: EXPORT_KEY, GITHUB_TOKEN, IMAGE_FOLDER_ID.
 *
 * The pure functions (no SpreadsheetApp) are tested in Node by
 * scripts/test-apps-script.js.
 */

// ===========================================================================
// Configuration
// ===========================================================================

const SHEET_NAME = 'Submissions';
const SETTINGS_SHEET = 'Impostazioni';
const TRUSTED_SHEET = 'Utenti fidati';
const LISTS_SHEET = 'Liste';
const CARD_SHEET = 'Scheda';
const LOG_SHEET = 'Registro modifiche';
const ORIGINALS_SHEET = 'Originali (interno)';
const LAST_SHEET = 'Ultima versione (interno)';

const GITHUB_REPO = 'TALEA-platform/nbstoolkit';
const GITHUB_WORKFLOW = 'nightly-sync.yml';
const IMAGE_FOLDER_NAME = 'TALEA - immagini delle proposte';
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_LENGTH = 20000;

// Column order of the Submissions tab. Missing columns are inserted in this
// position; existing columns are never moved or rewritten.
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
  'other_details', 'image_drive', 'image_github', 'image_credits', 'sources',
  // Internal: never exported to the website
  'checks', 'changed_fields', 'review_notes', 'submitter_name', 'submitter_email',
];

const PRIVATE_COLUMNS = ['checks', 'changed_fields', 'review_notes', 'submitter_name', 'submitter_email'];
// Set by this script, never taken from a submission
const SERVER_COLUMNS = ['id', 'status', 'submitted_at', 'checks', 'changed_fields', 'review_notes', 'image_drive', 'image_github'];
// Columns of older versions: Configura offers to delete them
const OBSOLETE_COLUMNS = {
  image_url: 'vecchi link imgbb: le immagini ora sono nella repo GitHub (colonna image_github)',
  image_file: 'sostituita da image_drive (link al file in Drive)',
};
// Change tracking: columns never compared (automatic, or internal notes), and
// columns written in the Registro but not counted as changes of the content
const UNTRACKED_COLUMNS = ['checks', 'changed_fields', 'review_notes'];
const NOT_CONTENT_COLUMNS = ['status', 'image_github'];
const SNAPSHOT_CHUNK = 45000; // characters per cell (a cell holds at most 50,000)
const BOOLEAN_COLUMNS = ['has_physical_innovation', 'has_social_innovation', 'has_digital_innovation'];
const SINGLE_VALUE_COLUMNS = ['size', 'climate_zone'];
const STATUSES = ['pending', 'approved', 'denied'];
const AUTOMATIC_FORMAT = '0.###############'; // what getNumberFormat() gives for a cell never formatted
const REQUIRED_ON_SUBMIT = ['title', 'city', 'country', 'year', 'description', 'size', 'climate_zone',
  'talea_application', 'submitter_email'];
const REQUIRED_ALWAYS = ['title', 'city', 'country', 'size', 'climate_zone', 'talea_application'];

const DEFAULT_SETTINGS = [
  ['supervisor_email', '', 'Chi riceve le notifiche delle nuove proposte. Più indirizzi separati da virgola.'],
  ['max_per_email_per_day', 3, 'Invii al giorno per la stessa email (non vale per gli Utenti fidati).'],
  ['max_total_per_day', 20, 'Invii al giorno in totale (non contano gli Utenti fidati).'],
  ['digest_hour', 8, 'Ora (0-23) del riepilogo giornaliero degli invii degli Utenti fidati.'],
];

// <generated-lists> Do not edit by hand: run `node scripts/build-apps-script-lists.js`
const LISTS = {
  "talea_application": ["Nodal","Linear","Fragmented"],
  "size": ["Small","Medium","Large"],
  "climate_zone": ["Tropical","Arid","Mediterranean","Temperate","Cold/Boreal","Polar"],
  "a1_urban_scale": ["Territorial","Metropolitan","Urban","District","Urban block","Single space or building"],
  "a2_urban_area": ["Historical centre","Consolidated city","Peripheral area","Rural area"],
  "a3_1_buildings": ["Building / pavilion","Building complex","Building façade","Rooftop"],
  "a3_2_open_spaces": ["Courtyard","Entrance area","Game field","Green area (park / garden)","Open paved space","Parking area","Residual space or widening","Service yard or technical area","Square","Waterfront"],
  "a3_3_infrastructures": ["Carriageway","Cycle lane (dedicated)","Cycle lane with sidewalk","Disused railway or similar","Drainage channel / urban ditch","Footpath","Overpass or viaduct","Pedestrian street","Road interchange or ramp","Sidewalk","Sidewalk on commercial axis","Traffic island","Tramway trackbed","Underpass"],
  "a4_ownership": ["Public","Private","Mixed (public/private)"],
  "a5_management": ["Association","Citizens' committee","Mixed (public/private)","Neighbourhood","Private","Public"],
  "a6_uses": ["Commercial","Cultural","Educational","Events","Multifunctional","Outdoor activities","Performance","Recreational","Refreshment point","Residential","Slow mobility (walking / bike / bus)","Social","Sports","Temporary use","Unconventional use","Vegetable garden"],
  "a7_other": ["Abandoned / underused area","In-between space","Neighbourhood space"],
  "b1_physical": ["Aerial cables / power lines","Critical slopes / steep gradients","Existing large tree or plant roots","High levels of soil pollution","Impermeable or rigidly paved soil","Limited technical accessibility","Narrow spaces / complex morphologies","Subsurface utilities"],
  "b2_regulations": ["Architectural barrier regulations","Building codes and technical standards","Flood risk / hydrogeological constraint","Heritage/archaeological constraint","Landscape protection constraint","Public property rules / easements","Urban safety/surveillance rules"],
  "b3_uses_management": ["Commercial buildings/services","Consolidated use / uses","Digital infrastructure","Functional equipment","Green/blue infrastructure","Maintenance assigned to third parties","Mobility infrastructure/hubs","Public art and/or monuments","Public cultural buildings/services","Sensitive signage","Use conflicts","Vulnerable or sensitive users"],
  "b4_public_opinion": ["Collective memory / identity belonging","Fear of decay / improper use","Perception of the space as \"private\"","Rejection or distrust of greenery"],
  "b5_synergy": ["Existing regeneration projects","Municipal or metropolitan plans","Ongoing public or private investments"],
  "b6_social_opportunities": ["Civic participation","Community building / social cohesion","Cultural and intercultural exchange","Educational opportunities","Health promotion / active lifestyles","Inclusion","Intergenerational exchange","Safety and perception of security","Universal accessibility","Volunteering and active citizenship","Well-being"],
  "c1_1_design": ["Co-design","Community engagement","Cultural promotion","Open call/ competition","Public consultation","Research project","Self-build","Social innovation","Spontaneous intervention","Workshop"],
  "c1_2_funding": ["Crowdfunding","Participatory budget","Partnership","Private funding","Public funding"],
  "c1_3_management": ["Collaboration agreement","Private","Public"],
  "c2_actors": ["Age groups","Artists","Associations","Citizens","Committees","Cultural centres","Designers","Entrepreneurs","Facilitators","Foundations","Groups of citizens","Local Association","Neighbourhood councils","Non-profit organizations","Public institutions","Research centres","Residents","Shopkeepers","Students","Universities","Volunteers","Vulnerable individuals"],
  "c3_goals": ["Accessibility","Biodiversity","Care","Climate change mitigation","Environmental sustainability","Intergenerational collaboration","Knowledge","Liveability","New connections","New perception","New production","Re-activation","Re-appropriation","Resilience","Safety","Sense of community","Social inclusion","Transformation","Urban regeneration","Valorisation"],
  "c4_services": ["Access free to water","Areas for meeting residents","Areas with shade/cool spots","Benches/rest areas","Care and maintenance services","Educational - leisure and cultural uses","Monitoring and warning systems","Online maps / informative materials","Wi-fi connection"],
  "d1_plants": ["Dense hedges","Ecological corridors - Pollinator-friendly gardens","Flower beds","Linear hedges","Row of trees","Rows / tree lines","Shading tree groups / tree clusters","Shrub patches","Single tree"],
  "d2_paving": ["Depaving","Permeable paving"],
  "d3_water": ["Artificial wetlands","Bioretention areas","Detention basins","Filter trenches / strips / drains","Floodable park","Fountains","Ground-level fountain","Green channels","Mist sprayers","Rain garden","Rain plaza","Reopened canals","Urban wetlands","Vegetated ditches","Water blades","Water mirror"],
  "d4_roof_facade": ["Climbing structures on walls or nets","Extensive green roofs","Green walls","Intensive green roofs","Vegetal sunshades"],
  "d5_furnishings": ["Green integrated furnishings","Green mobile covers","Green rigid covers","Green shelters","Prefabricated green modules","Vegetated awnings"],
  "d6_urban_spaces": ["Community gardens","Green spaces in infrastructures (underpasses / viaducts)","Micro parks","Multifunctional green spaces","Urban gardens"]
};
const LIST_LABELS = {
  "talea_application": "TALEA Application",
  "size": "Size",
  "climate_zone": "Climate Zone",
  "a1_urban_scale": "A1 Urban Scale",
  "a2_urban_area": "A2 Urban Area",
  "a3_1_buildings": "A3.1 Buildings",
  "a3_2_open_spaces": "A3.2 Open Spaces",
  "a3_3_infrastructures": "A3.3 Infrastructures",
  "a4_ownership": "A4 Ownership",
  "a5_management": "A5 Management",
  "a6_uses": "A6 Uses",
  "a7_other": "A7 Other",
  "b1_physical": "B1 Physical Constraints",
  "b2_regulations": "B2 Regulations",
  "b3_uses_management": "B3 Uses & Management",
  "b4_public_opinion": "B4 Public Opinion",
  "b5_synergy": "B5 Synergy",
  "b6_social_opportunities": "B6 Social Opportunities",
  "c1_1_design": "C1.1 Design Process",
  "c1_2_funding": "C1.2 Funding",
  "c1_3_management": "C1.3 Management",
  "c2_actors": "C2 Actors",
  "c3_goals": "C3 Goals & Results",
  "c4_services": "C4 Services",
  "d1_plants": "D1 Plants",
  "d2_paving": "D2 Paving",
  "d3_water": "D3 Water",
  "d4_roof_facade": "D4 Roof & Facade",
  "d5_furnishings": "D5 Furnishings",
  "d6_urban_spaces": "D6 Urban Spaces"
};
const FIELDS_WITH_OTHER = ["a1_urban_scale","a2_urban_area","a3_1_buildings","a3_2_open_spaces","a3_3_infrastructures","a4_ownership","a5_management","a6_uses","a7_other","b1_physical","b2_regulations","b3_uses_management","b4_public_opinion","b5_synergy","b6_social_opportunities","c1_1_design","c1_2_funding","c1_3_management","c2_actors","c3_goals"];
// </generated-lists>

const MULTI_VALUE_COLUMNS = Object.keys(LISTS).filter(function (k) { return SINGLE_VALUE_COLUMNS.indexOf(k) === -1; });

// Header colours and Italian descriptions (header notes and Scheda tab)
const GROUPS = [
  { name: 'Gestione', color: '#37474f', font: '#ffffff', columns: ['id', 'status', 'submitted_at'] },
  { name: 'Informazioni', color: '#d9d9d9', font: '#000000', columns: ['title', 'city', 'country', 'year', 'latitude', 'longitude', 'size', 'climate_zone', 'talea_application', 'designer', 'promoter', 'description'] },
  { name: 'Innovazione', color: '#fce5cd', font: '#000000', columns: ['physical_innovation', 'social_innovation', 'digital_innovation', 'has_physical_innovation', 'has_social_innovation', 'has_digital_innovation'] },
  { name: 'A. Caratteristiche fisiche', color: '#d9ead3', font: '#000000', columns: ['a1_urban_scale', 'a2_urban_area', 'a3_1_buildings', 'a3_2_open_spaces', 'a3_3_infrastructures', 'a4_ownership', 'a5_management', 'a6_uses', 'a7_other'] },
  { name: 'B. Vincoli e opportunità', color: '#f4cccc', font: '#000000', columns: ['b1_physical', 'b2_regulations', 'b3_uses_management', 'b4_public_opinion', 'b5_synergy', 'b6_social_opportunities'] },
  { name: 'C. Processo e risultati', color: '#cfe2f3', font: '#000000', columns: ['c1_1_design', 'c1_2_funding', 'c1_3_management', 'c2_actors', 'c3_goals', 'c4_services', 'c5_impacts'] },
  { name: 'D. Soluzioni NBS', color: '#d0e0e3', font: '#000000', columns: ['d1_plants', 'd2_paving', 'd3_water', 'd4_roof_facade', 'd5_furnishings', 'd6_urban_spaces'] },
  { name: 'Altro', color: '#ead1dc', font: '#000000', columns: ['other_details', 'image_drive', 'image_github', 'image_credits', 'sources'] },
  { name: 'Interno (non pubblicato)', color: '#666666', font: '#ffffff', columns: ['checks', 'changed_fields', 'review_notes', 'submitter_name', 'submitter_email'] },
];

const COLUMN_NOTES = {
  id: 'Numero del caso. Lo assegna lo script: non cambiarlo.',
  status: 'pending = da rivedere\napproved = va sul sito alla prossima pubblicazione\ndenied = rifiutata (resta qui come archivio)',
  submitted_at: 'Data di invio (automatica).',
  title: 'Titolo del progetto.',
  latitude: 'Gradi decimali con il punto, es. 45.4861 (la colonna è in formato testo: il valore resta come scritto). Se vuoto, il caso non compare sulla mappa.',
  longitude: 'Gradi decimali, es. 9.1905.',
  size: 'Small < ~0,2 ha · Medium ~0,2–5 ha · Large ≥ 5 ha (o corridoio ≥ 1 km, o scala urbana).',
  talea_application: 'Uno o più tra Nodal, Linear, Fragmented, separati da virgola.',
  has_physical_innovation: 'Spuntato se il testo dell\'innovazione fisica è presente.',
  has_social_innovation: 'Spuntato se il testo dell\'innovazione sociale è presente.',
  has_digital_innovation: 'Spuntato se il testo dell\'innovazione digitale è presente.',
  c5_impacts: 'Testo libero: un impatto per paragrafo.',
  other_details: 'Testi scritti accanto alle opzioni, una riga per testo (a capo con Ctrl+Invio):\na2_urban_area: Industrial area\na5_management [Private]: but open to public',
  image_drive: 'Immagine caricata con il form, salvata nella cartella Drive "' + IMAGE_FOLDER_NAME + '". Alla pubblicazione viene copiata su GitHub, se il caso non ha già un\'immagine. Per usarne un\'altra: caricala nella stessa cartella e incolla qui il suo link.',
  image_github: 'Link all\'immagine nella repo GitHub (public/images), da cui la mostra il sito. Lo scrive lo script; per le nuove proposte funziona dopo la pubblicazione.',
  image_credits: 'Autore o fonte dell\'immagine.',
  sources: 'Fonti, una per riga.',
  checks: 'Problemi trovati dalla validazione (automatico). Vuoto = tutto a posto.',
  changed_fields: 'Campi diversi dalla versione originale (automatico). Vuoto = mai modificata. Chi, quando e cosa: tab "' + LOG_SHEET + '". I valori originali si vedono nella Scheda.',
  review_notes: 'Note interne di chi rivede la proposta. Non vanno sul sito.',
  submitter_name: 'Chi ha inviato la proposta. Non va sul sito.',
  submitter_email: 'Email di chi ha inviato la proposta. Non va sul sito.',
};

const BASE_LABELS = {
  id: 'ID', status: 'Stato', submitted_at: 'Inviata il', title: 'Titolo', city: 'Città', country: 'Paese',
  year: 'Anno', latitude: 'Latitudine', longitude: 'Longitudine', size: 'Size', climate_zone: 'Climate zone',
  talea_application: 'TALEA application', designer: 'Designer', promoter: 'Promoter', description: 'Descrizione',
  physical_innovation: 'Physical innovation', social_innovation: 'Social innovation', digital_innovation: 'Digital innovation',
  has_physical_innovation: 'Physical (sì/no)', has_social_innovation: 'Social (sì/no)', has_digital_innovation: 'Digital (sì/no)',
  c5_impacts: 'C5 Impacts', other_details: 'Testi "Other"', image_drive: 'Immagine (Drive)', image_github: 'Immagine (GitHub)',
  image_credits: 'Crediti immagine', sources: 'Fonti', checks: 'Problemi', changed_fields: 'Campi modificati', review_notes: 'Note interne',
  submitter_name: 'Inviata da', submitter_email: 'Email',
};

// Rows of the Scheda tab that are only read there: column → why (the other rows are edited in column B)
const CARD_READONLY = {
  id: 'l\'id si cambia solo nel tab ' + SHEET_NAME,
  submitted_at: 'data di invio automatica',
  checks: 'lo scrive la validazione',
  changed_fields: 'lo scrive il Registro modifiche',
  image_drive: 'il link si cambia nel tab ' + SHEET_NAME,
  image_github: 'il link si cambia nel tab ' + SHEET_NAME,
};

// ===========================================================================
// Pure helpers (tested in Node)
// ===========================================================================

function columnLabel(column) {
  return LIST_LABELS[column] || BASE_LABELS[column] || column;
}

/** Note of a column (header of Submissions, label in the Scheda): group, label, how to fill it */
function columnNote(column) {
  const g = GROUPS.filter(function (x) { return x.columns.indexOf(column) !== -1; })[0];
  let note = (g ? g.name + ' — ' : '') + columnLabel(column);
  if (COLUMN_NOTES[column]) note += '\n\n' + COLUMN_NOTES[column];
  if (MULTI_VALUE_COLUMNS.indexOf(column) !== -1) note += '\n\nPiù valori separati da virgola, dalla lista nel tab "' + LISTS_SHEET + '". Per sceglierli: menu TALEA → Scegli i valori della cella selezionata.';
  return note;
}

function toText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return isNaN(value.getTime()) ? '' : value.toISOString();
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

/** True if the row has real content (unchecked checkboxes = false do not count) */
function rowHasContent(row) {
  return row.some(function (v) { return v !== false && toText(v).trim() !== ''; });
}

function splitList(value) {
  return toText(value).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
}

/**
 * Text that Sheets would read as a formula (=, +, -, @ at the start) is
 * stored as plain text: the leading apostrophe is not part of the value.
 * Plain numbers ("-12.5") stay numbers.
 */
function neutralizeFormula(value) {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@]/.test(value) && !/^[+-]?\d+(?:[.,]\d+)?$/.test(value.trim())) return "'" + value;
  return value;
}

/**
 * Runs of adjacent columns kept as plain text ("@"). An Italian Sheet would
 * otherwise read "44.4949" as a time (44 h 4949 min) and "05/2019" as a date.
 * Not for id (a number) and the checkboxes.
 */
function textColumnRuns(headers) {
  return runsOf(headers, function (h) { return h && h !== 'id' && BOOLEAN_COLUMNS.indexOf(h) === -1; });
}

/** Runs of adjacent items for which keep(item) is true: [{ start, length }] (one range call each) */
function runsOf(items, keep) {
  const runs = [];
  items.forEach(function (item, i) {
    if (!keep(item)) return;
    const last = runs[runs.length - 1];
    if (last && last.start + last.length === i) last.length++;
    else runs.push({ start: i, length: 1 });
  });
  return runs;
}

function setTextFormat(sheet, headers, firstRow, numRows) {
  if (numRows < 1) return;
  textColumnRuns(headers).forEach(function (r) {
    sheet.getRange(firstRow, r.start + 1, numRows, r.length).setNumberFormat('@');
  });
}

function isDateValue(value) {
  return Object.prototype.toString.call(value) === '[object Date]';
}

function isValidEmail(email) {
  return /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(String(email || '').trim());
}

function allowedValues(column) {
  const list = LISTS[column] || [];
  return FIELDS_WITH_OTHER.indexOf(column) !== -1 ? list.concat(['Other']) : list;
}

/** "a2_urban_area: Industrial area" / "a5_management [Private]: text" (see scripts/other-details.js) */
function invalidOtherDetailsLines(value) {
  return toText(value).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean).filter(function (line) {
    const m = /^([a-d]\d(?:_\d)?_[a-z_]+)\s*(?:\[([^\]]+)\])?\s*:\s*(.+)$/.exec(line);
    return !m || MULTI_VALUE_COLUMNS.indexOf(m[1]) === -1;
  });
}

/**
 * Problems of one row ({ column: value }), as short Italian sentences.
 * opts.submit = true also checks the fields required by the form.
 */
function validateRecord(record, opts) {
  const problems = [];
  const required = opts && opts.submit ? REQUIRED_ON_SUBMIT : REQUIRED_ALWAYS;
  required.forEach(function (c) {
    if (!toText(record[c]).trim()) problems.push('manca ' + c);
  });
  // Rows added by hand need an id too, otherwise the site numbers them on its own
  if (!/^\d+$/.test(toText(record.id).trim())) problems.push('manca l\'id (scrivi il numero più alto + 1)');
  if (record.status !== undefined && toText(record.status).trim() && STATUSES.indexOf(toText(record.status).trim()) === -1) {
    problems.push('status "' + toText(record.status) + '" non valido (pending, approved, denied)');
  }
  SINGLE_VALUE_COLUMNS.forEach(function (c) {
    const v = toText(record[c]).trim();
    if (v && LISTS[c] && LISTS[c].indexOf(v) === -1) problems.push(c + ': "' + v + '" non è tra i valori ammessi');
  });
  MULTI_VALUE_COLUMNS.forEach(function (c) {
    const allowed = allowedValues(c);
    splitList(record[c]).forEach(function (v) {
      if (allowed.indexOf(v) === -1) problems.push(c + ': "' + v + '" non è nella lista');
    });
  });
  const lat = toText(record.latitude).trim();
  const lng = toText(record.longitude).trim();
  if ((lat || lng) && !getNormalizedCoordinatePair(lat, lng)) problems.push('coordinate non valide');
  invalidOtherDetailsLines(record.other_details).forEach(function (line) {
    problems.push('other_details: riga non valida "' + line + '"');
  });
  if (toText(record.submitter_email).trim() && !isValidEmail(record.submitter_email)) {
    problems.push('submitter_email non valida');
  }
  return problems;
}

/** trustedRows: [[email, name, code, notes], …]. Empty code in the list = email is enough. */
function isTrusted(email, code, trustedRows) {
  const e = toText(email).trim().toLowerCase();
  if (!e) return false;
  return trustedRows.some(function (r) {
    if (toText(r[0]).trim().toLowerCase() !== e) return false;
    const expected = toText(r[2]).trim();
    return !expected || expected === toText(code).trim();
  });
}

function trustedEmailSet(trustedRows) {
  const set = {};
  trustedRows.forEach(function (r) {
    const e = toText(r[0]).trim().toLowerCase();
    if (e) set[e] = true;
  });
  return set;
}

/** Submissions of the last 24 h: { byEmail, total } (total ignores trusted emails) */
function countRecent(records, email, now, trustedSet) {
  const since = now.getTime() - 24 * 3600 * 1000;
  const e = toText(email).trim().toLowerCase();
  let byEmail = 0;
  let total = 0;
  records.forEach(function (r) {
    const t = r.submitted_at instanceof Date ? r.submitted_at.getTime() : Date.parse(toText(r.submitted_at));
    if (!(t >= since)) return;
    const re = toText(r.submitter_email).trim().toLowerCase();
    if (re && re === e) byEmail++;
    if (!re || !trustedSet[re]) total++;
  });
  return { byEmail: byEmail, total: total };
}

function parseImageDataUrl(dataUrl) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(toText(dataUrl));
  if (!m) return null;
  const base64 = m[2].replace(/\s/g, '');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[m[1]];
  return { mimeType: m[1], base64: base64, ext: ext, bytes: Math.floor(base64.length * 3 / 4) };
}

/**
 * Submission payload → row object. Only known columns are taken; server
 * columns are ignored; texts are trimmed and cut to MAX_TEXT_LENGTH.
 */
function buildSubmissionRecord(data) {
  const record = {};
  const notes = [];
  HEADERS.forEach(function (h) {
    if (SERVER_COLUMNS.indexOf(h) !== -1 || PRIVATE_COLUMNS.indexOf(h) !== -1) return;
    let v = data[h];
    if (v === undefined || v === null) return;
    if (BOOLEAN_COLUMNS.indexOf(h) !== -1) {
      record[h] = v === true || toText(v).toLowerCase() === 'true';
      return;
    }
    v = toText(v).trim();
    if (v.length > MAX_TEXT_LENGTH) {
      v = v.slice(0, MAX_TEXT_LENGTH);
      notes.push(h + ': testo tagliato a ' + MAX_TEXT_LENGTH + ' caratteri');
    }
    if (v) record[h] = v;
  });
  ['submitter_name', 'submitter_email'].forEach(function (h) {
    const v = toText(data[h]).trim().slice(0, 200);
    if (v) record[h] = v;
  });
  return { record: record, notes: notes };
}

/**
 * Rows of an import tab → rows to append, aligned to the sheet headers by
 * column name. Ids already in the sheet are skipped.
 */
function planImport(sheetHeaders, existingIds, importHeaders, importRows) {
  const idx = {};
  importHeaders.forEach(function (h, i) { idx[toText(h).trim()] = i; });
  const ignored = Object.keys(idx).filter(function (h) { return h && sheetHeaders.indexOf(h) === -1; });
  const missing = sheetHeaders.filter(function (h) { return h && !(h in idx) && PRIVATE_COLUMNS.indexOf(h) === -1; });
  const existing = {};
  existingIds.forEach(function (id) { existing[toText(id).trim()] = true; });
  const seen = {};
  const append = [];
  const skipped = [];
  const converted = [];
  importRows.forEach(function (row) {
    if (!rowHasContent(row)) return;
    const id = 'id' in idx ? toText(row[idx.id]).trim() : '';
    if (!/^\d+$/.test(id)) { skipped.push({ id: id, reason: 'id mancante o non numerico' }); return; }
    if (existing[id]) { skipped.push({ id: id, reason: 'id già presente nello Sheet' }); return; }
    if (seen[id]) { skipped.push({ id: id, reason: 'id ripetuto nel tab di import' }); return; }
    seen[id] = true;
    append.push(sheetHeaders.map(function (h) {
      if (!(h in idx)) return '';
      const v = row[idx[h]];
      // real booleans: the text "TRUE" is not a checkbox (and in Italian it would be VERO)
      if (BOOLEAN_COLUMNS.indexOf(h) !== -1) return v === true || /^(true|vero)$/i.test(toText(v).trim());
      // A date or time here means the CSV was imported with "Converti testo in numeri,
      // date e formule": "44.4949" has become 44 h 4949 min and cannot be recovered
      if (isDateValue(v)) {
        if (h === 'submitted_at') return v.toISOString();
        converted.push({ id: id, column: h });
        return '';
      }
      return typeof v === 'string' ? neutralizeFormula(v) : v;
    }));
  });
  return { append: append, skipped: skipped, ignoredColumns: ignored, missingColumns: missing, converted: converted };
}

function sameValue(a, b) {
  const norm = function (v) { return toText(v).replace(/\r\n/g, '\n').trim(); };
  const x = norm(a);
  const y = norm(b);
  return x === y || (/^(true|false)$/i.test(x) && x.toLowerCase() === y.toLowerCase());
}

/**
 * Corrections (id, column, current_value, new_value) → what to do with each:
 * apply only if the cell still has the expected current value.
 */
function planPatch(sheetHeaders, sheetRows, patchRows) {
  const idCol = sheetHeaders.indexOf('id');
  const rowById = {};
  sheetRows.forEach(function (r, i) {
    const id = toText(r[idCol]).trim();
    if (id) rowById[id] = rowById[id] === undefined ? i : -1; // -1 = duplicate id
  });
  return patchRows.map(function (p) {
    const out = { id: toText(p.id).trim(), column: toText(p.column).trim(), expected: p.current_value, next: p.new_value };
    const col = sheetHeaders.indexOf(out.column);
    const rowIndex = rowById[out.id];
    if (col === -1) return Object.assign(out, { action: 'skip', reason: 'colonna non trovata' });
    if (rowIndex === undefined) return Object.assign(out, { action: 'skip', reason: 'id non trovato' });
    if (rowIndex === -1) return Object.assign(out, { action: 'skip', reason: 'id presente più volte' });
    const current = sheetRows[rowIndex][col];
    Object.assign(out, { rowIndex: rowIndex, colIndex: col, current: current });
    if (sameValue(current, out.next)) return Object.assign(out, { action: 'done', reason: 'già applicata' });
    if (!sameValue(current, out.expected)) return Object.assign(out, { action: 'skip', reason: 'valore attuale diverso da quello atteso' });
    return Object.assign(out, { action: 'apply', reason: '' });
  });
}

/** Approved rows with the public columns only, as strings (what the sync needs) */
function buildExport(headers, displayRows) {
  const publicColumns = HEADERS.filter(function (h) { return PRIVATE_COLUMNS.indexOf(h) === -1 && headers.indexOf(h) !== -1; });
  const statusCol = headers.indexOf('status');
  const rows = displayRows
    .filter(function (r) { return toText(r[statusCol]).trim().toLowerCase() === 'approved'; })
    .map(function (r) {
      const o = {};
      publicColumns.forEach(function (h) { o[h] = toText(r[headers.indexOf(h)]); });
      return o;
    });
  return { columns: publicColumns, rows: rows };
}

/** Where to insert the missing HEADERS: [{ header, after }] (after = existing header or null) */
function planMissingColumns(currentHeaders) {
  const present = currentHeaders.slice();
  const plan = [];
  HEADERS.forEach(function (h, i) {
    if (present.indexOf(h) !== -1) return;
    let after = null;
    for (let j = i - 1; j >= 0; j--) {
      if (present.indexOf(HEADERS[j]) !== -1) { after = HEADERS[j]; break; }
    }
    plan.push({ header: h, after: after });
    const pos = after === null ? 0 : present.indexOf(after) + 1;
    present.splice(pos, 0, h);
  });
  return { plan: plan, headers: present };
}

/**
 * Cell → text, the same in every Sheet locale: booleans TRUE/FALSE, numbers
 * with "." (the Italian display would give VERO and 45,486100), dates as shown.
 */
function cellText(value, display) {
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return isFinite(value) ? String(value) : toText(display);
  if (value instanceof Date) return toText(display);
  return toText(value);
}

/** getValues() + getDisplayValues() of the same range → texts (see cellText) */
function textRows(values, display) {
  return values.map(function (row, i) {
    return row.map(function (v, j) { return cellText(v, display[i][j]); });
  });
}

function escapeHtml(value) {
  return toText(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- Images: link to the file in Drive (form uploads) and on GitHub (site)

function driveFileUrl(fileId) {
  return 'https://drive.google.com/file/d/' + fileId + '/view';
}

/** Drive link (…/d/<id>/…, …?id=<id>) or bare id → id ('' if not recognised) */
function driveFileId(value) {
  const text = toText(value).trim();
  const m = /\/d\/([A-Za-z0-9_-]{10,})/.exec(text) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(text);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{10,}$/.test(text) ? text : '';
}

/** Where the nightly sync puts the image of case <id> (see scripts/sync-approved.js) */
function githubImageUrl(id, ext) {
  return 'https://github.com/' + GITHUB_REPO + '/blob/main/public/images/cs_' + id + '.' + ext;
}

// ---- Change tracking

/** Row (texts) → { column: text } with the tracked columns of HEADERS only */
function trackedRecord(headers, row) {
  const r = {};
  headers.forEach(function (h, i) {
    if (h && HEADERS.indexOf(h) !== -1 && UNTRACKED_COLUMNS.indexOf(h) === -1) r[h] = toText(row[i]).replace(/\r\n/g, '\n');
  });
  return r;
}

/** Columns whose value differs, in HEADERS order: [{ column, before, after }]. Only columns of `after` are compared. */
function diffRecords(before, after) {
  return HEADERS.filter(function (h) {
    return UNTRACKED_COLUMNS.indexOf(h) === -1 && Object.prototype.hasOwnProperty.call(after, h) && !sameValue(before[h], after[h]);
  }).map(function (h) {
    return { column: h, before: toText(before[h]), after: toText(after[h]) };
  });
}

/** Content columns that differ from the original version (status and links excluded) */
function changedFields(original, current) {
  return diffRecords(original, current).map(function (d) { return d.column; }).filter(function (c) {
    return NOT_CONTENT_COLUMNS.indexOf(c) === -1;
  });
}

/** Record → cells of JSON, each starting with "~" so that Sheets keeps it as plain text */
function encodeSnapshot(record) {
  const json = JSON.stringify(record);
  const cells = [];
  let start = 0;
  while (start < json.length) {
    let end = Math.min(start + SNAPSHOT_CHUNK, json.length);
    const code = json.charCodeAt(end - 1);
    if (end < json.length && code >= 0xD800 && code <= 0xDBFF) end--; // keep emoji (surrogate pairs) whole
    cells.push('~' + json.slice(start, end));
    start = end;
  }
  return cells;
}

function decodeSnapshot(cells) {
  const json = cells.map(toText).filter(function (c) { return c.charAt(0) === '~'; }).map(function (c) { return c.slice(1); }).join('');
  if (!json) return null;
  try {
    const record = JSON.parse(json);
    return record && typeof record === 'object' ? record : null;
  } catch (err) {
    return null;
  }
}

// ---- Notification email

/** One proposal as HTML for the email: every filled field, grouped, readable on a phone */
function proposalHtml(record, link) {
  const text = function (v) { return escapeHtml(v).replace(/\r?\n/g, '<br>'); };
  const value = function (c) { return toText(record[c]).trim(); };
  const place = [value('city'), value('country')].filter(Boolean).join(', ') + (value('year') ? ' · ' + value('year') : '');
  let html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.45;color:#222;max-width:680px">'
    + '<h2 style="margin:0 0 4px;font-size:19px">#' + escapeHtml(value('id')) + ' — ' + text(value('title') || 'senza titolo') + '</h2>'
    + '<div style="color:#555">' + escapeHtml(place) + '</div>';
  html += value('checks')
    ? '<div style="background:#fdecea;border-left:4px solid #c53030;padding:8px 12px;margin:14px 0"><b>Da controllare</b><br>' + text(value('checks')) + '</div>'
    : '<div style="background:#e8f5e9;border-left:4px solid #2e7d32;padding:8px 12px;margin:14px 0">Nessun problema trovato dalla validazione.</div>';
  if (link) {
    html += '<a href="' + escapeHtml(link) + '" style="display:inline-block;background:#37474f;color:#ffffff;padding:10px 16px;border-radius:4px;text-decoration:none">Apri la riga nello Sheet</a>';
  }
  GROUPS.forEach(function (g) {
    const fields = g.columns.filter(function (c) {
      return c !== 'checks' && c !== 'image_github' && value(c) && !(BOOLEAN_COLUMNS.indexOf(c) !== -1 && !/^(true|vero)$/i.test(value(c)));
    });
    if (!fields.length) return;
    html += '<div style="background:' + g.color + ';color:' + g.font + ';font-weight:bold;padding:6px 10px;margin-top:18px">' + escapeHtml(g.name) + '</div>';
    fields.forEach(function (c) {
      let shown = text(value(c));
      if (BOOLEAN_COLUMNS.indexOf(c) !== -1) shown = 'sì';
      if (c === 'image_drive') {
        const id = driveFileId(value(c));
        shown = id ? '<a href="' + escapeHtml(driveFileUrl(id)) + '">Apri l\'immagine</a>' : shown;
      }
      html += '<div style="padding:6px 10px;border-bottom:1px solid #e5e5e5">'
        + '<div style="font-size:12px;color:#666;font-weight:bold">' + escapeHtml(columnLabel(c)) + '</div>'
        + '<div>' + shown + '</div></div>';
    });
  });
  return html + '</div>';
}

// Coordinates (same rules as scripts/sync-approved.js)

function parseDecimalCoordinate(raw) {
  let value = String(raw).replace(/[−–—]/g, '-').replace(/\s+/g, '');
  if (value.indexOf(',') !== -1 && value.indexOf('.') !== -1) {
    value = value.lastIndexOf(',') > value.lastIndexOf('.') ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
  } else if (value.indexOf(',') !== -1) {
    value = value.replace(',', '.');
  }
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) return null;
  const parsed = Number(value);
  return isFinite(parsed) ? parsed : null;
}

function parseDmsCoordinate(raw, sign) {
  const match = String(raw).match(/^([+-])?\s*(\d{1,3})\D+(\d{1,2})(?:\D+(\d{1,2}(?:[.,]\d+)?))?\s*$/);
  if (!match) return null;
  const degrees = Number(match[2]);
  const minutes = Number(match[3]);
  const seconds = Number(String(match[4] || '0').replace(',', '.'));
  if (!isFinite(degrees) || !isFinite(minutes) || !isFinite(seconds)) return null;
  if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) return null;
  return (degrees + minutes / 60 + seconds / 3600) * sign;
}

function parseCoordinateValue(value, axis) {
  if (value === null || value === undefined || value === '') return null;
  const limit = axis === 'latitude' ? 90 : 180;
  if (typeof value === 'number') return isFinite(value) && Math.abs(value) <= limit ? value : null;
  const normalized = String(value).trim().replace(/[−–—]/g, '-');
  if (!normalized) return null;
  const sign = normalized.charAt(0) === '-' || /[SW]/i.test(normalized) ? -1 : 1;
  const withoutCompass = normalized.replace(/[NSEW]/gi, '').trim();
  const decimal = parseDecimalCoordinate(withoutCompass);
  if (decimal !== null) {
    const signed = withoutCompass.charAt(0) === '-' ? decimal : Math.abs(decimal) * sign;
    if (Math.abs(signed) <= limit) return signed;
  }
  const dms = parseDmsCoordinate(withoutCompass, sign);
  return dms !== null && Math.abs(dms) <= limit ? dms : null;
}

function formatCoordinateValue(value) {
  return value.toFixed(6).replace(/\.?0+$/, '');
}

function getNormalizedCoordinatePair(latitudeValue, longitudeValue) {
  const lat = parseCoordinateValue(latitudeValue, 'latitude');
  const lng = parseCoordinateValue(longitudeValue, 'longitude');
  if (lat !== null && lng !== null) return { lat: lat, lng: lng, swapped: false };
  const sLat = parseCoordinateValue(longitudeValue, 'latitude');
  const sLng = parseCoordinateValue(latitudeValue, 'longitude');
  if (sLat !== null && sLng !== null) return { lat: sLat, lng: sLng, swapped: true };
  return null;
}

// ===========================================================================
// Web app: form submissions (POST) and export for the sync (GET)
// ===========================================================================

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOutput({ result: 'error', code: 'bad_request' });
  }
  // Export for the nightly sync (secret key in the body)
  if (data.action) return jsonOutput(handleExport(data));

  // Honeypot: a hidden field that people never fill. Pretend it worked.
  if (toText(data.website).trim()) return jsonOutput({ result: 'success', id: null });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    return jsonOutput(handleSubmission(data));
  } catch (err) {
    console.error(err);
    return jsonOutput({ result: 'error', code: 'server_error' });
  } finally {
    lock.releaseLock();
  }
}

function handleSubmission(data) {
  const built = buildSubmissionRecord(data);
  const record = built.record;

  const missing = REQUIRED_ON_SUBMIT.filter(function (c) { return !toText(record[c]).trim(); });
  if (missing.length) return { result: 'error', code: 'missing_fields', fields: missing };
  if (!isValidEmail(record.submitter_email)) return { result: 'error', code: 'invalid_email' };

  const sheet = getSubmissionsSheet();
  const headers = ensureColumns(sheet);
  const records = readRecords(sheet, headers);
  const trustedRows = getTrustedRows();
  const trusted = isTrusted(record.submitter_email, data.access_code, trustedRows);

  if (!trusted) {
    const settings = getSettings();
    const recent = countRecent(records, record.submitter_email, new Date(), trustedEmailSet(trustedRows));
    if (recent.byEmail >= Number(settings.max_per_email_per_day || 3) || recent.total >= Number(settings.max_total_per_day || 20)) {
      return { result: 'error', code: 'rate_limited' };
    }
  }

  const id = records.reduce(function (max, r) {
    const n = parseInt(r.id, 10);
    return isNaN(n) ? max : Math.max(max, n);
  }, 0) + 1;

  const notes = built.notes.slice();
  if (data.image_data) {
    const image = parseImageDataUrl(data.image_data);
    if (!image) notes.push('immagine non salvata: formato non supportato (solo JPEG, PNG, WebP)');
    else if (image.bytes > MAX_IMAGE_BYTES) notes.push('immagine non salvata: più grande di ' + (MAX_IMAGE_BYTES / 1048576) + ' MB');
    else {
      const blob = Utilities.newBlob(Utilities.base64Decode(image.base64), image.mimeType, 'submission_' + id + '.' + image.ext);
      record.image_drive = driveFileUrl(getImageFolder().createFile(blob).getId());
      // where the sync will copy it once the proposal is approved
      record.image_github = githubImageUrl(id, image.ext);
    }
  }

  const coords = getNormalizedCoordinatePair(record.latitude, record.longitude);
  if (coords) {
    record.latitude = formatCoordinateValue(coords.lat);
    record.longitude = formatCoordinateValue(coords.lng);
  }

  record.id = id;
  record.status = 'pending';
  record.submitted_at = new Date().toISOString();
  record.checks = validateRecord(record, { submit: true }).concat(notes).join('\n');
  if (trusted) record.review_notes = 'Inviata da un Utente fidato';

  const rowNumber = lastDataRow(sheet, headers) + 1;
  if (rowNumber > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), 1);
  setTextFormat(sheet, headers, rowNumber, 1);
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([headers.map(function (h) {
    const v = record[h];
    return v === undefined || v === null ? '' : neutralizeFormula(v);
  })]);

  // The row is saved: from here on a failure must not make the person send it again
  try {
    trackRows(sheet, headers, [rowNumber], 'Modulo del sito', { fresh: true, user: record.submitter_email });
  } catch (err) {
    console.error('Registro modifiche: ' + err);
  }
  if (!trusted) {
    try {
      notifySupervisor([{ record: record, row: rowNumber }], 'Nuova proposta TALEA: ' + (record.title || 'senza titolo'));
    } catch (err) {
      console.error('Email al supervisore non inviata: ' + err);
    }
  }
  return { result: 'success', id: id };
}

function doGet() {
  return ContentService.createTextOutput('TALEA Submission endpoint is active.').setMimeType(ContentService.MimeType.TEXT);
}

/** { action: 'export' } → approved rows · { action: 'image', file } → one image of the Drive folder */
function handleExport(data) {
  const key = PropertiesService.getScriptProperties().getProperty('EXPORT_KEY');
  if (!key || data.key !== key) return { result: 'error', code: 'unauthorized' };

  if (data.action === 'export') {
    const range = getSubmissionsSheet().getDataRange();
    const values = textRows(range.getValues(), range.getDisplayValues());
    const headers = values[0].map(function (h) { return h.trim(); });
    const out = buildExport(headers, values.slice(1));
    return { result: 'success', generated_at: new Date().toISOString(), columns: out.columns, rows: out.rows };
  }
  if (data.action === 'image') {
    const folderId = PropertiesService.getScriptProperties().getProperty('IMAGE_FOLDER_ID');
    let file;
    try { file = DriveApp.getFileById(driveFileId(data.file)); } catch (err) { return { result: 'error', code: 'not_found' }; }
    const parents = file.getParents();
    let inFolder = false;
    while (parents.hasNext()) if (parents.next().getId() === folderId) inFolder = true;
    if (!inFolder) return { result: 'error', code: 'not_found' };
    const blob = file.getBlob();
    return { result: 'success', name: file.getName(), mimeType: blob.getContentType(), base64: Utilities.base64Encode(blob.getBytes()) };
  }
  return { result: 'error', code: 'unknown_action' };
}

// ===========================================================================
// Sheet access
// ===========================================================================

function getSubmissionsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function readHeaders(sheet) {
  if (sheet.getLastColumn() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return toText(h).trim(); });
}

/** Inserts the missing HEADERS in their position. Never moves or rewrites data. */
function ensureColumns(sheet) {
  let headers = readHeaders(sheet);
  if (!headers.some(Boolean)) {
    if (sheet.getMaxColumns() < HEADERS.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), HEADERS.length - sheet.getMaxColumns());
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return HEADERS.slice();
  }
  while (headers.length && !headers[headers.length - 1]) headers.pop();
  planMissingColumns(headers).plan.forEach(function (step) {
    const pos = step.after === null ? 0 : headers.indexOf(step.after) + 1; // 0-based position of the new column
    if (pos === 0) sheet.insertColumnBefore(1);
    else sheet.insertColumnAfter(pos);
    sheet.getRange(1, pos + 1).setValue(step.header);
    headers.splice(pos, 0, step.header);
  });
  return headers;
}

/** Last row with an id (getLastRow() also counts empty rows with checkboxes) */
function lastDataRow(sheet, headers) {
  // id or title: checkbox columns hold FALSE in empty rows, so getLastRow() is not enough,
  // and a row added by hand may still lack its id
  const cols = [headers.indexOf('id') + 1, headers.indexOf('title') + 1].filter(function (c) { return c > 0; });
  const lastRow = sheet.getLastRow();
  if (!cols.length || lastRow < 2) return 1;
  const columns = cols.map(function (c) { return sheet.getRange(2, c, lastRow - 1, 1).getValues(); });
  for (let i = lastRow - 2; i >= 0; i--) {
    if (columns.some(function (values) { return toText(values[i][0]).trim(); })) return i + 2;
  }
  return 1;
}

function readRecords(sheet, headers) {
  const lastRow = lastDataRow(sheet, headers);
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length).getValues().map(function (row) {
    const r = {};
    headers.forEach(function (h, i) { if (h) r[h] = row[i]; });
    return r;
  });
}

function getSettings() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET);
  const settings = {};
  DEFAULT_SETTINGS.forEach(function (s) { settings[s[0]] = s[1]; });
  if (sheet && sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (r) {
      const k = toText(r[0]).trim();
      if (k && toText(r[1]).trim() !== '') settings[k] = r[1];
    });
  }
  return settings;
}

function getTrustedRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRUSTED_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
}

function getImageFolder() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('IMAGE_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (err) { /* recreate below */ }
  }
  const folder = DriveApp.createFolder(IMAGE_FOLDER_NAME);
  props.setProperty('IMAGE_FOLDER_ID', folder.getId());
  return folder;
}

function supervisorEmails() {
  return toText(getSettings().supervisor_email).split(',').map(function (s) { return s.trim(); }).filter(isValidEmail);
}

function rowLink(rowNumber) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getUrl() + '#gid=' + getSubmissionsSheet().getSheetId() + (rowNumber ? '&range=A' + rowNumber : '');
}

/**
 * One email for these proposals ([{ record, row }]): every field, formatted
 * (HTML), plus a plain-text copy for mail apps that do not show HTML.
 */
function notifySupervisor(items, subject) {
  const to = supervisorEmails();
  if (!to.length) return;
  const footer = 'Per approvare o rifiutare: apri lo Sheet, seleziona la riga e usa il menu TALEA. '
    + 'Per leggere tutto in verticale: TALEA → Apri la scheda della riga selezionata.';
  const htmlBody = items.map(function (it) { return proposalHtml(it.record, rowLink(it.row)); })
    .join('<hr style="border:0;border-top:2px solid #cccccc;margin:28px 0">')
    + '<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#666666;margin-top:24px">' + escapeHtml(footer) + '</p>';
  const body = items.map(function (it) {
    const r = it.record;
    return [
      '#' + toText(r.id) + ' — ' + toText(r.title),
      toText(r.city) + ', ' + toText(r.country) + ' · ' + toText(r.year),
      'Size: ' + toText(r.size) + ' · Climate: ' + toText(r.climate_zone) + ' · TALEA: ' + toText(r.talea_application),
      'Inviata da: ' + toText(r.submitter_name) + ' <' + toText(r.submitter_email) + '>',
      toText(r.checks).trim() ? 'Da controllare:\n' + toText(r.checks) : 'Nessun problema trovato dalla validazione.',
      '',
      toText(r.description).slice(0, 600),
      '',
      'Riga nello Sheet: ' + rowLink(it.row),
    ].join('\n');
  }).join('\n\n----------\n\n') + '\n\n---\n' + footer;
  MailApp.sendEmail({ to: to.join(','), subject: subject, body: body, htmlBody: htmlBody, name: 'TALEA NBS Toolkit' });
}

// ===========================================================================
// Change tracking: "Registro modifiche" tab + two hidden tabs
// ===========================================================================
//
// "Originali (interno)" keeps each row as it was first seen (sent with the
// form, imported, or already there when the Registro started); "Ultima
// versione (interno)" keeps the last version seen, to know what each edit
// changed. One row per id: the row as JSON, over more cells when it is long.
// Rows are compared as texts (cellText), so the Sheet's locale does not matter.

/** Snapshots of one hidden tab, or null when Configura has not created it yet */
function openSnapshots(ss, name) {
  const tab = ss.getSheetByName(name);
  if (!tab) return null;
  const lastRow = tab.getLastRow();
  let width = Math.max(tab.getLastColumn(), 2);
  const rowOf = {};
  if (lastRow > 1) {
    tab.getRange(2, 1, lastRow - 1, 1).getDisplayValues().forEach(function (r, i) {
      const id = toText(r[0]).trim();
      if (id && !rowOf[id]) rowOf[id] = i + 2;
    });
  }
  let nextRow = Math.max(lastRow, 1) + 1;
  const cache = {};
  const pending = {}; // sheet row → cells to write

  const store = {
    ids: function () { return Object.keys(rowOf); },
    has: function (id) { return !!rowOf[id]; },
    get: function (id) {
      if (!rowOf[id]) return null;
      if (!(id in cache)) cache[id] = decodeSnapshot(tab.getRange(rowOf[id], 2, 1, width - 1).getValues()[0]);
      return cache[id];
    },
    loadAll: function () {
      if (lastRow < 2) return;
      tab.getRange(2, 1, lastRow - 1, width).getValues().forEach(function (r, i) {
        const id = toText(r[0]).trim();
        if (id && rowOf[id] === i + 2 && !(id in cache)) cache[id] = decodeSnapshot(r.slice(1));
      });
    },
    put: function (id, record) {
      if (!rowOf[id]) rowOf[id] = nextRow++;
      cache[id] = record;
      pending[rowOf[id]] = [id].concat(encodeSnapshot(record));
    },
    remove: function (id) {
      if (!rowOf[id]) return;
      pending[rowOf[id]] = [''];
      delete rowOf[id];
      delete cache[id];
    },
    rename: function (from, to) {
      if (!rowOf[from] || rowOf[to]) return;
      const record = store.get(from) || {};
      rowOf[to] = rowOf[from];
      delete rowOf[from];
      delete cache[from];
      cache[to] = record;
      pending[rowOf[to]] = [to].concat(encodeSnapshot(record));
    },
    /** Writes the changes, one setValues per block of consecutive rows */
    flush: function () {
      const rows = Object.keys(pending).map(Number).sort(function (a, b) { return a - b; });
      if (!rows.length) return;
      rows.forEach(function (r) { width = Math.max(width, pending[r].length); });
      if (tab.getMaxColumns() < width) tab.insertColumnsAfter(tab.getMaxColumns(), width - tab.getMaxColumns());
      const lastNeeded = rows[rows.length - 1];
      if (tab.getMaxRows() < lastNeeded) tab.insertRowsAfter(tab.getMaxRows(), lastNeeded - tab.getMaxRows() + 50);
      let start = 0;
      for (let i = 1; i <= rows.length; i++) {
        if (i < rows.length && rows[i] === rows[i - 1] + 1) continue;
        const block = rows.slice(start, i).map(function (r) {
          const cells = pending[r].slice();
          while (cells.length < width) cells.push('');
          return cells;
        });
        tab.getRange(rows[start], 1, block.length, width).setValues(block);
        start = i;
      }
      rows.forEach(function (r) { delete pending[r]; });
    },
  };
  return store;
}

/** Email of the person using the Sheet. Google gives it only to the owner and to accounts of the same domain. */
function currentUser() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (err) {
    return '';
  }
}

/** Runs fn holding the script lock (the web app uses it too), so two changes are not recorded at the same time */
function withLock(fn) {
  let lock = null;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return false;
  } catch (err) {
    lock = null; // lock service not available here: run anyway
  }
  try {
    fn();
    return true;
  } finally {
    if (lock) lock.releaseLock();
  }
}

/**
 * Compares these rows of Submissions with their last seen version: each
 * change becomes a line of the Registro modifiche, and changed_fields lists
 * the fields that now differ from the original. Does nothing until Configura
 * has created the tabs.
 *   opts.fresh    rows just created (form, import): their id starts a new history
 *   opts.user     who made the change (default: the person using the Sheet)
 *   opts.renamed  { from, to }: the id of one row was changed in its cell
 */
function trackRows(sheet, headers, rowNumbers, source, opts) {
  opts = opts || {};
  const ss = sheet.getParent();
  const originals = openSnapshots(ss, ORIGINALS_SHEET);
  const lasts = openSnapshots(ss, LAST_SHEET);
  if (!originals || !lasts || headers.indexOf('id') === -1) return;
  const when = new Date();
  const user = opts.user !== undefined ? toText(opts.user) : currentUser();
  const log = [];
  const add = function (id, title, column, before, after) {
    log.push([when, user || '—', id, title, column, before, after, source]);
  };
  const counts = countIds(sheet, headers);
  const rows = rowNumbers.filter(function (r) { return r >= 2; });
  // First run (Configura): one line in the Registro instead of one per row
  const summarizeNew = !lasts.ids().length && rows.length > 1;
  if (rows.length > 20) {
    originals.loadAll();
    lasts.loadAll();
  }

  // The id of a row was changed in its cell: the history follows the row
  const ren = opts.renamed;
  if (ren && ren.from && ren.to && ren.from !== ren.to && lasts.has(ren.from) && !lasts.has(ren.to)) {
    lasts.rename(ren.from, ren.to);
    originals.rename(ren.from, ren.to);
  }
  // Ids that are no longer in the tab: row deleted, or its id cleared
  lasts.ids().forEach(function (id) {
    if (counts[id]) return;
    add(id, toText((lasts.get(id) || {}).title), '(riga rimossa)', '', 'nessuna riga ha più questo id');
    lasts.remove(id);
    originals.remove(id);
  });

  let newRows = 0;
  if (rows.length) {
    const changedIndex = headers.indexOf('changed_fields');
    const first = Math.min.apply(null, rows);
    const last = Math.max.apply(null, rows);
    const range = sheet.getRange(first, 1, last - first + 1, headers.length);
    const texts = textRows(range.getValues(), range.getDisplayValues());
    const changedColumn = texts.map(function (r) { return [changedIndex === -1 ? '' : r[changedIndex]]; });
    let changedDirty = false;
    rows.forEach(function (rowNumber) {
      const current = trackedRecord(headers, texts[rowNumber - first]);
      const id = toText(current.id).trim();
      if (!id || counts[id] > 1) return; // no id yet, or the same id on more rows (reported in checks)
      const title = toText(current.title);
      if (opts.fresh && lasts.has(id)) {
        add(id, toText((lasts.get(id) || {}).title), '(riga rimossa)', '', 'sostituita da una nuova riga con lo stesso id');
        lasts.remove(id);
        originals.remove(id);
      }
      let changed = '';
      const before = lasts.get(id);
      if (!before) {
        originals.put(id, current);
        lasts.put(id, current);
        newRows++;
        if (!summarizeNew) add(id, title, '(nuova riga)', '', opts.fresh ? '' : 'prima versione registrata');
      } else {
        const diffs = diffRecords(before, current);
        diffs.forEach(function (d) { add(id, title, d.column, d.before, d.after); });
        if (diffs.length) lasts.put(id, Object.assign({}, before, current));
        changed = changedFields(originals.get(id) || before, current).join(', ');
      }
      if (changedIndex !== -1 && changedColumn[rowNumber - first][0] !== changed) {
        changedColumn[rowNumber - first][0] = changed;
        changedDirty = true;
      }
    });
    originals.flush();
    lasts.flush();
    if (changedDirty) sheet.getRange(first, changedIndex + 1, changedColumn.length, 1).setValues(changedColumn);
  }
  if (summarizeNew && newRows) add('', '', '(inizio del registro)', '', newRows + ' righe registrate come versione originale');
  appendLog(ss, log);
}

/** Every row: new rows, changes not recorded yet (e.g. made while the lock was busy), deleted rows */
function reconcileTracking(sheet, headers, source) {
  const last = lastDataRow(sheet, headers);
  const rows = [];
  for (let r = 2; r <= last; r++) rows.push(r);
  // nobody to name: these changes were made earlier, by someone else maybe
  trackRows(sheet, headers, rows, source, { user: '' });
}

function appendLog(ss, entries) {
  const tab = ss.getSheetByName(LOG_SHEET);
  if (!tab || !entries.length) return;
  const start = Math.max(tab.getLastRow(), 1) + 1;
  const end = start + entries.length - 1;
  if (tab.getMaxRows() < end) tab.insertRowsAfter(tab.getMaxRows(), end - tab.getMaxRows() + 100);
  tab.getRange(start, 1, entries.length, 1).setValues(entries.map(function (e) { return [e[0]]; }));
  // Plain text, written with setValues: otherwise "44.4949" becomes a time and
  // "=…" a formula (rich text values are read like typed text, whatever the format)
  tab.getRange(start, 2, entries.length, 7).setNumberFormat('@').setValues(entries.map(function (e) {
    return e.slice(1).map(function (v) { return neutralizeFormula(toText(v)); });
  }));
}

// ===========================================================================
// Menu
// ===========================================================================

/**
 * Google lets people tick each permission separately. If one is missing, stop
 * before doing anything and show the consent screen again for all of them,
 * instead of failing halfway (e.g. at Drive or at the daily trigger).
 * Called first by every menu command (not by onEdit: simple triggers cannot ask).
 */
function requireAllPermissions() {
  ScriptApp.requireAllScopes(ScriptApp.AuthMode.FULL);
}

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('TALEA')
    .addItem('Scegli i valori della cella selezionata', 'menuPickValues')
    .addItem('Apri la scheda della riga selezionata', 'menuOpenCard')
    .addSeparator()
    .addItem('Valida tutte le righe', 'menuValidateAll')
    .addItem('Approva le righe selezionate', 'menuApprove')
    .addItem('Rifiuta le righe selezionate', 'menuDeny')
    .addItem('Pubblica ora sul sito', 'menuPublishNow')
    .addSeparator()
    .addSubMenu(ui.createMenu('Strumenti')
      .addItem('Importa righe da un tab…', 'menuImportRows')
      .addItem('Applica correzioni da un tab…', 'menuApplyPatch')
      .addSeparator()
      .addItem('Configura / aggiorna lo Sheet', 'setupSheet')
      .addItem('Genera la chiave per la sincronizzazione', 'menuGenerateExportKey')
      .addItem('Imposta il token GitHub per "Pubblica ora"', 'menuSetGithubToken'))
    .addToUi();
}

/**
 * Simple trigger: re-validate the edited rows of Submissions, record the
 * change in the Registro modifiche, keep the Scheda tab up to date. Edits made
 * in the Scheda go to Submissions (onCardEdit).
 */
function onEdit(e) {
  const sheet = e && e.range && e.range.getSheet();
  if (!sheet) return;
  if (sheet.getName() === CARD_SHEET) {
    onCardEdit(e);
    return;
  }
  if (sheet.getName() !== SHEET_NAME || e.range.getRow() < 2 && e.range.getLastRow() < 2) return;
  const headers = readHeaders(sheet);
  const checksCol = headers.indexOf('checks') + 1;
  if (!checksCol || (e.range.getColumn() === checksCol && e.range.getNumColumns() === 1)) return;
  const first = Math.max(2, e.range.getRow());
  const last = Math.min(e.range.getLastRow(), first + 199);
  revalidateRows(sheet, headers, first, last);
  const idCol = headers.indexOf('id') + 1;
  const rows = [];
  for (let r = first; r <= last; r++) rows.push(r);
  // One id typed over another: the history of the row keeps going under the new id
  const renamed = idCol && e.range.getNumRows() === 1 && e.range.getNumColumns() === 1 && e.range.getColumn() === idCol
    && e.oldValue !== undefined ? { from: toText(e.oldValue).trim(), to: toText(e.range.getDisplayValue()).trim() } : null;
  try {
    withLock(function () { trackRows(sheet, headers, rows, 'Modifica nello Sheet', { renamed: renamed }); });
  } catch (err) {
    console.error('Registro modifiche: ' + err); // "Valida tutte" records it later
  }
  if (idCol) {
    const ids = sheet.getRange(first, idCol, last - first + 1, 1).getDisplayValues().map(function (r) { return r[0]; });
    if (renamed) ids.push(renamed.from);
    refreshCard(ids);
  }
}

function revalidateRows(sheet, headers, first, last) {
  const checksCol = headers.indexOf('checks') + 1;
  if (!checksCol || last < first) return 0;
  const values = sheet.getRange(first, 1, last - first + 1, headers.length).getValues();
  const idCounts = countIds(sheet, headers);
  let withProblems = 0;
  const out = values.map(function (row) {
    if (!rowHasContent(row)) return [''];
    const r = {};
    headers.forEach(function (h, i) { if (h) r[h] = row[i]; });
    const problems = validateRecord(r, {});
    const id = toText(r.id).trim();
    if (id && idCounts[id] > 1) problems.push('id ' + id + ' usato da più righe (la pubblicazione si blocca)');
    if (problems.length) withProblems++;
    return [problems.join('\n')];
  });
  sheet.getRange(first, checksCol, out.length, 1).setValues(out);
  return withProblems;
}

/** How many rows use each id ({ "12": 1, ... }) */
function countIds(sheet, headers) {
  const col = headers.indexOf('id') + 1;
  const last = lastDataRow(sheet, headers);
  const counts = {};
  if (!col || last < 2) return counts;
  sheet.getRange(2, col, last - 1, 1).getDisplayValues().forEach(function (r) {
    const id = toText(r[0]).trim();
    if (id) counts[id] = (counts[id] || 0) + 1;
  });
  return counts;
}

function activeSubmissionsRows() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET_NAME) {
    SpreadsheetApp.getUi().alert('Seleziona prima una o più righe nel tab ' + SHEET_NAME + '.');
    return null;
  }
  const rows = [];
  sheet.getActiveRangeList().getRanges().forEach(function (range) {
    for (let r = range.getRow(); r <= range.getLastRow(); r++) if (r >= 2 && rows.indexOf(r) === -1) rows.push(r);
  });
  if (!rows.length) {
    SpreadsheetApp.getUi().alert('Seleziona una o più righe di dati (non l\'intestazione).');
    return null;
  }
  return { sheet: sheet, rows: rows };
}

function menuValidateAll() {
  requireAllPermissions();
  const sheet = getSubmissionsSheet();
  const headers = ensureColumns(sheet);
  const n = revalidateRows(sheet, headers, 2, lastDataRow(sheet, headers));
  // Also records the changes the Registro has missed (e.g. rows deleted)
  withLock(function () { reconcileTracking(sheet, headers, 'Controllo completo'); });
  refreshCard();
  SpreadsheetApp.getUi().alert(n ? n + ' righe hanno problemi: vedi la colonna "checks" (le righe sono evidenziate).' : 'Nessun problema trovato.');
}

function setStatusOfSelection(status) {
  const sel = activeSubmissionsRows();
  if (!sel) return;
  const headers = readHeaders(sel.sheet);
  const statusCol = headers.indexOf('status') + 1;
  const checksCol = headers.indexOf('checks') + 1;
  const idCol = headers.indexOf('id') + 1;
  if (status === 'approved' && checksCol) {
    const withProblems = sel.rows.filter(function (r) {
      revalidateRows(sel.sheet, headers, r, r);
      return toText(sel.sheet.getRange(r, checksCol).getValue()).trim();
    });
    if (withProblems.length) {
      const ids = withProblems.map(function (r) { return '#' + sel.sheet.getRange(r, idCol).getValue(); }).join(', ');
      const ui = SpreadsheetApp.getUi();
      if (ui.alert('Problemi trovati', 'Le righe ' + ids + ' hanno problemi (colonna "checks"). Approvare comunque?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    }
  }
  sel.rows.forEach(function (r) { sel.sheet.getRange(r, statusCol).setValue(status); });
  withLock(function () { trackRows(sel.sheet, headers, sel.rows, status === 'approved' ? 'Approva' : 'Rifiuta'); });
  refreshCard(sel.rows.map(function (r) { return sel.sheet.getRange(r, idCol).getDisplayValue(); }));
  SpreadsheetApp.getActive().toast(sel.rows.length + ' righe → ' + status
    + (status === 'approved' ? '. Vanno sul sito alla prossima pubblicazione (stanotte o con "Pubblica ora").' : ''), 'TALEA', 8);
}

function menuApprove() { requireAllPermissions(); setStatusOfSelection('approved'); }
function menuDeny() { requireAllPermissions(); setStatusOfSelection('denied'); }

function menuPublishNow() {
  requireAllPermissions();
  const ui = SpreadsheetApp.getUi();
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    ui.alert('Token GitHub non impostato: menu TALEA → Strumenti → Imposta il token GitHub.');
    return;
  }
  const res = UrlFetchApp.fetch('https://api.github.com/repos/' + GITHUB_REPO + '/actions/workflows/' + GITHUB_WORKFLOW + '/dispatches', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' },
    payload: JSON.stringify({ ref: 'main' }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() === 204) {
    ui.alert('Pubblicazione avviata. Il sito si aggiorna entro qualche minuto con le righe "approved".');
  } else {
    ui.alert('GitHub ha risposto ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300)
      + '\n\nControlla che il token sia valido e abbia il permesso "Actions: Read and write" sulla repo ' + GITHUB_REPO + '.');
  }
}

function menuGenerateExportKey() {
  requireAllPermissions();
  const ui = SpreadsheetApp.getUi();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('EXPORT_KEY')) {
    if (ui.alert('Esiste già una chiave', 'Generandone una nuova la sincronizzazione smette di funzionare finché non aggiorni il secret SHEET_EXPORT_KEY su GitHub. Continuare?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  }
  const key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  props.setProperty('EXPORT_KEY', key);
  ui.alert('Chiave per la sincronizzazione', 'Copiala nel secret SHEET_EXPORT_KEY della repo GitHub (Settings → Secrets and variables → Actions). Non verrà più mostrata:\n\n' + key, ui.ButtonSet.OK);
}

function menuSetGithubToken() {
  requireAllPermissions();
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt('Token GitHub', 'Incolla un token "fine-grained" limitato alla repo ' + GITHUB_REPO + ' con il permesso "Actions: Read and write". Lascia vuoto per rimuoverlo.', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const token = res.getResponseText().trim();
  const props = PropertiesService.getScriptProperties();
  if (token) props.setProperty('GITHUB_TOKEN', token);
  else props.deleteProperty('GITHUB_TOKEN');
  ui.alert(token ? 'Token salvato.' : 'Token rimosso.');
}

// ---- Choose the values of a multiple-choice cell (dialog with checkboxes)

// Works on a cell of Submissions or on column B of the Scheda (the value is
// saved in Submissions in both cases).
function menuPickValues() {
  requireAllPermissions();
  const ui = SpreadsheetApp.getUi();
  const active = SpreadsheetApp.getActiveSheet();
  const cell = active.getActiveCell();
  const sheet = getSubmissionsSheet();
  const headers = readHeaders(sheet);
  let row = 0;
  let column = '';
  if (active.getName() === SHEET_NAME && cell.getRow() >= 2) {
    row = cell.getRow();
    column = headers[cell.getColumn() - 1];
  } else if (active.getName() === CARD_SHEET && cell.getColumn() === 2 && cell.getRow() >= 3) {
    column = (cardRows(headers)[cell.getRow() - 3] || {}).column || '';
    const id = toText(active.getRange('B1').getDisplayValue()).trim();
    const found = findRowsById(sheet, headers, id);
    if (MULTI_VALUE_COLUMNS.indexOf(column) !== -1 && found.length !== 1) {
      ui.alert(found.length ? 'L\'id ' + id + ' è usato da più righe: correggi prima il tab ' + SHEET_NAME + '.' : 'Scegli prima un id esistente in B1.');
      return;
    }
    row = found[0];
  }
  if (!row || MULTI_VALUE_COLUMNS.indexOf(column) === -1) {
    ui.alert('Seleziona una cella di una colonna a scelta multipla (es. a2_urban_area, d3_water, talea_application), '
      + 'nel tab ' + SHEET_NAME + ' o nella colonna B della ' + CARD_SHEET + '.');
    return;
  }
  const col = headers.indexOf(column) + 1;
  const rowId = toText(sheet.getRange(row, headers.indexOf('id') + 1).getDisplayValue()).trim();
  const current = splitList(sheet.getRange(row, col).getValue());
  const allowed = allowedValues(column);
  const options = allowed.concat(current.filter(function (v) { return allowed.indexOf(v) === -1; }));
  const esc = escapeHtml;
  const items = options.map(function (o, i) {
    const extra = allowed.indexOf(o) === -1 ? ' <em style="color:#c00">(non in lista)</em>' : '';
    return '<label><input type="checkbox" value="' + esc(o) + '"' + (current.indexOf(o) !== -1 ? ' checked' : '') + ' id="o' + i + '"> ' + esc(o) + extra + '</label>';
  }).join('');
  const args = [row, col, 'v', JSON.stringify(rowId), JSON.stringify(column)].join(',').replace(/</g, '\\u003c');
  const html = '<style>body{font:13px Arial;margin:8px}label{display:block;padding:3px 0}button{margin-top:12px;padding:6px 14px}#err{color:#c00}</style>'
    + '<div>' + items + '</div>'
    + '<button onclick="save()">Salva</button> <button onclick="google.script.host.close()">Annulla</button><p id="err"></p>'
    + '<script>function save(){var v=[].slice.call(document.querySelectorAll("input:checked")).map(function(x){return x.value});'
    + 'google.script.run.withSuccessHandler(function(){google.script.host.close()})'
    + '.withFailureHandler(function(e){document.getElementById("err").textContent=e.message}).savePickedValues(' + args + ');}</script>';
  ui.showModalDialog(HtmlService.createHtmlOutput(html).setWidth(380).setHeight(Math.min(560, 140 + options.length * 24)),
    columnLabel(column) + (rowId ? ' — id ' + rowId : ' — riga ' + row));
}

function savePickedValues(row, col, values, id, column) {
  const sheet = getSubmissionsSheet();
  const headers = readHeaders(sheet);
  // The rows may have moved while the window was open (sorted, deleted)
  if (column !== undefined && (headers[col - 1] !== column
    || toText(sheet.getRange(row, headers.indexOf('id') + 1).getDisplayValue()).trim() !== id)) {
    throw new Error('La riga si è spostata mentre la finestra era aperta: chiudi e riprova.');
  }
  sheet.getRange(row, col).setNumberFormat('@').setValue(neutralizeFormula(values.join(', ')));
  revalidateRows(sheet, headers, row, row);
  withLock(function () { trackRows(sheet, headers, [row], 'Scegli i valori'); });
  refreshCard([sheet.getRange(row, headers.indexOf('id') + 1).getDisplayValue()]);
}

function menuOpenCard() {
  requireAllPermissions();
  const sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== SHEET_NAME || sheet.getActiveCell().getRow() < 2) {
    SpreadsheetApp.getUi().alert('Seleziona una riga nel tab ' + SHEET_NAME + '.');
    return;
  }
  const headers = readHeaders(sheet);
  const id = sheet.getRange(sheet.getActiveCell().getRow(), headers.indexOf('id') + 1).getDisplayValue().trim();
  const card = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CARD_SHEET);
  if (!card) {
    SpreadsheetApp.getUi().alert('Tab "' + CARD_SHEET + '" mancante: menu TALEA → Strumenti → Configura / aggiorna lo Sheet.');
    return;
  }
  if (!id) {
    SpreadsheetApp.getUi().alert('Questa riga non ha un id: scrivilo nella colonna id (il numero più alto + 1).');
    return;
  }
  card.getRange('B1').setValue(id);
  fillCard(id);
  card.activate();
}

// ---- Import rows / apply corrections (used for the data prepared in data-source/)

function readTab(name) {
  const tab = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!tab) return null;
  const values = tab.getDataRange().getValues();
  return { tab: tab, headers: values[0].map(function (h) { return toText(h).trim(); }), rows: values.slice(1) };
}

function askTabName(title, suggestion) {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(title, 'Nome del tab da leggere (importa prima il CSV con File → Importa → "Inserisci nuovi fogli"):', ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return null;
  return res.getResponseText().trim() || suggestion;
}

function menuImportRows() {
  requireAllPermissions();
  const ui = SpreadsheetApp.getUi();
  const name = askTabName('Importa righe', 'sheet-rows');
  if (!name) return;
  const src = readTab(name);
  if (!src) { ui.alert('Tab "' + name + '" non trovato.'); return; }
  const sheet = getSubmissionsSheet();
  const headers = ensureColumns(sheet);
  const ids = readRecords(sheet, headers).map(function (r) { return r.id; });
  const plan = planImport(headers, ids, src.headers, src.rows);
  const first = lastDataRow(sheet, headers) + 1;
  const summary = plan.append.length + ' righe da aggiungere.'
    + (plan.skipped.length ? '\n\nSaltate:\n' + plan.skipped.map(function (s) { return '- id ' + (s.id || '?') + ': ' + s.reason; }).join('\n') : '')
    + (plan.ignoredColumns.length ? '\n\nColonne del tab non presenti nello Sheet (ignorate): ' + plan.ignoredColumns.join(', ') : '');
  if (plan.converted.length) {
    const some = plan.converted.slice(0, 5).map(function (c) { return 'id ' + c.id + ', ' + c.column; }).join('; ');
    ui.alert('Valori trasformati in date o orari',
      'Nel tab "' + name + '" alcuni valori sono diventati date o orari (' + some + (plan.converted.length > 5 ? '…' : '') + '): '
      + 'succede importando il CSV con "Converti testo in numeri, date e formule".\n\n'
      + 'Elimina il tab e importa di nuovo il file (File → Importa → Carica → "Inserisci nuovi fogli") togliendo quella spunta. Niente è stato importato.',
      ui.ButtonSet.OK);
    return;
  }
  if (!plan.append.length) { ui.alert('Niente da importare', summary, ui.ButtonSet.OK); return; }
  if (ui.alert('Importa righe', summary + '\n\nProcedere?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  if (first + plan.append.length - 1 > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), first + plan.append.length - 1 - sheet.getMaxRows());
  setTextFormat(sheet, headers, first, plan.append.length);
  sheet.getRange(first, 1, plan.append.length, headers.length).setValues(plan.append);
  revalidateRows(sheet, headers, first, first + plan.append.length - 1);
  const added = plan.append.map(function (row, i) { return first + i; });
  withLock(function () { trackRows(sheet, headers, added, 'Importa righe', { fresh: true }); });
  ui.alert('Importate ' + plan.append.length + ' righe (dalla riga ' + first + '). Controlla la colonna "checks".');
}

function menuApplyPatch() {
  requireAllPermissions();
  const ui = SpreadsheetApp.getUi();
  const name = askTabName('Applica correzioni', 'sheet-patch');
  if (!name) return;
  const src = readTab(name);
  if (!src) { ui.alert('Tab "' + name + '" non trovato.'); return; }
  const need = ['id', 'column', 'current_value', 'new_value'];
  const missing = need.filter(function (h) { return src.headers.indexOf(h) === -1; });
  if (missing.length) { ui.alert('Al tab mancano le colonne: ' + missing.join(', ')); return; }
  const patchRows = src.rows.filter(function (r) { return toText(r[src.headers.indexOf('id')]).trim(); }).map(function (r) {
    const o = {};
    src.headers.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
  const sheet = getSubmissionsSheet();
  const headers = ensureColumns(sheet);
  const values = sheet.getRange(2, 1, Math.max(lastDataRow(sheet, headers) - 1, 1), headers.length).getValues();
  const plan = planPatch(headers, values, patchRows);
  const count = function (a) { return plan.filter(function (p) { return p.action === a; }).length; };
  const skipped = plan.filter(function (p) { return p.action === 'skip'; });
  const summary = count('apply') + ' celle da cambiare · ' + count('done') + ' già a posto · ' + skipped.length + ' saltate'
    + (skipped.length ? '\n\n' + skipped.slice(0, 15).map(function (p) { return '- #' + p.id + ' ' + p.column + ': ' + p.reason; }).join('\n') : '');
  if (!count('apply')) { ui.alert('Niente da applicare', summary, ui.ButtonSet.OK); return; }
  if (ui.alert('Applica correzioni', summary + '\n\nProcedere?', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
  plan.forEach(function (p) {
    if (p.action === 'apply') sheet.getRange(p.rowIndex + 2, p.colIndex + 1).setValue(neutralizeFormula(toText(p.next)));
  });
  const changedRows = plan.filter(function (p) { return p.action === 'apply'; }).map(function (p) { return p.rowIndex + 2; })
    .filter(function (r, i, all) { return all.indexOf(r) === i; });
  withLock(function () { trackRows(sheet, headers, changedRows, 'Applica correzioni'); });
  // Outcome next to each correction in the patch tab
  const outcomeCol = src.headers.indexOf('esito') !== -1 ? src.headers.indexOf('esito') + 1 : src.headers.length + 1;
  src.tab.getRange(1, outcomeCol).setValue('esito');
  src.tab.getRange(2, outcomeCol, plan.length, 1).setValues(plan.map(function (p) {
    return [p.action === 'apply' ? 'applicata' : p.action === 'done' ? 'già applicata' : 'saltata: ' + p.reason];
  }));
  revalidateRows(sheet, headers, 2, lastDataRow(sheet, headers));
  ui.alert('Applicate ' + count('apply') + ' correzioni. L\'esito di ogni riga è nella colonna "esito" del tab ' + name + '.');
}

// ---- Daily summary of the trusted users' submissions (time trigger)

function sendDailyDigest() {
  const sheet = getSubmissionsSheet();
  const headers = readHeaders(sheet);
  const trusted = trustedEmailSet(getTrustedRows());
  const since = Date.now() - 24 * 3600 * 1000;
  const items = readRecords(sheet, headers).map(function (r, i) { return { record: r, row: i + 2 }; }).filter(function (it) {
    const r = it.record;
    const t = r.submitted_at instanceof Date ? r.submitted_at.getTime() : Date.parse(toText(r.submitted_at));
    return t >= since && trusted[toText(r.submitter_email).trim().toLowerCase()];
  });
  if (items.length) notifySupervisor(items, 'TALEA: ' + items.length + ' proposte degli Utenti fidati nelle ultime 24 ore');
}

// ===========================================================================
// Setup: tabs, columns, formatting, validation, triggers
// ===========================================================================

function setupSheet() {
  requireAllPermissions();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getSubmissionsSheet();
  removeObsoleteColumns(sheet);
  const headers = ensureColumns(sheet);
  const width = headers.length;
  if (sheet.getMaxRows() < 200) sheet.insertRowsAfter(sheet.getMaxRows(), 200 - sheet.getMaxRows());
  const maxRows = sheet.getMaxRows();
  const dataRows = lastDataRow(sheet, headers);
  const col = function (h) { return headers.indexOf(h) + 1; };

  // Header: colours by group, notes, frozen panes
  const headerRange = sheet.getRange(1, 1, 1, width);
  headerRange.setFontWeight('bold').setVerticalAlignment('middle').setWrap(true);
  const colors = headers.map(function (h) {
    const g = GROUPS.filter(function (x) { return x.columns.indexOf(h) !== -1; })[0];
    return g ? g.color : '#ffffff';
  });
  const fonts = headers.map(function (h) {
    const g = GROUPS.filter(function (x) { return x.columns.indexOf(h) !== -1; })[0];
    return g ? g.font : '#000000';
  });
  headerRange.setBackgrounds([colors]).setFontColors([fonts]);
  headerRange.setNotes([headers.map(columnNote)]);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(Math.max(col('title'), 1));

  // Compact rows: long texts are read in the Scheda tab
  const data = sheet.getRange(2, 1, Math.max(maxRows - 1, 1), width);
  data.setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setVerticalAlignment('top');
  sheet.setRowHeightsForced(2, Math.max(maxRows - 1, 1), 21);
  const widths = { id: 45, status: 90, submitted_at: 95, title: 230, description: 300, checks: 260, changed_fields: 200, other_details: 220 };
  headers.forEach(function (h, i) { sheet.setColumnWidth(i + 1, widths[h] || 140); });
  // Plain text: values are kept exactly as written (no times or dates made from "44.4949")
  setTextFormat(sheet, headers, 2, maxRows - 1);

  // Booleans → checkboxes (text "true"/"false" converted to real booleans).
  // Only a validation rule on the empty rows: no FALSE values written there.
  BOOLEAN_COLUMNS.forEach(function (h) {
    if (!col(h)) return;
    if (dataRows >= 2) {
      const range = sheet.getRange(2, col(h), dataRows - 1, 1);
      range.setValues(range.getValues().map(function (r) {
        return [r[0] === true || toText(r[0]).trim().toLowerCase() === 'true'];
      }));
    }
    sheet.getRange(2, col(h), maxRows - 1, 1).setDataValidation(columnValidation(h));
  });

  // Dropdowns for single-value columns
  ['status'].concat(SINGLE_VALUE_COLUMNS).forEach(function (h) {
    if (col(h)) sheet.getRange(2, col(h), maxRows - 1, 1).setDataValidation(columnValidation(h));
  });

  // Conditional colours: status, rows with problems
  const statusRange = sheet.getRange(2, col('status'), maxRows - 1, 1);
  const titleRange = sheet.getRange(2, col('title'), maxRows - 1, 1);
  const changedRange = sheet.getRange(2, col('changed_fields'), maxRows - 1, 1);
  const checksLetter = columnLetter(col('checks'));
  const ownRanges = [statusRange, titleRange, changedRange].map(function (r) { return r.getA1Notation(); });
  const rules = sheet.getConditionalFormatRules().filter(function (r) {
    // drop the rules created by a previous setup (same ranges)
    const a1 = r.getRanges().map(function (x) { return x.getA1Notation(); }).join();
    return ownRanges.indexOf(a1) === -1;
  });
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('pending').setBackground('#fff2cc').setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('approved').setBackground('#d9ead3').setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('denied').setBackground('#efefef').setFontColor('#999999').setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenFormulaSatisfied('=LEN($' + checksLetter + '2)>0')
    .setBackground('#f4cccc').setRanges([titleRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule().whenCellNotEmpty().setBackground('#fff8e1').setRanges([changedRange]).build());
  sheet.setConditionalFormatRules(rules);

  setupSettingsTab(ss);
  setupTrustedTab(ss);
  setupListsTab(ss);
  setupTrackingTabs(ss);

  // Image folder shared with the editors of the Sheet
  const folder = getImageFolder();
  const me = Session.getEffectiveUser().getEmail();
  ss.getEditors().map(function (u) { return u.getEmail(); }).filter(function (e) { return e && e !== me; }).forEach(function (e) {
    try { folder.addEditor(e); } catch (err) { console.warn('Cartella immagini non condivisa con ' + e + ': ' + err); }
  });

  // Daily digest trigger
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDailyDigest') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendDailyDigest').timeBased().everyDays(1).atHour(Number(getSettings().digest_hour) || 8).create();

  revalidateRows(sheet, headers, 2, lastDataRow(sheet, headers));
  // First run: the rows as they are now become the "original" version
  withLock(function () { reconcileTracking(sheet, headers, 'Configura'); });
  setupCardTab(ss, headers);
  sheet.activate();
  SpreadsheetApp.getUi().alert('Sheet configurato. Controlla il tab "' + SETTINGS_SHEET + '" (email del supervisore) e la colonna "checks". '
    + 'Da ora ogni modifica alle righe è scritta nel tab "' + LOG_SHEET + '".');
}

/** Asks whether to delete the columns of older versions (see OBSOLETE_COLUMNS) */
function removeObsoleteColumns(sheet) {
  const headers = readHeaders(sheet);
  const found = Object.keys(OBSOLETE_COLUMNS).filter(function (h) { return headers.indexOf(h) !== -1; });
  if (!found.length) return;
  const ui = SpreadsheetApp.getUi();
  const list = found.map(function (h) { return '- ' + h + ': ' + OBSOLETE_COLUMNS[h]; }).join('\n');
  const answer = ui.alert('Colonne non più usate', list + '\n\nEliminarle? Lo script e il sito non le leggono più; '
    + 'il contenuto resta comunque nella cronologia delle versioni (File → Cronologia versioni).\n'
    + 'Se rispondi No restano dove sono, ignorate.', ui.ButtonSet.YES_NO);
  if (answer !== ui.Button.YES) return;
  // from the right, so the positions of the others do not change
  found.map(function (h) { return headers.indexOf(h) + 1; }).sort(function (a, b) { return b - a; })
    .forEach(function (c) { sheet.deleteColumn(c); });
}

function protectTab(tab, description) {
  tab.protect().setDescription(description).setWarningOnly(true);
}

/** Registro modifiche (visible) and the two hidden tabs with the versions of each row */
function setupTrackingTabs(ss) {
  const log = getOrCreateTab(ss, LOG_SHEET);
  const titles = ['data', 'utente', 'id', 'titolo', 'campo', 'prima', 'dopo', 'origine'];
  if (log.getLastRow() === 0) log.getRange(1, 1, 1, titles.length).setValues([titles]);
  log.getRange(1, 1, 1, titles.length).setFontWeight('bold').setBackground('#37474f').setFontColor('#ffffff').setNotes([[
    'Quando (fuso orario dello Sheet). Le righe più recenti sono in fondo.',
    'Chi ha fatto la modifica. Google lo comunica solo per il proprietario dello Sheet e per gli account dello stesso dominio: '
      + 'negli altri casi c\'è "—" (chi ha modificato si vede in File → Cronologia versioni). Per le proposte dal sito: l\'email di chi le ha inviate.',
    'id della riga nel tab ' + SHEET_NAME + '.',
    'Titolo al momento della modifica.',
    'Colonna cambiata. Tra parentesi: (nuova riga), (riga rimossa), (inizio del registro).',
    'Valore prima della modifica.',
    'Valore dopo la modifica.',
    'Modifica nello Sheet · Modifica nella Scheda · Modulo del sito · Scegli i valori · Approva · Rifiuta · Importa righe · Applica correzioni · '
      + 'Configura / Controllo completo = modifiche trovate confrontando tutte le righe (es. righe eliminate).',
  ]]);
  log.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm');
  log.getRange('B:H').setNumberFormat('@');
  if (log.getMaxRows() > 1) log.getRange(2, 1, log.getMaxRows() - 1, titles.length).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP).setVerticalAlignment('top');
  [135, 190, 45, 220, 150, 320, 320, 160].forEach(function (w, i) { log.setColumnWidth(i + 1, w); });
  log.setFrozenRows(1);
  protectTab(log, 'Scritto dallo script: ogni modifica alle righe di ' + SHEET_NAME);

  [ORIGINALS_SHEET, LAST_SHEET].forEach(function (name) {
    const tab = getOrCreateTab(ss, name);
    if (tab.getLastRow() === 0) tab.getRange(1, 1, 1, 2).setValues([['id', 'riga in JSON (uso interno dello script: non modificare)']]);
    tab.getRange('A:A').setNumberFormat('@');
    protectTab(tab, 'Uso interno del Registro modifiche');
    tab.hideSheet();
  });
}

/** Dropdown (status, single-value lists) or checkbox of a column, in Submissions and in the Scheda; null for the others */
function columnValidation(column) {
  if (BOOLEAN_COLUMNS.indexOf(column) !== -1) return SpreadsheetApp.newDataValidation().requireCheckbox().build();
  const list = column === 'status' ? STATUSES : SINGLE_VALUE_COLUMNS.indexOf(column) !== -1 ? LISTS[column] : null;
  return list ? SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build() : null;
}

function columnLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function getOrCreateTab(ss, name) {
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function setupSettingsTab(ss) {
  const tab = getOrCreateTab(ss, SETTINGS_SHEET);
  if (tab.getLastRow() === 0) tab.getRange(1, 1, 1, 3).setValues([['impostazione', 'valore', 'descrizione']]);
  const keys = tab.getLastRow() > 1 ? tab.getRange(2, 1, tab.getLastRow() - 1, 1).getValues().map(function (r) { return toText(r[0]).trim(); }) : [];
  DEFAULT_SETTINGS.forEach(function (s) {
    if (keys.indexOf(s[0]) === -1) tab.appendRow(s);
  });
  tab.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#37474f').setFontColor('#ffffff');
  tab.setColumnWidth(1, 190); tab.setColumnWidth(2, 260); tab.setColumnWidth(3, 520);
  tab.setFrozenRows(1);
}

function setupTrustedTab(ss) {
  const tab = getOrCreateTab(ss, TRUSTED_SHEET);
  if (tab.getLastRow() === 0) tab.getRange(1, 1, 1, 4).setValues([['email', 'nome', 'codice', 'note']]);
  tab.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#37474f').setFontColor('#ffffff');
  tab.getRange(1, 3).setNote('Codice personale da scrivere nel campo "Access code" del form. Se lo lasci vuoto basta l\'email (meno sicuro: l\'email nel form non è verificata).');
  tab.setColumnWidth(1, 260); tab.setColumnWidth(2, 200); tab.setColumnWidth(3, 160); tab.setColumnWidth(4, 360);
  tab.setFrozenRows(1);
}

function setupListsTab(ss) {
  const tab = getOrCreateTab(ss, LISTS_SHEET);
  tab.clear();
  const columns = Object.keys(LISTS);
  const height = Math.max.apply(null, columns.map(function (c) { return allowedValues(c).length; })) + 2;
  const grid = [];
  for (let r = 0; r < height; r++) grid.push(columns.map(function () { return ''; }));
  columns.forEach(function (c, j) {
    grid[0][j] = c;
    grid[1][j] = columnLabel(c);
    allowedValues(c).forEach(function (v, i) { grid[i + 2][j] = v; });
  });
  tab.getRange(1, 1, height, columns.length).setValues(grid);
  tab.getRange(1, 1, 2, columns.length).setFontWeight('bold').setBackground('#37474f').setFontColor('#ffffff');
  tab.setFrozenRows(2);
  tab.getRange(1, 1).setNote('Generato dallo script a partire dai filtri del sito (src/data/filterConfig.js). Non modificare qui: le modifiche si fanno nel codice.');
  const protection = tab.protect().setDescription('Liste generate dallo script');
  protection.setWarningOnly(true);
}

/** Rows of the Scheda tab: a title row for each group, then its columns */
function cardRows(headers) {
  const rows = [];
  GROUPS.forEach(function (g) {
    rows.push({ group: g });
    g.columns.forEach(function (c) { if (headers.indexOf(c) !== -1) rows.push({ column: c }); });
  });
  return rows;
}

/** Value written in column B of the Scheda: true / false for the checkboxes, plain text otherwise */
function cardCellValue(column, text) {
  if (BOOLEAN_COLUMNS.indexOf(column) !== -1) return /^(true|vero)$/i.test(toText(text).trim());
  return neutralizeFormula(toText(text));
}

/**
 * Cells edited in column B of the Scheda → values for the row of Submissions.
 *   cells: [{ row (of the Scheda), value, display, formula }]
 * Returns { writes: [{ column, value }], refused: [{ label, reason }] }.
 * Cells below the card are free space: ignored.
 */
function planCardEdit(headers, cells) {
  const rows = cardRows(headers);
  const writes = [];
  const refused = [];
  cells.forEach(function (c) {
    const info = rows[c.row - 3];
    if (!info) return;
    if (info.group) {
      refused.push({ label: info.group.name, reason: 'titolo del gruppo' });
      return;
    }
    const column = info.column;
    const label = columnLabel(column);
    if (CARD_READONLY[column]) {
      refused.push({ label: label, reason: CARD_READONLY[column] });
      return;
    }
    if (toText(c.formula)) {
      refused.push({ label: label, reason: 'le formule non sono ammesse' });
      return;
    }
    const value = BOOLEAN_COLUMNS.indexOf(column) !== -1
      ? c.value === true || /^(true|vero)$/i.test(toText(c.value).trim())
      : cellText(c.value, c.display);
    if (column === 'status' && STATUSES.indexOf(value) === -1) {
      refused.push({ label: label, reason: 'valori ammessi: ' + STATUSES.join(', ') });
      return;
    }
    writes.push({ column: column, value: value });
  });
  return { writes: writes, refused: refused };
}

/** Rows of Submissions (numbers) whose id is this one */
function findRowsById(sheet, headers, id) {
  const wanted = toText(id).trim();
  const col = headers.indexOf('id') + 1;
  const last = lastDataRow(sheet, headers);
  const found = [];
  if (!wanted || !col || last < 2) return found;
  sheet.getRange(2, col, last - 1, 1).getDisplayValues().forEach(function (r, i) {
    if (toText(r[0]).trim() === wanted) found.push(i + 2);
  });
  return found;
}

// The Scheda tab is filled by the script, without formulas: formulas written by a
// script are read with the Sheet's locale (in Italian they need ";"), and every
// cell showed #ERROR!. It is refreshed when B1 changes, when the row is edited
// and by "Apri la scheda". Column B can be edited (see onCardEdit), with the
// same dropdowns and checkboxes as Submissions.
function setupCardTab(ss, headers) {
  const tab = getOrCreateTab(ss, CARD_SHEET);
  const shownId = toText(tab.getRange('B1').getDisplayValue()).trim();
  const all = tab.getRange(1, 1, tab.getMaxRows(), tab.getMaxColumns());
  all.breakApart();
  tab.clear();
  all.clearDataValidations();
  all.clearNote();
  tab.getRange('A1').setValue('ID →').setFontWeight('bold').setHorizontalAlignment('right');
  const idLetter = columnLetter(headers.indexOf('id') + 1);
  tab.getRange('B1')
    .setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInRange(ss.getSheetByName(SHEET_NAME).getRange(idLetter + '2:' + idLetter), true)
      .setAllowInvalid(true).build())
    .setFontWeight('bold').setFontSize(14).setBackground('#fff2cc').setHorizontalAlignment('left');
  tab.getRange('C1').setValue('Modifica i valori nella colonna B: vanno nel tab ' + SHEET_NAME + ' e nel ' + LOG_SHEET + '. '
    + 'Giallo = cambiato (originale in C) · grigio = solo da leggere.')
    .setFontColor('#666666')
    .setNote('Scegli un id in B1, oppure nel tab ' + SHEET_NAME + ' seleziona una riga e usa TALEA → Apri la scheda della riga selezionata.\n\n'
      + 'Modifica i valori nella colonna B, come in ' + SHEET_NAME + ': vengono salvati nella riga, controllati (riga "' + columnLabel('checks') + '") '
      + 'e scritti nel ' + LOG_SHEET + '. Size, Climate zone e Stato hanno il menu a tendina, i campi sì/no la casella.\n\n'
      + 'Liste a scelta multipla (es. A2 Urban area): seleziona la cella in B e usa TALEA → Scegli i valori della cella selezionata.\n\n'
      + 'In giallo i campi diversi dalla versione originale, con l\'originale nella colonna C. In grigio i campi che qui si leggono soltanto '
      + '(id, data, problemi, campi modificati, link alle immagini): la nota sull\'etichetta dice dove si cambiano.');
  tab.getRange('B2:C2').setFontWeight('bold').setFontColor('#666666');
  tab.getRange('C2').setValue('Valore originale (solo dove è cambiato)');

  const rows = cardRows(headers);
  tab.getRange(3, 1, rows.length, 1).setFontWeight('bold').setVerticalAlignment('top').setNotes(rows.map(function (r) {
    if (r.group) return [''];
    return [columnNote(r.column) + (CARD_READONLY[r.column] ? '\n\nNella Scheda si legge soltanto: ' + CARD_READONLY[r.column] + '.' : '')];
  }));
  tab.getRange(3, 2, rows.length, 2).setWrap(true).setVerticalAlignment('top').setHorizontalAlignment('left');
  rows.forEach(function (r, i) {
    if (r.group) {
      tab.getRange(3 + i, 1, 1, 3).setFontColor(r.group.font).setFontWeight('bold');
      return;
    }
    const rule = columnValidation(r.column);
    if (rule) tab.getRange(3 + i, 2).setDataValidation(rule);
    if (CARD_READONLY[r.column]) tab.getRange(3 + i, 2).setFontColor('#666666');
  });
  tab.setColumnWidth(1, 210);
  tab.setColumnWidth(2, 600);
  tab.setColumnWidth(3, 420);
  tab.setFrozenRows(2);
  if (shownId) tab.getRange('B1').setValue(shownId);
  fillCard(shownId);
}

/**
 * Writes the row with this id into the Scheda tab: labels in A, current
 * values in B and, where a field differs from the original version, the
 * original in C (the row is highlighted). Returns false when there is no such row.
 */
function fillCard(id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tab = ss.getSheetByName(CARD_SHEET);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!tab || !sheet) return false;
  const headers = readHeaders(sheet);
  const rows = cardRows(headers);
  const wanted = toText(id).trim();
  const found = findRowsById(sheet, headers, wanted);
  let row = null;
  if (found.length) {
    const range = sheet.getRange(found[0], 1, 1, headers.length);
    row = textRows(range.getValues(), range.getDisplayValues())[0];
  }
  const record = {};
  if (row) headers.forEach(function (h, j) { if (h) record[h] = row[j]; });
  const originals = row ? openSnapshots(ss, ORIGINALS_SHEET) : null;
  const original = originals ? originals.get(wanted) : null;
  const changed = {};
  if (original) changedFields(original, trackedRecord(headers, row)).forEach(function (c) { changed[c] = true; });

  const warn = (wanted && !row) || found.length > 1;
  tab.getRange('B2').setValue(wanted && !row ? 'Nessuna riga con id ' + wanted
    : found.length > 1 ? 'L\'id ' + wanted + ' è usato da ' + found.length + ' righe: questa è la riga ' + found[0] + '. Correggi nel tab ' + SHEET_NAME + '.'
      : 'Valore attuale').setFontColor(warn ? '#c53030' : '#666666');
  const n = rows.length;
  tab.getRange(3, 1, n, 1).setValues(rows.map(function (r) { return [r.group ? r.group.name : columnLabel(r.column)]; }));
  // Plain text, written with setValues: otherwise "44.4949" becomes a time and
  // "=…" a formula (rich text values are read like typed text, whatever the
  // format). The checkboxes get real true / false, in cells with a number
  // format: in a plain-text cell true becomes the text "true" (and clear()
  // does not reset number formats).
  tab.getRange(3, 3, n, 1).setNumberFormat('@');
  const isBoolean = function (r) { return BOOLEAN_COLUMNS.indexOf(r.column) !== -1; };
  runsOf(rows, function (r) { return !isBoolean(r); }).forEach(function (run) {
    tab.getRange(3 + run.start, 2, run.length, 1).setNumberFormat('@');
  });
  runsOf(rows, isBoolean).forEach(function (run) {
    tab.getRange(3 + run.start, 2, run.length, 1).setNumberFormat(AUTOMATIC_FORMAT);
  });
  const links = [];
  tab.getRange(3, 2, n, 2).setValues(rows.map(function (r, i) {
    if (r.group || !row) return ['', ''];
    const text = toText(record[r.column]);
    if (r.column === 'image_drive' && driveFileId(text)) links.push({ row: 3 + i, text: 'Apri l\'immagine (Drive)', url: driveFileUrl(driveFileId(text)) });
    if (r.column === 'image_github' && /^https:\/\//.test(text.trim())) links.push({ row: 3 + i, text: 'Apri l\'immagine (GitHub)', url: text.trim() });
    return [cardCellValue(r.column, text), neutralizeFormula(changed[r.column] ? toText(original[r.column]) || '(vuoto)' : '')];
  }));
  links.forEach(function (l) {
    tab.getRange(l.row, 2).setRichTextValue(SpreadsheetApp.newRichTextValue().setText(l.text).setLinkUrl(l.url).build());
  });
  tab.getRange(3, 1, n, 3).setBackgrounds(rows.map(function (r) {
    if (r.group) return [r.group.color, r.group.color, r.group.color];
    const color = changed[r.column] ? '#fff8e1' : '#ffffff';
    return [color, CARD_READONLY[r.column] && !changed[r.column] ? '#f3f3f3' : color, color];
  }));
  return !!row;
}

/**
 * Edit in the Scheda tab (from onEdit). B1: show that row. Column B: the
 * values go into the row of Submissions, validated and recorded in the
 * Registro like an edit made there. Then the card is written again, so what
 * cannot be edited here (labels, originals in C, read-only rows) goes back as it was.
 */
function onCardEdit(e) {
  const r = e.range;
  const tab = r.getSheet();
  const ss = tab.getParent();
  const id = toText(tab.getRange('B1').getDisplayValue()).trim();
  if (r.getRow() === 1 && r.getColumn() <= 2 && r.getLastColumn() >= 2) {
    fillCard(id);
    return;
  }
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;
  const headers = readHeaders(sheet);
  const first = Math.max(3, r.getRow());
  const last = Math.min(r.getLastRow(), 2 + cardRows(headers).length);
  if (first > last || r.getColumn() > 3) return; // rows 1–2 or outside the card: free space
  let message = 'Nella Scheda si modifica solo la colonna B: ripristinato.';
  if (r.getColumn() <= 2 && r.getLastColumn() >= 2) {
    const found = findRowsById(sheet, headers, id);
    if (found.length !== 1) {
      message = !id ? 'Scegli prima un id in B1.'
        : found.length ? 'L\'id ' + id + ' è usato da più righe: correggi nel tab ' + SHEET_NAME + '.'
          : 'Nessuna riga con id ' + id + '.';
    } else {
      const b = tab.getRange(first, 2, last - first + 1, 1);
      const values = b.getValues();
      const display = b.getDisplayValues();
      const formulas = b.getFormulas();
      const plan = planCardEdit(headers, values.map(function (v, i) {
        return { row: first + i, value: v[0], display: display[i][0], formula: formulas[i][0] };
      }));
      const row = found[0];
      plan.writes.forEach(function (w) {
        const cell = sheet.getRange(row, headers.indexOf(w.column) + 1);
        if (BOOLEAN_COLUMNS.indexOf(w.column) !== -1) cell.setNumberFormat(AUTOMATIC_FORMAT).setValue(w.value);
        else cell.setNumberFormat('@').setValue(neutralizeFormula(w.value));
      });
      message = '';
      if (plan.writes.length) {
        revalidateRows(sheet, headers, row, row);
        try {
          withLock(function () { trackRows(sheet, headers, [row], 'Modifica nella Scheda'); });
        } catch (err) {
          console.error('Registro modifiche: ' + err); // "Valida tutte" records it later
        }
        message = 'Salvato nel tab ' + SHEET_NAME + ' (riga ' + row + ').';
        const checksCol = headers.indexOf('checks') + 1;
        if (checksCol && toText(sheet.getRange(row, checksCol).getValue()).trim()) {
          message += ' La riga ha problemi: vedi "' + columnLabel('checks') + '".';
        }
      }
      if (plan.refused.length) {
        message += ' Non modificato: ' + plan.refused.map(function (x) { return x.label + ' (' + x.reason + ')'; }).join('; ') + '.';
      }
    }
  }
  fillCard(id);
  if (message.trim()) ss.toast(message.trim(), CARD_SHEET, 8);
}

/** Refreshes the Scheda tab if it shows one of these ids (or any row, when ids is omitted) */
function refreshCard(ids) {
  const tab = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CARD_SHEET);
  if (!tab) return;
  const shown = toText(tab.getRange('B1').getDisplayValue()).trim();
  if (!shown) return;
  if (ids && ids.map(function (x) { return toText(x).trim(); }).indexOf(shown) === -1) return;
  fillCard(shown);
}
