import { useState, useMemo, useCallback, useRef, useEffect, useDeferredValue } from 'react';
import staticCaseStudies from './data/caseStudies.json';
import { FILTER_CATEGORIES } from './data/filterConfig';
import { generateChatResponse, findCommonFilters } from './utils/fuzzySearch';
import { createLocalSearchIndex, runLocalRetrieval, getLocalFilterSuggestions, parseMultiWordQuery } from './utils/localRetrieval';
import { studyMatchesAllFilters } from './utils/filterMatcher';
import { exportFilteredResultsPDF } from './utils/pdfExport';
import { downloadCSV, downloadExcel } from './utils/dataExport';
import { hasTaleaType } from './utils/getTaleaTypes';
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

const DEFAULT_FILTER_MODE = 'and';
const SEARCH_MODE_STORAGE_KEY = 'talea_search_mode';
const SEARCH_LOGIC_STORAGE_KEY = 'talea_search_logic';

function shouldAutoApplyParsedFilter(option, pureFilterQuery) {
  if (option.source === 'fuzzy') return false;
  if (option.source === 'alias') return false;
  if (pureFilterQuery) return true;
  if (option.source === 'exact' || option.source === 'token' || option.source === 'context') {
    return true;
  }
  return (option.matchedWordCount || 0) >= 2;
}

// Studies come only from the static JSON (synced via nightly build).
// User submissions go through Google Sheet → approval → sync pipeline.

// URL hash helpers
function encodeStateToHash(activeFilters, searchQuery) {
  const params = new URLSearchParams();
  if (searchQuery) params.set('q', searchQuery);
  for (const [key, values] of Object.entries(activeFilters)) {
    if (values.length > 0) params.set(`f_${key}`, values.join('|'));
  }
  return params.toString();
}

function decodeHashToState(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const filters = {};
  let query = '';
  for (const [key, value] of params.entries()) {
    if (key === 'q') {
      query = value;
    } else if (key.startsWith('f_')) {
      const catKey = key.slice(2);
      filters[catKey] = value.split('|');
    }
  }
  return { filters, query };
}

