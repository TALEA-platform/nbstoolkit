// TALEA Abacus - Cloudflare Worker (Google Gemini AI proxy with rate limiting)
// To use: rename to worker.js or update wrangler.toml main = "worker-gemini.js"

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-3.1-flash-lite-preview';
const DAILY_LIMIT = 150;
const THINKING_DAILY_LIMIT = 75;
const KV_TTL = 86400; // 24 hours

// ---------------------------------------------------------------------------
// Gemini-compatible schemas (OpenAPI 3.0 — uses nullable instead of anyOf)
// ---------------------------------------------------------------------------

function filterSchema(enumValues) {
  return {
    type: 'array',
    nullable: true,
    items: { type: 'string', enum: enumValues },
  };
}

const CHAT_RESPONSE_SCHEMA = {
  type: 'object',
  required: [
    'talea_application', 'size', 'climate_zone',
    'a1_urban_scale', 'a2_urban_area',
    'a3_1_buildings', 'a3_2_open_spaces', 'a3_3_infrastructures',
    'a4_ownership', 'a5_management', 'a6_uses', 'a7_other',
    'b1_physical', 'b2_regulations', 'b3_uses_management',
    'b4_public_opinion', 'b5_synergy', 'b6_social_opportunities',
    'c1_1_design', 'c1_2_funding', 'c1_3_management',
    'c2_actors', 'c3_goals', 'c4_services',
    'd1_plants', 'd2_paving', 'd3_water',
    'd4_roof_facade', 'd5_furnishings', 'd6_urban_spaces',
    'innovation',
    'city', 'country', 'year_min', 'year_max',
    'text_query', 'reasoning', 'summary',
    'match_logic', 'exclude', 'keywords',
  ],
  properties: {
    talea_application: filterSchema(['Nodal', 'Linear', 'Fragmented']),
    size: filterSchema(['Small', 'Medium', 'Large']),
    climate_zone: filterSchema(['Tropical', 'Arid', 'Mediterranean', 'Temperate', 'Cold/Boreal', 'Polar']),
    a1_urban_scale: filterSchema(['Territorial', 'Metropolitan', 'Urban', 'District', 'Urban block', 'Single space or building']),
    a2_urban_area: filterSchema(['Historical centre', 'Consolidated city', 'Peripheral area', 'Rural area']),
    a3_1_buildings: filterSchema(['Building / pavilion', 'Building complex', 'Building façade', 'Rooftop']),
    a3_2_open_spaces: filterSchema(['Courtyard', 'Entrance area', 'Green area (park / garden)', 'Open paved space', 'Parking area', 'Residual space or widening', 'Service yard or technical area', 'Square', 'Waterfront']),
    a3_3_infrastructures: filterSchema(['Carriageway', 'Cycle lane (dedicated)', 'Cycle lane with sidewalk', 'Disused railway or similar', 'Drainage channel / urban ditch', 'Footpath', 'Overpass or viaduct', 'Pedestrian street', 'Sidewalk', 'Sidewalk on commercial axis', 'Traffic island', 'Tramway trackbed']),
    a4_ownership: filterSchema(['Public', 'Private', 'Mixed (public/private)']),
    a5_management: filterSchema(['Association', "Citizens' committee", 'Mixed (public/private)', 'Neighbourhood', 'Private', 'Public']),
    a6_uses: filterSchema(['Commercial', 'Cultural', 'Educational', 'Events', 'Multifunctional', 'Outdoor activities', 'Performance', 'Recreational', 'Refreshment point', 'Residential', 'Slow mobility (walking / bike / bus)', 'Social', 'Sports', 'Temporary use', 'Unconventional use', 'Vegetable garden']),
    a7_other: filterSchema(['Abandoned / underused area', 'In-between space', 'Neighbourhood space']),
    b1_physical: filterSchema(['Aerial cables / power lines', 'Critical slopes / steep gradients', 'Existing large tree or plant roots', 'High levels of soil pollution', 'Impermeable or rigidly paved soil', 'Limited technical accessibility', 'Narrow spaces / complex morphologies', 'Subsurface utilities']),
    b2_regulations: filterSchema(['Architectural barrier regulations', 'Building codes and technical standards', 'Flood risk / hydrogeological constraint', 'Heritage/archaeological constraint', 'Landscape protection constraint', 'Public property rules / easements', 'Urban safety/surveillance rules']),
    b3_uses_management: filterSchema(['Commercial buildings/services', 'Consolidated use / uses', 'Digital infrastructure', 'Functional equipment', 'Green/blue infrastructure', 'Maintenance assigned to third parties', 'Mobility infrastructure/hubs', 'Public art and/or monuments', 'Public cultural buildings/services', 'Sensitive signage', 'Use conflicts', 'Vulnerable or sensitive users']),
    b4_public_opinion: filterSchema(['Collective memory / identity belonging', 'Fear of decay / improper use', 'Perception of the space as "private"', 'Rejection or distrust of greenery']),
    b5_synergy: filterSchema(['Existing regeneration projects', 'Municipal or metropolitan plans', 'Ongoing public or private investments']),
    b6_social_opportunities: filterSchema(['Civic participation', 'Community building / social cohesion', 'Cultural and intercultural exchange', 'Educational opportunities', 'Health promotion / active lifestyles', 'Inclusion', 'Intergenerational exchange', 'Safety and perception of security', 'Universal accessibility', 'Volunteering and active citizenship', 'Well-being']),
    c1_1_design: filterSchema(['Co-design', 'Community engagement', 'Cultural promotion', 'Open call/ competition', 'Public consultation', 'Research project', 'Self-build', 'Social innovation', 'Spontaneous intervention', 'Workshop']),
    c1_2_funding: filterSchema(['Crowdfunding', 'Partnership', 'Private funding', 'Public funding']),
    c1_3_management: filterSchema(['Collaboration agreement', 'Private', 'Public']),
    c2_actors: filterSchema(['Age groups', 'Artists', 'Associations', 'Citizens', 'Committees', 'Cultural centres', 'Designers', 'Facilitators', 'Foundations', 'Groups of citizens', 'Local Association', 'Neighbourhood councils', 'Non-profit organizations', 'Public institutions', 'Research centres', 'Residents', 'Shopkeepers', 'Students', 'Universities', 'Volunteers', 'Vulnerable individuals']),
    c3_goals: filterSchema(['Accessibility', 'Biodiversity', 'Care', 'Climate change mitigation', 'Environmental sustainability', 'Intergenerational collaboration', 'Knowledge', 'Liveability', 'New connections', 'New perception', 'New production', 'Re-activation', 'Re-appropriation', 'Resilience', 'Safety', 'Sense of community', 'Social inclusion', 'Transformation', 'Urban regeneration', 'Valorisation']),
    c4_services: filterSchema(['Access free to water', 'Areas for meeting residents', 'Areas with shade/cool spots', 'Benches/rest areas', 'Care and maintenance services', 'Educational - leisure and cultural uses', 'Monitoring and warning systems', 'Online maps / informative materials']),
    d1_plants: filterSchema(['Dense hedges', 'Ecological corridors - Pollinator-friendly gardens', 'Flower beds', 'Linear hedges', 'Row of trees', 'Rows / tree lines', 'Shading tree groups / tree clusters', 'Shrub patches', 'Single tree']),
    d2_paving: filterSchema(['Depaving', 'Permeable paving']),
    d3_water: filterSchema(['Artificial wetlands', 'Bioretention areas', 'Detention basins', 'Filter trenches / strips / drains', 'Floodable park', 'Fountains', 'Ground-level fountain', 'Green channels', 'Mist sprayers', 'Rain garden', 'Rain plaza', 'Reopened canals', 'Urban wetlands', 'Vegetated ditches', 'Water blades', 'Water mirror']),
    d4_roof_facade: filterSchema(['Climbing structures on walls or nets', 'Extensive green roofs', 'Green walls', 'Intensive green roofs', 'Vegetal sunshades']),
    d5_furnishings: filterSchema(['Green integrated furnishings', 'Green mobile covers', 'Green rigid covers', 'Green shelters', 'Prefabricated green modules', 'Vegetated awnings']),
    d6_urban_spaces: filterSchema(['Community gardens', 'Green spaces in infrastructures (underpasses / viaducts)', 'Micro parks', 'Multifunctional green spaces', 'Urban gardens']),
    innovation: filterSchema(['Physical', 'Social', 'Digital']),
    city: { type: 'string', nullable: true },
    country: { type: 'string', nullable: true },
    year_min: { type: 'integer', nullable: true },
    year_max: { type: 'integer', nullable: true },
    text_query: { type: 'string', nullable: true },
    reasoning: { type: 'string' },
    summary: { type: 'string' },
    match_logic: {
      type: 'object',
      required: ['scenarios', 'optional'],
      properties: {
        scenarios: {
          type: 'array',
          items: {
            type: 'object',
            required: ['required', 'label'],
            properties: {
              required: { type: 'array', items: { type: 'string' } },
              label: { type: 'string' },
            },
          },
        },
        optional: { type: 'array', items: { type: 'string' } },
      },
    },
    exclude: {
      type: 'object',
      required: ['categories', 'city', 'country'],
      properties: {
        categories: { type: 'array', items: {
          type: 'object', required: ['key', 'values'],
          properties: { key: { type: 'string' }, values: { type: 'array', items: { type: 'string' } } },
        }},
        city: { type: 'string', nullable: true },
        country: { type: 'string', nullable: true },
      },
    },
    keywords: { type: 'array', nullable: true, items: { type: 'string' } },
  },
};

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------

