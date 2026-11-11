// Normal search (no AI): finds the cases whose texts or tags contain the words typed.
//   - every word must be found (AND); "or" between words gives alternatives ("Paris or Lyon");
//     "not" / "without" / "-" excludes ("green roofs not in Spain", "-Spain")
//   - words that appear together in the catalogue stay a phrase ("heat island" ≠ "heat" + "island")
//   - plurals and spelling variants count ("gardens" = "garden", "storm-water" = "stormwater",
//     "rain garden" = "raingarden")
//   - countries and cities are filters, not words: several of the same kind are alternatives
//     ("Italy Spain"), a city and a country narrow each other ("Paris France")
//   - designer and promoter names are searched too ("Stefano Boeri"), ranked after the texts
//   - if no case has all the words, the cases with most of them are shown, saying so
//   - no hidden typo correction: a word found in no case gets a "did you mean" suggestion
//   - filters are never applied here: tags matching the words are returned as suggestions
// The texts of the cases are in English: words of other languages are reported as not found.
import { FILTER_CATEGORIES } from '../data/filterConfig';
import { studyMatchesCategory } from './filterMatcher';

// Words that say nothing about the content of a case
const STOP_WORDS = new Set(('a an the and of in on at to for with by from into about near over under is are '
  + 'be was were it its this that these those my our your their i we you me us any some all how what which '
  + 'where who can could should would show find looking look want need example examples case cases project '
  + 'projects nbs solution solutions idea ideas').split(' '));
const OR_WORDS = new Set(['or']);
// ("no" is not one: "no space for trees" describes a site, it does not exclude trees)
const NOT_WORDS = new Set(['not', 'without', 'except', 'excluding']);

// Texts saying that something is absent ("No evidence of embedded digital systems") are not content
const EMPTY_TEXT = /^\s*(no evidence|no data|none|n\/a|-)\b/i;

export const normalize = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Only plurals are reduced: "parking" stays "parking", "cooling" stays "cooling"
const singular = w => (w.length > 4 && w.endsWith('ies') ? `${w.slice(0, -3)}y`
  : w.length > 3 && /[^su]s$/.test(w) ? w.slice(0, -1) : w);

// Words of a text in order; a hyphenated word also counts joined ("storm-water" → storm, water, stormwater)
export function words(text) {
  return (normalize(text).match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [])
    .flatMap(w => (w.includes('-') ? [...w.split('-'), w.replace(/-/g, '')] : [w]))
    .filter(w => w.length > 1)
    .map(singular);
}

// Same, with a break between sentences, list items and tags ("trees, rain gardens" is not
// the phrase "tree rain")
const BREAK = '|';
const wordsWithBreaks = text => normalize(text).split(/[.,;:!?()/\n|•–—]+/)
  .flatMap(part => [...words(part), BREAK]);

// Categories whose values are words of the case: lists of tags, and the climate zone
// ("Mediterranean"). Size and TALEA type are not ("small", "linear" are in many descriptions),
// nor innovation: they are offered as filters only.
const TAG_CATEGORIES = Object.entries(FILTER_CATEGORIES)
  .filter(([key, c]) => c.type === 'array' || key === 'climate_zone');
const tagValues = (study, c) => (Array.isArray(study[c.dataKey]) ? study[c.dataKey]
  : study[c.dataKey] ? [study[c.dataKey]] : []);

function caseText(study) {
  const texts = [study.title, study.city, study.country, study.description, study.physical_innovation,
    study.social_innovation, study.digital_innovation, study.c5_impacts]
    .filter(t => typeof t === 'string' && t.trim() && !EMPTY_TEXT.test(t));
  // designer and promoter: found by name ("Stefano Boeri", "Urban GreenUP"), ranked low for
  // common words of their names ("Landscape Architects", "City Council")
  const people = [study.designer, study.promoter]
    .filter(t => typeof t === 'string' && t.trim() && !EMPTY_TEXT.test(t));
  const tags = TAG_CATEGORIES.flatMap(([, c]) => tagValues(study, c).filter(v => v !== 'Other'));
  // "Other (specify)" texts written in the case (e.g. "Industrial area")
  const other = Object.values(study.other_details || {})
    .flatMap(o => (o && typeof o === 'object' ? Object.values(o) : []))
    .filter(t => typeof t === 'string');
  return { text: [...texts, ...other].join(' . '), tags: tags.join(' . '), title: study.title || '', people: people.join(' . ') };
}

