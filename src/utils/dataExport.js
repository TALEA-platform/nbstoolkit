import * as XLSX from 'xlsx';

// Columns to export (in order)
const EXPORT_COLUMNS = [
  { key: 'id', label: 'ID' },
  { key: 'title', label: 'Title' },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
  { key: 'year', label: 'Year' },
  { key: 'size', label: 'Size' },
  { key: 'climate_zone', label: 'Climate Zone' },
  { key: 'talea_application', label: 'TALEA Application', array: true, nested: true },
  { key: 'designer', label: 'Designer' },
  { key: 'promoter', label: 'Promoter' },
  { key: 'description', label: 'Description' },
  { key: 'physical_innovation', label: 'Physical Innovation' },
  { key: 'social_innovation', label: 'Social Innovation' },
  { key: 'digital_innovation', label: 'Digital Innovation' },
  { key: 'has_social_innovation', label: 'Has Social Innovation' },
  { key: 'has_digital_innovation', label: 'Has Digital Innovation' },
  { key: 'a1_urban_scale', label: 'A1 Urban Scale', array: true },
  { key: 'a2_urban_area', label: 'A2 Urban Area', array: true },
  { key: 'a3_1_buildings', label: 'A3.1 Buildings', array: true },
  { key: 'a3_2_open_spaces', label: 'A3.2 Open Spaces', array: true },
  { key: 'a3_3_infrastructures', label: 'A3.3 Infrastructures', array: true },
  { key: 'a4_ownership', label: 'A4 Ownership', array: true },
  { key: 'a5_management', label: 'A5 Management', array: true },
  { key: 'a6_uses', label: 'A6 Uses', array: true },
  { key: 'a7_other', label: 'A7 Other', array: true },
  { key: 'b1_physical', label: 'B1 Physical Constraints', array: true },
  { key: 'b2_regulations', label: 'B2 Regulations', array: true },
  { key: 'b3_uses_management', label: 'B3 Uses & Management', array: true },
  { key: 'b4_public_opinion', label: 'B4 Public Opinion', array: true },
  { key: 'b5_synergy', label: 'B5 Synergy', array: true },
  { key: 'b6_social_opportunities', label: 'B6 Social Opportunities', array: true },
  { key: 'c1_1_design', label: 'C1.1 Design', array: true },
  { key: 'c1_2_funding', label: 'C1.2 Funding', array: true },
  { key: 'c1_3_management', label: 'C1.3 Management', array: true },
  { key: 'c2_actors', label: 'C2 Actors', array: true },
  { key: 'c3_goals', label: 'C3 Goals', array: true },
  { key: 'c4_services', label: 'C4 Services', array: true },
  { key: 'c5_impacts', label: 'C5 Impacts' },
  { key: 'd1_plants', label: 'D1 Plants', array: true },
  { key: 'd2_paving', label: 'D2 Paving', array: true },
  { key: 'd3_water', label: 'D3 Water', array: true },
  { key: 'd4_roof_facade', label: 'D4 Roof & Facade', array: true },
  { key: 'd5_furnishings', label: 'D5 Furnishings', array: true },
  { key: 'd6_urban_spaces', label: 'D6 Urban Spaces', array: true },
  { key: 'sources', label: 'Sources' },
];

function getCellValue(study, col) {
  const val = study[col.key];
  if (val == null) return '';
  if (col.nested && typeof val === 'object' && !Array.isArray(val)) {
    // e.g. talea_application: { nodal: true, linear: false }
    return Object.entries(val).filter(([, v]) => v).map(([k]) => k).join(', ');
  }
  if (col.array && Array.isArray(val)) return val.join(', ');
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

function studiesToRows(studies) {
  return studies.map(study =>
    EXPORT_COLUMNS.reduce((row, col) => {
      row[col.label] = getCellValue(study, col);
      return row;
    }, {})
  );
}

/**
 * Download studies as CSV
 */
export function downloadCSV(studies, filename = 'talea-abacus-data.csv') {
  const rows = studiesToRows(studies);
  const headers = EXPORT_COLUMNS.map(c => c.label);

  const escape = (val) => {
    const s = String(val).replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };

  const csv = [
    headers.map(escape).join(','),
    ...rows.map(row => headers.map(h => escape(row[h] || '')).join(',')),
  ].join('\n');

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel UTF-8
  triggerDownload(blob, filename);
}

/**
 * Download studies as Excel (.xlsx)
 */
export function downloadExcel(studies, filename = 'talea-abacus-data.xlsx') {
  const rows = studiesToRows(studies);
  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto-width columns
  const colWidths = EXPORT_COLUMNS.map(col => {
    const maxLen = Math.max(
      col.label.length,
      ...rows.map(r => String(r[col.label] || '').length)
    );
    return { wch: Math.min(maxLen + 2, 60) };
  });
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Case Studies');
  XLSX.writeFile(wb, filename);
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
