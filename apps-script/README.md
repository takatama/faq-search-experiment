# Apps Script 検証の準備

768次元・Vector単独が第一候補です。Development 90問では3072/1536/768次元とも86問正解で、正解から誤答への入れ替わりもありませんでした。384次元は84問正解。元のHoldoutは再評価していません。

## 用意したもの

- `apps-script/Code.js`: Drive全件読込、時間計測、保存済み90問の評価、任意queryの検索。
- `apps-script/Vector.js`: Nodeテストと共通の純粋な検索関数。
- `data/apps-script/faq-index-768.json`: FAQ 661件と正規化済み768次元Vector。
- `data/apps-script/development-768.json`: 保存済みDevelopment queryとVector。
- 1536/3072次元版も同じ場所にあります。
- 比較結果: `results/dimensions-development-v1/report.json` と `report.md`。

クローン直後は `data/apps-script/` がGit管理外なので、上記の配布JSONはありません。Development用のFAQ・問い合わせEmbeddingキャッシュ（`data/cache/faq-embeddings.json`、`data/cache/development-embeddings.json`）を用意したうえで、`npm run prepare:apps-script` を実行して生成してください。既存の `results/dimensions-development-v1/` はそのまま残ります。このコマンドはaliasesキャッシュとAPIキーを必要としません。キャッシュがない場合は `npm run embeddings -- development` で生成できますが、APIを使用します。

保存済みの次元比較は当時のEmbeddingによるものです。新たに生成したEmbeddingで作る配布JSONが同じ順位・正解率になる保証はありません。未評価の環境で改めて比較結果を作る場合だけ `npm run prepare:apps-script -- --compare` を実行します。既に比較結果がある場合は上書きを拒否します。この比較モードには凍結済みのaliases・FAQ Embeddingキャッシュも必要です。

今回の配布JSONにはFAQ質問・回答と正規化済みVectorを含みます。768次元版は約11.1 MBです。以前の約6.5 MBは正規化前の数値とIDのみの概算です。正規化でJSON内の小数表記が長くなるため、配布サイズは異なります。座標数はどちらも768です。

## 1. Googleログイン

clasp 3.4.1をこのリポジトリだけに導入しました。PowerShellで以下を実行すると、Googleのログイン画面が開きます。

```powershell
Set-Location 'C:\Users\takat\OneDrive\ドキュメント\faq-search-experiment'
npm run clasp -- login
```

認証情報はclaspが管理します。内容をチャットへ貼らないでください。ログイン後、[Apps Script設定](https://script.google.com/home/usersettings)のGoogle Apps Script APIを有効にします。

## 2. 検証用プロジェクトを作成

既存プロジェクトを上書きせず、新しい検証用プロジェクトを作成します。`apps-script`フォルダーを送信対象に設定します。作成・pushはログイン後にCodexで進められます。`.claspignore`でCode.js、Vector.js、appsscript.jsonだけを送るようにしています。

## 3. Driveへデータを配置

検証用Driveフォルダーに、まず`faq-index-768.json`と`development-768.json`をアップロードします。Apps Scriptの「プロジェクトの設定」→「スクリプト プロパティ」に次を設定します。

| 名前 | 値 |
|---|---|
| FAQ_DIMENSIONS | 768 |
| FAQ_INDEX_768_FILE_ID | FAQ JSONのDriveファイルID |
| FAQ_DEV_768_FILE_ID | Development JSONのDriveファイルID |

ファイルIDは共有リンクの `/d/` と次の `/` の間です。一般公開にする必要はありません。実行するGoogleアカウントが読み取れるようにします。

## 4. APIを呼ばない初回検証

Apps Scriptのエディタで`benchmarkFaq`を選び実行します。初回はGoogleの権限確認が表示されます。結果は実行ログにJSONで表示されます。

確認項目: 正解86/90、API呼出0、Drive読込時間、JSON解析時間、検索p50/p95、全体時間。Date.nowによる1ミリ秒単位の測定です。JSONのファイルサイズは実行中のメモリ使用量ではありません。実機でのメモリ上限適合・待ち時間はこの実行で確認します。

毎回Driveから読み込む設計で、Apps Scriptの実行間キャッシュには頼りません。1536/3072版を比較するときは該当JSONを配置し、`FAQ_INDEX_1536_FILE_ID` / `FAQ_DEV_1536_FILE_ID`のように設定してFAQ_DIMENSIONSを変更します。

## 5. 実際に入力したqueryの検索

APIを呼ばない検証が済んでから、スクリプト プロパティへ `GEMINI_API_KEY` と `MAX_GEMINI_REQUESTS=4` を設定します。Windowsの環境変数はGoogle側へ自動では渡りません。キーをコード、データ、ログへ書きません。

`searchFaq('検索したい文章')` を呼ぶと、1回のEmbeddingリクエストと上位3件を返します。Gemini Embedding 2に768次元を指定します。429/5xxは最大4試行、上限超過前に停止します。例外にAPI応答本文やキーを出しません。最初の実API確認はMAX_GEMINI_REQUESTSを1にして行います。

`benchmarkFaq`だけならGeminiキーの設定も課金も不要です。claspから直接実行するための追加設定は初回検証には不要で、まずApps Scriptエディタから実行します。

## 現在の状態

ローカルの準備とmockテスト16件は完了。Googleログイン、クラウドへのコード・データ配置、Apps Script上の実測は未完了です。今回の準備でGemini APIは呼んでいません。
