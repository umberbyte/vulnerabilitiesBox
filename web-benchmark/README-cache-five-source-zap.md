# キャッシュ系5変種の成立確認とZAP再計測

2026-10-05に、B0372（未key query）、B0373（未key Cookie）、B0374（method cache混同）、B0375（Content-Type key欠落）、B0376（認証header無視）をローカルDockerで確認した。[個別V/F/N成立確認](artifacts/extended-regression-saved-cache-five-source-20261005.json)は5変種・15セルすべて合格し、[セル別記録](artifacts/docker-smoke-cache-five-source-20261005.json)を保存した。確認時の対象アプリの実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で、ZAP診断の各セルでも対象の前後と制御側が一致した。依存サービスの実際のイメージIDや状態まで一致を証明したものではない。

[計画](artifacts/panel-cache-five-source-20261005.json)と[台帳](artifacts/panel-cache-five-source-20261005-ledger.json)に15セルを保存した。条件はseed `batch5-docker-smoke`、`active`、90秒・700リクエストの上限、同時2リクエストで、B0373のみセッション認証、他4変種は匿名である。15セルすべて`completed`、エラー0、通信drain済み、ZAP API履歴の保存完了を確認した。上限は実際の送信件数ではない。

| 変種 | V/F/Nの実リクエスト数 | V/F/Nの保存済みZAP通信件数 | V/F/Nの全アラート数 | V/F/Nの対象`/v4-cache`通信件数 | ZAP HTML |
| --- | --- | --- | --- | --- | --- |
| B0372 | 441/438/438 | 380/377/377 | 29/29/29 | 228/225/225 | [V](artifacts/zap-2026-10-05T04-59-46-201Z-382eba/zap-report.html)・[F](artifacts/zap-2026-10-05T05-00-14-835Z-464922/zap-report.html)・[N](artifacts/zap-2026-10-05T05-00-43-553Z-86cdb7/zap-report.html) |
| B0373 | 231/231/231 | 158/158/158 | 12/12/12 | 29/29/29 | [V](artifacts/zap-2026-10-05T05-01-14-277Z-1bb4e4/zap-report.html)・[F](artifacts/zap-2026-10-05T05-01-29-897Z-d6743b/zap-report.html)・[N](artifacts/zap-2026-10-05T05-01-45-545Z-055b93/zap-report.html) |
| B0374 | 451/451/451 | 392/392/392 | 31/31/31 | 249/249/249 | [V](artifacts/zap-2026-10-05T05-02-03-198Z-6cf9ce/zap-report.html)・[F](artifacts/zap-2026-10-05T05-02-31-834Z-987512/zap-report.html)・[N](artifacts/zap-2026-10-05T05-03-00-449Z-645005/zap-report.html) |
| B0375 | 235/235/235 | 174/174/174 | 29/29/29 | 22/22/22 | [V](artifacts/zap-2026-10-05T05-03-27-028Z-341327/zap-report.html)・[F](artifacts/zap-2026-10-05T05-03-45-553Z-2c2a66/zap-report.html)・[N](artifacts/zap-2026-10-05T05-04-04-045Z-2e4700/zap-report.html) |
| B0376 | 235/235/235 | 174/174/174 | 29/29/29 | 22/22/22 | [V](artifacts/zap-2026-10-05T05-04-22-535Z-fdd425/zap-report.html)・[F](artifacts/zap-2026-10-05T05-04-41-051Z-863bee/zap-report.html)・[N](artifacts/zap-2026-10-05T05-04-59-524Z-1c8460/zap-report.html) |

対象URLへのHTTP到達は保存済み通信から確認した。一方、cache-control再確認のplugin `10015`はV/F/Nのすべてで対象URLにも出ており、この5変種に固有の欠陥を区別する証拠にはならない。その他のアラートもヘッダーやCookieなどの共通指摘が中心で、Highアラートは0件だった。今回の記録からは対象のキャッシュキー欠陥に対するZAPの検出を立証できない。キャッシュが実際にどの要求間で共有されたか、その差分とアラートの根拠を照合するレビューは残る。保存された通信件数、アラート件数、完走を検出率や真陽性判定に換算しない。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが51から56変種、個別成立記録はあるがソース対応未確認が207から202変種となった。依存環境の完全対応済みは0のままである。
