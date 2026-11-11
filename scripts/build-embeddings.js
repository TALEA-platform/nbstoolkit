/**
 * Builds the bge-m3 vectors of the case studies, used by the AI search to compare
 * the meaning of a question with each case (also across languages).
 *
 * Run by the nightly sync after sync-approved.js, and by hand when needed:
 *   EMBED_WORKER_URL=https://<worker> EMBED_SYNC_KEY=<key> node scripts/build-embeddings.js
 *
 * - One vector per case, from its narrative text (title, place, description,
 *   innovations, impacts, "Other" texts; tags are not included).
 * - Only new or changed cases are computed (a hash of the text is stored);
 *   vectors of removed cases are dropped.
 * - The vectors come from the TALEA worker (/api/embed-cases, Workers AI),
 *   protected by the EMBED_SYNC_KEY secret.
 * - If the worker is not configured or does not answer, the run does not fail:
 *   the AI search still works, ranking without meaning for the cases left out.
 *
 * Output: public/data/case-embeddings.json
 *   { model, dim, textVersion, cases: { "<id>": { h: "<text hash>", v: "<base64 float32>" } } }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CASES_FILE = path.join(ROOT, 'src/data/caseStudies.json');
const OUT_FILE = path.join(ROOT, 'public/data/case-embeddings.json');
const MODEL = '@cf/baai/bge-m3';
const TEXT_VERSION = 1; // bump when narrativeText changes: every vector is recomputed
const BATCH = 10;

// Same exclusions as the site's word search (src/utils/aiRetrieval.js)
const EMPTY_TEXT = /no evidence|^\s*(none|n\/a|-)\.?\s*$/i;

function narrativeText(study) {
  const parts = [
    study.title,
    [study.city, study.country].filter(Boolean).join(', '),
    study.description,
    study.physical_innovation,
    study.social_innovation,
    study.digital_innovation,
    study.c5_impacts,
  ];
  for (const texts of Object.values(study.other_details || {})) {
    if (texts && typeof texts === 'object') parts.push(...Object.values(texts));
  }
  return parts
    .filter(t => typeof t === 'string' && t.trim() && !EMPTY_TEXT.test(t))
    .join('\n')
    .slice(0, 18000);
}

const hashOf = text => crypto.createHash('sha1').update(`${TEXT_VERSION}|${MODEL}|${text}`).digest('hex').slice(0, 16);

function toBase64(vector) {
  return Buffer.from(new Float32Array(vector).buffer).toString('base64');
}

async function embed(texts) {
  const url = `${process.env.EMBED_WORKER_URL.replace(/\/$/, '')}/api/embed-cases`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Embed-Key': process.env.EMBED_SYNC_KEY },
        body: JSON.stringify({ texts }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`HTTP ${res.status} ${data.error || ''}`.trim());
      if (data.model !== MODEL || !Array.isArray(data.vectors) || data.vectors.length !== texts.length) {
        throw new Error('unexpected answer from the worker');
      }
      return data.vectors;
    } catch (err) {
      if (attempt === 3) throw err;
      console.warn(`  embedding attempt ${attempt} failed (${err.message}), retrying...`);
      await new Promise(r => setTimeout(r, 3000 * attempt));
    }
  }
  return null;
}

async function main() {
  const cases = JSON.parse(fs.readFileSync(CASES_FILE, 'utf8'));
  let store = { model: MODEL, dim: null, textVersion: TEXT_VERSION, cases: {} };
  if (fs.existsSync(OUT_FILE)) {
    const old = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
    if (old.model === MODEL && old.textVersion === TEXT_VERSION) store = old;
    else console.log('Model or text version changed: all vectors will be recomputed.');
  }

  const ids = new Set(cases.map(c => String(c.id)));
  const removed = Object.keys(store.cases).filter(id => !ids.has(id));
  for (const id of removed) delete store.cases[id];

  const texts = cases.map(c => ({ id: String(c.id), text: narrativeText(c) }));
  // a case whose texts were emptied keeps no vector
  for (const c of texts) if (!c.text && store.cases[c.id]) { delete store.cases[c.id]; removed.push(c.id); }
  const todo = texts.filter(c => c.text && store.cases[c.id]?.h !== hashOf(c.text));

  console.log(`Vectors: ${cases.length} cases, ${todo.length} to compute, ${removed.length} removed.`);

  let computed = 0;
  if (todo.length > 0) {
    if (!process.env.EMBED_WORKER_URL || !process.env.EMBED_SYNC_KEY) {
      console.warn('EMBED_WORKER_URL / EMBED_SYNC_KEY not set: new or changed cases get no vector.');
    } else {
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH);
        try {
          const vectors = await embed(batch.map(c => c.text));
          batch.forEach((c, j) => {
            store.cases[c.id] = { h: hashOf(c.text), v: toBase64(vectors[j]) };
            store.dim = vectors[j].length;
          });
          computed += batch.length;
        } catch (err) {
          console.warn(`  could not compute ${batch.map(c => c.id).join(', ')}: ${err.message}`);
        }
      }
    }
  }

  // A changed case whose new vector could not be computed must not keep the old one
  // (it would describe the old texts): it is searched by tags and words only until the next sync.
  const failed = todo.filter(c => store.cases[c.id] && store.cases[c.id].h !== hashOf(c.text));
  for (const c of failed) delete store.cases[c.id];
  const missing = todo.filter(c => !store.cases[c.id]).map(c => c.id);
  if (missing.length > 0) {
    console.warn(`  ${missing.length} case(s) without an up-to-date vector (searched by tags and words only): ${missing.join(', ')}`);
  }

  if (computed === 0 && removed.length === 0 && failed.length === 0) {
    console.log('Nothing to write.');
    return;
  }
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  // Sorted ids keep the git diff of the nightly sync small
  const sorted = Object.fromEntries(Object.keys(store.cases).sort((a, b) => a - b).map(id => [id, store.cases[id]]));
  fs.writeFileSync(OUT_FILE, JSON.stringify({ ...store, cases: sorted }) + '\n');
  console.log(`Written ${path.relative(ROOT, OUT_FILE)}: ${computed} computed, ${failed.length} outdated removed, ${Object.keys(sorted).length} vectors in total.`);
}

main().catch(err => {
  // Vectors are an improvement, not a requirement: never block the sync
  console.warn(`Vectors not updated: ${err.message}`);
});
