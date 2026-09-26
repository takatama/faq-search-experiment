"""Provisional blinded triage of useful FAQ candidates for human choice.

This is model-assisted screening, not independent human judgment.
"""
import argparse
import json
import os
import pathlib
import time
from typing import Literal

from google import genai
from google.genai import types
from pydantic import BaseModel

MODEL = 'gemini-3.1-flash-lite'
PROTOCOL = '2026-09-26-useful-candidate-v1'

class Candidate(BaseModel):
    candidate: str
    verdict: Literal['useful', 'related', 'unrelated']
    reason: str

class Judgment(BaseModel):
    clarity: Literal['clear', 'needs_clarification']
    clarity_reason: str
    candidates: list[Candidate]

INSTRUCTION = '''自治体FAQ検索の評価。利用者が候補を見て、どれを開くか選ぶ用途を想定する。提示した候補は順位を隠した集合であり、すべての候補IDを一度ずつ判定する。質問とFAQの質問文・本文だけを読み、検索方式、順位、元ラベル、外部知識を使わず判定する。
clarity=needs_clarification は、病名・加入保険など必要条件が不明で、候補が役立つか判定できない質問に付ける。明確な情報要求は広いだけで保留しない。
各候補のverdict:
useful: 質問者がこのFAQを選べば、求める情報、適切な行動、または具体的な参照先に進める。本文が直接答える場合を含む。分別方法を尋ねた質問に対し、名称が明記された分別アプリを案内するFAQは、URLがプレースホルダーでも利用先を特定できるので有用とする。問い合わせ先を尋ねる質問には、対応する窓口と電話番号を示せば有用。
related: 話題は近いが、質問者の年齢・病名・保険など未提示の条件を仮定しないと使えない制度、別の対象、または実質的な施策を尋ねる質問に担当課だけを示すFAQ。検索候補として質問の用件を満たさない。
unrelated: 質問の用件に実質的に関係しない。
外部リンクの内容を推測せず、本文で名前が特定できないリンクだけにはusefulを付けない。適用条件を勝手に補わない。候補すべてを一度ずつ判定し、日本語で短い根拠を記録する。'''

def judge(client, case):
    ids=[c['candidate'] for c in case['candidates']]
    prompt=INSTRUCTION+f'\n\n必ず{len(ids)}件すべてを返す。候補ID: {", ".join(ids)}\n\n'+json.dumps(case, ensure_ascii=False)
    for attempt in range(6):
        try:
            response=client.models.generate_content(model=MODEL, contents=prompt,
                config=types.GenerateContentConfig(temperature=0,
                    response_mime_type='application/json', response_schema=Judgment))
            result=Judgment.model_validate_json(response.text)
            expected={c['candidate'] for c in case['candidates']}
            got=[c.candidate for c in result.candidates]
            if len(got)!=len(expected) or set(got)!=expected:
                raise ValueError(f'Candidate IDs do not match: {case["case"]}: expected={sorted(expected)} got={got}')
            return result.model_dump(),getattr(response,'usage_metadata',None)
        except Exception:
            if attempt==5: raise
            time.sleep(min(60,2**(attempt+1)))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--packet',type=pathlib.Path,required=True)
    parser.add_argument('--output',type=pathlib.Path,required=True)
    parser.add_argument('--limit',type=int)
    args=parser.parse_args()
    if not os.environ.get('GEMINI_API_KEY'): raise ValueError('GEMINI_API_KEY is required')
    packet=json.loads(args.packet.read_text(encoding='utf-8'))
    cases=packet[:args.limit] if args.limit else packet
    client=genai.Client(api_key=os.environ['GEMINI_API_KEY'])
    output=[]
    for i,case in enumerate(cases,1):
        judgment,usage=judge(client,case)
        output.append({'case':case['case'],'model':MODEL,'protocol':PROTOCOL,
            'judgment':judgment,'usage':{'prompt_tokens':getattr(usage,'prompt_token_count',None),
                'output_tokens':getattr(usage,'candidates_token_count',None)}})
        args.output.write_text(json.dumps(output,ensure_ascii=False,indent=2),encoding='utf-8')
        print(f'Judged {i}/{len(cases)}',flush=True)
        time.sleep(1)

if __name__=='__main__': main()
