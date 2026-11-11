// TALEA Abacus - Cloudflare Worker (Google Gemini AI proxy with rate limiting)
// To use: rename to worker.js or update wrangler.toml main = "worker-gemini.js"

// Meaning of the filters, shared with the site (wrangler bundles these files into the worker)
import filterDescriptions from '../src/data/filterDescriptions.json';
import nbsDefinitions from '../src/data/nbsDefinitions.json';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
// Main model, and the backup used when the main one has used up its free daily quota
// (or is unavailable). The free daily quota resets at midnight Pacific time.
const MODEL = 'gemini-3.5-flash-lite';
const BACKUP_MODEL = 'gemini-3.1-flash-lite';
// Searches per visitor per day. Every call that reaches Gemini is counted (D1, see
// checkRateLimit): the first call of a search uses one search; the follow-up call
// (judge, or analyze / think-pass2 of the old v1 search) is allowed only within
// FOLLOW_UPS_PER_SEARCH per search made today (one, plus one retry).
const DAILY_LIMIT = 500; // high while testing; to be lowered before go-live
const SEARCH_START = new Set(['/api/chat', '/api/think-pass1', '/api/understand']);
const FOLLOW_UP = new Set(['/api/analyze', '/api/think-pass2', '/api/judge']);
const FOLLOW_UPS_PER_SEARCH = 2;

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
    a3_2_open_spaces: filterSchema(['Courtyard', 'Entrance area', 'Game field', 'Green area (park / garden)', 'Open paved space', 'Parking area', 'Residual space or widening', 'Service yard or technical area', 'Square', 'Waterfront']),
    a3_3_infrastructures: filterSchema(['Carriageway', 'Cycle lane (dedicated)', 'Cycle lane with sidewalk', 'Disused railway or similar', 'Drainage channel / urban ditch', 'Footpath', 'Overpass or viaduct', 'Pedestrian street', 'Road interchange or ramp', 'Sidewalk', 'Sidewalk on commercial axis', 'Traffic island', 'Tramway trackbed', 'Underpass']),
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
    c1_2_funding: filterSchema(['Crowdfunding', 'Participatory budget', 'Partnership', 'Private funding', 'Public funding']),
    c1_3_management: filterSchema(['Collaboration agreement', 'Private', 'Public']),
    c2_actors: filterSchema(['Age groups', 'Artists', 'Associations', 'Citizens', 'Committees', 'Cultural centres', 'Designers', 'Entrepreneurs', 'Facilitators', 'Foundations', 'Groups of citizens', 'Local Association', 'Neighbourhood councils', 'Non-profit organizations', 'Public institutions', 'Research centres', 'Residents', 'Shopkeepers', 'Students', 'Universities', 'Volunteers', 'Vulnerable individuals']),
    c3_goals: filterSchema(['Accessibility', 'Biodiversity', 'Care', 'Climate change mitigation', 'Environmental sustainability', 'Intergenerational collaboration', 'Knowledge', 'Liveability', 'New connections', 'New perception', 'New production', 'Re-activation', 'Re-appropriation', 'Resilience', 'Safety', 'Sense of community', 'Social inclusion', 'Transformation', 'Urban regeneration', 'Valorisation']),
    c4_services: filterSchema(['Access free to water', 'Areas for meeting residents', 'Areas with shade/cool spots', 'Benches/rest areas', 'Care and maintenance services', 'Educational - leisure and cultural uses', 'Monitoring and warning systems', 'Online maps / informative materials', 'Wi-fi connection']),
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

