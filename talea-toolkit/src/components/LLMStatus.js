import { useState, useEffect, useCallback } from 'react';
import { initLLM, subscribeLLMStatus, isLLMReady, isLLMLoading } from '../utils/llmEngine';

function LLMStatus({ onModeChange, chatMode }) {
  const [status, setStatus] = useState({ type: isLLMReady() ? 'ready' : 'idle' });
  const [supportsWebGPU, setSupportsWebGPU] = useState(true);

  useEffect(() => {
    // Check WebGPU support
    if (!navigator.gpu) {
      setSupportsWebGPU(false);
      return;
    }

    const unsub = subscribeLLMStatus(setStatus);
    return unsub;
  }, []);

  const handleLoadClick = useCallback(async () => {
    if (isLLMReady() || isLLMLoading()) return;
    await initLLM();
  }, []);

  if (!supportsWebGPU) return null;

  return (
    <div className="llm-status">
      <div className="llm-mode-toggle">
        <button
          className={`llm-mode-btn ${chatMode === 'quick' ? 'active' : ''}`}
          onClick={() => onModeChange('quick')}
        >
          Quick
        </button>
        <button
          className={`llm-mode-btn ${chatMode === 'ai' ? 'active' : ''}`}
          onClick={() => {
            if (isLLMReady()) {
              onModeChange('ai');
            } else {
              handleLoadClick();
            }
          }}
          disabled={status.type === 'loading'}
        >
          AI
        </button>
      </div>

      {status.type === 'loading' && (
        <div className="llm-progress">
          <div className="llm-progress-bar">
            <div
              className="llm-progress-fill"
              style={{ width: `${(status.progress || 0) * 100}%` }}
            />
          </div>
          <span className="llm-progress-text">{status.message}</span>
        </div>
      )}

      {status.type === 'ready' && chatMode !== 'ai' && (
        <span className="llm-ready-badge" onClick={() => onModeChange('ai')}>
          AI Ready
        </span>
      )}

      {status.type === 'error' && (
        <span className="llm-error-text">{status.message}</span>
      )}
    </div>
  );
}

export default LLMStatus;
