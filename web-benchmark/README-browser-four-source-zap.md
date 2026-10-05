# ブラウザー境界4変種の成立確認とZAP再計測

2026-10-05にB0054（prototype属性マージ）、B0056（DOM prototype sink）、B0059（Trusted Typesの誤った信頼付与）、B0062（相対CSSパス）をローカルDockerで確認した。[個別V/F/N成立確認](artifacts/extended-regression-saved-browser-four-source-20261005.json)は4変種・12セルがすべて合格した。[セル原本](artifacts/docker-smoke-browser-four-source-20261005.json)も保存した。確認と走査の対象アプリ実行時ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。依存サービスの実状態まで対応を証明したものではない。

代表変種B0054・B0062は[代表計画](artifacts/panel-browser-primary-source-20261005.json)と[台帳](artifacts/panel-browser-primary-source-20261005-ledger.json)、追加変種B0056・B0059は[追加計画](artifacts/panel-browser-additional-source-20261005.json)と[台帳](artifacts/panel-browser-additional-source-20261005-ledger.json)に保存した。これは現行の計画形式が代表変種と追加変種を別々に扱うためで、評価対象は同じ4変種である。混合計画の生成を一度試した際は`Invalid variant selection`で終了し、計画ファイルも診断通信も作られなかった。両計画ともseed `batch5-docker-smoke`、匿名、標準`active`、90秒・700要求・同時2要求とした。12セルはすべて`completed`、エラー0、通信drain済みで、`historyArchive.complete`もtrueだった。

| 変種 | V/F/Nの公開要求数 | V/F/NのZAP API履歴数 | V/F/Nの生アラート数 | ZAP HTML |
| --- | --- | --- | --- | --- |
| B0054 | 235/235/235 | 174/174/174 | 31/31/31 | [V](artifacts/zap-2026-10-05T04-47-12-480Z-80cdb6/zap-report.html)・[F](artifacts/zap-2026-10-05T04-47-29-475Z-d20884/zap-report.html)・[N](artifacts/zap-2026-10-05T04-47-48-068Z-31f4d8/zap-report.html) |
| B0056 | 235/235/235 | 174/174/174 | 31/31/32 | [V](artifacts/zap-2026-10-05T04-49-44-580Z-f0805b/zap-report.html)・[F](artifacts/zap-2026-10-05T04-50-01-564Z-899a06/zap-report.html)・[N](artifacts/zap-2026-10-05T04-50-18-164Z-196b49/zap-report.html) |
| B0059 | 235/235/235 | 174/174/174 | 34/34/34 | [V](artifacts/zap-2026-10-05T04-50-36-773Z-9172fa/zap-report.html)・[F](artifacts/zap-2026-10-05T04-50-53-825Z-b5966d/zap-report.html)・[N](artifacts/zap-2026-10-05T04-51-12-382Z-dd2b95/zap-report.html) |
| B0062 | 450/366/366 | 447/361/361 | 45/43/43 | [V](artifacts/zap-2026-10-05T04-48-06-608Z-92510f/zap-report.html)・[F](artifacts/zap-2026-10-05T04-48-27-208Z-5d5bf8/zap-report.html)・[N](artifacts/zap-2026-10-05T04-48-45-784Z-dd89c9/zap-report.html) |

4変種とも、対象欠陥に対応するV固有アラートは確認できなかった。B0054・B0056・B0059はブラウザー側の設定・HTML処理、B0062はブラウザーによる相対CSSの解決が成立条件に含まれる。ZAPのHTTP履歴とアラート数だけで、ブラウザー内の成立条件を試したか、また検出漏れかは確定できない。

B0056のNにだけ、別分類のplugin `10062`（PII Disclosure、High）が1件ある。[Nの保存アラート](artifacts/zap-2026-10-05T04-50-18-164Z-196b49/alerts.json)は`GET /session`の応答中の14桁数字列を根拠とする。[通信原本](artifacts/zap-2026-10-05T04-50-18-164Z-196b49/messages-first-500.json)のmessage `8`では、その数字列はランダムなCSRFトークンの一部であり、対象のprototype欠陥にも個人情報の開示にも対応しない。Highという製品表示だけでB0056の誤検知数へ機械的に算入しない。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行時ソース対応済みが47から51変種になり、完走系列はあるがソース未対応のものは211から207変種になった。依存環境の対応済みは0のままである。
