# 公開設定・ブラウザー境界5変種の成立確認とZAP再計測（2026-10-05）

B0464、B0465、B0472、B0497、B0498について、ローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-public-final-five-source-20261005.json)を実行した。15セル・241チェックがすべて通過し、確認前後のリポジトリソースも一致した。対象は固定されたベンチマークfixtureであり、外部・顧客システムへの診断通信は行っていない。

[計画](artifacts/panel-public-final-five-source-20261005.json)と[実行台帳](artifacts/panel-public-final-five-source-20261005-ledger.json)で、同一seed `acceptance-v1`、匿名、active profile、90秒/700リクエスト、最大同時2リクエストとしてZAP再計測を行った。15セルはすべて`completed`、エラー0、通信drain完了。匿名計測のため、認証済み保護操作の到達確認は対象外である。各セルのZAP HTML保存を確認した。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0464 | 326/305/305 | 43/36/36 | [V](artifacts/zap-2026-10-05T11-16-01-106Z-b0aeff/zap-report.html) / [F](artifacts/zap-2026-10-05T11-16-23-780Z-84cffe/zap-report.html) / [N](artifacts/zap-2026-10-05T11-16-44-438Z-08fcbc/zap-report.html) |
| B0465 | 256/255/255 | 32/30/30 | [V](artifacts/zap-2026-10-05T11-17-05-094Z-3d7987/zap-report.html) / [F](artifacts/zap-2026-10-05T11-17-25-686Z-7a5f44/zap-report.html) / [N](artifacts/zap-2026-10-05T11-17-42-177Z-2ace00/zap-report.html) |
| B0472 | 459/459/459 | 69/69/69 | [V](artifacts/zap-2026-10-05T11-17-58-713Z-3559d4/zap-report.html) / [F](artifacts/zap-2026-10-05T11-18-27-348Z-56ba74/zap-report.html) / [N](artifacts/zap-2026-10-05T11-18-56-034Z-a11aac/zap-report.html) |
| B0497 | 464/467/467 | 32/32/32 | [V](artifacts/zap-2026-10-05T11-19-24-607Z-44a6a3/zap-report.html) / [F](artifacts/zap-2026-10-05T11-19-53-309Z-377bc8/zap-report.html) / [N](artifacts/zap-2026-10-05T11-20-23-931Z-a23ef0/zap-report.html) |
| B0498 | 467/467/467 | 32/32/32 | [V](artifacts/zap-2026-10-05T11-20-52-499Z-9ab91b/zap-report.html) / [F](artifacts/zap-2026-10-05T11-21-23-121Z-163516/zap-report.html) / [N](artifacts/zap-2026-10-05T11-21-51-693Z-18137e/zap-report.html) |

15セルの成立確認と診断の実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認後のリポジトリソースSHA-256は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービスの実イメージIDやDB・Redis等の状態、ホスト資源までの一致は未証明である。

B0464とB0465ではVの全アラート数がF/Nより多いが、増分はキャッシュ制御・セキュリティヘッダー等の一般警告である。これを非公開ファイルや診断情報の露出を直接検出した件数とは扱わない。B0472のplugin `40012`（反射型XSS）はV/F/Nすべてに1件あり、HTMLへの反映とCSP下のブラウザー実行可否を区別する必要がある。個別成立確認では予測可能なnonceを使ったスクリプト実行がVのみで成立した。ZAP警告だけで真陽性・誤検出・検出漏れを確定しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みが155から160変種、個別記録はあるがソース未対応が103から98変種になった。V/F/Nの完走系列がある258変種、依存環境まで完全対応済みの0変種は変わらない。
