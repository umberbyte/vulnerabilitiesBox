# 保存・配信境界5変種の成立確認とZAP再計測（2026-10-05）

B0446、B0447、B0448、B0452、B0456について、ローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-storage-final-five-source-20261005.json)を実行した。15セル・336チェックがすべて通過し、確認前後のリポジトリソースも一致した。対象は固定されたベンチマークfixtureであり、外部・顧客システムへの診断通信は行っていない。

[計画](artifacts/panel-storage-final-five-source-20261005.json)と[実行台帳](artifacts/panel-storage-final-five-source-20261005-ledger.json)で、同一seed `acceptance-v1`、session認証の`alice`、active profile、90秒/700リクエスト、最大同時2リクエストとしてZAP再計測を行った。15セルはすべて`completed`、エラー0、通信drain完了。各セルの保護された正常操作への到達とZAP HTML保存を確認した。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0446 | 676/674/676 | 27/27/27 | [V](artifacts/zap-2026-10-05T11-01-19-610Z-872bbc/zap-report.html) / [F](artifacts/zap-2026-10-05T11-01-51-637Z-a7dff2/zap-report.html) / [N](artifacts/zap-2026-10-05T11-02-21-526Z-201f65/zap-report.html) |
| B0447 | 676/676/676 | 27/27/27 | [V](artifacts/zap-2026-10-05T11-02-52-924Z-8f5cfd/zap-report.html) / [F](artifacts/zap-2026-10-05T11-03-24-775Z-345089/zap-report.html) / [N](artifacts/zap-2026-10-05T11-03-56-104Z-830e77/zap-report.html) |
| B0448 | 261/261/261 | 30/30/30 | [V](artifacts/zap-2026-10-05T11-04-27-396Z-4ce0f4/zap-report.html) / [F](artifacts/zap-2026-10-05T11-04-47-053Z-639dcf/zap-report.html) / [N](artifacts/zap-2026-10-05T11-05-06-720Z-366fe3/zap-report.html) |
| B0452 | 272/274/274 | 31/31/31 | [V](artifacts/zap-2026-10-05T11-05-24-357Z-a2bbe0/zap-report.html) / [F](artifacts/zap-2026-10-05T11-05-44-040Z-afd331/zap-report.html) / [N](artifacts/zap-2026-10-05T11-06-05-694Z-dd9300/zap-report.html) |
| B0456 | 274/274/274 | 19/19/19 | [V](artifacts/zap-2026-10-05T11-06-25-345Z-66ebe5/zap-report.html) / [F](artifacts/zap-2026-10-05T11-06-46-992Z-34e954/zap-report.html) / [N](artifacts/zap-2026-10-05T11-07-08-607Z-69ee5b/zap-report.html) |

15セルの成立確認と診断の実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認後のリポジトリソースSHA-256は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービスの実イメージIDやDB・Redis等の状態、ホスト資源までの一致は未証明である。

5変種ともplugin ID別アラート件数はV/F/Nで同じだった。これだけで対象境界への入力到達や欠陥の検出漏れは判定できない。保存済みHTTP要求・応答、対象URL、fixtureの状態を照合するレビューが残る。スキャン完走も対象欠陥の成立や検出を意味しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みが150から155変種、個別記録はあるがソース未対応が108から103変種になった。V/F/Nの完走系列がある258変種、依存環境まで完全対応済みの0変種は変わらない。
