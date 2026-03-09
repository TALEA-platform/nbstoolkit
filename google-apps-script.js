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
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Submissions");
    if (!sheet) {
      sheet = SpreadsheetApp.getActiveSpreadsheet().insertSheet("Submissions");
    }

    var data = JSON.parse(e.postData.contents);

    // Define column order
    var headers = [
      "status", "submitted_at", "title", "city", "country", "year",
      "latitude", "longitude", "size", "climate_zone", "talea_application",
      "designer", "promoter", "description",
      "physical_innovation", "social_innovation", "digital_innovation",
      "a1_urban_scale", "a2_urban_area", "a3_1_buildings", "a3_2_open_spaces",
      "a3_3_infrastructures", "a4_ownership", "a5_management", "a6_uses", "a7_other",
      "b1_physical", "b2_regulations", "b3_uses_management", "b4_public_opinion",
      "b5_synergy", "b6_social_opportunities",
      "d1_plants", "d2_paving", "d3_water", "d4_roof_facade", "d5_furnishings", "d6_urban_spaces",
      "c1_1_design", "c1_2_funding", "c1_3_management", "c2_actors", "c3_goals", "c4_services",
      "image_url"
    ];

    // Add headers if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      // Bold and freeze header row
      sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
      sheet.setFrozenRows(1);
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
  }
}

function doGet() {
  return ContentService
    .createTextOutput("TALEA Submission endpoint is active.")
    .setMimeType(ContentService.MimeType.TEXT);
}
