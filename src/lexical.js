import { normalize, ngrams } from "./normalize.js";

export function buildLexicalIndex(docs, { min = 2, max = 4 } = {}) {
  const tokenized = docs.map((d) => ({
    ...d,
    tokens: ngrams(d.text, min, max),
  }));
  const df = new Map();
  for (const d of tokenized)
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) || 0) + 1);
  const idf = new Map(
    [...df].map(([t, n]) => [t, Math.log((docs.length + 1) / (n + 1)) + 1]),
  );
  const vectors = tokenized.map((d) => ({
    ...d,
    vector: vector(d.tokens, idf),
  }));
  return { docs: vectors, idf, min, max };
}
function vector(tokens, idf) {
  const m = new Map();
  for (const t of tokens) if (idf.has(t)) m.set(t, (m.get(t) || 0) + 1);
  for (const [t, v] of m) m.set(t, v * idf.get(t));
  return m;
}
function cosine(a, b) {
  let dot = 0,
    aa = 0,
    bb = 0;
  for (const v of a.values()) aa += v * v;
  for (const v of b.values()) bb += v * v;
  for (const [k, v] of a) dot += v * (b.get(k) || 0);
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
export function searchLexical(index, query, limit = 3) {
  const qTokens = ngrams(query, index.min, index.max),
    q = vector(qTokens, index.idf),
    known = qTokens.filter((t) => index.idf.has(t)).length;
  return index.docs
    .map((d) => ({
      id: d.id,
      score: cosine(q, d.vector),
      exactAlias: (d.aliases || []).some(
        (a) => normalize(a) === normalize(query),
      ),
      coverage: qTokens.length ? known / qTokens.length : 0,
    }))
    .sort(
      (a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)),
    )
    .slice(0, limit);
}
export function searchSubstring(docs, query, limit = 3) {
  const q = normalize(query);
  return docs
    .map((d) => {
      const s = normalize(d.text);
      return {
        id: d.id,
        score: q && s === q ? 2 : q && (s.includes(q) || q.includes(s)) ? 1 : 0,
      };
    })
    .sort(
      (a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)),
    )
    .slice(0, limit);
}