const CHAT_SYSTEM_PROMPT = `You are the TALEA Abacus search assistant. You help users find nature-based solution (NBS) case studies from a database of projects across cities worldwide. TALEA is an urban research project studying how nature-based solutions can transform public spaces.

Your job: parse the user's natural-language query into structured filters that match the database schema. Return ONLY the JSON — no extra text.

RULES:
- Set a filter array ONLY when the user's query clearly implies it. Leave as null otherwise.
- You may set multiple values in a single filter array if the query is broad.
- For city/country, use free-text strings (e.g. "Milan", "Italy"). Always use English city names: "Milan" not "Milano", "Rome" not "Roma", "Turin" not "Torino", "Munich" not "München", etc.
- For year_min/year_max, extract year ranges if mentioned.
- For text_query, put any remaining free-text that should be fuzzy-searched against project titles/descriptions.
- "reasoning" = brief internal explanation of your filter choices (in the user's language).
- "summary" = a friendly 1-2 sentence response to the user describing what you're searching for (in the user's language).
- "match_logic" = how to combine filters using scenarios (OR of AND-groups):
  - "scenarios": an array of AND-groups. Each scenario has "required" (array of filter key names — a study must match ALL of them) and "label" (short human-readable description). Results from all scenarios are UNIONED (OR). Use ONE scenario for simple queries, MULTIPLE for compound "X or Y" queries.
  - "optional": global boost keys — nice-to-have preferences. Matching these ranks a study higher but is never mandatory.
  - Simple query: "green roofs in Milan" → scenarios: [{ required: ["city", "d4_roof_facade"], label: "Green roofs in Milan" }], optional: []
  - Compound query: "projects in Milan, or ones with green roofs and rain gardens" → scenarios: [{ required: ["city"], label: "Projects in Milan" }, { required: ["d4_roof_facade", "d3_water"], label: "Green roofs with rain gardens" }], optional: []
  - Preference query: "community gardens, preferably with rain gardens" → scenarios: [{ required: ["d6_urban_spaces"], label: "Community gardens" }], optional: ["d3_water"]
  - Complex: "small projects in Italy with biodiversity goals, or large Mediterranean projects" → scenarios: [{ required: ["size", "country", "c3_goals"], label: "Small Italian biodiversity projects" }, { required: ["size", "climate_zone"], label: "Large Mediterranean projects" }], optional: []
  - Always include at least one scenario. Location filters (city, country) and explicitly stated NBS types should be in scenario "required".

LANGUAGE:
- ALWAYS write "reasoning", "summary", and all human-facing text in the SAME LANGUAGE as the user's query. If the user writes in Italian, respond in Italian. If in French, respond in French. If in English, respond in English. Match the language exactly. Exception: "keywords" are search terms, not human-facing text, and are ALWAYS in English.

PLACE-BASED QUERIES (when the user mentions a specific real-world location):
When the user references a specific place (e.g. "Piazza Perini a Mattarello", "the parking lot behind Gare du Nord", "a schoolyard in Kreuzberg", "I need to improve a square in Trento with plants"):
1. USE YOUR WORLD KNOWLEDGE to understand what that place is — its urban scale, area type, open space type, climate zone, typical constraints, ownership, surrounding context, etc.
2. SET FILTERS based on the INFERRED PHYSICAL CHARACTERISTICS of that place, not just its geographic location. A query about a small square in Trento should select filters like a2_urban_area=["Consolidated city"], a3_2_open_spaces=["Square"], size=["Small"], climate_zone=["Temperate"] — not just country="Italy".
3. DO NOT restrict by country or city UNLESS the user explicitly asks for projects from that specific country or city. A mention of a place is a description of context, not a geographic filter. The goal is to find TRANSFERABLE precedents from anywhere in the world that match the physical and contextual characteristics of the mentioned place.
4. Use keywords generously to capture the specific aspects the user mentions about the place or their goals (e.g. "shading", "plants", "pedestrian", "school courtyard", "parking area").
5. In the summary, acknowledge the place the user described and explain what physical characteristics you inferred from it and what you are searching for.

Example: "Ho una piazza come Piazza Perini a Mattarello e vorrei usare piante per migliorarla"
→ Infer: small/medium square, consolidated city or peripheral area, temperate climate, public ownership, open paved space
→ Filters: a3_2_open_spaces=["Square","Open paved space"], climate_zone=["Temperate","Mediterranean"], a4_ownership=["Public"], d1_plants=[multiple relevant plant types], c3_goals=["Liveability","Urban regeneration"]
→ city: null, country: null (NOT "Italy" — we want transferable global precedents)
→ keywords: ["square", "plants", "greening", "public space improvement"]
→ summary (in Italian): "Sto cercando progetti che hanno trasformato piazze pubbliche con soluzioni vegetali in contesti simili..."

EXCLUDE (negation) — detailed rules:
When the user explicitly negates something, use the "exclude" object. There are three distinct exclusion types:

a) EXCLUDE COUNTRY — "not in Italy", "exclude Italian projects", "no projects from France":
   → exclude.country = "Italy" (or "France")
   → Do NOT also set country in the positive filters
   Example: "green roofs not in Italy" → country: null, exclude: { categories: [], city: null, country: "Italy" }

b) EXCLUDE CITY — "exclude Milan", "not from Barcelona", "no projects in Paris":
   → exclude.city = "Milan" (or "Barcelona", "Paris")
   → Do NOT also set city in the positive filters
   Example: "rain gardens, but not in Milan" → city: null, exclude: { categories: [], city: "Milan", country: null }

c) EXCLUDE CATEGORIES — "no green roofs", "without rain gardens", "projects that don't use permeable paving", "not educational", "no small projects":
   → exclude.categories = [{ key: "<filter_key>", values: ["<value1>", "<value2>"] }]
   → Identify the correct filter key and the specific values to exclude
   → You can exclude from ANY filter category (core, A, B, C, D)
   Example: "community gardens without green roofs" → exclude: { categories: [{ key: "d4_roof_facade", values: ["Extensive green roofs", "Intensive green roofs"] }], city: null, country: null }
   Example: "large projects, not educational" → exclude: { categories: [{ key: "a6_uses", values: ["Educational"] }], city: null, country: null }

d) COMBINING multiple exclusions:
   → You can set all three at once if the user negates multiple things
   Example: "community gardens not in Italy and without green roofs"
   → d6_urban_spaces: ["Community gardens"]
   → exclude: { categories: [{ key: "d4_roof_facade", values: ["Extensive green roofs", "Intensive green roofs"] }], city: null, country: "Italy" }

Only set exclude fields when the user EXPLICITLY negates something. Leave as null / empty array otherwise.

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
- a3_2_open_spaces: ["Courtyard", "Entrance area", "Game field", "Green area (park / garden)", "Open paved space", "Parking area", "Residual space or widening", "Service yard or technical area", "Square", "Waterfront"]
- a3_3_infrastructures: ["Carriageway", "Cycle lane (dedicated)", "Cycle lane with sidewalk", "Disused railway or similar", "Drainage channel / urban ditch", "Footpath", "Overpass or viaduct", "Pedestrian street", "Road interchange or ramp", "Sidewalk", "Sidewalk on commercial axis", "Traffic island", "Tramway trackbed", "Underpass"]
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
- c1_2_funding: ["Crowdfunding", "Participatory budget", "Partnership", "Private funding", "Public funding"]
- c1_3_management: ["Collaboration agreement", "Private", "Public"]
- c2_actors: ["Age groups", "Artists", "Associations", "Citizens", "Committees", "Cultural centres", "Designers", "Entrepreneurs", "Facilitators", "Foundations", "Groups of citizens", "Local Association", "Neighbourhood councils", "Non-profit organizations", "Public institutions", "Research centres", "Residents", "Shopkeepers", "Students", "Universities", "Volunteers", "Vulnerable individuals"]
- c3_goals: ["Accessibility", "Biodiversity", "Care", "Climate change mitigation", "Environmental sustainability", "Intergenerational collaboration", "Knowledge", "Liveability", "New connections", "New perception", "New production", "Re-activation", "Re-appropriation", "Resilience", "Safety", "Sense of community", "Social inclusion", "Transformation", "Urban regeneration", "Valorisation"]
- c4_services: ["Access free to water", "Areas for meeting residents", "Areas with shade/cool spots", "Benches/rest areas", "Care and maintenance services", "Educational - leisure and cultural uses", "Monitoring and warning systems", "Online maps / informative materials", "Wi-fi connection"]

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

KEYWORDS:
- keywords = free-text terms capturing semantic intent beyond structured filters, fuzzy-searched against title/description/city/designer/innovations. Up to 10 terms.
- ALWAYS write keywords in ENGLISH, whatever the language of the user's message: the project texts are in English, so Italian/French/other words never match. Translate the user's concepts into the terms an English project description would use (e.g. "giardino della pioggia" → "rain garden", "ombra" → "shade", "ferrovia abbandonata" → "former railway", "cortile della scuola" → "schoolyard", "anziani" → "elderly"). Keep proper names (cities, project names) as written.
- Use keywords for concepts that don't map to any filter category, e.g. "playground", "elderly", "flooding", "depaving initiative".
- Set to null when all intent is captured by structured filters.`;

const ANALYZE_SYSTEM_PROMPT = `You are the TALEA Abacus analysis assistant. You help users understand why specific nature-based solution (NBS) projects match their search query.

TALEA is a European urban research project studying how nature-based solutions transform public spaces. The database contains different case studies from cities across the World.

When given a user query and a list of matching projects, provide a concise, insightful explanation of:
1. Why these projects are relevant to the query
2. Key commonalities between the matched projects
3. Notable differences or unique aspects of each project

LANGUAGE: ALWAYS respond in the SAME LANGUAGE as the user's query. If the user wrote in Italian, write your entire analysis in Italian. If in French, write in French. Match the language exactly.

PLACE-BASED QUERIES: If the user's query references a specific real-world site (e.g. "Piazza Perini a Mattarello"), explain how the matched projects relate to that site's characteristics and what practical lessons could be transferred.

Keep your response focused, informative, and under 300 words. Use plain language accessible to urban planners, researchers, and students.`;

const THINKING_PASS1_PROMPT = CHAT_SYSTEM_PROMPT + `

IMPORTANT — THINKING MODE (softer filtering):
You are in deep-thinking mode. Be MORE GENEROUS with filter selections:
- Use MORE optional keys and FEWER required keys to cast a wider net.
- If a concept is loosely related to a filter category, include it as optional.
- Set keywords generously — capture synonyms, related concepts, and sub-themes (always in English).
- Prefer multiple short scenarios over one strict one.
- The goal is to return 10-20 candidate projects, not to narrow precisely.
- For PLACE-BASED queries: be especially broad. Include multiple possible climate zones, urban area types, and open space types that could be relevant. NEVER filter by country/city just because the user mentioned a location — that would eliminate the best transferable precedents. Use several scenarios: one matching the exact inferred context, others matching related contexts or the specific NBS elements the user wants.`;

