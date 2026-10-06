# B0233のブラウザー経由ZAP V/F/N走査（2026-10-06）

固定したローカルDockerのHTTPS `https://app.benchmark.test:8443` とHTTP `http://app.benchmark.test:8080` を対象に、Chromiumの通信をZAP proxyへ通した。HTTPSの専用ログインで`memberSession`を取得し、HTTPSの本人アカウントを確認した後、実ブラウザーでHTTPの観測URLへ移動した。ZAPの保存HTTP履歴で、その要求に同じ認証Cookieが載ったかを照合し、最後にHTTPSの本人アカウントが維持されたことを確認した。Cookie値や認証情報はこの文書に記載しない。

| arm | ZAP走査 | Cookieの`Secure` | HTTPへの送出 | HTTP応答 | 対象要求数 | 実ピーク |
| --- | --- | --- | --- | ---: | ---: | ---: |
| V | 完了 | false | あり | 200 | 487 | 4 |
| F | 完了 | true | なし | 426 | 485 | 4 |
| N | 完了 | true | なし | 426 | 485 | 5 |

8スレッド、active、session認証主体alice、各セル240秒・8,000要求の同一計画を使用した。計画はローカルの`artifacts/panel-b0233-browser-c8-20261006.json`、採用台帳は`artifacts/panel-b0233-browser-c8-20261006-retry1-ledger.json`にある。各runにはZAP自身の`zap-report.html`、両originの生HTTP履歴、設定、公開入力、実行ソース証明、終了時のdrainがある。3セルともcontrollerと対象、走査前後の対象ソース照合が一致し、終了時の保留通信は0、認証の終了後確認も通った。

最初のV走査自体は完了したが、台帳が新しいHTTPS originを受理せず`artifact_workspace_mismatch`で停止した。失敗台帳`artifacts/panel-b0233-browser-c8-20261006-ledger.json`とそのrunを保持した。台帳の受理をこの固定2-origin契約に限定して修正し、同じ計画を新しい台帳でV/F/Nとも再走査した。失敗した台帳は完走件数に含めない。

保存したブラウザー操作はCookie境界への到達証拠であり、汎用spider・active scanのalertがこの欠陥を検出したという判定ではない。以前の個別V/F/N成立確認とは実行ソースのハッシュが一致していないため、今回の走査をその成立記録と結合して真陽性・偽陰性を採点しない。依存サービスやホスト環境の完全一致も証明していない。

再実行時は対象アプリの計測窓が空であることを確認し、`SCAN_CONTROLLER_TARGET=verify`を指定してブラウザーを含むcontroller imageを使う。計画と台帳のファイル名は新しくし、`run-panel.cmd`または`run-panel.sh`に渡す。各runが終わるまで次の計測を重ねず、`reports.cmd`または`reports.sh`でローカルのオフライン集計を更新する。
