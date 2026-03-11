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
    data = normalizeSubmissionData(data, sheet, headers);

    // Build row in header order
    var row = headers.map(function(h) {
      return getCellValue(data, h);
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

function normalizeSubmissionData(data, sheet, headers) {
  var normalized = {};

  Object.keys(data || {}).forEach(function(key) {
    normalized[key] = data[key];
  });

  if (!normalized.status) {
    normalized.status = "pending";
  }

  if (!normalized.submitted_at) {
    normalized.submitted_at = new Date().toISOString();
  }

  if (!normalized.id) {
    normalized.id = String(getNextSubmissionId(sheet, headers));
  }

  var coordinates = getNormalizedCoordinatePair(normalized.latitude, normalized.longitude);
  if (coordinates) {
    normalized.latitude = coordinates.lat;
    normalized.longitude = coordinates.lng;
  } else {
    normalized.latitude = normalizeCoordinateInput(normalized.latitude, "latitude");
    normalized.longitude = normalizeCoordinateInput(normalized.longitude, "longitude");
  }

  return normalized;
}

function getCellValue(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key) && data[key] !== null && data[key] !== undefined
    ? data[key]
    : "";
}

function getAxisLimit(axis) {
  return axis === "latitude" ? 90 : 180;
}

function isValidCoordinateNumber(value, axis) {
  return isFinite(value) && Math.abs(value) <= getAxisLimit(axis);
}

function parseDecimalCoordinate(raw) {
  var value = String(raw).replace(/[−–—]/g, "-").replace(/\s+/g, "");

  if (value.indexOf(",") !== -1 && value.indexOf(".") !== -1) {
    if (value.lastIndexOf(",") > value.lastIndexOf(".")) {
      value = value.replace(/\./g, "").replace(",", ".");
    } else {
      value = value.replace(/,/g, "");
    }
  } else if (value.indexOf(",") !== -1) {
    value = value.replace(",", ".");
  }

  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
    return null;
  }

  var parsed = Number(value);
  return isFinite(parsed) ? parsed : null;
}

function parseDmsCoordinate(raw, sign) {
  var match = String(raw).match(/^([+-])?\s*(\d{1,3})\D+(\d{1,2})(?:\D+(\d{1,2}(?:[.,]\d+)?))?\s*$/);
  if (!match) {
    return null;
  }

  var degrees = Number(match[2]);
  var minutes = Number(match[3]);
  var seconds = Number(String(match[4] || "0").replace(",", "."));

  if (!isFinite(degrees) || !isFinite(minutes) || !isFinite(seconds)) {
    return null;
  }
  if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
    return null;
  }

  return (degrees + (minutes / 60) + (seconds / 3600)) * sign;
}

function parseCoordinateValue(value, axis) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    return isValidCoordinateNumber(value, axis) ? value : null;
  }

  var normalized = String(value).trim().replace(/[−–—]/g, "-");
  if (!normalized) {
    return null;
  }

  var sign = normalized.charAt(0) === "-" || /[SW]/i.test(normalized) ? -1 : 1;
  var withoutCompass = normalized.replace(/[NSEW]/gi, "").trim();

  var decimal = parseDecimalCoordinate(withoutCompass);
  if (decimal !== null) {
    var signedDecimal = withoutCompass.charAt(0) === "-" ? decimal : Math.abs(decimal) * sign;
    if (isValidCoordinateNumber(signedDecimal, axis)) {
      return signedDecimal;
    }
  }

  var dms = parseDmsCoordinate(withoutCompass, sign);
  if (dms !== null && isValidCoordinateNumber(dms, axis)) {
    return dms;
  }

  return null;
}

function formatCoordinateValue(value) {
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function normalizeCoordinateInput(value, axis) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  var parsed = parseCoordinateValue(value, axis);
  if (parsed === null) {
    return String(value).trim();
  }

  return formatCoordinateValue(parsed);
}

function getNormalizedCoordinatePair(latitudeValue, longitudeValue) {
  var latitude = parseCoordinateValue(latitudeValue, "latitude");
  var longitude = parseCoordinateValue(longitudeValue, "longitude");

  if (latitude !== null && longitude !== null) {
    return { lat: latitude, lng: longitude, swapped: false };
  }

  var swappedLatitude = parseCoordinateValue(longitudeValue, "latitude");
  var swappedLongitude = parseCoordinateValue(latitudeValue, "longitude");

  if (swappedLatitude !== null && swappedLongitude !== null) {
    return { lat: swappedLatitude, lng: swappedLongitude, swapped: true };
  }

  return null;
}