const indexCache = new WeakMap();

export function createSearchIndex(caseStudies) {
  if (indexCache.has(caseStudies)) return indexCache.get(caseStudies);
  const docs = caseStudies.map(study => {
    const { text, tags, title, people } = caseText(study);
    const mainSeq = wordsWithBreaks(`${text} . ${tags}`);
    const seq = [...mainSeq, ...wordsWithBreaks(people)];
    const tf = new Map();
    for (const w of seq) if (w !== BREAK) tf.set(w, (tf.get(w) || 0) + 1);
    const mainTf = new Map();
    for (const w of mainSeq) if (w !== BREAK) mainTf.set(w, (mainTf.get(w) || 0) + 1);
    // two words written joined in the query ("raingarden") match them written apart in the case
    const joined = new Set();
    for (let i = 0; i + 1 < seq.length; i++) if (seq[i] !== BREAK && seq[i + 1] !== BREAK) joined.add(seq[i] + seq[i + 1]);
    return { study, seq, tf, mainTf, joined, tagSeq: wordsWithBreaks(tags), titleSeq: words(title) };
  });
  const df = new Map();
  for (const d of docs) for (const w of new Set([...d.tf.keys(), ...d.joined])) df.set(w, (df.get(w) || 0) + 1);
  // phrases of the filter values ("community garden", "green wall"): always kept together
  const tagPhrases = new Set(Object.values(FILTER_CATEGORIES).flatMap(c => c.options)
    .flatMap(v => normalize(v).split(/[/()–-]+/)).map(p => words(p).join(' ')).filter(p => p.includes(' ')));
  // places: countries and cities as written in the cases (a case can list several cities)
  const places = new Map();
  for (const s of caseStudies) {
    if (s.country) places.set(normalize(s.country), { kind: 'country', value: s.country });
    for (const city of String(s.city || '').split(/\s*,\s*/)) if (city) places.set(normalize(city), { kind: 'city', value: city });
  }
  const index = { docs, df, places, tagPhrases, total: docs.length };
  indexCache.set(caseStudies, index);
  return index;
}

function hasPhrase(seq, phrase) {
  for (let i = 0; i + phrase.length <= seq.length; i++) {
    if (phrase.every((w, j) => seq[i + j] === w)) return true;
  }
  return false;
}

// A term (one word or a phrase) is in a case: in order, or written joined ("rain garden" = "raingarden")
function caseHas(doc, term) {
  if (term.length === 1) return doc.tf.has(term[0]) || doc.joined.has(term[0]);
  return doc.tf.has(term.join('')) || hasPhrase(doc.seq, term);
}

function placeOf(index, s) { return index.places.get(normalize(s).trim()) || null; }

function inPlace(study, place) {
  if (place.kind === 'country') return study.country === place.value;
  return String(study.city || '').split(/\s*,\s*/).some(c => normalize(c) === normalize(place.value));
}

// Places of the same kind are alternatives ("Italy Spain", "Paris Lyon"); a city and a country
// narrow each other ("Paris France" = Paris, "Milan France" = nothing)
function inPlaces(study, places) {
  const kinds = [...new Set(places.map(p => p.kind))];
  return kinds.every(k => places.some(p => p.kind === k && inPlace(study, p)));
}

// Splits the words of one alternative into places and terms (phrases kept together)
function readWords(index, rawWords) {
  const places = [];
  const rest = [];
  for (let i = 0; i < rawWords.length; i++) {
    const three = rawWords.slice(i, i + 3).join(' ');
    const two = rawWords.slice(i, i + 2).join(' ');
    if (rawWords.length - i >= 3 && placeOf(index, three)) { places.push(placeOf(index, three)); i += 2; }
    else if (rawWords.length - i >= 2 && placeOf(index, two)) { places.push(placeOf(index, two)); i += 1; }
    else if (placeOf(index, rawWords[i])) places.push(placeOf(index, rawWords[i]));
    else rest.push(rawWords[i]);
  }
  const toks = rest.filter(w => !STOP_WORDS.has(w)).flatMap(w => words(w));
  const terms = [];
  for (let i = 0; i < toks.length; i++) {
    const pair = [toks[i], toks[i + 1]];
    if (i + 1 < toks.length && isPhrase(index, pair)) { terms.push(pair); i++; } else terms.push([toks[i]]);
  }
  return { places, terms };
}

