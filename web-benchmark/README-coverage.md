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

初回のB0317/VはHTTP 403で失敗しました。Vが`text/plain`のJSONを解析しても、後段でtokenを必須にしていたベンチマーク実装の不整合を修正しました。失敗時の記録は`artifacts/docker-smoke-csrf-vfn-20261004.json`と`artifacts/docker-smoke-csrf-text-diagnostic-20261004.json`に残し、最終の合格記録とは区別します。サーバー側の受理だけをブラウザーでの成立やZAP検出へ一般化しません。

### CSRF許可条件8変種の実ブラウザー確認

ChromiumでHTTPSの`Secure; SameSite=None`セッションを発行し、`https://evil.benchmark.test:8444`の実ページから別オリジン`https://app.benchmark.test:8443`へ送信しました。B0312はtokenなし、B0315は`_method=DELETE`、B0317は`text/plain`のJSON、B0318はtoken値を知らずに固定長48文字、B0327は実際のmultipart、B0320はsandbox iframeの`Origin: null`、B0321はRefererなし、B0322はURL内に対象ホスト名を含むRefererを使いました。B0322のReferer送信には`unsafe-url`を明示しています。

8変種のV/F/N計24条件で、正規token付き操作が成功した後、ブラウザーからの送信はVのみHTTP 200で実DBの連絡先を変更し、F/Nでは変更しませんでした。F/Nの応答はB0317がHTTP 415、ほかはHTTP 403です。最終記録は`artifacts/extended-regression-saved-csrf-browser-eight-initial-20261005.json`と`artifacts/docker-smoke-csrf-browser-eight-initial-20261005.json`です。検証・対象の実行ソースと対象の実行前後のソースが一致しました。これは**同一サイト内の別オリジン**という条件での成立であり、異なるサイト一般の成立を意味しません。

B0317を異なるサイト`https://attacker.test:8444`から送る試行は、Chromiumが第三者Cookieを付けず全条件HTTP 401でした。記録は`artifacts/docker-smoke-csrf-browser-vfn-v3-20261004.json`に残しています。また、404ページのCSPと合成ページのローカルアドレス制限による試行失敗も、それぞれ`artifacts/docker-smoke-csrf-browser-diagnostic2-20261004.json`、`artifacts/docker-smoke-csrf-browser-final-20261004.json`に残しました。これらは成立記録に算入しません。8変種のZAP検出と、異なるサイトからの成立条件は未確認です。

### CORS許可条件3変種の成立範囲

B0334とB0336では、HTTPSで認証後、別オリジンの実ページから認証付き`fetch`で会員レポートを取得しました。B0334は`evil.benchmark.test:8444`、B0336は`app.benchmark.test:8444`を攻撃元とし、Vのみブラウザーが実際のprivate canaryを読め、F/NはCORSで読めませんでした。正規の同一オリジン操作も各条件で成功しています。同じセッションのAPI要求では3条件ともHTTP 200でprivate canaryを含む応答を受け、CORS許可ヘッダーはVにだけ付きます。V/F/N計6条件の最終記録は`artifacts/extended-regression-saved-cors-browser-confirmed-20261005.json`と`artifacts/docker-smoke-cors-browser-confirmed-20261005.json`です。検証・対象の実行ソースと対象の実行前後のソースが一致しています。F/Nのブラウザー応答をPlaywrightの`response`イベントで直接待つ試行はタイムアウトしたため、失敗記録`artifacts/docker-smoke-cors-browser-response-20261005.json`を残し、合格記録には算入しません。

B0335は、`Origin: http://app.benchmark.test:8443`を手で付けたHTTP要求ではVだけが許可ヘッダーを返し、F/Nでは返さないことを確認しました。しかし現在のDocker構成で同originの実ページを提供できず、ブラウザーが会員データを読めることは未確認です。再実行可能な`tests/cors-b0335-diagnostic.mjs`と`artifacts/cors-b0335-server-predicate-20261005.json`を診断記録として残します。最初の混合集計は`artifacts/docker-smoke-cors-three-initial-20261005.json`と`artifacts/diagnostic-extended-cors-three-initial-20261005.json`として保全し、個別V/F/N成立の集計には算入しません。攻撃元を実在させる構成とCookie送信条件を整えてから再判定します。3変種ともZAP検出は未確認です。

### 公開ファイル配置5変種の実ファイル確認

B0459、B0460、B0467、B0468、B0469について、ローカルDockerのtmpfsに実ファイルを配置し、V/F/N計15条件を確認しました。各条件で公開ガイドは読め、秘密を含む一時ファイル、バックアップ、ソースマップ、VCSメタデータ、設定ファイルはVのみHTTP 200で実際のprivate canaryを返し、F/NではHTTP 404でした。B0459は正常な処理操作の前には一時ファイルが存在しないことも確認しました。private oracleの実ファイル監査と公開応答の結果は一致しています。最終記録は`artifacts/extended-regression-saved-file-exposure-five-confirmed-20261005.json`と`artifacts/docker-smoke-file-exposure-five-confirmed-20261005.json`で、検証・対象の実行ソースと対象の実行前後のソースが一致しました。

