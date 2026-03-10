import { processFormImage } from './imageHosting';
import { normalizeCoordinateInput } from './coordinates';

const GOOGLE_SHEET_WEBAPP_URL = process.env.REACT_APP_GOOGLE_SHEET_URL || '';

const SUBMISSION_FIELDS = [
  'title', 'city', 'country', 'year', 'designer', 'promoter',
  'description', 'latitude', 'longitude',
  'size', 'climate_zone',
  'physical_innovation', 'social_innovation', 'digital_innovation',
  'has_physical_innovation', 'has_social_innovation', 'has_digital_innovation',
  'sources',
];

function flattenStudyData(formData) {
  const flat = {};
  const booleanFields = ['has_physical_innovation', 'has_social_innovation', 'has_digital_innovation'];

  for (const key of SUBMISSION_FIELDS) {
    if (booleanFields.includes(key)) {
      flat[key] = formData[key] ? 'true' : 'false';
    } else {
      flat[key] = formData[key] || '';
    }
  }

  flat.latitude = normalizeCoordinateInput(flat.latitude, 'latitude');
  flat.longitude = normalizeCoordinateInput(flat.longitude, 'longitude');

  flat.talea_application = Array.isArray(formData.talea_application)
    ? formData.talea_application.join(', ')
    : formData.talea_application || '';

  const arrayFields = [
    'a1_urban_scale', 'a2_urban_area', 'a3_1_buildings', 'a3_2_open_spaces',
    'a3_3_infrastructures', 'a4_ownership', 'a5_management', 'a6_uses', 'a7_other',
    'b1_physical', 'b2_regulations', 'b3_uses_management', 'b4_public_opinion',
    'b5_synergy', 'b6_social_opportunities',
    'c1_1_design', 'c1_2_funding', 'c1_3_management', 'c2_actors', 'c3_goals', 'c4_services',
    'd1_plants', 'd2_paving', 'd3_water', 'd4_roof_facade', 'd5_furnishings', 'd6_urban_spaces',
  ];

  for (const key of arrayFields) {
    flat[key] = Array.isArray(formData[key]) ? formData[key].join(', ') : '';
  }

  flat.c5_impacts = formData.c5_impacts || '';

  if (formData.image && !formData.image.startsWith('data:')) {
    flat.image_url = formData.image;
  }

  flat.id = formData.id || '';
  flat.submitted_at = new Date().toISOString();
  flat.status = 'pending';

  return flat;
}

export async function submitToGoogleSheet(formData) {
  if (!GOOGLE_SHEET_WEBAPP_URL) {
    console.warn('Google Sheet URL not configured - skipping remote submission');
    return { success: false, reason: 'not_configured' };
  }

  const flat = flattenStudyData(formData);

  try {
    await fetch(GOOGLE_SHEET_WEBAPP_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(flat),
    });

    return { success: true };
  } catch (err) {
    console.error('Google Sheet submission error:', err);
    return { success: false, reason: 'submission_failed', error: err };
  }
}

export async function submitStudy(formData) {
  const processedData = await processFormImage(formData);
  const sheetResult = await submitToGoogleSheet(processedData);

  return {
    sheetSent: sheetResult.success,
  };
}
