// Configure file IDs in Project Settings > Script properties. No credentials in code.
var FAQ_REQUESTS = 0;
function faqSettings_() {
  var p = PropertiesService.getScriptProperties();
  var dimensions = Number(p.getProperty("FAQ_DIMENSIONS") || "768");
  if ([768, 1536, 3072].indexOf(dimensions) < 0)
    throw new Error("FAQ_DIMENSIONS must be 768, 1536 or 3072");
  return { properties: p, dimensions: dimensions, model: "gemini-embedding-2" };
}
function loadFaqFile_(property, settings) {
  var id = settings.properties.getProperty(property);
  if (!id) throw new Error("Set script property: " + property);
  var start = Date.now();
  var text = DriveApp.getFileById(id).getBlob().getDataAsString("UTF-8");
  var readMs = Date.now() - start,
    parseStart = Date.now();
  var data = JSON.parse(text);
  if (
    data.model !== settings.model ||
    data.dimensions !== settings.dimensions ||
    data.schemaVersion !== 1
  )
    throw new Error("Data model, dimensions or schema differs");
  return {
    data: data,
    readMs: readMs,
    parseMs: Date.now() - parseStart,
    characters: text.length,
  };
}
function loadFaqIndex_(settings) {
  var file = loadFaqFile_(
    "FAQ_INDEX_" + settings.dimensions + "_FILE_ID",
    settings,
  );
  if (
    !Array.isArray(file.data.faqs) ||
    file.data.faqs.length !== 661 ||
    file.data.normalized !== true
  )
    throw new Error("FAQ index invalid");
  return file;
}
// No Gemini API requests. Measures full Drive read, JSON parse and local search.
function benchmarkFaq() {
  var totalStart = Date.now(),
    settings = faqSettings_();
  var index = loadFaqIndex_(settings);
  var queries = loadFaqFile_(
    "FAQ_DEV_" + settings.dimensions + "_FILE_ID",
    settings,
  );
  if (
    queries.data.split !== "development" ||
    queries.data.queries.length !== 90
  )
    throw new Error("Development queries required");
  var hits = 0,
    hit3 = 0,
    reciprocal = 0,
    timings = [],
    records = [];
  queries.data.queries.forEach(function (query) {
    var start = Date.now(),
      ranked = FaqVector.search(index.data, query.embedding, 3);
    timings.push(Date.now() - start);
    var rank =
      ranked.findIndex(function (x) {
        return x.id === query.expectedId;
      }) + 1;
    if (rank === 1) hits++;
    if (rank > 0) {
      hit3++;
      reciprocal += 1 / rank;
    }
    records.push({ id: query.id, predictedId: ranked[0].id, rank: rank });
  });
  timings.sort(function (a, b) {
    return a - b;
  });
  var result = {
    model: settings.model,
    dimensions: settings.dimensions,
    queries: 90,
    hits: hits,
    hitAt1: hits / 90,
    hitAt3: hit3 / 90,
    mrrAt3: reciprocal / 90,
    faqDriveReadMs: index.readMs,
    faqJsonParseMs: index.parseMs,
    queryDriveReadMs: queries.readMs,
    queryJsonParseMs: queries.parseMs,
    searchP50Ms: timings[45],
    searchP95Ms: timings[85],
    totalMs: Date.now() - totalStart,
    apiRequests: 0,
    timingResolutionMs: 1,
    records: records,
  };
  console.log(JSON.stringify(result));
  return result;
}
// One interactive query, with full FAQ loading on every invocation.
function searchFaq(query) {
  if (typeof query !== "string" || !query.trim() || query.length > 2000)
    throw new Error("Enter a query of 1-2000 characters");
  var totalStart = Date.now(),
    settings = faqSettings_(),
    index = loadFaqIndex_(settings);
  var apiStart = Date.now(),
    embedding = embedFaqQuery_(query, settings),
    apiMs = Date.now() - apiStart;
  var searchStart = Date.now(),
    ranked = FaqVector.search(index.data, embedding, 3);
  var searchMs = Date.now() - searchStart;
  return {
    results: ranked.map(function (x) {
      var faq = index.data.faqs.find(function (f) {
        return f.id === x.id;
      });
      return {
        id: x.id,
        score: x.score,
        question: faq.question,
        answer: faq.answer,
      };
    }),
    timings: {
      faqDriveReadMs: index.readMs,
      faqJsonParseMs: index.parseMs,
      embeddingApiMs: apiMs,
      searchMs: searchMs,
      totalMs: Date.now() - totalStart,
    },
    apiRequests: FAQ_REQUESTS,
  };
}
function embedFaqQuery_(query, settings) {
  var key = settings.properties.getProperty("GEMINI_API_KEY");
  if (!key) throw new Error("Set GEMINI_API_KEY in Script properties");
  var limit = Number(
    settings.properties.getProperty("MAX_GEMINI_REQUESTS") || "4",
  );
  if (!Number.isInteger(limit) || limit < 1 || limit > 200)
    throw new Error("MAX_GEMINI_REQUESTS must be 1-200");
  for (var attempt = 0; attempt < 4; attempt++) {
    if (FAQ_REQUESTS >= limit) throw new Error("Gemini request limit reached");
    FAQ_REQUESTS++;
    var response;
    try {
      response = UrlFetchApp.fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent",
        {
          method: "post",
          contentType: "application/json",
          headers: { "x-goog-api-key": key },
          muteHttpExceptions: true,
          payload: JSON.stringify({
            model: "models/gemini-embedding-2",
            outputDimensionality: settings.dimensions,
            content: {
              parts: [{ text: "task: search result | query: " + query }],
            },
          }),
        },
      );
    } catch (_) {
      throw new Error("Gemini network request failed");
    }
    var status = response.getResponseCode();
    if (status === 200) {
      var data;
      try {
        data = JSON.parse(response.getContentText());
      } catch (_) {
        throw new Error("Invalid Gemini JSON");
      }
      if (
        !data.embedding ||
        data.embedding.values.length !== settings.dimensions
      )
        throw new Error("Embedding dimensions differ");
      return FaqVector.normalize(data.embedding.values, settings.dimensions);
    }
    if ((status !== 429 && status < 500) || attempt === 3)
      throw new Error("Gemini HTTP " + status);
    Utilities.sleep(Math.min(8000, 500 * Math.pow(2, attempt)));
  }
}
