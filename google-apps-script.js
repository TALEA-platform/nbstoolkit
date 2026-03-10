/**
 * Google Apps Script — paste this into your Google Sheet's Apps Script editor.
 *
 * Setup:
 * 1. Create a Google Sheet with a sheet named "Submissions"
 * 2. Row 1 should be headers (they'll be auto-created on first submission)
 * 3. Go to Extensions > Apps Script
 * 4. Replace the default code with this file's contents
 * 5. Set SUPERVISOR_EMAIL below to the supervisor's email address
 * 6. Deploy > New deployment > Web app
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 * 7. Copy the web app URL and set it as REACT_APP_GOOGLE_SHEET_URL in your .env
 *
 * The supervisor workflow:
 * - New submissions appear with status = "pending"
 * - Supervisor receives an email notification for each new submission
 * - Supervisor changes the "status" column to "approved" or "denied" in the sheet
 * - The nightly GitHub Action reads "approved" rows and merges them into caseStudies.json
 */

// ── CHANGE THIS to the supervisor's email address ──
var SUPERVISOR_EMAIL = "supervisor@example.com";

function doPost(e) {
  var lock;
  try {
    lock = LockService.getScriptLock();
    lock.waitLock(30000);

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Submissions");
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Submissions");
    }

    var data = JSON.parse(e.postData.contents);
    var headers = ensureHeaders(sheet, getDesiredHeaders());

    if (!data.id) {
      data.id = String(getNextSubmissionId(sheet, headers));
    }

    // Build row in header order
    var row = headers.map(function(h) {
      return data[h] || "";
    });

    sheet.appendRow(row);

    // ── Send email notification to supervisor ──
    if (SUPERVISOR_EMAIL && SUPERVISOR_EMAIL !== "supervisor@example.com") {
      var subject = "New TALEA Submission: " + (data.title || "Untitled");
      var body = "A new case study has been submitted to the TALEA Abacus.\n\n"
        + "Title: " + (data.title || "") + "\n"
        + "City: " + (data.city || "") + ", " + (data.country || "") + "\n"
        + "Year: " + (data.year || "") + "\n"
        + "Size: " + (data.size || "") + " | Climate: " + (data.climate_zone || "") + "\n"
        + "TALEA Application: " + (data.talea_application || "") + "\n"
        + "Coordinates: " + (data.latitude || "N/A") + ", " + (data.longitude || "N/A") + "\n\n"
        + "Designer: " + (data.designer || "") + "\n"
        + "Promoter: " + (data.promoter || "") + "\n\n"
        + "Description:\n" + (data.description || "") + "\n\n"
        + "Submitted: " + (data.submitted_at || "") + "\n\n"
        + "---\n"
        + "To approve or deny this submission, open the Google Sheet and change\n"
        + "the 'status' column from 'pending' to 'approved' or 'denied'.\n\n"
        + "Sheet: " + SpreadsheetApp.getActiveSpreadsheet().getUrl();

      MailApp.sendEmail(SUPERVISOR_EMAIL, subject, body);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ result: "success" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    if (lock) {
      lock.releaseLock();
    }
  }
}

function doGet() {
  return ContentService
    .createTextOutput("TALEA Submission endpoint is active.")
    .setMimeType(ContentService.MimeType.TEXT);
}

function getDesiredHeaders() {
  return [
    "id", "status", "submitted_at", "title", "city", "country", "year",
    "latitude", "longitude", "size", "climate_zone", "talea_application",
    "designer", "promoter", "description",
    "physical_innovation", "social_innovation", "digital_innovation",
    "has_physical_innovation", "has_social_innovation", "has_digital_innovation",
    "a1_urban_scale", "a2_urban_area", "a3_1_buildings", "a3_2_open_spaces",
    "a3_3_infrastructures", "a4_ownership", "a5_management", "a6_uses", "a7_other",
    "b1_physical", "b2_regulations", "b3_uses_management", "b4_public_opinion",
    "b5_synergy", "b6_social_opportunities",
    "c1_1_design", "c1_2_funding", "c1_3_management", "c2_actors", "c3_goals", "c4_services", "c5_impacts",
    "d1_plants", "d2_paving", "d3_water", "d4_roof_facade", "d5_furnishings", "d6_urban_spaces",
    "image_url", "sources"
  ];
}

function ensureHeaders(sheet, desiredHeaders) {
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
    sheet.getRange(1, 1, 1, desiredHeaders.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    return desiredHeaders.slice();
  }

  var headerWidth = Math.max(sheet.getLastColumn(), 1);
  var existingHeaders = sheet.getRange(1, 1, 1, headerWidth).getValues()[0]
    .map(function(value) {
      return String(value || "").trim();
    })
    .filter(function(value) {
      return value !== "";
    });

  if (existingHeaders.length === 0) {
    sheet.getRange(1, 1, 1, desiredHeaders.length).setValues([desiredHeaders]);
    sheet.getRange(1, 1, 1, desiredHeaders.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
    return desiredHeaders.slice();
  }

  var missingHeaders = desiredHeaders.filter(function(header) {
    return existingHeaders.indexOf(header) === -1;
  });

  if (missingHeaders.length === 0) {
    return existingHeaders;
  }

  var updatedHeaders = existingHeaders.concat(missingHeaders);
  var maxColumns = sheet.getMaxColumns();
  if (maxColumns < updatedHeaders.length) {
    sheet.insertColumnsAfter(maxColumns, updatedHeaders.length - maxColumns);
  }

  sheet.getRange(1, 1, 1, updatedHeaders.length).setValues([updatedHeaders]);
  sheet.getRange(1, 1, 1, updatedHeaders.length).setFontWeight("bold");
  sheet.setFrozenRows(1);
  return updatedHeaders;
}

function getNextSubmissionId(sheet, headers) {
  var idColumnIndex = headers.indexOf("id");
  if (idColumnIndex === -1 || sheet.getLastRow() < 2) {
    return 1;
  }

  var values = sheet.getRange(2, idColumnIndex + 1, sheet.getLastRow() - 1, 1).getValues();
  var maxId = 0;
  values.forEach(function(row) {
    var value = parseInt(row[0], 10);
    if (!isNaN(value) && value > maxId) {
      maxId = value;
    }
  });

  return maxId + 1;
}
