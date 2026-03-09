import Fuse from 'fuse.js';
import { FILTER_CATEGORIES } from '../data/filterConfig';

// ─── Filter option index for fuzzy matching ──────────────────
const allFilterOptions = [];
for (const [catKey, cat] of Object.entries(FILTER_CATEGORIES)) {
  for (const opt of cat.options) {
    allFilterOptions.push({
      categoryKey: catKey,
      category: cat.label,
      value: opt,
      color: cat.color,
      icon: cat.icon,
    });
  }
}

const filterFuse = new Fuse(allFilterOptions, {
  keys: ['value'],
  threshold: 0.4,
  distance: 100,
  includeScore: true,
});

// ─── Exact value lookup: lowercase value → filter option (first match wins) ──
const exactValueLookup = new Map();
for (const opt of allFilterOptions) {
  const lower = opt.value.toLowerCase();
  if (!exactValueLookup.has(lower)) {
    exactValueLookup.set(lower, opt);
  }
}

export function fuzzySearchFilters(query) {
  if (!query || query.length < 2) return [];
  return filterFuse.search(query).slice(0, 12).map(r => ({
    ...r.item,
    score: r.score,
  }));
}

// ─── Case study Fuse instance ────────────────────────────────
export function createCaseStudyFuse(caseStudies) {
  return new Fuse(caseStudies, {
    keys: [
      { name: 'title', weight: 3 },
      { name: 'city', weight: 2 },
      { name: 'country', weight: 2 },
      { name: 'description', weight: 1.5 },
      { name: 'designer', weight: 1 },
      { name: 'promoter', weight: 1 },
      { name: 'physical_innovation', weight: 1 },
      { name: 'social_innovation', weight: 1 },
      { name: 'digital_innovation', weight: 1 },
      { name: 'year', weight: 1 },
      { name: 'size', weight: 0.8 },
      { name: 'climate_zone', weight: 0.8 },
      { name: 'd1_plants', weight: 1 },
      { name: 'd2_paving', weight: 1 },
      { name: 'd3_water', weight: 1 },
      { name: 'd4_roof_facade', weight: 1 },
      { name: 'd5_furnishings', weight: 1 },
      { name: 'd6_urban_spaces', weight: 1 },
      { name: 'a1_urban_scale', weight: 0.8 },
      { name: 'a2_urban_area', weight: 0.8 },
      { name: 'a3_1_buildings', weight: 0.7 },
      { name: 'a3_2_open_spaces', weight: 0.7 },
      { name: 'a3_3_infrastructures', weight: 0.7 },
      { name: 'a4_ownership', weight: 0.7 },
      { name: 'a5_management', weight: 0.7 },
      { name: 'a6_uses', weight: 0.8 },
      { name: 'a7_other', weight: 0.5 },
      { name: 'b1_physical', weight: 0.6 },
      { name: 'b2_regulations', weight: 0.6 },
      { name: 'b3_uses_management', weight: 0.6 },
      { name: 'b4_public_opinion', weight: 0.5 },
      { name: 'b5_synergy', weight: 0.5 },
      { name: 'b6_social_opportunities', weight: 0.7 },
      { name: 'c1_1_design', weight: 0.7 },
      { name: 'c1_2_funding', weight: 0.6 },
      { name: 'c1_3_management', weight: 0.6 },
      { name: 'c2_actors', weight: 0.7 },
      { name: 'c3_goals', weight: 0.8 },
      { name: 'c4_services', weight: 0.6 },
    ],
    threshold: 0.4,
    distance: 200,
    includeScore: true,
    useExtendedSearch: false,
  });
}

// ─── Stop words to ignore in multi-word queries ──────────────
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'for', 'with', 'by', 'to',
  'of', 'is', 'are', 'it', 'that', 'this', 'from', 'at', 'as', 'into',
  'i', 'me', 'we', 'you', 'they', 'my', 'our', 'your', 'their',
  'what', 'which', 'who', 'how', 'where', 'when', 'why',
  'can', 'will', 'do', 'does', 'did', 'has', 'have', 'had',
  'should', 'could', 'would', 'may', 'might',
  'need', 'want', 'find', 'show', 'search', 'look', 'get',
  'very', 'much', 'also', 'just', 'only', 'than', 'too',
  'been', 'being', 'was', 'were', 'be', 'about', 'between',
]);

