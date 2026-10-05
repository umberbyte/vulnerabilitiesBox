# SSRF・プロキシ境界5変種の成立確認とZAP再計測（2026-10-05）

B0169、B0170、B0171、B0172、B0178をローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-ssrf-next-five-source-20261005.json)した。15セル・240チェックすべて通過し、確認前後の対象ソース証拠も一致した。アプリ側のHTTP fixtureはコンテナ内のループバックで待ち受けており、外部・顧客システムには診断通信していない。

[計画](artifacts/panel-ssrf-next-five-source-20261005.json)と[実行台帳](artifacts/panel-ssrf-next-five-source-20261005-ledger.json)で同じseed `acceptance-v1`、session認証、active profile、90秒/700リクエスト、最大同時2リクエストのZAP再計測を行った。15セルすべて`completed`、エラー0、通信drain完了。成立確認とスキャンの実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認時のリポジトリソース証拠は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービス・ホスト環境全体の状態一致は未証明である。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0169 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-40-47-345Z-49e3fd/zap-report.html) / [F](artifacts/zap-2026-10-05T09-41-25-423Z-f0ce9e/zap-report.html) / [N](artifacts/zap-2026-10-05T09-42-02-894Z-c5f3a3/zap-report.html) |
| B0170 | 662/662/662 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-42-40-295Z-51dce6/zap-report.html) / [F](artifacts/zap-2026-10-05T09-43-17-671Z-e38a6a/zap-report.html) / [N](artifacts/zap-2026-10-05T09-43-55-086Z-0e8697/zap-report.html) |
| B0171 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-44-32-415Z-7911ab/zap-report.html) / [F](artifacts/zap-2026-10-05T09-45-09-751Z-cf5330/zap-report.html) / [N](artifacts/zap-2026-10-05T09-45-47-115Z-387924/zap-report.html) |
| B0172 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-46-24-422Z-3966cc/zap-report.html) / [F](artifacts/zap-2026-10-05T09-47-01-726Z-ff0695/zap-report.html) / [N](artifacts/zap-2026-10-05T09-47-39-005Z-9343ae/zap-report.html) |
| B0178 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-48-16-328Z-a83d03/zap-report.html) / [F](artifacts/zap-2026-10-05T09-48-53-708Z-7dfd0f/zap-report.html) / [N](artifacts/zap-2026-10-05T09-49-31-029Z-6564bb/zap-report.html) |

保存アラートのplugin ID別件数は各変種のV/F/Nで同じだった。今回の警告はヘッダー・セッション関連の共通警告で、プロトコル・ポート・プロキシ・資格情報転送の各境界に固有のアラート差分は確認できない。保存された要求と内部fixtureの到達記録を成立条件に照らして確認するまでは、検出漏れ・検出率を確定しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが125から130変種、個別記録はあるがソース未対応が133から128変種になった。V/F/Nの完了スキャンがある258変種、依存環境まで完全対応済み0変種は変わらない。
