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
export function findCommonFilters(studies, activeFilters) {
  if (studies.length < 3) return [];

  const buildSuggestions = (minRatio, maxRatio) => {
    const suggestions = [];

    for (const [catKey, cat] of Object.entries(FILTER_CATEGORIES)) {
      const activeVals = activeFilters[catKey] || [];
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

// ─── Chatbot response generator ───────────────────────────────
const CHATBOT_RESPONSES = {
  greetings: [
    "Hello! I'm your NBS Toolkit assistant. I can help you find Nature-Based Hardware Solutions for urban challenges. What are you looking for?",
    "Welcome to the NBS Toolkit! Tell me what kind of urban hardware solution you need, and I'll find the best case studies for you.",
    "Hi there! I can help you discover Nature-Based Solutions from real case studies across the world. What's your project about?",
  ],
  noResults: [
    "I couldn't find exact matches, but let me suggest some related solutions. Try broader terms like 'green roof', 'water management', or a city name.",
    "No direct matches found. You might want to try searching for specific NBS types like 'rain garden', 'tree', or 'permeable paving'.",
    "Hmm, I don't have results for that. Try exploring by climate zone, size, or specific Nature-Based Solutions categories.",
  ],
  fewResults: (count, query) => [
    `I found ${count} solution${count > 1 ? 's' : ''} related to "${query}". Let me show you what matches best!`,
    `Great news! ${count} case stud${count > 1 ? 'ies match' : 'y matches'} your search for "${query}". Here's what I found:`,
  ],
  manyResults: (count, query) => [
    `Excellent! ${count} solutions match "${query}". That's a lot of inspiration! You can narrow down using the filter canvas on the left.`,
    `I found ${count} matching case studies for "${query}". Use the filters to refine your search, or click any card to learn more.`,
  ],
  filterSuggestion: (filters) => {
    const names = filters.map(f => f.value).join(', ');
    return [
      `These filters could narrow the current results: ${names}. Try one of them below to refine the list.`,
      `To make this search more specific, try these filters: ${names}. They should reduce the current result set.`,
    ];
  },
  topics: {
    water: "For water management solutions, I'd recommend exploring D3 Water category filters: rain gardens, bioretention areas, permeable paving, and floodable parks are popular choices.",
    green: "Green solutions span many categories! Check D1 Plants for trees and hedges, D4 for green roofs and walls, D6 for urban gardens and parks.",
    climate: "Climate adaptation is a key goal. Many of our case studies address urban heat islands, flooding, and air quality. Try filtering by climate zone or C3 Goals.",
    social: "Social innovation is present in many solutions. Look for case studies with community gardens, co-design processes, and civic participation.",
    urban: "Urban regeneration projects are common in our database. Filter by Urban Scale, or look for goals like 'Urban regeneration' or 'Transformation'.",
  },
};

export function generateChatResponse(query, results, filterSuggestions, activeFilters) {
  const q = query.toLowerCase().trim();

  // Greetings
  if (['hello', 'hi', 'hey', 'help', 'start', 'ciao', 'hola'].some(g => q === g || q.startsWith(g + ' '))) {
    return {
      type: 'greeting',
      message: CHATBOT_RESPONSES.greetings[Math.floor(Math.random() * CHATBOT_RESPONSES.greetings.length)],
    };
  }

  // Describe active filters context
  let filterContext = '';
  if (activeFilters && Object.keys(activeFilters).length > 0) {
    const parts = [];
    for (const [catKey, values] of Object.entries(activeFilters)) {
      if (values.length > 0) {
        const cat = FILTER_CATEGORIES[catKey];
        parts.push(`${cat?.label || catKey}: ${values.join(', ')}`);
      }
    }
    if (parts.length > 0) {
      filterContext = ` (with filters: ${parts.join('; ')})`;
    }
  }

  // Topic-specific responses
  for (const [topic, response] of Object.entries(CHATBOT_RESPONSES.topics)) {
    if (q.includes(topic)) {
      return {
        type: 'topic',
        message: response + (filterContext ? `\n\nCurrently filtering${filterContext}.` : ''),
        resultCount: results.length,
      };
    }
  }

  // Result-based responses
  if (results.length === 0) {
    let msg = CHATBOT_RESPONSES.noResults[Math.floor(Math.random() * CHATBOT_RESPONSES.noResults.length)];
    if (filterContext) {
      msg += ` You currently have active filters${filterContext} — try removing some to broaden your search.`;
    }
    return { type: 'noResults', message: msg };
  }

  // 1 result: mention specific details
  if (results.length === 1) {
    const s = results[0];
    const desc = s.description ? s.description.slice(0, 100) + '...' : '';
    return {
      type: 'fewResults',
      message: `I found exactly 1 match: "${s.title}" in ${s.city}, ${s.country}. ${desc}${filterContext ? `\n\nActive filters${filterContext}.` : ''}`,
      resultCount: 1,
    };
  }

  // 2-3 results: list names and cities
  if (results.length <= 3) {
    const names = results.map(s => `"${s.title}" (${s.city})`).join(', ');
    return {
      type: 'fewResults',
      message: `I found ${results.length} matching solutions: ${names}. Click any card for details!${filterContext ? `\n\nActive filters${filterContext}.` : ''}`,
      resultCount: results.length,
    };
  }

  if (filterSuggestions.length > 0) {
    const msgs = CHATBOT_RESPONSES.filterSuggestion(filterSuggestions);
    return {
      type: 'suggestion',
      message: msgs[Math.floor(Math.random() * msgs.length)] + (filterContext ? `\n\nActive filters${filterContext}.` : ''),
      resultCount: results.length,
    };
  }

  if (results.length <= 5) {
    const msgs = CHATBOT_RESPONSES.fewResults(results.length, query);
    return {
      type: 'fewResults',
      message: msgs[Math.floor(Math.random() * msgs.length)] + (filterContext ? `\n\nActive filters${filterContext}.` : ''),
      resultCount: results.length,
    };
  }

  const msgs = CHATBOT_RESPONSES.manyResults(results.length, query);
  return {
    type: 'manyResults',
    message: msgs[Math.floor(Math.random() * msgs.length)] + (filterContext ? `\n\nActive filters${filterContext}.` : ''),
    resultCount: results.length,
  };
}
