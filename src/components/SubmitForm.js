import { useState, useEffect } from 'react';
import { FILTER_CATEGORIES, FIELDS_WITH_OTHER } from '../data/filterConfig';
import { submitStudy, MAX_IMAGE_BYTES, IMAGE_TYPES } from '../utils/submitService';

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
      { key: 'sources', label: 'Sources', type: 'textarea', placeholder: 'One URL per line' },
      { key: 'image', label: 'Project Image', type: 'file' },
      { key: 'image_credits', label: 'Image Credits', type: 'text', placeholder: 'Author or source of the image, e.g. Jane Doe / Studio X' },
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
    description: 'For each innovation type, check the box if present and optionally describe it below.',
    fields: [
      { key: 'has_physical_innovation', label: 'Physical Innovation', type: 'innovation-group', textKey: 'physical_innovation', color: '#e07c3a', example: 'No physical innovation identified' },
      { key: 'has_social_innovation', label: 'Social Innovation', type: 'innovation-group', textKey: 'social_innovation', color: '#f5c542', example: 'No social innovation identified' },
      { key: 'has_digital_innovation', label: 'Digital Innovation', type: 'innovation-group', textKey: 'digital_innovation', color: '#1272B7', example: 'No digital innovation identified' },
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
  {
    title: 'Your Details',
    icon: '✉️',
    description: 'Only the TALEA team sees these details, to contact you about this proposal. They are never published.',
    fields: [
      { key: 'submitter_email', label: 'Your Email', type: 'email', required: true, placeholder: 'name@example.org', autoComplete: 'email' },
      { key: 'submitter_name', label: 'Your Name', type: 'text', placeholder: 'Optional', autoComplete: 'name' },
      { key: 'access_code', label: 'Access Code', type: 'text', placeholder: 'Only if the TALEA team gave you one', autoComplete: 'off',
        hint: 'Partners who send many case studies get a personal code from the TALEA team, so their proposals are not limited.' },
    ]
  },
];

// Collect all required fields across all sections
const REQUIRED_FIELDS = FORM_SECTIONS.flatMap(s =>
  s.fields.filter(f => f.required).map(f => ({ key: f.key, label: f.label, type: f.type }))
);
const FIELD_LABELS = Object.fromEntries(FORM_SECTIONS.flatMap(s => s.fields.map(f => [f.key, f.label])));

// "Other" is not a filter option: for these questions the form asks for the
// text and submitService.js stores "Other" + the text (other_details column).
const OTHER_FIELDS = new Set(FIELDS_WITH_OTHER);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isFieldFilled(value, type) {
  if (type === 'multi') return Array.isArray(value) && value.length > 0;
  if (type === 'file') return true; // file is never required
  return typeof value === 'string' && value.trim().length > 0;
}

// Answers not sent yet are kept in this browser (without the image and the
// access code), so closing the form by mistake does not lose them.
const DRAFT_KEY = 'talea-submit-draft';
const NOT_IN_DRAFT = ['image', 'access_code', 'website'];

function loadDraft() {
  try {
    const draft = JSON.parse(window.localStorage.getItem(DRAFT_KEY) || 'null');
    return draft && typeof draft === 'object' && !Array.isArray(draft) && Object.keys(draft).length ? draft : null;
  } catch {
    return null;
  }
}

function saveDraft(data) {
  try {
    const draft = Object.fromEntries(Object.entries(data).filter(([k]) => !NOT_IN_DRAFT.includes(k)));
    if (Object.keys(draft).length) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // storage full or blocked: the form still works, only the draft is not kept
  }
}

function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // nothing to do
  }
}

const FAILURE_MESSAGES = {
  rate_limited: 'Too many proposals were sent from this email address (or from everyone) in the last 24 hours. Please try again tomorrow. If you need to send many case studies, ask the TALEA team for an access code.',
  not_configured: 'The submission service is not configured on this site.',
  network_error: 'The submission service could not be reached. Check your connection and try again.',
  server_error: 'The submission service is not available right now. Please try again later.',
};

