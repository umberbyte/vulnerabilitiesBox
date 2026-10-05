# コマンド・プロセス境界5変種の成立確認とZAP再計測（2026-10-05）

B0071、B0076、B0084、B0086、B0089をローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-command-five-source-20261005.json)した。15セル・240チェックすべて通過し、確認前後の対象ソース証拠も一致した。実行対象はベンチマークの隔離されたfixtureであり、外部・顧客システムには診断通信していない。

[計画](artifacts/panel-command-five-source-20261005.json)と[実行台帳](artifacts/panel-command-five-source-20261005-ledger.json)で、同じseed `acceptance-v1`、session認証、active profile、90秒/700リクエスト、最大同時2リクエストのZAP再計測を行った。15セルすべて`completed`、エラー0、通信drain完了。成立確認とスキャンの実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認時のリポジトリソース証拠は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービス・ホスト環境全体の状態一致は未証明である。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0071 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-56-03-380Z-a5409e/zap-report.html) / [F](artifacts/zap-2026-10-05T09-56-41-437Z-2a866c/zap-report.html) / [N](artifacts/zap-2026-10-05T09-57-18-959Z-a19daa/zap-report.html) |
| B0076 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-57-56-434Z-2cddd0/zap-report.html) / [F](artifacts/zap-2026-10-05T09-58-33-881Z-b865bf/zap-report.html) / [N](artifacts/zap-2026-10-05T09-59-11-296Z-e4c81a/zap-report.html) |
| B0084 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-59-48-652Z-712610/zap-report.html) / [F](artifacts/zap-2026-10-05T10-00-26-004Z-2be1af/zap-report.html) / [N](artifacts/zap-2026-10-05T10-01-03-355Z-96b646/zap-report.html) |
| B0086 | 456/456/456 | 16/16/16 | [V](artifacts/zap-2026-10-05T10-01-40-724Z-899125/zap-report.html) / [F](artifacts/zap-2026-10-05T10-02-08-493Z-95ded2/zap-report.html) / [N](artifacts/zap-2026-10-05T10-02-37-764Z-926b4b/zap-report.html) |
| B0089 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T10-03-05-486Z-c80001/zap-report.html) / [F](artifacts/zap-2026-10-05T10-03-42-912Z-c537f9/zap-report.html) / [N](artifacts/zap-2026-10-05T10-04-20-322Z-503008/zap-report.html) |

保存アラートのplugin ID別件数は各変種のV/F/Nで同じだった。今回の警告はヘッダー・セッション関連の共通警告で、コマンド・プロセス境界を固有に示す差分は確認できない。保存された要求が対象の実行条件に達したか、実行結果と結びつくかを照合するまでは検出漏れ・検出率を確定しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが130から135変種、個別記録はあるがソース未対応が128から123変種になった。V/F/Nの完了スキャンがある258変種、依存環境まで完全対応済み0変種は変わらない。