const CHAT_SYSTEM_PROMPT = `You are the TALEA Abacus search assistant. You help users find nature-based solution (NBS) case studies from a database of 50 projects across European cities. TALEA is an urban research project studying how nature-based solutions can transform public spaces.

Your job: parse the user's natural-language query into structured filters that match the database schema. Return ONLY the JSON — no extra text.

RULES:
- Set a filter array ONLY when the user's query clearly implies it. Leave as null otherwise.
- You may set multiple values in a single filter array if the query is broad.
- For city/country, use free-text strings (e.g. "Milan", "Italy"). Always use English city names: "Milan" not "Milano", "Rome" not "Roma", "Turin" not "Torino", "Munich" not "München", etc.
- For year_min/year_max, extract year ranges if mentioned.
- For text_query, put any remaining free-text that should be fuzzy-searched against project titles/descriptions.
- "reasoning" = brief internal explanation of your filter choices.
- "summary" = a friendly 1-2 sentence response to the user describing what you're searching for.
- "match_logic" = how to combine filters using scenarios (OR of AND-groups):
  - "scenarios": an array of AND-groups. Each scenario has "required" (array of filter key names — a study must match ALL of them) and "label" (short human-readable description). Results from all scenarios are UNIONED (OR). Use ONE scenario for simple queries, MULTIPLE for compound "X or Y" queries.
  - "optional": global boost keys — nice-to-have preferences. Matching these ranks a study higher but is never mandatory.
  - Simple query: "green roofs in Milan" → scenarios: [{ required: ["city", "d4_roof_facade"], label: "Green roofs in Milan" }], optional: []
  - Compound query: "projects in Milan, or ones with green roofs and rain gardens" → scenarios: [{ required: ["city"], label: "Projects in Milan" }, { required: ["d4_roof_facade", "d3_water"], label: "Green roofs with rain gardens" }], optional: []
  - Preference query: "community gardens, preferably with rain gardens" → scenarios: [{ required: ["d6_urban_spaces"], label: "Community gardens" }], optional: ["d3_water"]
  - Complex: "small projects in Italy with biodiversity goals, or large Mediterranean projects" → scenarios: [{ required: ["size", "country", "c3_goals"], label: "Small Italian biodiversity projects" }, { required: ["size", "climate_zone"], label: "Large Mediterranean projects" }], optional: []
  - Always include at least one scenario. Location filters (city, country) and explicitly stated NBS types should be in scenario "required".

FILTER CATEGORIES AND ALLOWED VALUES:

CORE:
- talea_application: ["Nodal", "Linear", "Fragmented"]
- size: ["Small", "Medium", "Large"]
- climate_zone: ["Tropical", "Arid", "Mediterranean", "Temperate", "Cold/Boreal", "Polar"]
- innovation: ["Physical", "Social", "Digital"]

A - PHYSICAL CONTEXT:
- a1_urban_scale: ["Territorial", "Metropolitan", "Urban", "District", "Urban block", "Single space or building"]
- a2_urban_area: ["Historical centre", "Consolidated city", "Peripheral area", "Rural area"]
- a3_1_buildings: ["Building / pavilion", "Building complex", "Building façade", "Rooftop"]
- a3_2_open_spaces: ["Courtyard", "Entrance area", "Green area (park / garden)", "Open paved space", "Parking area", "Residual space or widening", "Service yard or technical area", "Square", "Waterfront"]
- a3_3_infrastructures: ["Carriageway", "Cycle lane (dedicated)", "Cycle lane with sidewalk", "Disused railway or similar", "Drainage channel / urban ditch", "Footpath", "Overpass or viaduct", "Pedestrian street", "Sidewalk", "Sidewalk on commercial axis", "Traffic island", "Tramway trackbed"]
- a4_ownership: ["Public", "Private", "Mixed (public/private)"]
- a5_management: ["Association", "Citizens' committee", "Mixed (public/private)", "Neighbourhood", "Private", "Public"]
- a6_uses: ["Commercial", "Cultural", "Educational", "Events", "Multifunctional", "Outdoor activities", "Performance", "Recreational", "Refreshment point", "Residential", "Slow mobility (walking / bike / bus)", "Social", "Sports", "Temporary use", "Unconventional use", "Vegetable garden"]
- a7_other: ["Abandoned / underused area", "In-between space", "Neighbourhood space"]

B - CONSTRAINTS & OPPORTUNITIES:
- b1_physical: ["Aerial cables / power lines", "Critical slopes / steep gradients", "Existing large tree or plant roots", "High levels of soil pollution", "Impermeable or rigidly paved soil", "Limited technical accessibility", "Narrow spaces / complex morphologies", "Subsurface utilities"]
- b2_regulations: ["Architectural barrier regulations", "Building codes and technical standards", "Flood risk / hydrogeological constraint", "Heritage/archaeological constraint", "Landscape protection constraint", "Public property rules / easements", "Urban safety/surveillance rules"]
- b3_uses_management: ["Commercial buildings/services", "Consolidated use / uses", "Digital infrastructure", "Functional equipment", "Green/blue infrastructure", "Maintenance assigned to third parties", "Mobility infrastructure/hubs", "Public art and/or monuments", "Public cultural buildings/services", "Sensitive signage", "Use conflicts", "Vulnerable or sensitive users"]
- b4_public_opinion: ["Collective memory / identity belonging", "Fear of decay / improper use", "Perception of the space as \\"private\\"", "Rejection or distrust of greenery"]
- b5_synergy: ["Existing regeneration projects", "Municipal or metropolitan plans", "Ongoing public or private investments"]
- b6_social_opportunities: ["Civic participation", "Community building / social cohesion", "Cultural and intercultural exchange", "Educational opportunities", "Health promotion / active lifestyles", "Inclusion", "Intergenerational exchange", "Safety and perception of security", "Universal accessibility", "Volunteering and active citizenship", "Well-being"]

C - DESIGN PROCESS:
- c1_1_design: ["Co-design", "Community engagement", "Cultural promotion", "Open call/ competition", "Public consultation", "Research project", "Self-build", "Social innovation", "Spontaneous intervention", "Workshop"]
- c1_2_funding: ["Crowdfunding", "Partnership", "Private funding", "Public funding"]
- c1_3_management: ["Collaboration agreement", "Private", "Public"]
- c2_actors: ["Age groups", "Artists", "Associations", "Citizens", "Committees", "Cultural centres", "Designers", "Facilitators", "Foundations", "Groups of citizens", "Local Association", "Neighbourhood councils", "Non-profit organizations", "Public institutions", "Research centres", "Residents", "Shopkeepers", "Students", "Universities", "Volunteers", "Vulnerable individuals"]
- c3_goals: ["Accessibility", "Biodiversity", "Care", "Climate change mitigation", "Environmental sustainability", "Intergenerational collaboration", "Knowledge", "Liveability", "New connections", "New perception", "New production", "Re-activation", "Re-appropriation", "Resilience", "Safety", "Sense of community", "Social inclusion", "Transformation", "Urban regeneration", "Valorisation"]
- c4_services: ["Access free to water", "Areas for meeting residents", "Areas with shade/cool spots", "Benches/rest areas", "Care and maintenance services", "Educational - leisure and cultural uses", "Monitoring and warning systems", "Online maps / informative materials"]

D - NBS ELEMENTS:
- d1_plants: ["Dense hedges", "Ecological corridors - Pollinator-friendly gardens", "Flower beds", "Linear hedges", "Row of trees", "Rows / tree lines", "Shading tree groups / tree clusters", "Shrub patches", "Single tree"]
- d2_paving: ["Depaving", "Permeable paving"]
- d3_water: ["Artificial wetlands", "Bioretention areas", "Detention basins", "Filter trenches / strips / drains", "Floodable park", "Fountains", "Ground-level fountain", "Green channels", "Mist sprayers", "Rain garden", "Rain plaza", "Reopened canals", "Urban wetlands", "Vegetated ditches", "Water blades", "Water mirror"]
- d4_roof_facade: ["Climbing structures on walls or nets", "Extensive green roofs", "Green walls", "Intensive green roofs", "Vegetal sunshades"]
- d5_furnishings: ["Green integrated furnishings", "Green mobile covers", "Green rigid covers", "Green shelters", "Prefabricated green modules", "Vegetated awnings"]
- d6_urban_spaces: ["Community gardens", "Green spaces in infrastructures (underpasses / viaducts)", "Micro parks", "Multifunctional green spaces", "Urban gardens"]

OTHER FIELDS:
- city: free text string or null
- country: free text string or null
- year_min: integer or null
- year_max: integer or null
- text_query: remaining free-text for fuzzy search, or null

EXCLUDE (negation):
When the user says "not in Italy", "exclude Milan", "no green roofs", etc., use the "exclude" object:
- exclude.country = "Italy" for "not in Italy"
- exclude.city = "Milan" for "exclude Milan"
- exclude.categories = [{ key: "d4_roof_facade", values: ["Extensive green roofs"] }] for "no extensive green roofs"
Only set exclude fields when the user explicitly negates something. Leave as null / empty array otherwise.
Examples: "projects not in Italy" → exclude: { categories: [], city: null, country: "Italy" }
"green roofs but not in Milan" → city: null, exclude: { categories: [], city: "Milan", country: null }

KEYWORDS:
- keywords = free-text terms capturing semantic intent beyond structured filters, fuzzy-searched against title/description/city/designer/innovations. Up to 10 terms.
- Use keywords for concepts that don't map to any filter category, e.g. "playground", "elderly", "flooding", "depaving initiative".
- Set to null when all intent is captured by structured filters.`;

