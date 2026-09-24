import fs from "node:fs";
import { readJson } from "../src/io.js";

for (const f of [
  "results/development_report.json",
  "results/holdout_report.json",
]) {
  if (!fs.existsSync(f)) {
    throw new Error(`Missing ${f}; evaluations must finish first`);
  }
}

const dev = readJson("results/development_report.json"),
  hold = readJson("results/holdout_report.json");
if (!dev.methods?.hybrid || !dev.methods?.fallback || !hold.methods) {
  throw new Error("Evaluation reports do not contain measured method results");
}
const names = {
    substring: "A. Substring",
    lexical: "B. Lexical",
    lexicalAliases: "C. Lexical + aliases",
    vector: "D. Vector",
    hybrid: "E. Always hybrid",
    fallback: "F. Fallback",
  },
  pct = (x) => `${(100 * x).toFixed(1)}%`;
let md =
  "# Final report\n\n| Method | Hit@1 | Hit@3 | MRR | Query embedding rate | p50 (ms) | p95 (ms) |\n|---|---:|---:|---:|---:|---:|---:|\n";
for (const [k, v] of Object.entries(hold.methods))
  md += `| ${names[k]} | ${pct(v.hitAt1)} | ${pct(v.hitAt3)} | ${v.mrr.toFixed(3)} | ${pct(v.queryEmbeddingRate)} | ${v.p50LatencyMs.toFixed(2)} | ${v.p95LatencyMs.toFixed(2)} |\n`;
md += `\n## Reproducibility\n\n- Alias model: \`${hold.models.alias}\`\n- Embedding model: \`${hold.models.embedding}\`\n- RRF k: ${hold.settings.rrfK}\n- Frozen gate: \`${JSON.stringify(hold.settings.gate)}\`\n- Gate was selected using Development only.\n\n## Development\n\nAlways-hybrid Hit@1: ${pct(dev.methods.hybrid.hitAt1)}; fallback Hit@1: ${pct(dev.methods.fallback.hitAt1)}; fallback embedding rate: ${pct(dev.methods.fallback.queryEmbeddingRate)}.\n\n## Failure analysis\n\nDetailed per-query records are intentionally not persisted by the summary command. Re-run the pure evaluator against the frozen caches to classify representative failures without tuning the holdout configuration.\n`;
fs.writeFileSync("results/final_report.md", md);
console.log("Wrote results/final_report.md");
