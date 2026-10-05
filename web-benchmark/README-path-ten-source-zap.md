# ファイル経路系10変種の成立確認とZAP再走査（2026-10-05）

B0122、B0125、B0128、B0129、B0130、B0131、B0134、B0136、B0139、B0140をローカルDockerで再測定した。既存の成立確認テスト2組は[境界系8変種24/24セル](artifacts/extended-regression-source-link-path-boundaries-all-20261005.json)と[ファイル操作系6変種18/18セル](artifacts/extended-regression-source-link-path-files-more-20261005.json)を通過し、そのうち今回の対象10変種は30/30セルだった。検証前後・対象アプリの実行ソースSHA-256は両報告で一致した。これは固定fixtureの成立確認であり、ZAPの検出を意味しない。

最初に境界系テストの出力からB0122・B0134だけを選ぼうとした[失敗記録](artifacts/extended-regression-source-link-path-boundaries-20261005.json)は、記録器がテスト出力の全セルを要求するため`Incomplete selected V/F/N cells`となった。テスト自体の終了コードは0で、新規走査は始めていない。対象テストの全8変種を指定して再実行し、上記の通過記録を得た。失敗報告は削除せず保持する。

[計画](artifacts/panel-path-ten-source-20261005.json)と[30セルの台帳](artifacts/panel-path-ten-source-20261005-ledger.json)では、同一seed `path-ten-source-20261005`、active profile、90秒/700リクエスト、最大同時2リクエストを設定した。各変種の認証方式は計画の指定に従い、全セルの走査終了、通信drain、必要な認証後確認、ZAP HTML保存を確認した。走査seedは個別成立確認のseedとは異なる。ZAP走査と成立確認の対象実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。検証時のリポジトリ全体のソースSHA-256は`f1ae1c3b70b7247ff68b433d8638743b8c49f5c2ec599727005e22a36004c2fb`である。

| 変種 | V/F/NのHTTP要求数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0122 | 485/498/498 | 38/37/37 | [V](artifacts/zap-2026-10-05T13-59-21-453Z-4c3e40/zap-report.html) / [F](artifacts/zap-2026-10-05T13-59-52-125Z-5aa868/zap-report.html) / [N](artifacts/zap-2026-10-05T14-00-22-852Z-aaafe4/zap-report.html) |
| B0125 | 498/498/498 | 37/37/37 | [V](artifacts/zap-2026-10-05T14-00-53-553Z-0d2854/zap-report.html) / [F](artifacts/zap-2026-10-05T14-01-24-195Z-326be2/zap-report.html) / [N](artifacts/zap-2026-10-05T14-01-56-877Z-80cc6d/zap-report.html) |
| B0128 | 498/498/498 | 37/37/37 | [V](artifacts/zap-2026-10-05T14-02-29-549Z-92965b/zap-report.html) / [F](artifacts/zap-2026-10-05T14-03-00-144Z-c7ac0e/zap-report.html) / [N](artifacts/zap-2026-10-05T14-03-32-787Z-2993be/zap-report.html) |
| B0129 | 502/502/502 | 38/38/38 | [V](artifacts/zap-2026-10-05T14-04-05-430Z-8dcb32/zap-report.html) / [F](artifacts/zap-2026-10-05T14-04-38-118Z-9c90d1/zap-report.html) / [N](artifacts/zap-2026-10-05T14-05-10-736Z-178a10/zap-report.html) |
| B0130 | 498/498/498 | 37/37/37 | [V](artifacts/zap-2026-10-05T14-05-43-312Z-ba8b5f/zap-report.html) / [F](artifacts/zap-2026-10-05T14-06-15-962Z-66b7f2/zap-report.html) / [N](artifacts/zap-2026-10-05T14-06-46-647Z-53dd85/zap-report.html) |
| B0131 | 502/502/502 | 38/38/38 | [V](artifacts/zap-2026-10-05T14-07-19-265Z-c74dc6/zap-report.html) / [F](artifacts/zap-2026-10-05T14-07-51-877Z-8e0c9f/zap-report.html) / [N](artifacts/zap-2026-10-05T14-08-24-466Z-a2b006/zap-report.html) |
| B0134 | 492/503/503 | 39/39/39 | [V](artifacts/zap-2026-10-05T14-08-57-066Z-925cc7/zap-report.html) / [F](artifacts/zap-2026-10-05T14-09-27-685Z-8720cc/zap-report.html) / [N](artifacts/zap-2026-10-05T14-09-58-287Z-22aca3/zap-report.html) |
| B0136 | 485/498/498 | 38/37/37 | [V](artifacts/zap-2026-10-05T14-10-30-852Z-5b5ffe/zap-report.html) / [F](artifacts/zap-2026-10-05T14-11-01-434Z-6a3787/zap-report.html) / [N](artifacts/zap-2026-10-05T14-11-31-959Z-3cc979/zap-report.html) |
| B0139 | 493/493/493 | 38/38/38 | [V](artifacts/zap-2026-10-05T14-12-02-532Z-e99d70/zap-report.html) / [F](artifacts/zap-2026-10-05T14-12-31-106Z-417925/zap-report.html) / [N](artifacts/zap-2026-10-05T14-13-01-725Z-14ea27/zap-report.html) |
| B0140 | 485/498/498 | 38/37/37 | [V](artifacts/zap-2026-10-05T14-13-32-254Z-a3eb88/zap-report.html) / [F](artifacts/zap-2026-10-05T14-14-00-817Z-f92c06/zap-report.html) / [N](artifacts/zap-2026-10-05T14-14-31-422Z-c8a533/zap-report.html) |

B0122・B0134・B0136・B0140のVには、plugin `6`（Path Traversal）のMedium confidence・High riskアラートがあり、`/etc/passwd`への要求に対する応答本文には`root:x:0:0`を含むHTTP通信が保存されている。ただしB0134の対象はグロブ展開など別の操作であり、共通の`/etc/passwd`プローブを対象欠陥の検出と直結させない。B0134のF/N、B0139のV/F/Nにも同pluginのLow confidence・High riskアラートがあり、`evidence`欄は空だった。F/Nの原本は[別レビュー](README-review-fn-high.md)とも照合する。残りの変種にはHighアラートがない。全アラート数やHighの有無だけでTP/FP/FN/TNを割り当てず、対象操作・要求応答・実影響を人間が確認する。

[オフライン監査索引](artifacts/index.html)ではこの台帳の30/30セル、10/10系列が一致し、エラーは0件だった。[証拠対応表](artifacts/evidence-linkage.md)の実行ソース対応済みは195→205変種、個別成立記録はあるが走査時ソース未対応は63→53変種となった。依存サービスのイメージIDやDB・Redis等の状態、ホスト資源までの完全一致は未証明である。`artifacts/`内の通信原本とHTMLはローカル成果物で、Git公開対象には含めない。
