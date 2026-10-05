# 代表変種B0348・B0350の成立確認とZAP再計測

2026-10-05に、B0348（postMessage sourceなし）とB0350（イベント再接続cursor）をローカルDockerで再計測した。両者の[個別V/F/N成立確認](artifacts/extended-regression-saved-stream-five-source-20261005.json)はそれぞれ3セルすべて合格している。最初に追加変種用計画生成器を使った試行は`Invalid variant selection`で止まったため、既存の代表変種用生成器で別々に計画を作り直した。新しい攻撃ルールや対象実装の変更はない。

B0348は[匿名・active計画](artifacts/panel-representative-b0348-source-20261005.json)と[台帳](artifacts/panel-representative-b0348-source-20261005-ledger.json)、B0350は[aliceセッション・active計画](artifacts/panel-representative-b0350-source-20261005.json)と[台帳](artifacts/panel-representative-b0350-source-20261005-ledger.json)に保存した。両計画ともseed `batch5-docker-smoke`、上限90秒・700リクエスト、同時2リクエスト。6セルすべて`completed`、実行エラー0、通信drain済み、ZAP API履歴の保存完了を確認した。個別成立確認と診断ではワークスペースをそれぞれリセットしており、同一状態を継続したものではない。対象アプリの実行ソースSHA-256は両者とも`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で、診断時の対象前後および制御側と一致した。依存サービスの実際の状態まで一致を証明したものではない。

| 変種 | V/F/Nの実リクエスト数 | V/F/Nの保存済みZAP通信件数 | V/F/Nの全アラート数 | 対象URLの保存通信 | ZAP HTML |
| --- | --- | --- | --- | --- | --- |
| B0348 | 259/259/259 | 200/200/200 | 37/37/37 | `/v5-browser`各48件 | [V](artifacts/zap-2026-10-05T06-01-55-417Z-8d004d/zap-report.html)・[F](artifacts/zap-2026-10-05T06-02-14-021Z-f26851/zap-report.html)・[N](artifacts/zap-2026-10-05T06-02-30-674Z-95d705/zap-report.html) |
| B0350 | 231/231/231 | 158/158/158 | 10/10/10 | `/b3-events`各29件 | [V](artifacts/zap-2026-10-05T06-03-27-893Z-1874dc/zap-report.html)・[F](artifacts/zap-2026-10-05T06-03-43-674Z-1179ab/zap-report.html)・[N](artifacts/zap-2026-10-05T06-04-01-101Z-3706e1/zap-report.html) |

B0348の保存資料は対象HTMLへのHTTP到達を示すが、別windowからのpostMessage実行やDOM結果の観測は含まない。B0350の保存通信には`Last-Event-ID`ヘッダーがなく、他人のイベントcursorを指定した再接続は確認できない。どちらもV/F/Nのアラート総数が同じで、Highアラートは0件である。完走やHTTP到達だけでは対象欠陥の検出成功とは判定できず、ブラウザー操作とSSE再接続を含む条件での評価が残る。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが70から72変種、個別成立記録はあるがソース対応未確認が188から186変種となった。依存環境の完全対応済みは0のままである。