初回はB0459の3条件だけ通り、残る変種は環境リセット時にHTTP 400で止まりました。応答本文に`vulnerable is not a function`とあり、アプリが実ファイル配置処理へ必要な関数を渡していない実装不整合を修正しました。失敗記録は`artifacts/docker-smoke-file-exposure-five-20261005.json`と`artifacts/docker-smoke-file-exposure-five-diagnostic-20261005.json`に保全し、成立件数に算入しません。この5変種のZAP検出は未確認です。

### ブラウザーとライフサイクル5変種の個別確認

B0471、B0483、B0485、B0489、B0490について、ローカルDockerでV/F/N計15条件を確認しました。B0471は実Chromiumで正常なJavaScriptを保ちつつ、`text/plain`のclassic scriptがVのみ実行されました。B0483は実loopback認可サービスの切断時にVのみ一般会員の特権操作が実DBへ記録され、正常な管理者操作は全条件で成功しました。B0485は正規tokenでの変更と誤tokenの拒否を確認し、検証サービス切断時にはVだけが誤tokenによる実DBの連絡先変更を許しました。B0489は正誤両方の認証結果を保ったまま、Vだけが実ログへpasswordを保存しました。B0490は隔離worker内の例外によってVだけ後続jobが失われ、Webアプリ本体が応答を続けることを確認しました。

最終記録は`artifacts/extended-regression-saved-lifecycle-five-initial-20261005.json`と`artifacts/docker-smoke-lifecycle-five-initial-20261005.json`です。検証・対象の実行ソースと対象の実行前後のソースが一致しました。B0489はaudit領域、B0490は隔離worker内の条件であり、一般のWeb DAST検出へそのまま換算しません。この5変種のZAP検出は未確認です。

### 文書・会員認可15変種の個別成立確認

B0274、B0276、B0277、B0278、B0286、B0289では、本人文書の通常操作を先に実行し、他人または別tenantの文書に対する一覧・集計・検索・非同期結果・複製・関連展開を比較しました。B0288、B0295、B0304では通常の会員属性読取と、秘密属性を含むカード・GraphQL・CSV出力を比較しました。B0297、B0298、B0299では通常の連絡先更新後、保護されたrole更新を試し、専用監査値で実DBのroleと連絡先を確認しました。B0292、B0293、B0294では管理者の正規操作後に一般会員の同じ管理操作を試し、操作履歴を照合しました。

ローカルDockerで15変種のV/F/N計45条件がすべて合格しました。最終記録は`artifacts/extended-regression-saved-authorization-fifteen-20261005.json`と`artifacts/docker-smoke-authorization-fifteen-20261005.json`です。検証側と対象アプリの実行ソース、および対象の実行前後のソースが一致しました。初回はB0297～B0299の照合で、一般oracleのユーザー一覧にroleが含まれると誤認したため9条件が失敗しました。専用監査値へ照合先を修正し、初回の失敗記録は`artifacts/diagnostic-extended-authorization-fifteen-initial-20261005.json`と`artifacts/diagnostic-docker-smoke-authorization-fifteen-initial-20261005.json`に保全しました。これらのZAP検出は未確認です。

### 会員状態10変種の個別成立確認

B0214、B0215、B0216では本人の連絡先変更・両方のメール確認を通常操作として成立させ、再認証・旧パスワード・旧メール確認を欠く要求を比較しました。B0205、B0213、B0257では正規発行したトークンの初回利用と二回目の利用を比べ、実DBの使用済み状態を照合しました。B0229では管理者が会員を停止した後の既存セッション、B0302では管理者roleを降格した後の既存セッションによる保護操作を比べました。B0209とB0345では、発行された本人回復トークンが診断ログ・アクセスログへ記録されるかを専用監査値で確認しました。

ローカルDockerで10変種のV/F/N計30条件がすべて合格しました。最終記録は`artifacts/extended-regression-saved-account-ten-20261005.json`と`artifacts/docker-smoke-account-ten-20261005.json`です。先行する6変種18条件の記録も`artifacts/extended-regression-saved-account-six-20261005.json`と`artifacts/docker-smoke-account-six-20261005.json`に残しています。検証側と対象アプリの実行ソース、および対象の実行前後のソースが一致しました。これらのZAP検出は未確認です。

### 会員認証・秘密の扱い5変種の個別成立確認

B0192では正しいパスワードでの専用ログインとセッション成立を確認した後、同じ接頭8文字を持つ誤パスワードを比較しました。B0296では通常の連絡先更新後、roleを混ぜた会員モデル更新を行い、管理画面への到達と実DB更新イベントを照合しました。B0212では本人回復コードの発行、会員設定内の保存表現、正規の単回利用、二回目の拒否を確認しました。B0231とB0454では正規の会員リンクをChromiumでローカルHTTPS上に開き、セッションIDまたは秘密値が実際のブラウザURLへ残るかを比較しました。

