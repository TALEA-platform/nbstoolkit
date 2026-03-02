import { useState, useRef, useEffect, useMemo } from 'react';
import { FILTER_CATEGORIES, FILTER_GROUPS } from '../data/filterConfig';

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

function SearchBar({ query, onQueryChange, onSearchSubmit, onAddCanvasFilter, activeFilters, toggleFilter, filterSuggestions, chatMessages, onClearChat, studies }) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState({});
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

  const suggestions = filterSuggestions || [];

  // Slash command autocomplete
  const isSlashQuery = query.startsWith('/');
  const filteredCommands = useMemo(() => {
    if (!isSlashQuery) return [];
    const typed = query.toLowerCase();
    return SLASH_COMMANDS.filter(c => c.cmd.startsWith(typed) || typed === '/');
  }, [query, isSlashQuery]);

  // Compute how many current studies match each filter option
  const filterCounts = useMemo(() => {
    if (!studies || studies.length === 0) return {};
    const counts = {};
    for (const [catKey, cat] of Object.entries(FILTER_CATEGORIES)) {
      counts[catKey] = {};
      for (const opt of cat.options) {
        let count = 0;
        for (const s of studies) {
          if (cat.type === 'object') {
            if (s[cat.dataKey]?.[opt.toLowerCase()]) count++;
          } else if (cat.type === 'value') {
            if (s[cat.dataKey] === opt) count++;
          } else if (cat.type === 'array') {
            if ((s[cat.dataKey] || []).includes(opt)) count++;
          }
        }
        counts[catKey][opt] = count;
      }
    }
    return counts;
  }, [studies]);

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
              if (e.key === 'Enter') {
                setShowSuggestions(false);
                if (onSearchSubmit) onSearchSubmit();
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
                      className="suggestion-item command-item"
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
                  className={`suggestion-item ${isActive ? 'active' : ''}`}
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
              const groupActiveCount = group.categories.reduce((sum, catKey) => sum + (activeFilters[catKey] || []).length, 0);
              return (
                <div key={groupKey} className="filter-group">
                  <button
                    className="filter-group-header"
                    onClick={() => setCollapsedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }))}
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
                    return (
                      <div key={catKey} className={`filter-category ${isExpanded ? 'expanded' : ''}`}>
                        <button
                          className="filter-category-header"
                          onClick={() => setExpandedCategory(isExpanded ? null : catKey)}
                        >
                          <span className="filter-cat-icon">{cat.icon}</span>
                          <span className="filter-cat-label">{cat.label}</span>
                          {activeCount > 0 && <span className="filter-cat-count">{activeCount}</span>}
                          <svg className="filter-cat-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points={isExpanded ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}/>
                          </svg>
                        </button>
                        {isExpanded && (
                          <div className="filter-options">
                            {cat.options.map(opt => {
                              const isActive = (activeFilters[catKey] || []).includes(opt);
                              const optCount = filterCounts[catKey]?.[opt] ?? 0;
                              return (
                                <button
                                  key={opt}
                                  className={`filter-option ${isActive ? 'active' : ''} ${!isActive && optCount === 0 ? 'dimmed' : ''}`}
                                  onClick={() => {
                                    toggleFilter(catKey, opt);
                                    if (!isActive) onAddCanvasFilter(catKey, opt);
                                  }}
                                  style={isActive ? { borderColor: cat.color, backgroundColor: cat.color + '15' } : {}}
                                >
                                  <span className={`filter-checkbox ${isActive ? 'checked' : ''}`} style={isActive ? { backgroundColor: cat.color } : {}}>
                                    {isActive && '\u2713'}
                                  </span>
                                  {opt}
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
