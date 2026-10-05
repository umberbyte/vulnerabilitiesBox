# B0226の成立確認とZAP走査

2026-10-05、ローカルDockerのB0226（idle期限欠落）を、seed `acceptance-v1`、ZAP 2.17.0、匿名・標準`active`、各条件90秒・700リクエストの停止目安でV/F/N走査しました。計画は`artifacts/panel-r0226-current-20261005.json`、監査対象の台帳は`artifacts/panel-r0226-current-20261005-ledger.json`です。3条件とも`completed`、Spiderとactive scanが完了し、各665リクエストでした。計測停止時の公開リクエストと非同期処理は収束しています。

| 条件 | ZAPの実行記録 | ZAPのHTMLレポート | 生アラート数 |
| --- | --- | --- | ---: |
| V | [run.json](artifacts/zap-2026-10-05T01-33-45-925Z-3105ff/run.json) | [zap-report.html](artifacts/zap-2026-10-05T01-33-45-925Z-3105ff/zap-report.html) | 30 |
| F | [run.json](artifacts/zap-2026-10-05T01-34-24-682Z-c4f674/run.json) | [zap-report.html](artifacts/zap-2026-10-05T01-34-24-682Z-c4f674/zap-report.html) | 30 |
| N | [run.json](artifacts/zap-2026-10-05T01-35-01-426Z-103de6/run.json) | [zap-report.html](artifacts/zap-2026-10-05T01-35-01-426Z-103de6/zap-report.html) | 30 |

V/F/Nのアラートは種類と件数が同じでした。内容はHTTPヘッダー、Cookie、認証リクエストの識別、User-Agentファザーなどで、idle期限欠落の状態遷移を示すアラートは確認できません。生アラート数をTP/FP/FNや検出率には換算しません。標準の探索・active scanには、期限経過後の既存セッションを維持して再利用する時系列操作が含まれないため、B0226を見逃しと確定する前に、その操作と対象状態の観測を評価条件として設計する必要があります。

別に保存した[現行ソースの個別成立確認](artifacts/acceptance-saved-r0226-current-20261005.json)はV/F/N各23チェック、計69チェックが合格しています。成立確認と今回の3走査は実行時ソースSHA-256 `c4a22b203a90da9b6f57d7bf1d58657a3e710018bd6afb01c6358b117a370601`で一致し、走査ごとの対象・制御側および走査前後も一致しました。依存サービスのイメージと状態の同一性までは証明していません。

旧V失敗の原本は2026-10-05に上書きされ、現在の機械棚卸しではB0226が`vfn_records`と表示されます。[原本欠損の記録](README-evidence-incident.md)に、残る旧ログ・上書き前の棚卸しと限界を記しました。証拠対応表では、合格した同一報告のV/F/Nと今回の走査との**実行時ソース一致**だけを示します。旧失敗を成功に書き換えたり、ZAPによる検出を認定したりするものではありません。`artifacts/`は各利用者の非公開ローカル成果物で、GitHubには含みません。
