import { FILTER_CATEGORIES } from '../data/filterConfig';
import { studyMatchesCategory } from './filterMatcher';

const WORKER_URL = process.env.REACT_APP_WORKER_URL || 'https://talea-abacus-api.your-worker.workers.dev';
const MAX_HISTORY_PAIRS = 5;

export async function sendDeepAIQuery(userMessage, chatHistory = []) {
  const recentHistory = chatHistory.slice(-MAX_HISTORY_PAIRS * 2);

  const response = await fetch(`${WORKER_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userMessage,
      history: recentHistory,
    }),
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

export function applyAIFilters(aiFilters, caseStudies) {
  if (!aiFilters || !caseStudies) return caseStudies;

  let results = [...caseStudies];

  // Apply structured filter categories
  for (const categoryKey of Object.keys(FILTER_CATEGORIES)) {
    const filterValues = aiFilters[categoryKey];
    if (!filterValues || !Array.isArray(filterValues) || filterValues.length === 0) continue;

    results = results.filter(study =>
      studyMatchesCategory(study, categoryKey, filterValues, 'or')
    );
  }

  // Apply city filter (case-insensitive partial match)
  if (aiFilters.city) {
    const cityLower = aiFilters.city.toLowerCase();
    results = results.filter(study =>
      (study.city || '').toLowerCase().includes(cityLower)
    );
  }

  // Apply country filter (case-insensitive partial match)
  if (aiFilters.country) {
    const countryLower = aiFilters.country.toLowerCase();
    results = results.filter(study =>
      (study.country || '').toLowerCase().includes(countryLower)
    );
  }

  // Apply year range filter
  if (aiFilters.year_min != null || aiFilters.year_max != null) {
    results = results.filter(study => {
      const yearMatch = String(study.year || '').match(/\d{4}/);
      if (!yearMatch) return false;
      const year = parseInt(yearMatch[0], 10);
      if (aiFilters.year_min != null && year < aiFilters.year_min) return false;
      if (aiFilters.year_max != null && year > aiFilters.year_max) return false;
      return true;
    });
  }

  return results;
}
