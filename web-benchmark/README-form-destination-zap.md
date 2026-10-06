# B0055のフォーム送信先に対するZAP V/F/N走査（2026-10-06）

既存のB0055について、認証済みブラウザーで正規のフォーム送信を成功させた後、公開設定URLで送信先を補助origin `https://app:8444/b2-collect` に指定して再送信した。Vでは補助originへのPOSTがZAP生HTTP履歴に残り、その非公開フィールドは画面内フォームの値と一致した。F/Nでは補助originへのPOSTはなく、通常の同一originへ送信された。非公開値自体はrunメタデータに記録せず、ローカルの生HTTP原本にのみ保持した。

同一seed `form-destination-20261006`、bobのsession-active、各セル240秒・HTTP 8000件、明示的8スレッドでV/F/Nを順次実行した。計画は`artifacts/panel-form-destination-20261006.json`、台帳は`artifacts/panel-form-destination-20261006-ledger.json`。3/3セルが`completed`となり、通信drain、ZAP HTML、生HTTP、対象実行ソースの照合を各セルで保存した。

オフライン集計では既存500変種の走査完走が481件、未完走が19件。原本は台帳から辿れる`artifacts/zap-*/`と`artifacts/index.html`にある。この送信先・本文の照合は走査時のブラウザー操作確認であり、ZAP alertによる検出・誤検出の判定とは分けて扱う。`artifacts/`は非公開のローカル資料で、Gitには登録しない。
