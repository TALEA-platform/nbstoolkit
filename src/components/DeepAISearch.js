import { useState, useRef, useEffect, useCallback } from 'react';
import { sendDeepAIQuery, analyzeProjects, applyAIFilters, sendThinkingQuery } from '../utils/deepAIService';

const STORAGE_KEY = 'talea_deep_ai_chat';
const DAILY_LIMIT = 150;

function loadChat() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore corrupt data */ }
  return null;
}

function saveChat(messages) {
  try {
    // Strip full study objects and _new flag to keep storage small
    const slim = messages.map(m => {
      const { _new, ...rest } = m;
      if (!rest.studies) return rest;
      return {
        ...rest,
        studies: rest.studies.map(s => ({ id: s.id, title: s.title, city: s.city, country: s.country })),
      };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch { /* quota exceeded — silently ignore */ }
}

const GREETING = { role: 'bot', text: "Hi! I'm the TALEA Deep AI assistant. Ask me anything about nature-based solutions — I'll search across all 29 categories to find the best matches.", type: 'greeting' };

// ---------------------------------------------------------------------------
// Lightweight inline markdown renderer (no deps)
// ---------------------------------------------------------------------------
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let listItems = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(<ul key={key++} className="ai-bullet-list">{listItems}</ul>);
      listItems = [];
    }
  };

  const inlineFormat = (line) => {
    // Bold, italic, inline code
    const parts = [];
    let remaining = line;
    let idx = 0;
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        parts.push(remaining.slice(lastIndex, match.index));
      }
      if (match[2]) {
        parts.push(<strong key={idx++}>{match[2]}</strong>);
      } else if (match[3]) {
        parts.push(<em key={idx++}>{match[3]}</em>);
      } else if (match[4]) {
        parts.push(<code key={idx++} className="ai-inline-code">{match[4]}</code>);
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < remaining.length) {
      parts.push(remaining.slice(lastIndex));
    }
    return parts.length > 0 ? parts : line;
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Headings
    if (trimmed.startsWith('## ')) {
      flushList();
      elements.push(<h4 key={key++} className="ai-heading">{inlineFormat(trimmed.slice(3))}</h4>);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      flushList();
      elements.push(<h4 key={key++} className="ai-heading">{inlineFormat(trimmed.slice(2))}</h4>);
      continue;
    }

    // Bullet items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      listItems.push(<li key={key++}>{inlineFormat(trimmed.slice(2))}</li>);
      continue;
    }

    // Numbered items
    const numMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (numMatch) {
      listItems.push(<li key={key++}>{inlineFormat(numMatch[1])}</li>);
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(<p key={key++} className="ai-paragraph">{inlineFormat(trimmed)}</p>);
  }

  flushList();
  return elements;
}

// ---------------------------------------------------------------------------
// Typewriter hook
// ---------------------------------------------------------------------------
function useTypewriter(text, speed = 18) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!text) {
      setDisplayed('');
      setDone(true);
      return;
    }
    setDisplayed('');
    setDone(false);
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayed, done };
}

function TypewriterMessage({ text, speed, onDone }) {
  const { displayed, done } = useTypewriter(text, speed);

  useEffect(() => {
    if (done && onDone) onDone();
  }, [done, onDone]);

  return <div>{renderMarkdown(displayed)}{!done && <span className="typing-cursor">|</span>}</div>;
}

