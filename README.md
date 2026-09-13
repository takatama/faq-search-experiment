# FAQ Search Experiment

自治体FAQ 661件と固定済み450 queryで、substring、文字2〜4-gram TF-IDF、Gemini生成alias、Gemini Embedding、RRF hybrid、lexical-first fallbackを公平に比較するNode.js実験基盤です。

## 安全性と再現性

- 認証は `GEMINI_API_KEY` 環境変数だけを使用し、API keyは `x-goog-api-key` headerへ設定します。
- `MAX_GEMINI_REQUESTS`（既定200）をプロセス内で数え、送信前に停止します。429/5xxだけを最大4回、上限付き指数backoffで再試行します。
- alias promptへ渡す項目はcorpusの `id`, `question`, `answer`, `category` だけです。評価queryは読みません。
- aliasとembeddingを `data/cache/` に逐次atomic保存します。embeddingはmodel、task type、次元、入力SHA-256が一致するときだけ再利用します。
- FAQ embeddingは正式質問だけを `RETRIEVAL_DOCUMENT`、queryは `RETRIEVAL_QUERY` として生成します。
- gateはDevelopmentだけで探索し `config/experiment.json` にfreezeします。Holdout評価は既存結果を上書きしません。

## 必要な入力

次の固定Split v2を配置してください（このリポジトリの現在のcheckoutにはデータが含まれていません）。配列そのもの、またはcorpusは `faqs` / `corpus`、splitは `queries` / `items` 配下の配列を受け付けます。

```
data/corpus.json       # 661 FAQ: id, question, answer, category
data/development.json  # 90 query: id, query, faq_id, query_type, difficulty
data/holdout.json      # 360 query: 同上
```

## 環境変数

```bash
export GEMINI_API_KEY='...'
export GEMINI_ALIAS_MODEL='gemini-2.5-flash-lite'       # default
export GEMINI_EMBEDDING_MODEL='gemini-embedding-001'    # default
export MAX_GEMINI_REQUESTS='200'                        # default
```

モデルが利用不能でも自動fallbackはしません。明示的に環境変数と `config/experiment.json` の正確なモデル名を揃えてから、新しいcacheとして実行してください。秘密情報を含む `.env` とcacheはGit管理外です。

## 実行順序

```bash
npm test
npm run check
npm run smoke                         # 大量処理前に必ず1 requestだけ
npm run aliases                       # 最大20 FAQ/request
npm run embeddings -- development    # FAQ + Development query、最大100 inputs/request
npm run tune:gate                     # Developmentのみ、設定をfreeze
npm run evaluate:development
npm run embeddings -- holdout         # freeze後に実施
npm run evaluate:holdout              # 既存reportがあれば停止するone-shot guard
npm run report
```

`tune:gate` は、複数信号（exact alias、top1、margin、coverage、query長）を組み合わせた候補から、(1) always-hybrid Hit@1との差が1ポイント以内、(2) logical query embedding率が最低、の順で選びます。条件を満たさなければfreezeしません。HybridはRRF `k=60` です。

## コスト指標

評価結果の `queryEmbeddingCalls` / `queryEmbeddingRate` は方式ごとの論理呼出対象query数です。fallbackではgateが低confidenceとしたqueryだけを数えるため、事前cache済みでも全件扱いにはしません。実HTTP request数（batch単位）と混同しません。Geminiが返すusage metadataはcache生成runへ保存し、返されない料金は推測しません。

## 現在の評価状態

入力データがcheckoutに存在しないため、API大量処理、Development tuning、Holdout one-shot評価は未実施です。`results/` にはこの停止理由を明記し、数値を捏造していません。固定データ配置後は上記手順で再現できます。