const THINKING_PASS2_SCHEMA = {
  type: 'object',
  required: ['top_projects', 'overall_analysis'],
  properties: {
    top_projects: {
      type: 'array',
      items: {
        type: 'object',
        required: ['candidate', 'relevance_score', 'explanation'],
        properties: {
          candidate: { type: 'integer' },
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

7. PLACE-BASED QUERIES: If the user's query references a specific real-world site (e.g. "I have a square in Mattarello that needs greening", "Piazza Perini needs more plants"), you MUST:
   - Use your knowledge to understand that place's actual characteristics (climate, scale, urban fabric, constraints).
   - Evaluate each candidate by how TRANSFERABLE and APPLICABLE its approach would be to that specific site. A project in Stockholm can score highly for a site in Trento if the spatial context and NBS approach are transferable.
   - In each explanation, explicitly state HOW that project's strategies could be adapted to the user's site — what would work, what would need adjustment, and why it's a relevant precedent.
   - In overall_analysis, include concrete recommendations for the user's specific site based on the selected projects.
   - Do NOT penalize projects for being in a different country — geographic distance is irrelevant; what matters is contextual similarity and transferability.

8. LANGUAGE: ALWAYS write your ENTIRE response (all explanations and overall_analysis) in the SAME LANGUAGE as the user's query. If the user writes in Italian, respond entirely in Italian. If in French, respond in French. Match the language exactly.

OUTPUT FORMAT (strict JSON schema):
- top_projects: Array of 0 to 3 objects, sorted by relevance_score descending. Each: { candidate (the number N of "Candidate N" in the list you received, as an integer), relevance_score (0-100), explanation (3-5 sentences with specific architectural/planning reasoning) }. Identify projects ONLY by their candidate number, and write each explanation about that candidate's own data.
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
    'Access-Control-Expose-Headers': 'X-RateLimit-Remaining, X-AI-Backup',
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

// Daily counters per visitor, in the D1 database (table "usage", rows kept 2 days).
// The visitor is identified by an HMAC of IP + day keyed with a worker secret: the IP is
// never stored, the value changes every day (visits cannot be linked across days) and,
// without the secret, it cannot be reversed by trying all IPs.
// If D1 fails the request is let through: Gemini's own quota still caps usage.
async function visitorKey(secret, ip, today) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(`talea-usage|${secret}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${today}|${ip}`));
  return [...new Uint8Array(mac)].slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
}

let usageTableReady = false;

async function checkRateLimit(env, ip, pathname, limit = DAILY_LIMIT) {
  const isSearch = SEARCH_START.has(pathname);
  if (!isSearch && !FOLLOW_UP.has(pathname)) return { allowed: true, remaining: -1 }; // not a Gemini call
  const db = env.AI_DB;
  if (!db) {
    console.error('AI_DB not bound: daily limit not applied');
    return { allowed: true, remaining: -1 };
  }
  const today = new Date().toISOString().slice(0, 10);
  try {
    const visitor = await visitorKey(env.GEMINI_API_KEY || '', ip, today);
    if (!usageTableReady) {
      await db.prepare(`CREATE TABLE IF NOT EXISTS usage (
        day TEXT NOT NULL, visitor TEXT NOT NULL,
        searches INTEGER NOT NULL DEFAULT 0, follow_ups INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, visitor))`).run();
      usageTableReady = true;
    }
    if (isSearch) {
      // one statement: new row, or +1 only while under the limit (no row back = limit reached)
      const row = await db.prepare(`INSERT INTO usage (day, visitor, searches, follow_ups) VALUES (?1, ?2, 1, 0)
        ON CONFLICT (day, visitor) DO UPDATE SET searches = searches + 1 WHERE searches < ?3
        RETURNING searches`).bind(today, visitor, limit).first();
      if (Math.random() < 0.02) {
        await db.prepare("DELETE FROM usage WHERE day < date('now', '-2 days')").run();
      }
      return row ? { allowed: true, remaining: Math.max(0, limit - row.searches) } : { allowed: false, remaining: 0 };
    }
    const row = await db.prepare(`UPDATE usage SET follow_ups = follow_ups + 1
      WHERE day = ?1 AND visitor = ?2 AND follow_ups < searches * ?3
      RETURNING searches`).bind(today, visitor, FOLLOW_UPS_PER_SEARCH).first();
    return row
      ? { allowed: true, remaining: Math.max(0, limit - row.searches) }
      : { allowed: false, remaining: 0, followUp: true };
  } catch (err) {
    console.error('Daily limit (D1) error:', err.message);
    return { allowed: true, remaining: -1 };
  }
}

// ---------------------------------------------------------------------------
// Gemini API call
// ---------------------------------------------------------------------------

// Until when the main model is skipped (per worker instance, best effort):
// set when Gemini says its free daily quota is used up.
let mainModelPausedUntil = 0;

function nextQuotaReset() {
  // Midnight Pacific ≈ 08:00 UTC (07:00 in summer: at worst one extra hour on the backup)
  const d = new Date();
  d.setUTCHours(8, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setUTCDate(d.getUTCDate() + 1);
  return d.getTime();
}

// Tries the main model, then the backup. Sets env.aiState.usedBackup when the
// backup answered, so the response can tell the visitor (without naming models).
const RETRY_WAIT_MS = 1500;
const GEMINI_TIMEOUT_MS = 25000;

async function callGemini(env, systemPrompt, userMessage, responseSchema = null, maxTokens = 2048, temperature = 0.3) {
  const models = Date.now() < mainModelPausedUntil ? [BACKUP_MODEL] : [MODEL, BACKUP_MODEL];
  // Overload (5xx) and empty answers are often momentary: after both models fail,
  // wait a moment and try them once more. A used-up quota (429) is not retried.
  const attempts = [...models];
  let retried = false;
  let lastError;
  const trail = []; // why each attempt failed, e.g. "main:503, backup:empty-MAX_TOKENS" (no content)
  for (let i = 0; i < attempts.length; i++) {
    const model = attempts[i];
    if (i === models.length) await new Promise(r => setTimeout(r, RETRY_WAIT_MS));
    try {
      const text = await callGeminiModel(env.GEMINI_API_KEY, model, systemPrompt, userMessage, responseSchema, maxTokens, temperature);
      if (model !== MODEL && env.aiState) env.aiState.usedBackup = true;
      return text;
    } catch (err) {
      lastError = err;
      trail.push(`${model === MODEL ? 'main' : 'backup'}:${err.status || err.reason || 'error'}`);
      err.trail = trail;
      if (!err.retryOther) throw err;           // e.g. safety block: the backup would not help
      if (model === MODEL && err.dailyQuota) mainModelPausedUntil = nextQuotaReset();
      if (model === MODEL && env.aiState) env.aiState.backupReason = String(err.status || err.reason || 'error');
      console.warn(`${model} unavailable (${err.status || err.reason}), trying next model`);
      const momentary = err.status >= 500 || String(err.reason || '').startsWith('empty');
      if (i === attempts.length - 1 && !retried && momentary) {
        retried = true;
        attempts.push(...(Date.now() < mainModelPausedUntil ? [BACKUP_MODEL] : [MODEL, BACKUP_MODEL]));
      }
    }
  }
  if (lastError.status === 429) {
    throw Object.assign(lastError, {
      status: lastError.dailyQuota ? 429 : 503,
      userMessage: lastError.dailyQuota
        ? 'The AI search has reached its daily limit. Please try again tomorrow, or use the regular search.'
        : 'The AI search is very busy right now. Please wait a minute and try again.',
    });
  }
  throw lastError;
}

async function callGeminiModel(apiKey, model, systemPrompt, userMessage, responseSchema, maxTokens, temperature = 0.3) {
  const url = `${GEMINI_URL}/${model}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [{
      role: 'user',
      parts: [{ text: userMessage }],
    }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
    },
  };

  if (responseSchema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = responseSchema;
  }

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    });
  } catch (err) {
    // no answer in time: the other model may answer (not retried again: the wait would be too long)
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      throw Object.assign(new Error(`Gemini timeout (${model})`), { retryOther: true, reason: 'timeout' });
    }
    throw Object.assign(err, { retryOther: true, reason: 'network' });
  }

  if (!res.ok) {
    const text = await res.text();
    throw Object.assign(new Error(`Gemini API error ${res.status} (${model}): ${text.slice(0, 500)}`), {
      status: res.status,
      // quota used up (429), model missing (404) or overloaded (5xx): the other model may work
      retryOther: res.status === 429 || res.status === 404 || res.status >= 500,
      dailyQuota: res.status === 429 && /PerDay/i.test(text),
    });
  }

  const data = await res.json();

  // Check for safety blocks or empty responses
  const candidate = data.candidates?.[0];
  if (!candidate || candidate.finishReason === 'SAFETY') {
    throw Object.assign(new Error('Response blocked by safety filter.'), { userMessage: 'Response blocked by safety filter. Try rephrasing your query.' });
  }
  if (!candidate.content?.parts?.[0]?.text) {
    throw Object.assign(new Error(`Empty response from Gemini API (${model}).`), { retryOther: true, reason: `empty-${candidate.finishReason || 'unknown'}` });
  }
  const text = candidate.content.parts[0].text;
  // A structured answer that is not valid JSON (e.g. cut off at the output limit) is useless:
  // the other model may answer properly.
  if (responseSchema) {
    try {
      JSON.parse(text);
    } catch {
      throw Object.assign(new Error(`Invalid JSON from Gemini API (${model}).`), { retryOther: true, reason: `bad-json-${candidate.finishReason || 'unknown'}` });
    }
  }
  return text;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

// Input limits. The biggest real request is the judge with 15-30 full case studies
// (about 6 KB each): 300 KB leaves room, anything bigger is refused before reading it all.
const MAX_BODY_CHARS = 300000;
const MAX_QUESTION_CHARS = 2000;

async function readJson(request) {
  const declared = Number(request.headers.get('Content-Length') || 0);
  const tooBig = () => Object.assign(new Error('Request too large'), { status: 413, userMessage: 'Request too large.' });
  if (declared > MAX_BODY_CHARS) throw tooBig();
  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) throw tooBig();
  try {
    const data = JSON.parse(text);
    if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  } catch { /* handled below */ }
  throw Object.assign(new Error('Invalid JSON'), { status: 400, userMessage: 'Invalid request.' });
}

const badQuestion = v => !v || typeof v !== 'string' || v.length > MAX_QUESTION_CHARS;

async function handleChat(request, env) {
  const { message } = await readJson(request);

  if (badQuestion(message)) {
    return new Response(JSON.stringify({ error: 'Missing or too long "message" field' }), { status: 400 });
  }

  const content = await callGemini(
    env,
    CHAT_SYSTEM_PROMPT,
    message,
    CHAT_RESPONSE_SCHEMA,
  );

  return new Response(content, {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleAnalyze(request, env) {
  const { query, projects, scenarios } = await readJson(request);

  if (badQuestion(query)) {
    return new Response(JSON.stringify({ error: 'Missing or too long "query" field' }), { status: 400 });
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
    env,
    systemPrompt,
    `User query: "${query}"\n\nMatching projects:\n\n${projectDescriptions}`,
  );

  return new Response(JSON.stringify({ analysis: content }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleThinkPass1(request, env) {
  const { message } = await readJson(request);

  if (badQuestion(message)) {
    return new Response(JSON.stringify({ error: 'Missing or too long "message" field' }), { status: 400 });
  }

  const content = await callGemini(
    env,
    THINKING_PASS1_PROMPT,
    message,
    CHAT_RESPONSE_SCHEMA,
  );

  return new Response(content, {
    headers: { 'Content-Type': 'application/json' },
  });
}

// Pass2 judge only needs core identity + narrative fields.
// The judge reads the whole factsheet: identity, texts, impacts, every tag
// (grouped by category, with a readable name) and the "Other (specify)" texts.
const JUDGE_KEEP = [
  'title', 'city', 'country', 'year', 'designer', 'promoter', 'size', 'climate_zone', 'talea_application',
  'description', 'physical_innovation', 'social_innovation', 'digital_innovation', 'c5_impacts',
];
const TAG_LABELS = {
  a1_urban_scale: 'A1 Urban scale', a2_urban_area: 'A2 Urban area', a3_1_buildings: 'A3.1 Buildings',
  a3_2_open_spaces: 'A3.2 Open spaces', a3_3_infrastructures: 'A3.3 Infrastructures', a4_ownership: 'A4 Ownership',
  a5_management: 'A5 Management', a6_uses: 'A6 Uses', a7_other: 'A7 Other context',
  b1_physical: 'B1 Physical constraints', b2_regulations: 'B2 Regulations', b3_uses_management: 'B3 Uses & management constraints',
  b4_public_opinion: 'B4 Public opinion', b5_synergy: 'B5 Synergies', b6_social_opportunities: 'B6 Social opportunities',
  c1_1_design: 'C1.1 Design process', c1_2_funding: 'C1.2 Funding', c1_3_management: 'C1.3 Management',
  c2_actors: 'C2 Actors', c3_goals: 'C3 Goals (stated aims)', c4_services: 'C4 Services',
  d1_plants: 'D1 Plants', d2_paving: 'D2 Paving', d3_water: 'D3 Water', d4_roof_facade: 'D4 Roof & facade',
  d5_furnishings: 'D5 Furnishings', d6_urban_spaces: 'D6 Urban spaces',
};
const isEmpty = v => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);

function minifyStudy(study) {
  const result = {};
  for (const key of JUDGE_KEEP) {
    if (!isEmpty(study[key])) result[key] = study[key];
  }
  const details = study.other_details || {};
  const tags = {};
  for (const [key, label] of Object.entries(TAG_LABELS)) {
    const values = Array.isArray(study[key]) ? [...study[key]] : [];
    // "Other" and texts written next to an option become "Option: text"
    const labelled = values.map(v => (details[key]?.[v] ? `${v}: ${details[key][v]}` : v));
    for (const [option, text] of Object.entries(details[key] || {})) {
      if (!values.includes(option)) labelled.push(`${option}: ${text}`);
    }
    if (labelled.length) tags[label] = labelled.join('; ');
  }
  if (Object.keys(tags).length) result.tags = tags;
  return result;
}

// Stateless: pass2 receives NO context from pass1
async function handleThinkPass2(request, env) {
  const { query, projects } = await readJson(request);

  if (badQuestion(query)) {
    return new Response(JSON.stringify({ error: 'Missing or too long "query" field' }), { status: 400 });
  }

  if (!Array.isArray(projects) || projects.length === 0 || projects.length > 15) {
    return new Response(JSON.stringify({ error: '"projects" must be an array of 1-15 items' }), { status: 400 });
  }

  // Candidates are numbered 1..N and the judge answers with that number, never with
  // an id or a title: an invented id can no longer point at the wrong project.
  const projectData = projects.map((p, i) =>
    `Candidate ${i + 1}:\n${JSON.stringify(minifyStudy(p), null, 0)}`
  ).join('\n\n');

  const content = await callGemini(
    env,
    THINKING_PASS2_PROMPT,
    `THE USER'S ORIGINAL REQUEST:\n"${query}"\n\n---\n\nCANDIDATE PROJECTS TO EVALUATE (${projects.length}):\n\n${projectData}`,
    THINKING_PASS2_SCHEMA,
    4096,
  );

  return new Response(JSON.stringify(resolveCandidates(JSON.parse(content), projects)), {
    headers: { 'Content-Type': 'application/json' },
  });
}

// Turns the judge's candidate numbers back into the projects that were sent.
// Numbers out of range and repeated numbers are dropped; id and title always
// come from the candidate itself, never from the model.
function resolveCandidates(result, projects, maxPicks = 3) {
  const seen = new Set();
  const picks = [];
  for (const p of result.top_projects || []) {
    const n = Number(p.candidate);
    if (!Number.isInteger(n) || n < 1 || n > projects.length || seen.has(n)) continue;
    seen.add(n);
    const project = projects[n - 1];
    // the judge's own fields, but id and title always come from the list it was sent
    picks.push({ ...p, candidate: n, id: String(project.id), title: project.title });
  }
  const kept = picks.slice(0, maxPicks);
  const pickedNumbers = new Set(kept.map(p => p.candidate));
  const alsoRelevant = [];
  for (const raw of Array.isArray(result.also_relevant) ? result.also_relevant : []) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1 || n > projects.length || pickedNumbers.has(n)) continue;
    const id = String(projects[n - 1].id);
    if (!alsoRelevant.includes(id)) alsoRelevant.push(id);
  }
  const { also_relevant: _ignored, ...rest } = result;
  return { ...rest, top_projects: kept, also_relevant_ids: alsoRelevant };
}

// Costs are written about only when the user asks: the judge sometimes adds "no case gives
// costs" anyway. Without cost words in the question, the sentences about costs are removed
// (a text made only of such sentences is kept as it is, to never leave it empty).
const COST_WORDS = /\b(costs?|costly|cost[oi]|costos?|coûts?|kosten|prices?|prezz[oi]|precios?|prix|budgets?|spes[ae]|gastos?|cheap|expensive|euro|eur)\b|€/i;
const sentences = text => String(text).split(/(?<=[.!?])\s+/);

function withoutCostTalk(result, question) {
  if (COST_WORDS.test(question)) return result;
  const strip = text => {
    if (typeof text !== 'string') return text;
    const kept = sentences(text).filter(s => !COST_WORDS.test(s));
    return kept.length ? kept.join(' ') : text;
  };
  return {
    ...result,
    overall_analysis: strip(result.overall_analysis),
    top_projects: (result.top_projects || []).map(p => ({
      ...p,
      explanation: strip(p.explanation),
      not_in_card: typeof p.not_in_card === 'string' && COST_WORDS.test(p.not_in_card) ? null : p.not_in_card,
    })),
  };
}

// ===========================================================================
// Pipeline v2 (F4): 1. understand → (browser: retrieve) → 3. judge
// ===========================================================================

// Tag vocabulary for the "understand" step, built from the filter schema above
// (fixed size: it does not grow with the number of cases).
const TAG_KEYS = Object.keys(TAG_LABELS).concat(['talea_application', 'size', 'climate_zone', 'innovation']);
const TAG_VOCABULARY = TAG_KEYS
  .map(k => `${k}: ${CHAT_RESPONSE_SCHEMA.properties[k].items.enum.join(' | ')}`)
  .join('\n');

// The same vocabulary with the meaning of each category and of the values that need one
// (src/data/filterDescriptions.json; D values: src/data/nbsDefinitions.json, the texts of
// the case card). OFF by default: turned on with the variable FILTER_DESCRIPTIONS = "on".
// Kept off until the TALEA team has confirmed them (status "approved") and the comparison
// shows they help: descriptions on only some filters may push the AI towards those filters.
const TAG_VOCABULARY_DESCRIBED = TAG_KEYS.map(k => {
  const values = CHAT_RESPONSE_SCHEMA.properties[k].items.enum;
  const category = filterDescriptions.categories[k]?.text;
  const own = filterDescriptions.values[k] || {};
  const meanings = values
    .map(v => {
      const text = own[v]?.text || (k.startsWith('d') ? nbsDefinitions[v] : null);
      return text ? `  - ${v}: ${text}` : null;
    })
    .filter(Boolean);
  return [`${k}${category ? ` (${category})` : ''}: ${values.join(' | ')}`, ...meanings].join('\n');
}).join('\n');

const vocabularyFor = env => (env.FILTER_DESCRIPTIONS !== 'on'
  ? `TAG VOCABULARY (key: values):\n${TAG_VOCABULARY}`
  : `TAG VOCABULARY (key (what the category records): values; below some values, their meaning). The descriptions say what a category or value means; they do not say what a single project achieved:\n${TAG_VOCABULARY_DESCRIBED}`);

const TAG_REF_SCHEMA = {
  type: 'object',
  required: ['key', 'value'],
  properties: {
    key: { type: 'string', enum: TAG_KEYS },
    value: { type: 'string' },
  },
};
const STRING_LIST = { type: 'array', items: { type: 'string' } };
// Required elements as groups: a case needs at least one tag of EVERY group
const REQUIRE_GROUPS_SCHEMA = {
  type: 'array',
  items: { type: 'object', required: ['any_of'], properties: { any_of: { type: 'array', items: TAG_REF_SCHEMA } } },
};

const UNDERSTAND_SCHEMA = {
  type: 'object',
  required: ['language', 'intent', 'catalogue_ops', 'reply', 'suggestions', 'summary', 'hard_constraints', 'alternatives', 'site', 'site_constraints', 'needs', 'tags_named', 'tags_inferred', 'search_terms_en'],
  properties: {
    language: { type: 'string' },
    intent: { type: 'string', enum: ['find_cases', 'catalogue_question', 'subjective', 'out_of_scope'] },
    catalogue_ops: { type: 'array', items: { type: 'string', enum: ['count', 'list', 'largest', 'smallest', 'newest', 'oldest'] } },
    reply: { type: 'string', nullable: true },
    suggestions: STRING_LIST,
    summary: { type: 'string' },
    // OR groups: a result must satisfy hard_constraints AND at least one alternative
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        required: ['label', 'country_include', 'city_include', 'year_min', 'year_max', 'require_tags'],
        properties: {
          label: { type: 'string' },
          country_include: STRING_LIST,
          city_include: STRING_LIST,
          year_min: { type: 'integer', nullable: true },
          year_max: { type: 'integer', nullable: true },
          require_tags: REQUIRE_GROUPS_SCHEMA,
        },
      },
    },
    hard_constraints: {
      type: 'object',
      required: ['country_include', 'country_exclude', 'city_include', 'city_exclude', 'year_min', 'year_max', 'year_mode', 'require_tags', 'exclude_tags'],
      properties: {
        country_include: STRING_LIST,
        country_exclude: STRING_LIST,
        city_include: STRING_LIST,
        city_exclude: STRING_LIST,
        year_min: { type: 'integer', nullable: true },
        year_max: { type: 'integer', nullable: true },
        year_mode: { type: 'string', enum: ['overlap', 'start', 'end'] },
        require_tags: REQUIRE_GROUPS_SCHEMA,
        exclude_tags: { type: 'array', items: TAG_REF_SCHEMA },
      },
    },
    site: { type: 'string', nullable: true },
    site_constraints: STRING_LIST,
    needs: STRING_LIST,
    tags_named: { type: 'array', items: TAG_REF_SCHEMA },
    tags_inferred: { type: 'array', items: TAG_REF_SCHEMA },
    search_terms_en: STRING_LIST,
  },
};

