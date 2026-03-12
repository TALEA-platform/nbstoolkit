// TALEA Abacus - Cloudflare Worker (Groq AI proxy with rate limiting)

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'openai/gpt-oss-20b';
const DAILY_LIMIT = 150;
const KV_TTL = 86400; // 24 hours

// ---------------------------------------------------------------------------
// JSON Schema for structured /api/chat responses
// ---------------------------------------------------------------------------

function filterSchema(enumValues) {
  return {
    anyOf: [
      { type: 'array', items: { type: 'string', enum: enumValues } },
      { type: 'null' },
    ],
  };
}

const CHAT_RESPONSE_SCHEMA = {
  name: 'filter_result',
  strict: true,
  schema: {
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
      'match_logic',
    ],
    additionalProperties: false,
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
      city: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      country: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      year_min: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
      year_max: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
      text_query: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      reasoning: { type: 'string' },
      summary: { type: 'string' },
      match_logic: {
        type: 'object',
        required: ['scenarios', 'optional'],
        additionalProperties: false,
        properties: {
          scenarios: {
            type: 'array',
            items: {
              type: 'object',
              required: ['required', 'label'],
              additionalProperties: false,
              properties: {
                required: { type: 'array', items: { type: 'string' } },
                label: { type: 'string' },
              },
            },
          },
          optional: { type: 'array', items: { type: 'string' } },
        },
      },
    },
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
- text_query: remaining free-text for fuzzy search, or null`;

const ANALYZE_SYSTEM_PROMPT = `You are the TALEA Abacus analysis assistant. You help users understand why specific nature-based solution (NBS) projects match their search query.

TALEA is a European urban research project studying how nature-based solutions transform public spaces. The database contains different case studies from cities across the World.

When given a user query and a list of matching projects, provide a concise, insightful explanation of:
1. Why these projects are relevant to the query
2. Key commonalities between the matched projects
3. Notable differences or unique aspects of each project

Keep your response focused, informative, and under 300 words. Use plain language accessible to urban planners, researchers, and students.`;

// ---------------------------------------------------------------------------
// CORS helpers
// ---------------------------------------------------------------------------

function corsHeaders(origin, allowedOrigin) {
  // Allow the configured origin, or allow all in dev (when ALLOWED_ORIGIN is not set or is "*")
  const isAllowed = !allowedOrigin || allowedOrigin === '*' || origin === allowedOrigin;
  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function isOriginAllowed(origin, allowedOrigin) {
  if (!allowedOrigin || allowedOrigin === '*') return true;
  return origin === allowedOrigin;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

async function checkRateLimit(ip, kv) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const key = `rate:${ip}:${today}`;
  const current = parseInt(await kv.get(key) || '0', 10);
  if (current >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0 };
  }
  await kv.put(key, String(current + 1), { expirationTtl: KV_TTL });
  return { allowed: true, remaining: DAILY_LIMIT - current - 1 };
}

// ---------------------------------------------------------------------------
// Groq API call
// ---------------------------------------------------------------------------

async function callGroq(apiKey, messages, responseFormat) {
  const body = {
    model: MODEL,
    messages,
    temperature: 0.3,
    max_tokens: 2048,
  };
  if (responseFormat) {
    body.response_format = responseFormat;
  }

  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

async function handleChat(request, env) {
  const { message } = await request.json();

  if (!message || typeof message !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing "message" field' }), { status: 400 });
  }

  // Stateless: each request is independent (no history)
  const messages = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    { role: 'user', content: message },
  ];

  const content = await callGroq(env.GROQ_API_KEY, messages, {
    type: 'json_schema',
    json_schema: CHAT_RESPONSE_SCHEMA,
  });

  return new Response(content, {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleAnalyze(request, env) {
  const { query, projects } = await request.json();

  if (!query || typeof query !== 'string') {
    return new Response(JSON.stringify({ error: 'Missing "query" field' }), { status: 400 });
  }

  if (!Array.isArray(projects) || projects.length === 0 || projects.length > 3) {
    return new Response(JSON.stringify({ error: '"projects" must be an array of 1-3 items' }), { status: 400 });
  }

  const projectDescriptions = projects.map((p, i) =>
    `Project ${i + 1}: "${p.title}" — ${p.city}, ${p.country}\n${p.description || 'No description available.'}`
  ).join('\n\n');

  const messages = [
    { role: 'system', content: ANALYZE_SYSTEM_PROMPT },
    { role: 'user', content: `User query: "${query}"\n\nMatching projects:\n\n${projectDescriptions}` },
  ];

  const content = await callGroq(env.GROQ_API_KEY, messages, null);

  return new Response(JSON.stringify({ analysis: content }), {
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

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // Only POST is allowed for API routes
    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Validate origin
    if (!isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Rate limiting
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateResult = await checkRateLimit(ip, env.RATE_LIMIT);
    if (!rateResult.allowed) {
      return new Response(JSON.stringify({
        error: 'Daily rate limit exceeded. You can make up to 15 AI requests per day.',
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
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }

      // Attach CORS and rate-limit headers to the response
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