// Two words are searched as one phrase when they are a filter value ("community garden") or
// when the cases that have both mostly write them together ("heat island", "green roof");
// not when they meet by chance ("small square" is written together in 1 of many cases)
function isPhrase(index, pair) {
  if (index.tagPhrases.has(pair.join(' '))) return true;
  let both = 0;
  let together = 0;
  for (const d of index.docs) {
    if (!caseHas(d, [pair[0]]) || !caseHas(d, [pair[1]])) continue;
    both++;
    if (caseHas(d, pair)) together++;
  }
  return together >= 2 && together / both >= 0.5;
}

// Reads the query: alternatives (split on "or"), and in each one the words to find, the places,
// and what to exclude ("not in Spain", "without green roofs", "-Spain"; an exclusion ends at a comma or "and")
const rawWords = text => normalize(text).replace(/[;"“”]+/g, ' ').replace(/,/g, ' , ').split(/\s+/).filter(Boolean);

// Filter values with "or" in their name ("Service yard or technical area", "Overpass or viaduct"):
// typed whole, their "or" is part of the name, not an alternative
const VALUES_WITH_OR = [...new Set(Object.values(FILTER_CATEGORIES).flatMap(c => c.options))]
  .map(rawWords).filter(v => v.some(w => OR_WORDS.has(w)));

function dropOrOfValues(raw) {
  const drop = new Set();
  for (const v of VALUES_WITH_OR) {
    for (let i = 0; i + v.length <= raw.length; i++) {
      if (v.every((w, j) => raw[i + j] === w)) v.forEach((w, j) => { if (OR_WORDS.has(w)) drop.add(i + j); });
    }
  }
  return raw.filter((_, i) => !drop.has(i));
}

export function parseQuery(query, index) {
  const raw = dropOrOfValues(rawWords(query));
  const excluded = [];
  const kept = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    if (w.startsWith('-') && w.length > 1) { excluded.push([w.slice(1)]); continue; }
    if (NOT_WORDS.has(w)) {
      const group = [];
      let j = i + 1;
      if (raw[j] === 'in') j++;
      for (; j < raw.length && raw[j] !== ',' && raw[j] !== 'and' && !OR_WORDS.has(raw[j]); j++) group.push(raw[j]);
      if (group.length) excluded.push(group);
      i = j - 1;
      continue;
    }
    kept.push(w);
  }
  const alternatives = [];
  let current = [];
  for (const w of kept) {
    if (OR_WORDS.has(w)) { alternatives.push(current); current = []; } else if (w !== ',') current.push(w);
  }
  alternatives.push(current);
  const alts = alternatives.filter(a => a.length).map(a => readWords(index, a));
  const exclusions = excluded.map(group => readWords(index, group));
  return { alternatives: alts, exclusions };
}

const idf = (index, w) => Math.log(1 + (index.total - (index.df.get(w) || 0) + 0.5) / ((index.df.get(w) || 0) + 0.5));

// Rarity of a term (word or phrase) in the catalogue: a term found nowhere weighs nothing
// (it cannot be covered), a term in every case almost nothing
function termIdf(index, term) {
  const key = term.join(' ');
  index.termDf = index.termDf || new Map();
  if (!index.termDf.has(key)) index.termDf.set(key, index.docs.filter(d => caseHas(d, term)).length);
  const df = index.termDf.get(key);
  return df ? Math.log(1 + (index.total - df + 0.5) / (df + 0.5)) : 0;
}

function termScore(index, doc, term) {
  let s = 0;
  const key = term.join('');
  for (const w of term) {
    const f = doc.mainTf.get(w) || doc.mainTf.get(key) || (doc.joined.has(w) ? 1 : 0);
    if (f) s += idf(index, w) * (f * 2.2) / (f + 1.2);
    else if (doc.tf.has(w) || doc.tf.has(key)) s += 0.1; // only in the designer or promoter
  }
  if (hasPhrase(doc.tagSeq, term)) s += 2;   // a tag says it
  if (hasPhrase(doc.titleSeq, term)) s += 2; // the title says it
  return s;
}

// Words typed one after the other and written together in the case rank higher
// ("linear park": the cases saying "linear park" before those with "linear" and "park" apart)
function nearBonus(doc, terms) {
  let s = 0;
  for (let i = 0; i + 1 < terms.length; i++) {
    if (terms[i].length === 1 && terms[i + 1].length === 1 && caseHas(doc, [terms[i][0], terms[i + 1][0]])) s += 3;
  }
  return s;
}

const excludedBy = (doc, ex) => (ex.places.length > 0 && inPlaces(doc.study, ex.places))
  || (ex.terms.length > 0 && ex.terms.every(t => caseHas(doc, t)));

// Edit distance, for "did you mean"
function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// Closest word of the catalogue (found in at least 2 cases, or a place), only for words found nowhere
function closestWord(index, w) {
  if (w.length < 4) return null;
  const maxDist = w.length >= 7 ? 2 : 1;
  let best = null;
  const consider = (v, n) => {
    if (Math.abs(v.length - w.length) > maxDist) return;
    const d = distance(w, v);
    if (d <= maxDist && (!best || d < best.d || (d === best.d && n > best.n))) best = { v, d, n };
  };
  for (const [v, n] of index.df) if (n >= 2) consider(v, n);
  for (const p of index.places.keys()) if (!p.includes(' ')) consider(p, 1);
  return best ? best.v : null;
}

// Tags whose value contains a term of the query ("green roof" → Extensive / Intensive green roofs,
// "trees" → every tree tag), with the category name (some values exist in several categories).
// Also size, climate and TALEA type when a word is exactly one of their values ("small", "linear").
// count: among the results; total: in the whole catalogue (values never used are left out).
// Order: the values whose name is most covered by the words first (the exact name before longer
// values containing the word: "Public" before "Public cultural buildings/services"), then by cases
function tagSuggestions(terms, results, caseStudies, query) {
  const out = [];
  const queryWords = new Set(terms.flat());
  for (const [categoryKey, cat] of Object.entries(FILTER_CATEGORIES)) {
    for (const value of cat.options) {
      const valueWords = words(value);
      // size, climate, TALEA type: a word equal to the value or to a part of it ("boreal" → Cold/Boreal)
      const parts = [value, ...value.split('/')].map(p => words(p).join(' '));
      const hit = cat.type === 'array'
        ? terms.some(t => hasPhrase(valueWords, t))
        : terms.some(t => parts.includes(t.join(' ')));
      if (!hit) continue;
      const has = s => studyMatchesCategory(s, categoryKey, [value], 'or');
      const total = caseStudies.filter(has).length;
      if (total > 0) {
        const content = valueWords.filter(w => !STOP_WORDS.has(w) && !OR_WORDS.has(w));
        const covered = content.filter(w => queryWords.has(w)).length / (content.length || 1);
        // how many words of the query the value says (the full name beats a part of it)
        const says = content.filter(w => queryWords.has(w)).length;
        out.push({ categoryKey, category: cat.label, value, icon: cat.icon, color: cat.color, count: results.filter(has).length, total, covered, says });
      }
    }
  }
  // rest: the query without the words the value already says (see restWithoutValue)
  return out.sort((a, b) => b.covered - a.covered || b.says - a.says || b.count - a.count || b.total - a.total)
    .slice(0, 8).map(({ covered, says, ...s }) => ({ ...s, rest: restWithoutValue(query, s.value) }));
}

// ─── Filter names written in the query ("rain garden", "school rain garden") ───────────────
// Words of a name in order, one per word ("buildings/services" → buildings, services)
const nameWords = text => (normalize(text).match(/[a-z0-9]+/g) || []).filter(w => w.length > 1).map(singular);

// How a value can be written: whole, without the part in brackets ("Green area"), or the part
// before "/" when it has at least two words ("Commercial buildings" for Commercial buildings/services)
function nameVariants(value) {
  const out = new Set([nameWords(value).join(' ')]);
  const noBrackets = value.replace(/\([^)]*\)/g, ' ').trim();
  if (noBrackets) out.add(nameWords(noBrackets).join(' '));
  const beforeSlash = noBrackets.split('/')[0];
  if (beforeSlash !== noBrackets && nameWords(beforeSlash).length >= 2) out.add(nameWords(beforeSlash).join(' '));
  return [...out].filter(Boolean);
}

