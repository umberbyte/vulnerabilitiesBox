# XML 6変種の成立確認とZAP再走査（2026-10-05）

B0106、B0110、B0112、B0114、B0115、B0119について、ローカルDockerの固定fixtureで[`tests/batch6-xml.mjs`](tests/batch6-xml.mjs)を再実行した。[個別V/F/N成立記録](artifacts/extended-regression-source-link-xml-six-20261005.json)は18/18セル通過し、検証前後と対象アプリの実行ソースが一致した。これはfixtureの成立確認であり、スキャナーによる検出の証拠ではない。

[計画](artifacts/panel-xml-six-source-20261005.json)と[18セルの台帳](artifacts/panel-xml-six-source-20261005-ledger.json)で、同一seed `xml-six-source-20261005`、session認証の`alice`、active profile、90秒/700リクエスト、最大同時2リクエストを設定してZAPを走査した。18セルすべて`completed`で、走査後の認証・保護操作、通信drain、HTMLレポート保存を確認した。ZAP計画のseedは個別成立確認で使用したseedとは異なる。両者の実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致し、検証時のリポジトリ全体のソースSHA-256は`f1ae1c3b70b7247ff68b433d8638743b8c49f5c2ec599727005e22a36004c2fb`だった。

| 変種 | V/F/NのHTTP要求数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0106 | 442/458/458 | 17/16/16 | [V](artifacts/zap-2026-10-05T13-36-33-759Z-9a1568/zap-report.html) / [F](artifacts/zap-2026-10-05T13-37-03-711Z-951172/zap-report.html) / [N](artifacts/zap-2026-10-05T13-37-31-100Z-efdfc0/zap-report.html) |
| B0110 | 497/488/488 | 32/31/31 | [V](artifacts/zap-2026-10-05T13-38-00-463Z-5181a4/zap-report.html) / [F](artifacts/zap-2026-10-05T13-38-32-259Z-94c051/zap-report.html) / [N](artifacts/zap-2026-10-05T13-39-03-582Z-43a2c3/zap-report.html) |
| B0112 | 453/453/453 | 16/16/16 | [V](artifacts/zap-2026-10-05T13-39-34-919Z-38f018/zap-report.html) / [F](artifacts/zap-2026-10-05T13-40-04-164Z-11385d/zap-report.html) / [N](artifacts/zap-2026-10-05T13-40-33-383Z-b0c20b/zap-report.html) |
| B0114 | 239/239/239 | 15/15/15 | [V](artifacts/zap-2026-10-05T13-41-03-123Z-6c08fd/zap-report.html) / [F](artifacts/zap-2026-10-05T13-41-20-731Z-95aad6/zap-report.html) / [N](artifacts/zap-2026-10-05T13-41-40-343Z-cc63bb/zap-report.html) |
| B0115 | 239/239/239 | 15/15/15 | [V](artifacts/zap-2026-10-05T13-41-57-924Z-e5cdce/zap-report.html) / [F](artifacts/zap-2026-10-05T13-42-15-528Z-f7627b/zap-report.html) / [N](artifacts/zap-2026-10-05T13-42-33-115Z-c376d9/zap-report.html) |
| B0119 | 239/239/239 | 15/15/15 | [V](artifacts/zap-2026-10-05T13-42-50-721Z-783e16/zap-report.html) / [F](artifacts/zap-2026-10-05T13-43-08-318Z-ef29fd/zap-report.html) / [N](artifacts/zap-2026-10-05T13-43-25-904Z-b25e00/zap-report.html) |

B0106のVにMedium confidenceのHighアラートplugin `40018`（SQL Injection、`position`に`3-2`）が1件あり、F/Nにはない。対象欠陥はXPath式の評価なので、製品のカテゴリ表示と実影響は別にレビューする。B0110のF/NにはLow confidenceのHighアラートplugin `6`（Path Traversal、`name`に`saved`）が各1件あり、Vにはない。両アラートの`sourceMessageId=19`が指す要求本文は`{"name":"ZAP"}`で、応答はHTTP 400だった。旧系列でも同じ傾向があり、[原本レビュー](README-review-fn-high.md)に整理した。他の4変種にはHighアラートがなかった。いずれも対象脆弱性のTP/FP/FN/TNや検出率は、対象操作とHTTP証拠の人間レビュー前に算定しない。

[オフライン監査索引](artifacts/index.html)ではこの台帳の18/18セル、6/6系列が一致し、エラーは0件だった。[証拠対応表](artifacts/evidence-linkage.md)の実行ソース対応済みは189→195変種、個別成立記録はあるが走査時ソース未対応は69→63変種となった。依存サービスのイメージIDやDB・Redis等の状態、ホスト資源までの完全一致は未証明である。`artifacts/`の原本とHTMLはローカル成果物で、Git公開対象には含めていない。
