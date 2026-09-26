#!/usr/bin/env python3
"""Freeze a balanced random audit of Gemini top-3 usefulness decisions."""
import argparse
import json
import random
from collections import defaultdict
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--key',type=Path,required=True)
p.add_argument('--judgments',type=Path,required=True)
p.add_argument('--calibration',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
a=p.parse_args()
key=json.loads(a.key.read_text())['cases']
judged={x['case']:x['judgment'] for x in json.loads(a.judgments.read_text())}
exclude={x['query_id'] for x in json.loads(a.calibration.read_text())['cases']}
strata=defaultdict(list)
for case,meta in key.items():
    if meta['query_id'] in exclude:continue
    j=judged[case]
    v={x['candidate']:x['verdict'] for x in j['candidates']}
    useful=any(v[cid]=='useful' for cid,doc in meta['candidates'].items() if doc['ranks']['gemini'] in (1,2,3))
    strata[(meta['published_gemini_hit3'],useful)].append((case,meta['query_id']))
rng=random.Random(20260926+2)
selected=[]
for (published,model),cases in sorted(strata.items()):
    assert len(cases)>=3,(published,model,len(cases))
    chosen=rng.sample(sorted(cases,key=lambda x:int(x[1])),3)
    selected.extend({'case':case,'query_id':qid,'published_hit3':published,
                     'model_useful_hit3':model} for case,qid in chosen)
assert len(selected)==12
result={'seed':20260928,'selection':'3 cases per published-hit x model-useful quadrant, excluding calibration queries',
        'cases':selected}
a.output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False,indent=2))
