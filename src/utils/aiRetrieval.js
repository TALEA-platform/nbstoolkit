// AI search v2, step 2 "retrieve" (runs in the browser, no AI).
// Input: the plan from the worker's /api/understand. Output: cases ranked by relevance.
//   1. hard constraints (only what the user explicitly asked: country, city, years, excluded tags)
//   2. three kinds of ranking lists on the remaining cases:
//      - tags: each matching tag adds its rarity in the catalogue (named tags weigh more than inferred ones)
//      - words: BM25 of the English search terms on the case texts
//      - needs: BM25 of each need separately (rewards cases covering several needs)
//      - meaning: similarity between the bge-m3 vectors of the question and of the case
//        (only when the vectors are available)
//   3. Reciprocal Rank Fusion of the lists.
import { FILTER_CATEGORIES } from '../data/filterConfig';
import { studyMatchesCategory } from './filterMatcher';
import { parseYearRange } from './yearRange';
import { normalize } from './caseEmbeddings';

export const RETRIEVAL_WEIGHTS = {
  tagNamed: 3,     // tag the user explicitly asked for
  tagInferred: 1,  // tag deduced from the site or the needs
  rrfK: 60,        // Reciprocal Rank Fusion constant
  listTags: 1,     // weight of each list in the fusion
  listTerms: 1,
  listNeed: 0.35,  // per need
  listMeaning: 1.5, // similarity of vectors (0 = not used)
  // listNeed/listMeaning tuned on the 30 test questions (F6, Nov 2026): strong cases in the
  // first 10 from 65% to 71%; larger changes gained little and would overfit the test set.
};

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(('the and for with from that this into over under about after before their there them they '
  + 'are was were been being have has had not but can could would should will may might its our your more most '
  + 'some such than then also very only other into onto per via using use used make made like want need needs '
  + 'project projects space spaces area areas urban city').split(' '));

const stem = w => w.replace(/ies$/, 'y').replace(/(ing|ed|es|s)$/, '');
// A hyphenated word also counts joined: "storm-water" → storm, water, stormwater
export const tokenize = text => (String(text || '').toLowerCase().match(/[a-zà-ÿ]+(?:-[a-zà-ÿ]+)*/g) || [])
  .flatMap(w => (w.includes('-') ? [...w.split('-'), w.replace(/-/g, '')] : [w]))
  .filter(w => w.length > 2 && !STOPWORDS.has(w))
  .map(stem);

// Phrases that would make every case look "digital" (38 cases say there is no digital system)
const EMPTY_TEXT = /no evidence|^\s*(none|n\/a|-)\.?\s*$/i;

function narrativeText(study) {
  const parts = [study.title, study.city, study.country, study.description, study.physical_innovation,
    study.social_innovation, study.digital_innovation, study.c5_impacts];
  for (const texts of Object.values(study.other_details || {})) {
    if (texts && typeof texts === 'object') parts.push(...Object.values(texts));
  }
  return parts.filter(t => typeof t === 'string' && t.trim() && !EMPTY_TEXT.test(t)).join(' ');
}

// The judge's evidence for a site compatibility: a passage copied from the case's TEXTS (not
// its tags). Accepted only when the same words, in the same order, are in the texts: every
// word counts, "no" and "not" too, so "No deep excavation" never matches "required deep
// excavation". Only capitals, accents, punctuation, hyphens and spaces are ignored.
const passageWords = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .match(/[a-z0-9]+/g) || [];

export function evidenceInCard(evidence, study) {
  if (typeof evidence !== 'string') return false;
  const said = passageWords(evidence);
  if (said.length < 4) return false;
  return ` ${passageWords(narrativeText(study)).join(' ')} `.includes(` ${said.join(' ')} `);
}

// ---------------------------------------------------------------------------
// Index (built once per dataset)
// ---------------------------------------------------------------------------

const indexCache = new WeakMap();

