# キャッシュ境界5変種の成立確認とZAP再計測（2026-10-05）

B0382、B0383、B0384、B0387、B0390について、ローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-cache-final-five-source-20261005.json)を実行した。15セル・369チェックがすべて通過し、確認前後のリポジトリソースも一致した。対象は固定されたベンチマークfixtureであり、外部・顧客システムへの診断通信は行っていない。

[計画](artifacts/panel-cache-final-five-source-20261005.json)と[実行台帳](artifacts/panel-cache-final-five-source-20261005-ledger.json)で、同一seed `acceptance-v1`、session認証の`alice`、active profile、90秒/700リクエスト、最大同時2リクエストとしてZAP再計測を行った。15セルはすべて`completed`、エラー0、通信drain完了。各セルの保護された正常操作への到達とZAP HTML保存を確認した。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0382 | 231/231/231 | 12/12/13 | [V](artifacts/zap-2026-10-05T10-32-13-265Z-4e0b9c/zap-report.html) / [F](artifacts/zap-2026-10-05T10-32-28-943Z-ad1533/zap-report.html) / [N](artifacts/zap-2026-10-05T10-32-44-643Z-8a7b39/zap-report.html) |
| B0383 | 465/465/465 | 15/15/15 | [V](artifacts/zap-2026-10-05T10-33-00-324Z-d1bb66/zap-report.html) / [F](artifacts/zap-2026-10-05T10-33-29-670Z-9a7111/zap-report.html) / [N](artifacts/zap-2026-10-05T10-33-59-435Z-cc71ad/zap-report.html) |
| B0384 | 240/240/240 | 13/13/13 | [V](artifacts/zap-2026-10-05T10-34-29-218Z-8c49f5/zap-report.html) / [F](artifacts/zap-2026-10-05T10-34-46-864Z-b28160/zap-report.html) / [N](artifacts/zap-2026-10-05T10-35-04-456Z-669fe7/zap-report.html) |
| B0387 | 452/447/447 | 14/13/13 | [V](artifacts/zap-2026-10-05T10-35-22-028Z-e20605/zap-report.html) / [F](artifacts/zap-2026-10-05T10-35-49-763Z-ae19a2/zap-report.html) / [N](artifacts/zap-2026-10-05T10-36-16-964Z-e9adee/zap-report.html) |
| B0390 | 231/231/231 | 12/12/12 | [V](artifacts/zap-2026-10-05T10-36-44-657Z-c35deb/zap-report.html) / [F](artifacts/zap-2026-10-05T10-37-02-278Z-050293/zap-report.html) / [N](artifacts/zap-2026-10-05T10-37-19-853Z-67ad01/zap-report.html) |

15セルの成立確認と診断の実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認後のリポジトリソースSHA-256は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービスの実イメージIDやRedis等の状態、ホスト資源までの一致は未証明である。

アラートは共通するヘッダー・セッション系が中心だった。B0382のplugin `10062`はNに1件だけ、B0387のplugin `10021`はVに1件多かった。この差分だけでキャッシュ境界の検出・誤検出とは判定できない。リクエスト順、共有Redis状態、警告の対象URLと本文を個別に照合する必要がある。スキャン完走も対象欠陥の成立や検出を意味しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みが140から145変種、個別記録はあるがソース未対応が118から113変種になった。V/F/Nの完走系列がある258変種、依存環境まで完全対応済みの0変種は変わらない。