5変種のV/F/N計15条件がすべて合格しました。最終記録は`artifacts/extended-regression-saved-identity-five-20261005.json`と`artifacts/docker-smoke-identity-five-20261005.json`です。検証側・対象アプリの実行ソースと対象の実行前後のソースは一致しました。初回はChromium実行ファイルの指定漏れ、二回目はHTTP接続に対するChromiumのTLSエラーでB0231/B0454が止まりました。失敗記録は`artifacts/diagnostic-extended-identity-five-initial-20261005.json`と`artifacts/diagnostic-extended-identity-five-chromium-20261005.json`、対応する`diagnostic-docker-smoke-*`に保全しています。これらのZAP検出は未確認です。

B0094は設計名が「Mongo projection」ですが、現行の`src/cases/batch4-auth-profile.mjs`はPostgreSQLの会員属性を読んで出力フィールドを絞る実装です。フィールド認可の比較には使えても、MongoDBのprojectionの診断評価とは同一視できません。実装の適合性を確認するまで、B0094の個別成立数を増やす対象から外しています。

### WebSocket・SSE 6変種の個別成立確認

B0343では本人のWebSocket部屋の読取を正常に通し、別会員の部屋へのframeを比較しました。B0344では管理者の正規WebSocket操作を通した後、一般会員の同操作を試し、実DBの操作履歴を照合しました。B0349では本人向けのSSEリンクを画面から確認し、全条件で本人文書の通常読取を成立させてから、別tenant指定による文書越境を比較しました。B0350では本人の再接続cursorと別会員のcursorを比較し、SSE本文と選択された主体の監査イベントを確認しました。B0240では接続中のWebSocketで通常frameを受け取ってからログアウトし、**同じ接続**の次のframeと失効後の監査イベントを比較しました。B0341ではChromiumの同originページと別originページから認証付きWebSocketを開き、実際のブラウザOriginで読取可否を確認しました。

ローカルDockerで6変種のV/F/N計18条件が合格しました。現行実装の最終記録は`artifacts/extended-regression-saved-stream-six-final-20261005.json`と`artifacts/docker-smoke-stream-six-final-20261005.json`です。検証側・対象アプリの実行ソースと対象の実行前後のソースが一致しました。初回の6変種一括実行では、追加2変種の画面取得・画面要素待機が失敗しました。さらに旧B0349はVで常に同一tenantの別会員文書を返しており、設計した別tenant漏れと通常読取の維持を満たしていませんでした。対象実装を修正し、古い成立記録を診断資料へ移しました。集計から除外した記録は`artifacts/diagnostic-extended-stream-six-initial-20261005.json`、`artifacts/diagnostic-extended-stream-four-pre-tenant-fix-20261005.json`、`artifacts/diagnostic-extended-stream-six-pre-link-20261005.json`です。初回失敗の詳細は`artifacts/diagnostic-docker-smoke-stream-six-initial-20261005.json`、旧実装の詳細は対応する元の`docker-smoke-stream-*-20261005.json`に残しています。ZAPによる検出は未確認です。

### 署名・復元・queueと共通ルートの個別確認

B0242とB0245では、管理者の正規署名トークンによる読取を通した後、一般会員のclaimを管理者へ変更し、公開RSA鍵または別のローカルfixture鍵で署名したトークンを比較しました。B0250では通常のNoteをworkerで復元し、別の型を復元した場合のworker markerを監査値で照合しました。B0480では本人のRedis queueへの正常な追加を通し、別会員queueへの追加と保存済みjob・操作履歴を比較しました。4変種のV/F/N計12条件は`artifacts/extended-regression-saved-signed-worker-four-confirmed-20261005.json`と`artifacts/docker-smoke-signed-worker-four-confirmed-20261005.json`に記録しました。

同じURLを使う複数rootで、先に登録された別rootの経路が404を返し、後続の正常経路へ進まない問題を修正しました。R0234、R0237、R0240、R0242、R0245、R0341の6 root・V/F/N計18条件を既存の成立テストで再確認し、`artifacts/acceptance-saved-gate-routing-source-linked-20261005.json`に記録しました。R0234の初回実行ではテスト側がoriginを二重連結したため対象へ到達できず、URLを修正しています。失敗記録は`artifacts/diagnostic-acceptance-gate-routing-initial-20261005.json`に保全しました。初回のB0245正常画面の失敗は`artifacts/diagnostic-extended-signed-worker-four-initial-20261005.json`と対応する`diagnostic-docker-smoke-*`に保全しています。

今回の最終記録は、検証ソースの前後、検証側と対象アプリの実行ソース、対象アプリの実行前後の照合がすべて一致しました。成立確認の追加は重複を除く6変種であり、ZAP検出の測定ではありません。

2026-10-05時点の保存記録では、500変種中392変種に個別V/F/N合格記録があり、107変種は個別記録なし、B0226の1変種には新旧の合格・失敗記録が併存します。