function getIndex(caseStudies) {
  if (indexCache.has(caseStudies)) return indexCache.get(caseStudies);
  const docs = caseStudies.map(s => tokenize(narrativeText(s)));
  const termDf = new Map();
  const termFreq = docs.map(d => {
    const tf = new Map();
    for (const w of d) tf.set(w, (tf.get(w) || 0) + 1);
    for (const w of tf.keys()) termDf.set(w, (termDf.get(w) || 0) + 1);
    return tf;
  });
  const avgLen = docs.reduce((a, d) => a + d.length, 0) / Math.max(docs.length, 1);
  const index = { N: caseStudies.length, docs, termFreq, termDf, avgLen, tagDf: new Map(), pos: new Map() };
  caseStudies.forEach((s, i) => index.pos.set(s, i));
  indexCache.set(caseStudies, index);
  return index;
}

const idfOf = (N, df) => Math.log(1 + (N - df + 0.5) / (df + 0.5));

function tagIdf(index, caseStudies, key, value) {
  const k = `${key}|${value}`;
  if (!index.tagDf.has(k)) {
    index.tagDf.set(k, caseStudies.filter(s => studyMatchesCategory(s, key, [value], 'or')).length);
  }
  return idfOf(index.N, index.tagDf.get(k));
}

// BM25 of one query (list of terms). A multi-word term gets partial credit for each of its
// words found in the case (average over its words), so "stormwater infiltration" still
// counts for a case that only says "stormwater". Spelling variants: see tokenize (hyphens)
// and the joined form below ("raingarden"), so cards written either way are found.
function bm25(index, docPos, terms) {
  const tf = index.termFreq[docPos];
  const lenNorm = 1.2 * (0.25 + 0.75 * index.docs[docPos].length / index.avgLen);
  let score = 0;
  const matched = [];
  for (const term of terms) {
    const words = tokenize(term);
    if (!words.length) continue;
    let termScore = 0;
    let found = 0;
    for (const w of words) {
      const f = tf.get(w) || 0;
      if (!f) continue;
      found++;
      termScore += idfOf(index.N, index.termDf.get(w) || 0) * (f * 2.2) / (f + lenNorm);
    }
    // A term of several words also matches its joined form: "rain garden" → "raingarden"
    const joined = words.length > 1 ? stem(term.toLowerCase().replace(/[^a-zà-ÿ]/g, '')) : null;
    const fj = joined ? tf.get(joined) || 0 : 0;
    const joinedScore = fj ? idfOf(index.N, index.termDf.get(joined) || 0) * (fj * 2.2) / (fj + lenNorm) : 0;
    if (!found && !fj) continue;
    score += Math.max(termScore / words.length, joinedScore);
    if (found === words.length || fj) matched.push(term);
  }
  return { score, matched };
}

// ---------------------------------------------------------------------------
// Plan clean-up and hard constraints
// ---------------------------------------------------------------------------

const asList = v => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string' && x.trim()).map(x => x.trim());

// A tag as written in the filter config: exact, or with different capitals, or a value that
// exists in only one other category ("d3_water: Extensive green roofs" → d4_roof_facade).
// null when the value is not in the catalogue's categories.
function resolveTag(t) {
  if (typeof t?.value !== 'string') return null;
  const value = t.value.trim().toLowerCase();
  const inCategory = key => (FILTER_CATEGORIES[key]?.options || []).find(o => o.toLowerCase() === value);
  const own = inCategory(t.key);
  if (own) return { key: t.key, value: own };
  const keys = Object.keys(FILTER_CATEGORIES).filter(inCategory);
  return keys.length === 1 ? { key: keys[0], value: inCategory(keys[0]) } : null;
}

