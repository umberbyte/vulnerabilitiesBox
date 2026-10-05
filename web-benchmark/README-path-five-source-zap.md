# パス・ファイル境界代表5変種の成立確認とZAP再計測

2026-10-05にB0121（相対パストラバーサル）、B0123（二段デコード）、B0124（URLとFS区切り差）、B0126（シンボリックリンク読込）、B0135（相対static root）をローカルDockerで確認した。[正式な個別V/F/N成立確認](artifacts/acceptance-saved-path-five-source-20261005.json)は15セル・251チェックすべて合格した。成立確認の前後で対象アプリの実行ソース証拠が安定していることを確認した。外部・顧客システムは対象にしていない。

[計画](artifacts/panel-path-five-source-20261005.json)と[台帳](artifacts/panel-path-five-source-20261005-ledger.json)にZAPの15セルを保存した。全セルは`completed`、実行エラー0、通信履歴の保存とdrainは完了した。seedは`acceptance-v1`、profileは`active`、匿名認証、指定上限は90秒・700リクエスト、並列2リクエスト。成立確認と各ZAPセルの対象アプリ実行ソースSHA-256は`3857151b1f920ba5f58378688911d04d4b8fb11109b18854b555d388a6bea6d2`で一致した。依存サービスやホスト環境全体の一致までは証明していない。

| 変種 | V/F/Nの実行リクエスト数 | V/F/Nの保存済みZAP通信数 | V/F/Nの全アラート数 | ZAP HTML |
| --- | --- | --- | --- | --- |
| B0121 | 465/465/465 | 404/404/404 | 32/32/32 | [V](artifacts/zap-2026-10-05T08-09-14-729Z-419a24/zap-report.html)・[F](artifacts/zap-2026-10-05T08-09-45-381Z-93f5f9/zap-report.html)・[N](artifacts/zap-2026-10-05T08-10-14-075Z-615c56/zap-report.html) |
| B0123 | 465/465/465 | 404/404/404 | 32/32/32 | [V](artifacts/zap-2026-10-05T08-10-44-711Z-f40254/zap-report.html)・[F](artifacts/zap-2026-10-05T08-11-15-370Z-cd3b53/zap-report.html)・[N](artifacts/zap-2026-10-05T08-11-46-031Z-0dd3b5/zap-report.html) |
| B0124 | 445/445/445 | 384/384/384 | 29/29/29 | [V](artifacts/zap-2026-10-05T08-12-14-656Z-34a7c8/zap-report.html)・[F](artifacts/zap-2026-10-05T08-12-43-292Z-df38da/zap-report.html)・[N](artifacts/zap-2026-10-05T08-13-09-846Z-002df1/zap-report.html) |
| B0126 | 465/465/465 | 404/404/404 | 32/32/32 | [V](artifacts/zap-2026-10-05T08-13-36-438Z-c3336f/zap-report.html)・[F](artifacts/zap-2026-10-05T08-14-05-028Z-386404/zap-report.html)・[N](artifacts/zap-2026-10-05T08-14-35-601Z-b7e4c0/zap-report.html) |
| B0135 | 540/540/540 | 483/483/483 | 37/37/37 | [V](artifacts/zap-2026-10-05T08-15-04-177Z-435272/zap-report.html)・[F](artifacts/zap-2026-10-05T08-15-34-829Z-60ce2f/zap-report.html)・[N](artifacts/zap-2026-10-05T08-16-05-427Z-cd604a/zap-report.html) |

保存済みアラートをplugin ID・URL・HTTPメソッド・パラメータ単位で照合した範囲では、5変種ともVだけに出るアラートはなかった。plugin別件数も各変種のV/F/Nで同じで、Highアラートは0件だった。これだけでは、ZAPが脆弱なパスを試していないのか、試したが成立証拠を認識していないのかを区別できない。送信パス・応答・内部fixtureのアクセス記録を個別に照合するまで、検出漏れを確定しない。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが100から105変種、個別成立記録はあるがソース対応未確認が158から153変種となった。V/F/N完走系列がある変種は258のまま、依存環境の完全対応済みは0のままである。
