# CLI境界7変種の成立確認とZAP再計測（2026-10-05）

B0079、B0081、B0083、B0085、B0087、B0088、B0090について、ローカルDockerで既存の`tests/batch6-cli-boundaries.mjs`をソース照合付きで再実行し、[個別V/F/N成立記録](artifacts/extended-regression-source-link-cli-boundaries-seven-20261005.json)を保存した。21セルがすべて通過し、検証前後のソースと実行中の対象ソースも一致した。この記録は固定ベンチマークfixtureの成立確認であり、外部・顧客システムには診断通信していない。

[計画](artifacts/panel-cli-boundaries-seven-source-20261005.json)と[21セルの台帳](artifacts/panel-cli-boundaries-seven-source-20261005-ledger.json)で、同じseed `cli-boundary-acceptance-v1`、session認証の`alice`、active profile、90秒/700リクエスト、最大同時2リクエストとしてZAP再計測した。全セルが`completed`で、本人識別、保護された正常操作への到達、通信drain、ZAP HTMLの保存を確認した。

| 変種 | V/F/Nの保存要求数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0079 | 453/456/456 | 16/16/16 | [V](artifacts/zap-2026-10-05T12-57-57-506Z-71fef4/zap-report.html) / [F](artifacts/zap-2026-10-05T12-58-27-478Z-811ed1/zap-report.html) / [N](artifacts/zap-2026-10-05T12-58-54-854Z-0cd3f4/zap-report.html) |
| B0081 | 675/688/688 | 20/19/19 | [V](artifacts/zap-2026-10-05T12-59-22-175Z-eb3c1f/zap-report.html) / [F](artifacts/zap-2026-10-05T12-59-57-631Z-5a5dba/zap-report.html) / [N](artifacts/zap-2026-10-05T13-00-31-023Z-49b077/zap-report.html) |
| B0083 | 442/453/453 | 17/16/16 | [V](artifacts/zap-2026-10-05T13-01-04-389Z-a3da7f/zap-report.html) / [F](artifacts/zap-2026-10-05T13-01-33-664Z-aca847/zap-report.html) / [N](artifacts/zap-2026-10-05T13-02-01-389Z-1c6156/zap-report.html) |
| B0085 | 456/456/456 | 16/16/16 | [V](artifacts/zap-2026-10-05T13-02-28-652Z-03dd81/zap-report.html) / [F](artifacts/zap-2026-10-05T13-02-56-379Z-ee7f47/zap-report.html) / [N](artifacts/zap-2026-10-05T13-03-24-161Z-946823/zap-report.html) |
| B0087 | 442/453/453 | 18/16/16 | [V](artifacts/zap-2026-10-05T13-03-51-854Z-44fac0/zap-report.html) / [F](artifacts/zap-2026-10-05T13-04-21-594Z-ab5df4/zap-report.html) / [N](artifacts/zap-2026-10-05T13-04-48-820Z-60d6d9/zap-report.html) |
| B0088 | 442/453/453 | 17/16/16 | [V](artifacts/zap-2026-10-05T13-05-18-107Z-8a7eae/zap-report.html) / [F](artifacts/zap-2026-10-05T13-05-47-849Z-e37091/zap-report.html) / [N](artifacts/zap-2026-10-05T13-06-15-562Z-eb1c97/zap-report.html) |
| B0090 | 455/456/456 | 16/16/16 | [V](artifacts/zap-2026-10-05T13-06-43-260Z-8217b1/zap-report.html) / [F](artifacts/zap-2026-10-05T13-07-14-505Z-bd3b9a/zap-report.html) / [N](artifacts/zap-2026-10-05T13-07-44-232Z-03c4f9/zap-report.html) |

成立確認と21回のZAP計測で対象の実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`と一致した。成立確認時のリポジトリソースSHA-256は`f1ae1c3b70b7247ff68b433d8638743b8c49f5c2ec599727005e22a36004c2fb`。依存サービスの実イメージID、DB・Redis等の状態、ホスト資源までの一致は未証明である。

B0081、B0083、B0087、B0088ではVだけにHighのplugin `90020`（OSコマンド実行）が出た。保存済みの最初の500件のHTTP履歴では、各Vに該当プローブへの応答が2件ずつあり、応答に`root:x:0:0`が含まれた。F/Nでは同種プローブの保存記録はあるが、この応答証拠は0件だった。これは対象エンドポイント上のコマンド実行を示す強い候補である。ただし各変種の採点は、根本原因と観測経路の対応、他の反復、F/Nの負例をレビューしてから確定する。

B0087のVだけにHighのplugin `90035`（テンプレート注入）も出た。保存された要求・応答ではテンプレート構文は評価されず、括弧を含む形で応答に残った。テンプレート注入の成立証拠としては扱わず、警告分類の誤り候補として別にレビューする。B0079、B0085、B0090はV/F/Nでplugin IDの集合が同じで、ZAP完走から対象欠陥の検出を推定しない。

検出漏れの確認候補はB0079の圧縮hook、B0085のPATH探索、B0090のレスポンスファイルである。まず保存済み履歴で対象入力点へ実際に到達したかを確認し、未到達なら探索・入力点設定、到達済みなら各構文に対応するルールの有無を調べる。現時点では未検出と確定せず、対策の採否も保留する。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みが182から189変種、個別記録はあるがソース未対応が76から69変種になった。V/F/Nの完走系列がある258変種、依存環境まで完全対応済みの0変種は変わらない。
