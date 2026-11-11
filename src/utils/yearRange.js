// Reads the free-text "year" of a case ("2016–2020", "completed 2022", "late 1990s",
// "2015–ongoing", "12th–13th century ... 19th–21st century") as a { start, end } range.
// Returns null when no year can be read.
// "completed" is the completion year, or null when the project is ongoing or the text only
// gives other phases ("2017 (design phase) - 2019 (approved)") or only centuries: completion unknown.
export function parseYearRange(yearText) {
  if (!yearText) return null;
  const s = String(yearText);
  const years = [];

  for (const m of s.matchAll(/\b(\d{4})(s?)\b/g)) {
    const y = Number(m[1]);
    years.push(y);
    if (m[2]) years.push(y + 9); // "1990s" covers 1990–1999
  }
  let centuries = false;
  if (years.length === 0) {
    // Centuries: "12th century" covers 1100–1199 (no precise completion year)
    centuries = true;
    for (const m of s.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)\b/gi)) {
      const c = Number(m[1]);
      years.push((c - 1) * 100, Math.min((c - 1) * 100 + 99, new Date().getFullYear()));
    }
  }
  if (years.length === 0) return null;

  const start = Math.min(...years);
  let end = Math.max(...years);
  const ongoing = /ongoing|in progress|present|today/i.test(s);
  if (ongoing) end = Math.max(end, new Date().getFullYear());
  const otherPhasesOnly = /design|approved|planned|proposal|under construction/i.test(s)
    && !/complet|built|inaugurat|opened|finished/i.test(s);
  const completed = ongoing || otherPhasesOnly || centuries ? null : end;
  return { start, end, completed, ongoing };
}

// True when the case's years overlap [min, max] (either bound may be null).
// "From 2016 on" keeps a 2000–2020 project; "until 2010" keeps a 2005–2012 one.
export function yearRangeOverlaps(yearText, min, max) {
  const r = parseYearRange(yearText);
  if (!r) return false;
  if (min != null && r.end < min) return false;
  if (max != null && r.start > max) return false;
  return true;
}
