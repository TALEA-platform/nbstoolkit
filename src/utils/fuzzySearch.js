import { FILTER_CATEGORIES } from '../data/filterConfig';
import { hasTaleaType } from './getTaleaTypes';

function countOptionMatches(studies, cat, opt) {
  let count = 0;

  for (const study of studies) {
    if (cat.type === 'object') {
      if (hasTaleaType(study, opt)) count++;
    } else if (cat.type === 'value') {
      if (study[cat.dataKey] === opt) count++;
    } else if (cat.type === 'array') {
      if ((study[cat.dataKey] || []).includes(opt)) count++;
    } else if (cat.type === 'innovation') {
      const innovMap = { Physical: 'has_physical_innovation', Social: 'has_social_innovation', Digital: 'has_digital_innovation' };
      if (innovMap[opt] && !!study[innovMap[opt]]) count++;
    }
  }

  return count;
}

// Suggest filters that can meaningfully narrow the current result set.
// A value added to a category in OR mode that already has values would widen the results
// (it is not counted among them), so those categories are left out.
export function findCommonFilters(studies, activeFilters, filterModes = {}) {
  if (studies.length < 3) return [];

  const buildSuggestions = (minRatio, maxRatio) => {
    const suggestions = [];

    for (const [catKey, cat] of Object.entries(FILTER_CATEGORIES)) {
      const activeVals = activeFilters[catKey] || [];
      if (activeVals.length > 0 && filterModes[catKey] === 'or') continue;
      for (const opt of cat.options) {
        if (activeVals.includes(opt)) continue;

        const count = countOptionMatches(studies, cat, opt);
        if (count < 2 || count >= studies.length) continue;

        const ratio = count / studies.length;
        if (ratio < minRatio || ratio > maxRatio) continue;

        suggestions.push({
          categoryKey: catKey,
          value: opt,
          icon: cat.icon,
          color: cat.color,
          category: cat.label,
          frequency: Math.round(ratio * 100),
          resultCount: count,
          reductionCount: studies.length - count,
          refinementScore: ratio * (1 - ratio),
        });
      }
    }

    return suggestions;
  };

  const preferredSuggestions = buildSuggestions(0.2, 0.85);
  const fallbackSuggestions = preferredSuggestions.length > 0 ? preferredSuggestions : buildSuggestions(0.12, 0.95);

  return fallbackSuggestions
    .sort((a, b) => {
      if (b.refinementScore !== a.refinementScore) return b.refinementScore - a.refinementScore;
      if (b.reductionCount !== a.reductionCount) return b.reductionCount - a.reductionCount;
      return b.frequency - a.frequency;
    })
    .slice(0, 6);
}

// ─── Replies of the (manual) assistant to a search ─────────────
// Short and factual: how many cases match, with which filters. No praise, no topic tips.
const GREETINGS = ['hello', 'hi', 'hey', 'help', 'start', 'ciao', 'hola'];
// A greeting gets a reply in the chat, it is not a search
export const isGreeting = query => GREETINGS.includes(String(query || '').toLowerCase().trim());

export const WELCOME_MESSAGE = 'Search the case studies by words in English, a city or a country, e.g. "rain garden", '
  + '"green roofs not in Spain", "Paris or Lyon". Type / for commands. To describe your site in any language, use the AI Assistant.';

function describeFilters(activeFilters) {
  return Object.entries(activeFilters || {})
    .filter(([, values]) => values.length > 0)
    .map(([catKey, values]) => `${FILTER_CATEGORIES[catKey]?.label || catKey}: ${values.join(', ')}`)
    .join('; ');
}

// textFilters: all the searches applied together (the results answer all of them)
export function generateChatResponse(query, results, filterSuggestions, activeFilters, textFilters = []) {
  if (isGreeting(query)) {
    return {
      type: 'greeting',
      message: 'Type what you are looking for, e.g. "rain garden" or "parking", a city or a country, or / for commands.',
    };
  }

  const searched = (textFilters.length > 1 ? textFilters : [query]).map(t => `"${t}"`).join(' + ');
  const filters = describeFilters(activeFilters);
  const withFilters = filters ? ` with your filters (${filters})` : '';

  if (results.length === 0) {
    return {
      type: 'noResults',
      message: `No case matches ${searched}${withFilters}. Try fewer or different words${filters ? ', or remove some filters' : ''}.`,
    };
  }

  if (results.length <= 3) {
    const names = results.map(s => `${s.title} (${s.city})`).join('; ');
    return {
      type: 'fewResults',
      message: `${results.length} case${results.length > 1 ? 's match' : ' matches'} ${searched}${withFilters}: ${names}.`,
      resultCount: results.length,
    };
  }

  return {
    type: 'manyResults',
    message: `${results.length} cases match ${searched}${withFilters}.`,
    resultCount: results.length,
  };
}
