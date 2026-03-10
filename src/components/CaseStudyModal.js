import { useEffect, useState, useMemo } from 'react';
import { NBS_CATEGORIES } from '../data/filterConfig';
import nbsDefinitions from '../data/nbsDefinitions.json';
import imageMap from '../data/imageMap';
import { exportSingleStudyPDF } from '../utils/pdfExport';
import getTaleaTypes from '../utils/getTaleaTypes';
import findSimilarStudies from '../utils/findSimilarStudies';
import cityCoordinates from '../data/cityCoordinates';

const IMPACT_BULLET_REGEX = /^([-*\u2022]|\d+[.)])\s+(.*)$/;
const SOURCE_URL_REGEX = /https?:\/\/[^\s|]+/g;
const SECTION_ICONS = {
  description: '\uD83D\uDCCB',
  physicalInnovation: '\uD83D\uDD27',
  socialInnovation: '\uD83E\uDD1D',
  digitalInnovation: '\uD83D\uDCBB',
  physicalCharacteristics: '\uD83C\uDFD7\uFE0F',
  constraints: '\u26A1',
  design: '\uD83C\uDFA8',
  impacts: '\uD83D\uDCCA',
  nbs: '\uD83C\uDF3F',
  sources: '\uD83D\uDCDA',
  similarStudies: '\uD83D\uDD17',
};

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

function renderSourceText(text, keyPrefix) {
  const parts = [];
  let lastIndex = 0;
  let match;

  SOURCE_URL_REGEX.lastIndex = 0;

  while ((match = SOURCE_URL_REGEX.exec(text)) !== null) {
    const rawUrl = match[0];
    const cleanUrl = rawUrl.replace(/[.,;:)\]]+$/g, '');
    const trailingText = rawUrl.slice(cleanUrl.length);

    if (match.index > lastIndex) {
      parts.push(
        <span key={`${keyPrefix}-text-${lastIndex}`} className="source-text">
          {text.slice(lastIndex, match.index)}
        </span>
      );
    }

    parts.push(
      <a
        key={`${keyPrefix}-link-${match.index}`}
        href={cleanUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="source-link"
      >
        {cleanUrl}
      </a>
    );

    if (trailingText) {
      parts.push(
        <span key={`${keyPrefix}-trail-${match.index}`} className="source-text">
          {trailingText}
        </span>
      );
    }

    lastIndex = match.index + rawUrl.length;
  }

  if (parts.length === 0) {
    return <span className="source-text">{text}</span>;
  }

  if (lastIndex < text.length) {
    parts.push(
      <span key={`${keyPrefix}-text-${lastIndex}`} className="source-text">
        {text.slice(lastIndex)}
      </span>
    );
  }

  return parts;
}