const ANALYZE_SYSTEM_PROMPT = `You are the TALEA Abacus analysis assistant. You help users understand why specific nature-based solution (NBS) projects match their search query.

TALEA is a European urban research project studying how nature-based solutions transform public spaces. The database contains different case studies from cities across the World.

When given a user query and a list of matching projects, provide a concise, insightful explanation of:
1. Why these projects are relevant to the query
2. Key commonalities between the matched projects
3. Notable differences or unique aspects of each project

Keep your response focused, informative, and under 300 words. Use plain language accessible to urban planners, researchers, and students.`;

const THINKING_PASS1_PROMPT = CHAT_SYSTEM_PROMPT + `

IMPORTANT — THINKING MODE (softer filtering):
You are in deep-thinking mode. Be MORE GENEROUS with filter selections:
- Use MORE optional keys and FEWER required keys to cast a wider net.
- If a concept is loosely related to a filter category, include it as optional.
- Set keywords generously — capture synonyms, related concepts, and sub-themes.
- Prefer multiple short scenarios over one strict one.
- The goal is to return 10-20 candidate projects, not to narrow precisely.`;

const THINKING_PASS2_SCHEMA = {
  type: 'object',
  required: ['top_projects', 'overall_analysis'],
  properties: {
    top_projects: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'relevance_score', 'explanation'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          relevance_score: { type: 'number' },
          explanation: { type: 'string' },
        },
      },
    },
    overall_analysis: { type: 'string' },
  },
};

