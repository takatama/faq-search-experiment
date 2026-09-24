const BASE = "https://generativelanguage.googleapis.com/v1beta";
export class GeminiAdapter {
  constructor({
    apiKey = process.env.GEMINI_API_KEY,
    aliasModel = process.env.GEMINI_ALIAS_MODEL || "gemini-2.5-flash-lite",
    embeddingModel = process.env.GEMINI_EMBEDDING_MODEL ||
      "gemini-embedding-001",
    maxRequests = Number(process.env.MAX_GEMINI_REQUESTS || 200),
    fetchImpl = globalThis.fetch,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  } = {}) {
    if (!apiKey) throw new Error("GEMINI_API_KEY is required");
    if (!Number.isInteger(maxRequests) || maxRequests < 1)
      throw new Error("MAX_GEMINI_REQUESTS must be a positive integer");
    Object.assign(this, {
      apiKey,
      aliasModel,
      embeddingModel,
      maxRequests,
      fetchImpl,
      sleep,
      requests: 0,
      usage: [],
    });
  }
  async request(path, body) {
    if (this.requests >= this.maxRequests)
      throw new Error(
        `Gemini request limit reached (${this.maxRequests}); stopped before sending`,
      );
    let last;
    for (let attempt = 0; attempt < 4; attempt++) {
      if (this.requests >= this.maxRequests)
        throw new Error(
          `Gemini request limit reached (${this.maxRequests}); stopped before sending`,
        );
      this.requests++;
      let response;
      try {
        response = await this.fetchImpl(`${BASE}/${path}`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": this.apiKey,
          },
          body: JSON.stringify(body),
        });
      } catch (e) {
        throw new Error(`Gemini network error: ${e.message}`);
      }
      if (response.ok) {
        const data = await response.json();
        if (data.usageMetadata) this.usage.push(data.usageMetadata);
        return data;
      }
      const data = await response.json().catch(() => ({}));
      const code = data?.error?.status || "UNKNOWN";
      last = new Error(
        `Gemini HTTP ${response.status} (${code}): ${data?.error?.message || "request failed"}`,
      );
      if (response.status !== 429 && response.status < 500) throw last;
      if (attempt < 3) await this.sleep(Math.min(8000, 500 * 2 ** attempt));
    }
    throw last;
  }
  generateAliases(faqs) {
    const input = faqs.map((x) => ({
      id: x.id,
      question: x.question,
      answer: x.answer,
      category: x.category,
    }));
    const prompt = `自治体FAQごとに、意味と識別に必要な条件を保った短い検索aliasをちょうど5件作成してください。入力以外のテストqueryは使用禁止です。JSONのみ返してください。入力: ${JSON.stringify(input)}`;
    return this.request(`models/${this.aliasModel}:generateContent`, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            required: ["id", "aliases"],
            properties: {
              id: { type: "STRING" },
              aliases: {
                type: "ARRAY",
                minItems: 5,
                maxItems: 5,
                items: { type: "STRING" },
              },
            },
          },
        },
      },
    });
  }
  embed(contents, taskType) {
    return this.request(`models/${this.embeddingModel}:batchEmbedContents`, {
      requests: contents.map((text) => ({
        model: `models/${this.embeddingModel}`,
        content: { parts: [{ text }] },
        taskType,
      })),
    });
  }
}
export function parseAliases(data, expectedIds) {
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    throw new Error("Gemini alias response was not valid JSON");
  }
  if (!Array.isArray(rows))
    throw new Error("Gemini alias response must be an array");
  const expected = new Set(expectedIds.map(String)),
    seen = new Set();
  for (const row of rows) {
    row.id = String(row.id);
    if (
      !expected.has(row.id) ||
      seen.has(row.id) ||
      !Array.isArray(row.aliases) ||
      row.aliases.length !== 5 ||
      row.aliases.some((x) => typeof x !== "string" || !x.trim())
    )
      throw new Error("Gemini alias response failed ID/alias validation");
    seen.add(row.id);
  }
  if (seen.size !== expected.size)
    throw new Error("Gemini alias response omitted an FAQ ID");
  return rows;
}
