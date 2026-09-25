# 自治体FAQ検索実験

661件のFAQと固定Split v2（Development 90問、Holdout 360問）を使い、A substring、B 文字2〜4gram TF-IDF、C aliases付きlexical、D Vector、E RRF Hybrid、F lexical-first fallbackを比較します。データは変更・再生成しません。

## モデルと認証

今回ユーザーが指定したモデル:

- `GEMINI_ALIAS_MODEL=gemini-3.5-flash-lite`
- `GEMINI_EMBEDDING_MODEL=gemini-embedding-2`
- `MAX_GEMINI_REQUESTS=200`（1プロセスの送信試行上限。再試行も含む）
- `GEMINI_API_KEY` は環境変数からのみ取得します。値は表示せず、`x-goog-api-key`ヘッダーで送信します。

以前の既定値は `gemini-2.5-flash-lite` / `gemini-embedding-001` でした。旧aliasモデルでHTTP 404が発生した後、ユーザー指定で上記へ変更しました。別モデルへの自動切り替えはしません。モデル変更時は新しい実験として扱い、凍結設定や評価結果を上書きしないでください。

Embedding 2は `taskType` フィールドに対応しないため、[公式資料](https://ai.google.dev/gemini-api/docs/embeddings)に従い、FAQ質問は `title: none | text: ...`、検索文は `task: search result | query: ...` で送ります。キャッシュの論理用途はそれぞれ `RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY` です。FAQに回答・aliasesを混ぜません。次元は3072です。

## 初回実行の順序

Node.js 20以降を使用します。追加SDKは不要です。Windowsでも以下を実行できます。

```text
npm test
npm run check
node scripts/baseline.js
npm run smoke
npm run aliases
npm run embeddings -- development
npm run tune:gate
npm run evaluate:development
npm run embeddings -- holdout
npm run evaluate:holdout
npm run report
```

この順序は未評価のcheckoutでの手順です。すでに凍結・評価済みの場合、tuningと評価コマンドは再実行を拒否します。最終結果を確認するには `results/final_report.md` と各JSONを開いてください。reportは保存済みの順位から作成し、Holdout検索を再実行しません。

接続テストは最大1リクエストです。失敗時は大量処理へ進みません。429/5xxの再試行は最大4試行、待ち時間は指数的に増やし上限を設けます。エラー表示はHTTP statusと許可済みのエラーコードに限定し、サーバーや通信例外の自由文を表示しません。

## データ・キャッシュ

入力は `data/corpus.json`、`data/development.json`、`data/holdout.json`、`data/split_assignment_v2.json` です。件数、ID重複、FAQごと3種類のquery、難易度の分布、所属splitを検証します。凍結時に入力ファイルhashとindexキャッシュhashを記録し、後の変更を拒否します。

aliases生成はcorpusしか読みません。質問・回答・カテゴリを最大20FAQずつ送り、FAQ IDとの対応、5件、空文字、重複を確認します。生成条件、入力hash、モデル、日時、batchごとのAPI回数・時間・usageを保存します。

Embeddingは最大100入力のbatchで取得します。ID、モデル、用途、3072次元、元テキストhash、接頭辞付き入力hash、有限数値を検証し、合致するキャッシュだけを再利用します。生成はbatchごとに保存し、失敗した試行も記録します。キャッシュと`.env`はGit対象外です。APIキーをファイルへ書かないでください。

## 選択と公平性

Developmentだけで質問の重み1/2/3（alias重み1）を比較し、Hybrid Hit@1が最高の値を選択します。同率では小さい重み。RRF k=60、融合対象は各検索の上位3件で固定です。

gateはexact alias一致、top1 score、top1とtop2の差、query長、corpus語彙に対するn-gram coverageを使用します。exact alias一致の場合はlexical結果を採用します。それ以外では、2つ以上の有効な最小値を持つ候補から、Hybrid Hit@1との差1ポイント以内、Vector対象率が最小、判定項目が少ない順で決めます。満たす候補がなければ目標未達を記録し、Developmentの精度差が最小、呼出率が最小、判定項目が少ない順で比較用の条件を固定します。成功とは扱いません。

`config/experiment.json` を固定してからHoldoutのEmbedding生成・評価を行います。Holdout評価は開始記録も排他的に作成し、途中停止しても勝手に再評価しません。

## 公開済みの結果とライセンス

実測値は [`results/final_report.md`](results/final_report.md) に掲載しています。評価に用いた質問と正解IDは `data/`、各方式の順位・指標は `results/development_report.json` と `results/holdout_report.json` に保存しています。これらはキャッシュ済みEmbeddingを使った検索時間であり、実際のAPI待ち時間を含みません。

ソースコードは [MIT License](LICENSE) で公開します。FAQの元データは [子育てオープンデータ協議会の汎用FAQ](https://www.asukoe.co.jp/news/kosodate_opendata_report/) に由来し、元データの条件である CC BY 4.0 に従って出典を表示します。`data/` 内のFAQをMITライセンスの対象とはしません。評価用の問い合わせはこの実験で別途作成しました。

## 指標の読み方

- Hit@1 / Hit@3、上位3件までのMRR、query種別・難易度別Hit@1を記録します。
- `queryEmbeddingCalls` は方式が必要とするqueryの数。HTTPリクエスト数ではありません。
- fallbackはgate対象だけEmbeddingキャッシュを参照し、不要な場合にはVectorを実行しません。
- 実HTTP数はキャッシュ生成batchの共有費用として記録します。比較評価中のHTTP数は全方式0です。同じ生成費用をD/E/Fへ重複加算しません。
- 各方式のp50/p95は独立に測ったキャッシュ使用時の検索時間です。API待ち時間、ファイル読込、index作成は含みません。
- APIの実待ち時間と利用量は生成batch単位で保存します。未キャッシュ時のquery単位p50/p95や料金は推測しません。
- `records`には順位と予測IDを残し、最終評価後の失敗分析に使用します。分析の結果で凍結設定を変えません。

## テストとGAS/GWS移植

`npm test` はAPIを呼ばないmockと検索の結合テストです。`npm run check` はsrc/scripts/testsの全JavaScriptを構文検査します。

GAS/GWSへ移植する際は、fetchをUrlFetchAppへ置換し、秘密情報の保存、キャッシュ保存、実行時間に応じたbatch分割、排他制御を用意します。検索・正規化・RRF・gateはJavaScript関数で分離されています。Node専用の入出力と計測処理は移植先の機能に置き換えてください。

## Apps Scriptへの追加検証

次元削減比較と導入手順は `apps-script/README.md` を参照してください。`npm run prepare:apps-script` は、FAQとDevelopmentのEmbeddingキャッシュからDriveへ配置するJSONを生成します。保存済みの比較結果は変更しません。次元比較を新規実行する場合だけ `npm run prepare:apps-script -- --compare` を使用します。比較結果が存在する場合は上書きを拒否します。元のHoldoutは再評価しません。

## 次元数の事後確認（順位を公開）

[`results/dimensions-additional.json.gz`](results/dimensions-additional.json.gz) には、3072次元の保存済みEmbeddingを先頭から切り詰め、L2正規化した追加分析の全質問の上位3件と集計をgzip圧縮して保存しました。Development 90問とHoldout 360問の3072・1536・768・384次元を収録します。これは**元の6方式のHoldout結果を固定した後の事後分析**です。次元数の選択にHoldoutを用いたものとして、元の事前評価と混同しないでください。

FAQ・問い合わせ・正解IDは `data/` に収録済みです。生成済みEmbeddingは約75 MBあり、元のAPI利用記録とともに `data/cache/` からGit対象外にしています。生成済みベクトル自体がない環境でも公開した順位と集計は確認できます。**同一ベクトルから独立に順位を再計算したい場合**は、実験時の `data/cache/{faq,development,holdout}-embeddings.json` を配置して `python -m pip install numpy` の後に `python scripts/verify-dimensions.py` を実行してください。スクリプトは元データ・キャッシュのハッシュと全順位を照合し、評価結果を書き換えずAPIも呼びません。キャッシュを再生成した場合には、モデル出力が異なりハッシュが一致しない可能性があります。
