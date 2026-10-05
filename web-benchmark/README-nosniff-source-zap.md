# B0471 nosniff欠落誤配信の成立確認とZAP再計測

2026-10-05にB0471をローカルDockerで確認した。[個別V/F/N成立確認](artifacts/extended-regression-saved-nosniff-source-20261005.json)は3セルすべて合格し、[セル別記録](artifacts/docker-smoke-nosniff-source-20261005.json)を保存した。ブラウザー確認にはDocker内のsecure origin `https://app.benchmark.test:8443`を指定した。成立確認は、通常のJavaScriptが実行され、`text/plain`の追加スクリプトはVだけで実行され、F/Nでは実行されないことを検査する。外部・顧客システムは対象にしていない。

[計画](artifacts/panel-nosniff-source-20261005.json)と[台帳](artifacts/panel-nosniff-source-20261005-ledger.json)にZAPの3セルを保存した。全セルは`completed`、実行エラー0、通信履歴の保存とdrainは完了した。seedは`batch5-docker-smoke`、profileは`active`、session認証、指定上限は90秒・700リクエスト、並列2リクエスト。成立確認と各ZAPセルの対象アプリ実行ソースSHA-256は`3857151b1f920ba5f58378688911d04d4b8fb11109b18854b555d388a6bea6d2`で一致した。依存サービスやホスト環境全体の一致までは証明していない。

| arm | 実行リクエスト数 | 保存済みZAP通信数 | 全アラート数 | ZAP HTML |
| --- | ---: | ---: | ---: | --- |
| V | 278 | 207 | 19 | [レポート](artifacts/zap-2026-10-05T07-36-54-264Z-29116c/zap-report.html) |
| F | 280 | 209 | 18 | [レポート](artifacts/zap-2026-10-05T07-37-14-075Z-94055a/zap-report.html) |
| N | 280 | 209 | 18 | [レポート](artifacts/zap-2026-10-05T07-37-35-359Z-16d1f0/zap-report.html) |

3セルとも`/r3-0471/plain`に到達した。保存済みHTTP履歴では、その応答は3セルとも`200 OK`かつ`Content-Type: text/plain; charset=utf-8`である。Vには`X-Content-Type-Options`がなく、F/Nには`X-Content-Type-Options: nosniff`がある。ZAPのplugin 10021「X-Content-Type-Options Header Missing」はVの当該URLにだけLowアラートを付け、F/Nには付けなかった。このURLに限定すれば、アラートとヘッダー差分は一致する。他のURLには3セル共通のヘッダー欠落アラートもあるため、plugin IDだけで当該欠陥の検出数を数えない。ZAPがブラウザーでの追加スクリプト実行まで確認した記録はなく、現段階では対象に関連する構成差分の検出候補として扱う。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが94から95変種、個別成立記録はあるがソース対応未確認が164から163変種となった。V/F/N完走系列がある変種は258のまま、依存環境の完全対応済みは0のままである。
