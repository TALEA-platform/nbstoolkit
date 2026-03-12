import Fuse from 'fuse.js';
import { FILTER_CATEGORIES, FILTER_GROUPS } from '../data/filterConfig';
import { hasTaleaType } from './getTaleaTypes';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'in', 'on', 'for', 'with', 'by', 'to',
  'of', 'is', 'are', 'it', 'that', 'this', 'from', 'at', 'as', 'into',
  'i', 'me', 'we', 'you', 'they', 'my', 'our', 'your', 'their',
  'what', 'which', 'who', 'how', 'where', 'when', 'why',
  'can', 'will', 'do', 'does', 'did', 'has', 'have', 'had',
  'should', 'could', 'would', 'may', 'might',
  'need', 'want', 'find', 'show', 'search', 'look', 'get', 'give',
  'very', 'much', 'also', 'just', 'only', 'than', 'too',
  'been', 'being', 'was', 'were', 'be', 'about', 'between',
  'like', 'near', 'around', 'through', 'across', 'inside', 'outside',
  'project', 'projects', 'case', 'study', 'studies', 'solution', 'solutions',
  'example', 'examples'
]);

const NEGATION_WORDS = new Set([
  'not', 'without', 'exclude', 'excluding', 'except', 'minus'
]);

const OPTION_ALIAS_MAP = {
  large: 'Large',
  small: 'Small',
  medium: 'Medium',
  big: 'Large',
  tiny: 'Small',
  tropical: 'Tropical',
  arid: 'Arid',
  mediterranean: 'Mediterranean',
  temperate: 'Temperate',
  warm: 'Temperate',
  cold: 'Cold/Boreal',
  boreal: 'Cold/Boreal',
  polar: 'Polar',
  nodal: 'Nodal',
  linear: 'Linear',
  fragmented: 'Fragmented',
  tree: 'Row of trees',
  trees: 'Row of trees',
  'row trees': 'Row of trees',
  'tree line': 'Rows / tree lines',
  'tree lines': 'Rows / tree lines',
  hedges: 'Dense hedges',
  hedge: 'Dense hedges',
  shrubs: 'Shrub patches',
  shrub: 'Shrub patches',
  flowers: 'Flower beds',
  flower: 'Flower beds',
  park: 'Green area (park / garden)',
  parks: 'Green area (park / garden)',
  garden: 'Green area (park / garden)',
  gardens: 'Green area (park / garden)',
  square: 'Square',
  courtyard: 'Courtyard',
  waterfront: 'Waterfront',
  parking: 'Parking area',
  'green roof': 'Extensive green roofs',
  'green roofs': 'Extensive green roofs',
  'green rooftop': 'Extensive green roofs',
  'green rooftops': 'Extensive green roofs',
  'extensive green roof': 'Extensive green roofs',
  'extensive green roofs': 'Extensive green roofs',
  'extensive roof': 'Extensive green roofs',
  'extensive rooftop': 'Extensive green roofs',
  'extensive rooftops': 'Extensive green roofs',
  'extensive roofs': 'Extensive green roofs',
  'intensive green roof': 'Intensive green roofs',
  'intensive green roofs': 'Intensive green roofs',
  'intensive roof': 'Intensive green roofs',
  'intensive rooftop': 'Intensive green roofs',
  'intensive rooftops': 'Intensive green roofs',
  'intensive roofs': 'Intensive green roofs',
  facade: 'Green walls',
  facades: 'Green walls',
  wall: 'Green walls',
  walls: 'Green walls',
  paving: 'Permeable paving',
  permeable: 'Permeable paving',
  depaving: 'Depaving',
  water: 'Rain garden',
  rain: 'Rain garden',
  fountain: 'Fountains',
  fountains: 'Fountains',
  wetland: 'Urban wetlands',
  wetlands: 'Urban wetlands',
  bioretention: 'Bioretention areas',
  detention: 'Detention basins',
  canal: 'Reopened canals',
  canals: 'Reopened canals',
  ditch: 'Vegetated ditches',
  ditches: 'Vegetated ditches',
  mist: 'Mist sprayers',
  flood: 'Floodable park',
  floods: 'Floodable park',
  floodable: 'Floodable park',
  shelter: 'Green shelters',
  shelters: 'Green shelters',
  awning: 'Vegetated awnings',
  awnings: 'Vegetated awnings',
  roof: 'Extensive green roofs',
  roofs: 'Extensive green roofs',
  gardening: 'Community gardens',
  'community garden': 'Community gardens',
  'community gardens': 'Community gardens',
  micropark: 'Micro parks',
  microparks: 'Micro parks',
  corridor: 'Ecological corridors - Pollinator-friendly gardens',
  corridors: 'Ecological corridors - Pollinator-friendly gardens',
  pollinator: 'Ecological corridors - Pollinator-friendly gardens',
  shading: 'Shading tree groups / tree clusters',
  'shade tree': 'Shading tree groups / tree clusters',
  'single tree': 'Single tree',
  'green space': 'Multifunctional green spaces',
  'green spaces': 'Multifunctional green spaces',
  'rain plaza': 'Rain plaza',
  'green channel': 'Green channels',
  'green channels': 'Green channels',
  tramway: 'Tramway trackbed',
  tram: 'Tramway trackbed',
  carriageway: 'Carriageway',
  viaduct: 'Green spaces in infrastructures (underpasses / viaducts)',
  underpass: 'Green spaces in infrastructures (underpasses / viaducts)',
  rural: 'Rural area',
  historical: 'Historical centre',
  historic: 'Historical centre',
  peripheral: 'Peripheral area',
  urban: 'Urban',
  metropolitan: 'Metropolitan',
  district: 'District',
  territorial: 'Territorial',
  building: 'Building / pavilion',
  buildings: 'Building complex',
  rooftop: 'Rooftop',
  sidewalk: 'Sidewalk',
  sidewalks: 'Sidewalk',
  footpath: 'Footpath',
  pedestrian: 'Pedestrian street',
  public: 'Public',
  private: 'Private',
  mixed: 'Mixed (public/private)',
  'public ownership': 'Public',
  'private ownership': 'Private',
  'mixed ownership': 'Mixed (public/private)',
  'public management': 'Public',
  'private management': 'Private',
  'mixed management': 'Mixed (public/private)',
  commercial: 'Commercial',
  cultural: 'Cultural',
  educational: 'Educational',
  recreational: 'Recreational',
  residential: 'Residential',
  sports: 'Sports',
  multifunctional: 'Multifunctional',
  mobility: 'Slow mobility (walking / bike / bus)',
  walking: 'Slow mobility (walking / bike / bus)',
  bike: 'Slow mobility (walking / bike / bus)',
  cycling: 'Slow mobility (walking / bike / bus)',
  pollution: 'High levels of soil pollution',
  cables: 'Aerial cables / power lines',
  heritage: 'Heritage/archaeological constraint',
  landscape: 'Landscape protection constraint',
  accessibility: 'Accessibility',
  accessible: 'Accessibility',
  biodiversity: 'Biodiversity',
  resilience: 'Resilience',
  resilient: 'Resilience',
  inclusion: 'Social inclusion',
  inclusive: 'Social inclusion',
  safety: 'Safety',
  regeneration: 'Urban regeneration',
  sustainability: 'Environmental sustainability',
  sustainable: 'Environmental sustainability',
  liveability: 'Liveability',
  liveable: 'Liveability',
  community: 'Sense of community',
  care: 'Care',
  knowledge: 'Knowledge',
  climate: 'Climate change mitigation',
  shade: 'Areas with shade/cool spots',
  benches: 'Benches/rest areas',
  bench: 'Benches/rest areas',
  maps: 'Online maps / informative materials',
  map: 'Online maps / informative materials',
  'co design': 'Co-design',
  codesign: 'Co-design',
  workshop: 'Workshop',
  workshops: 'Workshop',
  consultation: 'Public consultation',
  consultations: 'Public consultation',
  partnership: 'Partnership',
  partnerships: 'Partnership',
  crowdfunding: 'Crowdfunding',
  citizens: 'Citizens',
  citizen: 'Citizens',
  residents: 'Residents',
  resident: 'Residents',
  artists: 'Artists',
  artist: 'Artists',
  volunteers: 'Volunteers',
  volunteer: 'Volunteers',
  physical: 'Physical',
  social: 'Social',
  digital: 'Digital'
};

