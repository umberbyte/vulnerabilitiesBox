# ローカル取得系4変種の成立確認とZAP再計測

2026-10-05に、B0120（OOXML外部relationship）、B0161（URL全体の信頼）、B0177（URLパーサ不一致）、B0180（複数宛先fallback）をローカルDockerで確認した。4変種の[個別V/F/N成立確認](artifacts/extended-regression-saved-local-fetch-next-four-source-20261005.json)は計12セルすべて合格し、[セル別記録](artifacts/docker-smoke-local-fetch-next-four-source-20261005.json)を保存した。取得先は許可済みのfixture名をコンテナ内のlocalhost固定サーバーに割り当てる実装であり、この確認では外部システムに取得要求を送っていない。

[計画](artifacts/panel-local-fetch-next-four-source-20261005.json)と[台帳](artifacts/panel-local-fetch-next-four-source-20261005-ledger.json)にZAPの12セルを保存した。全セルは`completed`、エラー0、通信履歴の保存とdrainは完了した。seedは`batch5-docker-smoke`、profileは`active`、指定上限は90秒・700リクエスト、並列2リクエスト。成立確認と各ZAPセルの対象アプリ実行ソースSHA-256は`3857151b1f920ba5f58378688911d04d4b8fb11109b18854b555d388a6bea6d2`で一致した。依存サービスやホスト環境全体の一致までは証明していない。

| 変種 | V/F/Nの実行リクエスト数 | V/F/Nの保存済みZAP通信数 | V/F/Nの全アラート数 | `/v4-fetch`保存通信 | ZAP HTML |
| --- | --- | --- | --- | --- | --- |
| B0120 | 243/243/243 | 184/184/184 | 33/33/33 | 各41件 | [V](artifacts/zap-2026-10-05T06-32-12-028Z-ea95c1/zap-report.html)・[F](artifacts/zap-2026-10-05T06-32-29-114Z-00af09/zap-report.html)・[N](artifacts/zap-2026-10-05T06-32-43-678Z-feb3c9/zap-report.html) |
| B0161 | 446/446/446 | 387/387/387 | 33/33/33 | 各244件 | [V](artifacts/zap-2026-10-05T06-33-00-184Z-998db0/zap-report.html)・[F](artifacts/zap-2026-10-05T06-33-28-827Z-d3afce/zap-report.html)・[N](artifacts/zap-2026-10-05T06-33-57-508Z-4a4449/zap-report.html) |
| B0177 | 446/446/446 | 387/387/387 | 33/33/33 | 各244件 | [V](artifacts/zap-2026-10-05T06-34-26-157Z-6eff32/zap-report.html)・[F](artifacts/zap-2026-10-05T06-34-52-763Z-88b997/zap-report.html)・[N](artifacts/zap-2026-10-05T06-35-21-371Z-2538c9/zap-report.html) |
| B0180 | 645/645/645 | 587/587/587 | 33/33/33 | 各419件 | [V](artifacts/zap-2026-10-05T06-35-49-949Z-66858c/zap-report.html)・[F](artifacts/zap-2026-10-05T06-36-26-613Z-d430a4/zap-report.html)・[N](artifacts/zap-2026-10-05T06-37-03-258Z-787a28/zap-report.html) |

保存済み通信には対象エンドポイントへの到達が見える。一方、これらの変種で成立確認が使う内部fixtureの宛先をZAPが送った証拠は確認できなかった。全セルのアラート内訳はMedium 6、Low 10、Informational 17で同じで、Highは0だった。この一致だけでTP/FNを確定しない。固定fixtureの意図的な内部取得を検出するには、入力経路とHTTP応答を個別に照合する追加評価が必要である。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが77から81変種、個別成立記録はあるがソース対応未確認が181から177変種となった。依存環境の完全対応済みは0のままである。
