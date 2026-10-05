# SSRF境界5変種の成立確認とZAP再計測（2026-10-05）

B0162、B0163、B0164、B0167、B0168をローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-ssrf-five-source-20261005.json)した。15セル・240チェックすべて通過し、確認前後の対象ソース証拠も一致した。アプリ側のHTTP fixtureはコンテナ内のループバックで待ち受けており、外部・顧客システムには診断通信していない。

[計画](artifacts/panel-ssrf-five-source-20261005.json)と[実行台帳](artifacts/panel-ssrf-five-source-20261005-ledger.json)で、同じseed `acceptance-v1`、session認証、active profile、90秒/700リクエスト、最大同時2リクエストのZAP再計測を行った。15セルすべて`completed`、エラー0、通信drain完了。成立確認とスキャンの実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認時のリポジトリソース証拠は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービス・ホスト環境全体の状態一致は未証明である。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0162 | 649/649/649 | 15/15/15 | [V](artifacts/zap-2026-10-05T09-26-02-171Z-db61e2/zap-report.html) / [F](artifacts/zap-2026-10-05T09-26-40-127Z-a1bacc/zap-report.html) / [N](artifacts/zap-2026-10-05T09-27-17-621Z-004089/zap-report.html) |
| B0163 | 649/649/649 | 15/15/15 | [V](artifacts/zap-2026-10-05T09-27-55-083Z-f9d84b/zap-report.html) / [F](artifacts/zap-2026-10-05T09-28-32-528Z-08d3d0/zap-report.html) / [N](artifacts/zap-2026-10-05T09-29-09-945Z-a025b6/zap-report.html) |
| B0164 | 649/649/649 | 15/15/15 | [V](artifacts/zap-2026-10-05T09-29-47-283Z-206bbb/zap-report.html) / [F](artifacts/zap-2026-10-05T09-30-22-599Z-7e9b12/zap-report.html) / [N](artifacts/zap-2026-10-05T09-30-59-947Z-ece4fc/zap-report.html) |
| B0167 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-31-37-310Z-b14640/zap-report.html) / [F](artifacts/zap-2026-10-05T09-32-14-646Z-5669bc/zap-report.html) / [N](artifacts/zap-2026-10-05T09-32-51-970Z-5161e7/zap-report.html) |
| B0168 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-33-29-265Z-62b293/zap-report.html) / [F](artifacts/zap-2026-10-05T09-34-06-521Z-4d0062/zap-report.html) / [N](artifacts/zap-2026-10-05T09-34-43-835Z-e8dbcd/zap-report.html) |

保存アラートのplugin ID別件数は各変種のV/F/Nで同じだった。記録された警告はヘッダー・セッション関連の共通警告であり、SSRF境界を固有に示すアラート差分は確認できない。スキャン要求のURL値、内部fixtureへの到達記録、成立条件を照合するまでは検出漏れ・検出率を確定しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが120から125変種、個別記録はあるがソース未対応が138から133変種になった。V/F/Nの完了スキャンがある258変種、依存環境まで完全対応済み0変種は変わらない。
