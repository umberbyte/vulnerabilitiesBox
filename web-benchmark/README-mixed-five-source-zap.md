# 異なる入力経路5変種の成立確認とZAP再計測

2026-10-05にB0049（動的import）、B0127（ハードリンク公開）、B0150（multipart二重file）、B0459（一時ファイル残留）、B0462（HSTSなし降格）をローカルDockerで確認した。[個別V/F/N成立確認](artifacts/extended-regression-saved-mixed-five-source-20261005.json)は5変種・15セルすべて合格し、[セル別記録](artifacts/docker-smoke-mixed-five-source-20261005.json)を保存した。外部・顧客システムは対象にしていない。

[計画](artifacts/panel-mixed-five-source-20261005.json)と[台帳](artifacts/panel-mixed-five-source-20261005-ledger.json)にZAPの15セルを保存した。全セルは`completed`、実行エラー0、通信履歴の保存とdrainは完了した。seedは`batch5-docker-smoke`、profileは`active`、指定上限は90秒・700リクエスト、並列2リクエスト。成立確認と各ZAPセルの対象アプリ実行ソースSHA-256は`3857151b1f920ba5f58378688911d04d4b8fb11109b18854b555d388a6bea6d2`で一致した。依存サービスやホスト環境全体の一致までは証明していない。

| 変種 | V/F/Nの実行リクエスト数 | V/F/Nの保存済みZAP通信数 | V/F/Nの全アラート数 | ZAP HTML |
| --- | --- | --- | --- | --- |
| B0049 | 235/235/235 | 174/174/174 | 31/31/31 | [V](artifacts/zap-2026-10-05T06-47-03-100Z-efd6b9/zap-report.html)・[F](artifacts/zap-2026-10-05T06-47-20-108Z-fbd7cc/zap-report.html)・[N](artifacts/zap-2026-10-05T06-47-36-736Z-fda142/zap-report.html) |
| B0127 | 687/680/680 | 629/622/622 | 34/33/33 | [V](artifacts/zap-2026-10-05T06-47-57-357Z-f19bf2/zap-report.html)・[F](artifacts/zap-2026-10-05T06-48-37-691Z-9d9d1d/zap-report.html)・[N](artifacts/zap-2026-10-05T06-49-18-499Z-6ce885/zap-report.html) |
| B0150 | 235/235/235 | 174/174/174 | 32/32/32 | [V](artifacts/zap-2026-10-05T06-50-00-764Z-3b5043/zap-report.html)・[F](artifacts/zap-2026-10-05T06-50-17-306Z-b3afbf/zap-report.html)・[N](artifacts/zap-2026-10-05T06-50-35-835Z-635e8f/zap-report.html) |
| B0459 | 687/687/687 | 629/629/629 | 34/34/34 | [V](artifacts/zap-2026-10-05T06-50-54-476Z-5ff707/zap-report.html)・[F](artifacts/zap-2026-10-05T06-51-37-235Z-dbd843/zap-report.html)・[N](artifacts/zap-2026-10-05T06-52-17-974Z-878831/zap-report.html) |
| B0462 | 235/235/235 | 174/174/174 | 31/30/30 | [V](artifacts/zap-2026-10-05T06-53-00-711Z-af958f/zap-report.html)・[F](artifacts/zap-2026-10-05T06-53-19-238Z-b281df/zap-report.html)・[N](artifacts/zap-2026-10-05T06-53-37-718Z-b675b3/zap-report.html) |

保存された全通信を確認すると、各変種のエンドポイントには到達した。しかしB0049の`module=`、B0127の`linked.txt`、B0459の`temporary.txt`、B0462の`/v5-transport/login`へのリクエストは見つからなかった。B0150でも二重fileの入力が送られた証拠は確認できなかった。対象ページに到達しただけで脆弱性成立や検出を数えない。

B0127のVにだけ増えたLowアラートは、`POST /v5-files`への`X-Content-Type-Options Header Missing`（plugin 10021）であり、ハードリンクからの保護ファイル公開を示すものではない。B0462のVにだけ増えたLowアラートは、`GET /v5-transport`への`Strict-Transport-Security Header Not Set`（plugin 10035）である。こちらも変種のHTTP資格情報送信経路`/v5-transport/login`をZAPが通った証拠はなく、現時点では関連する構成差分の候補として扱い、TPを確定しない。その他のアラート数は各変種のV/F/Nで同数だった。Highアラートはいずれも0件。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが81から86変種、個別成立記録はあるがソース対応未確認が177から172変種となった。V/F/N完走系列がある変種は258のまま、依存環境の完全対応済みは0のままである。