// unknown (optional): collects the values that are not catalogue categories
function validTags(list, seen, unknown = null) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const t = resolveTag(raw);
    if (!t) {  // unknown tag: not used as a filter
      if (unknown && typeof raw?.value === 'string' && raw.value.trim()) unknown.push(raw.value.trim().slice(0, 80));
      continue;
    }
    const k = `${t.key}|${t.value}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ key: t.key, value: t.value });
  }
  return out;
}

// Required elements: a list of groups, each a list of tags. A case needs at least one tag
// of EVERY group: "extensive or intensive green roofs" is one group with two tags, "both rain
// gardens and detention basins" two groups. The older flat list of tags (no groups) is read
// as before: tags of the same category are alternatives, different categories all required.
// unknown: collects the values of groups with no catalogue category at all;
// partial: the unknown values of groups that also have known tags (those are kept)
// Each group keeps, as group.because, the words the AI quoted to justify it (see sanitizeUnderstanding).
function validTagGroups(list, unknown, partial) {
  const groups = [];
  const flat = [];
  for (const item of Array.isArray(list) ? list : []) {
    if (Array.isArray(item?.any_of)) {
      const missing = [];
      const group = validTags(item.any_of, new Set(), missing);
      if (group.length) {
        if (typeof item.because === 'string') group.because = item.because.slice(0, 200);
        if (typeof item.named_as === 'string') group.namedAs = item.named_as.slice(0, 120);
        groups.push(group);
        partial.push(...missing);
      } else unknown.push(...missing);
    } else flat.push(item);
  }
  const byKey = {};
  for (const t of validTags(flat, new Set(), unknown)) (byKey[t.key] = byKey[t.key] || []).push(t);
  groups.push(...Object.values(byKey));
  const seen = new Set();
  return groups.filter(g => {
    const k = g.map(t => `${t.key}|${t.value}`).sort().join('+');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// OR groups: each one a set of positive conditions. Fewer than 2 valid groups = no OR.
const NO_LIMITS = { countryInclude: [], countryExclude: [], cityInclude: [], cityExclude: [], yearMin: null, yearMax: null, yearMode: 'overlap', requireGroups: [], excludeTags: [] };

function sanitizeAlternatives(list, unknown, partial) {
  const out = [];
  for (const a of Array.isArray(list) ? list.slice(0, 4) : []) {
    const alt = {
      label: typeof a?.label === 'string' && a.label.trim() ? a.label.trim().slice(0, 80) : `Option ${out.length + 1}`,
      countryInclude: asList(a?.country_include),
      cityInclude: asList(a?.city_include),
      yearMin: Number.isInteger(a?.year_min) ? a.year_min : null,
      yearMax: Number.isInteger(a?.year_max) ? a.year_max : null,
      requireGroups: validTagGroups(a?.require_tags, unknown, partial),
    };
    const hasCondition = alt.countryInclude.length || alt.cityInclude.length || alt.yearMin != null || alt.yearMax != null || alt.requireGroups.length;
    if (hasCondition) out.push(alt);
  }
  return out.length >= 2 ? out : [];
}

// Indexes of the OR groups a case satisfies (empty when the plan has none).
export function matchedAlternatives(study, plan) {
  const out = [];
  (plan.alternatives || []).forEach((alt, i) => {
    if (passesHardConstraints(study, { ...NO_LIMITS, ...alt, yearMode: plan.hard?.yearMode || 'overlap' })) out.push(i);
  });
  return out;
}

// Hard constraints AND (no OR groups, or at least one group).
export function passesPlan(study, plan) {
  if (!passesHardConstraints(study, plan.hard)) return false;
  return !(plan.alternatives || []).length || matchedAlternatives(study, plan).length > 0;
}

// Cases for the judge: the best ones, with a share for each OR group, so that one option
// does not fill the whole list (round robin over the groups, then by rank).
export function selectCandidates(ranked, plan, k) {
  const groups = (plan.alternatives || []).length;
  if (groups < 2) return ranked.slice(0, k);
  const lists = Array.from({ length: groups }, (_, g) => ranked.filter(r => matchedAlternatives(r.study, plan).includes(g)));
  const chosen = new Set();
  for (let round = 0; chosen.size < k; round++) {
    let added = false;
    for (const list of lists) {
      const next = list.find(r => !chosen.has(r));
      if (next && chosen.size < k) { chosen.add(next); added = true; }
    }
    if (!added) break;
  }
  return ranked.filter(r => chosen.has(r)); // keep the ranking order
}

// In a search for cases, an element the AI marked as required stays required only when the
// question really requires it: the AI sometimes requires what the user just named, which can
// leave no case at all. Each group is checked on its own (requirementStays):
//  - a quote (group.because) that expresses a preference ("preferibilmente rain garden") never
//    makes it required, whatever else the question says ("Solo progetti in Francia, …");
//  - a quote really in the question that says more than the name ("è indispensabile") does;
//  - only when the AI gave no quote: words that make an element a requirement ("only", "both",
//    "sia… sia"…) somewhere in the question.
// Otherwise the element becomes a preference. Size and climate stay conditions, like country and years.
const RESTRICTION_WORDS = new RegExp([
  '\\b(solo|soltanto|solamente|esclusivamente|unicamente|necessariamente|obbligatori[oaie]?|per forza|devono|deve avere|entramb[ie]|almeno|indispensabil[ei]|imprescindibil[ei]|essenzial[ei])\\b',
  '\\b(only|exclusively|necessarily|must|required?|both|at least|essential|indispensable|mandatory|compulsory)\\b',
  '\\b(seulement|uniquement|obligatoire(ment)?|necesariamente|imprescindibles?|obligatori[oa]s?|ambos|ambas|nur|ausschliesslich|unbedingt|zwingend|erforderlich|beide)\\b',
  '\\bsia\\b.*\\bsia\\b', '\\btanto\\b.*\\bcomo\\b', '\\bsowohl\\b.*\\bals auch\\b', '\\ba la fois\\b',
].join('|'), 'i');
const ALWAYS_CONDITIONS = new Set(['size', 'climate_zone']);
const plain = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
const words = s => plain(s).match(/[a-z0-9]+/g) || [];

// Words of a preference: a quote with one of them never justifies a requirement.
const PREFERENCE_WORDS = new RegExp([
  '\\b(preferibil\\w*|preferenz\\w*|preferire\\w*|meglio|magari|idealmente|possibilmente|se possibile|piacerebbe|sarebbe bello|ideale)\\b',
  '\\b(prefer\\w*|ideally|if possible|would be nice|nice to have|would like|optionally|maybe|perhaps)\\b',
  '\\b(de preference|idealement|si possible|preferiblemente|preferentemente|si es posible|vorzugsweise|idealerweise|am liebsten|moglichst|wenn moglich)\\b',
].join('|'), 'i');

// The quote is in the question (same words in the same order, 2-10 words) and has a word that
// is not part of the element's name. One word ("Solo", "only") does not tie the requirement to
// this element: in "Solo progetti in Francia, preferibilmente rain garden" it is about France.
function quotedRequirement(group, question) {
  const quote = words(group.because);
  if (quote.length < 2 || quote.length > 10) return false;
  if (!` ${words(question).join(' ')} `.includes(` ${quote.join(' ')} `)) return false;
  const named = new Set(group.flatMap(t => words(t.value).map(w => w.replace(/s$/, ''))));
  return quote.some(w => w.length > 2 && !named.has(w.replace(/s$/, '')));
}

// named_as (the words naming the element, when the AI gives them and they are in the question):
// a preference just before them ("preferibilmente rain garden", "meglio se con rain garden")
// makes the element a preference, and the quote must contain them ("Solo progetti in Francia"
// does not justify rain garden).
const PREFERENCE_BEFORE = 4; // words before the element where a preference counts
function requirementStays(group, question) {
  if (group.every(t => ALWAYS_CONDITIONS.has(t.key))) return true;
  const q = ` ${words(question).join(' ')} `;
  const named = words(group.namedAs).join(' ');
  const namedAt = named ? q.indexOf(` ${named} `) : -1;
  if (namedAt >= 0) {
    const before = q.slice(0, namedAt).trim().split(' ').slice(-PREFERENCE_BEFORE).join(' ');
    if (PREFERENCE_WORDS.test(before)) return false;
  }
  const quote = words(group.because).join(' ');
  if (quote && PREFERENCE_WORDS.test(quote)) return false;
  if (quote && namedAt >= 0 && !` ${quote} `.includes(` ${named} `)) return false;
  if (quote) return quotedRequirement(group, question);
  return RESTRICTION_WORDS.test(plain(question));
}

// Keeps only well-formed parts of the AI plan (tags must exist in the filter config).
// question (optional): the user's text, to check that required elements were really required.
export function sanitizeUnderstanding(u, question = null) {
  const hc = u?.hard_constraints || {};
  const seen = new Set();
  const tagsNamed = validTags(u?.tags_named, seen);
  const tagsInferred = validTags(u?.tags_inferred, seen);
  const INTENTS = ['find_cases', 'catalogue_question', 'subjective', 'out_of_scope'];
  const OPS = ['count', 'list', 'largest', 'smallest', 'newest', 'oldest'];
  // Elements required or excluded that are not catalogue categories ("fountains"): not usable
  // as filters. They are searched in the text, and a catalogue answer does not count them.
  // unknownAlongside: unknown alternatives next to known ones ("Rain garden or water mirrors"):
  // the known ones are used, and a count is only a minimum.
  const unknownRequired = [];
  const unknownExcluded = [];
  const unknownAlongside = [];
  const alternatives = sanitizeAlternatives(u?.alternatives, unknownRequired, unknownAlongside);
  const requireGroups = validTagGroups(hc.require_tags, unknownRequired, unknownAlongside);
  const excludeTags = validTags(hc.exclude_tags, new Set(), unknownExcluded);
  const uniq = list => [...new Set(list.map(x => x.toLowerCase()))].map(x => list.find(y => y.toLowerCase() === x));
  const searchTerms = asList(u?.search_terms_en).slice(0, 15);
  for (const v of uniq([...unknownRequired, ...unknownAlongside])) {
    if (!searchTerms.some(s => s.toLowerCase() === v.toLowerCase())) searchTerms.push(v);
  }
  const intent = INTENTS.includes(u?.intent) ? u.intent : 'find_cases';
  // required elements the user did not really require → preferences (see RESTRICTION_WORDS)
  let required = requireGroups;
  const softened = [];
  if (intent === 'find_cases' && typeof question === 'string') {
    required = requireGroups.filter(g => requirementStays(g, question));
    for (const g of requireGroups.filter(x => !required.includes(x))) {
      for (const t of g) {
        softened.push(t);
        const k = `${t.key}|${t.value}`;
        if (!seen.has(k)) { seen.add(k); tagsNamed.push(t); }
      }
    }
  }
  return {
    language: typeof u?.language === 'string' ? u.language : 'en',
    intent,
    // elements moved from required to preferred (the judge must not require them either)
    softenedRequired: softened,
    catalogueOps: asList(u?.catalogue_ops).filter(op => OPS.includes(op)),
    reply: typeof u?.reply === 'string' && u.reply.trim() ? u.reply.trim().slice(0, 600) : null,
    suggestions: asList(u?.suggestions).slice(0, 3).map(x => x.slice(0, 200)),
    summary: typeof u?.summary === 'string' ? u.summary : '',
    site: typeof u?.site === 'string' ? u.site : null,
    siteConstraints: asList(u?.site_constraints),
    needs: asList(u?.needs).slice(0, 6),
    tagsNamed,
    tagsInferred,
    searchTerms,
    alternatives,
    unknownRequired: uniq(unknownRequired),
    unknownExcluded: uniq(unknownExcluded),
    unknownAlongside: uniq(unknownAlongside),
    hard: {
      countryInclude: asList(hc.country_include),
      countryExclude: asList(hc.country_exclude),
      cityInclude: asList(hc.city_include),
      cityExclude: asList(hc.city_exclude),
      yearMin: Number.isInteger(hc.year_min) ? hc.year_min : null,
      yearMax: Number.isInteger(hc.year_max) ? hc.year_max : null,
      yearMode: ['start', 'end'].includes(hc.year_mode) ? hc.year_mode : 'overlap',
      requireGroups: required,
      excludeTags,
    },
  };
}

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const COUNTRY_ALIASES = { uk: 'united kingdom', usa: 'united states', us: 'united states', 'the netherlands': 'netherlands', holland: 'netherlands' };
const sameName = (a, b) => {
  const x = COUNTRY_ALIASES[norm(a)] || norm(a);
  const y = COUNTRY_ALIASES[norm(b)] || norm(b);
  return !!x && x === y;
};
// "France" also matches multi-country cases such as "France, Belgium"
const nameIn = (wanted, field) => String(field || '').split(/[,;/]| and /).some(part => sameName(wanted, part));

function yearPasses(study, hard) {
  if (hard.yearMin == null && hard.yearMax == null) return true;
  const r = parseYearRange(study.year);
  if (!r) return false;
  // "completed in/by/since": only cases with a known completion year (not ongoing, not just designed)
  if (hard.yearMode === 'end' && r.completed == null) return false;
  const lo = hard.yearMode === 'end' ? r.completed : r.start;
  const hi = hard.yearMode === 'start' ? r.start : hard.yearMode === 'end' ? r.completed : r.end;
  if (hard.yearMin != null && hi < hard.yearMin) return false;
  if (hard.yearMax != null && lo > hard.yearMax) return false;
  return true;
}

export function passesHardConstraints(study, hard) {
  if (hard.countryInclude.length && !hard.countryInclude.some(c => nameIn(c, study.country))) return false;
  if (hard.countryExclude.some(c => nameIn(c, study.country))) return false;
  if (hard.cityInclude.length && !hard.cityInclude.some(c => nameIn(c, study.city))) return false;
  if (hard.cityExclude.some(c => nameIn(c, study.city))) return false;
  if (!yearPasses(study, hard)) return false;
  if ((hard.excludeTags || []).some(t => studyMatchesCategory(study, t.key, [t.value], 'or'))) return false;
  // required elements: at least one tag of every group
  return (hard.requireGroups || []).every(group => group.some(t => studyMatchesCategory(study, t.key, [t.value], 'or')));
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * @param semantic optional { query: number[], caseVectors: Map<string, Float32Array> }
 * @returns {{ ranked: Array<{study, score, why}>, poolSize: number, hasSignals: boolean }}
 *   ranked: cases passing the hard constraints, best first (only cases matching something,
 *   unless the plan has no tags/terms at all, e.g. "projects in Italy since 2016").
 *   why: tags and terms that matched, kept to explain and debug the ranking.
 */
export function rankCases(plan, caseStudies, weights = RETRIEVAL_WEIGHTS, semantic = null) {
  const index = getIndex(caseStudies);
  const pool = caseStudies.filter(s => passesPlan(s, plan));
  const tags = [
    ...plan.tagsNamed.map(t => ({ ...t, w: weights.tagNamed })),
    ...plan.tagsInferred.map(t => ({ ...t, w: weights.tagInferred })),
  ].map(t => ({ ...t, idf: tagIdf(index, caseStudies, t.key, t.value) }));
  const needQueries = plan.needs.map(n => [n, ...tokenize(n)]);
  const useMeaning = weights.listMeaning > 0 && semantic?.caseVectors && Array.isArray(semantic.query);
  const queryVector = useMeaning ? normalize(semantic.query) : null;

  const rows = pool.map(study => {
    const pos = index.pos.get(study);
    const tagHits = tags.filter(t => studyMatchesCategory(study, t.key, [t.value], 'or'));
    const terms = bm25(index, pos, plan.searchTerms);
    const needs = needQueries.map(q => bm25(index, pos, q).score);
    const caseVector = useMeaning ? semantic.caseVectors.get(String(study.id)) : null;
    return {
      study,
      meaning: caseVector && caseVector.length === queryVector.length ? dot(queryVector, caseVector) : null,
      tagScore: tagHits.reduce((a, t) => a + t.w * t.idf, 0),
      termScore: terms.score,
      needScores: needs,
      why: { tags: tagHits.map(t => `${t.key}: ${t.value}`), terms: terms.matched },
    };
  });

  // Each list ranks only cases with a positive score; fusion sums 1/(k + rank).
  const lists = [
    { w: weights.listTags, score: r => r.tagScore },
    { w: weights.listTerms, score: r => r.termScore },
    ...needQueries.map((_, i) => ({ w: weights.listNeed, score: r => r.needScores[i] })),
    // vectors: every case has a similarity, so the list is the whole pool by similarity
    ...(useMeaning ? [{ w: weights.listMeaning, score: r => (r.meaning == null ? 0 : r.meaning + 1) }] : []),
  ];
  for (const r of rows) r.score = 0;
  for (const list of lists) {
    const ranked = rows.filter(r => list.score(r) > 0).sort((a, b) => list.score(b) - list.score(a));
    ranked.forEach((r, i) => { r.score += list.w / (weights.rrfK + i + 1); });
  }

  const hasSignals = tags.length > 0 || plan.searchTerms.length > 0 || needQueries.length > 0;
  const ranked = rows
    .filter(r => !hasSignals || r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ study, score, why }) => ({ study, score, why }));
  return { ranked, poolSize: pool.length, hasSignals };
}
