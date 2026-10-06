# B0341 WebSocket frame のZAP V/F/N走査（2026-10-06）

既存B0341をローカルDockerで順次走査した。計画は`artifacts/panel-websocket-frame-c8-20261006.json`、完走台帳は`artifacts/panel-websocket-frame-c8-20261006-ledger.json`。3セルとも同じseed、Alice認証、activeプロファイル、240秒・8000リクエスト予算、明示的8スレッドで実行した。scan originは`https://app:8443`で、`https://app:8444/b3-socket-client`はChromium観測専用とし、spider・active scanから除外した。

| セル | run ID | HTTP要求 | 最大同時処理 | ZAP保存WebSocket frame | 別origin画面で秘密レポート受信 |
| --- | --- | ---: | ---: | ---: | --- |
| V | `zap-2026-10-06T08-40-19-368Z-a6c93a` | 251 | 6 | 4 | あり |
| F | `zap-2026-10-06T08-40-27-200Z-40547b` | 251 | 6 | 2 | なし |
| N | `zap-2026-10-06T08-40-34-006Z-394456` | 251 | 5 | 2 | なし |

Chromiumから通常のログインと本人確認を行い、同一originのパネルがWebSocketで本人のレポートを受信することを3セルで確認した。別originの画面から同じWebSocketへ接続した際、Vだけ秘密レポートを受信し、F/Nは画面に`blocked`を表示した。ZAP WebSocket add-onのchannelと送受信frameを各runの`websocket-frames.json`に保存し、別originの画面取得はZAP生HTTPの完全な補助履歴に保存した。ZAP HTML、対象実行ソースのcontroller・app間一致、終了時の通信残0も記録した。個別成立確認時とのソースハッシュは一致していない。ブラウザーへのframe配送とZAPの検出・誤検出判定は別に扱う。
