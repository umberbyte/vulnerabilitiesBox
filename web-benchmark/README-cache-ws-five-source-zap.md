# 経路キャッシュ・WebSocket系5変種の成立確認とZAP再計測

2026-10-05に、B0343（WebSocket部屋認可欠落）、B0344（WebSocket message role欠落）、B0378（path delimiter deception）、B0379（path decode key差）、B0381（redirect cache汚染）をローカルDockerで確認した。[個別V/F/N成立確認](artifacts/extended-regression-saved-cache-ws-five-source-20261005.json)は5変種・15セルすべて合格し、[セル別記録](artifacts/docker-smoke-cache-ws-five-source-20261005.json)を保存した。確認時の対象アプリの実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で、各ZAPセルの対象前後および制御側と一致した。依存サービスの実際の状態まで一致を証明したものではない。

[計画](artifacts/panel-cache-ws-five-source-20261005.json)と[台帳](artifacts/panel-cache-ws-five-source-20261005-ledger.json)に15セルを保存した。seedは`batch5-docker-smoke`、profileは`active`、上限は90秒・700リクエスト、同時2リクエスト。B0343・B0344はaliceのセッション認証、他3変種は匿名である。15セルすべて`completed`、実行エラー0、通信drain済み、ZAP API履歴の保存完了を確認した。

| 変種 | V/F/Nの実リクエスト数 | V/F/Nの保存済みZAP通信件数 | V/F/Nの全アラート数 | V/F/Nの対象URL通信件数 | ZAP HTML |
| --- | --- | --- | --- | --- | --- |
| B0343 | 231/231/231 | 158/158/158 | 14/14/14 | 29/29/29 | [V](artifacts/zap-2026-10-05T05-30-26-580Z-478785/zap-report.html)・[F](artifacts/zap-2026-10-05T05-30-42-275Z-de2c42/zap-report.html)・[N](artifacts/zap-2026-10-05T05-30-58-005Z-2b213f/zap-report.html) |
| B0344 | 231/231/231 | 158/158/158 | 14/14/14 | 29/29/29 | [V](artifacts/zap-2026-10-05T05-31-13-246Z-95af32/zap-report.html)・[F](artifacts/zap-2026-10-05T05-31-28-941Z-4409d0/zap-report.html)・[N](artifacts/zap-2026-10-05T05-31-44-563Z-baed9d/zap-report.html) |
| B0378 | 299/299/299 | 240/240/240 | 29/29/29 | 88/88/88 | [V](artifacts/zap-2026-10-05T05-32-00-157Z-d00ea5/zap-report.html)・[F](artifacts/zap-2026-10-05T05-32-16-627Z-13283e/zap-report.html)・[N](artifacts/zap-2026-10-05T05-32-33-119Z-e5394a/zap-report.html) |
| B0379 | 299/299/299 | 240/240/240 | 29/29/29 | 88/88/88 | [V](artifacts/zap-2026-10-05T05-32-51-594Z-24b11a/zap-report.html)・[F](artifacts/zap-2026-10-05T05-33-08-065Z-5cb405/zap-report.html)・[N](artifacts/zap-2026-10-05T05-33-26-538Z-fabdaa/zap-report.html) |
| B0381 | 277/277/277 | 213/213/213 | 43/43/43 | 61/61/61 | [V](artifacts/zap-2026-10-05T05-33-42-970Z-25eead/zap-report.html)・[F](artifacts/zap-2026-10-05T05-34-03-470Z-7f2729/zap-report.html)・[N](artifacts/zap-2026-10-05T05-34-23-973Z-2ff4d1/zap-report.html) |

対象URLへのHTTP到達は保存済み通信から確認した。ただし、B0343・B0344のHTTP履歴には`Upgrade: websocket`要求がなく、WebSocketフレームによる別の部屋の読み取りや管理操作の証拠もない。B0378では`public;private`、B0379では`public%2Fprivate`と`public%252Fprivate`、B0381では`destination=`を含む要求が保存履歴に見当たらなかった。各V/F/Nのアラート数は同じで、Highは0件である。対象URLでのcache-control再確認などの共通アラートを、これらの欠陥の検出成功とは判定しない。必要な通信形態を持つ評価条件と、原通信・アラートの根拠レビューが残る。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが60から65変種、個別成立記録はあるがソース対応未確認が198から193変種となった。依存環境の完全対応済みは0のままである。