// Find the section index that contains a given field key
function findSectionForField(key) {
  return FORM_SECTIONS.findIndex(s => s.fields.some(f => f.key === key));
}

function SubmitForm({ onClose }) {
  const [initialDraft] = useState(loadDraft);
  const [formData, setFormData] = useState(() => initialDraft || {});
  const [draftNotice, setDraftNotice] = useState(!!initialDraft);
  const [currentSection, setCurrentSection] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [validationErrors, setValidationErrors] = useState([]);
  const [imageError, setImageError] = useState('');

  useEffect(() => {
    if (!submitted) saveDraft(formData);
  }, [formData, submitted]);

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

  const updateOther = (key, text) => {
    setFormData(prev => ({ ...prev, other_details: { ...(prev.other_details || {}), [key]: text } }));
  };

  const validate = () => {
    const errors = [];
    for (const field of REQUIRED_FIELDS) {
      if (!isFieldFilled(formData[field.key], field.type)) {
        errors.push({ key: field.key, label: field.label });
      }
    }
    const email = (formData.submitter_email || '').trim();
    if (email && !EMAIL_RE.test(email)) {
      errors.push({ key: 'submitter_email', label: FIELD_LABELS.submitter_email, message: 'Enter a valid email address' });
    }
    return errors;
  };

  const showErrors = (errors) => {
    setValidationErrors(errors);
    const firstErrorSection = findSectionForField(errors[0].key);
    if (firstErrorSection >= 0) setCurrentSection(firstErrorSection);
  };

  const startOver = () => {
    clearDraft();
    setFormData({});
    setValidationErrors([]);
    setImageError('');
    setDraftNotice(false);
    setCurrentSection(0);
  };

  const handleImage = (key, file) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setImageError('Please choose a JPEG, PNG or WebP image.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(`The image must be under ${MAX_IMAGE_BYTES / 1048576} MB.`);
      return;
    }
    setImageError('');
    const reader = new FileReader();
    reader.onloadend = () => updateField(key, reader.result);
    reader.readAsDataURL(file);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);

  const handleSubmit = async () => {
    const errors = validate();
    if (errors.length > 0) {
      showErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitStudy(formData);
      if (result.ok) {
        clearDraft();
      } else if (result.code === 'invalid_email') {
        showErrors([{ key: 'submitter_email', label: FIELD_LABELS.submitter_email, message: 'Enter a valid email address' }]);
        return;
      } else if (result.code === 'missing_fields' && result.fields?.length) {
        showErrors(result.fields.map(key => ({ key, label: FIELD_LABELS[key] || key })));
        return;
      }
      setSubmitResult(result);
      setSubmitted(true);
    } catch (err) {
      console.error('Submission error:', err);
      setSubmitResult({ ok: false, code: 'server_error' });
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
    const ok = !!submitResult?.ok;
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="form-container submitted" onClick={e => e.stopPropagation()}>
          <div className="submitted-content">
            <div className="success-icon">
              {ok ? (
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#21A84A" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              ) : (
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#c53030" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              )}
            </div>
            <h2>{ok ? 'Submission Sent!' : 'Submission Failed'}</h2>
            <div className="submit-status-details">
              {ok ? (
                <>
                  <p>
                    Your case study has been submitted for review
                    {submitResult.id ? <> (reference <strong>#{submitResult.id}</strong>)</> : null}.
                  </p>
                  <span className="submit-status-ok">The TALEA team will review it. Once approved, it will appear on the platform after the next update.</span>
                </>
              ) : (
                <>
                  <p>{FAILURE_MESSAGES[submitResult?.code] || FAILURE_MESSAGES.server_error}</p>
                  <span className="submit-status-note">Your answers are still saved in this browser. You can go back to the form and try again, or download them as JSON.</span>
                </>
              )}
            </div>
            <div className="submitted-actions">
              {!ok && (
                <button className="btn-close" onClick={() => setSubmitted(false)}>Back to the form</button>
              )}
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
          {draftNotice && (
            <div className="form-draft-notice">
              <span>We restored the answers you had not sent yet.</span>
              <button type="button" onClick={startOver}>Start over</button>
              <button type="button" onClick={() => setDraftNotice(false)}>Keep them</button>
            </div>
          )}

          {/* Anti-spam: hidden from people, filled in only by bots */}
          <div className="form-honeypot" aria-hidden="true">
            <label htmlFor="submit-website">Website</label>
            <input
              id="submit-website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={formData.website || ''}
              onChange={e => updateField('website', e.target.value)}
            />
          </div>

          <h3 className="form-section-title">{section.icon} {section.title}</h3>
          {section.description && <p className="form-section-description">{section.description}</p>}

          {section.fields.map(field => {
            const hasError = errorKeys.has(field.key);
            const errorMessage = validationErrors.find(e => e.key === field.key)?.message;

            if (field.type === 'text' || field.type === 'email') {
              const inputId = `submit-${field.key}`;
              return (
                <div key={field.key} className={`form-field ${hasError ? 'field-error' : ''}`}>
                  <label htmlFor={inputId}>{field.label} {field.required && <span className="required">*</span>}</label>
                  <input
                    id={inputId}
                    type={field.type}
                    autoComplete={field.autoComplete}
                    value={formData[field.key] || ''}
                    onChange={e => updateField(field.key, e.target.value)}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                  />
                  {field.hint && <span className="form-field-hint">{field.hint}</span>}
                  {hasError && <span className="field-error-msg">{errorMessage || 'This field is required'}</span>}
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
                  {OTHER_FIELDS.has(field.key) && (
                    <input
                      type="text"
                      className="multi-other-input"
                      aria-label={`${field.label}: other (specify)`}
                      value={(formData.other_details || {})[field.key] || ''}
                      onChange={e => updateOther(field.key, e.target.value)}
                      placeholder="Other (specify)…"
                    />
                  )}
                  {hasError && <span className="field-error-msg">Please select at least one option</span>}
                </div>
              );
            }
            if (field.type === 'innovation-group') {
              const checked = !!formData[field.key];
              const inputId = `inno-${field.key}`;
              return (
                <div key={field.key} className={`form-field innovation-group ${checked ? 'innovation-active' : ''}`} style={{ '--inno-color': field.color }}>
                  <div className="innovation-group-toggle">
                    <input
                      type="checkbox"
                      id={inputId}
                      className="innovation-group-checkbox"
                      checked={checked}
                      onChange={e => updateField(field.key, e.target.checked)}
                    />
                    <label htmlFor={inputId} className="innovation-group-label">{field.label}</label>
                  </div>
                  <textarea
                    className="innovation-group-text"
                    value={formData[field.textKey] || ''}
                    onChange={e => updateField(field.textKey, e.target.value)}
                    placeholder={checked ? `Describe the ${field.label.toLowerCase()}...` : `Optional: add notes even if not present (e.g. "${field.example}")`}
                    rows={3}
                  />
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
                      accept={IMAGE_TYPES.join(',')}
                      id={`file-${field.key}`}
                      className="file-input-hidden"
                      onChange={e => {
                        handleImage(field.key, e.target.files?.[0]);
                        e.target.value = ''; // choosing the same file again still triggers onChange
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
                        <span>Click to upload an image (JPEG, PNG or WebP, max {MAX_IMAGE_BYTES / 1048576} MB)</span>
                      </label>
                    )}
                  </div>
                  {imageError && <span className="field-error-msg">{imageError}</span>}
                  <span className="form-field-hint">The image is not kept in the saved draft: add it again if you reopen the form.</span>
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
