import { useState, useRef, useEffect, useCallback } from 'react';
import { sendDeepAIQuery, analyzeProjects, applyAIFilters } from '../utils/deepAIService';

const STORAGE_KEY = 'talea_deep_ai_chat';

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
    // Strip full study objects to keep storage small — save only id/title/city/country
    const slim = messages.map(m => {
      if (!m.studies) return m;
      return {
        ...m,
        studies: m.studies.map(s => ({ id: s.id, title: s.title, city: s.city, country: s.country })),
      };
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch { /* quota exceeded — silently ignore */ }
}

const GREETING = { role: 'bot', text: "Hi! I'm the TALEA Deep AI assistant. Ask me anything about nature-based solutions — I'll search across all 29 categories to find the best matches.", type: 'greeting' };

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

  return <p>{displayed}{!done && <span className="typing-cursor">|</span>}</p>;
}

function DeepAISearch({ caseStudies, onClose, onSelectStudy, onShowAllResults, mode }) {
  const isSidebar = mode === 'sidebar';
  const [messages, setMessages] = useState(() => loadChat() || [GREETING]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateLimitHit, setRateLimitHit] = useState(false);
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

      // Apply AI filters to local data
      const filtered = applyAIFilters(aiResponse, caseStudies);

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
        },
      ]);

      // RAG analysis on top 3 (non-blocking)
      if (filtered.length > 0) {
        analyzeProjects(trimmed, filtered.slice(0, 3))
          .then(analysis => {
            const analysisText = analysis?.analysis || analysis?.text || analysis?.message;
            if (analysisText) {
              setMessages(prev => [
                ...prev,
                { role: 'bot', text: analysisText, type: 'analysis' },
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
          { role: 'bot', text: 'Daily limit reached (15/15 requests). Try again tomorrow, or use the regular search.', type: 'error' },
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'bot', text: `Something went wrong: ${err.message}. Try the regular search instead.`, type: 'error' },
        ]);
      }
    } finally {
      setLoading(false);
    }
  }, [input, loading, caseStudies]);

  const handleShowAll = useCallback(() => {
    if (!lastResultStudies || !onShowAllResults) return;
    const resolved = lastResultStudies.map(s => resolveStudy(s));
    onShowAllResults(resolved);
  }, [lastResultStudies, onShowAllResults, resolveStudy]);

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
            <div className={`deep-ai-bubble ${msg.role} ${msg.type === 'analysis' ? 'analysis' : ''} ${msg.type === 'error' ? 'error' : ''}`}>
              {msg.role === 'bot' && i === messages.length - 1 && msg.type !== 'greeting' ? (
                <TypewriterMessage text={msg.text} speed={12} />
              ) : (
                <p>{msg.text}</p>
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
              <span className="deep-ai-dots">
                <span /><span /><span />
              </span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="deep-ai-input-area">
        <input
          ref={inputRef}
          type="text"
          className="deep-ai-input"
          placeholder={rateLimitHit ? 'Daily limit reached' : 'Ask about NBS projects...'}
          value={input}
          disabled={rateLimitHit || loading}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <button
          className="deep-ai-send"
          onClick={handleSend}
          disabled={!input.trim() || loading || rateLimitHit}
          title="Send"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
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
