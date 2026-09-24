import test from "node:test";
import assert from "node:assert/strict";
import { GeminiAdapter, parseAliases } from "../src/gemini.js";
test("uses API key header, batches embeddings and counts HTTP requests", async () => {
  let init;
  const g = new GeminiAdapter({
    apiKey: "secret",
    maxRequests: 1,
    sleep: async () => {},
    fetchImpl: async (u, i) => (
      (init = i),
      { ok: true, json: async () => ({ embeddings: [{ values: [1, 2] }] }) }
    ),
  });
  const x = await g.embed(["x"], "RETRIEVAL_QUERY");
  assert.equal(x.embeddings.length, 1);
  assert.equal(init.headers["x-goog-api-key"], "secret");
  assert.ok(!init.body.includes("secret"));
  assert.equal(g.requests, 1);
  await assert.rejects(
    () => g.embed(["y"], "RETRIEVAL_QUERY"),
    /limit reached/,
  );
});
test("retries 429 with a bounded attempt count", async () => {
  let calls = 0;
  const g = new GeminiAdapter({
    apiKey: "x",
    maxRequests: 4,
    sleep: async () => {},
    fetchImpl: async () => {
      calls++;
      return {
        ok: false,
        status: 429,
        json: async () => ({
          error: { status: "RESOURCE_EXHAUSTED", message: "quota" },
        }),
      };
    },
  });
  await assert.rejects(() => g.embed(["x"], "RETRIEVAL_QUERY"), /HTTP 429/);
  assert.equal(calls, 4);
});
test("validates structured alias IDs and count", () => {
  const data = {
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify([
                { id: "1", aliases: ["a", "b", "c", "d", "e"] },
              ]),
            },
          ],
        },
      },
    ],
  };
  assert.equal(parseAliases(data, ["1"])[0].aliases.length, 5);
  assert.throws(() => parseAliases(data, ["2"]), /validation/);
});
