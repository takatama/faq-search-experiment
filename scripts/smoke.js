import { GeminiAdapter } from "../src/gemini.js";
const g = new GeminiAdapter({ maxRequests: 1 });
try {
  await g.embed(["smoke test"], "RETRIEVAL_QUERY");
  console.log(
    `Smoke test passed: HTTP request count=${g.requests}, model=${g.embeddingModel}`,
  );
} catch (e) {
  console.error(`Smoke test failed after ${g.requests} request: ${e.message}`);
  process.exitCode = 1;
}
