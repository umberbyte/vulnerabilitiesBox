# B0457・B0458のローカルcollector経由ZAP V/F/N走査（2026-10-06）

既存のB0457とB0458について、公開manifestに宣言された `POST https://app:8444/collect-events` を観測専用URLとして扱い、ブラウザーの正常操作をZAPプロキシ経由で実行した。ZAPのspider・active scanは従来の `https://app:8443/w/...` に限定し、collectorを走査対象にしない。collectorへのPOSTと応答はZAP生HTTP履歴に別originの原本として保存した。

| 変種 | 認証 | 計画・採用台帳 | V/F/N結果 | 各セルの要求数 | 観測されたcollectorイベント |
|---|---|---|---|---|---|
| B0457 | anonymous | `artifacts/panel-collector-analytics-20261006.json` / `artifacts/panel-collector-analytics-20261006-ledger.json` | 3/3 completed | 662 / 662 / 662 | 3セルともanalytics POSTが202。Vだけが正常ログインに使った実パスワードをイベントに含み、F/Nにはそのフィールドがない。 |
| B0458 | session、alice | `artifacts/panel-collector-errors-20261006.json` / `artifacts/panel-collector-errors-20261006-ledger.json` | 3/3 completed | 477 / 477 / 477 | 3セルとも正常な文書読込200、構文エラー400の後にerror POSTが202。Vだけが文書読込リクエストの実Authorization値をイベントに含み、F/Nにはそのフィールドがない。 |

両系列ともactive、明示的8スレッド、各セルの停止目安240秒・8,000要求、同一seed・ZAPイメージ・設定をV/F/Nへ適用した。実測の同時処理ピークは5～6だった。各runは対象とcontrollerの実行ソース一致、走査前後の対象ソース一致、終了時の保留通信0、collectorのZAP履歴完備、ZAP自身のHTMLレポートを記録している。B0458は認証主体と保護対象の到達、走査後の再確認も通った。生HTTPにはfixtureのパスワード・セッション・JWTが含まれ得るので、`artifacts/` の原本は公開Gitに含めない。

イベントのフィールド有無と実値の一致は保存した生HTTPの人間レビューで確認した事実であり、ZAPのalertによる検出率を意味しない。ZAP走査の完走、個別V/F/N成立確認、検出・誤検出の評価は別の判定として扱う。オフライン集計を更新した時点で、既存500変種のZAP V/F/N完走は472件、未完走は28件。人が読める全体レポートは `artifacts/index.html` と各runの `zap-report.html` にある。