const CATEGORY_HINTS = {
  innovation: ['innovation', 'innovations', 'innovative'],
  a4_ownership: ['ownership', 'owner', 'owners'],
  a5_management: ['management', 'manager', 'managers', 'governance', 'maintained'],
  c1_2_funding: ['funding', 'fund', 'funds', 'finance', 'financing'],
  c1_3_management: ['management', 'agreement', 'governance', 'design'],
  c2_actors: ['actor', 'actors', 'stakeholder', 'stakeholders'],
  c3_goals: ['goal', 'goals', 'result', 'results', 'outcome', 'outcomes'],
  c4_services: ['service', 'services'],
};

const CATEGORY_GROUP_MAP = Object.entries(FILTER_GROUPS).reduce((acc, [groupKey, group]) => {
  for (const categoryKey of group.categories) {
    acc[categoryKey] = group;
  }
  return acc;
}, {});

const CATEGORY_CONTEXT_TOKENS = Object.fromEntries(
  Object.entries(FILTER_CATEGORIES).map(([categoryKey, category]) => {
    const tokens = new Set(tokenizeText(category.label));
    const group = CATEGORY_GROUP_MAP[categoryKey];
    if (group) {
      for (const token of tokenizeText(group.label)) {
        tokens.add(token);
      }
    }
    for (const hint of CATEGORY_HINTS[categoryKey] || []) {
      for (const token of tokenizeText(hint)) {
        tokens.add(token);
      }
    }
    return [categoryKey, [...tokens]];
  })
);

const CATEGORY_ORDER = Object.keys(FILTER_CATEGORIES).reduce((acc, categoryKey, index) => {
  acc[categoryKey] = index;
  return acc;
}, {});

const ALL_CATEGORY_CONTEXT_TOKENS = new Set(Object.values(CATEGORY_CONTEXT_TOKENS).flat());

const TEXT_FIELD_CONFIG = [
  { key: 'title', weight: 8.5, bucket: 'title' },
  { key: 'city', weight: 5, bucket: 'location' },
  { key: 'country', weight: 4.5, bucket: 'location' },
  { key: 'year', weight: 2, bucket: 'meta' },
  { key: 'designer', weight: 3.4, bucket: 'people' },
  { key: 'promoter', weight: 3.4, bucket: 'people' },
  { key: 'description', weight: 4.2, bucket: 'narrative' },
  { key: 'physical_innovation', weight: 3.8, bucket: 'narrative' },
  { key: 'social_innovation', weight: 3.8, bucket: 'narrative' },
  { key: 'digital_innovation', weight: 3.4, bucket: 'narrative' },
  { key: 'c5_impacts', weight: 4.2, bucket: 'narrative' },
];

const PHRASE_BUCKET_WEIGHTS = {
  title: 18,
  location: 13,
  people: 8,
  narrative: 7,
  taxonomy: 6,
  meta: 4,
};