function DeepAISearch({ caseStudies, onClose, onSelectStudy, onShowAllResults, onFilteredResults, onToggleMode, mode }) {
  const isSidebar = mode === 'sidebar';
  const [messages, setMessages] = useState(() => loadChat() || [GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateLimitHit, setRateLimitHit] = useState(false);
  const [remainingRequests, setRemainingRequests] = useState(-1);
  const [searchDepth, setSearchDepth] = useState('quick'); // 'quick' | 'deep'
  const [progressMsg, setProgressMsg] = useState('');
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Persist chat to localStorage on every change
  useEffect(() => {
    saveChat(messages);
  }, [messages]);

  // Lock background scroll only in overlay mode
  useEffect(() => {
    if (!isSidebar) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isSidebar]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages([GREETING]);
    setRateLimitHit(false);
    setRemainingRequests(-1);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Resolve a slim stored study to the full object from caseStudies
  const resolveStudy = useCallback((slim) => {
    if (!caseStudies) return slim;
    return caseStudies.find(s =>
      s.id === slim.id || (s.title === slim.title && s.city === slim.city)
    ) || slim;
  }, [caseStudies]);

  // Find the most recent response message with studies (for "See all results")
  const lastResultStudies = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].studies && messages[i].studies.length > 0) return messages[i].studies;
    }
    return null;
  })();

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
    setLoading(true);
    try {
      const aiResponse = await sendDeepAIQuery(trimmed);

      // Track remaining requests
      if (aiResponse._remaining >= 0) {
        setRemainingRequests(aiResponse._remaining);
      }

      // Apply AI filters to local data
      const filtered = applyAIFilters(aiResponse, caseStudies);

      // Notify parent of filtered results for grid update
      if (onFilteredResults) onFilteredResults(filtered);

      const resultText = aiResponse.summary
        || aiResponse.reasoning
        || `Found ${filtered.length} matching studies.`;

      setMessages(prev => [
        ...prev,
        {
          role: 'bot',
          text: `${resultText}\n\n${filtered.length} project${filtered.length !== 1 ? 's' : ''} matched.`,
          type: 'response',
          studies: filtered,
          _new: true,
        },
      ]);

      // RAG analysis on top results (non-blocking)
      if (filtered.length > 0) {
        const scenarios = aiResponse.match_logic?.scenarios;
        analyzeProjects(trimmed, filtered.slice(0, 10), scenarios)
          .then(analysis => {
            const analysisText = analysis?.analysis || analysis?.text || analysis?.message;
            if (analysisText) {
              setMessages(prev => [
                ...prev,
                { role: 'bot', text: analysisText, type: 'analysis', _new: true },
              ]);
            }
          })
          .catch(() => { /* silently suppress analysis errors */ });
      }
    } catch (err) {
      if (err.status === 429) {
        setRateLimitHit(true);
        setMessages(prev => [
          ...prev,
          { role: 'bot', text: 'Daily limit reached. Try again tomorrow, or use the regular search.', type: 'error', _new: true },
        ]);
      } else if ((err.message && err.message.includes('NetworkError')) || err.name === 'TypeError') {
        setMessages(prev => [
          ...prev,
          { role: 'bot', text: 'Connection error — please check your internet and try again.', type: 'error', _new: true },
        ]);
      } else if (err.status === 500) {
        setMessages(prev => [
          ...prev,
          { role: 'bot', text: 'The AI service is temporarily unavailable. Please try again later.', type: 'error', _new: true },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'bot', text: `Something went wrong: ${err.message}. Try the regular search instead.`, type: 'error', _new: true },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }, [input, loading, caseStudies, onFilteredResults]);

  const handleDeepSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: `[Deep] ${trimmed}` }]);
    setLoading(true);
    setProgressMsg('Analyzing your query...');
    try {
      const result = await sendThinkingQuery(trimmed, caseStudies, {
        topN: 10,
        onProgress: (msg) => setProgressMsg(msg),
      });

      if (result._remaining >= 0) {
        setRemainingRequests(result._remaining);
      }

      // Push the full filtered pool to the grid (judge picks float to top via _aiScore)
      if (onFilteredResults) onFilteredResults(result.filtered);

      const topCount = result.topStudies.length;
      const poolCount = result.filtered.length;

      if (topCount === 0 && poolCount === 0) {
        // No candidates at all from pass1
        setMessages(prev => [
          ...prev,
          {
            role: 'bot',
            text: (result.summary || 'No matching projects found.') + '\n\nThe deep scan found no candidates matching your query. Try rephrasing or broadening your search.',
            type: 'response',
            _new: true,
          },
        ]);
      } else if (topCount === 0 && poolCount > 0) {
        // Pass1 found candidates but the judge rejected all of them
        setMessages(prev => [
          ...prev,
          {
            role: 'bot',
            text: `${result.summary || ''}\n\n${poolCount} candidate${poolCount !== 1 ? 's' : ''} were evaluated, but none met the specific requirements of your query.`,
            type: 'response',
            studies: result.filtered,
            _new: true,
          },
        ]);
      } else {
        // Judge approved 1-3 top projects
        setMessages(prev => [
          ...prev,
          {
            role: 'bot',
            text: `${result.summary || ''}\n\n**${topCount}** project${topCount !== 1 ? 's' : ''} selected by deep analysis (from ${poolCount} candidate${poolCount !== 1 ? 's' : ''}).`,
            type: 'response',
            studies: result.topStudies,
            _new: true,
          },
        ]);
      }

      // Show the judge's overall analysis
      if (result.pass2?.overall_analysis) {
        setMessages(prev => [
          ...prev,
          { role: 'bot', text: result.pass2.overall_analysis, type: 'analysis', _new: true },
        ]);
      }
    } catch (err) {
      if (err.status === 429) {
        setRateLimitHit(true);
        setMessages(prev => [
          ...prev,
          { role: 'bot', text: 'Daily deep search limit reached. Try Quick mode, or try again tomorrow.', type: 'error', _new: true },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'bot', text: `Deep analysis failed: ${err.message}. Try Quick mode instead.`, type: 'error', _new: true },
        ]);
      }
    } finally {
      setLoading(false);
      setProgressMsg('');
    }
  }, [input, loading, caseStudies, onFilteredResults]);

  const handleSubmit = useCallback(() => {
    if (searchDepth === 'deep') {
      handleDeepSend();
    } else {
      handleSend();
    }
  }, [searchDepth, handleDeepSend, handleSend]);

  const handleShowAll = useCallback(() => {
    if (!lastResultStudies || !onShowAllResults) return;
    const resolved = lastResultStudies.map(s => resolveStudy(s));
    onShowAllResults(resolved);
  }, [lastResultStudies, onShowAllResults, resolveStudy]);

  const handleToggleGridView = useCallback(() => {
    if (isSidebar) {
      // Already in sidebar (grid visible) → go back to overlay (chat only)
      if (onToggleMode) onToggleMode('overlay');
    } else {
      // In overlay → switch to sidebar + show results in grid
      if (lastResultStudies && lastResultStudies.length > 0) {
        const resolved = lastResultStudies.map(s => resolveStudy(s));
        if (onShowAllResults) onShowAllResults(resolved);
      } else if (onToggleMode) {
        onToggleMode('sidebar');
      }
    }
  }, [isSidebar, lastResultStudies, onShowAllResults, onToggleMode, resolveStudy]);

  const handleToggleDeep = useCallback(() => {
    const newDepth = searchDepth === 'deep' ? 'quick' : 'deep';
    setSearchDepth(newDepth);
    if (newDepth === 'deep') {
      setMessages(prev => [
        ...prev,
        {
          role: 'bot',
          text: '**Deep Research activated.** Your next query will run a two-pass analysis: first a broad filter scan, then an expert evaluation of the top candidates. This uses AI world-knowledge to judge relevance — not just tag matching. Results are limited to the best 1-3 projects (or none if nothing truly fits).',
          type: 'system',
          _new: true,
        },
      ]);
    }
  }, [searchDepth]);

  const showLowUsageWarning = remainingRequests >= 0 && remainingRequests < DAILY_LIMIT * 0.2;

  const panelContent = (
    <div className={`deep-ai-panel ${isSidebar ? 'sidebar' : ''}`}>
      <div className="deep-ai-header">
        <div className="deep-ai-header-left">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.4 5.7 21l2.3-7L2 9.4h7.6z"/>
          </svg>
          <span className="deep-ai-title">Deep AI Search</span>
          <span className="deep-ai-badge">Groq</span>
        </div>
        <div className="deep-ai-header-right">
          {lastResultStudies && lastResultStudies.length > 0 && (
            <button
              className={`deep-ai-grid-toggle ${isSidebar ? 'active' : ''}`}
              onClick={handleToggleGridView}
              title={isSidebar ? 'Back to chat' : 'View results in grid'}
            >
              {isSidebar ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                </svg>
              )}
              <span>{isSidebar ? 'Chat' : 'Grid'}</span>
            </button>
          )}
          {messages.length > 1 && (
            <button className="deep-ai-clear" onClick={handleClearChat} title="Clear chat">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          )}
          <button className="deep-ai-close" onClick={onClose} title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="deep-ai-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`deep-ai-message ${msg.role}`}>
            {msg.role === 'bot' && (
              <div className="deep-ai-bot-avatar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.4 5.7 21l2.3-7L2 9.4h7.6z"/>
                </svg>
              </div>
            )}
            <div className={`deep-ai-bubble ${msg.role} ${msg.type === 'analysis' ? 'analysis' : ''} ${msg.type === 'error' ? 'error' : ''} ${msg.type === 'system' ? 'system-msg' : ''}`}>
              {msg._new && msg.role === 'bot' && i === messages.length - 1 && msg.type !== 'greeting' ? (
                <TypewriterMessage text={msg.text} speed={12} />
              ) : (
                <div>{renderMarkdown(msg.text)}</div>
              )}
              {msg.studies && msg.studies.length > 0 && (
                <div className="deep-ai-study-chips">
                  <div className="deep-ai-study-chips-header">
                    <span>{msg.studies.length} project{msg.studies.length !== 1 ? 's' : ''} found</span>
                    {onShowAllResults && (
                      <button className="deep-ai-see-all-btn" onClick={handleShowAll}>
                        See all results
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="deep-ai-study-chips-list">
                    {msg.studies.map((study, j) => (
                      <div
                        key={j}
                        className={`deep-ai-study-chip ${j < 3 ? 'top-match' : ''}`}
                        onClick={() => onSelectStudy && onSelectStudy(resolveStudy(study))}
                      >
                        {j < 3 && <span className="deep-ai-chip-rank">#{j + 1}</span>}
                        <div className="deep-ai-chip-info">
                          <strong>{study.title}</strong>
                          <span>{study.city}, {study.country}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="deep-ai-message bot">
            <div className="deep-ai-bot-avatar">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.4 5.7 21l2.3-7L2 9.4h7.6z"/>
              </svg>
            </div>
            <div className="deep-ai-bubble bot loading">
              {progressMsg && <span className="deep-ai-progress-text">{progressMsg}</span>}
              <span className="deep-ai-dots">
                <span /><span /><span />
              </span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="deep-ai-input-area">
        {showLowUsageWarning && (
          <div className="deep-ai-usage-warning">
            {remainingRequests} request{remainingRequests !== 1 ? 's' : ''} remaining today
          </div>
        )}
        <div className="deep-ai-input-row">
          <button
            className={`deep-ai-deep-toggle ${searchDepth === 'deep' ? 'active' : ''}`}
            onClick={handleToggleDeep}
            disabled={loading}
            title={searchDepth === 'deep' ? 'Deep Research ON — click to switch to Quick mode' : 'Activate Deep Research (two-pass expert analysis)'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              {searchDepth === 'deep' && <path d="M11 8v6M8 11h6"/>}
            </svg>
            <span>Deep</span>
          </button>
          <input
            ref={inputRef}
            type="text"
            className="deep-ai-input"
            placeholder={rateLimitHit ? 'Daily limit reached' : searchDepth === 'deep' ? 'Deep analysis query...' : 'Ask about NBS projects...'}
            value={input}
            disabled={rateLimitHit || loading}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <button
            className={`deep-ai-send ${searchDepth === 'deep' ? 'deep-mode' : ''}`}
            onClick={handleSubmit}
            disabled={!input.trim() || loading || rateLimitHit}
            title={searchDepth === 'deep' ? 'Deep Search' : 'Send'}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  if (isSidebar) {
    return <div className="deep-ai-sidebar-wrapper">{panelContent}</div>;
  }

  return (
    <div className="deep-ai-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {panelContent}
    </div>
  );
}

export default DeepAISearch;
