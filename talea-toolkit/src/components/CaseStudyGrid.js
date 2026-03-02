import { useState, useRef, useCallback } from 'react';
import { NBS_CATEGORIES } from '../data/filterConfig';
import imageMap from '../data/imageMap';
import getTaleaTypes from '../utils/getTaleaTypes';

function getNBSTags(study) {
  const tags = [];
  for (const [key, meta] of Object.entries(NBS_CATEGORIES)) {
    for (const item of (study[key] || [])) {
      tags.push({ label: item, color: meta.color, category: meta.label });
    }
  }
  return tags;
}

function getTaleaType(study) {
  const types = getTaleaTypes(study);
  return types.join(' + ') || 'N/A';
}

function CaseStudyCard({ study, onSelect, isFavorite, onToggleFavorite, onCompareToggle, isComparing }) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const hoverTimer = useRef(null);
  const nbsTags = getNBSTags(study);
  const taleaType = getTaleaType(study);
  const imgSrc = imageMap[study.id];

  const handleMouseEnter = useCallback(() => {
    hoverTimer.current = setTimeout(() => setShowPreview(true), 300);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    setShowPreview(false);
  }, []);

  return (
    <div
      className="case-card"
      onClick={() => onSelect(study)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="card-image-container">
        {!imgError && imgSrc && (
          <img
            src={imgSrc}
            alt={study.title}
            className={`card-image ${imgLoaded ? 'loaded' : ''}`}
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgError(true)}
            loading="lazy"
          />
        )}
        {(!imgSrc || imgError) && (
          <div className="card-image-placeholder">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.3">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
        )}
        <div className="card-image-overlay">
          <span className="card-id">#{study.id}</span>
          <span className="card-talea-type">{taleaType}</span>
        </div>
        <div className="card-top-actions">
          {onToggleFavorite && (
            <button
              className={`card-fav-btn ${isFavorite ? 'active' : ''}`}
              onClick={e => { e.stopPropagation(); onToggleFavorite(study.id); }}
              title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite ? '#FFE604' : 'none'} stroke={isFavorite ? '#FFE604' : 'currentColor'} strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
              </svg>
            </button>
          )}
          {onCompareToggle && (
            <button
              className={`card-compare-btn ${isComparing ? 'active' : ''}`}
              onClick={e => { e.stopPropagation(); onCompareToggle(study.id); }}
              title={isComparing ? 'Remove from compare' : 'Add to compare'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </button>
          )}
        </div>
        <div className="card-innovations">
          {study.has_social_innovation && <span className="innovation-dot social" title="Social Innovation">S</span>}
          {study.has_digital_innovation && <span className="innovation-dot digital" title="Digital Innovation">D</span>}
        </div>
      </div>

      <div className="card-body">
        <h3 className="card-title">{study.title}</h3>
        <div className="card-location">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
          </svg>
          {study.city}, {study.country}
        </div>
        <p className="card-description">{(study.description || '').slice(0, 120)}{(study.description || '').length > 120 ? '...' : ''}</p>
        <div className="card-meta">
          <span className="meta-badge size">{study.size}</span>
          <span className="meta-badge climate">{study.climate_zone}</span>
          <span className="meta-badge year">{study.year}</span>
        </div>
        <div className="card-nbs-tags">
          {nbsTags.slice(0, 4).map((tag, i) => (
            <span key={i} className="nbs-tag" style={{ borderColor: tag.color + '80', color: tag.color }}>
              {tag.label}
            </span>
          ))}
          {nbsTags.length > 4 && <span className="nbs-tag more">+{nbsTags.length - 4}</span>}
        </div>
      </div>

      {showPreview && (
        <div className="card-hover-preview">
          {imgSrc && !imgError && <img src={imgSrc} alt="" className="preview-img" />}
          <div className="preview-info">
            <strong>{study.title}</strong>
            <span>{study.city}, {study.country} &middot; {study.year}</span>
            <span>{study.size} &middot; {study.climate_zone}</span>
            <span>{nbsTags.length} NBS solutions applied</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CaseStudyListItem({ study, onSelect, isFavorite, onToggleFavorite }) {
  const [imgError, setImgError] = useState(false);
  const nbsTags = getNBSTags(study);
  const taleaType = getTaleaType(study);
  const imgSrc = imageMap[study.id];

  return (
    <div className="case-list-item" onClick={() => onSelect(study)}>
      <div className="list-item-thumb">
        {!imgError && imgSrc ? (
          <img src={imgSrc} alt="" onError={() => setImgError(true)} loading="lazy" />
        ) : (
          <div className="thumb-placeholder">#{study.id}</div>
        )}
      </div>
      <div className="list-item-main">
        <h3 className="list-item-title">{study.title}</h3>
        <div className="list-item-location">{study.city}, {study.country} &middot; {study.year}</div>
      </div>
      <div className="list-item-meta">
        <span className="meta-badge size">{study.size}</span>
        <span className="meta-badge climate">{study.climate_zone}</span>
        <span className="meta-badge talea">{taleaType}</span>
      </div>
      <div className="list-item-nbs">
        {nbsTags.slice(0, 3).map((tag, i) => (
          <span key={i} className="nbs-tag-small" style={{ color: tag.color }}>{tag.label}</span>
        ))}
        {nbsTags.length > 3 && <span className="nbs-more">+{nbsTags.length - 3}</span>}
      </div>
      {onToggleFavorite && (
        <button
          className={`list-fav-btn ${isFavorite ? 'active' : ''}`}
          onClick={e => { e.stopPropagation(); onToggleFavorite(study.id); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={isFavorite ? '#FFE604' : 'none'} stroke={isFavorite ? '#FFE604' : 'currentColor'} strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
          </svg>
        </button>
      )}
      <svg className="list-item-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
    </div>
  );
}

function CaseStudyGrid({ studies, onSelect, view, favorites, onToggleFavorite, compareIds, onCompareToggle }) {
  if (studies.length === 0) {
    return (
      <div className="no-results">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          <line x1="8" y1="11" x2="14" y2="11"/>
        </svg>
        <h3>No solutions found</h3>
        <p>Try adjusting your search or removing some filters. The fuzzy search handles misspellings!</p>
      </div>
    );
  }

  if (view === 'list') {
    return (
      <div className="case-list">
        {studies.map(s => (
          <CaseStudyListItem
            key={s.id}
            study={s}
            onSelect={onSelect}
            isFavorite={favorites?.includes(s.id)}
            onToggleFavorite={onToggleFavorite}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="case-grid">
      {studies.map(s => (
        <CaseStudyCard
          key={s.id}
          study={s}
          onSelect={onSelect}
          isFavorite={favorites?.includes(s.id)}
          onToggleFavorite={onToggleFavorite}
          isComparing={compareIds?.includes(s.id)}
          onCompareToggle={onCompareToggle}
        />
      ))}
    </div>
  );
}

export default CaseStudyGrid;
