# B0011：保存済みZAP SQL Injectionアラートの個別レビュー

2026-10-05に保存済みの通信、アラート、個別V/F/N成立確認をオフラインで照合した。新たなスキャンや対象アプリへの通信は行っていない。B0011は、Vのみplugin `40018`を持つ27変種のうち、成立確認とZAP走査の**実行ソース105ファイル**の一致が記録された1変種である。これは対象欠陥に関係する有力なアラート候補のレビューであり、ベンチマークのTP数・検出率への算入ではない。

| 確認項目 | 保存資料から確認した事実 |
|---|---|
| 走査条件 | [局所ソース照合記録](artifacts/source-link-20261004-B0011-review.md)にあるV/F/N各1回の完走系列。ZAP 2.17.0、同一画像digest・設定SHA-256 `8da5cebef6175ca28c2521fdca64a5494896b86a20d113a4eee124cf77817203`、同一workspace入口 `/v4-sql`。公開HTTP計測はV 444、F/N各453件。 |
| 実行ソース | 走査前後・制御側・対象側の照合が一致し、個別成立確認の記録と105ファイルのSHA-256が一致した。実行ソース全体のSHA-256は `ddf2b179a100abd07d760aa2661852c4b727330bbae9a6ccf3de1e03cbf982ec`。 |
| Vのアラート | [Vのアラート原本](artifacts/zap-2026-10-04T10-13-29-258Z-518cf6/alerts.json)にplugin `40018`、`SQL Injection`、High、Medium confidence、`POST /v4-sql` のJSON `value` が1件ある。F/Nの[アラート原本](artifacts/zap-2026-10-04T10-13-57-962Z-677dc5/alerts.json)・[原本](artifacts/zap-2026-10-04T10-14-24-679Z-e1561f/alerts.json)には同pluginがない。 |
| 実HTTPの差 | [Vの通信原本](artifacts/zap-2026-10-04T10-13-29-258Z-518cf6/messages-first-500.json)で正常な`Apple`は1行、真となる条件の要求（message 113/115）は1行、偽となる条件の要求（message 114）は0行。同じ真条件の要求は[Fの通信原本](artifacts/zap-2026-10-04T10-13-57-962Z-677dc5/messages-first-500.json)と[Nの通信原本](artifacts/zap-2026-10-04T10-14-24-679Z-e1561f/messages-first-500.json)で0行だった。いずれもHTTP 200。応答は公開商品の行数であり、保護値そのものの取得を示す通信ではない。 |
| 成立確認 | [個別成立確認](artifacts/extended-regression-source-link-20261004.json)のB0011 V/F/Nは合格。別の入力による保護行の露出がVのみ成立し、F/Nでは成立しない。アラートと同じ`/v4-sql`の入力境界に対応する。 |

レビュー判断は「**対象欠陥と整合する差分応答をZAPが観測した、有力な検出候補**」とする。アラートの対象URL・JSONパラメータ・応答差がアプリのSQL入力境界と整合し、同一実行ソースでの個別成立確認もある。ただし、走査と成立確認ではseedが異なり、PostgreSQLを含む依存サービスのimage・初期データ・状態の対応付けはない。F/N側でVと同じ真条件の応答差がないことは確認したが、F/N側でVと同じ偽条件まで試されたとは扱わない。条件をそろえた反復と環境証明が揃うまで、最終TP判定・製品の検出率計算には入れない。

原本改変の検知に使うSHA-256は次のとおり。各列は順に`run.json`、`alerts.json`、`messages-first-500.json`。

| arm | run | alerts | messages |
|---|---|---|---|
| V | `e6fd2223f69b5fa50711955bd8734454c0d9fb923c4a1871fafa38b0a4234f98` | `b04ca02c74063c7df0380abdc1e51949b186d459c847a39655f2421cb5c06641` | `cbc5a75c6090d84c2a8be0c1db9ba00d8bfaa2bde885b9e32b1ed1647adb5593` |
| F | `3fc387d2fb5bab79e676115e3427fbb1bc3033e0187823fce57a3cd3009f92f6` | `9669d0568b99cf0dcc093469310713a463a40f7fbec55b5e69426baf49f116f6` | `b42ae0f1cc7b3088f28300bedc5887ec595c88374c17ea1138bf2c3e0eedf2cd` |
| N | `2c7d5f0568054d405e2bf2d7254bffac2da0ee25af4b2d8035cbe056935c9f36` | `5d58465e1ce075acb82f427a8ead2e77289852cdcb966401f1e838fb84ed097c` | `60dbc9198281c84d2787d4f334ef93972c4c09b977faf98eb6426d55aefff403` |
