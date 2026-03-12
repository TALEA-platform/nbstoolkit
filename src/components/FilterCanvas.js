import { useRef, useState, useCallback, useEffect } from 'react';
import { FILTER_CATEGORIES, FILTER_GROUPS } from '../data/filterConfig';

const CATEGORY_ORDER = Object.values(FILTER_GROUPS).flatMap(group => group.categories);
const CATEGORY_ORDER_INDEX = new Map(CATEGORY_ORDER.map((catKey, index) => [catKey, index]));
const MIN_PALETTE_HEIGHT = 140;
const MIN_DROPZONE_HEIGHT = 180;
const MIN_CONTENT_DROPZONE_HEIGHT = 150;
const DEFAULT_PALETTE_HEIGHT = 240;
const DEFAULT_PALETTE_HEIGHT_EXPANDED = 320;
const PANEL_GAP_ALLOWANCE = 18;
const CANVAS_STICKY_TOP = 90;
const CANVAS_BOTTOM_MARGIN = 16;
const MIN_SECTION_HEIGHT = 320;
const DEFAULT_FILTER_MODE = 'and';

function FilterCanvas({ canvasFilters, onRemoveFilter, onAddFilter, onAddExcludedFilter, onClearAll, filteredCount, totalCount, onToggleExclude, excludedFilters, onShowHelp, activeFilters, filterModes, onSetFilterMode }) {
  const canvasRef = useRef(null);
  const sectionRef = useRef(null);
  const toolbarRef = useRef(null);
  const bannerRef = useRef(null);
  const resizerRef = useRef(null);
  const resultBarRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [notMode, setNotMode] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [paletteHeight, setPaletteHeight] = useState(DEFAULT_PALETTE_HEIGHT);
  const [dropzoneHeight, setDropzoneHeight] = useState(MIN_CONTENT_DROPZONE_HEIGHT);
  const [isResizingPanels, setIsResizingPanels] = useState(false);
  const [availableSectionHeight, setAvailableSectionHeight] = useState(null);

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
        if (data.excluded && onAddExcludedFilter) {
          onAddExcludedFilter(data.categoryKey, data.value);
        } else {
          onAddFilter(data.categoryKey, data.value);
        }
      }
    } catch (err) {
      // ignore
    }
  }, [onAddFilter, onAddExcludedFilter]);

  const handlePaletteItemDragStart = useCallback((e, categoryKey, value) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ categoryKey, value, excluded: notMode }));
  }, [notMode]);

  const handlePaletteItemClick = useCallback((catKey, opt) => {
    if (notMode && onAddExcludedFilter) {
      onAddExcludedFilter(catKey, opt);
    } else {
      onAddFilter(catKey, opt);
    }
  }, [notMode, onAddFilter, onAddExcludedFilter]);

  const isExcludedCanvasFilter = useCallback((filter) => {
    return filter.excluded || (excludedFilters?.[filter.categoryKey] || []).includes(filter.value);
  }, [excludedFilters]);

  const includedCanvasFilters = canvasFilters.filter(filter => !isExcludedCanvasFilter(filter));
  const excludedCanvasFilters = canvasFilters.filter(filter => isExcludedCanvasFilter(filter));
  const canResizePanels = showPalette && canvasFilters.length > 0;

  const updateAvailableSectionHeight = useCallback(() => {
    if (typeof window === 'undefined') return;

    const sectionTop = sectionRef.current?.getBoundingClientRect().top;
    const clampedTop = Number.isFinite(sectionTop)
      ? Math.max(sectionTop, CANVAS_STICKY_TOP)
      : CANVAS_STICKY_TOP;
    const nextHeight = Math.max(
      MIN_SECTION_HEIGHT,
      Math.floor(window.innerHeight - clampedTop - CANVAS_BOTTOM_MARGIN)
    );

    setAvailableSectionHeight(prev => (prev === nextHeight ? prev : nextHeight));
  }, []);

  useEffect(() => {
    updateAvailableSectionHeight();
    window.addEventListener('resize', updateAvailableSectionHeight);
    window.addEventListener('scroll', updateAvailableSectionHeight, { passive: true });

    return () => {
      window.removeEventListener('resize', updateAvailableSectionHeight);
      window.removeEventListener('scroll', updateAvailableSectionHeight);
    };
  }, [updateAvailableSectionHeight]);

  const getMaxPaletteHeight = useCallback(() => {
    const sectionHeight = availableSectionHeight || 0;
    const toolbarHeight = toolbarRef.current?.offsetHeight || 0;
    const bannerHeight = bannerRef.current?.offsetHeight || 0;
    const resultBarHeight = resultBarRef.current?.offsetHeight || 0;
    const resizerHeight = canResizePanels ? (resizerRef.current?.offsetHeight || 26) : 0;
    const availableHeight = sectionHeight - toolbarHeight - bannerHeight - resultBarHeight - resizerHeight - MIN_DROPZONE_HEIGHT - PANEL_GAP_ALLOWANCE;

    return Math.max(MIN_PALETTE_HEIGHT, availableHeight);
  }, [availableSectionHeight, canResizePanels]);

  const getMaxDropzoneHeight = useCallback(() => {
    const sectionHeight = availableSectionHeight || 0;
    const toolbarHeight = toolbarRef.current?.offsetHeight || 0;
    const bannerHeight = bannerRef.current?.offsetHeight || 0;
    const resultBarHeight = resultBarRef.current?.offsetHeight || 0;
    const resizerHeight = canResizePanels ? (resizerRef.current?.offsetHeight || 26) : 0;
    const currentPaletteHeight = showPalette ? paletteHeight : 0;
    const availableHeight = sectionHeight - toolbarHeight - bannerHeight - resultBarHeight - resizerHeight - currentPaletteHeight - PANEL_GAP_ALLOWANCE;

    return Math.max(MIN_CONTENT_DROPZONE_HEIGHT, availableHeight);
  }, [availableSectionHeight, canResizePanels, showPalette, paletteHeight]);

  const clampPaletteHeight = useCallback((nextHeight) => {
    const maxPaletteHeight = getMaxPaletteHeight();
    return Math.max(MIN_PALETTE_HEIGHT, Math.min(nextHeight, maxPaletteHeight));
  }, [getMaxPaletteHeight]);

  useEffect(() => {
    if (!showPalette) return;

    const defaultHeight = isExpanded ? DEFAULT_PALETTE_HEIGHT_EXPANDED : DEFAULT_PALETTE_HEIGHT;
    if (!canResizePanels) {
      setPaletteHeight(defaultHeight);
      return;
    }

    setPaletteHeight(prev => clampPaletteHeight(prev || defaultHeight));
  }, [showPalette, isExpanded, notMode, canResizePanels, clampPaletteHeight]);

  useEffect(() => {
    if (!canResizePanels) return;

    function syncPaletteHeight() {
      setPaletteHeight(prev => clampPaletteHeight(prev));
    }

    window.addEventListener('resize', syncPaletteHeight);
    return () => window.removeEventListener('resize', syncPaletteHeight);
  }, [canResizePanels, clampPaletteHeight]);

  useEffect(() => {
    if (canvasFilters.length === 0) return;

    function syncDropzoneHeight() {
      const maxDropzoneHeight = getMaxDropzoneHeight();
      const naturalHeight = canvasRef.current?.scrollHeight || MIN_CONTENT_DROPZONE_HEIGHT;
      const nextHeight = Math.max(MIN_CONTENT_DROPZONE_HEIGHT, Math.min(naturalHeight, maxDropzoneHeight));
      setDropzoneHeight(prev => (prev === nextHeight ? prev : nextHeight));
    }

    syncDropzoneHeight();
    window.addEventListener('resize', syncDropzoneHeight);
    return () => window.removeEventListener('resize', syncDropzoneHeight);
  }, [canvasFilters, includedCanvasFilters.length, excludedCanvasFilters.length, showPalette, paletteHeight, notMode, isExpanded, getMaxDropzoneHeight]);

  useEffect(() => {
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, []);

  const handlePanelResizeStart = useCallback((event) => {
    if (!canResizePanels) return;

    event.preventDefault();
    const startY = event.clientY;
    const startHeight = paletteHeight;

    setIsResizingPanels(true);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    function handlePointerMove(moveEvent) {
      const deltaY = moveEvent.clientY - startY;
      setPaletteHeight(clampPaletteHeight(startHeight + deltaY));
    }

    function handlePointerUp() {
      setIsResizingPanels(false);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [canResizePanels, paletteHeight, clampPaletteHeight]);

  function getCategoryMeta(catKey, cat) {
    const label = cat?.label || catKey;
    const labelMatch = label.match(/^([A-D]\d(?:\.\d+)?)\s+(.*)$/i);
    if (labelMatch) {
      return {
        code: labelMatch[1].toUpperCase(),
        title: labelMatch[2],
      };
    }
    return {
      code: null,
      title: label,
    };
  }

  function renderCanvasFilterGroups(filters, { showLogic = false, sectionTone = 'include' } = {}) {
    const grouped = {};
    for (const filter of filters) {
      if (!grouped[filter.categoryKey]) grouped[filter.categoryKey] = [];
      grouped[filter.categoryKey].push(filter);
    }

    const categoryKeys = [
      ...CATEGORY_ORDER.filter(catKey => grouped[catKey]),
      ...Object.keys(grouped)
        .filter(catKey => !CATEGORY_ORDER_INDEX.has(catKey))
        .sort((a, b) => a.localeCompare(b)),
    ];

    return categoryKeys.map((catKey, groupIdx) => {
      const cat = FILTER_CATEGORIES[catKey];
      const optionOrderIndex = new Map((cat?.options || []).map((opt, index) => [opt, index]));
      const filtersInCategory = [...grouped[catKey]].sort((a, b) => {
        const aIndex = optionOrderIndex.has(a.value) ? optionOrderIndex.get(a.value) : Number.MAX_SAFE_INTEGER;
        const bIndex = optionOrderIndex.has(b.value) ? optionOrderIndex.get(b.value) : Number.MAX_SAFE_INTEGER;
        if (aIndex !== bIndex) return aIndex - bIndex;
        return a.value.localeCompare(b.value);
      });
      const { code, title } = getCategoryMeta(catKey, cat);
      const activeCount = (activeFilters?.[catKey] || []).length;
      const mode = filterModes?.[catKey] || DEFAULT_FILTER_MODE;
      const dividerColor = sectionTone === 'exclude' ? '#c53030' : (cat?.color || '#8aa29e');
      const dividerStyle = {
        '--divider-color': dividerColor,
        '--divider-surface': `${dividerColor}14`,
      };

      return (
        <div key={catKey} className="canvas-chip-group-block">
          <div className="canvas-chip-group-header">
            {code && (
              <span
                className={`canvas-chip-group-id ${sectionTone === 'exclude' ? 'excluded' : ''}`}
                style={{ borderColor: dividerColor, color: dividerColor, backgroundColor: `${dividerColor}14` }}
              >
                {code}
              </span>
            )}
            <span className={`canvas-chip-group-title ${sectionTone === 'exclude' ? 'excluded' : ''}`}>
              {title}
            </span>
          </div>
          <div className="canvas-chip-group">
            {showLogic && activeCount >= 2 && (
              <div className="logic-toggle-group group-mode" role="group" aria-label={`${title} filter mode`}>
                <button
                  className={`logic-toggle group-mode ${mode === 'and' ? 'and active' : ''}`}
                  onClick={() => onSetFilterMode && onSetFilterMode(catKey, 'and')}
                  title="Use AND logic for this category"
                  type="button"
                  aria-pressed={mode === 'and'}
                >
                  AND
                </button>
                <button
                  className={`logic-toggle group-mode ${mode === 'or' ? 'or active' : ''}`}
                  onClick={() => onSetFilterMode && onSetFilterMode(catKey, 'or')}
                  title="Use OR logic for this category"
                  type="button"
                  aria-pressed={mode === 'or'}
                >
                  OR
                </button>
              </div>
            )}
            {filtersInCategory.map(f => {
              const isExcluded = isExcludedCanvasFilter(f);
              return (
                <div key={f.id} className="canvas-chip-with-logic">
                  <div
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
                </div>
              );
            })}
          </div>
          {groupIdx < categoryKeys.length - 1 && (
            <div className={`canvas-chip-group-divider ${sectionTone === 'exclude' ? 'excluded' : ''}`} style={dividerStyle}>
              <span className="canvas-chip-group-divider-line" />
              <span className="canvas-chip-group-divider-plus">+</span>
              <span className="canvas-chip-group-divider-line" />
            </div>
          )}
        </div>
      );
    });
  }

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
    <div
      ref={sectionRef}
      className={`filter-canvas-section ${notMode ? 'not-mode-active' : ''} ${isExpanded ? 'expanded' : ''}`}
      style={availableSectionHeight ? { maxHeight: `${availableSectionHeight}px` } : undefined}
    >
      <div ref={toolbarRef} className="canvas-toolbar">
        <h3 className="canvas-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="2" width="20" height="20" rx="4"/>
            <path d="M7 7h10M7 12h6M7 17h8"/>
          </svg>
          Filter Canvas
        </h3>
        <button
          className={`canvas-expand-icon-btn ${isExpanded ? 'active' : ''}`}
          onClick={() => setIsExpanded(prev => !prev)}
          title={isExpanded ? 'Return to compact canvas width' : 'Expand the canvas width for easier scanning'}
          aria-label={isExpanded ? 'Compact canvas' : 'Expand canvas'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 3 21 3 21 9"/>
            <polyline points="9 21 3 21 3 15"/>
            <line x1="21" y1="3" x2="14" y2="10"/>
            <line x1="3" y1="21" x2="10" y2="14"/>
          </svg>
        </button>
        <div className="canvas-actions">
          {onShowHelp && (
            <button className="canvas-help-btn" onClick={() => onShowHelp(2)} title="How filters work">
              ?
            </button>
          )}
          <button
            className={`not-mode-toggle ${notMode ? 'active' : ''}`}
            onClick={() => setNotMode(prev => !prev)}
            title={notMode ? 'NOT mode ON — click items to exclude them' : 'Enable NOT mode to add exclusion filters'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10"/>
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
            </svg>
            NOT
          </button>
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

      {notMode && (
        <div ref={bannerRef} className="not-mode-banner">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
          <span>NOT mode — clicking palette items will <strong>exclude</strong> them from results</span>
        </div>
      )}

      {showPalette && (
        <div className="filter-palette" style={{ height: `${paletteHeight}px` }}>
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
                          const isExcluded = canvasFilters.some(f => f.categoryKey === catKey && f.value === opt && f.excluded);
                          return (
                            <div
                              key={opt}
                              className={`palette-item ${isOnCanvas ? 'on-canvas' : ''} ${isExcluded ? 'on-canvas-excluded' : ''} ${notMode && !isOnCanvas ? 'not-mode-item' : ''}`}
                              draggable={!isOnCanvas}
                              onDragStart={(e) => handlePaletteItemDragStart(e, catKey, opt)}
                              onClick={() => !isOnCanvas && handlePaletteItemClick(catKey, opt)}
                              style={{ borderColor: isExcluded ? '#c5303060' : (notMode && !isOnCanvas) ? '#c5303040' : cat.color + '60', color: isOnCanvas ? '#999' : undefined }}
                            >
                              <span className="palette-item-dot" style={{ backgroundColor: isExcluded ? '#c53030' : (notMode && !isOnCanvas) ? '#c53030' : cat.color }} />
                              {opt}
                              {isOnCanvas && !isExcluded && <span className="palette-item-check">&#10003;</span>}
                              {isExcluded && <span className="palette-item-not-badge">NOT</span>}
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

      {canResizePanels && (
        <button
          ref={resizerRef}
          className={`canvas-panel-resizer ${isResizingPanels ? 'active' : ''}`}
          onPointerDown={handlePanelResizeStart}
          type="button"
          aria-label="Resize palette and canvas panels"
          title="Drag to resize the top and bottom canvas panels"
        >
          <span className="canvas-panel-resizer-line" />
          <span className="canvas-panel-resizer-handle">
            <span />
            <span />
            <span />
          </span>
          <span className="canvas-panel-resizer-line" />
        </button>
      )}

      <div
        ref={canvasRef}
        className={`canvas-dropzone ${dragOver ? 'drag-over' : ''} ${canvasFilters.length === 0 ? 'empty' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={canvasFilters.length > 0 ? { height: `${dropzoneHeight}px` } : undefined}
      >
        {canvasFilters.length === 0 ? (
          <div className="dropzone-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Drop filters here or click items from the palette</span>
          </div>
        ) : (
          <div className="canvas-chip-sections">
            {includedCanvasFilters.length > 0 && (
              <div className="canvas-chip-section">
                <div className="canvas-chip-groups">
                  {renderCanvasFilterGroups(includedCanvasFilters, { showLogic: true, sectionTone: 'include' })}
                </div>
              </div>
            )}
            {excludedCanvasFilters.length > 0 && (
              <div className="canvas-chip-section not-section">
                <div className="canvas-chip-section-header">
                  <span className="canvas-chip-section-label">NOT</span>
                </div>
                <div className="canvas-chip-groups">
                  {renderCanvasFilterGroups(excludedCanvasFilters, { sectionTone: 'exclude' })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div ref={resultBarRef} className="canvas-result-bar">
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