// name → filters with that name (values used in at least one case; "Other" is not a name)
function filterNames(index, caseStudies) {
  if (index.filterNames) return index.filterNames;
  const names = new Map();
  for (const [categoryKey, cat] of Object.entries(FILTER_CATEGORIES)) {
    for (const value of cat.options) {
      if (value === 'Other' || !caseStudies.some(s => studyMatchesCategory(s, categoryKey, [value], 'or'))) continue;
      for (const v of nameVariants(value)) {
        const list = names.get(v) || [];
        if (!list.some(f => f.categoryKey === categoryKey && f.value === value)) list.push({ categoryKey, value });
        names.set(v, list);
      }
    }
  }
  index.filterNames = names;
  return names;
}

const EDGE_WORDS = new Set([...STOP_WORDS, ',']);
const isEdge = text => EDGE_WORDS.has(normalize(text).replace(/,$/, ''));

// The words of the query as typed, marking those inside an exclusion (as in parseQuery)
function queryTokens(query) {
  const tokens = [...String(query).matchAll(/\S+/g)].map(m => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
  let excluding = false;
  for (const t of tokens) {
    const w = normalize(t.text).replace(/[,;]+$/, '');
    if (NOT_WORDS.has(w) || (t.text.startsWith('-') && t.text.length > 1)) { t.excluded = true; excluding = NOT_WORDS.has(w); continue; }
    if (w === 'and' || OR_WORDS.has(w)) excluding = false;
    t.excluded = excluding;
    if (/,$/.test(t.text)) excluding = false;
  }
  return tokens;
}

// The query without the tokens in `removed`, and without the joining words left at its ends or
// twice where a part was taken out ("parking area with | and green walls" → "parking area and green walls")
function restWithout(tokens, removed) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    if (removed.has(i)) continue;
    if (i > 0 && removed.has(i - 1) && isEdge(tokens[i].text)) while (out.length && isEdge(out[out.length - 1])) out.pop();
    out.push(tokens[i].text);
  }
  while (out.length && isEdge(out[0])) out.shift();
  while (out.length && isEdge(out[out.length - 1])) out.pop();
  return out.join(' ').replace(/,$/, '');
}

