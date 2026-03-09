import { useState, useEffect } from 'react';
import { FILTER_CATEGORIES } from '../data/filterConfig';
import { submitStudy } from '../utils/submitService';

const FORM_SECTIONS = [
  {
    title: 'Basic Information',
    icon: '📋',
    fields: [
      { key: 'title', label: 'Case Study Title', type: 'text', required: true },
      { key: 'city', label: 'City', type: 'text', required: true },
      { key: 'country', label: 'Country', type: 'text', required: true },
      { key: 'year', label: 'Year', type: 'text', required: true },
      { key: 'designer', label: 'Designer', type: 'text' },
      { key: 'promoter', label: 'Promoter', type: 'text' },
      { key: 'description', label: 'Project Description', type: 'textarea', required: true },
      { key: 'latitude', label: 'Latitude', type: 'text', placeholder: 'e.g. 45.4861' },
      { key: 'longitude', label: 'Longitude', type: 'text', placeholder: 'e.g. 9.1905' },
      { key: 'image', label: 'Project Image', type: 'file' },
    ]
  },
  {
    title: 'TALEA Application',
    icon: '🏙️',
    fields: [
      { key: 'talea_application', label: 'Application Type', type: 'multi', options: ['Nodal', 'Linear', 'Fragmented'], required: true },
      { key: 'size', label: 'Size', type: 'select', options: ['Small', 'Medium', 'Large'], required: true },
      { key: 'climate_zone', label: 'Climate Zone', type: 'select', options: ['Tropical', 'Arid', 'Mediterranean', 'Temperate', 'Cold/Boreal', 'Polar'], required: true },
    ]
  },
  {
    title: 'Innovation',
    icon: '💡',
    fields: [
      { key: 'physical_innovation', label: 'Physical Innovation', type: 'textarea' },
      { key: 'social_innovation', label: 'Social Innovation', type: 'textarea' },
      { key: 'digital_innovation', label: 'Digital Innovation', type: 'textarea' },
    ]
  },
  {
    title: 'A. Physical Characteristics',
    icon: '🏗️',
    fields: [
      { key: 'a1_urban_scale', label: 'A1 Urban Scale', type: 'multi', filterKey: 'a1_urban_scale' },
      { key: 'a2_urban_area', label: 'A2 Urban Area', type: 'multi', filterKey: 'a2_urban_area' },
      { key: 'a3_1_buildings', label: 'A3.1 Buildings', type: 'multi', filterKey: 'a3_1_buildings' },
      { key: 'a3_2_open_spaces', label: 'A3.2 Open Spaces', type: 'multi', filterKey: 'a3_2_open_spaces' },
      { key: 'a3_3_infrastructures', label: 'A3.3 Infrastructures', type: 'multi', filterKey: 'a3_3_infrastructures' },
      { key: 'a4_ownership', label: 'A4 Ownership', type: 'multi', filterKey: 'a4_ownership' },
      { key: 'a5_management', label: 'A5 Management', type: 'multi', filterKey: 'a5_management' },
      { key: 'a6_uses', label: 'A6 Uses', type: 'multi', filterKey: 'a6_uses' },
      { key: 'a7_other', label: 'A7 Other', type: 'multi', filterKey: 'a7_other' },
    ]
  },
  {
    title: 'B. Constraints & Opportunities',
    icon: '⚡',
    fields: [
      { key: 'b1_physical', label: 'B1 Physical Constraints', type: 'multi', filterKey: 'b1_physical' },
      { key: 'b2_regulations', label: 'B2 Regulations', type: 'multi', filterKey: 'b2_regulations' },
      { key: 'b3_uses_management', label: 'B3 Uses & Management', type: 'multi', filterKey: 'b3_uses_management' },
      { key: 'b4_public_opinion', label: 'B4 Public Opinion', type: 'multi', filterKey: 'b4_public_opinion' },
      { key: 'b5_synergy', label: 'B5 Synergy', type: 'multi', filterKey: 'b5_synergy' },
      { key: 'b6_social_opportunities', label: 'B6 Social Opportunities', type: 'multi', filterKey: 'b6_social_opportunities' },
    ]
  },
  {
    title: 'C. Design Process & Goals',
    icon: '🎨',
    fields: [
      { key: 'c1_1_design', label: 'C1.1 Design Process', type: 'multi', filterKey: 'c1_1_design' },
      { key: 'c1_2_funding', label: 'C1.2 Funding', type: 'multi', filterKey: 'c1_2_funding' },
      { key: 'c1_3_management', label: 'C1.3 Management', type: 'multi', filterKey: 'c1_3_management' },
      { key: 'c2_actors', label: 'C2 Actors', type: 'multi', filterKey: 'c2_actors' },
      { key: 'c3_goals', label: 'C3 Goals', type: 'multi', filterKey: 'c3_goals' },
      { key: 'c4_services', label: 'C4 Services', type: 'multi', filterKey: 'c4_services' },
      { key: 'c5_impacts', label: 'C5 Impacts', type: 'textarea', placeholder: 'Describe the project impacts (environmental, social, economic...)' },
    ]
  },
  {
    title: 'D. Nature-Based Solutions',
    icon: '🌿',
    fields: [
      { key: 'd1_plants', label: 'D1 Plants', type: 'multi', filterKey: 'd1_plants' },
      { key: 'd2_paving', label: 'D2 Paving', type: 'multi', filterKey: 'd2_paving' },
      { key: 'd3_water', label: 'D3 Water', type: 'multi', filterKey: 'd3_water' },
      { key: 'd4_roof_facade', label: 'D4 Roof & Facade', type: 'multi', filterKey: 'd4_roof_facade' },
      { key: 'd5_furnishings', label: 'D5 Furnishings', type: 'multi', filterKey: 'd5_furnishings' },
      { key: 'd6_urban_spaces', label: 'D6 Urban Spaces', type: 'multi', filterKey: 'd6_urban_spaces' },
    ]
  },
];

