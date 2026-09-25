"""Verify the published post-hoc dimension rankings against local, ignored caches.

Requires numpy and the original 3072-dimensional FAQ/development/holdout caches.
This program is read-only. It never calls Gemini or updates frozen results.
"""
import hashlib
import gzip
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RESULT = json.loads(gzip.decompress((ROOT / "results/dimensions-additional.json.gz").read_bytes()))
DATA = ROOT / "data"
CACHE = DATA / "cache"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


for name, expected in RESULT["dataHashes"].items():
    assert sha(DATA / f"{name}.json") == expected, name
for name, expected in RESULT["queryCacheFileSha256"].items():
    assert sha(CACHE / f"{name}-embeddings.json") == expected, name
assert sha(CACHE / "faq-embeddings.json") == RESULT["faqCacheFileSha256"]
faq_items = json.loads((CACHE / "faq-embeddings.json").read_text())["items"]
ids = sorted(faq_items, key=int)
assert len(ids) == 661
all_vectors = np.array([faq_items[id]["embedding"] for id in ids], dtype=np.float64)
assert all_vectors.shape == (661, 3072)

for split in ("development", "holdout"):
    queries = json.loads((DATA / f"{split}.json").read_text())
    query_items = json.loads((CACHE / f"{split}-embeddings.json").read_text())["items"]
    assert len(queries) == len(query_items) == (90 if split == "development" else 360)
    for dimensions in (3072, 1536, 768, 384):
        docs = all_vectors[:, :dimensions]
        docs = docs / np.linalg.norm(docs, axis=1)[:, None]
        records = []
        for query in queries:
            item = query_items[query["query_id"]]
            vector = np.asarray(item["embedding"][:dimensions], dtype=np.float64)
            vector /= np.linalg.norm(vector)
            scores = docs @ vector
            # Match the original JavaScript ranking: score descending, ID as a string ascending.
            ranked = sorted(range(len(ids)), key=lambda i: (-scores[i], ids[i]))[:3]
            records.append({
                "queryId": query["query_id"],
                "expectedId": str(query["faq_id"]),
                "top3": [ids[i] for i in ranked],
            })
        expected_records = RESULT["rankings"][split][str(dimensions)]
        assert records == expected_records, f"{split} {dimensions}: rankings changed"
        summary = RESULT["methods"][split][str(dimensions)]
        assert sum(r["top3"][0] == r["expectedId"] for r in records) == summary["hitAt1"]
        assert sum(r["expectedId"] in r["top3"] for r in records) == summary["hitAt3"]
        print(f"{split} {dimensions}: Hit@1 {summary['hitAt1']}/{len(records)}, Hit@3 {summary['hitAt3']}/{len(records)} OK")
