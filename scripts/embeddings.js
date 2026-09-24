import { GeminiAdapter } from "../src/gemini.js";
import {
  loadCache,
  saveCache,
  hashText,
  validEmbedding,
} from "../src/cache.js";
import {
  readJson,
  rows,
  faqId,
  question,
  queryText,
  requireFile,
} from "../src/io.js";
const split = process.argv[2];
if (split && !["development", "holdout"].includes(split))
  throw new Error("Optional split must be development or holdout");
const model = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001",
  g = new GeminiAdapter();
async function create(kind, list, taskType) {
  const file = `data/cache/${kind}-embeddings.json`,
    cache = loadCache(file);
  cache.runs ??= [];
  const pending = list.filter(
      (x) =>
        !validEmbedding(cache.items[x.id], { model, taskType, text: x.text }),
    ),
    before = g.requests;
  for (let i = 0; i < pending.length; i += 100) {
    const batch = pending.slice(i, i + 100),
      data = await g.embed(
        batch.map((x) => x.text),
        taskType,
      );
    if (data.embeddings?.length !== batch.length)
      throw new Error("Embedding response count mismatch");
    batch.forEach((x, j) => {
      const embedding = data.embeddings[j].values;
      cache.items[x.id] = {
        id: x.id,
        model,
        taskType,
        dimensions: embedding.length,
        inputHash: hashText(x.text),
        embedding,
      };
    });
    saveCache(file, cache);
  }
  cache.runs.push({
    model,
    taskType,
    generatedAt: new Date().toISOString(),
    inputs: pending.length,
    apiRequests: g.requests - before,
    usageMetadata: g.usage,
  });
  saveCache(file, cache);
  return pending.length;
}
const corpus = rows(readJson(requireFile("data/corpus.json")), [
  "faqs",
  "corpus",
]).map((x) => ({ id: faqId(x), text: question(x) }));
let count = await create("faq", corpus, "RETRIEVAL_DOCUMENT");
for (const s of split ? [split] : ["development"]) {
  const qs = rows(readJson(requireFile(`data/${s}.json`)), [
    "queries",
    "items",
  ]).map((x, i) => ({
    id: String(x.id ?? x.query_id ?? `${s}-${i}`),
    text: queryText(x),
  }));
  count += await create(s, qs, "RETRIEVAL_QUERY");
}
console.log(
  `Embedded ${count} inputs with ${g.requests} HTTP requests (${model}).`,
);
