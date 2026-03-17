/**
 * Extract case study data from the TALEA D6.2.1 Excel workbook.
 *
 * Reads public/TALEA_D621_Abacus of hardware solutions_2026.01.01.xlsx
 * and generates src/data/caseStudies.json in the format the app expects.
 *
 * This is a one-time script — after initial extraction, the Google Sheet
 * becomes the source of truth and updates flow through the nightly sync.
 *
 * Usage:
 *   node scripts/extract-excel.js
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const EXCEL_PATH = path.resolve(__dirname, '../public/TALEA_D621_Abacus of hardware solutions_2026.01.01.xlsx');
const OUTPUT_PATH = path.resolve(__dirname, '../src/data/caseStudies.json');

// ---------------------------------------------------------------------------
// Cell helpers (row/col are 1-indexed, matching the Python original)
// ---------------------------------------------------------------------------

function getVal(sheet, row, col) {
  const addr = XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
  const cell = sheet[addr];
  return cell != null ? cell.v : null;
}

function getBool(sheet, row, col) {
  const v = getVal(sheet, row, col);
  return v === true || v === 1;
}

/** Read a vertical run of boolean checkboxes and return matching option labels */
function getChecked(sheet, startRow, col, options) {
  const result = [];
  for (let i = 0; i < options.length; i++) {
    if (getBool(sheet, startRow + i, col)) {
      result.push(options[i]);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main extraction
// ---------------------------------------------------------------------------

const wb = XLSX.readFile(EXCEL_PATH);
const caseStudies = [];

for (let sheetNum = 1; sheetNum <= 50; sheetNum++) {
  const sheetName = String(sheetNum);
  if (!wb.SheetNames.includes(sheetName)) continue;
  const ws = wb.Sheets[sheetName];

  const cs = {};

  // ---- Basic info ----
  cs.id = sheetNum;
  cs.title = getVal(ws, 1, 2) || '';
  cs.city = getVal(ws, 3, 3) || '';
  cs.country = getVal(ws, 4, 3) || '';
  cs.year = String(getVal(ws, 5, 3) || '');
  cs.designer = getVal(ws, 6, 3) || '';
  cs.promoter = getVal(ws, 7, 3) || '';
  cs.description = getVal(ws, 24, 1) || '';

  // ---- TALEA application (row 31) ----
  cs.talea_application = {
    nodal: getBool(ws, 31, 1),
    linear: getBool(ws, 31, 7),
    fragmented: getVal(ws, 30, 13) ? getBool(ws, 31, 13) : false,
  };

  // ---- Size & Climate (row 35) ----
  cs.size = getVal(ws, 35, 7) || '';
  cs.climate_zone = getVal(ws, 35, 17) || '';

  // ---- Innovation descriptions ----
  cs.physical_innovation = getVal(ws, 38, 1) || '';
  cs.social_innovation = getVal(ws, 43, 1) || '';
  cs.has_social_innovation = getBool(ws, 42, 17);
  cs.digital_innovation = getVal(ws, 48, 1) || '';
  cs.has_digital_innovation = getBool(ws, 47, 17);

  // ---- A  Physical characteristics ----

  // A1 Urban scale
  cs.a1_urban_scale = getChecked(ws, 57, 8, [
    'Territorial', 'Metropolitan', 'Urban', 'District',
    'Urban block', 'Single space or building', 'Other',
  ]);

  // A2 Urban area
  cs.a2_urban_area = getChecked(ws, 66, 8, [
    'Historical centre', 'Consolidated city', 'Peripheral area',
    'Rural area', 'Other',
  ]);

  // A3.1 Buildings
  cs.a3_1_buildings = getChecked(ws, 74, 8, [
    'Building / pavilion', 'Building complex', 'Building façade',
    'Rooftop', 'Other',
  ]);

  // A3.2 Open spaces
  cs.a3_2_open_spaces = getChecked(ws, 81, 8, [
    'Courtyard', 'Entrance area', 'Game field',
    'Green area (park, garden)', 'Open paved space', 'Parking area',
    'Service yard or technical area', 'Square',
    'Residual space or widening', 'Waterfront', 'Other',
  ]);

  // A3.3 Infrastructures
  cs.a3_3_infrastructures = getChecked(ws, 94, 8, [
    'Carriageway', 'Cycle lane (dedicated)', 'Cycle lane with sidewalk',
    'Disused railway or similar', 'Drainage channel / urban ditch',
    'Footpath', 'Overpass or viaduct', 'Pedestrian street',
    'Road interchange or ramp', 'Sidewalk', 'Sidewalk on commercial axis',
    'Traffic island', 'Tramway trackbed', 'Underpass', 'Other',
  ]);

  // A4 Ownership
  cs.a4_ownership = getChecked(ws, 57, 17, [
    'Public', 'Private', 'Mixed (public/private)', 'Other',
  ]);

  // A5 Management
  cs.a5_management = getChecked(ws, 63, 17, [
    'Public', 'Private', 'Mixed (public/private)',
    "Citizens' committee", 'Neighbourhood', 'Association', 'Other',
  ]);

  // A6 Uses
  cs.a6_uses = getChecked(ws, 72, 17, [
    'Commercial', 'Cultural', 'Educational', 'Events',
    'Multifunctional', 'Outdoor activities', 'Performance',
    'Recreational', 'Refreshment point', 'Residential',
    'Slow mobility (walking, bike, bus)', 'Social', 'Sports',
    'Temporary use', 'Unconventional use', 'Vegetable garden', 'Other',
  ]);

  // A7 Other
  cs.a7_other = getChecked(ws, 91, 17, [
    'Abandoned / underused area', 'In-between space',
    'Neighbourhood space', 'Other',
  ]);

  // ---- B  Constraints and opportunities ----

  // B1 Physical
  cs.b1_physical = getChecked(ws, 114, 8, [
    'Aerial cables / power lines', 'Critical slopes / steep gradients',
    'Existing large tree or plant roots', 'High levels of soil pollution',
    'Impermeable or rigidly paved soil', 'Limited technical accessibility',
    'Narrow spaces / complex morphologies', 'Subsurface utilities', 'Other',
  ]);

  // B2 Regulations
  cs.b2_regulations = getChecked(ws, 125, 8, [
    'Architectural barrier regulations', 'Building codes and technical standards',
    'Flood risk / hydrogeological constraint', 'Heritage/archaeological constraint',
    'Landscape protection constraint', 'Public property rules / easements',
    'Urban safety/surveillance rules', 'Other',
  ]);

  // B3 Uses, management, signage and equipment
  cs.b3_uses_management = getChecked(ws, 135, 8, [
    'Commercial buildings/services', 'Consolidated use / uses',
    'Digital infrastructure', 'Functional equipment',
    'Green/blue infrastructure', 'Maintenance assigned to third parties',
    'Mobility infrastructure/hubs', 'Public cultural buildings/services',
    'Public art and/or monuments', 'Sensitive signage', 'Use conflicts',
    'Vulnerable or sensitive users', 'Other',
  ]);

  // B4 Public opinion
  cs.b4_public_opinion = getChecked(ws, 150, 8, [
    'Collective memory / identity belonging', 'Fear of decay / improper use',
    'Perception of the space as "private"', 'Rejection or distrust of greenery',
    'Other',
  ]);

  // B5 Synergy
  cs.b5_synergy = getChecked(ws, 157, 8, [
    'Existing regeneration projects', 'Municipal or metropolitan plans',
    'Ongoing public or private investments', 'Other',
  ]);

  // B6 Social opportunities
  cs.b6_social_opportunities = getChecked(ws, 114, 17, [
    'Civic participation', 'Community building / social cohesion',
    'Cultural and intercultural exchange', 'Educational opportunities',
    'Health promotion / active lifestyles', 'Inclusion',
    'Intergenerational exchange', 'Safety and perception of security',
    'Universal accessibility', 'Volunteering and active citizenship',
    'Well-being', 'Other',
  ]);

  // ---- C  Design process ----

  // C1.1 Design
  cs.c1_1_design = getChecked(ws, 174, 8, [
    'Co-design', 'Community engagement', 'Cultural promotion',
    'Open call/ competition', 'Public consultation', 'Research project',
    'Self-build', 'Social innovation', 'Spontaneous intervention',
    'Workshop', 'Other',
  ]);

  // C1.2 Funding
  cs.c1_2_funding = getChecked(ws, 187, 8, [
    'Crowdfunding', 'Participatory budget', 'Partnership',
    'Private funding', 'Public funding', 'Other',
  ]);

  // C1.3 Management
  cs.c1_3_management = getChecked(ws, 195, 8, [
    'Collaboration agreement', 'Public', 'Private', 'Other',
  ]);

  // C2 Actors involved
  cs.c2_actors = getChecked(ws, 201, 8, [
    'Age groups', 'Artists', 'Associations', 'Citizens', 'Committees',
    'Cultural centres', 'Designers', 'Entrepreneurs', 'Facilitators',
    'Foundations', 'Groups of citizens', 'Local Association',
    'Neighbourhood councils', 'Non-profit organizations',
    'Public institutions', 'Research centres', 'Residents', 'Shopkeepers',
    'Students', 'Universities', 'Volunteers', 'Vulnerable individuals',
    'Other',
  ]);

  // C3 Goals and results
  cs.c3_goals = getChecked(ws, 173, 17, [
    'Accessibility', 'Biodiversity', 'Care', 'Climate change mitigation',
    'Environmental sustainability', 'Intergenerational collaboration',
    'Knowledge', 'Liveability', 'New connections', 'New perception',
    'New production', 'Re-activation', 'Re-appropriation', 'Resilience',
    'Safety', 'Sense of community', 'Social inclusion', 'Transformation',
    'Urban regeneration', 'Valorisation', 'Other',
  ]);

  // C4 Other integrated services
  cs.c4_services = getChecked(ws, 196, 17, [
    'Access free to water', 'Areas for meeting residents',
    'Areas with shade/cool spots', 'Benches/rest areas',
    'Care and maintenance services', 'Educational, leisure and cultural uses',
    'Monitoring and warning systems', 'Online maps / informative materials',
    'Wi-fi connection',
  ]);

  // C5 Impacts
  cs.c5_impacts = getVal(ws, 207, 10) || '';

  // ---- D  Nature-Based Solutions ----

  // D1 Plants
  cs.d1_plants = getChecked(ws, 231, 17, [
    'Dense hedges', 'Ecological corridors - Pollinator-friendly gardens',
    'Flower beds', 'Linear hedges', 'Row of trees', 'Rows / tree lines',
    'Shading tree groups / tree clusters', 'Shrub patches', 'Single tree',
  ]);

  // D2 Paving
  cs.d2_paving = getChecked(ws, 241, 17, [
    'Depaving', 'Permeable paving',
  ]);

  // D3 Water
  cs.d3_water = getChecked(ws, 244, 17, [
    'Artificial wetlands', 'Bioretention areas', 'Detention basins',
    'Filter trenches / strips / drains', 'Floodable park', 'Fountains',
    'Ground-level fountain', 'Green channels', 'Mist sprayers',
    'Rain garden', 'Rain plaza', 'Reopened canals', 'Urban wetlands',
    'Vegetated ditches', 'Water blades', 'Water mirror',
  ]);

  // D4 Roof and facade
  cs.d4_roof_facade = getChecked(ws, 261, 17, [
    'Climbing structures on walls or nets', 'Extensive green roofs',
    'Green walls', 'Intensive green roofs', 'Vegetal sunshades',
  ]);

  // D5 Furnishings
  cs.d5_furnishings = getChecked(ws, 267, 17, [
    'Green integrated furnishings', 'Green mobile covers',
    'Green rigid covers', 'Green shelters',
    'Prefabricated green modules', 'Vegetated awnings',
  ]);

  // D6 Urban Spaces
  cs.d6_urban_spaces = getChecked(ws, 274, 17, [
    'Community gardens',
    'Green spaces in infrastructures (underpasses, viaducts)',
    'Micro parks', 'Multifunctional green spaces', 'Urban gardens',
  ]);

  // ---- Sources ----
  cs.sources = getVal(ws, 280, 1) || '';

  // Derived flag (frontend uses text fields, but keep for compatibility)
  cs.has_physical_innovation = !!cs.physical_innovation;

  caseStudies.push(cs);
  console.log(`Extracted sheet ${sheetNum}: ${cs.title}`);
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(caseStudies, null, 2) + '\n', 'utf-8');
console.log(`\nTotal: ${caseStudies.length} case studies`);
console.log(`Saved to ${OUTPUT_PATH}`);
