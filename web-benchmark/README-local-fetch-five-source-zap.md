# ローカル取得系5変種の成立確認とZAP再計測

2026-10-05に、B0165（IPv6分類漏れ）、B0166（IPv4 mapped IPv6）、B0173（Webhook自己登録）、B0174（OAuthメタデータ取得）、B0175（リモートJSON schema）をローカルDockerで確認した。対象実装は許可したfixture名をコンテナ内のlocalhost固定サーバーへ振り分けるため、今回の個別確認は外部システムへの取得を伴わない。[個別V/F/N成立確認](artifacts/extended-regression-saved-local-fetch-five-source-20261005.json)は5変種・15セルすべて合格し、[セル別記録](artifacts/docker-smoke-local-fetch-five-source-20261005.json)を保存した。

[計画](artifacts/panel-local-fetch-five-source-20261005.json)と[台帳](artifacts/panel-local-fetch-five-source-20261005-ledger.json)にZAPの15セルを保存した。条件はseed `batch5-docker-smoke`、匿名・`active`、上限90秒・700リクエスト、同時2リクエスト。15セルすべて`completed`、実行エラー0、通信drain済み、ZAP API履歴の保存完了を確認した。個別確認時と各ZAPセルの対象アプリ実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。依存サービスの実際の状態まで一致を証明したものではない。

| 変種 | V/F/Nの実リクエスト数 | V/F/Nの保存済みZAP通信件数 | V/F/Nの全アラート数 | `/v4-fetch`保存通信 | ZAP HTML |
| --- | --- | --- | --- | --- | --- |
| B0165 | 446/446/446 | 387/387/387 | 33/33/33 | 各244件 | [V](artifacts/zap-2026-10-05T06-16-26-702Z-d85316/zap-report.html)・[F](artifacts/zap-2026-10-05T06-16-53-806Z-f90dee/zap-report.html)・[N](artifacts/zap-2026-10-05T06-17-20-537Z-f761a7/zap-report.html) |
| B0166 | 446/446/446 | 387/387/387 | 33/33/33 | 各244件 | [V](artifacts/zap-2026-10-05T06-17-49-220Z-276c00/zap-report.html)・[F](artifacts/zap-2026-10-05T06-18-17-905Z-a97788/zap-report.html)・[N](artifacts/zap-2026-10-05T06-18-46-531Z-417bbe/zap-report.html) |
| B0173 | 446/446/446 | 387/387/387 | 33/33/33 | 各244件 | [V](artifacts/zap-2026-10-05T06-19-15-164Z-9ce36e/zap-report.html)・[F](artifacts/zap-2026-10-05T06-19-43-745Z-ca8d76/zap-report.html)・[N](artifacts/zap-2026-10-05T06-20-12-359Z-c8f0d5/zap-report.html) |
| B0174 | 446/446/446 | 387/387/387 | 33/33/33 | 各244件 | [V](artifacts/zap-2026-10-05T06-20-40-943Z-0a5302/zap-report.html)・[F](artifacts/zap-2026-10-05T06-21-07-504Z-3de07c/zap-report.html)・[N](artifacts/zap-2026-10-05T06-21-36-101Z-e86bd2/zap-report.html) |
| B0175 | 446/446/446 | 387/387/387 | 33/33/33 | 各244件 | [V](artifacts/zap-2026-10-05T06-22-04-673Z-feb21d/zap-report.html)・[F](artifacts/zap-2026-10-05T06-22-33-278Z-3f9b07/zap-report.html)・[N](artifacts/zap-2026-10-05T06-22-59-823Z-433405/zap-report.html) |

保存済みの対象要求には、個別確認で差分を作る内部fixture名`internal.fixture.test`、`[::1]`、IPv4 mapped IPv6の値が見当たらなかった。したがって`/v4-fetch`への到達は確認できるが、内部取得を誘発する条件をZAPが試した証拠はない。5変種ともV/F/Nのアラート総数は同じで、Highは0件だった。これらを欠陥の検出成功や検出率に換算しない。固定fixtureの内部取得に対応する入力・応答を原通信と照合できる評価条件が残る。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが72から77変種、個別成立記録はあるがソース対応未確認が186から181変種となった。依存環境の完全対応済みは0のままである。
