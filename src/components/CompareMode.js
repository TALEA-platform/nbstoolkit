import React, { useEffect } from 'react';
import { NBS_CATEGORIES } from '../data/filterConfig';
import imageMap from '../data/imageMap';
import getTaleaTypes from '../utils/getTaleaTypes';
import cityCoordinates from '../data/cityCoordinates';

const NBS_FIELDS = Object.entries(NBS_CATEGORIES).map(([key, meta]) => ({
  label: meta.label,
  key,
  isArray: true,
  color: meta.color,
}));

const COMPARE_SECTIONS = [
  {
    title: 'Basic Info',
    fields: [
      { label: 'City', key: 'city' },
      { label: 'Country', key: 'country' },
      { label: 'Year', key: 'year' },
      { label: 'Size', key: 'size' },
      { label: 'Climate Zone', key: 'climate_zone' },
      { label: 'Designer', key: 'designer' },
      { label: 'Promoter', key: 'promoter' },
      { label: 'Description', key: 'description', isLong: true, maxLength: 200 },
      { label: 'Coordinates', key: '_coordinates', computed: true },
    ],
  },
  {
    title: 'Innovation',
    fields: [
      { label: 'Innovation Types', key: '_innovation_dots', computed: true },
      { label: 'Physical Innovation', key: 'physical_innovation', isLong: true, maxLength: 150 },
      { label: 'Social Innovation', key: 'social_innovation', isLong: true, maxLength: 150 },
      { label: 'Digital Innovation', key: 'digital_innovation', isLong: true, maxLength: 150 },
    ],
  },
  {
    title: 'A. Physical Characteristics',
    fields: [
      { label: 'A1 Urban Scale', key: 'a1_urban_scale', isArray: true },
      { label: 'A2 Urban Area', key: 'a2_urban_area', isArray: true },
      { label: 'A3.1 Buildings', key: 'a3_1_buildings', isArray: true },
      { label: 'A3.2 Open Spaces', key: 'a3_2_open_spaces', isArray: true },
      { label: 'A3.3 Infrastructures', key: 'a3_3_infrastructures', isArray: true },
      { label: 'A4 Ownership', key: 'a4_ownership', isArray: true },
      { label: 'A5 Management', key: 'a5_management', isArray: true },
      { label: 'A6 Uses', key: 'a6_uses', isArray: true },
      { label: 'A7 Other', key: 'a7_other', isArray: true },
    ],
  },
  {
    title: 'B. Constraints & Opportunities',
    fields: [
      { label: 'B1 Physical', key: 'b1_physical', isArray: true },
      { label: 'B2 Regulations', key: 'b2_regulations', isArray: true },
      { label: 'B3 Uses & Management', key: 'b3_uses_management', isArray: true },
      { label: 'B4 Public Opinion', key: 'b4_public_opinion', isArray: true },
      { label: 'B5 Synergy', key: 'b5_synergy', isArray: true },
      { label: 'B6 Social Opportunities', key: 'b6_social_opportunities', isArray: true },
    ],
  },
  {
    title: 'C. Design Process & Results',
    fields: [
      { label: 'C1.1 Design', key: 'c1_1_design', isArray: true },
      { label: 'C1.2 Funding', key: 'c1_2_funding', isArray: true },
      { label: 'C1.3 Management', key: 'c1_3_management', isArray: true },
      { label: 'C2 Actors', key: 'c2_actors', isArray: true },
      { label: 'C3 Goals & Results', key: 'c3_goals', isArray: true },
      { label: 'C4 Services', key: 'c4_services', isArray: true },
      { label: 'C5 Impacts', key: 'c5_impacts', isLong: true, maxLength: 200 },
    ],
  },
  {
    title: 'Sources',
    fields: [
      { label: 'Sources', key: 'sources', isLong: true, maxLength: 300 },
    ],
  },
];

function getCoords(study) {
  if (study.latitude && study.longitude) {
    return `${Number(study.latitude).toFixed(4)}, ${Number(study.longitude).toFixed(4)}`;
  }
  const c = cityCoordinates[study.id];
  if (c) return `${c[0].toFixed(4)}, ${c[1].toFixed(4)}`;
  return 'N/A';
}

function truncate(text, max) {
  if (!text) return '';
  if (text.length <= max) return text;
  return text.slice(0, max) + '...';
}

function renderCellValue(field, study) {
  if (field.computed) {
    if (field.key === '_coordinates') return getCoords(study);
    if (field.key === '_innovation_dots') {
      return (
        <div className="compare-innovation-dots">
          {study.has_physical_innovation && <span className="innovation-dot physical" title="Physical">P</span>}
          {study.has_social_innovation && <span className="innovation-dot social" title="Social">S</span>}
          {study.has_digital_innovation && <span className="innovation-dot digital" title="Digital">D</span>}
          {!study.has_physical_innovation && !study.has_social_innovation && !study.has_digital_innovation && <span className="compare-none">None</span>}
        </div>
      );
    }
    return 'N/A';
  }

  const val = study[field.key];

  if (field.isArray) {
    const arr = val || [];
    return arr.length > 0 ? arr.join(', ') : <span className="compare-none">None</span>;
  }

  if (field.isLong) {
    const text = val || '';
    if (!text) return <span className="compare-none">N/A</span>;
    return <span className="compare-long-text">{truncate(text, field.maxLength)}</span>;
  }

  return val || 'N/A';
}

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

              {COMPARE_SECTIONS.map(section => (
                <React.Fragment key={section.title}>
                  <tr className="compare-section-row">
                    <td colSpan={studies.length + 1}>{section.title}</td>
                  </tr>
                  {section.fields.map(field => (
                    <tr key={field.key}>
                      <td className="compare-label">{field.label}</td>
                      {studies.map(s => (
                        <td key={s.id}>{renderCellValue(field, s)}</td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}

              <tr className="compare-section-row">
                <td colSpan={studies.length + 1}>D. Nature-Based Solutions</td>
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
