# B0325 fresh Cookie のZAP V/F/N走査（2026-10-06）

既存B0325をローカルDockerで順次走査した。計画は`artifacts/panel-fresh-cookie-c8-20261006.json`、完走台帳は`artifacts/panel-fresh-cookie-c8-20261006-ledger.json`。3セルとも同じseed、Alice認証、activeプロファイル、240秒・8000リクエスト予算、明示的8スレッドで実行した。scan originは`https://app.benchmark.test:8443`で、`https://attacker.test:8444/b2-form`はChromium観測専用とし、spider・active scanの対象から除外した。

| セル | run ID | リクエスト | 最大同時処理 | fresh CookieのSameSite属性 | 外部フォームPOSTでのCookie送信 | POST結果 |
| --- | --- | ---: | ---: | --- | --- | ---: |
| V | `zap-2026-10-06T08-24-29-487Z-b0984f` | 1,140 | 8 | 省略 | あり | 200 |
| F | `zap-2026-10-06T08-24-39-682Z-003e8f` | 1,121 | 8 | Lax | なし | 401 |
| N | `zap-2026-10-06T08-24-46-850Z-ced4e9` | 1,121 | 8 | Lax | なし | 401 |

Chromium経由の通常ログインとtoken付きプロフィール変更を確認した後、別siteのフォームからtokenなしでPOSTした。ZAPの保存済み生HTTPでCookie発行時のSet-Cookie属性、外部フォームのOrigin、`Sec-Fetch-Site: cross-site`、POSTのCookieヘッダーと応答を照合した。Vだけ外部POST後のプロフィール変更を確認し、F/Nは通常の変更内容を保持した。各runの生HTTP、ZAP HTML、外部フォームのHTTP履歴、対象実行ソース一致、終了時の通信収束を保存した。走査完了とブラウザー観測をZAPの検出率・誤検出率として扱わない。既存の個別V/F/N成立記録とのソースハッシュ一致は未確認である。
