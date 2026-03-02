// React 19 JSX transform - no explicit import needed
import ThemeToggle from './ThemeToggle';

function Header({ onShowForm, activeFilterCount, onClearAll, resultCount, totalCount, onExportPDF, theme, onToggleTheme, showFavorites, onToggleFavorites, favoritesCount, onShareURL, onShowHelp }) {
  return (
    <header className="app-header">
      <div className="header-left">
        <div className="logo">
          <img src={`${process.env.PUBLIC_URL}/talea-logo.png`} alt="TALEA" className="logo-img" />
          <div className="logo-text">
            <h1>Nature-Based Solutions Toolkit</h1>
            <span className="logo-subtitle">TALEA Abacus of Hardware Solutions</span>
          </div>
        </div>
      </div>
      <div className="header-right">
        <div className="header-stats">
          <span className="stat-badge">{resultCount}/{totalCount} solutions</span>
          {activeFilterCount > 0 && (
            <button className="clear-filters-btn" onClick={onClearAll}>
              Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
        <button
          className={`header-fav-btn ${showFavorites ? 'active' : ''}`}
          onClick={onToggleFavorites}
          title={showFavorites ? 'Show all' : 'Show favorites'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill={showFavorites ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
          {favoritesCount > 0 && <span className="fav-count-badge">{favoritesCount}</span>}
        </button>
        {onShareURL && (
          <button className="header-share-btn" onClick={onShareURL} title="Share current filters">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
            </svg>
          </button>
        )}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <button className="header-pdf-btn" onClick={onExportPDF} title="Export all results as PDF">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          Export PDF
        </button>
        <button className="header-help-btn" onClick={onShowHelp} title="How it works">
          ?
        </button>
        <button className="submit-btn" onClick={onShowForm}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Submit New
        </button>
      </div>
    </header>
  );
}

export default Header;
