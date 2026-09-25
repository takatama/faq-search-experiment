"""Run the pinned independent benchmark with Gemini Embedding 2, 768 dimensions.

Requires GEMINI_API_KEY and `pip install google-genai numpy`. The script never
prints the key. Its cache binds every vector to its exact prefixed input text.
"""
import collections
import gzip
import hashlib
import json
import math
import os
import pathlib
import sys
import time

import numpy as np
from google import genai
from google.genai import types

from independent_eval import BLOBS, corpus_question, load, score

MODEL = "gemini-embedding-2"
DIMS = 768
CACHE = pathlib.Path("independent-vectors.json.gz")


def vectorize(client, items):
    saved = json.loads(gzip.decompress(CACHE.read_bytes())) if CACHE.exists() else {}
    pending = [(key, text) for key, text in items if key not in saved]
    requests = 0
    for start in range(0, len(pending), 50):
        batch = pending[start:start + 50]
        contents = [types.Content(parts=[types.Part.from_text(text=text)]) for _, text in batch]
        for attempt in range(5):
            try:
                response = client.models.embed_content(
                    model=MODEL, contents=contents,
                    config=types.EmbedContentConfig(output_dimensionality=DIMS))
                requests += 1
                break
            except Exception:
                if attempt == 4:
                    raise
                time.sleep(min(60, 2 ** (attempt + 1)))
        if len(response.embeddings) != len(batch):
            raise ValueError("Embeddings count does not match batch")
        for (key, _), embedding in zip(batch, response.embeddings):
            values = embedding.values
            if len(values) != DIMS or not all(math.isfinite(x) for x in values):
                raise ValueError(f"Invalid embedding for {key}")
            saved[key] = values
        CACHE.write_bytes(gzip.compress(json.dumps(saved, separators=(',', ':')).encode()))
        print(f"Embedded {min(start + 50, len(pending))}/{len(pending)} new texts", flush=True)
    if set(saved) != {key for key, _ in items}:
        raise ValueError("Cache contains missing or unrelated input IDs")
    return saved, requests


def main():
    if not os.environ.get("GEMINI_API_KEY"):
        raise ValueError("GEMINI_API_KEY is required")
    corpus, _ = load("corpus.json", None)
    queries, _ = load("queries.json", None)
    qrels, _ = load("qrels.json", None)
    docs = sorted(corpus, key=int)
    qids = sorted(queries, key=int)
    def item(kind, key, text):
        digest = hashlib.sha256(f"{MODEL}:{DIMS}:{text}".encode()).hexdigest()
        return f"{kind}:{key}:{digest}", text
    items = [item("d", key, f"title: none | text: {corpus_question(corpus[key])}") for key in docs]
    items += [item("q", key, f"task: search result | query: {queries[key]}") for key in qids]
    saved, requests = vectorize(genai.Client(api_key=os.environ["GEMINI_API_KEY"]), items)
    array = np.array([saved[key] for key, _ in items], dtype=np.float32)
    array /= np.linalg.norm(array, axis=1)[:, None]
    vectors = array[:len(docs)]
    results = []
    for i, query_id in enumerate(qids):
        scores = vectors @ array[len(docs) + i]
        indices = np.argpartition(-scores, min(10, len(docs) - 1))[:10]
        top = [docs[j] for j in sorted(indices, key=lambda j: (-scores[j], docs[j]))]
        judgments = {str(k): int(v) for k, v in qrels[query_id].items()}
        results.append({"query_id": query_id, "top10": top,
                        "grade2": score(top, judgments, 2),
                        "grade1plus": score(top, judgments, 1)})
    summary = {}
    for level in ("grade2", "grade1plus"):
        selected = [r[level] for r in results if level == "grade1plus" or any(
            int(g) >= 2 for g in qrels[r["query_id"]].values())]
        summary[level] = {"n": len(selected), **{k: sum(x[k] for x in selected)
                                                for k in ("hit1", "hit3", "hit10")}}
    report = {"model": MODEL, "dimensions": DIMS,
              "query_prefix": "task: search result | query: {text}",
              "document_prefix": "title: none | text: {faq question}",
              "document_field": "FAQ question only", "new_api_calls": requests,
              "source_blobs": BLOBS, "summary": summary, "rankings": results}
    pathlib.Path("independent-vector-results.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({k: v for k, v in report.items() if k != "rankings"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
