# B0346・B0347のpostMessage境界に対するZAP V/F/N走査（2026-10-06）

既存のB0346とB0347について、認証済みブラウザーで同一originのclientとhubを開き、通常のレポート通知が届くことを先に確認した。その後、公開された補助origin `https://app:8444/b2-origin-page` を使い、B0346では別originの送信元からhubへ要求し、B0347では登録済み受信windowを別originへ移動させてからhubに送信させた。どちらもVだけが通常通知と同じレポート内容を別originで受信し、F/Nでは受信しなかった。レポート本文はrunメタデータに保存せず、ブラウザー内で比較した。

同一seed `message-boundary-20261006`、bobのsession-active、各セル240秒・HTTP 8000件、明示的8スレッドで6セルを順次実行した。計画は`artifacts/panel-message-boundary-20261006.json`、台帳は`artifacts/panel-message-boundary-20261006-ledger.json`。B0346・B0347とも3/3セルが`completed`となり、補助originの受信ページ応答を各セル1件ずつZAP生HTTP履歴に保存した。

全6セルで通信drain、ZAP HTML、生HTTP、走査時の対象実行ソース照合を保存した。オフライン集計では既存500変種のV/F/N走査完走が480件、未完走が20件。原本は各台帳から辿れる`artifacts/zap-*/`と`artifacts/index.html`にある。ブラウザーの通知結果は走査時の操作観測であり、ZAP alertによる検出・誤検出の判定とは分けて扱う。`artifacts/`は非公開のローカル資料で、Gitには登録しない。
