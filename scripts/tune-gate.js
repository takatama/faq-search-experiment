import { evaluate } from "../src/evaluate.js";
import { loadExperiment } from "./lib.js";
import { candidates } from "../src/gate.js";
import { writeJsonAtomic } from "../src/io.js";
const input = loadExperiment("development", { requireGate: false });
let best = null;
for (const gate of candidates()) {
  const out = evaluate({ ...input, config: { ...input.config, gate } }),
    gap = out.hybrid.hitAt1 - out.fallback.hitAt1;
  if (gap <= 0.01 + 1e-12) {
    const x = {
      gate,
      rate: out.fallback.queryEmbeddingRate,
      hitAt1: out.fallback.hitAt1,
      hybridHitAt1: out.hybrid.hitAt1,
    };
    if (!best || x.rate < best.rate) best = x;
  }
}
if (!best)
  throw new Error(
    "No gate is within one percentage point of always-hybrid on development",
  );
writeJsonAtomic("config/experiment.json", {
  ...input.config,
  gate: best.gate,
  status: "frozen",
  tunedOn: "development",
  tunedAt: new Date().toISOString(),
  selection: {
    priority: [
      "within 1 percentage point of hybrid Hit@1",
      "minimum vector call rate",
      "simplest rule",
    ],
    ...best,
  },
});
console.log(`Frozen development gate; logical vector rate=${best.rate}`);