const CATEGORY_WEIGHT_OVERRIDES = {
  innovation: 6.5,
  c3_goals: 5.2,
  c4_services: 4.8,
  c2_actors: 4.4,
  c1_1_design: 4.2,
  c1_2_funding: 3.8,
  c1_3_management: 3.4,
  d1_plants: 5.1,
  d2_paving: 4.7,
  d3_water: 5.1,
  d4_roof_facade: 4.6,
  d5_furnishings: 4.2,
  d6_urban_spaces: 4.6,
  a1_urban_scale: 3.7,
  a2_urban_area: 3.7,
  a3_1_buildings: 3.2,
  a3_2_open_spaces: 3.4,
  a3_3_infrastructures: 3.4,
  a4_ownership: 2.8,
  a5_management: 2.8,
  a6_uses: 3.5,
  a7_other: 2.8,
  b1_physical: 3.4,
  b2_regulations: 3.4,
  b3_uses_management: 3.4,
  b4_public_opinion: 3,
  b5_synergy: 3,
  b6_social_opportunities: 4.2,
  talea_application: 4.4,
  size: 3.4,
  climate_zone: 3.4
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeText(value) {
  return normalizeText(value)
    .split(' ')
    .filter(token => token.length >= 2 && !STOP_WORDS.has(token));
}

function buildPhrases(tokens) {
  const phrases = new Set();
  for (let size = 2; size <= 4; size++) {
    for (let i = 0; i <= tokens.length - size; i++) {
      phrases.add(tokens.slice(i, i + size).join(' '));
    }
  }
  return [...phrases];
}

function createOptionEntry(categoryKey, category, value) {
  return {
    categoryKey,
    category: category.label,
    value,
    color: category.color,
    icon: category.icon,
    normalizedValue: normalizeText(value),
    normalizedLabel: normalizeText(category.label),
    normalizedTokens: tokenizeText(value),
  };
}

const ALL_FILTER_OPTIONS = Object.entries(FILTER_CATEGORIES).flatMap(([categoryKey, category]) =>
  category.options.map(value => createOptionEntry(categoryKey, category, value))
);

const OPTION_LOOKUP = new Map();
const OPTION_BY_CATEGORY_VALUE = new Map();
for (const option of ALL_FILTER_OPTIONS) {
  const existing = OPTION_LOOKUP.get(option.normalizedValue) || [];
  existing.push(option);
  OPTION_LOOKUP.set(option.normalizedValue, existing);
  OPTION_BY_CATEGORY_VALUE.set(`${option.categoryKey}:${option.normalizedValue}`, option);
}

const ALIAS_LOOKUP = new Map();
for (const [alias, targetValue] of Object.entries(OPTION_ALIAS_MAP)) {
  const targetOptions = OPTION_LOOKUP.get(normalizeText(targetValue));
  if (targetOptions?.length) {
    ALIAS_LOOKUP.set(normalizeText(alias), targetOptions);
  }
}

const optionFuse = new Fuse(ALL_FILTER_OPTIONS, {
  keys: [
    { name: 'value', weight: 3 },
    { name: 'category', weight: 1 },
  ],
  threshold: 0.28,
  distance: 100,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
});

function scoreOptionCandidates(candidates, score, source) {
  return candidates.map(option => ({
    ...option,
    score,
    source,
    ambiguous: candidates.length > 1,
  }));
}

function hasMeaningfulTokenAffinity(queryTokens, optionTokens) {
  if (queryTokens.length === 0 || optionTokens.length === 0) return false;

  for (const queryToken of queryTokens) {
    for (const optionToken of optionTokens) {
      if (queryToken === optionToken) return true;
      if (queryToken.length >= 4 && optionToken.startsWith(queryToken)) return true;
      if (optionToken.length >= 4 && queryToken.startsWith(optionToken)) return true;
    }
  }

  return false;
}

function disambiguateCandidates(candidates, queryTokens) {
  if (candidates.length <= 1) return candidates;

  const scoredCandidates = candidates.map(candidate => {
    const contextTokens = CATEGORY_CONTEXT_TOKENS[candidate.categoryKey] || [];
    const contextScore = queryTokens.reduce(
      (sum, token) => sum + (contextTokens.includes(token) ? 1 : 0),
      0
    );
    return {
      ...candidate,
      contextScore,
    };
  });

  const sortedCandidates = [...scoredCandidates].sort((a, b) => {
    if (b.contextScore !== a.contextScore) return b.contextScore - a.contextScore;
    return (CATEGORY_ORDER[a.categoryKey] ?? Number.MAX_SAFE_INTEGER)
      - (CATEGORY_ORDER[b.categoryKey] ?? Number.MAX_SAFE_INTEGER);
  });
  const bestCandidate = sortedCandidates[0];

  if (bestCandidate && bestCandidate.contextScore > 0) {
    return [{
      ...bestCandidate,
      ambiguous: false,
    }];
  }

  return candidates;
}

function resolveContextualValueCandidates(queryTokens) {
  if (queryTokens.length < 2) return [];

  const candidateMap = new Map();
  for (const token of queryTokens) {
    const directMatches = OPTION_LOOKUP.get(token) || ALIAS_LOOKUP.get(token);
    if (!directMatches?.length) continue;

    for (const candidate of directMatches) {
      candidateMap.set(`${candidate.categoryKey}:${candidate.value}`, candidate);
    }
  }

  if (candidateMap.size === 0) return [];

  const disambiguated = disambiguateCandidates(
    scoreOptionCandidates([...candidateMap.values()], 0.04, 'context'),
    queryTokens
  );

  if (disambiguated.length === 1 && !disambiguated[0].ambiguous) {
    return disambiguated;
  }

  return [];
}

function resolveOptionCandidates(phrase, strict = false, contextTokens = [], fuseCache = null) {
  const normalized = normalizeText(phrase);
  if (!normalized || normalized.length < 2) return [];
  const phraseTokens = tokenizeText(phrase);
  const queryTokens = [...new Set([...phraseTokens, ...contextTokens])];

  const sharedValueCandidates = resolveSharedValueCandidates(phraseTokens, contextTokens);
  if (sharedValueCandidates.length > 0) {
    return sharedValueCandidates;
  }

  const designProcessCandidates = resolveDesignProcessCandidates(normalized, contextTokens);
  if (designProcessCandidates.length > 0) {
    return designProcessCandidates;
  }

  const innovationCandidates = resolveInnovationCandidates(phraseTokens, contextTokens);
  if (innovationCandidates.length > 0) {
    return innovationCandidates;
  }

  const exact = OPTION_LOOKUP.get(normalized);
  if (exact?.length) {
    return disambiguateCandidates(
      scoreOptionCandidates(exact, exact.length === 1 ? 0 : 0.02, 'exact'),
      queryTokens
    );
  }

  if (phraseTokens.length === 1) {
    const tokenOption = UNIQUE_OPTION_TOKEN_MAP.get(phraseTokens[0]);
    if (tokenOption) {
      return createResolvedOption(tokenOption, 0.012, 'token');
    }
  }

  const alias = ALIAS_LOOKUP.get(normalized);
  if (alias?.length) {
    return disambiguateCandidates(
      scoreOptionCandidates(alias, alias.length === 1 ? 0.03 : 0.05, 'alias').map(option => ({
        ...option,
        matchedAlias: normalized,
      })),
      queryTokens
    );
  }

  const contextual = resolveContextualValueCandidates(queryTokens);
  if (contextual.length > 0) {
    return contextual;
  }

  const isStructureOnlyPhrase = phraseTokens.length > 0
    && phraseTokens.every(token => ALL_CATEGORY_CONTEXT_TOKENS.has(token))
    && phraseTokens.every(token => !OPTION_LOOKUP.has(token) && !ALIAS_LOOKUP.has(token));
  if (isStructureOnlyPhrase) {
    return [];
  }

  if (phraseTokens.length === 1 && GENERIC_SINGLE_VALUE_TOKENS.has(phraseTokens[0])) {
    return [];
  }

  if (phraseTokens.length === 1 && normalized !== phraseTokens[0]) {
    return [];
  }

  const cacheKey = phrase;
  let fuzzyMatches;
  if (fuseCache && fuseCache.has(cacheKey)) {
    fuzzyMatches = fuseCache.get(cacheKey);
  } else {
    fuzzyMatches = optionFuse.search(phrase).slice(0, 4);
    if (fuseCache) fuseCache.set(cacheKey, fuzzyMatches);
  }
  if (fuzzyMatches.length === 0) return [];

  const threshold = strict ? 0.12 : 0.18;
  const accepted = [];
  for (const match of fuzzyMatches) {
    if ((match.score ?? 1) > threshold) continue;
    if (!hasMeaningfulTokenAffinity(phraseTokens, match.item.normalizedTokens)) continue;
    accepted.push({
      ...match.item,
      score: match.score ?? 0.5,
      source: 'fuzzy',
      ambiguous: false,
    });
  }

  if (accepted.length === 0) return [];

  const bestScore = accepted[0].score;
  return disambiguateCandidates(
    accepted.filter(option => option.score <= bestScore + 0.03),
    queryTokens
  );
}

function tokenMatchesOptionToken(queryToken, optionToken) {
  return (
    queryToken === optionToken ||
    (queryToken.length >= 4 && optionToken.startsWith(queryToken)) ||
    (optionToken.length >= 4 && queryToken.startsWith(optionToken))
  );
}

function getCandidateSupport(candidate, phraseTokens) {
  const contextTokens = CATEGORY_CONTEXT_TOKENS[candidate.categoryKey] || [];
  let supportedCount = 0;
  let directValueCount = 0;

  for (const token of phraseTokens) {
    const directMatch = candidate.normalizedTokens.some(optionToken => tokenMatchesOptionToken(token, optionToken));
    const contextMatch = contextTokens.includes(token);

    if (directMatch || contextMatch) {
      supportedCount += 1;
      if (directMatch) directValueCount += 1;
    }
  }

  return {
    supportedCount,
    directValueCount,
    allSupported: supportedCount === phraseTokens.length,
    allDirectSupported: directValueCount === phraseTokens.length,
  };
}

const SOURCE_PRIORITY = {
  exact: 4,
  interpreted: 3.5,
  token: 3.25,
  alias: 3,
  context: 2,
  fuzzy: 1,
};

const INNOVATION_VALUE_TOKENS = new Set(['physical', 'social', 'digital']);
const INNOVATION_CONTEXT_TOKENS = new Set(['innovation', 'innovations', 'innovative']);
const DESIGN_CONTEXT_TOKENS = new Set(['design', 'process', 'processes']);
const SHARED_VALUE_TOKENS = new Set(['public', 'private', 'mixed']);
const DESIGN_MANAGEMENT_HINT_TOKENS = new Set(['design', 'agreement', 'collaboration', 'collaborative']);
const GENERIC_SINGLE_VALUE_TOKENS = new Set(['green']);

const INNOVATION_OPTION_MAP = new Map(
  ALL_FILTER_OPTIONS
    .filter(option => option.categoryKey === 'innovation')
    .map(option => [option.normalizedValue, option])
);

const UNIQUE_OPTION_TOKEN_MAP = (() => {
  const tokenCandidates = new Map();

  for (const option of ALL_FILTER_OPTIONS) {
    for (const token of new Set(option.normalizedTokens)) {
      if (!token || token.length < 4) continue;
      if (STOP_WORDS.has(token)) continue;
      if (ALL_CATEGORY_CONTEXT_TOKENS.has(token)) continue;
      if (GENERIC_SINGLE_VALUE_TOKENS.has(token)) continue;
      if (SHARED_VALUE_TOKENS.has(token)) continue;
      if (INNOVATION_VALUE_TOKENS.has(token)) continue;

      const bucket = tokenCandidates.get(token) || [];
      bucket.push(option);
      tokenCandidates.set(token, bucket);
    }
  }

  return new Map(
    [...tokenCandidates.entries()]
      .filter(([, options]) => options.length === 1)
      .map(([token, options]) => [token, options[0]])
  );
})();

const DESIGN_SOCIAL_INNOVATION_OPTION = ALL_FILTER_OPTIONS.find(
  option => option.categoryKey === 'c1_1_design' && option.normalizedValue === 'social innovation'
);

function getCategoryOption(categoryKey, normalizedValue) {
  return OPTION_BY_CATEGORY_VALUE.get(`${categoryKey}:${normalizedValue}`) || null;
}

function createResolvedOption(option, score = 0.01, source = 'context') {
  if (!option) return [];

  return [{
    ...option,
    score,
    source,
    ambiguous: false,
  }];
}

function normalizeSharedValueToken(token) {
  if (token === 'mixed') {
    return normalizeText('Mixed (public/private)');
  }

  return token;
}

function resolveSharedValueCandidates(phraseTokens, contextTokens = []) {
  const sharedValueToken = phraseTokens.find(token => SHARED_VALUE_TOKENS.has(token));
  if (!sharedValueToken) return [];

  const normalizedValue = normalizeSharedValueToken(sharedValueToken);
  const phraseTokenSet = new Set(phraseTokens);
  const combinedTokens = new Set([...phraseTokens, ...contextTokens]);
  const hasDesignManagementHint = [...combinedTokens].some(token => DESIGN_MANAGEMENT_HINT_TOKENS.has(token));
  const hasManagementContext = phraseTokenSet.has('management') || combinedTokens.has('management');
  const hasOwnershipInPhrase = phraseTokenSet.has('ownership');
  const hasOwnershipContext = combinedTokens.has('ownership');

  if (hasOwnershipInPhrase) {
    return createResolvedOption(getCategoryOption('a4_ownership', normalizedValue), 0.004, 'context');
  }

  if (hasDesignManagementHint) {
    return createResolvedOption(getCategoryOption('c1_3_management', normalizedValue), 0.005, 'context');
  }

  if (hasManagementContext) {
    const prefersDesignManagement = hasDesignManagementHint;
    const preferredCategoryKey = prefersDesignManagement ? 'c1_3_management' : 'a5_management';
    const fallbackCategoryKey = prefersDesignManagement ? 'a5_management' : 'c1_3_management';

    return createResolvedOption(
      getCategoryOption(preferredCategoryKey, normalizedValue) || getCategoryOption(fallbackCategoryKey, normalizedValue),
      prefersDesignManagement ? 0.005 : 0.007,
      'context'
    );
  }

  if (phraseTokens.length === 1 && hasOwnershipContext) {
    return createResolvedOption(getCategoryOption('a4_ownership', normalizedValue), 0.006, 'context');
  }

  if (phraseTokens.length === 1 && !hasOwnershipContext && !hasManagementContext) {
    return [];
  }

  const preferredCategoryKey = hasDesignManagementHint ? 'c1_3_management' : 'a5_management';
  const fallbackCategoryKey = hasDesignManagementHint ? 'a5_management' : 'c1_3_management';

  return createResolvedOption(
    getCategoryOption(preferredCategoryKey, normalizedValue) || getCategoryOption(fallbackCategoryKey, normalizedValue),
    hasDesignManagementHint ? 0.005 : 0.007,
    'context'
  );
}

function resolveDesignProcessCandidates(normalized, contextTokens = []) {
  if (normalized !== 'social innovation' || !DESIGN_SOCIAL_INNOVATION_OPTION) {
    return [];
  }

  if (!contextTokens.some(token => DESIGN_CONTEXT_TOKENS.has(token))) {
    return [];
  }

  return [{
    ...DESIGN_SOCIAL_INNOVATION_OPTION,
    score: 0.008,
    source: 'context',
    ambiguous: false,
  }];
}

function resolveInnovationCandidates(phraseTokens, contextTokens = []) {
  const phraseValueTokens = phraseTokens.filter(token => INNOVATION_VALUE_TOKENS.has(token));
  if (phraseValueTokens.length !== 1) return [];

  const combinedTokens = [...new Set([...phraseTokens, ...contextTokens])];
  const hasInnovationContext = combinedTokens.some(token => INNOVATION_CONTEXT_TOKENS.has(token));
  const phraseContainsOnlyInnovationTerms = phraseTokens.every(
    token => INNOVATION_VALUE_TOKENS.has(token) || INNOVATION_CONTEXT_TOKENS.has(token)
  );

  if (!phraseContainsOnlyInnovationTerms && phraseTokens.length !== 1) {
    return [];
  }

  const option = INNOVATION_OPTION_MAP.get(phraseValueTokens[0]);
  if (!option) return [];

  return [{
    ...option,
    score: hasInnovationContext ? 0.01 : 0.015,
    source: hasInnovationContext ? 'context' : 'alias',
    ambiguous: false,
  }];
}

function findBestSegmentMatch(contentWords, contextTokens = [], suggestions = [], fuseCache = null) {
  const maxWindow = Math.min(contentWords.length, 5);
  let bestMatch = null;

  function hasCompetingAdjacentPhrase(start, end, currentOption) {
    if (end - start !== 1) return false;

    const adjacentRanges = [];
    if (start > 0) adjacentRanges.push([start - 1, end]);
    if (end < contentWords.length) adjacentRanges.push([start, end + 1]);

    for (const [rangeStart, rangeEnd] of adjacentRanges) {
      const phraseTokens = contentWords.slice(rangeStart, rangeEnd);
      if (phraseTokens.length <= 1) continue;

      const phrase = phraseTokens.join(' ');
      const surroundingTokens = [
        ...contentWords.slice(0, rangeStart),
        ...contentWords.slice(rangeEnd),
        ...contextTokens,
      ];
      const adjacentCandidates = resolveOptionCandidates(phrase, false, surroundingTokens, fuseCache);
      if (!adjacentCandidates.length) continue;

      const hasDifferentInterpretation = adjacentCandidates.some(candidate => (
        `${candidate.categoryKey}:${candidate.value}` !== `${currentOption.categoryKey}:${currentOption.value}`
      ));

      if (hasDifferentInterpretation) {
        return true;
      }
    }

    return false;
  }

  for (let windowSize = maxWindow; windowSize >= 1; windowSize--) {
    for (let start = 0; start <= contentWords.length - windowSize; start++) {
      const phraseTokens = contentWords.slice(start, start + windowSize);
      const phrase = phraseTokens.join(' ');
      const surroundingTokens = [
        ...contentWords.slice(0, start),
        ...contentWords.slice(start + windowSize),
        ...contextTokens,
      ];
      const resolved = resolveOptionCandidates(phrase, windowSize === 1, surroundingTokens, fuseCache);

      for (const option of resolved) {
        suggestions.push(option);
        if (option.ambiguous) continue;

        const support = getCandidateSupport(option, phraseTokens);
        if (!support.allSupported) continue;
        if (windowSize === 1 && hasCompetingAdjacentPhrase(start, start + windowSize, option)) continue;

        let resolvedSource = option.source;
        if (support.allDirectSupported) {
          if (option.source === 'alias' && phraseTokens.length >= 2) {
            resolvedSource = 'interpreted';
          } else if (option.source === 'fuzzy' && phraseTokens.length >= 2 && (option.score ?? 1) <= 0.08) {
            resolvedSource = 'interpreted';
          }
        }

        const score =
          windowSize * 100 +
          support.directValueCount * 10 +
          (SOURCE_PRIORITY[resolvedSource] || 0) -
          (option.score || 0);

        if (!bestMatch || score > bestMatch.rankScore) {
          bestMatch = {
            option: {
              ...option,
              source: resolvedSource,
            },
            start,
            end: start + windowSize,
            rankScore: score,
            metadata: {
              matchedWordCount: windowSize,
              matchedPhrase: phrase,
              matchStage: windowSize === 1 ? 'single' : 'segment',
              directSupportCount: support.directValueCount,
              allDirectSupported: support.allDirectSupported,
            },
          };
        }
      }
    }
  }

  return bestMatch;
}

function getCategoryWeight(categoryKey) {
  return CATEGORY_WEIGHT_OVERRIDES[categoryKey] || 3;
}

function getStudyCategoryValues(study, categoryKey, category) {
  if (category.type === 'object') {
    return category.options.filter(option => hasTaleaType(study, option));
  }

  if (category.type === 'value') {
    return study[category.dataKey] ? [study[category.dataKey]] : [];
  }

  if (category.type === 'array') {
    return Array.isArray(study[category.dataKey]) ? study[category.dataKey] : [];
  }

  if (category.type === 'innovation') {
    return category.options.filter(option => {
      if (option === 'Physical') return !!study.has_physical_innovation;
      if (option === 'Social') return !!study.has_social_innovation;
      if (option === 'Digital') return !!study.has_digital_innovation;
      return false;
    });
  }

  return [];
}

function addTextToTokenWeights(weightMap, text, weight) {
  const tokens = tokenizeText(text);
  for (const token of tokens) {
    weightMap.set(token, (weightMap.get(token) || 0) + weight);
  }
}

function appendBucketText(bucketMap, bucket, text) {
  if (!text) return;
  bucketMap[bucket] = bucketMap[bucket] ? `${bucketMap[bucket]} ${text}` : text;
}

function buildStudyDoc(study) {
  const tokenWeights = new Map();
  const bucketTexts = {
    title: '',
    location: '',
    people: '',
    narrative: '',
    taxonomy: '',
    meta: '',
  };

  for (const field of TEXT_FIELD_CONFIG) {
    const value = study[field.key];
    if (!value) continue;

    const text = Array.isArray(value) ? value.join(' ') : String(value);
    const normalized = normalizeText(text);
    if (!normalized) continue;

    appendBucketText(bucketTexts, field.bucket, normalized);
    addTextToTokenWeights(tokenWeights, normalized, field.weight);
  }

  for (const [categoryKey, category] of Object.entries(FILTER_CATEGORIES)) {
    const values = getStudyCategoryValues(study, categoryKey, category);
    if (values.length === 0) continue;

    const text = normalizeText(values.join(' '));
    if (!text) continue;

    appendBucketText(bucketTexts, 'taxonomy', text);
    addTextToTokenWeights(tokenWeights, text, getCategoryWeight(categoryKey));
  }

  return {
    id: study.id,
    study,
    tokenWeights,
    bucketTexts,
    normalizedFields: {
      title: normalizeText(study.title),
      city: normalizeText(study.city),
      country: normalizeText(study.country),
    },
    fullText: Object.values(bucketTexts).filter(Boolean).join(' '),
  };
}

function buildFuseDoc(studyDoc) {
  return {
    id: studyDoc.id,
    title: studyDoc.bucketTexts.title,
    location: studyDoc.bucketTexts.location,
    people: studyDoc.bucketTexts.people,
    narrative: studyDoc.bucketTexts.narrative,
    taxonomy: studyDoc.bucketTexts.taxonomy,
    fullText: studyDoc.fullText,
  };
}

const EXTENDED_SEARCH_KEYS = ['title', 'location', 'narrative', 'taxonomy', 'people', 'fullText'];

function escapeExtendedSearchToken(token) {
  return String(token || '').replace(/['|]/g, ' ').trim();
}

function buildExtendedSearchQuery(parsedQuery, searchLogic = 'and') {
  const searchTerms = parsedQuery.freeTextTokens.length > 0
    ? parsedQuery.freeTextTokens
    : parsedQuery.searchTokens;

  const normalizedTerms = [...new Set(
    searchTerms
      .map(escapeExtendedSearchToken)
      .filter(term => term.length >= 2)
  )];

  if (normalizedTerms.length === 0) return '';

  const clauses = normalizedTerms.map(term => ({
    $or: EXTENDED_SEARCH_KEYS.map(key => ({
      [key]: `'${term}`,
    })),
  }));

  if (clauses.length === 1) {
    return clauses[0];
  }

  return searchLogic === 'or'
    ? { $or: clauses }
    : { $and: clauses };
}

function getIdf(token, docFrequency, totalDocs) {
  const df = docFrequency.get(token) || 0;
  return Math.log(1 + (totalDocs + 1) / (df + 1));
}

function dedupeOptions(options) {
  const seen = new Set();
  return options.filter(option => {
    const key = `${option.categoryKey}:${option.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function attachMatchMetadata(option, metadata) {
  return {
    ...option,
    matchedWordCount: metadata.matchedWordCount,
    matchedPhrase: metadata.matchedPhrase,
    matchStage: metadata.matchStage,
  };
}

function buildQuerySegments(rawWords) {
  const segments = [];
  let currentWords = [];
  let currentExcluded = false;
  let connectorToPrev = null;

  function pushCurrentSegment() {
    const cleanedWords = currentWords
      .map(word => word.replace(/^-+/, ''))
      .filter(Boolean);

    if (cleanedWords.length === 0) return;

    segments.push({
      words: cleanedWords,
      excluded: currentExcluded || currentWords.some(word => word.startsWith('-')),
      connectorToPrev,
    });

    currentWords = [];
    currentExcluded = false;
    connectorToPrev = 'and';
  }

  for (const rawWord of rawWords) {
    if (!rawWord) continue;

    if (rawWord === 'and' || rawWord === 'or') {
      pushCurrentSegment();
      connectorToPrev = rawWord;
      continue;
    }

    if (NEGATION_WORDS.has(rawWord)) {
      pushCurrentSegment();
      currentExcluded = true;
      continue;
    }

    if (rawWord.startsWith('-')) {
      pushCurrentSegment();
      currentExcluded = true;
      currentWords.push(rawWord);
      continue;
    }

    currentWords.push(rawWord);
  }

  pushCurrentSegment();

  if (segments.length > 0 && segments[0].connectorToPrev === 'and') {
    segments[0].connectorToPrev = null;
  }

  return segments;
}

export function parseMultiWordQuery(query) {
  const rawWords = String(query || '')
    .toLowerCase()
    .replace(/[,;]+/g, ' ')
    .replace(/\//g, ' / ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

  if (rawWords.length === 0) {
    return {
      matches: [],
      exclusions: [],
      suggestions: [],
      searchTokens: [],
      freeTextTokens: [],
      pureFilterQuery: false,
      normalizedQuery: '',
      searchPhrases: [],
    };
  }

  const matches = [];
  const exclusions = [];
  const allSuggestions = [];
  const freeTextTokens = [];
  const categoryModes = {};
  const segments = buildQuerySegments(rawWords);
  const fuseCache = new Map();

  const suggestionKeys = new Set();
  function pushSuggestion(option) {
    const key = `${option.categoryKey}:${option.value}`;
    if (suggestionKeys.has(key)) return;
    suggestionKeys.add(key);
    allSuggestions.push(option);
  }

  function pushResolvedOption(option, excluded, metadata, connectorToPrev) {
    const target = excluded ? exclusions : matches;
    const key = `${option.categoryKey}:${option.value}`;
    if (target.some(entry => `${entry.categoryKey}:${entry.value}` === key)) return;
    target.push({
      ...attachMatchMetadata(option, metadata),
      connectorToPrev,
    });
  }

  const segmentContentWords = segments.map(segment => segment.words
      .map(word => normalizeText(word))
      .filter(Boolean)
      .filter(word => word.length >= 2 && !STOP_WORDS.has(word))
  );

  for (const [segmentIndex, segment] of segments.entries()) {
    const contentWords = segmentContentWords[segmentIndex];
    const segmentContextTokens = [
      ...(segmentContentWords[segmentIndex - 1] || []),
      ...(segmentContentWords[segmentIndex + 1] || []),
    ];

    if (contentWords.length === 0) continue;
    let remainingWords = [...contentWords];
    let connectorToPrev = segment.connectorToPrev;
    let matchedAny = false;

    while (remainingWords.length > 0) {
      const segmentSuggestions = [];
      const appliedMatch = findBestSegmentMatch(remainingWords, segmentContextTokens, segmentSuggestions, fuseCache);
      for (const option of segmentSuggestions) pushSuggestion(option);
      if (!appliedMatch) break;

      pushResolvedOption(
        appliedMatch.option,
        segment.excluded,
        appliedMatch.metadata,
        matchedAny ? 'and' : connectorToPrev
      );

      remainingWords = remainingWords.filter((_, index) => index < appliedMatch.start || index >= appliedMatch.end);
      matchedAny = true;
      connectorToPrev = 'and';
    }

    const hasOnlyStructureContextLeft = matchedAny
      && remainingWords.length > 0
      && remainingWords.every(token => ALL_CATEGORY_CONTEXT_TOKENS.has(token));

    if (remainingWords.length > 0 && !hasOnlyStructureContextLeft) {
      freeTextTokens.push(...remainingWords);
    }
  }

  const positiveMatches = dedupeOptions(matches).filter(match => !match.excluded);
  for (let index = 1; index < positiveMatches.length; index++) {
    const previous = positiveMatches[index - 1];
    const current = positiveMatches[index];
    if (previous.categoryKey !== current.categoryKey) continue;

    if (current.connectorToPrev === 'or') {
      categoryModes[current.categoryKey] = 'or';
    } else if (!categoryModes[current.categoryKey]) {
      categoryModes[current.categoryKey] = 'and';
    }
  }

  const CONNECTOR_WORDS = new Set(['and', 'or']);
  const searchTokens = rawWords
    .map(word => word.replace(/^-+/, ''))
    .map(word => normalizeText(word))
    .filter(word => word.length >= 2 && !STOP_WORDS.has(word) && !NEGATION_WORDS.has(word) && !CONNECTOR_WORDS.has(word));

  const normalizedQuery = normalizeText(query);
  const searchPhrases = buildPhrases(freeTextTokens.length > 0 ? freeTextTokens : searchTokens);

  return {
    matches: dedupeOptions(matches),
    exclusions: dedupeOptions(exclusions),
    suggestions: dedupeOptions(allSuggestions).sort((a, b) => a.score - b.score),
    searchTokens: [...new Set(searchTokens)],
    freeTextTokens: [...new Set(freeTextTokens)],
    categoryModes,
    pureFilterQuery: freeTextTokens.length === 0 && (matches.length > 0 || exclusions.length > 0),
    normalizedQuery,
    searchPhrases,
  };
}

function studyMatchesOption(study, option) {
  const category = FILTER_CATEGORIES[option.categoryKey];
  if (!category) return false;

  if (category.type === 'object') {
    return hasTaleaType(study, option.value);
  }

  if (category.type === 'value') {
    return study[category.dataKey] === option.value;
  }

  if (category.type === 'array') {
    return Array.isArray(study[category.dataKey]) && study[category.dataKey].includes(option.value);
  }

  if (category.type === 'innovation') {
    if (option.value === 'Physical') return !!study.has_physical_innovation;
    if (option.value === 'Social') return !!study.has_social_innovation;
    if (option.value === 'Digital') return !!study.has_digital_innovation;
  }

  return false;
}

function scorePhraseMatches(studyDoc, normalizedQuery, phrases) {
  let score = 0;
  const candidatePhrases = [];

  if (normalizedQuery && normalizedQuery.split(' ').length >= 2) {
    candidatePhrases.push(normalizedQuery);
  }
  candidatePhrases.push(...phrases);

  for (const phrase of candidatePhrases) {
    if (!phrase || phrase.length < 4) continue;

    for (const [bucket, bucketText] of Object.entries(studyDoc.bucketTexts)) {
      if (!bucketText) continue;
      if (bucketText.includes(phrase)) {
        score += PHRASE_BUCKET_WEIGHTS[bucket] || 4;
      }
    }
  }

  return score;
}

function scoreExactFieldMatches(studyDoc, parsedQuery) {
  const normalizedQuery = parsedQuery.normalizedQuery;
  if (!normalizedQuery) return 0;

  let score = 0;

  if (studyDoc.normalizedFields.city === normalizedQuery) {
    score += 24;
  }

  if (studyDoc.normalizedFields.country === normalizedQuery) {
    score += 16;
  }

  if (studyDoc.normalizedFields.title === normalizedQuery) {
    score += 18;
  }

  return score;
}

function scoreStudyDoc(studyDoc, parsedQuery, index, fuseBoost) {
  let score = fuseBoost;
  let matchedTokens = 0;

  for (const token of parsedQuery.searchTokens) {
    const weightedFrequency = studyDoc.tokenWeights.get(token);
    if (!weightedFrequency) continue;
    matchedTokens += 1;
    score += weightedFrequency * getIdf(token, index.docFrequency, index.totalDocs) * 1.45;
  }

  if (parsedQuery.searchTokens.length > 0 && matchedTokens > 0) {
    score += (matchedTokens / parsedQuery.searchTokens.length) * 8;
  }

  const phraseScore = scorePhraseMatches(studyDoc, parsedQuery.normalizedQuery, parsedQuery.searchPhrases);
  const exactFieldScore = scoreExactFieldMatches(studyDoc, parsedQuery);

  score += phraseScore;
  score += exactFieldScore;

  for (const option of parsedQuery.matches) {
    if (studyMatchesOption(studyDoc.study, option)) {
      score += 10 - Math.min(option.score * 20, 4);
    }
  }

  for (const option of parsedQuery.exclusions) {
    if (studyMatchesOption(studyDoc.study, option)) {
      score -= 16;
    }
  }

  return {
    score,
    matchedTokens,
    phraseScore,
    exactFieldScore,
    fuseBoost,
  };
}

function passesSearchLogic(parsedQuery, searchLogic, scoreDetails, hasExtendedFuseMatch) {
  const tokenCount = parsedQuery.searchTokens.length;
  const hasSignal = scoreDetails.matchedTokens > 0
    || scoreDetails.phraseScore > 0
    || scoreDetails.exactFieldScore > 0
    || scoreDetails.fuseBoost > 0;

  if (tokenCount === 0) {
    return parsedQuery.matches.length > 0 || parsedQuery.exclusions.length > 0 || hasSignal;
  }

  if (searchLogic === 'or' || tokenCount === 1) {
    return hasSignal || hasExtendedFuseMatch;
  }

  return (
    scoreDetails.matchedTokens === tokenCount
    || scoreDetails.phraseScore > 0
    || scoreDetails.exactFieldScore > 0
    || hasExtendedFuseMatch
  );
}

export function createLocalSearchIndex(caseStudies) {
  const studyDocs = caseStudies.map(buildStudyDoc);
  const docFrequency = new Map();

  for (const studyDoc of studyDocs) {
    const uniqueTokens = new Set(studyDoc.tokenWeights.keys());
    for (const token of uniqueTokens) {
      docFrequency.set(token, (docFrequency.get(token) || 0) + 1);
    }
  }

  const fuseDocs = studyDocs.map(buildFuseDoc);
  const studyFuse = new Fuse(fuseDocs, {
    keys: [
      { name: 'title', weight: 4 },
      { name: 'location', weight: 2.5 },
      { name: 'narrative', weight: 2.2 },
      { name: 'taxonomy', weight: 2 },
      { name: 'people', weight: 1.4 },
      { name: 'fullText', weight: 1 },
    ],
    threshold: 0.34,
    distance: 180,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
  });

  const studyExtendedFuse = new Fuse(fuseDocs, {
    keys: [
      { name: 'title', weight: 4 },
      { name: 'location', weight: 2.5 },
      { name: 'narrative', weight: 2.2 },
      { name: 'taxonomy', weight: 2 },
      { name: 'people', weight: 1.4 },
      { name: 'fullText', weight: 1 },
    ],
    threshold: 0.34,
    distance: 180,
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 2,
    useExtendedSearch: true,
  });

  return {
    studyDocs,
    studyFuse,
    studyExtendedFuse,
    docFrequency,
    totalDocs: studyDocs.length,
  };
}

export function runLocalRetrieval(query, index, allStudies, parsedQueryOverride = null, searchLogic = 'and') {
  if (!query || query.length < 2 || !index) return null;

  const parsedQuery = parsedQueryOverride || parseMultiWordQuery(query);
  if (
    parsedQuery.searchTokens.length === 0 &&
    parsedQuery.matches.length === 0 &&
    parsedQuery.exclusions.length === 0
  ) {
    return null;
  }

  const fuseBoostById = new Map();
  const extendedSearchQuery = buildExtendedSearchQuery(parsedQuery, searchLogic);
  const extendedResultIds = [];

  if (extendedSearchQuery) {
    for (const result of index.studyExtendedFuse.search(extendedSearchQuery).slice(0, 60)) {
      const boost = Math.max(0, (1 - (result.score ?? 1)) * 18);
      const currentBoost = fuseBoostById.get(result.item.id) || 0;
      fuseBoostById.set(result.item.id, Math.max(currentBoost, boost));
      extendedResultIds.push(result.item.id);
    }
  }

  for (const result of index.studyFuse.search(query).slice(0, 60)) {
    const boost = Math.max(0, (1 - (result.score ?? 1)) * 16);
    fuseBoostById.set(result.item.id, Math.max(fuseBoostById.get(result.item.id) || 0, boost));
  }

  const scored = [];
  for (const studyDoc of index.studyDocs) {
    const scoreDetails = scoreStudyDoc(studyDoc, parsedQuery, index, fuseBoostById.get(studyDoc.id) || 0);
    if (!passesSearchLogic(parsedQuery, searchLogic, scoreDetails, fuseBoostById.has(studyDoc.id))) {
      continue;
    }

    if (scoreDetails.score > 0.35) {
      scored.push({ study: studyDoc.study, studyDoc, score: scoreDetails.score });
    }
  }

  if (scored.length === 0 && fuseBoostById.size > 0) {
    const studyById = new Map(allStudies.map(study => [study.id, study]));
    if (searchLogic === 'and' && extendedResultIds.length > 0) {
      return [...new Set(extendedResultIds)]
        .map(id => studyById.get(id))
        .filter(Boolean);
    }

    if (searchLogic === 'and') {
      return [];
    }

    return [...fuseBoostById.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => studyById.get(id))
      .filter(Boolean);
  }

  const sorted = scored
    .sort((a, b) => b.score - a.score || String(a.study.title).localeCompare(String(b.study.title)));

  const topScore = sorted[0]?.score || 0;
  const hasFreeText = parsedQuery.freeTextTokens.length > 0;
  const relativeThreshold = hasFreeText ? topScore * 0.26 : topScore * 0.18;
  const absoluteThreshold = hasFreeText ? 2.5 : 1.5;
  const minScore = Math.max(absoluteThreshold, relativeThreshold);
  const guaranteedResults = hasFreeText ? 8 : 12;
  const maxResults = hasFreeText ? 30 : 40;

  if (searchLogic === 'and' && parsedQuery.searchTokens.length > 1) {
    const extendedResultIdSet = new Set(extendedResultIds);
    return sorted
      .filter(entry => {
        if (extendedResultIdSet.size > 0) {
          return extendedResultIdSet.has(entry.study.id);
        }

        return parsedQuery.searchTokens.every(token => entry.studyDoc.tokenWeights.has(token));
      })
      .slice(0, maxResults)
      .map(entry => entry.study);
  }

  return sorted
    .filter((entry, index) => index < guaranteedResults || entry.score >= minScore)
    .slice(0, maxResults)
    .map(entry => entry.study);
}

export function getLocalFilterSuggestions(query, parsedQueryOverride = null) {
  if (!query || query.length < 2) return [];

  const parsedQuery = parsedQueryOverride || parseMultiWordQuery(query);
  const suggestions = [...parsedQuery.suggestions];

  if (suggestions.length < 12) {
    const fallbackSearchTerms = [query, ...parsedQuery.freeTextTokens];
    for (const term of fallbackSearchTerms) {
      const results = optionFuse.search(term).slice(0, 6);
      for (const result of results) {
        if ((result.score ?? 1) > 0.22) continue;
        suggestions.push({
          ...result.item,
          score: result.score ?? 0.5,
          source: 'fuzzy',
          ambiguous: false,
        });
      }
    }
  }

  return dedupeOptions(suggestions)
    .sort((a, b) => a.score - b.score)
    .slice(0, 12)
    .map(option => ({
      categoryKey: option.categoryKey,
      category: option.category,
      value: option.value,
      color: option.color,
      icon: option.icon,
      score: option.score,
      source: option.source,
    }));
}
