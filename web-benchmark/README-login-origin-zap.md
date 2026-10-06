# B0323ログインCSRFのZAP V/F/N走査（2026-10-06）

公開された通常のログイン開始画面で正規のCSRF値を含むログインを成功させた後、ログアウトしてから、補助origin `https://app:8444/b2-form` のフォームで別のfixtureアカウントへログインを試みた。Chromiumの通信はZAPプロキシを経由し、補助ページのGETと対象へのPOST、応答、ブラウザーのセッション上のアカウントを対応付けた。fixtureのパスワードとCookieはrunのメタデータには記載せず、非公開の生HTTP原本だけに残した。

Vは補助フォームへのPOSTが200となり、ブラウザーのセッションが別アカウントへ切り替わった。F/NはPOSTが403で、切り替わらなかった。通常ログインは各セルで成功した。これはブラウザーによる成立観測であり、ZAP alertの検出判定ではない。

計画`artifacts/panel-login-origin-20261006.json`と台帳`artifacts/panel-login-origin-20261006-ledger.json`には、seed `login-origin-20261006`、匿名active設定、各セル240秒・HTTP 8000件・明示的8スレッドを記録した。V/F/Nの3/3セルは`completed`で、実行ソース照合`matched`、終了時drain成立、run内error 0件だった。生HTTP、ZAP HTML、補助ページ履歴を`artifacts/zap-*/`へ保存した。オフライン集計は486/500変種が走査完走、残り14変種、集計issue 0件。`artifacts/`は非公開のローカル資料であり、Gitには登録しない。
