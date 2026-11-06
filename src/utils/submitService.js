import { normalizeCoordinateInputs } from './coordinates';
import { formatOtherDetailsInput } from './otherDetails';

// Apps Script web app of the Google Sheet (see Administrator_Setup_guide.md, 2.3).
// It saves the proposal as a "pending" row, stores the image in Drive and
// answers { result: 'success', id } or { result: 'error', code }.
const GOOGLE_SHEET_WEBAPP_URL = process.env.REACT_APP_GOOGLE_SHEET_URL || '';

// Same limit as MAX_IMAGE_BYTES in google-apps-script.js
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const SUBMISSION_FIELDS = [
  'title', 'city', 'country', 'year', 'designer', 'promoter',
  'description', 'latitude', 'longitude',
  'size', 'climate_zone',
  'physical_innovation', 'social_innovation', 'digital_innovation',
  'has_physical_innovation', 'has_social_innovation', 'has_digital_innovation',
  'sources', 'image_credits',
  // Who sends it (never published) and the personal code of trusted users
  'submitter_name', 'submitter_email', 'access_code',
  // Hidden anti-spam field: people leave it empty
  'website',
];

const BOOLEAN_FIELDS = ['has_physical_innovation', 'has_social_innovation', 'has_digital_innovation'];

const ARRAY_FIELDS = [
  'a1_urban_scale', 'a2_urban_area', 'a3_1_buildings', 'a3_2_open_spaces',
  'a3_3_infrastructures', 'a4_ownership', 'a5_management', 'a6_uses', 'a7_other',
  'b1_physical', 'b2_regulations', 'b3_uses_management', 'b4_public_opinion',
  'b5_synergy', 'b6_social_opportunities',
  'c1_1_design', 'c1_2_funding', 'c1_3_management', 'c2_actors', 'c3_goals', 'c4_services',
  'd1_plants', 'd2_paving', 'd3_water', 'd4_roof_facade', 'd5_furnishings', 'd6_urban_spaces',
];

export function flattenStudyData(formData) {
  const flat = {};

  for (const key of SUBMISSION_FIELDS) {
    if (BOOLEAN_FIELDS.includes(key)) {
      flat[key] = formData[key] ? 'true' : 'false';
    } else {
      flat[key] = typeof formData[key] === 'string' ? formData[key].trim() : '';
    }
  }

  const normalizedCoords = normalizeCoordinateInputs(flat.latitude, flat.longitude);
  flat.latitude = normalizedCoords.latitude;
  flat.longitude = normalizedCoords.longitude;

  flat.talea_application = Array.isArray(formData.talea_application)
    ? formData.talea_application.join(', ')
    : formData.talea_application || '';

  for (const key of ARRAY_FIELDS) {
    flat[key] = Array.isArray(formData[key]) ? formData[key].join(', ') : '';
  }

  // "Other (specify)" texts: the answer is "Other", the text goes to other_details
  const otherTexts = {};
  for (const [key, text] of Object.entries(formData.other_details || {})) {
    if (!ARRAY_FIELDS.includes(key) || !String(text || '').trim()) continue;
    otherTexts[key] = text;
    const values = flat[key] ? flat[key].split(', ') : [];
    if (!values.includes('Other')) flat[key] = values.concat('Other').join(', ');
  }
  flat.other_details = formatOtherDetailsInput(otherTexts);

  flat.c5_impacts = formData.c5_impacts || '';

  // The image travels with the proposal and is saved in the Sheet's Drive folder
  if (typeof formData.image === 'string' && formData.image.startsWith('data:')) {
    flat.image_data = formData.image;
  }

  return flat;
}

/**
 * Sends the proposal to the Google Sheet.
 * @returns {Promise<{ok: boolean, id?: number, code?: string, fields?: string[]}>}
 *   code: not_configured | missing_fields | invalid_email | rate_limited |
 *         server_error | network_error
 */
export async function submitStudy(formData) {
  if (!GOOGLE_SHEET_WEBAPP_URL) {
    console.warn('Google Sheet URL not configured - skipping remote submission');
    return { ok: false, code: 'not_configured' };
  }

  let response;
  try {
    // text/plain avoids the CORS preflight that Apps Script does not answer;
    // the reply (after Google's redirect) can be read.
    response = await fetch(GOOGLE_SHEET_WEBAPP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(flattenStudyData(formData)),
      redirect: 'follow',
    });
  } catch (err) {
    console.error('Google Sheet submission error:', err);
    return { ok: false, code: 'network_error' };
  }

  try {
    const data = JSON.parse(await response.text());
    if (data.result === 'success') return { ok: true, id: data.id };
    return { ok: false, code: data.code || 'server_error', fields: data.fields || [] };
  } catch (err) {
    console.error('Unexpected answer from the submission service:', err);
    return { ok: false, code: 'server_error' };
  }
}
