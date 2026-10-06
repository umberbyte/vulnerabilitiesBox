# B0234 Cookie DomainのZAP V/F/N走査（2026-10-06）

既存B0234をローカルDockerで同一条件のV/F/Nとして走査した。計画は`artifacts/panel-cookie-domain-c8-20261006.json`、完走台帳は`artifacts/panel-cookie-domain-c8-20261006-retry1-ledger.json`。認証はaliceの専用`pb_auth` Cookie、scan originは`https://app.benchmark.test:8443`、兄弟ホスト`https://evil.benchmark.test:8444/b3-cookie-collector`はブラウザー観測専用とし、spider・active scanの対象に含めなかった。各セルの要求予算8000、時間予算240秒、指定スレッド数8、seedは共通。ZAP版・add-on・設定は各run原本に保存した。

| セル | run ID | 要求数 | 実ピーク | Cookie Domain | 兄弟ホストへ`pb_auth`送信 |
| --- | --- | ---: | ---: | --- | --- |
| V | `zap-2026-10-06T07-56-05-994Z-1eb064` | 453 | 5 | `.benchmark.test` | あり |
| F | `zap-2026-10-06T07-56-13-954Z-0662b9` | 453 | 5 | `app.benchmark.test` | なし |
| N | `zap-2026-10-06T07-56-20-657Z-7e84c6` | 453 | 4 | `app.benchmark.test` | なし |

各セルでブラウザーが正常ログイン後に本人ホストの会員画面を前後とも200で読み、兄弟ホストの受信画面を200で開いた。ブラウザーのCookie属性と、ZAP履歴に保存された兄弟ホスト宛HTTP要求のCookieヘッダーが一致した。各runに生HTTP、ZAP HTML、完了した補助origin履歴、終了時の保留通信0、controllerと対象アプリの実行ソース一致が残る。これは専用ブラウザー観測であり、ZAPのalert数43を欠陥検出数・真陽性数として扱わない。既存の個別V/F/N成立確認とは別の記録で、成立確認時との実行ソースハッシュ一致は未確認である。

最初の`artifacts/panel-cookie-domain-c8-20261006-ledger.json`はVセルのブラウザー観測後に`auth_cookie_name_invalid`で停止した。`pb_auth`をrunnerの専用Cookie許可名へ追加し、アプリとcontrollerを同じソースで再構築して新しい台帳で3/3セルを完走した。失敗runと台帳は残してある。
