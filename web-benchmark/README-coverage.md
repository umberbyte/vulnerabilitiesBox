# 実装範囲と検証状態

この資料は、開発順ではなく、現在利用できるケースと検証の到達点を示します。設計全体のID、根本原因の統合関係、入力契約は[設計JSON](../benchmark-design-v2.json)、実装ごとの状態は[実装状態JSON](implementation-status.json)にあります。アプリの`catalog`と`variant-catalog`は実際に選択できるケースを返します。

| 項目 | 現在値 | 意味 |
|---|---:|---|
| 設計 | 337根本原因／500変種 | 目標集合 |
| ソース実装 | 324根本原因／485変種 | V/F/Nへ切り替え可能なコードがある集合 |
| 未実装 | 13根本原因／15変種 | 実際の処理がまだない集合 |
| 全条件の成立確認済み | 210根本原因・V/F/N計630条件 | **過去の210件版**で確認した履歴 |
| 現行ソースの局所Docker確認 | 10変種・V/F計20条件 | [結果](artifacts/docker-smoke-selected.json)。全20条件合格 |

根本原因が同じ変種は一件に統合して採点します。Vは脆弱な処理、Fは修正版、Nは安全な類似入力です。FとNを新しい脆弱性として数えません。ソース実装は診断ツールによる検出の証拠ではありません。現行485変種すべてのV/F/N成立確認、全体回帰、ZAP・Burpの検出率測定は未実施です。Burp実測はライセンス調達後です。直近の追加22変種は局所DockerでV/F/N計66条件を確認しました。PDFは文書内資源をHTTP取得して本文へ描画する小さなPDF生成器であり、汎用HTMLレンダラではありません。H2ヘッダケースはHPACK literal subsetを受ける専用fixtureであり、Node標準HTTP/2 parserの欠陥を主張しません。

## 代表的な対象

| 領域 | 例 | 実際に比較する処理 |
|---|---|---|
| SQL・入力解釈 | R0001、R0005、R0150 | PostgreSQLの値・式、重複JSONキーやmultipart等の解釈差 |
| ブラウザー | R0021、R0041、R0054 | HTML/DOM出力、prototype汚染と実ブラウザー上の結果 |
| 認証・セッション | R0200、R0221、R0241 | challenge再利用、Redisセッション固定、JWT検証 |
| 認可・業務フロー | R0271、R0291、R0391 | 他者文書、管理操作、サーバー側価格の採用 |
| ファイル・実行境界 | R0124、R0126、R0141 | ファイル読出し、リンク、隔離した実行ワーカー |
| キャッシュ・通信 | R0332、R0377、R0380 | CORS、共有キャッシュキー、エラー応答の混入 |
| 情報露出・設定 | R0455、R0478、R0481 | 公開ファイル、クライアント設定、DB例外詳細 |
| 有限の資源制限 | R0428、R0437–R0440 | 件数、通知、queue、retry、ログ追記量の上限 |

上表は索引です。全324根本原因・485変種の網羅表ではありません。`docker compose exec -T app node src/control.mjs catalog`と`variant-catalog`で現在の選択肢を確認してください。

## 未実装の15変種

| 技術領域 | 変種数 | 完了に必要なもの |
|---|---:|---|
| CLI・外部プログラム | 0 | 実ツールによる局所DockerのV/F/N確認済み |
| MongoDB・LDAP・XML処理 | 9 | LDAPとXML拡張関数の実処理系 |
| アーカイブ・文書・同名Cookieなど | 0 | PDF生成時の資源取得を局所Dockerで確認済み |
| gRPC・低レベルHTTP解析 | 0 | H2ヘッダの制御文字境界を局所Dockerで確認済み |
| N-API・native memory | 6 | クラッシュを隔離するworkerと計測 |
| **合計** | **15** | |

局所検証は、`BENCHMARK_CONTROL_KEY`を設定した後に `docker compose --profile test run --build --rm -T verify node tests/<名前>.mjs` で個別に再実行できます。直近の7変種は `batch6-mongo`、その前の7変種は `batch6-h2-header`、`batch6-xml`、さらに前の8変種は `batch6-cli-transport`、`batch6-cli-http`、`batch6-cli-media`、`batch6-pdf`、`batch6-grpc`、`batch6-h2` です。以前の15変種は `batch6-cli`、`batch6-cli-boundaries`、`batch6-multipart`、`batch6-duplicate-cl`、`batch6-te-grammar`、`batch6-encrypted-zip`、`batch6-docx`、さらに前の4変種は `batch6-cookie-shadow`、`batch6-tar`、`batch6-uploads` で確認できます。

依存エンジンの異なる欠陥をPostgreSQLだけで模倣したり、ヘッダ名だけを変えたりして実装済みとは数えません。正常系、Vの実結果、F/Nの防止、初期化を実環境で確認してから成立済みとします。

## 比較時の境界

- R0251はローカルIdPによるstate検証のfixtureです。OAuth/OIDC全体への適合性の評価ではありません。
- R0311とR0332は同一site・別originの条件です。R0332の認証付き`Origin: null`は`SameSite=None; Secure`とChromiumのsandbox条件を固定して成立を確認します。他のブラウザーへ一般化する際は再確認が必要です。
- R0461はHTTP開始点を必要とします。現行ZAP runnerが対象にするHTTPS入口だけでは測れず、`unsupported_target_surface`として未測定にします。R0457/R0458も別originの収集先を必要とします。
- R0477のHTTP cacheとService Workerの成立確認では、検証コンテナー内だけで実験用CAを信頼します。ホストの証明書ストアは変更しません。
- R0465・R0478・R0481は露出する情報が似ていても、debug経路、公開JS、例外処理という別々の欠陥境界です。同じ情報が見えることだけを理由に重複計上しません。
- R0428、R0437–R0440は小さな有限データで業務上限を評価します。CPU飽和やサービス停止を測る負荷試験ではありません。
- 状態を変える業務操作、ブラウザー実行、認証後の再利用、複数主体の操作には個別の到達確認が必要です。HTTP 200やZAPの終了だけで成立・検出と判定しません。

管理者用の計画、oracle、診断の生ログは公開リポジトリに含めていません。利用者ごとの実行結果は`artifacts/`へ保存します。
