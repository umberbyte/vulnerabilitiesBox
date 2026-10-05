# 認証・ブラウザー境界5変種の成立確認とZAP再計測（2026-10-05）

B0137、B0241、B0311、B0332、B0380について、ローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-auth-browser-five-source-20261005.json)を実行した。15セル・222チェックがすべて通過し、確認前後のリポジトリソースも一致した。対象は固定されたベンチマークfixtureであり、外部・顧客システムへの診断通信は行っていない。

B0311とB0332はsession認証の`alice`で[計画](artifacts/panel-auth-browser-two-session-source-20261005.json)を作成し、[6セルの実行台帳](artifacts/panel-auth-browser-two-session-source-20261005-ledger.json)で完了した。本人識別と保護された正常操作への到達を確認した。B0137、B0241、B0380は[匿名計画](artifacts/panel-auth-browser-three-anonymous-source-20261005.json)と[9セルの実行台帳](artifacts/panel-auth-browser-three-anonymous-source-20261005-ledger.json)で完了した。両計画ともseed `acceptance-v1`、active profile、90秒/700リクエスト、最大同時2リクエストとし、全セルで通信drainとZAP HTML保存を確認した。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0137 | 465/465/465 | 32/32/32 | [V](artifacts/zap-2026-10-05T12-07-50-101Z-8cef3c/zap-report.html) / [F](artifacts/zap-2026-10-05T12-08-20-836Z-c5f3a0/zap-report.html) / [N](artifacts/zap-2026-10-05T12-08-51-608Z-2ae202/zap-report.html) |
| B0241 | 254/254/254 | 28/28/28 | [V](artifacts/zap-2026-10-05T12-09-22-346Z-9810d1/zap-report.html) / [F](artifacts/zap-2026-10-05T12-09-42-901Z-aea614/zap-report.html) / [N](artifacts/zap-2026-10-05T12-10-01-445Z-fb2ae2/zap-report.html) |
| B0311 | 662/650/650 | 16/15/15 | [V](artifacts/zap-2026-10-05T12-03-48-613Z-807a17/zap-report.html) / [F](artifacts/zap-2026-10-05T12-04-28-668Z-970726/zap-report.html) / [N](artifacts/zap-2026-10-05T12-05-06-105Z-f5bf29/zap-report.html) |
| B0332 | 253/253/253 | 17/17/17 | [V](artifacts/zap-2026-10-05T12-05-43-514Z-66e9ef/zap-report.html) / [F](artifacts/zap-2026-10-05T12-06-01-204Z-2cdbc3/zap-report.html) / [N](artifacts/zap-2026-10-05T12-06-18-846Z-029e61/zap-report.html) |
| B0380 | 235/235/235 | 41/29/29 | [V](artifacts/zap-2026-10-05T12-10-19-995Z-279df1/zap-report.html) / [F](artifacts/zap-2026-10-05T12-10-38-500Z-76130c/zap-report.html) / [N](artifacts/zap-2026-10-05T12-10-54-993Z-445912/zap-report.html) |

15セルの成立確認と診断の実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認後のリポジトリソースSHA-256は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービスの実イメージIDやDB・Redis等の状態、ホスト資源までの一致は未証明である。

B0241の匿名計測は、正規の管理者JWTを取得して管理APIへ送る操作を実証していない。B0311のCSRFとB0332のCORSは、成立確認では別originからのブラウザー操作を検証したが、ZAP完走だけでその攻撃経路を測定したとは言えない。B0311のVで1件多いplugin `10021`は一般的なヘッダー警告、B0380のVで12件多いplugin `10104`はUser Agent Fuzzer警告であり、対象欠陥の直接検出とは扱わない。保存済みHTTP要求・応答と個別成立証拠を照合するまで、検出成否を確定しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みが170から175変種、個別記録はあるがソース未対応が88から83変種になった。V/F/Nの完走系列がある258変種、依存環境まで完全対応済みの0変種は変わらない。
