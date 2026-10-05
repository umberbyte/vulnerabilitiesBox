# エンジン境界5変種の成立確認とZAP再計測（2026-10-05）

B0063、B0064、B0066、B0067、B0068をローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-engine-five-source-20261005.json)した。15セル・240チェックすべて通過し、確認前後の対象ソース証拠も一致した。外部・顧客システムには通信していない。

[計画](artifacts/panel-engine-five-source-20261005.json)と[実行台帳](artifacts/panel-engine-five-source-20261005-ledger.json)で同じseed `acceptance-v1`、session認証、active profile、90秒/700リクエスト、最大同時2リクエストのZAP再計測を行った。15セルすべて`completed`、エラー0、通信drain完了。成立確認とスキャンの実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認時のリポジトリソース証拠は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービス・ホスト環境全体の状態一致は未証明である。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0063 | 667/667/667 | 16/16/16 | [V](artifacts/zap-2026-10-05T08-54-01-966Z-884874/zap-report.html) / [F](artifacts/zap-2026-10-05T08-54-39-996Z-8dc93f/zap-report.html) / [N](artifacts/zap-2026-10-05T08-55-17-475Z-d8ed32/zap-report.html) |
| B0064 | 652/652/652 | 17/17/17 | [V](artifacts/zap-2026-10-05T08-55-54-878Z-bc9085/zap-report.html) / [F](artifacts/zap-2026-10-05T08-56-32-256Z-7fc4fe/zap-report.html) / [N](artifacts/zap-2026-10-05T08-57-09-637Z-4029a0/zap-report.html) |
| B0066 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T08-57-47-034Z-6584c6/zap-report.html) / [F](artifacts/zap-2026-10-05T08-58-24-383Z-82483f/zap-report.html) / [N](artifacts/zap-2026-10-05T08-59-01-749Z-294db1/zap-report.html) |
| B0067 | 662/662/662 | 16/16/16 | [V](artifacts/zap-2026-10-05T08-59-39-156Z-f9c1fb/zap-report.html) / [F](artifacts/zap-2026-10-05T09-00-16-998Z-1c524d/zap-report.html) / [N](artifacts/zap-2026-10-05T09-00-54-350Z-7a0108/zap-report.html) |
| B0068 | 662/662/662 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-01-31-639Z-1c4346/zap-report.html) / [F](artifacts/zap-2026-10-05T09-02-09-011Z-c42bfd/zap-report.html) / [N](artifacts/zap-2026-10-05T09-02-46-342Z-5c3777/zap-report.html) |

各変種のplugin ID別アラート件数はV/F/Nで同じだった。B0064にはplugin 90035のHigh「Server Side Template Injection」が各armで1件ずつある。保存されたmessage ID 403では、ZAPが`POST /r3e-0064`の`template`へ算術式を送信し、V/F/NともHTTP 200で式の計算結果が描画された。一方、各応答の`exposed`は`false`であり、この観測はB0064の境界である環境オプション経由の秘密情報露出を立証しない。正常なテンプレート描画機能と境界越えを分けてレビューする必要がある。共通のヘッダー・セッション警告も対象5件の検出率へ算入しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが110から115変種、個別記録はあるがソース未対応が148から143変種となった。V/F/Nの完了スキャンがある258変種、依存環境まで完全対応済み0変種は変わらない。
