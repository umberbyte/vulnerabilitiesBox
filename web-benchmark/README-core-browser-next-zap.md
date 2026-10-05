# コアDAST 3変種の成立確認とZAP再計測

2026-10-05にB0034（SVGマークアップ）、B0043（クリップボード値置換）、B0047（setAttributeイベント）をローカルDockerで確認した。[個別成立確認](artifacts/acceptance-saved-core-browser-next-source-20261005.json)はV/F/Nの9セル・130チェックがすべて合格した。確認と走査の対象アプリ実行時ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`で一致した。これはソースの対応であり、依存サービスの状態まで一致した証明ではない。

[計画](artifacts/panel-core-browser-next-source-20261005.json)は全セルでseed `acceptance-v1`、匿名、標準`active`、90秒・700要求・同時2要求とした。[台帳](artifacts/panel-core-browser-next-source-20261005-ledger.json)の9セルはすべて`completed`、エラー0、通信drain済みである。各runの`historyArchive.complete`はtrueで、ZAP API履歴は上限内で尽きた。公開要求数とZAP履歴数は別の計測範囲である。

| 変種 | V/F/Nの公開要求数 | V/F/NのZAP API履歴数 | V/F/Nの生アラート数 | ZAP HTML |
| --- | --- | --- | --- | --- |
| B0034 | 464/468/468 | 404/407/407 | 39/38/38 | [V](artifacts/zap-2026-10-05T04-15-57-287Z-174cb1/zap-report.html)・[F](artifacts/zap-2026-10-05T04-16-26-056Z-5f1066/zap-report.html)・[N](artifacts/zap-2026-10-05T04-16-54-821Z-1a96ee/zap-report.html) |
| B0043 | 462/462/462 | 401/401/401 | 36/36/36 | [V](artifacts/zap-2026-10-05T04-17-23-501Z-9494cb/zap-report.html)・[F](artifacts/zap-2026-10-05T04-17-52-172Z-9d436e/zap-report.html)・[N](artifacts/zap-2026-10-05T04-18-20-823Z-1df9a1/zap-report.html) |
| B0047 | 465/465/465 | 404/404/404 | 36/36/36 | [V](artifacts/zap-2026-10-05T04-18-51-500Z-d5f463/zap-report.html)・[F](artifacts/zap-2026-10-05T04-19-20-154Z-ab4499/zap-report.html)・[N](artifacts/zap-2026-10-05T04-19-50-849Z-f1dbfe/zap-report.html) |

B0034のVには`GET /icon-preview`の`svg`に対するルール`40012`（反射型XSS、High）のアラート1件があり、同じルールはF/Nにはない。保存通信message `96`の応答には投入された`<scrIpt>alert(1);</scRipt>`がHTMLに現れている。今回、この正確なアラート入力でブラウザー実行は再確認していない。B0043とB0047には対象欠陥に対応するV固有アラートを確認できなかった。いずれもアラートの有無のみでTP/FN/FPに採点せず、成立確認・対象入力への到達・ブラウザー動作を分けてレビューする。

オフラインの[証拠対応表](artifacts/evidence-linkage.md)では、実行時ソース対応済みが41から44変種になり、完走系列はあるがソース未対応のものは217から214変種になった。依存環境の対応済みは0のままである。
