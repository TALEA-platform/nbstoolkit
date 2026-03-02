import { useEffect, useState } from 'react';
import { NBS_CATEGORIES } from '../data/filterConfig';
import nbsDefinitions from '../data/nbsDefinitions.json';
import imageMap from '../data/imageMap';
import { exportSingleStudyPDF } from '../utils/pdfExport';

function Section({ title, children, icon }) {
  return (
    <div className="modal-section">
      <h3 className="section-title">
        {icon && <span className="section-icon">{icon}</span>}
        {title}
      </h3>
      <div className="section-content">{children}</div>
    </div>
  );
}

function TagList({ items, color }) {
  if (!items || items.length === 0) return <span className="tag-empty">None</span>;
  return (
    <div className="tag-list">
      {items.map((item, i) => (
        <span key={i} className="modal-tag" style={{ borderColor: color + '80', color: color }}>
          {item}
        </span>
      ))}
    </div>
  );
}

function CaseStudyModal({ study, onClose, isFavorite, onToggleFavorite }) {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const taleaTypes = [];
  if (study.talea_application.nodal) taleaTypes.push('Nodal');
  if (study.talea_application.linear) taleaTypes.push('Linear');
  if (study.talea_application.fragmented) taleaTypes.push('Fragmented');

  const imgSrc = imageMap[study.id];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        {/* Hero image */}
        {!imgError && imgSrc && (
          <div className="modal-hero">
            <img
              src={imgSrc}
              alt={study.title}
              className="modal-hero-img"
              onError={() => setImgError(true)}
            />
            <div className="modal-hero-overlay" />
            <div className="modal-hero-content">
              <span className="modal-id">Case Study #{study.id}</span>
              <h2 className="modal-title">{study.title}</h2>
              <div className="modal-meta-row">
                <div className="modal-location">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  {study.city}, {study.country}
                </div>
                <span className="modal-year">{study.year}</span>
              </div>
            </div>
          </div>
        )}

        {/* Fallback header when no image */}
        {(imgError || !imgSrc) && (
          <div className="modal-header">
            <span className="modal-id">Case Study #{study.id}</span>
            <h2 className="modal-title">{study.title}</h2>
            <div className="modal-meta-row">
              <div className="modal-location">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                {study.city}, {study.country}
              </div>
              <span className="modal-year">{study.year}</span>
            </div>
          </div>
        )}

        <div className="modal-badges-bar">
          <div className="modal-badges">
            <span className="modal-badge talea">{taleaTypes.join(' + ')}</span>
            <span className="modal-badge size">{study.size}</span>
            <span className="modal-badge climate">{study.climate_zone}</span>
            {study.has_social_innovation && <span className="modal-badge social">Social Innovation</span>}
            {study.has_digital_innovation && <span className="modal-badge digital">Digital Innovation</span>}
          </div>
          {onToggleFavorite && (
            <button className={`modal-fav-btn ${isFavorite ? 'active' : ''}`} onClick={() => onToggleFavorite(study.id)} title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite ? '#FFE604' : 'none'} stroke={isFavorite ? '#FFE604' : 'currentColor'} strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          )}
          <button className="modal-pdf-btn" onClick={() => exportSingleStudyPDF(study)} title="Download as PDF">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            PDF
          </button>
        </div>

        <div className="modal-body">
          <Section title="Description" icon="📋">
            <p className="modal-description">{study.description}</p>
          </Section>

          <div className="modal-info-grid">
            <div className="info-item">
              <label>Designer</label>
              <span>{study.designer}</span>
            </div>
            <div className="info-item">
              <label>Promoter</label>
              <span>{study.promoter}</span>
            </div>
          </div>

          <Section title="Physical Innovation" icon="🔧">
            <p>{study.physical_innovation}</p>
          </Section>

          <Section title="Social Innovation" icon="🤝">
            <p>{study.social_innovation}</p>
          </Section>

          <Section title="Digital Innovation" icon="💻">
            <p>{study.digital_innovation}</p>
          </Section>

          <Section title="A. Physical Characteristics" icon="🏗️">
            <div className="characteristics-grid">
              <div><h4>A1 Urban Scale</h4><TagList items={study.a1_urban_scale} color="#21A84A" /></div>
              <div><h4>A2 Urban Area</h4><TagList items={study.a2_urban_area} color="#d69e2e" /></div>
              <div><h4>A3.1 Buildings</h4><TagList items={study.a3_1_buildings} color="#1272B7" /></div>
              <div><h4>A3.2 Open Spaces</h4><TagList items={study.a3_2_open_spaces} color="#21A84A" /></div>
              <div><h4>A3.3 Infrastructures</h4><TagList items={study.a3_3_infrastructures} color="#1272B7" /></div>
              <div><h4>A4 Ownership</h4><TagList items={study.a4_ownership} color="#004d19" /></div>
              <div><h4>A5 Management</h4><TagList items={study.a5_management} color="#1272B7" /></div>
              <div><h4>A6 Uses</h4><TagList items={study.a6_uses} color="#21A84A" /></div>
              <div><h4>A7 Other</h4><TagList items={study.a7_other} color="#004d19" /></div>
            </div>
          </Section>

          <Section title="B. Constraints & Opportunities" icon="⚡">
            <div className="characteristics-grid">
              <div><h4>B1 Physical</h4><TagList items={study.b1_physical} color="#c53030" /></div>
              <div><h4>B2 Regulations</h4><TagList items={study.b2_regulations} color="#d69e2e" /></div>
              <div><h4>B3 Uses & Management</h4><TagList items={study.b3_uses_management} color="#21A84A" /></div>
              <div><h4>B4 Public Opinion</h4><TagList items={study.b4_public_opinion} color="#1272B7" /></div>
              <div><h4>B5 Synergy</h4><TagList items={study.b5_synergy} color="#004d19" /></div>
              <div><h4>B6 Social Opportunities</h4><TagList items={study.b6_social_opportunities} color="#21A84A" /></div>
            </div>
          </Section>

          <Section title="C. Design Process & Results" icon="🎨">
            <div className="characteristics-grid">
              <div><h4>C1.1 Design</h4><TagList items={study.c1_1_design} color="#1272B7" /></div>
              <div><h4>C1.2 Funding</h4><TagList items={study.c1_2_funding} color="#21A84A" /></div>
              <div><h4>C1.3 Management</h4><TagList items={study.c1_3_management} color="#d69e2e" /></div>
              <div><h4>C2 Actors</h4><TagList items={study.c2_actors} color="#1272B7" /></div>
              <div><h4>C3 Goals & Results</h4><TagList items={study.c3_goals} color="#004d19" /></div>
              <div><h4>C4 Services</h4><TagList items={study.c4_services} color="#21A84A" /></div>
            </div>
          </Section>

          {study.c5_impacts && (
            <Section title="C5 Impacts" icon="📊">
              <div className="impacts-structured">
                {study.c5_impacts.split('\n').filter(Boolean).map((line, i) => {
                  const trimmed = line.trim();
                  // Detect heading-like lines (all caps, short, or ending with colon)
                  const isHeading = /^[A-Z\s&/,()-]+:?$/.test(trimmed) || trimmed.endsWith(':');
                  // Detect bullet points
                  const isBullet = trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*');
                  if (isHeading) {
                    return <h4 key={i} className="impact-heading">{trimmed.replace(/:$/, '')}</h4>;
                  }
                  if (isBullet) {
                    return (
                      <div key={i} className="impact-bullet">
                        <span className="impact-bullet-marker" />
                        <span>{trimmed.replace(/^[-•*]\s*/, '')}</span>
                      </div>
                    );
                  }
                  return <p key={i} className="impact-paragraph">{trimmed}</p>;
                })}
              </div>
            </Section>
          )}

          <Section title="D. Nature-Based Solutions Applied" icon="🌿">
            <div className="nbs-grid">
              {Object.entries(NBS_CATEGORIES).map(([key, meta]) => {
                const items = study[key] || [];
                if (items.length === 0) return null;
                return (
                  <div key={key} className="nbs-category-block">
                    <h4 style={{ color: meta.color }}>{meta.icon} {meta.label}</h4>
                    <div className="nbs-items">
                      {items.map((item, i) => (
                        <div key={i} className="nbs-item" style={{ borderLeftColor: meta.color }}>
                          <span className="nbs-item-name">{item}</span>
                          {nbsDefinitions[item] && (
                            <span className="nbs-item-def">{nbsDefinitions[item]}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          {study.sources && (
            <Section title="Sources" icon="📚">
              <div className="sources-list">
                {study.sources.split('\n').filter(Boolean).map((src, i) => (
                  <a key={i} href={src.trim()} target="_blank" rel="noopener noreferrer" className="source-link">
                    {src.trim()}
                  </a>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

export default CaseStudyModal;
