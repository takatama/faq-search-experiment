var StudioCore = (function () {
  function list(value) {
    return String(value || "")
      .split("\n")
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }
  function plan(index, rows) {
    var seen = {},
      changes = [];
    rows.forEach(function (row, offset) {
      if (row[7] !== "承認") return;
      var id = String(row[0]),
        faq = index.faqs.find(function (f) {
          return String(f.id) === id;
        });
      if (!faq || seen[id])
        throw new Error("承認済みIDが不明または重複: " + id);
      seen[id] = true;
      if (row[1] !== faq.question)
        throw new Error("原文の質問が変更されています: " + id);
      var searchQuestion = String(row[2] || "").trim(),
        aliases = list(row[3]);
      if (
        !searchQuestion ||
        searchQuestion.length > 2000 ||
        aliases.length > 20
      )
        throw new Error("検索用質問または言い換えが不正: " + id);
      if (
        list(row[4]).some(function (quote) {
          return (faq.question + "\n" + faq.answer).indexOf(quote) < 0;
        })
      )
        throw new Error("識別条件の引用が原文にありません: " + id);
      var next = Object.assign({}, faq, {
        searchQuestion: searchQuestion,
        aliases: aliases,
        conditions: list(row[4]),
        reviewNotes: String(row[5] || ""),
      });
      var changed =
        searchQuestion !== (faq.searchQuestion || faq.question) ||
        JSON.stringify(aliases) !== JSON.stringify(faq.aliases || []) ||
        JSON.stringify(next.conditions) !==
          JSON.stringify(faq.conditions || []) ||
        next.reviewNotes !== (faq.reviewNotes || "");
      changes.push({
        rowNumber: offset + 2,
        id: id,
        next: next,
        changed: changed,
        needsEmbedding: searchQuestion !== (faq.searchQuestion || faq.question),
      });
    });
    return changes;
  }
  function apply(index, changes, embeddings, version) {
    var next = Object.assign({}, index, {
      version: version,
      faqs: index.faqs.slice(),
    });
    changes.forEach(function (c) {
      var faq = Object.assign({}, c.next);
      if (c.needsEmbedding) {
        var e = embeddings[c.id];
        if (
          !Array.isArray(e) ||
          e.length !== index.dimensions ||
          e.some(function (v) {
            return !Number.isFinite(v);
          }) ||
          !e.some(function (v) {
            return v !== 0;
          })
        )
          throw new Error("Embeddingが不正: " + c.id);
        faq.embedding = e;
      }
      next.faqs[
        next.faqs.findIndex(function (f) {
          return String(f.id) === c.id;
        })
      ] = faq;
    });
    return next;
  }
  return { plan: plan, apply: apply };
})();
