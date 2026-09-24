// Shared by Apps Script and Node tests. No platform-specific dependencies.
var FaqVector = (function () {
  function normalize(values, dimensions) {
    if (!Array.isArray(values) || values.length < dimensions)
      throw new Error("Vector dimensions invalid");
    var out = values.slice(0, dimensions),
      squared = 0;
    for (var i = 0; i < out.length; i++) {
      if (!Number.isFinite(out[i])) throw new Error("Vector values invalid");
      squared += out[i] * out[i];
    }
    if (!squared) throw new Error("Zero vector");
    var norm = Math.sqrt(squared);
    return out.map(function (x) {
      return x / norm;
    });
  }
  function search(index, queryEmbedding, limit) {
    var q = normalize(queryEmbedding, index.dimensions);
    var ranked = index.faqs.map(function (faq) {
      if (faq.embedding.length !== index.dimensions)
        throw new Error("FAQ vector dimensions invalid");
      var score = 0;
      for (var i = 0; i < q.length; i++) score += q[i] * faq.embedding[i];
      return { id: faq.id, score: score };
    });
    ranked.sort(function (a, b) {
      return b.score - a.score || String(a.id).localeCompare(String(b.id));
    });
    return ranked.slice(0, limit || 3);
  }
  return { normalize: normalize, search: search };
})();