// The query without the words a filter value already says ("green roof Milan" + Extensive green
// roofs → "Milan"): runs of typed words found in the same order in the name. null if none.
// Whether the results stay the same is checked by the page, which simulates both.
function restWithoutValue(query, value) {
  const tokens = queryTokens(query);
  const valueWords = nameWords(value);
  const removed = new Set();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].excluded || isEdge(tokens[i].text)) continue;
    for (let j = tokens.length - 1; j >= i; j--) {
      const run = tokens.slice(i, j + 1);
      const runWords = run.flatMap(t => nameWords(t.text));
      if (!run.some(t => t.excluded) && runWords.length && hasPhrase(valueWords, runWords)) {
        for (let k = i; k <= j; k++) removed.add(k);
        i = j;
        break;
      }
    }
  }
  return removed.size ? restWithout(tokens, removed) : null;
}

// Filter names written whole in the query, each with the query without it ("school rain garden"
// → Rain garden, rest "school"). Not for a name in several categories ("public"), a name inside
// an exclusion ("not rain garden"), or a query with alternatives ("or").
function namesInQuery(query, index, caseStudies) {
  const names = filterNames(index, caseStudies);
  const tokens = queryTokens(query);
  // flat list of words, with the token each one comes from
  const flat = tokens.flatMap((t, ti) => nameWords(t.text).map((w, k, all) => ({ w, ti, first: k === 0, last: k === all.length - 1 })));
  const found = [];
  for (let p = 0; p < flat.length; p++) {
    for (let len = Math.min(8, flat.length - p); len >= 1; len--) {
      const span = flat.slice(p, p + len);
      const list = names.get(span.map(x => x.w).join(' '));
      if (!list || !span[0].first || !span[len - 1].last) continue;
      const from = span[0].ti;
      const to = span[len - 1].ti;
      if (tokens.slice(from, to + 1).some(t => t.excluded)) continue;
      if (list.length === 1) {
        const removed = new Set(tokens.map((_, i) => i).filter(i => i >= from && i <= to));
        found.push({ ...list[0], text: query.slice(tokens[from].start, tokens[to].end), rest: restWithout(tokens, removed) });
      }
      p += len - 1; // an ambiguous name is skipped whole ("public space" is not "space")
      break;
    }
  }
  return found;
}

