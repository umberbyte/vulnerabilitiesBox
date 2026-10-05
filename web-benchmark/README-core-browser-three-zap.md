# 表示境界3変種の成立確認とZAP走査

2026-10-05にR0022/B0022（引用済みHTML属性）、R0029/B0029（JSONのHTML script終了境界）、R0031/B0031（style要素内のCSS値）をローカルDockerで確認した。[個別成立確認](artifacts/acceptance-saved-core-browser-three-source-20261005.json)はV/F/N計9セル・144チェックすべて合格した。[事前計画](artifacts/panel-core-browser-three-source-20261005.json)は同一seed `acceptance-v1`、匿名、標準`active`、各セル90秒・700要求・同時2要求とし、[ZAP台帳](artifacts/panel-core-browser-three-source-20261005-ledger.json)で9セルすべて`completed`、エラー0、通信drain済みを確認した。

| 変種 | VのZAP HTML | FのZAP HTML | NのZAP HTML | 要求数 V/F/N | 生アラート数 V/F/N |
| --- | --- | --- | --- | --- | --- |
| B0022 | [V](artifacts/zap-2026-10-05T02-54-21-817Z-1bdacf/zap-report.html) | [F](artifacts/zap-2026-10-05T02-54-50-495Z-859952/zap-report.html) | [N](artifacts/zap-2026-10-05T02-55-19-198Z-fe2258/zap-report.html) | 460/467/467 | 38/37/37 |
| B0029 | [V](artifacts/zap-2026-10-05T02-55-47-888Z-5a8c86/zap-report.html) | [F](artifacts/zap-2026-10-05T02-56-18-548Z-e40454/zap-report.html) | [N](artifacts/zap-2026-10-05T02-56-49-202Z-5c06d3/zap-report.html) | 468/468/468 | 37/37/37 |
| B0031 | [V](artifacts/zap-2026-10-05T02-57-19-881Z-50880c/zap-report.html) | [F](artifacts/zap-2026-10-05T02-57-50-489Z-0c95ba/zap-report.html) | [N](artifacts/zap-2026-10-05T02-58-23-105Z-83f9f8/zap-report.html) | 464/468/468 | 38/37/37 |

成立確認の検証コンテナ・対象アプリと9走査の制御コンテナ・対象アプリの**実行時ソース**SHA-256は`a9b9714aaf6200644aff686d45e6dc81f4fe95987a8271819a7063de473299a9`で一致した。成立確認・走査とも対象アプリの前後指紋も一致した。ホストのソース指紋はDockerの実行時指紋と別に記録されているため、ホスト指紋を比較根拠には使わない。依存サービスの実際のimageと初期状態の対応は未検証のままである。[証拠対応表](artifacts/evidence-linkage.md)はソース対応済み38変種、完走済みだがソース未対応220変種になった。

保存済みの`alerts.json`で、B0022のVには`GET /label-preview`の`quotedAttr`にルール`40012`（反射型XSS、High）がmessage `92`で1件、B0031のVには`GET /theme-preview`の`cssValue`に同ルールがmessage `96`で1件ある。いずれも対応するF/Nに同ルールはない。B0029には対象のscript終了境界に対応するV固有アラートを確認できなかった。これらは**候補の棚卸し**であり、保存HTTPとZAPの正確な入力をブラウザーのV/F/Nへ再送して根本原因に対応するか確認するまではTP/FN/FPへ採点しない。

成立確認の最初の試行は出力名が`acceptance-saved-*.json`の許可パターンに合わず、対象への確認要求前に停止した。出力名を修正し、別名のJSONへ再実行して合格した。失敗は出力名の検査であり、対象アプリの成立失敗ではない。
