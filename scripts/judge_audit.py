"""Blinded model-assisted triage of FAQ answer judgments.

These judgments are provisional review leads, not human gold labels.
The packet contains no retrieval method, ranks, or original relevance labels.
"""
import argparse
import json
import os
import pathlib
import time
from typing import Literal

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

MODEL = "gemini-3.1-flash-lite"


class CandidateJudgment(BaseModel):
    candidate: str
    verdict: Literal["answer", "lead", "unrelated"]
    reason: str = Field(description="短い日本語の根拠。本文のどこが質問に答えるか、または不足するか。")


class CaseJudgment(BaseModel):
    clarity: Literal["clear", "needs_clarification"]
    clarity_reason: str
    candidates: list[CandidateJudgment]


INSTRUCTION = """自治体FAQの検索評価用に、問い合わせとFAQの本文だけを判定する。
検索方式、順位、元の正解ラベルは知らされていない。外部知識や現在の制度は使わず、提示された当時の本文に限る。
clarity=needs_clarification は、問い合わせから知りたい情報や対象が特定できず、回答の良し悪しを決められない場合に限る。
各候補に一つ verdict を付ける。
answer: 本文自体に質問への具体的な答えがある。広い質問で複数の制度が該当する場合、その一つを具体的に説明すればよい。
lead: 関連するが直接答えない。担当課への問い合わせだけ、リンクやアプリに答えを委ねるだけ、異なる条件や対象についての説明はここ。
unrelated: 質問に実質的に関係しない。
URLが［ＵＲＬ］と欠落していれば、リンク先の内容を推測しない。短い根拠を各候補に付け、すべての候補IDを一度ずつ返す。"""


def judge(client, case):
    prompt = INSTRUCTION + "\n\n" + json.dumps(case, ensure_ascii=False)
    for attempt in range(6):
        try:
            response = client.models.generate_content(
                model=MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    temperature=0,
                    response_mime_type="application/json",
                    response_schema=CaseJudgment,
                ),
            )
            result = CaseJudgment.model_validate_json(response.text)
            expected = {c["candidate"] for c in case["candidates"]}
            got = [c.candidate for c in result.candidates]
            if len(got) != len(expected) or set(got) != expected:
                raise ValueError(f"Candidate IDs do not match: {case['case']}")
            return result.model_dump(), getattr(response, "usage_metadata", None)
        except Exception:
            if attempt == 5:
                raise
            time.sleep(min(60, 2 ** (attempt + 1)))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--packet", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    if not os.environ.get("GEMINI_API_KEY"):
        raise ValueError("GEMINI_API_KEY is required")
    packet = json.loads(args.packet.read_text(encoding="utf-8"))
    cases = packet[:args.limit] if args.limit else packet
    client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    output = []
    for i, case in enumerate(cases, 1):
        judgment, usage = judge(client, case)
        output.append({
            "case": case["case"], "model": MODEL,
            "judgment": judgment,
            "usage": {
                "prompt_tokens": getattr(usage, "prompt_token_count", None),
                "output_tokens": getattr(usage, "candidates_token_count", None),
            },
        })
        args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2),
                               encoding="utf-8")
        print(f"Judged {i}/{len(cases)}", flush=True)
        time.sleep(1)


if __name__ == "__main__":
    main()
