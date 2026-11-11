// AI search v2: one mode, four steps.
//   1. understand (worker, Gemini)  → search plan
//   2. retrieve   (browser, no AI)  → ranked cases (aiRetrieval.js)
//   3. judge      (worker, Gemini)  → up to 5 picks with explanations
//   4. verify     (browser)         → only candidates actually sent, no duplicates, hard constraints re-checked
// If the judge fails, the ranking of step 2 is still shown, saying it was not evaluated by the AI.
import { sanitizeUnderstanding, rankCases, passesPlan, matchedAlternatives, selectCandidates, evidenceInCard, RETRIEVAL_WEIGHTS } from './aiRetrieval';
import { loadCaseEmbeddings } from './caseEmbeddings';
import { answerCatalogueQuestion } from './catalogueAnswer';

const WORKER_URL = process.env.REACT_APP_WORKER_URL || 'https://talea-abacus-api.your-worker.workers.dev';

// Closest matches shown when the judge is not available.
export const UNJUDGED_SHOWN = 10;

// Number of cases sent to the judge (the worker also applies a token cap).
export const JUDGE_CANDIDATES = 15;

async function postJson(path, body) {
  const response = await fetch(`${WORKER_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    // reason: the worker's short diagnosis code (e.g. "main:503, backup:503"), never shown to visitors
    throw Object.assign(new Error(`Worker returned ${response.status}${data.reason ? ` (${data.reason})` : ''}`), {
      status: response.status, data, userMessage: data.error,
    });
  }
  return {
    data: await response.json(),
    remaining: parseInt(response.headers.get('X-RateLimit-Remaining') || '-1', 10),
    backup: response.headers.get('X-AI-Backup') === '1',
  };
}

// Step 4: keeps only valid picks of candidates that were really sent.
// Same threshold as JUDGE_MIN_SCORE in the worker: weaker picks are dropped
// (no NBS is better than a wrong one).
export const MIN_PICK_SCORE = 60;

// Cases the judge marked as partly relevant (not picks): ids it was sent, passing the constraints.
export function verifyAlsoRelevant(judgeData, candidates, plan, picks) {
  const byId = new Map(candidates.map(c => [String(c.study.id), c.study]));
  const seen = new Set(picks.map(p => String(p.study.id)));
  const out = [];
  for (const id of Array.isArray(judgeData?.also_relevant_ids) ? judgeData.also_relevant_ids : []) {
    const study = byId.get(String(id));
    if (!study || seen.has(String(id)) || !passesPlan(study, plan)) continue;
    seen.add(String(id));
    out.push(study);
  }
  return out;
}

export function verifyPicks(judgeData, candidates, plan) {
  const byId = new Map(candidates.map(c => [String(c.study.id), c]));
  const seen = new Set();
  const picks = [];
  for (const p of judgeData?.top_projects || []) {
    const c = byId.get(String(p.id));
    if (!c || seen.has(c.study.id)) continue;
    if (!passesPlan(c.study, plan)) continue;
    if (typeof p.explanation !== 'string' || !p.explanation.trim()) continue;
    if (Number.isFinite(p.relevance_score) && p.relevance_score < MIN_PICK_SCORE) continue;
    seen.add(c.study.id);
    picks.push({
      study: c.study,
      relevance: Number.isFinite(p.relevance_score) ? Math.max(0, Math.min(100, p.relevance_score)) : null,
      explanation: p.explanation.trim(),
      needsCovered: Array.isArray(p.needs_covered) ? p.needs_covered.filter(n => typeof n === 'string') : [],
      notInCard: typeof p.not_in_card === 'string' && p.not_in_card.trim() ? p.not_in_card.trim() : null,
      // site compatibility only when the user gave site constraints (otherwise nothing to compare);
      // "compatible"/"partly" only with words of the case's texts behind it (a tag is no evidence)
      siteFit: (plan.siteConstraints || []).length && (p.site_fit === 'not_compatible'
        || (['compatible', 'partly'].includes(p.site_fit) && evidenceInCard(p.site_fit_evidence, c.study)))
        ? p.site_fit : null,
      // OR groups this case answers (computed here, not taken from the AI)
      alternatives: matchedAlternatives(c.study, plan).map(i => plan.alternatives[i].label),
    });
  }
  return picks;
}

/**
 * @returns {Promise<{
 *   plan, summary, picks, ranked, judged: boolean, judgeError: Error|null,
 *   analysis: string|null, backup: boolean, remaining: number
 * }>}
 *   picks: the judge's choices (empty if none fits or the judge failed);
 *   ranked: picks first, then the other closest matches (the candidates sent to the judge;
 *   every case passing the constraints when the question has only constraints).
 *   Neither array modifies the shared case objects.
 */
export async function runAISearch(query, caseStudies, { onProgress, candidates = JUDGE_CANDIDATES } = {}) {
  if (onProgress) onProgress('understanding');
  const embeddings = loadCaseEmbeddings(); // in parallel with step 1
  const understood = await postJson('/api/understand', { message: query });
  const plan = sanitizeUnderstanding(understood.data, query);
  const base = {
    plan, intent: plan.intent, summary: plan.summary, picks: [], alsoRelevant: [], ranked: [],
    judged: false, judgeError: null, analysis: null, reply: null, suggestions: [],
    backup: understood.backup, remaining: understood.remaining, usedVectors: false,
  };

  // Greetings and off-topic questions: no search
  if (plan.intent === 'out_of_scope') {
    return { ...base, reply: plan.reply, suggestions: plan.suggestions };
  }
  // Questions about the catalogue: answered here from the data (the AI never counts)
  if (plan.intent === 'catalogue_question') {
    const answer = answerCatalogueQuestion(plan, caseStudies, plan.catalogueOps);
    return { ...base, catalogue: answer.text, ranked: answer.studies, suggestions: answer.suggestions || [], keepGrid: !!answer.keepGrid };
  }

  if (onProgress) onProgress('retrieving');
  const caseEmbeddings = await embeddings;
  const vectors = understood.data?._vectors;
  const semantic = caseEmbeddings && vectors && vectors.model === caseEmbeddings.model && Array.isArray(vectors.query)
    ? { query: vectors.query, caseVectors: caseEmbeddings.vectors }
    : null;
  const { ranked, hasSignals } = rankCases(plan, caseStudies, RETRIEVAL_WEIGHTS, semantic);
  const toJudge = selectCandidates(ranked, plan, candidates);
  // Results shown besides the picks: the closest matches (the candidates the judge saw).
  // With only constraints ("projects in Italy since 2016") every case passing them is shown.
  const related = hasSignals ? toJudge.map(r => r.study) : ranked.map(r => r.study);

  const result = {
    plan,
    summary: plan.summary,
    picks: [],
    alsoRelevant: [],
    ranked: related,
    judged: false,
    judgeError: null,
    analysis: null,
    backup: understood.backup,
    remaining: understood.remaining,
    usedVectors: !!semantic,
  };
  if (toJudge.length === 0) return result;
  // "The most beautiful one": no quality judgement, the closest cases and a few better questions
  if (plan.intent === 'subjective') {
    return { ...result, intent: plan.intent, reply: plan.reply, suggestions: plan.suggestions,
      ranked: toJudge.slice(0, UNJUDGED_SHOWN).map(r => r.study) };
  }

  if (onProgress) onProgress('judging');
  try {
    // The judge gets the AI's interpretation, with the required elements actually applied
    // (those the user did not really require became preferences, see sanitizeUnderstanding).
    const understanding = { ...understood.data, _vectors: undefined };
    if (plan.softenedRequired.length) {
      understanding.hard_constraints = {
        ...understanding.hard_constraints,
        require_tags: plan.hard.requireGroups.map(g => ({ any_of: g })),
      };
    }
    const judge = await postJson('/api/judge', {
      query,
      understanding,
      projects: toJudge.map(r => r.study),
    });
    result.picks = verifyPicks(judge.data, toJudge, plan);
    result.alsoRelevant = verifyAlsoRelevant(judge.data, toJudge, plan, result.picks);
    result.judged = true;
    result.analysis = typeof judge.data.overall_analysis === 'string' ? judge.data.overall_analysis : null;
    result.backup = result.backup || judge.backup;
  } catch (err) {
    // Step 3 failed: keep the closest matches of the search, flagged as not evaluated by the AI.
    result.judgeError = err;
    if (hasSignals) result.ranked = result.ranked.slice(0, UNJUDGED_SHOWN);
    return result;
  }

  // Shown results = what the judge found useful: the picks, then the cases it marked as
  // partly relevant. With only constraints ("projects in Italy") every matching case stays.
  const judgedUseful = [...result.picks.map(p => p.study), ...result.alsoRelevant];
  const usefulIds = new Set(judgedUseful.map(s => s.id));
  result.ranked = hasSignals
    ? judgedUseful
    : [...judgedUseful, ...result.ranked.filter(s => !usefulIds.has(s.id))];
  return result;
}