// Collect all required fields across all sections
const REQUIRED_FIELDS = FORM_SECTIONS.flatMap(s =>
  s.fields.filter(f => f.required).map(f => ({ key: f.key, label: f.label, type: f.type }))
);

function isFieldFilled(value, type) {
  if (type === 'multi') return Array.isArray(value) && value.length > 0;
  if (type === 'file') return true; // file is never required
  return typeof value === 'string' && value.trim().length > 0;
}

// Find the section index that contains a given field key
function findSectionForField(key) {
  return FORM_SECTIONS.findIndex(s => s.fields.some(f => f.key === key));
}

function SubmitForm({ onClose }) {
  const [formData, setFormData] = useState({});
  const [currentSection, setCurrentSection] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onClose]);

  const updateField = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    // Clear error for this field when user types
    setValidationErrors(prev => prev.filter(e => e.key !== key));
  };

  const toggleMulti = (key, value) => {
    setFormData(prev => {
      const current = prev[key] || [];
      const updated = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [key]: updated };
    });
    setValidationErrors(prev => prev.filter(e => e.key !== key));
  };

  const validate = () => {
    const errors = [];
    for (const field of REQUIRED_FIELDS) {
      if (!isFieldFilled(formData[field.key], field.type)) {
        errors.push({ key: field.key, label: field.label });
      }
    }
    return errors;
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  const handleSubmit = async () => {
    const errors = validate();
    if (errors.length > 0) {
      setValidationErrors(errors);
      const firstErrorSection = findSectionForField(errors[0].key);
      if (firstErrorSection >= 0) setCurrentSection(firstErrorSection);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitStudy(formData);
      setSubmitResult(result);
      setSubmitted(true);
    } catch (err) {
      console.error('Submission error:', err);
      setSubmitResult({ sheetSent: false, error: true });
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const exportJson = () => {
    const dataStr = JSON.stringify(formData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `talea_submission_${formData.title || 'new'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const section = FORM_SECTIONS[currentSection];
  const errorKeys = new Set(validationErrors.map(e => e.key));

  if (submitted) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="form-container submitted" onClick={e => e.stopPropagation()}>
          <div className="submitted-content">
            <div className="success-icon">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#21A84A" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2>{submitResult?.sheetSent ? 'Submission Sent!' : 'Submission Failed'}</h2>
            {submitResult && (
              <div className="submit-status-details">
                {submitResult.sheetSent && (
                  <>
                    <p>Your case study has been submitted for review.</p>
                    <span className="submit-status-ok">A supervisor will review your submission. Once approved, it will appear on the platform after the next sync.</span>
                  </>
                )}
                {!submitResult.sheetSent && (
                  <>
                    <p>Could not submit your case study.</p>
                    <span className="submit-status-note">The submission service is not configured or unavailable. Please try again later or export your data as JSON.</span>
                  </>
                )}
              </div>
            )}
            <div className="submitted-actions">
              <button className="btn-export" onClick={exportJson}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Export JSON
              </button>
              <button className="btn-close" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="form-container" onClick={e => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>

        <div className="form-header">
          <h2>Submit New Case Study</h2>
          <div className="form-progress">
            {FORM_SECTIONS.map((s, i) => {
              // Show a warning dot on sections that have validation errors
              const sectionHasError = s.fields.some(f => errorKeys.has(f.key));
              return (
                <button
                  key={i}
                  className={`progress-step ${i === currentSection ? 'active' : i < currentSection ? 'done' : ''} ${sectionHasError ? 'has-error' : ''}`}
                  onClick={() => setCurrentSection(i)}
                >
                  <span className="step-icon">{s.icon}</span>
                  <span className="step-label">{s.title}</span>
                </button>
              );
            })}
          </div>
        </div>

        {validationErrors.length > 0 && (
          <div className="form-validation-banner">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>Please fill in all required fields: {validationErrors.map(e => e.label).join(', ')}</span>
          </div>
        )}

        <div className="form-body">
          <h3 className="form-section-title">{section.icon} {section.title}</h3>

          {section.fields.map(field => {
            const hasError = errorKeys.has(field.key);

            if (field.type === 'text') {
              return (
                <div key={field.key} className={`form-field ${hasError ? 'field-error' : ''}`}>
                  <label>{field.label} {field.required && <span className="required">*</span>}</label>
                  <input
                    type="text"
                    value={formData[field.key] || ''}
                    onChange={e => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                  />
                  {hasError && <span className="field-error-msg">This field is required</span>}
                </div>
              );
            }
            if (field.type === 'textarea') {
              return (
                <div key={field.key} className={`form-field ${hasError ? 'field-error' : ''}`}>
                  <label>{field.label} {field.required && <span className="required">*</span>}</label>
                  <textarea
                    value={formData[field.key] || ''}
                    onChange={e => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                    rows={4}
                  />
                  {hasError && <span className="field-error-msg">This field is required</span>}
                </div>
              );
            }
            if (field.type === 'select') {
              return (
                <div key={field.key} className={`form-field ${hasError ? 'field-error' : ''}`}>
                  <label>{field.label} {field.required && <span className="required">*</span>}</label>
                  <select
                    value={formData[field.key] || ''}
                    onChange={e => updateField(field.key, e.target.value)}
                  >
                    <option value="">Select...</option>
                    {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  {hasError && <span className="field-error-msg">Please select an option</span>}
                </div>
              );
            }
            if (field.type === 'multi') {
              const options = field.options || (field.filterKey && FILTER_CATEGORIES[field.filterKey]?.options) || [];
              const selected = formData[field.key] || [];
              return (
                <div key={field.key} className={`form-field ${hasError ? 'field-error' : ''}`}>
                  <label>{field.label} {field.required && <span className="required">*</span>}</label>
                  <div className="multi-select-grid">
                    {options.map(opt => (
                      <button
                        key={opt}
                        type="button"
                        className={`multi-option ${selected.includes(opt) ? 'selected' : ''}`}
                        onClick={() => toggleMulti(field.key, opt)}
                      >
                        <span className={`multi-check ${selected.includes(opt) ? 'checked' : ''}`}>
                          {selected.includes(opt) ? '✓' : ''}
                        </span>
                        {opt}
                      </button>
                    ))}
                  </div>
                  {hasError && <span className="field-error-msg">Please select at least one option</span>}
                </div>
              );
            }
            if (field.type === 'file') {
              const preview = formData[field.key];
              return (
                <div key={field.key} className="form-field">
                  <label>{field.label}</label>
                  <div className="file-upload-area">
                    <input
                      type="file"
                      accept="image/*"
                      id={`file-${field.key}`}
                      className="file-input-hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) {
                          alert('Image must be under 2MB');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onloadend = () => updateField(field.key, reader.result);
                        reader.readAsDataURL(file);
                      }}
                    />
                    {preview ? (
                      <div className="file-preview">
                        <img src={preview} alt="Preview" />
                        <button type="button" className="file-remove-btn" onClick={() => updateField(field.key, null)}>Remove</button>
                      </div>
                    ) : (
                      <label htmlFor={`file-${field.key}`} className="file-upload-label">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                        <span>Click to upload image (max 2MB)</span>
                      </label>
                    )}
                  </div>
                </div>
              );
            }
            return null;
          })}
        </div>

        <div className="form-footer">
          <button
            className="btn-prev"
            disabled={currentSection === 0}
            onClick={() => setCurrentSection(prev => prev - 1)}
          >
            Previous
          </button>
          <div className="form-step-indicator">
            {currentSection + 1} / {FORM_SECTIONS.length}
          </div>
          {currentSection < FORM_SECTIONS.length - 1 ? (
            <button
              className="btn-next"
              onClick={() => setCurrentSection(prev => prev + 1)}
            >
              Next
            </button>
          ) : (
            <button className="btn-submit" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SubmitForm;
