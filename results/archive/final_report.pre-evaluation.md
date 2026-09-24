# Final report

| Method | Hit@1 | Hit@3 | MRR | Query embedding rate | p50 | p95 |
|---|---:|---:|---:|---:|---:|---:|
| A–F | Not evaluated | Not evaluated | Not evaluated | Not evaluated | Not evaluated | Not evaluated |

## Status

Evaluation stopped at step 1 because the supplied repository contains no `data/corpus.json`, `data/development.json`, or `data/holdout.json`. The fixed Split v2 therefore could not be verified or evaluated. Results were not invented, and holdout was not inspected or used for tuning.

The implementation, mock tests, API smoke-test command, caching, Development-only gate tuning, one-shot holdout guard, and reporting commands are ready for the fixed input files. `GEMINI_API_KEY` is read only from the environment.