const UNDERSTAND_PROMPT = `You read a question about nature-based solutions (NBS) in public spaces and turn it into a search plan for a catalogue of case studies. The case texts and tags are in ENGLISH; the question may be in any language.

Return:
- language: ISO code of the question's language (e.g. "it", "en").
- intent: what kind of question it is.
  - "find_cases": the user looks for examples, ideas or solutions (most questions, even vague or badly written ones: "qualcosa di verde vicino casa", "progetti con i bambini").
  - "catalogue_question": a question about the catalogue itself, answered by counting or sorting the data: "how many projects in France?", "list the projects in Italy", "the largest and the smallest?", "the most recent ones". Put its conditions in hard_constraints (or alternatives), elements included as require_tags ("how many projects with green roofs" → require_tags: one group with d4_roof_facade: Extensive green roofs and Intensive green roofs).
  - "subjective": asks for a judgement of taste or a ranking with no criterion ("the most beautiful project", "the best one").
  - "out_of_scope": greetings, thanks, or questions that are not about NBS, public spaces or this catalogue.
- catalogue_ops: only for catalogue_question, the operations asked: count, list, largest, smallest, newest, oldest (e.g. "the largest and the smallest" → largest, smallest). Empty otherwise.
- reply: only for subjective and out_of_scope, 1-2 sentences IN THE QUESTION'S LANGUAGE. subjective: explain kindly that it depends on what the user needs, and ask what matters to them. out_of_scope: say briefly what this assistant does (finds case studies of nature-based solutions in public spaces, from a description of a place, a problem or a solution). Null otherwise.
- suggestions: only for subjective and out_of_scope, 3 short example questions IN THE QUESTION'S LANGUAGE the user could ask instead. You do not know what the catalogue contains: make them general (a kind of place, a problem or a solution, e.g. "how to cool a paved square in summer", "rain gardens in schoolyards"), never about a specific city, region or country. Empty otherwise.
- summary: 1-2 friendly sentences, IN THE QUESTION'S LANGUAGE, saying what you will look for.
- hard_constraints: ONLY what the user explicitly asks to restrict ("only projects in France", "not in Spain", "from 2016 on", "exclude projects with green roofs").
  - Countries and cities in English as commonly written (e.g. "Italy", "France", "Paris"; "Milano" → "Milan", "Torino" → "Turin", "München" → "Munich").
  - A place the user describes as THEIR site ("a small square in northern Italy", "my street in Bologna") is NOT a constraint: it goes in "site". We want transferable examples from anywhere.
  - year_mode: "start" if the user says started/begun, "end" if completed/finished, otherwise "overlap".
  - year_min and year_max are included in the range: "after 2018" / "dopo il 2018" → year_min 2019; "since 2018" / "from 2018" / "dal 2018" → 2018; "before 2018" / "prima del 2018" → year_max 2017; "until 2018" / "by 2018" / "entro il 2018" → 2018.
  - require_tags only when the user restricts the CATALOGUE to cases with a property: "in Mediterranean cities" → climate_zone: Mediterranean, "only large projects" → size: Large, and an element they REQUIRE with words like "only", "solo", "esclusivamente", "necessariamente", "must have", "both" ("only projects with rain gardens" → d3_water: Rain garden). require_tags is a list of groups (any_of): a case must have at least one tag of EVERY group. Tags that are alternatives for the same need go in ONE group ("green roofs", "extensive or intensive green roofs" → one group with both); elements the user wants together go in SEPARATE groups ("both rain gardens and detention basins", "sia rain garden sia bacini di detenzione" → two groups). A preference ("preferably", "meglio se", "ideally", or simply naming what they look for: "rain gardens in squares") is NOT a requirement: it goes in tags_named. Never for the user's own site ("my small square" is site, not a restriction; "solutions suited to the climate of Bologna" / "adatte al clima locale" describes the site: put it in site, never climate_zone in require_tags).
- alternatives: OR groups. hard_constraints apply to EVERY result; when the user asks for A OR B with different conditions ("projects in France or projects with green roofs", "squares in Italy, or car parks turned into gardens anywhere"), write one alternative per option, each with a short label IN THE QUESTION'S LANGUAGE and ONLY its own conditions (country_include, city_include, years, require_tags); conditions shared by all options stay in hard_constraints. A result must satisfy at least one alternative. Use 2-4 alternatives, or none (empty list) when the question has no OR between different conditions. Alternatives inside the same condition are not OR groups: "in France or Spain" → hard_constraints country_include: France, Spain. Also put the elements of every alternative in tags_named and search_terms_en, so the search finds them.
  - exclude_tags only for explicit exclusions of a feature, with EVERY value of that feature ("no green roofs" → d4_roof_facade: Extensive green roofs AND d4_roof_facade: Intensive green roofs). A limit of the user's site ("no space for trees", "pipes underground") is NOT an exclusion: put it in site_constraints.
- site: short English description of the user's site if they describe one (type of space, size, climate, context), else null. You may add what you deduce from a named place with your world knowledge, but mark it as an assumption, not a fact the user gave (e.g. "a square in Bologna (probably temperate climate, dense historic fabric)").
- site_constraints: English list of limits of the user's site and existing elements to keep or work around (e.g. "no space for trees", "low budget", "existing pine tree in the centre to keep", "car traffic around it").
- needs: English list of the distinct problems/goals the user wants solved, one short phrase each (e.g. "stormwater flooding after heavy rain", "shade for elderly people"), the MAIN one first. 0-4 items: empty when the user names no problem or goal (e.g. "projects in France since 2016", greetings); do not invent needs.
- tags_named: tags matching something the user EXPLICITLY wrote (an element, process, actor, space type). Use ONLY key/value pairs from the vocabulary below, values copied exactly.
- tags_inferred: tags you DEDUCE from the site or the needs (e.g. "the courtyard floods" → d2_paving: Permeable paving, d3_water: Rain garden). Helpful hints, not requirements. Max 12. Do not repeat tags_named.
- search_terms_en: 0-10 ENGLISH words or short phrases an English project description would contain: translate the user's concepts, add close synonyms ("giardino della pioggia" → "rain garden", "ferrovia abbandonata" → "former railway", "railway"). Keep proper names as written. Do not add the place of the user's own site (it is not what they look for). Empty when the question asks for nothing to find in the texts (e.g. only a country or years).

{{VOCABULARY}}`;

