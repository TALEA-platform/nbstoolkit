import { useEffect } from 'react';
import { NBS_CATEGORIES } from '../data/filterConfig';
import imageMap from '../data/imageMap';
import getTaleaTypes from '../utils/getTaleaTypes';

const COMPARE_FIELDS = [
  { label: 'City', key: 'city' },
  { label: 'Country', key: 'country' },
  { label: 'Year', key: 'year' },
  { label: 'Size', key: 'size' },
  { label: 'Climate Zone', key: 'climate_zone' },
  { label: 'Designer', key: 'designer' },
  { label: 'Promoter', key: 'promoter' },
  { label: 'A1 Urban Scale', key: 'a1_urban_scale', isArray: true },
  { label: 'A2 Urban Area', key: 'a2_urban_area', isArray: true },
  { label: 'A4 Ownership', key: 'a4_ownership', isArray: true },
  { label: 'A6 Uses', key: 'a6_uses', isArray: true },
  { label: 'C3 Goals', key: 'c3_goals', isArray: true },
];

const NBS_FIELDS = Object.entries(NBS_CATEGORIES).map(([key, meta]) => ({
  label: meta.label,
  key,
  isArray: true,
  color: meta.color,
}));

function CompareMode({ studies, onClose }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  if (!studies || studies.length < 2) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="compare-container" onClick={e => e.stopPropagation()}>
        <div className="compare-header">
          <h2>Compare Solutions</h2>
          <button className="modal-close" onClick={onClose}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="compare-table-wrapper">
          <table className="compare-table">
            <thead>
              <tr>
                <th className="compare-label-col">Field</th>
                {studies.map(s => (
                  <th key={s.id} className="compare-study-col">
                    <div className="compare-study-header">
                      {imageMap[s.id] && (
                        <img src={imageMap[s.id]} alt="" className="compare-thumb" />
                      )}
                      <strong>#{s.id} {s.title}</strong>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* TALEA Application */}
              <tr>
                <td className="compare-label">TALEA Type</td>
                {studies.map(s => {
                  const types = getTaleaTypes(s);
                  return <td key={s.id}>{types.join(', ') || 'N/A'}</td>;
                })}
              </tr>

              {COMPARE_FIELDS.map(field => (
                <tr key={field.key}>
                  <td className="compare-label">{field.label}</td>
                  {studies.map(s => {
                    const val = s[field.key];
                    if (field.isArray) {
                      return <td key={s.id}>{(val || []).join(', ') || 'N/A'}</td>;
                    }
                    return <td key={s.id}>{val || 'N/A'}</td>;
                  })}
                </tr>
              ))}

              <tr className="compare-section-row">
                <td colSpan={studies.length + 1}>Nature-Based Solutions</td>
              </tr>

              {NBS_FIELDS.map(field => (
                <tr key={field.key}>
                  <td className="compare-label" style={{ color: field.color }}>{field.label}</td>
                  {studies.map(s => {
                    const items = s[field.key] || [];
                    return (
                      <td key={s.id}>
                        {items.length > 0 ? (
                          <div className="compare-tags">
                            {items.map((item, i) => (
                              <span key={i} className="compare-tag" style={{ borderColor: field.color + '60', color: field.color }}>
                                {item}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="compare-none">None</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default CompareMode;
