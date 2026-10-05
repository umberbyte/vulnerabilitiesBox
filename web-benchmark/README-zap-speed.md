# ローカルZAPの高速設定

V/F/Nのローカル確認に使う計画では、標準の同時実行数2に加え、`--concurrency 4`を明示できます。4を指定すると、ZAPのスパイダーとアクティブスキャンをそれぞれ4スレッドにし、アクティブスキャンの要求間隔を50msから0msにします。計画、台帳、実行JSONには指定スレッド数を記録します。標準設定を使った既存の計画IDと保存済み結果は変わりません。

ホストのNode.jsやPowerShellスクリプト実行許可は不要です。例えば既存のB0012をV/F/Nで確認する場合は、`web-benchmark`フォルダーで次のように実行します。計画名と台帳名には毎回新しい名前を使ってください。

```powershell
docker compose --profile panel run --build --rm --no-deps --entrypoint node panel src/runner/generate-variant-panel.mjs artifacts/panel-local-fast.json --variants B0012 --profile active --seed local-fast-1 --wall-seconds 90 --requests 700 --concurrency 4
.\run-panel.cmd artifacts/panel-local-fast.json artifacts/panel-local-fast-ledger.json
.\reports.cmd
```

この設定はローカルDockerのベンチマークだけに適用します。2スレッドと4スレッドは走査条件が異なるので、検出率の集計では同じ条件の反復を比較してください。HTTP要求上限は引き続き観測に基づくソフト上限です。単一のアプリ計測窓を保つため、V/F/Nセルは順番に走査します。

同じB0012、seed `b0012-fast-20261006`、active profile、90秒/700 HTTP要求で[標準計画](artifacts/panel-b0012-standard-20261006.json)と[高速計画](artifacts/panel-b0012-fast-20261006.json)を試しました。双方の[標準台帳](artifacts/panel-b0012-standard-20261006-ledger.json)・[高速台帳](artifacts/panel-b0012-fast-20261006-ledger.json)は3/3セル完了、エラー0、通信drain・実行ソース照合・ZAP HTML保存済みです。対象アプリの実行ソースSHA-256は両系列で `b6fd026cee4d85585fe7a36161151af080a389c82df5ad4db8828864a23ab902` に一致しました。台帳セル処理時間の合計は標準94.3秒、高速35.4秒で、この1系列では約2.7倍でした。

| 条件 | V | F | N | V/F/N合計 |
| --- | ---: | ---: | ---: | ---: |
| 2スレッド・50ms | 38.8秒 | 26.8秒 | 28.7秒 | 94.3秒 |
| 4スレッド・0ms | 22.2秒 | 6.6秒 | 6.5秒 | 35.4秒 |

各armのHTTP要求数は双方で444/453/453、生アラート数は35/34/34でした。VのZAP plugin `40018`（SQL Injection）Highアラートも双方にあります。この1系列での一致は、他の変種でも検出結果が一致する証明ではありません。ZAP HTML原本：標準の[V](artifacts/zap-2026-10-05T15-13-40-173Z-c38834/zap-report.html)・[F](artifacts/zap-2026-10-05T15-14-06-830Z-cf5b2c/zap-report.html)・[N](artifacts/zap-2026-10-05T15-14-33-567Z-e256e8/zap-report.html)、高速の[V](artifacts/zap-2026-10-05T15-11-02-639Z-33ad1b/zap-report.html)・[F](artifacts/zap-2026-10-05T15-11-09-643Z-282b8a/zap-report.html)・[N](artifacts/zap-2026-10-05T15-11-16-253Z-9539ce/zap-report.html)。

Dockerが報告した利用可能資源は12 CPU・約15.4GiBでした。今回の4スレッド試走で70%の資源使用を目標にしたわけではありません。さらに並列化すると対象アプリや依存サービス側の待ち時間、検出挙動も変わり得るため、まず4スレッドを独立した条件として扱います。