const JUDGE_MAX_PICKS = 5;
// Input cap for the judge, on everything sent to Gemini (about 4 characters per token):
// cards beyond it are not sent. Real cards are 3-6K characters; a bigger one is not a real case.
const JUDGE_MAX_INPUT_CHARS = 88000; // about 22,000 tokens
const JUDGE_MAX_CARD_CHARS = 12000;

const JUDGE_SCHEMA = {
  type: 'object',
  required: ['top_projects', 'also_relevant', 'overall_analysis'],
  properties: {
    also_relevant: { type: 'array', items: { type: 'integer' } },
    top_projects: {
      type: 'array',
      items: {
        type: 'object',
        required: ['candidate', 'relevance_score', 'needs_covered', 'explanation', 'not_in_card', 'site_fit'],
        properties: {
          candidate: { type: 'integer' },
          relevance_score: { type: 'integer' },
          needs_covered: STRING_LIST,
          explanation: { type: 'string' },
          not_in_card: { type: 'string', nullable: true },
          site_fit: { type: 'string', enum: ['compatible', 'partly', 'not_compatible', 'unknown'] },
        },
      },
    },
    overall_analysis: { type: 'string' },
  },
};

const JUDGE_MIN_SCORE = 60;
// Low: the same question should give the same picks and reasons
const JUDGE_TEMPERATURE = 0.15;