function ensureHeaders(sheet, desiredHeaders) {
  if (sheet.getLastRow() === 0) {
    writeHeaderRow(sheet, desiredHeaders);
    return desiredHeaders.slice();
  }

  var lastRow = sheet.getLastRow();
  var currentWidth = Math.max(sheet.getLastColumn(), 1);
  var requiredWidth = Math.max(currentWidth, desiredHeaders.length);
  var rawData = sheet.getRange(1, 1, lastRow, requiredWidth).getValues();
  var rawHeaders = rawData[0]
    .map(function(value) {
      return String(value || "").trim();
    });
  var existingHeaders = rawHeaders.filter(function(value) {
    return value !== "";
  });

  if (existingHeaders.length === 0) {
    writeHeaderRow(sheet, desiredHeaders);
    return desiredHeaders.slice();
  }

  var extraHeaders = existingHeaders.filter(function(header) {
    return desiredHeaders.indexOf(header) === -1;
  });
  var orderedHeaders = desiredHeaders.concat(extraHeaders);

  var headersAlreadyOrdered =
    existingHeaders.length === orderedHeaders.length &&
    orderedHeaders.every(function(header, index) {
      return existingHeaders[index] === header;
    });

  if (headersAlreadyOrdered) {
    writeHeaderRow(sheet, orderedHeaders);
    return orderedHeaders;
  }

  var rowObjects = rawData.slice(1).map(function(row) {
    var rowObject = {};
    rawHeaders.forEach(function(header, index) {
      if (header) {
        rowObject[header] = row[index];
      }
    });
    return rowObject;
  });

  ensureColumnCapacity(sheet, orderedHeaders.length);

  var rewrittenRows = [orderedHeaders].concat(rowObjects.map(function(rowObject) {
    return orderedHeaders.map(function(header) {
      return Object.prototype.hasOwnProperty.call(rowObject, header) ? rowObject[header] : "";
    });
  }));

  var clearWidth = Math.max(requiredWidth, orderedHeaders.length);
  sheet.getRange(1, 1, lastRow, clearWidth).clearContent();
  sheet.getRange(1, 1, rewrittenRows.length, orderedHeaders.length).setValues(rewrittenRows);
  applyHeaderFormatting(sheet, orderedHeaders.length);
  applyCoordinateColumnFormatting(sheet, orderedHeaders);

  return orderedHeaders;
}

function ensureColumnCapacity(sheet, width) {
  var maxColumns = sheet.getMaxColumns();
  if (maxColumns < width) {
    sheet.insertColumnsAfter(maxColumns, width - maxColumns);
  }
}

function writeHeaderRow(sheet, headers) {
  ensureColumnCapacity(sheet, headers.length);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  applyHeaderFormatting(sheet, headers.length);
  applyCoordinateColumnFormatting(sheet, headers);
}

function applyHeaderFormatting(sheet, width) {
  sheet.getRange(1, 1, 1, width).setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function applyCoordinateColumnFormatting(sheet, headers) {
  var totalRows = Math.max(sheet.getMaxRows(), 2);

  ["latitude", "longitude"].forEach(function(header) {
    var index = headers.indexOf(header);
    if (index !== -1) {
      sheet.getRange(2, index + 1, totalRows - 1, 1).setNumberFormat("0.000000");
    }
  });
}

function repairSubmissionSheet() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Submissions");
  if (!sheet) {
    throw new Error('Sheet "Submissions" not found.');
  }

  var headers = ensureHeaders(sheet, getDesiredHeaders());
  var lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return;
  }

  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rowObjects = values.map(function(row) {
    var rowObject = {};
    headers.forEach(function(header, index) {
      rowObject[header] = row[index];
    });
    return rowObject;
  });

  fillMissingSystemFields(rowObjects);

  var rewrittenRows = rowObjects.map(function(rowObject) {
    return headers.map(function(header) {
      return getCellValue(rowObject, header);
    });
  });

  sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  sheet.getRange(2, 1, rewrittenRows.length, headers.length).setValues(rewrittenRows);
  applyCoordinateColumnFormatting(sheet, headers);
}

function fillMissingSystemFields(rowObjects) {
  var usedIds = {};
  var nextId = 1;

  rowObjects.forEach(function(rowObject) {
    var parsedId = parseInt(rowObject.id, 10);
    if (!isNaN(parsedId) && parsedId > 0) {
      usedIds[parsedId] = true;
      if (parsedId >= nextId) {
        nextId = parsedId + 1;
      }
    }
  });

  rowObjects.forEach(function(rowObject) {
    if (!rowObject.status) {
      rowObject.status = "pending";
    }

    if (!rowObject.submitted_at) {
      rowObject.submitted_at = new Date().toISOString();
    }

    var parsedId = parseInt(rowObject.id, 10);
    if (isNaN(parsedId) || parsedId <= 0) {
      while (usedIds[nextId]) {
        nextId++;
      }
      rowObject.id = String(nextId);
      usedIds[nextId] = true;
      nextId++;
    }
  });
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
