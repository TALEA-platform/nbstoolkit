// bge-m3 vectors of the case studies (public/data/case-embeddings.json, built by
// scripts/build-embeddings.js in the nightly sync). Loaded once, only when the AI search is used.
// Returns a Map id → Float32Array (unit length), or null if the file is missing.

let loading = null;

function decode(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return normalize(new Float32Array(bytes.buffer));
}

export function normalize(vector) {
  const v = Float32Array.from(vector);
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return v;
}

export function parseCaseEmbeddings(data) {
  if (!data || !data.cases) return null;
  const map = new Map();
  for (const [id, entry] of Object.entries(data.cases)) {
    if (entry && typeof entry.v === 'string') map.set(String(id), decode(entry.v));
  }
  return map.size > 0 ? { model: data.model, vectors: map } : null;
}

export function loadCaseEmbeddings() {
  if (!loading) {
    loading = fetch(`${process.env.PUBLIC_URL || ''}/data/case-embeddings.json`)
      .then(r => (r.ok ? r.json() : null))
      .then(parseCaseEmbeddings)
      .catch(() => null);
  }
  return loading;
}
