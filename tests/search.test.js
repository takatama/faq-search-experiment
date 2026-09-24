import test from "node:test";
import assert from "node:assert/strict";
import { normalize, ngrams } from "../src/normalize.js";
import { buildLexicalIndex, searchLexical } from "../src/lexical.js";
import { searchVector, rrf } from "../src/vector.js";
import { needsVector } from "../src/gate.js";
import { metrics } from "../src/metrics.js";
test("normalization and ngrams are deterministic", () => {
  assert.equal(normalize(" 住民票（写し） "), "住民票写し");
  assert.deepEqual(ngrams("abc", 2, 2), ["ab", "bc"]);
});
test("lexical, vector, and RRF return ranked results", () => {
  const idx = buildLexicalIndex([
    { id: "a", text: "住民票の写し" },
    { id: "b", text: "粗大ごみ" },
  ]);
  assert.equal(searchLexical(idx, "住民票")[0].id, "a");
  assert.equal(
    searchVector(
      [
        { id: "a", embedding: [1, 0] },
        { id: "b", embedding: [0, 1] },
      ],
      [0, 1],
    )[0].id,
    "b",
  );
  assert.equal(rrf([[{ id: "a" }], [{ id: "a" }, { id: "b" }]])[0].id, "a");
});
test("gate combines signals and exact alias bypasses vector", () => {
  const gate = { minTop1: 0.3, minMargin: 0.1, minCoverage: 0.5, minLength: 3 };
  assert.equal(
    needsVector(
      { exactAlias: true, top1: 0, margin: 0, coverage: 0, length: 1 },
      gate,
    ),
    false,
  );
  assert.equal(
    needsVector(
      { exactAlias: false, top1: 0.8, margin: 0.2, coverage: 0.9, length: 5 },
      gate,
    ),
    false,
  );
  assert.equal(
    needsVector(
      { exactAlias: false, top1: 0.8, margin: 0.01, coverage: 0.9, length: 5 },
      gate,
    ),
    true,
  );
});
test("metrics computes retrieval measures", () => {
  const m = metrics([
    { rank: 1, queryType: "a", difficulty: "Easy", latencyMs: 1 },
    { rank: 2, queryType: "b", difficulty: "Hard", latencyMs: 3 },
    { rank: 0, queryType: "b", difficulty: "Hard", latencyMs: 2 },
  ]);
  assert.equal(m.hitAt1, 1 / 3);
  assert.equal(m.hitAt3, 2 / 3);
  assert.equal(m.mrr, 0.5);
});
