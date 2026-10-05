# コアDAST 3変種の成立確認とZAP再計測

2026-10-05にB0050（localStorage設定の動的評価）、B0061（テンプレート本文）、B0065（サーバ側JavaScript評価）をローカルDockerで確認した。[個別成立確認](artifacts/acceptance-saved-core-data-next-source-20261005.json)はV/F/Nの9セル・138チェックがすべて合格した。確認と走査の対象アプリ実行時ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。依存サービスの実状態まで対応を証明したものではない。

[計画](artifacts/panel-core-data-next-source-20261005.json)は全セルでseed `acceptance-v1`、匿名、標準`active`、90秒・700要求・同時2要求とした。[台帳](artifacts/panel-core-data-next-source-20261005-ledger.json)の9セルはすべて`completed`、エラー0、通信drain済みだった。各runの`historyArchive.complete`はtrueで、ZAP API履歴は上限内で尽きた。公開要求数とZAP履歴数は別の計測範囲である。

| 変種 | V/F/Nの公開要求数 | V/F/NのZAP API履歴数 | V/F/Nの生アラート数 | ZAP HTML |
| --- | --- | --- | --- | --- |
| B0050 | 235/235/235 | 174/174/174 | 31/31/31 | [V](artifacts/zap-2026-10-05T04-30-58-398Z-a2c1af/zap-report.html)・[F](artifacts/zap-2026-10-05T04-31-14-967Z-0eeab1/zap-report.html)・[N](artifacts/zap-2026-10-05T04-31-31-540Z-77d128/zap-report.html) |
| B0061 | 645/645/645 | 587/587/587 | 28/28/28 | [V](artifacts/zap-2026-10-05T04-31-48-138Z-8d5d43/zap-report.html)・[F](artifacts/zap-2026-10-05T04-32-24-909Z-5596be/zap-report.html)・[N](artifacts/zap-2026-10-05T04-33-01-701Z-9dbd09/zap-report.html) |
| B0065 | 649/649/649 | 591/591/591 | 28/28/28 | [V](artifacts/zap-2026-10-05T04-33-38-458Z-940f74/zap-report.html)・[F](artifacts/zap-2026-10-05T04-34-15-127Z-72764d/zap-report.html)・[N](artifacts/zap-2026-10-05T04-34-51-846Z-96c93b/zap-report.html) |

B0050はブラウザーのlocalStorage設定を操作して初めて成立する。今回の保存されたZAP履歴にはそのブラウザー内操作の証拠がなく、対象欠陥に対応するV固有アラートもない。B0061・B0065のV履歴では対象の`/r3e-0061`、`/r3e-0065`にそれぞれ443件、448件の通信があり、大半はPOSTだった。しかし成立確認に使った`{{secret}}`、`mark()`は保存POST本文にはなく、対象欠陥に対応するV固有アラートもない。これらの文字列は成立条件を照合するための目印であり、同じ文字列がなければ別の有効な入力もなかったと断定できない。対象アラートの不在だけでFNに採点しない。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では実行時ソース対応済みが44から47変種になり、完走系列はあるがソース未対応のものは214から211変種になった。依存環境の対応済みは0のままである。
