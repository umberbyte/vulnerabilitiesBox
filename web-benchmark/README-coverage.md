# 実装範囲と検証状態

この資料は、開発順ではなく、現在利用できるケースと検証の到達点を示します。設計全体のID、根本原因の統合関係、入力契約は[設計JSON](../benchmark-design-v2.json)、実装ごとの状態は[実装状態JSON](implementation-status.json)にあります。アプリの`catalog`と`variant-catalog`は実際に選択できるケースを返します。

| 項目 | 現在値 | 意味 |
|---|---:|---|
| 設計 | 337根本原因／500変種 | 目標集合 |
| ソース実装 | 337根本原因／500変種 | V/F/Nへ切り替え可能なコードがある集合 |
| 未実装 | 0根本原因／0変種 | 設計上の未実装は解消 |
| 代表ケースの成立確認 | 旧210根本原因・V/F/N計630条件 | 保存された統合検証の確認範囲 |
| 追加変種の専用確認 | 56変種のV/F/N計168条件 | 22個の専用テストを順次実行 |
| 選択スモーク | 10変種のV/F計20条件 | [スモーク結果](artifacts/docker-smoke-selected.json) |

根本原因が同じ変種は一件に統合して採点します。Vは脆弱な処理、Fは修正版、Nは安全な類似入力です。FとNを新しい脆弱性として数えません。ソース実装は診断ツールによる検出の証拠ではありません。現行500変種すべてのV/F/N成立確認、ZAP・Burpの全体検出率測定は未実施です。Burp実測はライセンス調達後です。[統合検証結果](artifacts/full-regression.md)は保存された実行時点について上記の範囲を確認した資料です。現在のソースとの関係は、記録がある場合のソース比較と検証資料の監査で確認してください。PDFは文書内資源をHTTP取得して本文へ描画する小さなPDF生成器であり、汎用HTMLレンダラではありません。H2ヘッダケースはHPACK literal subsetを受ける専用fixtureであり、Node標準HTTP/2 parserの欠陥を主張しません。N-APIの6変種は隔離された子プロセスで実C addonをASan付きで実行し、5件はASan違反、1件は隣接秘密値の返却を成立根拠とします。

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

上表は索引です。全337根本原因・500変種の網羅表ではありません。`docker compose exec -T app node src/control.mjs catalog`と`variant-catalog`で現在の選択肢を確認してください。

未実装は0変種です。N-APIの6根本原因は設計どおり`native_lab`として独立集計し、通常のWeb DAST検出率には混ぜません。残る作業は現行500変種の全体成立確認と回帰、ZAPの検出測定、Burpライセンス調達後の同条件比較です。

利用者向けの入口は`verify.cmd`または`verify.sh`です。個別テストを再実行する場合は、先に`docker compose --profile test build verify`を済ませ、その後に現在のappから`BENCHMARK_CONTROL_KEY`を取得して`docker compose --profile test run --rm -T verify node tests/<名前>.mjs`を実行してください。キー取得後に`--build`を指定するとappが再作成され、キーが失効することがあります。

Daybreakや診断処理に依存しない評価ツールの検証は`verify.cmd tools`／`sh verify.sh tools`で実行できます。これは単体テストであり、上表のV/F/N成立確認を増やすものではありません。結果一覧のソース比較は記録したファイル範囲の一致を示し、当該検証で測っていないケースや別環境への有効性は保証しません。

保存資料の裏付けは`verification-audit.md`で確認できます。ログのハッシュと集計が一致しても、ソース記録のない過去の統合検証が現在のソースの合格を示すとは扱いません。最新の単体検証と過去の成立確認は別々の資料として保持します。

`reports.cmd`／`reports.sh`は`artifacts/coverage-inventory.md`と`coverage-inventory.json`も生成します。保存された個別のroot・variant・V/F/N結果を設計500変種へ対応させ、重複を除いて索引化します。旧`extended-regression.json`はファイル単位の集計だけを保持しているため、その168条件を個別行へ推測で割り振りません。新しい統合検証では変種IDと条件を記録します。個別記録未確認という表示は、未実施や欠陥を意味しません。

同じコマンドの`evidence-overview.md`では、代表となる一部変種のV/F/N記録と、根本原因内の全変種の記録を分け、比較領域・主分類・根本原因ごとに表示します。診断のV/F/N完走系列は、成立確認資料とは別の列で保持します。完走資料は検出・誤検出・対策の成功を示しません。反復や設定比較の系列を新しい脆弱性として数えず、異なる系列の条件を合算して完了にはしません。

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

