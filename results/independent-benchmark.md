# Independent FAQ retrieval benchmark — corrected question-only index

## Correction history

The first version of this benchmark treated the source corpus's `Question: …\\nAnswer: …` string as a question. It indexed the FAQ answer as well as the question in **all four** ranking methods. The previously published comparison tables are superseded. Original result files are retained under `results/superseded/` to make the correction auditable. The corrected parser returns only the text between `Question: ` and `\\nAnswer: ` and rejects malformed records. The pinned corpus has 1,786 such records; all passed parsing.

The independent user queries (749), qrels, pinned source commit, model versions, search prefixes and 768-dimensional Gemini setting are otherwise unchanged. [Corrected GitHub Actions run](https://github.com/takatama/faq-search-experiment/actions/runs/36151690275) completed successfully for lexical, E5 and Gemini methods.

## Source and evaluation

Data: [Kyoto localgovFAQ research](https://github.com/ku-nlp/bert-based-faqir/blob/master/localgovFAQ.md), read from the [pinned JSON transformation](https://github.com/mahiya/japanese-text-embedding-benchmark/tree/c09fbe4ace0390b71d3d8a074ee1b807765d26f1/dataset) at commit `c09fbe4ace0390b71d3d8a074ee1b807765d26f1`. The source README and source files differ by one record; the actual files have 1,786 FAQ and 749 queries. Corpus SHA-256: `9ccca2d032720d5c824260872666ba9112e10fe844f2dac888cbcbc8019325e1`; queries: `33bf6216a34a544cd672f06225f0c0a82af8f81a80a64c7a2017546aae11f273`; qrels: `8012a0cd45fd8553e01d03cf49fec7f065eb8dec13e2ae27f6366391decadc8a`. No query exactly matches an FAQ question after NFKC/case/punctuation normalization.

The primary metric is Hit@1, 3 and 10 on the 587 queries with at least one published grade-2 ("correct information") FAQ. A hit means at least one such document appears in the first k. The remaining 162 queries have only grade-1 ("related") judgments and are excluded from the primary metric; they are not labeled unanswerable. A second metric treats grade >=1 as relevant for all 749 queries. All methods use the same questions and judgments. No setting was tuned on the test qrels.

## Corrected results: published grade-2 labels, 587 queries

| Method | Hit@1 | Hit@3 | Hit@10 |
|---|---:|---:|---:|
| Normalized substring | 2/587 (0.3%) | 2/587 (0.3%) | 2/587 (0.3%) |
| Character 2/3-gram TF-IDF | 120/587 (20.4%) | 197/587 (33.6%) | 277/587 (47.2%) |
| Character 2/3-gram BM25 | 94/587 (16.0%) | 163/587 (27.8%) | 244/587 (41.6%) |
| `multilingual-e5-small` | 256/587 (43.6%) | 373/587 (63.5%) | 485/587 (82.6%) |
| `gemini-embedding-2`, 768 dimensions | 394/587 (67.1%) | 496/587 (84.5%) | 553/587 (94.2%) |

Gemini succeeds within three for 302 queries missed by character TF-IDF; TF-IDF succeeds for 3 missed by Gemini. Against E5 these counts are 135 and 12. Gemini has 91 misses against the published grade-2 labels: 57 have a labeled FAQ at ranks 4–10, 34 have none in the top 10.

On all 749 queries with grade >=1, Gemini has Hit@1 471/749, Hit@3 604/749 and Hit@10 689/749. Character TF-IDF has 154/749, 252/749 and 354/749; character BM25 122/749, 211/749 and 307/749; E5 332/749, 480/749 and 601/749. These are comparisons against the original labels.

## Fixed methods and reproducibility

- Substring: normalized whole query must occur within the normalized FAQ question.
- Character methods: NFKC, lowercasing and character 2/3-grams. TF-IDF uses log TF/IDF cosine; BM25 uses `k1=1.2`, `b=0.75`. This is not a tokenizer-based BM25.
- E5: `intfloat/multilingual-e5-small`, revision `ada7b62be30f82b0bc5da131b0477721c8fc14e9`, `sentence-transformers==5.1.1`, prescribed `query: ` and `passage: ` prefixes.
- Gemini: `gemini-embedding-2`, 768 dimensions selected before inspecting qrels, asymmetric `task: search result | query: ` / `title: none | text: ` inputs. The corrected run reused unchanged query vectors and made 36 API batch calls for newly extracted FAQ questions. Both vector methods normalize vectors and use dot product.

The corrected full rankings are `results/independent-evaluation.json.gz`, `results/independent-open-vector.json.gz`, and `results/independent-gemini-results.json.gz`. Gemini vectors are in `results/independent-gemini-vectors.json.gz` with input hashes and without any API key. Rebuilding all 749 top-10 rankings from the saved float32 vectors yielded zero mismatches. Run the scripts in `scripts/` with the pinned source and the specified dependencies.

## Judgment audit and article scope

The original grade-2 judgments are not an exhaustive answerability test. For example, query #244 asks which months child allowance is paid. Gemini ranks FAQ #1268, whose answer lists the payment months, first; the sole published grade-2 FAQ #91 describes applying after birth and does not list payment months. Query #656 asks about child medical subsidies. Gemini ranks FAQ #593 and #565 on these schemes but the published grade-2 FAQ #394 concerns premature infants. Both count as misses under the original qrels.

The corrected [blinded review packet generator](../scripts/build_judgment_audit.py) takes all 91 published Gemini misses and a fixed-seed sample of 30 successes; it includes the union of all four methods' top-three FAQ and original grade-2 FAQ. The current packet has 121 cases and 1,079 query–FAQ pairs. It has **not yet been adjudicated**. The benchmark's 84.5% is an exact score against the published labels, not a validated estimate that readers can obtain an answer from a three-result UI. Review the candidates' answer text and an independent sample of successes before making a user-outcome claim. FAQ creation decisions from chat threads require a separate evaluation.
