// Answers to questions about the catalogue itself ("how many projects in France?",
// "the largest and the smallest?"), computed here from the data: the AI only says which
// operation is asked and which conditions apply, it never counts.
// Texts in the language of the question (Italian or English; other languages: English).
// Country, city and tag names stay as written in the catalogue (English).

import { passesPlan } from './aiRetrieval';
import { parseYearRange } from './yearRange';

const LIST_MAX = 20;

const TEXTS = {
  en: {
    projects: 'projects', project: 'project', in: 'in', notIn: 'not in', or: ' or ', and: ' and ', since: 'since', until: 'until',
    with: 'with', without: 'without',
    none: scope => `The catalogue has **no** ${scope}.`,
    count: (n, scope, total, atLeast) => `The catalogue has **${atLeast ? 'at least ' : ''}${n}** ${scope} (out of ${total}).`,
    more: n => `…and ${n} more: see them all in the grid.`,
    sizeNote: 'The catalogue has no uniform numeric field for the area: size is classified as Small / Medium / Large (some descriptions give the area in the text).',
    sized: (n, scope, word) => `**${n}** ${scope} are classified as ${word}:`,
    noneSized: (scope, word) => `None of the ${scope} is classified as ${word}.`,
    large: 'large', small: 'small',
    dated: (word, scope) => `The ${word} ${scope}:`,
    newest: 'most recently completed', oldest: 'oldest',
    unfinished: 'Still ongoing, or completion year not stated (latest start first):',
    noYear: scope => `No year is recorded for these ${scope}.`,
    unknown: (list, n) => `${list} ${n > 1 ? 'are not' : 'is not one of'} the catalogue's categories, so the projects that have ${n > 1 ? 'them' : 'it'} cannot be counted from the data. You can look for the cases whose description mentions ${n > 1 ? 'them' : 'it'}:`,
    searchFor: v => `Find projects that mention "${v}"`,
    alongside: (list, n) => `${list} ${n > 1 ? 'are not' : 'is not one of'} the catalogue's categories: only the other elements were used, so projects that have just ${n > 1 ? 'those' : 'that'} are not counted. You can look for the cases whose description mentions ${n > 1 ? 'them' : 'it'}:`,
  },
  it: {
    projects: 'progetti', project: 'progetto', in: 'in', notIn: 'non in', or: ' o ', and: ' e ', since: 'dal', until: 'fino al',
    with: 'con', without: 'senza',
    none: scope => `Il catalogo **non ha** ${scope}.`,
    count: (n, scope, total, atLeast) => `Il catalogo ha **${atLeast ? 'almeno ' : ''}${n}** ${scope} (su ${total}).`,
    more: n => `…e altri ${n}: li trovi tutti nella griglia.`,
    sizeNote: 'Il catalogo non ha un campo numerico uniforme per la superficie: la dimensione è classificata come Small / Medium / Large (alcune descrizioni riportano l\'area nel testo).',
    sized: (n, scope, word) => `**${n}** ${scope} sono classificati come ${word}:`,
    noneSized: (scope, word) => `Nessuno dei ${scope} è classificato come ${word}.`,
    large: 'grandi (Large)', small: 'piccoli (Small)',
    dated: (word, scope) => `I ${scope} ${word}:`,
    newest: 'completati più di recente', oldest: 'più vecchi',
    unfinished: 'Ancora in corso, o senza anno di completamento (dal più recente come inizio):',
    noYear: scope => `Per questi ${scope} non è indicato l'anno.`,
    unknown: (list, n) => `${list} non ${n > 1 ? 'sono tra' : 'è tra'} le categorie del catalogo: non posso contare dai dati i progetti che ${n > 1 ? 'li' : 'lo'} hanno. Puoi cercare i casi che ${n > 1 ? 'li' : 'lo'} citano nella descrizione:`,
    searchFor: v => `Trova progetti che citano "${v}"`,
    alongside: (list, n) => `${list} non ${n > 1 ? 'sono tra' : 'è tra'} le categorie del catalogo: ho usato solo gli altri elementi, quindi i progetti che hanno soltanto ${n > 1 ? 'quelli' : 'quello'} non sono contati. Puoi cercare i casi che ${n > 1 ? 'li' : 'lo'} citano nella descrizione:`,
  },
};

