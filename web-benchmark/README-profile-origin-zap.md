# プロフィールの別origin操作に対するZAP V/F/N走査（2026-10-06）

既存のB0314・B0316・B0319・B0326について、認証済みブラウザーで通常のtoken付きフォーム保存を成功させてから、補助origin `https://app:8444` のページを起点にGET遷移とフォーム送信を行った。両方の補助ページ、対象へのリクエスト、応答、画面上の連絡先をZAP経由で観測した。補助originのページはspider・active scanの対象から除外した。

| 変種 | Vの別origin操作 | F/Nの別origin操作 |
|---|---|---|
| B0314 | フォームPOSTが200となり連絡先が変更された | POSTは403で変更なし |
| B0316 | GET遷移で連絡先が変更された。フォームPOSTは403 | GET遷移で変更なし。POSTは403 |
| B0319 | フォームPOSTが200となり連絡先が変更された | POSTは403で変更なし |
| B0326 | フォームPOSTが200となり連絡先が変更された | POSTは403で変更なし |

計画 `artifacts/panel-profile-origin-20261006.json` はseed `profile-origin-20261006`、bobのsession認証、各セル240秒・HTTP 8000件・明示的8スレッドをV/F/Nで共通にした。台帳 `artifacts/panel-profile-origin-20261006-ledger.json` の12/12セルが`completed`で、各セルに生HTTP、ZAP HTML、両補助ページの履歴、終了時drain、実行ソース照合を保存した。全セルのソース照合は`matched`、drainは成立し、run内のerrorは0件だった。オフライン集計は485/500変種が走査完走、残り15変種、集計issueは0件。

この記録はブラウザーでの操作結果と走査完了を示す。ZAP alertによる検出・誤検出の判定や、既存の個別V/F/N成立確認とは分けて扱う。原本を含む`artifacts/`は非公開のローカル資料であり、Gitには登録しない。
