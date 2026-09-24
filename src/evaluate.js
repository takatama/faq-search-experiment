import { performance } from "node:perf_hooks";
import {
  buildLexicalIndex,
  searchLexical,
  searchSubstring,
} from "./lexical.js";
import { searchVector, rrf } from "./vector.js";
import { features, needsVector } from "./gate.js";
import { metrics } from "./metrics.js";
const rank = (list, id) => {
  const i = list.findIndex((x) => String(x.id) === String(id));
  return i < 0 ? 0 : i + 1;
};
export function buildSearch({ faqs, aliases, faqEmbeddings, config }) {
  const base = faqs.map((x) => ({ id: x.id, text: x.question }));
  const aliasDocs = faqs.map((x) => ({
    id: x.id,
    text: `${Array(config.questionWeight).fill(x.question).join(" ")} ${Array(
      config.aliasWeight,
    )
      .fill(aliases[x.id] || [])
      .flat()
      .join(" ")}`,
    aliases: aliases[x.id] || [],
  }));
  const opts = { min: config.ngramMin, max: config.ngramMax };
  const lex = buildLexicalIndex(base, opts),
    lexAlias = buildLexicalIndex(aliasDocs, opts),
    vectors = faqs.map((x) => ({ id: x.id, embedding: faqEmbeddings[x.id] }));
  return function search(method, text, getEmbedding) {
    const start = performance.now();
    let lexicalMs = 0,
      vectorCalled = false,
      gateFeatures = null;
    const lexical = (index) => {
      const t = performance.now(),
        r = searchLexical(index, text, config.rrfDepth || 3);
      lexicalMs += performance.now() - t;
      return r;
    };
    const vector = () => {
      vectorCalled = true;
      return searchVector(vectors, getEmbedding(), config.rrfDepth || 3);
    };
    let list;
    if (method === "substring") {
      list = searchSubstring(base, text);
      lexicalMs = performance.now() - start;
    } else if (method === "lexical") list = lexical(lex);
    else if (method === "lexicalAliases") list = lexical(lexAlias);
    else if (method === "vector") list = vector();
    else {
      const c = lexical(lexAlias);
      gateFeatures = features(c, text);
      list =
        method === "hybrid" || needsVector(gateFeatures, config.gate)
          ? rrf([c, vector()], { k: config.rrfK })
          : c;
    }
    return {
      list: list.slice(0, 3),
      vectorCalled,
      gateFeatures,
      lexicalMs,
      latencyMs: performance.now() - start,
    };
  };
}
export function evaluate(input) {
  const search = buildSearch(input),
    methods = {};
  for (const name of [
    "substring",
    "lexical",
    "lexicalAliases",
    "vector",
    "hybrid",
    "fallback",
  ]) {
    const records = input.queries.map((q) => {
      let cacheHits = 0;
      const r = search(name, q.text, () => {
        cacheHits++;
        const e = input.queryEmbeddings[q.id];
        if (!e) throw new Error(`Missing query embedding ${q.id}`);
        return e;
      });
      return {
        id: q.id,
        text: q.text,
        expectedId: q.expectedId,
        queryType: q.queryType,
        difficulty: q.difficulty,
        rank: rank(r.list, q.expectedId),
        predictedId: r.list[0]?.id,
        top3: r.list,
        vectorCalled: r.vectorCalled,
        gateFeatures: r.gateFeatures,
        lexicalMs: r.lexicalMs,
        latencyMs: r.latencyMs,
        embeddingApiMs: 0,
        cacheHits,
      };
    });
    const calls = records.filter((x) => x.vectorCalled).length;
    methods[name] = {
      ...metrics(records),
      queryEmbeddingCalls: calls,
      queryEmbeddingRate: calls / records.length,
      queryTimeApiRequests: 0,
      cacheHits: records.reduce((n, r) => n + r.cacheHits, 0),
      lexicalTimeMs: records.reduce((n, r) => n + r.lexicalMs, 0),
      embeddingApiTimeMs: 0,
      totalSearchTimeMs: records.reduce((n, r) => n + r.latencyMs, 0),
      latencyMode:
        "cached embeddings; local search only; no cold API latency claim",
      records,
    };
  }
  return methods;
}