const langOf = language => (TEXTS[String(language || '').slice(0, 2).toLowerCase()] ? String(language).slice(0, 2).toLowerCase() : 'en');

// Country names in the language of the answer ("France" → "Francia"), from the browser's own
// country list; unknown names stay as written.
const countryNames = {};
function countryName(name, lang) {
  if (lang === 'en' || typeof Intl === 'undefined' || !Intl.DisplayNames) return name;
  if (!countryNames[lang]) {
    countryNames[lang] = {};
    try {
      const en = new Intl.DisplayNames(['en'], { type: 'region' });
      const local = new Intl.DisplayNames([lang], { type: 'region' });
      for (let a = 65; a <= 90; a++) {
        for (let b = 65; b <= 90; b++) {
          const code = String.fromCharCode(a, b);
          const e = en.of(code);
          if (e && e !== code) countryNames[lang][e.toLowerCase()] = local.of(code);
        }
      }
    } catch { /* no translations: names stay in English */ }
  }
  return countryNames[lang][String(name).toLowerCase()] || name;
}

// Short description of the conditions, e.g. "projects in France, since 2016, with Rain garden"
export function describeConditions(plan, lang = 'en', n = 2) {
  const t = TEXTS[lang];
  const h = plan.hard;
  // "Spain, United Kingdom or Netherlands"
  const join = list => (list.length > 1 ? `${list.slice(0, -1).join(', ')}${t.or}${list[list.length - 1]}` : list.join(''));
  const country = list => join(list.map(c => countryName(c, lang)));
  const parts = [];
  if (h.countryInclude.length) parts.push(`${t.in} ${country(h.countryInclude)}`);
  if (h.cityInclude.length) parts.push(`${t.in} ${join(h.cityInclude)}`);
  if (h.countryExclude.length) parts.push(`${t.notIn} ${country(h.countryExclude)}`);
  if (h.cityExclude.length) parts.push(`${t.notIn} ${join(h.cityExclude)}`);
  if (h.yearMin != null && h.yearMax != null) parts.push(`${h.yearMin}–${h.yearMax}`);
  else if (h.yearMin != null) parts.push(`${t.since} ${h.yearMin}`);
  else if (h.yearMax != null) parts.push(`${t.until} ${h.yearMax}`);
  // "with Rain garden and Detention basins", "with Extensive green roofs or Intensive green roofs"
  if (h.requireGroups.length) parts.push(`${t.with} ${h.requireGroups.map(g => join(g.map(x => x.value))).join(t.and)}`);
  if (h.excludeTags.length) parts.push(`${t.without} ${h.excludeTags.map(x => x.value).join(', ')}`);
  if ((plan.alternatives || []).length) parts.push(`(${plan.alternatives.map(a => a.label).join(t.or)})`);
  return [n === 1 ? t.project : t.projects, parts.join(', ')].filter(Boolean).join(' ');
}

const line = s => `- **${s.title}** (${s.city}, ${s.country}${s.year ? `, ${s.year}` : ''})`;

/**
 * @returns {{ text: string, studies: object[], keepGrid?: boolean, suggestions?: string[] }}
 *   text in markdown; studies to show in the grid (keepGrid: leave the grid unchanged);
 *   suggestions: questions shown as buttons
 */
