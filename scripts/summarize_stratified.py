#!/usr/bin/env python3
"""Summarize calibrated model triage; outputs are not human ground truth."""
import argparse
import json
from collections import Counter
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--key', type=Path, required=True)
p.add_argument('--judgments', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--criterion', choices=['answer', 'useful'], required=True)
a=p.parse_args()
protocol={'answer':'2026-09-26-calibrated-v2', 'useful':'2026-09-26-useful-candidate-v1'}[a.criterion]
key=json.loads(a.key.read_text())['cases']
rows=json.loads(a.judgments.read_text())
assert len(rows)==len(key)==200
by_case={r['case']:r for r in rows}
assert set(by_case)==set(key)
methods=['tfidf','bm25','e5','gemini']
strata={False: {'population':91, 'sample':0, 'clear':0, 'hit':Counter()}, True: {'population':496, 'sample':0, 'clear':0, 'hit':Counter()}}
for token, case in key.items():
    r=by_case[token]; judged=r['judgment']; cs=case['candidates']
    assert r['protocol']==protocol
    v={x['candidate']:x['verdict'] for x in judged['candidates']}
    assert len(v)==len(cs) and set(v)==set(cs)
    h=strata[case['published_gemini_hit3']]; h['sample']+=1
    if judged['clarity']!='clear': continue
    h['clear']+=1
    for method in methods:
        top=[cid for cid, m in cs.items() if m['ranks'][method] in (1,2,3)]
        assert len(top)==3,(token,method)
        if any(v[cid]==a.criterion for cid in top): h['hit'][method]+=1
assert strata[False]['sample']==91 and strata[True]['sample']==109
weighted_clear=sum(h['population']*h['clear']/h['sample'] for h in strata.values())
result={'qualification':'Model-assisted provisional triage, not independently adjudicated ground truth', 'criterion':a.criterion, 'protocol':protocol, 'sample':{'queries':200,'population':587,'strata':{str(k):{'population':h['population'],'sample':h['sample'],'clear':h['clear'],'hit_clear':dict(h['hit'])} for k,h in strata.items()}}, 'weighted_model_estimates':{m:{'estimated_clear_queries':weighted_clear,'estimated_hit_clear':sum(h['population']*h['hit'][m]/h['sample'] for h in strata.values()),'hit3_on_clear':sum(h['population']*h['hit'][m]/h['sample'] for h in strata.values())/weighted_clear} for m in methods}}
a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
