# 認証付き5変種の成立確認とZAP再計測

2026-10-05にB0094（Mongo projection）、B0209（reset tokenログ公開）、B0212（回復コード保管平文）、B0242（alg鍵種別混同）、B0250（実行型復元）をローカルDockerで確認した。[個別V/F/N成立確認](artifacts/extended-regression-saved-auth-five-source-20261005.json)は5変種・15セルすべて合格し、[セル別記録](artifacts/docker-smoke-auth-five-source-20261005.json)を保存した。外部・顧客システムは対象にしていない。

最初の一括計画生成は`Invalid variant selection`で拒否された。B0094・B0209は追加変種、B0212・B0242・B0250は代表変種で、計画器が異なるためである。この失敗時にZAP計測は始まっていない。その後、[追加変種の計画](artifacts/panel-auth-additional-two-source-20261005.json)・[台帳](artifacts/panel-auth-additional-two-source-20261005-ledger.json)と、[代表変種の計画](artifacts/panel-auth-representative-three-source-20261005.json)・[台帳](artifacts/panel-auth-representative-three-source-20261005-ledger.json)に分け、同じseed `batch5-docker-smoke`、profile `active`、session認証、指定上限90秒・700リクエスト、並列2リクエストで実行した。合計15セルはすべて`completed`、実行エラー0、通信履歴の保存とdrainは完了した。

| 変種 | V/F/Nの実行リクエスト数 | V/F/Nの保存済みZAP通信数 | V/F/Nの全アラート数 | ZAP HTML |
| --- | --- | --- | --- | --- |
| B0094 | 454/454/454 | 383/383/383 | 17/17/17 | [V](artifacts/zap-2026-10-05T07-05-53-951Z-5aafcb/zap-report.html)・[F](artifacts/zap-2026-10-05T07-06-21-929Z-ecb479/zap-report.html)・[N](artifacts/zap-2026-10-05T07-06-49-392Z-8f97fa/zap-report.html) |
| B0209 | 456/456/456 | 397/397/397 | 29/29/29 | [V](artifacts/zap-2026-10-05T07-07-16-755Z-84ada8/zap-report.html)・[F](artifacts/zap-2026-10-05T07-07-44-647Z-e69ce6/zap-report.html)・[N](artifacts/zap-2026-10-05T07-08-12-019Z-77b73e/zap-report.html) |
| B0212 | 691/689/689 | 645/643/643 | 44/44/44 | [V](artifacts/zap-2026-10-05T07-09-26-602Z-f5b357/zap-report.html)・[F](artifacts/zap-2026-10-05T07-10-08-734Z-c6d655/zap-report.html)・[N](artifacts/zap-2026-10-05T07-10-48-392Z-3f7d95/zap-report.html) |
| B0242 | 295/295/295 | 234/234/234 | 34/34/34 | [V](artifacts/zap-2026-10-05T07-11-27-937Z-c6b845/zap-report.html)・[F](artifacts/zap-2026-10-05T07-11-51-247Z-c2244f/zap-report.html)・[N](artifacts/zap-2026-10-05T07-12-14-537Z-b80637/zap-report.html) |
| B0250 | 651/651/651 | 581/581/581 | 15/15/15 | [V](artifacts/zap-2026-10-05T07-12-36-331Z-dda584/zap-report.html)・[F](artifacts/zap-2026-10-05T07-13-19-808Z-fdcb30/zap-report.html)・[N](artifacts/zap-2026-10-05T07-14-03-284Z-f6e7c4/zap-report.html) |

成立確認と各ZAPセルの対象アプリ実行ソースSHA-256は`3857151b1f920ba5f58378688911d04d4b8fb11109b18854b555d388a6bea6d2`で一致した。依存サービスやホスト環境全体の一致までは証明していない。保存済みアラートをplugin ID・URL・HTTPメソッド・パラメータ単位で照合した範囲では、各変種のVだけに出るアラートはなかった。Highアラートも0件だった。ページやAPIへの到達と、当該欠陥の検出は別に評価する必要があり、この結果だけでTP/FNを確定しない。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行ソース対応済みが86から91変種、個別成立記録はあるがソース対応未確認が172から167変種となった。V/F/N完走系列がある変種は258のまま、依存環境の完全対応済みは0のままである。
