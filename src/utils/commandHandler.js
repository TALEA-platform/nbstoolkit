import { FILTER_CATEGORIES } from '../data/filterConfig';
import { findCommonFilters } from './fuzzySearch';

/**
 * Execute a slash command and return { response, actions }.
 * `actions` is an object of side-effects for App.js to apply.
 *
 * @param {string} cmd - The command (e.g., '/help')
 * @param {string} arg - Arguments after the command
 * @param {object} ctx - Context: { studies, allStudies, activeFilters, showFavorites, favorites, compareIds }
 * @returns {{ response: string, actions: object }}
 */
export function executeCommand(cmd, arg, ctx) {
  const { studies, allStudies, activeFilters, showFavorites, favorites, compareIds } = ctx;
  let response = '';
  const actions = {};

  switch (cmd) {
    case '/help':
      response = 'Available commands:\n\n'
        + 'Navigation:\n'
        + '  /info <id>     Open study details\n'
        + '  /random        Open a random study\n'
        + '  /map           Map view\n'
        + '  /grid          Grid view\n'
        + '  /list          List view\n\n'
        + 'Analysis:\n'
        + '  /summary       Overview of current results\n'
        + '  /describe      Brief description of each (max 10)\n'
        + '  /common        What results share\n'
        + '  /similar <id>  Find similar studies\n'
        + '  /suggest       Suggest filters to narrow down\n'
        + '  /breakdown <f> Breakdown by size/climate/country/goals\n'
        + '  /goals         Goals addressed by results\n'
        + '  /design        NBS elements overview\n'
        + '  /innovations   Social/digital innovation info\n'
        + '  /timeline      Results grouped by year\n\n'
        + 'Actions:\n'
        + '  /stats         Statistics dashboard\n'
        + '  /export        Export results as PDF\n'
        + '  /clear         Clear all filters\n'
        + '  /favorites     Toggle favorites\n'
        + '  /compare       Compare selected studies\n\n'
        + 'Info:\n'
        + '  /cities        List cities in results\n'
        + '  /country <n>   Studies by country\n'
        + '  /filters       Show active filters\n'
        + '  /nbs           NBS categories reference';
      break;

    // ── Navigation ──
    case '/info': {
      if (!arg) {
        response = 'Usage: /info <id or title>\nExample: /info 1 or /info Milan';
        break;
      }
      const id = parseInt(arg);
      const study = allStudies.find(s => s.id === id || s.title.toLowerCase().includes(arg.toLowerCase()));
      if (study) {
        actions.selectStudy = study;
        response = `"${study.title}"\n${study.city}, ${study.country} | ${study.size} | ${study.climate_zone}\n${(study.description || '').slice(0, 200)}...`;
      } else {
        response = `No study found for "${arg}". Try an ID (1-${allStudies.length}) or part of the title.`;
      }
      break;
    }
    case '/random': {
      const random = studies[Math.floor(Math.random() * studies.length)];
      if (random) {
        actions.selectStudy = random;
        response = `Opening: "${random.title}" — ${random.city}, ${random.country}`;
      } else {
        response = 'No studies available.';
      }
      break;
    }
    case '/map':
      actions.setView = 'map';
      response = 'Switched to map view.';
      break;
    case '/grid':
      actions.setView = 'grid';
      response = 'Switched to grid view.';
      break;
    case '/list':
      actions.setView = 'list';
      response = 'Switched to list view.';
      break;

    // ── Analysis ──
    case '/summary': {
      const n = studies.length;
      if (n === 0) { response = 'No results to summarize. Try adjusting your filters.'; break; }
      const sizes = {}, climates = {}, countries = {};
      for (const s of studies) {
        sizes[s.size] = (sizes[s.size] || 0) + 1;
        climates[s.climate_zone] = (climates[s.climate_zone] || 0) + 1;
        countries[s.country] = (countries[s.country] || 0) + 1;
      }
      const topCountries = Object.entries(countries).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const sizeStr = Object.entries(sizes).map(([k, v]) => `${k}: ${v}`).join(', ');
      const climateStr = Object.entries(climates).map(([k, v]) => `${k}: ${v}`).join(', ');
      const countryStr = topCountries.map(([k, v]) => `${k} (${v})`).join(', ');
      const physicalInno = studies.filter(s => s.has_physical_innovation).length;
      const socialInno = studies.filter(s => s.has_social_innovation).length;
      const digitalInno = studies.filter(s => s.has_digital_innovation).length;
      const nbsCount = studies.reduce((sum, s) => {
        return sum + (s.d1_plants?.length || 0) + (s.d2_paving?.length || 0) + (s.d3_water?.length || 0)
          + (s.d4_roof_facade?.length || 0) + (s.d5_furnishings?.length || 0) + (s.d6_urban_spaces?.length || 0);
      }, 0);
      response = `Summary of ${n} result${n > 1 ? 's' : ''}:\n\n`
        + `Size: ${sizeStr}\n`
        + `Climate: ${climateStr}\n`
        + `Countries: ${countryStr}${Object.keys(countries).length > 5 ? ` (+${Object.keys(countries).length - 5} more)` : ''}\n`
        + `NBS elements total: ${nbsCount} (avg ${(nbsCount / n).toFixed(1)}/study)\n`
        + `Physical innovation: ${physicalInno}/${n} (${Math.round(physicalInno / n * 100)}%)\n`
        + `Social innovation: ${socialInno}/${n} (${Math.round(socialInno / n * 100)}%)\n`
        + `Digital innovation: ${digitalInno}/${n} (${Math.round(digitalInno / n * 100)}%)\n\n`
        + `Use /describe, /common, /goals, or /design for deeper analysis.`;
      break;
    }
    case '/describe': {
      if (studies.length === 0) { response = 'No results to describe.'; break; }
      if (studies.length > 10) {
        response = `Too many results (${studies.length}). Narrow down to 10 or fewer using filters, then try /describe again.`;
        break;
      }
      response = studies.map(s => {
        const nbs = [...(s.d1_plants || []), ...(s.d2_paving || []), ...(s.d3_water || []),
          ...(s.d4_roof_facade || []), ...(s.d5_furnishings || []), ...(s.d6_urban_spaces || [])];
        return `#${s.id} "${s.title}"\n`
          + `   ${s.city}, ${s.country} | ${s.size} | ${s.climate_zone}\n`
          + `   ${(s.description || '').slice(0, 150)}...\n`
          + `   NBS: ${nbs.slice(0, 5).join(', ')}${nbs.length > 5 ? '...' : ''}`;
      }).join('\n\n');
      break;
    }
    case '/common': {
      if (studies.length < 2) { response = 'Need at least 2 results to find commonalities.'; break; }
      const nbsFields = [
        ['d1_plants', 'Plants'], ['d2_paving', 'Paving'], ['d3_water', 'Water'],
        ['d4_roof_facade', 'Roof/Facade'], ['d5_furnishings', 'Furnishings'], ['d6_urban_spaces', 'Urban Spaces']
      ];
      const nbsCounts = {};
      for (const [field, label] of nbsFields) {
        for (const s of studies) {
          for (const val of (s[field] || [])) {
            const key = `${label}: ${val}`;
            nbsCounts[key] = (nbsCounts[key] || 0) + 1;
          }
        }
      }
      const thresh = Math.ceil(studies.length * 0.5);
      const commonNbs = Object.entries(nbsCounts).filter(([, c]) => c >= thresh).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const goalCounts = {};
      for (const s of studies) { for (const g of (s.c3_goals || [])) { goalCounts[g] = (goalCounts[g] || 0) + 1; } }
      const commonGoals = Object.entries(goalCounts).filter(([, c]) => c >= thresh).sort((a, b) => b[1] - a[1]).slice(0, 6);
      const socialCounts = {};
      for (const s of studies) { for (const v of (s.b6_social_opportunities || [])) { socialCounts[v] = (socialCounts[v] || 0) + 1; } }
      const commonSocial = Object.entries(socialCounts).filter(([, c]) => c >= thresh).sort((a, b) => b[1] - a[1]).slice(0, 5);

      let text = `Commonalities across ${studies.length} results (50%+ frequency):\n`;
      if (commonNbs.length > 0) text += `\nNBS Elements:\n${commonNbs.map(([k, v]) => `  ${k} (${v}/${studies.length})`).join('\n')}`;
      if (commonGoals.length > 0) text += `\n\nGoals:\n${commonGoals.map(([k, v]) => `  ${k} (${v}/${studies.length})`).join('\n')}`;
      if (commonSocial.length > 0) text += `\n\nSocial opportunities:\n${commonSocial.map(([k, v]) => `  ${k} (${v}/${studies.length})`).join('\n')}`;
      if (commonNbs.length === 0 && commonGoals.length === 0) text += '\nNo strong commonalities found. Results are quite diverse.';
      response = text;
      break;
    }
    case '/similar': {
      if (!arg) { response = 'Usage: /similar <id or title>\nExample: /similar 1 or /similar garden'; break; }
      const simId = parseInt(arg);
      const ref = allStudies.find(s => s.id === simId || s.title.toLowerCase().includes(arg.toLowerCase()));
      if (!ref) { response = `No study found for "${arg}".`; break; }
      const simNbsFields = ['d1_plants', 'd2_paving', 'd3_water', 'd4_roof_facade', 'd5_furnishings', 'd6_urban_spaces'];
      const scored = allStudies.filter(s => s.id !== ref.id).map(s => {
        let score = 0;
        if (s.size === ref.size) score += 3;
        if (s.climate_zone === ref.climate_zone) score += 3;
        if (s.country === ref.country) score += 2;
        for (const f of simNbsFields) {
          const refVals = new Set(ref[f] || []);
          for (const v of (s[f] || [])) { if (refVals.has(v)) score += 1; }
        }
        const refGoals = new Set(ref.c3_goals || []);
        for (const g of (s.c3_goals || [])) { if (refGoals.has(g)) score += 1; }
        const refUses = new Set(ref.a6_uses || []);
        for (const u of (s.a6_uses || [])) { if (refUses.has(u)) score += 1; }
        return { study: s, score };
      }).sort((a, b) => b.score - a.score).slice(0, 5);
      response = `Studies similar to #${ref.id} "${ref.title}" (${ref.city}):\n\n`
        + scored.map((r, i) => {
          const shared = [];
          if (r.study.size === ref.size) shared.push(ref.size);
          if (r.study.climate_zone === ref.climate_zone) shared.push(ref.climate_zone);
          if (r.study.country === ref.country) shared.push(ref.country);
          return `${i + 1}. #${r.study.id} "${r.study.title}" (${r.study.city})\n   Score: ${r.score} pts | Shared: ${shared.join(', ') || 'NBS/goals overlap'}`;
        }).join('\n\n');
      break;
    }
    case '/suggest': {
      const suggestions = findCommonFilters(studies, activeFilters);
      if (suggestions.length === 0) {
        response = studies.length > 10
          ? 'No dominant filter found. Your results are diverse — try /common to see partial patterns.'
          : 'Few results, no strong suggestions. Try /describe to explore them individually.';
      } else {
        response = `Suggested filters (common in ${studies.length} results):\n\n`
          + suggestions.map(s => `${s.icon} ${s.category}: ${s.value} — ${s.frequency}% of results`).join('\n')
          + '\n\nClick filters in the panel to apply, or use the search bar.';
      }
      break;
    }
    case '/breakdown': {
      if (!arg) { response = 'Usage: /breakdown <field>\nFields: size, climate, country, scale, goals, uses, plants, water'; break; }
      const bkField = arg.toLowerCase().trim();
      const groupBy = {};
      const fieldMap = {
        size: s => [s.size || 'Unknown'],
        climate: s => [s.climate_zone || 'Unknown'],
        country: s => [s.country || 'Unknown'],
        scale: s => s.a1_urban_scale || [],
        goals: s => s.c3_goals || [],
        uses: s => s.a6_uses || [],
        plants: s => s.d1_plants || [],
        water: s => s.d3_water || [],
      };
      const extractor = fieldMap[bkField];
      if (!extractor) {
        response = `Unknown field: "${bkField}"\nAvailable: ${Object.keys(fieldMap).join(', ')}`;
        break;
      }
      for (const s of studies) { for (const v of extractor(s)) { groupBy[v] = (groupBy[v] || 0) + 1; } }
      if (Object.keys(groupBy).length === 0) { response = `No data for "${bkField}" in current results.`; break; }
      const sorted = Object.entries(groupBy).sort((a, b) => b[1] - a[1]);
      const maxVal = sorted[0][1];
      const barWidth = 16;
      const bar = sorted.map(([k, v]) => {
        const pct = Math.round(v / studies.length * 100);
        const blocks = Math.round(v / maxVal * barWidth);
        return `${'█'.repeat(blocks)}${'░'.repeat(barWidth - blocks)} ${k}: ${v} (${pct}%)`;
      });
      response = `Breakdown by ${bkField} (${studies.length} results):\n\n${bar.join('\n')}`;
      break;
    }
    case '/goals': {
      if (studies.length === 0) { response = 'No results.'; break; }
      const gCounts = {};
      for (const s of studies) { for (const g of (s.c3_goals || [])) { gCounts[g] = (gCounts[g] || 0) + 1; } }
      const gSorted = Object.entries(gCounts).sort((a, b) => b[1] - a[1]);
      if (gSorted.length === 0) { response = 'No goals data in current results.'; break; }
      const gMax = gSorted[0][1];
      const gBar = gSorted.map(([k, v]) => {
        const pct = Math.round(v / studies.length * 100);
        const blocks = Math.round(v / gMax * 16);
        return `${'█'.repeat(blocks)}${'░'.repeat(16 - blocks)} ${k}: ${v} (${pct}%)`;
      });
      response = `Goals across ${studies.length} results:\n\n${gBar.join('\n')}`;
      break;
    }
    case '/design': {
      if (studies.length === 0) { response = 'No results.'; break; }
      const designFields = [
        ['d1_plants', 'D1 Plants'], ['d2_paving', 'D2 Paving'], ['d3_water', 'D3 Water'],
        ['d4_roof_facade', 'D4 Roof/Facade'], ['d5_furnishings', 'D5 Furnishings'], ['d6_urban_spaces', 'D6 Urban Spaces']
      ];
      let dText = `NBS Design Elements in ${studies.length} results:\n`;
      for (const [field, label] of designFields) {
        const counts = {};
        for (const s of studies) { for (const v of (s[field] || [])) { counts[v] = (counts[v] || 0) + 1; } }
        const dSorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        if (dSorted.length > 0) {
          dText += `\n${label}:\n${dSorted.map(([k, v]) => `  ${k}: ${v}/${studies.length}`).join('\n')}`;
        }
      }
      response = dText;
      break;
    }
    case '/innovations': {
      if (studies.length === 0) { response = 'No results.'; break; }
      const physical = studies.filter(s => s.has_physical_innovation);
      const social = studies.filter(s => s.has_social_innovation);
      const digital = studies.filter(s => s.has_digital_innovation);
      let iText = `Innovations in ${studies.length} results:\n\n`;
      const formatSection = (label, list, field) => {
        let t = `${label}: ${list.length}/${studies.length} (${Math.round(list.length / studies.length * 100)}%)\n`;
        if (list.length > 0 && list.length <= 8) {
          t += list.map(s => `  - "${s.title}" — ${(s[field] || '').slice(0, 100)}...`).join('\n') + '\n';
        } else if (list.length > 8) {
          t += `  Top examples:\n` + list.slice(0, 5).map(s => `  - "${s.title}" — ${(s[field] || '').slice(0, 80)}...`).join('\n') + '\n';
        }
        return t;
      };
      iText += formatSection('Physical Innovation', physical, 'physical_innovation');
      iText += '\n' + formatSection('Social Innovation', social, 'social_innovation');
      iText += '\n' + formatSection('Digital Innovation', digital, 'digital_innovation');
      response = iText;
      break;
    }
    case '/timeline': {
      if (studies.length === 0) { response = 'No results.'; break; }
      const byYear = {};
      for (const s of studies) {
        const y = (s.year || 'Unknown').replace(/\s*\(.*\)/, '').trim();
        if (!byYear[y]) byYear[y] = [];
        byYear[y].push(s);
      }
      const ySorted = Object.entries(byYear).sort((a, b) => a[0].localeCompare(b[0]));
      response = `Timeline (${studies.length} results):\n\n` + ySorted.map(([y, sList]) =>
        `${y} (${sList.length}):\n${sList.map(s => `  - "${s.title}" (${s.city})`).join('\n')}`
      ).join('\n\n');
      break;
    }

    // ── Actions ──
    case '/stats':
      actions.showStats = true;
      response = 'Opening statistics dashboard...';
      break;
    case '/export':
      actions.exportPDF = true;
      response = `Exported ${studies.length} results as PDF.`;
      break;
    case '/clear':
      actions.clearAll = true;
      response = 'All filters and search cleared.';
      break;
    case '/favorites':
      actions.toggleFavorites = true;
      response = showFavorites ? 'Showing all results.' : `Showing ${favorites.length} favorite(s).`;
      break;
    case '/compare':
      if (compareIds.length >= 2) {
        actions.showCompare = true;
        response = `Comparing ${compareIds.length} studies.`;
      } else {
        response = 'Select 2-3 studies first using the compare checkbox on each card.';
      }
      break;

    // ── Info ──
    case '/cities': {
      const cities = [...new Set(studies.map(s => `${s.city}, ${s.country}`))].sort();
      response = `Cities in current results (${cities.length}):\n${cities.join(', ')}`;
      break;
    }
    case '/country': {
      if (!arg) {
        const allCountries = [...new Set(allStudies.map(s => s.country))].sort();
        response = `Usage: /country <name>\nAvailable: ${allCountries.join(', ')}`;
        break;
      }
      const cMatches = allStudies.filter(s => s.country.toLowerCase().includes(arg.toLowerCase()));
      if (cMatches.length === 0) {
        const allCountries = [...new Set(allStudies.map(s => s.country))].sort();
        response = `No studies in "${arg}".\nAvailable: ${allCountries.join(', ')}`;
      } else {
        const cName = cMatches[0].country;
        response = `${cMatches.length} studies in ${cName}:\n\n`
          + cMatches.map(s => `#${s.id} "${s.title}" (${s.city}) — ${s.size}, ${s.climate_zone}`).join('\n');
      }
      break;
    }
    case '/filters': {
      const active = Object.entries(activeFilters).filter(([, v]) => v.length > 0);
      if (active.length === 0) {
        response = 'No active filters. Use the search bar or filter panel to add some.';
      } else {
        response = 'Active filters:\n' + active.map(([k, v]) => {
          const cat = FILTER_CATEGORIES[k];
          return `${cat?.icon || ''} ${cat?.label || k}: ${v.join(', ')}`;
        }).join('\n');
      }
      break;
    }
    case '/nbs': {
      const nbsKeys = Object.entries(FILTER_CATEGORIES)
        .filter(([k]) => k.startsWith('d'));
      if (nbsKeys.length === 0) {
        response = 'No NBS categories found in filter configuration.';
      } else {
        response = 'NBS Design Categories:\n' + nbsKeys.map(([, cat]) =>
          `${cat.icon} ${cat.label} — ${cat.options.slice(0, 6).join(', ')}${cat.options.length > 6 ? '...' : ''}`
        ).join('\n');
      }
      break;
    }
    default:
      response = `Unknown command: ${cmd}\nType /help to see available commands.`;
  }

  return { response, actions };
}
