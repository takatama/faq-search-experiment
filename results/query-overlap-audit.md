# Evaluation query overlap audit (post-hoc)

This analysis reads the frozen FAQ, Development/Holdout queries and the published dimension-ranking artifact. It checks the SHA-256 hashes of the source JSON, validates each ranking against its query and the published aggregate, then filters queries whose text matches their source FAQ title. No API calls, new embeddings, retuning or changes to the original results are involved.

Run `node scripts/audit-query-overlap.mjs` after cloning the repository. Filtering was defined **after** seeing the Holdout results, so the filtered rows are a sensitivity analysis, not a fresh Holdout evaluation. Other methods are not re-evaluated here.

| Split | Exact title match | Match after NFKC, casefold, whitespace and punctuation removal |
|---|---:|---:|
| Development (90) | 2 | 6 |
| Holdout (360) | 11 | 26 |

Normalized matches include exact matches. The removed punctuation is `。、？！?!.・`. This is a conservative comparison rule, not a semantic duplicate detector.

## Vector search, Holdout

| Dimension | Questions included | Hit@1 | Hit@3 |
|---|---:|---:|---:|
| 3072, original | 360 | 347 (96.39%) | 357 (99.17%) |
| 3072, exclude 11 exact title matches | 349 | 336 (96.28%) | 346 (99.14%) |
| 3072, exclude all 26 normalized matches | 334 | 321 (96.11%) | 331 (99.10%) |
| 768, post-hoc dimension analysis | 360 | 348 (96.67%) | 357 (99.17%) |
| 768, exclude 11 exact title matches | 349 | 337 (96.56%) | 346 (99.14%) |
| 768, exclude all 26 normalized matches | 334 | 322 (96.41%) | 331 (99.10%) |

The three 3072-dimensional Hit@3 misses in the filtered set all have `situation_gap` queries:

- `Q-144-3` asks for the application procedure for a child-rearing allowance, but the labeled FAQ concerns whether grandparents may apply for parents. FAQ 131, about required documents, ranks first. The label should be reviewed; it is not a reliable example of retrieval failure.
- `Q-195-3` reads `について、自分も対象になるか確認したい`. The subject is missing, so the target FAQ cannot be identified from the question.
- `Q-347-3` reads `について、自分も対象になるか確認したい 保育園の入園申込`. This is incomplete and does not specifically ask what a certification document is.

The original strict-label numbers above are retained. Changing or removing these three labels after seeing results would inflate the headline score. Their review instead motivates an independently labeled future evaluation set. Across the 120 Holdout questions of each type, 3072-dimensional Hit@1 is 118 for natural paraphrases, 119 for terse searches, and 110 for situation-gap questions; Hit@3 is 120, 120, and 117 respectively. These are authored, balanced questions, not a sample of live user traffic.

**Remaining tests:** collect independent questions without showing authors the FAQ titles, have two reviewers mark all acceptable FAQs or `none`, assess user selection from the top three, and evaluate conversation-to-FAQ matching separately. This artifact cannot estimate those outcomes or the end-to-end API latency.
