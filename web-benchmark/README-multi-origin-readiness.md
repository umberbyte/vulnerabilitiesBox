# 複数originを要する32変種の計測条件

2026-10-04のコアDAST runで`unsupported_target_surface`となった32変種を、各runの`targetSurface.requiredOrigins`から棚卸しした。現在のZAP adapterは`https://app:8443`だけを診断対象として許可し、必要なoriginが一つでも異なる場合はスキャン前に停止する（`src/runner/policy.mjs`）。この停止は未検出やZAPの機能不足を意味しない。旧runと台帳は作業PCの`artifacts/`に残し、公開Gitには含めない。

| 必須originの組 | 件数 | 変種 |
|---|---:|---|
| `https://app:8443` と `https://app:8444` | 23 | B0023, B0044, B0048, B0053, B0055, B0208, B0314, B0316, B0319, B0323, B0326, B0330, B0331, B0337, B0338, B0340, B0341, B0346, B0347, B0457, B0458, B0470, B0473 |
| `https://app.benchmark.test:8443` と `https://evil.benchmark.test:8443` | 1 | B0236 |
| `https://app.benchmark.test:8443` と `https://evil.benchmark.test:8444` | 2 | B0234, B0334 |
| `https://app.benchmark.test:8443` と `http://app.benchmark.test:8443` | 1 | B0335 |
| `https://app.benchmark.test:8443` と `https://app.benchmark.test:8444` | 1 | B0336 |
| `https://app.benchmark.test:8443` と `http://app.benchmark.test:8080` | 1 | B0233 |
| `https://app.benchmark.test:8443` と `https://attacker.test:8444` | 1 | B0325 |
| `https://app.benchmark.test:8443`、`https://partner.benchmark.test:8444`、`https://evil.benchmark.test:8444` | 1 | B0333 |
| `http://benchmark.test:8080` と `https://app:8443` | 1 | B0461 |

`app:8444` を使う23変種の具体的な役割と必要な観測は [README-auxiliary-origin-roles.md](README-auxiliary-origin-roles.md) に整理した。

この表は2026-10-04の保存済みrunの宣言を保持する。B0341の `https://app:8444` はWebSocket接続先ではなく、申告する `Origin` ヘッダー値だった。現行の公開manifestでは接続先を `https://app:8443` だけとし、`requiredObservationCapabilities: ["websocket_frame"]` を別に宣言する。現行のHTTP中心ZAP adapterはこの能力を確認できないため、B0341を `unsupported_observation_capability` として停止する。これで保存済みの「複数origin未対応32件」を遡及変更しない。

必要originには、ZAPが要求を送る対象と、ブラウザーが通信する相手・漏えい先・監査用受信先が混在する。単純にZAPの許可originを増やして完走扱いにすると、DOM実行、Cookie送出、preflight、WebSocket frame、postMessage、Referer、SRIなどを実際に通ったか不明なままになる。診断対象・観測先・攻撃者側ページの役割を分けた計測契約を先に定義する。

計測前に固定する条件は次のとおり。

1. 各originをDocker内部のfixtureへ明示的に解決し、外部DNS・顧客システムへ到達しないことを確認する。HTTPとHTTPS、ホスト名、port、証明書の扱いを変種ごとに保存する。
2. 通常入口への到達だけでなく、当該境界を通る実操作を記録する。ブラウザー系は実ブラウザーのorigin、Cookie、CORS/preflight、DOMイベントまたは送信先を、WebSocket系はupgradeとframeを、HTTP/HTTPS系は各接続のschemeと応答を保存する。
3. V/F/Nに同一の公開契約、認証主体、seed、ZAP画像・add-on・設定、時間・要求予算を使う。補助originへの通信も対象アプリの計測窓に含め、後続要求がdrainしたか確認する。
4. 完走、対象操作への到達、alertと当該欠陥の対応、V/F/N成立確認を別々に評価する。非到達を偽陰性として数えない。スキャン時ソースと検証時ソースを照合し、依存サービスの環境一致は別に判定する。

優先する実装単位は、(a) B0233/B0461のHTTP・HTTPS二経路、(b) `app:8444`を補助originとする22変種の役割別契約とB0341のWebSocket frame観測、(c) ホスト名・scheme・portが異なる7変種のブラウザー条件。B0335の実際の起点は `http://app.benchmark.test:8443` であり、旧manifestの `https://evil.benchmark.test:8444` は誤りだったため修正した。現行Composeは同じホスト名・8443番でHTTPとHTTPSを同時提供しておらず、現在のローカルChromiumでもVの秘密読取は未確認である。成立条件の解決前にスキャン系列だけを増やさない。各単位で公開manifest、adapter、対象操作の到達証拠、オフライン監査を揃えてから再計測する。

## B0233/B0461の二経路前提確認（2026-10-05）

ローカルDockerの実ブラウザーでB0233/B0461のV/F/N計6セル、99チェックが合格した。B0233はHTTPSで発行した専用CookieがHTTP側に送られるか、B0461は通常フォームの資格情報を含むPOSTがHTTPかHTTPSのどちらに送られるかを確認した。記録は作業PCの`artifacts/acceptance-saved-dual-transport-baseline-20261005.json`にある。検証側と対象アプリの実行ソースは一致した。

ZAP自身の前提確認は、Windowsでは`probe-transport.cmd`、Linux/macOSでは`./probe-transport.sh`で実行する。スクリプトはローカルDockerの対象とZAPを起動し、固定した二経路の正常GETだけを各armで送り、ZAPを停止する。結果は新規の`artifacts/dual-transport-probe-*.json`に保存される。最終確認では6セルすべてが両originへ到達し、各セルの対象要求数は2、終了時の処理中要求は0だった。B0233のHTTP側はVで200・F/Nで426、B0461のHTTP側はVで200・F/Nで308を記録した。実行前後の対象ソース一致も確認した。

この前提確認はログイン、Cookie再送、フォームPOST、ブラウザー動作、spider、active scan、alert判定を実行しない。したがってB0233/B0461はまだ「V/F/NのZAPスキャン完走」に加えない。次に必要なのは、HTTPとHTTPSを分けて計測しつつブラウザーの正常操作を再生し、その通信とZAPの観測結果を結び付けるadapterである。
