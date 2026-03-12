import { useState, useRef, useEffect, useCallback } from 'react';
import { sendDeepAIQuery, analyzeProjects, applyAIFilters } from '../utils/deepAIService';

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

function DeepAISearch({ caseStudies, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'bot', text: "Hi! I'm the TALEA Deep AI assistant. Ask me anything about nature-based solutions — I'll search across all 29 categories to find the best matches.", type: 'greeting' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [rateLimitHit, setRateLimitHit] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
    setLoading(true);
    try {
      // Build history for context
      const historyForAPI = messages
        .filter(m => m.role === 'user' || (m.role === 'bot' && m.type !== 'greeting' && m.type !== 'analysis'))
        .map(m => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }));

      const aiResponse = await sendDeepAIQuery(trimmed, historyForAPI);

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
          studies: filtered.slice(0, 6),
        },
      ]);

      // RAG analysis (non-blocking)
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
  }, [input, loading, messages, caseStudies]);

  return (
    <div className="deep-ai-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="deep-ai-panel">
        <div className="deep-ai-header">
          <div className="deep-ai-header-left">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2l2.4 7.4H22l-6 4.6 2.3 7L12 16.4 5.7 21l2.3-7L2 9.4h7.6z"/>
            </svg>
            <span className="deep-ai-title">Deep AI Search</span>
            <span className="deep-ai-badge">Groq</span>
          </div>
          <button className="deep-ai-close" onClick={onClose} title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
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
                    {msg.studies.map((study, j) => (
                      <div key={j} className="deep-ai-study-chip">
                        <strong>{study.title}</strong>
                        <span>{study.city}, {study.country}</span>
                      </div>
                    ))}
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
    </div>
  );
}

export default DeepAISearch;
