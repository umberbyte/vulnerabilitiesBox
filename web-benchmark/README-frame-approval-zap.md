# B0330の別origin iframeに対するZAP V/F/N走査（2026-10-06）

既存のB0330について、認証済みブラウザーで通常の本人承認を実行した後、`https://app:8444/b2-frame`から同じ承認画面をiframeで開いた。Vではiframe内のボタンを押して2回目の承認POSTが成功した。F/Nではframe-ancestors制限により承認ボタンが読み込まれず、iframe内のPOSTは発生しなかった。全セルで通常の承認POSTは成功した。

同一seed `frame-approval-20261006`、aliceのsession-active、各セル240秒・HTTP 8000件、明示的8スレッドでV/F/Nを順次実行した。計画は`artifacts/panel-frame-approval-20261006.json`、台帳は`artifacts/panel-frame-approval-20261006-ledger.json`。3/3セルが`completed`となり、別originのiframeページ応答は各セル1件ずつZAP生HTTP履歴に保存した。

走査終了時の通信drain、ZAP HTML、生HTTP、対象実行ソースの照合を各セルで保存した。オフライン集計では既存500変種の完走が478件、未完走が22件。原本は各台帳から辿れる`artifacts/zap-*/`と`artifacts/index.html`にある。このブラウザー観測は走査時の操作結果であり、ZAP alertによる検出・誤検出の判定とは分けて扱う。`artifacts/`は非公開のローカル資料で、Gitには登録しない。