const THINKING_PASS2_PROMPT = `You are the TALEA Abacus Deep Scan Judge — an expert in urban planning, landscape architecture, and Nature-Based Solutions (NBS) with deep knowledge of World cities and public-space transformation projects.

You will receive the USER'S EXACT QUERY and up to 15 candidate projects (as minified JSON) that passed a broad keyword filter. Your job is to critically evaluate each candidate against the user's specific intent.

EVALUATION RULES:

1. USE YOUR PROFESSIONAL KNOWLEDGE: Go beyond the JSON fields. Apply what you know about these cities, climates, construction methods, and NBS typologies. If the user asks for permanent stormwater management and a candidate is clearly a temporary tactical urbanism installation, reject it — even if the tags overlap.

2. MATCH THE USER'S ACTUAL INTENT: Read the query carefully for implicit constraints. "Large-scale biodiversity corridor" is NOT satisfied by a single rooftop garden. "Projects for elderly residents" requires evidence of accessibility or intergenerational design, not just a public park. If a constraint is explicit ("not in Italy", "more than 5 hectares", "designed after 2020"), enforce it strictly.

3. RETURN MAXIMUM 3 PROJECTS: Select only the candidates that genuinely and specifically match the query. If only 1 or 2 truly fit, return only those. Quality over quantity.

4. ACCEPT ZERO MATCHES: If NONE of the candidates truly satisfy the user's request, return an EMPTY top_projects array []. Do not force a mediocre fit. An honest "no strong match" is more valuable than a misleading recommendation.

5. SCORE WITH PURPOSE: relevance_score (0-100) reflects how well the project addresses the user's specific request, not general project quality. A world-class project scores 0 if it is irrelevant to the query.

6. EXPLAIN IN DETAIL: Each explanation must be 3-5 sentences of substantive analysis. Reference concrete details — the NBS elements used, the urban context, the design approach, the spatial scale, the innovation strategy. Explain WHY this project answers the query and WHAT makes it particularly relevant. Do not use generic praise.

OUTPUT FORMAT (strict JSON schema):
- top_projects: Array of 0 to 3 objects, sorted by relevance_score descending. Each: { id (as string), title, relevance_score (0-100), explanation (3-5 sentences with specific architectural/planning reasoning) }.
- overall_analysis: Concise markdown summary (150-250 words) with ## headings. Focus on the selected projects: what patterns connect them, what practical insights the user can draw, and how these projects address the query's core needs.`;

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

