/**
 * Free texts written next to the options of the multiple-choice questions,
 * mostly the "Other (specify)" answers ("Other: Industrial area").
 *
 * Google Sheet, column `other_details`: one line per text.
 *   a2_urban_area: Industrial area                 text of the "Other" option
 *   a5_management [Private]: but open to public    text next to another option
 *
 * caseStudies.json, key `other_details`:
 *   { "a2_urban_area": { "Other": "Industrial area" },
 *     "a5_management": { "Private": "but open to public" } }
 *
 * The filters are not affected ("Other" is not a filter option); these texts
 * are shown next to the option in the case study and indexed by the search.
 */

const LINE = /^\s*([a-d]\d(?:_\d)?_[a-z_]+)\s*(?:\[([^\]]+)\])?\s*:\s*(.*?)\s*$/;

/**
 * Sheet text → { details, invalid }. `validFields` (optional) limits the
 * accepted column names; lines that do not match go to `invalid`.
 */
function parseOtherDetails(str, validFields) {
  const details = {};
  const invalid = [];
  for (const raw of String(str || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(LINE);
    if (!m || !m[3] || (validFields && !validFields.includes(m[1]))) {
      invalid.push(line);
      continue;
    }
    const option = (m[2] || 'Other').trim();
    if (!details[m[1]]) details[m[1]] = {};
    const prev = details[m[1]][option];
    details[m[1]][option] = prev ? `${prev}; ${m[3]}` : m[3];
  }
  return { details, invalid };
}

/** JSON object → Sheet text (fields in `fieldOrder` order when given) */
function formatOtherDetails(details, fieldOrder) {
  if (!details) return '';
  const fields = Object.keys(details);
  if (fieldOrder) fields.sort((a, b) => fieldOrder.indexOf(a) - fieldOrder.indexOf(b));
  const lines = [];
  for (const field of fields) {
    for (const [option, text] of Object.entries(details[field])) {
      lines.push(option === 'Other' ? `${field}: ${text}` : `${field} [${option}]: ${text}`);
    }
  }
  return lines.join('\n');
}

/** Label used in reports and corrections.js: "a2_urban_area" or "a5_management [Private]" */
const detailKey = (field, option) => (option === 'Other' ? field : `${field} [${option}]`);

/**
 * Automatic clean-up of a free text. Returns { text, reasons }.
 *   - spaces collapsed and trimmed (not reported, as for the other texts)
 *   - non-breaking hyphen → "-" (otherwise the search does not find "co-design")
 *   - closing parenthesis without an opening one, left by texts cut in the
 *     original Excel ("teachers)")
 */
function cleanOtherText(raw) {
  const reasons = [];
  let t = String(raw || '').replace(/\s+/g, ' ').trim();
  if (/‑/.test(t)) {
    t = t.replace(/‑/g, '-');
    reasons.push('trattino non separabile sostituito con "-"');
  }
  const opens = (t.match(/\(/g) || []).length;
  const closes = (t.match(/\)/g) || []).length;
  if (closes > opens && t.endsWith(')')) {
    t = t.slice(0, -1).trim();
    reasons.push('tolta la parentesi di chiusura senza apertura (testo tagliato nella scheda)');
  }
  return { text: t, reasons };
}

/**
 * Notes found by readChecklist() in import-excel-batch.js → other_details.
 *   notes:  [{ key, option, checked, text }]
 *   fixes:  { "a2_urban_area" | "a5_management [Private]": [text, reason] }
 * Returns { details, changes: [[label, from, to, reason]], warnings }.
 */
function buildOtherDetails(notes, fixes = {}) {
  const details = {};
  const changes = [];
  const warnings = [];
  const used = new Set();

  for (const n of notes) {
    const key = detailKey(n.key, n.option);
    const label = `other_details · ${key}`;
    const { text: cleaned, reasons } = cleanOtherText(n.text);
    let final = cleaned;
    if (reasons.length) changes.push([label, n.text, cleaned, `Pulizia automatica: ${reasons.join('; ')}.`]);
    if (fixes[key]) {
      used.add(key);
      const [fixed, reason] = fixes[key];
      if (fixed !== final) changes.push([label, final, fixed, reason]);
      final = fixed;
    }
    if (!n.checked) {
      warnings.push(`${key}: testo "${final}" scritto accanto a un'opzione NON spuntata. Salvato in other_details e mostrato nella scheda, ma l'opzione "${n.option}" resta non selezionata.`);
    }
    if (!final) continue;
    if (!details[n.key]) details[n.key] = {};
    details[n.key][n.option] = final;
  }
  for (const key of Object.keys(fixes)) {
    if (!used.has(key)) warnings.push(`Correzione per "${key}" in corrections.js, ma nella scheda non c'è un testo accanto a quell'opzione`);
  }
  return { details, changes, warnings };
}

module.exports = { parseOtherDetails, formatOtherDetails, cleanOtherText, buildOtherDetails, detailKey };
