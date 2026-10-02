# バッチ05: 残り93変種への着手

前回の407変種から、既存のNode.js・PostgreSQL・Redis・ブラウザ・WebSocket環境で再現できる**37変種**のソースを追加しました。うち5件は未実装だった根本原因の代表、32件は既存根本原因の追加変種です。現在のソースは**312根本原因／444変種**で、設計500変種の残りは**56変種**、未実装の根本原因は**25件**です。同根の変種を別の根本原因として数えていません。

| 分野 | 今回の追加 |
|---|---:|
| ファイル公開・ハードリンク | 6 |
| 認証・セッション・CSRF | 9 |
| multipart・JSON・query・圧縮の解釈差 | 5 |
| 共有キャッシュ | 4 |
| SQLエラー詳細 | 1 |
| ブラウザのモジュール・設定・postMessage | 6 |
| CORS・SSE・HTTP/HSTS・WebSocket | 6 |
| **合計** | **37** |

管理者CLIの `reset ROOT V|F|N seed [variant]` で個別に切り替えられます。代表312根本原因の[V/F/N計画936セル](artifacts/panel-catalog-444-source.json)と、今回の追加変種32件の[V/F/N計画96セル](artifacts/panel-batch-05-variants.json)を別に作成しました。どちらも全セル `not_run` です。[前回の100変種計画](artifacts/panel-batch-04-variants.json)は、新しいカタログになっても作成時点の100変種へ固定して検証できるよう修正しました。

設計ID・根本原因・公開API契約を37件照合し、キャッシュのpath境界、欠落したSec-Fetch-Site、重複JSONキー、WebSocket frame主体の代表境界を局所HTTP/WebSocketテストで確認しました。既存の公開契約と計画実行系の差分テストも通過しています。Docker DesktopのLinux Engineに接続し、既存環境とは別のComposeプロジェクトで[追加10変種のV/F計20条件](artifacts/batch5-docker-smoke.json)を確認し、20条件すべて合格しました。実際のPostgreSQL・Redis・WebSocket・ファイル操作を含みます。**これは37件全てのV/F/N成立、ブラウザ上の成立、現行全体の受入、全体回帰を意味しません。** 全体回帰は指定どおり後でまとめて行います。210件版の630セル合格履歴を現行ソースの合格として扱いません。

残る56変種の内訳は、CLI/外部プログラム15、MongoDB・LDAP・XML処理22、アーカイブ/文書/同名Cookie等7、gRPC・低レベルHTTP解析6、隔離N-API/native memory 6です。これらは実エンジン、実プロトコル、またはクラッシュを隔離するworkerを要します。PostgreSQL上の単純な模倣や、ヘッダ名だけの代替で実装済みと数えることは避けました。専用サービス・依存イメージ・制限付き実行環境を追加し、正常系・脆弱系・修正版を実際に確認する必要があります。

Burp Suite Professionalの実測はライセンス調達後です。ZAP/add-onの検出率や、顧客システムに対する実践投入適否も未測定です。
