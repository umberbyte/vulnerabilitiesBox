# 画面操作系3変種の成立確認とZAP走査

2026-10-05にR0025/B0025（利用者指定のHTML属性名）、R0026/B0026（リンクURLの実行scheme）、R0027/B0027（inline JS文字列のコード連結）をローカルDockerで確認した。[個別成立確認](artifacts/acceptance-saved-core-interaction-three-source-20261005.json)はV/F/N計9セル・147チェックすべて合格した。[初回計画](artifacts/panel-core-interaction-three-source-20261005.json)は同一seed `acceptance-v1`、匿名、標準`active`、各セル90秒・700要求・同時2要求だった。[初回ZAP台帳](artifacts/panel-core-interaction-three-source-20261005-ledger.json)では9セル中7セルが`completed`、B0026のF/Nは701要求に達して`budget_stopped`、エラー0だった。停止セルは完走に算入しない。

B0026は[再計測計画](artifacts/panel-r0026-source-retry-20261005.json)でV/F/Nすべてを120秒・1200要求の同一条件に揃え、[再計測台帳](artifacts/panel-r0026-source-retry-20261005-ledger.json)で3セルすべて`completed`、エラー0、通信drain済みを確認した。初回の予算停止記録は残したままである。

| 変種・採用系列 | VのZAP HTML | FのZAP HTML | NのZAP HTML | 要求数 V/F/N | 生アラート数 V/F/N |
| --- | --- | --- | --- | --- | --- |
| B0025・初回 | [V](artifacts/zap-2026-10-05T03-22-32-836Z-a66b69/zap-report.html) | [F](artifacts/zap-2026-10-05T03-23-13-616Z-a67c0e/zap-report.html) | [N](artifacts/zap-2026-10-05T03-23-52-397Z-5f9e6c/zap-report.html) | 669/669/669 | 42/42/42 |
| B0026・再計測 | [V](artifacts/zap-2026-10-05T03-29-24-710Z-55d8d3/zap-report.html) | [F](artifacts/zap-2026-10-05T03-30-01-520Z-f17c37/zap-report.html) | [N](artifacts/zap-2026-10-05T03-30-36-330Z-f9e37c/zap-report.html) | 693/701/701 | 47/44/44 |
| B0027・初回 | [V](artifacts/zap-2026-10-05T03-26-18-830Z-b2b82b/zap-report.html) | [F](artifacts/zap-2026-10-05T03-26-55-513Z-bf32bf/zap-report.html) | [N](artifacts/zap-2026-10-05T03-27-32-212Z-b483b4/zap-report.html) | 691/687/687 | 41/40/40 |

成立確認の検証コンテナ・対象アプリと、上記9走査の制御コンテナ・対象アプリの実行時ソースSHA-256は`a9b9714aaf6200644aff686d45e6dc81f4fe95987a8271819a7063de473299a9`で一致した。成立確認・走査とも対象アプリの前後指紋も一致した。依存サービスの実際のimageと初期状態の対応は未検証のままである。[証拠対応表](artifacts/evidence-linkage.md)ではソース対応済み41変種、完走済みだがソース未対応217変種となった。

保存済みアラートをplugin単位で比較すると、B0025にはV固有ルールがない。B0026の再計測Vには`GET /link-preview`の`linkUrl=javascript:alert(1);`にルール`40012`（反射型XSS、High）がmessage `147`で1件、B0027のVには`GET /greeting-preview`の`jsString`に同ルールがmessage `146`で1件あり、対応するF/Nにはない。これらは**候補の棚卸し**であり、アラート数だけではTP/FN/FPへ採点しない。

B0026・B0027について、保存アラートの**正確なURL・入力**をV/F/Nへ再送した[ブラウザー確認](artifacts/diagnostic-core-interaction-alerts-20261005.json)では、B0026はVのリンク実クリックでのみ`alert(1)`が発生し、F/Nのリンク先は`#invalid-link`だった。B0027はページ読込時にVでのみ`alert(1)`が発生した。両変種ともF/Nのダイアログは0回、対象アプリの実行時ソース指紋は確認前後で一致した。対象欠陥に対応するアラート候補の実動作は確認したが、依存環境と正式なレビュー判定はなお保留する。

B0025はV/F/N各669要求のうち、保存された先頭500通信にはそれぞれ`/button-preview`が418要求あるが、`attrName=onclick`は見当たらない。残る169要求の内容はこの保存資料からは分からず、ZAPが成立に必要な属性名と値の組を送ったか確定できない。V固有アラートがないことだけを根拠にFNとしない。個別成立確認では実クリックによるVだけのevent実行を確認している。
