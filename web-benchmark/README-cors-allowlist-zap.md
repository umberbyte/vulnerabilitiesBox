# CORS許可originのZAP V/F/N計測（2026-10-06）

既存のB0333・B0334・B0336を、ローカルDockerの同一計測窓で各V/F/N順に実行した。計画は`artifacts/panel-cors-root-c8-20261006.json`と`artifacts/panel-cors-allowlist-c8-20261006.json`、完走台帳はそれぞれ`artifacts/panel-cors-root-c8-20261006-ledger.json`と`artifacts/panel-cors-allowlist-c8-20261006-retry1-ledger.json`に保存した。いずれもactive、session/alice、240秒、8,000リクエスト、spider・active scanの明示的8スレッド指定で、同じ系列内のV/F/Nに同条件を適用した。

| 変種 | V | F | N | 観測したブラウザー読取 |
| --- | --- | --- | --- | --- |
| B0333 | 完了 | 完了 | 完了 | 提携先originは全セルで可読。別サブドメインはVのみ可読。 |
| B0334 | 完了 | 完了 | 完了 | 別サブドメインはVのみ可読。 |
| B0336 | 完了 | 完了 | 完了 | 同一ホストの別ポートはVのみ可読。 |

各セルで通常の認証付きレポート、補助originの公開ブラウザーfixture、Cookieを伴う別originからのレポート要求を記録した。ブラウザーの可読性とZAPに保存された`Access-Control-Allow-Origin`を照合し、各originの生HTTP、ZAP HTML、終了時drain、対象実行ソースの一致を確認した。B0333はV/F/Nで239/238/238リクエスト、B0334は262/261/261、B0336は各261で、実測のピーク同時処理は4～5だった。要求した8スレッドと実測ピークは別の値である。

B0334の初回`artifacts/panel-cors-allowlist-c8-20261006-ledger.json`は、補助originで存在しないワークスペースURLを開いて404となりVセルで停止した。失敗runと生HTTPを残し、アプリが提供する`/browser-csrf-fixture`に計測先を修正して再実行した。失敗を完走件数へ加えていない。

この記録はブラウザー挙動と診断走査の完了証拠であり、ZAPアラートによる検出、脆弱性成立、誤検出率の判定ではない。既存の個別V/F/N成立記録は別に保持する。修正後のネットワークなしDocker単体検証は346/346件通過した。
