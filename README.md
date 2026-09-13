# FAQ Search Experiment

自治体FAQ 661件と固定済み評価queryを使い、lexical search、vector search、hybrid、semantic fallbackを同じ条件で比較する実験プロジェクトです。

## 現在の実装

- 完全一致・部分一致baseline
- 日本語文字2〜4-gram TF-IDF cosine検索
- Hit@1、Hit@3、MRRの評価
- Development 90問とHoldout 360問の分離
- FAQ単位の難易度均衡Split v2（文字n-gram Hit@1: 85.6% / 86.1%）

## 実行

```bash
python scripts/export_benchmark.py
npm test
npm run evaluate
```

## 次の実装

1. Developmentだけを使ったconfidence gateの設計
2. GeminiによるFAQ aliasの事前生成
3. Gemini Embeddingによるvector検索
4. 常時hybridとlexical-first fallbackの比較

APIキーはファイルやGitへ保存せず、`GEMINI_API_KEY`環境変数から取得します。

Split v2は、450問を固定した後にFAQ単位で再分割しています。Easy/Medium/Hardを
Development 9/12/9、Holdout 36/48/36に保ち、query種別ごとの文字n-gram検索精度が
両splitで近くなるよう、固定seedで選定しています。
