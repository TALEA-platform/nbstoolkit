import { FILTER_CATEGORIES } from '../data/filterConfig';
import { hasTaleaType } from './getTaleaTypes';

const INNOVATION_FIELD_MAP = {
  Physical: 'has_physical_innovation',
  Social: 'has_social_innovation',
  Digital: 'has_digital_innovation',
};
const DEFAULT_FILTER_MODE = 'and';

export function studyMatchesCategory(study, categoryKey, values, mode) {
  const cat = FILTER_CATEGORIES[categoryKey];
  if (!cat || !values || values.length === 0) return true;

  const matcher = mode === 'and' ? 'every' : 'some';

  if (cat.type === 'object') {
    return values[matcher](value => hasTaleaType(study, value));
  }

  if (cat.type === 'value') {
    if (mode === 'and') {
      return values.every(value => study[cat.dataKey] === value);
    }
    return values.includes(study[cat.dataKey]);
  }

  if (cat.type === 'array') {
    const arr = study[cat.dataKey] || [];
    return values[matcher](value => arr.includes(value));
  }

  if (cat.type === 'innovation') {
    return values[matcher](value => !!study[INNOVATION_FIELD_MAP[value]]);
  }

  return true;
}

export function studyMatchesExcludedCategory(study, categoryKey, values) {
  const cat = FILTER_CATEGORIES[categoryKey];
  if (!cat || !values || values.length === 0) return true;

  if (cat.type === 'object') {
    return !values.some(value => hasTaleaType(study, value));
  }

  if (cat.type === 'value') {
    return !values.includes(study[cat.dataKey]);
  }

  if (cat.type === 'array') {
    const arr = study[cat.dataKey] || [];
    return !values.some(value => arr.includes(value));
  }

  if (cat.type === 'innovation') {
    return !values.some(value => !!study[INNOVATION_FIELD_MAP[value]]);
  }

  return true;
}

export function studyMatchesAllFilters(study, nextActiveFilters, nextExcludedFilters, nextFilterModes) {
  for (const [categoryKey, values] of Object.entries(nextActiveFilters || {})) {
    if (!studyMatchesCategory(study, categoryKey, values, nextFilterModes?.[categoryKey] || DEFAULT_FILTER_MODE)) {
      return false;
    }
  }

  for (const [categoryKey, values] of Object.entries(nextExcludedFilters || {})) {
    if (!studyMatchesExcludedCategory(study, categoryKey, values)) {
      return false;
    }
  }

  return true;
}
