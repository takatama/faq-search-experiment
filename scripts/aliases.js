import fs from "node:fs";
import { GeminiAdapter, parseAliases } from "../src/gemini.js";
import { hashText } from "../src/cache.js";
import {
  readJson,
  writeJsonAtomic,
  rows,
  faqId,
  question,
  answer,
  category,
  requireFile,
} from "../src/io.js";
const corpus = rows(readJson(requireFile("data/corpus.json")), [
  "faqs",
  "corpus",
]).map((x) => ({
  id: faqId(x),
  question: question(x),
  answer: answer(x),
  category: category(x),
}));
const file = "data/cache/aliases.json",
  cache = fs.existsSync(file)
    ? readJson(file)
    : { version: 2, items: {}, runs: [] };
const model = process.env.GEMINI_ALIAS_MODEL || "gemini-3.5-flash-lite";
const conditions = {
  version: 2,
  sourceFields: ["question", "answer", "category"],
  count: 5,
};
const pending = corpus.filter((x) => {
  const c = cache.items[x.id];
  return (
    c?.model !== model ||
    c.inputHash !== hashText(JSON.stringify(x)) ||
    JSON.stringify(c.conditions) !== JSON.stringify(conditions)
  );
});
const g = new GeminiAdapter();
for (let i = 0; i < pending.length; i += 20) {
  const batch = pending.slice(i, i + 20),
    before = g.requests,
    start = Date.now();
  try {
    const parsed = parseAliases(
      await g.generateAliases(batch),
      batch.map((x) => x.id),
    );
    for (const x of parsed)
      cache.items[x.id] = {
        aliases: x.aliases,
        model,
        inputHash: hashText(JSON.stringify(batch.find((f) => f.id === x.id))),
        generatedAt: new Date().toISOString(),
        conditions,
      };
    cache.runs.push({
      model,
      generatedAt: new Date().toISOString(),
      inputs: batch.length,
      apiRequests: g.requests - before,
      apiTimeMs: Date.now() - start,
      usageMetadata: g.usage.splice(0),
    });
    writeJsonAtomic(file, cache);
    console.log(
      `Aliases cached: ${Math.min(i + 20, pending.length)}/${pending.length}; requests=${g.requests}`,
    );
  } catch (e) {
    cache.runs.push({
      model,
      generatedAt: new Date().toISOString(),
      failed: true,
      apiRequests: g.requests - before,
    });
    writeJsonAtomic(file, cache);
    console.error(e.message);
    process.exit(1);
  }
}
console.log(
  `Generated ${pending.length} FAQ alias sets; HTTP requests=${g.requests}; model=${model}`,
);
