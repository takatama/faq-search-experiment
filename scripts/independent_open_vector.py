"""Keyless, fixed-model vector baseline for the independent localgovFAQ test."""
import gzip
import json
import pathlib

import numpy as np
import sentence_transformers
from sentence_transformers import SentenceTransformer

from independent_eval import BLOBS, corpus_question, load, score

MODEL = "intfloat/multilingual-e5-small"
REVISION = "ada7b62be30f82b0bc5da131b0477721c8fc14e9"


def main():
    corpus, _ = load("corpus.json", None)
    queries, _ = load("queries.json", None)
    qrels, _ = load("qrels.json", None)
    docs = sorted(corpus, key=int)
    qids = sorted(queries, key=int)
    model = SentenceTransformer(MODEL, revision=REVISION)
    documents = model.encode([f"passage: {corpus_question(corpus[k])}" for k in docs],
                             batch_size=64, normalize_embeddings=True, show_progress_bar=True)
    questions = model.encode([f"query: {queries[k]}" for k in qids],
                             batch_size=64, normalize_embeddings=True, show_progress_bar=True)
    records = []
    for i, qid in enumerate(qids):
        similarities = documents @ questions[i]
        indices = np.argsort(-similarities, kind="stable")[:10]
        top = [docs[j] for j in indices]
        judgments = {str(k): int(v) for k, v in qrels[qid].items()}
        records.append({"query_id": qid, "top10": top,
                        "grade2": score(top, judgments, 2),
                        "grade1plus": score(top, judgments, 1)})
    summary = {}
    for level in ("grade2", "grade1plus"):
        selected = [r[level] for r in records if level == "grade1plus" or any(
            int(g) >= 2 for g in qrels[r["query_id"]].values())]
        summary[level] = {"n": len(selected), **{k: sum(x[k] for x in selected)
                                                for k in ("hit1", "hit3", "hit10")}}
    report = {"model": MODEL, "revision": REVISION,
              "sentence_transformers_version": sentence_transformers.__version__,
              "query_prefix": "query: ", "document_prefix": "passage: ",
              "document_field": "FAQ question only", "source_blobs": BLOBS,
              "summary": summary, "rankings": records}
    pathlib.Path("independent-open-vector.json.gz").write_bytes(
        gzip.compress(json.dumps(report, ensure_ascii=False).encode(), mtime=0))
    print(json.dumps({k: v for k, v in report.items() if k != "rankings"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
