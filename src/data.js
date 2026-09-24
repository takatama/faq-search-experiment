import fs from "node:fs";
import {
  readJson,
  rows,
  faqId,
  question,
  queryText,
  expectedId,
} from "./io.js";
import { hashText } from "./cache.js";
export function loadData(split) {
  if (!["development", "holdout"].includes(split))
    throw new Error("Invalid split");
  const faqs = rows(readJson("data/corpus.json"), ["faqs", "corpus"]).map(
    (x) => ({ ...x, id: faqId(x), question: question(x) }),
  );
  const queries = rows(readJson(`data/${split}.json`), [
    "queries",
    "items",
  ]).map((x, i) => ({
    id: String(x.id ?? x.query_id ?? `${split}-${i}`),
    text: queryText(x),
    expectedId: expectedId(x),
    queryType: x.query_type ?? x.type,
    difficulty: x.difficulty,
  }));
  const n = split === "development" ? 90 : 360,
    ids = new Set(faqs.map((x) => x.id));
  if (
    faqs.length !== 661 ||
    ids.size !== 661 ||
    faqs.some((x) => !x.question.trim()) ||
    queries.length !== n ||
    new Set(queries.map((q) => q.id)).size !== n
  )
    throw new Error("Fixed data count or IDs invalid");
  const faqIds = new Set(queries.map((q) => q.expectedId));
  if (faqIds.size !== n / 3) throw new Error("Split FAQ count invalid");
  const assignment = readJson("data/split_assignment_v2.json");
  const expectedDifficulty =
    split === "development"
      ? { Easy: 9, Medium: 12, Hard: 9 }
      : { Easy: 36, Medium: 48, Hard: 36 };
  for (const id of faqIds) {
    const qs = queries.filter((q) => q.expectedId === id);
    if (
      !ids.has(id) ||
      qs.length !== 3 ||
      qs.some((q) => !q.text.trim()) ||
      new Set(qs.map((q) => q.queryType)).size !== 3 ||
      qs.some(
        (q) =>
          !["natural_paraphrase", "terse_search", "situation_gap"].includes(
            q.queryType,
          ),
      ) ||
      new Set(qs.map((q) => q.difficulty)).size !== 1 ||
      assignment[id]?.toLowerCase() !== split
    )
      throw new Error("Fixed split membership invalid");
  }
  for (const [level, count] of Object.entries(expectedDifficulty))
    if (
      new Set(
        queries.filter((q) => q.difficulty === level).map((q) => q.expectedId),
      ).size !== count
    )
      throw new Error("Fixed difficulty distribution invalid");
  return { faqs, queries };
}
export function fingerprints() {
  return Object.fromEntries(
    ["corpus", "development", "holdout", "split_assignment_v2"].map((n) => [
      n,
      hashText(fs.readFileSync(`data/${n}.json`, "utf8")),
    ]),
  );
}
