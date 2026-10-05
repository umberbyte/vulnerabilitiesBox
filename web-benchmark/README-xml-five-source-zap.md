# XML境界5変種の成立確認とZAP再計測（2026-10-05）

B0107、B0108、B0111、B0113、B0118をローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-xml-five-source-20261005.json)した。15セル・240チェックすべて通過し、確認前後の対象ソース証拠も一致した。外部・顧客システムには通信していない。

[計画](artifacts/panel-xml-five-source-20261005.json)と[実行台帳](artifacts/panel-xml-five-source-20261005-ledger.json)で、同じseed `acceptance-v1`、session認証、active profile、90秒/700リクエスト、最大同時2リクエストのZAP再計測を行った。15セルすべて`completed`、エラー0、通信drain完了。成立確認とスキャンの実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認時のリポジトリソース証拠は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービス・ホスト環境全体の状態一致は未証明である。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0107 | 665/662/662 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-10-22-471Z-d72a2f/zap-report.html) / [F](artifacts/zap-2026-10-05T09-11-00-495Z-660fe5/zap-report.html) / [N](artifacts/zap-2026-10-05T09-11-38-023Z-c4d18d/zap-report.html) |
| B0108 | 665/662/662 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-12-15-449Z-3b6071/zap-report.html) / [F](artifacts/zap-2026-10-05T09-12-52-829Z-801184/zap-report.html) / [N](artifacts/zap-2026-10-05T09-13-30-180Z-29fe79/zap-report.html) |
| B0111 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-14-07-496Z-6643e5/zap-report.html) / [F](artifacts/zap-2026-10-05T09-14-44-828Z-5b617c/zap-report.html) / [N](artifacts/zap-2026-10-05T09-15-22-155Z-4438d3/zap-report.html) |
| B0113 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-15-59-454Z-bd6e42/zap-report.html) / [F](artifacts/zap-2026-10-05T09-16-36-786Z-e5fa31/zap-report.html) / [N](artifacts/zap-2026-10-05T09-17-14-149Z-f6099a/zap-report.html) |
| B0118 | 665/665/665 | 16/16/16 | [V](artifacts/zap-2026-10-05T09-17-51-464Z-baa38f/zap-report.html) / [F](artifacts/zap-2026-10-05T09-18-28-790Z-7a138e/zap-report.html) / [N](artifacts/zap-2026-10-05T09-19-06-093Z-a413ab/zap-report.html) |

保存アラートのplugin ID別件数は各変種のV/F/Nで同じだった。B0107とB0108では保存リクエスト数にVとF/Nの差があるが、これはXML境界を検出した証拠ではない。今回の警告はヘッダー・セッション関連の共通警告であり、対象のXML境界に固有の差分はアラート比較からは確認できない。対象リクエストと成立条件を照合するまでは検出漏れ・検出率を確定しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが115から120変種、個別記録はあるがソース未対応が143から138変種になった。V/F/Nの完了スキャンがある258変種、依存環境まで完全対応済み0変種は変わらない。
