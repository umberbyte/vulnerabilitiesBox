# SQL系14変種の成立確認とZAP再走査（2026-10-05）

対象は B0004、B0007～B0010、B0012～B0020（B0011を除く）の14変種です。既存のDocker環境で個別V/F/N成立確認を行い、[SQL系追加11変種の33/33セル](artifacts/extended-regression-source-link-sql-more-20261005.json)、[優先4変種の12/12セル](artifacts/extended-regression-source-link-sql-priority-20261005.json)、[B0016の3/3セル](artifacts/extended-regression-source-link-sql-update-20261005.json)が通過しました。合計48セルのうち、今回の対象14変種は42/42セルです。成立確認のリポジトリ全体のソースSHA-256は `f1ae1c3b70b7247ff68b433d8638743b8c49f5c2ec599727005e22a36004c2fb`、対象アプリの実行ソースSHA-256は `7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7` です。成立確認は固定fixtureの結果であり、ZAPの検出成否を示しません。

[走査計画](artifacts/panel-sql-fourteen-source-20261005.json)と[42セルの台帳](artifacts/panel-sql-fourteen-source-20261005-ledger.json)は、共通seed `sql-fourteen-source-20261005`、active profile、90秒/700 HTTP要求、同時実行2の条件です。42/42セルが完了し、エラー0、全セルの通信drain、ZAP HTML保存、実行ソースSHA-256一致を確認しました。ZAPは各セルに個別の脆弱性ラベルを渡されていません。

| 変種 | V/F/NのHTTP要求数 | V/F/Nの生アラート数 | ZAP HTML（V / F / N） |
| --- | ---: | ---: | --- |
| B0004 | 456/456/456 | 34/34/34 | [V](artifacts/zap-2026-10-05T14-30-48-464Z-735fd8/zap-report.html) / [F](artifacts/zap-2026-10-05T14-31-17-118Z-77ddbd/zap-report.html) / [N](artifacts/zap-2026-10-05T14-31-43-790Z-64aa0a/zap-report.html) |
| B0007 | 456/456/456 | 34/34/34 | [V](artifacts/zap-2026-10-05T14-32-12-471Z-32ab35/zap-report.html) / [F](artifacts/zap-2026-10-05T14-32-58-784Z-7bae59/zap-report.html) / [N](artifacts/zap-2026-10-05T14-33-27-426Z-98b12b/zap-report.html) |
| B0008 | 460/458/458 | 34/34/34 | [V](artifacts/zap-2026-10-05T14-33-56-095Z-000323/zap-report.html) / [F](artifacts/zap-2026-10-05T14-34-40-843Z-f8f09c/zap-report.html) / [N](artifacts/zap-2026-10-05T14-35-09-440Z-8404f1/zap-report.html) |
| B0009 | 453/453/453 | 34/34/34 | [V](artifacts/zap-2026-10-05T14-35-36-022Z-6bc48b/zap-report.html) / [F](artifacts/zap-2026-10-05T14-36-04-638Z-786079/zap-report.html) / [N](artifacts/zap-2026-10-05T14-36-31-227Z-192f1a/zap-report.html) |
| B0010 | 453/453/453 | 34/34/34 | [V](artifacts/zap-2026-10-05T14-36-57-853Z-66e9d3/zap-report.html) / [F](artifacts/zap-2026-10-05T14-37-26-438Z-e565b9/zap-report.html) / [N](artifacts/zap-2026-10-05T14-37-55-040Z-a17810/zap-report.html) |
| B0012 | 444/453/453 | 35/34/34 | [V](artifacts/zap-2026-10-05T14-38-23-688Z-3a2f69/zap-report.html) / [F](artifacts/zap-2026-10-05T14-38-52-277Z-bd9ddf/zap-report.html) / [N](artifacts/zap-2026-10-05T14-39-20-901Z-8a317f/zap-report.html) |
| B0013 | 446/453/453 | 35/34/34 | [V](artifacts/zap-2026-10-05T14-39-49-490Z-c8e2da/zap-report.html) / [F](artifacts/zap-2026-10-05T14-40-18-095Z-3a8e12/zap-report.html) / [N](artifacts/zap-2026-10-05T14-40-46-661Z-62eb9c/zap-report.html) |
| B0014 | 456/456/456 | 34/34/34 | [V](artifacts/zap-2026-10-05T14-41-15-254Z-fd8400/zap-report.html) / [F](artifacts/zap-2026-10-05T14-41-56-359Z-d2e4df/zap-report.html) / [N](artifacts/zap-2026-10-05T14-42-24-878Z-c381ad/zap-report.html) |
| B0015 | 445/458/458 | 35/34/34 | [V](artifacts/zap-2026-10-05T14-42-53-458Z-985e92/zap-report.html) / [F](artifacts/zap-2026-10-05T14-43-53-692Z-d5594a/zap-report.html) / [N](artifacts/zap-2026-10-05T14-44-22-293Z-407dcb/zap-report.html) |
| B0016 | 456/456/456 | 17/17/17 | [V](artifacts/zap-2026-10-05T14-44-50-865Z-de836b/zap-report.html) / [F](artifacts/zap-2026-10-05T14-45-18-594Z-36457e/zap-report.html) / [N](artifacts/zap-2026-10-05T14-45-46-304Z-2f2b7e/zap-report.html) |
| B0017 | 456/456/456 | 34/34/34 | [V](artifacts/zap-2026-10-05T14-46-14-021Z-f43030/zap-report.html) / [F](artifacts/zap-2026-10-05T14-46-42-610Z-c0af88/zap-report.html) / [N](artifacts/zap-2026-10-05T14-47-11-146Z-768b60/zap-report.html) |
| B0018 | 243/243/243 | 33/33/33 | [V](artifacts/zap-2026-10-05T14-47-37-763Z-df803a/zap-report.html) / [F](artifacts/zap-2026-10-05T14-47-54-288Z-70d51e/zap-report.html) / [N](artifacts/zap-2026-10-05T14-48-10-751Z-05e292/zap-report.html) |
| B0019 | 456/456/456 | 34/34/34 | [V](artifacts/zap-2026-10-05T14-48-27-228Z-694139/zap-report.html) / [F](artifacts/zap-2026-10-05T14-49-25-502Z-98870c/zap-report.html) / [N](artifacts/zap-2026-10-05T14-49-52-054Z-225f54/zap-report.html) |
| B0020 | 456/456/456 | 34/34/34 | [V](artifacts/zap-2026-10-05T14-50-19-093Z-6e8896/zap-report.html) / [F](artifacts/zap-2026-10-05T14-50-47-663Z-76e87f/zap-report.html) / [N](artifacts/zap-2026-10-05T14-51-16-280Z-46c994/zap-report.html) |

B0012、B0013、B0015のVにのみ、ZAP plugin `40018`（SQL Injection）のHigh risk・Medium confidenceアラートが各1件あります。これらのアラートの `evidence` 欄は空でした。F/Nおよび残るVにはHigh riskアラートがありません。生アラート件数やHighの有無だけでTP/FP/FN/TNを判定せず、HTTP要求・応答と対象実装を個別に確認してください。

[オフライン監査](artifacts/artifact-audit.md)で、この台帳は42/42参照・14/14完走系列・エラー0でした。[証拠対応表](artifacts/evidence-linkage.md)では、実行ソース照合済みは205→219変種、個別成立記録はあるが実行ソース未対応のものは53→39変種です。依存サービスのイメージID、DB等の状態、ホスト資源まで一致を証明したものはありません。`artifacts/` の通信証拠とHTMLはローカル生成物で、Gitには含めません。
