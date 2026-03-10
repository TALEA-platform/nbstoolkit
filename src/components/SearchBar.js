import { useState, useRef, useEffect, useMemo } from 'react';
import { FILTER_CATEGORIES, FILTER_GROUPS } from '../data/filterConfig';
import { hasTaleaType } from '../utils/getTaleaTypes';

const INNOVATION_FIELD_MAP = {
  Physical: 'has_physical_innovation',
  Social: 'has_social_innovation',
  Digital: 'has_digital_innovation',
};
const INITIAL_COLLAPSED_GROUPS = Object.fromEntries(
  Object.keys(FILTER_GROUPS).map(groupKey => [groupKey, true])
);

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

function studyMatchesCategory(study, categoryKey, values, mode) {
  const cat = FILTER_CATEGORIES[categoryKey];
  if (!cat || !values || values.length === 0) return true;

  const matcher = mode === 'and' ? 'every' : 'some';

  if (cat.type === 'object') {
    return values[matcher](value => hasTaleaType(study, value));
  }

  if (cat.type === 'value') {
    if (mode === 'and') {
      return values.every(value => study[cat.dataKey] === value);
    }
    return values.includes(study[cat.dataKey]);
  }

  if (cat.type === 'array') {
    const arr = study[cat.dataKey] || [];
    return values[matcher](value => arr.includes(value));
  }

  if (cat.type === 'innovation') {
    return values[matcher](value => !!study[INNOVATION_FIELD_MAP[value]]);
  }

  return true;
}

function studyMatchesExcludedCategory(study, categoryKey, values) {
  const cat = FILTER_CATEGORIES[categoryKey];
  if (!cat || !values || values.length === 0) return true;

  if (cat.type === 'object') {
    return !values.some(value => hasTaleaType(study, value));
  }

  if (cat.type === 'value') {
    return !values.includes(study[cat.dataKey]);
  }

  if (cat.type === 'array') {
    const arr = study[cat.dataKey] || [];
    return !values.some(value => arr.includes(value));
  }

  if (cat.type === 'innovation') {
    return !values.some(value => !!study[INNOVATION_FIELD_MAP[value]]);
  }

  return true;
}

function studyMatchesAllFilters(study, nextActiveFilters, nextExcludedFilters, nextFilterModes) {
  for (const [categoryKey, values] of Object.entries(nextActiveFilters || {})) {
    if (!studyMatchesCategory(study, categoryKey, values, nextFilterModes?.[categoryKey] || 'or')) {
      return false;
    }
  }

  for (const [categoryKey, values] of Object.entries(nextExcludedFilters || {})) {
    if (!studyMatchesExcludedCategory(study, categoryKey, values)) {
      return false;
    }
  }

  return true;
}

