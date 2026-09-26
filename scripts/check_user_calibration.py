#!/usr/bin/env python3
"""Compare an AI triage run with user rubric calibration, without rewriting labels."""
import argparse
import json
from pathlib import Path

p=argparse.ArgumentParser()
p.add_argument('--key',type=Path,required=True)
p.add_argument('--judgments',type=Path,required=True)
p.add_argument('--calibration',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
a=p.parse_args()
key=json.loads(a.key.read_text())['cases']
by_qid={v['query_id']:(token,v) for token,v in key.items()}
judged={v['case']:v['judgment'] for v in json.loads(a.judgments.read_text())}
checks=[]
for item in json.loads(a.calibration.read_text())['cases']:
    qid=item['query_id']; token,meta=by_qid[qid]; result=judged[token]
    checks.append({'query_id':qid,'case':token,'scope':'clarity','expected':item['clarity'],
                   'observed':result['clarity'],'match':item['clarity']==result['clarity']})
    for faqid in item['faq_ids']:
        ids=[cid for cid,doc in meta['candidates'].items() if doc['faq_id']==faqid]
        assert len(ids)==1,(qid,faqid)
        cid=ids[0]; observed=next(v['verdict'] for v in result['candidates'] if v['candidate']==cid)
        if item['verdict'] is not None:
            checks.append({'query_id':qid,'faq_id':faqid,'case':token,'candidate':cid,
                           'scope':'candidate','expected':item['verdict'],
                           'observed':observed,'match':item['verdict']==observed})
a.output.write_text(json.dumps({'checks':checks,'n_checks':len(checks),
    'n_disagreements':sum(not v['match'] for v in checks)},ensure_ascii=False,indent=2)+'\n')
print(f'{len(checks)} checks; {sum(not v["match"] for v in checks)} disagreements')
