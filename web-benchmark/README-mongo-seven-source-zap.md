# MongoDB系7変種の成立確認とZAP再計測（2026-10-05）

B0091、B0092、B0093、B0095、B0096、B0097、B0098をローカルDockerで再確認した。既存の`tests/batch6-mongo.mjs`を新しい`tests/source-linked-extended.mjs`から実行し、[個別V/F/N成立記録](artifacts/extended-regression-source-link-mongo-seven-20261005.json)を保存した。21セルがすべて通過し、検証前後のソースと実行中の対象ソースも一致した。このラッパーは選択した既存テストの出力を変種・arm単位で照合するもので、ZAPの検出を判定しない。

代表変種6件は[計画](artifacts/panel-mongo-six-source-20261005.json)と[18セルの台帳](artifacts/panel-mongo-six-source-20261005-ledger.json)、追加変種B0095は[計画](artifacts/panel-mongo-b0095-source-20261005.json)と[3セルの台帳](artifacts/panel-mongo-b0095-source-20261005-ledger.json)で、同じseed `mongo-engine-acceptance-v1`、session認証の`alice`、active profile、90秒/700リクエスト、最大同時2リクエストとしてZAP再計測した。全21セルが`completed`で、本人識別、保護された正常操作への到達、通信drain、ZAP HTMLの保存を確認した。

| 変種 | V/F/Nの保存要求数 | V/F/Nの全アラート数 | ZAP HTML（V / F / N） |
| --- | --- | --- | --- |
| B0091 | 453/453/453 | 16/16/16 | [V](artifacts/zap-2026-10-05T12-35-31-632Z-e051fb/zap-report.html) / [F](artifacts/zap-2026-10-05T12-35-59-534Z-ee278b/zap-report.html) / [N](artifacts/zap-2026-10-05T12-36-26-993Z-f30dc7/zap-report.html) |
| B0092 | 239/239/239 | 15/15/15 | [V](artifacts/zap-2026-10-05T12-36-54-354Z-d3e2e3/zap-report.html) / [F](artifacts/zap-2026-10-05T12-37-12-063Z-222972/zap-report.html) / [N](artifacts/zap-2026-10-05T12-37-29-777Z-1e996c/zap-report.html) |
| B0093 | 453/446/446 | 16/15/15 | [V](artifacts/zap-2026-10-05T12-37-47-489Z-81ca6f/zap-report.html) / [F](artifacts/zap-2026-10-05T12-38-14-813Z-ef5eba/zap-report.html) / [N](artifacts/zap-2026-10-05T12-38-42-565Z-7883a0/zap-report.html) |
| B0095 | 450/450/450 | 16/16/16 | [V](artifacts/zap-2026-10-05T12-44-11-734Z-072100/zap-report.html) / [F](artifacts/zap-2026-10-05T12-44-39-816Z-4e8972/zap-report.html) / [N](artifacts/zap-2026-10-05T12-45-07-280Z-7a6645/zap-report.html) |
| B0096 | 456/456/456 | 16/16/16 | [V](artifacts/zap-2026-10-05T12-39-10-311Z-25d7eb/zap-report.html) / [F](artifacts/zap-2026-10-05T12-39-38-086Z-3d2db6/zap-report.html) / [N](artifacts/zap-2026-10-05T12-40-05-841Z-2e29fb/zap-report.html) |
| B0097 | 454/454/454 | 17/17/17 | [V](artifacts/zap-2026-10-05T12-40-33-586Z-985934/zap-report.html) / [F](artifacts/zap-2026-10-05T12-41-01-341Z-9540ad/zap-report.html) / [N](artifacts/zap-2026-10-05T12-41-29-092Z-b73996/zap-report.html) |
| B0098 | 446/446/446 | 15/15/15 | [V](artifacts/zap-2026-10-05T12-41-56-815Z-0a5ae1/zap-report.html) / [F](artifacts/zap-2026-10-05T12-42-24-495Z-5d7da8/zap-report.html) / [N](artifacts/zap-2026-10-05T12-42-52-232Z-0683db/zap-report.html) |

成立確認と21回のZAP計測で対象の実行ソースSHA-256は`7c752884e402a6ee0f1eca50c0719dbcde2ec70618ea1cb106b33bf0484595a7`と一致した。成立確認時のリポジトリソースSHA-256は`97874cee8b3c403961f8fc586eb9ca8f756c743d109135336ff5c23acfe06bc9`。依存サービスの実イメージID、MongoDB・DB・Redisの状態、ホスト資源までの一致は未証明である。

B0093のVはF/Nよりアラートが1件多いが、plugin IDの集合は同じだった。アラート数からMongoDB系欠陥の直接検出を推定しない。保存されたHTTP要求・応答と個別成立証拠を照合するまで、検出成否は未判定とする。[オフライン証拠対応表](artifacts/evidence-linkage.md)では、実行ソース対応済みが175から182変種、個別記録はあるがソース未対応が83から76変種になった。V/F/Nの完走系列がある258変種、依存環境まで完全対応済みの0変種は変わらない。

最初の検証コンテナ起動ではComposeへ選択用環境変数を渡し忘れ、ラッパーがテスト開始前に入力エラーで終了した。`docker compose run`に`-e BENCHMARK_SOURCE_LINK_TEST -e BENCHMARK_SOURCE_LINK_VARIANTS -e BENCHMARK_SOURCE_LINK_OUTPUT`を加えて再実行し、上記の保存済み成立記録を得た。失敗した初回起動から成立・検出の結果は採用していない。
