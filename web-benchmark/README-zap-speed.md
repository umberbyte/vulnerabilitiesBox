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

## 6・8スレッドのV/F/N試走（2026-10-06）

既定の2スレッドは変えず、`--concurrency 6` と `--concurrency 8` を明示指定できるようにした。スパイダーとアクティブスキャンの各スレッド数に指定値を設定し、要求間隔は4スレッド条件と同じ0msとする。計画・台帳・実行JSONには指定値が残る。スレッド数はZAP内の各処理の設定値であり、ホストCPU使用率の上限ではない。

B0012のV/F/Nを同一seed `b0012-fast-20261006`、active profile、各arm 90秒・700 HTTP要求のソフト上限で順次実行した。4・6・8スレッドの3計画はすべて3/3セル完了、エラー0、通信drainと実行ソース照合が成立し、実行ソースSHA-256は `78a3038d9c29c149dec0bc0ae668105d8b4147099c21f7bdc819d5d2311df04d` で一致した。台帳の各セル開始から終了までの時間は次のとおり。

| ZAPスレッド数 | V | F | N | 合計 |
| --- | ---: | ---: | ---: | ---: |
| 4 | 21.246秒 | 6.623秒 | 6.576秒 | 34.455秒 |
| 6 | 23.282秒 | 4.619秒 | 4.544秒 | 32.452秒 |
| 8 | 19.204秒 | 4.627秒 | 4.558秒 | 28.397秒 |

3条件ともV/F/NのHTTP要求数は444/453/453、生アラート数は35/34/34で、VだけZAP plugin `40018` のアラートが1件あった。保存した台帳は `artifacts/panel-b0012-c4-current-20261006-ledger.json`、`artifacts/panel-b0012-c6-20261006-retry-ledger.json`、`artifacts/panel-b0012-c8-20261006-ledger.json`。最初の6スレッド試行は対象アプリとコントローラの実行ソース不一致で開始前に停止し、`artifacts/panel-b0012-c6-20261006-ledger.json` に失敗を残した。対象アプリを再ビルドしてから再試行した。

この1変種・各条件1回の結果では、8スレッドの合計時間は4スレッドより約18%短かった。起動時間の揺れや別の変種の負荷を評価していないため、一般的な高速化率や検出同等性は確定していない。Dockerは12 CPU・約15.4GiBを報告したが、実際のCPU・メモリ使用率はこの試走では連続記録しておらず、70%以内という実測保証はない。ZAPのJavaヒープ上限1GiB、コンテナ上限2GiB、対象アプリ上限512MiBは据え置いた。複数のV/F/N系列で再現性と負荷を確認するまでは、8スレッドを既定値にしない。
