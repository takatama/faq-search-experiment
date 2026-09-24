import fs from "node:fs";
import { loadData, fingerprints } from "../src/data.js";
import {
  buildLexicalIndex,
  searchLexical,
  searchSubstring,
} from "../src/lexical.js";
import { metrics } from "../src/metrics.js";
import { writeJsonAtomic } from "../src/io.js";
const { faqs, queries } = loadData("development");
loadData("holdout");
const docs = faqs.map((x) => ({ id: x.id, text: x.question })),
  idx = buildLexicalIndex(docs);
const methods = {};
for (const name of ["substring", "lexical"])
  methods[name] = metrics(
    queries.map((q) => {
      const list =
          name === "substring"
            ? searchSubstring(docs, q.text)
            : searchLexical(idx, q.text),
        r = list.findIndex((x) => x.id === q.expectedId);
      return { ...q, rank: r < 0 ? 0 : r + 1 };
    }),
  );
const file = "results/baseline_development_v2.json";
if (!fs.existsSync(file))
  writeJsonAtomic(file, {
    fingerprints: fingerprints(),
    methods,
    note: "Holdout checked for structural validity only. No holdout retrieval evaluation.",
  });
console.log(
  JSON.stringify({
    counts: { corpus: faqs.length, development: queries.length, holdout: 360 },
    development: methods,
  }),
);
