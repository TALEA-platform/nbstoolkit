const NBS_FIELDS = ['d1_plants', 'd2_paving', 'd3_water', 'd4_roof_facade', 'd5_furnishings', 'd6_urban_spaces'];

/**
 * Score and return the top N studies most similar to a reference study.
 * @param {object} ref - The reference study
 * @param {object[]} allStudies - All studies to compare against
 * @param {number} limit - Max results (default 4)
 * @returns {Array<{study: object, score: number}>}
 */
export default function findSimilarStudies(ref, allStudies, limit = 4) {
  return allStudies
    .filter(s => s.id !== ref.id)
    .map(s => {
      let score = 0;
      if (s.size === ref.size) score += 3;
      if (s.climate_zone === ref.climate_zone) score += 3;
      if (s.country === ref.country) score += 2;
      for (const f of NBS_FIELDS) {
        const refVals = new Set(ref[f] || []);
        for (const v of (s[f] || [])) { if (refVals.has(v)) score += 1; }
      }
      const refGoals = new Set(ref.c3_goals || []);
      for (const g of (s.c3_goals || [])) { if (refGoals.has(g)) score += 1; }
      const refUses = new Set(ref.a6_uses || []);
      for (const u of (s.a6_uses || [])) { if (refUses.has(u)) score += 1; }
      return { study: s, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