function CaseStudyModal({ study, onClose, isFavorite, onToggleFavorite, isCompared, onToggleCompare, compareCount, onShowCompare, allStudies, onSelectStudy }) {
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

  const taleaTypes = getTaleaTypes(study);
  const imgSrc = imageMap[study.id];

  // Get coordinates: prefer study-level, fall back to cityCoordinates
  const studyCoords = useMemo(() => {
    if (study.latitude && study.longitude) {
      return { lat: Number(study.latitude), lng: Number(study.longitude) };
    }
    const c = cityCoordinates[study.id];
    if (c) return { lat: c[0], lng: c[1] };
    return null;
  }, [study]);

  const similarStudies = useMemo(() => {
    if (!allStudies || allStudies.length < 2) return [];
    return findSimilarStudies(study, allStudies, 4);
  }, [study, allStudies]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-top-actions">
          {onToggleCompare && (
            <button className={`modal-action-btn ${isCompared ? 'active' : ''}`} onClick={() => onToggleCompare(study.id)} title={isCompared ? 'Remove from comparison' : 'Add to comparison'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M16 3l4 4-4 4"/><path d="M20 7H4"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h16"/>
              </svg>
            </button>
          )}
          {isCompared && compareCount >= 2 && onShowCompare && (
            <button className="modal-action-btn compare-go" onClick={onShowCompare} title="View comparison">
              Compare {compareCount}
            </button>
          )}
          {onToggleFavorite && (
            <button className={`modal-action-btn ${isFavorite ? 'fav-active' : ''}`} onClick={() => onToggleFavorite(study.id)} title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite ? '#FFE604' : 'none'} stroke={isFavorite ? '#FFE604' : 'currentColor'} strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          )}
          <button
            className="modal-action-btn modal-pdf-btn"
            onClick={() => exportSingleStudyPDF(study)}
            title="Download as PDF"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/>
            </svg>
            <span className="pdf-btn-label">PDF</span>
          </button>
          <button className="modal-action-btn modal-close-btn" onClick={onClose} title="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

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
            {study.has_physical_innovation && <span className="modal-badge physical">Physical Innovation</span>}
            {study.has_social_innovation && <span className="modal-badge social">Social Innovation</span>}
            {study.has_digital_innovation && <span className="modal-badge digital">Digital Innovation</span>}
          </div>
        </div>

        {studyCoords && (
          <div className="modal-coords-bar">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M2 12h4"/><path d="M18 12h4"/>
            </svg>
            <span className="modal-coords-text">
              {studyCoords.lat.toFixed(5)}, {studyCoords.lng.toFixed(5)}
            </span>
            <div className="modal-coords-links">
              <a href={`https://www.google.com/maps?layer=c&cbll=${studyCoords.lat},${studyCoords.lng}&cbp=,,,,`} target="_blank" rel="noopener noreferrer" title="Google Street View">Street View</a>
              <a href={`https://www.openstreetmap.org/?mlat=${studyCoords.lat}&mlon=${studyCoords.lng}#map=17/${studyCoords.lat}/${studyCoords.lng}`} target="_blank" rel="noopener noreferrer" title="OpenStreetMap">OSM</a>
              <a href={`geo:${studyCoords.lat},${studyCoords.lng}`} title="Open in maps app">Geo URI</a>
            </div>
          </div>
        )}

        <div className="modal-body">
          <Section title="Description" icon={SECTION_ICONS.description}>
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

          <Section title="Physical Innovation" icon={SECTION_ICONS.physicalInnovation}>
            <p>{study.physical_innovation}</p>
          </Section>

          <Section title="Social Innovation" icon={SECTION_ICONS.socialInnovation}>
            <p>{study.social_innovation}</p>
          </Section>

          <Section title="Digital Innovation" icon={SECTION_ICONS.digitalInnovation}>
            <p>{study.digital_innovation}</p>
          </Section>

          <Section title="A. Physical Characteristics" icon={SECTION_ICONS.physicalCharacteristics}>
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

          <Section title="B. Constraints & Opportunities" icon={SECTION_ICONS.constraints}>
            <div className="characteristics-grid">
              <div><h4>B1 Physical</h4><TagList items={study.b1_physical} color="#c53030" /></div>
              <div><h4>B2 Regulations</h4><TagList items={study.b2_regulations} color="#d69e2e" /></div>
              <div><h4>B3 Uses & Management</h4><TagList items={study.b3_uses_management} color="#21A84A" /></div>
              <div><h4>B4 Public Opinion</h4><TagList items={study.b4_public_opinion} color="#1272B7" /></div>
              <div><h4>B5 Synergy</h4><TagList items={study.b5_synergy} color="#004d19" /></div>
              <div><h4>B6 Social Opportunities</h4><TagList items={study.b6_social_opportunities} color="#21A84A" /></div>
            </div>
          </Section>

          <Section title="C. Design Process & Results" icon={SECTION_ICONS.design}>
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
            <Section title="C5 Impacts" icon={SECTION_ICONS.impacts}>
              <div className="impacts-structured">
                {study.c5_impacts.split('\n').filter(Boolean).map((line, i) => {
                  const trimmed = line.trim();
                  const bulletMatch = trimmed.match(IMPACT_BULLET_REGEX);

                  if (bulletMatch) {
                    return (
                      <div key={i} className="impact-bullet">
                        <span className="impact-bullet-marker" />
                        <span>{bulletMatch[2]}</span>
                      </div>
                    );
                  }
                  return <p key={i} className="impact-paragraph">{trimmed}</p>;
                })}
              </div>
            </Section>
          )}

          <Section title="D. Nature-Based Solutions Applied" icon={SECTION_ICONS.nbs}>
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
            <Section title="Sources" icon={SECTION_ICONS.sources}>
              <div className="sources-list">
                {study.sources.split('\n').filter(Boolean).map((src, i) => (
                  <div key={i} className="source-line">
                    {renderSourceText(src.trim(), `source-${i}`)}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {similarStudies.length > 0 && (
            <Section title="Similar Studies" icon={SECTION_ICONS.similarStudies}>
              <div className="similar-studies-grid">
                {similarStudies.map(({ study: sim, score }) => {
                  const simImg = imageMap[sim.id];
                  return (
                    <button
                      key={sim.id}
                      className="similar-study-card"
                      onClick={() => onSelectStudy && onSelectStudy(sim)}
                    >
                      <div className="similar-card-img">
                        {simImg ? (
                          <img src={simImg} alt="" loading="lazy" />
                        ) : (
                          <div className="similar-card-placeholder">#{sim.id}</div>
                        )}
                      </div>
                      <div className="similar-card-info">
                        <span className="similar-card-title">{sim.title}</span>
                        <span className="similar-card-location">{sim.city}, {sim.country}</span>
                        <span className="similar-card-meta">{sim.size} {"\u00B7"} {sim.climate_zone}</span>
                      </div>
                      <span className="similar-card-score" title="Similarity score">{score} pts</span>
                    </button>
                  );
                })}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

export default CaseStudyModal;
