// ─── Configuration ───────────────────────────────────────────────
// Google Apps Script handles both sheet insertion AND email notification.
//
// Setup:
// 1. Create a Google Sheet with a sheet named "Submissions"
// 2. Go to Extensions > Apps Script
// 3. Paste the doPost handler (see google-apps-script.js in project root)
// 4. Deploy > New deployment > Web app
//    - Execute as: "Me"
//    - Who has access: "Anyone"
// 5. Copy the web app URL and set it as REACT_APP_GOOGLE_SHEET_URL in your .env
// ──────────────────────────────────────────────────────────────────

import { processFormImage } from './imageHosting';

const GOOGLE_SHEET_WEBAPP_URL = process.env.REACT_APP_GOOGLE_SHEET_URL || '';

// Fields we send to the sheet
const SUBMISSION_FIELDS = [
  'title', 'city', 'country', 'year', 'designer', 'promoter',
  'description', 'latitude', 'longitude',
  'size', 'climate_zone',
  'physical_innovation', 'social_innovation', 'digital_innovation',
  'c5_impacts',
];

/**
 * Format study data into a flat object for sheet submission
 */
function flattenStudyData(formData) {
  const flat = {};
  for (const key of SUBMISSION_FIELDS) {
    flat[key] = formData[key] || '';
  }
  // Handle talea_application (array → comma-separated)
  flat.talea_application = Array.isArray(formData.talea_application)
    ? formData.talea_application.join(', ')
    : formData.talea_application || '';

  // Handle multi-select array fields
  const arrayFields = [
    'a1_urban_scale', 'a2_urban_area', 'a3_1_buildings', 'a3_2_open_spaces',
    'a3_3_infrastructures', 'a4_ownership', 'a5_management', 'a6_uses', 'a7_other',
    'b1_physical', 'b2_regulations', 'b3_uses_management', 'b4_public_opinion',
    'b5_synergy', 'b6_social_opportunities',
    'd1_plants', 'd2_paving', 'd3_water', 'd4_roof_facade', 'd5_furnishings', 'd6_urban_spaces',
    'c1_1_design', 'c1_2_funding', 'c1_3_management', 'c2_actors', 'c3_goals', 'c4_services',
  ];
  for (const key of arrayFields) {
    flat[key] = Array.isArray(formData[key]) ? formData[key].join(', ') : '';
  }

  // Include image URL (not DataURL) if available
  if (formData.image && !formData.image.startsWith('data:')) {
    flat.image_url = formData.image;
  }

  flat.submitted_at = new Date().toISOString();
  flat.status = 'pending';

  return flat;
}

/**
 * Submit data to Google Apps Script web app (handles sheet + email)
 */
export async function submitToGoogleSheet(formData) {
  if (!GOOGLE_SHEET_WEBAPP_URL) {
    console.warn('Google Sheet URL not configured — skipping remote submission');
    return { success: false, reason: 'not_configured' };
  }

  const flat = flattenStudyData(formData);

  try {
    await fetch(GOOGLE_SHEET_WEBAPP_URL, {
      method: 'POST',
      mode: 'no-cors', // Apps Script requires no-cors from browser
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flat),
    });
    // no-cors means we can't read the response, but if no error it likely worked
    return { success: true };
  } catch (err) {
    console.error('Google Sheet submission error:', err);
    return { success: false, reason: 'submission_failed', error: err };
  }
}

/**
 * Submit to Google Apps Script (handles sheet insert + email notification).
 * No local storage — submissions appear after admin approval and nightly sync.
 */
export async function submitStudy(formData) {
  // Upload image to hosting service if configured (replaces DataURL with URL)
  const processedData = await processFormImage(formData);

  // Submit to Google Apps Script
  const sheetResult = await submitToGoogleSheet(processedData);

  return {
    sheetSent: sheetResult.success,
  };
}
