"""Fixed top-10 FAQ reranking on independent localgovFAQ queries.

Inputs are the published corpus/query/qrel snapshot and cached title-vector
rankings. Qrels are used only after scoring. The model, input field, candidate
count, and truncation length are fixed before examining reranker outcomes.
"""
import collections
import gzip
import json
import os
import pathlib
import time

from sentence_transformers import CrossEncoder

from independent_eval import BLOBS, corpus_question, load

ROOT = pathlib.Path(__file__).resolve().parents[1]
RANKINGS = ROOT / 'results/independent-synthetic-rankings.json.gz'
PROGRESS = ROOT / 'reranker-progress.json'
OUTPUT = ROOT / 'reranker-results.json'
MODEL = 'BAAI/bge-reranker-v2-m3'
MODEL_REVISION = 'ec9b3043220656d7f04860fb8aa88bb289eb3408'
TOP_N = 10
MAX_LENGTH = 512
BATCH_SIZE = 16


def main():
    corpus, corpus_sha = load('corpus.json', None)
    queries, queries_sha = load('queries.json', None)
    qrels, qrels_sha = load('qrels.json', None)
    cached = json.loads(gzip.open(RANKINGS, 'rt').read())
    assert cached['source_blobs'] == BLOBS
    assert cached['summary']['baseline'] == {'hit1':394, 'hit3':496, 'hit10':553}
    assert len(cached['rankings']) == len(queries) == 749
    candidates = {r['query_id']:r['rankings']['baseline'][:TOP_N]
                  for r in cached['rankings']}
    assert set(candidates) == set(queries)
    assert all(len(ids)==TOP_N and len(set(ids))==TOP_N for ids in candidates.values())

    # Score the complete FAQ pair, including its original question and answer.
    # The cross encoder itself truncates each pair at MAX_LENGTH tokens.
    pairs = [(qid, did) for qid in sorted(queries, key=int)
             for did in candidates[qid]]
    saved = json.loads(PROGRESS.read_text()) if PROGRESS.exists() else {}
    assert set(saved).issubset({f'{q}/{d}' for q,d in pairs})
    print(f'Loading {MODEL}@{MODEL_REVISION}; pairs={len(pairs)}',flush=True)
    model = CrossEncoder(MODEL, revision=MODEL_REVISION,
                         max_length=MAX_LENGTH, device='cpu',
                         trust_remote_code=False)
    started = time.monotonic()
    for start in range(0,len(pairs),BATCH_SIZE):
        batch = [(q,d) for q,d in pairs[start:start+BATCH_SIZE]
                 if f'{q}/{d}' not in saved]
        if not batch: continue
        inputs = [(queries[q], corpus[d]) for q,d in batch]
        scores = model.predict(inputs, batch_size=BATCH_SIZE,
                               show_progress_bar=False)
        for (q,d),score in zip(batch,scores):
            saved[f'{q}/{d}'] = float(score)
        if start % 160 == 0 or start+BATCH_SIZE >= len(pairs):
            PROGRESS.write_text(json.dumps(saved,ensure_ascii=False))
            print(f'Scored {len(saved)}/{len(pairs)} pairs, {time.monotonic()-started:.0f}s',flush=True)
    assert len(saved)==len(pairs)
    PROGRESS.write_text(json.dumps(saved,ensure_ascii=False))

    rows=[]
    counts=collections.Counter()
    rescued=[]; lost=[]
    for qid in sorted(queries,key=int):
        original=candidates[qid]
        reordered=sorted(original,key=lambda d:(-saved[f'{qid}/{d}'], original.index(d)))
        relevant={str(d) for d,grade in qrels[qid].items() if grade==2}
        before={f'hit{k}':bool(relevant.intersection(original[:k])) for k in (1,3,10)}
        after={f'hit{k}':bool(relevant.intersection(reordered[:k])) for k in (1,3,10)}
        if relevant:
            for k in (1,3,10):counts[f'before{k}']+=before[f'hit{k}'];counts[f'after{k}']+=after[f'hit{k}']
            if after['hit3'] and not before['hit3']:rescued.append(qid)
            if before['hit3'] and not after['hit3']:lost.append(qid)
        rows.append({'query_id':qid,'before':original,'after':reordered,
                     'scores':[saved[f'{qid}/{d}'] for d in reordered],
                     'grade2':sorted(relevant,key=int),'before_hit':before,'after_hit':after})
    assert counts['before1']==394 and counts['before3']==496 and counts['before10']==553
    result={'method':{'model':MODEL,'revision':MODEL_REVISION,'candidate_source':'title-only gemini-embedding-2 768d',
                      'candidate_count':TOP_N,'input':'raw question and answer','max_length':MAX_LENGTH,
                      'batch_size':BATCH_SIZE},
            'source_blobs':BLOBS,'source_sha256':{'corpus':corpus_sha,'queries':queries_sha,'qrels':qrels_sha},
            'eligible_queries':sum(bool({d for d,g in qrels[q].items() if g==2}) for q in queries),
            'summary':dict(counts),'rescued_hit3':rescued,'lost_hit3':lost,
            'elapsed_scoring_seconds':round(time.monotonic()-started,1),'rankings':rows}
    assert result['eligible_queries']==587
    OUTPUT.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
    print(json.dumps({'summary':result['summary'],'rescued':len(rescued),'lost':len(lost),
                      'elapsed_seconds':result['elapsed_scoring_seconds']}),flush=True)


if __name__=='__main__':main()