## R0226の再確認

保存済みの`acceptance.json`ではB0226のVだけが、履歴セッションの時刻検査で失敗しています。旧fixtureは`idle-expired`の最終活動時刻が発行時刻より前で、履歴として不整合でした。fixtureを修正し、R0225/R0226のV/F/N計6条件をローカルDockerで再実行して全件合格しました。結果は`artifacts/acceptance-saved-r0225-r0226-20261004.json`に保存します。報告のソースは実行前後で一致しています。

集計は旧失敗記録を消さず、B0226を「合格記録と失敗記録の併存」として表示します。これは診断ツールによる検出確認や、依存サービスを含む環境の同一性確認ではありません。報告ファイルは各利用者のローカル成果物であり、公開Gitには含めません。

## 共有キャッシュ9変種の個別確認

R0371に属するB0372、B0373、B0374、B0375、B0376、B0385、B0386、B0388、B0389について、ローカルDocker上の実アプリとRedisを使い、V/F/N計27条件を個別に再確認しました。query、method、Accept、主体、認証状態、tenant、GET body、HTTP/HTTPSの違いを確認し、全条件が合格しました。B0389の成立確認では、検証コンテナー内の専用HTTPクライアントだけが実験用HTTPS証明書の検証を省略します。検証コンテナーと対象アプリの`src/`・package manifestのバイト一致、対象アプリの実行前後の一致を含む記録は`artifacts/extended-regression-saved-cache-full-vfn-20261004.json`に、各条件の結果は`artifacts/docker-smoke-cache-full-vfn-20261004.json`に保存します。これらは利用者ごとのローカル成果物であり、公開Gitには含めません。依存サービスのイメージや内部状態の同一性までは証明しません。

この9変種の成立確認はZAPの検出確認ではありません。

## CSRF許可条件8変種のサーバー側確認

R0311のB0312、B0315、B0317、B0318、B0327とR0319のB0320、B0321、B0322について、ローカルDockerでV/F/N計24条件を確認しました。正規tokenを持つ更新が成功し、条件を変えた更新はVのみ受理されて実DBの連絡先を変更し、F/Nでは拒否され、匿名更新も拒否されます。最終記録は`artifacts/extended-regression-saved-csrf-full-vfn-20261004.json`と`artifacts/docker-smoke-csrf-full-vfn-20261004.json`に保存します。検証コンテナーと対象アプリの実行ソース一致、および対象アプリの実行前後の一致を確認しています。

初回のB0317/VはHTTP 403で失敗しました。Vが`text/plain`のJSONを解析しても、後段でtokenを必須にしていたベンチマーク実装の不整合を修正しました。失敗時の記録は`artifacts/docker-smoke-csrf-vfn-20261004.json`と`artifacts/docker-smoke-csrf-text-diagnostic-20261004.json`に残し、最終の合格記録とは区別します。この8変種のサーバー側確認を、ブラウザーでの成立やZAP検出へ一般化しません。

### B0317の実ブラウザー確認

ChromiumでHTTPSの`Secure; SameSite=None`セッションを発行し、`https://evil.benchmark.test:8444`の実ページから、別オリジン`https://app.benchmark.test:8443`へ`text/plain`の`no-cors` POSTを送信しました。VではHTTP 200と実DBの連絡先変更、F/NではHTTP 415と変更なしを確認しました。正規token付き操作も3条件で成功しています。個別V/F/Nの最終記録は`artifacts/extended-regression-saved-csrf-browser-confirmed-v2-20261004.json`と`artifacts/docker-smoke-csrf-browser-confirmed-v2-20261004.json`です。検証・対象の実行ソースと対象の実行前後のソースが一致しました。これは**同一サイト内の別オリジン**という条件での成立であり、異なるサイト一般の成立を意味しません。

異なるサイト`https://attacker.test:8444`から送る試行は、Chromiumが第三者Cookieを付けず全条件HTTP 401でした。記録は`artifacts/docker-smoke-csrf-browser-vfn-v3-20261004.json`に残しています。また、404ページのCSPと合成ページのローカルアドレス制限による試行失敗も、それぞれ`artifacts/docker-smoke-csrf-browser-diagnostic2-20261004.json`、`artifacts/docker-smoke-csrf-browser-final-20261004.json`に残しました。これらは成立記録に算入しません。残る7変種の実ブラウザー条件とB0317のZAP検出は未確認です。

2026-10-04時点の保存記録では、500変種中338変種に個別V/F/N合格記録があり、161変種は個別記録なし、B0226の1変種には新旧の合格・失敗記録が併存します。
