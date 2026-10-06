# `app:8444` を使う23変種の計測上の役割

2026-10-04の保存済みrunで `requiredTargetOrigins` に `https://app:8443` と `https://app:8444` を宣言した23変種を、実装と個別成立確認（`tests/batch2-browser.mjs`、`tests/batch3-protocols.mjs`、`tests/data-handling.mjs`）から分類した。22変種が実際に補助originを使い、B0341の `app:8444` はWebSocketの申告 `Origin` 値として別の観測能力を要求する。ここでの分類は計測設計用であり、ZAPによる検出・非検出の判定ではない。2026-10-06時点ではB0457・B0458・B0048・B0053・B0473の公開契約に限って補助originを観測専用で扱い、V/F/NのZAP走査を完走した。他の17変種にはまだ補助origin adapterがなく、B0341にはWebSocket frame観測がない。

| 役割 | 件数 | 変種 | 必要な観測 |
|---|---:|---|---|
| 別originのページ・ポップアップ・フレーム | 13 | B0044, B0314, B0316, B0319, B0323, B0326, B0330, B0331, B0337, B0338, B0340, B0346, B0347 | ブラウザーの実際の起点origin、遷移・フォーム・frame・fetch・postMessageの結果、対象側の状態変化または機密値の到達 |
| 収集先・受信先 | 5 | B0023, B0055, B0208, B0457, B0458 | 対象ページから補助originへ生じた画像・フォーム・analytics・errorの通信と、受信した内容。通常動作とF/Nの対照を保持 |
| 外部スクリプト等の配信元 | 4 | B0048, B0053, B0470, B0473 | 対象ページが補助originから実際に読み込んだ応答、ブラウザーでの実行・CSP・SRIの結果 |
| WebSocketの `Origin` 申告値 | 1 | B0341 | 認証済み接続のupgrade時に申告した `Origin` と、その後のframe応答。現行の個別成立確認では `app:8444` のページへのアクセスは行わない |

個別の計測操作は次のとおり。左の対象ページ・APIを単に巡回するだけでは、右のブラウザー操作や受信側の証拠は揃わない。

| 変種 | 補助originの用途と成立確認での操作 |
|---|---|
| B0023 | CSSの背景画像リクエストを `/b2-collect` で受け、未知の私有文字の選択結果を照合する。 |
| B0044 | `/b2-linked-screen` を別originのポップアップで開き、`opener` を通じた元ページの遷移を確認する。 |
| B0048 | `/b2-resource.js` を別originの `script.src` として読み、DOM上の実行結果を見る。 |
| B0053 | named propertyから選ばれた `/b2-resource.js` を読み、元ページでの実行結果を見る。 |
| B0055 | 変更されたフォーム送信先 `/b2-collect` で私有フィールドの受信を確認する。 |
| B0208 | 回復ページが読み込む別origin画像の受信側で、実ブラウザーの `Referer` に回復tokenが含まれるか確認する。 |
| B0314 | 補助ページからCookieを設定してフォームを送り、対象プロフィールの変更を確認する。 |
| B0316 | 補助ページから対象のGETへ実ブラウザーを遷移させ、状態変更を確認する。 |
| B0319 | 補助ページから別portの `Origin` を伴うフォームを送り、変更と受信記録を確認する。 |
| B0323 | 補助ページからログインフォームを送り、対象セッションのアカウントを確認する。 |
| B0326 | 同一site・別originの補助ページからフォームを送り、変更と `Sec-Fetch-Site` を確認する。 |
| B0330 | 補助ページのiframeに対象承認画面を載せ、frame可否と実際の承認記録を確認する。 |
| B0331 | 補助ページのcredential付きfetchで、認証済みレポート本文をブラウザーが読めるか確認する。 |
| B0337 | 補助ページからpreflight付き要求と単純GETを両方実行し、読み取り結果を比較する。 |
| B0338 | 登録済み補助originのJavaScriptが、公開本文とは別の非公開応答headerを読めるか確認する。 |
| B0340 | CORS設定変更後、補助ページから別利用者の認証済みレポートを読めるか確認する。 |
| B0341 | `Origin: https://app:8444` を申告したWebSocket接続でframeを取得できるか、同origin接続と比較する。 |
| B0346 | 補助ページが開いた対象側ポップアップとの `postMessage` で、補助ページへの秘密の返信を確認する。 |
| B0347 | 正規に登録した受信ウィンドウを補助originへ遷移させ、後続の `postMessage` の配送先を確認する。 |
| B0457 | 正常なブラウザーログイン後、補助originのanalytics収集先へ送られたイベント内容を確認する。 |
| B0458 | 認証済みJSON処理の失敗後、補助originのerror収集先へ送られたイベント内容を確認する。 |
| B0470 | CSPで許可された補助originのJSONPスクリプトを読み、callbackの実行結果を確認する。 |
| B0473 | 補助originの配布スクリプトを変更し、対象ページでSRIによる実行可否を確認する。 |

計測実装の前提は、各変種の公開manifestにあるoriginを固定allowlistとして照合し、V/F/Nそれぞれで対象・補助側への通信と測定予算のdrainを記録すること。ブラウザーが必要なケースでは、ブラウザーのリクエスト・応答と状態変化をZAPの観測記録に対応付ける。補助originは各変種の正確な公開URLへのブラウザー通信だけを許可し、spider・active scan対象から除外する。実測と原資料は [README-collector-zap.md](README-collector-zap.md) と [README-auxiliary-script-zap.md](README-auxiliary-script-zap.md) に記した。B0341は補助originへの到達テストだけでは意味がなく、upgradeとframeを別に確認する。上記の操作を行っていないrunを「ZAPスキャン完了」や「検出」として集計しない。