function corsHeaders(origin, allowedOrigin) {
  let isAllowed = !allowedOrigin || allowedOrigin === '*';
  if (!isAllowed && allowedOrigin) {
    const origins = allowedOrigin.split(',').map(o => o.trim());
    isAllowed = origins.includes(origin);
  }
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : (allowedOrigin || '*'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-RateLimit-Remaining',
    'Access-Control-Max-Age': '86400',
  };
}

function isOriginAllowed(origin, allowedOrigin) {
  if (!allowedOrigin || allowedOrigin === '*') return true;
  const origins = allowedOrigin.split(',').map(o => o.trim());
  return origins.includes(origin);
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

async function checkRateLimit(ip, kv, prefix = 'rate', limit = DAILY_LIMIT) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `${prefix}:${ip}:${today}`;
  const current = parseInt(await kv.get(key) || '0', 10);
  if (current >= limit) {
    return { allowed: false, remaining: 0 };
  }
  await kv.put(key, String(current + 1), { expirationTtl: KV_TTL });
  return { allowed: true, remaining: limit - current - 1 };
}

// ---------------------------------------------------------------------------
// Gemini API call
// ---------------------------------------------------------------------------

async function callGemini(apiKey, systemPrompt, userMessage, responseSchema = null, maxTokens = 2048) {
  const url = `${GEMINI_URL}/${MODEL}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [{
      role: 'user',
      parts: [{ text: userMessage }],
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: maxTokens,
    },
  };

  if (responseSchema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = responseSchema;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data = await res.json();

  // Check for safety blocks or empty responses
  const candidate = data.candidates?.[0];
  if (!candidate || candidate.finishReason === 'SAFETY') {
    throw new Error('Response blocked by safety filter. Try rephrasing your query.');
  }
  if (!candidate.content?.parts?.[0]?.text) {
    throw new Error('Empty response from Gemini API.');
  }

  return candidate.content.parts[0].text;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleChat(request, env) {
  const { message } = await request.json();

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing "message" field' }), { status: 400 });
  }

  const content = await callGemini(
    env.GEMINI_API_KEY,
    CHAT_SYSTEM_PROMPT,
    message,
    CHAT_RESPONSE_SCHEMA,
  );

  return new Response(content, {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleAnalyze(request, env) {
  const { query, projects, scenarios } = await request.json();

  if (!query || typeof query !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing "query" field' }), { status: 400 });
  }

  if (!Array.isArray(projects) || projects.length === 0 || projects.length > 10) {
    return new Response(JSON.stringify({ error: '"projects" must be an array of 1-10 items' }), { status: 400 });
  }

  const projectDescriptions = projects.map((p, i) =>
    `Project ${i + 1}: "${p.title}" — ${p.city}, ${p.country}${p.scenario ? ` [Scenario: ${p.scenario}]` : ''}\n${p.description || 'No description available.'}`
  ).join('\n\n');

  let systemPrompt = ANALYZE_SYSTEM_PROMPT;
  if (scenarios && scenarios.length > 1) {
    systemPrompt += `\n\nIMPORTANT: The results come from ${scenarios.length} distinct search scenarios: ${scenarios.map(s => `"${s}"`).join(', ')}. Organize your analysis with a separate ## section for each scenario. Do not cross-compare projects from different scenarios.`;
  }

  const content = await callGemini(
    env.GEMINI_API_KEY,
    systemPrompt,
    `User query: "${query}"\n\nMatching projects:\n\n${projectDescriptions}`,
  );

  return new Response(JSON.stringify({ analysis: content }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleThinkPass1(request, env) {
  const { message } = await request.json();

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing "message" field' }), { status: 400 });
  }

  const content = await callGemini(
    env.GEMINI_API_KEY,
    THINKING_PASS1_PROMPT,
    message,
    CHAT_RESPONSE_SCHEMA,
  );

  return new Response(content, {
    headers: { 'Content-Type': 'application/json' },
  });
}

// Pass2 judge only needs core identity + narrative fields.
const JUDGE_KEEP = new Set([
  'id', 'title', 'city', 'country', 'year', 'designer',
  'description', 'size', 'climate_zone', 'talea_application',
  'physical_innovation', 'social_innovation', 'digital_innovation',
]);

function minifyStudy(study) {
  const result = {};
  for (const key of JUDGE_KEEP) {
    const value = study[key];
    if (value === null || value === undefined || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result;
}

// Stateless: pass2 receives NO context from pass1
async function handleThinkPass2(request, env) {
  const { query, projects } = await request.json();

  if (!query || typeof query !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing "query" field' }), { status: 400 });
  }

  if (!Array.isArray(projects) || projects.length === 0 || projects.length > 15) {
    return new Response(JSON.stringify({ error: '"projects" must be an array of 1-15 items' }), { status: 400 });
  }

  const projectData = projects.map((p, i) =>
    `Project ${i + 1} (id: ${p.id}):\n${JSON.stringify(minifyStudy(p), null, 0)}`
  ).join('\n\n');

  const content = await callGemini(
    env.GEMINI_API_KEY,
    THINKING_PASS2_PROMPT,
    `THE USER'S ORIGINAL REQUEST:\n"${query}"\n\n---\n\nCANDIDATE PROJECTS TO EVALUATE (${projects.length}):\n\n${projectData}`,
    THINKING_PASS2_SCHEMA,
    4096,
  );

  return new Response(content, {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env.ALLOWED_ORIGIN);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (!isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const isThinking = url.pathname.startsWith('/api/think-');
    const ratePrefix = isThinking ? 'rate:thinking' : 'rate';
    const rateLimit = isThinking ? THINKING_DAILY_LIMIT : DAILY_LIMIT;
    const rateResult = await checkRateLimit(ip, env.RATE_LIMIT, ratePrefix, rateLimit);
    if (!rateResult.allowed) {
      return new Response(JSON.stringify({
        error: `Daily rate limit exceeded. You can make up to ${rateLimit} ${isThinking ? 'deep search' : 'AI'} requests per day.`,
        remaining: 0,
      }), {
        status: 429,
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
        },
      });
    }

    try {
      let response;

      if (url.pathname === '/api/chat') {
        response = await handleChat(request, env);
      } else if (url.pathname === '/api/analyze') {
        response = await handleAnalyze(request, env);
      } else if (url.pathname === '/api/think-pass1') {
        response = await handleThinkPass1(request, env);
      } else if (url.pathname === '/api/think-pass2') {
        response = await handleThinkPass2(request, env);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }

      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(cors)) {
        headers.set(k, v);
      }
      headers.set('X-RateLimit-Remaining', String(rateResult.remaining));

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || 'Internal server error' }), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  },
};
