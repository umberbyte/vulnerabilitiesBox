# B0340 CORS許可表のZAP V/F/N走査（2026-10-06）

既存変種B0340の公開許可表と会員レポートを、ローカルDockerの`https://app:8443`、補助画面`https://app:8444/b2-origin-page`で確認した。共通seed `cors-policy-c8-20261006`、bobのZAP session認証、active profile、8スレッド指定、240秒・8,000要求上限をV/F/Nへ適用した。計画はローカル`artifacts/panel-cors-policy-c8-20261006.json`、完走台帳は`artifacts/panel-cors-policy-c8-20261006-retry1-ledger.json`。3/3セルが`completed`、要求数はVが498、F/Nが各490、実ピーク並列数は各6だった。全セルで対象とコントローラの実行ソースが一致し、終了時の通信は収束した。生HTTP、補助originの履歴、ZAP HTML、drain記録を各runに保存した。

ブラウザー内でaliceの通常ログイン・許可表GETから始め、一般会員による補助originの登録、ログアウト後のbobによるcredentialed fetch、管理者の正規登録、再度bobによるfetchを順に行った。一般会員の登録はVで200、F/Nで403。管理者登録前のbobのレポート本文はVだけ読め、F/NではCORSにより読めなかった。管理者登録は全セル200で、登録後のbobの本文は全セルで読めた。各段階のブラウザー観測とZAP HTTPメッセージIDをrunに保存した。これは許可表変更とブラウザー可視性の観測であり、ZAPのalertによる検出判定ではない。

初回`artifacts/panel-cors-policy-c8-20261006-ledger.json`はrunnerが公開manifestのlogout URLを参照できず、Vセルの7要求後に404で停止した。F/Nは未実行。失敗原本を保持し、URL参照を修正して対象とコントローラを同じソースで再構築した。ネットワークなしのDocker単体検証は修正後344/344通過した。今回の走査完了から、既存の個別V/F/N成立確認とのソース・依存環境一致、ZAPによる欠陥検出、真陽性・誤陽性は推定しない。
