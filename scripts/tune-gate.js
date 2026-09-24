import { evaluate } from "../src/evaluate.js";
import { loadExperiment } from "./lib.js";
import { candidates, needsVector } from "../src/gate.js";
import { writeJsonAtomic } from "../src/io.js";
import { fingerprints } from "../src/data.js";
import fs from "node:fs";
const input = loadExperiment("development", { requireGate: false });
if (input.config.status === "frozen")
  throw new Error("Settings already frozen; refusing retuning");
const file = "results/development_tuning.json";
if (fs.existsSync(file)) throw new Error("Tuning results already exist");
const weights = [1, 2, 3];
let chosen = null;
const weightResults = [];
for (const questionWeight of weights) {
  const config = {
    ...input.config,
    questionWeight,
    aliasWeight: 1,
    rrfK: 60,
    rrfDepth: 3,
    gate: { minTop1: 0, minMargin: 0, minCoverage: 0, minLength: 0 },
  };
  const out = evaluate({ ...input, config });
  weightResults.push({
    questionWeight,
    aliasWeight: 1,
    hybridHitAt1: out.hybrid.hitAt1,
    lexicalAliasesHitAt1: out.lexicalAliases.hitAt1,
  });
  if (!chosen || out.hybrid.hitAt1 > chosen.out.hybrid.hitAt1)
    chosen = { config, out };
}
let best = null;
const evaluated = [];
for (const gate of candidates()) {
  const complexity = Object.values(gate).filter((x) => x > 0).length;
  if (complexity < 2) continue;
  let calls = 0,
    hits = 0;
  for (let i = 0; i < input.queries.length; i++) {
    const h = chosen.out.hybrid.records[i],
      c = chosen.out.lexicalAliases.records[i];
    const call = needsVector(h.gateFeatures, gate);
    if (call) calls++;
    if ((call ? h : c).rank === 1) hits++;
  }
  const hitAt1 = hits / input.queries.length,
    gap = chosen.out.hybrid.hitAt1 - hitAt1;
  const row = {
    gate,
    calls,
    rate: calls / input.queries.length,
    hitAt1,
    gap,
    complexity,
  };
  evaluated.push(row);
  if (
    gap <= 0.01 + 1e-12 &&
    (!best ||
      calls < best.calls ||
      (calls === best.calls && complexity < best.complexity))
  )
    best = row;
}
const targetMet = Boolean(best);
if (!best)
  best = [...evaluated].sort(
    (a, b) => a.gap - b.gap || a.calls - b.calls || a.complexity - b.complexity,
  )[0];
writeJsonAtomic(file, {
  targetMet,
  weightResults,
  gateCandidates: evaluated,
  selected: best,
  note: "Only Development; RRF k=60 and depth=3 fixed; best hybrid weight, ties prefer smaller question weight; gate uses at least two nonzero signals; no holdout inspection",
});
if (!best) throw new Error("No gate candidates");
writeJsonAtomic("config/experiment.json", {
  ...chosen.config,
  gate: best.gate,
  status: "frozen",
  tunedOn: "development",
  tunedAt: new Date().toISOString(),
  dataHashes: fingerprints(),
  cacheHashes: input.cacheHashes,
  embeddingDimensions: 3072,
  embeddingInputFormat: "gemini-embedding-2 search prefix v1",
  selection: { targetMet, ...best, hybridHitAt1: chosen.out.hybrid.hitAt1 },
  modelChangeReason:
    "User explicitly selected gemini-embedding-2 and gemini-3.5-flash-lite; former alias model returned HTTP 404",
});
console.log(JSON.stringify({ weights: weightResults, selected: best }));
