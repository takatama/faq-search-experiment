import test from "node:test";
import assert from "node:assert/strict";
import { GeminiAdapter, embeddingText } from "../src/gemini.js";
import { validEmbedding, hashText } from "../src/cache.js";
import { buildSearch, evaluate } from "../src/evaluate.js";
test("Embedding 2 formats retrieval inputs without unsupported taskType", async () => {
  let body;
  const g = new GeminiAdapter({
    apiKey: "fake",
    embeddingModel: "gemini-embedding-2",
    fetchImpl: async (u, i) => {
      body = JSON.parse(i.body);
      return {
        ok: true,
        json: async () => ({ embeddings: [{ values: [1] }] }),
      };
    },
  });
  await g.embed(["住民票"], "RETRIEVAL_QUERY");
  assert.equal(
    body.requests[0].content.parts[0].text,
    "task: search result | query: 住民票",
  );
  assert.equal("taskType" in body.requests[0], false);
  assert.equal(
    embeddingText("住民票", "RETRIEVAL_DOCUMENT", "gemini-embedding-2"),
    "title: none | text: 住民票",
  );
});
test("cache rejects changed model, text, task, dimensions and invalid values", () => {
  const opts = {
    model: "gemini-embedding-2",
    taskType: "RETRIEVAL_QUERY",
    text: "住民票",
    dimensions: 2,
  };
  const item = {
    model: opts.model,
    taskType: opts.taskType,
    inputHash: hashText(opts.text),
    requestTextHash: hashText(
      embeddingText(opts.text, opts.taskType, opts.model),
    ),
    dimensions: 2,
    embedding: [1, 0],
  };
  assert.ok(validEmbedding(item, opts));
  for (const patch of [
    { model: "other" },
    { taskType: "RETRIEVAL_DOCUMENT" },
    { text: "税金" },
    { dimensions: 3 },
  ])
    assert.equal(validEmbedding(item, { ...opts, ...patch }), false);
  assert.equal(validEmbedding({ ...item, embedding: [NaN, 0] }, opts), false);
});
test("fallback does not access embedding for confident query; metrics separate calls", () => {
  const input = {
    faqs: [
      { id: "a", question: "住民票" },
      { id: "b", question: "粗大ごみ" },
    ],
    aliases: { a: ["住民票"], b: ["大型ごみ"] },
    faqEmbeddings: { a: [1, 0], b: [0, 1] },
    queryEmbeddings: { q: [1, 0] },
    queries: [
      {
        id: "q",
        text: "住民票",
        expectedId: "a",
        queryType: "terse_search",
        difficulty: "Easy",
      },
    ],
    config: {
      questionWeight: 1,
      aliasWeight: 1,
      ngramMin: 2,
      ngramMax: 4,
      rrfK: 60,
      gate: { minTop1: 0.9, minMargin: 0.9, minCoverage: 1, minLength: 10 },
    },
  };
  const search = buildSearch(input);
  const result = search("fallback", "住民票", () => {
    throw new Error("must not embed");
  });
  assert.equal(result.list[0].id, "a");
  assert.equal(result.vectorCalled, false);
  const out = evaluate(input);
  assert.equal(out.fallback.queryEmbeddingCalls, 0);
  assert.equal(out.vector.queryEmbeddingCalls, 1);
  assert.equal(out.vector.cacheHits, 1);
  assert.equal(out.lexical.cacheHits, 0);
});