function App() {
  const caseStudies = staticCaseStudies;
  const localSearchIndex = useMemo(() => createLocalSearchIndex(caseStudies), [caseStudies]);

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
  const [searchMode, setSearchMode] = useState(() => localStorage.getItem(SEARCH_MODE_STORAGE_KEY) || 'both');
  const [searchLogic, setSearchLogic] = useState(() => localStorage.getItem(SEARCH_LOGIC_STORAGE_KEY) || 'and');
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
  const [aiFilteredStudies, setAiFilteredStudies] = useState(null);
  const [chatMessages, setChatMessages] = useState([
    { role: 'bot', text: "Welcome to the NBS Toolkit! I'm your TALEA Abacus assistant. Search for hardware solutions by typing anything \u2014 city names, NBS types, or even misspelled words. I'll find the best matches!", type: 'greeting' },
  ]);
  const [committedQuery, setCommittedQuery] = useState('');
  const searchInputQuery = searchQuery.startsWith('/') ? '' : searchQuery.trim();
  const deferredSearchQuery = useDeferredValue(searchInputQuery);
  const searchContextQuery = searchContexts.join(' ').trim();
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

  useEffect(() => {
    localStorage.setItem(SEARCH_MODE_STORAGE_KEY, searchMode);
  }, [searchMode]);

  useEffect(() => {
    localStorage.setItem(SEARCH_LOGIC_STORAGE_KEY, searchLogic);
  }, [searchLogic]);

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
      const { filters, query } = decodeHashToState(window.location.hash);
      if (Object.keys(filters).length > 0) setActiveFilters(filters);
      if (query) {
        setSearchContexts([query]);
        setCommittedQuery(query);
      }
    }
  }, []);

  // Update URL hash when filters change
  useEffect(() => {
    const hashQuery = searchQuery.startsWith('/')
      ? searchContextQuery
      : (searchQuery.trim().length >= 2 ? searchQuery.trim() : searchContextQuery);
    const hash = encodeStateToHash(activeFilters, hashQuery);
    if (hash) {
      window.history.replaceState(null, '', `#${hash}`);
    } else {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [activeFilters, searchQuery, searchContextQuery]);

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

  const parsedSuggestionQuery = useMemo(() => {
    if (!suggestionQuery) return null;
    return parseMultiWordQuery(suggestionQuery);
  }, [suggestionQuery]);

  const textRetrievalResults = useMemo(() => {
    if (activeTextQueries.length === 0) return null;

    return activeTextQueries.map((textQuery) => {
      const parsedQuery = parseMultiWordQuery(textQuery);
      const results = runLocalRetrieval(textQuery, localSearchIndex, caseStudies, parsedQuery, searchLogic) || [];
      return { textQuery, results };
    });
  }, [activeTextQueries, localSearchIndex, caseStudies, searchLogic]);

  const lexicalTextRankedStudies = useMemo(() => {
    if (!textRetrievalResults) return null;

    const scoreById = new Map();
    const bestRankById = new Map();
    const matchCountById = new Map();
    const studyById = new Map(caseStudies.map(study => [study.id, study]));
    const requiredMatches = searchLogic === 'or' ? 1 : textRetrievalResults.length;

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
  }, [textRetrievalResults, caseStudies, searchLogic]);

  const activeTextRankedStudies = useMemo(() => {
    if (activeTextQueries.length === 0) return null;
    return lexicalTextRankedStudies;
  }, [activeTextQueries.length, lexicalTextRankedStudies]);

  const textFilteredIds = useMemo(() => {
    if (!activeTextRankedStudies) return null;

    return new Set(activeTextRankedStudies.map(study => study.id));
  }, [activeTextRankedStudies]);

  const filterBaseStudies = useMemo(() => {
    let base = activeTextRankedStudies || caseStudies;

    if (textFilteredIds) {
      base = base.filter(study => textFilteredIds.has(study.id));
    }

    if (showFavorites && favorites.length > 0) {
      base = base.filter(s => favorites.includes(s.id));
    }

    return base;
  }, [activeTextRankedStudies, textFilteredIds, showFavorites, favorites, caseStudies]);

  // Filter suggestions from fuzzy search
  const filterSuggestions = useMemo(() => {
    if (!suggestionQuery || !parsedSuggestionQuery) return [];
    return getLocalFilterSuggestions(suggestionQuery, parsedSuggestionQuery);
  }, [suggestionQuery, parsedSuggestionQuery]);

  const filteredStudies = useMemo(() => {
    const hasActiveFilters = Object.keys(activeFilters).length > 0;
    const hasExcludedFilters = Object.keys(excludedFilters).length > 0;
    let results = filterBaseStudies;

    if (hasActiveFilters || hasExcludedFilters) {
      results = filterBaseStudies.filter(study => {
        for (const [categoryKey, selectedValues] of Object.entries(activeFilters)) {
          if (selectedValues.length === 0) continue;
          const config = FILTER_CATEGORIES[categoryKey];
          if (!config) continue;
          const isAnd = (filterModes[categoryKey] || DEFAULT_FILTER_MODE) === 'and';
          const matcher = isAnd ? 'every' : 'some';
          if (config.type === 'object') {
            if (!selectedValues[matcher](v => hasTaleaType(study, v))) return false;
          } else if (config.type === 'value') {
            // value type: a study has one value, so AND with multiple selected means it must match all (impossible for >1)
            if (isAnd) {
              if (!selectedValues.every(v => study[config.dataKey] === v)) return false;
            } else {
              if (!selectedValues.includes(study[config.dataKey])) return false;
            }
          } else if (config.type === 'array') {
            const arr = study[config.dataKey] || [];
            if (!selectedValues[matcher](v => arr.includes(v))) return false;
          } else if (config.type === 'innovation') {
            const innovMap = { Physical: 'has_physical_innovation', Social: 'has_social_innovation', Digital: 'has_digital_innovation' };
            if (!selectedValues[matcher](v => !!study[innovMap[v]])) return false;
          }
        }
        for (const [categoryKey, excludedValues] of Object.entries(excludedFilters)) {
          if (excludedValues.length === 0) continue;
          const config = FILTER_CATEGORIES[categoryKey];
          if (!config) continue;
          if (config.type === 'object') {
            if (excludedValues.some(v => hasTaleaType(study, v))) return false;
          } else if (config.type === 'value') {
            if (excludedValues.includes(study[config.dataKey])) return false;
          } else if (config.type === 'array') {
            const arr = study[config.dataKey] || [];
            if (excludedValues.some(v => arr.includes(v))) return false;
          } else if (config.type === 'innovation') {
            const innovMap = { Physical: 'has_physical_innovation', Social: 'has_social_innovation', Digital: 'has_digital_innovation' };
            if (excludedValues.some(v => !!study[innovMap[v]])) return false;
          }
        }
        return true;
      });
    }

    return results;
  }, [filterBaseStudies, activeFilters, excludedFilters, filterModes]);

  // Extract a numeric year from a string like "2017–2019", "21st century", "completed 2022", etc.
  // Returns the most recent year found, or 0 if none.
  const extractYear = useCallback((yearStr) => {
    if (!yearStr) return 0;
    const s = String(yearStr);

    // Find all 4-digit years
    const fourDigit = s.match(/\b(\d{4})\b/g);
    if (fourDigit && fourDigit.length > 0) {
      return Math.max(...fourDigit.map(Number));
    }

    // Handle century references: "12th century" → 1100, "21st century" → 2000
    const centuryMatch = s.match(/(\d{1,2})(?:st|nd|rd|th)\s*(?:century|cent\.?)/i);
    if (centuryMatch) {
      return (parseInt(centuryMatch[1], 10) - 1) * 100;
    }

    // Handle "1990s" style
    const decadeMatch = s.match(/(\d{4})s/);
    if (decadeMatch) {
      return parseInt(decadeMatch[1], 10) + 5; // midpoint of decade
    }

    return 0;
  }, []);

  const sortedStudies = useMemo(() => {
    if (sortBy === 'default') return filteredStudies;
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
  }, [filteredStudies, sortBy, extractYear]);

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
  const activeFiltersRef = useRef(activeFilters);
  activeFiltersRef.current = activeFilters;
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

    const submittedQuery = searchQuery.trim();
    if (submittedQuery.length < 2) return;
    const {
      matches,
      exclusions,
      categoryModes,
      pureFilterQuery,
      freeTextTokens,
    } = parseMultiWordQuery(submittedQuery);
    const canAutoApplyFilters = searchMode === 'both';
    const retrievalPreview = runLocalRetrieval(submittedQuery, localSearchIndex, caseStudies, null, searchLogic)
      || filteredStudiesRef.current
      || caseStudies;
    const previewBaseStudies = retrievalPreview.length > 0 ? retrievalPreview : filteredStudiesRef.current || caseStudies;

    let previewActiveFilters = { ...activeFiltersRef.current };
    let previewExcludedFilters = { ...excludedFilters };
    let previewFilterModes = { ...filterModes };
    const acceptedCategoryModes = {};
    const autoAppliedMatches = [];
    const autoAppliedExclusions = [];

    const shouldKeepPreviewResults = (nextActive, nextExcluded, nextModes) => {
      if (!Array.isArray(previewBaseStudies) || previewBaseStudies.length === 0) return true;

      const nextCount = previewBaseStudies.filter(study =>
        studyMatchesAllFilters(study, nextActive, nextExcluded, nextModes)
      ).length;

      return nextCount > 0;
    };

    const preservesPreviewAnchor = (nextActive, nextExcluded, nextModes) => {
      if (pureFilterQuery) return true;
      const anchorStudy = Array.isArray(previewBaseStudies) ? previewBaseStudies[0] : null;
      if (!anchorStudy) return true;
      return studyMatchesAllFilters(anchorStudy, nextActive, nextExcluded, nextModes);
    };

    if (canAutoApplyFilters) {
      for (const option of matches) {
        if (!shouldAutoApplyParsedFilter(option, pureFilterQuery)) continue;

        const nextActiveValues = [...(previewActiveFilters[option.categoryKey] || [])];
        if (!nextActiveValues.includes(option.value)) {
          nextActiveValues.push(option.value);
        }

        const nextActiveFilters = {
          ...previewActiveFilters,
          [option.categoryKey]: nextActiveValues,
        };

        const nextExcludedValues = (previewExcludedFilters[option.categoryKey] || []).filter(value => value !== option.value);
        const nextExcludedFilters = nextExcludedValues.length > 0
          ? { ...previewExcludedFilters, [option.categoryKey]: nextExcludedValues }
          : Object.fromEntries(Object.entries(previewExcludedFilters).filter(([key]) => key !== option.categoryKey));

        const nextFilterModes = {
          ...previewFilterModes,
          ...(categoryModes?.[option.categoryKey] ? { [option.categoryKey]: categoryModes[option.categoryKey] } : {}),
        };

        if (!shouldKeepPreviewResults(nextActiveFilters, nextExcludedFilters, nextFilterModes)) {
          continue;
        }

        if (!preservesPreviewAnchor(nextActiveFilters, nextExcludedFilters, nextFilterModes)) {
          continue;
        }

        autoAppliedMatches.push(option);
        previewActiveFilters = nextActiveFilters;
        previewExcludedFilters = nextExcludedFilters;
        previewFilterModes = nextFilterModes;
        if (categoryModes?.[option.categoryKey]) {
          acceptedCategoryModes[option.categoryKey] = categoryModes[option.categoryKey];
        }
      }

      for (const option of exclusions) {
        if (!shouldAutoApplyParsedFilter(option, pureFilterQuery)) continue;

        const nextExcludedValues = [...(previewExcludedFilters[option.categoryKey] || [])];
        if (!nextExcludedValues.includes(option.value)) {
          nextExcludedValues.push(option.value);
        }

        const nextExcludedFilters = {
          ...previewExcludedFilters,
          [option.categoryKey]: nextExcludedValues,
        };

        const nextActiveValues = (previewActiveFilters[option.categoryKey] || []).filter(value => value !== option.value);
        const nextActiveFilters = nextActiveValues.length > 0
          ? { ...previewActiveFilters, [option.categoryKey]: nextActiveValues }
          : Object.fromEntries(Object.entries(previewActiveFilters).filter(([key]) => key !== option.categoryKey));

        const nextFilterModes = {
          ...previewFilterModes,
          ...(categoryModes?.[option.categoryKey] ? { [option.categoryKey]: categoryModes[option.categoryKey] } : {}),
        };

        if (!shouldKeepPreviewResults(nextActiveFilters, nextExcludedFilters, nextFilterModes)) {
          continue;
        }

        if (!preservesPreviewAnchor(nextActiveFilters, nextExcludedFilters, nextFilterModes)) {
          continue;
        }

        autoAppliedExclusions.push(option);
        previewActiveFilters = nextActiveFilters;
        previewExcludedFilters = nextExcludedFilters;
        previewFilterModes = nextFilterModes;
        if (categoryModes?.[option.categoryKey]) {
          acceptedCategoryModes[option.categoryKey] = categoryModes[option.categoryKey];
        }
      }
    }

    const hasAutoAppliedFilters = autoAppliedMatches.length > 0 || autoAppliedExclusions.length > 0;

    if (hasAutoAppliedFilters) {
      for (const m of autoAppliedMatches) addCanvasFilter(m.categoryKey, m.value);
      for (const e of autoAppliedExclusions) addExcludedFilter(e.categoryKey, e.value);
      for (const [categoryKey, mode] of Object.entries(acceptedCategoryModes)) {
        setFilterMode(categoryKey, mode);
      }
    }

    if (pureFilterQuery && canAutoApplyFilters && hasAutoAppliedFilters) {
      setSearchQuery('');
      setCommittedQuery(submittedQuery);
      return;
    }

    const remainingQuery = canAutoApplyFilters
      ? (hasAutoAppliedFilters && freeTextTokens.length > 0 ? freeTextTokens.join(' ') : submittedQuery)
      : submittedQuery;

    setCommittedQuery(submittedQuery);
    appendSearchContext(remainingQuery);
    setSearchQuery('');
  }, [searchQuery, searchMode, localSearchIndex, caseStudies, searchLogic, excludedFilters, filterModes, addCanvasFilter, addExcludedFilter, appendSearchContext, clearAllFilters, handleExportPDF, setFilterMode]);

  useEffect(() => {
    if (!committedQuery || committedQuery.length < 2) return;
    setChatMessages(prev => {
      const filtered = prev.filter(m => m.role !== 'typing');
      return [...filtered, { role: 'user', text: committedQuery }];
    });

    const response = generateChatResponse(committedQuery, filteredStudiesRef.current, filterSuggestionsRef.current, activeFiltersRef.current);
    if (response) {
      const timer = setTimeout(() => {
        setChatMessages(prev => {
          const recent = prev.slice(-7);
          const msg = { role: 'bot', text: response.message, type: response.type };
          const commonFilters = findCommonFilters(filteredStudiesRef.current, activeFiltersRef.current);
          if (commonFilters.length > 0) msg.suggestedFilters = commonFilters;
          return [...recent, msg];
        });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [committedQuery]);

  const clearChat = useCallback(() => {
    setChatMessages([
      { role: 'bot', text: "Welcome to the NBS Toolkit! I'm your TALEA Abacus assistant. Search for hardware solutions by typing anything \u2014 city names, NBS types, or even misspelled words. I'll find the best matches!", type: 'greeting' },
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
          searchMode={searchMode}
          searchLogic={searchLogic}
          onQueryChange={handleSearch}
          onSearchSubmit={handleSearchSubmit}
          onSearchModeChange={setSearchMode}
          onSearchLogicChange={setSearchLogic}
          onOpenDeepAI={() => setShowDeepAI('overlay')}
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
          studies={filterBaseStudies}
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
                  {aiFilteredStudies ? aiFilteredStudies.length : filteredStudies.length} of {caseStudies.length} solutions
                  {activeTextQueries.length > 0 && !aiFilteredStudies && (
                    <span className="fuzzy-label"> (local retrieval)</span>
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
              <MapView studies={aiFilteredStudies || sortedStudies} onSelect={setSelectedStudy} />
            ) : (
              <CaseStudyGrid
                studies={aiFilteredStudies || sortedStudies}
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
                    ? '1 selected — add more to compare'
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

      {showDeepAI && (
        <DeepAISearch
          caseStudies={caseStudies}
          mode={showDeepAI}
          onClose={() => { setShowDeepAI(false); setAiFilteredStudies(null); }}
          onSelectStudy={(study) => {
            setSelectedStudy(study);
            if (showDeepAI === 'overlay') setShowDeepAI(false);
          }}
          onShowAllResults={(studies) => {
            setAiFilteredStudies(studies);
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
              This app uses <strong>local storage</strong> to save your preferences and favorites.
              No tracking cookies or third-party analytics are used. Map tiles are served by <strong>OpenFreeMap</strong> without tracking.
            </p>
            <button className="cookie-accept-btn" onClick={acceptCookies}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
