# 複数originを要する32変種の計測条件

2026-10-04のコアDAST runで`unsupported_target_surface`となった32変種を、各runの`targetSurface.requiredOrigins`から棚卸しした。現在のZAP adapterは`https://app:8443`だけを診断対象として許可し、必要なoriginが一つでも異なる場合はスキャン前に停止する（`src/runner/policy.mjs`）。この停止は未検出やZAPの機能不足を意味しない。旧runと台帳は作業PCの`artifacts/`に残し、公開Gitには含めない。

| 必須originの組 | 件数 | 変種 |
|---|---:|---|
| `https://app:8443` と `https://app:8444` | 23 | B0023, B0044, B0048, B0053, B0055, B0208, B0314, B0316, B0319, B0323, B0326, B0330, B0331, B0337, B0338, B0340, B0341, B0346, B0347, B0457, B0458, B0470, B0473 |
| `https://app.benchmark.test:8443` と `https://evil.benchmark.test:8443` | 1 | B0236 |
| `https://app.benchmark.test:8443` と `https://evil.benchmark.test:8444` | 4 | B0234, B0334, B0335, B0336 |
| `https://app.benchmark.test:8443` と `http://app.benchmark.test:8080` | 1 | B0233 |
| `https://app.benchmark.test:8443` と `https://attacker.test:8444` | 1 | B0325 |
| `https://app.benchmark.test:8443`、`https://partner.benchmark.test:8444`、`https://evil.benchmark.test:8444` | 1 | B0333 |
| `http://benchmark.test:8080` と `https://app:8443` | 1 | B0461 |

必要originには、ZAPが要求を送る対象と、ブラウザーが通信する相手・漏えい先・監査用受信先が混在する。単純にZAPの許可originを増やして完走扱いにすると、DOM実行、Cookie送出、preflight、WebSocket frame、postMessage、Referer、SRIなどを実際に通ったか不明なままになる。診断対象・観測先・攻撃者側ページの役割を分けた計測契約を先に定義する。

計測前に固定する条件は次のとおり。

1. 各originをDocker内部のfixtureへ明示的に解決し、外部DNS・顧客システムへ到達しないことを確認する。HTTPとHTTPS、ホスト名、port、証明書の扱いを変種ごとに保存する。
2. 通常入口への到達だけでなく、当該境界を通る実操作を記録する。ブラウザー系は実ブラウザーのorigin、Cookie、CORS/preflight、DOMイベントまたは送信先を、WebSocket系はupgradeとframeを、HTTP/HTTPS系は各接続のschemeと応答を保存する。
3. V/F/Nに同一の公開契約、認証主体、seed、ZAP画像・add-on・設定、時間・要求予算を使う。補助originへの通信も対象アプリの計測窓に含め、後続要求がdrainしたか確認する。
4. 完走、対象操作への到達、alertと当該欠陥の対応、V/F/N成立確認を別々に評価する。非到達を偽陰性として数えない。スキャン時ソースと検証時ソースを照合し、依存サービスの環境一致は別に判定する。

優先する実装単位は、(a) B0233/B0461のHTTP・HTTPS二経路、(b) `app:8444`を補助originとする23変種の役割別契約、(c) 異なるホスト名を使う7変種のブラウザー条件。B0335は現在のローカルChromiumでVの秘密読取が未確認なので、成立条件の解決前にスキャン系列だけを増やさない。各単位で公開manifest、adapter、対象操作の到達証拠、オフライン監査を揃えてから再計測する。