// Words too generic to become filter chips (but still used in text search)
const SKIP_AS_FILTER = new Set([
  'solution', 'solutions', 'type', 'types', 'kind', 'system', 'systems',
  'city', 'cities', 'place', 'places', 'site', 'sites',
  'case', 'study', 'studies', 'example', 'examples',
  'good', 'best', 'new', 'old', 'like', 'near', 'using',
]);

// Pre-compute words that appear in actual filter option values.
// These words should NEVER be skipped, even if they seem generic.
const FILTER_OPTION_WORDS = new Set();
for (const opt of allFilterOptions) {
  for (const word of opt.value.toLowerCase().split(/[\s/(),-]+/)) {
    if (word.length >= 2) FILTER_OPTION_WORDS.add(word);
  }
}

// ─── Multi-word case study search (real-time as-you-type) ────
export function multiWordCaseStudySearch(query, fuse, allStudies) {
  if (!query || query.length < 2) return null;

  const words = query.toLowerCase().trim().replace(/\//g, ' ').split(/\s+/)
    .filter(w => w.length >= 2 && !STOP_WORDS.has(w));

  if (words.length === 0) return null;

  // Single word: normal Fuse search
  if (words.length === 1) {
    return fuse.search(words[0]).map(r => r.item);
  }

  // Multi-word: search each word independently, then combine
  const wordResults = words.map(word => {
    const results = fuse.search(word);
    const idScoreMap = new Map();
    for (const r of results) {
      idScoreMap.set(r.item.id, r.score);
    }
    return idScoreMap;
  });

  // Try intersection first (studies matching ALL words)
  const studyById = new Map(allStudies.map(s => [s.id, s]));
  const allIds = allStudies.map(s => s.id);
  const intersectionIds = allIds.filter(id =>
    wordResults.every(wm => wm.has(id))
  );

  // Sort by combined score (lower = better)
  intersectionIds.sort((a, b) => {
    const scoreA = wordResults.reduce((sum, wm) => sum + (wm.get(a) || 1), 0);
    const scoreB = wordResults.reduce((sum, wm) => sum + (wm.get(b) || 1), 0);
    return scoreA - scoreB;
  });

  // Strict AND: only return studies matching ALL search terms
  return intersectionIds.map(id => studyById.get(id));
}

// ─── Synonym map for filter matching ─────────────────────────
// Values that EXACTLY match a filter option will use direct lookup (no fuzzy).
// Values that DON'T exactly match will use fuzzy search with strict thresholds.
const SYNONYM_MAP = {
  // Size
  'large': 'Large', 'small': 'Small', 'medium': 'Medium',
  'big': 'Large', 'tiny': 'Small',
  // Climate
  'tropical': 'Tropical', 'arid': 'Arid', 'mediterranean': 'Mediterranean',
  'temperate': 'Temperate', 'temperature': 'Temperate', 'cold': 'Cold/Boreal', 'boreal': 'Cold/Boreal',
  'polar': 'Polar', 'hot': 'Tropical', 'dry': 'Arid', 'warm': 'Temperate',
  // TALEA
  'nodal': 'Nodal', 'linear': 'Linear', 'fragmented': 'Fragmented',
  // D1 Plants
  'tree': 'tree', 'trees': 'tree', 'hedge': 'hedges', 'hedges': 'hedges',
  'shrub': 'Shrub patches', 'flower': 'Flower beds', 'flowers': 'Flower beds',
  'corridor': 'corridors', 'corridors': 'corridors', 'pollinator': 'Pollinator',
  // D2 Paving
  'paving': 'paving', 'permeable': 'Permeable paving', 'depaving': 'Depaving',
  // D3 Water
  'water': 'water', 'rain': 'Rain garden', 'fountain': 'Fountains',
  'fountains': 'Fountains', 'wetland': 'wetlands', 'wetlands': 'wetlands',
  'bioretention': 'Bioretention areas', 'detention': 'Detention basins',
  'canal': 'Reopened canals', 'ditch': 'Vegetated ditches',
  'mist': 'Mist sprayers', 'flood': 'Floodable park', 'flooding': 'Floodable park',
  // D4 Roof & Facade
  'roof': 'green roofs', 'roofs': 'green roofs',
  'facade': 'Green walls', 'wall': 'Green walls', 'walls': 'Green walls',
  'climbing': 'Climbing structures', 'sunshade': 'Vegetal sunshades',
  // D5 Furnishings
  'furnishing': 'furnishings', 'awning': 'Vegetated awnings',
  'shelter': 'Green shelters',
  // D6 Urban Spaces
  'garden': 'garden', 'gardens': 'garden', 'park': 'park', 'parks': 'park',
  'micro': 'Micro parks',
  // A categories
  'urban': 'Urban', 'metropolitan': 'Metropolitan', 'district': 'District',
  'territorial': 'Territorial', 'building': 'Building', 'rooftop': 'Rooftop',
  'courtyard': 'Courtyard', 'square': 'Square', 'waterfront': 'Waterfront',
  'parking': 'Parking area', 'sidewalk': 'Sidewalk',
  'pedestrian': 'Pedestrian street', 'footpath': 'Footpath',
  'tramway': 'Tramway trackbed', 'carriageway': 'Carriageway',
  'public': 'Public', 'private': 'Private', 'mixed': 'Mixed (public/private)',
  'association': 'Association', 'neighbourhood': 'Neighbourhood',
  'commercial': 'Commercial', 'cultural': 'Cultural', 'educational': 'Educational',
  'recreational': 'Recreational', 'residential': 'Residential',
  'sports': 'Sports', 'events': 'Events', 'multifunctional': 'Multifunctional',
  'bike': 'Slow mobility (walking, bike, bus)', 'walking': 'Slow mobility (walking, bike, bus)',
  'cycling': 'Slow mobility (walking, bike, bus)', 'mobility': 'Slow mobility (walking, bike, bus)',
  // B categories
  'pollution': 'High levels of soil pollution',
  'cables': 'Aerial cables / power lines',
  'heritage': 'Heritage/archaeological constraint',
  'landscape': 'Landscape protection constraint',
  'conflict': 'Use conflicts', 'vulnerable': 'Vulnerable or sensitive users',
  // C categories
  'codesign': 'Co-design', 'workshop': 'Workshop',
  'competition': 'Open call/ competition',
  'consultation': 'Public consultation',
  'crowdfunding': 'Crowdfunding', 'partnership': 'Partnership',
  'citizen': 'Citizens', 'citizens': 'Citizens',
  'volunteer': 'Volunteers', 'volunteers': 'Volunteers',
  'students': 'Students', 'artist': 'Artists', 'artists': 'Artists',
  'designers': 'Designers', 'resident': 'Residents', 'residents': 'Residents',
  // C3 Goals
  'accessible': 'Accessibility', 'accessibility': 'Accessibility',
  'biodiversity': 'Biodiversity', 'resilience': 'Resilience', 'resilient': 'Resilience',
  'inclusion': 'Social inclusion', 'inclusive': 'Social inclusion',
  'social': 'Social inclusion', 'safety': 'Safety',
  'regeneration': 'Urban regeneration',
  'sustainability': 'Environmental sustainability',
  'sustainable': 'Environmental sustainability',
  'liveability': 'Liveability', 'liveable': 'Liveability',
  'community': 'Community', 'care': 'Care', 'knowledge': 'Knowledge',
  'transformation': 'Transformation', 'climate': 'Climate change mitigation',
  'innovation': 'Social innovation',
  // General
  'green': 'green',
};

// Helper: resolve a synonym value to filter match(es) using exact-first strategy
function resolveToFilters(synonymValue) {
  // 1. Try exact match (case-insensitive) against known filter options
  const exact = exactValueLookup.get(synonymValue.toLowerCase());
  if (exact) {
    return [{ ...exact, score: 0 }];
  }

  // 2. Fuzzy search — only accept very good matches (score < 0.2)
  const fuzzyMatches = filterFuse.search(synonymValue).slice(0, 3);
  const good = [];
  for (const m of fuzzyMatches) {
    if (m.score < 0.2) {
      good.push({ ...m.item, score: m.score });
    }
  }
  return good.length > 0 ? good.slice(0, 2) : [];
}

// ─── Multi-word search → filter matching (on Enter) ──────────
export function parseMultiWordQuery(query) {
  // Normalize: handle commas, ensure spaces around slashes, collapse whitespace
  const normalized = query.toLowerCase().trim()
    .replace(/,/g, ' ')
    .replace(/\//g, ' / ')
    .replace(/\s+/g, ' ');
  const rawWords = normalized.split(' ').filter(w => w.length >= 1);
  const matches = [];
  const exclusions = [];

  const hasExclusionKeywords = rawWords.some(w => w === 'not' || w === 'but' || w === 'without' || w.startsWith('-'));

  // Step 1: Try full query as a single exact filter match
  //   e.g. "row of trees" → Row of trees, "rows / tree lines" → Rows / tree lines
  if (!hasExclusionKeywords && rawWords.length >= 2 && rawWords.length <= 6) {
    const fullRaw = rawWords.join(' ');
    // Try exact with stop words included (catches "Row of trees" etc.)
    const exactFull = exactValueLookup.get(fullRaw);
    if (exactFull) {
      return { matches: [{ ...exactFull, score: 0 }], exclusions: [] };
    }
    // Try exact without stop words (catches rephrased queries)
    const cleanWords = rawWords.filter(w => !STOP_WORDS.has(w) && w !== '/');
    const fullClean = cleanWords.join(' ');
    if (fullClean !== fullRaw) {
      const exactClean = exactValueLookup.get(fullClean);
      if (exactClean) {
        return { matches: [{ ...exactClean, score: 0 }], exclusions: [] };
      }
    }
    // Try fuzzy on full query — only accept near-perfect matches
    const fullResults = filterFuse.search(fullRaw).slice(0, 3);
    const goodFull = fullResults.filter(m => m.score < 0.15);
    if (goodFull.length > 0 && goodFull.length <= 2) {
      const seen = new Set();
      for (const m of goodFull) {
        const key = `${m.item.categoryKey}:${m.item.value}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({ ...m.item, score: m.score });
        }
      }
      return { matches, exclusions: [] };
    }
  }

  // Step 2: Greedy sliding window — match longest compound phrases first
  //   Includes stop words so "Row of trees", "Rows / tree lines" etc. are found
  const consumed = new Set();
  const maxWindow = Math.min(rawWords.length, 5);
  for (let windowSize = maxWindow; windowSize >= 2; windowSize--) {
    for (let i = 0; i <= rawWords.length - windowSize; i++) {
      // Skip if any index already consumed
      let anyConsumed = false;
      for (let j = i; j < i + windowSize; j++) {
        if (consumed.has(j)) { anyConsumed = true; break; }
      }
      if (anyConsumed) continue;

      // Skip if starts with exclusion keyword
      if (rawWords[i] === 'not' || rawWords[i] === 'but' || rawWords[i] === 'without' || rawWords[i].startsWith('-')) continue;

      const windowWords = rawWords.slice(i, i + windowSize);
      const phrase = windowWords.join(' ');

      // Try exact match
      const exactMatch = exactValueLookup.get(phrase);
      if (exactMatch) {
        matches.push({ ...exactMatch, score: 0 });
        for (let j = i; j < i + windowSize; j++) consumed.add(j);
        continue;
      }

      // Skip fuzzy if no meaningful content words in window
      const contentWords = windowWords.filter(w => !STOP_WORDS.has(w) && w !== '/' && w.length >= 2);
      if (contentWords.length === 0) continue;

      // Try fuzzy on compound — strict threshold, accept only single best match
      const pairResults = filterFuse.search(phrase).slice(0, 2);
      const goodPair = pairResults.filter(m => m.score < 0.15);
      if (goodPair.length === 1) {
        matches.push({ ...goodPair[0].item, score: goodPair[0].score });
        for (let j = i; j < i + windowSize; j++) consumed.add(j);
      }
    }
  }

  // Step 3: Process remaining individual words
  let isExclusion = false;
  for (let i = 0; i < rawWords.length; i++) {
    if (consumed.has(i)) continue;
    const word = rawWords[i];

    if (word === 'not' || word === 'but' || word === 'without') {
      isExclusion = true;
      continue;
    }

    if (word === '/' || word.length < 2) continue;
    if (STOP_WORDS.has(word)) continue;
    if (SKIP_AS_FILTER.has(word) && !FILTER_OPTION_WORDS.has(word)) {
      isExclusion = false;
      continue;
    }

    let cleanWord = word;
    let exclude = isExclusion;
    if (word.startsWith('-')) {
      cleanWord = word.slice(1);
      exclude = true;
    }

    if (cleanWord.length < 2) continue;

    // Check synonym map → then resolve via exact-first strategy
    const synonym = SYNONYM_MAP[cleanWord];
    if (synonym) {
      const resolved = resolveToFilters(synonym);
      for (const entry of resolved) {
        if (exclude) exclusions.push(entry);
        else matches.push(entry);
      }
    } else {
      // No synonym — raw fuzzy, very strict (only near-perfect matches)
      const fuzzyMatches = filterFuse.search(cleanWord).slice(0, 1);
      for (const m of fuzzyMatches) {
        if (m.score < 0.1) {
          const entry = { ...m.item, score: m.score };
          if (exclude) exclusions.push(entry);
          else matches.push(entry);
        }
      }
    }

    // Reset exclusion flag after processing a content word
    isExclusion = false;
  }

  // Deduplicate
  const seen = new Set();
  const uniqueMatches = matches.filter(m => {
    const key = `${m.categoryKey}:${m.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const seenExcl = new Set();
  const uniqueExclusions = exclusions.filter(m => {
    const key = `${m.categoryKey}:${m.value}`;
    if (seenExcl.has(key)) return false;
    seenExcl.add(key);
    return true;
  });

  return { matches: uniqueMatches, exclusions: uniqueExclusions };
}

// ─── Find common filters among results ────────────────────────
export function findCommonFilters(studies, activeFilters) {
  if (studies.length < 2) return [];

  const threshold = Math.ceil(studies.length * 0.6);
  const suggestions = [];

  for (const [catKey, cat] of Object.entries(FILTER_CATEGORIES)) {
    const activeVals = activeFilters[catKey] || [];
    for (const opt of cat.options) {
      if (activeVals.includes(opt)) continue;

      let count = 0;
      for (const study of studies) {
        if (cat.type === 'object') {
          if (study[cat.dataKey]?.[opt.toLowerCase()]) count++;
        } else if (cat.type === 'value') {
          if (study[cat.dataKey] === opt) count++;
        } else if (cat.type === 'array') {
          if ((study[cat.dataKey] || []).includes(opt)) count++;
        }
      }

      if (count >= threshold) {
        suggestions.push({
          categoryKey: catKey,
          value: opt,
          icon: cat.icon,
          color: cat.color,
          category: cat.label,
          frequency: Math.round((count / studies.length) * 100),
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.frequency - a.frequency).slice(0, 6);
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
      `I noticed your search matches some filter categories: ${names}. Want me to apply them? Click the suggestions below!`,
      `Your query relates to these NBS categories: ${names}. Adding them as filters will help you find the most relevant solutions.`,
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
