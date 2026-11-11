import { useState, useMemo, useCallback, useRef, useEffect, useDeferredValue } from 'react';
import staticCaseStudies from './data/caseStudies.json';
import { FILTER_CATEGORIES } from './data/filterConfig';
import { generateChatResponse, WELCOME_MESSAGE, isGreeting } from './utils/fuzzySearch';
import { parseYearRange } from './utils/yearRange';
import { searchCases, resultsAmong } from './utils/textSearch';
import { studyMatchesAllFilters } from './utils/filterMatcher';
import { exportFilteredResultsPDF } from './utils/pdfExport';
import { downloadCSV, downloadExcel } from './utils/dataExport';
import { executeCommand } from './utils/commandHandler';
import SearchBar from './components/SearchBar';
import FilterCanvas from './components/FilterCanvas';
import CaseStudyGrid from './components/CaseStudyGrid';
import CaseStudyModal from './components/CaseStudyModal';
import SubmitForm from './components/SubmitForm';
import Header from './components/Header';
import MapView from './components/MapView';
import CompareMode from './components/CompareMode';
import StatsPanel from './components/StatsPanel';
import HelpPopup from './components/HelpPopup';
import DeepAISearch from './components/DeepAISearch';
import './App.css';

// Studies come only from the static JSON (synced via nightly build).
// User submissions go through Google Sheet → approval → sync pipeline.

// URL hash helpers
// Each text search is its own q= (joined, "Paris or Lyon" + "green roof" would change meaning).
// f_ = filters, x_ = excluded filters, m_ = categories in OR mode
function encodeStateToHash(activeFilters, searchQueries, excludedFilters = {}, filterModes = {}) {
  const params = new URLSearchParams();
  for (const q of searchQueries) params.append('q', q);
  for (const [key, values] of Object.entries(activeFilters)) {
    if (values.length > 0) params.set(`f_${key}`, values.join('|'));
    if (values.length > 0 && filterModes[key] === 'or') params.set(`m_${key}`, 'or');
  }
  for (const [key, values] of Object.entries(excludedFilters)) {
    if (values.length > 0) params.set(`x_${key}`, values.join('|'));
  }
  return params.toString();
}

function decodeHashToState(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const filters = {};
  const excluded = {};
  const modes = {};
  const queries = [];
  for (const [key, value] of params.entries()) {
    if (key === 'q') {
      if (value.trim()) queries.push(value.trim());
    } else if (key.startsWith('f_')) {
      filters[key.slice(2)] = value.split('|');
    } else if (key.startsWith('x_')) {
      excluded[key.slice(2)] = value.split('|');
    } else if (key.startsWith('m_') && value === 'or') {
      modes[key.slice(2)] = 'or';
    }
  }
  return { filters, excluded, modes, queries };
}

