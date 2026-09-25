# Independent FAQ retrieval benchmark: fixed protocol and initial results

This replaces the synthetic-query dataset as the **primary** evaluation for a new article. The original 661-FAQ/450-query experiment remains an archived exploratory comparison and must not be combined with these numbers.

## Source and task

Kyoto University's localgovFAQ research collected user queries separately from the FAQ questions and assigned multiple FAQ IDs graded by relevance. The article will test ranking FAQ **questions** against those queries; the FAQ answers are displayed to people but not included in the index. The original source and relevance definitions are [the authors' repository](https://github.com/ku-nlp/bert-based-faqir/blob/master/localgovFAQ.md) and [paper](https://arxiv.org/abs/1905.02851).

This run downloads a [pinned JSON transformation](https://github.com/mahiya/japanese-text-embedding-benchmark/tree/c09fbe4ace0390b71d3d8a074ee1b807765d26f1/dataset) of that dataset. It checks the Git blob SHA-1 and separately records SHA-256 for each input. The dataset bytes are not copied into this repository. The actual JSON files have **1,786 FAQ documents and 749 queries**; the transformation's README lists 1,785/748, so all denominators here come from validated input files. None of the 749 query strings matches a FAQ title after NFKC normalization, lowercasing, and punctuation/space removal.

Relevance grade 2 means the FAQ contains correct information. Grade 1 means related information. The primary Hit@1/3/10 measures whether **at least one grade-2 FAQ** occurs within the first k on the 587 queries with a grade-2 judgment. A second result reports grade >=1 on all 749 queries. The 162 queries with only grade-1 judgments are not called unanswerable. Multiple matching FAQ IDs count as correct. Identical ranking and grading code applies to every method.

## Predeclared methods and initial run

Search input is the FAQ question only. For substring, a normalized query must be contained in a normalized title. The fixed character methods use NFKC, lowercasing, Unicode letters/numbers and 2/3-grams. TF-IDF uses log TF and IDF with cosine similarity. BM25 uses k1=1.2, b=0.75. No parameter was selected by looking at relevance labels; all 749 queries were evaluated together. This is not a Kuromoji BM25 comparison.

| Method | Grade-2 Hit@1, 587 queries | Grade-2 Hit@3 | Grade-2 Hit@10 |
|---|---:|---:|---:|
| Substring | 2/587 (0.3%) | 2/587 (0.3%) | 2/587 (0.3%) |
| Character TF-IDF | 140/587 (23.9%) | 222/587 (37.8%) | 338/587 (57.6%) |
| Character BM25 | 144/587 (24.5%) | 218/587 (37.1%) | 323/587 (55.0%) |

| Method | Grade >=1 Hit@1, 749 queries | Grade >=1 Hit@3 | Grade >=1 Hit@10 |
|---|---:|---:|---:|
| Substring | 2/749 (0.3%) | 2/749 (0.3%) | 2/749 (0.3%) |
| Character TF-IDF | 190/749 (25.4%) | 313/749 (41.8%) | 452/749 (60.3%) |
| Character BM25 | 189/749 (25.2%) | 293/749 (39.1%) | 422/749 (56.3%) |

## Keyless vector result on the same questions

The pinned `intfloat/multilingual-e5-small` model (revision `ada7b62be30f82b0bc5da131b0477721c8fc14e9`) used its prescribed `query: ` and `passage: ` prefixes, with FAQ questions as passages and normalized cosine similarity. It ran with `sentence-transformers` 5.1.1, with no task-specific training or tuning.

| Method | Grade-2 Hit@1, 587 queries | Grade-2 Hit@3 | Grade-2 Hit@10 |
|---|---:|---:|---:|
| Character TF-IDF | 140/587 (23.9%) | 222/587 (37.8%) | 338/587 (57.6%) |
| Character BM25 | 144/587 (24.5%) | 218/587 (37.1%) | 323/587 (55.0%) |
| E5-small vector | **256/587 (43.6%)** | **360/587 (61.3%)** | **462/587 (78.7%)** |

At Hit@3, E5 finds a grade-2 FAQ for 181 queries missed by character TF-IDF. Character TF-IDF finds one for 43 queries missed by E5. The paired difference is 138/587 queries. The reverse cases are kept and the result does not assert that every vector model or ranking fusion will improve retrieval. On all 749 queries at grade >=1, E5 achieves Hit@1 344/749, Hit@3 481/749, and Hit@10 600/749.

The complete top-10 rankings are stored in `results/independent-open-vector.json.gz`; the [successful run](https://github.com/takatama/faq-search-experiment/actions/runs/36138110738) also has its output artifact. This is a different model from Gemini Embedding 2: the new article should name E5 and its version whenever it reports these scores.

Run: `python scripts/independent_eval.py --output evaluation.json`. No third-party Python packages or API key are required. All top-10 rankings, input hashes and method totals are saved in the workflow's `independent-faq-evaluation` artifact ([successful run](https://github.com/takatama/faq-search-experiment/actions/runs/36136869375)). The source file SHA-256 values are: corpus `9ccca2d032720d5c824260872666ba9112e10fe844f2dac888cbcbc8019325e1`, queries `33bf6216a34a544cd672f06225f0c0a82af8f81a80a64c7a2017546aae11f273`, qrels `8012a0cd45fd8553e01d03cf49fec7f065eb8dec13e2ae27f6366391decadc8a`.

## Vector comparison

`python scripts/independent_vector.py` can additionally compare Gemini Embedding 2 at fixed 768 dimensions with the official asymmetric search prefixes. It produces cache-bound input hashes and full top-10 rankings, scored with the same relevance function. It runs in CI only if the repository has a `GEMINI_API_KEY` secret. The current run skipped this optional job because no such secret was available. **Do not use the old 661-FAQ Gemini scores or a third party's Recall@10 as this dataset's result.** The E5 comparison above already constitutes a completed character-versus-vector test.

For the article, define the scope positively: independently authored user queries against FAQ questions, with published relevance judgments. Do not claim that Hit@3 measures what a reader chooses from a UI or whether a new FAQ should be created from a chat thread; these are separate experiments.
