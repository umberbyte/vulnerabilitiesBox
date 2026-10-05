# 認証・トークン境界5変種の成立確認とZAP再計測（2026-10-05）

B0243、B0244、B0246、B0247、B0248について、ローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-jwt-five-source-20261005.json)を実行した。15セル・268チェックがすべて通過し、確認前後のリポジトリソースも一致した。対象は固定されたベンチマークfixtureであり、外部・顧客システムへの診断通信は行っていない。

最初の[5変種計画](artifacts/panel-jwt-five-source-20261005.json)はbearerの`alice`を選んだため、B0243とB0244の6セルで保護された正常操作の到達確認に失敗し、[台帳](artifacts/panel-jwt-five-source-20261005-ledger.json)に`unsupported_bearer_role`として保存した。この6セルはスキャン完了に数えていない。残る9セルは完了した。B0243とB0244だけを有効な`admin`ロールで[再計画](artifacts/panel-jwt-admin-two-source-20261005.json)し、[再実行台帳](artifacts/panel-jwt-admin-two-source-20261005-ledger.json)の6セルがすべて完了した。両計画ともseed `acceptance-v1`、bearer認証、active profile、90秒/700リクエスト、最大同時2リクエストとした。完了セルでは認証到達、通信drain、ZAP HTML保存を確認した。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0243 | 255/255/257 | 29/28/28 | [V](artifacts/zap-2026-10-05T10-19-37-104Z-7cc1ad/zap-report.html) / [F](artifacts/zap-2026-10-05T10-19-56-884Z-8725aa/zap-report.html) / [N](artifacts/zap-2026-10-05T10-20-16-233Z-276e18/zap-report.html) |
| B0244 | 513/509/506 | 47/48/48 | [V](artifacts/zap-2026-10-05T10-20-37-570Z-66efc0/zap-report.html) / [F](artifacts/zap-2026-10-05T10-21-11-524Z-8ff1a5/zap-report.html) / [N](artifacts/zap-2026-10-05T10-21-47-006Z-c48946/zap-report.html) |
| B0246 | 491/491/491 | 32/33/32 | [V](artifacts/zap-2026-10-05T10-13-17-830Z-47b861/zap-report.html) / [F](artifacts/zap-2026-10-05T10-13-49-303Z-3bca1d/zap-report.html) / [N](artifacts/zap-2026-10-05T10-14-20-651Z-784c6c/zap-report.html) |
| B0247 | 298/300/300 | 45/45/46 | [V](artifacts/zap-2026-10-05T10-14-52-026Z-255de7/zap-report.html) / [F](artifacts/zap-2026-10-05T10-15-15-783Z-75da2c/zap-report.html) / [N](artifacts/zap-2026-10-05T10-15-41-028Z-f6dcaf/zap-report.html) |
| B0248 | 300/300/300 | 45/45/46 | [V](artifacts/zap-2026-10-05T10-16-06-220Z-fa7787/zap-report.html) / [F](artifacts/zap-2026-10-05T10-16-31-505Z-5cadf3/zap-report.html) / [N](artifacts/zap-2026-10-05T10-16-57-217Z-2f55c6/zap-report.html) |

15セルの成立確認と診断の実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認後のリポジトリソースSHA-256は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービスの実イメージIDやDB・Redis等の状態、ホスト資源までの一致は未証明である。

ZAPのアラート総数には各armで共通する警告が多い。B0244のplugin `40018`はF/Nに各1件、Vには0件であり、この集計だけで対象欠陥の検出や誤検出とは判定できない。個別HTTP証拠とfixtureの期待動作を照合するレビューが残る。スキャン完走も対象欠陥の成立や検出を意味しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みが135から140変種、個別記録はあるがソース未対応が123から118変種になった。V/F/Nの完走系列がある258変種、依存環境まで完全対応済みの0変種は変わらない。
