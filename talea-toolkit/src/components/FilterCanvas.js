import { useRef, useState, useCallback } from 'react';
import { FILTER_CATEGORIES, FILTER_GROUPS } from '../data/filterConfig';

function FilterCanvas({ canvasFilters, onRemoveFilter, onAddFilter, onClearAll, filteredCount, totalCount, onToggleExclude, excludedFilters }) {
  const canvasRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPalette, setShowPalette] = useState(false);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.categoryKey && data.value) {
        onAddFilter(data.categoryKey, data.value);
      }
    } catch (err) {
      // ignore
    }
  }, [onAddFilter]);

  const handlePaletteItemDragStart = useCallback((e, categoryKey, value) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ categoryKey, value }));
  }, []);

  if (canvasFilters.length === 0 && !showPalette) {
    return (
      <div className="filter-canvas-empty">
        <div className="canvas-prompt">
          <button className="canvas-add-btn" onClick={() => setShowPalette(true)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="4" strokeDasharray="4 2"/>
              <line x1="12" y1="8" x2="12" y2="16"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
            </svg>
            <span>Open Filter Canvas</span>
          </button>
          <p className="canvas-hint">Drag and drop filters to build your query visually</p>
        </div>
      </div>
    );
  }

  return (
    <div className="filter-canvas-section">
      <div className="canvas-toolbar">
        <h3 className="canvas-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="4"/>
            <path d="M7 7h10M7 12h6M7 17h8"/>
          </svg>
          Filter Canvas
        </h3>
        <div className="canvas-actions">
          <button
            className={`palette-toggle ${showPalette ? 'active' : ''}`}
            onClick={() => setShowPalette(!showPalette)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12" r=".5" fill="currentColor"/>
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
            </svg>
            Palette
          </button>
          {canvasFilters.length > 0 && (
            <button className="canvas-clear" onClick={onClearAll}>
              Clear All
            </button>
          )}
        </div>
      </div>

      {showPalette && (
        <div className="filter-palette">
          <div className="palette-categories">
            {Object.entries(FILTER_GROUPS).map(([groupKey, group]) => (
              <div key={groupKey} className="palette-group">
                <div className="palette-group-header">{group.icon} {group.label}</div>
                {group.categories.map(catKey => {
                  const cat = FILTER_CATEGORIES[catKey];
                  if (!cat) return null;
                  return (
                    <div key={catKey} className="palette-category">
                      <div className="palette-cat-header">
                        <span>{cat.icon} {cat.label}</span>
                      </div>
                      <div className="palette-items">
                        {cat.options.map(opt => {
                          const isOnCanvas = canvasFilters.some(f => f.categoryKey === catKey && f.value === opt);
                          return (
                            <div
                              key={opt}
                              className={`palette-item ${isOnCanvas ? 'on-canvas' : ''}`}
                              draggable={!isOnCanvas}
                              onDragStart={(e) => handlePaletteItemDragStart(e, catKey, opt)}
                              onClick={() => !isOnCanvas && onAddFilter(catKey, opt)}
                              style={{ borderColor: cat.color + '60', color: isOnCanvas ? '#999' : undefined }}
                            >
                              <span className="palette-item-dot" style={{ backgroundColor: cat.color }} />
                              {opt}
                              {isOnCanvas && <span className="palette-item-check">&#10003;</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <div
        ref={canvasRef}
        className={`canvas-dropzone ${dragOver ? 'drag-over' : ''} ${canvasFilters.length === 0 ? 'empty' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {canvasFilters.length === 0 ? (
          <div className="dropzone-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Drop filters here or click items from the palette</span>
          </div>
        ) : (
          <div className="canvas-chips">
            {canvasFilters.map(f => {
              const cat = FILTER_CATEGORIES[f.categoryKey];
              const isExcluded = f.excluded || (excludedFilters?.[f.categoryKey] || []).includes(f.value);
              return (
                <div
                  key={f.id}
                  className={`canvas-chip ${isExcluded ? 'excluded' : ''}`}
                  style={{
                    borderColor: isExcluded ? '#c53030' : cat?.color,
                    backgroundColor: isExcluded ? 'rgba(197,48,48,0.08)' : cat?.color + '12',
                  }}
                >
                  {isExcluded && <span className="chip-not-badge">NOT</span>}
                  <span className="chip-icon">{cat?.icon}</span>
                  <span className={`chip-label ${isExcluded ? 'chip-label-excluded' : ''}`}>{f.value}</span>
                  {onToggleExclude && (
                    <button
                      className="chip-toggle-exclude"
                      onClick={() => onToggleExclude(f.categoryKey, f.value)}
                      title={isExcluded ? 'Switch to include' : 'Switch to exclude'}
                    >
                      {isExcluded ? '+' : '-'}
                    </button>
                  )}
                  <button
                    className="chip-remove"
                    onClick={() => onRemoveFilter(f.id, f.categoryKey, f.value)}
                    style={{ color: isExcluded ? '#c53030' : cat?.color }}
                  >
                    &times;
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="canvas-result-bar">
        <div className="result-indicator">
          <div className="result-bar-track">
            <div
              className="result-bar-fill"
              style={{ width: `${(filteredCount / totalCount) * 100}%` }}
            />
          </div>
          <span className="result-bar-text">
            {filteredCount} matching solution{filteredCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>
    </div>
  );
}

export default FilterCanvas;
