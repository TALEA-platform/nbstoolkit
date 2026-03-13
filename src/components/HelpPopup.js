import { useState, useEffect } from 'react';

const HELP_PAGES = [
  {
    title: 'Getting Started',
    icon: '🏠',
    content: [
      { heading: 'What is TALEA Abacus?', text: 'TALEA Abacus is an interactive toolkit for exploring Nature-Based Solution (NBS) case studies from cities worldwide. Browse, search, filter, compare, and export data about real-world NBS projects. New submissions are added to the toolkit.' },
      { heading: 'Quick start', text: 'Type in the search bar to find solutions — the search supports fuzzy matching. Press Enter to submit your query and add filter chips automatically.' },
      { heading: 'Views', text: 'Switch between Grid, List, and Map view using the toggle buttons. Grid shows cards, List shows a compact table, and Map plots locations on an interactive map.' },
    ],
  },
  {
    title: 'Deep AI Search',
    icon: '🔍',
    content: [
      { heading: 'How it works', text: 'Click the star icon in the header to open the AI Search panel. Type a natural-language query (e.g. "green roofs in Mediterranean cities" or "community gardens not in Italy") and the AI translates it into structured filters across all 29 categories.' },
      { heading: 'Quick mode (default)', text: 'Quick mode runs a single AI pass that generates filters, applies them locally, and shows matching projects ranked by relevance. It also provides an analysis of why the results match your query.' },
      { heading: 'Deep Research mode', text: 'Click the "Deep" button to activate Deep Research. This runs a two-pass analysis: first a broad filter scan finds candidates, then an expert AI judge evaluates each one against your specific intent using real-world knowledge. Results are limited to the best 1-3 projects — or none if nothing truly fits.' },
      { heading: 'Exclusion & keywords', text: 'The AI understands negations ("not in Italy", "exclude green roofs") and semantic keywords beyond the structured filters. It also supports complex queries like "projects in Milan, or ones with rain gardens and biodiversity goals".' },
      { heading: 'Grid view', text: 'After getting results, click "See all results" or the Grid button in the header to see AI results in the main grid. Your normal filters and search still work on top of the AI results. Click the button again to return to the chat.' },
      { heading: 'Daily limits', text: 'AI search has a daily usage limit per user. Deep Research uses a separate, smaller quota since it costs two AI calls per query. A warning appears when you are running low.' },
    ],
  },
  {
    title: 'Filter Canvas',
    icon: '🎨',
    content: [
      { heading: 'How it works', text: 'The Filter Canvas is a visual query builder. Open the palette to see all filter categories organized in groups. Click or drag filters onto the canvas.' },
      { heading: 'Include / Exclude', text: 'Filters are green by default (include). You can exclude filters in two ways: (1) Click the NOT button in the canvas toolbar to activate NOT mode — while active, any palette item you click is added as an exclusion filter (red "NOT" chip). (2) After adding a filter, click the toggle button (-/+) on its chip to switch between include and exclude. Excluded filters remove matching results.' },
      { heading: 'AND / OR logic', text: 'Within a single category: when two or more filters are active, a toggle appears to switch between OR (match any — default) and AND (match all). Across different categories: filters always combine with AND, meaning a study must satisfy every category\'s condition. For example, selecting "Small" in Size AND "Tropical" in Climate shows only studies that are both small and tropical.' },
      { heading: 'Stacking with AI results', text: 'When AI search results are active, your filter canvas and search bar work on top of the AI-filtered pool. This lets you further narrow down AI results with manual filters.' },
    ],
  },
  {
    title: 'Map View',
    icon: '🗺️',
    content: [
      { heading: 'Interactive map', text: 'The map shows all case study locations using clustered markers. Zoom in to expand clusters into individual points.' },
      { heading: 'Map styles', text: 'Switch between Liberty, Bright, and Positron map styles using the buttons above the map.' },
      { heading: 'Point details', text: 'Click any marker to see a popup with the case study title, location, size, and climate zone. When multiple studies share the same location, a list of all studies appears.' },
      { heading: 'External links', text: 'Each popup includes links to Google Street View (finds the nearest available panorama), a geo: URI (opens your default maps app), and OpenStreetMap for the location.' },
    ],
  },
  {
    title: 'More Features',
    icon: '⚡',
    content: [
      { heading: 'Export data', text: 'Click the Export button in the header to download the current filtered results in three formats: PDF (formatted report), CSV (for spreadsheets and data analysis), or Excel (.xlsx with auto-sized columns). All exports include the currently filtered results.' },
      { heading: 'Submit new studies', text: 'Click "Submit New" to propose a new case study. The form is organized in sections covering basic info, innovation, physical characteristics, constraints, design process & goals, and NBS elements. Once submitted, it is sent to a Google Sheet for supervisor review. The supervisor receives an email notification and can approve or deny the submission. Approved studies are automatically merged into the toolkit by a nightly sync.' },
      { heading: 'Favorites', text: 'Click the star icon on any case study card to bookmark it. Use the star button in the header to filter only favorites. Favorites are saved in your browser.' },
      { heading: 'Compare mode', text: 'Select 2-3 studies using the compare checkbox on cards, then click Compare to see them side by side.' },
      { heading: 'Statistics', text: 'Click the bar chart icon to open the Statistics Dashboard with charts showing NBS distribution, top countries, climate zones, and size distribution.' },
      { heading: 'Similar studies', text: 'Open any case study detail view to see a "Similar Studies" section at the bottom, showing related projects based on size, climate, country, NBS elements, and goals.' },
      { heading: 'Slash commands', text: 'Type / in the search bar to see available commands like /map, /stats, /compare, /clear, /export, /favorites, and more.' },
      { heading: 'Theme', text: 'Toggle between light and dark themes using the sun/moon button.' },
    ],
  },
];

function HelpPopup({ isOpen, onClose, initialPage }) {
  const [currentPage, setCurrentPage] = useState(initialPage || 0);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const page = HELP_PAGES[currentPage];

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-popup" onClick={e => e.stopPropagation()}>
        <div className="help-header">
          <h2>How it works</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="help-nav">
          {HELP_PAGES.map((p, i) => (
            <button
              key={i}
              className={`help-nav-btn ${currentPage === i ? 'active' : ''}`}
              onClick={() => setCurrentPage(i)}
            >
              <span className="help-nav-icon">{p.icon}</span>
              <span className="help-nav-label">{p.title}</span>
            </button>
          ))}
        </div>

        <div className="help-content">
          <h3 className="help-page-title">{page.icon} {page.title}</h3>
          <div className="help-sections">
            {page.content.map((section, i) => (
              <div key={i} className="help-section">
                <h4>{section.heading}</h4>
                <p>{section.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="help-footer">
          <button
            className="help-prev"
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
          >
            ← Previous
          </button>
          <span className="help-page-indicator">
            {currentPage + 1} / {HELP_PAGES.length}
          </span>
          <button
            className="help-next"
            onClick={() => setCurrentPage(p => Math.min(HELP_PAGES.length - 1, p + 1))}
            disabled={currentPage === HELP_PAGES.length - 1}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

export default HelpPopup;
