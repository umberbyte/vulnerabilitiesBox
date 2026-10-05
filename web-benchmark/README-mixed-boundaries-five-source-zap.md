# 複合境界5変種の成立確認とZAP再計測（2026-10-05）

B0132、B0138、B0249、B0371、B0377について、ローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-mixed-boundaries-five-source-20261005.json)を実行した。15セル・340チェックがすべて通過し、確認前後のリポジトリソースも一致した。対象は固定されたベンチマークfixtureであり、外部・顧客システムへの診断通信は行っていない。

[計画](artifacts/panel-mixed-boundaries-five-source-20261005.json)と[実行台帳](artifacts/panel-mixed-boundaries-five-source-20261005-ledger.json)で、同一seed `acceptance-v1`、session認証の`alice`、active profile、90秒/700リクエスト、最大同時2リクエストとしてZAP再計測を行った。15セルはすべて`completed`、エラー0、通信drain完了。各セルの保護された正常操作への到達とZAP HTML保存を確認した。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0132 | 694/694/694 | 19/19/19 | [V](artifacts/zap-2026-10-05T10-46-43-634Z-410e90/zap-report.html) / [F](artifacts/zap-2026-10-05T10-47-21-728Z-448a7a/zap-report.html) / [N](artifacts/zap-2026-10-05T10-47-57-288Z-7f97e3/zap-report.html) |
| B0138 | 465/465/465 | 15/15/15 | [V](artifacts/zap-2026-10-05T10-48-32-673Z-a6a0df/zap-report.html) / [F](artifacts/zap-2026-10-05T10-49-01-999Z-05ac11/zap-report.html) / [N](artifacts/zap-2026-10-05T10-49-31-293Z-093e43/zap-report.html) |
| B0249 | 294/294/294 | 43/43/43 | [V](artifacts/zap-2026-10-05T10-50-01-041Z-d2da17/zap-report.html) / [F](artifacts/zap-2026-10-05T10-50-24-758Z-736d39/zap-report.html) / [N](artifacts/zap-2026-10-05T10-50-47-983Z-ead7d9/zap-report.html) |
| B0371 | 231/231/231 | 12/12/12 | [V](artifacts/zap-2026-10-05T10-51-09-688Z-d58ee3/zap-report.html) / [F](artifacts/zap-2026-10-05T10-51-25-278Z-862512/zap-report.html) / [N](artifacts/zap-2026-10-05T10-51-40-829Z-ab2573/zap-report.html) |
| B0377 | 257/257/257 | 14/14/14 | [V](artifacts/zap-2026-10-05T10-51-56-405Z-907803/zap-report.html) / [F](artifacts/zap-2026-10-05T10-52-14-000Z-e1dde8/zap-report.html) / [N](artifacts/zap-2026-10-05T10-52-33-570Z-591521/zap-report.html) |

15セルの成立確認と診断の実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認後のリポジトリソースSHA-256は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービスの実イメージIDやDB・Redis等の状態、ホスト資源までの一致は未証明である。

5変種ともplugin ID別アラート件数はV/F/Nで同じだった。これだけで対象境界への入力到達や欠陥の検出漏れは判定できない。保存済みHTTP要求・応答、対象URL、fixtureの実行結果を照合するレビューが残る。スキャン完走も対象欠陥の成立や検出を意味しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みが145から150変種、個別記録はあるがソース未対応が113から108変種になった。V/F/Nの完走系列がある258変種、依存環境まで完全対応済みの0変種は変わらない。
