# LDAP代表4変種の成立確認とZAP再計測（2026-10-05）

前回の共通確認器の`Uncovered root`を解消するため、既存のOpenLDAP個別確認に沿ったB0099～B0102の検査を[共通成立確認器](tests/batch6-ldap-acceptance.mjs)へ接続した。[成立確認原票](artifacts/acceptance-saved-ldap-four-source-20261005.json)はV/F/Nの12セル・204チェックがすべて通過し、確認前後の対象ソース証拠も一致した。これにより、前回保存した未対応エラーを「脆弱性不成立」と解釈する必要はない。

[計画](artifacts/panel-ldap-four-source-20261005.json)と[実行台帳](artifacts/panel-ldap-four-source-20261005-ledger.json)で、4変種のV/F/Nを同じseed `acceptance-v1`、session認証、active profile、90秒/700リクエスト、最大同時2リクエストの条件で再計測した。12セルすべて`completed`、エラー0、通信drain完了。成立確認とスキャンの実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認時のリポジトリソース証拠は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービス・ホスト環境全体の状態一致は未証明である。外部・顧客システムには通信していない。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0099 | 444/444/444 | 16/16/16 | [V](artifacts/zap-2026-10-05T08-40-40-844Z-ec546c/zap-report.html) / [F](artifacts/zap-2026-10-05T08-41-08-721Z-1afc45/zap-report.html) / [N](artifacts/zap-2026-10-05T08-41-36-001Z-6ec291/zap-report.html) |
| B0100 | 652/652/652 | 17/17/17 | [V](artifacts/zap-2026-10-05T08-42-03-794Z-eb790e/zap-report.html) / [F](artifacts/zap-2026-10-05T08-42-41-161Z-04489e/zap-report.html) / [N](artifacts/zap-2026-10-05T08-43-18-558Z-bed3c8/zap-report.html) |
| B0101 | 444/444/444 | 16/16/16 | [V](artifacts/zap-2026-10-05T08-43-55-903Z-effdec/zap-report.html) / [F](artifacts/zap-2026-10-05T08-44-23-141Z-1d190e/zap-report.html) / [N](artifacts/zap-2026-10-05T08-44-50-826Z-b00dc2/zap-report.html) |
| B0102 | 447/447/447 | 16/16/16 | [V](artifacts/zap-2026-10-05T08-45-18-464Z-4da142/zap-report.html) / [F](artifacts/zap-2026-10-05T08-45-46-125Z-2fe011/zap-report.html) / [N](artifacts/zap-2026-10-05T08-46-13-846Z-d12e8f/zap-report.html) |

各変種のplugin ID別アラート件数はV/F/Nで同じで、LDAP境界に固有の差分はこの比較では確認できない。B0100にはZAP plugin 6のHigh「Path Traversal」が全armで1件ずつある。保存されたmessage ID 57の要求は`POST /ldap-workbook`の`value`に`ldap-workbook`を入れたもので、応答はV/F/NともHTTP 200かつ`{"rows":[]}`、アラートのevidenceは空、confidenceはLowだった。この原票だけでLDAPの脆弱性検出や真陽性とは判定できず、人間レビューを要する警告として保持する。その他のヘッダー・セッション警告もこの4件のLDAP検出率には算入しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みは106から110変種、個別記録はあるがソース未対応は152から148変種になった。V/F/Nの完了スキャンがある258変種、依存環境まで完全対応済み0変種は変わらない。
