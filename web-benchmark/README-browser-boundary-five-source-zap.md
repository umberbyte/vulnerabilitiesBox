# ブラウザー・境界値5変種の成立確認とZAP再計測（2026-10-05）

B0232、B0477、B0478、B0499、B0500について、ローカルDockerで[個別V/F/N成立確認](artifacts/acceptance-saved-browser-boundary-five-source-20261005.json)を実行した。15セル・262チェックがすべて通過し、確認前後のリポジトリソースも一致した。対象は固定されたベンチマークfixtureであり、外部・顧客システムへの診断通信は行っていない。

最初の[5変種計画](artifacts/panel-browser-boundary-five-source-20261005.json)はsession認証を選び、B0232-Vで`auth_cookie_missing`となった。[失敗台帳](artifacts/panel-browser-boundary-five-source-20261005-ledger.json)と[失敗run](artifacts/zap-2026-10-05T11-31-19-386Z-977434/run.json)を保持した。このセルはスキャン完了に数えていない。B0232は専用の`memberSession` Cookieを使うため、計測器の通常sessionログインとは認証条件が合わなかった。

他の4変種をsession認証の`alice`で[再計画](artifacts/panel-browser-boundary-four-session-source-20261005.json)し、[12セルの台帳](artifacts/panel-browser-boundary-four-session-source-20261005-ledger.json)で完了した。本人識別と認証情報の再送は確認されたが、保護操作への到達は計測器で評価対象に指定されていない。B0232は[匿名計画](artifacts/panel-b0232-anonymous-source-20261005.json)と[3セルの台帳](artifacts/panel-b0232-anonymous-source-20261005-ledger.json)で完了した。匿名ZAP計測は専用Cookieでログインしたブラウザーの到達やCookie読取可否を確認していない。両再計画ともseed `acceptance-v1`、active profile、90秒/700リクエスト、最大同時2リクエストとし、全完了セルの通信drainとHTML保存を確認した。

| 変種 | V/F/Nの保存リクエスト数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0232 | 686/686/686 | 47/47/47 | [V](artifacts/zap-2026-10-05T11-39-09-036Z-624633/zap-report.html) / [F](artifacts/zap-2026-10-05T11-39-49-899Z-373a7e/zap-report.html) / [N](artifacts/zap-2026-10-05T11-40-28-794Z-964581/zap-report.html) |
| B0477 | 266/266/267 | 32/32/32 | [V](artifacts/zap-2026-10-05T11-33-06-966Z-030437/zap-report.html) / [F](artifacts/zap-2026-10-05T11-33-26-697Z-a11a75/zap-report.html) / [N](artifacts/zap-2026-10-05T11-33-44-483Z-1294f0/zap-report.html) |
| B0478 | 245/245/245 | 16/16/16 | [V](artifacts/zap-2026-10-05T11-34-04-205Z-4d7371/zap-report.html) / [F](artifacts/zap-2026-10-05T11-34-21-876Z-c25d4b/zap-report.html) / [N](artifacts/zap-2026-10-05T11-34-41-560Z-d4ab25/zap-report.html) |
| B0499 | 446/446/446 | 38/38/38 | [V](artifacts/zap-2026-10-05T11-34-59-208Z-a8056e/zap-report.html) / [F](artifacts/zap-2026-10-05T11-35-26-965Z-aa9d1b/zap-report.html) / [N](artifacts/zap-2026-10-05T11-35-54-685Z-1eabad/zap-report.html) |
| B0500 | 458/458/458 | 15/15/15 | [V](artifacts/zap-2026-10-05T11-36-22-368Z-5624f9/zap-report.html) / [F](artifacts/zap-2026-10-05T11-36-52-094Z-dadf63/zap-report.html) / [N](artifacts/zap-2026-10-05T11-37-21-769Z-01dc72/zap-report.html) |

15セルの成立確認と完了した診断の実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。成立確認後のリポジトリソースSHA-256は`71db9cb7e84f0eac62030774d1c17831fddfd95efd6c62fe801f26fd5445f158`。依存サービスの実イメージIDやDB・Redis等の状態、ホスト資源までの一致は未証明である。

5変種ともplugin ID別アラート件数はV/F/Nで同じだった。B0477の個別成立確認はChromiumのCDPで、ログアウト後の機密応答がブラウザーキャッシュから再利用されるのはVだけと確認した。一方、保存済みZAP警告はそのブラウザー状態差を示していない。B0232も匿名計測のため専用Cookieの`HttpOnly`差を測ったとは扱わない。ZAPの対象リクエストとブラウザー状態を照合するまで、検出成否を確定しない。

[オフライン証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みが160から165変種、個別記録はあるがソース未対応が98から93変種になった。V/F/Nの完走系列がある258変種、依存環境まで完全対応済みの0変種は変わらない。
