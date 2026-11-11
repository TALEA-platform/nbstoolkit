import { useState, useRef, useEffect, useMemo } from 'react';
import { FILTER_CATEGORIES, FILTER_GROUPS } from '../data/filterConfig';

const INITIAL_COLLAPSED_GROUPS = Object.fromEntries(
  Object.keys(FILTER_GROUPS).map(groupKey => [groupKey, true])
);
const DEFAULT_FILTER_MODE = 'and';
// Phones keep the original layout (AI pill above the bar); the two search modes are desktop only
const PHONE_QUERY = '(max-width: 768px)';
const AI_NOTE = "Questions are processed by Google Gemini and Cloudflare and saved anonymously to improve the search. Please don't include personal data.";

function usePhoneScreen() {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(PHONE_QUERY).matches);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(PHONE_QUERY);
    const onChange = () => setPhone(mq.matches);
    onChange();
    if (mq.addEventListener) mq.addEventListener('change', onChange); else mq.addListener(onChange);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', onChange); else mq.removeListener(onChange); };
  }, []);
  return phone;
}

const SLASH_COMMANDS = [
  // Navigation
  { cmd: '/info', desc: 'Study details (e.g. /info 1)', group: 'nav' },
  { cmd: '/random', desc: 'Open a random study', group: 'nav' },
  { cmd: '/map', desc: 'Switch to map view', group: 'nav' },
  { cmd: '/grid', desc: 'Switch to grid view', group: 'nav' },
  { cmd: '/list', desc: 'Switch to list view', group: 'nav' },
  // Analysis
  { cmd: '/summary', desc: 'Overview of current results', group: 'analysis' },
  { cmd: '/describe', desc: 'Brief description of each result', group: 'analysis' },
  { cmd: '/common', desc: 'What results have in common', group: 'analysis' },
  { cmd: '/similar', desc: 'Find similar studies (e.g. /similar 1)', group: 'analysis' },
  { cmd: '/suggest', desc: 'Suggest filters to narrow down', group: 'analysis' },
  { cmd: '/breakdown', desc: 'Breakdown by field (e.g. /breakdown size)', group: 'analysis' },
  { cmd: '/goals', desc: 'Goals addressed by results', group: 'analysis' },
  { cmd: '/design', desc: 'NBS elements overview', group: 'analysis' },
  { cmd: '/innovations', desc: 'Social/digital innovation info', group: 'analysis' },
  { cmd: '/timeline', desc: 'Results grouped by year', group: 'analysis' },
  // Actions
  { cmd: '/stats', desc: 'Open statistics dashboard', group: 'action' },
  { cmd: '/export', desc: 'Export results as PDF', group: 'action' },
  { cmd: '/clear', desc: 'Clear all filters', group: 'action' },
  { cmd: '/favorites', desc: 'Toggle favorites view', group: 'action' },
  { cmd: '/compare', desc: 'Compare selected studies', group: 'action' },
  // Info
  { cmd: '/cities', desc: 'List cities in results', group: 'info' },
  { cmd: '/country', desc: 'Studies by country (e.g. /country Italy)', group: 'info' },
  { cmd: '/filters', desc: 'Show active filters', group: 'info' },
  { cmd: '/nbs', desc: 'NBS categories reference', group: 'info' },
  { cmd: '/help', desc: 'Show all commands', group: 'info' },
];