function SearchBar({ query, onQueryChange, onSearchSubmit, onAddCanvasFilter, onAddExcludedFilter, onRemoveCanvasFilterByValue, activeFilters, excludedFilters, filterModes, onToggleFilterMode, filterSuggestions, chatMessages, onClearChat, studies }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showChat, setShowChat] = useState(false);
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
    if (chatMessages.length > prevMessageCountRef.current && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = chatMessages.length;
  }, [chatMessages.length]);

  // Show chat when we have messages beyond the initial greeting
  useEffect(() => {
    if (chatMessages.length > 1) {
      setShowChat(true);
    }
  }, [chatMessages.length]);

  // Reset highlight when query changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [query]);

  const suggestions = filterSuggestions || [];

  function resetCategoryPanelState(catKey) {
    setPanelNotModes(prev => {
      if (!prev[catKey]) return prev;
      const next = { ...prev };
      delete next[catKey];
      return next;
    });

    if ((activeFilters[catKey] || []).length === 0 && (filterModes?.[catKey] || 'or') === 'and' && onToggleFilterMode) {
      onToggleFilterMode(catKey);
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
  const filteredCommands = useMemo(() => {
    if (!isSlashQuery) return [];
    const typed = query.toLowerCase();
    return SLASH_COMMANDS.filter(c => c.cmd.startsWith(typed) || typed === '/');
  }, [query, isSlashQuery]);

  // Compute dynamic counts for each option using the current query state.
  const filterCounts = useMemo(() => {
    if (!studies || studies.length === 0) return {};
    const counts = {};
    const currentResultCount = studies.filter(study =>
      studyMatchesAllFilters(study, activeFilters, excludedFilters, filterModes)
    ).length;

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
          counts[catKey][opt] = studies.filter(study =>
            studyMatchesAllFilters(study, activeFilters, nextExcludedFilters, filterModes)
          ).length;
        } else {
          const nextValues = [...selectedValues, opt];
          const nextActiveFilters = {
            ...activeFilters,
            [catKey]: nextValues,
          };
          counts[catKey][opt] = studies.filter(study =>
            studyMatchesAllFilters(study, nextActiveFilters, excludedFilters, filterModes)
          ).length;
        }
      }
    }
    return counts;
  }, [studies, activeFilters, excludedFilters, filterModes, panelNotModes]);

  return (
    <div className="search-section">
      <div className="search-bar-container">
        <div className="search-input-wrapper">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="search-input"
            placeholder="Search NBS solutions or type / for commands..."
            value={query}
            onChange={e => {
              onQueryChange(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => {
              setShowSuggestions(true);
              if (chatMessages.length > 0) setShowChat(true);
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
          {query && (
            <button className="search-clear" onClick={() => { onQueryChange(''); setShowSuggestions(false); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
          <button
            className={`chat-toggle-btn ${showChat ? 'active' : ''}`}
            onClick={() => setShowChat(!showChat)}
            title="Toggle assistant"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </button>
        </div>

        <button
          className={`filter-toggle-btn ${showFilterPanel ? 'active' : ''}`}
          onClick={() => setShowFilterPanel(!showFilterPanel)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          Filters
        </button>

        {/* Slash command autocomplete */}
        {isSlashQuery && filteredCommands.length > 0 && (
          <div className="suggestions-dropdown command-suggestions" ref={suggestionsRef}>
            <div className="suggestions-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
              </svg>
              Commands — press Enter to execute:
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
        {showSuggestions && suggestions.length > 0 && !isSlashQuery && (
          <div className="suggestions-dropdown" ref={suggestionsRef}>
            <div className="suggestions-header">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              Fuzzy matches - click to add as filter:
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
                  {s.score !== undefined && (
                    <span className="suggestion-score">{Math.round((1 - s.score) * 100)}%</span>
                  )}
                  {isActive && <span className="suggestion-check">&#10003;</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

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
              <span className="chat-title">TALEA Assistant</span>
              <span className="chat-status">Online</span>
            </div>
            {onClearChat && (
              <button className="chat-clear-btn" onClick={onClearChat} title="Clear chat">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>
            )}
            <button className="chat-close" onClick={() => setShowChat(false)}>
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
                  {msg.type === 'suggestion' && suggestions.length > 0 && (
                    <div className="chat-suggestion-chips">
                      {suggestions.slice(0, 4).map((s, j) => (
                        <button
                          key={j}
                          className="chat-chip"
                          onClick={() => {
                            onAddCanvasFilter(s.categoryKey, s.value);
                            onQueryChange('');
                          }}
                        >
                          {s.icon} {s.value}
                        </button>
                      ))}
                    </div>
                  )}
                  {msg.suggestedFilters && msg.suggestedFilters.length > 0 && (
                    <div className="chat-suggestion-chips">
                      <span className="chat-suggest-label">Try adding:</span>
                      {msg.suggestedFilters.slice(0, 4).map((s, j) => (
                        <button
                          key={j}
                          className="chat-chip suggested"
                          onClick={() => onAddCanvasFilter(s.categoryKey, s.value)}
                        >
                          {s.icon} {s.value} <span className="chip-freq">{s.frequency}%</span>
                        </button>
                      ))}
                    </div>
                  )}
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
                     const mode = filterModes?.[catKey] || 'or';
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
                                  <button
                                    className={`logic-toggle panel-mode ${mode} ${panelNotMode ? 'disabled' : ''}`}
                                    onClick={() => onToggleFilterMode && onToggleFilterMode(catKey)}
                                    title={panelNotMode ? 'AND/OR is disabled while NOT mode is active' : `Switch this category to ${mode === 'or' ? 'AND' : 'OR'} matching`}
                                    type="button"
                                    disabled={panelNotMode}
                                  >
                                    {mode.toUpperCase()}
                                  </button>
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