// What a query asks besides its words: alternatives, places, exclusions
function frameOf(query, index) {
  const p = parseQuery(query, index);
  return {
    alts: Math.max(1, p.alternatives.length), // "without square" alone: one alternative, all the cases
    places: p.alternatives.map(a => a.places.map(x => `${x.kind}:${x.value}`).sort().join(',')).sort().join('|'),
    ex: p.exclusions.map(e => JSON.stringify(e)),
  };
}

// Taking words out of a query must not change its places, exclusions or alternatives:
// "street without trees and permeable paving in Spain" without "permeable paving" would be
// "street without trees in Spain", where the exclusion takes "in Spain" too (cases outside Spain).
// dropped = exclusions taken out on purpose (a "not …" moved to the filters). null if it changes.
function keepsFrame(query, rest, index, dropped = 0) {
  if (rest === null || rest === undefined) return null;
  const a = frameOf(query, index);
  if (!rest.trim()) return !a.places && a.ex.length === dropped ? rest : null;
  const b = frameOf(rest, index);
  const sameEx = b.ex.length === a.ex.length - dropped && b.ex.every(e => a.ex.includes(e));
  return a.alts === b.alts && a.places === b.places && sameEx ? rest : null;
}

// The one filter whose whole name is this text ("Row of trees", "rows of trees"), or null
function onlyFilterNamed(text, index, caseStudies) {
  const list = filterNames(index, caseStudies).get(nameWords(text).join(' '));
  return list && list.length === 1 ? list[0] : null;
}

// "single tree or row of trees": every alternative is the whole name of a filter of the same
// category → those values together in OR mode ({categoryKey, values}). Not across categories
// (the filter panel joins categories with AND), nor with other words, places or exclusions.
function orOfFilters(query, index, caseStudies) {
  const tokens = queryTokens(query);
  if (tokens.some(t => t.excluded)) return null;
  // an "or" inside a value name ("Overpass or viaduct") does not split
  const kept = dropOrOfValues(tokens.map(t => normalize(t.text)));
  const parts = [[]];
  let k = 0;
  tokens.forEach(t => {
    const w = normalize(t.text);
    const keptHere = kept[k] === w; // false for an "or" of a value name, dropped by dropOrOfValues
    if (keptHere) k++;
    if (OR_WORDS.has(w) && keptHere) parts.push([]); else parts[parts.length - 1].push(t.text);
  });
  if (parts.length < 2 || parts.some(p => !p.length)) return null;
  const filters = parts.map(p => onlyFilterNamed(p.join(' '), index, caseStudies));
  if (filters.some(f => !f) || new Set(filters.map(f => f.categoryKey)).size !== 1) return null;
  const values = [...new Set(filters.map(f => f.value))];
  return values.length > 1 ? { categoryKey: filters[0].categoryKey, values } : null;
}

// "green roofs not parking area", "trees without square", "-square": what is excluded is the
// whole name of a filter → that filter excluded ({categoryKey, value, text, rest}; rest = the
// query without the exclusion). Places stay a text exclusion ("not in Spain").
function exclusionsOfFilters(query, index, caseStudies) {
  const tokens = queryTokens(query);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const w = normalize(tokens[i].text).replace(/[,;]+$/, '');
    const from = i;
    let to = i;
    let group;
    if (tokens[i].text.startsWith('-') && tokens[i].text.length > 1) group = [tokens[i].text.slice(1)];
    else if (NOT_WORDS.has(w)) {
      // the excluded words: up to a comma, "and" or "or" (marked by queryTokens)
      let j = i + 1;
      if (j < tokens.length && normalize(tokens[j].text) === 'in') j++;
      const start = j;
      while (j < tokens.length && tokens[j].excluded) j++;
      group = tokens.slice(start, j).map(t => t.text.replace(/[,;]+$/, ''));
      to = Math.max(i, j - 1);
      i = to;
    } else continue;
    const f = group.length ? onlyFilterNamed(group.join(' '), index, caseStudies) : null;
    if (!f || placeOf(index, group.join(' '))) continue;
    const removed = new Set(tokens.map((_, n) => n).filter(n => n >= from && n <= to));
    out.push({ ...f, text: query.slice(tokens[from].start, tokens[to].end), rest: restWithout(tokens, removed) });
  }
  return out;
}

