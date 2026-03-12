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
    throw new Error(`Worker returned ${response.status}`);
  }

  return response.json();
}

export async function analyzeProjects(query, projects) {
  const trimmed = projects.slice(0, 3).map(p => ({
    title: p.title,
    description: (p.description || '').slice(0, 500),
    city: p.city,
    country: p.country,
  }));

  const response = await fetch(`${WORKER_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, projects: trimmed }),
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

  // ---- Rank by optional keys + how many scenarios each study matched ----
  if (optionalKeys.length > 0 || scenarios.length > 1) {
    const scored = unionResults.map(study => {
      let score = 0;
      // Bonus per optional key matched
      for (const key of optionalKeys) {
        if (studyPassesKey(study, key, aiFilters)) score++;
      }
      // Bonus per scenario matched (rewards studies that fit multiple branches)
      if (scenarios.length > 1) {
        for (const scenario of scenarios) {
          if (scenario.required.every(key => studyPassesKey(study, key, aiFilters))) {
            score += 2; // heavier weight for full-scenario match
          }
        }
      }
      return { study, score };
    });

    scored.sort((a, b) => b.score - a.score);
    unionResults = scored.map(s => s.study);
  }

  return unionResults;
}
