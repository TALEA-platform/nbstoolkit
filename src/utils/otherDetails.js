/**
 * Free texts written next to the options of the multiple-choice questions,
 * mostly the "Other (specify)" answers.
 *
 *   study.other_details = { a2_urban_area: { Other: 'Industrial area' },
 *                           a5_management: { Private: 'but open to public' } }
 *
 * The filters are not affected ("Other" is not a filter option); these texts
 * are shown next to the option and indexed by the search. In the Google Sheet the column holds one line per
 * text ("a2_urban_area: Industrial area", see scripts/other-details.js).
 */

/**
 * Options of `field` with their text: [{ value, detail }].
 * A text written next to an option that is not selected is still shown (the
 * author wrote it in the factsheet), after the selected options.
 */
export function getItemsWithDetails(study, field) {
  const items = study[field] || [];
  const details = (study.other_details || {})[field] || {};
  const out = items.map(value => ({ value, detail: details[value] || '' }));
  for (const [option, detail] of Object.entries(details)) {
    if (!items.includes(option)) out.push({ value: option, detail });
  }
  return out;
}

/** Same as getItemsWithDetails, as plain labels: "Other: Industrial area" */
export function getLabelsWithDetails(study, field) {
  return getItemsWithDetails(study, field).map(({ value, detail }) => (detail ? `${value}: ${detail}` : value));
}

/** All the texts of a study, for the search index */
export function getOtherDetailsText(study) {
  return Object.values(study.other_details || {})
    .flatMap(byOption => Object.values(byOption))
    .join(' ');
}

/** Google Sheet text of the form's "Other (specify)" inputs: { field: text } → "field: text" lines */
export function formatOtherDetailsInput(textsByField) {
  return Object.entries(textsByField || {})
    .map(([field, text]) => [field, String(text || '').replace(/\s+/g, ' ').trim()])
    .filter(([, text]) => text)
    .map(([field, text]) => `${field}: ${text}`)
    .join('\n');
}
