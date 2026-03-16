import Fuse from 'fuse.js';
import { FILTER_CATEGORIES } from '../data/filterConfig';
import { studyMatchesCategory } from './filterMatcher';

const WORKER_URL = process.env.REACT_APP_WORKER_URL || 'https://talea-abacus-api.your-worker.workers.dev';

export async function sendDeepAIQuery(userMessage) {
  const response = await fetch(`${WORKER_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userMessage }),
  });

  if (response.status === 429) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(new Error('Rate limit reached'), { status: 429, data });
  }

  if (!response.ok) {
    throw Object.assign(new Error(`Worker returned ${response.status}`), { status: response.status });
  }

  const remaining = parseInt(response.headers.get('X-RateLimit-Remaining') || '-1', 10);
  const data = await response.json();
  data._remaining = remaining;
  return data;
}

export async function analyzeProjects(query, projects, scenarios) {
  const trimmed = projects.slice(0, 10).map(p => ({
    title: p.title,
    description: (p.description || '').slice(0, 500),
    city: p.city,
    country: p.country,
    scenario: p._scenarioLabel || undefined,
  }));

  const body = { query, projects: trimmed };
  if (scenarios && scenarios.length > 1) {
    body.scenarios = scenarios.map(s => s.label || s);
  }

  const response = await fetch(`${WORKER_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Analyze returned ${response.status}`);
  }

  return response.json();
}

/**
 * Fuzzy match a query string against a list of candidate values.
 * Tries: exact case-insensitive → substring → Fuse.js fallback.
 */
function fuzzyMatchField(query, candidates, threshold = 0.4) {
  if (!query || !candidates.length) return false;
  const q = query.toLowerCase();

  // Exact match
  if (candidates.some(c => c.toLowerCase() === q)) return true;

  // Substring match
  if (candidates.some(c => c.toLowerCase().includes(q) || q.includes(c.toLowerCase()))) return true;

  // Fuse.js fallback
  const fuse = new Fuse(candidates, { threshold, includeScore: true });
  const results = fuse.search(query);
  return results.length > 0;
}

/**
 * Check whether a single study passes a single filter key.
 */
function studyPassesKey(study, key, aiFilters) {
  if (key === 'city' && aiFilters.city) {
    return fuzzyMatchField(aiFilters.city, [study.city || '']);
  }
  if (key === 'country' && aiFilters.country) {
    return fuzzyMatchField(aiFilters.country, [study.country || '']);
  }
  if (FILTER_CATEGORIES[key] && aiFilters[key]?.length > 0) {
    return studyMatchesCategory(study, key, aiFilters[key], 'or');
  }
  // Key has no active filter value — treat as automatically passed
  return true;
}

/**
 * Build scenarios array from match_logic, with backward compatibility.
 *
 * Supports:
 *   - New format: match_logic.scenarios (array of { required, label })
 *   - Old format: match_logic.required (flat array of keys) → single scenario
 *   - Missing:    all active filter keys → single scenario
 */
function buildScenarios(aiFilters) {
  const ml = aiFilters.match_logic;

  // New scenario format
  if (ml?.scenarios && ml.scenarios.length > 0) {
    return ml.scenarios;
  }

  // Old flat required/optional format → one scenario
  if (ml?.required && ml.required.length > 0) {
    return [{ required: ml.required, label: 'Search' }];
  }

  // No match_logic at all — treat every active filter as one AND-group
  const allKeys = [
    ...Object.keys(FILTER_CATEGORIES).filter(k => aiFilters[k]?.length > 0),
    ...(aiFilters.city ? ['city'] : []),
    ...(aiFilters.country ? ['country'] : []),
  ];
  return [{ required: allKeys, label: 'Search' }];
}

export function applyAIFilters(aiFilters, caseStudies) {
  if (!aiFilters || !caseStudies) return caseStudies;

  const scenarios = buildScenarios(aiFilters);
  const optionalKeys = aiFilters.match_logic?.optional || [];

  // ---- Run each scenario (AND within), then union results (OR across) ----
  const seen = new Set();
  let unionResults = [];

  for (const scenario of scenarios) {
    let pool = caseStudies;

    for (const key of scenario.required) {
      pool = pool.filter(study => studyPassesKey(study, key, aiFilters));
    }

    for (const study of pool) {
      const uid = study.id || study.title;
      if (!seen.has(uid)) {
        seen.add(uid);
        study._scenarioLabel = scenario.label;
        unionResults.push(study);
      }
    }
  }

  // ---- Year filters always strict, applied globally ----
  if (aiFilters.year_min != null || aiFilters.year_max != null) {
    unionResults = unionResults.filter(study => {
      const yearMatch = String(study.year || '').match(/\d{4}/);
      if (!yearMatch) return false;
      const year = parseInt(yearMatch[0], 10);
      if (aiFilters.year_min != null && year < aiFilters.year_min) return false;
      if (aiFilters.year_max != null && year > aiFilters.year_max) return false;
      return true;
    });
  }

  // ---- Exclude filtering (NOT logic) ----
  const ex = aiFilters.exclude;
  if (ex) {
    if (ex.country) {
      unionResults = unionResults.filter(study => !fuzzyMatchField(ex.country, [study.country || '']));
    }
    if (ex.city) {
      unionResults = unionResults.filter(study => !fuzzyMatchField(ex.city, [study.city || '']));
    }
    if (ex.categories && ex.categories.length > 0) {
      unionResults = unionResults.filter(study => {
        for (const cat of ex.categories) {
          if (studyMatchesCategory(study, cat.key, cat.values, 'or')) return false;
        }
        return true;
      });
    }
  }

  // ---- Keywords: fuzzy boost (affects ranking, not hard-filtering) ----
  const keywords = aiFilters.keywords;
  let keywordScores = null;
  if (keywords && keywords.length > 0) {
    const textFields = ['title', 'description', 'city', 'designer', 'physical_innovation', 'social_innovation', 'digital_innovation'];
    const docs = unionResults.map(study => {
      const text = textFields.map(f => study[f] || '').join(' ');
      return { id: study.id || study.title, text };
    });
    const fuse = new Fuse(docs, { keys: ['text'], threshold: 0.4, includeScore: true });
    keywordScores = new Map();
    for (const kw of keywords) {
      const hits = fuse.search(kw);
      for (const hit of hits) {
        const prev = keywordScores.get(hit.item.id) || 0;
        keywordScores.set(hit.item.id, prev + (1 - (hit.score || 0)));
      }
    }
  }

  // ---- Score every study: optional keys + scenario matches + keywords ----
  const scored = unionResults.map(study => {
    let score = 0;
    for (const key of optionalKeys) {
      if (studyPassesKey(study, key, aiFilters)) score++;
    }
    for (const scenario of scenarios) {
      if (scenario.required.every(key => studyPassesKey(study, key, aiFilters))) {
        score += 2;
      }
    }
    if (keywordScores) {
      score += (keywordScores.get(study.id || study.title) || 0);
    }
    study._aiScore = score;
    return { study, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.study);
}

// ---------------------------------------------------------------------------
// Thinking Model (Two-Pass Deep Analysis)
// ---------------------------------------------------------------------------

async function fetchWithErrorHandling(url, options) {
  const response = await fetch(url, options);

  if (response.status === 429) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(new Error('Rate limit reached'), { status: 429, data });
  }

  if (!response.ok) {
    throw Object.assign(new Error(`Worker returned ${response.status}`), { status: response.status });
  }

  return response;
}

/**
 * Two-pass thinking query.
 *
 * Pass 1 (stateless): softer filter generation → broad candidate pool.
 * Pass 2 (stateless): expert judge scores candidates → max 3 (or 0) top picks.
 *
 * The two passes share NO context — only the user's original query and the
 * candidate project data travel between them via the frontend.
 */
export async function sendThinkingQuery(userMessage, caseStudies, { topN = 15, onProgress } = {}) {
  // ---- Pass 1: broad filter generation ----
  if (onProgress) onProgress('Analyzing your query...');

  const pass1Response = await fetchWithErrorHandling(`${WORKER_URL}/api/think-pass1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: userMessage }),
  });

  const remaining = parseInt(pass1Response.headers.get('X-RateLimit-Remaining') || '-1', 10);
  const aiFilters = await pass1Response.json();

  // Apply filters locally to get candidate pool
  const filtered = applyAIFilters(aiFilters, caseStudies);

  if (filtered.length === 0) {
    return {
      filters: aiFilters,
      filtered: [],
      topStudies: [],
      pass2: null,
      _remaining: remaining,
      summary: aiFilters.summary || 'No matching projects found for deep analysis.',
    };
  }

  // Take top N for pass 2
  const candidates = filtered.slice(0, topN);

  if (onProgress) onProgress(`Found ${filtered.length} candidates, deep-scanning top ${candidates.length}...`);

  // ---- Pass 2: expert judge evaluation (stateless — receives only the
  //      user's ORIGINAL query + candidate JSONs, no pass1 context) ----
  const pass2Response = await fetchWithErrorHandling(`${WORKER_URL}/api/think-pass2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: userMessage, projects: candidates }),
  });

  const pass2Data = await pass2Response.json();

  // ---- Map pass2 results back to full study objects ----
  // Pass2 returns max 3 (or 0) top_projects with { id, title, relevance_score }.
  // We resolve each back to the full React state object by matching id or title.
  const topStudies = [];
  if (pass2Data.top_projects && pass2Data.top_projects.length > 0) {
    for (const p of pass2Data.top_projects) {
      const fullStudy = caseStudies.find(
        s => String(s.id) === String(p.id) || s.title === p.title
      );
      if (fullStudy) {
        fullStudy._aiScore = p.relevance_score;
        fullStudy._aiExplanation = p.explanation;
        topStudies.push(fullStudy);
      }
    }
  }

  // Score the broader pool: studies approved by the judge get their score,
  // everything else sinks to 0 so the grid shows judge picks first.
  const approvedIds = new Set(topStudies.map(s => s.id || s.title));
  for (const study of filtered) {
    if (!approvedIds.has(study.id) && !approvedIds.has(study.title)) {
      study._aiScore = 0;
    }
  }
  filtered.sort((a, b) => (b._aiScore || 0) - (a._aiScore || 0));

  return {
    filters: aiFilters,
    filtered,
    topStudies,
    pass2: pass2Data,
    _remaining: remaining,
    summary: aiFilters.summary,
  };
}
