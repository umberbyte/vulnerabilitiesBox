# キャッシュ系追加4変種の成立確認とZAP再計測

2026-10-05に、B0385（fragment cache主体欠落）、B0386（tenant namespace欠落）、B0388（GET body key欠落）、B0389（scheme key欠落）をローカルDockerで確認した。[個別V/F/N成立確認](artifacts/extended-regression-saved-cache-next-four-source-20261005.json)は4変種・12セルすべて合格し、[セル別記録](artifacts/docker-smoke-cache-next-four-source-20261005.json)を保存した。B0389の個別確認にはローカルHTTPSも使用した。対象アプリの実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で、各ZAPセルの対象前後および制御側と一致した。依存サービスのイメージIDや実際の状態までは照合できていない。

最初にB0371も含む5変種で個別確認を試みたが、B0371は既存の選択確認手順の対象一覧に存在せず、`Unknown or duplicate smoke variant`で終了した。[失敗した試行の記録](artifacts/extended-regression-saved-cache-next-source-20261005.json)は5変種失敗・成立確認セル0と示す。B0371の新たなZAP計測は実行せず、今回の成果数に含めない。

[計画](artifacts/panel-cache-next-four-source-20261005.json)と[台帳](artifacts/panel-cache-next-four-source-20261005-ledger.json)に12セルを保存した。seedは`batch5-docker-smoke`、profileは`active`、上限は90秒・700リクエスト、同時2リクエスト。B0385・B0386はaliceのセッション認証、B0388・B0389は匿名である。12セルすべて`completed`、実行エラー0、通信drain済み、ZAP API履歴の保存完了を確認した。

| 変種 | V/F/Nの実リクエスト数 | V/F/Nの保存済みZAP通信件数 | V/F/Nの全アラート数 | V/F/Nの対象cache URL通信件数 | ZAP HTML |
| --- | --- | --- | --- | --- | --- |
| B0385 | 229/231/231 | 156/158/158 | 12/12/12 | 28/29/29 | [V](artifacts/zap-2026-10-05T05-15-28-802Z-c47027/zap-report.html)・[F](artifacts/zap-2026-10-05T05-15-44-451Z-6dcbca/zap-report.html)・[N](artifacts/zap-2026-10-05T05-16-00-178Z-43da4c/zap-report.html) |
| B0386 | 464/464/464 | 391/391/391 | 15/15/15 | 259/259/259 | [V](artifacts/zap-2026-10-05T05-16-15-838Z-7cce4f/zap-report.html)・[F](artifacts/zap-2026-10-05T05-16-47-196Z-8f5d76/zap-report.html)・[N](artifacts/zap-2026-10-05T05-17-18-533Z-4e609c/zap-report.html) |
| B0388 | 235/235/235 | 174/174/174 | 29/29/29 | 22/22/22 | [V](artifacts/zap-2026-10-05T05-17-49-845Z-5c585a/zap-report.html)・[F](artifacts/zap-2026-10-05T05-18-06-334Z-9ff452/zap-report.html)・[N](artifacts/zap-2026-10-05T05-18-24-809Z-7fe32f/zap-report.html) |
| B0389 | 235/235/235 | 174/174/174 | 29/29/29 | 22/22/22 | [V](artifacts/zap-2026-10-05T05-18-43-279Z-f7fd80/zap-report.html)・[F](artifacts/zap-2026-10-05T05-19-01-810Z-428c9c/zap-report.html)・[N](artifacts/zap-2026-10-05T05-19-20-332Z-946782/zap-report.html) |

保存済み通信では対象cache URLへの到達を確認したが、欠陥が現れる差分要求は揃っていない。B0385・B0386の対象通信にあったCookie値は各Vセルで1種類のみで、別主体・別tenantとの共有を調べていない。B0388では本文付きGETが0件、B0389ではHTTP側への要求が0件で、HTTPS側も匿名だった。対象URL上のcache-control再確認（plugin `10015`）などのアラートはV/F/Nすべてに出ており、Highは0件である。この系列の完走やアラートは、4つのキャッシュキー欠陥の検出証拠にならない。差分要求を扱える計測条件と原通信・アラートの対応レビューが残る。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みが56から60変種、個別成立記録はあるがソース対応未確認が202から198変種となった。依存環境の完全対応済みは0のままである。
