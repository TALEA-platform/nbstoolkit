function getAxisLimit(axis) {
  return axis === 'latitude' ? 90 : 180;
}

function isValidCoordinateNumber(value, axis) {
  return Number.isFinite(value) && Math.abs(value) <= getAxisLimit(axis);
}

function stripCompassAndNormalize(value) {
  return String(value)
    .trim()
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ');
}

function parseDecimalCoordinate(raw) {
  let value = raw.replace(/\s+/g, '');

  if (value.includes(',') && value.includes('.')) {
    if (value.lastIndexOf(',') > value.lastIndexOf('.')) {
      value = value.replace(/\./g, '').replace(',', '.');
    } else {
      value = value.replace(/,/g, '');
    }
  } else if (value.includes(',')) {
    value = value.replace(',', '.');
  }

  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDmsCoordinate(raw, sign) {
  const match = raw.match(/^([+-])?\s*(\d{1,3})\D+(\d{1,2})(?:\D+(\d{1,2}(?:[.,]\d+)?))?\s*$/);
  if (!match) {
    return null;
  }

  const degrees = Number(match[2]);
  const minutes = Number(match[3]);
  const seconds = Number((match[4] || '0').replace(',', '.'));

  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  if (minutes < 0 || minutes >= 60 || seconds < 0 || seconds >= 60) {
    return null;
  }

  const decimal = degrees + (minutes / 60) + (seconds / 3600);
  return decimal * sign;
}

export function parseCoordinateValue(value, axis) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return isValidCoordinateNumber(value, axis) ? value : null;
  }

  const normalized = stripCompassAndNormalize(value);
  if (!normalized) {
    return null;
  }

  const hasNegativeCompass = /[SW]/i.test(normalized);
  const sign = normalized.startsWith('-') || hasNegativeCompass ? -1 : 1;
  const withoutCompass = normalized.replace(/[NSEW]/gi, '').trim();

  const decimal = parseDecimalCoordinate(withoutCompass);
  if (decimal !== null) {
    const signedDecimal = withoutCompass.startsWith('-') ? decimal : Math.abs(decimal) * sign;
    if (isValidCoordinateNumber(signedDecimal, axis)) {
      return signedDecimal;
    }
  }

  const dms = parseDmsCoordinate(withoutCompass, sign);
  if (dms !== null && isValidCoordinateNumber(dms, axis)) {
    return dms;
  }

  return null;
}

export function formatCoordinateValue(value, digits = 6) {
  return value.toFixed(digits).replace(/\.?0+$/, '');
}

export function getNormalizedCoordinatePair(latitudeValue, longitudeValue) {
  const latitude = parseCoordinateValue(latitudeValue, 'latitude');
  const longitude = parseCoordinateValue(longitudeValue, 'longitude');

  if (latitude !== null && longitude !== null) {
    return { lat: latitude, lng: longitude, swapped: false };
  }

  const swappedLatitude = parseCoordinateValue(longitudeValue, 'latitude');
  const swappedLongitude = parseCoordinateValue(latitudeValue, 'longitude');

  if (swappedLatitude !== null && swappedLongitude !== null) {
    return { lat: swappedLatitude, lng: swappedLongitude, swapped: true };
  }

  return null;
}

export function normalizeCoordinateInput(value, axis) {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const parsed = parseCoordinateValue(value, axis);
  if (parsed === null) {
    return String(value).trim();
  }

  return formatCoordinateValue(parsed);
}

export function normalizeCoordinateInputs(latitudeValue, longitudeValue) {
  const pair = getNormalizedCoordinatePair(latitudeValue, longitudeValue);
  if (pair) {
    return {
      latitude: formatCoordinateValue(pair.lat),
      longitude: formatCoordinateValue(pair.lng),
      swapped: pair.swapped,
    };
  }

  return {
    latitude: normalizeCoordinateInput(latitudeValue, 'latitude'),
    longitude: normalizeCoordinateInput(longitudeValue, 'longitude'),
    swapped: false,
  };
}

export function getStudyCoordinates(study, fallbackCoordinates) {
  const pair = getNormalizedCoordinatePair(study?.latitude, study?.longitude);
  if (pair) {
    return { lat: pair.lat, lng: pair.lng };
  }

  const fallback = fallbackCoordinates?.[study?.id];
  if (Array.isArray(fallback) && Number.isFinite(fallback[0]) && Number.isFinite(fallback[1])) {
    return { lat: fallback[0], lng: fallback[1] };
  }

  return null;
}
