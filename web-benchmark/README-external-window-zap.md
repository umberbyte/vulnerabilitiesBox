# B0044の別origin popupに対するZAP V/F/N走査（2026-10-06）

既存のB0044について、対象ページの公開リンクから別origin `https://app:8444/b2-linked-screen` を実ブラウザーで開き、popupの`opener`参照と元ページの移動結果を確認した。ZAPのspider・active scanは `https://app:8443/w/...` に限定し、補助originはこの公開リンクが開く画面の観測だけに使った。

同一seed `external-window-20261006`、匿名active、各セル240秒・HTTP 8000件、明示的8スレッドでV/F/Nを順次実行した。`artifacts/panel-external-window-20261006.json` と `artifacts/panel-external-window-20261006-ledger.json` に計画・台帳を保存し、3/3セルが`completed`となった。各セルで補助originの画面応答1件をZAP生HTTP履歴に保存した。Vではpopupが`opener`を持ち、ボタン操作で元ページが移動した。F/Nでは`opener`がなく、元ページは移動しなかった。

3セルとも走査終了時の通信drain、ZAP HTML、生HTTP、対象実行ソースの照合を保存した。オフライン集計の完走は477/500変種、未完走は23変種。原本は台帳から辿れる`artifacts/zap-*/`と`artifacts/index.html`にある。このブラウザー観測は走査時の操作結果であり、ZAP alertによる検出・誤検出の判定とは分けて扱う。`artifacts/`は非公開のローカル資料で、Gitには登録しない。
