# コアDAST代表3変種のソース対応走査

2026-10-05、R0001/B0001（SQL文字列リテラル）、R0005/B0005（並び替え式）、R0021/B0021（HTML本文）について、ローカルDockerで個別成立確認とZAP走査を行いました。成立確認は[9セル・123チェックの記録](artifacts/acceptance-saved-core-three-current-20261005.json)で全件合格し、[ZAP台帳](artifacts/panel-core-three-current-20261005-ledger.json)もV/F/N計9セルすべて`completed`です。走査条件はseed `acceptance-v1`、匿名、標準`active`、各セル90秒・700リクエストの停止目安です。各走査でSpider、active scan、公開通信の収束を確認しました。

| 変種 | VのZAP HTML | FのZAP HTML | NのZAP HTML | リクエスト数 V/F/N | 生アラート数 V/F/N |
| --- | --- | --- | --- | --- | --- |
| B0001 | [V](artifacts/zap-2026-10-05T02-05-52-707Z-2adbcf/zap-report.html) | [F](artifacts/zap-2026-10-05T02-06-21-514Z-c0c2b0/zap-report.html) | [N](artifacts/zap-2026-10-05T02-06-50-215Z-249031/zap-report.html) | 441/441/441 | 32/32/32 |
| B0005 | [V](artifacts/zap-2026-10-05T02-07-18-942Z-f30be7/zap-report.html) | [F](artifacts/zap-2026-10-05T02-07-59-668Z-a3ec31/zap-report.html) | [N](artifacts/zap-2026-10-05T02-08-38-351Z-68b5c4/zap-report.html) | 668/668/668 | 38/38/38 |
| B0021 | [V](artifacts/zap-2026-10-05T02-09-19-101Z-949c3d/zap-report.html) | [F](artifacts/zap-2026-10-05T02-09-47-737Z-b75985/zap-report.html) | [N](artifacts/zap-2026-10-05T02-10-16-311Z-7382fe/zap-report.html) | 438/443/443 | 33/32/32 |

成立確認の検証側、対象アプリ、および9つの走査時の制御側・対象アプリの実行ソースSHA-256は`a9b9714aaf6200644aff686d45e6dc81f4fe95987a8271819a7063de473299a9`で一致しました。各走査の前後でも対象アプリの実行ソースは一致しています。依存サービスのイメージ・初期状態の一致までは証明していません。

この3変種は[証拠対応表](artifacts/evidence-linkage.md)で実行ソース一致として追加され、完走走査がある変種は258、ソース一致は35になりました。生アラートの増減を対象欠陥の検出・誤検出とは扱いません。対象URL、実HTTP、脆弱性の陽性条件を照合する人間レビューは別途必要です。
