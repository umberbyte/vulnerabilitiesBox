# 補助originのスクリプト配信に対するZAP V/F/N走査（2026-10-06）

既存のB0473・B0048・B0053・B0470について、対象ページの通常操作で `https://app:8444` からスクリプトを読む場合の応答を、ZAPプロキシの生HTTP履歴とブラウザーでの実行結果に対応付けた。ZAPのspider・active scanは `https://app:8443/w/...` に限定し、補助originは公開manifestに記された正確な配信URLの観測だけに使った。各系列のV/F/Nに同じseed、認証、予算、明示的8スレッド設定を適用し、セルごとに対象を初期化した。

| 変種 | 操作と観測結果 | 計画・台帳 | 走査 |
| --- | --- | --- | --- |
| B0473 | 配布スクリプトを変更してページを再読込。3セルとも補助originの変更済み応答をZAP履歴に保存。Vでは変更済みコードが実行され、F/Nでは実行されなかった。 | `artifacts/panel-library-integrity-20261006.json` / `artifacts/panel-library-integrity-20261006-ledger.json` | 3/3 completed |
| B0048 | ページの設定URLを補助originのスクリプトへ切り替え。Vではその応答を取得・実行し、F/Nでは通常の同一originスクリプトを実行した。 | `artifacts/panel-resource-switch-20261006.json` / `artifacts/panel-resource-switch-20261006-ledger.json` | 3/3 completed |
| B0053 | ページのリンクから補助originのスクリプトへ切り替え。Vではその応答を取得・実行し、F/Nでは通常の同一originスクリプトを実行した。 | 同上 | 3/3 completed |
| B0470 | 正規の案内表示後、JSONP callbackを指定して再読込。Vでは補助originのJSONP応答を取得してcallbackが実行され、F/Nでは補助originへの取得がなく通常の案内が表示された。 | `artifacts/panel-jsonp-csp-20261006-retry.json` / `artifacts/panel-jsonp-csp-20261006-retry-ledger.json` | 3/3 completed |

採用した12セルすべてで走査終了時の通信drain、ZAP HTML、生HTTP、対象実行ソースの照合を保存した。計測予算は各セル240秒・HTTP 8000件で、メモリ不足や未収束による停止はなかった。B0470の初回はChromiumがない`runtime` controller imageを選択していたため、Vセルで開始前に失敗した。失敗原本を `artifacts/panel-jsonp-csp-20261006-ledger.json` に残し、ブラウザーを含む`verify` imageで別の計画・台帳を使って再実行した。オフラインレポート更新後、既存500変種のV/F/N走査完走は476件、未完走は24件。原本は各台帳から辿れる `artifacts/zap-*/` と `artifacts/index.html` に保存している。

ブラウザーと生HTTPの照合は、この操作が走査時に成立したことの確認である。ZAP alertによる検出、誤検出、検出率の判定とは分けて扱う。`artifacts/` はローカルの非公開資料であり、Gitには登録しない。
