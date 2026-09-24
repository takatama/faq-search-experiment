import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

test("exports can be rebuilt without overwriting a committed comparison", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "faq-apps-script-"));
  try {
    for (const dir of [
      "scripts",
      "src",
      "apps-script",
      "config",
      "data/cache",
      "results/dimensions-development-v1",
    ])
      fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), '{"type":"module"}');
    for (const file of [
      "scripts/prepare-apps-script.js",
      "apps-script/Vector.js",
      "src/metrics.js",
    ])
      fs.copyFileSync(file, path.join(root, file));
    fs.writeFileSync(
      path.join(root, "src/cache.js"),
      "export const hashText = text => String(text).length.toString(); export const validEmbedding = (item, expected) => item?.model === expected.model && item.taskType === expected.taskType && item.embedding?.length === 3072;",
    );
    fs.writeFileSync(
      path.join(root, "src/data.js"),
      'export const fingerprints = () => ({ corpus: "fixed" }); export const loadData = () => ({ faqs: [{ id: "f1", question: "Question", answer: "Answer" }], queries: [{ id: "q1", text: "Query", expectedId: "f1" }] });',
    );
    fs.writeFileSync(
      path.join(root, "src/io.js"),
      'import fs from "node:fs"; export const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));',
    );
    fs.writeFileSync(
      path.join(root, "scripts/lib.js"),
      'export const loadExperiment = () => { throw new Error("Comparison path must not run"); };',
    );
    fs.writeFileSync(
      path.join(root, "config/experiment.json"),
      JSON.stringify({
        status: "frozen",
        dataHashes: { corpus: "fixed" },
        embeddingModel: "test-model",
      }),
    );
    const embedding = [1, ...Array(3071).fill(0)];
    fs.writeFileSync(
      path.join(root, "data/cache/faq-embeddings.json"),
      JSON.stringify({
        items: {
          f1: {
            model: "test-model",
            taskType: "RETRIEVAL_DOCUMENT",
            embedding,
          },
        },
      }),
    );
    fs.writeFileSync(
      path.join(root, "data/cache/development-embeddings.json"),
      JSON.stringify({
        items: {
          q1: { model: "test-model", taskType: "RETRIEVAL_QUERY", embedding },
        },
      }),
    );
    const reportPath = path.join(
      root,
      "results/dimensions-development-v1/report.json",
    );
    fs.writeFileSync(reportPath, '{"frozen":true}');

    const run = spawnSync(
      process.execPath,
      ["scripts/prepare-apps-script.js"],
      { cwd: root, encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr);
    const index = JSON.parse(
      fs.readFileSync(
        path.join(root, "data/apps-script/faq-index-768.json"),
        "utf8",
      ),
    );
    const queries = JSON.parse(
      fs.readFileSync(
        path.join(root, "data/apps-script/development-768.json"),
        "utf8",
      ),
    );
    assert.equal(index.faqs[0].embedding.length, 768);
    assert.equal(queries.queries[0].embedding.length, 768);
    assert.equal(fs.readFileSync(reportPath, "utf8"), '{"frozen":true}');
    const comparison = spawnSync(
      process.execPath,
      ["scripts/prepare-apps-script.js", "--compare"],
      { cwd: root, encoding: "utf8" },
    );
    assert.notEqual(comparison.status, 0);
    assert.match(comparison.stderr, /refusing overwrite/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
