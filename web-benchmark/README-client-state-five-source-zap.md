# クライアント状態・エンジン境界5変種の成立確認とZAP再計測（2026-10-05）

B0145、B0179、B0313、B0453、B0455について、ローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-client-state-five-source-20261005.json)を実行した。15セル・283チェックがすべて通過し、確認前後のリポジトリソースも一致した。対象は固定されたベンチマークfixtureであり、外部・顧客システムへの診断通信は行っていない。

[計画](artifacts/panel-client-state-five-source-20261005.json)と[実行台帳](artifacts/panel-client-state-five-source-20261005-ledger.json)で、同一seed `acceptance-v1`、session認証の`alice`、active profile、90秒/700リクエスト、最大同時2リクエストとしてZAP再計測を行った。15セルはすべて`completed`、エラー0、通信drain完了。各セルの本人識別、保護された正常操作への到達とZAP HTML保存を確認した。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0145 | 255/255/257 | 16/16/16 | [V](artifacts/zap-2026-10-05T11-48-52-377Z-a7d81f/zap-report.html) / [F](artifacts/zap-2026-10-05T11-49-10-163Z-c5cf2b/zap-report.html) / [N](artifacts/zap-2026-10-05T11-49-27-978Z-eb1c3f/zap-report.html) |
| B0179 | 649/649/649 | 15/15/15 | [V](artifacts/zap-2026-10-05T11-49-47-223Z-2c2449/zap-report.html) / [F](artifacts/zap-2026-10-05T11-50-24-736Z-2e7d42/zap-report.html) / [N](artifacts/zap-2026-10-05T11-51-02-200Z-e286de/zap-report.html) |
| B0313 | 652/652/652 | 15/15/15 | [V](artifacts/zap-2026-10-05T11-51-39-644Z-395729/zap-report.html) / [F](artifacts/zap-2026-10-05T11-52-17-031Z-a672e6/zap-report.html) / [N](artifacts/zap-2026-10-05T11-52-54-464Z-34d859/zap-report.html) |
| B0453 | 275/273/275 | 32/32/32 | [V](artifacts/zap-2026-10-05T11-53-31-858Z-3fbb81/zap-report.html) / [F](artifacts/zap-2026-10-05T11-53-53-092Z-262936/zap-report.html) / [N](artifacts/zap-2026-10-05T11-54-12-710Z-43e689/zap-report.html) |
| B0455 | 327/327/327 | 20/20/20 | [V](artifacts/zap-2026-10-05T11-54-34-379Z-c4cd8f/zap-report.html) / [F](artifacts/zap-2026-10-05T11-54-56-048Z-d2d597/zap-report.html) / [N](artifacts/zap-2026-10-05T11-55-17-677Z-338c41/zap-report.html) |

15セルの成立確認と診断の実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認後のリポジトリソースSHA-256は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービスの実イメージIDやDB・Redis等の状態、ホスト資源までの一致は未証明である。

5変種ともplugin ID別アラート件数はV/F/Nで同じだった。B0453の個別成立確認は、実際のService WorkerとCacheStorageでログアウト後の機密応答再利用がVだけに起きることを確かめている。一方、保存済みZAP警告からそのブラウザー状態を評価したとは言えない。各変種の対象リクエスト・応答とブラウザーまたはエンジンの実行結果を照合するまで、検出成否を確定しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みが165から170変種、個別記録はあるがソース未対応が93から88変種になった。V/F/Nの完走系列がある258変種、依存環境まで完全対応済みの0変種は変わらない。