/**
 * The two sets a search gives, to count quickly what it finds among any filtered cases (the
 * filter panel counts every option): all = ids of the cases with all the words, any = ids of the
 * cases with some of them (for a sentence: alternatives of 2 or more words), places and exclusions
 * applied. Among the filtered cases P, searchCases(query, caseStudies, P) finds all ∩ P, or any ∩ P
 * when all ∩ P is empty (see resultsAmong).
 */
export function searchSets(query, caseStudies) {
  const index = createSearchIndex(caseStudies);
  index.setsCache = index.setsCache || new Map();
  if (index.setsCache.has(query)) return index.setsCache.get(query);
  const { alternatives, exclusions } = parseQuery(query, index);
  const all = new Set();
  const any = new Set();
  const alts = alternatives.length ? alternatives : [];
  const empty = !alts.some(a => a.terms.length || a.places.length);
  if (!(empty && !exclusions.length)) {
    if (empty) alts.push({ places: [], terms: [] }); // only exclusions: every other case
    for (const d of index.docs) {
      if (exclusions.some(ex => excludedBy(d, ex))) continue;
      for (const alt of alts) {
        if (alt.places.length && !inPlaces(d.study, alt.places)) continue;
        const found = alt.terms.filter(t => caseHas(d, t)).length;
        if (found === alt.terms.length) all.add(d.study.id);
        if (alt.terms.length >= 2 && found > 0) any.add(d.study.id);
      }
    }
  }
  const sets = { all, any };
  index.setsCache.set(query, sets);
  return sets;
}

// Ids found by these searches among the cases `within` (a Set), as searchCases with `within` does
export function resultsAmong(queries, caseStudies, within) {
  let ids = [...within];
  for (const q of queries) {
    const { all, any } = searchSets(q, caseStudies);
    const inAll = [...within].filter(id => all.has(id));
    const found = new Set(inAll.length ? inAll : [...within].filter(id => any.has(id)));
    ids = ids.filter(id => found.has(id));
  }
  return ids;
}

/**
 * @param within  ids of the cases to search among (the ones passing the filters), or null for all.
 *                With filters on, a sentence found only in part gives the cases that cover it best
 *                among the filtered ones, not among all the catalogue (where they could be cut).
 * @returns {{
 *   results: object[],           cases, most relevant first
 *   match: 'all'|'partial'|'none'|'empty',
 *                                all = every word found; partial = no case has all of them, these
 *                                have most; none = nothing found; empty = nothing to search
 *   notFound: string[],          words found in no case (other language, typo)
 *   didYouMean: string|null,     the query with those words replaced by the closest catalogue word
 *   places: string[], excluded: string[], alternatives: number,
 *   tagSuggestions: object[]     filters matching the words: count = results having them,
 *                                total = cases of the catalogue having them
 *   filterNames: object[]        filters written whole in the query ({categoryKey, value, text,
 *                                rest}: rest = the query without that name)
 *   filterOr: object|null        "single tree or row of trees": {categoryKey, values} to use in OR mode
 *   filterNot: object[]          "not parking area": {categoryKey, value, text, rest} to exclude as a filter
 * }}
 */
