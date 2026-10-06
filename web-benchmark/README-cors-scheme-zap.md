# B0335 混在scheme CORSのZAP V/F/N走査（2026-10-06）

既存B0335をローカルDockerの隔離ネットワークで順次走査した。完走計画は`artifacts/panel-b0335-scheme-c8-20261006-r1.json`、台帳は`artifacts/panel-b0335-scheme-c8-20261006-r1-ledger.json`。3セルとも同じseed、Alice認証、activeプロファイル、240秒・8000リクエスト予算、明示的8スレッドで実行した。対象のHTTPS originは`https://app.benchmark.test:8443`、別schemeのブラウザー画面は`http://app.benchmark.test:8443`。後者はHTTPS専用ポートなので、個別成立確認と同じPlaywrightの`route.fulfill`でHTTP文書を作った。ZAPのspider・active scanはHTTPS対象だけに適用し、文書の内容と作成方法は各runの`browser-cors-scheme.json`に保存した。

| セル | run ID | HTTP要求 | 最大同時処理 | 認証付きreportのHTTP応答 | 別schemeへのCORS許可 | ブラウザーで非公開bodyを読めたか |
| --- | --- | ---: | ---: | ---: | --- | --- |
| V | `zap-2026-10-06T08-59-45-406Z-30e55f` | 259 | 5 | 200 | あり | はい |
| F | `zap-2026-10-06T08-59-53-373Z-24a816` | 259 | 5 | 200 | なし | いいえ |
| N | `zap-2026-10-06T09-00-00-446Z-1723c6` | 259 | 5 | 200 | なし | いいえ |

対象アプリは内部Dockerネットワークの`198.18.233.2`に固定し、走査コンテナ内のChromiumだけに`BlockThirdPartyCookies=false`を適用した。各runにChromium版154.0.8037.92、ポリシーとCompose定義のSHA-256、対象IP、別schemeからのブラウザー要求、ネットワーク応答、ZAP保存HTTPの要求IDを記録した。3セルでZAPの生HTTP全件、HTML、終了時drain、controller・対象アプリ間の実行ソース一致を確認した。ZAP保存HTTPには別schemeからの`Origin`と認証Cookieを持つGETがある。ブラウザーへの非公開body配送はZAPアラートの検出・誤検出判定と分ける。旧個別成立確認時とのソースハッシュは一致していない。

最初の計画`artifacts/panel-b0335-scheme-c8-20261006.json`はVセルのブラウザー確認前に`cors_scheme_condition_missing`で停止し、F/Nを実行していない。panel-runnerからscan子プロセスへ専用環境条件を渡す修正前の台帳とrunを保持した。修正後に新しい計画・台帳で3セルを完走した。
