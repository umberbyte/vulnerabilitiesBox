# CORSレポート3変種のZAP V/F/N走査（2026-10-06）

既存のB0331・B0337・B0338を、ローカルDockerの`https://app:8443`と補助画面`https://app:8444/b2-origin-page`で確認した。共通のseed `cors-report-c8-20261006`、bobのsession認証、ZAP active、8スレッド指定、240秒・8,000要求上限をV/F/Nに適用した。採用する計画はローカル`artifacts/panel-cors-report-c8-20261006.json`、完走台帳は`artifacts/panel-cors-report-native-c8-20261006-ledger.json`。9/9セルが`completed`、終了時の保留通信は0、対象とコントローラの実行ソース指紋は各セルで一致した。要求数は各243～244、実ピーク並列数は各5。生HTTP、補助originの履歴、ZAP HTML、drain記録を各runに保存した。

Chromiumで通常ログインと本人の正常なレポートGETを確認してから、補助originの画面でcredentials付きfetchを実行した。カスタムヘッダ付きfetchのOPTIONSをZAP HTTP原本で確認した結果は以下のとおり。`読める`は今回のブラウザー観測であり、ZAPのalert判定ではない。

| 変種 | V | F | N |
| --- | --- | --- | --- |
| B0331 任意Origin反射 | OPTIONS 204、カスタムヘッダ付き・simple GETとも読める | OPTIONS 403、両方読めない | Fと同じ |
| B0337 preflightと本体の差 | OPTIONS 403、カスタムヘッダ付きは読めず、simple GETだけ読める | OPTIONS 403、両方読めない | Fと同じ |
| B0338 内部ヘッダ公開 | OPTIONS 204、両方読め、内部ヘッダも見える | OPTIONS 204、両方読めるが内部ヘッダは見えない | Fと同じ |

最初の`artifacts/panel-cors-report-c8-20261006-ledger.json`も9/9セルが走査完了したが、Playwrightの全通信インターセプトを通すとChromiumのOPTIONSが省かれ、B0337のカスタムヘッダ付きfetchを誤って「読める」と観測した。この系列はブラウザーのpreflight根拠として採用しない。補助画面を読み込んだ後の固定fetchではインターセプトを外し、OPTIONSのZAP履歴IDとHTTP応答を完走条件へ追加した。修正後のB0337単独再走査`artifacts/panel-cors-preflight-rerun2-c8-20261006-ledger.json`でも3/3セルでOPTIONS 403を確認し、上表と一致した。その前の再試行`artifacts/panel-cors-preflight-rerun-c8-20261006-ledger.json`は対象アプリとコントローラのソース不一致でVの診断前に停止し、F/Nは未実行。いずれの原本も保持した。

Dockerのネットワークなし単体検証は342/342通過した。走査完了や今回のブラウザー観測から、個別V/F/N成立確認とのソース・依存環境一致、ZAPによる欠陥検出、真陽性・誤陽性は推定しない。個別成立記録は既存の原票として別に保持する。
