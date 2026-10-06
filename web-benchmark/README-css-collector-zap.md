# B0023 CSS画像collectorのZAP V/F/N記録（2026-10-06）

既存変種B0023（R0023）の公開CSSプレビューを、同じseed・bobのsession認証・ZAP active・8スレッド指定・240秒・8,000要求上限でV/F/N順に走査した。計画はローカル`artifacts/panel-css-collector-c8-20261006.json`、完走台帳は`artifacts/panel-css-collector-c8-20261006-retry1-ledger.json`。3/3セルが`completed`で、対象実行ソースとコントローラのハッシュは各セルで一致し、終了時の保留通信は0だった。各セルの要求数は465、実ピーク並列数は5。

ブラウザーで認証、正常なCSS装飾、`[data-secret]`の画像要求を順に確認した。Vだけがローカル`https://app:8444/b2-collect?value=presence`へ画像を要求し、F/Nでは要求しなかった。Vのブラウザー要求・応答ヘッダはrun内の`browser-css-image-http.json`にSHA-256付きで保存した。この確認は属性の存在に対するブラウザー挙動の観測であり、元の個別成立確認に含まれる未知の秘密文字の列挙を再実行したものではない。

ZAPのHTTP履歴にはこのSVG画像要求が残らず、補助originの履歴は各セル0件だった。したがって画像をZAPが保存・分析した、または欠陥をalertで検出したとは判定しない。一次画面のHTTP履歴とZAP HTML、終了時drain、対象ソース証明は各runに保存した。V/F/Nのalert総数34/33/33は未審査の生値であり、真陽性・誤陽性の件数ではない。

初回`artifacts/panel-css-collector-c8-20261006-ledger.json`はChromiumを含まないruntimeイメージで計測コントローラを起動し、Vのブラウザー開始前に停止した。対象への診断要求は0、F/Nは未実行だった。原本を保持し、`SCAN_CONTROLLER_TARGET=verify`で同じ計画を再実行した。追加したアダプタと台帳検証のDocker単体テストは340/340通過した。ZAP診断完走と個別V/F/N成立確認のソース・依存環境の一致は別の評価項目である。