const JUDGE_PROMPT = `You are an expert in urban planning and nature-based solutions (NBS). You receive a user's question, a short interpretation of it, and a numbered list of candidate case studies (complete factsheets). Choose the candidates that really help the user.

Rules:
- Choose at most ${JUDGE_MAX_PICKS} candidates, best first. Choose ZERO if none really fits: an empty list is a correct and good answer, better than a weak suggestion.
- A pick must address the user's MAIN request (the question itself; in the interpretation, the first need). Be as specific as the question: for a specific request (a kind of place or intervention, e.g. "abandoned railway turned into a green path") sharing only a generic theme (biodiversity, cycling, greenery, water) is NOT enough; for a deliberately general question ("examples to support biodiversity", "ideas for a greener school") a case that clearly works on that theme is a good answer, do not reject it as too generic. Do not choose a case just because it is the best of a poor list: fewer picks are better than weak ones.
- Weigh the evidence in a factsheet for what it is: tags of sections A and B describe the site and its conditions at the start (a B tag documents a constraint or opportunity, not a result); C3 goals are aims stated by the project, not proof that a benefit was achieved; the name of a D element says what type of solution was built, not how well it worked here. Results are evidence only when the texts (description, innovations, C5 impacts) report them: write "aims to" for goals, and claim an effect only if the text reports it.
- relevance_score below ${JUDGE_MIN_SCORE} means the case does not really fit: do not choose it. When you choose nothing, say in overall_analysis that none of the cases examined matches the request and, if useful, what comes closest.
- Identify each pick ONLY by its candidate number N ("Candidate N"). Write about THAT candidate's own factsheet: never mix details from different candidates.
- Use your professional knowledge of NBS, not only matching words: check that the case fits the KIND of intervention asked (a temporary or tactical installation is not a permanent stormwater solution; a single rooftop garden is not a large ecological corridor; "for elderly people" needs evidence of accessibility or design for them), and its scale.
- ALTERNATIVES (OR groups in the interpretation): every candidate satisfies at least one of them. Choose the best cases overall, but cover each alternative that has good candidates (do not fill all picks with one alternative if another has strong cases).
- Respect the hard constraints, including required elements (require_tags, a list of groups: the case must have at least one tag of every group): a case without a required element must not be chosen. Distance does not matter: a case far from the user's site is a good precedent if its context and approach are transferable. When the user describes their site, prefer cases whose context is similar and say how the case could be adapted to it (e.g. keeping an existing tree). A site constraint (e.g. "no space for trees") does not exclude a case, but say whether the case is compatible with it (site_fit). site_fit is "compatible" or "partly" only when the factsheet shows how the case dealt with the same constraint (e.g. a B1 tag "Subsurface utilities", or a text saying the planting avoided the pipes); "not_compatible" only when the factsheet shows a conflict (e.g. the case relies on new trees and the user has no space for trees). Otherwise site_fit is "unknown": do not guess, and never claim something about the case (no deep digging, no underground works…) that the factsheet does not say or contradicts. Site details marked as assumptions in the interpretation (e.g. "probably temperate climate") are not facts: do not reject a case because of them.
- relevance_score 0-100: how well the case answers the MAIN request (90+ = same kind of intervention and context; 70 = same intervention, different context; below ${JUDGE_MIN_SCORE} = only a generic theme in common). 80 or more only if the texts of the factsheet (not only its tags) show that the case deals with the main need. A temporary installation or pilot is at most ${JUDGE_MIN_SCORE} for a permanent need (e.g. flooding), unless the user asks for temporary or tactical solutions. Being in the same city as the user's site does not raise the score.
- needs_covered: which of the user's needs (copied from the interpretation) the case addresses.
- also_relevant: candidate numbers NOT chosen as picks that are still partly useful (same kind of place or intervention, or a key need covered, but weaker than the picks or beyond the ${JUDGE_MAX_PICKS} picks), best first. Empty if none. Not cases that share only a generic theme. They are shown as "other related cases".
- The visitor never sees the candidate numbers: in explanation and overall_analysis never write "Candidate N", "case 4" or lists of numbers; if you need to name a case, use its title.
- explanation: 1-2 short sentences IN THE USER'S LANGUAGE (see "language"): why this case is useful for the user, citing what the factsheet says. If it is only partly compatible with the site constraints, say so briefly. No repetition of the case title or city.
- not_in_card: in the user's language, only things the user EXPLICITLY asked about (e.g. costs, if they asked) that the factsheet does not say; null otherwise. Do not mention costs or areas unless the user asked. If the same thing is missing from ALL your picks, leave not_in_card null and say it once in overall_analysis.
- Never attribute to a case numbers, costs, areas, results or users that its factsheet does not report. General knowledge may explain how a solution works, but not facts about the case.
- overall_analysis: 1-3 sentences in the user's language: what you found overall and, if relevant, which part of the request the cases examined do not cover (the per-case reasons are shown separately). No generic praise ("excellent examples", "all these projects show…") and no statement about all the cases that you have not checked in each factsheet.
- You see only the cases closest to the question, not the whole catalogue: never say that the catalogue (or database) has no case of a kind; say "among the cases examined" / "tra i casi esaminati" (in the user's language).
- COSTS: never write about costs, prices, budgets or their absence from the catalogue, unless the user's question explicitly asks about cost or budget.`;