export function searchCases(query, caseStudies, within = null) {
  const index = createSearchIndex(caseStudies);
  const parsed = parseQuery(query, index);
  const { alternatives, exclusions } = parsed;
  const base = {
    results: [], match: 'empty', notFound: [], didYouMean: null, tagSuggestions: [], filterNames: [], filterOr: null, filterNot: [],
    places: alternatives.flatMap(a => a.places.map(p => p.value)),
    excluded: exclusions.flatMap(e => [...e.places.map(p => p.value), ...e.terms.map(t => t.join(' '))]),
    alternatives: alternatives.length,
  };
  if (!alternatives.some(a => a.terms.length || a.places.length)) {
    if (!exclusions.length) return base;
    alternatives.push({ places: [], terms: [] }); // only exclusions: every other case
  }

  const allTerms = alternatives.flatMap(a => a.terms);
  // filter names written whole: a size or TALEA type ("nodal", "medium") is not in the texts,
  // but it is not a missing word either
  const names = alternatives.length === 1 ? namesInQuery(query, index, caseStudies) : [];
  const nameWordSet = new Set(names.flatMap(n => words(n.text)));
  base.notFound = [...new Set(allTerms.filter(t => t.length === 1 && !index.df.has(t[0]) && !nameWordSet.has(t[0])).map(t => t[0]))];
  // "did you mean" only when every missing word has a close catalogue word (a typo), and the
  // corrected query finds cases: words of another language ("toits verts") get no suggestion
  if (base.notFound.length) {
    const fixes = new Map(base.notFound.map(w => [w, closestWord(index, w)]));
    if ([...fixes.values()].every(Boolean)) {
      const fixed = normalize(query).split(/\s+/)
        .map(w => { const s = words(w)[0]; return s && fixes.has(s) ? fixes.get(s) : w; }).join(' ');
      if (searchCases(fixed, caseStudies).match === 'all') base.didYouMean = fixed;
    }
  }

  const pool = index.docs.filter(d => (!within || within.has(d.study.id)) && !exclusions.some(ex => excludedBy(d, ex)));
  const scored = new Map(); // id → { study, score, found }
  for (const alt of alternatives) {
    for (const d of pool) {
      if (alt.places.length && !inPlaces(d.study, alt.places)) continue;
      const found = alt.terms.filter(t => caseHas(d, t));
      if (found.length < alt.terms.length) continue;
      const score = found.reduce((a, t) => a + termScore(index, d, t), 0) + nearBonus(d, alt.terms) + 0.001;
      const prev = scored.get(d.study.id);
      if (!prev || prev.score < score) scored.set(d.study.id, { study: d.study, score, found: found.length });
    }
  }

  let match = 'all';
  if (scored.size === 0) {
    // No case has all the words (often a sentence: "turn a parking lot into a park with trees"):
    // the cases covering the most important part of it. Rare words weigh more than common ones
    // ("parking" more than "park"); a case must cover at least 60% of what the best case covers
    // (tested on 12 sentences, Nov 2026). Places and exclusions still apply.
    // With filters on (within), the filters already choose the cases: the sentence only orders
    // them, every filtered case with some of its words is kept ("rain gardens" used as a filter
    // from a sentence shows all the Rain garden cases, the closest to the sentence first).
    const cut = within ? 0 : 0.6;
    for (const alt of alternatives) {
      if (alt.terms.length < 2) continue;
      const weights = alt.terms.map(t => termIdf(index, t));
      const totalWeight = weights.reduce((a, w) => a + w, 0);
      const rows = [];
      for (const d of pool) {
        if (alt.places.length && !inPlaces(d.study, alt.places)) continue;
        const has = alt.terms.map(t => caseHas(d, t));
        const coverage = has.reduce((a, h, i) => a + (h ? weights[i] : 0), 0) / totalWeight;
        if (coverage > 0) rows.push({ d, coverage, found: alt.terms.filter((_, i) => has[i]) });
      }
      const best = Math.max(0, ...rows.map(r => r.coverage));
      for (const { d, coverage, found } of rows) {
        if (coverage < best * cut) continue;
        const score = coverage * 100 + found.reduce((a, t) => a + termScore(index, d, t), 0) + nearBonus(d, alt.terms);
        const prev = scored.get(d.study.id);
        if (!prev || prev.score < score) scored.set(d.study.id, { study: d.study, score, found: found.length });
      }
    }
    match = scored.size ? 'partial' : 'none';
  }

  const results = [...scored.values()]
    .sort((a, b) => b.score - a.score || String(a.study.title).localeCompare(String(b.study.title)))
    .map(r => r.study);
  // every "rest" (the query without some words) must keep the places and exclusions of the query
  return {
    ...base, results, match,
    tagSuggestions: tagSuggestions(allTerms, results, caseStudies, query).map(s => ({ ...s, rest: keepsFrame(query, s.rest, index) })),
    // also for a sentence found only in part ("turn a parking area into … with rain gardens"):
    // the names written in it are what the person is looking for
    filterNames: names.map(n => ({ ...n, rest: keepsFrame(query, n.rest, index) })),
    filterOr: alternatives.length > 1 ? orOfFilters(query, index, caseStudies) : null,
    filterNot: (exclusions.length ? exclusionsOfFilters(query, index, caseStudies) : [])
      .map(n => ({ ...n, rest: keepsFrame(query, n.rest, index, 1) })).filter(n => n.rest !== null),
  };
}