export function answerCatalogueQuestion(plan, caseStudies, ops) {
  const lang = langOf(plan.language);
  const t = TEXTS[lang];
  // An element that is not a catalogue category ("fountains") cannot be counted: counting
  // without it would give a wrong number. The grid is left as it is.
  const unknown = [...(plan.unknownRequired || []), ...(plan.unknownExcluded || [])];
  if (unknown.length) {
    return {
      text: t.unknown(unknown.map(v => `**${v}**`).join(', '), unknown.length),
      studies: [],
      keepGrid: true,
      suggestions: unknown.slice(0, 3).map(t.searchFor),
    };
  }
  const pool = caseStudies.filter(s => passesPlan(s, plan));
  const scope = describeConditions(plan, lang);
  const asked = new Set(Array.isArray(ops) && ops.length ? ops : ['count']);
  const blocks = [];
  const highlighted = []; // cases named by largest/smallest/newest/oldest, shown first

  // unknown alternatives next to known ones ("Rain garden or water mirrors"): a minimum
  const alongside = plan.unknownAlongside || [];
  const alongsideNote = () => t.alongside(alongside.map(v => `**${v}**`).join(', '), alongside.length);

  if (pool.length === 0) {
    return {
      text: [t.none(scope), alongside.length ? alongsideNote() : ''].filter(Boolean).join('\n\n'),
      studies: [],
      suggestions: alongside.slice(0, 3).map(t.searchFor),
    };
  }
  if (asked.has('count') || asked.has('list')) blocks.push(t.count(pool.length, describeConditions(plan, lang, pool.length), caseStudies.length, alongside.length > 0));
  if (asked.has('list')) {
    blocks.push(pool.slice(0, LIST_MAX).map(line).join('\n') +
      (pool.length > LIST_MAX ? `\n\n${t.more(pool.length - LIST_MAX)}` : ''));
  }
  const sizeOps = [['largest', 'Large', t.large], ['smallest', 'Small', t.small]].filter(([op]) => asked.has(op));
  if (sizeOps.length) blocks.push(t.sizeNote);
  for (const [, size, word] of sizeOps) {
    const found = pool.filter(s => s.size === size);
    blocks.push(found.length
      ? `${t.sized(found.length, scope, word)}\n${found.slice(0, 10).map(line).join('\n')}` +
        (found.length > 10 ? `\n\n${t.more(found.length - 10)}` : '')
      : t.noneSized(scope, word));
    highlighted.push(...found);
  }
  const years = new Map(pool.map(s => [s, parseYearRange(s.year)]));
  if (asked.has('newest')) {
    // by completion year: an ongoing project ("2000–ongoing") is not "recent", it is listed apart
    const done = pool.filter(s => years.get(s)?.completed != null)
      .sort((a, b) => years.get(b).completed - years.get(a).completed || years.get(b).start - years.get(a).start)
      .slice(0, 5);
    const open = pool.filter(s => years.get(s) && years.get(s).completed == null)
      .sort((a, b) => years.get(b).start - years.get(a).start)
      .slice(0, 3);
    if (!done.length && !open.length) blocks.push(t.noYear(scope));
    if (done.length) blocks.push(`${t.dated(t.newest, scope)}\n${done.map(line).join('\n')}`);
    if (open.length) blocks.push(`${t.unfinished}\n${open.map(line).join('\n')}`);
    highlighted.push(...done, ...open);
  }
  if (asked.has('oldest')) {
    const dated = pool.filter(s => years.get(s)).sort((a, b) => years.get(a).start - years.get(b).start).slice(0, 5);
    blocks.push(dated.length ? `${t.dated(t.oldest, scope)}\n${dated.map(line).join('\n')}` : t.noYear(scope));
    highlighted.push(...dated);
  }
  if (alongside.length) blocks.push(alongsideNote());
  // Grid: the named cases first; when the whole list or the count was asked, all the others after.
  const first = [...new Set(highlighted)];
  const wantsAll = asked.has('list') || asked.has('count') || !first.length;
  return {
    text: blocks.join('\n\n'),
    studies: wantsAll ? [...first, ...pool.filter(s => !first.includes(s))] : first,
    suggestions: alongside.slice(0, 3).map(t.searchFor),
  };
}
