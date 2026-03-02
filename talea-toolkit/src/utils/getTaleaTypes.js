// Safely extract TALEA application types from a study.
// Handles both formats:
//   - object: { nodal: true, linear: false, fragmented: true }
//   - array:  ['Nodal', 'Linear']
//   - undefined / null
export default function getTaleaTypes(study) {
  const app = study?.talea_application;
  if (!app) return [];
  if (Array.isArray(app)) {
    return app.map(s => String(s));
  }
  const types = [];
  if (app.nodal) types.push('Nodal');
  if (app.linear) types.push('Linear');
  if (app.fragmented) types.push('Fragmented');
  return types;
}

// Returns true if the study has a given talea type (case-insensitive)
export function hasTaleaType(study, value) {
  const types = getTaleaTypes(study);
  const lower = value.toLowerCase();
  return types.some(t => t.toLowerCase() === lower);
}