function SearchBar({
  sectionRef,
  query,
  searchContexts,
  searchNotices,
  narrowSuggestions,
  filterNameOffers,
  onUseFilterForSearch,
  onReplaceSearchContext,
  onQueryChange,
  onSearchSubmit,
  onOpenDeepAI,
  aiBackgroundStatus,
  onClearSearchContext,
  onEditSearchContext,
  onAddCanvasFilter,
  onAddExcludedFilter,
  onRemoveCanvasFilterByValue,
  activeFilters,
  excludedFilters,
  filterModes,
  onSetFilterMode,
  filterSuggestions,
  chatMessages,
  onClearChat,
  countWith,
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [assistantDismissed, setAssistantDismissed] = useState(false);
  const [hasUnreadAssistant, setHasUnreadAssistant] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(() => ({ ...INITIAL_COLLAPSED_GROUPS }));
  const [panelNotModes, setPanelNotModes] = useState({});
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const chatEndRef = useRef(null);
  const prevMessageCountRef = useRef(chatMessages.length);

  useEffect(() => {
    function handleClickOutside(e) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target) && inputRef.current && !inputRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-scroll chat only when new messages are added
  useEffect(() => {
    const hasNewMessages = chatMessages.length > prevMessageCountRef.current;

    if (hasNewMessages && chatEndRef.current && showChat) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }

    // only the answer to a command is worth a look; the reply to a search repeats what the
    // page already shows (number of results, filters to add)
    const last = chatMessages[chatMessages.length - 1];
    if (hasNewMessages && ['command', 'greeting'].includes(last?.type)) {
      setHasUnreadAssistant(!showChat);
    }

    prevMessageCountRef.current = chatMessages.length;
  }, [chatMessages, showChat]);

  // The chat opens by itself for the answer to a command (/help, /summary…), not after a search
  useEffect(() => {
    const last = chatMessages[chatMessages.length - 1];
    if (chatMessages.length > 1 && ['command', 'greeting'].includes(last?.type) && !assistantDismissed) {
      setShowChat(true);
      setHasUnreadAssistant(false);
    }
  }, [chatMessages, assistantDismissed]);

  // Reset highlight when query changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query]);

  const suggestions = filterSuggestions || [];
  const searchPlaceholder = 'Search by keyword, project or place (in English). Type / for commands';
  const aiTitle = aiBackgroundStatus === 'ready' ? 'Your AI answer is ready' : aiBackgroundStatus === 'working' ? 'The AI is still working on your question' : 'Open AI Assistant';
  const phoneScreen = usePhoneScreen();
  const [searchMode, setSearchMode] = useState('keyword'); // 'keyword' | 'ai' (desktop only)
  const [aiText, setAiText] = useState('');
  const aiInputRef = useRef(null);
  const aiMode = searchMode === 'ai' && !phoneScreen;

  function switchMode(next) {
    if (next === searchMode) return;
    setSearchMode(next);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    if (next === 'ai') {
      // Carry over words typed but not searched yet
      if (!aiText.trim() && query.trim() && !query.startsWith('/')) setAiText(query.trim());
      setTimeout(() => aiInputRef.current && aiInputRef.current.focus(), 0);
    } else {
      setTimeout(() => inputRef.current && inputRef.current.focus(), 0);
    }
  }

  function askAI() {
    const text = aiText.trim();
    if (!onOpenDeepAI) return;
    if (text) {
      onOpenDeepAI(text, true);
      setAiText('');
    } else {
      onOpenDeepAI();
    }
  }

  function openAssistant() {
    setShowChat(true);
    setAssistantDismissed(false);
    setHasUnreadAssistant(false);
  }

  function closeAssistant() {
    setShowChat(false);
    setAssistantDismissed(true);
  }

  function toggleAssistant() {
    if (showChat) {
      closeAssistant();
      return;
    }
    openAssistant();
  }

  function resetCategoryPanelState(catKey) {
    setPanelNotModes(prev => {
      if (!prev[catKey]) return prev;
      const next = { ...prev };
      delete next[catKey];
      return next;
    });

    if ((activeFilters[catKey] || []).length === 0 && (filterModes?.[catKey] || DEFAULT_FILTER_MODE) !== DEFAULT_FILTER_MODE && onSetFilterMode) {
      onSetFilterMode(catKey, DEFAULT_FILTER_MODE);
    }
  }

  function handleGroupToggle(groupKey, group, isGroupCollapsed) {
    if (!isGroupCollapsed) {
      group.categories.forEach(resetCategoryPanelState);
      if (expandedCategory && group.categories.includes(expandedCategory)) {
        setExpandedCategory(null);
      }
    }

    setCollapsedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
  }

  function handleCategoryToggle(catKey, isExpanded) {
    if (isExpanded) {
      resetCategoryPanelState(catKey);
      setExpandedCategory(null);
      return;
    }

    if (expandedCategory && expandedCategory !== catKey) {
      resetCategoryPanelState(expandedCategory);
    }

    setExpandedCategory(catKey);
  }

  // Slash command autocomplete
  const isSlashQuery = query.startsWith('/');
  const showInputControls = !!query;
  const filteredCommands = useMemo(() => {
    if (!isSlashQuery) return [];
    const typed = query.toLowerCase();
    return SLASH_COMMANDS.filter(c => c.cmd.startsWith(typed) || typed === '/');
  }, [query, isSlashQuery]);

  // Number of cases for each option: what a click on it would show (countWith, from App.js,
  // runs the searches among the cases passing the filters, so a value in OR mode is counted right)
  const filterCounts = useMemo(() => {
    if (!countWith) return {};
    const counts = {};
    const currentResultCount = countWith(activeFilters, excludedFilters, filterModes);

    for (const [catKey, cat] of Object.entries(FILTER_CATEGORIES)) {
      counts[catKey] = {};
      const selectedValues = activeFilters[catKey] || [];
      const excludedValues = excludedFilters[catKey] || [];
      const panelNotMode = !!panelNotModes[catKey];
      for (const opt of cat.options) {
        const isActive = selectedValues.includes(opt);
        const isExcluded = excludedValues.includes(opt);
        if (isActive || isExcluded) {
          counts[catKey][opt] = currentResultCount;
          continue;
        }

        if (panelNotMode) {
          const nextExcludedFilters = {
            ...excludedFilters,
            [catKey]: [...excludedValues, opt],
          };
          counts[catKey][opt] = countWith(activeFilters, nextExcludedFilters, filterModes);
        } else {
          const nextValues = [...selectedValues, opt];
          const nextActiveFilters = {
            ...activeFilters,
            [catKey]: nextValues,
          };
          counts[catKey][opt] = countWith(nextActiveFilters, excludedFilters, filterModes);
        }
      }
    }
    return counts;
  }, [countWith, activeFilters, excludedFilters, filterModes, panelNotModes]);

  return (
    <div className="search-section">
      <div className="search-mode-banner">
        <button
          type="button"
          className={`deep-ai-btn${aiBackgroundStatus ? ` bg-${aiBackgroundStatus}` : ''}`}
          onClick={() => onOpenDeepAI && onOpenDeepAI()}
          title={aiTitle}
        >
          {aiBackgroundStatus && <span className="deep-ai-btn-badge" aria-hidden="true" />}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.4 5.7 21l2.3-7L2 9.4h7.6z"/>
          </svg>
          AI Assistant
        </button>
      </div>

      <div className="search-mode-tabs" role="tablist" aria-label="Search mode">
        <button
          type="button"
          role="tab"
          aria-selected={!aiMode}
          className={`search-mode-tab${!aiMode ? ' active' : ''}`}
          onClick={() => switchMode('keyword')}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          Keyword search
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aiMode}
          className={`search-mode-tab search-mode-tab-ai${aiMode ? ' active' : ''}${aiBackgroundStatus ? ` bg-${aiBackgroundStatus}` : ''}`}
          onClick={() => switchMode('ai')}
          title={aiBackgroundStatus ? aiTitle : undefined}
        >
          {aiBackgroundStatus && <span className="deep-ai-btn-badge" aria-hidden="true" />}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.4 5.7 21l2.3-7L2 9.4h7.6z"/>
          </svg>
          AI Assistant
        </button>
      </div>

      <div className="search-bar-container" ref={sectionRef}>
        {aiMode ? (
        <div className="search-input-wrapper search-ai-wrapper">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.4 5.7 21l2.3-7L2 9.4h7.6z"/>
          </svg>
          <input
            ref={aiInputRef}
            type="text"
            className="search-input search-ai-input"
            placeholder="Describe your site, its problems and limits, in any language"
            value={aiText}
            maxLength={1000}
            onChange={e => setAiText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                askAI();
              }
            }}
          />
          <button type="button" className="search-ai-send" onClick={askAI} title={aiText.trim() ? 'Send to the AI Assistant' : aiTitle}>
            Ask
          </button>
        </div>
        ) : (
        <div className="search-input-wrapper">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            className={`search-input ${showInputControls ? 'has-search-controls' : ''} ${query ? 'has-clear' : ''}`}
            placeholder={searchPlaceholder}
            value={query}
            onChange={e => {
              onQueryChange(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => {
              setShowSuggestions(true);
            }}
            onKeyDown={e => {
              // Determine which list is active
              const isCmd = isSlashQuery && filteredCommands.length > 0;
              const isSug = !isSlashQuery && showSuggestions && suggestions.length > 0;
              const listLen = isCmd ? filteredCommands.length : isSug ? suggestions.length : 0;

              if (listLen > 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                e.preventDefault();
                setHighlightedIndex(prev => {
                  if (e.key === 'ArrowDown') return prev < listLen - 1 ? prev + 1 : 0;
                  return prev > 0 ? prev - 1 : listLen - 1;
                });
                return;
              }

              if (e.key === 'Enter') {
                if (highlightedIndex >= 0 && listLen > 0) {
                  e.preventDefault();
                  if (isCmd) {
                    const c = filteredCommands[highlightedIndex];
                    const needsArg = ['/info', '/similar', '/breakdown', '/country'].includes(c.cmd);
                    onQueryChange(needsArg ? c.cmd + ' ' : c.cmd);
                    if (!needsArg) {
                      setTimeout(() => onSearchSubmit && onSearchSubmit(), 50);
                    }
                  } else if (isSug) {
                    const s = suggestions[highlightedIndex];
                    onAddCanvasFilter(s.categoryKey, s.value);
                    onQueryChange('');
                  }
                  setHighlightedIndex(-1);
                  setShowSuggestions(false);
                } else {
                  setShowSuggestions(false);
                  if (onSearchSubmit) onSearchSubmit();
                }
              }

              if (e.key === 'Escape') {
                setShowSuggestions(false);
                setHighlightedIndex(-1);
              }
            }}
          />
          {showInputControls && (
            <div className="search-input-controls">
              {query && (
                <button type="button" className="search-clear" onClick={() => { onQueryChange(''); setShowSuggestions(false); }} aria-label="Clear search text">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
        )}


        <div className="search-bar-actions">
          <div className="search-assistant-action">
            <button
              type="button"
              className={`chat-toggle-btn ${showChat ? 'active' : ''} ${hasUnreadAssistant ? 'has-unread' : ''}`}
              onClick={toggleAssistant}
              title={showChat ? 'Hide commands and tips' : 'Commands and tips'}
              aria-label={showChat ? 'Hide commands and tips' : 'Commands and tips'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="4"/><line x1="14.5" y1="7" x2="9.5" y2="17"/>
              </svg>
              {hasUnreadAssistant && <span className="chat-toggle-badge" />}
            </button>
          </div>

          <span className="search-action-divider" aria-hidden="true" />

          <div className="search-panel-action">
            <button
              type="button"
              className={`filter-toggle-btn ${showFilterPanel ? 'active' : ''}`}
              onClick={() => setShowFilterPanel(!showFilterPanel)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
              </svg>
              <span className="filter-toggle-label">Filters</span>
            </button>
          </div>
        </div>

        {/* Slash command autocomplete */}
        {!aiMode && isSlashQuery && filteredCommands.length > 0 && (
          <div className="suggestions-dropdown command-suggestions" ref={suggestionsRef}>
            <div className="suggestions-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              Commands (press Enter to run):
            </div>
            {(() => {
              const groupLabels = { nav: 'Navigation', analysis: 'Analysis', action: 'Actions', info: 'Info' };
              let lastGroup = null;
              return filteredCommands.map((c, i) => {
                const showLabel = c.group !== lastGroup;
                lastGroup = c.group;
                return (
                  <div key={i}>
                    {showLabel && query === '/' && (
                      <div className="command-group-label">{groupLabels[c.group] || c.group}</div>
                    )}
                    <button
                      className={`suggestion-item command-item ${highlightedIndex === i ? 'highlighted' : ''}`}
                      onClick={() => {
                        const needsArg = ['/info', '/similar', '/breakdown', '/country'].includes(c.cmd);
                        onQueryChange(needsArg ? c.cmd + ' ' : c.cmd);
                        inputRef.current?.focus();
                        if (!needsArg) {
                          setTimeout(() => onSearchSubmit && onSearchSubmit(), 50);
                        }
                      }}
                    >
                      <span className="command-name">{c.cmd}</span>
                      <span className="command-desc">{c.desc}</span>
                    </button>
                  </div>
                );
              });
            })()}
          </div>
        )}

        {/* Filter suggestions (hidden when typing slash commands) */}
        {!aiMode && showSuggestions && suggestions.length > 0 && !isSlashQuery && (
          <div className="suggestions-dropdown" ref={suggestionsRef}>
            <div className="suggestions-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Filters matching your words - click to add one:
            </div>
            {suggestions.map((s, i) => {
              const isActive = (activeFilters[s.categoryKey] || []).includes(s.value);
              return (
                <button
                  key={i}
                  className={`suggestion-item ${isActive ? 'active' : ''} ${highlightedIndex === i ? 'highlighted' : ''}`}
                  onClick={() => {
                    onAddCanvasFilter(s.categoryKey, s.value);
                    setShowSuggestions(false);
                    onQueryChange('');
                  }}
                >
                  <span className="suggestion-icon">{s.icon}</span>
                  <span className="suggestion-value">{s.value}</span>
                  <span className="suggestion-category" style={{ color: s.color }}>{s.category}</span>
                  {s.count !== undefined && (
                    <span className="suggestion-score" title={`${s.count} case${s.count !== 1 ? 's' : ''} with this tag`}>{s.count}</span>
                  )}
                  {isActive && <span className="suggestion-check">&#10003;</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {aiMode && <p className="search-ai-privacy">{AI_NOTE}</p>}

      {searchContexts?.length > 0 && (
        <div className="search-context-row">
          <div className="search-context-meta">
            <span className="search-context-label">Text filter{searchContexts.length > 1 ? 's' : ''}</span>
            <div className="search-context-list">
              {searchContexts.map((searchContext, index) => (
                <div key={`${searchContext}-${index}`} className="search-context-chip">
                  <button
                    className="search-context-edit"
                    onClick={() => {
                      if (onEditSearchContext) onEditSearchContext(index);
                      requestAnimationFrame(() => inputRef.current?.focus());
                    }}
                    title="Edit text filter"
                    aria-label={`Edit text filter ${searchContext}`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/>
                    </svg>
                    <span className="search-context-value">{searchContext}</span>
                  </button>
                  <button
                    className="search-context-remove"
                    onClick={() => onClearSearchContext && onClearSearchContext(index)}
                    title="Remove text filter"
                    aria-label={`Remove text filter ${searchContext}`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* What the text search did: words not found, typo, no case with all the words */}
      {searchNotices?.length > 0 && (
        <div className="search-notice-list">
          {(searchNotices || []).filter(n => !(filterNameOffers || []).some(o => o.query === n.query && n.match === 'none')).map(n => (
            <div key={n.query} className="search-notice" role="status">
              {n.didYouMean ? (
                <span>
                  Did you mean{' '}
                  <button type="button" className="search-notice-link" onClick={() => onReplaceSearchContext && onReplaceSearchContext(n.query, n.didYouMean)}>
                    {n.didYouMean}
                  </button>?
                </span>
              ) : n.notFound.length > 0 ? (
                <span>
                  {n.notFound.map(w => `"${w}"`).join(', ')} {n.notFound.length > 1 ? 'are' : 'is'} not in any case.
                  {' '}Case texts are in English: try English words, or{' '}
                  <button type="button" className="search-notice-link" onClick={() => onOpenDeepAI && onOpenDeepAI()}>
                    ask the AI Assistant
                  </button>{' '}in any language.
                </span>
              ) : null}
              {n.match === 'partial' && !n.didYouMean && (
                <span>No case contains all the words of "{n.query}": showing the cases with most of them.</span>
              )}
              {n.match === 'none' && !n.notFound.length && (
                <span>No case matches "{n.query}".</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Filters to add after a search, in one place: first the filters written in the search
          ("in your search"), then the tags that narrow the results. The words of the search that
          a filter already says are taken out of it on click. Each shows the cases after the click. */}
      {(filterNameOffers?.length > 0 || narrowSuggestions?.length > 0) && (() => {
        const chips = [...(filterNameOffers || []), ...(narrowSuggestions || [])].slice(0, 6);
        return (
          <div className="search-filter-box">
            <span className="search-context-label">Filter the results</span>
            <div className="search-filter-chips">
              {chips.map(s => (
                <button
                  key={`${s.kind || "tag"}|${s.query}|${s.categoryKey}|${s.value}`}
                  type="button"
                  className={`search-filter-chip ${s.kind === 'not' ? 'search-filter-chip-exclude' : ''}`}
                  style={{ '--chip-color': s.color }}
                  title={s.kind === 'not'
                    ? `Exclude the filter ${s.category}: ${s.value}, in place of "${s.text}"`
                    : s.kind === 'or'
                      ? `Add the filters ${s.category}: ${s.values.join(', ')} (any of them), in place of the search`
                      : s.keepText
                        ? `Add the filter ${s.category}: ${s.value}`
                        : `Add the filter ${s.category}: ${s.value}, in place of the words it already says`}
                  onClick={() => onUseFilterForSearch && onUseFilterForSearch(s)}
                >
                  <span className="search-filter-chip-plus" aria-hidden="true">{s.kind === 'not' ? '−' : '+'}</span>
                  <span className="search-filter-chip-name">{s.icon} {s.kind === 'not' ? `Exclude ${s.value}` : s.value}</span>
                  <span className="search-filter-chip-meta">{s.category}{s.kind === 'or' ? ', any of them' : ''}</span>
                  {s.inSearch && <span className="search-filter-chip-badge">in your search</span>}
                  <span className="search-filter-chip-count">→ {s.count} case{s.count === 1 ? '' : 's'}</span>
                </button>
              ))}
            </div>
            {chips.some(s => !s.keepText) && (
              <span className="search-filter-hint">Words already said by a filter are taken out of the text filter.</span>
            )}
          </div>
        );
      })()}

      {/* Chatbot panel */}
      {showChat && (
        <div className="chat-panel">
          <div className="chat-header">
            <div className="chat-header-left">
              <div className="chat-avatar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                </svg>
              </div>
              <span className="chat-title">Commands and tips</span>
            </div>
            {onClearChat && (
              <button className="chat-clear-btn" onClick={onClearChat} title="Clear chat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            )}
            <button className="chat-close" onClick={closeAssistant} title="Hide assistant">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div className="chat-messages">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`chat-message ${msg.role}`}>
                {msg.role === 'bot' && (
                  <div className="chat-bot-avatar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    </svg>
                  </div>
                )}
                <div className={`chat-bubble ${msg.role} ${msg.type === 'command' ? 'command-response' : ''}`}>
                  <p style={msg.type === 'command' ? { whiteSpace: 'pre-wrap' } : undefined}>{msg.text}</p>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-footer">
            <div className="chat-command-hint">
              Type <span className="command-hint-slash">/</span> for commands
            </div>
            <div className="chat-quick-actions">
              <button onClick={() => onQueryChange('/help')}>/help</button>
              <button onClick={() => onQueryChange('/summary')}>/summary</button>
              <button onClick={() => onQueryChange('/random')}>/random</button>
              <button onClick={() => onQueryChange('/common')}>/common</button>
            </div>
          </div>
        </div>
      )}

      {showFilterPanel && (
        <div className="filter-panel">
          <div className="filter-panel-grid">
            {Object.entries(FILTER_GROUPS).map(([groupKey, group]) => {
              const isGroupCollapsed = collapsedGroups[groupKey];
              const groupActiveCount = group.categories.reduce(
                (sum, catKey) => sum + (activeFilters[catKey] || []).length + (excludedFilters[catKey] || []).length,
                0
              );
              return (
                <div key={groupKey} className="filter-group">
                  <button
                     className="filter-group-header"
                     onClick={() => handleGroupToggle(groupKey, group, isGroupCollapsed)}
                  >
                    <span className="filter-group-icon">{group.icon}</span>
                    <span className="filter-group-label">{group.label}</span>
                    {groupActiveCount > 0 && <span className="filter-group-count">{groupActiveCount}</span>}
                    <svg className="filter-group-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points={isGroupCollapsed ? "6 9 12 15 18 9" : "18 15 12 9 6 15"}/>
                    </svg>
                  </button>
                   {!isGroupCollapsed && group.categories.map(catKey => {
                     const cat = FILTER_CATEGORIES[catKey];
                     if (!cat) return null;
                     const isExpanded = expandedCategory === catKey;
                     const activeCount = (activeFilters[catKey] || []).length;
                     const excludedCount = (excludedFilters[catKey] || []).length;
                     const selectedCount = activeCount + excludedCount;
                     const mode = filterModes?.[catKey] || DEFAULT_FILTER_MODE;
                     const panelNotMode = !!panelNotModes[catKey];
                     return (
                       <div key={catKey} className={`filter-category ${isExpanded ? 'expanded' : ''}`}>
                         <button
                          className="filter-category-header"
                          onClick={() => handleCategoryToggle(catKey, isExpanded)}
                         >
                           <span className="filter-cat-icon">{cat.icon}</span>
                           <span className="filter-cat-label">{cat.label}</span>
                           {selectedCount > 0 && <span className={`filter-cat-count ${excludedCount > 0 && activeCount === 0 ? 'excluded' : ''}`}>{selectedCount}</span>}
                           <svg className="filter-cat-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                             <polyline points={isExpanded ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/>
                           </svg>
                         </button>
                         {isExpanded && (
                           <div className="filter-options">
                             <div className="filter-options-toolbar">
                               <span className="filter-options-toolbar-label">Mode</span>
                                 <div className="filter-options-toolbar-actions">
                                  <div className={`logic-toggle-group panel-mode ${panelNotMode ? 'disabled' : ''}`} role="group" aria-label={`${cat.label} filter mode`}>
                                    <button
                                      className={`logic-toggle panel-mode ${mode === 'and' ? 'and active' : ''}`}
                                      onClick={() => onSetFilterMode && onSetFilterMode(catKey, 'and')}
                                      title={panelNotMode ? 'AND/OR is disabled while NOT mode is active' : 'Use AND logic for this category'}
                                      type="button"
                                      disabled={panelNotMode}
                                      aria-pressed={mode === 'and'}
                                    >
                                      AND
                                    </button>
                                    <button
                                      className={`logic-toggle panel-mode ${mode === 'or' ? 'or active' : ''}`}
                                      onClick={() => onSetFilterMode && onSetFilterMode(catKey, 'or')}
                                      title={panelNotMode ? 'AND/OR is disabled while NOT mode is active' : 'Use OR logic for this category'}
                                      type="button"
                                      disabled={panelNotMode}
                                      aria-pressed={mode === 'or'}
                                    >
                                      OR
                                    </button>
                                  </div>
                                  <button
                                    className={`logic-toggle panel-mode not ${panelNotMode ? 'active' : ''}`}
                                   onClick={() => setPanelNotModes(prev => ({ ...prev, [catKey]: !prev[catKey] }))}
                                   title={panelNotMode ? 'NOT mode is on for this category' : 'Enable NOT mode for this category'}
                                   type="button"
                                 >
                                   NOT
                                 </button>
                               </div>
                             </div>
                             {cat.options.map(opt => {
                               const isActive = (activeFilters[catKey] || []).includes(opt);
                               const isExcluded = (excludedFilters[catKey] || []).includes(opt);
                               const isSelected = isActive || isExcluded;
                               const optCount = filterCounts[catKey]?.[opt] ?? 0;
                               return (
                                 <button
                                   key={opt}
                                   className={`filter-option ${isActive ? 'active' : ''} ${isExcluded ? 'excluded' : ''} ${!isSelected && optCount === 0 ? 'dimmed' : ''}`}
                                   onClick={() => {
                                     if (panelNotMode) {
                                       if (isExcluded) {
                                         onRemoveCanvasFilterByValue(catKey, opt);
                                       } else if (onAddExcludedFilter) {
                                         onAddExcludedFilter(catKey, opt);
                                       }
                                     } else {
                                       if (isExcluded) {
                                         onRemoveCanvasFilterByValue(catKey, opt);
                                       } else if (isActive) {
                                         onRemoveCanvasFilterByValue(catKey, opt);
                                       } else {
                                         onAddCanvasFilter(catKey, opt);
                                       }
                                     }
                                   }}
                                   style={
                                     isExcluded
                                       ? { borderColor: '#c53030', backgroundColor: 'rgba(197, 48, 48, 0.08)' }
                                       : isActive
                                         ? { borderColor: cat.color, backgroundColor: cat.color + '15' }
                                         : {}
                                   }
                                 >
                                   <span
                                     className={`filter-checkbox ${isActive ? 'checked' : ''} ${isExcluded ? 'excluded' : ''}`}
                                     style={
                                       isExcluded
                                         ? { backgroundColor: '#c53030', borderColor: '#c53030' }
                                         : isActive
                                           ? { backgroundColor: cat.color }
                                           : {}
                                     }
                                   >
                                     {isExcluded ? '\u2212' : isActive ? '\u2713' : ''}
                                   </span>
                                   {opt}
                                   {isExcluded && <span className="filter-option-not-badge">NOT</span>}
                                   <span className="filter-opt-count">{optCount}</span>
                                 </button>
                               );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default SearchBar;
