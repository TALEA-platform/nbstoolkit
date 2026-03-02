let webllm = null;
let engine = null;
let isLoading = false;
let isReady = false;
let statusListeners = [];

const MODEL_ID = 'SmolLM2-360M-Instruct-q4f16_1-MLC';

export function subscribeLLMStatus(listener) {
  statusListeners.push(listener);
  return () => {
    statusListeners = statusListeners.filter(l => l !== listener);
  };
}

function notifyStatus(status) {
  for (const listener of statusListeners) {
    listener(status);
  }
}

export function isLLMReady() {
  return isReady;
}

export function isLLMLoading() {
  return isLoading;
}

export async function initLLM() {
  if (isReady || isLoading) return;

  // Check WebGPU support
  if (!navigator.gpu) {
    notifyStatus({ type: 'error', message: 'WebGPU not supported in this browser' });
    return false;
  }

  isLoading = true;
  notifyStatus({ type: 'loading', progress: 0, message: 'Loading AI library...' });

  try {
    // Dynamic import for code splitting
    webllm = await import('@mlc-ai/web-llm');
    notifyStatus({ type: 'loading', progress: 0, message: 'Initializing AI model...' });

    engine = await webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: (progress) => {
        notifyStatus({
          type: 'loading',
          progress: progress.progress || 0,
          message: progress.text || 'Loading model...',
        });
      },
    });

    isReady = true;
    isLoading = false;
    notifyStatus({ type: 'ready', message: 'AI model ready!' });
    return true;
  } catch (err) {
    isLoading = false;
    isReady = false;
    notifyStatus({ type: 'error', message: `Failed to load AI: ${err.message}` });
    return false;
  }
}

export async function generateLLMResponse(userQuery, relevantStudies, activeFilters) {
  if (!engine || !isReady) {
    return null;
  }

  // Build detailed context from relevant studies
  const studyContext = relevantStudies.slice(0, 5).map(s => {
    const nbs = [
      ...(s.d1_plants || []), ...(s.d2_paving || []),
      ...(s.d3_water || []), ...(s.d4_roof_facade || []),
      ...(s.d5_furnishings || []), ...(s.d6_urban_spaces || []),
    ];
    const goals = (s.c3_goals || []).slice(0, 5).join(', ');
    const uses = (s.a6_uses || []).slice(0, 5).join(', ');
    const scale = (s.a1_urban_scale || []).join(', ');
    return `- ID#${s.id} "${s.title}" | City: ${s.city}, ${s.country} | Size: ${s.size} | Climate: ${s.climate_zone} | Scale: ${scale} | Uses: ${uses} | Goals: ${goals} | NBS: ${nbs.join(', ')} | Description: ${(s.description || '').slice(0, 200)}`;
  }).join('\n');

  // Build filter context
  let filterCtx = '';
  if (activeFilters && Object.keys(activeFilters).length > 0) {
    const parts = Object.entries(activeFilters)
      .filter(([, v]) => v.length > 0)
      .map(([k, v]) => `${k}: ${v.join(', ')}`);
    if (parts.length > 0) {
      filterCtx = `\n\nCurrently active filters: ${parts.join('; ')}. The results below have already been filtered by these criteria.`;
    }
  }

  const totalShown = relevantStudies.length;

  const systemPrompt = `You are a strict, data-only assistant for the Nature-Based Solutions Toolkit (TALEA Abacus of Hardware Solutions). The toolkit contains exactly 50 Nature-Based Solutions (NBS) case studies from cities worldwide.

STRICT RULES — you MUST follow these:
1. ONLY use information from the case studies provided below. NEVER invent, guess, or hallucinate any data, names, cities, or details.
2. If the answer is not in the provided case studies, say: "I don't have that information in the current case studies."
3. Always reference case studies by their exact title, city, and ID number (e.g., ID#3 "Title" in City).
4. Be concise: 2-3 sentences maximum.
5. When suggesting filters, only suggest filter values that exist in the data. Valid filter groups are: Core (TALEA Application, Size, Climate Zone), A-Physical (Urban Scale, Urban Area, Buildings, Open Spaces, Infrastructures, Ownership, Management, Uses), B-Constraints (Physical, Regulations, Uses & Management, Public Opinion, Synergy, Social Opportunities), C-Design (Design Process, Funding, Management, Actors, Goals, Services), D-NBS (Plants, Paving, Water, Roof & Facade, Furnishings, Urban Spaces).
6. Do NOT answer questions unrelated to NBS, urban greening, or the case studies in the database.
7. If no case studies match, suggest the user try different filters or broader search terms.
8. When describing NBS solutions, use only the categories and values from the actual data.${filterCtx}

${totalShown > 0 ? `There are currently ${totalShown} case studies matching the search. Here are the most relevant:` : 'No case studies match the current search.'}
${studyContext || 'No specific studies available.'}`;

  try {
    const response = await engine.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userQuery },
      ],
      max_tokens: 250,
      temperature: 0.3,
      stream: true,
    });

    let fullText = '';
    for await (const chunk of response) {
      const delta = chunk.choices?.[0]?.delta?.content || '';
      fullText += delta;
      notifyStatus({ type: 'streaming', text: fullText });
    }

    return fullText.trim() || null;
  } catch (err) {
    notifyStatus({ type: 'error', message: `Generation failed: ${err.message}` });
    return null;
  }
}
