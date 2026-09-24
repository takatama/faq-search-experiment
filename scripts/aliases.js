import fs from "node:fs";
import { GeminiAdapter, parseAliases } from "../src/gemini.js";
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
    : { version: 1, items: {}, runs: [] };
const model = process.env.GEMINI_ALIAS_MODEL || "gemini-2.5-flash-lite";
const pending = corpus.filter((x) => cache.items[x.id]?.model !== model);
if (!pending.length) {
  console.log("All aliases are cached.");
  process.exit(0);
}
const g = new GeminiAdapter();
for (let i = 0; i < pending.length; i += 20) {
  const batch = pending.slice(i, i + 20),
    parsed = parseAliases(
      await g.generateAliases(batch),
      batch.map((x) => x.id),
    );
  for (const x of parsed)
    cache.items[x.id] = {
      aliases: x.aliases,
      model,
      generatedAt: new Date().toISOString(),
      conditions: {
        sourceFields: ["question", "answer", "category"],
        count: 5,
      },
    };
  writeJsonAtomic(file, cache);
}
cache.runs.push({
  model,
  generatedAt: new Date().toISOString(),
  apiRequests: g.requests,
  usageMetadata: g.usage,
});
writeJsonAtomic(file, cache);
console.log(
  `Generated ${pending.length} FAQ alias sets with ${g.requests} API requests (${model}).`,
);