// ---------------------------------------------------------------------------
// Vectors (Workers AI, bge-m3: multilingual, so Italian questions meet English texts)
// ---------------------------------------------------------------------------

const EMBED_MODEL = '@cf/baai/bge-m3';
const EMBED_MAX_TEXTS = 20;
const EMBED_MAX_CHARS = 20000;

async function embedTexts(env, texts) {
  const out = await env.AI.run(EMBED_MODEL, { text: texts });
  if (!out || !Array.isArray(out.data) || out.data.length !== texts.length) {
    throw new Error('Unexpected embedding response');
  }
  return out.data;
}

const roundVector = v => v.map(x => Math.round(x * 1e5) / 1e5);

// Vector of the question. Optional: without it the site ranks without meaning.
// Waited together with Gemini, so it has its own time limit: a slow answer does not hold up
// the search (usually it takes well under a second). The nightly sync has no limit.
const QUESTION_EMBED_TIMEOUT_MS = 5000;

async function questionVectors(env, message) {
  if (!env.AI) return null;
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timeout after ${QUESTION_EMBED_TIMEOUT_MS} ms`)), QUESTION_EMBED_TIMEOUT_MS);
    });
    const [query] = await Promise.race([embedTexts(env, [message]), timeout]);
    return { model: EMBED_MODEL, query: roundVector(query) };
  } catch (err) {
    console.error('Question vectors failed:', err.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Used by the nightly sync (scripts/build-embeddings.js) to compute the vectors of the cases.
// Protected by the EMBED_SYNC_KEY secret; disabled when the secret is not set.
async function handleEmbedCases(request, env) {
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (!env.EMBED_SYNC_KEY || !env.AI) return json({ error: 'Not found' }, 404);
  const key = request.headers.get('X-Embed-Key') || '';
  if (!timingSafeEqual(key, env.EMBED_SYNC_KEY)) return json({ error: 'Forbidden' }, 403);
  const { texts } = await request.json().catch(() => ({}));
  if (!Array.isArray(texts) || texts.length === 0 || texts.length > EMBED_MAX_TEXTS
    || texts.some(t => typeof t !== 'string' || !t.trim() || t.length > EMBED_MAX_CHARS)) {
    return json({ error: `"texts" must be 1-${EMBED_MAX_TEXTS} non-empty strings of at most ${EMBED_MAX_CHARS} characters` }, 400);
  }
  return json({ model: EMBED_MODEL, vectors: await embedTexts(env, texts) });
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Anonymous question log (D1 database "talea-ai-log", binding AI_DB; same database as the daily counters)
// Stores only: day, question text, language, type of question (intent), selected case ids, number of candidates,
// whether the backup model answered. No IP, no identifier. Rows older than LOG_DAYS are deleted.
// Read it with: npx wrangler d1 execute talea-ai-log --remote --command "SELECT * FROM questions ORDER BY id DESC LIMIT 50"
// ---------------------------------------------------------------------------

const LOG_DAYS = 180;
let logTableReady = false;

async function logQuestion(env, row) {
  if (!env.AI_DB) return;
  try {
    if (!logTableReady) {
      await env.AI_DB.prepare(`CREATE TABLE IF NOT EXISTS questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, day TEXT NOT NULL, question TEXT NOT NULL,
        language TEXT, picks TEXT, candidates INTEGER, backup INTEGER, intent TEXT)`).run();
      // tables created before the "intent" column: add it once (fails harmlessly if present)
      await env.AI_DB.prepare('ALTER TABLE questions ADD COLUMN intent TEXT').run().catch(() => {});
      logTableReady = true;
    }
    await env.AI_DB.prepare('INSERT INTO questions (day, question, language, picks, candidates, backup, intent) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(new Date().toISOString().slice(0, 10), row.question.slice(0, 1000), row.language || null, row.picks || '',
        row.candidates || 0, row.backup ? 1 : 0, row.intent || 'find_cases')
      .run();
    if (Math.random() < 0.02) {
      await env.AI_DB.prepare("DELETE FROM questions WHERE day < date('now', ?)").bind(`-${LOG_DAYS} days`).run();
    }
  } catch (err) {
    console.error('Question log failed:', err.message);
  }
}

async function handleUnderstand(request, env) {
  const { message } = await readJson(request);
  if (badQuestion(message)) {
    return new Response(JSON.stringify({ error: 'Missing or too long "message" field' }), { status: 400 });
  }
  // Gemini and the question vector run at the same time
  const [content, vectors] = await Promise.all([
    callGemini(env, UNDERSTAND_PROMPT.replace('{{VOCABULARY}}', () => vocabularyFor(env)), message, UNDERSTAND_SCHEMA, 2048),
    questionVectors(env, message),
  ]);
  const plan = JSON.parse(content);
  plan._vectors = vectors;
  // Searches for cases are logged by the judge (with the selected cases); the others
  // (catalogue, subjective, off-topic questions) never reach it, so they are logged here.
  if (plan.intent && plan.intent !== 'find_cases' && env.ctx) {
    env.ctx.waitUntil(logQuestion(env, {
      question: message, language: plan.language, intent: plan.intent, backup: env.aiState?.usedBackup,
    }));
  }
  return new Response(JSON.stringify(plan), { headers: { 'Content-Type': 'application/json' } });
}

async function handleJudge(request, env) {
  const { query, understanding, projects } = await readJson(request);
  if (badQuestion(query)) {
    return new Response(JSON.stringify({ error: 'Missing or too long "query" field' }), { status: 400 });
  }
  if (!Array.isArray(projects) || projects.length === 0 || projects.length > 30) {
    return new Response(JSON.stringify({ error: '"projects" must be an array of 1-30 items' }), { status: 400 });
  }

  // Only the parts of the interpretation the judge uses, each with a size limit.
  const u = understanding && typeof understanding === 'object' ? understanding : {};
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
  const list = (v, n, max) => (Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, n).map(x => x.slice(0, max)) : []);
  const hard = JSON.stringify(u.hard_constraints ?? null);
  const alternatives = JSON.stringify(Array.isArray(u.alternatives) ? u.alternatives.slice(0, 4) : []);
  const interpretation = JSON.stringify({
    language: text(u.language, 20), site: text(u.site, 500), site_constraints: list(u.site_constraints, 10, 200),
    needs: list(u.needs, 10, 200), hard_constraints: hard.length <= 3000 ? JSON.parse(hard) : null,
    alternatives: alternatives.length <= 3000 ? JSON.parse(alternatives) : null,
  });

  // Cards in ranking order until the cap; the rest is not sent. A card that is too big is skipped.
  const head = `USER QUESTION:\n"${query}"\n\nINTERPRETATION:\n${interpretation}\n\n`;
  const cards = [];
  const sent = [];
  let chars = JUDGE_PROMPT.length + head.length;
  for (const p of projects) {
    if (!p || typeof p !== 'object' || p.id == null) continue;
    const card = JSON.stringify(minifyStudy(p));
    if (card.length > JUDGE_MAX_CARD_CHARS) continue;
    const block = `Candidate ${cards.length + 1}:\n${card}`;
    if (chars + block.length + 2 > JUDGE_MAX_INPUT_CHARS) break;
    cards.push(block);
    sent.push(p);
    chars += block.length + 2;
  }
  if (cards.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid candidate' }), { status: 400 });
  }

  const content = await callGemini(
    env,
    JUDGE_PROMPT,
    `${head}CANDIDATES (${cards.length}):\n\n${cards.join('\n\n')}\n\nWrite explanation, not_in_card and overall_analysis in this language: ${text(u.language, 20) || 'the language of the user question'}.`,
    JUDGE_SCHEMA,
    8192, // room for the answer, also when the model reasons before writing it
    JUDGE_TEMPERATURE,
  );

  const result = withoutCostTalk(resolveCandidates(JSON.parse(content), sent, JUDGE_MAX_PICKS), query);
  result.candidates_sent = sent.length;
  const logRow = {
    question: query, language: u.language, picks: result.top_projects.map(p => p.id).join(','),
    candidates: sent.length, backup: env.aiState?.usedBackup,
  };
  if (env.ctx) env.ctx.waitUntil(logQuestion(env, logRow));
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
}

// ---------------------------------------------------------------------------
// Main fetch handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
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

    if (url.pathname === '/api/embed-cases') {
      try {
        return await handleEmbedCases(request, env);
      } catch (err) {
        console.error('/api/embed-cases failed:', err.message);
        return new Response(JSON.stringify({ error: 'Embedding failed' }), { status: 502, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (!isOriginAllowed(origin, env.ALLOWED_ORIGIN)) {
      return new Response(JSON.stringify({ error: 'Origin not allowed' }), {
        status: 403,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rateResult = await checkRateLimit(env, ip, url.pathname);
    if (!rateResult.allowed) {
      return new Response(JSON.stringify({
        error: rateResult.followUp
          ? 'This AI search can no longer be completed. Please start a new search.'
          : `Daily limit reached: you can make up to ${DAILY_LIMIT} AI searches per day.`,
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

    // Per-request copy of env: callGemini records here whether the backup model answered
    env = Object.assign(Object.create(env), { aiState: { usedBackup: false }, ctx });

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
      } else if (url.pathname === '/api/understand') {
        response = await handleUnderstand(request, env);
      } else if (url.pathname === '/api/judge') {
        response = await handleJudge(request, env);
      } else {
        response = new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      }

      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(cors)) {
        headers.set(k, v);
      }
      headers.set('X-RateLimit-Remaining', String(rateResult.remaining));
      if (env.aiState.usedBackup) headers.set('X-AI-Backup', '1');
      // why the main model was skipped (HTTP status or finish reason; no content)
      if (env.aiState.backupReason) headers.set('X-AI-Backup-Reason', env.aiState.backupReason);

      return new Response(response.body, {
        status: response.status,
        headers,
      });
    } catch (err) {
      // Full details stay in the worker log; the visitor gets a short message
      // (Gemini's raw error text is not passed on).
      console.error(`${url.pathname} failed:`, err.message, err.trail ? `(${err.trail.join(', ')})` : '');
      const safe = err.userMessage || 'The AI service is temporarily unavailable. Please try again later.';
      // reason: short code of what went wrong in each attempt, for diagnosis (no content, no model name)
      const reason = err.trail ? err.trail.join(', ') : String(err.status || err.reason || 'error');
      return new Response(JSON.stringify({ error: safe, reason }), {
        status: err.userMessage && err.status ? err.status : 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
  },
};
