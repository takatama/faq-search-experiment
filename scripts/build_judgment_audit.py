"""Create a blinded answer-judgment packet for corrected FAQ rankings.

The packet contains query and FAQ question/answer text, without method or
published relevance labels. The key holds query/document IDs and provenance.
Only the packet and key paths explicitly supplied by the caller are written.
"""
import argparse
import gzip
import json
import pathlib
import random

from independent_eval import corpus_question, load

SEED = 20260926


def read_json(path):
    with (gzip.open(path, "rt", encoding="utf-8") if path.suffix == ".gz"
          else path.open(encoding="utf-8")) as stream:
        return json.load(stream)


def by_id(rows):
    return {row["query_id"]: row for row in rows}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", type=pathlib.Path)
    parser.add_argument("--lexical", type=pathlib.Path, required=True)
    parser.add_argument("--e5", type=pathlib.Path, required=True)
    parser.add_argument("--gemini", type=pathlib.Path, required=True)
    parser.add_argument("--packet", type=pathlib.Path, required=True)
    parser.add_argument("--key", type=pathlib.Path, required=True)
    parser.add_argument("--sample-success", type=int, default=30)
    parser.add_argument("--all-eligible", action="store_true",
                        help="Include all grade-2 queries for a full re-judgment packet")
    args = parser.parse_args()
    corpus, _ = load("corpus.json", args.dataset_dir)
    queries, _ = load("queries.json", args.dataset_dir)
    qrels, _ = load("qrels.json", args.dataset_dir)
    lexical = read_json(args.lexical)["rankings"]
    rankings = {
        "tfidf": by_id(lexical["char_tfidf"]),
        "bm25": by_id(lexical["char_bm25"]),
        "e5": by_id(read_json(args.e5)["rankings"]),
        "gemini": by_id(read_json(args.gemini)["rankings"]),
    }
    eligible = sorted(
        (qid for qid, labels in qrels.items() if 2 in labels.values()), key=int)
    misses = [qid for qid in eligible
              if not rankings["gemini"][qid]["grade2"]["hit3"]]
    successes = [qid for qid in eligible
                 if rankings["gemini"][qid]["grade2"]["hit3"]]
    sampled = random.Random(SEED).sample(
        successes, min(args.sample_success, len(successes)))
    selected = misses + (successes if args.all_eligible else sampled)
    random.Random(SEED + 1).shuffle(selected)
    packet = []
    key = {
        "protocol": "Question-only index; all four methods' top 3 plus published grade-2 candidates",
        "seed": SEED,
        "n_miss": len(misses),
        "n_success_sampled": len(successes) if args.all_eligible else len(sampled),
        "cases": {},
    }
    for i, qid in enumerate(selected, 1):
        docs = set(k for k, grade in qrels[qid].items() if grade == 2)
        for ranking in rankings.values():
            docs.update(ranking[qid]["top10"][:3])
        docs = sorted(docs, key=int)
        random.Random(SEED + int(qid)).shuffle(docs)
        token = f"C{i:03d}"
        case = {"case": token, "query": queries[qid], "candidates": []}
        case_key = {"query_id": qid, "published_gemini_hit3":
                    bool(rankings["gemini"][qid]["grade2"]["hit3"]),
                    "candidates": {}}
        for j, doc_id in enumerate(docs, 1):
            faq = corpus[doc_id]
            question = corpus_question(faq)
            answer = faq.partition("\nAnswer: ")[2]
            if not answer.strip():
                raise ValueError(f"Missing answer in FAQ {doc_id}")
            candidate = f"F{j:02d}"
            case["candidates"].append({
                "candidate": candidate, "question": question, "answer": answer})
            case_key["candidates"][candidate] = {
                "faq_id": doc_id, "published_grade": qrels[qid].get(doc_id, 0),
                "ranks": {method: (ranking[qid]["top10"].index(doc_id) + 1
                                   if doc_id in ranking[qid]["top10"] else None)
                          for method, ranking in rankings.items()}}
        packet.append(case)
        key["cases"][token] = case_key
    args.packet.write_text(json.dumps(packet, ensure_ascii=False, indent=2),
                           encoding="utf-8")
    args.key.write_text(json.dumps(key, ensure_ascii=False, indent=2),
                        encoding="utf-8")
    print(json.dumps({"cases": len(packet), "misses": len(misses),
                      "sampled_successes": len(successes) if args.all_eligible else len(sampled),
                      "candidate_pairs": sum(len(c["candidates"]) for c in packet)}))


if __name__ == "__main__":
    main()
