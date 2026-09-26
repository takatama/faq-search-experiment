#!/usr/bin/env python3
"""Export the disagreement cases for independent, blinded adjudication.

The reviewer receives the packet and blank verdict columns. Reveal the key only
once the review is locked; the second output is an audit index, not the form.
"""
import argparse
import csv
import json
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--packet', type=Path, required=True)
parser.add_argument('--key', type=Path, required=True)
parser.add_argument('--judgments', type=Path, required=True)
parser.add_argument('--blind-output', type=Path, required=True)
parser.add_argument('--audit-output', type=Path, required=True)
args = parser.parse_args()
packet = {x['case']: x for x in json.loads(args.packet.read_text())}
key = json.loads(args.key.read_text())['cases']
judgments = {x['case']: x for x in json.loads(args.judgments.read_text())}
assert len(packet) == len(key) == len(judgments) == 121
blind, audit = [], []
for case, item in packet.items():
    meta, judged = key[case], judgments[case]['judgment']
    verdict = {v['candidate']: v['verdict'] for v in judged['candidates']}
    assert set(verdict) == set(meta['candidates']) == {x['candidate'] for x in item['candidates']}
    if judged['clarity'] != 'clear':
        continue
    top = [cid for cid, entry in meta['candidates'].items() if entry['ranks']['gemini'] in (1, 2, 3)]
    assert len(top) == 3
    predicted = any(verdict[cid] == 'answer' for cid in top)
    if predicted == meta['published_gemini_hit3']:
        continue
    for faq in item['candidates']:
        cid = faq['candidate']
        blind.append({'case': case, 'query': item['query'], 'query_clarity': '',
                      'candidate': cid, 'faq_question': faq['question'],
                      'faq_answer': faq['answer'], 'answer_verdict': '',
                      'reason': '', 'content_issue': ''})
        entry = meta['candidates'][cid]
        audit.append({'case': case, 'query_id': meta['query_id'],
                      'published_hit3': meta['published_gemini_hit3'],
                      'candidate': cid, 'faq_id': entry['faq_id'],
                      'published_grade': entry['published_grade'],
                      'gemini_rank': entry['ranks']['gemini'],
                      'model_verdict': verdict[cid]})
for path, data in ((args.blind_output, blind), (args.audit_output, audit)):
    with path.open('w', newline='', encoding='utf-8-sig') as f:
        w = csv.DictWriter(f, fieldnames=data[0].keys()); w.writeheader(); w.writerows(data)
print(f'{len(set(x["case"] for x in blind))} cases, {len(blind)} candidate pairs')