function App() {
  const caseStudies = staticCaseStudies;

  // Cookie consent
  const [cookieConsent, setCookieConsent] = useState(() => localStorage.getItem('talea_cookie_consent') === 'true');

  const acceptCookies = useCallback(() => {
    localStorage.setItem('talea_cookie_consent', 'true');
    setCookieConsent(true);
  }, []);

  // Theme
  const [theme, setTheme] = useState(() => localStorage.getItem('talea_theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('talea_theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  // Favorites
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('talea_favorites') || '[]'); }
    catch { return []; }
  });
  const [showFavorites, setShowFavorites] = useState(false);

  const toggleFavorite = useCallback((id) => {
    setFavorites(prev => {
      const updated = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      localStorage.setItem('talea_favorites', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Core state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchContexts, setSearchContexts] = useState([]);
  const [activeFilters, setActiveFilters] = useState({});
  const [excludedFilters, setExcludedFilters] = useState({});
  const [canvasFilters, setCanvasFilters] = useState([]);
  const [filterModes, setFilterModes] = useState({}); // { [categoryKey]: 'or' | 'and' }, default 'and'
  const [selectedStudy, setSelectedStudy] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState('grid');
  const [sortBy, setSortBy] = useState('default');
  const [showStats, setShowStats] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [helpPage, setHelpPage] = useState(0);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [showRefineSearch, setShowRefineSearch] = useState(false);
  const [showDeepAI, setShowDeepAI] = useState(false); // false | 'overlay' | 'sidebar'
  const [aiPrefill, setAiPrefill] = useState(null); // { text, send } written in the search bar (AI mode)
  // Current panel state for callbacks that finish later (a search ending in the background
  // must not bring the AI results back into the grid after the panel was closed).
  const showDeepAIRef = useRef(showDeepAI);
  showDeepAIRef.current = showDeepAI;
  // The assistant stays mounted after the first open, so a search keeps running when it is closed.
  const [aiMounted, setAiMounted] = useState(false);
  const [aiBackgroundStatus, setAiBackgroundStatus] = useState(null); // null | 'working' | 'ready'
  const [aiFilteredStudies, setAiFilteredStudies] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    { role: 'bot', text: WELCOME_MESSAGE, type: 'greeting' },
  ]);
  const [committedQuery, setCommittedQuery] = useState('');
  const searchInputQuery = searchQuery.startsWith('/') ? '' : searchQuery.trim();
  const deferredSearchQuery = useDeferredValue(searchInputQuery);
  const rawSuggestionQuery = deferredSearchQuery.length >= 2 ? deferredSearchQuery : '';
  const [suggestionQuery, setSuggestionQuery] = useState('');
  useEffect(() => {
    if (!rawSuggestionQuery) {
      setSuggestionQuery('');
      return;
    }
    const timer = setTimeout(() => setSuggestionQuery(rawSuggestionQuery), 280);
    return () => clearTimeout(timer);
  }, [rawSuggestionQuery]);
  const activeTextQueries = useMemo(() => {
    const uniqueQueries = [];
    const seen = new Set();
    const candidates = [...searchContexts, deferredSearchQuery];

    for (const candidate of candidates) {
      const normalized = String(candidate || '').trim();
      if (normalized.length < 2) continue;

      const dedupeKey = normalized.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      uniqueQueries.push(normalized);
    }

    return uniqueQueries;
  }, [searchContexts, deferredSearchQuery]);

  // Compare mode
  const [compareIds, setCompareIds] = useState([]);
  const searchSectionRef = useRef(null);

  const toggleCompare = useCallback((id) => {
    setCompareIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : (prev.length >= 3 ? prev : [...prev, id]);
      if (next.length < 2) setShowCompare(false);
      return next;
    });
  }, []);

  // Read URL hash on mount
  useEffect(() => {
    if (window.location.hash) {
      const { filters, excluded, modes, queries } = decodeHashToState(window.location.hash);
      if (Object.keys(filters).length > 0) setActiveFilters(filters);
      if (Object.keys(excluded).length > 0) setExcludedFilters(excluded);
      if (Object.keys(modes).length > 0) setFilterModes(modes);
      // the filters also as chips of the filter canvas, as when they are added by hand
      const chips = [
        ...Object.entries(filters).flatMap(([categoryKey, values]) => values.map(value => ({ categoryKey, value }))),
        ...Object.entries(excluded).flatMap(([categoryKey, values]) => values.map(value => ({ categoryKey, value, excluded: true }))),
      ];
      if (chips.length) setCanvasFilters(chips.map((c, i) => ({ ...c, id: Date.now() + i })));
      if (queries.length) {
        setSearchContexts(queries);
        setCommittedQuery(queries[queries.length - 1]);
      }
    }
  }, []);

  // Update URL hash when filters change
  useEffect(() => {
    // the submitted searches, plus the text being typed (not a /command)
    const typed = searchQuery.trim();
    const queries = !typed.startsWith('/') && typed.length >= 2 ? [...searchContexts, typed] : searchContexts;
    const hash = encodeStateToHash(activeFilters, queries, excludedFilters, filterModes);
    if (hash) {
      window.history.replaceState(null, '', `#${hash}`);
    } else {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [activeFilters, searchQuery, searchContexts, excludedFilters, filterModes]);

  const shareURL = useCallback(() => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      alert('Link copied to clipboard!');
    }).catch(() => {
      prompt('Copy this link:', url);
    });
  }, []);

  const addCanvasFilter = useCallback((categoryKey, value) => {
    setCanvasFilters(prev => {
      const exists = prev.find(f => f.categoryKey === categoryKey && f.value === value);
      if (exists) return prev;
      return [...prev, { categoryKey, value, id: Date.now() + Math.random() }];
    });
    setActiveFilters(prev => {
      const current = prev[categoryKey] || [];
      if (current.includes(value)) return prev;
      return { ...prev, [categoryKey]: [...current, value] };
    });
    setExcludedFilters(prev => {
      const current = prev[categoryKey] || [];
      if (!current.includes(value)) return prev;
      const updated = current.filter(v => v !== value);
      if (updated.length === 0) {
        const { [categoryKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [categoryKey]: updated };
    });
  }, []);

  const addExcludedFilter = useCallback((categoryKey, value) => {
    setCanvasFilters(prev => {
      const exists = prev.find(f => f.categoryKey === categoryKey && f.value === value && f.excluded);
      if (exists) return prev;
      const cleaned = prev.filter(f => !(f.categoryKey === categoryKey && f.value === value));
      return [...cleaned, { categoryKey, value, id: Date.now() + Math.random(), excluded: true }];
    });
    setExcludedFilters(prev => {
      const current = prev[categoryKey] || [];
      if (current.includes(value)) return prev;
      return { ...prev, [categoryKey]: [...current, value] };
    });
    setActiveFilters(prev => {
      const current = prev[categoryKey] || [];
      if (!current.includes(value)) return prev;
      const updated = current.filter(v => v !== value);
      if (updated.length === 0) {
        const { [categoryKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [categoryKey]: updated };
    });
  }, []);

  const removeCanvasFilter = useCallback((filterId, categoryKey, value) => {
    setCanvasFilters(prev => prev.filter(f => f.id !== filterId));
    setActiveFilters(prev => {
      const current = prev[categoryKey] || [];
      if (!current.includes(value)) return prev;
      const updated = current.filter(v => v !== value);
      if (updated.length === 0) {
        const { [categoryKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [categoryKey]: updated };
    });
    setExcludedFilters(prev => {
      const current = prev[categoryKey] || [];
      if (!current.includes(value)) return prev;
      const updated = current.filter(v => v !== value);
      if (updated.length === 0) {
        const { [categoryKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [categoryKey]: updated };
    });
  }, []);

  const removeCanvasFilterByValue = useCallback((categoryKey, value) => {
    setCanvasFilters(prev => prev.filter(f => !(f.categoryKey === categoryKey && f.value === value)));
    setActiveFilters(prev => {
      const current = prev[categoryKey] || [];
      if (!current.includes(value)) return prev;
      const updated = current.filter(v => v !== value);
      if (updated.length === 0) {
        const { [categoryKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [categoryKey]: updated };
    });
    setExcludedFilters(prev => {
      const current = prev[categoryKey] || [];
      if (!current.includes(value)) return prev;
      const updated = current.filter(v => v !== value);
      if (updated.length === 0) {
        const { [categoryKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [categoryKey]: updated };
    });
  }, []);

  const toggleExcludeFilter = useCallback((categoryKey, value) => {
    const isCurrentlyExcluded = (excludedFilters[categoryKey] || []).includes(value);

    if (isCurrentlyExcluded) {
      setExcludedFilters(prev => {
        const current = prev[categoryKey] || [];
        if (!current.includes(value)) return prev;
        const updated = current.filter(v => v !== value);
        if (updated.length === 0) {
          const { [categoryKey]: _, ...rest } = prev;
          return rest;
        }
        return { ...prev, [categoryKey]: updated };
      });
      setActiveFilters(prev => {
        const current = prev[categoryKey] || [];
        if (current.includes(value)) return prev;
        return { ...prev, [categoryKey]: [...current, value] };
      });
      setCanvasFilters(prev => prev.map(f => {
        if (f.categoryKey === categoryKey && f.value === value) {
          return { ...f, excluded: false };
        }
        return f;
      }));
      return;
    }

    setActiveFilters(prev => {
      const current = prev[categoryKey] || [];
      if (!current.includes(value)) return prev;
      const updated = current.filter(v => v !== value);
      if (updated.length === 0) {
        const { [categoryKey]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [categoryKey]: updated };
    });
    setExcludedFilters(prev => {
      const current = prev[categoryKey] || [];
      if (current.includes(value)) return prev;
      return { ...prev, [categoryKey]: [...current, value] };
    });
    setCanvasFilters(prev => prev.map(f => {
      if (f.categoryKey === categoryKey && f.value === value) {
        return { ...f, excluded: true };
      }
      return f;
    }));
  }, [excludedFilters]);

  const setFilterMode = useCallback((categoryKey, mode) => {
    setFilterModes(prev => {
      const nextMode = mode === 'or' ? 'or' : 'and';
      if (prev[categoryKey] === nextMode) return prev;
      return {
        ...prev,
        [categoryKey]: nextMode,
      };
    });
  }, []);

  const clearAllFilters = useCallback(() => {
    setActiveFilters({});
    setExcludedFilters({});
    setCanvasFilters([]);
    setFilterModes({});
    setSearchQuery('');
    setSearchContexts([]);
    setCommittedQuery('');
  }, []);

  const clearStructuredFilters = useCallback(() => {
    setActiveFilters({});
    setExcludedFilters({});
    setCanvasFilters([]);
    setFilterModes({});
  }, []);

  // Ids of the cases passing these filters (and favorites), or null when nothing is set
  const passingIds = useCallback((filters, excluded = excludedFilters, modes = filterModes) => {
    const favoritesOn = showFavorites && favorites.length > 0;
    if (!favoritesOn && !Object.keys(filters).length && !Object.keys(excluded).length) return null;
    return new Set(caseStudies
      .filter(s => (!favoritesOn || favorites.includes(s.id)) && studyMatchesAllFilters(s, filters, excluded, modes))
      .map(s => s.id));
  }, [caseStudies, showFavorites, favorites, excludedFilters, filterModes]);
  const currentPassingIds = useMemo(() => passingIds(activeFilters), [passingIds, activeFilters]);

  // Text search (utils/textSearch.js): every submitted search and the text being typed.
  // A case must answer all of them. The search runs among the cases passing the filters, so a
  // sentence found only in part gives the best of those (filters are never applied by the search).
  const textRetrievalResults = useMemo(() => {
    if (activeTextQueries.length === 0) return null;
    return activeTextQueries.map(textQuery => ({ textQuery, ...searchCases(textQuery, caseStudies, currentPassingIds) }));
  }, [activeTextQueries, caseStudies, currentPassingIds]);

  // What the search did with each submitted search (no case with all the words, words not
  // found, "did you mean"), shown under the search bar
  const searchNotices = useMemo(() => (textRetrievalResults || [])
    .filter(r => searchContexts.includes(r.textQuery))
    .filter(r => r.match === 'partial' || r.match === 'none' || r.didYouMean)
    .map(r => ({ query: r.textQuery, match: r.match, notFound: r.notFound, didYouMean: r.didYouMean })),
  [textRetrievalResults, searchContexts]);

  const lexicalTextRankedStudies = useMemo(() => {
    if (!textRetrievalResults) return null;

    const scoreById = new Map();
    const bestRankById = new Map();
    const matchCountById = new Map();
    const studyById = new Map(caseStudies.map(study => [study.id, study]));
    const requiredMatches = textRetrievalResults.length;

    for (const { results } of textRetrievalResults) {
      results.forEach((study, index) => {
        const rankScore = 1 / (index + 1);
        scoreById.set(study.id, (scoreById.get(study.id) || 0) + rankScore);
        matchCountById.set(study.id, (matchCountById.get(study.id) || 0) + 1);
        if (!bestRankById.has(study.id) || index < bestRankById.get(study.id)) {
          bestRankById.set(study.id, index);
        }
      });
    }

    return [...scoreById.keys()]
      .filter(id => (matchCountById.get(id) || 0) >= requiredMatches)
      .sort((a, b) => {
        const scoreDiff = (scoreById.get(b) || 0) - (scoreById.get(a) || 0);
        if (Math.abs(scoreDiff) > 1e-9) return scoreDiff;

        const rankDiff = (bestRankById.get(a) || Number.MAX_SAFE_INTEGER)
          - (bestRankById.get(b) || Number.MAX_SAFE_INTEGER);
        if (rankDiff !== 0) return rankDiff;

        return String(studyById.get(a)?.title || '').localeCompare(String(studyById.get(b)?.title || ''));
      })
      .map(id => studyById.get(id))
      .filter(Boolean);
  }, [textRetrievalResults, caseStudies]);

  const activeTextRankedStudies = useMemo(() => {
    if (activeTextQueries.length === 0) return null;
    return lexicalTextRankedStudies;
  }, [activeTextQueries.length, lexicalTextRankedStudies]);

  const textFilteredIds = useMemo(() => {
    if (!activeTextRankedStudies) return null;

    return new Set(activeTextRankedStudies.map(study => study.id));
  }, [activeTextRankedStudies]);

  const filterBaseStudies = useMemo(() => {
    let base = aiFilteredStudies || activeTextRankedStudies || caseStudies;

    if (textFilteredIds && !aiFilteredStudies) {
      base = base.filter(study => textFilteredIds.has(study.id));
    }

    if (showFavorites && favorites.length > 0) {
      base = base.filter(s => favorites.includes(s.id));
    }

    return base;
  }, [aiFilteredStudies, activeTextRankedStudies, textFilteredIds, showFavorites, favorites, caseStudies]);

  // Filters whose values contain the words being typed (menu under the search bar):
  // clicking one applies it to the whole catalogue, so the number shown is the catalogue's
  const filterSuggestions = useMemo(() => {
    if (!suggestionQuery) return [];
    return searchCases(suggestionQuery, caseStudies).tagSuggestions.map(s => ({ ...s, count: s.total }));
  }, [suggestionQuery, caseStudies]);

  const filteredStudies = useMemo(() => {
    if (!Object.keys(activeFilters).length && !Object.keys(excludedFilters).length) return filterBaseStudies;
    // same rule used to count the suggestions below (studyMatchesAllFilters)
    return filterBaseStudies.filter(study => studyMatchesAllFilters(study, activeFilters, excludedFilters, filterModes));
  }, [filterBaseStudies, activeFilters, excludedFilters, filterModes]);

  // Cases the page would show with these searches and filters (same steps as above, AI aside):
  // used to tell what a click on a proposed filter does before it is clicked
  // With filters, counted quickly from two sets per search (resultsAmong, same cases as the full
  // search: .tmp/normal-search/counts.cjs); without filters, the full search.
  const resultsWith = useCallback((queries, filters, excluded, modes) => {
    const within = passingIds(filters, excluded, modes);
    if (within) {
      const ids = new Set(resultsAmong(queries, caseStudies, within));
      return caseStudies.filter(s => ids.has(s.id));
    }
    let base = caseStudies;
    for (const q of queries) {
      const ids = new Set(searchCases(q, caseStudies).results.map(s => s.id));
      base = base.filter(s => ids.has(s.id));
    }
    return base;
  }, [caseStudies, passingIds]);

  // Number of cases with these filters (the filter panel counts each option with it): the search
  // runs among the filtered cases, so it cannot start from the results of the current filters
  // (a value in OR mode widens them). With AI results, among those.
  const countWith = useCallback((filters, excluded, modes) => (aiFilteredStudies
    ? filterBaseStudies.filter(s => studyMatchesAllFilters(s, filters, excluded, modes)).length
    : resultsWith(activeTextQueries, filters, excluded, modes).length),
  [aiFilteredStudies, filterBaseStudies, resultsWith, activeTextQueries]);

  // What a click on a filter proposed after search r does. The words of r that the filter already
  // says (rest = r without them) are taken out when that gives the same cases as keeping them:
  // a case with the tag always has its words, so "green roof" + Extensive green roofs = the filter
  // alone. A sentence found only in part stays as it is (it orders the filtered cases; without the
  // filter words they could lose all the words they share with it), unless keeping it finds
  // nothing ("nodal": a TALEA type is not in the texts). count = cases after the click.
  const clickOutcome = useCallback((r, rest, nextFilters) => {
    const keep = resultsWith(activeTextQueries, nextFilters).length;
    if (rest === null || rest === undefined) return { count: keep, keepText: true };
    if (r.match !== 'all' && keep > 0) return { count: keep, keepText: true };
    const queries = activeTextQueries.map(q => (q === r.textQuery ? rest : q)).filter(q => q.trim().length >= 2);
    const without = resultsWith(queries, nextFilters).length;
    if (r.match === 'all' && without !== keep) return { count: keep, keepText: true };
    return { count: without, keepText: false };
  }, [resultsWith, activeTextQueries]);

  // A submitted search with the whole name of a filter in it ("rain garden", "school rain garden"):
  // offered first, as a filter "in your search". Offered only if the click does not widen the
  // results shown now (when every word was found)
  const filterNameOffers = useMemo(() => {
    if (aiFilteredStudies) return [];
    const offers = [];
    for (const r of (textRetrievalResults || []).filter(x => searchContexts.includes(x.textQuery))) {
      for (const n of r.filterNames || []) {
        const current = activeFilters[n.categoryKey] || [];
        if (current.includes(n.value) || (excludedFilters[n.categoryKey] || []).includes(n.value)) continue;
        const nextFilters = { ...activeFilters, [n.categoryKey]: [...current, n.value] };
        const { count, keepText } = clickOutcome(r, n.rest, nextFilters);
        if (count === 0 || (r.match === 'all' && count > filteredStudies.length)) continue;
        const cat = FILTER_CATEGORIES[n.categoryKey];
        offers.push({ ...n, query: r.textQuery, keepText, inSearch: true, category: cat.label, icon: cat.icon, color: cat.color, count });
      }
      const others = activeTextQueries.filter(q => q !== r.textQuery);
      // "single tree or row of trees": the values in OR mode, in place of the search. Not if the
      // category already has values in AND mode (switching the mode would change them too)
      const or = r.filterOr;
      if (or) {
        const current = activeFilters[or.categoryKey] || [];
        const mode = filterModes[or.categoryKey] || 'and';
        const values = or.values.filter(v => !current.includes(v));
        if (values.length && !(current.length && mode !== 'or')
          && !or.values.some(v => (excludedFilters[or.categoryKey] || []).includes(v))) {
          const nextFilters = { ...activeFilters, [or.categoryKey]: [...current, ...values] };
          const count = resultsWith(others, nextFilters, excludedFilters, { ...filterModes, [or.categoryKey]: 'or' }).length;
          const cat = FILTER_CATEGORIES[or.categoryKey];
          if (count > 0) {
            offers.push({ kind: 'or', categoryKey: or.categoryKey, values, value: or.values.join(' or '), query: r.textQuery, rest: '', keepText: false, inSearch: true, category: cat.label, icon: cat.icon, color: cat.color, count });
          }
        }
      }
      // "trees without square": the filter excluded, in place of the words of the exclusion
      for (const n of r.filterNot || []) {
        if ((activeFilters[n.categoryKey] || []).includes(n.value) || (excludedFilters[n.categoryKey] || []).includes(n.value)) continue;
        const nextExcluded = { ...excludedFilters, [n.categoryKey]: [...(excludedFilters[n.categoryKey] || []), n.value] };
        const queries = [...others, n.rest].filter(q => q.trim().length >= 2);
        const count = resultsWith(queries, activeFilters, nextExcluded).length;
        const cat = FILTER_CATEGORIES[n.categoryKey];
        if (count > 0) offers.push({ ...n, kind: 'not', query: r.textQuery, keepText: false, inSearch: true, category: cat.label, icon: cat.icon, color: 'var(--accent-red)', count });
      }
    }
    return offers;
  }, [aiFilteredStudies, textRetrievalResults, searchContexts, excludedFilters, activeFilters, filterModes, activeTextQueries, resultsWith, clickOutcome, filteredStudies.length]);

  // After a search: filters matching its words that would narrow the results shown now.
  // The click is simulated exactly (category modes and exclusions): number = results that would
  // remain. A filter that would widen them (a category in OR mode) or swap an excluded value
  // ("not X" → "X") is not a narrowing and is not offered.
  const narrowSuggestions = useMemo(() => {
    const submitted = (textRetrievalResults || []).filter(r => searchContexts.includes(r.textQuery));
    if (!submitted.length || filteredStudies.length < 2) return [];
    const seen = new Set();
    const out = [];
    for (const r of submitted) {
      for (const s of r.tagSuggestions) {
        const key = `${s.categoryKey}|${s.value}`;
        if (seen.has(key) || (activeFilters[s.categoryKey] || []).includes(s.value)
          || (excludedFilters[s.categoryKey] || []).includes(s.value)
          || filterNameOffers.some(o => o.categoryKey === s.categoryKey && (o.values || [o.value]).includes(s.value))) continue;
        seen.add(key);
        const nextFilters = { ...activeFilters, [s.categoryKey]: [...(activeFilters[s.categoryKey] || []), s.value] };
        const outcome = aiFilteredStudies
          ? { count: filterBaseStudies.filter(study => studyMatchesAllFilters(study, nextFilters, excludedFilters, filterModes)).length, keepText: true }
          : clickOutcome(r, s.rest, nextFilters);
        if (outcome.count > 0 && outcome.count < filteredStudies.length) out.push({ ...s, ...outcome, query: r.textQuery });
      }
    }
    return out.sort((a, b) => b.count - a.count).slice(0, 5);
  }, [textRetrievalResults, searchContexts, aiFilteredStudies, filterBaseStudies, filteredStudies, activeFilters, excludedFilters, filterModes, filterNameOffers, clickOutcome]);

  // Most recent year of a case ("2017–2019" → 2019, "late 1990s" → 1999), or 0 if none.
  const extractYear = useCallback((yearStr) => parseYearRange(yearStr)?.end || 0, []);

  const sortedStudies = useMemo(() => {
    if (sortBy === 'default') {
      if (aiFilteredStudies) {
        // Sort by AI relevance score descending
        return [...filteredStudies].sort((a, b) => (b._aiScore || 0) - (a._aiScore || 0));
      }
      return filteredStudies;
    }
    const sorted = [...filteredStudies];
    switch (sortBy) {
      case 'title-az': sorted.sort((a, b) => a.title.localeCompare(b.title)); break;
      case 'title-za': sorted.sort((a, b) => b.title.localeCompare(a.title)); break;
      case 'year-new': sorted.sort((a, b) => extractYear(b.year) - extractYear(a.year)); break;
      case 'year-old': sorted.sort((a, b) => extractYear(a.year) - extractYear(b.year)); break;
      case 'country': sorted.sort((a, b) => a.country.localeCompare(b.country)); break;
      case 'nbs-most': sorted.sort((a, b) => {
        const countNbs = s => (s.d1_plants?.length || 0) + (s.d2_paving?.length || 0) + (s.d3_water?.length || 0)
          + (s.d4_roof_facade?.length || 0) + (s.d5_furnishings?.length || 0) + (s.d6_urban_spaces?.length || 0);
        return countNbs(b) - countNbs(a);
      }); break;
      default: break;
    }
    return sorted;
  }, [filteredStudies, sortBy, extractYear, aiFilteredStudies]);

  const handleExportPDF = useCallback(() => {
    exportFilteredResultsPDF(filteredStudies, activeFilters);
  }, [filteredStudies, activeFilters]);

  const handleDownloadCSV = useCallback(() => {
    downloadCSV(filteredStudies);
  }, [filteredStudies]);

  const handleDownloadExcel = useCallback(() => {
    downloadExcel(filteredStudies);
  }, [filteredStudies]);

  // Refs for chat
  const filteredStudiesRef = useRef(filteredStudies);
  filteredStudiesRef.current = filteredStudies;
  const filterSuggestionsRef = useRef(filterSuggestions);
  filterSuggestionsRef.current = filterSuggestions;
  const searchContextsRef = useRef(searchContexts);
  searchContextsRef.current = searchContexts;
  const activeFiltersRef = useRef(activeFilters);
  activeFiltersRef.current = activeFilters;
  const filterModesRef = useRef(filterModes);
  filterModesRef.current = filterModes;
  const compareIdsRef = useRef(compareIds);
  compareIdsRef.current = compareIds;
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;
  const showFavoritesRef = useRef(showFavorites);
  showFavoritesRef.current = showFavorites;

  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    if (query.length < 2) setCommittedQuery('');
  }, []);

  const editSearchContext = useCallback((contextIndex) => {
    setSearchContexts(prev => {
      if (contextIndex < 0 || contextIndex >= prev.length) return prev;
      const next = [...prev];
      const [context] = next.splice(contextIndex, 1);
      if (context) {
        setSearchQuery(context);
      }
      return next;
    });
    setCommittedQuery('');
  }, []);

  const clearSearchContext = useCallback((contextIndex) => {
    setSearchContexts(prev => prev.filter((_, index) => index !== contextIndex));
  }, []);

  // "Did you mean": the search is replaced by the corrected one
  const replaceSearchContext = useCallback((oldContext, newContext) => {
    setSearchContexts(prev => {
      const next = prev.map(c => (c === oldContext ? newContext : c));
      return next.filter((c, i) => next.findIndex(x => x.toLowerCase() === c.toLowerCase()) === i);
    });
  }, []);

  // "Use the filter": the filter takes the place of its name in the search
  // ("school rain garden" → search "school" + filter Rain garden; "rain garden" → only the filter)
  const applyFilterForSearch = useCallback((offer) => {
    if (offer.kind === 'or') {
      offer.values.forEach(v => addCanvasFilter(offer.categoryKey, v));
      setFilterMode(offer.categoryKey, 'or');
    } else if (offer.kind === 'not') {
      addExcludedFilter(offer.categoryKey, offer.value);
    } else {
      addCanvasFilter(offer.categoryKey, offer.value);
    }
    if (offer.keepText) return; // a sentence found only in part stays as it is
    const rest = offer.rest.trim();
    setSearchContexts(prev => {
      if (rest.length < 2 || prev.some(c => c.toLowerCase() === rest.toLowerCase())) return prev.filter(c => c !== offer.query);
      return prev.map(c => (c === offer.query ? rest : c));
    });
  }, [addCanvasFilter, addExcludedFilter, setFilterMode]);

  const clearTextSearch = useCallback(() => {
    setSearchQuery('');
    setSearchContexts([]);
    setCommittedQuery('');
  }, []);

  const appendSearchContext = useCallback((nextContext) => {
    const normalizedContext = nextContext.trim();
    if (normalizedContext.length < 2) return;

    setSearchContexts(prev => {
      const alreadyExists = prev.some(entry => entry.toLowerCase() === normalizedContext.toLowerCase());
      if (alreadyExists) return prev;
      return [...prev, normalizedContext];
    });
  }, []);

  const handleSearchSubmit = useCallback(() => {
    // Handle slash commands
    if (searchQuery.startsWith('/') && searchQuery.length > 1) {
      const parts = searchQuery.trim().split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ');

      const { response, actions } = executeCommand(cmd, arg, {
        studies: filteredStudiesRef.current,
        allStudies: caseStudies,
        activeFilters: activeFiltersRef.current,
        filterModes: filterModesRef.current,
        showFavorites: showFavoritesRef.current,
        favorites: favoritesRef.current,
        compareIds: compareIdsRef.current,
      });

      // Apply side-effect actions
      if (actions.selectStudy) setSelectedStudy(actions.selectStudy);
      if (actions.setView) setView(actions.setView);
      if (actions.showStats) setShowStats(true);
      if (actions.exportPDF) handleExportPDF();
      if (actions.clearAll) clearAllFilters();
      if (actions.toggleFavorites) setShowFavorites(prev => !prev);
      if (actions.showCompare) setShowCompare(true);

      setChatMessages(prev => [
        ...prev.slice(-7),
        { role: 'user', text: searchQuery },
        { role: 'bot', text: response, type: 'command' }
      ]);
      setSearchQuery('');
      return;
    }

    // A search is kept as a text filter (chip): its words are searched in the texts and tags of
    // the cases. Filters are never applied from the words: matching ones are suggested.
    const submittedQuery = searchQuery.trim();
    if (submittedQuery.length < 2) return;
    setCommittedQuery(submittedQuery);
    if (!isGreeting(submittedQuery)) appendSearchContext(submittedQuery);
    setSearchQuery('');
  }, [searchQuery, caseStudies, appendSearchContext, clearAllFilters, handleExportPDF]);

  useEffect(() => {
    if (!committedQuery || committedQuery.length < 2) return;
    setChatMessages(prev => {
      const filtered = prev.filter(m => m.role !== 'typing');
      return [...filtered, { role: 'user', text: committedQuery }];
    });

    const response = generateChatResponse(committedQuery, filteredStudiesRef.current, filterSuggestionsRef.current, activeFiltersRef.current, searchContextsRef.current);
    if (response) {
      const timer = setTimeout(() => {
        setChatMessages(prev => {
          const recent = prev.slice(-7);
          // no filters proposed here: they are under the search bar ("Filter the results")
          return [...recent, { role: 'bot', text: response.message, type: response.type }];
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [committedQuery]);

  const clearChat = useCallback(() => {
    setChatMessages([
      { role: 'bot', text: WELCOME_MESSAGE, type: 'greeting' },
    ]);
    setCommittedQuery('');
  }, []);

  const openHelp = useCallback((page = 0) => {
    setHelpPage(page);
    setShowHelp(true);
  }, []);

  const overlayOpen = !!selectedStudy || showForm || showCompare || showStats || showHelp;

  const getScrollBehavior = useCallback(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return 'auto';
    }
    return 'smooth';
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: getScrollBehavior() });
  }, [getScrollBehavior]);

  const scrollToSearch = useCallback(() => {
    const searchTop = searchSectionRef.current
      ? Math.max(0, searchSectionRef.current.getBoundingClientRect().top + window.scrollY - 84)
      : 0;
    window.scrollTo({ top: searchTop, behavior: getScrollBehavior() });
  }, [getScrollBehavior]);

  useEffect(() => {
    function updateScrollShortcut() {
      if (overlayOpen) {
        setShowBackToTop(prev => (prev ? false : prev));
        setShowRefineSearch(prev => (prev ? false : prev));
        return;
      }

      const scrollY = window.scrollY || window.pageYOffset || 0;
      const nextState = scrollY > 520;
      const searchRect = searchSectionRef.current?.getBoundingClientRect();
      const nextRefineState = searchRect
        ? searchRect.bottom <= 96
        : scrollY > 360;

      setShowBackToTop(prev => (prev === nextState ? prev : nextState));
      setShowRefineSearch(prev => (prev === nextRefineState ? prev : nextRefineState));
    }

    updateScrollShortcut();
    window.addEventListener('scroll', updateScrollShortcut, { passive: true });
    window.addEventListener('resize', updateScrollShortcut);

    return () => {
      window.removeEventListener('scroll', updateScrollShortcut);
      window.removeEventListener('resize', updateScrollShortcut);
    };
  }, [overlayOpen, view, activeTextQueries.length]);

  const activeFilterCount = Object.values(activeFilters).reduce((sum, arr) => sum + arr.length, 0)
    + Object.values(excludedFilters).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className={`app${showDeepAI === 'sidebar' ? ' ai-sidebar-open' : ''}`}>
        <Header
          onShowForm={() => setShowForm(true)}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearStructuredFilters}
          hasActiveTextSearch={searchContexts.length > 0 || searchInputQuery.length >= 2}
          onClearTextSearch={clearTextSearch}
          resultCount={filteredStudies.length}
          totalCount={caseStudies.length}
        onExportPDF={handleExportPDF}
        onExportCSV={handleDownloadCSV}
        onExportExcel={handleDownloadExcel}
        theme={theme}
        onToggleTheme={toggleTheme}
        showFavorites={showFavorites}
        onToggleFavorites={() => setShowFavorites(prev => !prev)}
        favoritesCount={favorites.length}
        onShareURL={shareURL}
        onShowHelp={() => openHelp(0)}
      />

      <main className="main-content">
        <SearchBar
          sectionRef={searchSectionRef}
          query={searchQuery}
          searchContexts={searchContexts}
          searchNotices={searchNotices}
          narrowSuggestions={narrowSuggestions}
          filterNameOffers={filterNameOffers}
          onUseFilterForSearch={applyFilterForSearch}
          onReplaceSearchContext={replaceSearchContext}
          onQueryChange={handleSearch}
          onSearchSubmit={handleSearchSubmit}
          onOpenDeepAI={(text, send) => { if (text) setAiPrefill({ text, send: !!send }); setShowDeepAI('overlay'); setAiMounted(true); setAiBackgroundStatus(null); }}
          aiBackgroundStatus={aiBackgroundStatus}
          onClearSearchContext={clearSearchContext}
          onEditSearchContext={editSearchContext}
          onAddCanvasFilter={addCanvasFilter}
          onAddExcludedFilter={addExcludedFilter}
          onRemoveCanvasFilterByValue={removeCanvasFilterByValue}
          activeFilters={activeFilters}
          excludedFilters={excludedFilters}
          filterModes={filterModes}
          onSetFilterMode={setFilterMode}
          filterSuggestions={filterSuggestions}
          chatMessages={chatMessages}
          onClearChat={clearChat}
          countWith={countWith}
        />

        <div className="content-layout">
          <FilterCanvas
            canvasFilters={canvasFilters}
            onRemoveFilter={removeCanvasFilter}
            onAddFilter={addCanvasFilter}
            onAddExcludedFilter={addExcludedFilter}
            onClearAll={clearAllFilters}
            filteredCount={filteredStudies.length}
            totalCount={caseStudies.length}
            onToggleExclude={toggleExcludeFilter}
            excludedFilters={excludedFilters}
            onShowHelp={openHelp}
            activeFilters={activeFilters}
            filterModes={filterModes}
            onSetFilterMode={setFilterMode}
          />

          <div className="results-area">
            {aiFilteredStudies && (
              <div className="ai-results-banner">
                <div className="ai-results-banner-left">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.4 5.7 21l2.3-7L2 9.4h7.6z"/>
                  </svg>
                  <span>AI Search: {aiFilteredStudies.length} result{aiFilteredStudies.length !== 1 ? 's' : ''}</span>
                </div>
                <button className="ai-results-banner-clear" onClick={() => { setAiFilteredStudies(null); setShowDeepAI(false); }}>
                  Clear AI filter
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            )}
            <div className="results-header">
              <div className="results-heading">
                <span className="results-count">
                  {filteredStudies.length} of {aiFilteredStudies ? aiFilteredStudies.length : caseStudies.length} solutions
                  {activeTextQueries.length > 0 && !aiFilteredStudies && (
                    <span className="fuzzy-label"> (text search)</span>
                  )}
                  {showFavorites && <span className="fuzzy-label"> (favorites)</span>}
                  {aiFilteredStudies && <span className="fuzzy-label"> (AI search)</span>}
                </span>
                {showRefineSearch && (activeFilterCount > 0 || searchContexts.length > 0 || searchInputQuery.length >= 2) && (
                  <button
                    className="results-refine-link"
                    onClick={scrollToSearch}
                    title="Edit search and filters"
                    aria-label="Edit search and filters"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 18V6"/>
                      <path d="m7 11 5-5 5 5"/>
                    </svg>
                    Edit search
                  </button>
                )}
              </div>
              <div className="results-actions">
                <select className="sort-select" value={sortBy} onChange={e => setSortBy(e.target.value)} title="Sort results">
                  <option value="default">Sort: Default</option>
                  <option value="title-az">Title A → Z</option>
                  <option value="title-za">Title Z → A</option>
                  <option value="year-new">Year (newest)</option>
                  <option value="year-old">Year (oldest)</option>
                  <option value="country">Country A → Z</option>
                  <option value="nbs-most">Most NBS solutions</option>
                </select>
                <button className="stats-btn" onClick={() => setShowStats(true)} title="Statistics">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                  </svg>
                </button>
                <div className="view-toggle">
                  <button className={`view-btn ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')} title="Grid view">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                  </button>
                  <button className={`view-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')} title="List view">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                  </button>
                  <button className={`view-btn ${view === 'map' ? 'active' : ''}`} onClick={() => setView('map')} title="Map view">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                  </button>
                </div>
              </div>
            </div>

            {view === 'map' ? (
              <MapView studies={sortedStudies} onSelect={setSelectedStudy} />
            ) : (
              <CaseStudyGrid
                studies={sortedStudies}
                onSelect={setSelectedStudy}
                view={view}
                favorites={favorites}
                onToggleFavorite={toggleFavorite}
                compareIds={compareIds}
                onCompareToggle={toggleCompare}
              />
            )}

            {compareIds.length >= 1 && (
              <div className="compare-floating-bar">
                <span>
                  {compareIds.length === 1
                    ? '1 selected: add more to compare'
                    : `${compareIds.length} selected for comparison`}
                </span>
                <button
                  className="compare-btn"
                  onClick={() => setShowCompare(true)}
                  disabled={compareIds.length < 2}
                >
                  Compare{compareIds.length >= 2 ? ` (${compareIds.length})` : ''}
                </button>
                <button className="compare-clear" onClick={() => { setCompareIds([]); setShowCompare(false); }}>Clear</button>
              </div>
            )}
          </div>
        </div>
      </main>

      {selectedStudy && (
        <CaseStudyModal
          study={selectedStudy}
          onClose={() => setSelectedStudy(null)}
          isFavorite={favorites.includes(selectedStudy.id)}
          onToggleFavorite={toggleFavorite}
          isCompared={compareIds.includes(selectedStudy.id)}
          onToggleCompare={toggleCompare}
          compareCount={compareIds.length}
          onShowCompare={() => { setSelectedStudy(null); setShowCompare(true); }}
          allStudies={caseStudies}
          onSelectStudy={setSelectedStudy}
        />
      )}

      {showForm && (
        <SubmitForm onClose={() => setShowForm(false)} />
      )}

      {showCompare && compareIds.length >= 2 && (
        <CompareMode
          studies={caseStudies.filter(s => compareIds.includes(s.id))}
          onClose={() => setShowCompare(false)}
        />
      )}

      <StatsPanel
        studies={filteredStudies}
        isOpen={showStats}
        onClose={() => setShowStats(false)}
      />

      <HelpPopup
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        initialPage={helpPage}
      />

      {aiMounted && (
        <DeepAISearch
          caseStudies={caseStudies}
          mode={showDeepAI || 'overlay'}
          hidden={!showDeepAI}
          onBackgroundStatus={setAiBackgroundStatus}
          prefill={aiPrefill}
          onClose={() => { setShowDeepAI(false); setAiFilteredStudies(null); }}
          onSelectStudy={(study) => {
            setSelectedStudy(study);
          }}
          onFilteredResults={(studies) => {
            if (showDeepAIRef.current === 'sidebar') setAiFilteredStudies(studies);
          }}
          onToggleMode={(newMode) => setShowDeepAI(newMode)}
          onShowAllResults={(studies) => {
            setAiFilteredStudies(studies);
            setSortBy('default');
            setShowDeepAI('sidebar');
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {!overlayOpen && showBackToTop && (
        <div className={`scroll-shortcuts ${!cookieConsent ? 'with-cookie-banner' : ''}`}>
          <button
            className="scroll-shortcut-btn top"
            onClick={scrollToTop}
            title="Back to top"
            aria-label="Back to top"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20V6"/>
              <path d="m6 12 6-6 6 6"/>
            </svg>
          </button>
        </div>
      )}

      {!cookieConsent && (
        <div className="cookie-banner">
          <div className="cookie-banner-content">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><circle cx="12" cy="16" r="0.5" fill="currentColor"/>
            </svg>
            <p>
              This app uses <strong>local storage</strong> to save your preferences, favorites and AI chat.
              No tracking cookies or third-party analytics are used. Map tiles are served by <strong>OpenFreeMap</strong> without tracking.
              Questions to the <strong>AI Assistant</strong> are processed by Google Gemini and Cloudflare, and saved anonymously (no IP or other identifiers) to improve the search.
            </p>
            <button className="cookie-accept-btn" onClick={acceptCookies}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
